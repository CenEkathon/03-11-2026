"""Edge cases the main suite does not reach: planner reasons, finance clipping, engine shortfalls, roadmap DAG checks.

Small synthetic employees and requirements keep each case explicit. Names are EMP-style IDs with no personal data.
"""

import pytest

from strategy_compiler import config
from strategy_compiler.config import (
    load_goal,
    load_milestones,
    load_requirement_specs,
    load_taxonomy,
    resolve_assumptions,
)
from strategy_compiler.contracts import Employee, Requirement, VacancyEvidence
from strategy_compiler.demand import expand_requirements, vacancy_share
from strategy_compiler.engine import _actions, _shortfalls
from strategy_compiler.finance import build_book
from strategy_compiler.planner import Allocation, HireEvent, RawScenario, UnmetMonth, _Planner
from strategy_compiler.roadmap import adoption_by_month, validate_roadmap
from strategy_compiler.timeline import month_range

A = resolve_assumptions("base")
GOAL = load_goal()
HORIZON = month_range(GOAL.horizon_start, GOAL.horizon_end)
FAMILIES = {s.id: s.family for s in load_taxonomy().skills}
MILESTONE_ID = load_milestones()[0].id


def _emp(eid, team="T1", skills=None, availability=1.0):
    return Employee(
        employee_id=eid,
        team_id=team,
        role="Reviewer",
        fte=1.0,
        availability=availability,
        skills=skills or {},
    )


def _req(rid="R1", skill="kyc", min_p=3, fte=1.0, start="2028-01", end="2028-03", milestone=MILESTONE_ID):
    return Requirement(
        id=rid,
        milestone_id=milestone,
        role="Reviewer",
        skill_id=skill,
        min_proficiency=min_p,
        fte=fte,
        start=start,
        end=end,
        rationale="synthetic test requirement",
    )


def _planner(employees, policy=None):
    p = _Planner("hybrid", employees, {"T1"}, FAMILIES, A, HORIZON)
    if policy is not None:
        p.policy = policy
    return p


# ------------------------------------------------------------------ planner


def test_reskill_skips_candidate_whose_programme_capacity_is_used_up():
    # Trained already (no training to schedule), but every month is fully booked elsewhere.
    emp = _emp("EMP-0001", skills={"kyc": 2, "aml_monitoring": 2})
    p = _planner([emp])
    r = _req()
    p.trained.add(("EMP-0001", r.id))
    months = month_range(r.start, r.end)
    for m in months:
        p.ledger.consume_all("EMP-0001", m)
    covered = {m: 0.0 for m in months}
    assert p._reskill(r, months, covered) is False
    assert p.raw.allocations == []
    assert all(v == 0.0 for v in covered.values())


def test_reskill_reports_lead_time_block_when_training_would_start_before_horizon():
    emp = _emp("EMP-0002", skills={"kyc": 2, "aml_monitoring": 2})
    p = _planner([emp])
    r = _req(start=HORIZON[0])  # training must finish before the first horizon month
    months = month_range(r.start, r.end)
    covered = {m: 0.0 for m in months}
    assert p._reskill(r, months, covered) is True
    assert p.raw.trainings == []


def test_hire_only_books_months_still_short_of_cover():
    p = _planner([])
    r = _req(start="2028-01", end="2028-02", fte=1.0)
    months = month_range(r.start, r.end)
    covered = {"2028-01": 0.0, "2028-02": 1.0}  # second month already fully covered
    p._hire(r, months, covered)
    assert [a.month for a in p.raw.allocations] == ["2028-01"]
    assert p.raw.hires[0].headcount == pytest.approx(1.0)


def test_unknown_sourcing_step_is_rejected():
    p = _planner([], policy=("bogus",))
    with pytest.raises(ValueError, match="unknown sourcing policy step: bogus"):
        p.run([_req()])


def test_unmet_before_hire_can_start_is_labelled_hire_not_started():
    p = _planner([], policy=("hire",))
    r = _req(start=HORIZON[0], end=HORIZON[2])
    raw = p.run([r])
    reasons = {u.month: u.reason for u in raw.unmet}
    assert reasons[HORIZON[0]] == "hire_not_started"
    assert all(u.reason == "hire_not_started" for u in raw.unmet)


