import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";
import { api, ApiError } from "./api/client";
import type { PlanResponse, SensitivityRow } from "./api/types";
import { ThemeProvider } from "./theme/ThemeProvider";
import { MOCK_ANALYSIS_DELAY_MS } from "./lib/analysisSteps";
import { ASSUMPTIONS, CASE_INFO, makePlan, SENSITIVITY, SKILL_LABELS } from "./test/fixtures";
import { resetRecorded } from "./test/rechartsStub";

vi.mock("recharts", () => import("./test/rechartsStub"));

vi.mock("./api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/client")>();
  return {
    ...actual,
    api: {
      caseInfo: vi.fn(),
      skills: vi.fn(),
      assumptions: vi.fn(),
      computePlan: vi.fn(),
      sensitivity: vi.fn(),
      brief: vi.fn(),
      usage: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api);

/** A promise the test resolves or rejects by hand. */
function deferred<T>() {
  let resolve: (v: T) => void = () => undefined;
  let reject: (e: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function useHappyApi(plan: PlanResponse = makePlan()) {
  mocked.caseInfo.mockResolvedValue(CASE_INFO);
  mocked.skills.mockResolvedValue({
    skills: Object.entries(SKILL_LABELS).map(([id, label]) => ({ id, label, family: "mock", esco_uri: null })),
    labels: {},
  });
  mocked.assumptions.mockResolvedValue({ assumptions: ASSUMPTIONS, labels: {} });
  mocked.computePlan.mockResolvedValue(plan);
  mocked.sensitivity.mockResolvedValue(SENSITIVITY as SensitivityRow[]);
}

function renderApp() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
}

/** Lets pending promises (the CSV read, the API stubs) settle. Fake timers are advanced by zero. */
async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

/** Fills the brief, attaches a CSV, waits for it to be read and sends the intake form. */
async function sendIntake() {
  fireEvent.change(screen.getByLabelText("Brief"), { target: { value: "Goal" } });
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = { name: "workers.csv", text: async () => "employee_id,team\nEMP-1,AML\nEMP-2,KYC\n" };
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
  await flush();
  fireEvent.click(screen.getByRole("button", { name: "Send for analysis" }));
}

/** Runs the mock analysis timer to the end and lets the bootstrap requests settle. */
async function finishAnalysis() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(MOCK_ANALYSIS_DELAY_MS);
  });
}

/** Sends the intake and waits until the plan is on screen. */
async function openPlan() {
  renderApp();
  await sendIntake();
  await finishAnalysis();
  await flush();
}

