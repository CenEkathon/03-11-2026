/**
 * Colours from the validated reference palette (dataviz skill, references/palette.md).
 * Categorical slots 1-3 pass the all-pairs validator in both modes (scripts/validate_palette.js).
 * Slot 3 (aqua) is below 3:1 contrast on the light surface, so every chart also ships a table view.
 */
export type Theme = "light" | "dark";

export const SERIES: Record<Theme, string[]> = {
  light: ["#2a78d6", "#eb6834", "#1baf7a"],
  dark: ["#3987e5", "#d95926", "#199e70"],
};

export const CHROME: Record<
  Theme,
  { surface: string; ink: string; inkSecondary: string; muted: string; grid: string; axis: string }
> = {
  light: { surface: "#fcfcfb", ink: "#0b0b0b", inkSecondary: "#52514e", muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7" },
  dark: { surface: "#1a1a19", ink: "#f0efec", inkSecondary: "#c3c2b7", muted: "#898781", grid: "#2c2c2a", axis: "#383835" },
};

export function currentTheme(): Theme {
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}
