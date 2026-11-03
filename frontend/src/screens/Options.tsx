import { useMemo, useState } from "react";
import { MixChart } from "../charts/Charts";
import { Badge, Card, ChartFigure, Dialog, DataTable, LabelBadge, PageHeader, Segmented, type Column } from "../components/ui";
import type { Shared } from "../appTypes";
import { SCENARIO_IDS, type ActionLine, type ActionType, type ScenarioId } from "../api/types";
import { formatByUnit, formatEur, formatFte, formatMonth } from "../lib/format";
import { ACTION_TYPE_HELP, ACTION_TYPE_LABEL, RECOMMENDED, SCENARIO_SHORT_LABEL } from "../lib/labels";
import { actionMixRows } from "../lib/viewModels";

export function Options({ shared }: { shared: Shared }) {
  const { plan, skillLabels } = shared;
  const [scenario, setScenario] = useState<ScenarioId>(RECOMMENDED);
  const [milestoneFilter, setMilestoneFilter] = useState<string>("all");
  const [openAction, setOpenAction] = useState<ActionLine | null>(null);

  const result = plan.scenarios[scenario];
  const requirementById = useMemo(() => new Map(plan.requirements.map((r) => [r.id, r])), [plan.requirements]);
  const assumptionUnit = useMemo(() => new Map(shared.assumptions.map((a) => [a.key, a.unit])), [shared.assumptions]);
  const mix = actionMixRows(result.actions, plan.milestones);
  const actions = result.actions.filter((a) => milestoneFilter === "all" || a.milestone_id === milestoneFilter);

  const actionColumns: Column<ActionLine>[] = [
    { key: "ms", header: "Milestone", render: (a) => a.milestone_id },
    {
      key: "req",
      header: "Requirement",
      render: (a) => {
        const r = requirementById.get(a.requirement_id);
        return (
          <>
            <div>{r?.role ?? a.requirement_id}</div>
            <div className="muted small">{skillLabels[a.skill_id] ?? a.skill_id}</div>
          </>
        );
      },
    },
    { key: "type", header: "Action", render: (a) => ACTION_TYPE_LABEL[a.type] },
    {
      key: "people",
      header: "People",
      numeric: true,
      render: (a) => (a.type === "hire" || a.type === "external" ? `${a.people_count} new` : a.people_count),
    },
    { key: "fte", header: "FTE", numeric: true, render: (a) => formatFte(a.fte, 1) },
    { key: "start", header: "Starts", render: (a) => formatMonth(a.start) },
    { key: "dur", header: "Months", numeric: true, render: (a) => a.duration_months },
    { key: "one", header: "One-off", numeric: true, render: (a) => formatEur(a.one_off_cost_eur) },
    { key: "rec", header: "Recurring", numeric: true, render: (a) => formatEur(a.recurring_cost_eur) },
    {
      key: "why",
      header: "",
      render: (a) => (
        <button type="button" className="btn btn-small" onClick={() => setOpenAction(a)} aria-label={`Why: ${ACTION_TYPE_LABEL[a.type]} for ${a.requirement_id}`}>
          Why?
        </button>
      ),
    },
  ];

  const mixColumns: Column<(typeof mix)[number]>[] = [
    { key: "m", header: "Milestone", render: (r) => r.milestone },
    { key: "rs", header: "Reskill", numeric: true, render: (r) => formatFte(r.reskill) },
    { key: "rd", header: "Redeploy", numeric: true, render: (r) => formatFte(r.redeploy) },
    { key: "hi", header: "Hire", numeric: true, render: (r) => formatFte(r.hire) },
    { key: "ex", header: "Contractor bridge", numeric: true, render: (r) => formatFte(r.external) },
    { key: "tot", header: "Total FTE", numeric: true, render: (r) => formatFte(r.total) },
  ];

  return (
    <>
      <PageHeader
        title="Options"
        lead="Three ways to staff the same roadmap. Each one mixes reskilling, redeployment, contractors and hiring differently. Every line is an estimate."
        actions={
          <Segmented
            label="Option"
            options={SCENARIO_IDS.map((id) => ({ value: id, label: SCENARIO_SHORT_LABEL[id] }))}
            value={scenario}
            onChange={setScenario}
          />
        }
      />

      <div className="option-grid">
        {SCENARIO_IDS.filter((id) => plan.scenarios[id]).map((id) => {
          const sr = plan.scenarios[id];
          const selected = id === scenario;
          return (
            <article key={id} className={`option-card${selected ? " is-selected" : ""}`} aria-label={sr.label}>
              <header className="option-head">
                <h2>{SCENARIO_SHORT_LABEL[id]}</h2>
                {id === RECOMMENDED ? <span className="pill pill-accent">Recommended</span> : null}
              </header>
              <p className="muted small option-desc">{sr.description}</p>
              <dl className="defs defs-compact">
                <div>
                  <dt>One-off cost</dt>
                  <dd>{formatEur(sr.totals.cost_one_off_eur)}</dd>
                </div>
                <div>
                  <dt>Recurring cost</dt>
                  <dd>{formatEur(sr.totals.cost_recurring_eur)}</dd>
                </div>
                <div>
                  <dt>Total to deadline</dt>
                  <dd>
                    <strong>{formatEur(sr.totals.cost_total_eur)}</strong>
                  </dd>
                </div>
                <div>
                  <dt>Actions</dt>
                  <dd>{sr.actions.length}</dd>
                </div>
              </dl>
              <p className="small option-foot">
                Aggregate freed capacity peaks at <strong>{formatFte(sr.totals.freed_capacity_fte_peak)} FTE</strong>.{" "}
                <span className="muted">{sr.totals.freed_capacity_flag}.</span>
              </p>
            </article>
          );
        })}
      </div>

      <Card
        title={`Where the FTE comes from: ${SCENARIO_SHORT_LABEL[scenario]}`}
        description="FTE assigned to each milestone's requirements, split by action. The stack adds up to the FTE that milestone needs."
        actions={<LabelBadge labelKey="estimates" />}
      >
        <div className="legend-help">
          {(Object.keys(ACTION_TYPE_HELP) as ActionType[]).map((k) => (
            <p key={k} className="small">
              <strong>{ACTION_TYPE_LABEL[k]}:</strong> <span className="muted">{ACTION_TYPE_HELP[k]}</span>
            </p>
          ))}
        </div>
        <ChartFigure
          label={`Stacked column chart of FTE by action type for each milestone, ${SCENARIO_SHORT_LABEL[scenario]} option.`}
          tableLabel="Show FTE by milestone as table"
          table={<DataTable caption="FTE by action type and milestone" columns={mixColumns} rows={mix} rowKey={(r) => r.milestone} />}
        >
          <MixChart rows={mix} />
        </ChartFigure>
      </Card>

      <Card
        title="Actions"
        description="Each action is a line the planner chose from the mock rules. People and FTE come from the plan. Employee IDs are not listed here: see the Workforce page for the evidence."
        actions={<LabelBadge labelKey="estimates" />}
      >
        <div className="filter-row">
          <Segmented
            label="Filter by milestone"
            size="sm"
            options={[{ value: "all", label: "All" }, ...plan.milestones.map((m) => ({ value: m.id, label: m.id }))]}
            value={milestoneFilter}
            onChange={setMilestoneFilter}
          />
          <span className="muted small">{actions.length} actions</span>
        </div>
        <DataTable
          caption={`Actions in ${SCENARIO_SHORT_LABEL[scenario]}`}
          columns={actionColumns}
          rows={actions}
          rowKey={(a) => a.id}
        />
      </Card>

      <Dialog
        open={openAction !== null}
        onClose={() => setOpenAction(null)}
        title={openAction ? `${ACTION_TYPE_LABEL[openAction.type]} for ${openAction.requirement_id}` : "Action"}
        wide
      >
        {openAction ? (
          <div className="stack">
            <p>{openAction.rationale}</p>
            <div>
              <h3>How the number is built</h3>
              <p className="formula">{openAction.explanation.formula}</p>
            </div>
            <div>
              <h3>Inputs</h3>
              <dl className="defs">
                {Object.entries(openAction.explanation.inputs).map(([k, v]) => (
                  <div key={k}>
                    <dt>
                      <code>{k}</code>
                    </dt>
                    <dd>{typeof v === "number" ? formatByUnit(v, assumptionUnit.get(k)) : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <dl className="defs">
              <div>
                <dt>Starts</dt>
                <dd>{formatMonth(openAction.start)}</dd>
              </div>
              <div>
                <dt>Depends on</dt>
                <dd>{(openAction.depends_on ?? []).length ? (openAction.depends_on ?? []).join(", ") : "Nothing"}</dd>
              </div>
              <div>
                <dt>Skills gained</dt>
                <dd>{(openAction.skills_gained ?? []).length ? (openAction.skills_gained ?? []).map((s) => skillLabels[s] ?? s).join(", ") : "None"}</dd>
              </div>
              <div>
                <dt>Source and confidence</dt>
                <dd>
                  {openAction.explanation.source} · {openAction.explanation.confidence}{" "}
                  <Badge kind="ESTIMATE" />
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