def test_unmet_when_reskill_training_has_no_lead_time_is_labelled_lead_time():
    emp = _emp("EMP-0003", skills={"kyc": 2, "aml_monitoring": 2})
    p = _planner([emp], policy=("reskill",))
    raw = p.run([_req(start=HORIZON[0], end=HORIZON[2])])
    assert raw.unmet
    assert {u.reason for u in raw.unmet} == {"lead_time_too_short"}


def test_unmet_with_no_candidates_is_labelled_no_eligible_supply():
    p = _planner([], policy=("redeploy",))
    raw = p.run([_req(start="2028-01", end="2028-02")])
    assert {u.reason for u in raw.unmet} == {"no_eligible_supply"}


# ------------------------------------------------------------------ finance


def _book(raw, milestones=None, requirements=None):
    ms = milestones if milestones is not None else load_milestones()
    adoption = adoption_by_month(ms, HORIZON)
    return build_book(raw, A, GOAL, ms, requirements or [], adoption, HORIZON)


def test_zero_change_cost_and_out_of_horizon_milestone_add_no_one_off_cost():
    milestones = [m.model_copy(update={"change_cost_eur": 0.0}) for m in load_milestones()]
    milestones.append(
        load_milestones()[0].model_copy(
            update={"id": "MX", "start": "2031-01", "end": "2031-06", "change_cost_eur": 100000.0, "depends_on": []}
        )
    )
    book = _book(RawScenario(scenario="hybrid"), milestones=milestones)
    assert sum(book.one_off) == pytest.approx(0.0)


def test_without_platform_milestone_there_is_no_platform_run_cost():
    milestones = [m for m in load_milestones() if m.id != "M2"]
    book = _book(RawScenario(scenario="hybrid"), milestones=milestones)
    assert sum(book.recurring) == pytest.approx(0.0)


def test_requirements_and_coverage_outside_horizon_are_not_counted():
    raw = RawScenario(scenario="hybrid")
    raw.covered["R1"] = {"2031-01": 1.0, HORIZON[0]: 0.0}
    book = _book(raw, requirements=[_req(start="2031-01", end="2031-03")])
    assert sum(book.required) == pytest.approx(0.0)
    assert sum(book.staffed) == pytest.approx(0.0)


def test_hire_cost_outside_horizon_is_dropped():
    # The platform run cost is recurring by default, so compare against a book with no hires.
    baseline = sum(_book(RawScenario(scenario="hybrid")).recurring)
    raw = RawScenario(scenario="hybrid")
    raw.hires.append(HireEvent("hybrid", "R1", "kyc", "2031-01", ["2031-01"], 1.0))
    assert sum(_book(raw).recurring) == pytest.approx(baseline)


# ------------------------------------------------------------------ engine


def test_zero_fte_allocation_with_no_cost_is_not_reported_as_an_action():
    raw = RawScenario(scenario="hybrid")
    raw.allocations.append(Allocation("hybrid", "R1", "2028-01", "redeploy", "EMP-0004", 0.0))
    assert _actions("hybrid", raw, [_req()], load_milestones(), [], A) == []


def test_reskill_without_recorded_training_is_reported_from_its_first_allocation():
    raw = RawScenario(scenario="hybrid")
    raw.allocations.append(Allocation("hybrid", "R1", "2028-01", "reskill", "EMP-0005", 0.5))
    raw.allocations.append(Allocation("hybrid", "R1", "2028-02", "reskill", "EMP-0005", 0.5))
    (action,) = _actions("hybrid", raw, [_req()], load_milestones(), [], A)
    assert action.type == "reskill"
    assert action.start == "2028-01"
    assert action.duration_months == 2
    assert action.people_count == 1


def test_shortfalls_group_unmet_months_by_requirement_and_reason():
    raw = RawScenario(scenario="hybrid")
    raw.unmet.extend(
        [
            UnmetMonth("R1", MILESTONE_ID, "2028-02", 0.5, "no_eligible_supply"),
            UnmetMonth("R1", MILESTONE_ID, "2028-01", 0.5, "no_eligible_supply"),
            UnmetMonth("R1", MILESTONE_ID, "2028-01", 0.25, "lead_time_too_short"),
        ]
    )
    shortfalls = _shortfalls(raw, [_req()])
    assert [(s.reason, s.months, s.unmet_fte_months) for s in shortfalls] == [
        ("lead_time_too_short", ["2028-01"], 0.25),
        ("no_eligible_supply", ["2028-01", "2028-02"], 1.0),
    ]
    assert all(s.skill_id == "kyc" for s in shortfalls)


