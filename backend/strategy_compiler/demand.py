"""Demand: requirements per milestone (FTE by month) and skill-fit evidence.

Requirement FTE, roles and minimum proficiency are MOCK assumptions (fixtures/requirements.json).
Vacancy evidence is EXTERNAL OBSERVATION (2021) and is shown beside them, never used as arithmetic input.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Sequence
from typing import Any

from .config import ADJACENT_MIN_PROFICIENCY, RESKILL_MAX_GAP
from .contracts import Employee, Milestone, Requirement, SkillFit, VacancyEvidence
from .timeline import month_range


def expand_requirements(specs: Iterable[dict[str, Any]], milestones: Sequence[Milestone]) -> list[Requirement]:
    """Attach each requirement to its milestone window."""
    by_id = {m.id: m for m in milestones}
    out: list[Requirement] = []
    for spec in specs:
        m = by_id.get(spec["milestone_id"])
        if m is None:
            raise ValueError(f"requirement {spec['id']} points to unknown milestone {spec['milestone_id']}")
        out.append(Requirement(**spec, start=m.start, end=m.end))
    return out


def required_fte_by_month(requirements: Iterable[Requirement]) -> dict[str, float]:
    totals: dict[str, float] = {}
    for r in requirements:
        for month in month_range(r.start, r.end):
            totals[month] = totals.get(month, 0.0) + r.fte
    return totals


def vacancy_share(skill_id: str, evidence: Sequence[VacancyEvidence]) -> float | None:
    """Posting-weighted mean share of 2021 deduplicated postings that mention the skill."""
    rows = [e for e in evidence if e.skill_id == skill_id]
    weight = sum(e.postings_in_cell for e in rows)
    if not rows or weight == 0:
        return None
    return sum(e.share * e.postings_in_cell for e in rows) / weight


def has_adjacent_skill(skills: dict[str, int], skill_id: str, families: dict[str, str]) -> bool:
    """True if the person holds a same-family skill (other than skill_id) at ADJACENT_MIN_PROFICIENCY or above."""
    family = families.get(skill_id)
    return any(
        other != skill_id and families.get(other) == family and level >= ADJACENT_MIN_PROFICIENCY
        for other, level in skills.items()
    )


def skill_fit(
    requirement: Requirement,
    employees: Sequence[Employee],
    contributing_teams: set[str],
    families: dict[str, str],
    evidence: Sequence[VacancyEvidence],
) -> SkillFit:
    """Supply evidence for one requirement. Counts use contributing teams only, as the planner does."""
    mn = requirement.min_proficiency
    pool = [e for e in employees if e.team_id in contributing_teams]
    eligible = [e for e in pool if e.skills.get(requirement.skill_id, 0) >= mn]
    reskill = [
        e
        for e in pool
        if 1 <= mn - e.skills.get(requirement.skill_id, 0) <= RESKILL_MAX_GAP
        and has_adjacent_skill(e.skills, requirement.skill_id, families)
    ]
    team_counts = Counter(e.team_id for e in eligible)
    return SkillFit(
        requirement_id=requirement.id,
        skill_id=requirement.skill_id,
        eligible_now=len(eligible),
        reskill_candidates=len(reskill),
        evidence_employee_ids=sorted(e.employee_id for e in eligible)[:5],
        team_coverage=dict(sorted(team_counts.items())),
        vacancy_evidence_share=vacancy_share(requirement.skill_id, evidence),
        mapping_confidence=1.0,  # requirements name curated taxonomy ids directly
    )
