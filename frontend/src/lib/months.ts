/** Month helpers for YYYY-MM strings. Pure functions, no dates or time zones involved. */

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Months since year 0. Returns null for anything that is not YYYY-MM. */
export function monthIndex(ym: string): number | null {
  const match = MONTH_RE.exec(ym);
  if (!match) return null;
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

export function monthFromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Inclusive list of YYYY-MM months. Empty when either bound is invalid or end is before start. */
export function monthRange(start: string, end: string): string[] {
  const s = monthIndex(start);
  const e = monthIndex(end);
  if (s === null || e === null || e < s) return [];
  const out: string[] = [];
  for (let i = s; i <= e; i++) out.push(monthFromIndex(i));
  return out;
}
