# Product spec: Strategy Compiler (MOCK hackathon demo)

Source of truth for scope and contracts. Written to be explained in a few minutes, so the demo uses few numbers and plain words.

## Goal
Show what happens after a CEO gives a future business goal. The app turns it into a workforce and money plan: which skills and people each step needs, how current staff could be moved or retrained, what has to be hired, and what the plan costs and returns.

## Demo case (all MOCK, clearly labelled in the UI)
- **Company:** KBC, used only as an illustrative example name. Nothing describes KBC's real strategy, staff or figures.
- **Goal:** by 31 Dec 2028, 60% of KYC reviews are AI-assisted. Each AI-assisted review costs 35% less than today's EUR 48. Nobody is made redundant.
- **Constraints:** no forced redundancies. Reskilling and redeployment come before hiring. Model risk sign-off comes before scale-up.
- **Baseline (mock):** 240,000 reviews a year at EUR 48 each.
- **Roadmap:** four steps, a proposed plan requiring approval.
  - M1 Rules and data foundation (Jan–Jun 2027)
  - M2 AI pilot on 15% of alert triage (Jul–Dec 2027), with model validation
  - M3 Scale to 40% of KYC reviews (Jan–Jun 2028)
  - M4 Full rollout to 60% of KYC reviews (Jul–Dec 2028)
- **Workforce:** about 60 synthetic people in 5 teams. 9 skills at 3 levels (1 basic, 2 working, 3 expert). IDs only.
- **Vacancy evidence:** 2021 finance and insurance job ads, deduplicated. Shown as one share per skill. External observation, labelled as such.

## Money in one paragraph
Three ways to staff the same roadmap: redeploy first, retrain first, or hire first. Each one has:
- **Benefit:** reviews per month × share of AI-assisted reviews × EUR 48 × 35%. Only when the people for the step are in place.
- **Costs:** one-off costs (moving people, training, hiring, change budget per step) and yearly costs (backfill, pay rises, new salaries, contractors, platform).
- **Results:** net through Dec 2028, ROI, the **payback month** (the month cumulative net turns positive, which may be after Dec 2028), and the **net per year at the Dec 2028 run rate**. This last number is simple and is not a forecast.
- **Payback after the deadline.** If the option is still negative at Dec 2028, the Dec 2028 run rate continues month by month, with no new one-off costs, until cumulative net reaches zero. The result is labelled as an estimate. It is capped at 20 years.

Twelve mock assumptions drive the money, each with low, base and high values (see `fixtures/assumptions.yaml`). There is no discounting and no salary bands. Beyond the deadline, only the payback search continues, at the Dec 2028 run rate.

## Not doing
- Free-text goal entry, or generating a roadmap from a real strategy. Future scope.
- Real employee data, real hiring or firing, or any production integration.
- Employee-level surplus, ranking or termination suggestions. Surplus is only ever an aggregate FTE flagged for HR, legal and employee-representation review.
- Claims about KBC or any other real company. Vacancy data is shown as an aggregate and not attributed to employers in the UI.
- Presentation slides. Not generated, as instructed.
- Salary bands, NPV, discount rates, and a fixed 60-month extension. Removed to keep the demo explainable. Payback is searched past the deadline only as far as it is needed (2026-11-03 change, see above).

## User journey
1. **Goal.** See the mock goal, its baseline, target, deadline and constraints.
2. **Roadmap.** Review and edit step dates. Dependencies, owners and success metrics are shown. Edits recompute the plan. Invalid roadmaps are blocked with the reason.
3. **Demand.** For each step, see roles, skills, minimum level, FTE by month, and the vacancy share for the skill.
4. **Supply and gaps.** See contributing-team coverage per requirement, the number of people who already qualify (with IDs as evidence), reskill candidates, and shortfalls with reasons.
5. **Options.** For each requirement and option, see redeploy, reskill, contractor and hire actions with people, FTE, start, duration, cost and an estimate badge.
6. **Money.** See monthly and cumulative cost and benefit, ROI, payback (inside or after the deadline), the yearly net at the run rate, a three-option comparison and a low/base/high table. Assumptions can be edited.
7. **CEO brief.** See the recommendation (hybrid), the aggregate workforce impact, budget by phase, value, risks, assumptions and decisions requiring approval. Narrative is drafted (template or live Claude) and labelled as such. Numbers come from the engine.

## Screens (six, with one demo footer on each)
1. Overview: goal progress, KPIs, AI-share chart, net value by option, attention points, brief.
2. Roadmap: Gantt timeline that previews edits, and the timing editor.
3. Workforce: per step, required vs staffed FTE chart, requirements, eligible counts and evidence IDs.
4. Options: three option cards, FTE mix by step (stacked columns), action list with "Why?".
5. Money: cumulative net by option, monthly cost and benefit, low/base/high range, comparison table.
6. Assumptions: editable mock inputs with low, base and high values.

## Contracts (API)
Defined in `backend/strategy_compiler/contracts.py`. The OpenAPI schema is served by FastAPI at `/openapi.json`.

| Method and path | Purpose | Notes |
|---|---|---|
| `GET /api/health` | Liveness | |
| `GET /api/case` | Company, goal, roadmap | Base steps, before edits |
| `POST /api/plan/compute` | Full plan for the chosen case and options | Body: `PlanRequest`. 422 with `validation` if the roadmap is invalid |
| `POST /api/plan/sensitivity` | Low, base and high rows for each option | |
| `GET /api/skills` | Skill list | |
| `GET /api/evidence/{skill_id}` | Vacancy evidence rows | Optional `country` and `family` filters. 404 for unknown skill, 422 for a family mismatch |
| `GET /api/workforce/summary` | Aggregate headcount and skill counts per team | No IDs |
| `GET /api/workforce/team/{team_id}` | Team roster (ID, role, skills) | No availability |
| `GET /api/assumptions` | All assumptions with low, base and high values | |
| `PUT /api/assumptions` | Validate overrides and return effective base values | Stateless. The client keeps the overrides |
| `POST /api/brief` | CEO brief for one option | Template by default. Live only when opted in |
| `GET /api/usage` | Live LLM call count and tokens | |

## Acceptance criteria
- A user can load the mock goal and roadmap, edit dates, and see requirements, actions, costs and benefits per step and overall, with traceable formulas.
- Every screen carries the demo footer (illustrative, invented assumptions, not KBC data). Per-element tags are not used.
- Core calculations have automated tests: DAG and ramp, supply ledger, planner rules, finance formulas, and option properties.
- No employee-level surplus, ranking or dismissal suggestion appears in any response or brief.
- The demo works offline. The narrative falls back to the template.
- Checks run before any "done" claim: `uv run pytest`, the frontend typecheck, and the frontend build. The results are reported verbatim.
