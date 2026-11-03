import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import {
  Callout,
  Card,
  ChartFigure,
  DataTable,
  Dialog,
  Kpi,
  KpiRow,
  PageHeader,
  Segmented,
  TableView,
  type Column,
} from "./ui";
import { renderWithTheme } from "../test/render";

describe("PageHeader", () => {
  it("renders the title, an optional lead and optional actions", () => {
    const { container } = renderWithTheme(<PageHeader title="Overview" lead="Summary" actions={<button type="button">Export</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeTruthy();
    expect(screen.getByText("Summary").className).toBe("lead");
    expect(container.querySelector(".page-head-actions")).not.toBeNull();
  });

  it("omits the lead and actions wrappers when they are not given", () => {
    const { container } = renderWithTheme(<PageHeader title="Bare" />);
    expect(container.querySelector(".lead")).toBeNull();
    expect(container.querySelector(".page-head-actions")).toBeNull();
  });
});

describe("Card", () => {
  it("names the section after its heading and shows the optional parts", () => {
    renderWithTheme(
      <Card title="Net value" description="Estimate" actions={<button type="button">Help</button>} className="wide" id="net">
        <p>Body text</p>
      </Card>,
    );
    const section = screen.getByRole("region", { name: "Net value" });
    expect(section.className).toBe("card wide");
    expect(section.id).toBe("net");
    expect(within(section).getByText("Estimate").className).toBe("card-desc");
    expect(within(section).getByRole("button", { name: "Help" })).toBeTruthy();
    expect(within(section).getByText("Body text")).toBeTruthy();
  });

  it("renders without a description, actions or extra class", () => {
    const { container } = renderWithTheme(<Card title="Plain">x</Card>);
    expect(container.querySelector(".card")?.className).toBe("card");
    expect(container.querySelector(".card-desc")).toBeNull();
    expect(container.querySelector(".card-actions")).toBeNull();
  });
});

describe("Kpi and KpiRow", () => {
  it("shows the label, value, tone and optional sub line", () => {
    renderWithTheme(
      <KpiRow>
        <Kpi label="Net" value="-EUR 5" tone="bad" sub="Estimate" />
      </KpiRow>,
    );
    expect(screen.getByText("Net").className).toBe("kpi-label");
    expect(screen.getByText("-EUR 5").className).toBe("kpi-value kpi-bad");
    expect(screen.getByText("Estimate").className).toBe("kpi-sub");
  });

  it("has no tone class or sub line when they are omitted", () => {
    const { container } = renderWithTheme(<Kpi label="Cost" value="EUR 1" />);
    expect(container.querySelector(".kpi-value")?.className).toBe("kpi-value");
    expect(container.querySelector(".kpi-sub")).toBeNull();
  });
});

describe("Callout", () => {
  it("is an alert for critical callouts and a status message otherwise", () => {
    const { rerender } = renderWithTheme(<Callout tone="critical" title="Failed">Details</Callout>);
    expect(screen.getByRole("alert").className).toBe("callout callout-critical");

    rerender(<Callout tone="success" title="Done">Details</Callout>);
    expect(screen.getByRole("status").className).toBe("callout callout-success");
  });

  it("shows the mark for each tone", () => {
    const { container, rerender } = renderWithTheme(<Callout tone="success" />);
    expect(container.querySelector(".callout-mark")?.textContent).toBe("✓");
    rerender(<Callout tone="critical" />);
    expect(container.querySelector(".callout-mark")?.textContent).toBe("!");
    rerender(<Callout tone="warning" />);
    expect(container.querySelector(".callout-mark")?.textContent).toBe("!");
    rerender(<Callout />);
    expect(container.querySelector(".callout-mark")?.textContent).toBe("i");
  });

  it("renders the title and body only when given", () => {
    const { container } = renderWithTheme(<Callout>Only body</Callout>);
    expect(container.querySelector(".callout-title")).toBeNull();
    expect(container.querySelector(".callout-body")?.textContent).toBe("Only body");
  });

  it("omits the body wrapper when there are no children", () => {
    const { container } = renderWithTheme(<Callout title="Only title" />);
    expect(container.querySelector(".callout-title")?.textContent).toBe("Only title");
    expect(container.querySelector(".callout-body")).toBeNull();
  });
});

describe("Segmented", () => {
  it("marks the selected option with aria-pressed and reports the chosen value", () => {
    const onChange = vi.fn();
    renderWithTheme(
      <Segmented
        label="Option"
        size="sm"
        value="hybrid"
        onChange={onChange}
        options={[
          { value: "hire_led", label: "Hire-led" },
          { value: "hybrid", label: "Hybrid" },
        ]}
      />,
    );
    const group = screen.getByRole("group", { name: "Option" });
    expect(group.className).toBe("segmented segmented-sm");
    expect(screen.getByRole("button", { name: "Hybrid" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Hire-led" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Hire-led" }));
    expect(onChange).toHaveBeenCalledWith("hire_led");
  });

  it("uses the medium size by default", () => {
    renderWithTheme(<Segmented label="Case" value="a" onChange={() => undefined} options={[{ value: "a", label: "A" }]} />);
    expect(screen.getByRole("group", { name: "Case" }).className).toBe("segmented segmented-md");
  });
});

describe("DataTable", () => {
  type Row = { id: string; name: string; amount: number };
  const columns: Column<Row>[] = [
    { key: "name", header: "Name", render: (r) => r.name },
    { key: "amount", header: "Amount", numeric: true, render: (r) => `EUR ${r.amount}` },
  ];

  it("renders headers, a caption and one row per item with numeric cells aligned", () => {
    renderWithTheme(
      <DataTable
        caption="Options"
        columns={columns}
        rows={[{ id: "a", name: "Hybrid", amount: 5 }]}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.getByRole("table", { name: "Options" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Amount" }).className).toBe("num");
    expect(screen.getByRole("columnheader", { name: "Name" }).className).toBe("");
    expect(screen.getByRole("cell", { name: "EUR 5" }).className).toBe("num");
    expect(screen.getByRole("cell", { name: "Hybrid" }).className).toBe("");
  });

  it("shows the default empty message when there are no rows", () => {
    renderWithTheme(<DataTable caption="Empty" columns={columns} rows={[]} rowKey={(r) => r.id} />);
    const cell = screen.getByText("Nothing to show.");
    expect(cell.getAttribute("colspan")).toBe("2");
  });

  it("shows a custom empty message when given", () => {
    renderWithTheme(<DataTable caption="Empty" columns={columns} rows={[]} rowKey={(r) => r.id} emptyText="No actions." />);
    expect(screen.getByText("No actions.")).toBeTruthy();
  });

  it("passes the row index to the row key function", () => {
    const rowKey = vi.fn((_r: Row, i: number) => `row-${i}`);
    renderWithTheme(
      <DataTable
        caption="Keys"
        columns={columns}
        rows={[
          { id: "x", name: "One", amount: 1 },
          { id: "y", name: "Two", amount: 2 },
        ]}
        rowKey={rowKey}
      />,
    );
    expect(rowKey).toHaveBeenCalledWith(expect.objectContaining({ id: "y" }), 1);
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });
});

describe("TableView and ChartFigure", () => {
  it("collapses its content behind a default or custom summary", () => {
    const { rerender } = renderWithTheme(<TableView>Rows</TableView>);
    expect(screen.getByText("Show as table").tagName).toBe("SUMMARY");
    rerender(<TableView label="Show options">Rows</TableView>);
    expect(screen.getByText("Show options")).toBeTruthy();
  });

  it("renders the figure caption, the chart, the note and the table view", () => {
    const { container } = renderWithTheme(
      <ChartFigure label="Net by option" note="Estimate only" table={<p>Table body</p>} tableLabel="Show net">
        <svg data-testid="chart" />
      </ChartFigure>,
    );
    expect(container.querySelector("figure")).not.toBeNull();
    expect(screen.getByText("Net by option").className).toBe("sr-only");
    expect(screen.getByTestId("chart")).toBeTruthy();
    expect(screen.getByText("Estimate only").className).toBe("chart-note");
    expect(screen.getByText("Show net")).toBeTruthy();
    expect(screen.getByText("Table body")).toBeTruthy();
  });

  it("omits the note and the table view when they are not given", () => {
    const { container } = renderWithTheme(
      <ChartFigure label="Bare">
        <svg />
      </ChartFigure>,
    );
    expect(container.querySelector(".chart-note")).toBeNull();
    expect(container.querySelector(".table-view")).toBeNull();
  });
});

describe("Dialog", () => {
  it("opens as a modal when open becomes true and shows its title and body", () => {
    const { container } = renderWithTheme(
      <Dialog open onClose={() => undefined} title="Evidence" wide>
        <p>Body</p>
      </Dialog>,
    );
    const dialog = container.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.className).toBe("dialog dialog-wide");
    expect(screen.getByRole("heading", { name: "Evidence" })).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("does not render its body while closed, and closes an open dialog when it is switched off", () => {
    const { container, rerender } = renderWithTheme(
      <Dialog open={false} onClose={() => undefined} title="Closed">
        <p>Hidden body</p>
      </Dialog>,
    );
    const dialog = container.querySelector("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(false);
    expect(dialog.className).toBe("dialog");
    expect(screen.queryByText("Hidden body")).toBeNull();

    rerender(
      <Dialog open onClose={() => undefined} title="Closed">
        <p>Hidden body</p>
      </Dialog>,
    );
    expect(dialog.open).toBe(true);

    rerender(
      <Dialog open={false} onClose={() => undefined} title="Closed">
        <p>Hidden body</p>
      </Dialog>,
    );
    expect(dialog.open).toBe(false);
  });

  it("calls onClose from the Close button and from a click on the backdrop only", () => {
    const onClose = vi.fn();
    const { container } = renderWithTheme(
      <Dialog open onClose={onClose} title="Actions">
        <button type="button">Inside</button>
      </Dialog>,
    );
    const dialog = container.querySelector("dialog") as HTMLDialogElement;

    fireEvent.click(screen.getByRole("button", { name: "Inside" }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("calls onClose when the platform closes the dialog, for example on Escape", () => {
    const onClose = vi.fn();
    const { container } = renderWithTheme(
      <Dialog open onClose={onClose} title="Escape">
        <p>Body</p>
      </Dialog>,
    );
    fireEvent(container.querySelector("dialog") as HTMLDialogElement, new Event("close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
