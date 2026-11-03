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
import { Intake, type IntakeInput } from "./screens/Intake";
import { analysisStepAt, MOCK_ANALYSIS_DELAY_MS } from "./lib/analysisSteps";
import { t } from "./i18n/i18n";
import { useLang } from "./i18n/LanguageProvider";


/** The app starts on intake. The plan only loads after the mock analysis has been started. */
type Stage = "intake" | "analyzing" | "ready";

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
  return e instanceof Error ? e.message : t("Unknown error");
}

export default function App() {
  // Subscribes to the language so that every screen rebuilds its text when the language changes.
  useLang();
  const [page, goToPage] = useHashPage();
  const [caseId, setCaseId] = useState<CaseId>("base");
  const [dates, setDates] = useState<Record<string, MilestoneDates>>({});
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [shared, setShared] = useState<Shared | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("intake");
  const [intake, setIntake] = useState<IntakeInput | null>(null);

  // Mock analysis: after the delay the app becomes navigable. Cleared on unmount (StrictMode safe).
  useEffect(() => {
    if (stage !== "analyzing") return;
    const timer = window.setTimeout(() => setStage("ready"), MOCK_ANALYSIS_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [stage]);

  // Bootstrap: reference data and the default plan. Starts once the user has sent the intake. Cancelled on unmount.
  useEffect(() => {
    if (stage === "intake") return;
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
  }, [stage]);

  const onIntakeSubmit = (input: IntakeInput) => {
    setIntake(input);
    setStage("analyzing");
    goToPage("overview");
  };

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
    navigable: stage === "ready",
  };

  let content: ReactNode;
  if (stage === "intake") {
    content = <Intake onSubmit={onIntakeSubmit} />;
  } else if (stage === "analyzing") {
    content = <AnalyzingScreen input={intake} />;
  } else if (loadError) {
    content = (
      <>
        <PageHeader title={t("The plan could not load")} />
        <Callout tone="critical" title={t("Could not reach the API at {url}", { url: API_BASE })}>
          <p>{loadError}</p>
          <p>
            {t("Start the backend from")} <code>backend/</code> {t("with")}{" "}
            <code>uv run uvicorn strategy_compiler.api:app --port 8000</code>, {t("then try again.")}
          </p>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            {t("Try again")}
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
            <Callout tone="critical" title={t("The last recalculation failed. The results on screen are from before it.")}>
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

/**
 * Loading screen for the mock analysis. It shows what was sent, plus rotating status messages so the user can see
 * something is happening. The messages are cosmetic; the wait is a fixed timer.
 */
function AnalyzingScreen({ input }: { input: IntakeInput | null }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - started), 100);
    return () => window.clearInterval(id);
  }, []);
  const step = analysisStepAt(elapsed, MOCK_ANALYSIS_DELAY_MS);

  return (
    <>
      <PageHeader
        title={t("Analysing your brief")}
        lead={t("Mock analysis in progress. This is a simulated model call and takes about seven seconds.")}
      />
      <div className="skeleton-page">
        <Card title={t("Working")}>
          <p className="analysis-splash" role="status" aria-live="polite">
            <span key={step} className="analysis-splash-text">
              {t(step)}…
            </span>
          </p>
          <div className="skeleton-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </Card>
        <Card title={t("Received")}>
          {input ? (
            <ul className="analysis-received">
              <li>{t("Brief: {count} characters", { count: input.text.length })}</li>
              <li>
                {t("Workers:")} <strong>{input.fileName}</strong>, {t("{count} rows", { count: input.workers.rowCount })}
              </li>
            </ul>
          ) : null}
          <div className="skeleton-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </Card>
      </div>
    </>
  );
}

function LoadingSkeleton() {
  return (
    <div className="skeleton-page" role="status" aria-live="polite">
      <span className="sr-only">{t("Loading the mock plan from the API…")}</span>
      <Card title={t("Loading")}>
        <div className="skeleton-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </Card>
    </div>
  );
}
