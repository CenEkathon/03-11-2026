import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  AdoptionChart,
  CashChart,
  CoverageChart,
  CumulativeChart,
  MixChart,
  NetByOptionChart,
} from "./Charts";
import { ThemeProvider } from "../theme/ThemeProvider";
import { CHROME, NEUTRAL, SERIES } from "../lib/palette";
import { makePlan } from "../test/fixtures";
import { adoptionRows, cashRows, coverageRows, cumulativeRows, type MixRow } from "../lib/viewModels";
import { allOf, lastOf, resetRecorded, tooltipElement } from "../test/rechartsStub";

vi.mock("recharts", () => import("../test/rechartsStub"));

const plan = makePlan();
const hybridMonthly = plan.scenarios.hybrid.monthly;

function renderChart(node: ReactNode) {
  return render(<ThemeProvider>{node}</ThemeProvider>);
}

/** Renders a tooltip for a sample payload and returns its text. */
function tipText(name: string, sample: Record<string, unknown>): string {
  const element = tooltipElement(name, sample);
  if (!element) return "";
  const { container, unmount } = render(<ThemeProvider>{element}</ThemeProvider>);
  const text = container.textContent ?? "";
  unmount();
  return text;
}

beforeEach(() => {
  resetRecorded();
});

describe("AdoptionChart", () => {
  it("draws the share line against the goal, with quarterly month ticks and percent axis", () => {
    const rows = adoptionRows(hybridMonthly);
    renderChart(<AdoptionChart rows={rows} target={0.6} targetLabel="Target 60%" />);

    expect(lastOf("ResponsiveContainer").height).toBe(300);
    expect(lastOf("LineChart").data).toBe(rows);

    const xAxis = lastOf("XAxis");
    expect((xAxis.ticks as string[]).length).toBe(8);
    expect((xAxis.ticks as string[]).slice(0, 2)).toEqual(["2027-01", "2027-04"]);
    expect((xAxis.tickFormatter as (v: string) => string)("2027-01")).toBe("Jan '27");

    const yAxis = lastOf("YAxis");
    expect((yAxis.tickFormatter as (v: number) => string)(0.6)).toBe("60%");
    expect(yAxis.domain).toEqual([0, 1]);

    const target = lastOf("ReferenceLine");
    expect(target.y).toBe(0.6);
    expect((target.label as { value: string }).value).toBe("Target 60%");

    const line = lastOf("Line");
    expect(line.dataKey).toBe("share");
    expect(line.name).toBe("AI-assisted share");
  });

  it("describes each hovered month with its share in a readable tooltip", () => {
    renderChart(<AdoptionChart rows={adoptionRows(hybridMonthly)} target={0.6} targetLabel="Target" />);
    const text = tipText("Tooltip", {
      active: true,
      label: "2027-04",
      payload: [{ dataKey: "share", name: "AI-assisted share", value: 0.1, color: "#2a78d6" }],
    });
    expect(text.startsWith("Apr 2027")).toBe(true);
    expect(text).toContain("AI-assisted share");
    expect(text).toContain("10.0%");
  });
});

describe("CumulativeChart", () => {
  const ids = ["reskill_led", "hire_led", "hybrid"] as const;
  const rows = cumulativeRows(plan.scenarios, [...ids]);
  const series = ids.map((id, i) => ({ id, label: id, color: SERIES.light[i] }));

  it("emphasises the recommended option and marks the deadline and break-even line", () => {
    renderChart(<CumulativeChart rows={rows} series={series} emphasis="hybrid" deadlineMonth="2028-12" />);

    const widths = allOf("Line").map((l) => [l.dataKey, l.strokeWidth]);
    expect(widths).toEqual([
      ["reskill_led", 1.5],
      ["hire_led", 1.5],
      ["hybrid", 3],
    ]);

    const deadline = allOf("ReferenceLine").find((r) => r.x !== undefined);
    expect(deadline?.x).toBe("2028-12");
    expect((deadline?.label as { value: string }).value).toBe("Deadline");
    expect(allOf("ReferenceLine").some((r) => r.y === 0)).toBe(true);
  });

  it("formats the money axis compactly and the tooltip in full euros", () => {
    renderChart(<CumulativeChart rows={rows} series={series} emphasis="hybrid" deadlineMonth="2028-12" />);
    expect((lastOf("YAxis").tickFormatter as (v: number) => string)(1_500_000)).toBe("EUR 1.5m");
    expect(tipText("Tooltip", { active: true, label: "2027-01", payload: [{ dataKey: "hybrid", name: "Hybrid", value: -1200, color: "#000" }] })).toContain(
      "-EUR 1,200",
    );
  });

  it("renders the legend with coloured text and the series names", () => {
    renderChart(<CumulativeChart rows={rows} series={series} emphasis="hybrid" deadlineMonth="2028-12" />);
    const formatter = lastOf("Legend").formatter as (value: string) => ReactNode;
    const { container } = render(<>{formatter("Hybrid")}</>);
    const span = container.querySelector("span") as HTMLSpanElement;
    expect(span.textContent).toBe("Hybrid");
    expect(span.style.color).not.toBe("");
  });
});

