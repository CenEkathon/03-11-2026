import { describe, expect, it } from "vitest";
import { ANALYSIS_STEPS, analysisStepAt, MOCK_ANALYSIS_DELAY_MS } from "./analysisSteps";

describe("analysisStepAt", () => {
  it("starts on the first step and moves through the list in order", () => {
    expect(analysisStepAt(0)).toBe(ANALYSIS_STEPS[0]);
    const slice = MOCK_ANALYSIS_DELAY_MS / ANALYSIS_STEPS.length;
    expect(analysisStepAt(slice * 3 + 1)).toBe(ANALYSIS_STEPS[3]);
  });

  it("holds the last step once the delay has passed", () => {
    expect(analysisStepAt(MOCK_ANALYSIS_DELAY_MS + 5000)).toBe(ANALYSIS_STEPS[ANALYSIS_STEPS.length - 1]);
  });

  it("never goes below the first step for negative elapsed time", () => {
    expect(analysisStepAt(-100)).toBe(ANALYSIS_STEPS[0]);
  });

  it("has at least ten messages and no duplicates", () => {
    expect(ANALYSIS_STEPS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(ANALYSIS_STEPS).size).toBe(ANALYSIS_STEPS.length);
  });
});
