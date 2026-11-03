"""Financial model. Deterministic. Costs come from planner events. Benefits come from adoption x coverage.

Rules (see docs/ARCHITECTURE.md):
- Redeployed people: their base salary is not new cost. Only backfill of their business-as-usual work is.
- Reskilled people: training (days x day rate) plus backfill during training months (one-off),
  then backfill and a salary uplift (recurring).
- Contractors: FTE x day rate x working days (recurring).
- Hires: recruitment fee and onboarding plus mentor time (one-off), full salary from start (recurring).
- Benefit per month: reviews x adoption x coverage x cost per review x saving %. This is the only
  benefit driver, so freed capacity is not valued a second time.
- Platform run cost starts at the pilot milestone. Technology and change cost is spread over its milestone.
- Programme costs stop at the deadline. The extended view is an extrapolation with labelled assumptions.

All money is in EUR, and all figures are estimates from mock assumptions.
"""

from __future__ import annotations

from dataclasses import dataclass

from .config import EPS, EXTENDED_VIEW_MONTHS, HIRE_SALARY_BAND, PLATFORM_START_MILESTONE, SALARY_BANDS_EUR, WORKING_DAYS_PER_MONTH
from .contracts import Employee, Goal, Milestone, Requirement
from .planner import RawScenario
from .timeline import format_month, month_range, parse_month

ONE_OFF = "one_off"
RECURRING = "recurring"


@dataclass
class CostItem:
    month: str
    amount: float
    kind: str  # one_off | recurring
    requirement_id: str | None  # None for programme-level costs
    action: str | None  # redeploy | reskill | external | hire | None


@dataclass
class Book:
    months: list[str]
    adoption: list[float]
    required: list[float]
    staffed: list[float]
    coverage: list[float]
    benefit: list[float]
    one_off: list[float]
    recurring: list[float]
    freed_fte: list[float]
    items: list[CostItem]

    @property
    def net(self) -> list[float]:
        return [b - o - r for b, o, r in zip(self.benefit, self.one_off, self.recurring, strict=True)]


def _loaded_month(band: str, a: dict[str, float]) -> float:
    return SALARY_BANDS_EUR[band] * a["salary_multiplier"] * a["loaded_cost_factor"] / 12


def cost_items(raw: RawScenario, employees: dict[str, Employee], a: dict[str, float]) -> list[CostItem]:
    items: list[CostItem] = []
    onboarded: set[tuple[str, str]] = set()

    for al in raw.allocations:
        if al.source == "hire":
            continue  # hire cost comes from HireEvent (headcount, not coverage)
        if al.source == "external":
            items.append(CostItem(al.month, al.fte * a["contractor_day_rate_eur"] * WORKING_DAYS_PER_MONTH,
                                  RECURRING, al.requirement_id, "external"))
            continue
        assert al.employee_id is not None and al.band is not None
        monthly = _loaded_month(al.band, a)
        items.append(CostItem(al.month, al.fte * a["backfill_share"] * monthly, RECURRING, al.requirement_id, al.source))
        if al.source == "reskill":
            items.append(CostItem(al.month, al.fte * a["reskill_salary_uplift_pct"] * monthly, RECURRING,
                                  al.requirement_id, "reskill"))
        key = (al.employee_id, al.requirement_id)
        if key not in onboarded:
            onboarded.add(key)
            items.append(CostItem(al.month, a["redeploy_onboarding_eur"], ONE_OFF, al.requirement_id, al.source))

    for t in raw.trainings:
        band = employees[t.employee_id].cost_band
        items.append(CostItem(t.months[0], t.training_days * a["training_day_rate_eur"], ONE_OFF,
                              t.requirement_id, "reskill"))
        for tm in t.months:
            items.append(CostItem(tm, a["backfill_share"] * _loaded_month(band, a), ONE_OFF, t.requirement_id, "reskill"))

    hire_monthly = _loaded_month(HIRE_SALARY_BAND, a)
    hire_salary = SALARY_BANDS_EUR[HIRE_SALARY_BAND] * a["salary_multiplier"]
    for h in raw.hires:
        items.append(CostItem(h.start, h.headcount * a["recruiter_fee_pct"] * hire_salary, ONE_OFF, h.requirement_id, "hire"))
        items.append(CostItem(h.start, h.headcount * a["hire_onboarding_eur"], ONE_OFF, h.requirement_id, "hire"))
        items.append(CostItem(h.start, h.headcount * a["hire_mentoring_days"] * hire_monthly / WORKING_DAYS_PER_MONTH,
                              ONE_OFF, h.requirement_id, "hire"))
        for m in h.months:
            items.append(CostItem(m, h.headcount * hire_monthly, RECURRING, h.requirement_id, "hire"))
    return items


