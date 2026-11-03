const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** EUR with no decimals. Null or undefined shows as "n/a". Negative values carry a leading minus. */
export function formatEur(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}EUR ${Math.abs(rounded).toLocaleString("en-GB")}`;
}

/** Compact EUR for axis ticks, e.g. "EUR 1.2m" or "EUR 450k". */
export function formatEurCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}EUR ${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${sign}EUR ${Math.round(abs / 1_000)}k`;
  return `${sign}EUR ${Math.round(abs)}`;
}

/** Ratio to percent with one decimal. Null shows as "n/a". */
export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatFte(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return value.toFixed(digits);
}

/** "2027-07" -> "Jul 2027". Anything else is returned unchanged. */
export function formatMonth(ym: string | null | undefined): string {
  if (!ym) return "n/a";
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ym);
  if (!match) return ym;
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${match[1]}`;
}

/** Month range label, e.g. "Jan 2027 - Mar 2027". */
export function formatMonthRange(start: string, end: string): string {
  return `${formatMonth(start)} - ${formatMonth(end)}`;
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-GB");
}

/** Short month for chart axes, e.g. "Jan '27". */
export function formatAxisMonth(ym: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ym);
  if (!match) return ym;
  return `${MONTH_NAMES[Number(match[2]) - 1]} '${match[1].slice(2)}`;
}

/** Plain-language count of people or FTE with one decimal when fractional. */
export function formatFteCompact(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Success-metric target: shares as percent, anything else as "value unit". */
export function formatMetricTarget(value: number, unit: string): string {
  if (unit === "share") return formatPct(value, 0);
  return `${Number.isInteger(value) ? value : value.toFixed(2)} ${unit}`;
}

/** Formats a number by its assumption unit: shares as percent, EUR as money, anything else with its unit. */
export function formatByUnit(value: number, unit: string | undefined): string {
  if (unit === "share") return formatPct(value, 1);
  if (unit?.startsWith("EUR")) {
    const per = unit.includes("/") ? ` per ${unit.split("/")[1]}` : "";
    return `${formatEur(value)}${per}`;
  }
  if (unit === "multiplier") return `${value.toFixed(2)}×`;
  return unit ? `${Number.isInteger(value) ? value : value.toFixed(2)} ${unit}` : String(value);
}
