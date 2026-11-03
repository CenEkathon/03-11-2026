import { AdoptionChart, NetByOptionChart, type OptionBar } from "../charts/Charts";
import { BriefPanel } from "../components/BriefPanel";
import { Callout, Card, ChartFigure, DataTable, Kpi, KpiRow, LabelBadge, PageHeader, type Column } from "../components/ui";
import type { Controls, Shared } from "../appTypes";
import { SCENARIO_IDS, type ScenarioId, type Totals } from "../api/types";
import { useChartTheme } from "../theme/ThemeProvider";
import { formatEur, formatMonth, formatNumber, formatPct } from "../lib/format";
import { RECOMMENDED, SCENARIO_SHORT_LABEL, SCENARIO_SLOT } from "../lib/labels";
import { adoptionRows, attentionItems, goalProgress, type Attention } from "../lib/viewModels";
import { effectiveSaving } from "../lib/assumptions";
import { t } from "../i18n/i18n";
import { useLang } from "../i18n/LanguageProvider";

const TONE_TO_CALLOUT: Record<Attention["tone"], "info" | "warning" | "critical" | "success"> = {
  critical: "critical",
  warning: "warning",
  info: "info",
  success: "success",
};

export function Overview({ shared, controls }: { shared: Shared; controls: Controls }) {
  useLang();
  const { plan, assumptions } = shared;
  const { series } = useChartTheme();
  const rec = plan.scenarios[RECOMMENDED];
  const t_ = rec.totals;
  const saving = effectiveSaving(assumptions, controls.overrides);
  const progress = goalProgress(plan.goal, rec.monthly, saving);
  const findings = attentionItems(plan, RECOMMENDED);

  const optionBars: OptionBar[] = SCENARIO_IDS.filter((id) => plan.scenarios[id]).map((id) => ({
    id,
    label: t(SCENARIO_SHORT_LABEL[id]),
    value: plan.scenarios[id].totals.net_eur,
    color: series[SCENARIO_SLOT[id]],
  }));

  const lowestCost = SCENARIO_IDS.every((id) => plan.scenarios[id].totals.cost_total_eur >= t_.cost_total_eur);

  type Row = { id: ScenarioId; t: Totals };
  const compareColumns: Column<Row>[] = [
    { key: "o", header: t("Option"), render: (r) => t(SCENARIO_SHORT_LABEL[r.id]) },
    { key: "c", header: t("Cost to deadline"), numeric: true, render: (r) => formatEur(r.t.cost_total_eur) },
    { key: "b", header: t("Benefit to deadline"), numeric: true, render: (r) => formatEur(r.t.benefit_eur) },
    { key: "n", header: t("Net"), numeric: true, render: (r) => formatEur(r.t.net_eur) },
    {
      key: "p",
      header: t("Payback by deadline"),
      render: (r) => (r.t.payback_month ? formatMonth(r.t.payback_month) : t("Not by deadline")),
    },
    {
      key: "rr",
      header: t("Yearly net at Dec 2028 run rate (estimate)"),
      numeric: true,
      render: (r) => formatEur(r.t.run_rate_net_eur_year),
    },
  ];
  const compareRows: Row[] = SCENARIO_IDS.filter((id) => plan.scenarios[id]).map((id) => ({ id, t: plan.scenarios[id].totals }));
  const recLabel = t(SCENARIO_SHORT_LABEL[RECOMMENDED]);

  return (
    <>
      <PageHeader
        title={t("Overview")}
        lead={t("What the plan costs, what it returns and what to decide. Everything on this page is for the recommended option unless stated.")}
      />

      <Card
        title={t(plan.goal.title.replace(/^MOCK GOAL:\s*/, ""))}
        description={t(plan.goal.statement)}
        actions={<LabelBadge labelKey="goal" />}
      >
        <div className="goal-grid">
          <GoalStat
            label={t("AI-assisted share of reviews")}
            now={formatPct(plan.goal.baseline.ai_assisted_share, 0)}
            target={t("{share} by {month}", { share: formatPct(progress.targetShare, 0), month: formatMonth(plan.goal.horizon_end) })}
            modelled={t("{share} modelled at deadline", { share: formatPct(progress.shareAtDeadline, 0) })}
          />
          <GoalStat
            label={t("Cost per review (EUR, blended)")}
            now={`EUR ${formatNumber(progress.costBaseline)}`}
            target={t("EUR {cost} (−{pct})", {
              cost: formatNumber(progress.costTarget, 2),
              pct: formatPct(progress.reductionTarget, 0),
            })}
            modelled={t("EUR {cost} modelled (−{pct})", {
              cost: formatNumber(progress.costModelled, 2),
              pct: formatPct(progress.reductionModelled, 0),
            })}
            warn={progress.reductionModelled < progress.reductionTarget}
          />
          <div className="goal-stat">
            <div className="kpi-label">{t("Deadline")}</div>
            <div className="goal-stat-value">{plan.goal.deadline}</div>
            <div className="kpi-sub">{t("No forced redundancies. Reskilling and redeployment first.")}</div>
          </div>
        </div>
        {progress.reductionModelled < progress.reductionTarget ? (
          <p className="goal-note small muted">
            {t(
              "The model applies the saving to AI-assisted reviews only. At {share} adoption the blended reduction is {reduction}, short of the {target} target. The gap is shown, not closed.",
              {
                share: formatPct(progress.shareAtDeadline, 0),
                reduction: formatPct(progress.reductionModelled, 0),
                target: formatPct(progress.reductionTarget, 0),
              },
            )}
          </p>
        ) : null}
      </Card>

      <KpiRow>
        <Kpi
          label={t("Cost to deadline")}
          value={formatEur(t_.cost_total_eur)}
          sub={t("One-off {amount}", { amount: formatEur(t_.cost_one_off_eur) })}
        />
        <Kpi label={t("Benefit to deadline")} value={formatEur(t_.benefit_eur)} sub={t("Fewer costly reviews")} />
        <Kpi label={t("Net to deadline")} value={formatEur(t_.net_eur)} tone={t_.net_eur < 0 ? "bad" : "good"} />
        <Kpi
          label={t("ROI to deadline")}
          value={formatPct(t_.roi)}
          tone={t_.roi !== null && t_.roi < 0 ? "bad" : "good"}
          sub={t("(benefit − cost) ÷ cost")}
        />
        <Kpi label={t("Payback")} value={t_.payback_month ? formatMonth(t_.payback_month) : t("Not by deadline")} />
        <Kpi
          label={t("Yearly net at Dec 2028 run rate")}
          value={formatEur(t_.run_rate_net_eur_year)}
          tone={t_.run_rate_net_eur_year < 0 ? "bad" : "good"}
          sub={t("Estimate, not a forecast")}
        />
      </KpiRow>

      <div className="grid-2">
        <Card
          title={t("AI-assisted share of reviews, by month")}
          description={t("{option} option. The horizontal line marks the goal target.", { option: recLabel })}
          actions={<LabelBadge labelKey="roadmap" />}
        >
          <ChartFigure
            label={t("Line chart of the AI-assisted share by month against the goal target.")}
            note={t("Share rises as each milestone completes. The target line marks the goal.")}
            tableLabel={t("Show monthly share as table")}
            table={
              <DataTable
                caption={t("AI-assisted share by month")}
                columns={[
                  { key: "m", header: t("Month"), render: (r: { month: string; share: number }) => formatMonth(r.month) },
                  { key: "s", header: t("AI-assisted share"), numeric: true, render: (r) => formatPct(r.share, 0) },
                ]}
                rows={adoptionRows(rec.monthly)}
                rowKey={(r) => r.month}
              />
            }
          >
            <AdoptionChart
              rows={adoptionRows(rec.monthly)}
              target={progress.targetShare}
              targetLabel={t("Target {share}", { share: formatPct(progress.targetShare, 0) })}
            />
          </ChartFigure>
        </Card>

        <Card
          title={t("Net value to deadline, by option")}
          description={t("Estimate. Benefit is the same in every option, so the options differ in cost.")}
          actions={<LabelBadge labelKey="estimates" />}
        >
          <ChartFigure
            label={t("Bar chart of net value to the deadline for each option. Negative values are to the left of zero.")}
            tableLabel={t("Show options as table")}
            table={<DataTable caption={t("Options compared")} columns={compareColumns} rows={compareRows} rowKey={(r) => r.id} />}
          >
            <NetByOptionChart rows={optionBars} />
          </ChartFigure>
        </Card>
      </div>

      <div className="grid-2">
        <Card title={t("What needs attention")} description={t("{option} option, computed from the model.", { option: recLabel })}>
          <div className="stack">
            {findings.map((f) => (
              <Callout key={f.id} tone={TONE_TO_CALLOUT[f.tone]} title={f.title}>
                {f.detail}
              </Callout>
            ))}
            {plan.goal.constraints.length ? (
              <p className="small muted">
                {t("Constraints from the mock goal: {list}.", { list: plan.goal.constraints.map((c) => t(c)).join("; ") })}
              </p>
            ) : null}
          </div>
        </Card>

        <Card title={t("Recommendation")} description={t("Mock recommendation for the CEO to test, not a decision.")}>
          <div className="stack">
            <p className="rec-title">
              <strong>{recLabel}</strong>{" "}
              {t("— reskilling and redeployment first, hiring only where internal supply cannot cover the need.")}
            </p>
            {lowestCost ? <p className="small">{t("It has the lowest cost to the deadline of the three options.")}</p> : null}
            <p className="small muted">
              {t(
                "Decisions for approval: the roadmap timing, the model-risk gate before scale-up (M2 before M3), and any workforce change, which needs HR, legal and employee-representation review.",
              )}
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
          <span className="muted small">{t("Now")}</span>
          <strong>{now}</strong>
        </span>
        <span aria-hidden="true" className="goal-arrow">
          →
        </span>
        <span>
          <span className="muted small">{t("Target")}</span>
          <strong>{target}</strong>
        </span>
      </div>
      <div className={`kpi-sub${warn ? " kpi-bad" : ""}`}>{modelled}</div>
    </div>
  );
}
