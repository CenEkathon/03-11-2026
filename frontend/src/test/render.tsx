import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { ThemeProvider } from "../theme/ThemeProvider";
import { LanguageProvider } from "../i18n/LanguageProvider";

/** Same provider order as main.tsx: language outside theme. */
function Wrapper({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </LanguageProvider>
  );
}

/** Renders inside the language and theme providers that every screen and the shell read from. */
export function renderWithTheme(ui: ReactElement, options?: RenderOptions) {
  return render(ui, { wrapper: Wrapper, ...options });
}

/** The element that carries a KPI or goal label, found by its visible text. */
export function kpiValue(label: string): string {
  const el = Array.from(document.querySelectorAll(".kpi")).find((k) => k.querySelector(".kpi-label")?.textContent === label);
  if (!el) throw new Error(`no KPI labelled "${label}"`);
  return el.querySelector(".kpi-value")?.textContent ?? "";
}
