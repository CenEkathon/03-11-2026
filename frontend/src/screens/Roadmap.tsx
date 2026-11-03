import { useEffect, useMemo, useState } from "react";
import { Timeline, type TimelineRow } from "../charts/Timeline";
import { Callout, Card, LabelBadge, PageHeader } from "../components/ui";
import type { Controls, Shared } from "../appTypes";
import type { Milestone } from "../api/types";
import { formatMetricTarget, formatMonth } from "../lib/format";
import { checkDraft, isDirty, localizeTimingError, rowErrors, type MilestoneDraft } from "../lib/roadmap";
import { monthFromIndex, monthIndex } from "../lib/months";
import { t } from "../i18n/i18n";
import { useLang } from "../i18n/LanguageProvider";

function toDrafts(milestones: Milestone[]): MilestoneDraft[] {
  return milestones.map((m) => ({ id: m.id, start: m.start, end: m.end, depends_on: m.depends_on ?? [] }));
}

/** Months to draw: the horizon, widened if a draft moves outside it. */
function timelineMonths(horizonStart: string, horizonEnd: string, drafts: MilestoneDraft[]): string[] {
  const indices = [monthIndex(horizonStart), monthIndex(horizonEnd)];
  for (const d of drafts) {
    indices.push(monthIndex(d.start), monthIndex(d.end));
  }
  const valid = indices.filter((i): i is number => i !== null);
  if (valid.length === 0) return [];
  const lo = Math.min(...valid);
  const hi = Math.max(...valid);
  const out: string[] = [];
  for (let i = lo; i <= hi; i++) out.push(monthFromIndex(i));
  return out;
}

