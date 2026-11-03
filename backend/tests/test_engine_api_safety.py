import json
import re

import pytest
from fastapi.testclient import TestClient

from strategy_compiler.api import app
from strategy_compiler.contracts import PlanRequest
from strategy_compiler.engine import compute_plan, run_sensitivity
from strategy_compiler.narrative import build_facts, _template

EMPLOYEE_ID = re.compile(r"EMP-\d{4}")


@pytest.fixture(autouse=True)
def _no_live_llm(monkeypatch):
    """Tests never call the live Claude API."""
    monkeypatch.delenv("STRATEGY_COMPILER_LLM", raising=False)


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def base_plan():
    return compute_plan(PlanRequest(case="base"))


def test_default_plan_is_valid_with_three_scenarios(base_plan):
    assert base_plan.validation.ok
    assert set(base_plan.scenarios) == {"reskill_led", "hire_led", "hybrid"}


def test_every_scenario_has_24_monthly_points_and_is_consistent(base_plan):
    for sr in base_plan.scenarios.values():
        assert len(sr.monthly) == 24
        cum = sum(p.net_eur for p in sr.monthly)
        assert cum == pytest.approx(sr.totals.net_eur, rel=1e-9, abs=1e-6)
        assert sr.totals.cost_total_eur == pytest.approx(sr.totals.cost_one_off_eur + sr.totals.cost_recurring_eur)


def test_action_costs_reconcile_to_scenario_totals(base_plan):
    for sr in base_plan.scenarios.values():
        action_one_off = sum(a.one_off_cost_eur for a in sr.actions)
        action_recurring = sum(a.recurring_cost_eur for a in sr.actions)
        # programme-level costs (technology, change, platform) are not actions, so actions are a subset
        assert action_one_off <= sr.totals.cost_one_off_eur + 1
        assert action_recurring <= sr.totals.cost_recurring_eur + 1


def test_hybrid_is_cheapest_and_recommended_on_base_fixtures(base_plan):
    # Regression guard for the demo storyline: hybrid is the lowest-cost scenario that leaves no unmet FTE.
    totals = {sid: sr.totals for sid, sr in base_plan.scenarios.items()}
    assert totals["hybrid"].unmet_fte_months <= totals["hire_led"].unmet_fte_months
    assert totals["hybrid"].cost_total_eur < totals["hire_led"].cost_total_eur
    assert totals["hybrid"].cost_total_eur < totals["reskill_led"].cost_total_eur


def test_roi_none_only_when_no_cost(base_plan):
    for sr in base_plan.scenarios.values():
        assert sr.totals.roi is not None


def test_sensitivity_returns_low_base_high_for_each_scenario():
    rows = run_sensitivity(PlanRequest())
    assert len(rows) == 9
    assert {r.case for r in rows} == {"low", "base", "high"}


def test_low_case_is_never_better_than_high_case_for_net():
    rows = {(r.scenario, r.case): r for r in run_sensitivity(PlanRequest())}
    for sid in ("reskill_led", "hire_led", "hybrid"):
        assert rows[(sid, "low")].net_eur <= rows[(sid, "high")].net_eur


def test_freed_capacity_is_only_an_aggregate_flagged_number(base_plan):
    payload = base_plan.model_dump_json()
    assert "freed_capacity_fte_peak" in payload
    assert "HR / legal / employee-representation review required" in payload
    for sr in base_plan.scenarios.values():
        for point in sr.monthly:
            assert isinstance(point.freed_capacity_fte_aggregate, float)


# ---------------------------------------------------------------- people safeguards
def test_plan_payload_contains_no_employee_level_surplus_or_ranking(base_plan):
    text = base_plan.model_dump_json()
    for forbidden in ("surplus_employee", "rank", "terminat", "dismiss", "redundan_list"):
        assert forbidden not in text.lower()


def test_brief_facts_contain_no_employee_ids(base_plan):
    facts = build_facts(base_plan, "hybrid")
    assert not EMPLOYEE_ID.search(json.dumps(facts))


def test_template_brief_is_labelled_mock_and_has_no_employee_ids(base_plan):
    text = _template(build_facts(base_plan, "hybrid"))
    assert "MOCK" in text
    assert not EMPLOYEE_ID.search(text)
    assert "dismiss" not in text.lower()


