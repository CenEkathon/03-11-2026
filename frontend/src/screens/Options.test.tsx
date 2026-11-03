import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { Options } from "./Options";
import { makePlan, makeShared, scenarioFor } from "../test/fixtures";
import { renderWithTheme } from "../test/render";
import { allOf, resetRecorded } from "../test/rechartsStub";
import { formatEur } from "../lib/format";
import type { ScenarioId } from "../api/types";

vi.mock("recharts", () => import("../test/rechartsStub"));

beforeEach(() => {
  resetRecorded();
});

const plan = makePlan();

function renderOptions(shared = makeShared()) {
  return renderWithTheme(<Options shared={shared} />);
}

function actionsTable() {
  return screen.getByRole("table", { name: "Actions in Hybrid" });
}

describe("Options cards", () => {
  it("shows one card per option, with the recommended one marked and selected by default", () => {
    renderOptions();
    const cards = screen.getAllByRole("article");
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(["Reskill-led", "Hire-led", "Hybrid"]);

    const hybrid = screen.getByRole("article", { name: "Hybrid" });
    expect(hybrid.className).toBe("option-card is-selected");
    expect(within(hybrid).getByText("Recommended")).toBeTruthy();
    expect(within(screen.getByRole("article", { name: "Reskill-led" })).queryByText("Recommended")).toBeNull();
  });

  it("gives each option its cost split, action count and aggregate freed capacity", () => {
    renderOptions();
    const hybrid = plan.scenarios.hybrid.totals;
    const card = screen.getByRole("article", { name: "Hybrid" });
    expect(within(card).getByText(formatEur(hybrid.cost_one_off_eur))).toBeTruthy();
    expect(within(card).getByText(formatEur(hybrid.cost_recurring_eur))).toBeTruthy();
    expect(within(card).getByText(formatEur(hybrid.cost_total_eur)).tagName).toBe("STRONG");
    expect(within(card).getByText("4")).toBeTruthy();
    expect(card.textContent).toContain("Aggregate freed capacity peaks at 0.0 FTE.");
    expect(card.textContent).toContain(hybrid.freed_capacity_flag);

    const reskill = screen.getByRole("article", { name: "Reskill-led" });
    expect(reskill.textContent).toContain("Aggregate freed capacity peaks at 2.0 FTE.");
  });

  it("moves the selection when another option is chosen", () => {
    renderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Reskill-led" }));
    expect(screen.getByRole("article", { name: "Reskill-led" }).className).toBe("option-card is-selected");
    expect(screen.getByRole("article", { name: "Hybrid" }).className).toBe("option-card");
    expect(screen.getByRole("table", { name: "Actions in Reskill-led" })).toBeTruthy();
  });

  it("skips an option that is missing from the plan", () => {
    const partial = makePlan();
    delete (partial.scenarios as Partial<typeof partial.scenarios>).hire_led;
    renderOptions(makeShared({ plan: partial }));
    expect(screen.getAllByRole("article").map((c) => c.getAttribute("aria-label"))).toEqual(["Reskill-led", "Hybrid"]);
  });
});

describe("Options FTE mix", () => {
  it("explains each action type in plain words", () => {
    renderOptions();
    expect(screen.getByText("People already at the required level, moved into the work.")).toBeTruthy();
    expect(screen.getByText("New people recruited for the gap that internal supply cannot cover.")).toBeTruthy();
  });

  it("sums the FTE per milestone and action type into the stacked chart and its table", () => {
    renderOptions();
    const table = screen.getByRole("table", { name: "FTE by action type and milestone" });
    const rows = within(table).getAllByRole("row").slice(1);
    const cellsOf = (row: HTMLElement) => Array.from(row.querySelectorAll("td")).map((td) => td.textContent);
    expect(rows.map(cellsOf)).toEqual([
      ["M1", "4.0", "2.0", "0.0", "0.0", "6.0"],
      ["M2", "0.0", "0.0", "1.0", "0.0", "1.0"],
      ["M3", "0.0", "0.0", "0.0", "0.5", "0.5"],
      ["M4", "0.0", "0.0", "0.0", "0.0", "0.0"],
    ]);

    expect(allOf("Bar").map((b) => b.dataKey)).toEqual(["reskill", "redeploy", "hire", "external"]);
    expect((allOf("BarChart")[0].data as { milestone: string }[]).map((r) => r.milestone)).toEqual(["M1", "M2", "M3", "M4"]);
  });
});

