import { useState } from "react";
import { Badge, BadgeRow, Card, DataTable, Drawer, type Column } from "../components/ui";
import type { Shared } from "../appTypes";
import type { Requirement, SkillFit } from "../api/types";
import { formatFte, formatMonthRange, formatPct } from "../lib/format";

export function Demand({ shared }: { shared: Shared }) {
  const { plan, skillLabels } = shared;
  const [openId, setOpenId] = useState<string | null>(null);
  const fitById = new Map<string, SkillFit>(plan.skill_fit.map((f) => [f.requirement_id, f]));
  const open = openId ? plan.requirements.find((r) => r.id === openId) ?? null : null;
  const openFit = open ? fitById.get(open.id) ?? null : null;

  const columns: Column<Requirement>[] = [
    { key: "id", header: "ID", render: (r) => r.id },
    { key: "role", header: "Role (mock)", render: (r) => r.role },
    { key: "skill", header: "Skill", render: (r) => skillLabels[r.skill_id] ?? r.skill_id },
    { key: "min", header: "Min level", numeric: true, render: (r) => `${r.min_proficiency} / 5` },
    { key: "fte", header: "FTE", numeric: true, render: (r) => formatFte(r.fte) },
    { key: "window", header: "Window", render: (r) => formatMonthRange(r.start, r.end) },
    {
      key: "source",
      header: "Demand basis",
      render: (r) => `${r.source} (${r.confidence} confidence)`,
    },
    {
      key: "evidence",
      header: "Vacancy share 2021",
      numeric: true,
      render: (r) => {
        const share = fitById.get(r.id)?.vacancy_evidence_share;
        return (
          <span>
            {share === null || share === undefined ? "n/a" : formatPct(share)}{" "}
            <Badge labelKey="vacancy_evidence" caption={plan.labels.vacancy_evidence} />
          </span>
        );
      },
    },
    {
      key: "fit",
      header: "Fit",
      render: (r) => (
        <button type="button" className="btn small" onClick={() => setOpenId(r.id)}>
          Supply fit
        </button>
      ),
    },
  ];

  return (
    <div className="screen">
      <Card
        title="Capability demand per milestone"
        actions={
          <div className="badge-stack">
            <BadgeRow labelKey="roadmap" labels={plan.labels} />
            <BadgeRow labelKey="vacancy_evidence" labels={plan.labels} />
          </div>
        }
      >
        <p className="small muted">
          FTE, roles and minimum levels are mock assumptions. The vacancy share is an external observation: the share of
          deduplicated 2021 postings that mention the skill. It is shown beside the demand and never used in the arithmetic.
        </p>
        {plan.milestones.map((m) => {
          const rows = plan.requirements.filter((r) => r.milestone_id === m.id);
          return (
            <div key={m.id} className="milestone-block">
              <h3>
                {m.id}. {m.name} <span className="muted small">({formatMonthRange(m.start, m.end)})</span>
              </h3>
              <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} caption={`Requirements for ${m.id}`} />
            </div>
          );
        })}
      </Card>

      <Drawer open={open !== null} title={open ? `Supply fit: ${open.id} ${open.role}` : "Supply fit"} onClose={() => setOpenId(null)}>
        {open && openFit ? (
          <dl className="kv-list">
            <dt>Skill</dt>
            <dd>{skillLabels[open.skill_id] ?? open.skill_id}</dd>
            <dt>Minimum level required</dt>
            <dd>{open.min_proficiency} / 5</dd>
            <dt>Eligible now (contributing teams)</dt>
            <dd>{openFit.eligible_now} people</dd>
            <dt>Reskill candidates (gap 1-2, adjacent skill)</dt>
            <dd>{openFit.reskill_candidates} people</dd>
            <dt>Mapping confidence (curated taxonomy id)</dt>
            <dd>{formatPct(openFit.mapping_confidence, 0)}</dd>
            <dt>Vacancy share 2021 (external)</dt>
            <dd>{openFit.vacancy_evidence_share === null ? "n/a" : formatPct(openFit.vacancy_evidence_share)}</dd>
          </dl>
        ) : null}
        <p className="small muted">Employee-level evidence is shown on the Supply and gaps screen.</p>
      </Drawer>
    </div>
  );
}
