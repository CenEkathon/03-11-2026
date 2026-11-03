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

const CASE_ORDER = ["low", "base", "high"] as const;

export function Finance({ shared }: { shared: Shared }) {
  const { plan, sensitivity } = shared;
  const { series } = useChartTheme();
  const [scenario, setScenario] = useState<ScenarioId>(RECOMMENDED);
  const ids = SCENARIO_IDS.filter((id) => plan.scenarios[id]);
  const result = plan.scenarios[scenario];
  const t = result.totals;
  const deadlineMonth = plan.goal.deadline.slice(0, 7);
  const colorOf = (id: string) => series[SCENARIO_SLOT[id as ScenarioId]];
  const labelOf = (id: string) => SCENARIO_SHORT_LABEL[id as ScenarioId];

  const cumulative = useMemo(() => cumulativeRows(plan.scenarios, ids), [plan.scenarios, ids]);
  const cash = useMemo(() => cashRows(result.monthly), [result.monthly]);
  const ranges = useMemo(() => rangeRows(sensitivity, ids), [sensitivity, ids]);
  const sensRows = useMemo(
    () =>
      [...sensitivity].sort(
        (a, b) =>
          ids.indexOf(a.scenario) - ids.indexOf(b.scenario) || CASE_ORDER.indexOf(a.case) - CASE_ORDER.indexOf(b.case),
      ),
    [sensitivity, ids],
  );
  const spread = benefitSpread(plan, ids);

  type Row = { id: ScenarioId; t: Totals };
  const compareRows: Row[] = ids.map((id) => ({ id, t: plan.scenarios[id].totals }));
  const compareColumns: Column<Row>[] = [
    { key: "o", header: "Option", render: (r) => SCENARIO_SHORT_LABEL[r.id] },
    { key: "c", header: "Cost to deadline", numeric: true, render: (r) => formatEur(r.t.cost_total_eur) },
    { key: "b", header: "Benefit to deadline", numeric: true, render: (r) => formatEur(r.t.benefit_eur) },
    { key: "n", header: "Net to deadline", numeric: true, render: (r) => formatEur(r.t.net_eur) },
    { key: "r", header: "ROI", numeric: true, render: (r) => formatPct(r.t.roi) },
    { key: "np", header: "NPV", numeric: true, render: (r) => formatEur(r.t.npv_eur) },
    { key: "p", header: "Payback", render: (r) => (r.t.payback_month ? formatMonth(r.t.payback_month) : "After deadline") },
    {
      key: "e",
      header: "Extrapolated payback",
      render: (r) => (
        <span>
          {r.t.extended_payback_month ? formatMonth(r.t.extended_payback_month) : "Beyond 60 months"}{" "}
          <span className="tag">Extrapolated</span>
        </span>
      ),
    },
  ];

  const sensColumns: Column<SensitivityRow>[] = [
    { key: "s", header: "Option", render: (r) => SCENARIO_SHORT_LABEL[r.scenario] },
    { key: "c", header: "Case", render: (r) => r.case.charAt(0).toUpperCase() + r.case.slice(1) },
    { key: "n", header: "Net", numeric: true, render: (r) => formatEur(r.net_eur) },
    { key: "co", header: "Cost", numeric: true, render: (r) => formatEur(r.cost_total_eur) },
    { key: "b", header: "Benefit", numeric: true, render: (r) => formatEur(r.benefit_eur) },
    { key: "u", header: "Unmet FTE-months", numeric: true, render: (r) => formatFte(r.unmet_fte_months, 2) },
  ];

  const cashColumns: Column<(typeof cash)[number]>[] = [
    { key: "m", header: "Month", render: (r) => formatMonth(r.month) },
    { key: "b", header: "Benefit", numeric: true, render: (r) => formatEur(r.benefit) },
    { key: "c", header: "Cost", numeric: true, render: (r) => formatEur(r.cost) },
    { key: "n", header: "Net in month", numeric: true, render: (r) => formatEur(r.net) },
  ];

  const cumulativeColumns: Column<(typeof cumulative)[number]>[] = [
    { key: "m", header: "Month", render: (r) => formatMonth(r.month) },
    ...ids.map((id) => ({
      key: id,
      header: SCENARIO_SHORT_LABEL[id],
      numeric: true,
      render: (r: (typeof cumulative)[number]) => formatEur(r[id] ?? 0),
    })),
  ];

  return (
    <>
      <PageHeader
        title="Money"
        lead="Costs against benefits for each option, month by month, through the deadline. Benefit comes from fewer costly reviews. Costs come from the staffing actions. Everything is an estimate."
        actions={
          <Segmented
            label="Option"
            options={ids.map((id) => ({ value: id, label: SCENARIO_SHORT_LABEL[id] }))}
            value={scenario}
            onChange={setScenario}
          />
        }
      />

      <KpiRow>
        <Kpi label="Cost to deadline" value={formatEur(t.cost_total_eur)} sub={`Recurring ${formatEur(t.cost_recurring_eur)}`} />
        <Kpi label="Benefit to deadline" value={formatEur(t.benefit_eur)} />
        <Kpi label="Net to deadline" value={formatEur(t.net_eur)} tone={t.net_eur < 0 ? "bad" : "good"} sub={`NPV ${formatEur(t.npv_eur)}`} />
        <Kpi label="ROI to deadline" value={formatPct(t.roi)} tone={t.roi !== null && t.roi < 0 ? "bad" : "good"} />
        <Kpi
          label="Payback"
          value={t.payback_month ? formatMonth(t.payback_month) : "Not by deadline"}
          sub={t.extended_payback_month ? `Extrapolated ${formatMonth(t.extended_payback_month)}` : undefined}
        />
      </KpiRow>

      {t.payback_month === null ? (
        <Callout tone="warning" title={`${SCENARIO_SHORT_LABEL[scenario]} does not pay back before the deadline`}>
          {t.extended_payback_note}
        </Callout>
      ) : null}

      <Card
        title="Cumulative net, by option"
        description="Running total of benefit minus cost. Payback is where a line crosses zero. The recommended option is drawn thicker."
        actions={<LabelBadge labelKey="estimates" />}
      >
        <ChartFigure
          label="Line chart of cumulative net value by month for each option. A zero line marks break-even."
          note={
            spread === 0
              ? "Benefit is identical in every option, because it is driven by adoption and coverage. The options differ only in cost, so the lines separate by cost."
              : undefined
          }
          tableLabel="Show monthly cumulative net as table"
          table={<DataTable caption="Cumulative net by option and month" columns={cumulativeColumns} rows={cumulative} rowKey={(r) => r.month} />}
        >
          <CumulativeChart
            rows={cumulative}
            series={ids.map((id) => ({ id, label: SCENARIO_SHORT_LABEL[id], color: colorOf(id) }))}
            emphasis={RECOMMENDED}
            deadlineMonth={deadlineMonth}
          />
        </ChartFigure>
      </Card>

      <div className="grid-2">
        <Card
          title={`Monthly cost and benefit: ${SCENARIO_SHORT_LABEL[scenario]}`}
          description="Benefit above the line, cost below it. Both in EUR per month."
          actions={<LabelBadge labelKey="estimates" />}
        >
          <ChartFigure
            label={`Column chart of monthly benefit above zero and monthly cost below zero for the ${SCENARIO_SHORT_LABEL[scenario]} option.`}
            tableLabel="Show monthly cost and benefit as table"
            table={<DataTable caption={`Monthly cost and benefit, ${SCENARIO_SHORT_LABEL[scenario]}`} columns={cashColumns} rows={cash} rowKey={(r) => r.month} />}
          >
            <CashChart rows={cash} />
          </ChartFigure>
        </Card>

        <Card
          title="Net to deadline: low, base and high"
          description="Each bar is the range across the sensitivity cases. The dot is the base case. Low is the conservative case: higher cost, lower benefit."
          actions={<LabelBadge labelKey="assumptions" />}
        >
          {ranges.length > 0 ? (
            <RangePlot rows={ranges} label={labelOf} color={colorOf} />
          ) : (
            <p className="muted">Sensitivity is not available.</p>
          )}
          <TableView label="Show sensitivity as table">
            <DataTable caption="Sensitivity by option and case" columns={sensColumns} rows={sensRows} rowKey={(r) => `${r.scenario}-${r.case}`} />
          </TableView>
        </Card>
      </div>

      <Card
        title="All options side by side"
        description="Totals through the deadline, from the same roadmap and assumptions."
        actions={<LabelBadge labelKey="estimates" />}
      >
        <DataTable caption="Options compared" columns={compareColumns} rows={compareRows} rowKey={(r) => r.id} />
      </Card>

      <Card title="How the numbers are built" description="Every figure traces back to one of these rules. The inputs are mock assumptions you can change on the Assumptions page.">
        <ul className="rules">
          <li>
            <strong>Benefit per month</strong> = reviews per month × AI-assisted share × coverage × cost per review × saving %. The
            share follows the roadmap milestones. This is the only benefit driver.
          </li>
          <li>
            <strong>Redeploy</strong>: no new salary. Only backfill of the work the person leaves behind.
          </li>
          <li>
            <strong>Reskill</strong>: training (days × day rate) and backfill during training, then a salary uplift and backfill.
          </li>
          <li>
            <strong>Hire</strong>: recruitment fee, onboarding and mentor time once, then the full salary from the start month.
          </li>
          <li>
            <strong>Contractor bridge</strong>: FTE × day rate × working days, capped at a share of each requirement.
          </li>
          <li>
            <strong>Technology, change and platform run</strong>: one-off cost spread over each milestone, and a monthly run cost from the pilot.
            Programme costs stop at the deadline.
          </li>
          <li>
            <strong>Net</strong> = benefit − cost, per month and cumulative. <strong>NPV</strong> discounts the monthly net at the mock
            discount rate. <strong>ROI</strong> = (benefit − cost) ÷ cost.
          </li>
          <li>
            <strong>Freed capacity</strong> is reported only as an aggregate FTE with an HR, legal and employee-representation review flag.
            It is not valued a second time.
          </li>
        </ul>
        <details className="table-view">
          <summary>Show the full monthly series for {SCENARIO_SHORT_LABEL[scenario]}</summary>
          <DataTable
            caption={`Monthly series, ${SCENARIO_SHORT_LABEL[scenario]}`}
            columns={[
              { key: "m", header: "Month", render: (r: (typeof result.monthly)[number]) => formatMonth(r.month) },
              { key: "cum", header: "Cumulative net", numeric: true, render: (r) => formatEur(r.cumulative_net_eur) },
              { key: "adopt", header: "AI-assisted share", numeric: true, render: (r) => formatPct(r.adoption_share, 0) },
            ]}
            rows={result.monthly}
            rowKey={(r) => r.month}
          />
        </details>
      </Card>
    </>
  );
}
