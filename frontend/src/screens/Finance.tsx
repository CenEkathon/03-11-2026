import { useState } from "react";
import { CostBenefitChart, CumulativeNetChart } from "../charts/Charts";
import { Badge, BadgeRow, Card, DataTable, TableTwin, type Column } from "../components/ui";
import type { Shared, Controls } from "../appTypes";
import type { AssumptionRow, ScenarioId, SensitivityRow, Totals } from "../api/types";
import { SCENARIO_IDS } from "../api/types";
import { formatEur, formatFte, formatMonth, formatPct } from "../lib/format";
import { SCENARIO_SHORT_LABEL, SCENARIO_SLOT } from "../lib/labels";
import { currentTheme, SERIES } from "../lib/palette";

type CaseKey = "low" | "base" | "high";
const CASE_ORDER: CaseKey[] = ["low", "base", "high"];

export function Finance({ shared, controls }: { shared: Shared; controls: Controls }) {
  const { plan, assumptions, sensitivity } = shared;
  const [monthlyScenario, setMonthlyScenario] = useState<ScenarioId>("hybrid");
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(controls.overrides).map(([k, v]) => [k, String(v)])),
  );
  const [assumptionErrors, setAssumptionErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const theme = currentTheme();
  const palette = SERIES[theme];

  const months = plan.scenarios.hybrid?.monthly.map((m) => formatMonth(m.month)) ?? [];
  const cumulativeSeries = SCENARIO_IDS.filter((id) => plan.scenarios[id]).map((id) => ({
    id,
    label: SCENARIO_SHORT_LABEL[id],
    color: palette[SCENARIO_SLOT[id]],
  }));
  const cumulativeValues = Object.fromEntries(
    cumulativeSeries.map((s) => [s.id, plan.scenarios[s.id].monthly.map((m) => m.cumulative_net_eur)]),
  );

  const monthlyRows = plan.scenarios[monthlyScenario].monthly.map((m) => ({
    month: formatMonth(m.month),
    cost: m.cost_one_off_eur + m.cost_recurring_eur,
    benefit: m.benefit_eur,
  }));

  const comparison = SCENARIO_IDS.filter((id) => plan.scenarios[id]).map((id) => ({
    id,
    label: plan.scenarios[id].label,
    t: plan.scenarios[id].totals,
  }));

  type Row = { id: ScenarioId; label: string; t: Totals };
  const compareColumns: Column<Row>[] = [
    { key: "s", header: "Scenario", render: (r) => r.label },
    { key: "one", header: "One-off cost", numeric: true, render: (r) => formatEur(r.t.cost_one_off_eur) },
    { key: "rec", header: "Recurring cost", numeric: true, render: (r) => formatEur(r.t.cost_recurring_eur) },
    { key: "cost", header: "Total cost", numeric: true, render: (r) => formatEur(r.t.cost_total_eur) },
    { key: "ben", header: "Benefit", numeric: true, render: (r) => formatEur(r.t.benefit_eur) },
    { key: "net", header: "Net", numeric: true, render: (r) => formatEur(r.t.net_eur) },
    { key: "roi", header: "ROI", numeric: true, render: (r) => formatPct(r.t.roi) },
    {
      key: "pb",
      header: "Payback by deadline",
      render: (r) => (r.t.payback_month ? formatMonth(r.t.payback_month) : "Not within deadline"),
    },
    {
      key: "ext",
      header: "Extended payback",
      render: (r) => (
        <span>
          {r.t.extended_payback_month ? formatMonth(r.t.extended_payback_month) : "Not within 60 months"}{" "}
          <span className="tag extrapolated">EXTRAPOLATED</span>
        </span>
      ),
    },
    { key: "npv", header: "NPV", numeric: true, render: (r) => formatEur(r.t.npv_eur) },
    { key: "unmet", header: "Unmet FTE-months", numeric: true, render: (r) => formatFte(r.t.unmet_fte_months, 2) },
  ];

  const sensColumns: Column<SensitivityRow>[] = [
    { key: "s", header: "Scenario", render: (r) => SCENARIO_SHORT_LABEL[r.scenario] },
    { key: "c", header: "Case", render: (r) => r.case },
    { key: "net", header: "Net", numeric: true, render: (r) => formatEur(r.net_eur) },
    { key: "roi", header: "ROI", numeric: true, render: (r) => formatPct(r.roi) },
    { key: "cost", header: "Total cost", numeric: true, render: (r) => formatEur(r.cost_total_eur) },
    { key: "ben", header: "Benefit", numeric: true, render: (r) => formatEur(r.benefit_eur) },
    { key: "unmet", header: "Unmet FTE-months", numeric: true, render: (r) => formatFte(r.unmet_fte_months, 2) },
  ];
  const sensRows = (sensitivity ?? []).slice().sort(
    (a, b) =>
      SCENARIO_IDS.indexOf(a.scenario) - SCENARIO_IDS.indexOf(b.scenario) ||
      CASE_ORDER.indexOf(a.case as CaseKey) - CASE_ORDER.indexOf(b.case as CaseKey),
  );

  const assumptionColumns: Column<AssumptionRow>[] = [
    {
      key: "label",
      header: "Assumption (MOCK)",
      render: (a) => (
        <span title={a.rationale}>
          {a.label} <span className="muted small">({a.key})</span>
        </span>
      ),
    },
    { key: "unit", header: "Unit", render: (a) => a.unit },
    { key: "low", header: "Low", numeric: true, render: (a) => a.low },
    { key: "base", header: "Base", numeric: true, render: (a) => a.base },
    { key: "high", header: "High", numeric: true, render: (a) => a.high },
    { key: "conf", header: "Confidence", render: (a) => a.confidence },
    {
      key: "override",
      header: "Your override (base case)",
      render: (a) => (
        <input
          type="number"
          step="any"
          aria-label={`Override ${a.key}`}
          value={drafts[a.key] ?? ""}
          placeholder={String(a.base)}
          onChange={(e) => setDrafts((prev) => ({ ...prev, [a.key]: e.target.value }))}
        />
      ),
    },
  ];

  const applyOverrides = async (next: Record<string, number>) => {
    setBusy(true);
    const result = await controls.applyAssumptions(next);
    setBusy(false);
    setAssumptionErrors(result ?? []);
  };

  const numericDrafts = () =>
    Object.fromEntries(
      Object.entries(drafts)
        .filter(([, v]) => v.trim() !== "" && !Number.isNaN(Number(v)))
        .map(([k, v]) => [k, Number(v)]),
    );

  const freedPeak = comparison.map((c) => `${c.label}: ${formatFte(c.t.freed_capacity_fte_peak)} FTE`).join("; ");
  const freedFlag = comparison[0]?.t.freed_capacity_flag ?? "HR / legal / employee-representation review required";

  return (
    <div className="screen">
      <Card
        title="Scenario comparison (ESTIMATE)"
        actions={
          <div className="badge-stack">
            <BadgeRow labelKey="estimates" labels={plan.labels} />
            <BadgeRow labelKey="assumptions" labels={plan.labels} />
          </div>
        }
      >
        <p className="small muted">
          Benefit comes from reviews x AI-assisted share x coverage x cost per review x saving %. Costs come from the workforce
          actions. Payback is counted from the first month with a cost.
        </p>
        <DataTable columns={compareColumns} rows={comparison} rowKey={(r) => r.id} caption="Scenario comparison (mock estimates)" />
        <p className="small">
          <strong>Aggregate freed capacity (peak FTE, not per person):</strong> {freedPeak}.{" "}
          <span className="flag">{freedFlag}.</span>
        </p>
      </Card>

      <Card title="Cumulative net by scenario (ESTIMATE)">
        <CumulativeNetChart months={months} series={cumulativeSeries} values={cumulativeValues} />
        <TableTwin>
          <DataTable
            columns={[
              { key: "m", header: "Month", render: (r: { m: string }) => r.m },
              ...cumulativeSeries.map((s) => ({
                key: s.id,
                header: s.label,
                numeric: true,
                render: (r: { m: string }) => formatEur(cumulativeValues[s.id][months.indexOf(r.m)]),
              })),
            ]}
            rows={months.map((m) => ({ m }))}
            rowKey={(r) => r.m}
            caption="Cumulative net, EUR"
          />
        </TableTwin>
      </Card>

      <Card
        title="Monthly cost and benefit"
        actions={
          <div className="tabs" role="tablist" aria-label="Scenario for monthly chart">
            {SCENARIO_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={id === monthlyScenario}
                className={`tab${id === monthlyScenario ? " active" : ""}`}
                onClick={() => setMonthlyScenario(id)}
              >
                {SCENARIO_SHORT_LABEL[id]}
              </button>
            ))}
          </div>
        }
      >
        <CostBenefitChart rows={monthlyRows} />
        <TableTwin>
          <DataTable
            columns={[
              { key: "m", header: "Month", render: (r: (typeof monthlyRows)[number]) => r.month },
              { key: "c", header: "Cost", numeric: true, render: (r) => formatEur(r.cost) },
              { key: "b", header: "Benefit", numeric: true, render: (r) => formatEur(r.benefit) },
            ]}
            rows={monthlyRows}
            rowKey={(r) => r.month}
            caption={`Monthly cost and benefit, ${SCENARIO_SHORT_LABEL[monthlyScenario]}`}
          />
        </TableTwin>
      </Card>

      <Card title="Sensitivity (low, base, high)" actions={<Badge labelKey="estimates" caption={plan.labels.estimates} />}>
        <p className="small muted">Low is the conservative case, with higher cost and lower benefit. High is optimistic.</p>
        <DataTable columns={sensColumns} rows={sensRows} rowKey={(r) => `${r.scenario}-${r.case}`} caption="Sensitivity" />
      </Card>

      <Card title="Editable assumptions (MOCK)" actions={<Badge labelKey="assumptions" caption={plan.labels.assumptions} />}>
        <p className="small muted">
          Overrides apply to the base case and are sent with the next compute. They are not saved on the server. Hover a
          name to see its rationale.
        </p>
        <DataTable columns={assumptionColumns} rows={assumptions} rowKey={(a) => a.key} caption="Assumptions" />
        {assumptionErrors.length > 0 ? (
          <div className="alert" role="alert">
            <ul>
              {assumptionErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="actions-row">
          <button type="button" className="btn primary" disabled={busy} onClick={() => applyOverrides(numericDrafts())}>
            {busy ? "Recomputing..." : "Apply overrides"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              setDrafts({});
              applyOverrides({});
            }}
          >
            Clear overrides
          </button>
        </div>
      </Card>
    </div>
  );
}
