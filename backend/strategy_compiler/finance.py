"""Financial model. Deterministic. Costs come from planner events. Benefit comes from adoption x coverage.

The model uses 12 mock assumptions (fixtures/assumptions.yaml) and one change budget per milestone
(fixtures/roadmap.json). Rules are in docs/ARCHITECTURE.md section 2.5.

- Redeploy: the person is already paid. Cost = a one-off move cost plus backfill of their old work.
- Reskill: as redeploy, plus a one-off training cost and a yearly pay rise.
- Contractors: day rate x 20 working days per FTE per month.
- Hire: a one-off hire cost, then the full yearly cost from the start month.
- Benefit per month: reviews per month x AI-assisted share x coverage x cost per review x saving.
  This is the only benefit, so freed capacity is never valued a second time.
- Platform cost starts at the pilot. Change cost is spread evenly over each milestone.

All money is in EUR and every figure is a mock estimate.
"""

from __future__ import annotations

from dataclasses import dataclass

from .config import EPS, PLATFORM_START_MILESTONE, WORKING_DAYS_PER_MONTH
from .contracts import Goal, Milestone, Requirement
from .planner import RawScenario
from .timeline import month_range, parse_month

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


def cost_items(raw: RawScenario, a: dict[str, float]) -> list[CostItem]:
    items: list[CostItem] = []
    onboarded: set[tuple[str, str]] = set()
    yearly_cost = a["cost_per_fte_year_eur"]

    for al in raw.allocations:
        if al.source == "hire":
            continue  # hire cost comes from HireEvent (headcount, not coverage)
        if al.source == "external":
            items.append(CostItem(al.month, al.fte * a["contractor_day_rate_eur"] * WORKING_DAYS_PER_MONTH,
                                  RECURRING, al.requirement_id, "external"))
            continue
        # redeploy or reskill: the person is already paid, so only backfill and the move are new cost
        items.append(CostItem(al.month, al.fte * a["backfill_share"] * yearly_cost / 12,
                              RECURRING, al.requirement_id, al.source))
        if al.source == "reskill":
            items.append(CostItem(al.month, al.fte * a["reskill_uplift_eur_year"] / 12,
                                  RECURRING, al.requirement_id, "reskill"))
        key = (al.employee_id or "", al.requirement_id)
        if key not in onboarded:
            onboarded.add(key)
            items.append(CostItem(al.month, a["redeploy_cost_eur"], ONE_OFF, al.requirement_id, al.source))

    for t in raw.trainings:
        items.append(CostItem(t.months[0], a["reskill_cost_eur"], ONE_OFF, t.requirement_id, "reskill"))

    for h in raw.hires:
        items.append(CostItem(h.start, h.headcount * a["hire_cost_eur"], ONE_OFF, h.requirement_id, "hire"))
        for m in h.months:
            items.append(CostItem(m, h.headcount * yearly_cost / 12, RECURRING, h.requirement_id, "hire"))
    return items


def build_book(
    raw: RawScenario,
    a: dict[str, float],
    goal: Goal,
    milestones: list[Milestone],
    requirements: list[Requirement],
    adoption: dict[str, float],
    horizon: list[str],
) -> Book:
    items = cost_items(raw, a)
    horizon_set = set(horizon)

    for m in milestones:
        months = [mm for mm in month_range(m.start, m.end) if mm in horizon_set]
        if m.change_cost_eur > EPS and months:
            per_month = m.change_cost_eur / len(months)
            items.extend(CostItem(mm, per_month, ONE_OFF, None, None) for mm in months)

    platform = next((m for m in milestones if m.id == PLATFORM_START_MILESTONE), None)
    if platform is not None:
        start = parse_month(platform.start)
        items.extend(
            CostItem(mm, a["platform_cost_eur_month"], RECURRING, None, None)
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
