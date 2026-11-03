/**
 * Shared test fixtures. Everything here is MOCK or SYNTHETIC demo data, shaped like the API responses.
 * The numbers are arbitrary test values, not estimates of anything, and they name no real company or person.
 */
import { vi } from "vitest";
import type { Controls, Shared } from "../appTypes";
import type {
  AssumptionRow,
  CaseInfo,
  Goal,
  Milestone,
  MonthlyPoint,
  PlanResponse,
  Requirement,
  ScenarioId,
  ScenarioResult,
  SensitivityRow,
  SkillFit,
  Totals,
  ActionLine,
  Shortfall,
} from "../api/types";
import { monthFromIndex, monthIndex } from "../lib/months";

/** 24 months, Jan 2027 to Dec 2028. */
export const MONTHS: string[] = (() => {
  const start = monthIndex("2027-01") ?? 0;
  return Array.from({ length: 24 }, (_, i) => monthFromIndex(start + i));
})();

export const GOAL: Goal = {
  title: "MOCK GOAL: AI-assisted KYC and AML reviews",
  company_id: "mock_company",
  statement: "Mock statement for the demo. Not a real strategy.",
  baseline: { reviews_per_year: 240000, cost_per_review_eur: 48, ai_assisted_share: 0 },
  target: { ai_assisted_share: 0.6, cost_per_review_reduction_pct: 0.35 },
  deadline: "2028-12-31",
  horizon_start: "2027-01",
  horizon_end: "2028-12",
  constraints: ["No forced redundancies", "Model-risk gate before scale-up"],
  is_mock: true,
};

export const MILESTONES: Milestone[] = [
  {
    id: "M1",
    name: "Pilot AI triage",
    description: "Pilot in AML operations.",
    start: "2027-01",
    end: "2027-06",
    depends_on: [],
    owner_team: "aml_ops",
    metric: { name: "Pilot cases triaged", target: 0.15, unit: "share" },
    adoption_share_target: 0.15,
    change_cost_eur: 40000,
    is_mock: true,
  },
  {
    id: "M2",
    name: "Model risk gate",
    description: "Validate the model.",
    start: "2027-07",
    end: "2027-12",
    depends_on: ["M1"],
    owner_team: "model_risk",
    metric: { name: "Validation sign-off", target: 1, unit: "count" },
    adoption_share_target: 0.3,
    change_cost_eur: 0,
    is_mock: true,
  },
  {
    id: "M3",
    name: "Scale KYC",
    description: "Extend to the KYC population.",
    start: "2028-01",
    end: "2028-06",
    depends_on: ["M2"],
    owner_team: "kyc_ops",
    metric: { name: "KYC cases triaged", target: 0.45, unit: "share" },
    adoption_share_target: 0.45,
    change_cost_eur: 60000,
    is_mock: true,
  },
  {
    id: "M4",
    name: "Run at target",
    description: "Hold the target share.",
    start: "2028-07",
    end: "2028-12",
    depends_on: ["M3"],
    owner_team: "kyc_ops",
    metric: { name: "Average cost per review", target: 2.5, unit: "EUR/day" },
    adoption_share_target: 0.6,
    change_cost_eur: 0,
    is_mock: true,
  },
];

export const REQUIREMENTS: Requirement[] = [
  {
    id: "R01",
    milestone_id: "M1",
    role: "AML analyst (mock)",
    skill_id: "aml_monitoring",
    min_proficiency: 2,
    fte: 4,
    start: "2027-01",
    end: "2027-06",
    source: "observed",
    confidence: "medium",
    rationale: "Mock requirement for the pilot.",
  },
  {
    id: "R02",
    milestone_id: "M1",
    role: "Data analyst (mock)",
    skill_id: "python",
    min_proficiency: 3,
    fte: 2,
    start: "2027-01",
    end: "2027-06",
    source: "assumed",
    confidence: "low",
    rationale: "Mock requirement for the pilot data.",
  },
  {
    id: "R03",
    milestone_id: "M2",
    role: "Model validator (mock)",
    skill_id: "model_validation",
    min_proficiency: 3,
    fte: 1,
    start: "2027-07",
    end: "2027-12",
    source: "inferred",
    confidence: "high",
    rationale: "Mock requirement for the validation gate.",
  },
  {
    id: "R04",
    milestone_id: "M3",
    role: "KYC reviewer (mock)",
    skill_id: "kyc",
    min_proficiency: 2,
    fte: 6,
    start: "2028-01",
    end: "2028-06",
    source: "assumed",
    confidence: "medium",
    rationale: "Mock requirement for the KYC scale-up.",
  },
];

