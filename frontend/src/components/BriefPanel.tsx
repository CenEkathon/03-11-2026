import { useState } from "react";
import { api } from "../api/client";
import type { BriefResponse, ScenarioId } from "../api/types";
import { SCENARIO_IDS } from "../api/types";
import type { Controls, Shared } from "../appTypes";
import { DISCLAIMER, SCENARIO_SHORT_LABEL, RECOMMENDED } from "../lib/labels";
import { formatEur } from "../lib/format";
import { Callout, Card, Segmented } from "./ui";

/** Drafted CEO brief. The numbers in it come from the engine, so it always matches the screens. */
export function BriefPanel({ shared, controls }: { shared: Shared; controls: Controls }) {
  const [scenario, setScenario] = useState<ScenarioId>(RECOMMENDED);
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      setBrief(
        await api.brief({
          scenario,
          case: controls.caseId,
          milestone_dates: Object.keys(controls.dates).length ? controls.dates : null,
          assumption_overrides: Object.keys(controls.overrides).length ? controls.overrides : null,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The brief could not be drafted.");
    } finally {
      setBusy(false);
    }
  };

  const totals = shared.plan.scenarios[scenario]?.totals;

  return (
    <Card
      title="CEO brief"
      description="A short written summary of one option. The figures come from the model; the wording is drafted."
    >
      <div className="brief-controls">
        <Segmented
          label="Option for the brief"
          size="sm"
          options={SCENARIO_IDS.map((id) => ({ value: id, label: SCENARIO_SHORT_LABEL[id] }))}
          value={scenario}
          onChange={setScenario}
        />
        <button type="button" className="btn btn-primary" onClick={generate} disabled={busy}>
          {busy ? "Drafting…" : brief ? "Draft again" : "Draft brief"}
        </button>
        {totals ? (
          <span className="muted small">
            Cost to deadline {formatEur(totals.cost_total_eur)} · net {formatEur(totals.net_eur)}
          </span>
        ) : null}
      </div>

      {controls.isEdited ? (
        <p className="muted small">The brief uses your current timing and assumption edits.</p>
      ) : null}

      {error ? <Callout tone="critical" title="Brief unavailable">{error}</Callout> : null}

      {brief ? (
        <article className="brief" aria-label="Drafted brief">
          <div className="brief-meta">
            <span>
              Drafted by <strong>{brief.drafted_by === "claude" ? "Claude (live)" : "template (offline)"}</strong>
            </span>
            <span>
              Cached <strong>{brief.cached ? "yes" : "no"}</strong>
            </span>
            {brief.model ? (
              <span>
                Model <strong>{brief.model}</strong>
              </span>
            ) : null}
            {brief.usage ? (
              <span>
                Tokens {brief.usage.input_tokens} in / {brief.usage.output_tokens} out
              </span>
            ) : null}
          </div>
          <p className="brief-text">{brief.text}</p>
          <p className="muted small">{DISCLAIMER}</p>
        </article>
      ) : (
        <p className="muted small">Choose an option and draft the brief to see the text.</p>
      )}
    </Card>
  );
}
