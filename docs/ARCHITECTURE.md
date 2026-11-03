# Architecture: Strategy Compiler (MOCK hackathon demo)

Status: implemented in thin vertical slices. The KBC example name is illustrative only. The goal, roadmap and workforce are mock, and nothing describes KBC's real strategy, staff or figures. Every figure is a mock estimate.

## 1. Layers and boundaries

```
data/vacancies_2021.parquet (external, git-ignored)
        │  etl/vacancies_etl.py  (DuckDB: dedupe, normalise, map skills)
        ▼
fixtures/vacancy_evidence.json  (aggregated, committed)     skills/mapper.py + fixtures/taxonomy.json
        │                                                          │
fixtures/{company,goal,roadmap,requirements,assumptions.yaml,       │
           workforce.csv}  ── tools/gen_workforce.py (seeded)      │
        │                                                          │
        ▼                                                          ▼
roadmap.py ─► demand.py ─► supply.py (Ledger) ─► planner.py ─► finance.py ─► engine.py ─► api.py ─► frontend
 (DAG, ramp)  (FTE/month,    (capacity per          (events:     (costs,       (assembles     (JSON only)
              skill fit)      person-month)          alloc,       benefits,      PlanResponse)
                                                     train, hire) ROI)
                                                                                      │
                                                                narrative.py ◄────────┘  (explain-only, cached)
```

| Module | Responsibility | Uses LLM? |
|---|---|---|
| `contracts.py` | Pydantic models. The OpenAPI schema and the TS types are generated from these. | No |
| `config.py` | Fixture loading, assumption resolution (low/base/high plus overrides), fixed constants | No |
| `timeline.py` | Month arithmetic (`YYYY-MM`) | No |
| `roadmap.py` | Finish-to-start validation, cycle detection, horizon checks, adoption ramp | No |
| `demand.py` | Requirements per milestone, FTE by month, skill-fit evidence, observed vacancy share | No |
| `supply.py` | `Ledger`: per-employee, per-month programme capacity. Coverage and gap helpers | No |
| `planner.py` | Scenario source order, month-by-month allocation, training and hire events | No |
| `finance.py` | Cost items, monthly benefit, cumulative net, payback | No |
| `engine.py` | Orchestrates one plan; builds actions, shortfalls, monthly points and totals; sensitivity | No |
| `narrative.py` | Brief prose from aggregates only. Cache, usage log, template fallback | **Yes, optional, explain-only** |
| `api.py` | Thin FastAPI layer. No business logic | No |
| `etl/`, `skills/` | Vacancy ETL and rule-based skill mapper (S1) | No |

## 2. Calculation rules

All rules are deterministic and covered by tests in `backend/tests/`.

### 2.1 Timeline and roadmap
- Milestones use the chain `M1 → M2 → M3 → M4`, with finish-to-start dependencies. Each milestone must start after every predecessor ends. The validator also rejects cycles, unknown dependencies, inverted windows and any date outside the 24-month horizon (Jan 2027 to Dec 2028).
- **Adoption ramp.** A milestone's `adoption_share_target` is reached at its last month. It ramps linearly from the previous target across the milestone's months. Example: M3 runs from 0.15 to 0.40 over Jan–Jun 2028.

### 2.2 Demand
- Each requirement takes its milestone's window. FTE is constant across that window.
- Skill fit for a requirement counts employees in **contributing teams** only:
  - `eligible_now`: proficiency ≥ minimum.
  - `reskill_candidates`: a gap of 1 or 2 levels, and at least one same-family skill at level ≥ 2.
  - `coverage = min(1, proficiency / required)` and `gap = max(0, required − proficiency)`.

### 2.3 Supply ledger (no double counting)
- Monthly capacity per employee is `fte × availability`. `availability` is the share free for programme work after business-as-usual load.
- Every booking reduces the ledger. A booking that would exceed the remaining capacity raises an error. Tests verify that no employee is booked beyond capacity in any scenario.
- Training uses the employee's whole programme capacity in each training month.
- Teams flagged `contributing: false` have zero programme capacity. All five demo teams are contributing; the rule stays in code.

### 2.4 Scenario policies (source order per requirement)

| Scenario | Order | Behaviour |
|---|---|---|
| Reskill-led | reskill → redeploy → external → hire | Trains people 1–2 levels short. Training must finish before the requirement starts, and the candidate is skipped if there is not enough lead time. |
| Hire-led | hire → external → redeploy → reskill | Hires from the earliest possible start, then fills the remainder. |
| **Hybrid (recommended)** | redeploy → reskill → external → hire | Uses the existing workforce first and hires only the residual. |

- **Reskill.** Training takes `reskill_training_months` (fixed). These months are scheduled immediately before the requirement starts and must not fall before the programme start.
- **External.** Capped at `CONTRACTOR_MAX_SHARE` (30%, a policy constant) × requirement FTE, per month.
- **Hire.** Start = `max(requirement start, programme start + hire_lead_time_months)`. Headcount = largest residual need across the hire months. Coverage is full from the start month. Ramp-up is included in the one-off hire cost.
- **Unmet FTE** carries one reason: `hire_not_started`, `lead_time_too_short` or `no_eligible_supply`.

### 2.5 Finance (monthly, EUR, all mock)

Twelve assumptions drive the money (`fixtures/assumptions.yaml`). Change costs are one number per step in `fixtures/roadmap.json`.

