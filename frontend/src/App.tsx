import { useEffect, useState } from "react";
import { api, API_BASE, ApiError } from "./api/client";
import type { CaseId, MilestoneDates, PlanRequest } from "./api/types";
import type { Controls, Shared } from "./appTypes";
import { Badge, NavBar, type ScreenId } from "./components/ui";
import { Actions } from "./screens/Actions";
import { Brief } from "./screens/Brief";
import { Demand } from "./screens/Demand";
import { Finance } from "./screens/Finance";
import { GoalRoadmap } from "./screens/GoalRoadmap";
import { Supply } from "./screens/Supply";

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
  const [screen, setScreen] = useState<ScreenId>("goal");
  const [caseId, setCaseId] = useState<CaseId>("base");
  const [dates, setDates] = useState<Record<string, MilestoneDates>>({});
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [shared, setShared] = useState<Shared | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Bootstrap: reference data first, then the default plan. Cancelled on unmount (StrictMode safe).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [caseInfo, skills, assumptionsRes] = await Promise.all([
          api.caseInfo(),
          api.skills(),
          api.assumptions(),
        ]);
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
   * Recompute with the given inputs. On success the new plan replaces the old one. On a 422 the
   * current plan stays and the validation messages are returned to the caller.
   */
  const applyRequest = async (
    c: CaseId,
    d: Record<string, MilestoneDates>,
    o: Record<string, number>,
  ): Promise<string[] | null> => {
    const req = buildRequest(c, d, o);
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
    }
  };

  if (loadError) {
    return (
      <div className="page">
        <div className="alert" role="alert">
          <strong>Could not reach the API at {API_BASE}.</strong> {loadError}
          <p className="small">
            Start the backend from <code>backend/</code>: <code>uv run uvicorn strategy_compiler.api:app --port 8000</code>
          </p>
        </div>
      </div>
    );
  }

  if (!shared) {
    return (
      <div className="page">
        <p className="muted">Loading the mock plan from the API...</p>
      </div>
    );
  }

  const controls: Controls = {
    caseId,
    setCase: (c) => {
      void applyRequest(c, dates, overrides);
    },
    dates,
    overrides,
    isEdited: Object.keys(dates).length > 0 || Object.keys(overrides).length > 0,
    applyRoadmap: (newDates) => applyRequest(caseId, newDates, overrides),
    applyAssumptions: (newOverrides) => applyRequest(caseId, dates, newOverrides),
  };

  const labels = shared.plan.labels;

  return (
    <div className="page">
      <header className="app-head">
        <div>
          <h1>Strategy Compiler</h1>
          <p className="small muted">
            Decision-support demo. Northwind Bank is fictional. The goal, roadmap, workforce and figures are all mock or
            synthetic, and costs are estimates.
          </p>
        </div>
        <div className="head-controls">
          <label>
            Case{" "}
            <select value={caseId} onChange={(e) => controls.setCase(e.target.value as CaseId)} aria-label="Assumption case">
              <option value="low">Low (conservative)</option>
              <option value="base">Base</option>
              <option value="high">High (optimistic)</option>
            </select>
          </label>
          <div className="badge-stack">
            <Badge labelKey="goal" caption={labels.goal} />
            <Badge labelKey="roadmap" caption={labels.roadmap} />
            <Badge labelKey="workforce" caption={labels.workforce} />
            <Badge labelKey="assumptions" caption={labels.assumptions} />
            <Badge labelKey="vacancy_evidence" caption={labels.vacancy_evidence} />
            <Badge labelKey="estimates" caption={labels.estimates} />
          </div>
        </div>
      </header>

      {controls.isEdited ? (
        <p className="notice" role="status">
          Showing edited inputs: roadmap or assumption overrides are active for this session.
        </p>
      ) : null}
      {globalError ? (
        <div className="alert" role="alert">
          {globalError}
        </div>
      ) : null}

      <NavBar active={screen} onSelect={setScreen} />

      <main>
        {screen === "goal" ? <GoalRoadmap shared={shared} controls={controls} /> : null}
        {screen === "demand" ? <Demand shared={shared} /> : null}
        {screen === "supply" ? <Supply shared={shared} /> : null}
        {screen === "actions" ? <Actions shared={shared} /> : null}
        {screen === "finance" ? <Finance shared={shared} controls={controls} /> : null}
        {screen === "brief" ? <Brief shared={shared} controls={controls} /> : null}
      </main>
    </div>
  );
}
