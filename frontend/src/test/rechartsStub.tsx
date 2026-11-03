/**
 * Test double for the recharts exports the charts use. Real recharts needs a measured container and pointer
 * events, which jsdom does not provide. Each stub records the props it was given, so tests can assert the chart
 * configuration and call the formatter and tooltip functions directly with sample values.
 */
import type { ReactElement, ReactNode } from "react";

export interface Recorded {
  name: string;
  props: Record<string, unknown>;
}

export const recorded: Recorded[] = [];

export function resetRecorded() {
  recorded.length = 0;
}

/** Every recorded element with this name, in render order. */
export function allOf(name: string): Record<string, unknown>[] {
  return recorded.filter((r) => r.name === name).map((r) => r.props);
}

/** The last recorded element with this name. Throws if the chart did not render it. */
export function lastOf(name: string): Record<string, unknown> {
  const found = allOf(name);
  if (found.length === 0) throw new Error(`recharts stub: ${name} was not rendered`);
  return found[found.length - 1];
}

type StubProps = Record<string, unknown> & { children?: ReactNode };

function stub(name: string) {
  return function Stub(props: StubProps) {
    recorded.push({ name, props });
    return <div data-recharts={name}>{props.children}</div>;
  };
}

export const ResponsiveContainer = stub("ResponsiveContainer");
export const LineChart = stub("LineChart");
export const BarChart = stub("BarChart");
export const ComposedChart = stub("ComposedChart");
export const Line = stub("Line");
export const Bar = stub("Bar");
export const Area = stub("Area");
export const Cell = stub("Cell");
export const XAxis = stub("XAxis");
export const YAxis = stub("YAxis");
export const CartesianGrid = stub("CartesianGrid");
export const ReferenceLine = stub("ReferenceLine");
export const ReferenceArea = stub("ReferenceArea");
export const Tooltip = stub("Tooltip");
export const Legend = stub("Legend");

/** Renders the output of a recorded `content` render prop so its text can be queried. */
export function tooltipElement(name: string, sample: Record<string, unknown>): ReactElement | null {
  const content = lastOf(name).content as (p: Record<string, unknown>) => ReactElement | null;
  return content(sample);
}
