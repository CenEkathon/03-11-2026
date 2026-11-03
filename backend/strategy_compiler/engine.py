"""Engine: fixtures + request -> validated roadmap, demand, supply fit, three scenarios, sensitivity.

Pure and deterministic. No LLM is used here. Narrative lives in narrative.py and only reads the output.
"""

from __future__ import annotations

import math
from collections import defaultdict

from .config import (
    EPS,
    LABELS,
    SCENARIO_META,
    load_company,
    load_employees,
    load_goal,
    load_milestones,
    load_requirement_specs,
    load_taxonomy,
    load_vacancy_evidence,
    resolve_assumptions,
)
from .contracts import (
    ActionLine,
    Explanation,
    Goal,
    Milestone,
    MonthlyPoint,
    PlanRequest,
    PlanResponse,
    Requirement,
    ScenarioId,
    ScenarioResult,
    SensitivityRow,
    Shortfall,
    Totals,
)
from .demand import expand_requirements, skill_fit
from .finance import (
    ONE_OFF,
    Book,
    CostItem,
    build_book,
    extend_for_payback,
    first_cost_index,
    payback_index,
)
from .planner import Allocation, RawScenario, run_scenario
from .roadmap import RoadmapError, adoption_by_month, apply_dates, validate_roadmap
from .timeline import format_month, month_range, parse_month

SCENARIO_IDS: tuple[ScenarioId, ...] = ("reskill_led", "hire_led", "hybrid")

_RATIONALE = {
    "redeploy": "Already at the required level. They are paid already, so the new cost is a move cost plus backfill of their old work.",
    "reskill": "One or two levels short, with a related skill. Training finishes before the requirement starts, then backfill and a pay rise apply.",
    "external": "Contractors bridge up to 30% of a need while lead time runs out. Not a permanent solution.",
    "hire": "Remaining gap after the earlier sources in this scenario, hired from the earliest possible start (programme start plus hire lead time).",
}
_FORMULA = {
    "redeploy": "one-off = move cost per person; recurring = FTE x backfill share x yearly cost / 12",
    "reskill": "one-off = training cost per person + move cost; recurring = FTE x (backfill share x yearly cost / 12 + yearly pay rise / 12)",
    "external": "recurring = FTE x contractor day rate x 20 working days",
    "hire": "one-off = headcount x hire cost; recurring = headcount x yearly cost / 12, from start to requirement end",
}


def compute_plan(req: PlanRequest) -> PlanResponse:
    goal = load_goal()
    company = load_company()
    milestones = apply_dates(load_milestones(), req.milestone_dates)
    validation = validate_roadmap(milestones, goal.horizon_start, goal.horizon_end)
    if not validation.ok:
        raise RoadmapError(validation)

    a = resolve_assumptions(req.case, req.assumption_overrides)
    horizon = month_range(goal.horizon_start, goal.horizon_end)
    requirements = expand_requirements(load_requirement_specs(), milestones)
    employees = list(load_employees())
    contributing = {t.id for t in company.teams if t.contributing}
    families = {s.id: s.family for s in load_taxonomy().skills}
    adoption = adoption_by_month(milestones, horizon)
    evidence = load_vacancy_evidence()

    scenario_ids = req.scenarios or list(SCENARIO_IDS)
    raws: dict[ScenarioId, RawScenario] = {}
    books: dict[ScenarioId, Book] = {}
    for sid in scenario_ids:
        raws[sid] = run_scenario(sid, requirements, employees, contributing, families, a, horizon)
        books[sid] = build_book(raws[sid], a, goal, milestones, requirements, adoption, horizon)
    # Payback may fall after the deadline. The run rate continues until it is reached (see finance.py).
    books = extend_for_payback(books)
    scenarios: dict[ScenarioId, ScenarioResult] = {
        sid: _scenario_result(sid, raws[sid], books[sid], requirements, milestones, a)
        for sid in scenario_ids
    }

    fits = [skill_fit(r, employees, contributing, families, evidence) for r in requirements]
    return PlanResponse(
        case=req.case,
        goal=goal,
        milestones=milestones,
        requirements=requirements,
        validation=validation,
        skill_fit=fits,
        scenarios=scenarios,
        labels=LABELS,
    )


