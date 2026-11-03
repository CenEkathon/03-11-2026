import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { isLang, LANGUAGE_STORAGE_KEY, setLang as setModuleLang, type Lang } from "./i18n";

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStored(): Lang {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLang(stored) ? stored : "en";
  } catch {
    return "en";
  }
}

/** Holds the UI language. English is the default; the choice is remembered in this browser. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStored);

  // Set before children render, so every t() call in this render uses the right language.
  setModuleLang(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Storage can be blocked. The choice then lasts for this page view only.
    }
  }, []);

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
}

/** Subscribes the caller to language changes. Call it in every component that renders translated text. */
export function useLang(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used inside LanguageProvider");
  return ctx;
}
