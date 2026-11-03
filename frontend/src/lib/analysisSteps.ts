/**
 * Splash messages shown while the mock analysis runs. They are presentation only: the timing is simulated and
 * none of these steps runs a model or reads the data.
 */

/** Simulated analysis time after the intake form is sent. */
export const MOCK_ANALYSIS_DELAY_MS = 7000;

export const ANALYSIS_STEPS: readonly string[] = [
  "Collecting data",
  "Reading your brief",
  "Parsing worker records",
  "Mapping skills to milestones",
  "Matching capacity to demand",
  "Checking reskilling pathways",
  "Estimating hiring needs",
  "Calculating gain",
  "Estimating costs and benefits",
  "Generating report",
  "Drafting the summary",
  "Finalising",
];

/** The message to show after `elapsedMs`. Steps are spread evenly over the delay and the last one holds. */
export function analysisStepAt(elapsedMs: number, totalMs: number = MOCK_ANALYSIS_DELAY_MS): string {
  const slice = totalMs / ANALYSIS_STEPS.length;
  const index = Math.min(Math.max(Math.floor(elapsedMs / slice), 0), ANALYSIS_STEPS.length - 1);
  return ANALYSIS_STEPS[index];
}