def run_sensitivity(req: PlanRequest) -> list[SensitivityRow]:
    rows: list[SensitivityRow] = []
    for case in ("low", "base", "high"):
        plan = compute_plan(req.model_copy(update={"case": case}))
        for sid, result in plan.scenarios.items():
            t = result.totals
            rows.append(
                SensitivityRow(
                    scenario=sid,
                    case=case,  # type: ignore[arg-type]
                    net_eur=t.net_eur,
                    roi=t.roi,
                    cost_total_eur=t.cost_total_eur,
                    benefit_eur=t.benefit_eur,
                    unmet_fte_months=t.unmet_fte_months,
                )
            )
    return rows


# ---------------------------------------------------------------- result assembly
def _scenario_result(
    sid: ScenarioId,
    raw: RawScenario,
    book: Book,
    requirements: list[Requirement],
    milestones: list[Milestone],
    a: dict[str, float],
) -> ScenarioResult:
    meta = SCENARIO_META[sid]
    return ScenarioResult(
        scenario=sid,
        label=meta["label"],
        description=meta["description"],
        actions=_actions(sid, raw, requirements, milestones, book.items, a),
        monthly=_monthly(book),
        shortfalls=_shortfalls(raw, requirements),
        totals=_totals(book, raw),
    )


def _monthly(book: Book) -> list[MonthlyPoint]:
    points: list[MonthlyPoint] = []
    cumulative = 0.0
    for i, month in enumerate(book.months):
        cumulative += book.net[i]
        points.append(
            MonthlyPoint(
                month=month,
                required_fte=book.required[i],
                staffed_fte=book.staffed[i],
                coverage=book.coverage[i],
                adoption_share=book.adoption[i],
                benefit_eur=book.benefit[i],
                cost_one_off_eur=book.one_off[i],
                cost_recurring_eur=book.recurring[i],
                net_eur=book.net[i],
                cumulative_net_eur=cumulative,
                freed_capacity_fte_aggregate=book.freed_fte[i],
                after_deadline=i >= book.horizon_len,
            )
        )
    return points


def _totals(book: Book, raw: RawScenario) -> Totals:
    """Deadline totals sum only the horizon months. Payback may lie after the deadline."""
    h = book.horizon_len
    cost_one = sum(book.one_off[:h])
    cost_rec = sum(book.recurring[:h])
    cost_total = cost_one + cost_rec
    benefit = sum(book.benefit[:h])
    net = benefit - cost_total

    idx = payback_index(book.net, first_cost_index(book))
    payback_month = format_month(parse_month(book.months[0]) + idx) if idx is not None else None
    after = max(0, idx - (h - 1)) if idx is not None else None

    return Totals(
        cost_one_off_eur=cost_one,
        cost_recurring_eur=cost_rec,
        cost_total_eur=cost_total,
        benefit_eur=benefit,
        net_eur=net,
        roi=(net / cost_total) if cost_total > EPS else None,
        payback_month=payback_month,
        payback_within_deadline=idx is not None and idx < h,
        payback_months_after_deadline=after,
        run_rate_net_eur_year=book.run_rate_net * 12 if h else 0.0,
        unmet_fte_months=sum(u.unmet_fte for u in raw.unmet),
        freed_capacity_fte_peak=max(book.freed_fte[:h]) if h else 0.0,
    )