describe("CashChart", () => {
  const rows = cashRows(hybridMonthly);

  it("stacks benefit above zero and cost below it", () => {
    renderChart(<CashChart rows={rows} />);
    const data = lastOf("BarChart").data as { month: string; benefit: number; cost: number }[];
    expect(data[0]).toEqual({ month: "2027-01", benefit: rows[0].benefit, cost: -rows[0].cost });
    expect(data[0].cost).toBeLessThan(0);

    const bars = allOf("Bar");
    expect(bars.map((b) => [b.dataKey, b.name, b.stackId])).toEqual([
      ["benefit", "Benefit (estimate)", "cash"],
      ["cost", "Cost (estimate)", "cash"],
    ]);
    expect(bars[0].fill).toBe(SERIES.light[0]);
    expect(bars[1].fill).toBe(SERIES.light[1]);
  });

  it("shows cost as a positive amount in the tooltip and benefit as it is", () => {
    renderChart(<CashChart rows={rows} />);
    const common = { active: true, label: "2027-02" };
    expect(tipText("Tooltip", { ...common, payload: [{ dataKey: "cost", name: "Cost", value: -2500, color: "#000" }] })).toContain("EUR 2,500");
    expect(tipText("Tooltip", { ...common, payload: [{ dataKey: "benefit", name: "Benefit", value: 900, color: "#000" }] })).toContain("EUR 900");
  });

  it("formats axis ticks in compact euros", () => {
    renderChart(<CashChart rows={rows} />);
    expect((lastOf("YAxis").tickFormatter as (v: number) => string)(-450_000)).toBe("-EUR 450k");
  });
});

describe("NetByOptionChart", () => {
  const bars = [
    { id: "reskill_led", label: "Reskill-led", value: -900_000, color: SERIES.light[0] },
    { id: "hire_led", label: "Hire-led", value: -700_000, color: SERIES.light[1] },
    { id: "hybrid", label: "Hybrid", value: -800_000, color: SERIES.light[2] },
  ];

  it("sizes itself to the number of options and colours each bar by its option", () => {
    renderChart(<NetByOptionChart rows={bars} />);
    expect(lastOf("ResponsiveContainer").height).toBe(3 * 64 + 40);
    expect(allOf("Cell").map((c) => c.fill)).toEqual(bars.map((b) => b.color));
    expect(lastOf("BarChart").layout).toBe("vertical");
    expect(lastOf("YAxis").dataKey).toBe("label");
  });

  it("keeps a minimum height for a single option", () => {
    renderChart(<NetByOptionChart rows={[bars[0]]} />);
    expect(lastOf("ResponsiveContainer").height).toBe(160);
  });

  it("marks zero and formats the value axis and tooltip", () => {
    renderChart(<NetByOptionChart rows={bars} />);
    expect(lastOf("ReferenceLine").x).toBe(0);
    expect((lastOf("XAxis").tickFormatter as (v: number) => string)(-900_000)).toBe("-EUR 900k");
    expect(tipText("Tooltip", { active: true, label: "Hybrid", payload: [{ dataKey: "value", name: "Net", value: -800000, color: "#000" }] })).toContain(
      "-EUR 800,000",
    );
  });
});

