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
from .finance import ONE_OFF, Book, CostItem, build_book, extended_cumulative, npv
from .planner import Allocation, RawScenario, run_scenario
from .roadmap import RoadmapError, adoption_by_month, apply_dates, validate_roadmap
from .timeline import month_range, parse_month

SCENARIO_IDS: tuple[ScenarioId, ...] = ("reskill_led", "hire_led", "hybrid")

_RATIONALE = {
    "redeploy": "Already at or above the required proficiency in a contributing team. Base salary is not new cost; only backfill and onboarding are.",
    "reskill": "One or two proficiency levels short, with an adjacent skill. Training finishes before the requirement starts, then backfill and a salary uplift apply.",
    "external": "Capped contractor bridge while hiring lead time runs out. Not a permanent solution.",
    "hire": "Remaining gap after the earlier sources in this scenario, hired from the earliest possible start (programme start plus time to hire).",
}
_FORMULA = {
    "redeploy": "one-off = onboarding per person; recurring = FTE x backfill share x loaded monthly cost",
    "reskill": "one-off = training days x day rate + backfill during training; recurring = FTE x (backfill share + salary uplift) x loaded monthly cost",
    "external": "recurring = FTE x contractor day rate x 20 working days",
    "hire": "one-off = headcount x (recruiter fee x salary + onboarding + mentor days x loaded day cost); recurring = headcount x loaded monthly salary",
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
    emp_by_id = {e.employee_id: e for e in employees}
    contributing = {t.id for t in company.teams if t.contributing}
    families = {s.id: s.family for s in load_taxonomy().skills}
    adoption = adoption_by_month(milestones, horizon)
    evidence = load_vacancy_evidence()

    scenario_ids = req.scenarios or list(SCENARIO_IDS)
    scenarios: dict[ScenarioId, ScenarioResult] = {}
    for sid in scenario_ids:
        raw = run_scenario(sid, requirements, employees, contributing, families, a, horizon)
        scenarios[sid] = _scenario_result(sid, raw, requirements, milestones, emp_by_id, a, goal, adoption, horizon)

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
    requirements: list[Requirement],
    milestones: list[Milestone],
    emp_by_id: dict,
    a: dict[str, float],
    goal: Goal,
    adoption: dict[str, float],
    horizon: list[str],
) -> ScenarioResult:
    book = build_book(raw, emp_by_id, a, goal, milestones, requirements, adoption, horizon)
    meta = SCENARIO_META[sid]
    return ScenarioResult(
        scenario=sid,
        label=meta["label"],
        description=meta["description"],
        actions=_actions(sid, raw, requirements, milestones, book.items, a),
        monthly=_monthly(book),
        shortfalls=_shortfalls(raw, requirements),
        totals=_totals(book, a, goal, milestones, raw),
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
            )
        )
    return points


def _totals(book: Book, a: dict[str, float], goal: Goal, milestones: list[Milestone], raw: RawScenario) -> Totals:
    cost_one = sum(book.one_off)
    cost_rec = sum(book.recurring)
    cost_total = cost_one + cost_rec
    benefit = sum(book.benefit)
    net = benefit - cost_total

    first_cost = next((i for i, (o, r) in enumerate(zip(book.one_off, book.recurring, strict=True)) if o + r > EPS), None)
    payback = _payback(book.months, book.net, first_cost)

    ext_months, ext_cum = extended_cumulative(book, a, goal, milestones)
    ext_net = [ext_cum[0]] + [ext_cum[i] - ext_cum[i - 1] for i in range(1, len(ext_cum))]
    ext_payback = _payback(ext_months, ext_net, first_cost)

    return Totals(
        cost_one_off_eur=cost_one,
        cost_recurring_eur=cost_rec,
        cost_total_eur=cost_total,
        benefit_eur=benefit,
        net_eur=net,
        roi=(net / cost_total) if cost_total > EPS else None,
        payback_month=payback,
        npv_eur=npv(book.net, a["discount_rate_annual"]),
        unmet_fte_months=sum(u.unmet_fte for u in raw.unmet),
        freed_capacity_fte_peak=max(book.freed_fte) if book.freed_fte else 0.0,
        extended_payback_month=ext_payback,
        extended_payback_note=(
            "Extrapolated beyond the deadline: holds the final adoption and 100% coverage, keeps platform run cost, "
            "adds no further programme cost. Not a forecast."
        ),
    )


def _payback(months: list[str], net: list[float], first_cost: int | None) -> str | None:
    """First month where cumulative net is >= 0, counting only from the first month that has any cost."""
    if first_cost is None:
        return None
    cumulative = 0.0
    for i, month in enumerate(months):
        cumulative += net[i]
        if i >= first_cost and cumulative >= 0:
            return month
    return None


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
                        "contractor_day_rate_eur": a["contractor_day_rate_eur"],
                        "training_day_rate_eur": a["training_day_rate_eur"],
                        "recruiter_fee_pct": a["recruiter_fee_pct"],
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
