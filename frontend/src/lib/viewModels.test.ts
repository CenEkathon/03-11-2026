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
  benefitSpread,
  cashRows,
  cumulativeRows,
  goalProgress,
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

  it("warns when there is no payback before the deadline and points to the run-rate estimate", () => {
    const items = attentionItems(plan({ payback_month: null, run_rate_net_eur_year: 400000 }), "hybrid");
    const payback = items.find((i) => i.id === "payback");
    expect(payback?.tone).toBe("warning");
    expect(payback?.detail).toContain("run rate");
    expect(payback?.detail).toContain("not a forecast");
  });

  it("reports payback as a success when it falls within the deadline", () => {
    const items = attentionItems(plan({ payback_month: "2028-03" }), "hybrid");
    expect(items.find((i) => i.id === "payback")?.tone).toBe("success");
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

describe("cumulative rows with missing options", () => {
  it("leaves a missing option's value undefined and uses no rows when the first option is absent", () => {
    const monthly = [point("2027-01", { cumulative_net_eur: -3 })];
    const onlyHire = { hire_led: scenario("hire_led", monthly) } as Partial<Record<ScenarioId, ScenarioResult>>;
    expect(cumulativeRows(onlyHire, ["hire_led", "hybrid"])).toEqual([{ month: "2027-01", hire_led: -3, hybrid: undefined }]);
    // The first option sets the month axis, so a missing first option leaves no rows.
    expect(cumulativeRows(onlyHire, ["hybrid", "hire_led"])).toEqual([]);
  });
});

describe("goal progress, attention and benefit spread edge cases", () => {
  it("reports zero share and no shortfall when the option has no monthly data", () => {
    const goal = {
      baseline: { reviews_per_year: 1, cost_per_review_eur: 10, ai_assisted_share: 0 },
      target: { ai_assisted_share: 0.6, cost_per_review_reduction_pct: 0.35 },
      horizon_end: "2028-12",
    } as unknown as Goal;
    const p = goalProgress(goal, [], 0.35);
    expect(p.shareAtDeadline).toBe(0);
    expect(p.reductionModelled).toBe(0);
  });

  it("uses the no-payback wording and the success wording for coverage", () => {
    const plan = {
      scenarios: { hybrid: scenario("hybrid", [], { payback_month: null, run_rate_net_eur_year: -5000 }) },
    } as unknown as PlanResponse;
    const items = attentionItems(plan, "hybrid");
    expect(items.find((i) => i.id === "payback")?.detail).toContain("-EUR 5,000");
    expect(items.find((i) => i.id === "shortfall")?.title).toBe("Every requirement is covered");
  });

  it("pluralises the shortfall count when there is more than one", () => {
    const shortfall = {
      requirement_id: "R01",
      milestone_id: "M1",
      skill_id: "x",
      months: ["2027-01"],
      unmet_fte_months: 0.5,
      reason: "lead_time_too_short" as const,
    };
    const plan = {
      scenarios: { hybrid: { ...scenario("hybrid", []), shortfalls: [shortfall, shortfall] } },
    } as unknown as PlanResponse;
    const items = attentionItems(plan, "hybrid");
    expect(items.find((i) => i.id === "shortfall")?.title).toBe("2 supply shortfalls");
    expect(items.find((i) => i.id === "shortfall")?.detail).toBe("1.00 unmet FTE-months. See the Workforce page for the requirements affected.");
  });

  it("measures the spread of benefit between options, treating missing options as zero", () => {
    const plan = {
      scenarios: {
        hybrid: scenario("hybrid", [], { benefit_eur: 500 }),
        hire_led: scenario("hire_led", [], { benefit_eur: 200 }),
      },
    } as unknown as PlanResponse;
    expect(benefitSpread(plan, ["hybrid", "hire_led"])).toBe(300);
    expect(benefitSpread(plan, ["hybrid", "reskill_led"])).toBe(500);
  });
});
