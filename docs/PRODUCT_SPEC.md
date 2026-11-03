# Product spec: Strategy Compiler (MOCK hackathon demo)

Replaces the empty `spec.md` skeleton, which was removed from the working tree. Source of truth for scope and contracts.

## Goal
Show what happens after a CEO gives a future business goal. The app turns it into a workforce and financial execution plan: which skills and people each milestone needs, how current employees could be reskilled or redeployed, what has to be hired, and what the plan costs and returns.

## Demo case (all MOCK, clearly labelled in the UI)
- **Company:** Northwind Bank, fictional.
- **Goal:** by 31 Dec 2028, at least 60% of KYC/AML reviews and alert triage are AI-assisted, and cost per review falls 35%. Constraints: no forced redundancies, reskilling and redeployment first, and model risk sign-off before scale-up.
- **Baseline (mock):** 240,000 reviews a year at EUR 48 each, with 0% AI-assisted.
- **Roadmap:** six milestones, a proposed plan requiring approval (M1 governance → M6 full rollout). Dates and metrics are in `fixtures/roadmap.json`.
- **Workforce:** 300 synthetic employees across eight teams. IDs only.
- **Vacancy evidence:** 2021 finance and insurance postings, deduplicated, EN/NL/FR. This is an external observation and is labelled as such.

## Not doing
- Free-text goal entry, or generating a roadmap from a real strategy. Future scope.
- Real employee data, real hiring or firing, or any production integration.
- Employee-level surplus, ranking or termination suggestions. Surplus is only ever an aggregate FTE flagged for HR, legal and employee-representation review.
- Claims about KBC or any other real company. Vacancy data is shown as an aggregate and not attributed to employers in the UI.
- Presentation slides. Not generated, as instructed.
- Salary modelling from vacancy text. Salaries are mock bands.

## User journey
1. **Goal.** See the mock goal, its baseline, target, deadline and constraints.
2. **Roadmap.** Review and edit milestone dates. Dependencies, owners and success metrics are shown. Edits recompute the plan. Invalid roadmaps are blocked with the reason.
3. **Demand.** For each milestone, see roles, skills, minimum proficiency, FTE by month, and the vacancy evidence with its mapping confidence.
4. **Supply and gaps.** See contributing-team coverage per requirement, the number of eligible people (with IDs as evidence), reskill candidates, and shortfalls with reasons.
5. **Actions.** For each requirement and scenario, see redeploy, reskill, external and hire actions with people, FTE, skills gained, start, duration, dependencies, cost and an estimate badge.
6. **Finance and scenarios.** See monthly and cumulative cost and benefit, ROI, payback within the deadline, the extrapolated payback, NPV, a three-scenario comparison and a low/base/high sensitivity table. Assumptions can be edited.
7. **CEO brief.** See the recommendation (hybrid), the aggregate workforce impact, budget by phase, value, risks, assumptions and decisions requiring approval. Narrative is drafted (template or live Claude) and labelled as such. Numbers come from the engine.

## Screens (six, all labelled MOCK, SYNTHETIC or EXTERNAL)
1. Goal and roadmap (editable timeline).
2. Demand (requirements by milestone, with evidence drawer).
3. Supply and gaps.
4. Actions.
5. Finance and scenarios.
6. CEO brief.

## Contracts (API)
Defined in `backend/strategy_compiler/contracts.py`. The OpenAPI schema is served by FastAPI at `/openapi.json`.

| Method and path | Purpose | Notes |
|---|---|---|
| `GET /api/health` | Liveness | |
| `GET /api/case` | Company, goal, roadmap | Base milestones, before edits |
| `POST /api/plan/compute` | Full plan for the chosen case and scenarios | Body: `PlanRequest`. 422 with `validation` if the roadmap is invalid |
| `POST /api/plan/sensitivity` | Low, base and high rows for each scenario | |
| `GET /api/skills` | Taxonomy | |
| `GET /api/evidence/{skill_id}` | Vacancy evidence rows | Optional `country` and `family` filters. 404 for unknown skill, 422 for a family mismatch |
| `GET /api/workforce/summary` | Aggregate headcount and skill counts per team | No IDs |
| `GET /api/workforce/team/{team_id}` | Team roster (ID, role, grade, skills) | No availability |
| `GET /api/assumptions` | All assumptions with low, base and high values | |
| `PUT /api/assumptions` | Validate overrides and return effective base values | Stateless. The client keeps the overrides |
| `POST /api/brief` | CEO brief for one scenario | Template by default. Live only when opted in |
| `GET /api/usage` | Live LLM call count and tokens | |

## Acceptance criteria
- A user can load the mock goal and roadmap, edit dates, and see requirements, actions, costs and benefits per milestone and overall, with traceable formulas.
- Every screen and payload is labelled MOCK, SYNTHETIC or EXTERNAL, as appropriate.
- Core calculations have automated tests: DAG and ramp, supply ledger, planner rules, finance formulas, and scenario properties.
- No employee-level surplus, ranking or dismissal suggestion appears in any response or brief.
- The demo works offline. The narrative falls back to the template.
- Checks run before any "done" claim: `uv run pytest`, the frontend typecheck, and the frontend build. The results are reported verbatim.
