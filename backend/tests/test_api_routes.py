"""Every HTTP route is exercised once, including its error paths. No live LLM calls."""

import pytest
from fastapi.testclient import TestClient

from strategy_compiler import narrative
from strategy_compiler.api import app


@pytest.fixture(autouse=True)
def _no_live_llm(monkeypatch):
    monkeypatch.delenv("STRATEGY_COMPILER_LLM", raising=False)


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_sensitivity_endpoint_returns_low_base_high_rows(client):
    resp = client.post("/api/plan/sensitivity", json={"case": "base"})
    assert resp.status_code == 200
    rows = resp.json()
    assert {r["case"] for r in rows} == {"low", "base", "high"}
    assert len(rows) == 9  # three scenarios x three cases


def test_skills_endpoint_lists_taxonomy_with_mock_label(client):
    body = client.get("/api/skills").json()
    assert len(body["skills"]) == 9
    assert {"id", "label", "family", "esco_uri"} <= set(body["skills"][0])
    assert body["labels"]["taxonomy"].startswith("MOCK")


def test_unknown_team_returns_404(client):
    resp = client.get("/api/workforce/team/NOPE")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "unknown team NOPE"


def test_known_team_roster_returns_members(client):
    summary = client.get("/api/workforce/summary").json()
    team_id = summary["teams"][0]["team_id"]
    body = client.get(f"/api/workforce/team/{team_id}").json()
    assert body["team_id"] == team_id
    assert body["members"], "a team in the synthetic workforce has members"


def test_assumptions_get_returns_definitions_with_base_values(client):
    body = client.get("/api/assumptions").json()
    assert body["assumptions"]
    first = body["assumptions"][0]
    assert "base_effective" in first
    assert body["labels"]["assumptions"]


def test_usage_endpoint_reports_zero_calls_when_no_log(client, monkeypatch, tmp_path):
    monkeypatch.setattr(narrative, "USAGE_LOG", tmp_path / "missing.jsonl")
    body = client.get("/api/usage").json()
    assert body == {"calls": 0, "input_tokens": 0, "output_tokens": 0, "eur_estimate": 0.0, "priced": False}


def test_evidence_endpoint_filters_by_country_and_returns_skill(client):
    body = client.get("/api/evidence/kyc", params={"country": "ZZ"}).json()
    assert body["rows"] == []  # no evidence for a country that does not exist
    assert body["skill_id"] == "kyc"
    assert body["family"] == "financial_crime"


def test_evidence_endpoint_unknown_skill_is_404(client):
    assert client.get("/api/evidence/nope").status_code == 404


def test_key_error_handler_maps_unknown_assumption_to_422(client):
    resp = client.put("/api/assumptions", json={"overrides": {"not_a_key": 1.0}})
    assert resp.status_code == 422
    assert "not_a_key" in resp.json()["detail"]
