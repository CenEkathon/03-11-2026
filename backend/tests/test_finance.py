import pytest

from strategy_compiler.config import SALARY_BANDS_EUR, load_goal, load_milestones, resolve_assumptions
from strategy_compiler.contracts import Requirement
from strategy_compiler.engine import _payback
from strategy_compiler.finance import ONE_OFF, RECURRING, build_book, cost_items, npv
from strategy_compiler.planner import Allocation, HireEvent, RawScenario, TrainingEvent
from strategy_compiler.timeline import month_range

A = resolve_assumptions("base")
# loaded monthly salary for band C in base case: 78000 * 1.00 * 1.35 / 12
LOADED_C = 78_000 * 1.0 * 1.35 / 12


def _emp(band: str):
    from strategy_compiler.contracts import Employee

    return {
        "EMP-X": Employee(
            employee_id="EMP-X", team_id="DS-AI", role="r", grade="G6", fte=1.0, availability=0.5,
            skills={}, training_history=[], cost_band=band,
        )
    }


def test_redeployed_person_adds_backfill_and_onboarding_only_not_salary():
    raw = RawScenario(scenario="hybrid")
    raw.allocations.append(Allocation("hybrid", "R01", "2027-01", "redeploy", "EMP-X", 1.0, "C"))
    items = cost_items(raw, _emp("C"), A)
    recurring = sum(i.amount for i in items if i.kind == RECURRING)
    one_off = sum(i.amount for i in items if i.kind == ONE_OFF)
    assert recurring == pytest.approx(A["backfill_share"] * LOADED_C)  # backfill only, no base salary
    assert one_off == pytest.approx(A["redeploy_onboarding_eur"])


def test_hire_costs_follow_headcount_formulas():
    raw = RawScenario(scenario="hire_led")
    raw.hires.append(HireEvent("hire_led", "R06", "machine_learning", "2027-07", ["2027-07", "2027-08"], 2.0))
    items = cost_items(raw, _emp("C"), A)
    one_off = sum(i.amount for i in items if i.kind == ONE_OFF)
    recurring = sum(i.amount for i in items if i.kind == RECURRING)
    fee = 2 * A["recruiter_fee_pct"] * 78_000
    onboarding = 2 * A["hire_onboarding_eur"]
    mentoring = 2 * A["hire_mentoring_days"] * LOADED_C / 20
    assert one_off == pytest.approx(fee + onboarding + mentoring)
    assert recurring == pytest.approx(2 * LOADED_C * 2)


def test_reskill_training_cost_uses_days_times_rate_plus_backfill_during_training():
    raw = RawScenario(scenario="reskill_led")
    raw.trainings.append(TrainingEvent("reskill_led", "R06", "EMP-X", "machine_learning", 2, 24.0, ["2027-05", "2027-06"]))
    items = cost_items(raw, _emp("C"), A)
    one_off = sum(i.amount for i in items if i.kind == ONE_OFF)
    expected = 24 * A["training_day_rate_eur"] + 2 * A["backfill_share"] * LOADED_C
    assert one_off == pytest.approx(expected)


def test_benefit_formula_at_full_coverage_and_sixty_percent_adoption():
    goal = load_goal()
    horizon = month_range(goal.horizon_start, goal.horizon_end)
    adoption = {m: 0.6 for m in horizon}
    req = Requirement(
        id="RX", milestone_id="M1", role="r", skill_id="kyc", min_proficiency=3, fte=1.0,
        start=horizon[0], end=horizon[0], rationale="t",
    )
    raw = RawScenario(scenario="hybrid", covered={"RX": {horizon[0]: 1.0}})
    book = build_book(raw, {}, A, goal, load_milestones(), [req], adoption, horizon)
    # 240000/12 reviews x 0.6 adoption x coverage 1 x EUR 48 x 35% saving = EUR 201,600 per month
    assert book.benefit[0] == pytest.approx(201_600.0)


def test_payback_and_roi_edge_cases():
    months = ["2027-01", "2027-02", "2027-03"]
    assert _payback(months, [-100, 50, 60], first_cost=0) == "2027-03"
    assert _payback(months, [-100, -50, -60], first_cost=0) is None
    assert _payback(months, [0, 0, 0], first_cost=None) is None  # no cost, so no payback claim


def test_npv_discounts_monthly_flows():
    assert npv([1200.0], 0.12) == pytest.approx(1200.0 / 1.12 ** (1 / 12))
