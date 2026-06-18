import type { EnaRow } from "./types";
import { EnaInputError } from "./types";

export type ParsedCsv = {
  headers: string[];
  rows: EnaRow[];
};

function parseCsvCells(text: string) {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inQuotes) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === "\"") {
      if (cell.trim().length === 0) {
        inQuotes = true;
      } else {
        cell += char;
      }
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (char === "\r" && next === "\n") index += 1;
    } else {
      cell += char;
    }
  }

  if (inQuotes) {
    throw new EnaInputError("CSV has an unterminated quoted value.");
  }

  if (cell.length > 0 || row.length > 0 || source.endsWith(",")) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((csvRow) => csvRow.some((value) => value.trim().length > 0));
}

function csvCellToScalar(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function parseCsv(text: string): ParsedCsv {
  const parsedRows = parseCsvCells(text);
  if (parsedRows.length === 0) {
    throw new EnaInputError("CSV is empty.");
  }

  const headers = parsedRows[0]?.map((header) => header.trim()) ?? [];
  if (headers.length === 0 || headers.some((header) => header.length === 0)) {
    throw new EnaInputError("CSV header row must contain non-empty column names.");
  }

  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length > 0) {
    throw new EnaInputError(`CSV header contains duplicate columns: ${[...new Set(duplicateHeaders)].join(", ")}.`);
  }

  const rows = parsedRows.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length) {
      throw new EnaInputError(`CSV row ${rowIndex + 2} has ${cells.length} cells but the header has ${headers.length}.`);
    }

    return Object.fromEntries(headers.map((header, cellIndex) => [header, csvCellToScalar(cells[cellIndex] ?? "")]));
  });

  if (rows.length === 0) {
    throw new EnaInputError("CSV must contain at least one data row.");
  }

  return { headers, rows };
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

export function rowsToCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return "";
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));

  return [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(","))
  ].join("\n");
}
