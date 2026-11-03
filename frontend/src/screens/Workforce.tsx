import { useMemo, useState } from "react";
import { CoverageChart } from "../charts/Charts";
import { Callout, Card, ChartFigure, Dialog, DataTable, PageHeader, Segmented, type Column } from "../components/ui";
import type { Shared } from "../appTypes";
import { SCENARIO_IDS, type Requirement, type ScenarioId, type SkillFit } from "../api/types";
import { formatFte, formatMonth, formatMonthRange } from "../lib/format";
import { LEVEL_NAMES, REASON_LABEL, RECOMMENDED, SCENARIO_SHORT_LABEL } from "../lib/labels";
import { coverageRows } from "../lib/viewModels";

export function Workforce({ shared }: { shared: Shared }) {
  const { plan, skillLabels, caseInfo } = shared;
  const [scenario, setScenario] = useState<ScenarioId>(RECOMMENDED);
  const [milestoneId, setMilestoneId] = useState<string>(plan.milestones[0]?.id ?? "M1");
  const [evidenceFor, setEvidenceFor] = useState<string | null>(null);

  const teamName = useMemo(() => Object.fromEntries(caseInfo.company.teams.map((t) => [t.id, t.name])), [caseInfo]);
  const fitById = useMemo(() => new Map<string, SkillFit>(plan.skill_fit.map((f) => [f.requirement_id, f])), [plan.skill_fit]);
  const milestone = plan.milestones.find((m) => m.id === milestoneId) ?? plan.milestones[0];
  const result = plan.scenarios[scenario];
  const requirements = plan.requirements.filter((r) => r.milestone_id === milestone.id);
  const shortfalls = result.shortfalls.filter((s) => s.milestone_id === milestone.id);
  const evidenceReq = requirements.find((r) => r.id === evidenceFor) ?? null;
  const evidenceFit = evidenceReq ? fitById.get(evidenceReq.id) : undefined;

  const columns: Column<Requirement>[] = [
    { key: "role", header: "Role", render: (r) => r.role },
    { key: "skill", header: "Skill", render: (r) => skillLabels[r.skill_id] ?? r.skill_id },
    { key: "level", header: "Min level", numeric: true, render: (r) => LEVEL_NAMES[r.min_proficiency] ?? `${r.min_proficiency} of 3` },
    { key: "fte", header: "FTE", numeric: true, render: (r) => formatFte(r.fte) },
    {
      key: "eligible",
      header: "Eligible now",
      numeric: true,
      render: (r) => <span title="People at or above the minimum level in a contributing team">{fitById.get(r.id)?.eligible_now ?? "n/a"}</span>,
    },
    { key: "reskill", header: "Reskill candidates", numeric: true, render: (r) => fitById.get(r.id)?.reskill_candidates ?? "n/a" },
    {
      key: "teams",
      header: "Eligible by team",
      render: (r) => {
        const entries = Object.entries(fitById.get(r.id)?.team_coverage ?? {}).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) return <span className="muted">None</span>;
        return (
          <span className="team-chips">
            {entries.map(([team, n]) => (
              <span key={team} className="team-chip">
                {teamName[team] ?? team} <strong>{n}</strong>
              </span>
            ))}
          </span>
        );
      },
    },
    {
      key: "evidence",
      header: "Evidence",
      render: (r) => (
        <button type="button" className="btn btn-small" onClick={() => setEvidenceFor(r.id)}>
          View IDs
        </button>
      ),
    },
  ];

  const coverage = coverageRows(result.monthly);

  return (
    <>
      <PageHeader
        title="Workforce"
        lead="For each milestone: which roles and skills it needs, how many people in contributing teams already qualify, and whether the chosen option staffs it in time."
        actions={
          <Segmented
            label="Option"
            options={SCENARIO_IDS.map((id) => ({ value: id, label: SCENARIO_SHORT_LABEL[id] }))}
            value={scenario}
            onChange={setScenario}
          />
        }
      />

      <Card
        title="Choose a milestone"
        description={`${milestone.name}: ${formatMonthRange(milestone.start, milestone.end)}. Owner team: ${teamName[milestone.owner_team] ?? milestone.owner_team}.`}
      >
        <Segmented
          label="Milestone"
          options={plan.milestones.map((m) => ({ value: m.id, label: m.id }))}
          value={milestone.id}
          onChange={setMilestoneId}
        />
      </Card>

      <Card
        title="Required and staffed FTE, all milestones"
        description={`${SCENARIO_SHORT_LABEL[scenario]} option. The shaded band is ${milestone.id}.`}
      >
        <ChartFigure
          label={`Area and line chart of required FTE against staffed FTE by month for the ${SCENARIO_SHORT_LABEL[scenario]} option. ${milestone.id} is shaded.`}
          note="Staffed FTE follows the chosen option. Where the line sits on the area, the need is met."
          tableLabel="Show monthly FTE as table"
          table={
            <DataTable
              caption="Required and staffed FTE by month"
              columns={[
                { key: "m", header: "Month", render: (r: (typeof coverage)[number]) => formatMonth(r.month) },
                { key: "req", header: "Required FTE", numeric: true, render: (r) => formatFte(r.required) },
                { key: "st", header: "Staffed FTE", numeric: true, render: (r) => formatFte(r.staffed) },
              ]}
              rows={coverage}
              rowKey={(r) => r.month}
            />
          }
        >
          <CoverageChart rows={coverage} window={{ from: milestone.start, to: milestone.end }} />
        </ChartFigure>
      </Card>

      <Card
        title={`Requirements in ${milestone.id}`}
        description="Eligible counts are people in contributing teams who already meet the minimum level. They are counts, not a ranking, and no one is selected."
      >
        <div className="stack">
          {shortfalls.length === 0 ? (
            <Callout tone="success" title="No shortfall for this milestone">
              Every requirement is staffed in {SCENARIO_SHORT_LABEL[scenario]}.
            </Callout>
          ) : (
            shortfalls.map((s) => (
              <Callout key={`${s.requirement_id}-${s.reason}`} tone="warning" title={`${s.requirement_id}: ${REASON_LABEL[s.reason]}`}>
                {skillLabels[s.skill_id] ?? s.skill_id}. {formatFte(s.unmet_fte_months, 2)} unmet FTE-months.
              </Callout>
            ))
          )}
          <DataTable
            caption={`Requirements in ${milestone.id}`}
            columns={columns}
            rows={requirements}
            rowKey={(r) => r.id}
            emptyText="No requirements for this milestone."
          />
        </div>
      </Card>

      <Dialog
        open={evidenceReq !== null}
        onClose={() => setEvidenceFor(null)}
        title={evidenceReq ? `Evidence for ${evidenceReq.id}: ${evidenceReq.role}` : "Evidence"}
      >
        {evidenceReq && evidenceFit ? (
          <div className="stack">
            <dl className="defs">
              <div>
                <dt>Skill</dt>
                <dd>{skillLabels[evidenceReq.skill_id] ?? evidenceReq.skill_id}</dd>
              </div>
              <div>
                <dt>Eligible now</dt>
                <dd>{evidenceFit.eligible_now} people in contributing teams</dd>
              </div>
              <div>
                <dt>Reskill candidates</dt>
                <dd>{evidenceFit.reskill_candidates} people, one or two levels short on an adjacent skill</dd>
              </div>
              <div>
                <dt>Mapping confidence</dt>
                <dd>{Math.round(evidenceFit.mapping_confidence * 100)}% (curated taxonomy)</dd>
              </div>
              <div>
                <dt>Vacancy share, 2021</dt>
                <dd>
                  {evidenceFit.vacancy_evidence_share === null
                    ? "Not observed"
                    : `${Math.round(evidenceFit.vacancy_evidence_share * 100)}% of deduplicated postings (2021, not used in the arithmetic)`}
                </dd>
              </div>
            </dl>
            <div>
              <h3>Sample employee IDs (up to 5)</h3>
              <p className="muted small">IDs are evidence for the count only. They are not a ranking and do not select anyone.</p>
              {(evidenceFit.evidence_employee_ids ?? []).length ? (
                <ul className="id-list">
                  {(evidenceFit.evidence_employee_ids ?? []).map((id) => (
                    <li key={id}>
                      <code>{id}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">None.</p>
              )}
            </div>
            <p className="muted small">
              Requirement basis: {evidenceReq.source} ({evidenceReq.confidence} confidence). {evidenceReq.rationale}
            </p>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
