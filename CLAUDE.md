# Strategy Compiler

## Product goal
Build a decision-support prototype that helps a CEO turn a future business goal into a workforce and financial execution plan: what must happen by when, which skills and people are needed at each step, how current employees could be reskilled or redeployed, what must be hired, and what the plan will cost and return.

## Hackathon demo data — explicitly mocked
**The CEO's strategic goal AND the step-by-step roadmap are mock data for this hackathon.** They are fictional, predefined demo inputs, not a real CEO's statement, not generated from a live company strategy, and not factual information about a real bank. Use one clearly labelled fictional company and one clearly labelled mock CEO goal with a prepared/mock milestone plan. The prototype should demonstrate what the product does *after* receiving that goal and roadmap.

The workforce is also mock/synthetic: fictional employees, teams, roles, current skills, proficiency, availability and training history. Costs, salaries, training durations, productivity assumptions, benefits and revenue impacts must also be mock/configurable assumptions unless actual source data is provided. Clearly label all mock data and estimates in the UI and demo. Do not imply that any mock figures describe KBC or another real company.

For the hackathon, do not spend time building a reliable strategy-generation engine. The goal and roadmap can be stored as seed/fixture data or selected from a small set of prepared scenarios. The architecture may allow future user-entered goals and generated roadmaps, but that is future scope unless the team explicitly chooses to implement it.

## Core user journey
1. **Load the mock goal:** use the predefined fictional CEO objective, including its baseline, target, deadline and constraints. Make it clear in the UI that this is demo/mock data. A goal-entry form is optional; the core demo must work with a prepared goal.
2. **Load the mock roadmap:** use the predefined/mock dated sequence of steps, dependencies and measurable outcomes associated with that goal. The team may let the user edit or select a prepared scenario, but do not claim the roadmap was generated from a real CEO strategy. Treat it as a proposed plan requiring approval.
3. **Define capability demand:** for each milestone, identify affected processes/teams, roles, skills, proficiency levels and required people/FTE by date.
4. **Compare workforce supply:** use mock employee/team records to identify affected groups, skills already available, gaps, surplus capacity and when capacity is needed. Show the evidence behind each match.
5. **Propose workforce actions:** compare reskilling, redeployment, hiring and (where relevant) external support. For each action show people/FTE, skills gained, duration, start date, dependencies and cost. Make clear when a recommendation is an estimate.
6. **Model business and financial impact:** calculate costs and expected benefits for each milestone, then cumulative and total costs, benefits, net value, ROI and payback by the target date. Allow scenario comparison (e.g. mostly reskill, mostly hire, hybrid).
7. **Present the decision:** CEO sees the recommended roadmap, workforce impact, budget by phase, expected business value, key risks, assumptions and decisions requiring approval.

## Required outputs
- Goal summary with baseline, target and deadline.
- Editable milestone roadmap with dates, dependencies, owners/teams and success metrics.
- Per milestone: required roles, skills, proficiency, headcount/FTE and timing.
- Workforce impact view: affected teams/roles and synthetic employee IDs; current skill fit; suggested reskilling or redeployment pathways; remaining gaps and capacity shortfalls.
- Build / hire / redeploy / external-support options, with transparent assumptions.
- Per-milestone and cumulative financial table/chart: one-off and recurring costs, expected benefits, net impact and ROI; total company-level view through the deadline.
- Scenario comparison and an executive-ready recommendation.

## Data, calculations and trust
- Hackathon demo uses **mock CEO goal data, a mock step-by-step roadmap, and synthetic workforce data**. Generate clearly fictional company, employee IDs and records; never imply that mock data represents a real bank, actual CEO decisions or real people. Use the provided finance job-posting sample/open skills sources where available to inform external skill demand; inspect the actual files and schemas before designing ingestion. Clearly distinguish those external source observations from the mock goal, mock roadmap and synthetic internal workforce.
- Keep data access, skill mapping, workforce matching, financial calculations and UI separate. Use deterministic, testable code for calculations; use an LLM for interpreting the goal, drafting/structuring milestones and explaining results—not for arithmetic or final employment decisions.
- Make every estimate explainable: show formula, source, assumption and confidence. Distinguish observed data, inferred skill requirements and user-entered assumptions. Never invent precise costs, salaries, training durations or productivity gains without labeling them as assumptions.
- Model demand and supply in **FTE as well as people**; avoid counting the same employee/skill capacity in multiple milestones at the same time. Account for skill proficiency, training lead time, availability and milestone dependencies.
- Financial model should separate one-time and recurring costs (training, recruitment, salary delta, contractors, technology/change costs) and benefits (time/capacity saved, operating-cost reduction, additional throughput/revenue). Prevent double counting. Support low/base/high assumptions or sensitivity analysis where feasible.
- Use a consistent skill taxonomy where practical (e.g. ESCO); preserve the original skill phrase and show the mapped skill plus confidence. Do not silently force uncertain mappings.

