import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider, useLang } from "./LanguageProvider";
import { LANGUAGE_STORAGE_KEY, getLang, setLang as setModuleLang } from "./i18n";
import { renderWithTheme } from "../test/render";

function Probe() {
  const { lang, setLang } = useLang();
  return (
    <>
      <p>current:{lang}</p>
      <button type="button" onClick={() => setLang("nl")}>
        Switch to Dutch
      </button>
    </>
  );
}

function renderProbe() {
  return renderWithTheme(
    <LanguageProvider>
      <Probe />
    </LanguageProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  setModuleLang("en");
});

describe("LanguageProvider", () => {
  it("starts in English and switches to Dutch, remembering the choice", () => {
    renderProbe();
    expect(screen.getByText("current:en")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Dutch" }));
    expect(screen.getByText("current:nl")).toBeTruthy();
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("nl");
    expect(getLang()).toBe("nl");
    expect(document.documentElement.lang).toBe("nl");
  });

  it("restores a stored Dutch choice on start", () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "nl");
    renderProbe();
    expect(screen.getByText("current:nl")).toBeTruthy();
  });

  it("ignores a stored value that is not a language", () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "fr");
    renderProbe();
    expect(screen.getByText("current:en")).toBeTruthy();
  });

  it("falls back to English when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    renderProbe();
    expect(screen.getByText("current:en")).toBeTruthy();
  });

  it("still switches language for this page view when storage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    renderProbe();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Dutch" }));
    expect(screen.getByText("current:nl")).toBeTruthy();
  });
});

describe("useLang outside the provider", () => {
  it("throws a clear error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow("useLang must be used inside LanguageProvider");
    spy.mockRestore();
  });
});
