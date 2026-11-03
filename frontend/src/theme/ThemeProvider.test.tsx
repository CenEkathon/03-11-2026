import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ThemeProvider, useChartTheme, useTheme } from "./ThemeProvider";
import { CHROME, NEUTRAL, SERIES } from "../lib/palette";

/** A controllable prefers-color-scheme media query. */
function installMedia(initialDark: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches: initialDark,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.spyOn(window, "matchMedia").mockImplementation(() => mq as unknown as MediaQueryList);
  return {
    setDark(dark: boolean) {
      mq.matches = dark;
      listeners.forEach((fn) => fn());
    },
    listenerCount: () => listeners.size,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

function Probe() {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="pref">{preference}</span>
      <span data-testid="resolved">{resolved}</span>
      <button type="button" onClick={() => setPreference("dark")}>
        go dark
      </button>
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ThemeProvider", () => {
  it("follows the system scheme when nothing is stored, and leaves the attribute unset", () => {
    installMedia(true);
    render(<Probe />, { wrapper });
    expect(screen.getByTestId("pref").textContent).toBe("system");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("restores a stored light or dark choice", () => {
    installMedia(false);
    window.localStorage.setItem("strategy-compiler-theme", "dark");
    render(<Probe />, { wrapper });
    expect(screen.getByTestId("pref").textContent).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("ignores a stored value it does not recognise", () => {
    installMedia(false);
    window.localStorage.setItem("strategy-compiler-theme", "sepia");
    render(<Probe />, { wrapper });
    expect(screen.getByTestId("pref").textContent).toBe("system");
  });

  it("uses the system scheme when storage cannot be read", () => {
    installMedia(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Probe />, { wrapper });
    expect(screen.getByTestId("pref").textContent).toBe("system");
  });

  it("stores the choice and applies it to the page", () => {
    installMedia(false);
    render(<Probe />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "go dark" }));
    expect(screen.getByTestId("pref").textContent).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(window.localStorage.getItem("strategy-compiler-theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("still applies the choice for this page when storage cannot be written", () => {
    installMedia(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    render(<Probe />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "go dark" }));
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(window.localStorage.getItem("strategy-compiler-theme")).toBeNull();
  });

  it("follows a change in the system scheme only while the preference is system", () => {
    const media = installMedia(false);
    render(<Probe />, { wrapper });
    expect(screen.getByTestId("resolved").textContent).toBe("light");

    act(() => media.setDark(true));
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: "go dark" }));
    act(() => media.setDark(false));
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
  });

  it("removes its system-scheme listener on unmount", () => {
    const media = installMedia(false);
    const { unmount } = render(<Probe />, { wrapper });
    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });
});

describe("useTheme and useChartTheme", () => {
  it("refuses to run outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useTheme())).toThrow("useTheme must be used inside ThemeProvider");
  });

  it("gives chart colours for the resolved theme", () => {
    installMedia(false);
    const { result } = renderHook(() => useChartTheme(), { wrapper });
    expect(result.current.theme).toBe("light");
    expect(result.current.series).toEqual(SERIES.light);
    expect(result.current.neutral).toBe(NEUTRAL.light);
    expect(result.current.chrome).toEqual(CHROME.light);
  });
});
