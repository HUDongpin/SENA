import { readXlsxWorkbookRows } from "../excel-workbook";
import { parseSenaCsv, type SenaImportRow } from "../import";
import { preflightSenaReliabilityJsonText } from "../reliability-json-preflight";
import {
  assertSenaReliabilityCombinedRawRowsWithinLimits,
  assertSenaReliabilitySourceBytesWithinLimits,
  SENA_RELIABILITY_UNIVERSE_LIMITS,
  SenaReliabilityUniverseLimitError
} from "../reliability";
import {
  preflightXlsxWorkbook,
  SenaXlsxWorkbookPreflightError
} from "./reliability-xlsx-preflight";

export type SenaReliabilityUploadFile = {
  name: string;
  bytes: Buffer;
};

export type SenaReliabilityUploadDecodeBudget = {
  consumedRawRows?: number;
  consumedDecodedBytes?: number;
};

export type SenaReliabilityDecodedUpload = {
  rows: SenaImportRow[];
  warnings: string[];
  rawRowCount: number;
  decodedBytes: number;
};

function reliabilityDecodeBudgetValue(value: number | undefined, label: string, maximum: number) {
  const resolved = value ?? 0;
  if (!Number.isSafeInteger(resolved) || resolved < 0 || resolved > maximum) {
    throw new SenaReliabilityUniverseLimitError([{
      path: "files",
      rule: `${label}-at-most-${maximum}`,
      actual: Number.isSafeInteger(resolved) && resolved >= 0 ? resolved : "safe-integer-overflow",
      maximum
    }]);
  }
  return resolved;
}

function reliabilityXlsxPreflightError(
  error: SenaXlsxWorkbookPreflightError,
  consumedRawRows: number,
  consumedDecodedBytes: number,
  aggregateExpandedLimitApplied: boolean
) {
  if (error.kind === "data-rows") {
    return new SenaReliabilityUniverseLimitError([{
      path: "annotations",
      rule: `raw-row-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows}`,
      actual: consumedRawRows + error.actual,
      maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows
    }]);
  }
  if (error.kind === "entries") {
    return new SenaReliabilityUniverseLimitError([{
      path: "files",
      rule: `xlsx-archive-entry-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.xlsxArchiveEntries}`,
      actual: error.actual,
      maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.xlsxArchiveEntries
    }]);
  }
  if (error.kind === "worksheets") {
    return new SenaReliabilityUniverseLimitError([{
      path: "files",
      rule: `xlsx-worksheet-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.xlsxWorksheets}`,
      actual: error.actual,
      maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.xlsxWorksheets
    }]);
  }
  const maximum = aggregateExpandedLimitApplied
    ? SENA_RELIABILITY_UNIVERSE_LIMITS.aggregateSourceBytes
    : SENA_RELIABILITY_UNIVERSE_LIMITS.sourceBytes;
  return new SenaReliabilityUniverseLimitError([{
    path: "files",
    rule: aggregateExpandedLimitApplied
      ? `aggregate-decoded-source-byte-count-at-most-${maximum}`
      : `decoded-source-byte-count-at-most-${maximum}`,
    actual: aggregateExpandedLimitApplied ? consumedDecodedBytes + error.actual : error.actual,
    maximum
  }]);
}

/**
 * Picks the server parser for one reliability upload. This module is kept out
 * of the browser import graph because XLSX admission uses Node streams and must
 * complete before the regular ExcelJS reader can materialize a workbook.
 * Direct and queued reliability runs share this exact decoder.
 */
