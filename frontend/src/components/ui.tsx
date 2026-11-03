import { useEffect, useId, useRef, type ReactNode } from "react";

// ---------------------------------------------------------------- layout

export function PageHeader({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        <h1>{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
      {actions ? <div className="page-head-actions">{actions}</div> : null}
    </header>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = useId();
  return (
    <section className={`card${className ? ` ${className}` : ""}`} aria-labelledby={headingId} id={id}>
      <header className="card-head">
        <div>
          <h2 id={headingId}>{title}</h2>
          {description ? <p className="card-desc">{description}</p> : null}
        </div>
        {actions ? <div className="card-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value${tone ? ` kpi-${tone}` : ""}`}>{value}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </div>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="kpi-row">{children}</div>;
}

export function Callout({ tone = "info", title, children }: { tone?: "info" | "warning" | "critical" | "success"; title?: string; children?: ReactNode }) {
  const role = tone === "critical" ? "alert" : "status";
  return (
    <div className={`callout callout-${tone}`} role={role}>
      <span className="callout-mark" aria-hidden="true">
        {tone === "success" ? "✓" : tone === "critical" ? "!" : tone === "warning" ? "!" : "i"}
      </span>
      <div>
        {title ? <strong className="callout-title">{title}</strong> : null}
        {children ? <div className="callout-body">{children}</div> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- controls

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** Single-choice toggle. Buttons with aria-pressed; the group has a visible or accessible name. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
}: {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className={`segmented segmented-${size}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="segment"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- tables

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  caption,
  rowKey,
  emptyText = "Nothing to show.",
}: {
  columns: Column<T>[];
  rows: T[];
  caption: string;
  rowKey: (row: T, index: number) => string;
  emptyText?: string;
}) {
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? "num" : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="empty">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={rowKey(row, i)}>
                {columns.map((c) => (
                  <td key={c.key} className={c.numeric ? "num" : undefined}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Table view for a chart. Every chart ships one, so values never depend on colour or hover. */
export function TableView({ children, label = "Show as table" }: { children: ReactNode; label?: string }) {
  return (
    <details className="table-view">
      <summary>{label}</summary>
      {children}
    </details>
  );
}

// ---------------------------------------------------------------- chart frame

/** Figure wrapper: title and reading guide above the chart, optional table view below. */
export function ChartFigure({
  label,
  children,
  table,
  tableLabel,
  note,
}: {
  label: string;
  children: ReactNode;
  table?: ReactNode;
  tableLabel?: string;
  note?: ReactNode;
}) {
  return (
    <figure className="chart-figure">
      <figcaption className="sr-only">{label}</figcaption>
      {children}
      {note ? <p className="chart-note">{note}</p> : null}
      {table ? <TableView label={tableLabel}>{table}</TableView> : null}
    </figure>
  );
}

// ---------------------------------------------------------------- dialog

/** Native modal dialog: focus trap, Escape and inert background come from the platform. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? " dialog-wide" : ""}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-body">
        <header className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </header>
        {open ? children : null}
      </div>
    </dialog>
  );
}
