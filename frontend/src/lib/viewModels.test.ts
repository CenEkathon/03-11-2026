import { describe, expect, it } from "vitest";
import type {
  ActionLine,
  Goal,
  Milestone,
  MonthlyPoint,
  PlanResponse,
  ScenarioId,
  ScenarioResult,
  SensitivityRow,
  Totals,
} from "../api/types";
import { effectiveSaving } from "./assumptions";
import { formatByUnit } from "./format";
import { monthFromIndex, monthIndex, monthRange } from "./months";
import {
  actionMixRows,
  adoptionRows,
  attentionItems,
  cashRows,
  cumulativeRows,
  deadlineMonths,
  goalProgress,
  paybackLabel,
  rangeRows,
} from "./viewModels";
import { rowErrors, checkDraft } from "./roadmap";

function point(month: string, o: Partial<MonthlyPoint> = {}): MonthlyPoint {
  return {
    month,
    required_fte: 0,
    staffed_fte: 0,
    coverage: 1,
    adoption_share: 0,
    benefit_eur: 0,
    cost_one_off_eur: 0,
    cost_recurring_eur: 0,
    net_eur: 0,
    cumulative_net_eur: 0,
    after_deadline: false,
    freed_capacity_fte_aggregate: 0,
    ...o,
  };
}

function totals(o: Partial<Totals> = {}): Totals {
  return {
    cost_one_off_eur: 100,
    cost_recurring_eur: 50,
    cost_total_eur: 150,
    benefit_eur: 120,
    net_eur: -30,
    roi: -0.2,
    payback_month: null,
    payback_within_deadline: false,
    payback_months_after_deadline: null,
    unmet_fte_months: 0,
    freed_capacity_fte_peak: 0,
    freed_capacity_flag: "HR / legal / employee-representation review required",
    run_rate_net_eur_year: 400000,
    ...o,
  };
}

function scenario(id: ScenarioId, monthly: MonthlyPoint[], t: Partial<Totals> = {}): ScenarioResult {
  return {
    scenario: id,
    label: id,
    description: "",
    actions: [],
    monthly,
    shortfalls: [],
    totals: totals(t),
  };
}

describe("month helpers", () => {
  it("returns an inclusive month range", () => {
    expect(monthRange("2027-11", "2028-02")).toEqual(["2027-11", "2027-12", "2028-01", "2028-02"]);
  });

  it("returns an empty range for an invalid or reversed range", () => {
    expect(monthRange("2028-02", "2027-11")).toEqual([]);
    expect(monthRange("2027-13", "2028-01")).toEqual([]);
  });

  it("round-trips index and month", () => {
    expect(monthFromIndex(monthIndex("2028-12") ?? -1)).toBe("2028-12");
  });
});

describe("chart rows", () => {
  const monthly = [
    point("2027-01", { adoption_share: 0, cumulative_net_eur: -10, benefit_eur: 0, cost_one_off_eur: 5, cost_recurring_eur: 5, net_eur: -10 }),
    point("2027-02", { adoption_share: 0.15, cumulative_net_eur: -4, benefit_eur: 6, cost_one_off_eur: 0, cost_recurring_eur: 2, net_eur: 4 }),
  ];

  it("keeps the adoption share per month", () => {
    expect(adoptionRows(monthly)).toEqual([
      { month: "2027-01", share: 0 },
      { month: "2027-02", share: 0.15 },
    ]);
  });

  it("aligns cumulative net by month across scenarios", () => {
    const scenarios = {
      hybrid: scenario("hybrid", monthly),
      hire_led: scenario("hire_led", [point("2027-01", { cumulative_net_eur: -20 }), point("2027-02", { cumulative_net_eur: -15 })]),
    } as Partial<Record<ScenarioId, ScenarioResult>>;
    const rows = cumulativeRows(scenarios, ["hybrid", "hire_led"]);
    expect(rows).toEqual([
      { month: "2027-01", hybrid: -10, hire_led: -20 },
      { month: "2027-02", hybrid: -4, hire_led: -15 },
    ]);
  });

  it("reports cost as a positive amount, one-off plus recurring", () => {
    const rows = cashRows(monthly);
    expect(rows[0].cost).toBe(10);
    expect(rows[1].cost).toBe(2);
    expect(rows[1].benefit).toBe(6);
  });

  it("sorts sensitivity low and high so the range bar is always valid", () => {
    const sens: SensitivityRow[] = [
      { scenario: "hybrid", case: "low", net_eur: -300, roi: null, cost_total_eur: 0, benefit_eur: 0, unmet_fte_months: 0 },
      { scenario: "hybrid", case: "base", net_eur: -200, roi: null, cost_total_eur: 0, benefit_eur: 0, unmet_fte_months: 0 },
      { scenario: "hybrid", case: "high", net_eur: -100, roi: null, cost_total_eur: 0, benefit_eur: 0, unmet_fte_months: 0 },
    ];
    expect(rangeRows(sens, ["hybrid"])).toEqual([{ scenario: "hybrid", low: -300, base: -200, high: -100 }]);
  });

  it("drops an option that has no complete low, base and high set", () => {
    expect(rangeRows([], ["hybrid"])).toEqual([]);
  });
});

