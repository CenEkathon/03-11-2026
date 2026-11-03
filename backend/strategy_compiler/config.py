"""Fixture loading, assumption resolution and fixed model constants.

Business logic lives in the other modules. Everything here is either a fixture read or a
constant that is not a business assumption (business assumptions live in fixtures/assumptions.yaml).
"""

from __future__ import annotations

import csv
import io
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
RESKILL_MAX_GAP = 2  # levels a person may be trained up by (scale 1 to 3)
ADJACENT_MIN_PROFICIENCY = 2  # same-family skill at this level counts as an adjacent skill
CONTRACTOR_MAX_SHARE = 0.30  # policy, not an assumption: contractors bridge at most 30% of a need
PLATFORM_START_MILESTONE = "M2"  # platform run cost starts with the pilot
# Payback is searched after the deadline by continuing the Dec 2028 run rate. Policy cap, not an assumption:
# if payback is not reached within this many months after the deadline, it is reported as not reached.
PAYBACK_MAX_MONTHS_AFTER_DEADLINE = 240
EPS = 1e-9

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
    "goal": "Goal, baseline and deadline",
    "roadmap": "Proposed roadmap, pending approval",
    "workforce": "Workforce records: IDs, teams, roles and skills",
    "assumptions": "Planning assumptions, editable",
    "vacancy_evidence": "2021 finance and insurance job postings (EN/NL/FR), deduplicated",
    "estimates": "Costs and benefits calculated from the planning assumptions",
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


def parse_workforce_csv(text: str) -> tuple[Employee, ...]:
    """Employees from the synthetic workforce CSV. skills_json and training_json hold JSON in one cell each."""
    reader = csv.DictReader(io.StringIO(text))
    employees = []
    for row in reader:
        employees.append(
            Employee(
                employee_id=row["employee_id"],
                team_id=row["team_id"],
                role=row["role"],
                fte=float(row["fte"]),
                availability=float(row["availability"]),
                skills={k: int(v) for k, v in json.loads(row["skills_json"]).items()},
                is_mock=_parse_bool(row["is_mock"]),
            )
        )
    return tuple(employees)


def _parse_bool(value: str) -> bool:
    if value.strip().lower() not in {"true", "false"}:
        raise ValueError(f"is_mock must be true or false, got {value!r}")
    return value.strip().lower() == "true"


@lru_cache(maxsize=None)
def load_employees() -> tuple[Employee, ...]:
    return parse_workforce_csv((FIXTURES_DIR / "workforce.csv").read_text(encoding="utf-8"))


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
