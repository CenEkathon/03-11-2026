import type { AssumptionRow, CaseId, CaseInfo, MilestoneDates, PlanResponse, SensitivityRow } from "./api/types";

/** Data loaded at startup and refreshed after each successful compute. */
export interface Shared {
  plan: PlanResponse;
  caseInfo: CaseInfo;
  skillLabels: Record<string, string>;
  assumptions: AssumptionRow[];
  sensitivity: SensitivityRow[];
}

/** Client-side edits. They travel with every compute request. Nothing is persisted on the server. */
export interface Controls {
  caseId: CaseId;
  setCase: (c: CaseId) => void;
  dates: Record<string, MilestoneDates>;
  overrides: Record<string, number>;
  /** True when any roadmap date or assumption differs from the defaults. */
  isEdited: boolean;
  /** True while a recompute is in flight. Screens keep the previous render, dimmed. */
  busy: boolean;
  /** Resolves to null on success, or to validation messages when the server rejects the roadmap. */
  applyRoadmap: (dates: Record<string, MilestoneDates>) => Promise<string[] | null>;
  /** Resolves to null on success, or to validation messages. */
  applyAssumptions: (overrides: Record<string, number>) => Promise<string[] | null>;
}
