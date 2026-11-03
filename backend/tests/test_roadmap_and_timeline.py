import pytest

from strategy_compiler.config import load_goal, load_milestones
from strategy_compiler.contracts import MilestoneDates
from strategy_compiler.roadmap import adoption_by_month, apply_dates, validate_roadmap
from strategy_compiler.timeline import format_month, month_range, parse_month


def test_month_round_trip():
    assert format_month(parse_month("2027-01")) == "2027-01"
    assert parse_month("2028-12") - parse_month("2027-01") == 23
    assert len(month_range("2027-01", "2028-12")) == 24


def test_invalid_month_is_rejected():
    with pytest.raises(ValueError):
        parse_month("2027-13")


def test_default_roadmap_is_valid_and_fits_horizon():
    goal = load_goal()
    result = validate_roadmap(load_milestones(), goal.horizon_start, goal.horizon_end)
    assert result.ok, result.errors


def test_finish_to_start_violation_is_reported():
    goal = load_goal()
    moved = apply_dates(load_milestones(), {"M4": MilestoneDates(start="2027-10", end="2028-02")})
    result = validate_roadmap(moved, goal.horizon_start, goal.horizon_end)
    assert not result.ok
    assert any("M4" in e and "finish-to-start" in e for e in result.errors)


def test_milestone_outside_horizon_is_reported():
    goal = load_goal()
    moved = apply_dates(load_milestones(), {"M6": MilestoneDates(start="2028-07", end="2029-02")})
    result = validate_roadmap(moved, goal.horizon_start, goal.horizon_end)
    assert not result.ok
    assert any("outside the horizon" in e for e in result.errors)


def test_dependency_cycle_is_detected():
    goal = load_goal()
    ms = [m.model_copy() for m in load_milestones()]
    ms[0] = ms[0].model_copy(update={"depends_on": ["M6"]})
    result = validate_roadmap(ms, goal.horizon_start, goal.horizon_end)
    assert not result.ok
    assert any("cycle" in e or "finish-to-start" in e for e in result.errors)


def test_unknown_milestone_date_edit_is_rejected():
    from strategy_compiler.roadmap import RoadmapError

    with pytest.raises(RoadmapError):
        apply_dates(load_milestones(), {"MX": MilestoneDates(start="2027-01", end="2027-02")})


def test_adoption_ramp_matches_hand_computed_values():
    goal = load_goal()
    horizon = month_range(goal.horizon_start, goal.horizon_end)
    adoption = adoption_by_month(load_milestones(), horizon)
    # M3 pilot: linear ramp 0 -> 0.15 across Jul-Oct 2027
    assert adoption["2027-07"] == pytest.approx(0.0375)
    assert adoption["2027-10"] == pytest.approx(0.15)
    # M4 holds 0.15
    assert adoption["2028-01"] == pytest.approx(0.15)
    # M5 ramp 0.15 -> 0.40 across Mar-Jun 2028
    assert adoption["2028-03"] == pytest.approx(0.2125)
    assert adoption["2028-06"] == pytest.approx(0.40)
    # M6 ramp 0.40 -> 0.60 across Jul-Dec 2028
    assert adoption["2028-12"] == pytest.approx(0.60)
    assert adoption["2027-01"] == pytest.approx(0.0)
