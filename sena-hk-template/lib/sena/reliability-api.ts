import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { createHash } from "node:crypto";
import { compareSenaCanonicalText } from "./canonical-order.mjs";
import {
  assertSenaReliabilityCombinedRawRowsWithinLimits,
  assertSenaReliabilitySourceBytesWithinLimits,
  assertSenaReliabilitySourceCountWithinLimits,
  buildSenaReliabilityDashboard,
  parseCoderAnnotationsFromRows,
  reliabilityDashboardToReview,
  SenaReliabilitySourceInputError,
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

export type SenaReliabilityJsonQueueSourceKind = "file" | "annotations" | "rows" | "data";

export type SenaReliabilityJsonQueueSource = {
  kind: SenaReliabilityJsonQueueSourceKind;
  name: string;
  bytes: Buffer;
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
      .sort(([left], [right]) => compareSenaCanonicalText(left, right))
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

type SenaReliabilityJsonAdmissionSource = {
  kind: SenaReliabilityJsonQueueSourceKind;
  name: string;
  rawValue: unknown;
  rawRowGroups: unknown[][];
  supplied: boolean;
};

function jsonAdmissionSources(payload: SenaReliabilityJsonRequest) {
  const filesSupplied = Object.prototype.hasOwnProperty.call(payload, "files");
  if (filesSupplied && !Array.isArray(payload.files)) {
    throw new SenaReliabilitySourceInputError([{
      path: "files",
      rule: "file-array-required"
    }]);
  }
  const fileValues = filesSupplied ? payload.files as unknown[] : [];
  const inlineValues = [
    ["annotations", payload.annotations],
    ["rows", payload.rows],
    ["data", payload.data]
  ].filter((entry): entry is [Exclude<SenaReliabilityJsonQueueSourceKind, "file">, unknown] => entry[1] !== undefined);
  const sourceCount = fileValues.length + inlineValues.length || 1;
  const admissionPath = fileValues.length > 0 ? "files" as const : "annotations" as const;
  const sources: SenaReliabilityJsonAdmissionSource[] = [];
  for (let index = 0; index < fileValues.length; index += 1) {
    const value = fileValues[index];
    const record = isImportRow(value) ? value : {};
    sources.push({
      kind: "file",
      name: scalar(record.name) || `reliability-json-batch-${index + 1}.json`,
      rawValue: value,
      rawRowGroups: allRawRowGroupsFrom(record),
      supplied: true
    });
  }
  for (const [key, value] of inlineValues) {
    sources.push({
      kind: key,
      // Synchronous semantics have always summarized the selected legacy alias
      // under the annotations source name. Preserve that canonical identity in
      // queue envelopes so rows/data do not drift in name, bytes, or SHA-256.
      name: scalar(payload.sourceName) || "reliability-json-annotations.json",
      rawValue: value,
      rawRowGroups: allRawRowGroupsFrom(value),
      supplied: true
    });
  }
  if (sources.length === 0) {
    sources.push({
      kind: "annotations",
      name: scalar(payload.sourceName) || "reliability-json-annotations.json",
      rawValue: [],
      rawRowGroups: [[]],
      // An explicit empty files array is a supported empty JSON source. Carry
      // one canonical empty envelope through a local queue instead of silently
      // turning it into a missing-source error.
      supplied: filesSupplied
    });
  }
  return { admissionPath, sourceCount, sources };
}

function jsonSourceEnvelope(source: SenaReliabilityJsonAdmissionSource) {
  return stableStringify({
    schemaVersion: SENA_SCHEMA_VERSIONS.reliabilityJsonSource,
    name: source.name,
    // Byte admission covers the complete supplied source envelope, including
    // invalid alias values and fields semantic row selection will ignore.
    rows: source.rawValue
  });
}

function assertJsonSourcesWithinLimits(
  payload: SenaReliabilityJsonRequest,
  limits: { sourceBytes?: number } = {}
) {
  const { admissionPath, sourceCount, sources } = jsonAdmissionSources(payload);
  // Count before mapping source envelopes so an attacker cannot create the
  // very serialization/source-summary fan-out this guard is intended to stop.
  assertSenaReliabilitySourceCountWithinLimits(sourceCount, admissionPath);

  const rawRowGroups: unknown[][] = [];
  for (const source of sources) {
    for (const rows of source.rawRowGroups) rawRowGroups.push(rows);
  }
  // Count every supplied alias/file group, including groups that semantic
  // precedence will not select, before filtering any row values.
  assertSenaReliabilityCombinedRawRowsWithinLimits(rawRowGroups);
  assertSenaReliabilitySourceBytesWithinLimits(
    sources.map((source) => Buffer.byteLength(jsonSourceEnvelope(source), "utf8")),
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

/**
 * Serializes one encrypted local-queue upload per admitted logical JSON source.
 * The bytes are the exact envelope used for byte admission, so queue transport
 * cannot add an unbudgeted wrapper or flatten away invalid/skipped raw rows.
 */
export function buildSenaReliabilityJsonQueueSources(
  payload: SenaReliabilityJsonRequest,
  limits: { sourceBytes?: number } = {}
): SenaReliabilityJsonQueueSource[] {
  assertJsonSourcesWithinLimits(payload, limits);
  return jsonAdmissionSources(payload).sources
    .filter((source) => source.supplied)
    .map((source) => ({
      kind: source.kind,
      name: source.name,
      bytes: Buffer.from(jsonSourceEnvelope(source), "utf8")
    }));
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
