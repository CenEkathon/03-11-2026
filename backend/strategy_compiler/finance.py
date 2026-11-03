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

import math
from collections.abc import Hashable, Mapping

from .config import EPS, PAYBACK_MAX_MONTHS_AFTER_DEADLINE, PLATFORM_START_MILESTONE, WORKING_DAYS_PER_MONTH
from .contracts import Goal, Milestone, Requirement
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
    horizon_len: int = 0  # months up to and including the deadline; later months are run-rate extension

    @property
    def net(self) -> list[float]:
        return [b - o - r for b, o, r in zip(self.benefit, self.one_off, self.recurring, strict=True)]

    @property
    def run_rate_net(self) -> float:
        """Benefit minus recurring cost in the deadline month. Continued unchanged after the deadline."""
        last = self.horizon_len - 1
        return self.benefit[last] - self.recurring[last]


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
        benefit=[], one_off=[], recurring=[], freed_fte=[], items=items, horizon_len=len(horizon),
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


# ---------------------------------------------------------------- payback, including after the deadline
def first_cost_index(book: Book) -> int | None:
    """Index of the first month that carries any cost. Payback is only counted from here."""
    return next((i for i, (o, r) in enumerate(zip(book.one_off, book.recurring, strict=True)) if o + r > EPS), None)


def payback_index(net: list[float], first_cost: int | None) -> int | None:
    """First index where cumulative net is >= 0, counting only from the first month with any cost."""
    if first_cost is None:
        return None
    cumulative = 0.0
    for i, value in enumerate(net):
        cumulative += value
        if i >= first_cost and cumulative >= 0:
            return i
    return None


def months_after_deadline_to_payback(book: Book, cap: int = PAYBACK_MAX_MONTHS_AFTER_DEADLINE) -> int | None:
    """Months after the deadline needed to reach payback at the run rate, or None.

    0 means payback is already inside the deadline. Solves cumulative + k x run_rate >= 0 for the smallest whole k.
    One-off costs stop at the deadline, so only the run rate moves cumulative net after it.
    """
    first = first_cost_index(book)
    if first is None:
        return None
    if payback_index(book.net, first) is not None:
        return 0
    cumulative_at_deadline = sum(book.net[: book.horizon_len])
    rate = book.run_rate_net
    if rate <= EPS:
        return None  # the run rate never closes the gap
    k = max(1, math.ceil(-cumulative_at_deadline / rate - EPS))
    return k if k <= cap else None


def extend_past_deadline(book: Book, extra_months: int) -> Book:
    """Return a copy with extra_months of run-rate months after the deadline. The original is not changed.

    After the deadline: no staffing (required and staffed FTE are 0), adoption and coverage hold at their
    deadline values, benefit and recurring cost repeat the deadline month, and one-off costs are zero.
    """
    if extra_months < 0:
        raise ValueError("extra_months must be >= 0")
    h = book.horizon_len
    last = h - 1
    last_month = book.months[last]
    new_months = [format_month(parse_month(last_month) + k) for k in range(1, extra_months + 1)]
    n = extra_months
    return Book(
        months=book.months[:h] + new_months,
        adoption=book.adoption[:h] + [book.adoption[last]] * n,
        required=book.required[:h] + [0.0] * n,
        staffed=book.staffed[:h] + [0.0] * n,
        coverage=book.coverage[:h] + [book.coverage[last]] * n,
        benefit=book.benefit[:h] + [book.benefit[last]] * n,
        one_off=book.one_off[:h] + [0.0] * n,
        recurring=book.recurring[:h] + [book.recurring[last]] * n,
        freed_fte=book.freed_fte[:h] + [book.freed_fte[last]] * n,
        items=book.items,
        horizon_len=h,
    )


def extend_for_payback(books: Mapping[Hashable, Book]) -> dict[Hashable, Book]:
    """Extend every book by the same number of months, so all scenarios share one series length.

    The length is the latest payback among the scenarios that reach payback (within the cap). Scenarios
    that do not reach payback are extended over the same months, so their decline or flat line stays visible.
    Books that already pay back inside the deadline are extended too, so cumulative charts line up by index.
    """
    needed = [months_after_deadline_to_payback(b) for b in books.values()]
    reachable = [k for k in needed if k is not None]
    extra = max(reachable, default=0)
    return {key: extend_past_deadline(b, extra) for key, b in books.items()}
