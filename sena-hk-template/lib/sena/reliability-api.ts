import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { createHash } from "node:crypto";
import {
  assertSenaReliabilityCombinedRawRowsWithinLimits,
  assertSenaReliabilitySourceBytesWithinLimits,
  assertSenaReliabilitySourceCountWithinLimits,
  buildSenaReliabilityDashboard,
  parseCoderAnnotationsFromRows,
  reliabilityDashboardToReview,
  type SenaCoderAnnotation,
  type SenaReliabilityDashboard,
  type SenaSkippedCoderCell
} from "./reliability";
import type { SenaCodingReliabilityReview } from "./types";
import type { SenaImportRow } from "./import";
import { normalizeSenaReliabilityReviewer } from "./reliability-queue-reviewer";

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

function rawRowsFrom(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isImportRow(value)) return [];
  const nested = [value.annotations, value.rows, value.data].find(Array.isArray);
  return Array.isArray(nested) ? nested : [value];
}

function allRawRowGroupsFrom(value: unknown): unknown[][] {
  if (Array.isArray(value)) return [value];
  if (!isImportRow(value)) return [];
  const nested = [value.annotations, value.rows, value.data].filter(Array.isArray);
  return nested.length > 0 ? nested : [[value]];
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

function assertJsonSourcesWithinLimits(
  payload: SenaReliabilityJsonRequest,
  limits: { sourceBytes?: number } = {}
) {
  const fileValues = Array.isArray(payload.files) ? payload.files : [];
  const inlineValues = [
    ["annotations", payload.annotations],
    ["rows", payload.rows],
    ["data", payload.data]
  ].filter((entry): entry is [string, unknown] => entry[1] !== undefined);
  const sourceCount = fileValues.length + inlineValues.length || 1;
  const admissionPath = fileValues.length > 0 ? "files" as const : "annotations" as const;
  // Count before mapping source envelopes so an attacker cannot create the
  // very serialization/source-summary fan-out this guard is intended to stop.
  assertSenaReliabilitySourceCountWithinLimits(sourceCount, admissionPath);

  const admissionSources: Array<{ name: string; rawValue: unknown; rawRowGroups: unknown[][] }> = [];
  for (let index = 0; index < fileValues.length; index += 1) {
    const value = fileValues[index];
    const record = isImportRow(value) ? value : {};
    admissionSources.push({
      name: scalar(record.name) || `reliability-json-batch-${index + 1}.json`,
      rawValue: value,
      rawRowGroups: allRawRowGroupsFrom(record)
    });
  }
  for (const [key, value] of inlineValues) {
    admissionSources.push({
      name: scalar(payload.sourceName) || `reliability-json-${key}.json`,
      rawValue: value,
      rawRowGroups: allRawRowGroupsFrom(value)
    });
  }
  if (admissionSources.length === 0) {
    admissionSources.push({
      name: scalar(payload.sourceName) || "reliability-json-annotations.json",
      rawValue: [],
      rawRowGroups: [[]]
    });
  }

  const rawRowGroups: unknown[][] = [];
  for (const source of admissionSources) {
    for (const rows of source.rawRowGroups) rawRowGroups.push(rows);
  }
  // Count every supplied alias/file group, including groups that semantic
  // precedence will not select, before filtering any row values.
  assertSenaReliabilityCombinedRawRowsWithinLimits(rawRowGroups);
  assertSenaReliabilitySourceBytesWithinLimits(
    admissionSources.map((source) => Buffer.byteLength(stableStringify({
      schemaVersion: SENA_SCHEMA_VERSIONS.reliabilityJsonSource,
      name: source.name,
      // Byte admission covers the complete supplied source envelope, including
      // invalid alias values and fields semantic row selection will ignore.
      rows: source.rawValue
    }), "utf8")),
    admissionPath,
    limits
  );
}

function admittedNamedSources(payload: SenaReliabilityJsonRequest) {
  assertJsonSourcesWithinLimits(payload);
  if (Array.isArray(payload.files) && payload.files.length > 0) {
    const rawSources: Array<{ name: string; rawRows: unknown[] }> = [];
    for (let index = 0; index < payload.files.length; index += 1) {
      const file = payload.files[index];
      const record = isImportRow(file) ? file : {};
      const name = scalar(record.name) || `reliability-json-batch-${index + 1}.json`;
      rawSources.push({ name, rawRows: rawRowsFrom(record) });
    }
    return rawSources.map((source) => ({
      name: source.name,
      rows: source.rawRows.filter(isImportRow)
    }));
  }

  const rawSources = [{
    name: scalar(payload.sourceName) || "reliability-json-annotations.json",
    rawRows: rawRowsFrom(payload.annotations ?? payload.rows ?? payload.data)
  }];
  return rawSources.map((source) => ({
    name: source.name,
    rows: source.rawRows.filter(isImportRow)
  }));
}

export function assertSenaReliabilityJsonRequestWithinLimits(
  payload: SenaReliabilityJsonRequest,
  limits: { sourceBytes?: number } = {}
) {
  assertJsonSourcesWithinLimits(payload, limits);
}

export function prepareSenaReliabilityJsonRequest(
  payload: SenaReliabilityJsonRequest,
  options: { defaultReviewer?: string } = {}
): SenaPreparedReliabilityRunInput {
  const sources = admittedNamedSources(payload).filter((source) => source.rows.length > 0);
  const warnings = sources.length === 0 ? ["JSON reliability request did not include annotation rows."] : [];
  const rows = sources.flatMap((source) => source.rows);
  const parsed = parseCoderAnnotationsFromRows(rows);
  const dashboard = buildSenaReliabilityDashboard(parsed.annotations, { skippedCells: parsed.skippedCells });
  const dashboardWithWarnings = {
    ...dashboard,
    warnings: [...warnings, ...parsed.warnings, ...dashboard.warnings]
  };
  const reviewer = normalizeSenaReliabilityReviewer(
    payload.reviewer,
    options.defaultReviewer?.trim() || "SENA reliability API"
  );

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
