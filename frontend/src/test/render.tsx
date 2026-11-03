import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { ThemeProvider } from "../theme/ThemeProvider";

/** Renders with the theme provider that every chart and the shell read from. */
export function renderWithTheme(ui: ReactElement, options?: RenderOptions) {
  return render(<ThemeProvider>{ui}</ThemeProvider>, options);
}

/** The element that carries a KPI or goal label, found by its visible text. */
export function kpiValue(label: string): string {
  const el = Array.from(document.querySelectorAll(".kpi")).find((k) => k.querySelector(".kpi-label")?.textContent === label);
  if (!el) throw new Error(`no KPI labelled "${label}"`);
  return el.querySelector(".kpi-value")?.textContent ?? "";
}
