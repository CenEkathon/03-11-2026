/**
 * Minimal CSV reader for the intake step. It only summarises the uploaded worker file (headers and row count)
 * so the user can check it before the mock analysis. Nothing is stored or sent anywhere.
 * Handles quoted fields, doubled quotes, CRLF line endings and a UTF-8 byte order mark.
 */

export interface WorkerCsvSummary {
  headers: string[];
  rowCount: number;
}

export type WorkerCsvResult = { ok: true; summary: WorkerCsvSummary } | { ok: false; error: string };

/** Splits CSV text into rows of fields. Blank lines are dropped. */
export function parseCsvRows(text: string): string[][] {
  const src = text.startsWith("﻿") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0].trim() === "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\n") {
      endRow();
    } else if (ch === "\r") {
      // Part of a CRLF pair; the \n ends the row.
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** Checks that the file has a header row and at least one worker row, and summarises it. */
export function summariseWorkerCsv(text: string): WorkerCsvResult {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { ok: false, error: "The file is empty. Attach a CSV with a header row and worker rows." };

  const headers = rows[0].map((h) => h.trim());
  if (headers.every((h) => h === "")) return { ok: false, error: "The first row has no column names." };

  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  if (dataRows.length === 0) return { ok: false, error: "The file has a header row but no worker rows." };

  return { ok: true, summary: { headers, rowCount: dataRows.length } };
}