describe("CoverageChart", () => {
  const rows = coverageRows(hybridMonthly);

  it("draws required and staffed FTE and shades the milestone window when one is given", () => {
    renderChart(<CoverageChart rows={rows} window={{ from: "2027-01", to: "2027-06" }} />);
    expect(lastOf("ComposedChart").data).toBe(rows);

    const area = lastOf("Area");
    expect(area.dataKey).toBe("required");
    expect(area.name).toBe("Required FTE");
    expect(area.type).toBe("stepAfter");
    expect(lastOf("Line").dataKey).toBe("staffed");

    const shade = lastOf("ReferenceArea");
    expect(shade.x1).toBe("2027-01");
    expect(shade.x2).toBe("2027-06");
    expect(shade.fill).toBe(CHROME.light.ink);
  });

  it("draws no shading when there is no milestone window", () => {
    renderChart(<CoverageChart rows={rows} window={null} />);
    expect(allOf("ReferenceArea")).toHaveLength(0);
  });

  it("formats FTE on the axis and in the tooltip", () => {
    renderChart(<CoverageChart rows={rows} window={null} />);
    expect((lastOf("YAxis").tickFormatter as (v: number) => string)(3.4)).toBe("3");
    expect(tipText("Tooltip", { active: true, label: "2027-01", payload: [{ dataKey: "staffed", name: "Staffed FTE", value: 4.5, color: "#000" }] })).toContain(
      "4.5 FTE",
    );
  });
});

describe("MixChart", () => {
  const rows: MixRow[] = [{ milestone: "M1", reskill: 2, redeploy: 1, hire: 0.5, external: 0.25, total: 3.75 }];

  it("stacks the four action types in a fixed order with fixed colours", () => {
    renderChart(<MixChart rows={rows} />);
    const bars = allOf("Bar");
    expect(bars.map((b) => [b.dataKey, b.name, b.fill])).toEqual([
      ["reskill", "Reskill", SERIES.light[0]],
      ["redeploy", "Redeploy", SERIES.light[2]],
      ["hire", "Hire", SERIES.light[1]],
      ["external", "Contractor bridge", NEUTRAL.light],
    ]);
    expect(bars.every((b) => b.stackId === "mix")).toBe(true);
  });

  it("shows each FTE value with its unit in the tooltip and whole FTE on the axis", () => {
    renderChart(<MixChart rows={rows} />);
    expect((lastOf("YAxis").tickFormatter as (v: number) => string)(2.6)).toBe("3");
    expect(tipText("Tooltip", { active: true, label: "Hire", payload: [{ dataKey: "hire", name: "Hire", value: 0.5, color: "#000" }] })).toContain(
      "0.5 FTE",
    );
  });
});

describe("chart tooltip", () => {
  const sample = { dataKey: "share", name: "AI-assisted share", value: 0.5, color: "#111" };

  it("renders nothing when inactive or without data", () => {
    renderChart(<AdoptionChart rows={[]} target={0.6} targetLabel="T" />);
    expect(tipText("Tooltip", { active: false, payload: [sample] })).toBe("");
    expect(tipText("Tooltip", { active: true, payload: [] })).toBe("");
    expect(tipText("Tooltip", { active: true })).toBe("");
  });

  it("leaves a non-month label as written and shows an empty label when there is none", () => {
    renderChart(<AdoptionChart rows={[]} target={0.6} targetLabel="T" />);
    expect(tipText("Tooltip", { active: true, label: "Total", payload: [sample] })).toContain("Total");
    expect(tipText("Tooltip", { active: true, payload: [sample] })).toContain("AI-assisted share");
  });

  it("falls back to the data key when a series has no name", () => {
    renderChart(<AdoptionChart rows={[]} target={0.6} targetLabel="T" />);
    expect(tipText("Tooltip", { active: true, label: "x", payload: [{ dataKey: "share", value: 0.2, color: "#111" }] })).toContain("share");
    expect(tipText("Tooltip", { active: true, label: "x", payload: [{ value: 0.2, color: "#111" }] })).toContain("20.0%");
  });
});
