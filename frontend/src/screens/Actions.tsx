import { useState } from "react";
import { Badge, BadgeRow, Card, DataTable, Drawer, type Column } from "../components/ui";
import type { Shared } from "../appTypes";
import type { ActionLine, ScenarioId } from "../api/types";
import { SCENARIO_IDS } from "../api/types";
import { formatEur, formatFte, formatMonth } from "../lib/format";
import { ACTION_TYPE_LABEL, SCENARIO_SHORT_LABEL } from "../lib/labels";

function formatInput(key: string, value: number): string {
  if (/eur|rate|cost|fee/i.test(key)) return formatEur(value);
  if (/share|pct|_pct|productiv/i.test(key)) return `${(value * 100).toFixed(1)}%`;
  return String(value);
}

export function Actions({ shared }: { shared: Shared }) {
  const { plan, skillLabels } = shared;
  const [openKey, setOpenKey] = useState<string | null>(null);

  const open = openKey
    ? plan.scenarios[openKey.split("|")[0] as ScenarioId]?.actions.find((a) => a.id === openKey.split("|")[1]) ?? null
    : null;

  const columns = (scenario: ScenarioId): Column<ActionLine>[] => [
    { key: "ms", header: "Milestone", render: (a) => a.milestone_id },
    { key: "req", header: "Requirement", render: (a) => `${a.requirement_id} ${skillLabels[a.skill_id] ?? a.skill_id}` },
    { key: "type", header: "Action", render: (a) => ACTION_TYPE_LABEL[a.type] },
    { key: "people", header: "People", numeric: true, render: (a) => (a.type === "hire" || a.type === "external" ? `${a.people_count} (new)` : a.people_count) },
    { key: "fte", header: "FTE (avg)", numeric: true, render: (a) => formatFte(a.fte, 2) },
    {
      key: "skills",
      header: "Skills gained",
      render: (a) => ((a.skills_gained ?? []).length ? (a.skills_gained ?? []).map((s) => skillLabels[s] ?? s).join(", ") : "none"),
    },
    { key: "start", header: "Start", render: (a) => formatMonth(a.start) },
    { key: "dur", header: "Duration (months)", numeric: true, render: (a) => a.duration_months },
    { key: "deps", header: "Depends on", render: (a) => ((a.depends_on ?? []).length ? (a.depends_on ?? []).join(", ") : "none") },
    { key: "one", header: "One-off cost", numeric: true, render: (a) => formatEur(a.one_off_cost_eur) },
    { key: "rec", header: "Recurring cost", numeric: true, render: (a) => formatEur(a.recurring_cost_eur) },
    {
      key: "est",
      header: "Status",
      render: () => <Badge labelKey="estimates" caption={plan.labels.estimates} />,
    },
    {
      key: "why",
      header: "Why?",
      render: (a) => (
        <button type="button" className="btn small" onClick={() => setOpenKey(`${scenario}|${a.id}`)}>
          Why?
        </button>
      ),
    },
  ];

  return (
    <div className="screen">
      <Card title="Workforce actions per scenario" actions={<BadgeRow labelKey="estimates" labels={plan.labels} />}>
        <p className="small muted">
          Each line is an estimate built from mock assumptions. People and FTE come from the plan. Employee IDs are not
          listed here. Use the Supply screen for evidence.
        </p>
      </Card>
      {SCENARIO_IDS.map((sid) => {
        const sr = plan.scenarios[sid];
        if (!sr) return null;
        return (
          <Card key={sid} title={`${SCENARIO_SHORT_LABEL[sid]}: ${sr.label}`}>
            <p className="small muted">{sr.description}</p>
            <DataTable
              columns={columns(sid)}
              rows={sr.actions}
              rowKey={(a) => a.id}
              caption={`Actions, ${sr.label}`}
            />
          </Card>
        );
      })}

      <Drawer
        open={open !== null}
        title={open ? `Why: ${ACTION_TYPE_LABEL[open.type]} for ${open.requirement_id}` : "Why"}
        onClose={() => setOpenKey(null)}
      >
        {open ? (
          <>
            <p>{open.rationale}</p>
            <h4>Formula</h4>
            <p className="mono">{open.explanation.formula}</p>
            <h4>Inputs</h4>
            <dl className="kv-list">
              {Object.entries(open.explanation.inputs).map(([k, v]) => (
                <div key={k} className="kv-row">
                  <dt>{k}</dt>
                  <dd>{typeof v === "number" ? formatInput(k, v) : String(v)}</dd>
                </div>
              ))}
            </dl>
            <p className="small">
              Source: <strong>{open.explanation.source}</strong>. Confidence: <strong>{open.explanation.confidence}</strong>.
              Flagged as an estimate: <Badge labelKey="estimates" caption={plan.labels.estimates} />
            </p>
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
