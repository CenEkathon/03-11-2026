"""Fixture loading, assumption resolution and fixed model constants.

Business logic lives in the other modules. Everything here is either a fixture read or a
constant that is not a business assumption (business assumptions live in fixtures/assumptions.yaml).
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from .contracts import (
    Assumption,
    CaseId,
    Company,
    Employee,
    Goal,
    Milestone,
    Taxonomy,
    VacancyEvidence,
)

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"

WORKING_DAYS_PER_MONTH = 20
RESKILL_MAX_GAP = 2  # proficiency levels a person may be trained up by
ADJACENT_MIN_PROFICIENCY = 2  # same-family skill at this level counts as an adjacent skill
EXTENDED_VIEW_MONTHS = 60  # payback view beyond the deadline (labelled extrapolation)
PLATFORM_START_MILESTONE = "M3"  # platform run cost starts with the pilot
HIRE_SALARY_BAND = "C"
EPS = 1e-9

# MOCK salary bands, EUR per year. Not company data. Scaled by the salary_multiplier assumption.
SALARY_BANDS_EUR: dict[str, float] = {"A": 52_000.0, "B": 64_000.0, "C": 78_000.0, "D": 95_000.0}

SCENARIO_META: dict[str, dict[str, Any]] = {
    "reskill_led": {
        "label": "Reskill-led",
        "description": "Reskill first (training ahead of need), then redeploy, then a capped contractor bridge, then hire the remainder.",
        "policy": ("reskill", "redeploy", "external", "hire"),
    },
    "hire_led": {
        "label": "Hire-led",
        "description": "Hire first for each requirement, then a capped contractor bridge, then redeploy and reskill for any remainder.",
        "policy": ("hire", "external", "redeploy", "reskill"),
    },
    "hybrid": {
        "label": "Hybrid (recommended)",
        "description": "Redeploy first, then reskill where lead time allows, then a capped contractor bridge, then hire the remainder.",
        "policy": ("redeploy", "reskill", "external", "hire"),
    },
}

LABELS: dict[str, str] = {
    "goal": "MOCK GOAL: fictional Northwind Bank",
    "roadmap": "MOCK ROADMAP: proposed plan requiring approval",
    "workforce": "SYNTHETIC WORKFORCE: fictional employees, no real people",
    "assumptions": "MOCK ASSUMPTIONS: illustrative, editable, not company figures",
    "vacancy_evidence": "EXTERNAL OBSERVATION: 2021 finance and insurance vacancies (EN/NL/FR), deduplicated",
    "estimates": "ESTIMATE: costs and benefits are modelled from mock assumptions",
}


def _read_json(name: str) -> Any:
    return json.loads((FIXTURES_DIR / name).read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def load_company() -> Company:
    return Company.model_validate(_read_json("company.json"))


@lru_cache(maxsize=None)
def load_goal() -> Goal:
    return Goal.model_validate(_read_json("goal.json"))


@lru_cache(maxsize=None)
def load_milestones() -> tuple[Milestone, ...]:
    return tuple(Milestone.model_validate(m) for m in _read_json("roadmap.json")["milestones"])


@lru_cache(maxsize=None)
def load_requirement_specs() -> tuple[dict[str, Any], ...]:
    """Raw requirement rows without start and end. Windows come from the milestone (see demand.py)."""
    return tuple(_read_json("requirements.json")["requirements"])


@lru_cache(maxsize=None)
def load_taxonomy() -> Taxonomy:
    return Taxonomy.model_validate(_read_json("taxonomy.json"))


@lru_cache(maxsize=None)
def load_employees() -> tuple[Employee, ...]:
    return tuple(Employee.model_validate(e) for e in _read_json("workforce.json")["employees"])


@lru_cache(maxsize=None)
def load_assumption_defs() -> dict[str, Assumption]:
    raw = yaml.safe_load((FIXTURES_DIR / "assumptions.yaml").read_text(encoding="utf-8"))
    defs = [Assumption.model_validate(a) for a in raw["assumptions"]]
    return {a.key: a for a in defs}


def resolve_assumptions(case: CaseId, overrides: dict[str, float] | None = None) -> dict[str, float]:
    """Values for one case (low | base | high) with optional per-key overrides."""
    defs = load_assumption_defs()
    values = {key: float(getattr(a, case)) for key, a in defs.items()}
    for key, value in (overrides or {}).items():
        if key not in defs:
            raise KeyError(f"unknown assumption: {key}")
        values[key] = float(value)
    return values


@lru_cache(maxsize=None)
def load_vacancy_evidence() -> tuple[VacancyEvidence, ...]:
    """Aggregated external evidence written by the ETL. Empty tuple if the ETL has not run yet."""
    path = FIXTURES_DIR / "vacancy_evidence.json"
    if not path.exists():
        return ()
    return tuple(VacancyEvidence.model_validate(r) for r in json.loads(path.read_text(encoding="utf-8"))["rows"])