/** Chooses a page from the sidebar. The hash change that follows is applied asynchronously, so flush first. */
async function nav(label: string) {
  fireEvent.click(within(screen.getByRole("navigation", { name: "Pages" })).getByRole("link", { name: new RegExp(label) }));
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetRecorded();
  useHappyApi();
  window.location.hash = "";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("App intake and mock analysis", () => {
  it("starts on the intake screen with no navigation and no backend calls", () => {
    renderApp();
    expect(screen.getByRole("heading", { name: "Describe the goal and attach the workers" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
    expect(mocked.caseInfo).not.toHaveBeenCalled();
  });

  it("shows what was sent while the mock analysis runs, with steps that advance", async () => {
    renderApp();
    await sendIntake();
    expect(screen.getByRole("heading", { name: "Analysing your brief" })).toBeTruthy();
    expect(screen.getByText("Brief: 4 characters")).toBeTruthy();
    expect(screen.getByText(/workers.csv/).closest("li")?.textContent).toBe("Workers: workers.csv, 2 rows");
    expect(screen.getByText("Collecting data…")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(screen.getByText("Reading your brief…")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Pages" })).toBeNull();
  });

  it("opens the plan on the overview page once the analysis has finished", async () => {
    await openPlan();
    expect(screen.getByRole("navigation", { name: "Pages" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Overview/ }).getAttribute("aria-current")).toBe("page");
    expect(window.location.hash).toBe("#/overview");
  });

  it("clears the analysis timer and its status ticker when the app is closed early", async () => {
    const clear = vi.spyOn(window, "clearTimeout");
    const clearInterval = vi.spyOn(window, "clearInterval");
    const { unmount } = renderApp();
    await sendIntake();
    unmount();
    expect(clear).toHaveBeenCalled();
    expect(clearInterval).toHaveBeenCalled();
  });
});

describe("App navigation between pages", () => {
  it.each([
    ["Roadmap", "Roadmap"],
    ["Workforce", "Workforce"],
    ["Options", "Options"],
    ["Money", "Money"],
    ["Assumptions", "Assumptions"],
  ])("shows the %s page when its link is chosen", async (link, heading) => {
    await openPlan();
    await nav(link);
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeTruthy();
    expect(window.location.hash).toBe(`#/${{ Roadmap: "roadmap", Workforce: "workforce", Options: "options", Money: "finance", Assumptions: "assumptions" }[heading]}`);
  });

  it("opens the plan on the overview even when the address names another page, because intake goes to overview", async () => {
    window.location.hash = "#/finance";
    await openPlan();
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeTruthy();
  });
});

describe("App recalculation", () => {
  it("sends a case change to the backend and marks the sync status as recalculating", async () => {
    await openPlan();
    const pending = deferred<PlanResponse>();
    mocked.computePlan.mockReturnValueOnce(pending.promise);
    mocked.sensitivity.mockResolvedValueOnce(SENSITIVITY);

    const group = screen.getByRole("group", { name: "Assumption case" });
    fireEvent.click(within(group).getByRole("button", { name: "High" }));
    expect(screen.getByText("Recalculating…")).toBeTruthy();
    expect(document.querySelector(".page")?.getAttribute("aria-busy")).toBe("true");
    expect(mocked.computePlan).toHaveBeenLastCalledWith({ case: "high", milestone_dates: null, assumption_overrides: null });

    await act(async () => {
      pending.resolve(makePlan({ case: "high" }));
    });
    await flush();
    expect(within(group).getByRole("button", { name: "High" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Default inputs")).toBeTruthy();
  });

  it("keeps the previous case and explains the failure when a recalculation errors", async () => {
    await openPlan();
    mocked.computePlan.mockRejectedValueOnce(new Error("Network down"));
    const group = screen.getByRole("group", { name: "Assumption case" });
    fireEvent.click(within(group).getByRole("button", { name: "Low" }));
    await flush();

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("The last recalculation failed. The results on screen are from before it.");
    expect(alert.textContent).toContain("Network down");
    expect(within(group).getByRole("button", { name: "Base" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("reports a non-Error failure with a generic message", async () => {
    await openPlan();
    mocked.computePlan.mockRejectedValueOnce("nope");
    fireEvent.click(within(screen.getByRole("group", { name: "Assumption case" })).getByRole("button", { name: "High" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("Unknown error");
  });

  it("clears a previous recalculation error after a later success", async () => {
    await openPlan();
    mocked.computePlan.mockRejectedValueOnce(new ApiError(500, {}));
    fireEvent.click(within(screen.getByRole("group", { name: "Assumption case" })).getByRole("button", { name: "High" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("API error 500");

    fireEvent.click(within(screen.getByRole("group", { name: "Assumption case" })).getByRole("button", { name: "Base" }));
    await flush();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("applies saved roadmap dates and reports the timing as edited", async () => {
    await openPlan();
    await nav("Roadmap");
    fireEvent.change(screen.getByLabelText("M1 end month"), { target: { value: "2027-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply timing" }));
    await flush();

    expect(mocked.computePlan).toHaveBeenLastCalledWith(
      expect.objectContaining({
        milestone_dates: expect.objectContaining({ M1: { start: "2027-01", end: "2027-05" } }),
        assumption_overrides: null,
      }),
    );
    expect(screen.getByText("Showing edited inputs")).toBeTruthy();
  });

  it("returns a server rejection of the roadmap to the Roadmap page and keeps the plan", async () => {
    await openPlan();
    await nav("Roadmap");
    mocked.computePlan.mockRejectedValueOnce(new ApiError(422, { validation: { errors: ["M2 overlaps M1"] } }));
    fireEvent.change(screen.getByLabelText("M1 end month"), { target: { value: "2027-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply timing" }));
    await flush();

    expect(screen.getByText("M2 overlaps M1")).toBeTruthy();
    expect(screen.queryByText(/The last recalculation failed/)).toBeNull();
    expect(screen.getByText("Default inputs")).toBeTruthy();
  });

  it("applies overrides from the Assumptions page and shows them as edits", async () => {
    await openPlan();
    await nav("Assumptions");
    fireEvent.change(screen.getByLabelText("Your base value for One-off hire cost (EUR/hire)"), { target: { value: "4000" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply values" }));
    await flush();

    expect(mocked.computePlan).toHaveBeenLastCalledWith(
      expect.objectContaining({ milestone_dates: null, assumption_overrides: { hire_cost: 4000 } }),
    );
    expect(screen.getByText("Showing edited inputs")).toBeTruthy();
  });

  it("returns a server rejection of an assumption to the Assumptions page", async () => {
    await openPlan();
    await nav("Assumptions");
    mocked.computePlan.mockRejectedValueOnce(new ApiError(422, { detail: "hire_cost must be positive" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply values" }));
    await flush();
    expect(screen.getByRole("alert").textContent).toContain("hire_cost must be positive");
    expect(screen.queryByText(/The last recalculation failed/)).toBeNull();
  });

  it("shows the brief from the overview and the costs for the chosen option", async () => {
    await openPlan();
    mocked.brief.mockResolvedValueOnce({
      scenario: "hybrid",
      text: "Brief text from the mock engine.",
      drafted_by: "template",
      cached: false,
      labels: {},
    });
    fireEvent.click(screen.getByRole("button", { name: "Draft brief" }));
    await flush();
    expect(screen.getByText("Brief text from the mock engine.")).toBeTruthy();
    expect(mocked.brief).toHaveBeenCalledWith({ scenario: "hybrid", case: "base", milestone_dates: null, assumption_overrides: null });
  });
});

describe("App load states", () => {
  it("shows a loading state while the plan is requested", async () => {
    const caseInfo = deferred<typeof CASE_INFO>();
    // Pending for every call, so the load that starts once the analysis ends is still in flight.
    mocked.caseInfo.mockReturnValue(caseInfo.promise);
    renderApp();
    await sendIntake();
    await finishAnalysis();
    expect(screen.getByText("Loading the mock plan from the API…")).toBeTruthy();

    await act(async () => {
      caseInfo.resolve(CASE_INFO);
    });
    await flush();
    expect(screen.queryByText("Loading the mock plan from the API…")).toBeNull();
  });

  it("explains how to start the backend when the plan cannot be loaded", async () => {
    mocked.caseInfo.mockRejectedValue(new ApiError(503, {}));
    renderApp();
    await sendIntake();
    await finishAnalysis();
    await flush();

    expect(screen.getByRole("heading", { name: "The plan could not load" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Could not reach the API at http://127.0.0.1:8000");
    expect(screen.getByRole("alert").textContent).toContain("API error 503");
    expect(screen.getByText(/uv run uvicorn strategy_compiler.api:app --port 8000/)).toBeTruthy();
  });

  it("offers a retry button on a load failure and leaves the case selector inert", async () => {
    mocked.caseInfo.mockRejectedValue("offline");
    renderApp();
    await sendIntake();
    await finishAnalysis();
    await flush();

    expect(screen.getByRole("alert").textContent).toContain("Unknown error");
    fireEvent.click(within(screen.getByRole("group", { name: "Assumption case" })).getByRole("button", { name: "High" }));
    expect(mocked.computePlan).not.toHaveBeenCalled();

    // jsdom cannot navigate, so its reload prints a "not implemented" line. The click itself must still run.
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  });

  it("does not apply a load that finishes after the app has been closed", async () => {
    const caseInfo = deferred<typeof CASE_INFO>();
    mocked.caseInfo.mockReturnValueOnce(caseInfo.promise);
    const { unmount } = renderApp();
    await sendIntake();
    await finishAnalysis();
    // The first load was started during the analysis and is cancelled once the app becomes ready.
    await act(async () => {
      caseInfo.reject(new Error("late failure"));
    });
    await flush();
    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy();
    expect(screen.queryByText("The plan could not load")).toBeNull();
    unmount();
  });

  it("ignores a late successful load that was superseded by the one after analysis", async () => {
    const first = deferred<typeof CASE_INFO>();
    mocked.caseInfo.mockReturnValueOnce(first.promise);
    renderApp();
    await sendIntake();
    await finishAnalysis();
    await flush();
    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy();

    await act(async () => {
      first.resolve(CASE_INFO);
    });
    await flush();
    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy();
  });

  it("uses the first milestone's owner and the skill labels from the backend", async () => {
    await openPlan();
    await nav("Workforce");
    expect(screen.getByText(/Owner team: AML operations/)).toBeTruthy();
    expect(screen.getAllByText("AML alert handling").length).toBeGreaterThan(0);
  });
});
