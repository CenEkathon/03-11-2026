import pytest

from strategy_compiler.config import load_goal, load_milestones, resolve_assumptions
from strategy_compiler.contracts import Requirement
from strategy_compiler.engine import _payback
from strategy_compiler.finance import ONE_OFF, RECURRING, build_book, cost_items
from strategy_compiler.planner import Allocation, HireEvent, RawScenario, TrainingEvent
from strategy_compiler.timeline import month_range

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
    months = ["2027-01", "2027-02", "2027-03"]
    assert _payback(months, [-100, 50, 60], first_cost=0) == "2027-03"
    assert _payback(months, [-100, -50, -60], first_cost=0) is None
    assert _payback(months, [0, 0, 0], first_cost=None) is None  # no cost, so no payback claim
