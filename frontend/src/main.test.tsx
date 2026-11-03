import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./theme/ThemeProvider";

vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({ render: vi.fn() })),
}));

vi.mock("./App", () => ({ default: () => null }));

afterEach(() => {
  document.body.innerHTML = "";
  vi.resetModules();
  vi.clearAllMocks();
});

describe("app entry point", () => {
  it("mounts the app into #root inside strict mode and the theme provider", async () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);

    await import("./main");

    expect(createRoot).toHaveBeenCalledWith(root);
    const render = vi.mocked(createRoot).mock.results[0].value.render as unknown as { mock: { calls: [ReactElement][] } };
    expect(render.mock.calls).toHaveLength(1);

    const strict = render.mock.calls[0][0];
    expect(strict.type).toBe(StrictMode);
    const provider = (strict.props as { children: ReactElement }).children;
    expect(provider.type).toBe(ThemeProvider);
    const app = (provider.props as { children: ReactElement }).children;
    expect(app.type).toBe(App);
  });
});
