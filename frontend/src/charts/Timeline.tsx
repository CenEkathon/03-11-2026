import { monthIndex } from "../lib/months";
import { formatMonth, formatPct } from "../lib/format";

export interface TimelineRow {
  id: string;
  name: string;
  owner: string;
  start: string;
  end: string;
  dependsOn: string[];
  /** AI-assisted share reached at the end of the milestone. Shown inside the bar. */
  share: number;
}

const MONTH_LETTERS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Gantt-style roadmap built from CSS grid. One column per month. Bars follow the draft dates, so the
 * timeline updates while the user edits. Each bar has a full text label for screen readers.
 */
export function Timeline({
  rows,
  months,
  deadline,
}: {
  rows: TimelineRow[];
  months: string[];
  deadline: string;
}) {
  const first = monthIndex(months[0]) ?? 0;
  const colOf = (ym: string) => {
    const idx = monthIndex(ym);
    if (idx === null) return null;
    return Math.min(Math.max(idx - first, 0), months.length - 1) + 2; // grid column 1 holds the labels
  };
  const deadlineCol = colOf(deadline.slice(0, 7));
  const lastCol = months.length + 1; // inclusive end column

  // Year headers span the months they cover.
  const years: { year: string; from: number; to: number }[] = [];
  months.forEach((ym, i) => {
    const year = ym.slice(0, 4);
    const col = i + 2;
    const last = years[years.length - 1];
    if (last && last.year === year) last.to = col;
    else years.push({ year, from: col, to: col });
  });

  const headerRows = 2;
  const totalRows = headerRows + rows.length;

  return (
    <div className="timeline" role="group" aria-label="Roadmap timeline">
      <div
        className="timeline-grid"
        style={{
          gridTemplateColumns: `minmax(220px, 260px) repeat(${months.length}, minmax(30px, 1fr))`,
          gridTemplateRows: `auto auto repeat(${rows.length}, minmax(72px, auto))`,
        }}
      >
        {/* header: years and months */}
        <div className="tl-corner" style={{ gridColumn: 1, gridRow: `1 / span ${headerRows}` }}>
          Milestone
        </div>
        {years.map((y) => (
          <div key={y.year} className="tl-year" style={{ gridColumn: `${y.from} / ${y.to + 1}`, gridRow: 1 }}>
            {y.year}
          </div>
        ))}
        {months.map((ym, i) => (
          <div key={ym} className="tl-month" style={{ gridColumn: i + 2, gridRow: 2 }} title={formatMonth(ym)}>
            {MONTH_LETTERS[Number(ym.slice(5, 7)) - 1]}
          </div>
        ))}

        {/* month rules across the body */}
        {months.map((ym, i) => (
          <div
            key={`rule-${ym}`}
            className={`tl-rule${ym.endsWith("-01") ? " tl-rule-year" : ""}`}
            style={{ gridColumn: i + 2, gridRow: `${headerRows + 1} / ${totalRows + 1}` }}
            aria-hidden="true"
          />
        ))}

        {/* deadline marker */}
        {deadlineCol !== null ? (
          <div
            className="tl-deadline"
            style={{ gridColumn: deadlineCol, gridRow: `${headerRows + 1} / ${totalRows + 1}` }}
            aria-hidden="true"
          >
            <span>Deadline {formatMonth(deadline.slice(0, 7))}</span>
          </div>
        ) : null}

        {rows.map((row, i) => {
          const r = headerRows + 1 + i;
          const s = colOf(row.start);
          const e = colOf(row.end);
          const startIdx = monthIndex(row.start);
          const endIdx = monthIndex(row.end);
          const valid = startIdx !== null && endIdx !== null && endIdx >= startIdx && s !== null && e !== null;
          return (
            <div key={row.id} className="tl-row-cells" style={{ display: "contents" }}>
              <div className="tl-label" style={{ gridColumn: 1, gridRow: r }}>
                <div className="tl-label-top">
                  <span className="tl-id">{row.id}</span>
                  <span className="tl-name">{row.name}</span>
                </div>
                <div className="tl-label-sub">
                  {row.owner}
                  {row.dependsOn.length ? ` · after ${row.dependsOn.join(", ")}` : " · starts the plan"}
                </div>
                <div className="tl-label-dates">
                  {valid ? `${formatMonth(row.start)} – ${formatMonth(row.end)}` : "Dates not set"}
                </div>
              </div>
              {valid ? (
                <div
                  className="tl-bar"
                  style={{ gridColumn: `${s} / ${e + 1}`, gridRow: r }}
                  role="img"
                  aria-label={`${row.id} ${row.name}: ${formatMonth(row.start)} to ${formatMonth(row.end)}. AI-assisted share ${formatPct(row.share, 0)} at end.`}
                >
                  <span className="tl-bar-text">{formatPct(row.share, 0)}</span>
                </div>
              ) : (
                <div className="tl-invalid" style={{ gridColumn: `2 / ${lastCol + 1}`, gridRow: r }}>
                  Enter valid months to draw this milestone.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