## People-impact safeguard
This is workforce-planning decision support, **not an automated hiring or firing system**. Prioritise reskilling and redeployment. Never tell the CEO to dismiss a named or identifiable employee, rank people for termination, or automate an employment decision. If the plan creates surplus capacity or roles that may no longer be required, show only aggregate FTE scenarios and flag them for qualified human HR, legal and employee-representation review. Do not use sensitive personal attributes in matching. Keep recommendations auditable and explainable.

## Hackathon scope
Optimise for one polished end-to-end demo using a fictional financial-services company, a **predefined mock CEO goal**, and a **predefined mock step-by-step roadmap**. Use synthetic internal people data and the provided external finance/job/skills data. The goal and roadmap are demo fixtures: downstream skills, workforce, cost and benefit analysis should be computed from or attached to these mock steps. No production integrations, live employee data, real hiring/firing actions or broad enterprise platform unless the team explicitly approves them. Prefer a working thin vertical slice over many incomplete features.

## How to work with this repository
- First inspect the existing repository, data files, schemas, README and current stack. Reuse established patterns; do not assume a framework or replace working code.
- **Planning first:** when started in Plan Mode, inspect read-only, then interview the team about unresolved product, data, UX, stack and demo decisions. Ask concise numbered questions (with recommended defaults) and wait for answers. Do not code, install packages or edit files during this phase.
- After answers, produce a proposed end-to-end architecture, data model, key screens, calculation rules, API boundaries, implementation slices and acceptance tests. Call out assumptions and trade-offs. Ask for explicit approval before implementation.
- Once the architecture is approved, update this file with confirmed durable decisions and create `docs/PRODUCT_SPEC.md` or `docs/ARCHITECTURE.md` for detailed specifications. Then implement in small vertical slices, integrating early and testing each slice.
- Do not fabricate existing APIs, dataset columns or repository conventions. Verify them in the repo first. If blocked by missing data, propose a clearly labelled synthetic fixture.
- Keep UI components presentational where practical; keep business logic and financial formulas in tested modules.
- Before calling a feature done, run the relevant tests, typecheck and build commands discovered in the repository. Report the exact commands and results; do not claim checks passed if they were not run.

## Plan Mode interview checklist
After inspecting the repo, ask only questions that cannot be answered from it. Treat these as fixed requirements, not open questions: the CEO goal is mock data; the roadmap/steps are mock data; workforce records are synthetic. Ask which fictional company, mock goal and prepared roadmap the team wants to use only if these are not already supplied in the repo. Also cover: (1) available workforce-data fields and whether synthetic records must be generated; (2) skill taxonomy/source and mapping approach; (3) required granularity of employee/team impact; (4) cost and benefit assumptions/data; (5) preferred scenario options; (6) demo duration, visual style and must-have screens. Bundle related questions, offer sensible defaults, and do not ask again for information already provided.

## Definition of done
A user can load the clearly labelled mock CEO goal and mock milestone roadmap, review/edit the dated steps, see required skills and FTE per milestone, compare those needs with synthetic workforce supply, inspect reskilling/redeployment/hiring options, and view traceable costs, benefits and cumulative ROI per phase and overall. The demo must clearly label the goal, roadmap, workforce records and financial assumptions as mock/synthetic. Core calculations are tested. Supporting unseen, user-entered goals is future scope unless explicitly approved.

## Confirmed decisions (approved 2026-11-03)
Full detail is in `docs/ARCHITECTURE.md` and `docs/PRODUCT_SPEC.md`. These decisions are durable:
- **Case:** fictional "Northwind Bank" (mock). Goal: AI-assisted KYC/AML reviews, 60% AI-assisted by 31 Dec 2028 and cost per review down 35%, with no forced redundancies. The milestone roadmap is a mock, finish-to-start chain of 6 milestones across Jan 2027 to Dec 2028.
- **Stack:** Python 3.12+ (DuckDB, pydantic, FastAPI, pytest) in `backend/`, managed with uv. React, Vite and TypeScript in `frontend/`. Contracts live in `backend/strategy_compiler/contracts.py`.
- **Skills:** a curated, ESCO-aligned taxonomy of about 40 skills with EN/NL/FR aliases (`fixtures/taxonomy.json`). `esco_uri` stays null until verified against the ESCO release. Uncertain matches stay unmapped.
- **Workforce:** 300 synthetic employees in 8 teams, generated by a seeded tool (`backend/tools/gen_workforce.py`). IDs only, no names and no sensitive attributes.
- **Vacancy data:** `data/vacancies_2021.parquet` is external, 2021 only. A DuckDB ETL deduplicates it and writes aggregated evidence. The raw parquet and PDF are git-ignored.
- **Scenarios:** reskill-led, hire-led and hybrid (recommended), with low, base and high sensitivity cases.
- **LLM:** explain-only, with results cached on disk. Live calls are **opt-in** through `STRATEGY_COMPILER_LLM=live` and `ANTHROPIC_API_KEY`. The default is a deterministic template, so tests and demos never spend quota by accident.
- **Safeguard:** freed capacity appears only as an aggregate FTE with an HR/legal/employee-representation review flag. No endpoint ranks or names employees.
- **Slides:** not generated. This is explicitly out of scope until requested.
