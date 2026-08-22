import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { parseSenaCsv, type SenaImportRow } from "./import";
import {
  assertSenaReliabilityCombinedRawRowsWithinLimits,
  assertSenaReliabilitySourceBytesWithinLimits,
  assertSenaReliabilitySourceCountWithinLimits,
  buildSenaReliabilityDashboard,
  parseCoderAnnotationsFromRows,
  reliabilityDashboardToReview,
  SENA_RELIABILITY_UNIVERSE_LIMITS,
  SenaReliabilityUniverseLimitError,
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
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.localReliabilityImport;
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

function rawRowsFromJson(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isImportRow(value)) return [];
  const candidates = [value.rows, value.annotations, value.data];
  const table = candidates.find(Array.isArray);
  return Array.isArray(table) ? table : [value];
}

function allRawRowGroupsFromJson(value: unknown): unknown[][] {
  if (Array.isArray(value)) return [value];
  if (!isImportRow(value)) return [];
  const groups = [value.rows, value.annotations, value.data].filter(Array.isArray);
  return groups.length > 0 ? groups : [[value]];
}

async function rowsFromReliabilityFile(
  file: SenaReliabilityUploadLike,
  budget: { consumedRawRows: number; consumedBytes: number }
): Promise<{
  rows: SenaImportRow[];
  warnings: string[];
  bytes: number;
  rawRowCount: number;
}> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    throw new Error(`${file.name}: local reliability import accepts CSV or JSON only. Sign in to process .xlsx files on the server, or export this worksheet as CSV.`);
  }

  const text = await file.text();
  const bytes = new TextEncoder().encode(text).byteLength;
  assertSenaReliabilitySourceBytesWithinLimits([bytes], "files");
  if (bytes > SENA_RELIABILITY_UNIVERSE_LIMITS.aggregateSourceBytes - budget.consumedBytes) {
    throw new SenaReliabilityUniverseLimitError([{
      path: "files",
      rule: `aggregate-source-byte-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.aggregateSourceBytes}`,
      actual: budget.consumedBytes + bytes,
      maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.aggregateSourceBytes
    }]);
  }
  if (lowerName.endsWith(".json")) {
    let decoded: unknown;
    let structuralRawRows = 0;
    try {
      // Keep the scanner out of the initial workspace bundle. It is loaded
      // only when a researcher explicitly imports a local reliability JSON
      // file, before JSON.parse can materialize its arrays/objects.
      const { preflightSenaReliabilityJsonText } = await import("./reliability-json-preflight");
      structuralRawRows = preflightSenaReliabilityJsonText(text, {
        mode: "source",
        maximumRows: SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows,
        maximumSources: SENA_RELIABILITY_UNIVERSE_LIMITS.sources,
        consumedRows: budget.consumedRawRows
      }).rawRows;
      decoded = JSON.parse(text);
    } catch (error) {
      if (error instanceof SenaReliabilityUniverseLimitError) throw error;
      return {
        rows: [],
        warnings: [`${file.name}: JSON reliability annotations could not be parsed.`],
        bytes,
        rawRowCount: 0
      };
    }
    // Every supplied alias consumes admission budget even though the legacy
    // semantic reader continues to select the first rows/annotations/data
    // table. Count before that precedence can hide ignored raw rows.
    const semanticRawRowCount = assertSenaReliabilityCombinedRawRowsWithinLimits(allRawRowGroupsFromJson(decoded));
    const rawRowCount = Math.max(structuralRawRows, semanticRawRowCount);
    const rawRows = rawRowsFromJson(decoded);
    return { rows: rawRows.filter(isImportRow), warnings: [], bytes, rawRowCount };
  }

  const parsed = parseSenaCsv(text, {
    maximumDataRows: SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows - budget.consumedRawRows,
    onDataRowLimitExceeded(actual) {
      throw new SenaReliabilityUniverseLimitError([{
        path: "annotations",
        rule: `raw-row-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows}`,
        actual: budget.consumedRawRows + actual,
        maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows
      }]);
    }
  });
  const rawRowCount = parsed.rows.length;
  // Ragged-row repairs are recorded per file; the padded empty value cell is
  // then skipped (with its own disclosure) by parseCoderAnnotationsFromRows
  // instead of being read as an applied code that moves kappa/alpha.
  return {
    rows: parsed.rows,
    warnings: parsed.warnings.map((warning) => `${file.name}: ${warning}`),
    bytes,
    rawRowCount
  };
}

export async function importSenaReliabilityFiles(
  files: SenaReliabilityUploadLike[],
  reviewer = "SENA reliability workflow"
): Promise<SenaLocalReliabilityImportResult> {
  assertSenaReliabilitySourceCountWithinLimits(files.length, "files");
  const declaredSizes = files.map((file) => file.size).filter((size): size is number => size !== undefined);
  assertSenaReliabilitySourceBytesWithinLimits(declaredSizes, "files");
  const parsedFiles: Awaited<ReturnType<typeof rowsFromReliabilityFile>>[] = [];
  let consumedRawRows = 0;
  let consumedBytes = 0;
  for (const file of files) {
    const parsedFile = await rowsFromReliabilityFile(file, { consumedRawRows, consumedBytes });
    consumedRawRows += parsedFile.rawRowCount;
    consumedBytes += parsedFile.bytes;
    parsedFiles.push(parsedFile);
  }
  assertSenaReliabilitySourceBytesWithinLimits(parsedFiles.map((file) => file.bytes), "files");
  assertSenaReliabilityCombinedRawRowsWithinLimits(parsedFiles.map((file) => ({ length: file.rawRowCount })));
  const rows = parsedFiles.flatMap((file) => file.rows);
  const fileWarnings = parsedFiles.flatMap((file) => file.warnings);
  const parsed = parseCoderAnnotationsFromRows(rows);
  const dashboard = buildSenaReliabilityDashboard(parsed.annotations, { skippedCells: parsed.skippedCells });
  const dashboardWithWarnings = {
    ...dashboard,
    warnings: [...fileWarnings, ...parsed.warnings, ...dashboard.warnings]
  };

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.localReliabilityImport,
    dashboard: dashboardWithWarnings,
    reviewPatch: reliabilityDashboardToReview(dashboardWithWarnings, reviewer),
    fileCount: files.length,
    annotationCount: parsed.annotations.length,
    inputFiles: files.map((file) => ({ name: file.name, size: file.size })),
    warnings: dashboardWithWarnings.warnings
  };
}
