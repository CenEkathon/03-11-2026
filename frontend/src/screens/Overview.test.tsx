import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { Overview } from "./Overview";
import { makeControls, makePlan, makeShared, scenarioFor } from "../test/fixtures";
import { kpiValue, renderWithTheme } from "../test/render";
import { allOf, lastOf, resetRecorded } from "../test/rechartsStub";
import { formatEur, formatMonth, formatPct } from "../lib/format";

vi.mock("recharts", () => import("../test/rechartsStub"));

beforeEach(() => {
  resetRecorded();
});

// Mock figures: 48 EUR per review, 60% target, 35% saving. The hybrid option reaches 60% share at the deadline.
const HYBRID = makePlan().scenarios.hybrid.totals;

function renderOverview(shared = makeShared(), controls = makeControls()) {
  return renderWithTheme(<Overview shared={shared} controls={controls} />);
}

describe("Overview", () => {
  it("shows the mock goal with its title stripped of the MOCK prefix and the mock badge", () => {
    renderOverview();
    expect(screen.getByRole("region", { name: "AI-assisted KYC and AML reviews" })).toBeTruthy();
    expect(screen.getByText("Mock statement for the demo. Not a real strategy.")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "AI-assisted KYC and AML reviews" })).getByText("MOCK").className).toBe(
      "badge badge-mock",
    );
  });

  it("compares the goal with the modelled share and cost per review", () => {
    renderOverview();
    const goal = screen.getByRole("region", { name: "AI-assisted KYC and AML reviews" });
    expect(within(goal).getByText("0%")).toBeTruthy();
    expect(within(goal).getByText("60% by Dec 2028")).toBeTruthy();
    expect(within(goal).getByText("60% modelled at deadline")).toBeTruthy();
    expect(within(goal).getByText("EUR 48")).toBeTruthy();
    expect(within(goal).getByText("EUR 31.20 (−35%)")).toBeTruthy();
    // 35% saving x 60% share = 21% blended reduction, short of the 35% target.
    expect(within(goal).getByText("EUR 37.92 modelled (−21%)")).toBeTruthy();
    expect(within(goal).getByText("EUR 37.92 modelled (−21%)").className).toBe("kpi-sub kpi-bad");
    expect(screen.getByText(/At 60% adoption the blended reduction is 21%, short of the 35% target/)).toBeTruthy();
  });

  it("does not warn when an override makes the modelled reduction reach the target", () => {
    renderOverview(makeShared(), makeControls({ overrides: { ai_cost_saving_pct: 0.6 } }));
    expect(screen.queryByText(/short of the 35% target/)).toBeNull();
    const goal = screen.getByRole("region", { name: "AI-assisted KYC and AML reviews" });
    // 60% saving x 60% share = 36% reduction, so cost per review is 48 x 0.64.
    expect(within(goal).getByText("EUR 30.72 modelled (−36%)").className).toBe("kpi-sub");
  });

  it("shows the recommended option's cost, benefit, net, ROI and payback as KPIs", () => {
    renderOverview();
    expect(kpiValue("Cost to deadline")).toBe(formatEur(HYBRID.cost_total_eur));
    expect(kpiValue("Benefit to deadline")).toBe(formatEur(HYBRID.benefit_eur));
    expect(kpiValue("Net to deadline")).toBe(formatEur(HYBRID.net_eur));
    expect(kpiValue("ROI to deadline")).toBe(formatPct(HYBRID.roi));
    expect(kpiValue("Payback")).toBe("Not by deadline");
    expect(kpiValue("Yearly net at Dec 2028 run rate")).toBe(formatEur(HYBRID.run_rate_net_eur_year));
  });

  it("colours negative net and ROI as bad, and shows a payback month when the option pays back", () => {
    const plan = makePlan();
    plan.scenarios.hybrid = scenarioFor("hybrid", {
      totals: { ...HYBRID, payback_month: "2028-03", net_eur: 5000, roi: 0.1, run_rate_net_eur_year: 1000 },
    });
    renderOverview(makeShared({ plan }));
    expect(kpiValue("Payback")).toBe(formatMonth("2028-03"));
    expect(document.querySelectorAll(".kpi-value.kpi-bad")).toHaveLength(0);
    expect(kpiValue("ROI to deadline")).toBe("10.0%");
  });

  it("marks a negative net and ROI as bad", () => {
    renderOverview();
    const net = Array.from(document.querySelectorAll(".kpi")).find((k) => k.querySelector(".kpi-label")?.textContent === "Net to deadline");
    expect(net?.querySelector(".kpi-value")?.className).toBe("kpi-value kpi-bad");
    const roi = Array.from(document.querySelectorAll(".kpi")).find((k) => k.querySelector(".kpi-label")?.textContent === "ROI to deadline");
    expect(roi?.querySelector(".kpi-value")?.className).toBe("kpi-value kpi-bad");
  });

  it("lists the findings for the recommended option with their tones", () => {
    renderOverview();
    const findings = screen.getByRole("region", { name: "What needs attention" });
    expect(within(findings).getByText("No payback before the deadline").closest(".callout")?.className).toBe("callout callout-warning");
    expect(within(findings).getByText("Every requirement is covered").closest(".callout")?.className).toBe("callout callout-success");
    expect(within(findings).getByText(/Constraints from the mock goal: No forced redundancies; Model-risk gate before scale-up\./)).toBeTruthy();
  });

  it("maps freed capacity to an info finding with its review flag", () => {
    const plan = makePlan();
    plan.scenarios.hybrid = scenarioFor("hybrid", { totals: { ...HYBRID, freed_capacity_fte_peak: 2.5 } });
    renderOverview(makeShared({ plan }));
    const findings = screen.getByRole("region", { name: "What needs attention" });
    const freed = within(findings).getByText("Aggregate freed capacity peaks at 2.5 FTE").closest(".callout");
    expect(freed?.className).toBe("callout callout-info");
  });

  it("maps a supply shortfall to a warning and reports unmet FTE-months", () => {
    const plan = makePlan();
    plan.scenarios.hybrid = scenarioFor("hybrid", {
      shortfalls: [
        { requirement_id: "R02", milestone_id: "M1", skill_id: "python", months: ["2027-01"], unmet_fte_months: 1.5, reason: "no_eligible_supply" },
      ],
    });
    renderOverview(makeShared({ plan }));
    const findings = screen.getByRole("region", { name: "What needs attention" });
    expect(within(findings).getByText("1 supply shortfall").closest(".callout")?.className).toBe("callout callout-warning");
    expect(within(findings).getByText(/1\.50 unmet FTE-months/)).toBeTruthy();
  });

  it("omits the constraints line when the goal has none", () => {
    const plan = makePlan();
    plan.goal = { ...plan.goal, constraints: [] };
    renderOverview(makeShared({ plan }));
    expect(screen.queryByText(/Constraints from the mock goal/)).toBeNull();
  });

  it("says the recommended option is cheapest only when it is", () => {
    const cheapest = makePlan();
    renderOverview(makeShared({ plan: cheapest }));
    // Reskill-led is cheaper in the fixture, so the hybrid option is not the lowest-cost one.
    expect(screen.queryByText("It has the lowest cost to the deadline of the three options.")).toBeNull();
  });

  it("states that the recommended option has the lowest cost when it does", () => {
    const plan = makePlan();
    plan.scenarios.reskill_led = scenarioFor("reskill_led", {
      totals: { ...scenarioFor("reskill_led").totals, cost_total_eur: 9_000_000 },
    });
    renderOverview(makeShared({ plan }));
    expect(screen.getByText("It has the lowest cost to the deadline of the three options.")).toBeTruthy();
  });

  it("feeds the adoption chart the monthly share and the target line", () => {
    renderOverview();
    const target = allOf("ReferenceLine").find((r) => r.y !== undefined);
    expect(target?.y).toBe(0.6);
    expect((target?.label as { value: string }).value).toBe("Target 60%");
    expect(allOf("Line")[0].dataKey).toBe("share");
  });

  it("gives the options chart one bar per option, in the scenario colour slot", () => {
    renderOverview();
    const cells = allOf("Cell");
    expect(cells).toHaveLength(3);
    expect(lastOf("BarChart").data).toEqual([
      { id: "reskill_led", label: "Reskill-led", value: makePlan().scenarios.reskill_led.totals.net_eur, color: expect.any(String) },
      { id: "hire_led", label: "Hire-led", value: makePlan().scenarios.hire_led.totals.net_eur, color: expect.any(String) },
      { id: "hybrid", label: "Hybrid", value: HYBRID.net_eur, color: expect.any(String) },
    ]);
  });

  it("offers the options comparison and monthly share as tables", () => {
    renderOverview();
    const compare = screen.getByRole("table", { name: "Options compared" });
    const rows = within(compare).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(within(rows[3]).getByText("Hybrid")).toBeTruthy();
    expect(within(rows[3]).getByText("Not by deadline")).toBeTruthy();

    const share = screen.getByRole("table", { name: "AI-assisted share by month" });
    expect(within(share).getAllByRole("row")).toHaveLength(25);
    expect(within(share).getByText("Jan 2027")).toBeTruthy();
  });

  it("shows a payback month in the comparison table when an option pays back", () => {
    const plan = makePlan();
    plan.scenarios.hire_led = scenarioFor("hire_led", { totals: { ...plan.scenarios.hire_led.totals, payback_month: "2027-11" } });
    renderOverview(makeShared({ plan }));
    const compare = screen.getByRole("table", { name: "Options compared" });
    expect(within(compare).getByText("Nov 2027")).toBeTruthy();
  });

  it("states the decisions for approval", () => {
    renderOverview();
    expect(screen.getByText(/the model-risk gate before scale-up \(M2 before M3\)/)).toBeTruthy();
  });

  it("renders the brief panel with the recommended option selected", () => {
    renderOverview();
    expect(screen.getByRole("region", { name: "CEO brief" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Draft brief" })).toBeTruthy();
  });

});
