import { useState, type ReactNode } from "react";
import { useTheme, type ThemePreference } from "../theme/ThemeProvider";
import { PAGES, type PageId } from "../routing";
import { Dialog, Badge, Segmented } from "./ui";
import { BADGE_MEANING, type BadgeKind } from "../lib/labels";
import type { CaseId } from "../api/types";

const BADGE_ORDER: BadgeKind[] = ["MOCK", "SYNTHETIC", "EXTERNAL", "ESTIMATE"];

const CASE_OPTIONS = [
  { value: "low" as const, label: "Low" },
  { value: "base" as const, label: "Base" },
  { value: "high" as const, label: "High" },
];

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

interface ShellProps {
  page: PageId;
  onNavigate: (p: PageId) => void;
  caseId: CaseId;
  onCaseChange: (c: CaseId) => void;
  busy: boolean;
  edited: boolean;
  /** False until the mock analysis has finished. Navigation and the case selector stay hidden until then. */
  navigable: boolean;
  children: ReactNode;
}

/** Frame for every screen: navigation, global case selector, theme and the demo-data notice. */
export function AppShell({ page, onNavigate, caseId, onCaseChange, busy, edited, navigable, children }: ShellProps) {
  const { preference, setPreference } = useTheme();
  const [legendOpen, setLegendOpen] = useState(false);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            SC
          </span>
          <div>
            <div className="brand-name">Strategy Compiler</div>
            <div className="brand-sub">Decision support · demo</div>
          </div>
        </div>

        {navigable ? (
        <nav aria-label="Pages" className="nav">
          <ul>
            {PAGES.map((p, i) => (
              <li key={p.id}>
                <a
                  href={`#/${p.id}`}
                  className="nav-link"
                  aria-current={p.id === page ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate(p.id);
                  }}
                >
                  <span className="nav-index" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="nav-text">
                    <span className="nav-label">{p.label}</span>
                    <span className="nav-hint">{p.hint}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        ) : null}

        <div className="sidebar-foot">
          <div className="foot-label">Theme</div>
          <Segmented size="sm" label="Theme" options={THEME_OPTIONS} value={preference} onChange={setPreference} />
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setLegendOpen(true)}>
            What do the labels mean?
          </button>
          <p className="brand-credit small muted">by clanker wankers</p>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <span className="fictional">KBC (mock example, not real KBC data)</span>
            <span className="topbar-sep" aria-hidden="true">
              /
            </span>
            <span>AI-assisted KYC/AML reviews</span>
          </div>
          <div className="topbar-controls">
            {navigable ? (
              <>
                <Segmented label="Assumption case" options={CASE_OPTIONS} value={caseId} onChange={onCaseChange} size="sm" />
                <span className={`sync${busy ? " sync-busy" : ""}`} role="status" aria-live="polite">
                  {busy ? "Recalculating…" : edited ? "Showing edited inputs" : "Default inputs"}
                </span>
              </>
            ) : null}
          </div>
        </header>

        <div className="demo-strip" role="note">
          <span className="demo-strip-text">
            <strong>Demo data.</strong> The company, goal, roadmap and assumptions are mock. Workforce records are synthetic.
            Vacancy evidence is external (2021). Costs are estimates.
          </span>
          <span className="demo-strip-badges">
            {BADGE_ORDER.map((k) => (
              <Badge key={k} kind={k} />
            ))}
          </span>
        </div>

        <main id="main" tabIndex={-1} className={`page${busy ? " is-busy" : ""}`} aria-busy={busy}>
          {children}
        </main>
      </div>

      <Dialog open={legendOpen} onClose={() => setLegendOpen(false)} title="What do the labels mean?">
        <dl className="legend-list">
          {BADGE_ORDER.map((k) => (
            <div key={k} className="legend-row">
              <dt>
                <Badge kind={k} />
              </dt>
              <dd>{BADGE_MEANING[k]}</dd>
            </div>
          ))}
        </dl>
        <p className="muted small">
          Nothing in this demo describes a real company, a real CEO decision or a real person. The vacancy evidence is shown as an
          aggregate and is never attributed to an employer.
        </p>
      </Dialog>
    </div>
  );
}
