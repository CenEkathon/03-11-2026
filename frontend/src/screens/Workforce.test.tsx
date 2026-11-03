import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { Workforce } from "./Workforce";
import { MILESTONES, makePlan, makeShared, scenarioFor, SKILL_FIT, REQUIREMENTS, CASE_INFO } from "../test/fixtures";
import { renderWithTheme } from "../test/render";
import { lastOf, resetRecorded } from "../test/rechartsStub";

vi.mock("recharts", () => import("../test/rechartsStub"));

beforeEach(() => {
  resetRecorded();
});

function renderWorkforce(shared = makeShared()) {
  return renderWithTheme(<Workforce shared={shared} />);
}

function requirementsTable() {
  return screen.getByRole("table", { name: "Requirements in M1" });
}

describe("Workforce milestone view", () => {
  it("opens on the first milestone with its name, dates and owner team", () => {
    renderWorkforce();
    expect(screen.getByText(/Pilot AI triage: Jan 2027 - Jun 2027\. Owner team: AML operations\./)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Requirements in M1" })).toBeTruthy();
  });

  it("lists the requirements for the chosen milestone with level, FTE and eligibility", () => {
    renderWorkforce();
    const rows = within(requirementsTable()).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);

    const r01 = rows[0];
    expect(within(r01).getByText("AML analyst (mock)")).toBeTruthy();
    expect(within(r01).getByText("AML alert handling")).toBeTruthy();
    expect(within(r01).getByText("2 working")).toBeTruthy();
    expect(within(r01).getByText("4.0")).toBeTruthy();
    expect(within(r01).getByText("12").className).toBe("");
    expect(within(r01).getByTitle("People at or above the minimum level in a contributing team").textContent).toBe("12");
    expect(within(r01).getByText("5")).toBeTruthy();
    expect(within(r01).getByText("AML operations").closest(".team-chip")?.textContent).toBe("AML operations 9");
    expect(within(r01).getByText("KYC operations").closest(".team-chip")?.textContent).toBe("KYC operations 3");

    const r02 = rows[1];
    expect(within(r02).getByText("3 expert")).toBeTruthy();
    expect(within(r02).getByText("None")).toBeTruthy();
  });

  it("states that the counts are not a ranking", () => {
    renderWorkforce();
    expect(screen.getByText(/They are counts, not a ranking, and no one is selected\./)).toBeTruthy();
  });

  it("shows the milestone's FTE chart with its window shaded and the chosen option in the description", () => {
    renderWorkforce();
    expect(screen.getByText("Hybrid option. The shaded band is M1.")).toBeTruthy();
    expect(lastOf("ReferenceArea").x1).toBe("2027-01");
    expect(lastOf("ReferenceArea").x2).toBe("2027-06");
    expect(lastOf("ComposedChart").data).toHaveLength(24);
    const coverage = screen.getByRole("table", { name: "Required and staffed FTE by month" });
    expect(within(coverage).getAllByRole("row")).toHaveLength(25);
  });

  it("reports no shortfall for a milestone the chosen option staffs in full", () => {
    renderWorkforce();
    expect(screen.getByText("No shortfall for this milestone")).toBeTruthy();
    expect(screen.getByText("Every requirement is staffed in Hybrid.")).toBeTruthy();
  });

  it("shows the shortfall for the reskill-led option, with its reason and unmet FTE-months", () => {
    renderWorkforce();
    fireEvent.click(screen.getByRole("button", { name: "Reskill-led" }));
    expect(screen.getByRole("button", { name: "Reskill-led" }).getAttribute("aria-pressed")).toBe("true");
    const shortfall = screen.getByText("R02: No eligible people").closest(".callout");
    expect(shortfall?.className).toBe("callout callout-warning");
    expect(shortfall?.textContent).toContain("Python programming. 1.50 unmet FTE-months.");
    expect(screen.queryByText("No shortfall for this milestone")).toBeNull();
  });

  it("switches to another milestone and shows only its requirements", () => {
    renderWorkforce();
    fireEvent.click(screen.getByRole("button", { name: "M2" }));
    expect(screen.getByText(/Model risk gate: Jul 2027 - Dec 2027\. Owner team: Model risk\./)).toBeTruthy();
    const rows = within(screen.getByRole("table", { name: "Requirements in M2" })).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("Model validator (mock)")).toBeTruthy();
    expect(within(rows[0]).getByText("Model risk").closest(".team-chip")?.textContent).toBe("Model risk 2");
    expect(lastOf("ReferenceArea").x1).toBe("2027-07");
  });

  it("shows the empty message when a milestone has no requirements", () => {
    renderWorkforce(makeShared({ plan: makePlan({ requirements: [] }) }));
    expect(screen.getByText("No requirements for this milestone.")).toBeTruthy();
  });

  it("switches the option from the header control", () => {
    renderWorkforce();
    fireEvent.click(screen.getByRole("button", { name: "Hire-led" }));
    expect(screen.getByText("Hire-led option. The shaded band is M1.")).toBeTruthy();
  });
});

