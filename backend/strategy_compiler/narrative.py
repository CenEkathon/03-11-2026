"""Explain-only narrative. Claude writes prose from numbers that the deterministic engine already computed.

Rules:
- The LLM never computes or changes a number, and never makes an employment decision.
- Only aggregates reach the prompt. No employee IDs and no names.
- Results are cached on disk, keyed by the facts and the model, so repeat requests cost nothing.
- Token usage is logged to a JSONL file. Prices come from env vars and are not hardcoded.
- Without ANTHROPIC_API_KEY, a deterministic template is used, so the demo works offline.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

from .config import LABELS
from .contracts import BriefResponse, PlanResponse, ScenarioId, Usage

NARRATIVE_MODEL = "claude-sonnet-5-5"
CACHE_DIR = Path(__file__).resolve().parents[1] / ".cache" / "narrative"
USAGE_LOG = Path(__file__).resolve().parents[1] / ".cache" / "usage.jsonl"

SYSTEM_PROMPT = (
    "You write a short executive brief for a CEO. Everything is MOCK: the bank is fictional, "
    "the goal, roadmap, workforce and figures are demo inputs, and costs are estimates. "
    "Use only the numbers in the JSON you are given. Do not compute, round differently or invent figures. "
    "Mention that the figures are mock estimates. Never recommend dismissing or ranking any individual. "
    "Surplus capacity is only ever an aggregate FTE and must be sent to HR, legal and employee-representation review. "
    "Write at most 220 words in plain English, with 3 short bullet points and one decision request."
)


def _eur(value: float) -> str:
    return f"EUR {value:,.0f}"


def build_facts(plan: PlanResponse, scenario: ScenarioId) -> dict[str, Any]:
    """Aggregates only. No employee ids, no names."""
    result = plan.scenarios[scenario]
    t = result.totals
    by_type: dict[str, dict[str, float]] = {}
    for action in result.actions:
        slot = by_type.setdefault(action.type, {"lines": 0, "fte": 0.0, "one_off_eur": 0.0, "recurring_eur": 0.0})
        slot["lines"] += 1
        slot["fte"] += action.fte
        slot["one_off_eur"] += action.one_off_cost_eur
        slot["recurring_eur"] += action.recurring_cost_eur
    comparison = {
        sid: {"net_eur": r.totals.net_eur, "cost_total_eur": r.totals.cost_total_eur, "unmet_fte_months": r.totals.unmet_fte_months}
        for sid, r in plan.scenarios.items()
    }
    return {
        "labels": LABELS,
        "goal": {
            "title": plan.goal.title,
            "statement": plan.goal.statement,
            "deadline": plan.goal.deadline,
            "target_ai_assisted_share": plan.goal.target.ai_assisted_share,
            "cost_per_review_reduction_pct": plan.goal.target.cost_per_review_reduction_pct,
        },
        "case": plan.case,
        "scenario": {"id": scenario, "label": result.label},
        "totals": {
            "cost_one_off_eur": round(t.cost_one_off_eur, 2),
            "cost_recurring_eur": round(t.cost_recurring_eur, 2),
            "cost_total_eur": round(t.cost_total_eur, 2),
            "benefit_eur": round(t.benefit_eur, 2),
            "net_eur": round(t.net_eur, 2),
            "roi": None if t.roi is None else round(t.roi, 4),
            "payback_month_within_deadline": t.payback_month,
            "extended_payback_month_extrapolated": t.extended_payback_month,
            "npv_eur": round(t.npv_eur, 2),
            "unmet_fte_months": round(t.unmet_fte_months, 4),
            "freed_capacity_fte_peak_aggregate": round(t.freed_capacity_fte_peak, 2),
        },
        "actions_by_type": by_type,
        "shortfall_count": len(result.shortfalls),
        "scenario_comparison": comparison,
        "review_flag": t.freed_capacity_flag,
    }


def _template(facts: dict[str, Any]) -> str:
    t = facts["totals"]
    scen = facts["scenario"]["label"]
    payback = t["payback_month_within_deadline"] or "not within the deadline"
    lines = [
        f"MOCK BRIEF - {scen} (case: {facts['case']}). All figures are mock estimates for a fictional bank.",
        "",
        f"- Programme cost through the deadline: {_eur(t['cost_total_eur'])} "
        f"(one-off {_eur(t['cost_one_off_eur'])}, recurring {_eur(t['cost_recurring_eur'])}).",
        f"- Benefit through the deadline: {_eur(t['benefit_eur'])}; net {_eur(t['net_eur'])}; "
        f"payback {payback}.",
        f"- Unmet FTE-months: {t['unmet_fte_months']:.2f}. Freed capacity peaks at "
        f"{t['freed_capacity_fte_peak_aggregate']:.1f} FTE in aggregate. {facts['review_flag']}.",
        "",
        "Decision requested: approve the roadmap as a proposal, and commission the HR, legal and "
        "employee-representation review before any workforce change.",
    ]
    return "\n".join(lines)


def _price_eur(tokens_in: int, tokens_out: int) -> float:
    price_in = float(os.environ.get("LLM_PRICE_EUR_PER_MTOK_IN", "0") or 0)
    price_out = float(os.environ.get("LLM_PRICE_EUR_PER_MTOK_OUT", "0") or 0)
    return tokens_in / 1e6 * price_in + tokens_out / 1e6 * price_out


def _log_usage(entry: dict[str, Any]) -> None:
    USAGE_LOG.parent.mkdir(parents=True, exist_ok=True)
    with USAGE_LOG.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry) + "\n")


def usage_summary() -> dict[str, Any]:
    if not USAGE_LOG.exists():
        return {"calls": 0, "input_tokens": 0, "output_tokens": 0, "eur_estimate": 0.0, "priced": False}
    rows = [json.loads(line) for line in USAGE_LOG.read_text(encoding="utf-8").splitlines() if line.strip()]
    tin = sum(r["input_tokens"] for r in rows)
    tout = sum(r["output_tokens"] for r in rows)
    priced = bool(os.environ.get("LLM_PRICE_EUR_PER_MTOK_IN") or os.environ.get("LLM_PRICE_EUR_PER_MTOK_OUT"))
    return {
        "calls": len(rows),
        "input_tokens": tin,
        "output_tokens": tout,
        "eur_estimate": round(sum(r["eur_estimate"] for r in rows), 6),
        "priced": priced,
    }


def build_brief(plan: PlanResponse, scenario: ScenarioId) -> BriefResponse:
    facts = build_facts(plan, scenario)
    key = hashlib.sha256((NARRATIVE_MODEL + json.dumps(facts, sort_keys=True)).encode("utf-8")).hexdigest()
    cache_file = CACHE_DIR / f"{key}.json"
    if cache_file.exists():
        cached = json.loads(cache_file.read_text(encoding="utf-8"))
        return BriefResponse(**{**cached, "cached": True})

    # Live calls are opt-in so that demo runs and tests never spend the shared quota by accident.
    live = os.environ.get("STRATEGY_COMPILER_LLM") == "live" and bool(os.environ.get("ANTHROPIC_API_KEY"))
    if not live:
        return BriefResponse(
            scenario=scenario, text=_template(facts), drafted_by="template", cached=False, labels=LABELS
        )

    import anthropic  # imported lazily so the app runs without the SDK call path

    client = anthropic.Anthropic()
    started = time.time()
    msg = client.messages.create(
        model=NARRATIVE_MODEL,
        max_tokens=1200,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": json.dumps(facts, ensure_ascii=False)}],
    )
    text = "".join(block.text for block in msg.content if block.type == "text")
    tin, tout = int(msg.usage.input_tokens), int(msg.usage.output_tokens)
    usage = Usage(input_tokens=tin, output_tokens=tout, eur_estimate=_price_eur(tin, tout))
    _log_usage(
        {
            "ts": time.time(),
            "model": NARRATIVE_MODEL,
            "scenario": scenario,
            "input_tokens": tin,
            "output_tokens": tout,
            "eur_estimate": usage.eur_estimate,
            "latency_s": round(time.time() - started, 3),
        }
    )
    response = BriefResponse(
        scenario=scenario,
        text=text,
        drafted_by="claude",
        cached=False,
        model=NARRATIVE_MODEL,
        usage=usage,
        labels=LABELS,
    )
    # Never cache a brief that was cut off at the token cap.
    if msg.stop_reason != "max_tokens":
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(response.model_dump_json(exclude={"cached"}), encoding="utf-8")
    return response
