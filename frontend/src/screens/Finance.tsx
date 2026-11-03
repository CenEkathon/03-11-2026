import { useMemo, useState } from "react";
import { CashChart, CumulativeChart } from "../charts/Charts";
import { RangePlot } from "../charts/RangePlot";
import { Callout, Card, ChartFigure, DataTable, Kpi, KpiRow, LabelBadge, PageHeader, Segmented, TableView, type Column } from "../components/ui";
import type { Shared } from "../appTypes";
import { SCENARIO_IDS, type ScenarioId, type SensitivityRow, type Totals } from "../api/types";
import { useChartTheme } from "../theme/ThemeProvider";
import { formatEur, formatFte, formatMonth, formatPct } from "../lib/format";
import { RECOMMENDED, SCENARIO_SHORT_LABEL, SCENARIO_SLOT } from "../lib/labels";
import { benefitSpread, cashRows, cumulativeRows, rangeRows } from "../lib/viewModels";
import { t } from "../i18n/i18n";
import { useLang } from "../i18n/LanguageProvider";

const CASE_ORDER = ["low", "base", "high"] as const;
const CASE_LABEL: Record<(typeof CASE_ORDER)[number], string> = { low: "Low", base: "Base", high: "High" };

export function Finance({ shared }: { shared: Shared }) {
  useLang();
  const { plan, sensitivity } = shared;
  const { series } = useChartTheme();
  const [scenario, setScenario] = useState<ScenarioId>(RECOMMENDED);
  const ids = SCENARIO_IDS.filter((id) => plan.scenarios[id]);
  const result = plan.scenarios[scenario];
  const t_ = result.totals;
  const deadlineMonth = plan.goal.deadline.slice(0, 7);
  const colorOf = (id: string) => series[SCENARIO_SLOT[id as ScenarioId]];
  const labelOf = (id: string) => t(SCENARIO_SHORT_LABEL[id as ScenarioId]);
  const scenarioLabel = t(SCENARIO_SHORT_LABEL[scenario]);

  const cumulative = useMemo(() => cumulativeRows(plan.scenarios, ids), [plan.scenarios, ids]);
  const cash = useMemo(() => cashRows(result.monthly), [result.monthly]);
  const ranges = useMemo(() => rangeRows(sensitivity, ids), [sensitivity, ids]);
  const sensRows = useMemo(
    () =>
      [...sensitivity].sort(
        (a, b) => ids.indexOf(a.scenario) - ids.indexOf(b.scenario) || CASE_ORDER.indexOf(a.case) - CASE_ORDER.indexOf(b.case),
      ),
    [sensitivity, ids],
  );
  const spread = benefitSpread(plan, ids);

  type Row = { id: ScenarioId; t: Totals };
  const compareRows: Row[] = ids.map((id) => ({ id, t: plan.scenarios[id].totals }));
  const compareColumns: Column<Row>[] = [
    { key: "o", header: t("Option"), render: (r) => t(SCENARIO_SHORT_LABEL[r.id]) },
    { key: "c", header: t("Cost to deadline"), numeric: true, render: (r) => formatEur(r.t.cost_total_eur) },
    { key: "b", header: t("Benefit to deadline"), numeric: true, render: (r) => formatEur(r.t.benefit_eur) },
    { key: "n", header: t("Net to deadline"), numeric: true, render: (r) => formatEur(r.t.net_eur) },
    { key: "r", header: t("ROI"), numeric: true, render: (r) => formatPct(r.t.roi) },
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

  const sensColumns: Column<SensitivityRow>[] = [
    { key: "s", header: t("Option"), render: (r) => t(SCENARIO_SHORT_LABEL[r.scenario]) },
    { key: "c", header: t("Case"), render: (r) => t(CASE_LABEL[r.case]) },
    { key: "n", header: t("Net"), numeric: true, render: (r) => formatEur(r.net_eur) },
    { key: "co", header: t("Cost"), numeric: true, render: (r) => formatEur(r.cost_total_eur) },
    { key: "b", header: t("Benefit"), numeric: true, render: (r) => formatEur(r.benefit_eur) },
    { key: "u", header: t("Unmet FTE-months"), numeric: true, render: (r) => formatFte(r.unmet_fte_months, 2) },
  ];

  const cashColumns: Column<(typeof cash)[number]>[] = [
    { key: "m", header: t("Month"), render: (r) => formatMonth(r.month) },
    { key: "b", header: t("Benefit"), numeric: true, render: (r) => formatEur(r.benefit) },
    { key: "c", header: t("Cost"), numeric: true, render: (r) => formatEur(r.cost) },
    { key: "n", header: t("Net in month"), numeric: true, render: (r) => formatEur(r.net) },
  ];

  const cumulativeColumns: Column<(typeof cumulative)[number]>[] = [
    { key: "m", header: t("Month"), render: (r) => formatMonth(r.month) },
    ...ids.map((id) => ({
      key: id,
      header: t(SCENARIO_SHORT_LABEL[id]),
      numeric: true,
      render: (r: (typeof cumulative)[number]) => formatEur(r[id] ?? 0),
    })),
  ];

  return (
    <>
      <PageHeader
        title={t("Money")}
        lead={t(
          "Costs against benefits for each option, month by month, through the deadline. Benefit comes from fewer costly reviews. Costs come from the staffing actions. Everything is an estimate.",
        )}
        actions={
          <Segmented
            label={t("Option")}
            options={ids.map((id) => ({ value: id, label: t(SCENARIO_SHORT_LABEL[id]) }))}
            value={scenario}
            onChange={setScenario}
          />
        }
      />

      <KpiRow>
        <Kpi label={t("Cost to deadline")} value={formatEur(t_.cost_total_eur)} sub={t("Recurring {amount}", { amount: formatEur(t_.cost_recurring_eur) })} />
        <Kpi label={t("Benefit to deadline")} value={formatEur(t_.benefit_eur)} />
        <Kpi label={t("Net to deadline")} value={formatEur(t_.net_eur)} tone={t_.net_eur < 0 ? "bad" : "good"} />
        <Kpi label={t("ROI to deadline")} value={formatPct(t_.roi)} tone={t_.roi !== null && t_.roi < 0 ? "bad" : "good"} />
        <Kpi label={t("Payback")} value={t_.payback_month ? formatMonth(t_.payback_month) : t("Not by deadline")} />
        <Kpi
          label={t("Yearly net at Dec 2028 run rate")}
          value={formatEur(t_.run_rate_net_eur_year)}
          tone={t_.run_rate_net_eur_year < 0 ? "bad" : "good"}
          sub={t("Estimate, not a forecast")}
        />
      </KpiRow>

      {t_.payback_month === null ? (
        <Callout tone="warning" title={t("{option} does not pay back before the deadline", { option: scenarioLabel })}>
          {t(
            "Costs are still above benefits at the deadline. The yearly run-rate figure shows what the option would net per year once the December 2028 level continues. It is a simple estimate, not a forecast.",
          )}
        </Callout>
      ) : null}

      <Card
        title={t("Cumulative net, by option")}
        description={t(
          "Running total of benefit minus cost. Payback is where a line crosses zero. The recommended option is drawn thicker.",
        )}
        actions={<LabelBadge labelKey="estimates" />}
      >
        <ChartFigure
          label={t("Line chart of cumulative net value by month for each option. A zero line marks break-even.")}
          note={
            spread === 0
              ? t(
                  "Benefit is identical in every option, because it is driven by adoption and coverage. The options differ only in cost, so the lines separate by cost.",
                )
              : undefined
          }
          tableLabel={t("Show monthly cumulative net as table")}
          table={
            <DataTable
              caption={t("Cumulative net by option and month")}
              columns={cumulativeColumns}
              rows={cumulative}
              rowKey={(r) => r.month}
            />
          }
        >
          <CumulativeChart
            rows={cumulative}
            series={ids.map((id) => ({ id, label: t(SCENARIO_SHORT_LABEL[id]), color: colorOf(id) }))}
            emphasis={RECOMMENDED}
            deadlineMonth={deadlineMonth}
          />
        </ChartFigure>
      </Card>

      <div className="grid-2">
        <Card
          title={t("Monthly cost and benefit: {option}", { option: scenarioLabel })}
          description={t("Benefit above the line, cost below it. Both in EUR per month.")}
          actions={<LabelBadge labelKey="estimates" />}
        >
          <ChartFigure
            label={t("Column chart of monthly benefit above zero and monthly cost below zero for the {option} option.", {
              option: scenarioLabel,
            })}
            tableLabel={t("Show monthly cost and benefit as table")}
            table={
              <DataTable
                caption={t("Monthly cost and benefit, {option}", { option: scenarioLabel })}
                columns={cashColumns}
                rows={cash}
                rowKey={(r) => r.month}
              />
            }
          >
            <CashChart rows={cash} />
          </ChartFigure>
        </Card>

        <Card
          title={t("Net to deadline: low, base and high")}
          description={t(
            "Each bar is the range across the sensitivity cases. The dot is the base case. Low is the conservative case: higher cost, lower benefit.",
          )}
          actions={<LabelBadge labelKey="assumptions" />}
        >
          {ranges.length > 0 ? (
            <RangePlot rows={ranges} label={labelOf} color={colorOf} />
          ) : (
            <p className="muted">{t("Sensitivity is not available.")}</p>
          )}
          <TableView label={t("Show sensitivity as table")}>
            <DataTable
              caption={t("Sensitivity by option and case")}
              columns={sensColumns}
              rows={sensRows}
              rowKey={(r) => `${r.scenario}-${r.case}`}
            />
          </TableView>
        </Card>
      </div>

      <Card
        title={t("All options side by side")}
        description={t("Totals through the deadline, from the same roadmap and assumptions.")}
        actions={<LabelBadge labelKey="estimates" />}
      >
        <DataTable caption={t("Options compared")} columns={compareColumns} rows={compareRows} rowKey={(r) => r.id} />
      </Card>

      <Card
        title={t("How the numbers are built")}
        description={t(
          "Every figure traces back to one of these rules. The inputs are mock assumptions you can change on the Assumptions page.",
        )}
      >
        <ul className="rules">
          <li>
            <strong>{t("Benefit per month")}</strong>{" "}
            {t(
              "= reviews per month × AI-assisted share × coverage × cost per review × saving %. The share follows the roadmap milestones. This is the only benefit driver.",
            )}
          </li>
          <li>
            <strong>{t("Redeploy")}</strong>:{" "}
            {t(
              "a one-off move cost per person. Their salary is already paid. Each month, the work they leave behind is covered at backfill share × yearly cost ÷ 12.",
            )}
          </li>
          <li>
            <strong>{t("Reskill")}</strong>:{" "}
            {t(
              "a one-off training cost per person plus the move cost. Then the same monthly backfill as redeploy, plus a yearly pay rise ÷ 12.",
            )}
          </li>
          <li>
            <strong>{t("Hire")}</strong>:{" "}
            {t(
              "a one-off hire cost per person (recruitment, onboarding and ramp-up). Then the full yearly cost ÷ 12 every month from the start month to the end of the need.",
            )}
          </li>
          <li>
            <strong>{t("Contractor bridge")}</strong>:{" "}
            {t("day rate × 20 working days per FTE per month. Capped at 30% of each need.")}
          </li>
          <li>
            <strong>{t("Technology, change and platform run")}</strong>:{" "}
            {t(
              "one-off cost spread over each milestone, and a monthly run cost from the pilot. Programme costs stop at the deadline.",
            )}
          </li>
          <li>
            <strong>{t("Net")}</strong> {t("= benefit − cost, per month and cumulative.")} <strong>{t("ROI")}</strong>{" "}
            {t("= (benefit − cost) ÷ cost.")} <strong>{t("Yearly net at run rate")}</strong>{" "}
            {t("= (benefit − recurring cost in Dec 2028) × 12. An estimate, not a forecast.")}
          </li>
          <li>
            <strong>{t("Freed capacity")}</strong>{" "}
            {t(
              "is reported only as an aggregate FTE with an HR, legal and employee-representation review flag. It is not valued a second time.",
            )}
          </li>
        </ul>
        <details className="table-view">
          <summary>{t("Show the full monthly series for {option}", { option: scenarioLabel })}</summary>
          <DataTable
            caption={t("Monthly series, {option}", { option: scenarioLabel })}
            columns={[
              { key: "m", header: t("Month"), render: (r: (typeof result.monthly)[number]) => formatMonth(r.month) },
              { key: "cum", header: t("Cumulative net"), numeric: true, render: (r) => formatEur(r.cumulative_net_eur) },
              { key: "adopt", header: t("AI-assisted share"), numeric: true, render: (r) => formatPct(r.adoption_share, 0) },
            ]}
            rows={result.monthly}
            rowKey={(r) => r.month}
          />
        </details>
      </Card>
    </>
  );
}
