import { locale, t } from "../i18n/i18n";

const MONTH_NAMES_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** Short month name for a 1-based month number, in the current language. */
export function monthShortName(month: number): string {
  const names = locale() === "nl-BE" ? MONTH_NAMES_NL : MONTH_NAMES_EN;
  return names[month - 1];
}

/**
 * Number with fixed digits and the current language's separators: "1,234.5" in English, "1.234,5" in Dutch.
 * Rounding comes from toFixed, so English output is the same as before the translation work.
 */
export function formatNumber(value: number, digits = 0): string {
  const dutch = locale() === "nl-BE";
  const groupSep = dutch ? "." : ",";
  const decimalSep = dutch ? "," : ".";
  const fixed = value.toFixed(digits);
  const negative = fixed.startsWith("-");
  const [whole, fraction] = fixed.replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, groupSep);
  return `${negative ? "-" : ""}${grouped}${fraction !== undefined ? `${decimalSep}${fraction}` : ""}`;
}

/** EUR with no decimals. Null or undefined shows as "n/a". Negative values carry a leading minus. */
export function formatEur(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}EUR ${formatNumber(Math.abs(rounded))}`;
}

/** Compact EUR for axis ticks, e.g. "EUR 1.2m" or "EUR 450k" (Dutch: "EUR 1,2 mln" and "EUR 450k"). */
export function formatEurCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}EUR ${formatNumber(abs / 1_000_000, 1)}${t("m")}`;
  if (abs >= 1_000) return `${sign}EUR ${Math.round(abs / 1_000)}k`;
  return `${sign}EUR ${Math.round(abs)}`;
}

/** Ratio to percent. Null shows as "n/a". */
export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${formatNumber(value * 100, digits)}%`;
}

export function formatFte(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return formatNumber(value, digits);
}

/** "2027-07" -> "Jul 2027". Anything else is returned unchanged. */
export function formatMonth(ym: string | null | undefined): string {
  if (!ym) return "n/a";
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ym);
  if (!match) return ym;
  return `${monthShortName(Number(match[2]))} ${match[1]}`;
}

/** Month range label, e.g. "Jan 2027 - Mar 2027". */
export function formatMonthRange(start: string, end: string): string {
  return `${formatMonth(start)} - ${formatMonth(end)}`;
}

export function formatCount(value: number): string {
  return formatNumber(Math.round(value));
}

/** Short month for chart axes, e.g. "Jan '27". */
export function formatAxisMonth(ym: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ym);
  if (!match) return ym;
  return `${monthShortName(Number(match[2]))} '${match[1].slice(2)}`;
}

/** Plain-language count of people or FTE with one decimal when fractional. */
export function formatFteCompact(value: number): string {
  return Number.isInteger(value) ? String(value) : formatNumber(value, 1);
}

/** Success-metric target: shares as percent, anything else as "value unit". */
export function formatMetricTarget(value: number, unit: string): string {
  if (unit === "share") return formatPct(value, 0);
  return `${Number.isInteger(value) ? value : formatNumber(value, 2)} ${t(unit)}`;
}

/** Formats a number by its assumption unit: shares as percent, EUR as money, anything else with its unit. */
export function formatByUnit(value: number, unit: string | undefined): string {
  if (unit === "share") return formatPct(value, 1);
  if (unit?.startsWith("EUR")) {
    const per = unit.includes("/") ? ` ${t("per {unit}", { unit: t(unit.split("/")[1]) })}` : "";
    return `${formatEur(value)}${per}`;
  }
  if (unit === "multiplier") return `${formatNumber(value, 2)}×`;
  return unit ? `${Number.isInteger(value) ? value : formatNumber(value, 2)} ${t(unit)}` : String(value);
}
