/** Demo-only sample briefs for the intake screen. They are fictional text, not real strategy. */
export interface SampleBrief {
  label: string;
  text: string;
}

export const SAMPLE_BRIEFS: readonly SampleBrief[] = [
  {
    label: "Goal",
    text: "Scale AI-assisted KYC and AML reviews to 60% of cases by December 2028 and make each AI-assisted review cost 35% less than today. No forced redundancies: reskill and redeploy first, and hire only where the skills are missing.",
  },
  {
    label: "Pilot first",
    text: "Start with a six-month pilot of AI triage in AML operations, from July 2027. Validate the model with model risk management and keep the compliance team in the loop before scaling to the wider KYC population.",
  },
  {
    label: "Tight budget",
    text: "Keep one-off spend under the reskill-led budget. Prefer training existing analysts over new hires, and only add external capacity for skills that cannot be trained in time for the milestone dates.",
  },
];