describe("FTE mix by milestone", () => {
  const milestones = [{ id: "M1" }, { id: "M2" }] as Milestone[];
  const action = (id: string, milestone: string, type: ActionLine["type"], fte: number) =>
    ({ id, milestone_id: milestone, type, fte }) as ActionLine;

  it("sums the engine's action FTE per type within each milestone", () => {
    const rows = actionMixRows(
      [action("a", "M1", "reskill", 2), action("b", "M1", "hire", 1.5), action("c", "M2", "redeploy", 3), action("d", "M1", "external", 0.5)],
      milestones,
    );
    expect(rows).toEqual([
      { milestone: "M1", reskill: 2, redeploy: 0, hire: 1.5, external: 0.5, total: 4 },
      { milestone: "M2", reskill: 0, redeploy: 3, hire: 0, external: 0, total: 3 },
    ]);
  });
});

describe("goal progress", () => {
  const goal = {
    baseline: { reviews_per_year: 240000, cost_per_review_eur: 48, ai_assisted_share: 0 },
    target: { ai_assisted_share: 0.6, cost_per_review_reduction_pct: 0.35 },
    horizon_end: "2028-12",
  } as unknown as Goal;

  it("derives the target and modelled cost per review with the formula shown", () => {
    const monthly = [point("2027-01", { adoption_share: 0.1 }), point("2028-12", { adoption_share: 0.6 })];
    const p = goalProgress(goal, monthly, 0.35);
    expect(p.costTarget).toBeCloseTo(31.2, 6); // 48 x (1 - 0.35)
    expect(p.reductionModelled).toBeCloseTo(0.21, 6); // 0.35 x 0.6, blended
    expect(p.costModelled).toBeCloseTo(37.92, 6); // 48 x (1 - 0.21)
    expect(p.shareAtDeadline).toBe(0.6);
  });

  it("reads the saving from an override before the mock base", () => {
    const assumptions = [{ key: "ai_cost_saving_pct", base: 0.35 }] as unknown as Parameters<typeof effectiveSaving>[0];
    expect(effectiveSaving(assumptions, {})).toBe(0.35);
    expect(effectiveSaving(assumptions, { ai_cost_saving_pct: 0.4 })).toBe(0.4);
  });
});