describe("Workforce fallbacks", () => {
  it("shows the raw skill id and team id when no label is known", () => {
    const plan = makePlan({
      skill_fit: SKILL_FIT.map((f) => (f.requirement_id === "R01" ? { ...f, team_coverage: { external_pool: 4 } } : f)),
    });
    renderWorkforce(makeShared({ plan, skillLabels: {} }));
    const r01 = within(requirementsTable()).getAllByRole("row")[1];
    expect(within(r01).getByText("aml_monitoring")).toBeTruthy();
    expect(within(r01).getByText("external_pool").parentElement?.textContent).toBe("external_pool 4");
  });

  it("shows the level as a count when it is above the known levels", () => {
    const plan = makePlan({ requirements: REQUIREMENTS.map((r) => (r.id === "R01" ? { ...r, min_proficiency: 4 } : r)) });
    renderWorkforce(makeShared({ plan }));
    expect(screen.getByText("4 of 3")).toBeTruthy();
  });

  it("shows n/a for the counts and no teams when a requirement has no fit data", () => {
    const plan = makePlan({ skill_fit: SKILL_FIT.filter((f) => f.requirement_id !== "R01") });
    renderWorkforce(makeShared({ plan }));
    const r01 = within(requirementsTable()).getAllByRole("row")[1];
    expect(within(r01).getAllByText("n/a")).toHaveLength(2);
    expect(within(r01).getByText("None")).toBeTruthy();
  });

  it("names a shortfall by its raw skill id when the label is missing", () => {
    const plan = makePlan();
    plan.scenarios.reskill_led = scenarioFor("reskill_led", {
      shortfalls: [
        { requirement_id: "R01", milestone_id: "M1", skill_id: "unknown_skill", months: ["2027-01"], unmet_fte_months: 0.5, reason: "hire_not_started" },
      ],
    });
    renderWorkforce(makeShared({ plan, skillLabels: {} }));
    fireEvent.click(screen.getByRole("button", { name: "Reskill-led" }));
    expect(screen.getByText("R01: Hire not yet started").closest(".callout")?.textContent).toContain("unknown_skill. 0.50 unmet FTE-months.");
  });

  it("shows the team id and the milestone's owner id when they are not in the company list", () => {
    const plan = makePlan({ milestones: MILESTONES.map((m) => (m.id === "M1" ? { ...m, owner_team: "ghost_team" } : m)) });
    renderWorkforce(makeShared({ plan, caseInfo: { ...CASE_INFO, company: { ...CASE_INFO.company, teams: [] } } }));
    expect(screen.getByText(/Owner team: ghost_team\./)).toBeTruthy();
  });

  it("falls back to the first milestone when the chosen one has left the plan", () => {
    const { rerender } = renderWorkforce();
    expect(screen.getByText(/Pilot AI triage/)).toBeTruthy();
    const later = makePlan({ milestones: MILESTONES.slice(1).map((m) => ({ ...m })) });
    rerender(<Workforce shared={makeShared({ plan: later })} />);
    expect(screen.getByText(/Model risk gate: Jul 2027 - Dec 2027/)).toBeTruthy();
  });
});

