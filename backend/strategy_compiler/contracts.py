"""Shared contracts (pydantic). The API schema is generated from these models.

Labelling rule: every goal, roadmap, workforce record and financial figure is MOCK / SYNTHETIC
unless its `source` says `observed` (external vacancy sample, 2021). Never imply that mock data
describes a real company or real people.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------- primitives
Source = Literal["observed", "inferred", "assumed"]
CaseId = Literal["low", "base", "high"]
ScenarioId = Literal["reskill_led", "hire_led", "hybrid"]
ActionType = Literal["redeploy", "reskill", "external", "hire"]
MappingMethod = Literal[
    "alias_title", "alias_description", "generic_title", "generic_description", "unmapped"
]
ShortfallReason = Literal["no_eligible_supply", "lead_time_too_short", "hire_not_started"]
Lang = Literal["en", "nl"]
Confidence = Literal["low", "medium", "high"]

REVIEW_FLAG = "HR / legal / employee-representation review required"


class Explanation(BaseModel):
    """Every number carries its formula, inputs, source and confidence."""

    formula: str
    inputs: dict[str, float | str]
    source: Source | Literal["mock_assumption"]
    confidence: Confidence


# ---------------------------------------------------------------- taxonomy & evidence (external / inferred)
class Skill(BaseModel):
    id: str
    label: str
    family: str
    esco_uri: str | None = None
    aliases: dict[str, list[str]]
    generic_aliases: dict[str, list[str]] = Field(default_factory=dict)


class Taxonomy(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    meta: dict[str, Any] = Field(default_factory=dict, alias="_meta")
    skills: list[Skill]


class SkillMapping(BaseModel):
    """Original phrase is always kept; uncertain matches are unmapped, never forced."""

    original_phrase: str
    skill_id: str | None
    method: MappingMethod
    confidence: float = Field(ge=0.0, le=1.0)
    posting_id: str | None = None


class VacancyEvidence(BaseModel):
    """External observation: deduplicated 2021 finance/insurance postings (EN/NL/FR)."""

    skill_id: str
    family: str
    country: str  # GB | NL | BE | LU
    year_month: str  # YYYY-MM
    postings: int
    postings_in_cell: int
    share: float
    sample_vacancy_ids: list[str] = Field(default_factory=list)
    source: Literal["observed"] = "observed"


# ---------------------------------------------------------------- mock goal, roadmap, company
class Metric(BaseModel):
    name: str
    target: float
    unit: str


class GoalBaseline(BaseModel):
    reviews_per_year: float
    cost_per_review_eur: float
    ai_assisted_share: float


class GoalTarget(BaseModel):
    ai_assisted_share: float
    cost_per_review_reduction_pct: float


class Goal(BaseModel):
    title: str
    company_id: str
    statement: str
    baseline: GoalBaseline
    target: GoalTarget
    deadline: str  # YYYY-MM-DD
    horizon_start: str  # YYYY-MM
    horizon_end: str  # YYYY-MM
    constraints: list[str]
    is_mock: Literal[True] = True


class Milestone(BaseModel):
    id: str
    name: str
    description: str
    start: str  # YYYY-MM
    end: str  # YYYY-MM, inclusive
    depends_on: list[str] = Field(default_factory=list)
    owner_team: str
    metric: Metric
    adoption_share_target: float  # AI-assisted share reached at the end of the milestone
    change_cost_eur: float = Field(default=0.0, ge=0)  # mock one-off change budget, spread over the milestone
    is_mock: Literal[True] = True


class MilestoneDates(BaseModel):
    start: str
    end: str


class Team(BaseModel):
    id: str
    name: str
    contributing: bool  # may release people to programme work
    is_mock: Literal[True] = True


class Company(BaseModel):
    id: str
    name: str
    description: str
    is_mock: Literal[True] = True
    teams: list[Team]


class Requirement(BaseModel):
    id: str
    milestone_id: str
    role: str
    skill_id: str
    min_proficiency: int = Field(ge=1, le=3)  # 1 basic, 2 working, 3 expert
    fte: float = Field(gt=0)
    start: str
    end: str
    source: Source = "assumed"
    confidence: Confidence = "medium"
    rationale: str


# ---------------------------------------------------------------- synthetic workforce
class Employee(BaseModel):
    """Synthetic. No names, no sensitive attributes. Matching uses skills, proficiency, availability only."""

    employee_id: str
    team_id: str
    role: str
    fte: float
    availability: float = Field(ge=0, le=1)  # share of FTE available for programme work
    skills: dict[str, int]  # skill_id -> level 1 basic, 2 working, 3 expert
    is_mock: Literal[True] = True


# ---------------------------------------------------------------- assumptions
class Assumption(BaseModel):
    key: str
    label: str
    unit: str
    low: float
    base: float
    high: float
    rationale: str
    confidence: Confidence
    is_mock: Literal[True] = True
    # low = conservative (worse for ROI, e.g. higher cost); high = optimistic.


# ---------------------------------------------------------------- plan outputs
class SkillFit(BaseModel):
    requirement_id: str
    skill_id: str
    eligible_now: int  # employees with proficiency >= min
    reskill_candidates: int  # gap 1-2 with an adjacent skill in the same family
    evidence_employee_ids: list[str] = Field(default_factory=list)  # max 5, evidence only
    team_coverage: dict[str, int]  # team_id -> eligible count
    vacancy_evidence_share: float | None  # observed 2021 share across countries (external)
    mapping_confidence: float  # taxonomy mapping confidence for the skill label


class ActionLine(BaseModel):
    id: str
    scenario: ScenarioId
    type: ActionType
    requirement_id: str
    milestone_id: str
    skill_id: str
    fte: float
    people_count: int
    employee_ids: list[str] = Field(default_factory=list)  # evidence only (redeploy / reskill)
    skills_gained: list[str] = Field(default_factory=list)
    start: str
    duration_months: int
    depends_on: list[str] = Field(default_factory=list)
    one_off_cost_eur: float
    recurring_cost_eur: float
    is_estimate: Literal[True] = True
    rationale: str
    explanation: Explanation


class Shortfall(BaseModel):
    requirement_id: str
    milestone_id: str
    skill_id: str
    months: list[str]
    unmet_fte_months: float
    reason: ShortfallReason


class MonthlyPoint(BaseModel):
    month: str
    required_fte: float
    staffed_fte: float
    coverage: float
    adoption_share: float
    benefit_eur: float
    cost_one_off_eur: float
    cost_recurring_eur: float
    net_eur: float
    cumulative_net_eur: float
    freed_capacity_fte_aggregate: float  # aggregate only, flagged for review


class Totals(BaseModel):
    cost_one_off_eur: float
    cost_recurring_eur: float
    cost_total_eur: float
    benefit_eur: float
    net_eur: float
    roi: float | None  # (benefit - cost) / cost; None if cost is 0
    payback_month: str | None  # first month cumulative net >= 0 within the deadline horizon
    run_rate_net_eur_year: float  # last month's benefit minus recurring cost, x 12. Simple, not a forecast
    unmet_fte_months: float
    freed_capacity_fte_peak: float
    freed_capacity_flag: str = REVIEW_FLAG


class ScenarioResult(BaseModel):
    scenario: ScenarioId
    label: str
    description: str
    actions: list[ActionLine]
    monthly: list[MonthlyPoint]
    shortfalls: list[Shortfall]
    totals: Totals


class DagValidation(BaseModel):
    ok: bool
    errors: list[str] = Field(default_factory=list)


class PlanRequest(BaseModel):
    case: CaseId = "base"
    scenarios: list[ScenarioId] | None = None
    milestone_dates: dict[str, MilestoneDates] | None = None  # editable roadmap
    assumption_overrides: dict[str, float] | None = None


class PlanResponse(BaseModel):
    case: CaseId
    goal: Goal
    milestones: list[Milestone]
    requirements: list[Requirement]
    validation: DagValidation
    skill_fit: list[SkillFit]
    scenarios: dict[ScenarioId, ScenarioResult]
    labels: dict[str, str]  # UI labels for mock / synthetic / external data


class SensitivityRow(BaseModel):
    scenario: ScenarioId
    case: CaseId
    net_eur: float
    roi: float | None
    cost_total_eur: float
    benefit_eur: float
    unmet_fte_months: float


class BriefRequest(BaseModel):
    """Same edits as PlanRequest, so the brief always matches the numbers on screen."""

    scenario: ScenarioId = "hybrid"
    case: CaseId = "base"
    milestone_dates: dict[str, MilestoneDates] | None = None
    assumption_overrides: dict[str, float] | None = None
    lang: Lang = "en"  # language of the drafted text only; the numbers do not change


class Usage(BaseModel):
    input_tokens: int
    output_tokens: int
    eur_estimate: float


class BriefResponse(BaseModel):
    scenario: ScenarioId
    text: str
    drafted_by: Literal["claude", "template"]
    cached: bool
    model: str | None = None
    usage: Usage | None = None
    labels: dict[str, str]
