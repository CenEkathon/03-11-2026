"""Deterministic generator for the SYNTHETIC KBC-example workforce fixture.

Usage (from backend/):  uv run python tools/gen_workforce.py

Writes strategy_compiler/fixtures/workforce.csv. Every record is fictional: IDs only, no names,
no personal or sensitive attributes. Skill profiles are assumptions that shape the demo supply.

Columns: employee_id, team_id, role, grade, fte, availability, cost_band, is_mock, skills_json, training_json.
skills_json is a JSON object (skill_id -> proficiency 1..5). training_json is a JSON list of training records.
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
    "grade",
    "fte",
    "availability",
    "cost_band",
    "is_mock",
    "skills_json",
    "training_json",
]

# core: skill -> (min, max) proficiency, always present
# secondary: skill -> (min, max, probability) present with probability p
TEAMS: dict[str, dict] = {
    "AML-OPS": {
        "size": 80, "avail": (0.30, 0.50),
        "roles": ["KYC analyst", "Alert triage analyst", "Senior KYC reviewer", "Team lead"],
        "core": {"kyc": (3, 5), "aml_monitoring": (2, 4), "sanctions_screening": (2, 4),
                 "suspicious_activity_reporting": (2, 4), "document_review": (2, 4)},
        "secondary": {"case_quality_assurance": (2, 4, 0.6), "fraud_prevention": (1, 3, 0.25),
                      "customer_operations": (2, 4, 0.25), "python": (1, 2, 0.15), "data_analysis": (1, 2, 0.15)},
    },
    "FCC": {
        "size": 25, "avail": (0.40, 0.60),
        "roles": ["Compliance officer", "AML policy adviser", "Compliance analyst"],
        "core": {"regulatory_compliance": (3, 5), "ai_act_gdpr_compliance": (2, 4), "ai_governance": (2, 4),
                 "risk_assessment": (3, 5), "kyc": (2, 4), "aml_monitoring": (2, 4)},
        "secondary": {"internal_audit": (2, 4, 0.5), "stakeholder_management": (2, 4, 0.5)},
    },
    "DATA-ENG": {
        "size": 40, "avail": (0.40, 0.60),
        "roles": ["Data engineer", "ETL developer", "Data platform developer"],
        "core": {"data_engineering": (3, 5), "sql": (3, 5), "python": (2, 4), "data_quality": (2, 4),
                 "data_governance": (2, 4), "cloud_data_platforms": (2, 4)},
        "secondary": {"devops": (1, 3, 0.5), "mlops": (1, 3, 0.5), "machine_learning": (1, 2, 0.3),
                      "data_analysis": (2, 3, 0.3)},
    },
    "DS-AI": {
        "size": 30, "avail": (0.50, 0.70),
        "roles": ["Data scientist", "Machine learning engineer", "NLP engineer"],
        "core": {"machine_learning": (3, 5), "python": (3, 5), "statistical_modelling": (3, 5),
                 "artificial_intelligence": (3, 5), "generative_ai": (2, 4), "data_analysis": (2, 4),
                 "mlops": (2, 3)},
        "secondary": {"nlp": (2, 5, 0.7), "sql": (2, 4, 0.3), "data_engineering": (1, 2, 0.3)},
    },
    "MRV": {
        "size": 20, "avail": (0.30, 0.50),
        "roles": ["Model validator", "Model risk analyst", "Quantitative analyst"],
        "core": {"model_validation": (3, 5), "model_risk_management": (2, 4), "statistical_modelling": (3, 5),
                 "explainable_ai": (2, 4), "python": (2, 4)},
        "secondary": {"ai_governance": (2, 4, 0.7), "machine_learning": (2, 3, 0.3)},
    },
    "PLAT": {
        "size": 40, "avail": (0.30, 0.50),
        "roles": ["Cloud engineer", "Platform engineer", "Security engineer", "Solution architect"],
        "core": {"cloud_data_platforms": (3, 5), "devops": (2, 4), "cyber_security": (2, 4),
                 "identity_access_management": (2, 4)},
        "secondary": {"solution_architecture": (2, 4, 0.6), "python": (2, 3, 0.5), "mlops": (1, 2, 0.3)},
    },
    "DIGI": {
        "size": 30, "avail": (0.40, 0.60),
        "roles": ["Product owner", "Scrum master", "Business analyst", "Change consultant"],
        "core": {"product_ownership": (3, 5), "agile_delivery": (3, 5), "change_management": (3, 5),
                 "stakeholder_management": (3, 5), "process_redesign": (2, 4)},
        "secondary": {"solution_architecture": (2, 4, 0.5), "customer_operations": (2, 3, 0.4)},
    },
    "RISK": {
        "size": 35, "avail": (0.30, 0.50),
        "roles": ["Risk analyst", "Regulatory reporting analyst", "Credit risk analyst"],
        "core": {"credit_risk": (3, 5), "risk_assessment": (3, 5), "regulatory_compliance": (2, 4),
                 "data_analysis": (2, 4), "sql": (2, 4)},
        "secondary": {"internal_audit": (2, 4, 0.5), "data_governance": (2, 4, 0.6)},
    },
}

COURSES = [
    ("CRS-PY-01", "Python for analysts", 3),
    ("CRS-ML-01", "Machine learning fundamentals", 5),
    ("CRS-AML-01", "AML typologies workshop", 2),
    ("CRS-AI-01", "AI Act awareness", 1),
    ("CRS-CLD-01", "Cloud fundamentals", 3),
    ("CRS-DQ-01", "Data quality practitioner", 3),
    ("CRS-PO-01", "Agile product ownership", 2),
    ("CRS-MR-01", "Model risk management basics", 2),
]


def _months_between(rng: random.Random) -> str:
    year = rng.choice([2025, 2026])
    month = rng.randint(1, 12) if year == 2025 else rng.randint(1, 9)
    return f"{year}-{month:02d}"


def build(seed: int = SEED) -> list[dict]:
    rng = random.Random(seed)
    employees: list[dict] = []
    counter = 0
    grade_for_band = {"A": "G4", "B": "G5", "C": "G6", "D": "G7"}
    for team_id, profile in TEAMS.items():
        for _ in range(profile["size"]):
            counter += 1
            skills: dict[str, int] = {}
            for skill_id, (lo, hi) in profile["core"].items():
                skills[skill_id] = rng.randint(lo, hi)
            for skill_id, (lo, hi, p) in profile["secondary"].items():
                if rng.random() < p:
                    skills[skill_id] = rng.randint(lo, hi)
            band = rng.choices(["A", "B", "C", "D"], weights=[3, 4, 2, 1])[0]
            training = []
            for course_id, label, days in rng.sample(COURSES, k=rng.randint(0, 3)):
                training.append({"course_id": course_id, "course_label": label,
                                 "completed": _months_between(rng), "days": float(days)})
            employees.append({
                "employee_id": f"EMP-{counter:04d}",
                "team_id": team_id,
                "role": rng.choice(profile["roles"]),
                "grade": grade_for_band[band],
                "fte": 0.8 if rng.random() < 0.15 else 1.0,
                "availability": round(rng.uniform(*profile["avail"]), 2),
                "skills": dict(sorted(skills.items())),
                "training_history": training,
                "cost_band": band,
                "is_mock": True,
            })
    return employees


def to_row(e: dict) -> dict[str, str]:
    return {
        "employee_id": e["employee_id"],
        "team_id": e["team_id"],
        "role": e["role"],
        "grade": e["grade"],
        "fte": f"{e['fte']:g}",
        "availability": f"{e['availability']:.2f}",
        "cost_band": e["cost_band"],
        "is_mock": "true",
        "skills_json": json.dumps(e["skills"], ensure_ascii=False, sort_keys=True),
        "training_json": json.dumps(e["training_history"], ensure_ascii=False),
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
