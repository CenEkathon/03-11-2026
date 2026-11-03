import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Intake } from "./Intake";
import { SAMPLE_BRIEFS } from "../lib/sampleBriefs";
import { renderWithTheme } from "../test/render";

/** A File-like object for the file input. Only the parts the screen reads are provided. */
function csvFile(name: string, text: string) {
  return { name, text: async () => text };
}

function attach(input: HTMLInputElement, files: unknown[]) {
  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);
}

function fileInput() {
  return document.querySelector<HTMLInputElement>('input[type="file"]')!;
}

const CSV = "employee_id,team,level\nEMP-0001,AML,2\nEMP-0002,KYC,3\n";

describe("Intake form", () => {
  it("starts with an empty brief, no file and a disabled submit button", () => {
    renderWithTheme(<Intake onSubmit={() => undefined} />);
    expect(screen.getByRole("button", { name: "Send for analysis" }).hasAttribute("disabled")).toBe(true);
    expect((screen.getByLabelText("Brief") as HTMLTextAreaElement).value).toBe("");
  });

  it("fills the brief from each demo sample", () => {
    renderWithTheme(<Intake onSubmit={() => undefined} />);
    const group = screen.getByRole("group", { name: "Fill the brief with a sample (demo)" });
    for (const sample of SAMPLE_BRIEFS) {
      fireEvent.click(within(group).getByRole("button", { name: sample.label }));
      expect((screen.getByLabelText("Brief") as HTMLTextAreaElement).value).toBe(sample.text);
    }
  });

  it("summarises an accepted CSV and enables submit once the brief has text", async () => {
    renderWithTheme(<Intake onSubmit={() => undefined} />);
    attach(fileInput(), [csvFile("workers.csv", CSV)]);

    const status = await screen.findByText(/workers.csv/);
    expect(status.closest("span")?.textContent).toContain("2 worker rows, 3 columns (employee_id, team, level)");
    expect(screen.getByRole("button", { name: "Send for analysis" }).hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Brief"), { target: { value: "  Goal text  " } });
    expect(screen.getByRole("button", { name: "Send for analysis" }).hasAttribute("disabled")).toBe(false);
  });

  it("submits the trimmed brief with the file name and worker summary", async () => {
    const onSubmit = vi.fn();
    renderWithTheme(<Intake onSubmit={onSubmit} />);
    attach(fileInput(), [csvFile("workers.csv", CSV)]);
    await screen.findByText(/workers.csv/);
    fireEvent.change(screen.getByLabelText("Brief"), { target: { value: "  Goal text  " } });

    fireEvent.click(screen.getByRole("button", { name: "Send for analysis" }));
    expect(onSubmit).toHaveBeenCalledWith({
      text: "Goal text",
      fileName: "workers.csv",
      workers: { headers: ["employee_id", "team", "level"], rowCount: 2 },
    });
  });

  it("does not submit when the form is sent without a file or without a brief", async () => {
    const onSubmit = vi.fn();
    const { container } = renderWithTheme(<Intake onSubmit={onSubmit} />);
    const form = container.querySelector("form")!;

    fireEvent.submit(form);
    expect(onSubmit).not.toHaveBeenCalled();

    attach(fileInput(), [csvFile("workers.csv", CSV)]);
    await screen.findByText(/workers.csv/);
    fireEvent.submit(form);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a file that is not a CSV and clears any earlier attachment", async () => {
    renderWithTheme(<Intake onSubmit={() => undefined} />);
    attach(fileInput(), [csvFile("workers.csv", CSV)]);
    await screen.findByText(/workers.csv/);

    attach(fileInput(), [csvFile("workers.xlsx", "x")]);
    expect(await screen.findByText("Attach a .csv file.")).toBeTruthy();
    expect(screen.queryByText(/workers.csv/)).toBeNull();
    expect(fileInput().getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toContain("Attach a .csv file.");
  });

  it("explains a CSV that cannot be summarised", async () => {
    renderWithTheme(<Intake onSubmit={() => undefined} />);
    attach(fileInput(), [csvFile("empty.csv", "")]);
    expect(await screen.findByText("The file is empty. Attach a CSV with a header row and worker rows.")).toBeTruthy();
    expect(fileInput().getAttribute("aria-invalid")).toBe("true");
  });

  it("shows a reading message while the file is read, then the summary", async () => {
    let release: (text: string) => void = () => undefined;
    const slow = { name: "slow.csv", text: () => new Promise<string>((resolve) => (release = resolve)) };
    renderWithTheme(<Intake onSubmit={() => undefined} />);
    attach(fileInput(), [slow]);

    expect(await screen.findByText("Reading the file…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send for analysis" }).hasAttribute("disabled")).toBe(true);

    release(CSV);
    expect(await screen.findByText(/slow.csv/)).toBeTruthy();
    expect(screen.queryByText("Reading the file…")).toBeNull();
  });

  it("reports a file that cannot be read", async () => {
    const broken = { name: "broken.csv", text: () => Promise.reject(new Error("disk")) };
    renderWithTheme(<Intake onSubmit={() => undefined} />);
    attach(fileInput(), [broken]);
    expect(await screen.findByText("The file could not be read. Try attaching it again.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Reading the file…")).toBeNull());
  });

  it("clears the attachment when the file picker is emptied", async () => {
    renderWithTheme(<Intake onSubmit={() => undefined} />);
    attach(fileInput(), [csvFile("workers.csv", CSV)]);
    await screen.findByText(/workers.csv/);

    attach(fileInput(), []);
    await waitFor(() => expect(screen.queryByText(/workers.csv/)).toBeNull());
    expect(fileInput().getAttribute("aria-invalid")).toBeNull();
  });

  it("treats a picker with no file list as an empty selection", async () => {
    renderWithTheme(<Intake onSubmit={() => undefined} />);
    attach(fileInput(), [csvFile("workers.csv", CSV)]);
    await screen.findByText(/workers.csv/);

    Object.defineProperty(fileInput(), "files", { value: null, configurable: true });
    fireEvent.change(fileInput());
    await waitFor(() => expect(screen.queryByText(/workers.csv/)).toBeNull());
  });
});