export const SKILL_FIT: SkillFit[] = [
  {
    requirement_id: "R01",
    skill_id: "aml_monitoring",
    eligible_now: 12,
    reskill_candidates: 5,
    evidence_employee_ids: ["EMP-0001", "EMP-0002"],
    team_coverage: { aml_ops: 9, kyc_ops: 3 },
    vacancy_evidence_share: 0.42,
    mapping_confidence: 0.9,
  },
  {
    requirement_id: "R02",
    skill_id: "python",
    eligible_now: 0,
    reskill_candidates: 0,
    team_coverage: {},
    vacancy_evidence_share: null,
    mapping_confidence: 0.5,
  },
  {
    requirement_id: "R03",
    skill_id: "model_validation",
    eligible_now: 2,
    reskill_candidates: 1,
    team_coverage: { model_risk: 2 },
    vacancy_evidence_share: 0.1,
    mapping_confidence: 0.8,
  },
  {
    requirement_id: "R04",
    skill_id: "kyc",
    eligible_now: 20,
    reskill_candidates: 8,
    evidence_employee_ids: [],
    team_coverage: { kyc_ops: 20 },
    vacancy_evidence_share: 0.3,
    mapping_confidence: 1,
  },
];

/** Cost profile per option, used only to make the mock monthly series differ. */
const PROFILE: Record<ScenarioId, { oneOff: number; recurring: number }> = {
  reskill_led: { oneOff: 300_000, recurring: 20_000 },
  hire_led: { oneOff: 150_000, recurring: 45_000 },
  hybrid: { oneOff: 200_000, recurring: 25_000 },
};

export function monthlyFor(id: ScenarioId): MonthlyPoint[] {
  const { oneOff, recurring } = PROFILE[id];
  let cumulative = 0;
  return MONTHS.map((month, i) => {
    const share = Math.min(0.6, 0.025 * (i + 1));
    const benefit = Math.round(share * 40_000);
    const oneOffCost = i < 6 ? oneOff / 6 : 0;
    const net = benefit - oneOffCost - recurring;
    cumulative += net;
    return {
      month,
      required_fte: i < 6 ? 6 : 4,
      staffed_fte: i < 6 ? 5 : 4,
      coverage: i < 6 ? 0.83 : 1,
      adoption_share: share,
      benefit_eur: benefit,
      cost_one_off_eur: oneOffCost,
      cost_recurring_eur: recurring,
      net_eur: net,
      cumulative_net_eur: cumulative,
      freed_capacity_fte_aggregate: id === "reskill_led" ? 2 : 0,
    };
  });
}

function totalsFor(monthly: MonthlyPoint[], freedPeak: number): Totals {
  const oneOff = monthly.reduce((s, m) => s + m.cost_one_off_eur, 0);
  const recurring = monthly.reduce((s, m) => s + m.cost_recurring_eur, 0);
  const total = oneOff + recurring;
  const benefit = monthly.reduce((s, m) => s + m.benefit_eur, 0);
  const net = benefit - total;
  const payback = monthly.find((m) => m.cumulative_net_eur >= 0)?.month ?? null;
  const last = monthly[monthly.length - 1];
  return {
    cost_one_off_eur: oneOff,
    cost_recurring_eur: recurring,
    cost_total_eur: total,
    benefit_eur: benefit,
    net_eur: net,
    roi: total === 0 ? null : net / total,
    payback_month: payback,
    unmet_fte_months: 0,
    freed_capacity_fte_peak: freedPeak,
    freed_capacity_flag: "HR / legal / employee-representation review required",
    run_rate_net_eur_year: (last.benefit_eur - last.cost_recurring_eur) * 12,
  };
}

export const SCENARIO_LABELS: Record<ScenarioId, string> = {
  reskill_led: "Reskill-led",
  hire_led: "Hire-led",
  hybrid: "Hybrid",
};

function actionLines(id: ScenarioId): ActionLine[] {
  const base = {
    scenario: id,
    milestone_id: "M1",
    requirement_id: "R01",
    skill_id: "aml_monitoring",
    start: "2027-01",
    duration_months: 6,
    depends_on: [],
    is_estimate: true as const,
    rationale: "Mock rationale for the action.",
    explanation: {
      formula: "FTE x one-off cost",
      inputs: { fte: 4, one_off_cost_eur_per_person: 3000, note: "text input" },
      source: "mock_assumption" as const,
      confidence: "low" as const,
    },
  };
  const lines: ActionLine[] = [
    { ...base, id: `${id}-a1`, type: "reskill", people_count: 4, fte: 4, one_off_cost_eur: 12000, recurring_cost_eur: 0, skills_gained: ["kyc"], employee_ids: ["EMP-0003"] },
    { ...base, id: `${id}-a2`, type: "redeploy", people_count: 2, fte: 2, one_off_cost_eur: 1000, recurring_cost_eur: 0 },
    { ...base, id: `${id}-a3`, type: "hire", people_count: 1, fte: 1, one_off_cost_eur: 3000, recurring_cost_eur: 8000, milestone_id: "M2", requirement_id: "R03", skill_id: "model_validation", start: "2027-07", depends_on: ["M1"] },
    { ...base, id: `${id}-a4`, type: "external", people_count: 1, fte: 0.5, one_off_cost_eur: 0, recurring_cost_eur: 2000, milestone_id: "M3", requirement_id: "R04", skill_id: "kyc", start: "2028-01" },
  ];
  return lines;
}