export async function readSenaReliabilityUploadRows(
  file: SenaReliabilityUploadFile,
  budget: SenaReliabilityUploadDecodeBudget = {}
): Promise<SenaReliabilityDecodedUpload> {
  const consumedRawRows = reliabilityDecodeBudgetValue(
    budget.consumedRawRows,
    "raw-row-count",
    SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows
  );
  const consumedDecodedBytes = reliabilityDecodeBudgetValue(
    budget.consumedDecodedBytes,
    "aggregate-decoded-source-byte-count",
    SENA_RELIABILITY_UNIVERSE_LIMITS.aggregateSourceBytes
  );
  assertSenaReliabilitySourceBytesWithinLimits([file.bytes.byteLength], "files");
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".xlsx") &&
    file.bytes.byteLength > SENA_RELIABILITY_UNIVERSE_LIMITS.aggregateSourceBytes - consumedDecodedBytes) {
    throw new SenaReliabilityUniverseLimitError([{
      path: "files",
      rule: `aggregate-decoded-source-byte-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.aggregateSourceBytes}`,
      actual: consumedDecodedBytes + file.bytes.byteLength,
      maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.aggregateSourceBytes
    }]);
  }
  if (lower.endsWith(".xlsx")) {
    const remainingRows = SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows - consumedRawRows;
    const remainingAggregateDecodedBytes = SENA_RELIABILITY_UNIVERSE_LIMITS.aggregateSourceBytes - consumedDecodedBytes;
    const aggregateExpandedLimitApplied = remainingAggregateDecodedBytes < SENA_RELIABILITY_UNIVERSE_LIMITS.sourceBytes;
    let archivePreflight;
    try {
      archivePreflight = await preflightXlsxWorkbook(file.bytes, {
        maximumEntries: SENA_RELIABILITY_UNIVERSE_LIMITS.xlsxArchiveEntries,
        maximumWorksheets: SENA_RELIABILITY_UNIVERSE_LIMITS.xlsxWorksheets,
        maximumDataRows: remainingRows,
        maximumUncompressedBytes: Math.min(
          SENA_RELIABILITY_UNIVERSE_LIMITS.sourceBytes,
          remainingAggregateDecodedBytes
        )
      });
    } catch (error) {
      if (error instanceof SenaXlsxWorkbookPreflightError) {
        throw reliabilityXlsxPreflightError(
          error,
          consumedRawRows,
          consumedDecodedBytes,
          aggregateExpandedLimitApplied
        );
      }
      throw error;
    }
    const workbook = await readXlsxWorkbookRows(file.bytes);
    // The streaming preflight counts every worksheet row object, including
    // sparse/style-only rows ExcelJS may later omit. The semantic rows can
    // therefore never consume more of the global budget than was admitted.
    const semanticRawRowCount = assertSenaReliabilityCombinedRawRowsWithinLimits(workbook.map((sheet) => sheet.rows));
    if (semanticRawRowCount > archivePreflight.dataRows) {
      throw new Error("XLSX reliability row preflight disagreed with the workbook decoder.");
    }
    return {
      rows: workbook.flatMap((sheet) => sheet.rows),
      warnings: [],
      rawRowCount: archivePreflight.dataRows,
      decodedBytes: archivePreflight.uncompressedBytes
    };
  }
  if (lower.endsWith(".xls")) {
    throw new Error(`${file.name}: legacy .xls reliability uploads are not accepted. Save the workbook as .xlsx, CSV, or JSON before uploading.`);
  }
  if (lower.endsWith(".json")) {
    const text = file.bytes.toString("utf8");
    const structural = preflightSenaReliabilityJsonText(text, {
      mode: "source",
      maximumRows: SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows,
      maximumSources: SENA_RELIABILITY_UNIVERSE_LIMITS.sources,
      consumedRows: consumedRawRows
    });
    const parsed = JSON.parse(text);
    const record = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
    const rawRowGroups = Array.isArray(parsed)
      ? [parsed]
      : [record?.annotations, record?.rows, record?.data].filter(Array.isArray);
    if (record && rawRowGroups.length === 0) rawRowGroups.push([record]);
    const semanticRawRowCount = assertSenaReliabilityCombinedRawRowsWithinLimits(rawRowGroups);
    // Preserve one canonical semantic table while admission above counts every
    // supplied alias, including precedence-ignored arrays.
    const rawRows = rawRowGroups[0] ?? [];
    return {
      rows: rawRows.filter((row) => typeof row === "object" && row !== null && !Array.isArray(row)),
      warnings: [],
      // A root annotation object is one semantic row even though it has no
      // structural row array. Every materializing array was already counted
      // before JSON.parse; this bounded fallback preserves the legacy shape.
      rawRowCount: Math.max(structural.rawRows, semanticRawRowCount),
      decodedBytes: file.bytes.byteLength
    };
  }
  const parsed = parseSenaCsv(file.bytes.toString("utf8"), {
    maximumDataRows: SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows - consumedRawRows,
    onDataRowLimitExceeded(actual) {
      throw new SenaReliabilityUniverseLimitError([{
        path: "annotations",
        rule: `raw-row-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows}`,
        actual: consumedRawRows + actual,
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
    rawRowCount,
    decodedBytes: file.bytes.byteLength
  };
}

/** Sequentially decodes files against one shared row/expanded-byte budget. */
export async function readSenaReliabilityUploadFiles(
  files: readonly SenaReliabilityUploadFile[]
): Promise<SenaReliabilityDecodedUpload[]> {
  assertSenaReliabilitySourceBytesWithinLimits(files.map((file) => file.bytes.byteLength), "files");
  const parsedFiles: SenaReliabilityDecodedUpload[] = [];
  let consumedRawRows = 0;
  let consumedDecodedBytes = 0;
  for (const file of files) {
    const parsed = await readSenaReliabilityUploadRows(file, {
      consumedRawRows,
      consumedDecodedBytes
    });
    consumedRawRows += parsed.rawRowCount;
    consumedDecodedBytes += parsed.decodedBytes;
    parsedFiles.push(parsed);
  }
  return parsedFiles;
}
