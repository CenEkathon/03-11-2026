import pytest

from strategy_compiler.config import load_goal, load_milestones, resolve_assumptions
from strategy_compiler.contracts import Requirement
from strategy_compiler.config import PAYBACK_MAX_MONTHS_AFTER_DEADLINE
from strategy_compiler.finance import (
    ONE_OFF,
    RECURRING,
    Book,
    build_book,
    cost_items,
    extend_for_payback,
    extend_past_deadline,
    first_cost_index,
    months_after_deadline_to_payback,
    payback_index,
)
from strategy_compiler.planner import Allocation, HireEvent, RawScenario, TrainingEvent
from strategy_compiler.timeline import format_month, month_range, parse_month

A = resolve_assumptions("base")
YEARLY = A["cost_per_fte_year_eur"]  # 80,000 in the base case


def _sum(items, kind):
    return sum(i.amount for i in items if i.kind == kind)


def test_redeployed_person_costs_move_and_backfill_not_salary():
    raw = RawScenario(scenario="hybrid")
    raw.allocations.append(Allocation("hybrid", "R01", "2027-01", "redeploy", "EMP-X", 1.0))
    items = cost_items(raw, A)
    # backfill of half the yearly cost, every month. Base salary is already paid, so it is not new cost.
    assert _sum(items, RECURRING) == pytest.approx(A["backfill_share"] * YEARLY / 12)
    assert _sum(items, ONE_OFF) == pytest.approx(A["redeploy_cost_eur"])


def test_moving_the_same_person_twice_for_one_requirement_costs_the_move_once():
    raw = RawScenario(scenario="hybrid")
    raw.allocations.append(Allocation("hybrid", "R01", "2027-01", "redeploy", "EMP-X", 0.5))
    raw.allocations.append(Allocation("hybrid", "R01", "2027-02", "redeploy", "EMP-X", 0.5))
    items = cost_items(raw, A)
    assert _sum(items, ONE_OFF) == pytest.approx(A["redeploy_cost_eur"])


def test_hire_costs_follow_headcount_formulas():
    raw = RawScenario(scenario="hire_led")
    raw.hires.append(HireEvent("hire_led", "R04", "machine_learning", "2027-07", ["2027-07", "2027-08"], 2.0))
    items = cost_items(raw, A)
    assert _sum(items, ONE_OFF) == pytest.approx(2 * A["hire_cost_eur"])
    assert _sum(items, RECURRING) == pytest.approx(2 * YEARLY / 12 * 2)


def test_reskill_costs_training_and_move_once_then_backfill_and_pay_rise_monthly():
    raw = RawScenario(scenario="reskill_led")
    raw.allocations.append(Allocation("reskill_led", "R04", "2027-05", "reskill", "EMP-X", 1.0))
    raw.trainings.append(TrainingEvent("reskill_led", "R04", "EMP-X", "machine_learning", ["2027-03", "2027-04"]))
    items = cost_items(raw, A)
    assert _sum(items, ONE_OFF) == pytest.approx(A["reskill_cost_eur"] + A["redeploy_cost_eur"])
    expected_monthly = A["backfill_share"] * YEARLY / 12 + A["reskill_uplift_eur_year"] / 12
    assert _sum(items, RECURRING) == pytest.approx(expected_monthly)


def test_contractors_cost_day_rate_times_twenty_working_days():
    raw = RawScenario(scenario="hybrid")
    raw.allocations.append(Allocation("hybrid", "R07", "2028-01", "external", None, 0.5))
    items = cost_items(raw, A)
    assert _sum(items, RECURRING) == pytest.approx(0.5 * A["contractor_day_rate_eur"] * 20)
    assert _sum(items, ONE_OFF) == 0


def test_benefit_formula_at_full_coverage_and_sixty_percent_adoption():
    goal = load_goal()
    horizon = month_range(goal.horizon_start, goal.horizon_end)
    adoption = {m: 0.6 for m in horizon}
    req = Requirement(
        id="RX", milestone_id="M1", role="r", skill_id="kyc", min_proficiency=3, fte=1.0,
        start=horizon[0], end=horizon[0], rationale="t",
    )
    raw = RawScenario(scenario="hybrid", covered={"RX": {horizon[0]: 1.0}})
    book = build_book(raw, A, goal, load_milestones(), [req], adoption, horizon)
    # 240000/12 reviews x 0.6 adoption x coverage 1 x EUR 48 x 35% saving = EUR 201,600 per month
    assert book.benefit[0] == pytest.approx(201_600.0)


