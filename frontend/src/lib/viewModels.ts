/**
 * Pure reshaping of plan responses into chart and card rows. No arithmetic that the engine owns:
 * sums here only regroup values the backend already computed (FTE per action, monthly series).
 * The one derived figure (goal progress) is labelled with its formula where it is shown.
 */
import type {
  ActionLine,
  ActionType,
  Goal,
  Milestone,
  MonthlyPoint,
  PlanResponse,
  ScenarioId,
  ScenarioResult,
  SensitivityRow,
} from "../api/types";
import { formatMonth } from "./format";

// ---------------------------------------------------------------- AI adoption
export interface AdoptionPoint {
  month: string;
  share: number;
}

export function adoptionRows(monthly: MonthlyPoint[]): AdoptionPoint[] {
  return monthly.map((m) => ({ month: m.month, share: m.adoption_share }));
}

// ---------------------------------------------------------------- cumulative net by option
export type CumulativeRow = { month: string } & Partial<Record<ScenarioId, number>>;

export function cumulativeRows(
  scenarios: Partial<Record<ScenarioId, ScenarioResult>>,
  ids: ScenarioId[],
): CumulativeRow[] {
  const reference = scenarios[ids[0]]?.monthly ?? [];
  return reference.map((point, i) => {
    const row: CumulativeRow = { month: point.month };
    for (const id of ids) row[id] = scenarios[id]?.monthly[i]?.cumulative_net_eur;
    return row;
  });
}

// ---------------------------------------------------------------- monthly cash
export interface CashRow {
  month: string;
  benefit: number;
  /** Positive number of EUR spent in the month (one-off plus recurring). */
  cost: number;
  net: number;
}

export function cashRows(monthly: MonthlyPoint[]): CashRow[] {
  return monthly.map((m) => ({
    month: m.month,
    benefit: m.benefit_eur,
    cost: m.cost_one_off_eur + m.cost_recurring_eur,
    net: m.net_eur,
  }));
}

// ---------------------------------------------------------------- capacity against demand
export interface CoverageRow {
  month: string;
  required: number;
  staffed: number;
}

export function coverageRows(monthly: MonthlyPoint[]): CoverageRow[] {
  return monthly.map((m) => ({ month: m.month, required: m.required_fte, staffed: m.staffed_fte }));
}

// ---------------------------------------------------------------- where the FTE comes from
export interface MixRow {
  milestone: string;
  reskill: number;
  redeploy: number;
  hire: number;
  external: number;
  total: number;
}

/** FTE per action type and milestone. Summing the engine's action FTE, nothing more. */
export function actionMixRows(actions: ActionLine[], milestones: Milestone[]): MixRow[] {
  return milestones.map((ms) => {
    const row: MixRow = { milestone: ms.id, reskill: 0, redeploy: 0, hire: 0, external: 0, total: 0 };
    for (const a of actions) {
      if (a.milestone_id !== ms.id) continue;
      row[a.type as ActionType] += a.fte;
      row.total += a.fte;
    }
    return row;
  });
}

// ---------------------------------------------------------------- sensitivity range
export interface RangeRow {
  scenario: ScenarioId;
  low: number;
  base: number;
  high: number;
}

/** Net value per option across the low, base and high cases. Low and high are sorted so the bar is always valid. */
export function rangeRows(rows: SensitivityRow[], ids: ScenarioId[]): RangeRow[] {
  const out: RangeRow[] = [];
  for (const id of ids) {
    const low = rows.find((r) => r.scenario === id && r.case === "low");
    const base = rows.find((r) => r.scenario === id && r.case === "base");
    const high = rows.find((r) => r.scenario === id && r.case === "high");
    if (!low || !base || !high) continue;
    out.push({
      scenario: id,
      low: Math.min(low.net_eur, high.net_eur),
      base: base.net_eur,
      high: Math.max(low.net_eur, high.net_eur),
    });
  }
  return out;
}

// ---------------------------------------------------------------- goal progress (derived, labelled)
export interface GoalProgress {
  /** AI-assisted share in the last modelled month. */
  shareAtDeadline: number;
  targetShare: number;
  costBaseline: number;
  /** Target cost per review: baseline x (1 - target reduction). */
  costTarget: number;
  /** Modelled blended cost per review: baseline x (1 - saving x share at deadline). */
  costModelled: number;
  /** Blended reduction the model reaches at the deadline: saving x share at deadline. */
  reductionModelled: number;
  reductionTarget: number;
}

export function goalProgress(goal: Goal, monthly: MonthlyPoint[], aiCostSaving: number): GoalProgress {
  const shareAtDeadline = monthly.at(-1)?.adoption_share ?? 0;
  const costBaseline = goal.baseline.cost_per_review_eur;
  const reductionTarget = goal.target.cost_per_review_reduction_pct;
  const reductionModelled = aiCostSaving * shareAtDeadline;
  return {
    shareAtDeadline,
    targetShare: goal.target.ai_assisted_share,
    costBaseline,
    costTarget: costBaseline * (1 - reductionTarget),
    costModelled: costBaseline * (1 - reductionModelled),
    reductionModelled,
    reductionTarget,
  };
}

// ---------------------------------------------------------------- attention points
export type Tone = "critical" | "warning" | "info" | "success";

export interface Attention {
  id: string;
  tone: Tone;
  title: string;
  detail: string;
}

/** Plain-language findings for one option, computed from its totals and shortfalls. */
export function attentionItems(plan: PlanResponse, scenarioId: ScenarioId): Attention[] {
  const result = plan.scenarios[scenarioId];
  if (!result) return [];
  const t = result.totals;
  const items: Attention[] = [];

  if (t.payback_month) {
    items.push({
      id: "payback",
      tone: "success",
      title: `Pays back by ${formatMonth(t.payback_month)}`,
      detail: "Cumulative net turns positive within the deadline.",
    });
  } else {
    items.push({
      id: "payback",
      tone: "warning",
      title: "No payback before the deadline",
      detail: t.extended_payback_month
        ? `${formatMonth(t.extended_payback_month)} if benefit continues past the deadline. Not a forecast. The Money page has the full note.`
        : "Cumulative net stays negative in the modelled horizon.",
    });
  }

  if (t.freed_capacity_fte_peak > 0) {
    items.push({
      id: "freed",
      tone: "info",
      title: `Aggregate freed capacity peaks at ${t.freed_capacity_fte_peak.toFixed(1)} FTE`,
      detail: `${t.freed_capacity_flag}. This is an aggregate FTE only. No individual is identified or selected.`,
    });
  }

  if (result.shortfalls.length > 0) {
    const unmet = result.shortfalls.reduce((sum, s) => sum + s.unmet_fte_months, 0);
    items.push({
      id: "shortfall",
      tone: "warning",
      title: `${result.shortfalls.length} supply shortfall${result.shortfalls.length === 1 ? "" : "s"}`,
      detail: `${unmet.toFixed(2)} unmet FTE-months. See the Workforce page for the requirements affected.`,
    });
  } else {
    items.push({
      id: "shortfall",
      tone: "success",
      title: "Every requirement is covered",
      detail: "No unmet FTE-months in this option.",
    });
  }

  return items;
}

/** Cost difference between options. Used to explain why the benefit line is identical across options. */
export function benefitSpread(plan: PlanResponse, ids: ScenarioId[]): number {
  const benefits = ids.map((id) => plan.scenarios[id]?.totals.benefit_eur ?? 0);
  return Math.max(...benefits) - Math.min(...benefits);
}
