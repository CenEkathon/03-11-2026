import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CHROME, NEUTRAL, SERIES, type Theme } from "../lib/palette";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "strategy-compiler-theme";

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: Theme;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/** Only called in the browser (the app is client-rendered), so window is always present. */
function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Owns the theme preference. Writes data-theme on <html>; the CSS handles the rest. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [system, setSystem] = useState<Theme>(systemTheme);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystem(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved: Theme = preference === "system" ? system : preference;

  useEffect(() => {
    const root = document.documentElement;
    if (preference === "system") delete root.dataset.theme;
    else root.dataset.theme = preference;
    root.style.colorScheme = resolved;
  }, [preference, resolved]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolved,
      setPreference: (p) => {
        setPreferenceState(p);
        try {
          window.localStorage.setItem(STORAGE_KEY, p);
        } catch {
          /* storage unavailable: the choice lasts for this page only */
        }
      },
    }),
    [preference, resolved],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

/** Chart colours for the resolved theme. Charts read these, never raw hex. */
export function useChartTheme() {
  const { resolved } = useTheme();
  return useMemo(
    () => ({
      theme: resolved,
      series: SERIES[resolved],
      neutral: NEUTRAL[resolved],
      chrome: CHROME[resolved],
    }),
    [resolved],
  );
}
