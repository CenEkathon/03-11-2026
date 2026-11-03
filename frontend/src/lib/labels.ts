import type { ActionType, ScenarioId, ShortfallReason } from "../api/types";

/** Data-status kinds shown as badges. The full wording comes from response.labels. */
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

/** One plain-language sentence per badge, for the "What is mock?" dialog. */
export const BADGE_MEANING: Record<BadgeKind, string> = {
  MOCK: "Invented for the demo: the company, the goal, the roadmap and the assumptions.",
  SYNTHETIC: "Generated workforce. Fictional people with IDs only. No names, no real employees.",
  EXTERNAL: "Observed in real 2021 job postings (aggregated). Not attributed to any employer.",
  ESTIMATE: "Modelled from mock assumptions. Treat every cost and benefit as an estimate.",
};

export const REASON_LABEL: Record<ShortfallReason, string> = {
  hire_not_started: "Hire not yet started",
  lead_time_too_short: "Training lead time too short",
  no_eligible_supply: "No eligible people",
};

export const ACTION_TYPE_LABEL: Record<ActionType, string> = {
  redeploy: "Redeploy",
  reskill: "Reskill",
  external: "Contractor bridge",
  hire: "Hire",
};

/** What each action means, in plain words. Mirrors the planner's definitions. */
export const ACTION_TYPE_HELP: Record<ActionType, string> = {
  redeploy: "People already at the required level, moved into the work.",
  reskill: "People one or two levels short, trained on an adjacent skill.",
  external: "Contractors covering a capped share of the need while capacity is built.",
  hire: "New people recruited for the gap that internal supply cannot cover.",
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

export const RECOMMENDED: ScenarioId = "hybrid";

export const DISCLAIMER =
  "Numbers are computed by code from mock assumptions. Text is drafted by a template, or by AI if enabled. Nothing here describes a real company or real people.";
