/**
 * Minimal translation helper. The English text is the key: `t("Overview")` returns the Dutch entry from `nl.ts`,
 * or the English text itself when no entry exists. A missing translation therefore never breaks the screen.
 *
 * The current language is module state so that pure helpers (formatters, view models) can call `t` during render.
 * `LanguageProvider` sets it before any child renders and re-renders every consumer when it changes.
 */
import { NL } from "./nl";

export type Lang = "en" | "nl";
export const LANGS: readonly Lang[] = ["en", "nl"];
export const LANGUAGE_STORAGE_KEY = "strategy-compiler-lang";

let current: Lang = "en";

export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

/** BCP 47 locale for number and currency formatting. Belgian Dutch, since the example case is Belgian. */
export function locale(): string {
  return current === "nl" ? "nl-BE" : "en-GB";
}

/** Translates an English source text. `{name}` placeholders are filled from `vars`. Unknown placeholders stay as they are. */
export function t(text: string, vars?: Record<string, string | number>): string {
  const entry = current === "nl" ? NL[text] : undefined;
  const base = typeof entry === "string" ? entry : text;
  if (!vars) return base;
  return base.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "nl";
}
