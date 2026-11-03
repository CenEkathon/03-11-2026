import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { Finance } from "./Finance";
import { makePlan, makeShared, scenarioFor, SENSITIVITY } from "../test/fixtures";
import { kpiValue, renderWithTheme } from "../test/render";
import { allOf, resetRecorded } from "../test/rechartsStub";
import { formatEur, formatPct } from "../lib/format";

vi.mock("recharts", () => import("../test/rechartsStub"));

beforeEach(() => {
  resetRecorded();
});

const plan = makePlan();
const hybrid = plan.scenarios.hybrid.totals;

function renderFinance(shared = makeShared()) {
  return renderWithTheme(<Finance shared={shared} />);
}

function rowsOf(table: HTMLElement) {
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => Array.from(row.querySelectorAll("td")).map((td) => td.textContent));
}

describe("Finance KPIs", () => {
  it("shows the recommended option's totals to the deadline", () => {
    renderFinance();
    expect(kpiValue("Cost to deadline")).toBe(formatEur(hybrid.cost_total_eur));
    expect(kpiValue("Benefit to deadline")).toBe(formatEur(hybrid.benefit_eur));
    expect(kpiValue("Net to deadline")).toBe(formatEur(hybrid.net_eur));
    expect(kpiValue("ROI to deadline")).toBe(formatPct(hybrid.roi));
    expect(kpiValue("Payback")).toBe("Not by deadline");
    expect(screen.getByText(`Recurring ${formatEur(hybrid.cost_recurring_eur)}`)).toBeTruthy();
    expect(document.querySelector(".kpi-value.kpi-bad")).not.toBeNull();
  });

  it("marks a positive net, ROI and run rate as good and shows the payback month", () => {
    const winning = makePlan();
    winning.scenarios.hybrid = scenarioFor("hybrid", {
      totals: { ...hybrid, net_eur: 5000, roi: 0.2, payback_month: "2028-03", run_rate_net_eur_year: 1000 },
    });
    renderFinance(makeShared({ plan: winning }));
    expect(kpiValue("Payback")).toBe("Mar 2028");
    expect(document.querySelector(".kpi-value.kpi-bad")).toBeNull();
    expect(screen.queryByText(/does not pay back before the deadline/)).toBeNull();
  });

  it("explains that the run-rate figure is an estimate", () => {
    renderFinance();
    expect(screen.getByText("Estimate, not a forecast")).toBeTruthy();
  });

  it("warns that the option does not pay back, with its name, when payback is missing", () => {
    renderFinance();
    const warning = screen.getByText("Hybrid does not pay back before the deadline").closest(".callout");
    expect(warning?.className).toBe("callout callout-warning");
    expect(screen.getByText(/The yearly run-rate figure shows what the option would net per year/)).toBeTruthy();
  });

  it("switches every figure to the option picked", () => {
    renderFinance();
    fireEvent.click(screen.getByRole("button", { name: "Reskill-led" }));
    expect(kpiValue("Cost to deadline")).toBe(formatEur(plan.scenarios.reskill_led.totals.cost_total_eur));
    expect(screen.getByText("Reskill-led does not pay back before the deadline")).toBeTruthy();
  });
});

describe("Finance cumulative chart", () => {
  it("draws every option against the deadline, and marks the recommended one as the emphasis", () => {
    renderFinance();
    const lines = allOf("Line");
    expect(lines.map((l) => [l.dataKey, l.strokeWidth])).toEqual([
      ["reskill_led", 1.5],
      ["hire_led", 1.5],
      ["hybrid", 3],
    ]);
    expect(allOf("ReferenceLine").some((r) => r.x === "2028-12")).toBe(true);
  });

  it("explains that the lines differ only by cost when benefit is the same in every option", () => {
    renderFinance();
    expect(screen.getByText(/Benefit is identical in every option, because it is driven by adoption and coverage/)).toBeTruthy();
  });

  it("drops that note when the options earn different benefits", () => {
    const differing = makePlan();
    differing.scenarios.hire_led = scenarioFor("hire_led", { totals: { ...differing.scenarios.hire_led.totals, benefit_eur: 1 } });
    renderFinance(makeShared({ plan: differing }));
    expect(screen.queryByText(/Benefit is identical in every option/)).toBeNull();
  });

  it("offers the cumulative values per month as a table", () => {
    renderFinance();
    const table = screen.getByRole("table", { name: "Cumulative net by option and month" });
    const header = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(header).toEqual(["Month", "Reskill-led", "Hire-led", "Hybrid"]);
    const rows = rowsOf(table);
    expect(rows).toHaveLength(24);
    expect(rows[0][0]).toBe("Jan 2027");
    expect(rows[0][3]).toBe(formatEur(plan.scenarios.hybrid.monthly[0].cumulative_net_eur));
  });
});

