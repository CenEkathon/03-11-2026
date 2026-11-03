import { useState } from "react";
import { api } from "../api/client";
import type { BriefResponse, ScenarioId } from "../api/types";
import { SCENARIO_IDS } from "../api/types";
import type { Controls, Shared } from "../appTypes";
import { DISCLAIMER, SCENARIO_SHORT_LABEL, RECOMMENDED } from "../lib/labels";
import { formatEur } from "../lib/format";
import { Callout, Card, Segmented } from "./ui";
import { t, type Lang } from "../i18n/i18n";
import { useLang } from "../i18n/LanguageProvider";

/** A drafted brief remembers the language it was drafted in. A different language shows the draft button again. */
interface DraftedBrief {
  lang: Lang;
  data: BriefResponse;
}

/** Drafted CEO brief. The numbers in it come from the engine, so it always matches the screens. */
export function BriefPanel({ shared, controls }: { shared: Shared; controls: Controls }) {
  const { lang } = useLang();
  const [scenario, setScenario] = useState<ScenarioId>(RECOMMENDED);
  const [drafted, setDrafted] = useState<DraftedBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const brief = drafted && drafted.lang === lang ? drafted.data : null;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api.brief({
        scenario,
        case: controls.caseId,
        milestone_dates: Object.keys(controls.dates).length ? controls.dates : null,
        assumption_overrides: Object.keys(controls.overrides).length ? controls.overrides : null,
        lang,
      });
      setDrafted({ lang, data });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("The brief could not be drafted."));
    } finally {
      setBusy(false);
    }
  };

  const totals = shared.plan.scenarios[scenario]?.totals;

  return (
    <Card
      title={t("CEO brief")}
      description={t("A short written summary of one option. The figures come from the model; the wording is drafted.")}
    >
      <div className="brief-controls">
        <Segmented
          label={t("Option for the brief")}
          size="sm"
          options={SCENARIO_IDS.map((id) => ({ value: id, label: t(SCENARIO_SHORT_LABEL[id]) }))}
          value={scenario}
          onChange={setScenario}
        />
        <button type="button" className="btn btn-primary" onClick={generate} disabled={busy}>
          {busy ? t("Drafting…") : brief ? t("Draft again") : t("Draft brief")}
        </button>
        {totals ? (
          <span className="muted small">
            {t("Cost to deadline {cost} · net {net}", { cost: formatEur(totals.cost_total_eur), net: formatEur(totals.net_eur) })}
          </span>
        ) : null}
      </div>

      {controls.isEdited ? <p className="muted small">{t("The brief uses your current timing and assumption edits.")}</p> : null}

      {error ? (
        <Callout tone="critical" title={t("Brief unavailable")}>
          {error}
        </Callout>
      ) : null}

      {brief ? (
        <article className="brief" aria-label={t("Drafted brief")}>
          <div className="brief-meta">
            <span>
              {t("Drafted by")}{" "}
              <strong>{brief.drafted_by === "claude" ? t("Claude (live)") : t("template (offline)")}</strong>
            </span>
            <span>
              {t("Cached")} <strong>{brief.cached ? t("yes") : t("no")}</strong>
            </span>
            {brief.model ? (
              <span>
                {t("Model")} <strong>{brief.model}</strong>
              </span>
            ) : null}
            {brief.usage ? (
              <span>
                {t("Tokens {input} in / {output} out", { input: brief.usage.input_tokens, output: brief.usage.output_tokens })}
              </span>
            ) : null}
          </div>
          <p className="brief-text">{brief.text}</p>
          <p className="muted small">{t(DISCLAIMER)}</p>
        </article>
      ) : (
        <p className="muted small">{t("Choose an option and draft the brief to see the text.")}</p>
      )}
    </Card>
  );
}
