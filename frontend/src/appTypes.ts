import type {
  AssumptionRow,
  CaseId,
  CaseInfo,
  MilestoneDates,
  PlanResponse,
  SensitivityRow,
} from "./api/types";

/** Data loaded once at startup and refreshed after each successful compute. */
export interface Shared {
  plan: PlanResponse;
  caseInfo: CaseInfo;
  skillLabels: Record<string, string>;
  assumptions: AssumptionRow[];
  sensitivity: SensitivityRow[] | null;
}

/** Client-side overrides. They travel with every compute request. Nothing is persisted on the server. */
export interface Controls {
  caseId: CaseId;
  setCase: (c: CaseId) => void;
  dates: Record<string, MilestoneDates>;
  overrides: Record<string, number>;
  /** True when any roadmap date or assumption differs from the defaults. */
  isEdited: boolean;
  /** Resolves to null on success, or to validation messages on a 422 (the displayed plan is unchanged). */
  applyRoadmap: (dates: Record<string, MilestoneDates>) => Promise<string[] | null>;
  applyAssumptions: (overrides: Record<string, number>) => Promise<string[] | null>;
}