describe("Workforce evidence dialog", () => {
  it("is closed until an evidence button is pressed, and then shows the counts behind one requirement", () => {
    renderWorkforce();
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(false);

    fireEvent.click(within(requirementsTable()).getAllByRole("button", { name: "View IDs" })[0]);
    expect(dialog.open).toBe(true);
    expect(screen.getByRole("heading", { name: "Evidence for R01: AML analyst (mock)" })).toBeTruthy();

    const defs = within(dialog).getAllByRole("definition").map((d) => d.textContent);
    expect(defs).toEqual([
      "AML alert handling",
      "12 people in contributing teams",
      "5 people, one or two levels short on an adjacent skill",
      "90% (curated taxonomy)",
      "42% of deduplicated postings (2021, not used in the arithmetic)",
    ]);
    expect(within(dialog).getByText("EMP-0001")).toBeTruthy();
    expect(within(dialog).getByText("EMP-0002")).toBeTruthy();
    expect(within(dialog).getByText("Requirement basis: observed (medium confidence). Mock requirement for the pilot.")).toBeTruthy();
  });

  it("names the skill by its id in the evidence dialog when it has no label", () => {
    renderWorkforce(makeShared({ skillLabels: {} }));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    fireEvent.click(within(requirementsTable()).getAllByRole("button", { name: "View IDs" })[0]);
    expect(within(dialog).getByText("aml_monitoring")).toBeTruthy();
  });

  it("says when a requirement has no vacancy observation or no sample IDs", () => {
    renderWorkforce();
    const dialog = document.querySelector("dialog") as HTMLDialogElement;

    fireEvent.click(within(requirementsTable()).getAllByRole("button", { name: "View IDs" })[1]);
    expect(within(dialog).getByText("Not observed")).toBeTruthy();
    expect(within(dialog).getByText("None.")).toBeTruthy();
    expect(within(dialog).getByText("Requirement basis: assumed (low confidence). Mock requirement for the pilot data.")).toBeTruthy();
  });

  it("shows None when the requirement's sample ID list is empty", () => {
    renderWorkforce();
    fireEvent.click(screen.getByRole("button", { name: "M3" }));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    fireEvent.click(within(screen.getByRole("table", { name: "Requirements in M3" })).getByRole("button", { name: "View IDs" }));
    expect(screen.getByRole("heading", { name: "Evidence for R04: KYC reviewer (mock)" })).toBeTruthy();
    expect(within(dialog).getByText("None.")).toBeTruthy();
    expect(within(dialog).getByText("Requirement basis: assumed (medium confidence). Mock requirement for the KYC scale-up.")).toBeTruthy();
  });

  it("closes from the Close button", () => {
    renderWorkforce();
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    fireEvent.click(within(requirementsTable()).getAllByRole("button", { name: "View IDs" })[0]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(dialog.open).toBe(false);
  });

  it("keeps the dialog closed when the requirement has no skill fit data", () => {
    const plan = makePlan({ skill_fit: [] });
    renderWorkforce(makeShared({ plan }));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    fireEvent.click(within(requirementsTable()).getAllByRole("button", { name: "View IDs" })[0]);
    expect(dialog.open).toBe(true);
    expect(within(dialog).queryByText("Skill")).toBeNull();
  });
});

describe("Workforce evidence without employee IDs", () => {
  it("shows no ID list when the server sends none for the requirement", () => {
    const plan = makePlan();
    plan.skill_fit = plan.skill_fit.map((f) => ({ ...f, evidence_employee_ids: undefined }));
    renderWorkforce(makeShared({ plan }));
    fireEvent.click(within(requirementsTable()).getAllByRole("button", { name: "View IDs" })[0]);
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.querySelector(".id-list")).toBeNull();
  });
});