# ------------------------------------------------------------------ demand and config


def test_expand_requirements_rejects_unknown_milestone():
    with pytest.raises(ValueError, match="points to unknown milestone NOPE"):
        expand_requirements(
            [{"id": "R9", "milestone_id": "NOPE", "role": "x", "skill_id": "kyc", "min_proficiency": 1, "fte": 1.0, "rationale": "x"}],
            load_milestones(),
        )


def test_vacancy_share_is_none_without_rows_or_without_denominator():
    assert vacancy_share("kyc", []) is None
    zero = VacancyEvidence(
        skill_id="kyc", family="financial_crime", country="BE", year_month="2021-03",
        postings=0, postings_in_cell=0, share=0.0,
    )
    assert vacancy_share("kyc", [zero]) is None


def test_missing_vacancy_evidence_file_gives_empty_tuple(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "FIXTURES_DIR", tmp_path)
    config.load_vacancy_evidence.cache_clear()
    try:
        assert config.load_vacancy_evidence() == ()
    finally:
        config.load_vacancy_evidence.cache_clear()


# ------------------------------------------------------------------ roadmap DAG


def _ms():
    return list(load_milestones())


def test_duplicate_milestone_ids_are_reported():
    ms = _ms()
    result = validate_roadmap(ms + [ms[0]], GOAL.horizon_start, GOAL.horizon_end)
    assert not result.ok
    assert "duplicate milestone ids" in result.errors


def test_malformed_month_is_reported_and_stops_further_checks():
    ms = _ms()
    bad = ms[0].model_copy(update={"start": "2027-13"})
    result = validate_roadmap([bad] + ms[1:], GOAL.horizon_start, GOAL.horizon_end)
    assert not result.ok
    assert any(e.startswith(f"{ms[0].id}: ") for e in result.errors)
    assert not any("finish-to-start" in e for e in result.errors)


def test_end_before_start_is_reported():
    ms = _ms()
    bad = ms[0].model_copy(update={"end": "2026-12"})
    result = validate_roadmap([bad] + ms[1:], GOAL.horizon_start, GOAL.horizon_end)
    assert any("is before start" in e for e in result.errors)


def test_unknown_dependency_is_reported():
    ms = _ms()
    bad = ms[1].model_copy(update={"depends_on": ["GHOST"]})
    result = validate_roadmap([ms[0], bad] + ms[2:], GOAL.horizon_start, GOAL.horizon_end)
    assert "unknown dependency GHOST" in " ".join(result.errors)


def test_diamond_dependency_is_valid_and_not_a_cycle():
    ms = _ms()
    left = ms[0].model_copy(update={"id": "DA", "depends_on": []})
    right = ms[0].model_copy(update={"id": "DB", "depends_on": []})
    join = ms[1].model_copy(update={"id": "DC", "depends_on": ["DA", "DB"]})
    result = validate_roadmap([left, right, join], GOAL.horizon_start, GOAL.horizon_end)
    assert result.ok, result.errors


def test_requirement_specs_expand_inside_horizon():
    reqs = expand_requirements(load_requirement_specs(), load_milestones())
    assert reqs
    assert all(r.start in HORIZON and r.end in HORIZON for r in reqs)


def test_no_cost_at_all_means_no_payback_to_extrapolate():
    from strategy_compiler.finance import Book, extend_past_deadline, months_after_deadline_to_payback

    book = Book(
        months=list(HORIZON), adoption=[0.0] * len(HORIZON), required=[0.0] * len(HORIZON),
        staffed=[0.0] * len(HORIZON), coverage=[1.0] * len(HORIZON), benefit=[0.0] * len(HORIZON),
        one_off=[0.0] * len(HORIZON), recurring=[0.0] * len(HORIZON), freed_fte=[0.0] * len(HORIZON),
        items=[], horizon_len=len(HORIZON),
    )
    assert months_after_deadline_to_payback(book) is None
    with pytest.raises(ValueError, match="extra_months must be >= 0"):
        extend_past_deadline(book, -1)
