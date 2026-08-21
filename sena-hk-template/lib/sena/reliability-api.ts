import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { createHash } from "node:crypto";
import {
  buildSenaReliabilityDashboard,
  parseCoderAnnotationsFromRows,
  reliabilityDashboardToReview,
  type SenaCoderAnnotation,
  type SenaReliabilityDashboard,
  type SenaSkippedCoderCell
} from "./reliability";
import type { SenaCodingReliabilityReview } from "./types";
import type { SenaImportRow } from "./import";

export type SenaReliabilityJsonRequest = {
  schemaVersion?: typeof SENA_SCHEMA_VERSIONS.reliabilityJsonRequest;
  teamId?: unknown;
  projectId?: unknown;
  projectVersion?: unknown;
  reviewer?: unknown;
  sourceName?: unknown;
  annotations?: unknown;
  rows?: unknown;
  data?: unknown;
  files?: unknown;
};

export type SenaPreparedReliabilityRunInput = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.reliabilityPreparedInput;
  source: "json-annotations";
  teamId?: string;
  projectId?: string;
  projectVersion?: number;
  reviewer: string;
  fileCount: number;
  annotationCount: number;
  annotations: SenaCoderAnnotation[];
  skippedCells: SenaSkippedCoderCell[];
  inputFiles: Array<{ name: string; size: number; sha256: string }>;
  dashboard: SenaReliabilityDashboard;
  reviewPatch: Partial<SenaCodingReliabilityReview>;
  warnings: string[];
};

function scalar(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isImportRow(value: unknown): value is SenaImportRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rowsFrom(value: unknown): SenaImportRow[] {
  if (Array.isArray(value)) return value.filter(isImportRow);
  if (!isImportRow(value)) return [];
  const nested = [value.annotations, value.rows, value.data].find(Array.isArray);
  return Array.isArray(nested) ? nested.filter(isImportRow) : [value];
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sourceSummary(name: string, rows: SenaImportRow[]) {
  const body = stableStringify({
    schemaVersion: SENA_SCHEMA_VERSIONS.reliabilityJsonSource,
    name,
    rows
  });
  return {
    name,
    size: Buffer.byteLength(body, "utf8"),
    sha256: createHash("sha256").update(body).digest("hex")
  };
}

function namedSources(payload: SenaReliabilityJsonRequest) {
  if (Array.isArray(payload.files) && payload.files.length > 0) {
    return payload.files.map((file, index) => {
      const record = isImportRow(file) ? file : {};
      const name = scalar(record.name) || `reliability-json-batch-${index + 1}.json`;
      return { name, rows: rowsFrom(record) };
    });
  }

  return [{
    name: scalar(payload.sourceName) || "reliability-json-annotations.json",
    rows: rowsFrom(payload.annotations ?? payload.rows ?? payload.data)
  }];
}

export function prepareSenaReliabilityJsonRequest(
  payload: SenaReliabilityJsonRequest,
  options: { defaultReviewer?: string } = {}
): SenaPreparedReliabilityRunInput {
  const sources = namedSources(payload).filter((source) => source.rows.length > 0);
  const warnings = sources.length === 0 ? ["JSON reliability request did not include annotation rows."] : [];
  const rows = sources.flatMap((source) => source.rows);
  const parsed = parseCoderAnnotationsFromRows(rows);
  const dashboard = buildSenaReliabilityDashboard(parsed.annotations, { skippedCells: parsed.skippedCells });
  const dashboardWithWarnings = {
    ...dashboard,
    warnings: [...warnings, ...parsed.warnings, ...dashboard.warnings]
  };
  const reviewer = scalar(payload.reviewer) || options.defaultReviewer?.trim() || "SENA reliability API";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.reliabilityPreparedInput,
    source: "json-annotations",
    teamId: scalar(payload.teamId) || undefined,
    projectId: scalar(payload.projectId) || undefined,
    projectVersion: Number.isInteger(payload.projectVersion) ? Number(payload.projectVersion) : undefined,
    reviewer,
    fileCount: Math.max(1, sources.length),
    annotationCount: parsed.annotations.length,
    annotations: parsed.annotations,
    skippedCells: parsed.skippedCells,
    inputFiles: (sources.length > 0 ? sources : [{ name: "reliability-json-annotations.json", rows: [] }])
      .map((source) => sourceSummary(source.name, source.rows)),
    dashboard: dashboardWithWarnings,
    reviewPatch: reliabilityDashboardToReview(dashboardWithWarnings, reviewer),
    warnings: dashboardWithWarnings.warnings
  };
}
