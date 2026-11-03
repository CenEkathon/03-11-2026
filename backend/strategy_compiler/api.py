"""Thin FastAPI layer. No business logic here: it validates input, calls the engine, and returns JSON.

All responses are labelled MOCK, SYNTHETIC or EXTERNAL where they carry such data.
Run: uv run uvicorn strategy_compiler.api:app --reload --port 8000
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .config import (
    LABELS,
    load_assumption_defs,
    load_company,
    load_employees,
    load_goal,
    load_milestones,
    load_taxonomy,
    load_vacancy_evidence,
    resolve_assumptions,
)
from .contracts import (
    BriefRequest,
    BriefResponse,
    PlanRequest,
    PlanResponse,
    SensitivityRow,
    VacancyEvidence,
)
from .engine import compute_plan, run_sensitivity
from .narrative import build_brief, usage_summary
from .roadmap import RoadmapError

app = FastAPI(
    title="Strategy Compiler (MOCK hackathon demo)",
    version="0.1.0",
    description="MOCK goal, MOCK roadmap, SYNTHETIC workforce, ESTIMATED finance. KBC is used only as an illustrative example name. Nothing describes KBC's real strategy, staff or figures.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AssumptionUpdate(BaseModel):
    """Client-side overrides. The server validates them and returns effective base-case values (stateless)."""

    overrides: dict[str, float] = Field(default_factory=dict)


@app.exception_handler(RoadmapError)
async def _roadmap_error(_: Any, exc: RoadmapError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": "invalid roadmap", "validation": exc.validation.model_dump()})


@app.exception_handler(KeyError)
async def _unknown_key(_: Any, exc: KeyError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc.args[0]) if exc.args else "unknown key"})


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "labels": "MOCK"}


@app.get("/api/case")
def case() -> dict[str, Any]:
    return {
        "company": load_company().model_dump(),
        "goal": load_goal().model_dump(),
        "milestones": [m.model_dump() for m in load_milestones()],
        "labels": LABELS,
    }


@app.post("/api/plan/compute", response_model=PlanResponse)
def plan_compute(req: PlanRequest) -> PlanResponse:
    try:
        return compute_plan(req)
    except RoadmapError:
        raise
    except KeyError as exc:
        raise HTTPException(status_code=422, detail=str(exc.args[0])) from exc


@app.post("/api/plan/sensitivity", response_model=list[SensitivityRow])
def plan_sensitivity(req: PlanRequest) -> list[SensitivityRow]:
    return run_sensitivity(req)


@app.get("/api/skills")
def skills() -> dict[str, Any]:
    tax = load_taxonomy()
    return {
        "skills": [{"id": s.id, "label": s.label, "family": s.family, "esco_uri": s.esco_uri} for s in tax.skills],
        "labels": {"taxonomy": "MOCK / CURATED v1 (ESCO-aligned labels, not an official ESCO export)"},
    }


@app.get("/api/evidence/{skill_id}")
def evidence(skill_id: str, country: str | None = None, family: str | None = None) -> dict[str, Any]:
    tax = {s.id: s for s in load_taxonomy().skills}
    if skill_id not in tax:
        raise HTTPException(status_code=404, detail=f"unknown skill {skill_id}")
    if family is not None and family != tax[skill_id].family:
        raise HTTPException(status_code=422, detail="family does not match the skill")
    rows: list[VacancyEvidence] = [
        r
        for r in load_vacancy_evidence()
        if r.skill_id == skill_id and (country is None or r.country == country)
    ]
    return {
        "skill_id": skill_id,
        "family": tax[skill_id].family,
        "rows": [r.model_dump() for r in rows],
        "labels": {"source": LABELS["vacancy_evidence"]},
    }


@app.get("/api/workforce/summary")
def workforce_summary() -> dict[str, Any]:
    """Aggregate only: headcount and skill counts per team. No IDs, no names."""
    company = load_company()
    employees = load_employees()
    teams = []
    for team in company.teams:
        members = [e for e in employees if e.team_id == team.id]
        skill_counts: dict[str, int] = {}
        for e in members:
            for skill_id, level in e.skills.items():
                if level >= 3:
                    skill_counts[skill_id] = skill_counts.get(skill_id, 0) + 1
        teams.append(
            {
                "team_id": team.id,
                "name": team.name,
                "contributing": team.contributing,
                "headcount": len(members),
                "skills_at_level_3_plus": dict(sorted(skill_counts.items())),
            }
        )
    return {"teams": teams, "total_headcount": len(employees), "labels": {"workforce": LABELS["workforce"]}}


@app.get("/api/workforce/team/{team_id}")
def workforce_team(team_id: str) -> dict[str, Any]:
    """Synthetic roster for evidence. Skills and roles only; no availability ranking, no names."""
    company = load_company()
    if team_id not in {t.id for t in company.teams}:
        raise HTTPException(status_code=404, detail=f"unknown team {team_id}")
    members = [e for e in load_employees() if e.team_id == team_id]
    return {
        "team_id": team_id,
        "members": [
            {"employee_id": e.employee_id, "role": e.role, "grade": e.grade, "skills": e.skills}
            for e in members
        ],
        "labels": {"workforce": LABELS["workforce"]},
    }


@app.get("/api/assumptions")
def assumptions() -> dict[str, Any]:
    defs = load_assumption_defs()
    base = resolve_assumptions("base")
    return {
        "assumptions": [
            {**a.model_dump(), "base_effective": base[a.key]} for a in defs.values()
        ],
        "labels": {"assumptions": LABELS["assumptions"]},
    }


@app.put("/api/assumptions")
def assumptions_update(body: AssumptionUpdate) -> dict[str, Any]:
    effective = resolve_assumptions("base", body.overrides)  # raises KeyError for unknown keys
    return {"overrides": body.overrides, "effective_base": effective, "persisted": False}


@app.post("/api/brief", response_model=BriefResponse)
def brief(req: BriefRequest) -> BriefResponse:
    plan = compute_plan(
        PlanRequest(
            case=req.case,
            scenarios=[req.scenario],
            milestone_dates=req.milestone_dates,
            assumption_overrides=req.assumption_overrides,
        )
    )
    return build_brief(plan, req.scenario)


@app.get("/api/usage")
def usage() -> dict[str, Any]:
    return usage_summary()
