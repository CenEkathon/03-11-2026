import { useEffect, useMemo, useState } from "react";
import { BadgeRow, Card, DataTable, type Column } from "../components/ui";
import type { Shared, Controls } from "../appTypes";
import { formatMonthRange, formatPct, formatCount } from "../lib/format";
import { checkDraft, isDirty, type MilestoneDraft } from "../lib/roadmap";
import type { Milestone } from "../api/types";

function toDrafts(milestones: Milestone[]): MilestoneDraft[] {
  return milestones.map((m) => ({ id: m.id, start: m.start, end: m.end, depends_on: m.depends_on ?? [] }));
}

export function GoalRoadmap({ shared, controls }: { shared: Shared; controls: Controls }) {
  const { plan, caseInfo } = shared;
  const teamName = useMemo(
    () => Object.fromEntries(caseInfo.company.teams.map((t) => [t.id, t.name])),
    [caseInfo],
  );
  const [drafts, setDrafts] = useState<MilestoneDraft[]>(() => toDrafts(plan.milestones));
  const [localErrors, setLocalErrors] = useState<string[]>([]);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // When the applied plan changes (accepted edit or case change), reset the draft to it.
  useEffect(() => {
    setDrafts(toDrafts(plan.milestones));
    setLocalErrors([]);
  }, [plan.milestones]);

  const goal = plan.goal;
  const applied = useMemo(
    () => Object.fromEntries(plan.milestones.map((m) => [m.id, { start: m.start, end: m.end }])),
    [plan.milestones],
  );
  const dirty = isDirty(drafts, applied);

  const updateDraft = (id: string, field: "start" | "end", value: string) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
  };

  const apply = async () => {
    const errors = checkDraft(drafts);
    setLocalErrors(errors);
    setServerErrors([]);
    if (errors.length > 0) return;
    setBusy(true);
    const dates = Object.fromEntries(drafts.map((d) => [d.id, { start: d.start, end: d.end }]));
    const result = await controls.applyRoadmap(dates);
    setBusy(false);
    if (result) setServerErrors(result);
  };

  const columns: Column<MilestoneDraft>[] = [
    { key: "id", header: "ID", render: (d) => d.id },
    {
      key: "name",
      header: "Milestone",
      render: (d) => {
        const m = plan.milestones.find((x) => x.id === d.id);
        return (
          <>
            <div>{m?.name}</div>
            <div className="muted small">{m?.description}</div>
          </>
        );
      },
    },
    {
      key: "owner",
      header: "Owner team",
      render: (d) => teamName[plan.milestones.find((x) => x.id === d.id)?.owner_team ?? ""] ?? "n/a",
    },
    {
      key: "deps",
      header: "Depends on",
      render: (d) => (d.depends_on.length ? d.depends_on.join(", ") : "none"),
    },
    {
      key: "start",
      header: "Start",
      render: (d) => (
        <input
          type="month"
          aria-label={`${d.id} start month`}
          value={d.start}
          onChange={(e) => updateDraft(d.id, "start", e.target.value)}
        />
      ),
    },
    {
      key: "end",
      header: "End",
      render: (d) => (
        <input
          type="month"
          aria-label={`${d.id} end month`}
          value={d.end}
          onChange={(e) => updateDraft(d.id, "end", e.target.value)}
        />
      ),
    },
    {
      key: "metric",
      header: "Success metric",
      render: (d) => {
        const m = plan.milestones.find((x) => x.id === d.id);
        return m ? `${m.metric.name} (target ${m.metric.target} ${m.metric.unit})` : "n/a";
      },
    },
    {
      key: "adoption",
      header: "AI-assisted share at end",
      numeric: true,
      render: (d) => formatPct(plan.milestones.find((x) => x.id === d.id)?.adoption_share_target),
    },
  ];

  return (
    <div className="screen">
      <Card title="Goal (MOCK)" actions={<BadgeRow labelKey="goal" labels={plan.labels} />}>
        <p className="lead">{goal.statement}</p>
        <div className="grid-4">
          <div className="kv">
            <span>Baseline reviews per year</span>
            <strong>{formatCount(goal.baseline.reviews_per_year)}</strong>
          </div>
          <div className="kv">
            <span>Baseline cost per review</span>
            <strong>EUR {goal.baseline.cost_per_review_eur}</strong>
          </div>
          <div className="kv">
            <span>AI-assisted share now</span>
            <strong>{formatPct(goal.baseline.ai_assisted_share, 0)}</strong>
          </div>
          <div className="kv">
            <span>Target</span>
            <strong>
              {formatPct(goal.target.ai_assisted_share, 0)} AI-assisted, cost per review -
              {formatPct(goal.target.cost_per_review_reduction_pct, 0)}
            </strong>
          </div>
        </div>
        <p className="small">
          Deadline <strong>{goal.deadline}</strong>. Horizon {formatMonthRange(goal.horizon_start, goal.horizon_end)}.
        </p>
        <ul className="small">
          {goal.constraints.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Card>

      <Card
        title="Roadmap (MOCK proposal, requires approval)"
        actions={<BadgeRow labelKey="roadmap" labels={plan.labels} />}
      >
        <p className="small muted">
          Edit start and end months, then apply. Dependencies are finish-to-start: a milestone must start after its
          predecessor ends. Invalid roadmaps are blocked and the current plan stays on screen.
        </p>
        <DataTable
          columns={columns}
          rows={drafts}
          rowKey={(d) => d.id}
          caption="Milestones (mock roadmap)"
        />
        {localErrors.length > 0 ? (
          <div className="alert" role="alert">
            <strong>Fix before applying:</strong>
            <ul>
              {localErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {serverErrors.length > 0 ? (
          <div className="alert" role="alert">
            <strong>The server rejected this roadmap. The plan on screen is unchanged:</strong>
            <ul>
              {serverErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="actions-row">
          <button type="button" className="btn primary" onClick={apply} disabled={busy || !dirty}>
            {busy ? "Recomputing..." : "Apply roadmap"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDrafts(toDrafts(plan.milestones));
              setLocalErrors([]);
              setServerErrors([]);
            }}
            disabled={!dirty}
          >
            Reset to applied roadmap
          </button>
          {!dirty ? <span className="muted small">No unapplied edits.</span> : null}
        </div>
      </Card>
    </div>
  );
}
