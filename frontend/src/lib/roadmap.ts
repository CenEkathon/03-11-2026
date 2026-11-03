/**
 * Client-side mirror of the backend roadmap checks, used only to show errors before a round trip.
 * The backend stays the source of truth: a 422 from /api/plan/compute always wins.
 */
import { t } from "../i18n/i18n";
import { monthIndex } from "./months";

export { monthIndex } from "./months";

export interface MilestoneDraft {
  id: string;
  start: string;
  end: string;
  depends_on: string[];
}

/** Returns human-readable errors. An empty list means the draft passes the local checks. */
export function checkDraft(drafts: MilestoneDraft[]): string[] {
  const errors: string[] = [];
  const byId = new Map(drafts.map((m) => [m.id, m]));
  for (const m of drafts) {
    const s = monthIndex(m.start);
    const e = monthIndex(m.end);
    if (s === null) {
      errors.push(`${m.id}: start must be a month (YYYY-MM)`);
      continue;
    }
    if (e === null) {
      errors.push(`${m.id}: end must be a month (YYYY-MM)`);
      continue;
    }
    if (e < s) errors.push(`${m.id}: end ${m.end} is before start ${m.start}`);
    for (const dep of m.depends_on) {
      const predecessor = byId.get(dep);
      if (!predecessor) {
        errors.push(`${m.id}: unknown dependency ${dep}`);
        continue;
      }
      const depEnd = monthIndex(predecessor.end);
      if (depEnd !== null && s <= depEnd) {
        errors.push(`${m.id} starts ${m.start}, which is not after ${dep} ends ${predecessor.end} (finish-to-start)`);
      }
    }
  }
  return errors;
}

/** Per-milestone errors, so each row in the editor can show its own message. */
export function rowErrors(drafts: MilestoneDraft[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of checkDraft(drafts)) {
    const id = e.split(":")[0].split(" ")[0];
    (out[id] ??= []).push(e);
  }
  return out;
}

/** True if any draft date differs from the applied milestone dates. */
export function isDirty(
  drafts: MilestoneDraft[],
  applied: Record<string, { start: string; end: string }>,
): boolean {
  return drafts.some((m) => {
    const a = applied[m.id];
    return a !== undefined && (a.start !== m.start || a.end !== m.end);
  });
}

/**
 * Translates one timing message from checkDraft or from the server, at render time. Messages keep their English
 * form in state so that a language switch updates them. Unknown messages are returned unchanged.
 */
export function localizeTimingError(message: string): string {
  const rules: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^(\S+): start must be a month \(YYYY-MM\)$/, (m) => t("{id}: start must be a month (YYYY-MM)", { id: m[1] })],
    [/^(\S+): end must be a month \(YYYY-MM\)$/, (m) => t("{id}: end must be a month (YYYY-MM)", { id: m[1] })],
    [/^(\S+): end (\S+) is before start (\S+)$/, (m) => t("{id}: end {end} is before start {start}", { id: m[1], end: m[2], start: m[3] })],
    [/^(\S+): unknown dependency (\S+)$/, (m) => t("{id}: unknown dependency {dep}", { id: m[1], dep: m[2] })],
    [
      /^(\S+) starts (\S+), which is not after (\S+) ends (\S+) \(finish-to-start\)$/,
      (m) =>
        t("{id} starts {start}, which is not after {dep} ends {depEnd} (finish-to-start)", {
          id: m[1],
          start: m[2],
          dep: m[3],
          depEnd: m[4],
        }),
    ],
    [
      /^(\S+): (\S+)\.\.(\S+) is outside the horizon (\S+)\.\.(\S+)$/,
      (m) =>
        t("{id}: {start}..{end} is outside the horizon {horizonStart}..{horizonEnd}", {
          id: m[1],
          start: m[2],
          end: m[3],
          horizonStart: m[4],
          horizonEnd: m[5],
        }),
    ],
    [/^dependency cycle detected$/, () => t("dependency cycle detected")],
    [/^duplicate milestone ids$/, () => t("duplicate milestone ids")],
  ];
  for (const [pattern, render] of rules) {
    const match = pattern.exec(message);
    if (match) return render(match);
  }
  return message;
}
