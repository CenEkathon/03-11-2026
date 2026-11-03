"""Narrative brief: template by default, opt-in live path, cache and usage log. The Anthropic SDK is faked."""

import json
import sys
import types

import pytest

from strategy_compiler import narrative
from strategy_compiler.contracts import PlanRequest
from strategy_compiler.engine import compute_plan


@pytest.fixture(autouse=True)
def _isolated(monkeypatch, tmp_path):
    """Route cache and usage log to a temp dir and clear every live-LLM switch."""
    monkeypatch.setattr(narrative, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setattr(narrative, "USAGE_LOG", tmp_path / "usage.jsonl")
    for var in ("STRATEGY_COMPILER_LLM", "ANTHROPIC_API_KEY", "LLM_PRICE_EUR_PER_MTOK_IN", "LLM_PRICE_EUR_PER_MTOK_OUT"):
        monkeypatch.delenv(var, raising=False)
    return tmp_path


@pytest.fixture(scope="module")
def plan():
    return compute_plan(PlanRequest(case="base"))


class _FakeMessages:
    def __init__(self, owner):
        self.owner = owner

    def create(self, **kwargs):
        self.owner.calls.append(kwargs)
        return self.owner.reply


class _FakeAnthropic:
    """Stands in for anthropic.Anthropic. Records calls and returns a canned message."""

    reply: object = None
    calls: list = []

    def __init__(self, *args, **kwargs):
        self.messages = _FakeMessages(type(self))


def _install_fake_sdk(monkeypatch, *, stop_reason="end_turn", tokens=(1000, 500)):
    _FakeAnthropic.calls = []
    text_block = types.SimpleNamespace(type="text", text="Drafted brief text.")
    other_block = types.SimpleNamespace(type="tool_use", text="ignored")
    _FakeAnthropic.reply = types.SimpleNamespace(
        content=[text_block, other_block],
        usage=types.SimpleNamespace(input_tokens=tokens[0], output_tokens=tokens[1]),
        stop_reason=stop_reason,
    )
    fake_module = types.ModuleType("anthropic")
    fake_module.Anthropic = _FakeAnthropic
    monkeypatch.setitem(sys.modules, "anthropic", fake_module)
    return _FakeAnthropic


def test_price_eur_uses_env_prices_per_million_tokens(monkeypatch):
    assert narrative._price_eur(1000, 1000) == 0.0  # unpriced by default
    monkeypatch.setenv("LLM_PRICE_EUR_PER_MTOK_IN", "3")
    monkeypatch.setenv("LLM_PRICE_EUR_PER_MTOK_OUT", "15")
    assert narrative._price_eur(1_000_000, 1_000_000) == pytest.approx(18.0)
    monkeypatch.setenv("LLM_PRICE_EUR_PER_MTOK_IN", "")  # empty string falls back to 0
    assert narrative._price_eur(1_000_000, 0) == 0.0


def test_usage_summary_without_log_is_empty(tmp_path):
    assert narrative.usage_summary()["calls"] == 0


def test_usage_summary_aggregates_log_and_reports_pricing(monkeypatch, tmp_path):
    log = tmp_path / "usage.jsonl"
    rows = [
        {"input_tokens": 10, "output_tokens": 5, "eur_estimate": 0.5},
        {"input_tokens": 20, "output_tokens": 7, "eur_estimate": 0.25},
    ]
    log.write_text("\n".join(json.dumps(r) for r in rows) + "\n\n", encoding="utf-8")
    summary = narrative.usage_summary()
    assert summary == {"calls": 2, "input_tokens": 30, "output_tokens": 12, "eur_estimate": 0.75, "priced": False}
    monkeypatch.setenv("LLM_PRICE_EUR_PER_MTOK_OUT", "1")
    assert narrative.usage_summary()["priced"] is True


def test_default_brief_is_template_and_never_calls_sdk(plan, monkeypatch):
    fake = _install_fake_sdk(monkeypatch)
    brief = narrative.build_brief(plan, "hybrid")
    assert brief.drafted_by == "template"
    assert brief.cached is False
    assert fake.calls == []


def test_live_flag_without_api_key_stays_on_template(plan, monkeypatch):
    fake = _install_fake_sdk(monkeypatch)
    monkeypatch.setenv("STRATEGY_COMPILER_LLM", "live")
    assert narrative.build_brief(plan, "hybrid").drafted_by == "template"
    assert fake.calls == []


def test_live_brief_is_logged_cached_and_served_from_cache(plan, monkeypatch, tmp_path):
    fake = _install_fake_sdk(monkeypatch, tokens=(1000, 500))
    monkeypatch.setenv("STRATEGY_COMPILER_LLM", "live")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("LLM_PRICE_EUR_PER_MTOK_IN", "2")
    monkeypatch.setenv("LLM_PRICE_EUR_PER_MTOK_OUT", "10")

    first = narrative.build_brief(plan, "hybrid")
    assert first.drafted_by == "claude"
    assert first.text == "Drafted brief text."
    assert first.cached is False
    assert first.usage.input_tokens == 1000
    assert first.usage.eur_estimate == pytest.approx(0.002 + 0.005)
    assert len(fake.calls) == 1
    assert fake.calls[0]["model"] == narrative.NARRATIVE_MODEL

    logged = [json.loads(line) for line in (tmp_path / "usage.jsonl").read_text(encoding="utf-8").splitlines()]
    assert logged[0]["scenario"] == "hybrid"
    assert logged[0]["output_tokens"] == 500

    second = narrative.build_brief(plan, "hybrid")
    assert second.cached is True
    assert second.text == first.text
    assert len(fake.calls) == 1  # served from disk, no second call


def test_brief_cut_off_at_token_cap_is_not_cached(plan, monkeypatch, tmp_path):
    fake = _install_fake_sdk(monkeypatch, stop_reason="max_tokens")
    monkeypatch.setenv("STRATEGY_COMPILER_LLM", "live")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    narrative.build_brief(plan, "reskill_led")
    narrative.build_brief(plan, "reskill_led")
    assert len(fake.calls) == 2  # nothing cached, so the second request goes out again
    assert not (tmp_path / "cache").exists() or not any((tmp_path / "cache").iterdir())
