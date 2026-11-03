import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEur, formatEurCompact, formatFte } from "../lib/format";
import { CHROME, currentTheme, SERIES, type Theme } from "../lib/palette";

function useTheme(): Theme {
  return useMemo(() => currentTheme(), []);
}

interface SeriesSpec {
  id: string;
  label: string;
  color: string;
}

/** Cumulative net per scenario. Colour follows the scenario identity, not its rank. */
export function CumulativeNetChart({ months, series, values }: {
  months: string[];
  series: SeriesSpec[];
  values: Record<string, number[]>;
}) {
  const theme = useTheme();
  const c = CHROME[theme];
  const data = months.map((m, i) => {
    const row: Record<string, string | number> = { month: m };
    for (const s of series) row[s.id] = values[s.id]?.[i] ?? 0;
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="month" tick={{ fill: c.muted, fontSize: 11 }} stroke={c.axis} minTickGap={24} />
        <YAxis tickFormatter={(v) => formatEurCompact(Number(v))} tick={{ fill: c.muted, fontSize: 11 }} stroke={c.axis} width={84} />
        <Tooltip formatter={(v) => formatEur(Number(v))} />
        <Legend wrapperStyle={{ color: c.inkSecondary, fontSize: 12 }} />
        {series.map((s) => (
          <Line key={s.id} type="monotone" dataKey={s.id} name={s.label} stroke={s.color} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Monthly cost against benefit for one scenario. Benefit is blue (slot 1), cost is orange (slot 2). */
export function CostBenefitChart({ rows }: { rows: { month: string; cost: number; benefit: number }[] }) {
  const theme = useTheme();
  const c = CHROME[theme];
  const [benefitColor, costColor] = SERIES[theme];
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="month" tick={{ fill: c.muted, fontSize: 11 }} stroke={c.axis} minTickGap={24} />
        <YAxis tickFormatter={(v) => formatEurCompact(Number(v))} tick={{ fill: c.muted, fontSize: 11 }} stroke={c.axis} width={84} />
        <Tooltip formatter={(v) => formatEur(Number(v))} />
        <Legend wrapperStyle={{ color: c.inkSecondary, fontSize: 12 }} />
        <Bar dataKey="benefit" name="Benefit (estimate)" fill={benefitColor} radius={[4, 4, 0, 0]} />
        <Bar dataKey="cost" name="Cost (estimate)" fill={costColor} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Required against staffed FTE by month. Required is the ink colour, staffed is blue. */
export function CapacityChart({ rows }: { rows: { month: string; required: number; staffed: number }[] }) {
  const theme = useTheme();
  const c = CHROME[theme];
  const [staffedColor] = SERIES[theme];
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="month" tick={{ fill: c.muted, fontSize: 11 }} stroke={c.axis} minTickGap={24} />
        <YAxis tickFormatter={(v) => formatFte(Number(v), 0)} tick={{ fill: c.muted, fontSize: 11 }} stroke={c.axis} width={56} />
        <Tooltip formatter={(v) => `${formatFte(Number(v))} FTE`} />
        <Legend wrapperStyle={{ color: c.inkSecondary, fontSize: 12 }} />
        <Line type="stepAfter" dataKey="required" name="Required FTE (mock demand)" stroke={c.inkSecondary} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="staffed" name="Staffed FTE (plan)" stroke={staffedColor} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
