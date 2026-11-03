import { describe, expect, it } from "vitest";
import { checkDraft, isDirty, monthIndex, rowErrors, type MilestoneDraft } from "./roadmap";

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

  it("ignores drafts that have no applied counterpart", () => {
    const applied = { M1: { start: "2027-01", end: "2027-03" } };
    expect(isDirty([chain[0], { ...chain[1], start: "2030-01" }], applied)).toBe(false);
  });
});

describe("checkDraft edge cases", () => {
  it("reports a malformed end month and does not check its dependencies", () => {
    const errors = checkDraft([{ id: "X", start: "2027-01", end: "soon", depends_on: [] }]);
    expect(errors).toEqual(["X: end must be a month (YYYY-MM)"]);
  });

  it("does not flag a successor when the predecessor's end is malformed", () => {
    const errors = checkDraft([
      { id: "M1", start: "2027-01", end: "not-a-month", depends_on: [] },
      { id: "M2", start: "2027-04", end: "2027-06", depends_on: ["M1"] },
    ]);
    expect(errors).toEqual(["M1: end must be a month (YYYY-MM)"]);
  });
});

describe("rowErrors", () => {
  it("groups messages by milestone id and returns an empty map for a valid draft", () => {
    expect(rowErrors(chain)).toEqual({});
    const bad = [{ id: "M1", start: "2027-05", end: "2027-02", depends_on: [] }];
    expect(rowErrors(bad)).toEqual({ M1: ["M1: end 2027-02 is before start 2027-05"] });
  });
});

describe("localizeTimingError", () => {
  it("passes each known timing message through in English, with its values filled in", async () => {
    const { localizeTimingError } = await import("./roadmap");
    const cases = [
      "M2: start must be a month (YYYY-MM)",
      "M2: end must be a month (YYYY-MM)",
      "M2: end 2027-03 is before start 2027-06",
      "M2: unknown dependency M9",
      "M2 starts 2027-03, which is not after M1 ends 2027-03 (finish-to-start)",
      "M2: 2031-01..2031-03 is outside the horizon 2027-01..2028-12",
      "dependency cycle detected",
      "duplicate milestone ids",
    ];
    for (const message of cases) expect(localizeTimingError(message)).toBe(message);
  });

  it("returns unknown messages unchanged", async () => {
    const { localizeTimingError } = await import("./roadmap");
    expect(localizeTimingError("something new from the server")).toBe("something new from the server");
  });
});
