"""Roadmap validation (dependencies, horizon, cycles) and adoption ramp.

Dependencies are finish-to-start: a milestone must start after every predecessor ends.
Adoption: the share reached at the end of a milestone is its adoption_share_target. It ramps
linearly from the previous target across the milestone's months.
"""

from __future__ import annotations

from collections.abc import Sequence

from .contracts import DagValidation, Milestone, MilestoneDates
from .timeline import parse_month


class RoadmapError(ValueError):
    def __init__(self, validation: DagValidation) -> None:
        super().__init__("; ".join(validation.errors))
        self.validation = validation


def apply_dates(
    milestones: Sequence[Milestone], dates: dict[str, MilestoneDates] | None
) -> list[Milestone]:
    """Return copies of the milestones with edited start/end dates applied."""
    if not dates:
        return [m.model_copy() for m in milestones]
    known = {m.id for m in milestones}
    unknown = sorted(set(dates) - known)
    if unknown:
        raise RoadmapError(DagValidation(ok=False, errors=[f"unknown milestone ids: {', '.join(unknown)}"]))
    out: list[Milestone] = []
    for m in milestones:
        d = dates.get(m.id)
        out.append(m.model_copy(update={"start": d.start, "end": d.end}) if d else m.model_copy())
    return out


def validate_roadmap(milestones: Sequence[Milestone], horizon_start: str, horizon_end: str) -> DagValidation:
    errors: list[str] = []
    ids = [m.id for m in milestones]
    if len(set(ids)) != len(ids):
        errors.append("duplicate milestone ids")

    parsed: dict[str, tuple[int, int]] = {}
    for m in milestones:
        try:
            parsed[m.id] = (parse_month(m.start), parse_month(m.end))
        except ValueError as exc:
            errors.append(f"{m.id}: {exc}")
    if errors:
        return DagValidation(ok=False, errors=errors)

    h0, h1 = parse_month(horizon_start), parse_month(horizon_end)
    by_id = {m.id: m for m in milestones}
    for m in milestones:
        s, e = parsed[m.id]
        if e < s:
            errors.append(f"{m.id}: end {m.end} is before start {m.start}")
        if s < h0 or e > h1:
            errors.append(f"{m.id}: {m.start}..{m.end} is outside the horizon {horizon_start}..{horizon_end}")
        for dep_id in m.depends_on:
            dep = by_id.get(dep_id)
            if dep is None:
                errors.append(f"{m.id}: unknown dependency {dep_id}")
                continue
            if s <= parsed[dep_id][1]:
                errors.append(
                    f"{m.id} starts {m.start}, which is not after {dep_id} ends {dep.end} (finish-to-start)"
                )

    indegree = {i: 0 for i in by_id}
    children: dict[str, list[str]] = {i: [] for i in by_id}
    for m in milestones:
        for dep_id in m.depends_on:
            if dep_id in by_id:
                indegree[m.id] += 1
                children[dep_id].append(m.id)
    queue = [i for i, d in indegree.items() if d == 0]
    seen = 0
    while queue:
        node = queue.pop()
        seen += 1
        for child in children[node]:
            indegree[child] -= 1
            if indegree[child] == 0:
                queue.append(child)
    if seen != len(by_id):
        errors.append("dependency cycle detected")

    return DagValidation(ok=not errors, errors=errors)


def _previous_target(ms_sorted: Sequence[Milestone], before_index: int) -> float:
    prior = [m for m in ms_sorted if parse_month(m.end) < before_index]
    return prior[-1].adoption_share_target if prior else 0.0


def adoption_by_month(milestones: Sequence[Milestone], months: Sequence[str]) -> dict[str, float]:
    """AI-assisted share of reviews per month (before the coverage adjustment)."""
    ms_sorted = sorted(milestones, key=lambda m: parse_month(m.start))
    out: dict[str, float] = {}
    for month in months:
        mi = parse_month(month)
        active = [m for m in ms_sorted if parse_month(m.start) <= mi <= parse_month(m.end)]
        if active:
            m = active[0]
            start = parse_month(m.start)
            length = parse_month(m.end) - start + 1
            step = mi - start + 1
            prev = _previous_target(ms_sorted, start)
            out[month] = prev + (m.adoption_share_target - prev) * step / length
        else:
            out[month] = _previous_target(ms_sorted, mi)
    return out
