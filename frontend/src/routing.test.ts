import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useHashPage } from "./routing";

afterEach(() => {
  window.location.hash = "";
});

describe("useHashPage", () => {
  it("starts on the page named in the hash", () => {
    window.location.hash = "#/roadmap";
    const { result } = renderHook(() => useHashPage());
    expect(result.current[0]).toBe("roadmap");
  });

  it("falls back to overview for an empty or unknown hash", () => {
    const { result } = renderHook(() => useHashPage());
    expect(result.current[0]).toBe("overview");

    window.location.hash = "#/not-a-page";
    const second = renderHook(() => useHashPage());
    expect(second.result.current[0]).toBe("overview");
  });

  it("accepts a hash without the leading slash", () => {
    window.location.hash = "#finance";
    const { result } = renderHook(() => useHashPage());
    expect(result.current[0]).toBe("finance");
  });

  it("follows the hash when the user navigates with the browser", () => {
    const { result } = renderHook(() => useHashPage());
    act(() => {
      window.location.hash = "#/workforce";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current[0]).toBe("workforce");
  });

  it("writes the hash when a page is chosen, and leaves it alone when it already matches", () => {
    window.location.hash = "#/options";
    const { result } = renderHook(() => useHashPage());
    act(() => result.current[1]("finance"));
    expect(window.location.hash).toBe("#/finance");

    // Choosing the page that is already in the hash is a no-op.
    act(() => result.current[1]("finance"));
    expect(window.location.hash).toBe("#/finance");
  });

  it("stops listening to hash changes after unmount", () => {
    const { result, unmount } = renderHook(() => useHashPage());
    unmount();
    window.location.hash = "#/finance";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(result.current[0]).toBe("overview");
  });
});
