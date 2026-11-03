"""Scenario planner: fills each requirement's FTE month by month, in a scenario-specific source order.

Sources:
- redeploy : people already at or above the required proficiency, in contributing teams.
- reskill  : people 1 or 2 levels short with an adjacent same-family skill. Training (a fixed number of
             months) is scheduled before the requirement starts and consumes their programme capacity.
             If there is not enough lead time, the candidate is skipped and the requirement is flagged.
- external : a contractor bridge, capped at CONTRACTOR_MAX_SHARE (30%) of the requirement's FTE.
- hire     : hires start at max(requirement start, programme start + hire lead time). Headcount is the
             largest remaining need in the hire months, and coverage is full from the start month.

The planner only produces events (allocations, trainings, hires, unmet months). Costs are computed in
finance.py. The planner does no pricing.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .config import CONTRACTOR_MAX_SHARE, EPS, RESKILL_MAX_GAP, SCENARIO_META
from .contracts import Employee, Requirement, ScenarioId
from .demand import has_adjacent_skill
from .supply import Ledger
from .timeline import format_month, month_range, parse_month


@dataclass
class Allocation:
    scenario: ScenarioId
    requirement_id: str
    month: str
    source: str  # redeploy | reskill | external | hire
    employee_id: str | None
    fte: float


@dataclass
class TrainingEvent:
    scenario: ScenarioId
    requirement_id: str
    employee_id: str
    skill_id: str
    months: list[str]  # training months, all before the requirement starts


@dataclass
class HireEvent:
    scenario: ScenarioId
    requirement_id: str
    skill_id: str
    start: str
    months: list[str]  # months the hires are paid for (start to requirement end)
    headcount: float


@dataclass
class UnmetMonth:
    requirement_id: str
    milestone_id: str
    month: str
    unmet_fte: float
    reason: str  # hire_not_started | lead_time_too_short | no_eligible_supply


@dataclass
class RawScenario:
    scenario: ScenarioId
    allocations: list[Allocation] = field(default_factory=list)
    trainings: list[TrainingEvent] = field(default_factory=list)
    hires: list[HireEvent] = field(default_factory=list)
    covered: dict[str, dict[str, float]] = field(default_factory=dict)  # requirement -> month -> FTE
    unmet: list[UnmetMonth] = field(default_factory=list)


class _Planner:
    def __init__(
        self,
        scenario: ScenarioId,
        employees: list[Employee],
        contributing_teams: set[str],
        families: dict[str, str],
        a: dict[str, float],
        horizon: list[str],
    ) -> None:
        self.scenario = scenario
        self.policy: tuple[str, ...] = SCENARIO_META[scenario]["policy"]
        self.contributing = [e for e in employees if e.team_id in contributing_teams]
        self.families = families
        self.a = a
        self.horizon_start = parse_month(horizon[0])
        self.hire_available = self.horizon_start + int(a["hire_lead_time_months"])
        self.ledger = Ledger(employees, horizon, contributing_teams)
        self.eff: dict[str, dict[str, int]] = {e.employee_id: dict(e.skills) for e in employees}
        self.trained: set[tuple[str, str]] = set()
        self.raw = RawScenario(scenario=scenario)

    # ------------------------------------------------------------ helpers
    def _alloc(self, req_id: str, month: str, source: str, employee_id: str | None, fte: float) -> None:
        self.raw.allocations.append(Allocation(self.scenario, req_id, month, source, employee_id, fte))

    # ------------------------------------------------------------ sources
    def _redeploy(self, r: Requirement, months: list[str], covered: dict[str, float]) -> None:
        pool = [e.employee_id for e in self.contributing if self.eff[e.employee_id].get(r.skill_id, 0) >= r.min_proficiency]
        for m in months:
            need = r.fte - covered[m]
            if need <= EPS:
                continue
            cands = [eid for eid in pool if self.ledger.remaining(eid, m) > EPS]
            # best fit first: least proficiency above the requirement, then employee id
            cands.sort(key=lambda eid: (self.eff[eid][r.skill_id] - r.min_proficiency, eid))
            for eid in cands:
                if need <= EPS:
                    break
                take = min(need, self.ledger.remaining(eid, m))
                self.ledger.book(eid, m, take)
                self._alloc(r.id, m, "redeploy", eid, take)
                covered[m] += take
                need -= take

    def _reskill(self, r: Requirement, months: list[str], covered: dict[str, float]) -> bool:
        """Returns True if at least one candidate could not be trained in time (lead time)."""
        lead_blocked = False
        pool: list[tuple[int, str]] = []
        for e in self.contributing:
            level = self.eff[e.employee_id].get(r.skill_id, 0)
            gap = r.min_proficiency - level
            if gap < 1 or gap > RESKILL_MAX_GAP:
                continue
            if not has_adjacent_skill(self.eff[e.employee_id], r.skill_id, self.families):
                continue
            pool.append((gap, e.employee_id))
        pool.sort()
        t_months_needed = int(self.a["reskill_training_months"])
        req_start = parse_month(r.start)
        for m in months:
            need = r.fte - covered[m]
            if need <= EPS:
                continue
            for gap, eid in pool:
                if need <= EPS:
                    break
                key = (eid, r.id)
                if key not in self.trained:
                    train = [format_month(req_start - k) for k in range(t_months_needed, 0, -1)]
                    if any(parse_month(tm) < self.horizon_start for tm in train):
                        lead_blocked = True
                        continue
                    if any(self.ledger.remaining(eid, tm) <= EPS for tm in train):
                        continue  # programme capacity is busy during the training window
                    for tm in train:
                        self.ledger.consume_all(eid, tm)
                    self.eff[eid][r.skill_id] = max(self.eff[eid].get(r.skill_id, 0), r.min_proficiency)
                    self.trained.add(key)
                    self.raw.trainings.append(TrainingEvent(self.scenario, r.id, eid, r.skill_id, train))
                rem = self.ledger.remaining(eid, m)
                if rem <= EPS:
                    continue
                take = min(need, rem)
                self.ledger.book(eid, m, take)
                self._alloc(r.id, m, "reskill", eid, take)
                covered[m] += take
                need -= take
        return lead_blocked

    def _external(self, r: Requirement, months: list[str], covered: dict[str, float]) -> None:
        cap = CONTRACTOR_MAX_SHARE * r.fte
        for m in months:
            take = min(r.fte - covered[m], cap)
            if take > EPS:
                self._alloc(r.id, m, "external", None, take)
                covered[m] += take

    def _hire(self, r: Requirement, months: list[str], covered: dict[str, float]) -> None:
        start = max(parse_month(r.start), self.hire_available)
        hire_months = [m for m in months if parse_month(m) >= start]
        if not hire_months:
            return
        headcount = max(r.fte - covered[m] for m in hire_months)
        if headcount <= EPS:
            return
        for m in hire_months:
            need = r.fte - covered[m]
            if need > EPS:
                self._alloc(r.id, m, "hire", None, need)
                covered[m] += need
        self.raw.hires.append(
            HireEvent(self.scenario, r.id, r.skill_id, format_month(start), hire_months, headcount)
        )

    # ------------------------------------------------------------ main loop
    def run(self, requirements: list[Requirement]) -> RawScenario:
        for r in sorted(requirements, key=lambda x: (parse_month(x.start), x.id)):
            months = month_range(r.start, r.end)
            covered = {m: 0.0 for m in months}
            lead_blocked = False
            for source in self.policy:
                if source == "redeploy":
                    self._redeploy(r, months, covered)
                elif source == "reskill":
                    lead_blocked = self._reskill(r, months, covered) or lead_blocked
                elif source == "external":
                    self._external(r, months, covered)
                elif source == "hire":
                    self._hire(r, months, covered)
                else:
                    raise ValueError(f"unknown sourcing policy step: {source}")
            self.raw.covered[r.id] = covered

            hire_start = max(parse_month(r.start), self.hire_available) if "hire" in self.policy else None
            for m in months:
                unmet = r.fte - covered[m]
                if unmet <= EPS:
                    continue
                if hire_start is not None and parse_month(m) < hire_start:
                    reason = "hire_not_started"
                elif lead_blocked:
                    reason = "lead_time_too_short"
                else:
                    reason = "no_eligible_supply"
                self.raw.unmet.append(UnmetMonth(r.id, r.milestone_id, m, unmet, reason))
        return self.raw


def run_scenario(
    scenario: ScenarioId,
    requirements: list[Requirement],
    employees: list[Employee],
    contributing_teams: set[str],
    families: dict[str, str],
    a: dict[str, float],
    horizon: list[str],
) -> RawScenario:
    return _Planner(scenario, employees, contributing_teams, families, a, horizon).run(requirements)
