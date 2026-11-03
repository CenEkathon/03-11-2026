import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { RangePlot } from "./RangePlot";
import type { RangeRow } from "../lib/viewModels";
import { renderWithTheme } from "../test/render";

const label = (id: string) => `Option ${id}`;
const color = (id: string) => (id === "hybrid" ? "#2a78d6" : "#eb6834");

describe("RangePlot", () => {
  it("renders nothing when there are no rows", () => {
    const { container } = renderWithTheme(<RangePlot rows={[]} label={label} color={color} />);
    expect(container.innerHTML).toBe("");
  });

  it("describes each option's base and range in its accessible name", () => {
    const rows: RangeRow[] = [{ scenario: "hybrid", low: -900_000, base: -800_000, high: -700_000 }];
    renderWithTheme(<RangePlot rows={rows} label={label} color={color} />);
    const track = screen.getByRole("img", {
      name: "Option hybrid: base -EUR 800,000, range -EUR 900,000 to -EUR 700,000",
    });
    expect(track).toBeTruthy();
    expect(screen.getByText("Option hybrid")).toBeTruthy();
    expect(screen.getByText("-EUR 800,000").tagName).toBe("STRONG");
    expect(screen.getByText("-EUR 900k to -EUR 700k")).toBeTruthy();
  });

  it("places the zero line, bar and base marker in proportion to the scale", () => {
    const rows: RangeRow[] = [
      { scenario: "hybrid", low: -1000, base: 0, high: 1000 },
    ];
    const { container } = renderWithTheme(<RangePlot rows={rows} label={label} color={color} />);
    const pct = (el: Element | null) => Number.parseFloat((el as HTMLElement).style.left);
    const zero = container.querySelector(".range-zero");
    const bar = container.querySelector(".range-bar") as HTMLElement;
    const base = container.querySelector(".range-base") as HTMLElement;

    // Padding is 8% of the 2000 span = 160, so the full range is -1160..1160.
    expect(pct(zero)).toBeCloseTo(50, 6);
    expect(pct(bar)).toBeCloseTo(((-1000 + 1160) / 2320) * 100, 6);
    expect(Number.parseFloat(bar.style.width)).toBeCloseTo((2000 / 2320) * 100, 6);
    expect(pct(base)).toBeCloseTo(50, 6);
    expect(base.style.background).toBe("rgb(42, 120, 214)");
    expect(bar.style.background).toBe("rgb(42, 120, 214)");
  });

  it("keeps a visible bar when the low and high cases are equal", () => {
    const rows: RangeRow[] = [{ scenario: "hire_led", low: 500, base: 500, high: 500 }];
    const { container } = renderWithTheme(<RangePlot rows={rows} label={label} color={color} />);
    const bar = container.querySelector(".range-bar") as HTMLElement;
    expect(Number.parseFloat(bar.style.width)).toBeGreaterThan(0);
  });

  it("uses a unit padding when every value is zero, so the scale never divides by zero", () => {
    const rows: RangeRow[] = [{ scenario: "hybrid", low: 0, base: 0, high: 0 }];
    const { container } = renderWithTheme(<RangePlot rows={rows} label={label} color={color} />);
    const zero = container.querySelector(".range-zero") as HTMLElement;
    expect(zero.style.left).toBe("50%");
  });

  it("labels the axis with the extremes and zero, without duplicates", () => {
    const rows: RangeRow[] = [
      { scenario: "hybrid", low: -300_000, base: -200_000, high: -100_000 },
      { scenario: "hire_led", low: -250_000, base: -150_000, high: 0 },
    ];
    const { container } = renderWithTheme(<RangePlot rows={rows} label={label} color={color} />);
    const ticks = Array.from(container.querySelectorAll(".range-axis-track span")).map((s) => s.textContent);
    // The extremes are -300k (lowest low) and 0 (highest high, which is capped at zero here); zero is not repeated.
    expect(ticks).toEqual(["-EUR 300k", "EUR 0"]);
  });

  it("uses the supplied label and colour functions for each option", () => {
    const labelFn = vi.fn(label);
    const colorFn = vi.fn(color);
    const rows: RangeRow[] = [{ scenario: "hire_led", low: -1, base: -1, high: -1 }];
    renderWithTheme(<RangePlot rows={rows} label={labelFn} color={colorFn} />);
    expect(labelFn).toHaveBeenCalledWith("hire_led");
    expect(colorFn).toHaveBeenCalledWith("hire_led");
  });
});
