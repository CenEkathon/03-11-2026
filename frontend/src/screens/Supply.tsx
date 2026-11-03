import { useMemo, useState } from "react";
import { CapacityChart } from "../charts/Charts";
import { BadgeRow, Card, DataTable, TableTwin, type Column } from "../components/ui";
import type { Shared } from "../appTypes";
import type { Requirement, ScenarioId, Shortfall, SkillFit } from "../api/types";
import { SCENARIO_IDS } from "../api/types";
import { formatFte, formatMonth, formatMonthRange } from "../lib/format";
import { REASON_LABEL, SCENARIO_SHORT_LABEL } from "../lib/labels";

export function Supply({ shared }: { shared: Shared }) {
  const { plan, skillLabels, caseInfo } = shared;
  const [scenario, setScenario] = useState<ScenarioId>("hybrid");
  const teamName = useMemo(
    () => Object.fromEntries(caseInfo.company.teams.map((t) => [t.id, t.name])),
    [caseInfo],
  );
  const fitById = new Map<string, SkillFit>(plan.skill_fit.map((f) => [f.requirement_id, f]));
  const result = plan.scenarios[scenario];
  const maxTeam = Math.max(1, ...plan.skill_fit.flatMap((f) => Object.values(f.team_coverage)));

  const reqColumns: Column<Requirement>[] = [
    { key: "id", header: "ID", render: (r) => `${r.id} (${r.milestone_id})` },
    { key: "role", header: "Role (mock)", render: (r) => r.role },
    { key: "skill", header: "Skill", render: (r) => skillLabels[r.skill_id] ?? r.skill_id },
    { key: "fte", header: "FTE", numeric: true, render: (r) => formatFte(r.fte) },
    {
      key: "eligible",
      header: "Eligible now",
      numeric: true,
      render: (r) => fitById.get(r.id)?.eligible_now ?? "n/a",
    },
    {
      key: "reskill",
      header: "Reskill candidates",
      numeric: true,
      render: (r) => fitById.get(r.id)?.reskill_candidates ?? "n/a",
    },
    {
      key: "teams",
      header: "Eligible by team",
      render: (r) => {
        const cov = fitById.get(r.id)?.team_coverage ?? {};
        const entries = Object.entries(cov);
        if (entries.length === 0) return <span className="muted">none</span>;
        return (
          <ul className="bar-list">
            {entries.map(([team, count]) => (
              <li key={team}>
                <span className="bar-label">{teamName[team] ?? team}</span>
                <span className="bar" aria-hidden="true">
                  <span className="bar-fill" style={{ width: `${(count / maxTeam) * 100}%` }} />
                </span>
                <span className="bar-value">{count}</span>
              </li>
            ))}
          </ul>
        );
      },
    },
    {
      key: "evidence",
      header: "Evidence employee IDs (sample, max 5)",
      render: (r) => {
        const ids = fitById.get(r.id)?.evidence_employee_ids ?? [];
        return ids.length ? <code className="small">{ids.join(", ")}</code> : <span className="muted">none</span>;
      },
    },
  ];

  const shortColumns: Column<Shortfall>[] = [
    { key: "req", header: "Requirement", render: (s) => `${s.requirement_id} (${s.milestone_id})` },
    { key: "skill", header: "Skill", render: (s) => skillLabels[s.skill_id] ?? s.skill_id },
    {
      key: "months",
      header: "Months",
      render: (s) => (s.months.length ? `${formatMonth(s.months[0])} to ${formatMonth(s.months[s.months.length - 1])}` : "n/a"),
    },
    { key: "unmet", header: "Unmet FTE-months", numeric: true, render: (s) => formatFte(s.unmet_fte_months, 2) },
    { key: "reason", header: "Reason", render: (s) => REASON_LABEL[s.reason] },
  ];

  const capacityRows = result.monthly.map((m) => ({
    month: formatMonth(m.month),
    required: m.required_fte,
    staffed: m.staffed_fte,
  }));

  return (
    <div className="screen">
      <Card title="Workforce supply against demand (SYNTHETIC workforce)" actions={<BadgeRow labelKey="workforce" labels={plan.labels} />}>
        <p className="small muted">
          Only contributing teams count. Each person's programme capacity is booked once per month, so no one is counted in two
          places. Employee IDs are shown only as evidence for a match. They are not a ranking, and no person is being selected
          for any decision.
        </p>
        <DataTable columns={reqColumns} rows={plan.requirements} rowKey={(r) => r.id} caption="Eligible supply per requirement (before any programme action)" />
      </Card>

      <Card
        title={`Scenario: ${SCENARIO_SHORT_LABEL[scenario]}`}
        actions={
          <div className="tabs" role="tablist" aria-label="Scenario">
            {SCENARIO_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={id === scenario}
                className={`tab${id === scenario ? " active" : ""}`}
                onClick={() => setScenario(id)}
              >
                {SCENARIO_SHORT_LABEL[id]}
              </button>
            ))}
          </div>
        }
      >
        <h3>Shortfalls (unmet FTE after the scenario's sources)</h3>
        <DataTable
          columns={shortColumns}
          rows={result.shortfalls}
          rowKey={(s) => `${s.requirement_id}-${s.reason}`}
          caption="Shortfalls"
        />
        <h3>Required against staffed FTE by month</h3>
        <CapacityChart rows={capacityRows} />
        <TableTwin>
          <DataTable
            columns={[
              { key: "m", header: "Month", render: (r: (typeof capacityRows)[number]) => r.month },
              { key: "req", header: "Required FTE", numeric: true, render: (r) => formatFte(r.required) },
              { key: "st", header: "Staffed FTE", numeric: true, render: (r) => formatFte(r.staffed) },
            ]}
            rows={capacityRows}
            rowKey={(r) => r.month}
            caption={`Capacity, ${SCENARIO_SHORT_LABEL[scenario]}`}
          />
        </TableTwin>
        <p className="small muted">
          Plan period: {formatMonthRange(plan.goal.horizon_start, plan.goal.horizon_end)}. Shortfall reasons:{" "}
          {Object.values(REASON_LABEL).join("; ")}.
        </p>
      </Card>
    </div>
  );
}
