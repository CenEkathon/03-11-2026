import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { ThemeProvider } from "../theme/ThemeProvider";

function Wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

/** Renders with the theme provider that every chart and the shell read from. rerender keeps the provider. */
export function renderWithTheme(ui: ReactElement, options?: RenderOptions) {
  return render(ui, { wrapper: Wrapper, ...options });
}

/** The element that carries a KPI or goal label, found by its visible text. */
export function kpiValue(label: string): string {
  const el = Array.from(document.querySelectorAll(".kpi")).find((k) => k.querySelector(".kpi-label")?.textContent === label);
  if (!el) throw new Error(`no KPI labelled "${label}"`);
  return el.querySelector(".kpi-value")?.textContent ?? "";
}
