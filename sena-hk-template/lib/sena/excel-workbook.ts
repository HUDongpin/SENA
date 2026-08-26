import ExcelJS from "exceljs";
import type { SenaImportRow } from "./import";

export type SenaWorkbookScalar = string | number | boolean | null | undefined;
export type SenaWorkbookExportRow = Record<string, SenaWorkbookScalar>;
export type SenaWorkbookSheet = {
  name: string;
  rows: SenaImportRow[];
};

function workbookBytes(input: ArrayBuffer | Uint8Array) {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function hasKey<T extends string>(value: unknown, key: T): value is Record<T, unknown> {
  return typeof value === "object" && value !== null && key in value;
}

function scalarFromCellValue(value: ExcelJS.CellValue | undefined): SenaWorkbookScalar {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (hasKey(value, "result")) return scalarFromCellValue(value.result as ExcelJS.CellValue);
  if (hasKey(value, "text")) return String(value.text ?? "");
  if (hasKey(value, "richText") && Array.isArray(value.richText)) {
    return value.richText.map((part) => hasKey(part, "text") ? String(part.text ?? "") : "").join("");
  }
  if (hasKey(value, "formula")) return String(value.formula ?? "");
  return String(value);
}

function uniqueHeader(rawHeader: string, usedHeaders: Set<string>, index: number) {
  const base = rawHeader.trim() || `column_${index}`;
  let candidate = base;
  let suffix = 2;
  while (usedHeaders.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  usedHeaders.add(candidate);
  return candidate;
}

function rowsFromWorksheet(worksheet: ExcelJS.Worksheet): SenaImportRow[] {
  const headerRow = worksheet.getRow(1);
  const usedHeaders = new Set<string>();
  const headers = Array.from({ length: Math.max(headerRow.cellCount, worksheet.columnCount) }, (_, index) => {
    const columnIndex = index + 1;
    return {
      columnIndex,
      key: uniqueHeader(String(scalarFromCellValue(headerRow.getCell(columnIndex).value)), usedHeaders, columnIndex)
    };
  }).filter((header) => header.key.length > 0);

  if (headers.length === 0) return [];

  const rows: SenaImportRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const nextRow: SenaImportRow = {};
    let hasValue = false;
    headers.forEach(({ columnIndex, key }) => {
      const value = scalarFromCellValue(row.getCell(columnIndex).value);
      nextRow[key] = value;
      if (value !== "" && value !== null) hasValue = true;
    });
    if (hasValue) rows.push(nextRow);
  });
  return rows;
}

function exportHeaders(rows: SenaWorkbookExportRow[]) {
  const headers: string[] = [];
  const seen = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    });
  });
  return headers;
}

function safeSheetName(name: string, usedNames: Set<string>) {
  const fallback = "Sheet";
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim() || fallback;
  const base = cleaned.slice(0, 31) || fallback;
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    const suffixText = ` ${suffix}`;
    candidate = `${base.slice(0, Math.max(1, 31 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

export async function readXlsxWorkbookRows(input: ArrayBuffer | Uint8Array): Promise<SenaWorkbookSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(workbookBytes(input) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook.worksheets.map((worksheet) => ({
    name: worksheet.name,
    rows: rowsFromWorksheet(worksheet)
  }));
}

export async function buildXlsxWorkbookBuffer(sheets: Array<{ name: string; rows: SenaWorkbookExportRow[] }>): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SENA";
  workbook.lastModifiedBy = "SENA";
  workbook.created = new Date("2026-01-01T00:00:00.000Z");
  workbook.modified = new Date("2026-01-01T00:00:00.000Z");

  const usedNames = new Set<string>();
  sheets.forEach((sheet) => {
    const worksheet = workbook.addWorksheet(safeSheetName(sheet.name, usedNames));
    const headers = exportHeaders(sheet.rows);
    worksheet.columns = headers.map((header) => ({ header, key: header }));
    sheet.rows.forEach((row) => {
      worksheet.addRow(Object.fromEntries(headers.map((header) => [header, row[header] ?? ""])));
    });
  });

  const bytes = await workbook.xlsx.writeBuffer();
  return new Uint8Array(bytes);
}
