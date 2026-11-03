import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BriefPanel } from "./BriefPanel";
import { api } from "../api/client";
import type { BriefResponse } from "../api/types";
import { makeControls, makePlan, makeShared } from "../test/fixtures";
import { DISCLAIMER } from "../lib/labels";
import { formatEur } from "../lib/format";

vi.mock("../api/client", () => ({
  api: { brief: vi.fn() },
}));

const briefMock = vi.mocked(api.brief);

function briefResponse(overrides: Partial<BriefResponse> = {}): BriefResponse {
  return {
    scenario: "hybrid",
    text: "Drafted text for the CEO.",
    drafted_by: "template",
    cached: false,
    model: null,
    usage: null,
    labels: {},
    ...overrides,
  };
}

beforeEach(() => {
  briefMock.mockReset();
});

describe("BriefPanel", () => {
  it("starts on the recommended option with the cost and net shown for it", () => {
    render(<BriefPanel shared={makeShared()} controls={makeControls()} />);
    const hybrid = makePlan().scenarios.hybrid.totals;
    expect(screen.getByText(`Cost to deadline ${formatEur(hybrid.cost_total_eur)} · net ${formatEur(hybrid.net_eur)}`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Draft brief" })).toBeTruthy();
    expect(screen.getByText("Choose an option and draft the brief to see the text.")).toBeTruthy();
  });

  it("shows no cost line when the chosen option is missing from the plan", () => {
    const plan = makePlan();
    delete (plan.scenarios as Partial<typeof plan.scenarios>).hybrid;
    render(<BriefPanel shared={makeShared({ plan })} controls={makeControls()} />);
    expect(screen.queryByText(/Cost to deadline/)).toBeNull();
  });

  it("drafts the brief for the chosen option, case and edits, then shows the text and metadata", async () => {
    briefMock.mockResolvedValue(
      briefResponse({
        drafted_by: "claude",
        cached: true,
        model: "claude-test",
        usage: { input_tokens: 120, output_tokens: 80, eur_estimate: 0.01 },
      }),
    );
    const controls = makeControls({
      caseId: "high",
      isEdited: true,
      dates: { M1: { start: "2027-02", end: "2027-06" } },
      overrides: { hire_cost: 4000 },
    });
    render(<BriefPanel shared={makeShared()} controls={controls} />);

    expect(screen.getByText("The brief uses your current timing and assumption edits.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hire-led" }));
    fireEvent.click(screen.getByRole("button", { name: "Draft brief" }));
    expect(screen.getByRole("button", { name: "Drafting…" }).hasAttribute("disabled")).toBe(true);

    const article = await screen.findByRole("article", { name: "Drafted brief" });
    expect(briefMock).toHaveBeenCalledWith({
      scenario: "hire_led",
      case: "high",
      milestone_dates: { M1: { start: "2027-02", end: "2027-06" } },
      assumption_overrides: { hire_cost: 4000 },
    });
    expect(within(article).getByText("Claude (live)")).toBeTruthy();
    expect(within(article).getByText("yes")).toBeTruthy();
    expect(within(article).getByText("claude-test")).toBeTruthy();
    expect(within(article).getByText("Tokens 120 in / 80 out")).toBeTruthy();
    expect(within(article).getByText("Drafted text for the CEO.")).toBeTruthy();
    expect(within(article).getByText(DISCLAIMER)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Draft again" })).toBeTruthy();
  });

  it("sends null edits when nothing has been changed and omits the metadata it does not have", async () => {
    briefMock.mockResolvedValue(briefResponse());
    render(<BriefPanel shared={makeShared()} controls={makeControls()} />);
    fireEvent.click(screen.getByRole("button", { name: "Draft brief" }));

    const article = await screen.findByRole("article", { name: "Drafted brief" });
    expect(briefMock).toHaveBeenCalledWith({
      scenario: "hybrid",
      case: "base",
      milestone_dates: null,
      assumption_overrides: null,
    });
    expect(within(article).getByText("template (offline)")).toBeTruthy();
    expect(within(article).getByText("no")).toBeTruthy();
    expect(within(article).queryByText(/Model/)).toBeNull();
    expect(within(article).queryByText(/Tokens/)).toBeNull();
    expect(screen.queryByText("The brief uses your current timing and assumption edits.")).toBeNull();
  });

  it("shows the reason when drafting fails, and a generic message for anything that is not an Error", async () => {
    briefMock.mockRejectedValueOnce(new Error("Backend is down"));
    render(<BriefPanel shared={makeShared()} controls={makeControls()} />);
    fireEvent.click(screen.getByRole("button", { name: "Draft brief" }));
    expect(await screen.findByText("Backend is down")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Draft brief" })).toBeTruthy();

    briefMock.mockRejectedValueOnce("network");
    fireEvent.click(screen.getByRole("button", { name: "Draft brief" }));
    expect(await screen.findByText("The brief could not be drafted.")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Draft brief" }).hasAttribute("disabled")).toBe(false));
  });
});
