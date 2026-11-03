import { describe, expect, it } from "vitest";
import type { AssumptionRow } from "../api/types";
import { effectiveSaving, effectiveValue } from "./assumptions";

const rows = [{ key: "ai_cost_saving_pct", base: 0.35 }, { key: "hire_cost", base: 3000 }] as unknown as AssumptionRow[];

describe("effectiveValue", () => {
  it("prefers a user override over the mock base", () => {
    expect(effectiveValue(rows, { hire_cost: 4000 }, "hire_cost")).toBe(4000);
  });

  it("falls back to the mock base when there is no override", () => {
    expect(effectiveValue(rows, {}, "hire_cost")).toBe(3000);
  });

  it("uses the given fallback, or zero, when the key is unknown", () => {
    expect(effectiveValue(rows, {}, "unknown", 7)).toBe(7);
    expect(effectiveValue(rows, {}, "unknown")).toBe(0);
  });
});

describe("effectiveSaving", () => {
  it("reads the saving from the assumptions, with the documented 35% fallback", () => {
    expect(effectiveSaving(rows, {})).toBe(0.35);
    expect(effectiveSaving([], {})).toBe(0.35);
    expect(effectiveSaving(rows, { ai_cost_saving_pct: 0.2 })).toBe(0.2);
  });
});
