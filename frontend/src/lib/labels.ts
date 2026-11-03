import type { ActionType, ScenarioId, ShortfallReason } from "../api/types";

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

/** Skill levels: 1 basic, 2 working, 3 expert. */
export const LEVEL_NAMES: Record<number, string> = { 1: "1 basic", 2: "2 working", 3: "3 expert" };

export const RECOMMENDED: ScenarioId = "hybrid";

export const DISCLAIMER =
  "Numbers are calculated by code from the planning assumptions. Text is drafted by a template, or by AI if enabled.";
