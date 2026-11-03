/**
 * Chart components. Each one answers one question the CEO asks, and each is paired with a table view
 * in the screen that uses it. Colours come from useChartTheme, so light and dark modes are both validated.
 */
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartTheme } from "../theme/ThemeProvider";
import { formatAxisMonth, formatEur, formatEurCompact, formatFte, formatPct } from "../lib/format";
import type { AdoptionPoint, CashRow, CoverageRow, CumulativeRow, MixRow } from "../lib/viewModels";
import { ACTION_TYPE_LABEL } from "../lib/labels";
import type { ActionType } from "../api/types";

// ---------------------------------------------------------------- shared pieces

interface TipItem {
  name?: unknown;
  value?: unknown;
  color?: unknown;
  dataKey?: unknown;
}

/** One tooltip for every chart: values lead, series names follow, and every series at that x is listed. */
function ChartTooltip({
  active,
  payload,
  label,
  format,
  keyShape,
}: {
  active?: boolean;
  payload?: readonly TipItem[];
  label?: unknown;
  format: (value: number, key: string) => string;
  keyShape: "line" | "box";
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-label">{formatTipLabel(label)}</div>
      {payload.map((p) => {
        const key = String(p.dataKey ?? "");
        return (
          <div className="chart-tip-row" key={key}>
            <span
              className={`chart-tip-key chart-tip-key-${keyShape}`}
              style={{ background: String(p.color) }}
              aria-hidden="true"
            />
            <span className="chart-tip-name">{String(p.name ?? key)}</span>
            <strong className="chart-tip-value">{format(Number(p.value), key)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function formatTipLabel(label: unknown): string {
  const s = String(label ?? "");
  return /^\d{4}-\d{2}$/.test(s) ? formatAxisMonth(s).replace("'", " 20") : s;
}

/** Legend labels take the text colour, never the series colour. The swatch beside them carries identity. */
function legendText(color: string) {
  return (value: string) => <span style={{ color }}>{value}</span>;
}

/** Quarterly ticks keep 24 months readable without rotating labels. */
function quarterTicks(months: string[]): string[] {
  return months.filter((_, i) => i % 3 === 0);
}

// ---------------------------------------------------------------- AI-assisted share against the goal

export function AdoptionChart({ rows, target, targetLabel }: { rows: AdoptionPoint[]; target: number; targetLabel: string }) {
  const { series, chrome } = useChartTheme();
  const months = rows.map((r) => r.month);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rows} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={chrome.grid} vertical={false} />
        <XAxis
          dataKey="month"
          ticks={quarterTicks(months)}
          tickFormatter={formatAxisMonth}
          tick={{ fill: chrome.muted, fontSize: 12 }}
          stroke={chrome.axis}
          tickLine={false}
        />
        <YAxis
          domain={[0, 1]}
          ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]}
          tickFormatter={(v) => formatPct(Number(v), 0)}
          tick={{ fill: chrome.muted, fontSize: 12 }}
          stroke={chrome.axis}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <ReferenceLine
          y={target}
          stroke={chrome.target}
          strokeWidth={1}
          label={{ value: targetLabel, position: "insideTopLeft", fill: chrome.inkSecondary, fontSize: 12 }}
        />
        <Tooltip
          cursor={{ stroke: chrome.axis }}
          content={(p) => (
            <ChartTooltip
              {...p}
              keyShape="line"
              format={(v) => formatPct(v, 1)}
            />
          )}
        />
        <Line
          type="monotone"
          dataKey="share"
          name="AI-assisted share"
          stroke={series[0]}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5, stroke: chrome.surface, strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------- cumulative net by option

export interface SeriesSpec {
  id: string;
  label: string;
  color: string;
}

/**
 * Cumulative net by option. The recommended option is the emphasis: thicker, every other option thinner.
 * A zero line and the deadline make the payback question readable at a glance.
 */
export function CumulativeChart({
  rows,
  series,
  emphasis,
  deadlineMonth,
}: {
  rows: CumulativeRow[];
  series: SeriesSpec[];
  emphasis: string;
  deadlineMonth: string;
}) {
  const { chrome } = useChartTheme();
  const months = rows.map((r) => r.month);
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={rows} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={chrome.grid} vertical={false} />
        <XAxis
          dataKey="month"
          ticks={quarterTicks(months)}
          tickFormatter={formatAxisMonth}
          tick={{ fill: chrome.muted, fontSize: 12 }}
          stroke={chrome.axis}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => formatEurCompact(Number(v))}
          tick={{ fill: chrome.muted, fontSize: 12 }}
          stroke={chrome.axis}
          tickLine={false}
          axisLine={false}
          width={84}
        />
        <ReferenceLine y={0} stroke={chrome.inkSecondary} strokeWidth={1} />
        <ReferenceLine
          x={deadlineMonth}
          stroke={chrome.axis}
          strokeWidth={1}
          label={{ value: "Deadline", position: "insideTopRight", fill: chrome.inkSecondary, fontSize: 12 }}
        />
        <Tooltip cursor={{ stroke: chrome.axis }} content={(p) => <ChartTooltip {...p} keyShape="line" format={(v) => formatEur(v)} />} />
        <Legend iconType="plainline" formatter={legendText(chrome.inkSecondary)} wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
        {series.map((s) => (
          <Line
            key={s.id}
            type="monotone"
            dataKey={s.id}
            name={s.label}
            stroke={s.color}
            strokeWidth={s.id === emphasis ? 3 : 1.5}
            dot={false}
            activeDot={{ r: 5, stroke: chrome.surface, strokeWidth: 2 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------- monthly cash: benefit up, cost down

/** Diverging bars around zero: benefit above the line, cost below it. Both in EUR, so one axis is honest. */
export function CashChart({ rows }: { rows: CashRow[] }) {
  const { series, chrome } = useChartTheme();
  const data = rows.map((r) => ({ month: r.month, benefit: r.benefit, cost: -r.cost }));
  const months = rows.map((r) => r.month);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: 0 }} stackOffset="sign">
        <CartesianGrid stroke={chrome.grid} vertical={false} />
        <XAxis
          dataKey="month"
          ticks={quarterTicks(months)}
          tickFormatter={formatAxisMonth}
          tick={{ fill: chrome.muted, fontSize: 12 }}
          stroke={chrome.axis}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => formatEurCompact(Number(v))}
          tick={{ fill: chrome.muted, fontSize: 12 }}
          stroke={chrome.axis}
          tickLine={false}
          axisLine={false}
          width={84}
        />
        <ReferenceLine y={0} stroke={chrome.inkSecondary} strokeWidth={1} />
        <Tooltip
          cursor={{ fill: chrome.grid, fillOpacity: 0.5 }}
          content={(p) => (
            <ChartTooltip
              {...p}
              keyShape="box"
              format={(v, key) => (key === "cost" ? formatEur(Math.abs(v)) : formatEur(v))}
            />
          )}
        />
        <Legend iconType="square" formatter={legendText(chrome.inkSecondary)} wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
        <Bar dataKey="benefit" name="Benefit (estimate)" stackId="cash" fill={series[0]} maxBarSize={18} />
        <Bar dataKey="cost" name="Cost (estimate)" stackId="cash" fill={series[1]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------- net value by option (one bar each)

export interface OptionBar {
  id: string;
  label: string;
  value: number;
  color: string;
}

export function NetByOptionChart({ rows }: { rows: OptionBar[] }) {
  const { chrome } = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 64 + 40)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={chrome.grid} horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v) => formatEurCompact(Number(v))}
          tick={{ fill: chrome.muted, fontSize: 12 }}
          stroke={chrome.axis}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={120}
          tick={{ fill: chrome.ink, fontSize: 13 }}
          stroke={chrome.axis}
          tickLine={false}
          axisLine={false}
        />
        <ReferenceLine x={0} stroke={chrome.inkSecondary} strokeWidth={1} />
        <Tooltip
          cursor={{ fill: chrome.grid, fillOpacity: 0.5 }}
          content={(p) => <ChartTooltip {...p} keyShape="box" format={(v) => formatEur(v)} />}
        />
        <Bar dataKey="value" name="Net to deadline (estimate)" maxBarSize={24}>
          {rows.map((r) => (
            <Cell key={r.id} fill={r.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------- required against staffed FTE

export function CoverageChart({
  rows,
  window,
}: {
  rows: CoverageRow[];
  window: { from: string; to: string } | null;
}) {
  const { series, chrome } = useChartTheme();
  const months = rows.map((r) => r.month);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={rows} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={chrome.grid} vertical={false} />
        {window ? <ReferenceArea x1={window.from} x2={window.to} fill={chrome.ink} fillOpacity={0.06} stroke="none" /> : null}
        <XAxis
          dataKey="month"
          ticks={quarterTicks(months)}
          tickFormatter={formatAxisMonth}
          tick={{ fill: chrome.muted, fontSize: 12 }}
          stroke={chrome.axis}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => formatFte(Number(v), 0)}
          tick={{ fill: chrome.muted, fontSize: 12 }}
          stroke={chrome.axis}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          cursor={{ stroke: chrome.axis }}
          content={(p) => <ChartTooltip {...p} keyShape="line" format={(v) => `${formatFte(v)} FTE`} />}
        />
        <Legend iconType="plainline" formatter={legendText(chrome.inkSecondary)} wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
        <Area
          type="stepAfter"
          dataKey="required"
          name="Required FTE"
          stroke={chrome.inkSecondary}
          strokeWidth={2}
          fill={chrome.inkSecondary}
          fillOpacity={0.08}
          dot={false}
        />
        <Line type="stepAfter" dataKey="staffed" name="Staffed FTE" stroke={series[0]} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------- where the FTE comes from

export function MixChart({ rows }: { rows: MixRow[] }) {
  const { series, neutral, chrome } = useChartTheme();
  // Stack order bottom to top: the internal levers first, the contractor bridge last.
  const parts: { key: ActionType; color: string }[] = [
    { key: "reskill", color: series[0] },
    { key: "redeploy", color: series[2] },
    { key: "hire", color: series[1] },
    { key: "external", color: neutral },
  ];
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={rows} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={chrome.grid} vertical={false} />
        <XAxis dataKey="milestone" tick={{ fill: chrome.ink, fontSize: 13 }} stroke={chrome.axis} tickLine={false} />
        <YAxis
          tickFormatter={(v) => formatFte(Number(v), 0)}
          tick={{ fill: chrome.muted, fontSize: 12 }}
          stroke={chrome.axis}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          cursor={{ fill: chrome.grid, fillOpacity: 0.5 }}
          content={(p) => <ChartTooltip {...p} keyShape="box" format={(v) => `${formatFte(v)} FTE`} />}
        />
        <Legend iconType="square" formatter={legendText(chrome.inkSecondary)} wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
        {parts.map((p) => (
          <Bar
            key={p.key}
            dataKey={p.key}
            name={ACTION_TYPE_LABEL[p.key]}
            stackId="mix"
            fill={p.color}
            stroke={chrome.surface}
            strokeWidth={2}
            maxBarSize={24}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

