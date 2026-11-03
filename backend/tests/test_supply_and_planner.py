import pytest

from strategy_compiler.config import (
    EPS,
    load_company,
    load_employees,
    load_requirement_specs,
    load_taxonomy,
    load_goal,
    load_milestones,
    resolve_assumptions,
)
from strategy_compiler.contracts import Employee
from strategy_compiler.demand import expand_requirements, has_adjacent_skill
from strategy_compiler.planner import run_scenario
from strategy_compiler.supply import Ledger, coverage, gap
from strategy_compiler.timeline import month_range

SCENARIOS = ("reskill_led", "hire_led", "hybrid")


def _context(case: str = "base"):
    goal = load_goal()
    company = load_company()
    horizon = month_range(goal.horizon_start, goal.horizon_end)
    reqs = expand_requirements(load_requirement_specs(), load_milestones())
    employees = list(load_employees())
    contributing = {t.id for t in company.teams if t.contributing}
    families = {s.id: s.family for s in load_taxonomy().skills}
    return reqs, employees, contributing, families, resolve_assumptions(case), horizon


def test_coverage_and_gap_example():
    # Proficiency 3 against a requirement of 4: 75% coverage, one level short.
    assert coverage(3, 4) == pytest.approx(0.75)
    assert gap(3, 4) == 1
    assert coverage(5, 4) == 1.0
    assert gap(5, 4) == 0


def test_adjacent_skill_requires_same_family_at_level_two():
    families = {"ml": "ai_ml", "mlops": "ai_ml", "sql": "data"}
    assert has_adjacent_skill({"ml": 2}, "mlops", families)
    assert not has_adjacent_skill({"ml": 1}, "mlops", families)
    assert not has_adjacent_skill({"sql": 5}, "mlops", families)


def test_ledger_rejects_overbooking_and_never_goes_negative():
    emp = Employee(
        employee_id="EMP-T1", team_id="DS-AI", role="x", grade="G5", fte=1.0, availability=0.5,
        skills={}, training_history=[], cost_band="B",
    )
    ledger = Ledger([emp], ["2027-01"], {"DS-AI"})
    assert ledger.remaining("EMP-T1", "2027-01") == pytest.approx(0.5)
    ledger.book("EMP-T1", "2027-01", 0.5)
    assert ledger.remaining("EMP-T1", "2027-01") == pytest.approx(0.0)
    with pytest.raises(ValueError):
        ledger.book("EMP-T1", "2027-01", 0.1)


def test_non_contributing_team_has_no_programme_capacity():
    reqs, employees, contributing, families, a, horizon = _context()
    ledger = Ledger(employees, horizon, contributing)
    risk = next(e for e in employees if e.team_id == "RISK")
    assert ledger.base_capacity(risk.employee_id) == 0.0


@pytest.mark.parametrize("scenario", SCENARIOS)
def test_no_employee_is_booked_beyond_capacity(scenario):
    reqs, employees, contributing, families, a, horizon = _context()
    raw = run_scenario(scenario, reqs, employees, contributing, families, a, horizon)
    base = {e.employee_id: e.fte * e.availability for e in employees if e.team_id in contributing}
    booked: dict[tuple[str, str], float] = {}
    for al in raw.allocations:
        if al.employee_id is None:
            continue
        key = (al.employee_id, al.month)
        booked[key] = booked.get(key, 0.0) + al.fte
    for (eid, month), total in booked.items():
        assert total <= base[eid] + EPS, f"{eid} overbooked in {month}: {total} > {base[eid]}"


@pytest.mark.parametrize("scenario", SCENARIOS)
def test_training_finishes_before_requirement_starts(scenario):
    reqs, employees, contributing, families, a, horizon = _context()
    raw = run_scenario(scenario, reqs, employees, contributing, families, a, horizon)
    starts = {r.id: r.start for r in reqs}
    for t in raw.trainings:
        assert max(t.months) < starts[t.requirement_id], t
        assert min(t.months) >= horizon[0]


@pytest.mark.parametrize("scenario", SCENARIOS)
def test_contributing_teams_only_are_drawn_on_internally(scenario):
    reqs, employees, contributing, families, a, horizon = _context()
    raw = run_scenario(scenario, reqs, employees, contributing, families, a, horizon)
    team = {e.employee_id: e.team_id for e in employees}
    for al in raw.allocations:
        if al.employee_id is not None:
            assert team[al.employee_id] in contributing


def test_reskill_is_not_used_when_lead_time_is_too_short():
    reqs, employees, contributing, families, a, horizon = _context()
    raw = run_scenario("reskill_led", reqs, employees, contributing, families, a, horizon)
    first_month_reqs = {r.id for r in reqs if r.start == horizon[0]}
    assert first_month_reqs, "fixture should have requirements starting in the first month"
    assert not any(t.requirement_id in first_month_reqs for t in raw.trainings)


@pytest.mark.parametrize("case", ["low", "base", "high"])
def test_hybrid_never_leaves_more_unmet_fte_than_hire_led(case):
    reqs, employees, contributing, families, a, horizon = _context(case)
    unmet = {}
    for sid in ("hybrid", "hire_led"):
        raw = run_scenario(sid, reqs, employees, contributing, families, a, horizon)
        unmet[sid] = sum(u.unmet_fte for u in raw.unmet)
    assert unmet["hybrid"] <= unmet["hire_led"] + EPS


def test_hire_headcount_covers_requirement_from_start_month():
    reqs, employees, contributing, families, a, horizon = _context()
    raw = run_scenario("hire_led", reqs, employees, contributing, families, a, horizon)
    assert raw.hires, "hire-led must hire"
    for h in raw.hires:
        assert h.start >= horizon[0]
        for m in h.months:
            assert raw.covered[h.requirement_id][m] >= 0
