import type { components } from "./schema";

type S = components["schemas"];

export type PlanRequest = S["PlanRequest"];
export type PlanResponse = S["PlanResponse"];
export type ScenarioResult = S["ScenarioResult"];
export type ActionLine = S["ActionLine"];
export type MonthlyPoint = S["MonthlyPoint"];
export type Shortfall = S["Shortfall"];
export type SkillFit = S["SkillFit"];
export type Totals = S["Totals"];
export type Milestone = S["Milestone"];
export type MilestoneDates = S["MilestoneDates"];
export type Requirement = S["Requirement"];
export type Goal = S["Goal"];
export type SensitivityRow = S["SensitivityRow"];
export type BriefRequest = S["BriefRequest"];
export type BriefResponse = S["BriefResponse"];
export type Explanation = S["Explanation"];
export type DagValidation = S["DagValidation"];

// Literal unions from the backend contracts (the generated schema inlines them).
export type CaseId = "low" | "base" | "high";
export type ScenarioId = "reskill_led" | "hire_led" | "hybrid";
export type ActionType = "redeploy" | "reskill" | "external" | "hire";
export type ShortfallReason = "no_eligible_supply" | "lead_time_too_short" | "hire_not_started";

export const SCENARIO_IDS: ScenarioId[] = ["reskill_led", "hire_led", "hybrid"];

// Shapes returned by endpoints without a response_model.
export interface CaseInfo {
  company: {
    id: string;
    name: string;
    description: string;
    teams: { id: string; name: string; contributing: boolean }[];
  };
  goal: Goal;
  milestones: Milestone[];
  labels: Record<string, string>;
}

export interface SkillInfo {
  id: string;
  label: string;
  family: string;
  esco_uri: string | null;
}

export interface SkillsResponse {
  skills: SkillInfo[];
  labels: Record<string, string>;
}

export interface AssumptionRow {
  key: string;
  label: string;
  unit: string;
  low: number;
  base: number;
  high: number;
  rationale: string;
  confidence: "low" | "medium" | "high";
  is_mock: true;
  base_effective: number;
}

export interface AssumptionsResponse {
  assumptions: AssumptionRow[];
  labels: Record<string, string>;
}

export interface WorkforceSummary {
  teams: {
    team_id: string;
    name: string;
    contributing: boolean;
    headcount: number;
    skills_at_level_3_plus: Record<string, number>;
  }[];
  total_headcount: number;
  labels: Record<string, string>;
}

export interface UsageSummary {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  eur_estimate: number;
  priced: boolean;
}
