import { useMemo, useState } from "react";
import { CoverageChart } from "../charts/Charts";
import { Callout, Card, ChartFigure, Dialog, DataTable, PageHeader, Segmented, type Column } from "../components/ui";
import type { Shared } from "../appTypes";
import { SCENARIO_IDS, type Requirement, type ScenarioId, type SkillFit } from "../api/types";
import { formatFte, formatMonth, formatMonthRange } from "../lib/format";
import { LEVEL_NAMES, REASON_LABEL, RECOMMENDED, SCENARIO_SHORT_LABEL } from "../lib/labels";
import { coverageRows } from "../lib/viewModels";
import { t } from "../i18n/i18n";
import { useLang } from "../i18n/LanguageProvider";

export function Workforce({ shared }: { shared: Shared }) {
  useLang();
  const { plan, skillLabels, caseInfo } = shared;
  const [scenario, setScenario] = useState<ScenarioId>(RECOMMENDED);
  const [milestoneId, setMilestoneId] = useState<string>(plan.milestones[0].id); // a plan always has milestones
  const [evidenceFor, setEvidenceFor] = useState<string | null>(null);

  const teamName = useMemo(() => Object.fromEntries(caseInfo.company.teams.map((tm) => [tm.id, tm.name])), [caseInfo]);
  const fitById = useMemo(() => new Map<string, SkillFit>(plan.skill_fit.map((f) => [f.requirement_id, f])), [plan.skill_fit]);
  const milestone = plan.milestones.find((m) => m.id === milestoneId) ?? plan.milestones[0];
  const result = plan.scenarios[scenario];
  const requirements = plan.requirements.filter((r) => r.milestone_id === milestone.id);
  const shortfalls = result.shortfalls.filter((s) => s.milestone_id === milestone.id);
  const evidenceReq = requirements.find((r) => r.id === evidenceFor) ?? null;
  const evidenceFit = evidenceReq ? fitById.get(evidenceReq.id) : undefined;
  const evidenceIds = evidenceFit?.evidence_employee_ids ?? [];
  const scenarioLabel = t(SCENARIO_SHORT_LABEL[scenario]);

  const columns: Column<Requirement>[] = [
    { key: "role", header: t("Role"), render: (r) => t(r.role) },
    { key: "skill", header: t("Skill"), render: (r) => (skillLabels[r.skill_id] ? t(skillLabels[r.skill_id]) : r.skill_id) },
    { key: "level", header: t("Min level"), numeric: true, render: (r) => LEVEL_NAMES[r.min_proficiency] ?? `${r.min_proficiency} of 3` },
    { key: "fte", header: t("FTE"), numeric: true, render: (r) => formatFte(r.fte) },
    {
      key: "eligible",
      header: t("Eligible now"),
      numeric: true,
      render: (r) => (
        <span title={t("People at or above the minimum level in a contributing team")}>
          {fitById.get(r.id)?.eligible_now ?? t("n/a")}
        </span>
      ),
    },
    { key: "reskill", header: t("Reskill candidates"), numeric: true, render: (r) => fitById.get(r.id)?.reskill_candidates ?? t("n/a") },
    {
      key: "teams",
      header: t("Eligible by team"),
      render: (r) => {
        const entries = Object.entries(fitById.get(r.id)?.team_coverage ?? {}).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) return <span className="muted">{t("None")}</span>;
        return (
          <span className="team-chips">
            {entries.map(([team, n]) => (
              <span key={team} className="team-chip">
                {teamName[team] ? t(teamName[team]) : team} <strong>{n}</strong>
              </span>
            ))}
          </span>
        );
      },
    },
    {
      key: "evidence",
      header: t("Evidence"),
      render: (r) => (
        <button type="button" className="btn btn-small" onClick={() => setEvidenceFor(r.id)}>
          {t("View IDs")}
        </button>
      ),
    },
  ];

  const coverage = coverageRows(result.monthly);

  return (
    <>
      <PageHeader
        title={t("Workforce")}
        lead={t(
          "For each milestone: which roles and skills it needs, how many people in contributing teams already qualify, and whether the chosen option staffs it in time.",
        )}
        actions={
          <Segmented
            label={t("Option")}
            options={SCENARIO_IDS.map((id) => ({ value: id, label: t(SCENARIO_SHORT_LABEL[id]) }))}
            value={scenario}
            onChange={setScenario}
          />
        }
      />

      <Card
        title={t("Choose a milestone")}
        description={t("{name}: {range}. Owner team: {team}.", {
          name: t(milestone.name),
          range: formatMonthRange(milestone.start, milestone.end),
          team: teamName[milestone.owner_team] ? t(teamName[milestone.owner_team]) : milestone.owner_team,
        })}
      >
        <Segmented
          label={t("Milestone")}
          options={plan.milestones.map((m) => ({ value: m.id, label: m.id }))}
          value={milestone.id}
          onChange={setMilestoneId}
        />
      </Card>

      <Card
        title={t("Required and staffed FTE, all milestones")}
        description={t("{option} option. The shaded band is {id}.", { option: t(SCENARIO_SHORT_LABEL[scenario]), id: milestone.id })}
      >
        <ChartFigure
          label={t(
            "Area and line chart of required FTE against staffed FTE by month for the {option} option. {id} is shaded.",
            { option: scenarioLabel, id: milestone.id },
          )}
          note={t("Staffed FTE follows the chosen option. Where the line sits on the area, the need is met.")}
          tableLabel={t("Show monthly FTE as table")}
          table={
            <DataTable
              caption={t("Required and staffed FTE by month")}
              columns={[
                { key: "m", header: t("Month"), render: (r: (typeof coverage)[number]) => formatMonth(r.month) },
                { key: "req", header: t("Required FTE"), numeric: true, render: (r) => formatFte(r.required) },
                { key: "st", header: t("Staffed FTE"), numeric: true, render: (r) => formatFte(r.staffed) },
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
        title={t("Requirements in {id}", { id: milestone.id })}
        description={t("Eligible counts are people in contributing teams who already meet the minimum level. They are counts, not a ranking, and no one is selected.")}
      >
        <div className="stack">
          {shortfalls.length === 0 ? (
            <Callout tone="success" title={t("No shortfall for this milestone")}>
              {t("Every requirement is staffed in {option}.", { option: scenarioLabel })}
            </Callout>
          ) : (
            shortfalls.map((s) => (
              <Callout
                key={`${s.requirement_id}-${s.reason}`}
                tone="warning"
                title={t("{id}: {reason}", { id: s.requirement_id, reason: t(REASON_LABEL[s.reason]) })}
              >
                {t("{skill}. {fte} unmet FTE-months.", {
                  skill: skillLabels[s.skill_id] ? t(skillLabels[s.skill_id]) : s.skill_id,
                  fte: formatFte(s.unmet_fte_months, 2),
                })}
              </Callout>
            ))
          )}
          <DataTable
            caption={t("Requirements in {id}", { id: milestone.id })}
            columns={columns}
            rows={requirements}
            rowKey={(r) => r.id}
            emptyText={t("No requirements for this milestone.")}
          />
        </div>
      </Card>

      <Dialog
        open={evidenceReq !== null}
        onClose={() => setEvidenceFor(null)}
        title={evidenceReq ? t("Evidence for {id}: {role}", { id: evidenceReq.id, role: t(evidenceReq.role) }) : t("Evidence")}
      >
        {evidenceReq && evidenceFit ? (
          <div className="stack">
            <dl className="defs">
              <div>
                <dt>{t("Skill")}</dt>
                <dd>{skillLabels[evidenceReq.skill_id] ? t(skillLabels[evidenceReq.skill_id]) : evidenceReq.skill_id}</dd>
              </div>
              <div>
                <dt>{t("Eligible now")}</dt>
                <dd>{t("{count} people in contributing teams", { count: evidenceFit.eligible_now })}</dd>
              </div>
              <div>
                <dt>{t("Reskill candidates")}</dt>
                <dd>
                  {t("{count} people, one or two levels short on an adjacent skill", { count: evidenceFit.reskill_candidates })}
                </dd>
              </div>
              <div>
                <dt>{t("Mapping confidence")}</dt>
                <dd>{t("{pct}% (curated taxonomy)", { pct: Math.round(evidenceFit.mapping_confidence * 100) })}</dd>
              </div>
              <div>
                <dt>{t("Vacancy share, 2021")}</dt>
                <dd>
                  {evidenceFit.vacancy_evidence_share === null
                    ? t("Not observed")
                    : t("{pct}% of deduplicated postings (2021, not used in the arithmetic)", {
                        pct: Math.round(evidenceFit.vacancy_evidence_share * 100),
                      })}
                </dd>
              </div>
            </dl>
            <div>
              <h3>{t("Sample employee IDs (up to 5)")}</h3>
              <p className="muted small">IDs are evidence for the count only. They are not a ranking and do not select anyone.</p>
              {evidenceIds.length ? (
                <ul className="id-list">
                  {evidenceIds.map((id) => (
                    <li key={id}>
                      <code>{id}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">{t("None.")}</p>
              )}
            </div>
            <p className="muted small">
              {t("Requirement basis: {source} ({confidence} confidence). {rationale}", {
                source: t(evidenceReq.source),
                confidence: t(evidenceReq.confidence),
                rationale: t(evidenceReq.rationale),
              })}
            </p>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
