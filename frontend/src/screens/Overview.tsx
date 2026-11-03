import { AdoptionChart, NetByOptionChart, type OptionBar } from "../charts/Charts";
import { BriefPanel } from "../components/BriefPanel";
import { Callout, Card, ChartFigure, DataTable, Kpi, KpiRow, LabelBadge, PageHeader, type Column } from "../components/ui";
import type { Controls, Shared } from "../appTypes";
import { SCENARIO_IDS, type ScenarioId, type Totals } from "../api/types";
import { useChartTheme } from "../theme/ThemeProvider";
import { formatEur, formatMonth, formatPct } from "../lib/format";
import { RECOMMENDED, SCENARIO_SHORT_LABEL, SCENARIO_SLOT } from "../lib/labels";
import {
  adoptionRows,
  attentionItems,
  goalProgress,
  type Attention,
} from "../lib/viewModels";
import { effectiveSaving } from "../lib/assumptions";

const TONE_TO_CALLOUT: Record<Attention["tone"], "info" | "warning" | "critical" | "success"> = {
  critical: "critical",
  warning: "warning",
  info: "info",
  success: "success",
};

export function Overview({ shared, controls }: { shared: Shared; controls: Controls }) {
  const { plan, assumptions } = shared;
  const { series } = useChartTheme();
  const rec = plan.scenarios[RECOMMENDED];
  const t = rec.totals;
  const saving = effectiveSaving(assumptions, controls.overrides);
  const progress = goalProgress(plan.goal, rec.monthly, saving);
  const findings = attentionItems(plan, RECOMMENDED);

  const optionBars: OptionBar[] = SCENARIO_IDS.filter((id) => plan.scenarios[id]).map((id) => ({
    id,
    label: SCENARIO_SHORT_LABEL[id],
    value: plan.scenarios[id].totals.net_eur,
    color: series[SCENARIO_SLOT[id]],
  }));

  const lowestCost = SCENARIO_IDS.every((id) => plan.scenarios[id].totals.cost_total_eur >= t.cost_total_eur);

  type Row = { id: ScenarioId; t: Totals };
  const compareColumns: Column<Row>[] = [
    { key: "o", header: "Option", render: (r) => SCENARIO_SHORT_LABEL[r.id] },
    { key: "c", header: "Cost to deadline", numeric: true, render: (r) => formatEur(r.t.cost_total_eur) },
    { key: "b", header: "Benefit to deadline", numeric: true, render: (r) => formatEur(r.t.benefit_eur) },
    { key: "n", header: "Net", numeric: true, render: (r) => formatEur(r.t.net_eur) },
    { key: "p", header: "Payback", render: (r) => (r.t.payback_month ? formatMonth(r.t.payback_month) : "After deadline") },
  ];
  const compareRows: Row[] = SCENARIO_IDS.filter((id) => plan.scenarios[id]).map((id) => ({ id, t: plan.scenarios[id].totals }));

  return (
    <>
      <PageHeader
        title="Overview"
        lead="What the plan costs, what it returns and what to decide. Everything on this page is for the recommended option unless stated."
      />

      <Card
        title={plan.goal.title.replace(/^MOCK GOAL:\s*/, "")}
        description={plan.goal.statement}
        actions={<LabelBadge labelKey="goal" />}
      >
        <div className="goal-grid">
          <GoalStat
            label="AI-assisted share of reviews"
            now={formatPct(plan.goal.baseline.ai_assisted_share, 0)}
            target={`${formatPct(progress.targetShare, 0)} by ${formatMonth(plan.goal.horizon_end)}`}
            modelled={`${formatPct(progress.shareAtDeadline, 0)} modelled at deadline`}
          />
          <GoalStat
            label="Cost per review (EUR, blended)"
            now={`EUR ${progress.costBaseline.toFixed(0)}`}
            target={`EUR ${progress.costTarget.toFixed(2)} (−${formatPct(progress.reductionTarget, 0)})`}
            modelled={`EUR ${progress.costModelled.toFixed(2)} modelled (−${formatPct(progress.reductionModelled, 0)})`}
            warn={progress.reductionModelled < progress.reductionTarget}
          />
          <div className="goal-stat">
            <div className="kpi-label">Deadline</div>
            <div className="goal-stat-value">{plan.goal.deadline}</div>
            <div className="kpi-sub">No forced redundancies. Reskilling and redeployment first.</div>
          </div>
        </div>
        {progress.reductionModelled < progress.reductionTarget ? (
          <p className="goal-note small muted">
            The model applies the saving to AI-assisted reviews only. At {formatPct(progress.shareAtDeadline, 0)} adoption the blended
            reduction is {formatPct(progress.reductionModelled, 0)}, short of the {formatPct(progress.reductionTarget, 0)} target. The
            gap is shown, not closed.
          </p>
        ) : null}
      </Card>

      <KpiRow>
        <Kpi label="Cost to deadline" value={formatEur(t.cost_total_eur)} sub={`One-off ${formatEur(t.cost_one_off_eur)}`} />
        <Kpi label="Benefit to deadline" value={formatEur(t.benefit_eur)} sub="Fewer costly reviews" />
        <Kpi
          label="Net to deadline"
          value={formatEur(t.net_eur)}
          tone={t.net_eur < 0 ? "bad" : "good"}
          sub={`NPV ${formatEur(t.npv_eur)}`}
        />
        <Kpi label="ROI to deadline" value={formatPct(t.roi)} tone={t.roi !== null && t.roi < 0 ? "bad" : "good"} sub="(benefit − cost) ÷ cost" />
        <Kpi
          label="Payback"
          value={t.payback_month ? formatMonth(t.payback_month) : "Not by deadline"}
          sub={t.extended_payback_month ? `Extrapolated ${formatMonth(t.extended_payback_month)}, not a forecast` : undefined}
        />
      </KpiRow>

      <div className="grid-2">
        <Card title="AI-assisted share of reviews, by month" description={`${SCENARIO_SHORT_LABEL[RECOMMENDED]} option. The horizontal line marks the goal target.`} actions={<LabelBadge labelKey="roadmap" />}>
          <ChartFigure
            label="Line chart of the AI-assisted share by month against the 60% target."
            note="Share rises as each milestone completes. The target line marks the goal."
            tableLabel="Show monthly share as table"
            table={
              <DataTable
                caption="AI-assisted share by month"
                columns={[
                  { key: "m", header: "Month", render: (r: { month: string; share: number }) => formatMonth(r.month) },
                  { key: "s", header: "AI-assisted share", numeric: true, render: (r) => formatPct(r.share, 0) },
                ]}
                rows={adoptionRows(rec.monthly)}
                rowKey={(r) => r.month}
              />
            }
          >
            <AdoptionChart rows={adoptionRows(rec.monthly)} target={progress.targetShare} targetLabel={`Target ${formatPct(progress.targetShare, 0)}`} />
          </ChartFigure>
        </Card>

        <Card
          title="Net value to deadline, by option"
          description="Estimate. Benefit is the same in every option, so the options differ in cost."
          actions={<LabelBadge labelKey="estimates" />}
        >
          <ChartFigure
            label="Bar chart of net value to the deadline for each option. Negative values are to the left of zero."
            tableLabel="Show options as table"
            table={<DataTable caption="Options compared" columns={compareColumns} rows={compareRows} rowKey={(r) => r.id} />}
          >
            <NetByOptionChart rows={optionBars} />
          </ChartFigure>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="What needs attention" description={`${SCENARIO_SHORT_LABEL[RECOMMENDED]} option, computed from the model.`}>
          <div className="stack">
            {findings.map((f) => (
              <Callout key={f.id} tone={TONE_TO_CALLOUT[f.tone]} title={f.title}>
                {f.detail}
              </Callout>
            ))}
            {plan.goal.constraints.length ? (
              <p className="small muted">
                Constraints from the mock goal: {plan.goal.constraints.join("; ")}.
              </p>
            ) : null}
          </div>
        </Card>

        <Card title="Recommendation" description="Mock recommendation for the CEO to test, not a decision.">
          <div className="stack">
            <p className="rec-title">
              <strong>{SCENARIO_SHORT_LABEL[RECOMMENDED]}</strong> — reskilling and redeployment first, hiring only where internal
              supply cannot cover the need.
            </p>
            {lowestCost ? <p className="small">It has the lowest cost to the deadline of the three options.</p> : null}
            <p className="small muted">
              Decisions for approval: the roadmap timing, the model-risk gate before scale-up (M4 before M5), and any workforce
              change, which needs HR, legal and employee-representation review.
            </p>
          </div>
        </Card>
      </div>

      <BriefPanel shared={shared} controls={controls} />
    </>
  );
}

function GoalStat({
  label,
  now,
  target,
  modelled,
  warn,
}: {
  label: string;
  now: string;
  target: string;
  modelled: string;
  warn?: boolean;
}) {
  return (
    <div className="goal-stat">
      <div className="kpi-label">{label}</div>
      <div className="goal-stat-flow">
        <span>
          <span className="muted small">Now</span>
          <strong>{now}</strong>
        </span>
        <span aria-hidden="true" className="goal-arrow">
          →
        </span>
        <span>
          <span className="muted small">Target</span>
          <strong>{target}</strong>
        </span>
      </div>
      <div className={`kpi-sub${warn ? " kpi-bad" : ""}`}>{modelled}</div>
    </div>
  );
}
