import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { AppShell } from "./AppShell";
import { ThemeProvider } from "../theme/ThemeProvider";
import type { PageId } from "../routing";

function renderShell(overrides: Partial<Parameters<typeof AppShell>[0]> = {}) {
  const props = {
    page: "overview" as PageId,
    onNavigate: vi.fn(),
    caseId: "base" as const,
    onCaseChange: vi.fn(),
    busy: false,
    edited: false,
    navigable: true,
    children: <p>Screen content</p>,
    ...overrides,
  };
  render(
    <ThemeProvider>
      <AppShell {...props} />
    </ThemeProvider>,
  );
  return props;
}

describe("AppShell navigation", () => {
  it("lists every page and marks the current one", () => {
    renderShell({ page: "finance" });
    const nav = screen.getByRole("navigation", { name: "Pages" });
    expect(within(nav).getAllByRole("link")).toHaveLength(6);
    expect(screen.getByRole("link", { name: /Money/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /Overview/ }).getAttribute("aria-current")).toBeNull();
  });

  it("navigates in-app instead of following the link", () => {
    const { onNavigate } = renderShell();
    const link = screen.getByRole("link", { name: /Workforce/ });
    const notPrevented = fireEvent.click(link);
    expect(notPrevented).toBe(false);
    expect(onNavigate).toHaveBeenCalledWith("workforce");
  });

  it("hides the page navigation and the case selector until the analysis has finished", () => {
    renderShell({ navigable: false });
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Assumption case" })).toBeNull();
    expect(screen.queryByText(/Default inputs|Recalculating|Showing edited inputs/)).toBeNull();
  });

  it("renders the screen content inside the main landmark", () => {
    renderShell();
    const main = screen.getByRole("main");
    expect(main.id).toBe("main");
    expect(within(main).getByText("Screen content")).toBeTruthy();
  });

  it("marks the page as busy while a recalculation is running", () => {
    renderShell({ busy: true });
    const main = screen.getByRole("main");
    expect(main.className).toBe("page is-busy");
    expect(main.getAttribute("aria-busy")).toBe("true");
  });
});

describe("AppShell case selector and sync status", () => {
  it("sends the chosen case to the caller", () => {
    const { onCaseChange } = renderShell({ caseId: "base" });
    const group = screen.getByRole("group", { name: "Assumption case" });
    expect(within(group).getByRole("button", { name: "Base" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(group).getByRole("button", { name: "High" }));
    expect(onCaseChange).toHaveBeenCalledWith("high");
  });

  it.each([
    [{ busy: true, edited: true }, "Recalculating…", "sync sync-busy"],
    [{ busy: false, edited: true }, "Showing edited inputs", "sync"],
    [{ busy: false, edited: false }, "Default inputs", "sync"],
  ])("shows the sync status for %o", (flags, text, className) => {
    renderShell(flags);
    const sync = screen.getByText(text);
    expect(sync.className).toBe(className);
    expect(sync.getAttribute("role")).toBe("status");
  });
});

describe("AppShell theme and labels", () => {
  it("changes the theme preference from the sidebar", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("strategy-compiler-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("states the demo-data notice and the fictional company name", () => {
    renderShell();
    expect(screen.getByRole("note").textContent).toContain("The company, goal, roadmap and assumptions are mock.");
    expect(screen.getByText("KBC (mock example, not real KBC data)")).toBeTruthy();
  });

  it("opens and closes the label legend", () => {
    const { container } = render(
      <ThemeProvider>
        <AppShell
          page="overview"
          onNavigate={() => undefined}
          caseId="base"
          onCaseChange={() => undefined}
          busy={false}
          edited={false}
          navigable
        >
          <p>x</p>
        </AppShell>
      </ThemeProvider>,
    );
    const dialog = container.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "What do the labels mean?" }));
    expect(dialog.open).toBe(true);
    expect(screen.getByText("Generated workforce. Fictional people with IDs only. No names, no real employees.")).toBeTruthy();
    expect(screen.getAllByText("ESTIMATE").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(dialog.open).toBe(false);
  });
});
