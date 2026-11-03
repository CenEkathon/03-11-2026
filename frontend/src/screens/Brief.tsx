import { useState } from "react";
import { api } from "../api/client";
import { Badge, BadgeRow, Card } from "../components/ui";
import type { Shared, Controls } from "../appTypes";
import type { BriefResponse, ScenarioId } from "../api/types";
import { SCENARIO_IDS } from "../api/types";
import { DISCLAIMER, SCENARIO_SHORT_LABEL } from "../lib/labels";
import { formatEur, formatPct } from "../lib/format";

export function Brief({ shared, controls }: { shared: Shared; controls: Controls }) {
  const { plan } = shared;
  const [scenario, setScenario] = useState<ScenarioId>("hybrid");
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const totals = plan.scenarios[scenario]?.totals;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      // The brief uses the same roadmap and assumption edits as the other screens, so it matches the numbers shown.
      setBrief(
        await api.brief({
          scenario,
          case: controls.caseId,
          milestone_dates: Object.keys(controls.dates).length ? controls.dates : null,
          assumption_overrides: Object.keys(controls.overrides).length ? controls.overrides : null,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Brief request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <Card title="CEO brief (MOCK)" actions={<BadgeRow labelKey="goal" labels={plan.labels} />}>
        <p className="notice">{DISCLAIMER}</p>
        {controls.isEdited ? (
          <p className="notice" role="status">
            This brief uses your current roadmap and assumption edits.
          </p>
        ) : null}

        <div className="actions-row">
          <label>
            Scenario{" "}
            <select value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioId)}>
              {SCENARIO_IDS.map((id) => (
                <option key={id} value={id}>
                  {SCENARIO_SHORT_LABEL[id]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn primary" onClick={generate} disabled={busy}>
            {busy ? "Drafting..." : "Generate brief"}
          </button>
        </div>

        {totals ? (
          <ul className="small">
            <li>
              Cost through deadline {formatEur(totals.cost_total_eur)}, benefit {formatEur(totals.benefit_eur)}, net{" "}
              {formatEur(totals.net_eur)}, ROI {formatPct(totals.roi)}.
            </li>
          </ul>
        ) : null}

        {error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : null}

        {brief ? (
          <article className="brief">
            <div className="brief-meta small">
              <span>
                Drafted by: <strong>{brief.drafted_by === "claude" ? "Claude (live)" : "Template (offline)"}</strong>
              </span>
              <span>Cached: <strong>{brief.cached ? "yes" : "no"}</strong></span>
              {brief.model ? <span>Model: <strong>{brief.model}</strong></span> : null}
              {brief.usage ? (
                <span>
                  Tokens in/out: <strong>{brief.usage.input_tokens}/{brief.usage.output_tokens}</strong>
                  {brief.usage.eur_estimate > 0 ? `, est. ${formatEur(brief.usage.eur_estimate)}` : ", price not configured"}
                </span>
              ) : null}
              <Badge labelKey="estimates" caption={plan.labels.estimates} />
            </div>
            <p className="brief-text">{brief.text}</p>
          </article>
        ) : (
          <p className="muted small">Generate a brief to see the drafted text.</p>
        )}
      </Card>
    </div>
  );
}