describe("Options action list", () => {
  it("lists every action with its people, FTE, timing and cost", () => {
    renderOptions();
    const rows = within(actionsTable()).getAllByRole("row").slice(1);
    const cellsOf = (row: HTMLElement) => Array.from(row.querySelectorAll("td")).map((td) => td.textContent);
    expect(rows).toHaveLength(4);
    expect(cellsOf(rows[0]).slice(0, 9)).toEqual(["M1", "AML analyst (mock)AML alert handling", "Reskill", "4", "4.0", "Jan 2027", "6", "EUR 12,000", "EUR 0"]);
    expect(cellsOf(rows[2]).slice(0, 9)).toEqual(["M2", "Model validator (mock)Model validation", "Hire", "1 new", "1.0", "Jul 2027", "6", "EUR 3,000", "EUR 8,000"]);
    expect(cellsOf(rows[3]).slice(2, 4)).toEqual(["Contractor bridge", "1 new"]);
  });

  it("filters the actions by milestone and shows the count", () => {
    renderOptions();
    fireEvent.click(screen.getByRole("button", { name: "M2" }));
    expect(within(actionsTable()).getAllByRole("row").slice(1)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "M2" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(within(actionsTable()).getAllByRole("row").slice(1)).toHaveLength(4);
  });

  it("falls back to the raw requirement id when the requirement is not in the plan", () => {
    const shared = makeShared();
    shared.plan.scenarios.hybrid = scenarioFor("hybrid", {
      actions: [{ ...scenarioFor("hybrid").actions[0], requirement_id: "R99", skill_id: "mystery" }],
    });
    renderOptions(shared);
    const row = within(actionsTable()).getAllByRole("row")[1];
    expect(within(row).getByText("R99")).toBeTruthy();
    expect(within(row).getByText("mystery")).toBeTruthy();
  });
});

describe("Options action explanation", () => {
  it("opens the reasoning for an action, with its formula, inputs, timing and source", () => {
    renderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Why: Reskill for R01" }));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(screen.getByRole("heading", { name: "Reskill for R01" })).toBeTruthy();
    expect(within(dialog).getByText("Mock rationale for the action.")).toBeTruthy();
    expect(within(dialog).getByText("FTE x one-off cost")).toBeTruthy();

    const inputs = within(dialog).getAllByRole("definition").map((d) => d.textContent);
    expect(inputs).toEqual(["4", "3000", "text input", "Jan 2027", "Nothing", "Know your customer (KYC) reviews", "Planning assumption · confidence low"]);
    expect(within(dialog).getByText("fte").tagName).toBe("CODE");
  });

  it("formats numeric inputs with the unit of the matching assumption", () => {
    const shared = makeShared();
    const base = scenarioFor("hybrid");
    shared.plan.scenarios.hybrid = scenarioFor("hybrid", {
      actions: [
        {
          ...base.actions[0],
          explanation: { ...base.actions[0].explanation, inputs: { ai_cost_saving_pct: 0.35, hire_cost: 3000 } },
        },
      ],
    });
    renderOptions(shared);
    fireEvent.click(screen.getByRole("button", { name: "Why: Reskill for R01" }));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    expect(within(dialog).getByText("35.0%")).toBeTruthy();
    expect(within(dialog).getByText("EUR 3,000 per hire")).toBeTruthy();
  });

  it("shows a hire's dependency on its predecessor, and None for skills it does not gain", () => {
    renderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Why: Hire for R03" }));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    const defs = within(dialog).getAllByRole("definition").map((d) => d.textContent);
    expect(defs).toContain("M1");
    expect(defs).toContain("None");
  });

  it("names skills it cannot label by their id, and says None when there are no skills gained", () => {
    const shared = makeShared();
    const base = scenarioFor("hybrid");
    shared.plan.scenarios.hybrid = scenarioFor("hybrid", {
      actions: [{ ...base.actions[0], skills_gained: ["mystery_skill"], depends_on: undefined }],
    });
    renderOptions(shared);
    fireEvent.click(screen.getByRole("button", { name: "Why: Reskill for R01" }));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    expect(within(dialog).getByText("mystery_skill")).toBeTruthy();
    expect(within(dialog).getByText("Nothing")).toBeTruthy();
  });

  it("says None for skills gained when the action lists none", () => {
    const shared = makeShared();
    const base = scenarioFor("hybrid");
    shared.plan.scenarios.hybrid = scenarioFor("hybrid", {
      actions: [{ ...base.actions[0], skills_gained: undefined }],
    });
    renderOptions(shared);
    fireEvent.click(screen.getByRole("button", { name: "Why: Reskill for R01" }));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    expect(within(dialog).getByText("None")).toBeTruthy();
  });

  it("closes from the Close button", () => {
    renderOptions();
    fireEvent.click(screen.getByRole("button", { name: "Why: Reskill for R01" }));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(dialog.open).toBe(false);
  });
});

describe("Options action explanation without optional lists", () => {
  it("says Nothing and None when an action has no dependencies or gained skills", () => {
    const plan = makePlan();
    for (const id of Object.keys(plan.scenarios) as ScenarioId[]) {
      const result = plan.scenarios[id];
      if (!result) continue;
      plan.scenarios[id] = scenarioFor(id, {
        actions: result.actions.map((a) => ({ ...a, depends_on: undefined, skills_gained: undefined })),
      });
    }
    renderOptions(makeShared({ plan }));
    fireEvent.click(screen.getByRole("button", { name: "Why: Reskill for R01" }));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    const inputs = within(dialog).getAllByRole("definition").map((d) => d.textContent);
    expect(inputs).toContain("Nothing");
    expect(inputs).toContain("None");
  });
});

describe("Options action explanation sources and lists", () => {
  it("names observed evidence and lists several dependencies and skills", () => {
    const plan = makePlan();
    const base = plan.scenarios.hybrid;
    plan.scenarios.hybrid = scenarioFor("hybrid", {
      actions: base.actions.map((a) => ({
        ...a,
        depends_on: ["M1", "M2"],
        skills_gained: ["kyc", "aml_monitoring"],
        explanation: { ...a.explanation, source: "observed" },
      })),
    });
    renderOptions(makeShared({ plan }));
    fireEvent.click(screen.getByRole("button", { name: "Why: Reskill for R01" }));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    const inputs = within(dialog).getAllByRole("definition").map((d) => d.textContent);
    expect(inputs).toContain("M1, M2");
    expect(inputs.some((v) => v?.startsWith("Observed in 2021 postings"))).toBe(true);
  });
});
