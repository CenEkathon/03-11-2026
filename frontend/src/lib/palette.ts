/**
 * Colours from the validated reference palette (dataviz skill, references/palette.md).
 * Categorical slots 1-3 pass the all-pairs validator in both modes. Slot 3 (aqua) is below 3:1 contrast
 * on the light surface, so every chart that uses it also has a legend and a table view.
 * Chart colours come from JS, so the theme is resolved here and passed down to each chart.
 */
export type Theme = "light" | "dark";

/** Categorical slots: 1 blue, 2 orange, 3 aqua. Never cycled. */
export const SERIES: Record<Theme, string[]> = {
  light: ["#2a78d6", "#eb6834", "#1baf7a"],
  dark: ["#3987e5", "#d95926", "#199e70"],
};

/** Neutral "other" / context colour. Used for the de-emphasised series and for the contractor bridge. */
export const NEUTRAL: Record<Theme, string> = { light: "#898781", dark: "#898781" };

export const CHROME: Record<
  Theme,
  { surface: string; ink: string; inkSecondary: string; muted: string; grid: string; axis: string; target: string }
> = {
  light: {
    surface: "#fcfcfb",
    ink: "#0b0b0b",
    inkSecondary: "#52514e",
    muted: "#6b6a66",
    grid: "#ebeae5",
    axis: "#c3c2b7",
    target: "#52514e",
  },
  dark: {
    surface: "#1a1a19",
    ink: "#f0efec",
    inkSecondary: "#c3c2b7",
    muted: "#a3a29c",
    grid: "#2c2c2a",
    axis: "#383835",
    target: "#c3c2b7",
  },
};
