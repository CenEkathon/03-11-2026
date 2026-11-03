import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Roadmap } from "./Roadmap";
import { MILESTONES, makeControls, makePlan, makeShared } from "../test/fixtures";
import { renderWithTheme } from "../test/render";

function deferred<T>() {
  let resolve: (v: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function setMonth(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function renderRoadmap(controls = makeControls(), shared = makeShared()) {
  return renderWithTheme(<Roadmap shared={shared} controls={controls} />);
}

describe("Roadmap timing table", () => {
  it("lists each milestone with its owner, dependency, dates and success metric", () => {
    renderRoadmap();
    const table = screen.getByRole("table", { name: "Milestone start and end months" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);

    const m1 = rows[0];
    expect(within(m1).getByText("Pilot AI triage")).toBeTruthy();
    expect(within(m1).getByText("AML operations")).toBeTruthy();
    expect(within(m1).getByText("Start")).toBeTruthy();
    expect(within(m1).getByText("Pilot cases triaged")).toBeTruthy();
    expect(within(m1).getByText("Target 15%")).toBeTruthy();

    expect(within(rows[1]).getByText("M1")).toBeTruthy();
    expect(within(rows[1]).getByText("Target 1 count")).toBeTruthy();
    expect(within(rows[3]).getByText("Target 2.50 EUR/day")).toBeTruthy();
  });

  it("shows the applied month values in the inputs", () => {
    renderRoadmap();
    expect((screen.getByLabelText("M2 start month") as HTMLInputElement).value).toBe("2027-07");
    expect((screen.getByLabelText("M2 end month") as HTMLInputElement).value).toBe("2027-12");
  });

  it("uses the timeline and the applied state while nothing is edited", () => {
    renderRoadmap();
    expect(screen.getByText("Applied")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Roadmap timeline" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply timing" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Discard changes" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("No unapplied changes.")).toBeTruthy();
  });
});

describe("Roadmap draft editing", () => {
  it("marks a change as a preview, and discards it back to the applied timing", () => {
    renderRoadmap();
    setMonth("M1 end month", "2027-05");
    expect(screen.getByText("Preview: not applied")).toBeTruthy();
    expect(screen.getByText(/Unapplied changes\. The Overview/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply timing" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.getByText("Applied")).toBeTruthy();
    expect((screen.getByLabelText("M1 end month") as HTMLInputElement).value).toBe("2027-06");
  });

  it("flags a start that is not after its predecessor and blocks the apply", () => {
    const applyRoadmap = vi.fn(async () => null);
    renderRoadmap(makeControls({ applyRoadmap }));
    setMonth("M2 start month", "2027-06");

    fireEvent.click(screen.getByRole("button", { name: "Apply timing" }));
    const alert = screen.getByRole("status");
    expect(alert.textContent).toContain("Fix before applying");
    expect(within(alert).getByText(/M2 starts 2027-06, which is not after M1 ends 2027-06/)).toBeTruthy();
    expect(applyRoadmap).not.toHaveBeenCalled();

    const row = screen.getByLabelText("M2 start month").closest("tr") as HTMLElement;
    expect(row.className).toBe("row-invalid");
    expect(screen.getByLabelText("M2 start month").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("M1 start month").getAttribute("aria-invalid")).toBe("false");
  });

  it("flags an end before the start and a month that is not valid", () => {
    renderRoadmap();
    setMonth("M1 end month", "2026-12");
    fireEvent.click(screen.getByRole("button", { name: "Apply timing" }));
    expect(screen.getByText(/M1: end 2026-12 is before start 2027-01/)).toBeTruthy();
  });

  it("clears local messages when the draft is changed again", () => {
    renderRoadmap();
    setMonth("M2 start month", "2027-06");
    fireEvent.click(screen.getByRole("button", { name: "Apply timing" }));
    expect(screen.getByText("Fix before applying")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(screen.queryByText("Fix before applying")).toBeNull();
  });
});

describe("Roadmap apply", () => {
  it("sends every milestone's dates to the caller and shows progress while it runs", async () => {
    const pending = deferred<string[] | null>();
    const applyRoadmap = vi.fn(() => pending.promise);
    renderRoadmap(makeControls({ applyRoadmap }));
    setMonth("M1 end month", "2027-05");

    fireEvent.click(screen.getByRole("button", { name: "Apply timing" }));
    const busy = await screen.findByRole("button", { name: "Recalculating…" });
    expect(busy.hasAttribute("disabled")).toBe(true);

    expect(applyRoadmap).toHaveBeenCalledWith({
      M1: { start: "2027-01", end: "2027-05" },
      M2: { start: "2027-07", end: "2027-12" },
      M3: { start: "2028-01", end: "2028-06" },
      M4: { start: "2028-07", end: "2028-12" },
    });

    await act(async () => pending.resolve(null));
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply timing" })).toBeTruthy());
    expect(screen.queryByText(/The server rejected/)).toBeNull();
  });

  it("shows the server's rejection and keeps the draft", async () => {
    const applyRoadmap = vi.fn(async () => ["M3 overlaps the gate"]);
    renderRoadmap(makeControls({ applyRoadmap }));
    setMonth("M1 end month", "2027-05");
    fireEvent.click(screen.getByRole("button", { name: "Apply timing" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The server rejected this timing. The plan on screen is unchanged.");
    expect(within(alert).getByText("M3 overlaps the gate")).toBeTruthy();
    expect((screen.getByLabelText("M1 end month") as HTMLInputElement).value).toBe("2027-05");
  });

  it("clears a server rejection as soon as the draft changes", async () => {
    const applyRoadmap = vi.fn(async () => ["M3 overlaps the gate"]);
    renderRoadmap(makeControls({ applyRoadmap }));
    setMonth("M1 end month", "2027-05");
    fireEvent.click(screen.getByRole("button", { name: "Apply timing" }));
    await screen.findByRole("alert");

    setMonth("M1 end month", "2027-04");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Roadmap timeline and plan changes", () => {
  it("widens the timeline when a milestone moves beyond the horizon", () => {
    renderRoadmap();
    expect(document.querySelector(".tl-year")?.textContent).toBe("2027");
    setMonth("M4 end month", "2029-03");
    const years = Array.from(document.querySelectorAll(".tl-year")).map((y) => y.textContent);
    expect(years).toContain("2029");
  });

  it("names the owner and the predecessor in the timeline, or says the owner is not set", () => {
    const plan = makePlan({
      milestones: MILESTONES.map((m) => (m.id === "M4" ? { ...m, owner_team: "ghost_team" } : { ...m })),
    });
    renderRoadmap(makeControls(), makeShared({ plan }));
    expect(screen.getByText("KYC operations · after M2")).toBeTruthy();
    expect(screen.getByText("Owner not set · after M3")).toBeTruthy();
    expect(screen.getAllByText("AML operations · starts the plan").length).toBeGreaterThan(0);
    const ghostRow = screen.getByLabelText("M4 start month").closest("tr") as HTMLElement;
    expect(within(ghostRow).getByText("n/a")).toBeTruthy();
  });

  it("resets the draft when the applied milestones change", () => {
    const { rerender } = renderRoadmap();
    setMonth("M1 end month", "2027-05");
    expect(screen.getByText("Preview: not applied")).toBeTruthy();

    const shared = makeShared({ plan: makePlan({ milestones: MILESTONES.map((m) => ({ ...m })) }) });
    rerender(<Roadmap shared={shared} controls={makeControls()} />);
    expect(screen.getByText("Applied")).toBeTruthy();
    expect((screen.getByLabelText("M1 end month") as HTMLInputElement).value).toBe("2027-06");
  });

  it("drops a milestone that has left the plan and keeps the rest", () => {
    const { rerender } = renderRoadmap();
    const fewer = makePlan({ milestones: MILESTONES.slice(0, 3).map((m) => ({ ...m })) });
    rerender(<Roadmap shared={makeShared({ plan: fewer })} controls={makeControls()} />);
    expect(screen.queryByLabelText("M4 start month")).toBeNull();
    expect(screen.getByLabelText("M3 end month")).toBeTruthy();
  });

  it("treats a milestone with no recorded predecessors as the start of the plan", () => {
    const plan = makePlan({ milestones: MILESTONES.map((m) => ({ ...m, depends_on: undefined })) });
    renderRoadmap(makeControls(), makeShared({ plan }));
    expect(screen.getAllByText("Start", { selector: "td" })).toHaveLength(4);
    expect(screen.getAllByText("AML operations · starts the plan").length).toBeGreaterThan(0);
  });

  it("keeps the timeline usable when neither the horizon nor the dates are valid months", () => {
    const plan = makePlan({
      goal: { ...makePlan().goal, horizon_start: "later", horizon_end: "soon" },
      milestones: MILESTONES.map((m) => ({ ...m, start: "bad", end: "bad" })),
    });
    renderRoadmap(makeControls(), makeShared({ plan }));
    expect(screen.getAllByText("Dates not set")).toHaveLength(4);
    expect(screen.queryByText(/^Jan 2027/)).toBeNull();
  });

  it("keeps both dates of a row when the second one is edited after the first", () => {
    renderRoadmap();
    setMonth("M1 end month", "2027-05");
    setMonth("M1 start month", "2026-12");
    expect((screen.getByLabelText("M1 start month") as HTMLInputElement).value).toBe("2026-12");
    expect((screen.getByLabelText("M1 end month") as HTMLInputElement).value).toBe("2027-05");
  });

  it("lists the horizon in the card description and the deadline in the timeline", () => {
    renderRoadmap();
    expect(screen.getByText("Jan 2027 to Dec 2028. The vertical line is the deadline.")).toBeTruthy();
    expect(screen.getByText("Deadline Dec 2028")).toBeTruthy();
  });
});