describe("attention points", () => {
  const plan = (t: Partial<Totals>, shortfalls: ScenarioResult["shortfalls"] = []) =>
    ({
      scenarios: { hybrid: { ...scenario("hybrid", [], t), shortfalls } },
    }) as unknown as PlanResponse;

  it("warns when payback is not reached within the limit and points to the run rate", () => {
    const items = attentionItems(
      plan({ payback_month: null, payback_within_deadline: false, payback_months_after_deadline: null, run_rate_net_eur_year: 400000 }),
      "hybrid",
    );
    const payback = items.find((i) => i.id === "payback");
    expect(payback?.tone).toBe("warning");
    expect(payback?.detail).toContain("run rate");
  });

  it("reports payback as a success when it falls within the deadline", () => {
    const items = attentionItems(plan({ payback_month: "2028-03", payback_within_deadline: true, payback_months_after_deadline: 0 }), "hybrid");
    expect(items.find((i) => i.id === "payback")?.tone).toBe("success");
  });

  it("states the months after the deadline when payback falls later, ", () => {
    const items = attentionItems(
      plan({ payback_month: "2029-02", payback_within_deadline: false, payback_months_after_deadline: 2, run_rate_net_eur_year: 1315600 }),
      "hybrid",
    );
    const payback = items.find((i) => i.id === "payback");
    expect(payback?.title).toContain("2 months after the deadline");
    expect(payback?.title).toContain("Feb 2029");
  });

  it("keeps only deadline months for the deadline charts and goal progress", () => {
    const monthly = [
      point("2028-11", { adoption_share: 0.5 }),
      point("2028-12", { adoption_share: 0.6 }),
      point("2029-01", { adoption_share: 0.6, after_deadline: true }),
    ];
    expect(deadlineMonths(monthly).map((m) => m.month)).toEqual(["2028-11", "2028-12"]);
    expect(adoptionRows(monthly).map((r) => r.month)).toEqual(["2028-11", "2028-12"]);
    const localGoal = {
      baseline: { cost_per_review_eur: 48 },
      target: { ai_assisted_share: 0.6, cost_per_review_reduction_pct: 0.35 },
    } as unknown as Goal;
    expect(goalProgress(localGoal, monthly, 0.35).shareAtDeadline).toBe(0.6);
  });

  it("labels payback inside, after and not reached", () => {
    expect(paybackLabel({ payback_month: "2028-03", payback_within_deadline: true } as Totals)).toBe("Mar 2028");
    expect(paybackLabel({ payback_month: "2029-02", payback_within_deadline: false } as Totals)).toBe("Feb 2029 (after deadline)");
    expect(paybackLabel({ payback_month: null, payback_within_deadline: false } as Totals)).toBe("Not reached");
  });

  it("states freed capacity only as an aggregate with the review flag", () => {
    const items = attentionItems(plan({ freed_capacity_fte_peak: 25.2 }), "hybrid");
    const freed = items.find((i) => i.id === "freed");
    expect(freed?.title).toContain("25.2 FTE");
    expect(freed?.detail).toContain("HR / legal / employee-representation review required");
    expect(freed?.detail).toContain("No individual is identified");
  });

  it("counts shortfalls and does not claim full coverage when there are some", () => {
    const shortfall = {
      requirement_id: "R01",
      milestone_id: "M1",
      skill_id: "x",
      months: ["2027-01"],
      unmet_fte_months: 1.5,
      reason: "no_eligible_supply" as const,
    };
    const items = attentionItems(plan({}, [shortfall]), "hybrid");
    expect(items.find((i) => i.id === "shortfall")?.title).toBe("1 supply shortfall");
  });

  it("returns nothing for an unknown option", () => {
    expect(attentionItems(plan({}), "reskill_led")).toEqual([]);
  });
});

describe("roadmap draft errors per row", () => {
  it("attaches each message to the milestone it concerns", () => {
    const drafts = [
      { id: "M1", start: "2027-01", end: "2027-03", depends_on: [] },
      { id: "M2", start: "2027-02", end: "2027-06", depends_on: ["M1"] },
    ];
    expect(checkDraft(drafts).length).toBe(1);
    expect(Object.keys(rowErrors(drafts))).toEqual(["M2"]);
  });
});

describe("unit formatting for assumptions and explanations", () => {
  it("formats shares as percent, EUR with its per-unit suffix, and other units plainly", () => {
    expect(formatByUnit(0.35, "share")).toBe("35.0%");
    expect(formatByUnit(650, "EUR/day")).toBe("EUR 650 per day");
    expect(formatByUnit(3000, "EUR/hire")).toBe("EUR 3,000 per hire");
    expect(formatByUnit(12, "days/level")).toBe("12 days/level");
    expect(formatByUnit(1.35, "multiplier")).toBe("1.35×");
  });
});
