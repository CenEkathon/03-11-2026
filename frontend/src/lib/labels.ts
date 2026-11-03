import type { ActionType, ShortfallReason, ScenarioId } from "../api/types";

/** Badge kinds shown on every screen. The full text comes from response.labels. */
export type BadgeKind = "MOCK" | "SYNTHETIC" | "EXTERNAL" | "ESTIMATE";

/** Maps a key from response.labels to its badge kind. Unknown keys default to MOCK. */
const LABEL_KIND: Record<string, BadgeKind> = {
  goal: "MOCK",
  roadmap: "MOCK",
  workforce: "SYNTHETIC",
  assumptions: "MOCK",
  vacancy_evidence: "EXTERNAL",
  estimates: "ESTIMATE",
  taxonomy: "MOCK",
  source: "EXTERNAL",
};

export function badgeKind(labelKey: string): BadgeKind {
  return LABEL_KIND[labelKey] ?? "MOCK";
}

export const REASON_LABEL: Record<ShortfallReason, string> = {
  hire_not_started: "Hire not yet started",
  lead_time_too_short: "Lead time too short for training",
  no_eligible_supply: "No eligible supply",
};

export const ACTION_TYPE_LABEL: Record<ActionType, string> = {
  redeploy: "Redeploy",
  reskill: "Reskill",
  external: "Contractor bridge",
  hire: "Hire",
};

export const SCENARIO_SHORT_LABEL: Record<ScenarioId, string> = {
  reskill_led: "Reskill-led",
  hire_led: "Hire-led",
  hybrid: "Hybrid",
};

/** Series colour follows the scenario identity, never its rank in the list. */
export const SCENARIO_SLOT: Record<ScenarioId, number> = {
  reskill_led: 0,
  hire_led: 1,
  hybrid: 2,
};

export const DISCLAIMER =
  "Numbers computed by code; text drafted by AI or template. Everything is a mock estimate for a fictional bank.";
