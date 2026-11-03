import { useEffect, useState, type ReactNode } from "react";
import { api, API_BASE, ApiError } from "./api/client";
import type { CaseId, MilestoneDates, PlanRequest } from "./api/types";
import type { Controls, Shared } from "./appTypes";
import { AppShell } from "./components/AppShell";
import { Callout, Card, PageHeader } from "./components/ui";
import { useHashPage } from "./routing";
import { Assumptions } from "./screens/Assumptions";
import { Finance } from "./screens/Finance";
import { Options } from "./screens/Options";
import { Overview } from "./screens/Overview";
import { Roadmap } from "./screens/Roadmap";
import { Workforce } from "./screens/Workforce";

function buildRequest(
  caseId: CaseId,
  dates: Record<string, MilestoneDates>,
  overrides: Record<string, number>,
): PlanRequest {
  return {
    case: caseId,
    milestone_dates: Object.keys(dates).length ? dates : null,
    assumption_overrides: Object.keys(overrides).length ? overrides : null,
  };
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown error";
}

export default function App() {
  const [page, goToPage] = useHashPage();
  const [caseId, setCaseId] = useState<CaseId>("base");
  const [dates, setDates] = useState<Record<string, MilestoneDates>>({});
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [shared, setShared] = useState<Shared | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Bootstrap: reference data and the default plan. Cancelled on unmount (StrictMode safe).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [caseInfo, skills, assumptionsRes] = await Promise.all([api.caseInfo(), api.skills(), api.assumptions()]);
        const req = buildRequest("base", {}, {});
        const [plan, sensitivity] = await Promise.all([api.computePlan(req), api.sensitivity(req)]);
        if (cancelled) return;
        setShared({
          plan,
          caseInfo,
          skillLabels: Object.fromEntries(skills.skills.map((s) => [s.id, s.label])),
          assumptions: assumptionsRes.assumptions,
          sensitivity,
        });
      } catch (e) {
        if (!cancelled) setLoadError(messageOf(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Recompute with the given inputs. On success the new plan replaces the old one. On a 422 the current
   * plan stays and the validation messages go back to the caller.
   */
  const applyRequest = async (
    c: CaseId,
    d: Record<string, MilestoneDates>,
    o: Record<string, number>,
  ): Promise<string[] | null> => {
    const req = buildRequest(c, d, o);
    setBusy(true);
    try {
      const [plan, sensitivity] = await Promise.all([api.computePlan(req), api.sensitivity(req)]);
      setCaseId(c);
      setDates(d);
      setOverrides(o);
      setGlobalError(null);
      setShared((prev) => (prev ? { ...prev, plan, sensitivity } : prev));
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) return e.validationErrors();
      const message = messageOf(e);
      setGlobalError(message);
      return [message];
    } finally {
      setBusy(false);
    }
  };

  const edited = Object.keys(dates).length > 0 || Object.keys(overrides).length > 0;

  const controls: Controls | null = shared
    ? {
        caseId,
        setCase: (c) => {
          void applyRequest(c, dates, overrides);
        },
        dates,
        overrides,
        isEdited: edited,
        busy,
        applyRoadmap: (newDates) => applyRequest(caseId, newDates, overrides),
        applyAssumptions: (newOverrides) => applyRequest(caseId, dates, newOverrides),
      }
    : null;

  const shellProps = {
    page,
    onNavigate: goToPage,
    caseId,
    onCaseChange: (c: CaseId) => {
      if (controls) controls.setCase(c);
    },
    busy,
    edited,
  };

  let content: ReactNode;
  if (loadError) {
    content = (
      <>
        <PageHeader title="The plan could not load" />
        <Callout tone="critical" title={`Could not reach the API at ${API_BASE}`}>
          <p>{loadError}</p>
          <p>
            Start the backend from <code>backend/</code> with <code>uv run uvicorn strategy_compiler.api:app --port 8000</code>, then
            try again.
          </p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Try again
          </button>
        </Callout>
      </>
    );
  } else if (!shared || !controls) {
    content = <LoadingSkeleton />;
  } else {
    content = (
      <>
        {globalError ? (
          <div className="stack-sm">
            <Callout tone="critical" title="The last recalculation failed. The results on screen are from before it.">
              {globalError}
            </Callout>
          </div>
        ) : null}
        {page === "overview" ? <Overview shared={shared} controls={controls} /> : null}
        {page === "roadmap" ? <Roadmap shared={shared} controls={controls} /> : null}
        {page === "workforce" ? <Workforce shared={shared} /> : null}
        {page === "options" ? <Options shared={shared} /> : null}
        {page === "finance" ? <Finance shared={shared} /> : null}
        {page === "assumptions" ? <Assumptions shared={shared} controls={controls} /> : null}
      </>
    );
  }

  return <AppShell {...shellProps}>{content}</AppShell>;
}

function LoadingSkeleton() {
  return (
    <div className="skeleton-page" role="status" aria-live="polite">
      <span className="sr-only">Loading the mock plan from the API…</span>
      <Card title="Loading">
        <div className="skeleton-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </Card>
    </div>
  );
}
