import type { ReactNode } from "react";
import { useTheme, type ThemePreference } from "../theme/ThemeProvider";
import { PAGES, type PageId } from "../routing";
import { Segmented } from "./ui";
import type { CaseId } from "../api/types";

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
  /** False until the analysis has finished. Navigation and the case selector stay hidden until then. */
  navigable: boolean;
  children: ReactNode;
}

/** Frame for every screen: navigation, global case selector, theme and the demo footer. */
export function AppShell({ page, onNavigate, caseId, onCaseChange, busy, edited, navigable, children }: ShellProps) {
  const { preference, setPreference } = useTheme();

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
            <span>KBC</span>
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

        <main id="main" tabIndex={-1} className={`page${busy ? " is-busy" : ""}`} aria-busy={busy}>
          {children}
        </main>
      </div>
    </div>
  );
}