def build_book(
    raw: RawScenario,
    employees: dict[str, Employee],
    a: dict[str, float],
    goal: Goal,
    milestones: list[Milestone],
    requirements: list[Requirement],
    adoption: dict[str, float],
    horizon: list[str],
) -> Book:
    items = cost_items(raw, employees, a)
    horizon_set = set(horizon)

    for m in milestones:
        months = [mm for mm in month_range(m.start, m.end) if mm in horizon_set]
        amount = a.get(f"tech_change_one_off_{m.id}", 0.0)
        if amount > EPS and months:
            per_month = amount / len(months)
            items.extend(CostItem(mm, per_month, ONE_OFF, None, None) for mm in months)

    platform = next((m for m in milestones if m.id == PLATFORM_START_MILESTONE), None)
    if platform is not None:
        start = parse_month(platform.start)
        items.extend(
            CostItem(mm, a["platform_run_eur_month"], RECURRING, None, None)
            for mm in horizon
            if parse_month(mm) >= start
        )

    required = {m: 0.0 for m in horizon}
    for r in requirements:
        for mm in month_range(r.start, r.end):
            if mm in required:
                required[mm] += r.fte
    staffed = {m: 0.0 for m in horizon}
    for month_map in raw.covered.values():
        for mm, value in month_map.items():
            if mm in staffed:
                staffed[mm] += value

    reviews_pm = goal.baseline.reviews_per_year / 12
    cost_per_review = goal.baseline.cost_per_review_eur
    saving = a["ai_cost_saving_pct"]
    baseline_fte = goal.baseline.reviews_per_year / a["reviews_per_fte_year"]

    book = Book(
        months=list(horizon), adoption=[], required=[], staffed=[], coverage=[],
        benefit=[], one_off=[], recurring=[], freed_fte=[], items=items,
    )
    one_off = {m: 0.0 for m in horizon}
    recurring = {m: 0.0 for m in horizon}
    for it in items:
        if it.month not in one_off:
            continue
        if it.kind == ONE_OFF:
            one_off[it.month] += it.amount
        else:
            recurring[it.month] += it.amount

    for m in horizon:
        req = required[m]
        st = staffed[m]
        cov = min(1.0, st / req) if req > EPS else 1.0
        ad = adoption[m]
        book.adoption.append(ad)
        book.required.append(req)
        book.staffed.append(st)
        book.coverage.append(cov)
        book.benefit.append(reviews_pm * ad * cov * cost_per_review * saving)
        book.freed_fte.append(baseline_fte * ad * cov * saving)
        book.one_off.append(one_off[m])
        book.recurring.append(recurring[m])
    return book


def extended_cumulative(
    book: Book,
    a: dict[str, float],
    goal: Goal,
    milestones: list[Milestone],
) -> tuple[list[str], list[float]]:
    """Cumulative net over EXTENDED_VIEW_MONTHS. Beyond the deadline the model holds the final
    adoption and coverage, keeps platform run cost, and adds no further programme cost. It is an extrapolation."""
    months = month_range(book.months[0], format_month(parse_month(book.months[0]) + EXTENDED_VIEW_MONTHS - 1))
    reviews_pm = goal.baseline.reviews_per_year / 12
    cpr = goal.baseline.cost_per_review_eur
    saving = a["ai_cost_saving_pct"]
    platform = next((m for m in milestones if m.id == PLATFORM_START_MILESTONE), None)
    platform_idx = parse_month(platform.start) if platform else None
    cumulative: list[float] = []
    running = 0.0
    for i, mm in enumerate(months):
        if i < len(book.months):
            running += book.net[i]
        else:
            last_adoption = book.adoption[-1]
            benefit = reviews_pm * last_adoption * 1.0 * cpr * saving
            cost = a["platform_run_eur_month"] if platform_idx is not None and parse_month(mm) >= platform_idx else 0.0
            running += benefit - cost
        cumulative.append(running)
    return months, cumulative


def npv(net: list[float], annual_rate: float) -> float:
    return sum(v / (1 + annual_rate) ** ((i + 1) / 12) for i, v in enumerate(net))
