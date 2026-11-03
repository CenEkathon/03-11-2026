import { describe, expect, it } from "vitest";
import { checkDraft, isDirty, monthIndex, type MilestoneDraft } from "./roadmap";

const chain: MilestoneDraft[] = [
  { id: "M1", start: "2027-01", end: "2027-03", depends_on: [] },
  { id: "M2", start: "2027-04", end: "2027-06", depends_on: ["M1"] },
];

describe("monthIndex", () => {
  it("parses valid months and rejects others", () => {
    expect(monthIndex("2027-01")).toBe(2027 * 12);
    expect(monthIndex("2027-13")).toBeNull();
    expect(monthIndex("27-01")).toBeNull();
  });
});

describe("checkDraft", () => {
  it("accepts the default finish-to-start chain", () => {
    expect(checkDraft(chain)).toEqual([]);
  });

  it("flags a successor that starts in the predecessor's last month", () => {
    const errors = checkDraft([chain[0], { ...chain[1], start: "2027-03" }]);
    expect(errors.some((e) => e.includes("finish-to-start"))).toBe(true);
  });

  it("flags an end before start and malformed months", () => {
    expect(checkDraft([{ id: "X", start: "2027-05", end: "2027-02", depends_on: [] }])[0]).toContain("before start");
    expect(checkDraft([{ id: "X", start: "bad", end: "2027-02", depends_on: [] }])[0]).toContain("start must be a month");
  });

  it("flags unknown dependencies", () => {
    expect(checkDraft([{ id: "X", start: "2027-01", end: "2027-02", depends_on: ["NOPE"] }])).toEqual([
      "X: unknown dependency NOPE",
    ]);
  });
});

describe("isDirty", () => {
  it("is false when drafts match the applied dates and true after an edit", () => {
    const applied = { M1: { start: "2027-01", end: "2027-03" }, M2: { start: "2027-04", end: "2027-06" } };
    expect(isDirty(chain, applied)).toBe(false);
    expect(isDirty([{ ...chain[0], end: "2027-04" }, chain[1]], applied)).toBe(true);
  });
});
