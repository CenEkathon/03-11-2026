import { useEffect, useMemo, useState } from "react";
import { Timeline, type TimelineRow } from "../charts/Timeline";
import { Callout, Card, LabelBadge, PageHeader } from "../components/ui";
import type { Controls, Shared } from "../appTypes";
import type { Milestone } from "../api/types";
import { formatMetricTarget, formatMonth } from "../lib/format";
import { checkDraft, isDirty, rowErrors, type MilestoneDraft } from "../lib/roadmap";
import { monthFromIndex, monthIndex } from "../lib/months";

type Dates = { start: string; end: string };

/** One editor row: its draft dates, plus the milestone it belongs to, so every row always has its details. */
type Row = MilestoneDraft & { milestone: Milestone };

/** Each milestone with its draft dates: the user's edit if there is one, otherwise the applied dates. */
function rowsOf(milestones: Milestone[], edits: Record<string, Dates>): Row[] {
  return milestones.map((m) => {
    const dates = edits[m.id] ?? { start: m.start, end: m.end };
    return { id: m.id, start: dates.start, end: dates.end, depends_on: m.depends_on ?? [], milestone: m };
  });
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
  const { plan, caseInfo } = shared;
  const teamName = useMemo(() => Object.fromEntries(caseInfo.company.teams.map((t) => [t.id, t.name])), [caseInfo]);
  const [edits, setEdits] = useState<Record<string, Dates>>({});
  const [localErrors, setLocalErrors] = useState<string[]>([]);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // When the applied plan changes (accepted edit or case change), drop the edits and the messages.
  useEffect(() => {
    setEdits({});
    setLocalErrors([]);
    setServerErrors([]);
  }, [plan.milestones]);

  const rows = useMemo(() => rowsOf(plan.milestones, edits), [plan.milestones, edits]);
  const applied = useMemo(
    () => Object.fromEntries(plan.milestones.map((m) => [m.id, { start: m.start, end: m.end }])),
    [plan.milestones],
  );
  const dirty = isDirty(rows, applied);
  const perRow = rowErrors(rows);

  const months = timelineMonths(plan.goal.horizon_start, plan.goal.horizon_end, rows);
  const timelineRows: TimelineRow[] = rows.map((d) => ({
    id: d.id,
    name: d.milestone.name,
    owner: teamName[d.milestone.owner_team] ?? "Owner not set",
    start: d.start,
    end: d.end,
    dependsOn: d.depends_on,
    share: d.milestone.adoption_share_target,
  }));

  const updateDraft = (id: string, field: "start" | "end", value: string) => {
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? applied[id]), [field]: value } }));
    setServerErrors([]);
  };

  const apply = async () => {
    const errors = checkDraft(rows);
    setLocalErrors(errors);
    setServerErrors([]);
    if (errors.length > 0) return;
    setSaving(true);
    const dates = Object.fromEntries(rows.map((d) => [d.id, { start: d.start, end: d.end }]));
    const result = await controls.applyRoadmap(dates);
    setSaving(false);
    if (result) setServerErrors(result);
  };

  const discard = () => {
    setEdits({});
    setLocalErrors([]);
    setServerErrors([]);
  };

  const showErrors = [...localErrors, ...serverErrors];
  const tone = serverErrors.length ? "critical" : "warning";

  return (
    <>
      <PageHeader
        title="Roadmap"
        lead="Six milestones, each starting after the one before it ends. Change a start or end month and the timeline updates. Apply to recalculate costs and workforce needs."
        actions={<LabelBadge labelKey="roadmap" />}
      />

      <Card
        title="Timeline"
        description={`${formatMonth(plan.goal.horizon_start)} to ${formatMonth(plan.goal.horizon_end)}. The vertical line is the deadline.`}
        actions={
          dirty ? (
            <span className="pill pill-draft">Preview: not applied</span>
          ) : (
            <span className="pill">Applied</span>
          )
        }
      >
        <Timeline rows={timelineRows} months={months} deadline={plan.goal.deadline} />
      </Card>

      <Card
        title="Timing"
        description="Finish-to-start: a milestone starts the month after its predecessor ends. Invalid timing is blocked."
      >
        <div className="table-wrap">
          <table className="table timing-table">
            <caption className="sr-only">Milestone start and end months</caption>
            <thead>
              <tr>
                <th scope="col">Milestone</th>
                <th scope="col">Owner</th>
                <th scope="col">After</th>
                <th scope="col">Start</th>
                <th scope="col">End</th>
                <th scope="col">Success metric</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const m = d.milestone;
                const errs = perRow[d.id] ?? [];
                return (
                  <tr key={d.id} className={errs.length ? "row-invalid" : undefined}>
                    <td>
                      <div className="cell-title">
                        <span className="tl-id">{d.id}</span> {m.name}
                      </div>
                      <div className="muted small">{m.description}</div>
                    </td>
                    <td>{teamName[m.owner_team] ?? "n/a"}</td>
                    <td>{d.depends_on.length ? d.depends_on.join(", ") : "Start"}</td>
                    <td>
                      <input
                        type="month"
                        aria-label={`${d.id} start month`}
                        aria-invalid={errs.length > 0}
                        value={d.start}
                        onChange={(e) => updateDraft(d.id, "start", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="month"
                        aria-label={`${d.id} end month`}
                        aria-invalid={errs.length > 0}
                        value={d.end}
                        onChange={(e) => updateDraft(d.id, "end", e.target.value)}
                      />
                    </td>
                    <td>
                      {m.metric.name}
                      <div className="muted small">Target {formatMetricTarget(m.metric.target, m.metric.unit)}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {showErrors.length > 0 ? (
          <div className="stack-sm">
            <Callout tone={tone} title={serverErrors.length ? "The server rejected this timing. The plan on screen is unchanged." : "Fix before applying"}>
              <ul className="error-list">
                {showErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Callout>
          </div>
        ) : null}

        <div className="action-bar">
          <button type="button" className="btn btn-primary" onClick={apply} disabled={saving || !dirty}>
            {saving ? "Recalculating…" : "Apply timing"}
          </button>
          <button type="button" className="btn" onClick={discard} disabled={!dirty}>
            Discard changes
          </button>
          <span className="muted small">
            {dirty ? "Unapplied changes. The Overview and other pages still show the applied timing." : "No unapplied changes."}
          </span>
        </div>
      </Card>
    </>
  );
}