def _actions(
    sid: ScenarioId,
    raw: RawScenario,
    requirements: list[Requirement],
    milestones: list[Milestone],
    items: list[CostItem],
    a: dict[str, float],
) -> list[ActionLine]:
    req_by_id = {r.id: r for r in requirements}
    ms_by_id = {m.id: m for m in milestones}

    cost_by_key: dict[tuple[str, str], list[float]] = defaultdict(lambda: [0.0, 0.0])
    for it in items:
        if it.requirement_id is None or it.action is None:
            continue
        slot = cost_by_key[(it.requirement_id, it.action)]
        slot[0 if it.kind == ONE_OFF else 1] += it.amount

    groups: dict[tuple[str, str], list[Allocation]] = defaultdict(list)
    for al in raw.allocations:
        groups[(al.requirement_id, al.source)].append(al)
    hires = {h.requirement_id: h for h in raw.hires}
    trainings: dict[str, list] = defaultdict(list)
    for t in raw.trainings:
        trainings[t.requirement_id].append(t)

    actions: list[ActionLine] = []
    for (rid, source), allocs in sorted(groups.items(), key=lambda kv: (parse_month(req_by_id[kv[0][0]].start), kv[0])):
        r = req_by_id[rid]
        window = month_range(r.start, r.end)
        monthly_fte: dict[str, float] = defaultdict(float)
        for al in allocs:
            monthly_fte[al.month] += al.fte
        fte_avg = sum(monthly_fte.values()) / len(window)
        months_used = sorted(monthly_fte)
        duration = len(months_used)
        start = months_used[0]
        employee_ids: list[str] = []
        people = 0
        skills_gained: list[str] = []

        if source == "hire":
            h = hires[rid]
            start = h.start
            people = math.ceil(h.headcount - EPS)
            duration = len(h.months)
        elif source == "external":
            people = math.ceil(max(monthly_fte.values()) - EPS)
        else:
            ids = sorted({al.employee_id for al in allocs if al.employee_id})
            people = len(ids)
            employee_ids = ids[:10]
            if source == "reskill":
                skills_gained = [r.skill_id]
                train = trainings.get(rid, [])
                if train:
                    start = min(t.months[0] for t in train)
                    duration = len(window) + max(len(t.months) for t in train)

        one_off, recurring = cost_by_key.get((rid, source), [0.0, 0.0])
        if fte_avg <= EPS and one_off + recurring <= EPS:
            continue
        actions.append(
            ActionLine(
                id=f"{sid}-{rid}-{source}",
                scenario=sid,
                type=source,  # type: ignore[arg-type]
                requirement_id=rid,
                milestone_id=r.milestone_id,
                skill_id=r.skill_id,
                fte=round(fte_avg, 4),
                people_count=people,
                employee_ids=employee_ids,
                skills_gained=skills_gained,
                start=start,
                duration_months=duration,
                depends_on=list(ms_by_id[r.milestone_id].depends_on),
                one_off_cost_eur=round(one_off, 2),
                recurring_cost_eur=round(recurring, 2),
                rationale=_RATIONALE[source],
                explanation=Explanation(
                    formula=_FORMULA[source],
                    inputs={
                        "fte_avg": round(fte_avg, 4),
                        "people": float(people),
                        "backfill_share": a["backfill_share"],
                        "cost_per_fte_year_eur": a["cost_per_fte_year_eur"],
                        "redeploy_cost_eur": a["redeploy_cost_eur"],
                        "reskill_cost_eur": a["reskill_cost_eur"],
                        "hire_cost_eur": a["hire_cost_eur"],
                        "contractor_day_rate_eur": a["contractor_day_rate_eur"],
                    },
                    source="mock_assumption",
                    confidence="low",
                ),
            )
        )
    return actions


def _shortfalls(raw: RawScenario, requirements: list[Requirement]) -> list[Shortfall]:
    grouped: dict[tuple[str, str], list] = defaultdict(list)
    for u in raw.unmet:
        grouped[(u.requirement_id, u.reason)].append(u)
    out: list[Shortfall] = []
    skill_by_id = {r.id: r.skill_id for r in requirements}
    for (rid, reason), rows in sorted(grouped.items()):
        out.append(
            Shortfall(
                requirement_id=rid,
                milestone_id=rows[0].milestone_id,
                skill_id=skill_by_id[rid],
                months=sorted(u.month for u in rows),
                unmet_fte_months=round(sum(u.unmet_fte for u in rows), 4),
                reason=reason,  # type: ignore[arg-type]
            )
        )
    return out
