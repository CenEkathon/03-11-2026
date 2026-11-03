import { useMemo, useState } from "react";
import { MixChart } from "../charts/Charts";
import { Card, ChartFigure, Dialog, DataTable, PageHeader, Segmented, type Column } from "../components/ui";
import type { Shared } from "../appTypes";
import { SCENARIO_IDS, type ActionLine, type ActionType, type ScenarioId } from "../api/types";
import { formatByUnit, formatEur, formatFte, formatMonth } from "../lib/format";
import { ACTION_TYPE_HELP, ACTION_TYPE_LABEL, RECOMMENDED, SCENARIO_SHORT_LABEL } from "../lib/labels";
import { actionMixRows } from "../lib/viewModels";
import { t } from "../i18n/i18n";
import { useLang } from "../i18n/LanguageProvider";

export function Options({ shared }: { shared: Shared }) {
  useLang();
  const { plan, skillLabels } = shared;
  const [scenario, setScenario] = useState<ScenarioId>(RECOMMENDED);
  const [milestoneFilter, setMilestoneFilter] = useState<string>("all");
  const [openAction, setOpenAction] = useState<ActionLine | null>(null);

  const result = plan.scenarios[scenario];
  const requirementById = useMemo(() => new Map(plan.requirements.map((r) => [r.id, r])), [plan.requirements]);
  const assumptionUnit = useMemo(() => new Map(shared.assumptions.map((a) => [a.key, a.unit])), [shared.assumptions]);
  const mix = actionMixRows(result.actions, plan.milestones);
  const actions = result.actions.filter((a) => milestoneFilter === "all" || a.milestone_id === milestoneFilter);
  const scenarioLabel = t(SCENARIO_SHORT_LABEL[scenario]);
  const skill = (id: string) => (skillLabels[id] ? t(skillLabels[id]) : id);

  const actionColumns: Column<ActionLine>[] = [
    { key: "ms", header: t("Milestone"), render: (a) => a.milestone_id },
    {
      key: "req",
      header: t("Requirement"),
      render: (a) => {
        const r = requirementById.get(a.requirement_id);
        return (
          <>
            <div>{r ? t(r.role) : a.requirement_id}</div>
            <div className="muted small">{skill(a.skill_id)}</div>
          </>
        );
      },
    },
    { key: "type", header: t("Action"), render: (a) => t(ACTION_TYPE_LABEL[a.type]) },
    {
      key: "people",
      header: t("People"),
      numeric: true,
      render: (a) => (a.type === "hire" || a.type === "external" ? t("{count} new", { count: a.people_count }) : a.people_count),
    },
    { key: "fte", header: t("FTE"), numeric: true, render: (a) => formatFte(a.fte, 1) },
    { key: "start", header: t("Starts"), render: (a) => formatMonth(a.start) },
    { key: "dur", header: t("Months"), numeric: true, render: (a) => a.duration_months },
    { key: "one", header: t("One-off"), numeric: true, render: (a) => formatEur(a.one_off_cost_eur) },
    { key: "rec", header: t("Recurring"), numeric: true, render: (a) => formatEur(a.recurring_cost_eur) },
    {
      key: "why",
      header: "",
      render: (a) => (
        <button
          type="button"
          className="btn btn-small"
          onClick={() => setOpenAction(a)}
          aria-label={t("Why: {type} for {id}", { type: t(ACTION_TYPE_LABEL[a.type]), id: a.requirement_id })}
        >
          {t("Why?")}
        </button>
      ),
    },
  ];

  const mixColumns: Column<(typeof mix)[number]>[] = [
    { key: "m", header: t("Milestone"), render: (r) => r.milestone },
    { key: "rs", header: t("Reskill"), numeric: true, render: (r) => formatFte(r.reskill) },
    { key: "rd", header: t("Redeploy"), numeric: true, render: (r) => formatFte(r.redeploy) },
    { key: "hi", header: t("Hire"), numeric: true, render: (r) => formatFte(r.hire) },
    { key: "ex", header: t("Contractor bridge"), numeric: true, render: (r) => formatFte(r.external) },
    { key: "tot", header: t("Total FTE"), numeric: true, render: (r) => formatFte(r.total) },
  ];

  return (
    <>
      <PageHeader
        title={t("Options")}
        lead={t("Three ways to staff the same roadmap. Each one mixes reskilling, redeployment, contractors and hiring differently.")}
        actions={
          <Segmented
            label={t("Option")}
            options={SCENARIO_IDS.map((id) => ({ value: id, label: t(SCENARIO_SHORT_LABEL[id]) }))}
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
            <article key={id} className={`option-card${selected ? " is-selected" : ""}`} aria-label={t(sr.label)}>
              <header className="option-head">
                <h2>{t(SCENARIO_SHORT_LABEL[id])}</h2>
                {id === RECOMMENDED ? <span className="pill pill-accent">{t("Recommended")}</span> : null}
              </header>
              <p className="muted small option-desc">{t(sr.description)}</p>
              <dl className="defs defs-compact">
                <div>
                  <dt>{t("One-off cost")}</dt>
                  <dd>{formatEur(sr.totals.cost_one_off_eur)}</dd>
                </div>
                <div>
                  <dt>{t("Recurring cost")}</dt>
                  <dd>{formatEur(sr.totals.cost_recurring_eur)}</dd>
                </div>
                <div>
                  <dt>{t("Total to deadline")}</dt>
                  <dd>
                    <strong>{formatEur(sr.totals.cost_total_eur)}</strong>
                  </dd>
                </div>
                <div>
                  <dt>{t("Actions")}</dt>
                  <dd>{sr.actions.length}</dd>
                </div>
              </dl>
              <p className="small option-foot">
                {t("Aggregate freed capacity peaks at")}{" "}
                <strong>{t("{fte} FTE", { fte: formatFte(sr.totals.freed_capacity_fte_peak) })}</strong>.{" "}
                <span className="muted">{t(sr.totals.freed_capacity_flag)}.</span>
              </p>
            </article>
          );
        })}
      </div>

      <Card
        title={t("Where the FTE comes from: {option}", { option: t(SCENARIO_SHORT_LABEL[scenario]) })}
        description={t("FTE assigned to each milestone's requirements, split by action. The stack adds up to the FTE that milestone needs.")}
      >
        <div className="legend-help">
          {(Object.keys(ACTION_TYPE_HELP) as ActionType[]).map((k) => (
            <p key={k} className="small">
              <strong>{t(ACTION_TYPE_LABEL[k])}:</strong> <span className="muted">{t(ACTION_TYPE_HELP[k])}</span>
            </p>
          ))}
        </div>
        <ChartFigure
          label={t("Stacked column chart of FTE by action type for each milestone, {option} option.", { option: scenarioLabel })}
          tableLabel={t("Show FTE by milestone as table")}
          table={
            <DataTable
              caption={t("FTE by action type and milestone")}
              columns={mixColumns}
              rows={mix}
              rowKey={(r) => r.milestone}
            />
          }
        >
          <MixChart rows={mix} />
        </ChartFigure>
      </Card>

      <Card
        title={t("Actions")}
        description={t("Each action is a line the planner chose from the planning rules. People and FTE come from the plan. Employee IDs are not listed here: see the Workforce page for the evidence.")}
      >
        <div className="filter-row">
          <Segmented
            label={t("Filter by milestone")}
            size="sm"
            options={[{ value: "all", label: t("All") }, ...plan.milestones.map((m) => ({ value: m.id, label: m.id }))]}
            value={milestoneFilter}
            onChange={setMilestoneFilter}
          />
          <span className="muted small">{t("{count} actions", { count: actions.length })}</span>
        </div>
        <DataTable
          caption={t("Actions in {option}", { option: scenarioLabel })}
          columns={actionColumns}
          rows={actions}
          rowKey={(a) => a.id}
        />
      </Card>

      <Dialog
        open={openAction !== null}
        onClose={() => setOpenAction(null)}
        title={
          openAction
            ? t("{type} for {id}", { type: t(ACTION_TYPE_LABEL[openAction.type]), id: openAction.requirement_id })
            : t("Action")
        }
        wide
      >
        {openAction ? (
          <div className="stack">
            <p>{t(openAction.rationale)}</p>
            <div>
              <h3>{t("How the number is built")}</h3>
              <p className="formula">{t(openAction.explanation.formula)}</p>
            </div>
            <div>
              <h3>{t("Inputs")}</h3>
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
                <dt>{t("Starts")}</dt>
                <dd>{formatMonth(openAction.start)}</dd>
              </div>
              <div>
                <dt>{t("Depends on")}</dt>
                <dd>{(openAction.depends_on ?? []).length ? (openAction.depends_on ?? []).join(", ") : t("Nothing")}</dd>
              </div>
              <div>
                <dt>{t("Skills gained")}</dt>
                <dd>{(openAction.skills_gained ?? []).length ? (openAction.skills_gained ?? []).map(skill).join(", ") : t("None")}</dd>
              </div>
              <div>
                <dt>{t("Source and confidence")}</dt>
                <dd>
                  {openAction.explanation.source === "observed" ? t("Observed in 2021 postings") : t("Planning assumption")} · {t("confidence")}{" "}
                  {openAction.explanation.confidence}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