describe("Finance monthly cost and benefit", () => {
  it("shows benefit above zero and cost below it for the chosen option", () => {
    renderFinance();
    expect(screen.getByText("Monthly cost and benefit: Hybrid")).toBeTruthy();
    expect(allOf("Bar").map((b) => b.dataKey)).toEqual(["benefit", "cost"]);
    const table = screen.getByRole("table", { name: "Monthly cost and benefit, Hybrid" });
    const first = rowsOf(table)[0];
    const m = plan.scenarios.hybrid.monthly[0];
    expect(first).toEqual([
      "Jan 2027",
      formatEur(m.benefit_eur),
      formatEur(m.cost_one_off_eur + m.cost_recurring_eur),
      formatEur(m.net_eur),
    ]);
  });

  it("follows the chosen option in the chart and the table", () => {
    renderFinance();
    fireEvent.click(screen.getByRole("button", { name: "Hire-led" }));
    expect(screen.getByRole("table", { name: "Monthly cost and benefit, Hire-led" })).toBeTruthy();
    expect(screen.getByText("Monthly cost and benefit: Hire-led")).toBeTruthy();
  });
});

describe("Finance sensitivity", () => {
  it("shows the low-to-high range for each option, in the option's own colour", () => {
    renderFinance();
    const ranges = Array.from(document.querySelectorAll(".range-row"));
    expect(ranges.map((r) => r.querySelector(".range-label")?.textContent)).toEqual(["Reskill-led", "Hire-led", "Hybrid"]);
    expect(screen.getByRole("img", { name: /Hybrid: base -EUR 500,000, range/ })).toBeTruthy();
  });

  it("lists every sensitivity case in option order, low before base before high", () => {
    renderFinance();
    const table = screen.getByRole("table", { name: "Sensitivity by option and case" });
    const rows = rowsOf(table);
    expect(rows).toHaveLength(9);
    expect(rows.slice(0, 3).map((r) => [r[0], r[1]])).toEqual([
      ["Reskill-led", "Low"],
      ["Reskill-led", "Base"],
      ["Reskill-led", "High"],
    ]);
    expect(rows[8][0]).toBe("Hybrid");
    expect(rows[8][1]).toBe("High");
  });

  it("reports that sensitivity is unavailable when there are no cases", () => {
    renderFinance(makeShared({ sensitivity: [] }));
    expect(screen.getByText("Sensitivity is not available.")).toBeTruthy();
  });

  it("ignores a sensitivity row for an option it cannot draw", () => {
    const sensitivity = [...SENSITIVITY, { ...SENSITIVITY[0], scenario: "reskill_led" as const, case: "base" as const, net_eur: 1 }];
    renderFinance(makeShared({ sensitivity }));
    expect(screen.getAllByRole("img", { name: /range/ })).toHaveLength(3);
  });
});

describe("Finance comparison and method", () => {
  it("compares the three options side by side with their ROI and run rate", () => {
    renderFinance();
    const table = screen.getByRole("table", { name: "Options compared" });
    const rows = rowsOf(table);
    expect(rows).toHaveLength(3);
    expect(rows[2][0]).toBe("Hybrid");
    expect(rows[2][4]).toBe(formatPct(hybrid.roi));
    expect(rows[2][5]).toBe("Not by deadline");
    expect(rows[2][6]).toBe(formatEur(hybrid.run_rate_net_eur_year));
  });

  it("lists the rules behind every number", () => {
    renderFinance();
    const rules = document.querySelector(".rules")!;
    expect(rules.querySelectorAll("li")).toHaveLength(8);
    expect(rules.textContent).toContain("Benefit per month");
    expect(rules.textContent).toContain("Freed capacity is reported only as an aggregate FTE");
  });

  it("gives the full monthly series for the chosen option behind a disclosure", () => {
    renderFinance();
    const details = screen.getByText("Show the full monthly series for Hybrid").closest("details")!;
    expect(details.className).toBe("table-view");
    const rows = rowsOf(within(details).getByRole("table", { name: "Monthly series, Hybrid" }));
    expect(rows).toHaveLength(24);
    // First month share is 2.5% in the fixture, which rounds to 3% with no decimals.
    expect(rows[0][2]).toBe("3%");
  });

  it("offers only the options present in the plan", () => {
    const partial = makePlan();
    delete (partial.scenarios as Partial<typeof partial.scenarios>).reskill_led;
    renderFinance(makeShared({ plan: partial, sensitivity: SENSITIVITY.filter((r) => r.scenario !== "reskill_led") }));
    expect(screen.queryByRole("button", { name: "Reskill-led" })).toBeNull();
    expect(screen.getByRole("button", { name: "Hybrid" })).toBeTruthy();
    expect(allOf("Line").map((l) => l.dataKey)).toEqual(["hire_led", "hybrid"]);
  });
});