| Item | Kind | Formula |
|---|---|---|
| Redeploy or reskill: backfill | recurring | `FTE × backfill_share × cost_per_fte_year_eur / 12` |
| Redeploy or reskill: move | one-off | `redeploy_cost_eur` once per person per requirement |
| Reskill: training | one-off | `reskill_cost_eur` in the first training month |
| Reskill: pay rise | recurring | `FTE × reskill_uplift_eur_year / 12` |
| Contractors | recurring | `FTE × contractor_day_rate_eur × 20` |
| Hire: one-off | one-off | `headcount × hire_cost_eur` at the start month |
| Hire: salary | recurring | `headcount × cost_per_fte_year_eur / 12`, from start to requirement end |
| Change budget | one-off | `change_cost_eur` of the step, spread evenly over its months |
| AI platform | recurring | `platform_cost_eur_month`, from the M2 start to the horizon end |

- **Redeployed people are already paid.** Only backfill and the move are new cost. Hires count in full.
- **Benefit (monthly).** `reviews_per_year / 12 × adoption × coverage × cost_per_review × ai_cost_saving_pct`.
  - `coverage = min(1, staffed FTE / required FTE)` in that month.
  - This is the only benefit driver. Freed capacity is reported as an aggregate FTE and is not valued a second time.
- **Totals.** `ROI = (benefit − cost) / cost`. Payback is the first month with cumulative net ≥ 0, counted from the first month that carries any cost. It is `None` if that does not happen before the deadline.
- **Run-rate net per year.** `(benefit − recurring cost in the last month) × 12`. It assumes December 2028 continues for a year. It is a simple summary and not a forecast.
- **Not modelled:** salary bands, loaded-cost factors, discounting (NPV) and any extrapolation past the deadline. These were removed to keep the demo explainable.

### 2.6 Sensitivity
- Each assumption has `low` (conservative), `base` and `high` (optimistic) values in `fixtures/assumptions.yaml`.
- The engine runs all three cases for every scenario. Users can override individual keys with `assumption_overrides`.

## 3. People-impact safeguard (enforced in code and tests)
- Freed capacity is an aggregate monthly FTE, always flagged "HR / legal / employee-representation review required".
- No endpoint or response ranks, names or recommends dismissing any employee.
- Employee IDs appear only as evidence for internal redeploy or reskill matches, capped at 10 per action. Team rosters expose skills and roles, not availability.
- The narrative receives only aggregates. Tests check that no `EMP-` ID appears in the brief facts or the template text.
- Matching uses skills, proficiency and availability only. No personal or sensitive attributes are stored.

## 4. Narrative (explain-only)
- Default: a deterministic template. This is the offline and test path.
- Live: set `STRATEGY_COMPILER_LLM=live` and `ANTHROPIC_API_KEY`. The model is `claude-sonnet-5-5`.
- Cache: keyed by SHA-256 of the model and the facts. Responses cut off at the token cap are never cached.
- Usage: each live call is appended to `backend/.cache/usage.jsonl`. Prices come from `LLM_PRICE_EUR_PER_MTOK_IN` and `LLM_PRICE_EUR_PER_MTOK_OUT`, which are unset by default, so no euro figure is shown until you set them.

## 5. Deviations from the approved plan (and why)

| # | Approved plan | Implemented | Reason |
|---|---|---|---|
| 1 | Overlapping milestone windows, with some finish-to-start dependencies | A strict chain of four consecutive six-month milestones that fit in 24 months | Overlaps conflicted with finish-to-start. Four steps are easier to explain than six |
| 2 | Hire productivity ramp reduces coverage | Ramp is a mentoring cost (`hire_mentoring_days`) and coverage is full from the start | Keeps the ledger simple and makes "hybrid never has more unmet FTE than hire-led" hold by construction. This is a labelled simplification |
| 3 | `workforce.csv` | `workforce.csv`, now the only workforce file. Skills are one JSON cell (`skills_json`). The JSON version was removed | Matches the approved plan. The nested skills field is kept as a JSON cell |
| 4 | About 60 taxonomy skills | 9 skills at 3 levels | Simplicity for the demo. The taxonomy is extendable and the interface is ready for ESCO |
| 5 | Evidence keyed by job family | Keyed by skill, family and country | Family is derived from the taxonomy. A job-family classifier is out of scope |
| 6 | Update `spec.md` | `spec.md` was deleted in the working tree before this work, so it was **not** recreated. The spec is in `docs/PRODUCT_SPEC.md` | Avoids recreating a file you removed. Tell us if you want it back |
| 7 | Narrative live by default | Live is opt-in | Keeps the shared quota safe. A smoke test made one unintended live call, which is logged in `usage.jsonl` |
| 8 | 300 employees, 8 teams, 23 assumptions, salary bands, NPV, 60-month extension | About 60 employees, 5 teams, 12 assumptions, one yearly cost per person, no NPV or extension, one run-rate figure | The team could not explain the earlier model without economics background. Data was simplified; the structure (scenarios, ledger, planner) is unchanged |

## 6. Open items
- The ETL and skill-mapper outputs (S1) are described in §7 once they land.
- No ESCO URIs are populated. They need verification against the kit.
- The web UI is described in `docs/PRODUCT_SPEC.md`.

## 7. Data pipeline (S1)
See `backend/strategy_compiler/etl/vacancies_etl.py` and `backend/strategy_compiler/skills/mapper.py`. Summary statistics are in `backend/strategy_compiler/fixtures/vacancy_evidence_report.json`. Aggregated evidence is in `fixtures/vacancy_evidence.json`. The raw parquet is never committed.