def test_milestone_change_cost_is_spread_over_its_months():
    goal = load_goal()
    horizon = month_range(goal.horizon_start, goal.horizon_end)
    milestones = load_milestones()
    book = build_book(RawScenario(scenario="hybrid"), A, goal, milestones, [], {m: 0.0 for m in horizon}, horizon)
    m1 = milestones[0]
    months = month_range(m1.start, m1.end)
    assert sum(book.one_off[horizon.index(mm)] for mm in months) == pytest.approx(m1.change_cost_eur)


def test_platform_cost_starts_at_the_pilot_milestone():
    goal = load_goal()
    horizon = month_range(goal.horizon_start, goal.horizon_end)
    milestones = load_milestones()
    book = build_book(RawScenario(scenario="hybrid"), A, goal, milestones, [], {m: 0.0 for m in horizon}, horizon)
    assert book.recurring[horizon.index("2027-06")] == 0.0  # M1 has no platform cost
    assert book.recurring[horizon.index("2027-07")] == pytest.approx(A["platform_cost_eur_month"])


def test_payback_and_roi_edge_cases():
    assert payback_index([-100, 50, 60], first_cost=0) == 2  # cumulative -100, -50, +10
    assert payback_index([-100, -50, -60], first_cost=0) is None
    assert payback_index([0, 0, 0], first_cost=None) is None  # no cost, so no payback claim


def _mini_book(one_off, benefit, recurring, start="2027-01"):
    """Hand-built book for finance rules. Staffing and FTE arrays are zero, so only money matters here."""
    n = len(one_off)
    months = [format_month(parse_month(start) + i) for i in range(n)]
    zeros = [0.0] * n
    return Book(
        months=months, adoption=zeros, required=zeros, staffed=zeros, coverage=zeros, benefit=list(benefit),
        one_off=list(one_off), recurring=list(recurring), freed_fte=zeros, items=[], horizon_len=n,
    )


def _deadline_book():
    # 24 deadline months. Cost 1,000 up front, benefit 10 a month, no recurring cost.
    # Cumulative at the deadline is -1,000 + 24 x 10 = -760. The run rate is +10 a month, so payback needs 76 more months.
    return _mini_book(one_off=[1000.0] + [0.0] * 23, benefit=[10.0] * 24, recurring=[0.0] * 24)


def test_payback_after_deadline_is_the_first_month_cumulative_reaches_zero():
    book = _deadline_book()
    assert months_after_deadline_to_payback(book) == 76
    extended = extend_past_deadline(book, 76)
    idx = payback_index(extended.net, first_cost_index(extended))
    assert idx == 99  # cumulative is -10 at index 98 and 0 at index 99
    assert format_month(parse_month("2027-01") + idx) == "2035-04"


def test_extension_is_run_rate_only_and_does_not_touch_deadline_months():
    book = _deadline_book()
    extended = extend_past_deadline(book, 3)
    assert extended.horizon_len == 24
    assert extended.months[24:] == ["2029-01", "2029-02", "2029-03"]
    assert extended.one_off[24:] == [0.0, 0.0, 0.0]  # no one-off cost after the deadline
    assert extended.required[24:] == [0.0, 0.0, 0.0]  # no staffing after the deadline
    assert extended.benefit[24:] == [10.0, 10.0, 10.0]  # deadline run rate repeats
    assert extended.benefit[:24] == book.benefit  # deadline months are unchanged
    assert book.months[-1] == "2028-12"  # the original book is not mutated


def test_no_payback_when_run_rate_does_not_close_the_gap():
    book = _mini_book(one_off=[1000.0] + [0.0] * 23, benefit=[0.0] * 24, recurring=[5.0] * 24)
    assert months_after_deadline_to_payback(book) is None
    extended = extend_for_payback({"x": book})["x"]
    assert len(extended.months) == 24  # nothing to extend to


def test_payback_beyond_the_cap_is_reported_as_not_reached():
    book = _deadline_book()  # needs 76 months
    assert months_after_deadline_to_payback(book, cap=75) is None
    assert months_after_deadline_to_payback(book, cap=76) == 76
    assert PAYBACK_MAX_MONTHS_AFTER_DEADLINE >= 76


def test_scenarios_share_one_series_length_when_extended():
    fast = _mini_book(one_off=[100.0] + [0.0] * 23, benefit=[60.0] * 24, recurring=[0.0] * 24)  # pays back in-horizon
    slow = _deadline_book()  # needs 76 months
    out = extend_for_payback({"fast": fast, "slow": slow})
    assert len(out["fast"].months) == len(out["slow"].months) == 24 + 76
    assert payback_index(out["fast"].net, first_cost_index(out["fast"])) == 1