export function Roadmap({ shared, controls }: { shared: Shared; controls: Controls }) {
  useLang();
  const { plan, caseInfo } = shared;
  const teamName = useMemo(() => Object.fromEntries(caseInfo.company.teams.map((t) => [t.id, t.name])), [caseInfo]);
  const [drafts, setDrafts] = useState<MilestoneDraft[]>(() => toDrafts(plan.milestones));
  const [localErrors, setLocalErrors] = useState<string[]>([]);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // When the applied plan changes (accepted edit or case change), reset the draft to it.
  useEffect(() => {
    setDrafts(toDrafts(plan.milestones));
    setLocalErrors([]);
    setServerErrors([]);
  }, [plan.milestones]);

  const applied = useMemo(
    () => Object.fromEntries(plan.milestones.map((m) => [m.id, { start: m.start, end: m.end }])),
    [plan.milestones],
  );
  const dirty = isDirty(drafts, applied);
  const perRow = rowErrors(drafts);
  const milestoneById = useMemo(() => new Map(plan.milestones.map((m) => [m.id, m])), [plan.milestones]);

  const months = timelineMonths(plan.goal.horizon_start, plan.goal.horizon_end, drafts);
  const timelineRows: TimelineRow[] = drafts.map((d) => {
    const m = milestoneById.get(d.id);
    return {
      id: d.id,
      name: m?.name ?? d.id,
      owner: teamName[m?.owner_team ?? ""] ?? "Owner not set",  // English key, translated by Timeline
      start: d.start,
      end: d.end,
      dependsOn: d.depends_on,
      share: m?.adoption_share_target ?? 0,
    };
  });

  const updateDraft = (id: string, field: "start" | "end", value: string) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
    setServerErrors([]);
  };

  const apply = async () => {
    const errors = checkDraft(drafts);
    setLocalErrors(errors);
    setServerErrors([]);
    if (errors.length > 0) return;
    setSaving(true);
    const dates = Object.fromEntries(drafts.map((d) => [d.id, { start: d.start, end: d.end }]));
    const result = await controls.applyRoadmap(dates);
    setSaving(false);
    if (result) setServerErrors(result);
  };

  const discard = () => {
    setDrafts(toDrafts(plan.milestones));
    setLocalErrors([]);
    setServerErrors([]);
  };

  const showErrors = [...localErrors, ...serverErrors];
  const tone = serverErrors.length ? "critical" : "warning";

  return (
    <>
      <PageHeader
        title={t("Roadmap")}
        lead={t(
          "{count} milestones, each starting after the one before it ends. Change a start or end month and the timeline updates. Apply to recalculate costs and workforce needs.",
          { count: plan.milestones.length },
        )}
        actions={<LabelBadge labelKey="roadmap" />}
      />

      <Card
        title={t("Timeline")}
        description={t("{from} to {to}. The vertical line is the deadline.", {
          from: formatMonth(plan.goal.horizon_start),
          to: formatMonth(plan.goal.horizon_end),
        })}
        actions={
          dirty ? (
            <span className="pill pill-draft">{t("Preview: not applied")}</span>
          ) : (
            <span className="pill">{t("Applied")}</span>
          )
        }
      >
        <Timeline rows={timelineRows} months={months} deadline={plan.goal.deadline} />
      </Card>

      <Card
        title={t("Timing")}
        description={t("Finish-to-start: a milestone starts the month after its predecessor ends. Invalid timing is blocked.")}
      >
        <div className="table-wrap">
          <table className="table timing-table">
            <caption className="sr-only">{t("Milestone start and end months")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("Milestone")}</th>
                <th scope="col">{t("Owner")}</th>
                <th scope="col">{t("After")}</th>
                <th scope="col">{t("Start")}</th>
                <th scope="col">{t("End")}</th>
                <th scope="col">{t("Success metric")}</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => {
                const m = milestoneById.get(d.id);
                const errs = perRow[d.id] ?? [];
                return (
                  <tr key={d.id} className={errs.length ? "row-invalid" : undefined}>
                    <td>
                      <div className="cell-title">
                        <span className="tl-id">{d.id}</span> {m ? t(m.name) : null}
                      </div>
                      <div className="muted small">{m ? t(m.description) : null}</div>
                    </td>
                    <td>{teamName[m?.owner_team ?? ""] ? t(teamName[m?.owner_team ?? ""]) : t("n/a")}</td>
                    <td>{d.depends_on.length ? d.depends_on.join(", ") : t("Start")}</td>
                    <td>
                      <input
                        type="month"
                        aria-label={t("{id} start month", { id: d.id })}
                        aria-invalid={errs.length > 0}
                        value={d.start}
                        onChange={(e) => updateDraft(d.id, "start", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="month"
                        aria-label={t("{id} end month", { id: d.id })}
                        aria-invalid={errs.length > 0}
                        value={d.end}
                        onChange={(e) => updateDraft(d.id, "end", e.target.value)}
                      />
                    </td>
                    <td>
                      {m ? (
                        <>
                          {t(m.metric.name)}
                          <div className="muted small">
                            {t("Target {value}", { value: formatMetricTarget(m.metric.target, m.metric.unit) })}
                          </div>
                        </>
                      ) : (
                        t("n/a")
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {showErrors.length > 0 ? (
          <div className="stack-sm">
            <Callout
              tone={tone}
              title={
                serverErrors.length
                  ? t("The server rejected this timing. The plan on screen is unchanged.")
                  : t("Fix before applying")
              }
            >
              <ul className="error-list">
                {showErrors.map((e) => (
                  <li key={e}>{localizeTimingError(e)}</li>
                ))}
              </ul>
            </Callout>
          </div>
        ) : null}

        <div className="action-bar">
          <button type="button" className="btn btn-primary" onClick={apply} disabled={saving || !dirty}>
            {saving ? t("Recalculating…") : t("Apply timing")}
          </button>
          <button type="button" className="btn" onClick={discard} disabled={!dirty}>
            {t("Discard changes")}
          </button>
          <span className="muted small">
            {dirty
              ? t("Unapplied changes. The Overview and other pages still show the applied timing.")
              : t("No unapplied changes.")}
          </span>
        </div>
      </Card>
    </>
  );
}
