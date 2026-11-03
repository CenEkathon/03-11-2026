import { describe, expect, it } from "vitest";
import {
  formatAxisMonth,
  formatByUnit,
  formatCount,
  formatEur,
  formatEurCompact,
  formatFte,
  formatFteCompact,
  formatMetricTarget,
  formatMonth,
  formatMonthRange,
  formatPct,
} from "./format";
import { badgeKind, SCENARIO_SLOT } from "./labels";

describe("formatEur", () => {
  it("shows whole euros with a thousands separator", () => {
    expect(formatEur(1234567.8)).toBe("EUR 1,234,568");
  });

  it("shows n/a for null, undefined and NaN", () => {
    expect(formatEur(null)).toBe("n/a");
    expect(formatEur(undefined)).toBe("n/a");
    expect(formatEur(Number.NaN)).toBe("n/a");
  });

  it("puts the minus sign before EUR for negatives and never shows -0", () => {
    expect(formatEur(-960980.48)).toBe("-EUR 960,980");
    expect(formatEur(-0.4)).toBe("EUR 0");
  });
});

describe("formatEurCompact", () => {
  it("uses m and k suffixes for axis ticks", () => {
    expect(formatEurCompact(1_780_800)).toBe("EUR 1.8m");
    expect(formatEurCompact(-450_000)).toBe("-EUR 450k");
    expect(formatEurCompact(820)).toBe("EUR 820");
  });
});

describe("formatPct and formatFte", () => {
  it("formats ROI as a signed percentage with one decimal", () => {
    expect(formatPct(-0.3505)).toBe("-35.0%");
    expect(formatPct(null)).toBe("n/a");
  });

  it("formats FTE and counts, and n/a for null FTE", () => {
    expect(formatFte(2.456)).toBe("2.5");
    expect(formatFte(null)).toBe("n/a");
    expect(formatCount(1234.4)).toBe("1,234");
  });
});

describe("month labels", () => {
  it("converts YYYY-MM to a short month label", () => {
    expect(formatMonth("2027-07")).toBe("Jul 2027");
    expect(formatMonth("2028-12")).toBe("Dec 2028");
  });

  it("returns anything that is not a month unchanged", () => {
    expect(formatMonth("2027-13")).toBe("2027-13");
    expect(formatMonth(null)).toBe("n/a");
  });

  it("builds a range label", () => {
    expect(formatMonthRange("2027-01", "2027-03")).toBe("Jan 2027 - Mar 2027");
  });
});

describe("badge and scenario helpers", () => {
  it("maps label keys to badge kinds and defaults unknown keys to MOCK", () => {
    expect(badgeKind("workforce")).toBe("SYNTHETIC");
    expect(badgeKind("vacancy_evidence")).toBe("EXTERNAL");
    expect(badgeKind("estimates")).toBe("ESTIMATE");
    expect(badgeKind("something_new")).toBe("MOCK");
  });

  it("gives each scenario a fixed colour slot", () => {
    expect(new Set(Object.values(SCENARIO_SLOT)).size).toBe(3);
    expect(SCENARIO_SLOT.hybrid).toBe(2);
  });
});

describe("chart and metric formatting", () => {
  it("formats axis months as short month and two-digit year", () => {
    expect(formatAxisMonth("2027-01")).toBe("Jan '27");
    expect(formatAxisMonth("2028-12")).toBe("Dec '28");
    expect(formatAxisMonth("not a month")).toBe("not a month");
  });

  it("shows whole counts without decimals and fractional FTE with one", () => {
    expect(formatFteCompact(3)).toBe("3");
    expect(formatFteCompact(2.25)).toBe("2.3");
  });

  it("shows share targets as percent and other targets with their unit", () => {
    expect(formatMetricTarget(0.6, "share")).toBe("60%");
    expect(formatMetricTarget(1, "count")).toBe("1 count");
    expect(formatMetricTarget(2.5, "EUR/day")).toBe("2.50 EUR/day");
  });

  it("formats each assumption unit for display", () => {
    expect(formatByUnit(0.35, "share")).toBe("35.0%");
    expect(formatByUnit(650, "EUR/day")).toBe("EUR 650 per day");
    expect(formatByUnit(2000, "EUR")).toBe("EUR 2,000");
    expect(formatByUnit(1.35, "multiplier")).toBe("1.35×");
    expect(formatByUnit(12, "days")).toBe("12 days");
    expect(formatByUnit(1.5, "days")).toBe("1.50 days");
    expect(formatByUnit(7, "")).toBe("7");
    expect(formatByUnit(7, undefined)).toBe("7");
  });

  it("shows a fractional ratio to two decimals when the unit has no special case", () => {
    expect(formatMetricTarget(0.75, "ratio")).toBe("0.75 ratio");
  });
});
