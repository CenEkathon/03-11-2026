"""Deterministic generator for the SYNTHETIC workforce fixture (about 60 fictional people).

Usage (from backend/):  uv run python tools/gen_workforce.py

Writes strategy_compiler/fixtures/workforce.csv. Every record is fictional: IDs only, no names,
no personal or sensitive attributes. Skill profiles are assumptions that shape the demo supply.

Columns: employee_id, team_id, role, fte, availability, is_mock, skills_json.
skills_json is a JSON object (skill_id -> level 1 basic, 2 working, 3 expert).
The loader in config.py parses this file; the label that used to sit in a _meta block lives in config.LABELS.
"""

from __future__ import annotations

import csv
import json
import random
from pathlib import Path

SEED = 20261103
OUT = Path(__file__).resolve().parents[1] / "strategy_compiler" / "fixtures" / "workforce.csv"
COLUMNS = [
    "employee_id",
    "team_id",
    "role",
    "fte",
    "availability",
    "is_mock",
    "skills_json",
]

# core: skill -> (min, max) level, always present
# secondary: skill -> (min, max, probability) present with probability p
TEAMS: dict[str, dict] = {
    "AML-OPS": {
        "size": 24, "avail": (0.25, 0.40),
        "roles": ["KYC analyst", "Alert triage analyst", "Senior KYC reviewer"],
        "core": {"kyc": (2, 3)},
        "secondary": {"aml_monitoring": (1, 3, 0.6), "change_management": (1, 2, 0.1)},
    },
    "DATA-ENG": {
        "size": 14, "avail": (0.30, 0.50),
        "roles": ["Data engineer", "ETL developer"],
        "core": {"data_engineering": (2, 3), "data_quality": (2, 3), "python": (2, 3)},
        "secondary": {"machine_learning": (1, 2, 0.3)},
    },
    "DATA-SCI": {
        "size": 8, "avail": (0.40, 0.60),
        "roles": ["Data scientist", "Machine learning engineer"],
        "core": {"machine_learning": (2, 3), "python": (3, 3)},
        "secondary": {"data_engineering": (1, 2, 0.4), "model_validation": (1, 2, 0.3)},
    },
    "COMPLIANCE": {
        "size": 9, "avail": (0.30, 0.50),
        "roles": ["Compliance adviser", "Model risk analyst", "Model validator"],
        "core": {"ai_governance": (2, 3)},
        "secondary": {"model_validation": (2, 3, 0.7), "kyc": (1, 2, 0.3), "aml_monitoring": (1, 2, 0.4)},
    },
    "CHANGE": {
        "size": 5, "avail": (0.30, 0.50),
        "roles": ["Change lead", "Business analyst"],
        "core": {"change_management": (2, 3)},
        "secondary": {"ai_governance": (1, 1, 0.3), "kyc": (1, 2, 0.5)},
    },
}


def build(seed: int = SEED) -> list[dict]:
    rng = random.Random(seed)
    employees: list[dict] = []
    counter = 0
    for team_id, profile in TEAMS.items():
        for _ in range(profile["size"]):
            counter += 1
            skills: dict[str, int] = {}
            for skill_id, (lo, hi) in profile["core"].items():
                skills[skill_id] = rng.randint(lo, hi)
            for skill_id, (lo, hi, p) in profile["secondary"].items():
                if rng.random() < p:
                    skills[skill_id] = rng.randint(lo, hi)
            employees.append({
                "employee_id": f"EMP-{counter:04d}",
                "team_id": team_id,
                "role": rng.choice(profile["roles"]),
                "fte": 1.0,
                "availability": round(rng.uniform(*profile["avail"]), 2),
                "skills": dict(sorted(skills.items())),
                "is_mock": True,
            })
    return employees


def to_row(e: dict) -> dict[str, str]:
    return {
        "employee_id": e["employee_id"],
        "team_id": e["team_id"],
        "role": e["role"],
        "fte": f"{e['fte']:g}",
        "availability": f"{e['availability']:.2f}",
        "is_mock": "true",
        "skills_json": json.dumps(e["skills"], ensure_ascii=False, sort_keys=True),
    }


def main() -> None:
    employees = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=COLUMNS, lineterminator="\n")
        writer.writeheader()
        for e in employees:
            writer.writerow(to_row(e))
    print(f"wrote {len(employees)} synthetic employees to {OUT}")


if __name__ == "__main__":
    main()