const SHORTFALL: Shortfall = {
  requirement_id: "R02",
  milestone_id: "M1",
  skill_id: "python",
  months: ["2027-01", "2027-02"],
  unmet_fte_months: 1.5,
  reason: "no_eligible_supply",
};

export function scenarioFor(id: ScenarioId, overrides: Partial<ScenarioResult> = {}): ScenarioResult {
  const monthly = monthlyFor(id);
  return {
    scenario: id,
    label: SCENARIO_LABELS[id],
    description: `Mock description of the ${SCENARIO_LABELS[id]} option.`,
    actions: actionLines(id),
    monthly,
    shortfalls: id === "reskill_led" ? [SHORTFALL] : [],
    totals: totalsFor(monthly, id === "reskill_led" ? 2 : 0),
    ...overrides,
  };
}

export function makePlan(overrides: Partial<PlanResponse> = {}): PlanResponse {
  return {
    case: "base",
    goal: GOAL,
    milestones: MILESTONES,
    requirements: REQUIREMENTS,
    validation: { ok: true, errors: [] },
    skill_fit: SKILL_FIT,
    scenarios: {
      reskill_led: scenarioFor("reskill_led"),
      hire_led: scenarioFor("hire_led"),
      hybrid: scenarioFor("hybrid"),
    },
    labels: { goal: "MOCK", roadmap: "MOCK", workforce: "SYNTHETIC", estimates: "ESTIMATE" },
    ...overrides,
  };
}

export const CASE_INFO: CaseInfo = {
  company: {
    id: "mock_company",
    name: "Mock company (fictional)",
    description: "Fictional company for the demo.",
    teams: [
      { id: "aml_ops", name: "AML operations", contributing: true },
      { id: "kyc_ops", name: "KYC operations", contributing: true },
      { id: "model_risk", name: "Model risk", contributing: false },
    ],
  },
  goal: GOAL,
  milestones: MILESTONES,
  labels: { goal: "MOCK" },
};

export const SKILL_LABELS: Record<string, string> = {
  aml_monitoring: "AML alert handling",
  python: "Python programming",
  model_validation: "Model validation",
  kyc: "Know your customer (KYC) reviews",
};

export const ASSUMPTIONS: AssumptionRow[] = [
  {
    key: "ai_cost_saving_pct",
    label: "Cost saving on AI-assisted reviews",
    unit: "share",
    low: 0.25,
    base: 0.35,
    high: 0.45,
    rationale: "Mock rationale.",
    confidence: "low",
    is_mock: true,
    base_effective: 0.35,
  },
  {
    key: "contractor_day_rate",
    label: "Contractor day rate",
    unit: "EUR/day",
    low: 600,
    base: 650,
    high: 700,
    rationale: "Mock rationale.",
    confidence: "medium",
    is_mock: true,
    base_effective: 650,
  },
  {
    key: "hire_cost",
    label: "One-off hire cost",
    unit: "EUR/hire",
    low: 2500,
    base: 3000,
    high: 3500,
    rationale: "Mock rationale.",
    confidence: "high",
    is_mock: true,
    base_effective: 3000,
  },
  {
    key: "ramp_days",
    label: "Ramp-up days",
    unit: "days/level",
    low: 10,
    base: 12,
    high: 14,
    rationale: "Mock rationale.",
    confidence: "medium",
    is_mock: true,
    base_effective: 12,
  },
];

export const SENSITIVITY: SensitivityRow[] = (["reskill_led", "hire_led", "hybrid"] as ScenarioId[]).flatMap((id) => {
  const base = scenarioFor(id).totals.net_eur;
  return [
    { scenario: id, case: "low" as const, net_eur: base - 100_000, roi: null, cost_total_eur: 0, benefit_eur: 0, unmet_fte_months: 0 },
    { scenario: id, case: "base" as const, net_eur: base, roi: null, cost_total_eur: 0, benefit_eur: 0, unmet_fte_months: 0 },
    { scenario: id, case: "high" as const, net_eur: base + 100_000, roi: null, cost_total_eur: 0, benefit_eur: 0, unmet_fte_months: 0 },
  ];
});

/** The Shared bundle the screens receive after the bootstrap load. */
export function makeShared(overrides: Partial<Shared> = {}): Shared {
  return {
    plan: makePlan(),
    caseInfo: CASE_INFO,
    skillLabels: SKILL_LABELS,
    assumptions: ASSUMPTIONS,
    sensitivity: SENSITIVITY,
    ...overrides,
  };
}

/** Controls with spies. The apply functions resolve to null (success) unless a test overrides them. */
export function makeControls(overrides: Partial<Controls> = {}): Controls {
  return {
    caseId: "base",
    setCase: vi.fn(),
    dates: {},
    overrides: {},
    isEdited: false,
    busy: false,
    applyRoadmap: vi.fn(async () => null),
    applyAssumptions: vi.fn(async () => null),
    ...overrides,
  };
}
