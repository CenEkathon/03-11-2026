import type { AssumptionRow } from "../api/types";

/** Value used for a key in the base case: the user's override if set, otherwise the mock base value. */
export function effectiveValue(assumptions: AssumptionRow[], overrides: Record<string, number>, key: string, fallback = 0): number {
  const override = overrides[key];
  if (override !== undefined) return override;
  return assumptions.find((a) => a.key === key)?.base ?? fallback;
}

/** Share of reviews saved when AI assists. Drives the blended cost per review on the Overview. */
export function effectiveSaving(assumptions: AssumptionRow[], overrides: Record<string, number>): number {
  return effectiveValue(assumptions, overrides, "ai_cost_saving_pct", 0.35);
}