def test_api_brief_default_is_template_without_live_llm(client):
    response = client.post("/api/brief", json={"scenario": "hybrid"})
    assert response.status_code == 200
    body = response.json()
    assert body["drafted_by"] == "template"
    assert "MOCK" in body["text"]


# ---------------------------------------------------------------- API contract
def test_health_and_case(client):
    assert client.get("/api/health").json()["status"] == "ok"
    case = client.get("/api/case").json()
    assert case["goal"]["is_mock"] is True
    assert len(case["milestones"]) == 4


def test_compute_returns_422_for_invalid_roadmap(client):
    response = client.post(
        "/api/plan/compute",
        json={"case": "base", "milestone_dates": {"M3": {"start": "2027-11", "end": "2028-05"}}},
    )
    assert response.status_code == 422
    assert response.json()["validation"]["ok"] is False


def test_compute_rejects_unknown_assumption(client):
    response = client.post("/api/plan/compute", json={"case": "base", "assumption_overrides": {"nope": 1}})
    assert response.status_code == 422


def test_editing_a_milestone_changes_totals_when_still_valid(client):
    base = client.post("/api/plan/compute", json={"case": "base"}).json()
    # M4 must end by Dec 2028, so shorten it instead of moving it.
    edited = client.post(
        "/api/plan/compute",
        json={"case": "base", "milestone_dates": {"M4": {"start": "2028-07", "end": "2028-11"}}},
    )
    assert edited.status_code == 200
    assert edited.json()["scenarios"]["hybrid"]["totals"]["benefit_eur"] != base["scenarios"]["hybrid"]["totals"]["benefit_eur"]


def test_evidence_endpoint_validates_skill_and_family(client):
    assert client.get("/api/evidence/not_a_skill").status_code == 404
    assert client.get("/api/evidence/kyc", params={"family": "data"}).status_code == 422
    assert client.get("/api/evidence/kyc").status_code == 200


def test_workforce_summary_has_no_employee_ids(client):
    text = client.get("/api/workforce/summary").text
    assert not EMPLOYEE_ID.search(text)
    assert client.get("/api/workforce/summary").json()["total_headcount"] == 60


def test_team_roster_is_synthetic_and_has_no_availability_field(client):
    body = client.get("/api/workforce/team/AML-OPS").json()
    assert body["members"], "team has members"
    assert all("availability" not in m for m in body["members"])


def test_assumptions_put_validates_keys(client):
    assert client.put("/api/assumptions", json={"overrides": {"ai_cost_saving_pct": 0.3}}).status_code == 200
    assert client.put("/api/assumptions", json={"overrides": {"bogus": 1}}).status_code == 422


def test_brief_reflects_roadmap_edits(client):
    base = client.post("/api/brief", json={"scenario": "hybrid"}).json()
    edited = client.post(
        "/api/brief",
        json={"scenario": "hybrid", "milestone_dates": {"M4": {"start": "2028-07", "end": "2028-11"}}},
    )
    assert edited.status_code == 200
    assert edited.json()["text"] != base["text"]


def test_brief_rejects_invalid_roadmap(client):
    response = client.post(
        "/api/brief",
        json={"scenario": "hybrid", "milestone_dates": {"M3": {"start": "2027-11", "end": "2028-05"}}},
    )
    assert response.status_code == 422


def test_dutch_template_brief_is_labelled_mock_and_uses_dutch_numbers(base_plan):
    from strategy_compiler.narrative import _template_nl

    text = _template_nl(build_facts(base_plan, "hybrid"))
    assert "MOCK" in text
    assert "Programmakosten" in text
    assert not EMPLOYEE_ID.search(text)


def test_api_brief_dutch_default_is_template(client):
    body = client.post("/api/brief", json={"scenario": "hybrid", "lang": "nl"}).json()
    assert body["drafted_by"] == "template"
    assert "MOCK-BRIEF" in body["text"]
    assert "Gevraagde beslissing" in body["text"]


def test_api_brief_rejects_unknown_language(client):
    response = client.post("/api/brief", json={"scenario": "hybrid", "lang": "fr"})
    assert response.status_code == 422
