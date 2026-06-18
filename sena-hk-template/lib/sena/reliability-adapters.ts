import * as XLSX from "xlsx";
import { parseSenaCsv, type SenaImportRow } from "./import";
import {
  buildSenaReliabilityDashboard,
  parseCoderAnnotationsFromRows,
  reliabilityDashboardToReview,
  type SenaReliabilityDashboard
} from "./reliability";
import type { SenaCodingReliabilityReview } from "./types";

export type SenaReliabilityUploadLike = {
  name: string;
  size?: number;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type SenaLocalReliabilityImportResult = {
  schemaVersion: "sena-local-reliability-import/v1";
  dashboard: SenaReliabilityDashboard;
  reviewPatch: Partial<SenaCodingReliabilityReview>;
  fileCount: number;
  annotationCount: number;
  inputFiles: Array<{ name: string; size?: number }>;
  warnings: string[];
};

function isImportRow(value: unknown): value is SenaImportRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rowsFromJson(value: unknown): SenaImportRow[] {
  if (Array.isArray(value)) return value.filter(isImportRow);
  if (!isImportRow(value)) return [];
  const candidates = [value.rows, value.annotations, value.data];
  const table = candidates.find(Array.isArray);
  return Array.isArray(table) ? table.filter(isImportRow) : [value];
}

async function rowsFromReliabilityFile(file: SenaReliabilityUploadLike): Promise<{ rows: SenaImportRow[]; warnings: string[] }> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    return {
      rows: workbook.SheetNames.flatMap((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        return sheet ? XLSX.utils.sheet_to_json<SenaImportRow>(sheet, { defval: "" }) : [];
      }),
      warnings: []
    };
  }

  const text = await file.text();
  if (lowerName.endsWith(".json")) {
    try {
      return { rows: rowsFromJson(JSON.parse(text)), warnings: [] };
    } catch (error) {
      return {
        rows: [],
        warnings: [`${file.name}: JSON reliability annotations could not be parsed.`]
      };
    }
  }

  return { rows: parseSenaCsv(text).rows, warnings: [] };
}

export async function importSenaReliabilityFiles(
  files: SenaReliabilityUploadLike[],
  reviewer = "SENA reliability workflow"
): Promise<SenaLocalReliabilityImportResult> {
  const parsedFiles = await Promise.all(files.map(rowsFromReliabilityFile));
  const rows = parsedFiles.flatMap((file) => file.rows);
  const fileWarnings = parsedFiles.flatMap((file) => file.warnings);
  const parsed = parseCoderAnnotationsFromRows(rows);
  const dashboard = buildSenaReliabilityDashboard(parsed.annotations);
  const dashboardWithWarnings = {
    ...dashboard,
    warnings: [...fileWarnings, ...parsed.warnings, ...dashboard.warnings]
  };

  return {
    schemaVersion: "sena-local-reliability-import/v1",
    dashboard: dashboardWithWarnings,
    reviewPatch: reliabilityDashboardToReview(dashboardWithWarnings, reviewer),
    fileCount: files.length,
    annotationCount: parsed.annotations.length,
    inputFiles: files.map((file) => ({ name: file.name, size: file.size })),
    warnings: dashboardWithWarnings.warnings
  };
}
