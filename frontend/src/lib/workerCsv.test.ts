import { describe, expect, it } from "vitest";
import { parseCsvRows, summariseWorkerCsv } from "./workerCsv";

describe("parseCsvRows", () => {
  it("handles quoted commas, escaped quotes and CRLF line endings", () => {
    const rows = parseCsvRows('id,role\r\nW1,"Analyst, KYC"\r\nW2,"say ""hi"""\r\n');
    expect(rows).toEqual([
      ["id", "role"],
      ["W1", "Analyst, KYC"],
      ["W2", 'say "hi"'],
    ]);
  });

  it("drops blank lines and strips a byte order mark", () => {
    const rows = parseCsvRows("﻿id,role\n\nW1,Analyst\n\n");
    expect(rows).toEqual([
      ["id", "role"],
      ["W1", "Analyst"],
    ]);
  });
});

describe("summariseWorkerCsv", () => {
  it("counts worker rows and returns trimmed headers", () => {
    const result = summariseWorkerCsv(" employee_id , team \nW001,KYC\nW002,AML\n");
    expect(result).toEqual({ ok: true, summary: { headers: ["employee_id", "team"], rowCount: 2 } });
  });

  it("rejects an empty file", () => {
    const result = summariseWorkerCsv("");
    expect(result.ok).toBe(false);
  });

  it("rejects a header-only file", () => {
    const result = summariseWorkerCsv("employee_id,team\n");
    expect(result).toEqual({ ok: false, error: "The file has a header row but no worker rows." });
  });
});
