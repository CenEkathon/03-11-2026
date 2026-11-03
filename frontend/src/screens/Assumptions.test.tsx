import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Assumptions } from "./Assumptions";
import { ASSUMPTIONS, makeControls, makeShared } from "../test/fixtures";

function deferred<T>() {
  let resolve: (v: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function rowFor(label: string): HTMLElement {
  return screen.getByText(label).closest("tr") as HTMLElement;
}

function input(label: string): HTMLInputElement {
  return screen.getByLabelText(new RegExp(`^Your base value for ${label} `)) as HTMLInputElement;
}

describe("Assumptions screen", () => {
  it("explains how to read the table and labels the inputs as mock", () => {
    render(<Assumptions shared={makeShared()} controls={makeControls()} />);
    expect(screen.getByText("How to read this table")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Assumptions" })).toBeTruthy();
    expect(screen.getByText("MOCK").className).toBe("badge badge-mock");
  });

  it("shows each assumption with its low, base and high values in its own unit", () => {
    render(<Assumptions shared={makeShared()} controls={makeControls()} />);
    const saving = rowFor("Cost saving on AI-assisted reviews");
    expect(within(saving).getByText("25.0%")).toBeTruthy();
    expect(within(saving).getByText("35.0%").tagName).toBe("STRONG");
    expect(within(saving).getByText("45.0%")).toBeTruthy();
    expect(within(saving).getByText("Low confidence")).toBeTruthy();

    expect(within(rowFor("Contractor day rate")).getByText("EUR 650 per day")).toBeTruthy();
    expect(within(rowFor("One-off hire cost")).getByText("High confidence")).toBeTruthy();
    expect(within(rowFor("Ramp-up days")).getByText("12 days/level")).toBeTruthy();
  });

  it("states the rationale and key for each row", () => {
    render(<Assumptions shared={makeShared()} controls={makeControls()} />);
    const row = rowFor("Ramp-up days");
    expect(within(row).getByText("Mock rationale.")).toBeTruthy();
    expect(within(row).getByText("ramp_days").tagName).toBe("CODE");
  });

  it("fills the inputs with existing overrides and counts them in singular and plural", () => {
    const { unmount } = render(
      <Assumptions shared={makeShared()} controls={makeControls({ overrides: { hire_cost: 4000 } })} />,
    );
    expect(input("One-off hire cost").value).toBe("4000");
    expect(input("Ramp-up days").value).toBe("");
    expect(screen.getByText("1 base value overridden. Leave a field empty to keep the mock base.")).toBeTruthy();
    unmount();

    render(
      <Assumptions shared={makeShared()} controls={makeControls({ overrides: { hire_cost: 4000, ramp_days: 9 } })} />,
    );
    expect(screen.getByText("2 base values overridden. Leave a field empty to keep the mock base.")).toBeTruthy();
  });

  it("describes the input unit and shows the mock base as the placeholder", () => {
    render(<Assumptions shared={makeShared()} controls={makeControls()} />);
    expect(input("Cost saving on AI-assisted reviews").placeholder).toBe("0.35");
    expect(input("Cost saving on AI-assisted reviews").getAttribute("aria-label")).toBe(
      "Your base value for Cost saving on AI-assisted reviews (share)",
    );
    expect(screen.getAllByText("decimal, 0.35 = 35%")).toHaveLength(1);
    expect(screen.getAllByText("EUR/day")).toHaveLength(1);
  });

  it("sends the numeric edits, leaving out empty fields, and shows no errors on success", async () => {
    const applyAssumptions = vi.fn(async () => null);
    render(<Assumptions shared={makeShared()} controls={makeControls({ applyAssumptions })} />);
    fireEvent.change(input("Cost saving on AI-assisted reviews"), { target: { value: "0.4" } });
    fireEvent.change(input("One-off hire cost"), { target: { value: "3500" } });

    fireEvent.click(screen.getByRole("button", { name: "Apply values" }));
    await waitFor(() => expect(applyAssumptions).toHaveBeenCalledTimes(1));
    expect(applyAssumptions).toHaveBeenCalledWith({ ai_cost_saving_pct: 0.4, hire_cost: 3500 });
    expect(screen.queryByText(/Some values were rejected/)).toBeNull();
  });

  it("lists the values the server rejects and leaves the results on screen unchanged", async () => {
    const applyAssumptions = vi.fn(async () => ["hire_cost must be positive"]);
    render(<Assumptions shared={makeShared()} controls={makeControls({ applyAssumptions })} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply values" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Some values were rejected. The results on screen are unchanged.");
    expect(within(alert).getByText("hire_cost must be positive")).toBeTruthy();
  });

  it("disables both buttons and shows progress while the values are applied", async () => {
    const pending = deferred<string[] | null>();
    const applyAssumptions = vi.fn(() => pending.promise);
    render(<Assumptions shared={makeShared()} controls={makeControls({ applyAssumptions })} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply values" }));

    const busy = await screen.findByRole("button", { name: "Recalculating…" });
    expect(busy.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Reset all" }).hasAttribute("disabled")).toBe(true);

    pending.resolve(null);
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply values" }).hasAttribute("disabled")).toBe(false));
  });

  it("resets every input and asks for no overrides", async () => {
    const applyAssumptions = vi.fn(async () => null);
    render(
      <Assumptions shared={makeShared()} controls={makeControls({ overrides: { hire_cost: 4000 }, applyAssumptions })} />,
    );
    expect(input("One-off hire cost").value).toBe("4000");

    fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
    await waitFor(() => expect(applyAssumptions).toHaveBeenCalledWith({}));
    expect(input("One-off hire cost").value).toBe("");
  });

  it("shows the rejection from a reset too", async () => {
    const applyAssumptions = vi.fn(async () => ["cannot reset"]);
    render(<Assumptions shared={makeShared()} controls={makeControls({ applyAssumptions })} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
    expect(await screen.findByText("cannot reset")).toBeTruthy();
  });

  it("uses the same assumption rows as the shared data", () => {
    render(<Assumptions shared={makeShared()} controls={makeControls()} />);
    expect(screen.getAllByRole("row")).toHaveLength(ASSUMPTIONS.length + 1);
  });
});
