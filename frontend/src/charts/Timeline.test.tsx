import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { Timeline, type TimelineRow } from "./Timeline";
import { MONTHS } from "../test/fixtures";
import { renderWithTheme } from "../test/render";

const rows: TimelineRow[] = [
  { id: "M1", name: "Pilot", owner: "AML operations", start: "2027-01", end: "2027-06", dependsOn: [], share: 0.15 },
  { id: "M2", name: "Gate", owner: "Model risk", start: "2027-07", end: "2027-12", dependsOn: ["M1"], share: 0.3 },
];

function gridStyle(container: HTMLElement) {
  return (container.querySelector(".timeline-grid") as HTMLElement).style;
}

describe("Timeline", () => {
  it("is a labelled group with one column per month plus the label column", () => {
    const { container } = renderWithTheme(<Timeline rows={rows} months={MONTHS} deadline="2028-12-31" />);
    expect(screen.getByRole("group", { name: "Roadmap timeline" })).toBeTruthy();
    expect(gridStyle(container).gridTemplateColumns).toBe(`minmax(220px, 260px) repeat(${MONTHS.length}, minmax(30px, 1fr))`);
    expect(gridStyle(container).gridTemplateRows).toBe(`auto auto repeat(${rows.length}, minmax(72px, auto))`);
  });

  it("spans each year header over its months and marks the first month of each year as a rule", () => {
    const { container } = renderWithTheme(<Timeline rows={rows} months={MONTHS} deadline="2028-12-31" />);
    const years = Array.from(container.querySelectorAll(".tl-year")) as HTMLElement[];
    expect(years.map((y) => [y.textContent, y.style.gridColumn])).toEqual([
      ["2027", "2 / 14"],
      ["2028", "14 / 26"],
    ]);
    const yearRules = container.querySelectorAll(".tl-rule-year");
    expect(yearRules).toHaveLength(2);
    expect(container.querySelectorAll(".tl-rule")).toHaveLength(MONTHS.length);
  });

  it("labels each month with its initial and a full title", () => {
    renderWithTheme(<Timeline rows={rows} months={MONTHS.slice(0, 3)} deadline="2028-12-31" />);
    const monthCells = Array.from(document.querySelectorAll(".tl-month")) as HTMLElement[];
    expect(monthCells.map((m) => m.textContent)).toEqual(["Jan", "Feb", "Mar"]);
    expect(monthCells[0].title).toBe("Jan 2027");
  });

  it("places the deadline marker in the column of its month", () => {
    const { container } = renderWithTheme(<Timeline rows={rows} months={MONTHS} deadline="2028-12-31" />);
    const marker = container.querySelector(".tl-deadline") as HTMLElement;
    expect(marker.style.gridColumn).toBe("25");
    expect(marker.textContent).toBe("Deadline Dec 2028");
  });

  it("clamps a deadline outside the drawn months to the nearest edge", () => {
    const { container } = renderWithTheme(<Timeline rows={rows} months={MONTHS} deadline="2026-03-01" />);
    expect((container.querySelector(".tl-deadline") as HTMLElement).style.gridColumn).toBe("2");
  });

  it("omits the deadline marker when the deadline is not a month", () => {
    const { container } = renderWithTheme(<Timeline rows={rows} months={MONTHS} deadline="soon" />);
    expect(container.querySelector(".tl-deadline")).toBeNull();
  });

  it("draws each milestone bar with its dates and share in an accessible label", () => {
    const { container } = renderWithTheme(<Timeline rows={rows} months={MONTHS} deadline="2028-12-31" />);
    const bar = screen.getByRole("img", {
      name: "M1 Pilot: Jan 2027 to Jun 2027. AI-assisted share 15% at end.",
    });
    expect(bar.textContent).toBe("15%");
    expect(bar.style.gridColumn).toBe("2 / 8");
    expect(container.querySelectorAll(".tl-bar")).toHaveLength(2);
  });

  it("describes the owner and the predecessor, or that the milestone starts the plan", () => {
    renderWithTheme(<Timeline rows={rows} months={MONTHS} deadline="2028-12-31" />);
    expect(screen.getByText("AML operations · starts the plan")).toBeTruthy();
    expect(screen.getByText("Model risk · after M1")).toBeTruthy();
  });

  it("joins several predecessors with commas", () => {
    renderWithTheme(<Timeline rows={[{ ...rows[1], dependsOn: ["M1", "M0"] }]} months={MONTHS} deadline="2028-12-31" />);
    expect(screen.getByText("Model risk · after M1, M0")).toBeTruthy();
  });

  it("clamps milestones that start before or end after the drawn months", () => {
    const { container } = renderWithTheme(
      <Timeline
        rows={[{ id: "X", name: "Wide", owner: "Team", start: "2026-06", end: "2029-01", dependsOn: [], share: 1 }]}
        months={MONTHS}
        deadline="2028-12-31"
      />,
    );
    const bar = container.querySelector(".tl-bar") as HTMLElement;
    // Starts at the first month column (2) and ends at the last month column (25), so the grid end line is 26.
    expect(bar.style.gridColumn).toBe("2 / 26");
  });

  it("says when the dates are not valid months and draws no bar", () => {
    renderWithTheme(
      <Timeline
        rows={[
          { id: "B1", name: "Typo", owner: "Team", start: "2027-1", end: "2027-06", dependsOn: [], share: 0 },
          { id: "B2", name: "Reversed", owner: "Team", start: "2027-06", end: "2027-02", dependsOn: [], share: 0 },
        ]}
        months={MONTHS}
        deadline="2028-12-31"
      />,
    );
    expect(screen.getAllByText("Dates not set")).toHaveLength(2);
    expect(screen.getAllByText("Enter valid months to draw this milestone.")).toHaveLength(2);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders with no months without failing", () => {
    const { container } = renderWithTheme(<Timeline rows={[]} months={[]} deadline="2028-12-31" />);
    expect(container.querySelector(".tl-year")).toBeNull();
    expect(container.querySelector(".tl-month")).toBeNull();
    expect(screen.getByRole("group", { name: "Roadmap timeline" })).toBeTruthy();
  });

  it("lists every row under the milestone corner heading", () => {
    renderWithTheme(<Timeline rows={rows} months={MONTHS} deadline="2028-12-31" />);
    expect(screen.getByText("Milestone").className).toBe("tl-corner");
    const labels = screen.getAllByText(/^M[12]$/).map((el) => within(el.parentElement as HTMLElement).getByText(/Pilot|Gate/).textContent);
    expect(labels).toEqual(["Pilot", "Gate"]);
  });
});
