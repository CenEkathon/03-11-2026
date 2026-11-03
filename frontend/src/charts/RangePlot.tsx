import { formatEur, formatEurCompact } from "../lib/format";
import { t } from "../i18n/i18n";
import type { RangeRow } from "../lib/viewModels";

/**
 * Low-base-high range per option, drawn in HTML so it scales with the card and keeps real text.
 * The bar spans the low and high case; the marker is the base case. A zero line anchors the sign.
 */
export function RangePlot({
  rows,
  label,
  color,
}: {
  rows: RangeRow[];
  label: (id: string) => string;
  color: (id: string) => string;
}) {
  if (rows.length === 0) return null;
  const lo = Math.min(0, ...rows.map((r) => r.low));
  const hi = Math.max(0, ...rows.map((r) => r.high));
  const pad = (hi - lo) * 0.08 || 1;
  const min = lo - pad;
  const max = hi + pad;
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  // Ticks sit on the real extremes and on zero. Padding stays invisible.
  const ticks = [...new Set([Math.round(lo), 0, Math.round(hi)])].sort((a, b) => a - b);

  return (
    <div className="range-plot">
      {rows.map((r) => (
        <div className="range-row" key={r.scenario}>
          <div className="range-label">{label(r.scenario)}</div>
          <div
            className="range-track"
            role="img"
            aria-label={t("{label}: base {base}, range {low} to {high}", {
              label: label(r.scenario),
              base: formatEur(r.base),
              low: formatEur(r.low),
              high: formatEur(r.high),
            })}
          >
            <span className="range-zero" style={{ left: `${pos(0)}%` }} aria-hidden="true" />
            <span
              className="range-bar"
              style={{ left: `${pos(r.low)}%`, width: `${Math.max(pos(r.high) - pos(r.low), 0.5)}%`, background: color(r.scenario) }}
              aria-hidden="true"
            />
            <span
              className="range-base"
              style={{ left: `${pos(r.base)}%`, background: color(r.scenario) }}
              aria-hidden="true"
            />
          </div>
          <div className="range-values">
            <strong>{formatEur(r.base)}</strong>
            <span className="muted small">
              {t("{low} to {high}", { low: formatEurCompact(r.low), high: formatEurCompact(r.high) })}
            </span>
          </div>
        </div>
      ))}
      <div className="range-axis" aria-hidden="true">
        <span />
        <div className="range-axis-track">
          {ticks.map((t) => (
            <span key={t} style={{ left: `${pos(t)}%` }}>
              {formatEurCompact(t)}
            </span>
          ))}
        </div>
        <span />
      </div>
    </div>
  );
}
