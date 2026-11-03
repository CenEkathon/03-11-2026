import { useEffect, type ReactNode } from "react";
import { badgeKind, type BadgeKind } from "../lib/labels";

/** Visible data-status badge. The caption is the full label text from response.labels. */
export function Badge({ labelKey, caption }: { labelKey: string; caption?: string }) {
  const kind: BadgeKind = badgeKind(labelKey);
  return (
    <span className={`badge badge-${kind.toLowerCase()}`} title={caption} data-kind={kind}>
      {kind}
    </span>
  );
}

export function BadgeRow({ labelKey, labels }: { labelKey: string; labels: Record<string, string> }) {
  return (
    <div className="badge-row">
      <Badge labelKey={labelKey} caption={labels[labelKey]} />
      <span className="caption">{labels[labelKey] ?? ""}</span>
    </div>
  );
}

export function Card({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      <header className="card-head">
        <h2>{title}</h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
}

export function DataTable<T>({ columns, rows, caption, rowKey }: {
  columns: Column<T>[];
  rows: T[];
  caption?: string;
  rowKey: (row: T, index: number) => string;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        {caption ? <caption>{caption}</caption> : null}
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
                No rows.
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

/** Table twin for a chart. Every chart ships one, so values never depend on colour alone. */
export function TableTwin({ children, label = "Table view" }: { children: ReactNode; label?: string }) {
  return (
    <details className="table-twin">
      <summary>{label}</summary>
      {children}
    </details>
  );
}

export function Drawer({ open, title, onClose, children }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <h3>{title}</h3>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

export const SCREENS = [
  { id: "goal", label: "1 Goal and roadmap" },
  { id: "demand", label: "2 Demand" },
  { id: "supply", label: "3 Supply and gaps" },
  { id: "actions", label: "4 Actions" },
  { id: "finance", label: "5 Finance and scenarios" },
  { id: "brief", label: "6 CEO brief" },
] as const;

export type ScreenId = (typeof SCREENS)[number]["id"];

export function NavBar({ active, onSelect }: { active: ScreenId; onSelect: (id: ScreenId) => void }) {
  return (
    <nav className="nav" aria-label="Screens">
      {SCREENS.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`nav-item${s.id === active ? " active" : ""}`}
          aria-current={s.id === active ? "page" : undefined}
          onClick={() => onSelect(s.id)}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}
