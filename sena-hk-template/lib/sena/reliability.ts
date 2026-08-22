import { SENA_LEGACY_SCHEMA_VERSIONS, SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { parseSenaCsv, type SenaImportRow } from "./import";
import type {
  SenaCodingReliabilityMachineEvidence,
  SenaCodingReliabilityReview,
  SenaProjectSnapshot,
  SenaReliabilityClaimEligibility,
  SenaReliabilityClaimEligibilityInputs,
  SenaReliabilityEstimationStatus,
  SenaReliabilityPairEstimate,
  SenaReliabilityProjectBinding
} from "./types";

export type { SenaReliabilityClaimEligibility, SenaReliabilityEstimationStatus } from "./types";

export type SenaCoderAnnotation = {
  coderId: string;
  itemId: string;
  codeId: string;
  value: boolean;
};

export type SenaPairwiseKappa = SenaReliabilityPairEstimate;

export type SenaReliabilityDisagreement = {
  itemId: string;
  codeId: string;
  values: Record<string, boolean>;
};

export type SenaCodeReliabilityDiagnostic = {
  codeId: string;
  unitCount: number;
  positiveAssignments: number;
  disagreementCount: number;
  agreementRate: number;
  coderPositiveRates: Record<string, number>;
  pairwiseCohenKappa: SenaPairwiseKappa[];
};

export type SenaReliabilityDerivationEvidence = {
  hashAlgorithm: "sena-stable-fnv1a32/v1";
  annotationCoverageHash: string;
  skippedCellCoverageHash: string;
  annotations: SenaCoderAnnotation[];
  skippedCells: SenaSkippedCoderCell[];
};

export type SenaReliabilityDashboard = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.codingReliabilityDashboard;
  sourceSchemaVersion: typeof SENA_SCHEMA_VERSIONS.codingReliabilityDashboard | typeof SENA_LEGACY_SCHEMA_VERSIONS.codingReliabilityDashboard;
  status: SenaReliabilityEstimationStatus;
  coderCount: number;
  coderIds: string[];
  itemCount: number;
  codeCount: number;
  binaryUnitCount: number;
  pairwiseCohenKappa: SenaPairwiseKappa[];
  codeDiagnostics: SenaCodeReliabilityDiagnostic[];
  meanPairwiseKappaStatus: SenaReliabilityEstimationStatus;
  meanPairwiseKappa: number | null;
  krippendorffAlphaNominalStatus: SenaReliabilityEstimationStatus;
  krippendorffAlphaNominalRaw: number | null;
  krippendorffAlphaNominal: number | null;
  claimEligibilityInputs: SenaReliabilityClaimEligibilityInputs;
  claimEligibility: SenaReliabilityClaimEligibility;
  disagreementCount: number;
  adjudicationQueue: SenaReliabilityDisagreement[];
  derivationEvidence?: SenaReliabilityDerivationEvidence;
  interpretation: string;
  warnings: string[];
  projectBinding?: SenaReliabilityProjectBinding;
};

export type SenaPairwiseKappaV1 = {
  coderA: string;
  coderB: string;
  units: number;
  observedAgreement: number;
  expectedAgreement: number;
  kappa: number;
};

export type SenaCodeReliabilityDiagnosticV1 = {
  codeId: string;
  unitCount: number;
  positiveAssignments: number;
  disagreementCount: number;
  agreementRate: number;
  coderPositiveRates: Record<string, number>;
  pairwiseCohenKappa: SenaPairwiseKappaV1[];
};

export type SenaReliabilityDashboardV1 = {
  schemaVersion: typeof SENA_LEGACY_SCHEMA_VERSIONS.codingReliabilityDashboard;
  coderCount: number;
  itemCount: number;
  codeCount: number;
  binaryUnitCount: number;
  pairwiseCohenKappa: SenaPairwiseKappaV1[];
  codeDiagnostics: SenaCodeReliabilityDiagnosticV1[];
  meanPairwiseKappa: number;
  krippendorffAlphaNominal: number;
  disagreementCount: number;
  adjudicationQueue: SenaReliabilityDisagreement[];
  interpretation: string;
  warnings: string[];
};

export type SenaReliabilityDashboardReadModel = SenaReliabilityDashboard | SenaReliabilityDashboardV1;

export type SenaReliabilityProjectBindingIssue = {
  path: string;
  code: "unknown-item" | "unknown-code" | "duplicate-cell" | "invalid-project-context" | "binding-mismatch" | "derived-metrics-mismatch";
};

/**
 * Reliability is defined over the complete item-by-code universe, including
 * observed false cells. These caps bound that declared semantics before any
 * cartesian-product or value-row allocation can occur.
 */
export const SENA_RELIABILITY_UNIVERSE_LIMITS = Object.freeze({
  rawRows: 200_000,
  sources: 100,
  sourceBytes: 25 * 1024 * 1024,
  aggregateSourceBytes: 100 * 1024 * 1024,
  // Transport envelopes include JSON property names or multipart boundaries
  // in addition to the admitted 100 MiB aggregate source universe.
  requestBytes: 128 * 1024 * 1024,
  // 128 MiB / 16 KiB. This independently bounds reader iterations and the
  // maximum number of retained/replayed body-chunk objects; zero-byte chunks
  // consume the budget even though they are not retained for replay.
  requestChunks: 8_192,
  xlsxArchiveEntries: 2_048,
  xlsxWorksheets: 100,
  xlsxRowIndex: 1_048_576,
  annotationRows: 200_000,
  binaryUnits: 50_000,
  assignmentCells: 200_000,
  // One global pair result is retained per unordered coder pair. This also
  // bounds the outer pair loops before any pair-result array is allocated.
  coderPairs: 2_000,
  // Covers every pair/coder fan-out verified in the core statistics below:
  // global and per-code Cohen projections/scans, per-code agreement pairs,
  // and Krippendorff rating collection plus every m-by-m loop check. Linear
  // input/result preparation is independently bounded by the surrounding raw
  // row, annotation, assignment-cell, binary-unit, and result-entry caps.
  algorithmWorkEvaluations: 10_000_000,
  // Each pair is retained once globally and once for every code diagnostic.
  pairwiseResultEntries: 100_000
});

export type SenaReliabilityUniverseLimitIssue = {
  path: "annotations" | "files" | "uploadIds";
  rule: string;
  actual: number | "safe-integer-overflow";
  maximum: number;
};

export class SenaReliabilityUniverseLimitError extends Error {
  readonly name = "SenaReliabilityUniverseLimitError";
  readonly status = 400;
  readonly code = "reliability_universe_limit_exceeded";
  readonly issues: SenaReliabilityUniverseLimitIssue[];

  constructor(issues: SenaReliabilityUniverseLimitIssue[]) {
    super("SENA coding-reliability input exceeds the supported analysis universe.");
    this.issues = [];
    for (const issue of issues) this.issues.push({ ...issue });
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      issues: this.issues
    };
  }
}

export type SenaReliabilitySourceInputIssue = {
  path: "sources" | "annotations" | "files" | "uploadIds";
  rule: "exactly-one-source-mode" | "file-array-required" | "file-value-required" |
    "non-empty-string-upload-id" | "valid-json-required" | "valid-multipart-required";
};

export class SenaReliabilitySourceInputError extends Error {
  readonly name = "SenaReliabilitySourceInputError";
  readonly status = 400;
  readonly code = "invalid_sena_reliability_sources";
  readonly issues: SenaReliabilitySourceInputIssue[];

  constructor(issues: SenaReliabilitySourceInputIssue[]) {
    super("SENA coding-reliability request sources are invalid.");
    this.issues = issues.map((issue) => ({ ...issue }));
  }
}

export function assertSenaReliabilitySingleSourceMode(input: {
  json: boolean;
  uploadPointers: boolean;
}) {
  if (input.json && input.uploadPointers) {
    throw new SenaReliabilitySourceInputError([{
      path: "sources",
      rule: "exactly-one-source-mode"
    }]);
  }
}

export function normalizeSenaReliabilityUploadIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new SenaReliabilitySourceInputError([{
      path: "uploadIds",
      rule: "non-empty-string-upload-id"
    }]);
  }
  assertSenaReliabilitySourceCountWithinLimits(value.length, "uploadIds");
  const normalized: string[] = [];
  for (const uploadId of value) {
    if (typeof uploadId !== "string" || uploadId.trim() === "") {
      throw new SenaReliabilitySourceInputError([{
        path: "uploadIds",
        rule: "non-empty-string-upload-id"
      }]);
    }
    normalized.push(uploadId.trim());
  }
  return normalized;
}

export type SenaReliabilityAnnotationValidationIssue = {
  path: string;
  code: "duplicate-cell" | "conflicting-cell";
};

export class SenaReliabilityAnnotationValidationError extends Error {
  readonly name = "SenaReliabilityAnnotationValidationError";
  readonly status = 400;
  readonly code = "invalid_sena_reliability_annotations";
  readonly issues: SenaReliabilityAnnotationValidationIssue[];

  constructor(issues: SenaReliabilityAnnotationValidationIssue[]) {
    super("SENA coding-reliability annotations contain duplicate coder-item-code cells.");
    this.issues = issues.map((issue) => ({ ...issue }));
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      issues: this.issues.map((issue) => ({ ...issue }))
    };
  }
}

function safeCardinalityProduct(left: number, right: number) {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < 0) return null;
  if (left !== 0 && right > Math.floor(Number.MAX_SAFE_INTEGER / left)) return null;
  return left * right;
}

function safeCardinalitySum(values: readonly number[]) {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - total) return null;
    total += value;
  }
  return total;
}

function safeUnorderedPairCount(count: number) {
  if (!Number.isSafeInteger(count) || count < 0) return null;
  if (count < 2) return 0;
  const left = count % 2 === 0 ? count / 2 : count;
  const right = count % 2 === 0 ? count - 1 : (count - 1) / 2;
  return safeCardinalityProduct(left, right);
}

export function assertSenaReliabilityRawRowsWithinLimits(
  rawRowCount: number,
  path: SenaReliabilityUniverseLimitIssue["path"] = "annotations"
) {
  if (!Number.isSafeInteger(rawRowCount) || rawRowCount < 0 || rawRowCount > SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows) {
    throw new SenaReliabilityUniverseLimitError([{
      path,
      rule: `raw-row-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows}`,
      actual: Number.isSafeInteger(rawRowCount) && rawRowCount >= 0 ? rawRowCount : "safe-integer-overflow",
      maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows
    }]);
  }
  return rawRowCount;
}

export function assertSenaReliabilityCombinedRawRowsWithinLimits(
  rowGroups: readonly { readonly length: number }[],
  path: SenaReliabilityUniverseLimitIssue["path"] = "annotations"
) {
  let total = 0;
  for (const rows of rowGroups) {
    const next = safeCardinalitySum([total, rows.length]);
    if (next === null) {
      throw new SenaReliabilityUniverseLimitError([{
        path,
        rule: `raw-row-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows}`,
        actual: "safe-integer-overflow",
        maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows
      }]);
    }
    total = next;
    if (total > SENA_RELIABILITY_UNIVERSE_LIMITS.rawRows) {
      return assertSenaReliabilityRawRowsWithinLimits(total, path);
    }
  }
  return assertSenaReliabilityRawRowsWithinLimits(total, path);
}

export function assertSenaReliabilitySourceCountWithinLimits(
  sourceCount: number,
  path: SenaReliabilityUniverseLimitIssue["path"]
) {
  if (!Number.isSafeInteger(sourceCount) || sourceCount < 0 || sourceCount > SENA_RELIABILITY_UNIVERSE_LIMITS.sources) {
    throw new SenaReliabilityUniverseLimitError([{
      path,
      rule: `source-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.sources}`,
      actual: Number.isSafeInteger(sourceCount) && sourceCount >= 0 ? sourceCount : "safe-integer-overflow",
      maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.sources
    }]);
  }
  return sourceCount;
}

export function assertSenaReliabilitySourceBytesWithinLimits(
  sourceSizes: readonly number[],
  path: SenaReliabilityUniverseLimitIssue["path"],
  limits: {
    sourceBytes?: number;
    aggregateSourceBytes?: number;
  } = {}
) {
  const sourceBytes = limits.sourceBytes ?? SENA_RELIABILITY_UNIVERSE_LIMITS.sourceBytes;
  const aggregateSourceBytes = limits.aggregateSourceBytes ?? SENA_RELIABILITY_UNIVERSE_LIMITS.aggregateSourceBytes;
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes < 0 ||
    !Number.isSafeInteger(aggregateSourceBytes) || aggregateSourceBytes < 0) {
    throw new SenaReliabilityUniverseLimitError([{
      path,
      rule: `source-byte-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.sourceBytes}`,
      actual: "safe-integer-overflow",
      maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.sourceBytes
    }]);
  }
  assertSenaReliabilitySourceCountWithinLimits(sourceSizes.length, path);
  let aggregateBytes = 0;
  for (const size of sourceSizes) {
    if (!Number.isSafeInteger(size) || size < 0 || size > sourceBytes) {
      throw new SenaReliabilityUniverseLimitError([{
        path,
        rule: `source-byte-count-at-most-${sourceBytes}`,
        actual: Number.isSafeInteger(size) && size >= 0 ? size : "safe-integer-overflow",
        maximum: sourceBytes
      }]);
    }
    const next = safeCardinalitySum([aggregateBytes, size]);
    if (next === null) {
      throw new SenaReliabilityUniverseLimitError([{
        path,
        rule: `aggregate-source-byte-count-at-most-${aggregateSourceBytes}`,
        actual: "safe-integer-overflow",
        maximum: aggregateSourceBytes
      }]);
    }
    aggregateBytes = next;
  }
  if (aggregateBytes > aggregateSourceBytes) {
    throw new SenaReliabilityUniverseLimitError([{
      path,
      rule: `aggregate-source-byte-count-at-most-${aggregateSourceBytes}`,
      actual: aggregateBytes,
      maximum: aggregateSourceBytes
    }]);
  }
  return aggregateBytes;
}

export function assertSenaReliabilityDeclaredRequestBytesWithinLimits(
  byteCount: number,
  path: "annotations" | "files",
  maximum = SENA_RELIABILITY_UNIVERSE_LIMITS.requestBytes
) {
  if (!Number.isSafeInteger(maximum) || maximum < 0 ||
    !Number.isSafeInteger(byteCount) || byteCount < 0 || byteCount > maximum) {
    throw new SenaReliabilityUniverseLimitError([{
      path,
      rule: `request-byte-count-at-most-${maximum}`,
      actual: Number.isSafeInteger(byteCount) && byteCount >= 0 ? byteCount : "safe-integer-overflow",
      maximum
    }]);
  }
}

export function assertSenaReliabilityRequestChunksWithinLimits(
  chunkCount: number,
  path: "annotations" | "files",
  maximum = SENA_RELIABILITY_UNIVERSE_LIMITS.requestChunks
) {
  if (!Number.isSafeInteger(maximum) || maximum < 0 ||
    !Number.isSafeInteger(chunkCount) || chunkCount < 0 || chunkCount > maximum) {
    throw new SenaReliabilityUniverseLimitError([{
      path,
      rule: `request-chunk-count-at-most-${maximum}`,
      actual: Number.isSafeInteger(chunkCount) && chunkCount >= 0 ? chunkCount : "safe-integer-overflow",
      maximum
    }]);
  }
}

export type SenaReliabilityAlgorithmWorkComponents = {
  globalCohenVectorProjections: number;
  globalCohenScans: number;
  perCodeCohenVectorProjections: number;
  perCodeCohenScans: number;
  perCodeAgreementPairEvaluations: number;
  krippendorffRatingCollectionPasses: number;
  krippendorffOrderedPairUpdates: number;
  krippendorffDiagonalPairChecks: number;
};

function senaReliabilityAlgorithmWork(input: {
  binaryUnits: number | null;
  assignmentCells: number | null;
  coderPairs: number | null;
  coderCount: number;
}): { components: SenaReliabilityAlgorithmWorkComponents; total: number } | null {
  if (input.binaryUnits === null || input.assignmentCells === null || input.coderPairs === null) return null;
  const pairwiseUnits = safeCardinalityProduct(input.coderPairs, input.binaryUnits);
  const orderedCoderPairs = Number.isSafeInteger(input.coderCount) && input.coderCount >= 0
    ? safeCardinalityProduct(input.coderCount, Math.max(0, input.coderCount - 1))
    : null;
  if (pairwiseUnits === null || orderedCoderPairs === null) return null;
  const globalCohenVectorProjections = safeCardinalityProduct(pairwiseUnits, 2);
  const perCodeCohenVectorProjections = safeCardinalityProduct(pairwiseUnits, 2);
  // krippendorffAlphaNominal performs map/filter/map over every coder value in
  // every binary unit before its m-by-m coincidence loop.
  const krippendorffRatingCollectionPasses = safeCardinalityProduct(input.assignmentCells, 3);
  const krippendorffOrderedPairUpdates = safeCardinalityProduct(orderedCoderPairs, input.binaryUnits);
  const krippendorffDiagonalPairChecks = safeCardinalityProduct(input.coderCount, input.binaryUnits);
  if (globalCohenVectorProjections === null || perCodeCohenVectorProjections === null ||
    krippendorffRatingCollectionPasses === null || krippendorffOrderedPairUpdates === null ||
    krippendorffDiagonalPairChecks === null) return null;
  const components: SenaReliabilityAlgorithmWorkComponents = {
    globalCohenVectorProjections,
    globalCohenScans: pairwiseUnits,
    perCodeCohenVectorProjections,
    perCodeCohenScans: pairwiseUnits,
    perCodeAgreementPairEvaluations: pairwiseUnits,
    krippendorffRatingCollectionPasses,
    krippendorffOrderedPairUpdates,
    krippendorffDiagonalPairChecks
  };
  const total = safeCardinalitySum(Object.values(components));
  return total === null ? null : { components, total };
}

export function assertSenaReliabilityUniverseWithinLimits(input: {
  itemCount: number;
  codeCount: number;
  coderCount: number;
}) {
  const binaryUnits = safeCardinalityProduct(input.itemCount, input.codeCount);
  const assignmentCells = binaryUnits === null
    ? null
    : safeCardinalityProduct(binaryUnits, input.coderCount);
  const coderPairs = safeUnorderedPairCount(input.coderCount);
  const algorithmWork = senaReliabilityAlgorithmWork({
    binaryUnits,
    assignmentCells,
    coderPairs,
    coderCount: input.coderCount
  });
  const codeLayers = Number.isSafeInteger(input.codeCount) && input.codeCount >= 0 && input.codeCount < Number.MAX_SAFE_INTEGER
    ? input.codeCount + 1
    : null;
  const pairwiseResultEntries = coderPairs === null || codeLayers === null
    ? null
    : safeCardinalityProduct(coderPairs, codeLayers);
  const issues: SenaReliabilityUniverseLimitIssue[] = [];
  if (binaryUnits === null || binaryUnits > SENA_RELIABILITY_UNIVERSE_LIMITS.binaryUnits) {
    issues.push({
      path: "annotations",
      rule: `binary-unit-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.binaryUnits}`,
      actual: binaryUnits ?? "safe-integer-overflow",
      maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.binaryUnits
    });
  } else if (
    assignmentCells === null
    || assignmentCells > SENA_RELIABILITY_UNIVERSE_LIMITS.assignmentCells
  ) {
    issues.push({
      path: "annotations",
      rule: `assignment-cell-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.assignmentCells}`,
      actual: assignmentCells ?? "safe-integer-overflow",
      maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.assignmentCells
    });
  }
  if (issues.length === 0 && (coderPairs === null || coderPairs > SENA_RELIABILITY_UNIVERSE_LIMITS.coderPairs)) {
    issues.push({
      path: "annotations",
      rule: `coder-pair-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.coderPairs}`,
      actual: coderPairs ?? "safe-integer-overflow",
      maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.coderPairs
    });
  }
  // Surface arithmetic overflow even when a stricter cardinality issue already
  // exists. Otherwise an implementation change could make this work estimate
  // unsafe while tests only observe the earlier cap.
  if (algorithmWork === null || (
    issues.length === 0 && algorithmWork.total > SENA_RELIABILITY_UNIVERSE_LIMITS.algorithmWorkEvaluations
  )) {
    issues.push({
      path: "annotations",
      rule: `algorithm-work-evaluation-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.algorithmWorkEvaluations}`,
      actual: algorithmWork?.total ?? "safe-integer-overflow",
      maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.algorithmWorkEvaluations
    });
  }
  if (issues.length === 0 && (
    pairwiseResultEntries === null
    || pairwiseResultEntries > SENA_RELIABILITY_UNIVERSE_LIMITS.pairwiseResultEntries
  )) {
    issues.push({
      path: "annotations",
      rule: `pairwise-result-entry-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.pairwiseResultEntries}`,
      actual: pairwiseResultEntries ?? "safe-integer-overflow",
      maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.pairwiseResultEntries
    });
  }
  if (issues.length > 0) throw new SenaReliabilityUniverseLimitError(issues);
  return {
    binaryUnits,
    assignmentCells,
    coderPairs,
    algorithmWorkEvaluations: algorithmWork?.total ?? null,
    algorithmWorkComponents: algorithmWork?.components ?? null,
    pairwiseResultEntries
  };
}

export function preflightSenaReliabilityAnnotations(annotations: readonly SenaCoderAnnotation[]) {
  if (annotations.length > SENA_RELIABILITY_UNIVERSE_LIMITS.annotationRows) {
    throw new SenaReliabilityUniverseLimitError([{
      path: "annotations",
      rule: `annotation-row-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.annotationRows}`,
      actual: annotations.length,
      maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.annotationRows
    }]);
  }
  const coderIds = new Set<string>();
  const itemIds = new Set<string>();
  const codeIds = new Set<string>();
  for (const annotation of annotations) {
    const { coderId, itemId, codeId } = annotation;
    coderIds.add(coderId);
    itemIds.add(itemId);
    codeIds.add(codeId);
  }
  const cardinality = assertSenaReliabilityUniverseWithinLimits({
    itemCount: itemIds.size,
    codeCount: codeIds.size,
    coderCount: coderIds.size
  });
  const cells = new Map<string, boolean>();
  for (const [index, annotation] of annotations.entries()) {
    const { coderId, itemId, codeId, value } = annotation;
    const cell = canonicalTupleKey([coderId, itemId, codeId]);
    const previousValue = cells.get(cell);
    if (previousValue !== undefined) {
      throw new SenaReliabilityAnnotationValidationError([{
        path: `annotations.${index}`,
        code: previousValue === value ? "duplicate-cell" : "conflicting-cell"
      }]);
    }
    cells.set(cell, value);
  }
  return {
    coders: Array.from(coderIds).sort(),
    items: Array.from(itemIds).sort(),
    codes: Array.from(codeIds).sort(),
    ...cardinality
  };
}

export class SenaReliabilityProjectBindingError extends Error {
  readonly issues: SenaReliabilityProjectBindingIssue[];

  constructor(issues: SenaReliabilityProjectBindingIssue[]) {
    super("SENA reliability annotations do not match the current project snapshot.");
    this.name = "SenaReliabilityProjectBindingError";
    this.issues = issues.map((issue) => ({ ...issue }));
  }

  toJSON() {
    return { name: this.name, message: this.message, issues: this.issues };
  }
}

function stableBindingValue(value: unknown): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return `{"$senaNonFinite":${JSON.stringify(Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity")}}`;
  }
  if (Array.isArray(value)) return `[${value.map(stableBindingValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableBindingValue(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalTupleKey(parts: readonly string[]) {
  return parts.map((part) => `${part.length}:${part}`).join("");
}

function reliabilityBindingHash(value: unknown) {
  const text = stableBindingValue(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `0x${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function sortedUnique(values: string[]) {
  return Array.from(new Set(values)).sort();
}

function canonicalAnnotationCoverage(annotations: SenaCoderAnnotation[]) {
  return annotations.map((annotation) => ({ ...annotation })).sort((left, right) => (
    left.coderId.localeCompare(right.coderId) ||
    left.itemId.localeCompare(right.itemId) ||
    left.codeId.localeCompare(right.codeId) ||
    Number(left.value) - Number(right.value)
  ));
}

function canonicalSkippedCellCoverage(skippedCells: SenaSkippedCoderCell[]) {
  const byCoder = new Map<string, Map<string, Set<string>>>();
  for (const cell of skippedCells) {
    let byItem = byCoder.get(cell.coderId);
    if (!byItem) {
      byItem = new Map();
      byCoder.set(cell.coderId, byItem);
    }
    let codeIds = byItem.get(cell.itemId);
    if (!codeIds) {
      codeIds = new Set();
      byItem.set(cell.itemId, codeIds);
    }
    for (const codeId of cell.codeIds) codeIds.add(codeId);
  }
  const coverage: SenaSkippedCoderCell[] = [];
  for (const [coderId, byItem] of byCoder) {
    for (const [itemId, codeIds] of byItem) {
      coverage.push({ coderId, itemId, codeIds: sortedUnique(Array.from(codeIds)) });
    }
  }
  return coverage.sort((left, right) => (
    left.coderId.localeCompare(right.coderId) ||
    left.itemId.localeCompare(right.itemId)
  ));
}

function buildReliabilityDerivationEvidence(
  annotations: SenaCoderAnnotation[],
  skippedCells: SenaSkippedCoderCell[]
): SenaReliabilityDerivationEvidence {
  const canonicalAnnotations = canonicalAnnotationCoverage(annotations);
  const canonicalSkippedCells = canonicalSkippedCellCoverage(skippedCells);
  return {
    hashAlgorithm: "sena-stable-fnv1a32/v1",
    annotationCoverageHash: reliabilityBindingHash(canonicalAnnotations),
    skippedCellCoverageHash: reliabilityBindingHash(canonicalSkippedCells),
    annotations: canonicalAnnotations,
    skippedCells: canonicalSkippedCells
  };
}

export function senaReliabilityAuthoritativeDataset(snapshot: SenaProjectSnapshot) {
  return snapshot.source.sourceDataset ?? snapshot.dataset;
}

export function senaReliabilitySnapshotFingerprint(snapshot: SenaProjectSnapshot) {
  return reliabilityBindingHash({
    schemaVersion: snapshot.schemaVersion,
    dataset: senaReliabilityAuthoritativeDataset(snapshot),
    activeTemporalWindow: snapshot.source.activeTemporalWindow,
    buildOptions: snapshot.reproducibility.buildOptions
  });
}

export function bindSenaReliabilityAnnotationsToProject(
  annotations: SenaCoderAnnotation[],
  project: {
    projectId: string;
    projectVersion: number;
    snapshot: SenaProjectSnapshot;
    skippedCells?: SenaSkippedCoderCell[];
  }
): { annotations: SenaCoderAnnotation[]; binding: SenaReliabilityProjectBinding } {
  const issues: SenaReliabilityProjectBindingIssue[] = [];
  if (!project.projectId.trim() || !Number.isInteger(project.projectVersion) || project.projectVersion < 1) {
    issues.push({ path: "project", code: "invalid-project-context" });
  }
  const authoritativeDataset = senaReliabilityAuthoritativeDataset(project.snapshot);
  const codebookUniverse = authoritativeDataset.codebook
    .map((code) => ({ id: code.id, label: code.label }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const exactCodes = new Map(codebookUniverse.map((code) => [code.id, code.id]));
  const aliases = new Map<string, string | null>();
  for (const code of codebookUniverse) {
    for (const alias of [code.id.toLowerCase(), code.label.trim().toLowerCase()]) {
      if (!alias) continue;
      const existing = aliases.get(alias);
      aliases.set(alias, existing === undefined || existing === code.id ? code.id : null);
    }
  }
  const itemUniverse = [
    ...authoritativeDataset.utterances.map((item) => ({ id: item.id, kind: "utterance" as const })),
    ...authoritativeDataset.coded_segments.map((item) => ({ id: item.segmentId, kind: "coded-segment" as const }))
  ].sort((left, right) => left.id.localeCompare(right.id) || left.kind.localeCompare(right.kind));
  const itemIds = new Set(itemUniverse.map((item) => item.id));
  const canonical: SenaCoderAnnotation[] = [];
  const cells = new Set<string>();
  annotations.forEach((annotation, index) => {
    if (!itemIds.has(annotation.itemId)) {
      issues.push({ path: `annotations.${index}.itemId`, code: "unknown-item" });
    }
    const canonicalCode = exactCodes.get(annotation.codeId) ?? aliases.get(annotation.codeId.trim().toLowerCase());
    if (!canonicalCode) {
      issues.push({ path: `annotations.${index}.codeId`, code: "unknown-code" });
      return;
    }
    const normalized = { ...annotation, codeId: canonicalCode };
    const cell = canonicalTupleKey([normalized.coderId, normalized.itemId, normalized.codeId]);
    if (cells.has(cell)) {
      issues.push({ path: `annotations.${index}`, code: "duplicate-cell" });
    }
    cells.add(cell);
    canonical.push(normalized);
  });
  if (issues.length > 0) throw new SenaReliabilityProjectBindingError(issues);

  const annotationCoverage = canonicalAnnotationCoverage(canonical);
  const skippedCellCoverage = (project.skippedCells ?? []).map((cell, index) => {
    if (!itemIds.has(cell.itemId)) {
      issues.push({ path: `skippedCells.${index}.itemId`, code: "unknown-item" });
    }
    const codeIds = sortedUnique(cell.codeIds.map((codeId, codeIndex) => {
      const canonicalCode = exactCodes.get(codeId) ?? aliases.get(codeId.trim().toLowerCase());
      if (!canonicalCode) {
        issues.push({ path: `skippedCells.${index}.codeIds.${codeIndex}`, code: "unknown-code" });
        return "";
      }
      return canonicalCode;
    }).filter(Boolean));
    return { coderId: cell.coderId, itemId: cell.itemId, codeIds };
  });
  const canonicalSkippedCells = canonicalSkippedCellCoverage(skippedCellCoverage);
  if (issues.length > 0) throw new SenaReliabilityProjectBindingError(issues);
  const codebookIds = codebookUniverse.map((entry) => entry.id);
  const itemUniverseIds = sortedUnique(itemUniverse.map((entry) => entry.id));
  const coderIds = sortedUnique(annotationCoverage.map((entry) => entry.coderId));
  const annotatedItemIds = sortedUnique(annotationCoverage.map((entry) => entry.itemId));
  const annotatedCodeIds = sortedUnique(annotationCoverage.map((entry) => entry.codeId));
  return {
    annotations: canonical,
    binding: {
      status: "bound-current-project",
      hashAlgorithm: "sena-stable-fnv1a32/v1",
      projectId: project.projectId,
      projectVersion: project.projectVersion,
      snapshotFingerprint: senaReliabilitySnapshotFingerprint(project.snapshot),
      codebookUniverseHash: reliabilityBindingHash(codebookUniverse),
      itemUniverseHash: reliabilityBindingHash(itemUniverse),
      coderCoverageHash: reliabilityBindingHash(coderIds),
      annotationCoverageHash: reliabilityBindingHash(annotationCoverage),
      skippedCellCoverageHash: reliabilityBindingHash(canonicalSkippedCells),
      annotatedItemCoverageHash: reliabilityBindingHash(annotatedItemIds),
      annotatedCodeCoverageHash: reliabilityBindingHash(annotatedCodeIds),
      codebookUniverse,
      itemUniverse,
      annotationCoverage,
      skippedCellCoverage: canonicalSkippedCells,
      codebookIds,
      itemUniverseIds,
      annotatedItemIds,
      annotatedCodeIds,
      coderIds,
      annotationCount: annotationCoverage.length
    }
  };
}

export function isValidSenaReliabilityProjectBinding(value: unknown): value is SenaReliabilityProjectBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const binding = value as Partial<SenaReliabilityProjectBinding>;
  if (binding.status !== "bound-current-project" || binding.hashAlgorithm !== "sena-stable-fnv1a32/v1" ||
    typeof binding.projectId !== "string" || binding.projectId.length === 0 ||
    !Number.isInteger(binding.projectVersion) || Number(binding.projectVersion) < 1 ||
    !Array.isArray(binding.codebookUniverse) || !binding.codebookUniverse.every((entry) => (
      entry && typeof entry.id === "string" && typeof entry.label === "string"
    )) ||
    !Array.isArray(binding.itemUniverse) || !binding.itemUniverse.every((entry) => (
      entry && typeof entry.id === "string" && (entry.kind === "utterance" || entry.kind === "coded-segment")
    )) ||
    !Array.isArray(binding.annotationCoverage) || !binding.annotationCoverage.every((entry) => (
      entry && typeof entry.coderId === "string" && typeof entry.itemId === "string" &&
      typeof entry.codeId === "string" && typeof entry.value === "boolean"
    )) ||
    !Array.isArray(binding.skippedCellCoverage) || !binding.skippedCellCoverage.every((entry) => (
      entry && typeof entry.coderId === "string" && typeof entry.itemId === "string" &&
      Array.isArray(entry.codeIds) && entry.codeIds.every((codeId) => typeof codeId === "string")
    )) ||
    ![binding.codebookIds, binding.itemUniverseIds, binding.annotatedItemIds, binding.annotatedCodeIds, binding.coderIds]
      .every((entry) => Array.isArray(entry) && entry.every((item) => typeof item === "string")) ||
    !Number.isInteger(binding.annotationCount) || Number(binding.annotationCount) < 0) return false;
  const codebookUniverse = [...binding.codebookUniverse].sort((left, right) => left.id.localeCompare(right.id));
  const itemUniverse = [...binding.itemUniverse].sort((left, right) => left.id.localeCompare(right.id) || left.kind.localeCompare(right.kind));
  const annotationCoverage = canonicalAnnotationCoverage(binding.annotationCoverage);
  const skippedCellCoverage = canonicalSkippedCellCoverage(binding.skippedCellCoverage);
  const codebookIds = codebookUniverse.map((entry) => entry.id);
  const itemUniverseIds = sortedUnique(itemUniverse.map((entry) => entry.id));
  const coderIds = sortedUnique(annotationCoverage.map((entry) => entry.coderId));
  const annotatedItemIds = sortedUnique(annotationCoverage.map((entry) => entry.itemId));
  const annotatedCodeIds = sortedUnique(annotationCoverage.map((entry) => entry.codeId));
  const exactArray = (left: unknown, right: string[]) => JSON.stringify(left) === JSON.stringify(right);
  const knownCodes = new Set(codebookIds);
  const knownItems = new Set(itemUniverseIds);
  return typeof binding.snapshotFingerprint === "string" && /^0x[a-f0-9]{8}$/.test(binding.snapshotFingerprint) &&
    binding.codebookUniverseHash === reliabilityBindingHash(codebookUniverse) &&
    binding.itemUniverseHash === reliabilityBindingHash(itemUniverse) &&
    binding.coderCoverageHash === reliabilityBindingHash(coderIds) &&
    binding.annotationCoverageHash === reliabilityBindingHash(annotationCoverage) &&
    binding.skippedCellCoverageHash === reliabilityBindingHash(skippedCellCoverage) &&
    binding.annotatedItemCoverageHash === reliabilityBindingHash(annotatedItemIds) &&
    binding.annotatedCodeCoverageHash === reliabilityBindingHash(annotatedCodeIds) &&
    exactArray(binding.codebookIds, codebookIds) && exactArray(binding.itemUniverseIds, itemUniverseIds) &&
    exactArray(binding.coderIds, coderIds) && exactArray(binding.annotatedItemIds, annotatedItemIds) &&
    exactArray(binding.annotatedCodeIds, annotatedCodeIds) &&
    binding.annotationCount === annotationCoverage.length &&
    annotationCoverage.every((entry) => knownCodes.has(entry.codeId) && knownItems.has(entry.itemId)) &&
    stableBindingValue(binding.skippedCellCoverage) === stableBindingValue(skippedCellCoverage) &&
    skippedCellCoverage.every((entry) => (
      knownItems.has(entry.itemId) && entry.codeIds.every((codeId) => knownCodes.has(codeId))
    ));
}

export function assertSenaReliabilityProjectBindingMatchesSnapshot(
  binding: SenaReliabilityProjectBinding,
  snapshot: SenaProjectSnapshot,
  expected?: { projectId?: string; projectVersion?: number }
) {
  if (!isValidSenaReliabilityProjectBinding(binding) ||
    (expected?.projectId !== undefined && binding.projectId !== expected.projectId) ||
    (expected?.projectVersion !== undefined && binding.projectVersion !== expected.projectVersion)) {
    throw new SenaReliabilityProjectBindingError([{ path: "projectBinding", code: "binding-mismatch" }]);
  }
  const rebuilt = bindSenaReliabilityAnnotationsToProject(binding.annotationCoverage, {
    projectId: binding.projectId,
    projectVersion: binding.projectVersion,
    snapshot,
    skippedCells: binding.skippedCellCoverage
  }).binding;
  if (JSON.stringify(rebuilt) !== JSON.stringify(binding)) {
    throw new SenaReliabilityProjectBindingError([{ path: "projectBinding", code: "binding-mismatch" }]);
  }
}

function scalar(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function readAliasEntry(row: SenaImportRow, aliases: string[]): { present: boolean; value: string } {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const normalizedAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
    const found = entries.find(([key]) => key.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedAlias);
    if (found) return { present: true, value: scalar(found[1]) };
  }
  return { present: false, value: "" };
}

function readAlias(row: SenaImportRow, aliases: string[]) {
  return readAliasEntry(row, aliases).value;
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();
  return !["0", "false", "no", "n", "absent", "none"].includes(normalized);
}

// Coder-annotation files are external exports, so any-delimiter tolerance is
// the right call here, at the adapter boundary. The five-table contract itself
// splits multi-value cells on "|" only (ADR-0007 D2) — do not "align" this
// splitter with lib/sena/import.ts without deciding how comma-bearing code ids
// in coder files should then be expressed.
function parseCodesWithinCellBudget(value: string, budget: { emittedCells: number }) {
  const codes: string[] = [];
  let tokenStart = 0;
  for (let index = 0; index <= value.length; index += 1) {
    const character = value[index];
    if (index !== value.length && character !== "|" && character !== ";" && character !== ",") continue;
    const code = value.slice(tokenStart, index).trim();
    tokenStart = index + 1;
    if (!code) continue;
    const next = budget.emittedCells + 1;
    if (next > SENA_RELIABILITY_UNIVERSE_LIMITS.annotationRows) {
      throw new SenaReliabilityUniverseLimitError([{
        path: "annotations",
        rule: `annotation-row-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.annotationRows}`,
        actual: next,
        maximum: SENA_RELIABILITY_UNIVERSE_LIMITS.annotationRows
      }]);
    }
    budget.emittedCells = next;
    codes.push(code);
  }
  return codes;
}

// An explicitly skipped cell: the coder's row existed but its value cell was
// empty, so the coder recorded no decision for these item-code units. The
// dashboard treats these cells as missing data (excluded from pairable units),
// per Peter's 2026-08-02 delegation of the §4.1 estimator decision.
export type SenaSkippedCoderCell = {
  coderId: string;
  itemId: string;
  codeIds: string[];
};

export function parseCoderAnnotationsFromRows(rows: SenaImportRow[]): {
  annotations: SenaCoderAnnotation[];
  warnings: string[];
  skippedCells: SenaSkippedCoderCell[];
} {
  // Defensive direct-call boundary. Public request/file adapters also run this
  // admission before invoking the semantic parser so invalid rows cannot fan
  // out warnings or skipped-cell evidence first.
  assertSenaReliabilityCombinedRawRowsWithinLimits([rows]);
  const cellBudget = { emittedCells: 0 };
  // Tokenize every row first. This is deliberately a two-phase pass: an
  // over-limit code cell or cumulative multi-row fan-out fails before any
  // annotation, skipped-cell, or warning output object is allocated. The
  // scanner never calls String#split, so retained tokens and loop work are
  // bounded by the same 200,000-cell contract.
  const preparedRows = rows.map((row, index) => ({
    index,
    coderId: readAlias(row, ["coder_id", "coder", "rater", "reviewer"]),
    itemId: readAlias(row, ["item_id", "segment_id", "utterance_id", "unit_id", "stanza_id", "id"]),
    codes: parseCodesWithinCellBudget(
      readAlias(row, ["code_id", "code", "codes", "label", "coding"]),
      cellBudget
    ),
    valueEntry: readAliasEntry(row, ["value", "applied", "present", "decision", "score"])
  }));
  const warnings: string[] = [];
  const skippedCells: SenaSkippedCoderCell[] = [];
  const annotations: SenaCoderAnnotation[] = [];
  for (const { coderId, itemId, codes, valueEntry, index } of preparedRows) {
    if (!coderId || !itemId || codes.length === 0) {
      warnings.push(`coder annotation row ${index + 1} is missing coder, item, or code and was skipped.`);
      continue;
    }

    // A file with no value column is a presence-style export: each row means
    // the coder applied the code. An empty cell in an existing value column —
    // including a ragged row padded by parseSenaCsv — records no decision at
    // all, so it is missing data: never "applied" (the pre-2026-08-01 bug) and
    // never "not applied" (which would fabricate a disagreement). The dashboard
    // excludes these cells from pairable kappa/alpha units.
    if (valueEntry.present && valueEntry.value === "") {
      skippedCells.push({ coderId, itemId, codeIds: codes });
      warnings.push(`coder annotation row ${index + 1} has an empty value cell; it is treated as missing data and excluded from pairable reliability units.`);
      continue;
    }
    const value = valueEntry.present ? parseBoolean(valueEntry.value) : true;
    for (const codeId of codes) annotations.push({ coderId, itemId, codeId, value });
  }

  return { annotations, warnings, skippedCells };
}

export function parseCoderAnnotationsCsv(text: string) {
  const parsed = parseSenaCsv(text);
  assertSenaReliabilityCombinedRawRowsWithinLimits([parsed.rows]);
  const annotations = parseCoderAnnotationsFromRows(parsed.rows);
  // Ragged-row repairs are additive on the existing shape: a row truncated
  // before its value cell is padded here, then skipped (with disclosure) by the
  // empty-value guard above instead of being read as an applied code.
  return { ...annotations, warnings: [...parsed.warnings, ...annotations.warnings] };
}

function mean(values: number[]) {
  const finite = values.filter(Number.isFinite);
  return finite.length === 0 ? 0 : finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function round(value: number, digits = 4) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function roundNullable(value: number | null, digits = 4) {
  return value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}

function cohenKappa(a: Array<boolean | undefined>, b: Array<boolean | undefined>): Omit<SenaPairwiseKappa, "coderA" | "coderB" | "raw"> {
  const length = Math.min(a.length, b.length);
  let units = 0;
  let agree = 0;
  let aYes = 0;
  let bYes = 0;

  for (let index = 0; index < length; index += 1) {
    const valueA = a[index];
    const valueB = b[index];
    // Missing cells (explicit empty-value skips) are not pairable: the unit is
    // excluded for this pair rather than scored as a fabricated (dis)agreement.
    if (typeof valueA !== "boolean" || typeof valueB !== "boolean") continue;
    units += 1;
    if (valueA === valueB) agree += 1;
    if (valueA) aYes += 1;
    if (valueB) bYes += 1;
  }

  if (units < 2) {
    return {
      units,
      status: "insufficient-pairable-units",
      observedAgreement: null,
      expectedAgreement: null,
      kappa: null
    };
  }
  const observedAgreement = agree / units;
  const aNo = units - aYes;
  const bNo = units - bYes;
  const expectedAgreement = ((aYes / units) * (bYes / units)) + ((aNo / units) * (bNo / units));
  const denominator = 1 - expectedAgreement;
  if (denominator === 0) {
    return {
      units,
      status: "single-observed-category",
      observedAgreement,
      expectedAgreement,
      kappa: null
    };
  }
  return {
    units,
    status: "estimable",
    observedAgreement,
    expectedAgreement,
    kappa: (observedAgreement - expectedAgreement) / denominator
  };
}

function krippendorffAlphaNominal(
  valuesByUnit: Array<Record<string, boolean>>,
  coders: string[]
): { status: SenaReliabilityEstimationStatus; value: number | null } {
  if (coders.length < 2) return { status: "insufficient-coders", value: null };
  // Canonical Krippendorff nominal alpha via the coincidence matrix. Each unit
  // with m>=2 codings contributes its m*(m-1) ordered rating pairs weighted by
  // 1/(m-1); the marginals then drive the sampling-without-replacement expected
  // disagreement (the n(n-1) correction), rather than a plain population p^2
  // approximation. With n = total pairable ratings:
  //   alpha = 1 - (n-1) * sum_{c!=k} o_ck / sum_{c!=k} n_c * n_k
  const coincidence = new Map<string, Map<string, number>>();
  const categories = new Set<string>();
  const addCoincidence = (a: string, b: string, weight: number) => {
    categories.add(a);
    categories.add(b);
    const row = coincidence.get(a) ?? new Map<string, number>();
    row.set(b, (row.get(b) ?? 0) + weight);
    coincidence.set(a, row);
  };

  let pairableUnits = 0;
  for (const unit of valuesByUnit) {
    const values = coders
      .map((coder) => unit[coder])
      .filter((value): value is boolean => typeof value === "boolean")
      .map(String);
    const m = values.length;
    if (m < 2) continue;
    pairableUnits += 1;
    const weight = 1 / (m - 1);
    for (let i = 0; i < m; i += 1) {
      for (let j = 0; j < m; j += 1) {
        if (i !== j) addCoincidence(values[i], values[j], weight);
      }
    }
  }

  if (pairableUnits < 2) return { status: "insufficient-pairable-units", value: null };

  const cats = Array.from(categories);
  const marginals = new Map<string, number>();
  let pairableTotal = 0;
  for (const category of cats) {
    const rowSum = cats.reduce((sum, other) => sum + (coincidence.get(category)?.get(other) ?? 0), 0);
    marginals.set(category, rowSum);
    pairableTotal += rowSum;
  }

  if (pairableTotal < 2) return { status: "insufficient-pairable-units", value: null };

  let observedDisagreement = 0;
  let expectedDisagreement = 0;
  for (const category of cats) {
    for (const other of cats) {
      if (category === other) continue;
      observedDisagreement += coincidence.get(category)?.get(other) ?? 0;
      expectedDisagreement += (marginals.get(category) ?? 0) * (marginals.get(other) ?? 0);
    }
  }

  if (expectedDisagreement === 0) return { status: "single-observed-category", value: null };
  return {
    status: "estimable",
    value: 1 - ((pairableTotal - 1) * observedDisagreement) / expectedDisagreement
  };
}

function agreementRate(valuesByUnit: Array<Record<string, boolean>>, coders: string[]) {
  let pairs = 0;
  let agreements = 0;
  for (const unit of valuesByUnit) {
    for (let i = 0; i < coders.length; i += 1) {
      for (let j = i + 1; j < coders.length; j += 1) {
        const valueA = unit[coders[i]];
        const valueB = unit[coders[j]];
        // Missing cells are excluded from the pair universe, mirroring kappa.
        if (typeof valueA !== "boolean" || typeof valueB !== "boolean") continue;
        pairs += 1;
        if (valueA === valueB) agreements += 1;
      }
    }
  }
  return pairs === 0 ? 0 : agreements / pairs;
}

type SenaReliabilityUnitKey = {
  itemId: string;
  codeId: string;
};

type SenaReliabilityAnnotationIndex = Map<string, Map<string, Map<string, boolean>>>;
type SenaReliabilityMissingCellIndex = Map<string, Map<string, Set<string>>>;

function buildAnnotationIndex(annotations: SenaCoderAnnotation[]): SenaReliabilityAnnotationIndex {
  const index: SenaReliabilityAnnotationIndex = new Map();
  for (const annotation of annotations) {
    let byItem = index.get(annotation.coderId);
    if (!byItem) {
      byItem = new Map();
      index.set(annotation.coderId, byItem);
    }
    let byCode = byItem.get(annotation.itemId);
    if (!byCode) {
      byCode = new Map();
      byItem.set(annotation.itemId, byCode);
    }
    byCode.set(annotation.codeId, (byCode.get(annotation.codeId) ?? false) || annotation.value);
  }
  return index;
}

function annotationValue(
  index: SenaReliabilityAnnotationIndex,
  coderId: string,
  itemId: string,
  codeId: string
) {
  return index.get(coderId)?.get(itemId)?.get(codeId);
}

function buildMissingCellIndex(skippedCells: SenaSkippedCoderCell[]): SenaReliabilityMissingCellIndex {
  const index: SenaReliabilityMissingCellIndex = new Map();
  for (const cell of skippedCells) {
    let byItem = index.get(cell.coderId);
    if (!byItem) {
      byItem = new Map();
      index.set(cell.coderId, byItem);
    }
    let codeIds = byItem.get(cell.itemId);
    if (!codeIds) {
      codeIds = new Set();
      byItem.set(cell.itemId, codeIds);
    }
    for (const codeId of cell.codeIds) codeIds.add(codeId);
  }
  return index;
}

function isMissingCell(
  index: SenaReliabilityMissingCellIndex,
  coderId: string,
  itemId: string,
  codeId: string
) {
  return index.get(coderId)?.get(itemId)?.has(codeId) ?? false;
}

// One row per structured item-code unit; a coder's key is OMITTED (not false)
// when their only evidence for the unit is an explicitly skipped empty-value
// cell. A recorded decision always beats a skip; an absent row keeps the
// historical not-applied reading (presence semantics for the unit universe).
function buildUnitRows(
  unitKeys: SenaReliabilityUnitKey[],
  coders: string[],
  annotations: SenaReliabilityAnnotationIndex,
  missingCells: SenaReliabilityMissingCellIndex
): Array<Record<string, boolean>> {
  return unitKeys.map(({ itemId, codeId }) => {
    const row: Record<string, boolean> = {};
    for (const coder of coders) {
      const value = annotationValue(annotations, coder, itemId, codeId);
      if (value === undefined && isMissingCell(missingCells, coder, itemId, codeId)) continue;
      row[coder] = value ?? false;
    }
    return row;
  });
}

function buildCodeDiagnostics(
  codes: string[],
  coders: string[],
  unitKeys: SenaReliabilityUnitKey[],
  valuesByUnit: Array<Record<string, boolean>>
): SenaCodeReliabilityDiagnostic[] {
  const unitsByCode = new Map(codes.map((codeId) => [codeId, [] as Array<Record<string, boolean>>]));
  unitKeys.forEach((unit, index) => unitsByCode.get(unit.codeId)?.push(valuesByUnit[index]));
  return codes.map((codeId) => {
    const codeUnits = unitsByCode.get(codeId) ?? [];
    const disagreementCount = codeUnits.filter((unit) => new Set(Object.values(unit)).size > 1).length;
    const positiveAssignments = codeUnits.reduce((total, unit) => (
      total + Object.values(unit).filter(Boolean).length
    ), 0);
    const coderPositiveRates = Object.fromEntries(coders.map((coder) => [
      coder,
      // Positive rate over the coder's recorded cells only; missing cells drop
      // out via mean()'s finite filter instead of deflating the rate as 0s.
      round(mean(codeUnits.map((unit) => typeof unit[coder] === "boolean" ? (unit[coder] ? 1 : 0) : Number.NaN)))
    ]));
    const pairwiseCohenKappa: SenaPairwiseKappa[] = [];
    for (let i = 0; i < coders.length; i += 1) {
      for (let j = i + 1; j < coders.length; j += 1) {
        const coderA = coders[i];
        const coderB = coders[j];
        const stats = cohenKappa(codeUnits.map((unit) => unit[coderA]), codeUnits.map((unit) => unit[coderB]));
        pairwiseCohenKappa.push({
          coderA,
          coderB,
          units: stats.units,
          status: stats.status,
          raw: {
            observedAgreement: stats.observedAgreement,
            expectedAgreement: stats.expectedAgreement,
            kappa: stats.kappa
          },
          observedAgreement: roundNullable(stats.observedAgreement),
          expectedAgreement: roundNullable(stats.expectedAgreement),
          kappa: roundNullable(stats.kappa)
        });
      }
    }
    return {
      codeId,
      unitCount: codeUnits.length,
      positiveAssignments,
      disagreementCount,
      agreementRate: round(agreementRate(codeUnits, coders)),
      coderPositiveRates,
      pairwiseCohenKappa
    };
  }).sort((a, b) => (
    b.disagreementCount - a.disagreementCount ||
    a.agreementRate - b.agreementRate ||
    a.codeId.localeCompare(b.codeId)
  ));
}

export function buildSenaReliabilityClaimEligibility(input: {
  coderCount: number;
  pairwiseStatuses: SenaReliabilityEstimationStatus[];
  meanPairwiseKappa: number | null;
  krippendorffAlphaNominal: number | null;
  krippendorffAlphaNominalStatus: SenaReliabilityEstimationStatus;
  unresolvedDisagreementCount: number;
}): SenaReliabilityClaimEligibility {
  const checks = {
    minimumCoders: input.coderCount >= 2,
    allPairwiseKappaEstimable: input.pairwiseStatuses.length > 0 && input.pairwiseStatuses.every((status) => status === "estimable"),
    krippendorffAlphaEstimable: input.krippendorffAlphaNominalStatus === "estimable",
    meanPairwiseKappaAtThreshold: input.meanPairwiseKappa !== null && input.meanPairwiseKappa >= 0.8,
    krippendorffAlphaAtThreshold: input.krippendorffAlphaNominal !== null && input.krippendorffAlphaNominal >= 0.8,
    noUnresolvedDisagreements: input.unresolvedDisagreementCount === 0
  };
  const blockers = [
    checks.minimumCoders ? null : "minimum-two-coders",
    checks.allPairwiseKappaEstimable ? null : "all-pairwise-kappa-estimable",
    checks.krippendorffAlphaEstimable ? null : "krippendorff-alpha-estimable",
    checks.meanPairwiseKappaAtThreshold ? null : "mean-pairwise-kappa-at-least-0.80",
    checks.krippendorffAlphaAtThreshold ? null : "krippendorff-alpha-at-least-0.80",
    checks.noUnresolvedDisagreements ? null : "unresolved-reliability-disagreements"
  ].filter((blocker): blocker is string => blocker !== null);

  return {
    eligible: blockers.length === 0,
    threshold: {
      minimumCoders: 2,
      meanPairwiseKappa: 0.8,
      krippendorffAlphaNominal: 0.8
    },
    checks,
    blockers,
    adjudication: {
      status: "external-not-evaluated",
      disclosure: checks.noUnresolvedDisagreements
        ? "No unresolved disagreement is present in the canonical reliability queue; human sign-off remains external evidence."
        : `${input.unresolvedDisagreementCount} canonical reliability disagreement(s) remain unresolved in machine evidence; external approval cannot override this blocker without bound resolution evidence.`
    }
  };
}

const reliabilityEstimationStatuses = new Set<SenaReliabilityEstimationStatus>([
  "estimable",
  "insufficient-pairable-units",
  "single-observed-category",
  "insufficient-coders",
  "legacy-ambiguous"
]);

function isReliabilityEstimationStatus(value: unknown): value is SenaReliabilityEstimationStatus {
  return typeof value === "string" && reliabilityEstimationStatuses.has(value as SenaReliabilityEstimationStatus);
}

function finiteNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function sameNullableNumber(left: number | null, right: number | null) {
  return left === right;
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function sameClaimEligibility(left: SenaReliabilityClaimEligibility, right: SenaReliabilityClaimEligibility) {
  return left.eligible === right.eligible &&
    left.threshold.minimumCoders === right.threshold.minimumCoders &&
    left.threshold.meanPairwiseKappa === right.threshold.meanPairwiseKappa &&
    left.threshold.krippendorffAlphaNominal === right.threshold.krippendorffAlphaNominal &&
    left.checks.minimumCoders === right.checks.minimumCoders &&
    left.checks.allPairwiseKappaEstimable === right.checks.allPairwiseKappaEstimable &&
    left.checks.krippendorffAlphaEstimable === right.checks.krippendorffAlphaEstimable &&
    left.checks.meanPairwiseKappaAtThreshold === right.checks.meanPairwiseKappaAtThreshold &&
    left.checks.krippendorffAlphaAtThreshold === right.checks.krippendorffAlphaAtThreshold &&
    left.checks.noUnresolvedDisagreements === right.checks.noUnresolvedDisagreements &&
    sameStringArray(left.blockers, right.blockers) &&
    left.adjudication.status === right.adjudication.status &&
    typeof left.adjudication.disclosure === "string";
}

function isClaimEligibility(value: unknown): value is SenaReliabilityClaimEligibility {
  if (!isRecord(value)) return false;
  const threshold = isRecord(value.threshold) ? value.threshold : null;
  const checks = isRecord(value.checks) ? value.checks : null;
  const adjudication = isRecord(value.adjudication) ? value.adjudication : null;
  return typeof value.eligible === "boolean" &&
    threshold?.minimumCoders === 2 &&
    threshold.meanPairwiseKappa === 0.8 &&
    threshold.krippendorffAlphaNominal === 0.8 &&
    Boolean(checks) &&
    [
      checks?.minimumCoders,
      checks?.allPairwiseKappaEstimable,
      checks?.krippendorffAlphaEstimable,
      checks?.meanPairwiseKappaAtThreshold,
      checks?.krippendorffAlphaAtThreshold,
      checks?.noUnresolvedDisagreements
    ].every((entry) => typeof entry === "boolean") &&
    Array.isArray(value.blockers) && value.blockers.every((entry) => typeof entry === "string") &&
    adjudication?.status === "external-not-evaluated" &&
    typeof adjudication.disclosure === "string";
}

export function isSenaReliabilityClaimEligibilityInputs(
  value: unknown
): value is SenaReliabilityClaimEligibilityInputs {
  if (!isRecord(value)) return false;
  const coderCount = Number(value.coderCount);
  const expectedPairCount = coderCount < 2 ? 0 : (coderCount * (coderCount - 1)) / 2;
  return Number.isInteger(value.coderCount) && coderCount >= 0 &&
    Array.isArray(value.pairwiseKappaStatuses) &&
    value.pairwiseKappaStatuses.length === expectedPairCount &&
    value.pairwiseKappaStatuses.every(isReliabilityEstimationStatus) &&
    finiteNumberOrNull(value.meanPairwiseKappa) &&
    isReliabilityEstimationStatus(value.krippendorffAlphaNominalStatus) &&
    finiteNumberOrNull(value.krippendorffAlphaNominal) &&
    Number.isInteger(value.unresolvedDisagreementCount) && Number(value.unresolvedDisagreementCount) >= 0;
}

export function deriveSenaReliabilityClaimEligibility(
  input: SenaReliabilityClaimEligibilityInputs
): SenaReliabilityClaimEligibility {
  return buildSenaReliabilityClaimEligibility({
    coderCount: input.coderCount,
    pairwiseStatuses: input.pairwiseKappaStatuses,
    meanPairwiseKappa: input.meanPairwiseKappa,
    krippendorffAlphaNominal: input.krippendorffAlphaNominal,
    krippendorffAlphaNominalStatus: input.krippendorffAlphaNominalStatus,
    unresolvedDisagreementCount: input.unresolvedDisagreementCount
  });
}

function isSemanticallyConsistentEligibilityInputs(input: SenaReliabilityClaimEligibilityInputs) {
  const pairwiseAllEstimable = input.pairwiseKappaStatuses.length > 0 &&
    input.pairwiseKappaStatuses.every((status) => status === "estimable");
  if (input.coderCount < 2) {
    return input.pairwiseKappaStatuses.length === 0 &&
      input.meanPairwiseKappa === null &&
      input.krippendorffAlphaNominalStatus === "insufficient-coders" &&
      input.krippendorffAlphaNominal === null;
  }
  if (pairwiseAllEstimable) {
    return input.meanPairwiseKappa !== null &&
      input.krippendorffAlphaNominalStatus === "estimable" &&
      input.krippendorffAlphaNominal !== null;
  }
  return input.meanPairwiseKappa === null;
}

function canonicalReliabilityInputs(value: {
  coderIds: string[];
  pairwiseCohenKappa: SenaPairwiseKappa[];
  krippendorffAlphaNominalStatus: SenaReliabilityEstimationStatus;
  krippendorffAlphaNominalRaw: number | null;
  unresolvedDisagreementCount: number;
}): SenaReliabilityClaimEligibilityInputs | null {
  const coderIds = value.coderIds;
  if (coderIds.some((coderId) => coderId.length === 0) ||
    new Set(coderIds).size !== coderIds.length ||
    !sameStringArray(coderIds, [...coderIds].sort()) ||
    !value.pairwiseCohenKappa.every(isValidPairwiseKappa)) return null;
  const actualPairKeys = value.pairwiseCohenKappa
    .map((pair) => canonicalTupleKey([pair.coderA, pair.coderB].sort()))
    .sort();
  if (!sameStringArray(actualPairKeys, expectedPairKeys(coderIds))) return null;
  const pairwiseKappaStatuses = value.pairwiseCohenKappa.map((pair) => pair.status);
  const allPairsEstimable = pairwiseKappaStatuses.length > 0 &&
    pairwiseKappaStatuses.every((status) => status === "estimable");
  const meanPairwiseKappa = allPairsEstimable
    ? mean(value.pairwiseCohenKappa.map((pair) => pair.raw.kappa as number))
    : null;
  const alphaIsEstimable = value.krippendorffAlphaNominalStatus === "estimable";
  if (!Number.isInteger(value.unresolvedDisagreementCount) || value.unresolvedDisagreementCount < 0 ||
    (alphaIsEstimable
    ? value.krippendorffAlphaNominalRaw === null || value.krippendorffAlphaNominalRaw < -1 || value.krippendorffAlphaNominalRaw > 1
    : value.krippendorffAlphaNominalRaw !== null)) return null;
  return {
    coderCount: coderIds.length,
    pairwiseKappaStatuses,
    meanPairwiseKappa,
    krippendorffAlphaNominalStatus: value.krippendorffAlphaNominalStatus,
    krippendorffAlphaNominal: value.krippendorffAlphaNominalRaw,
    unresolvedDisagreementCount: value.unresolvedDisagreementCount
  };
}

function sameEligibilityInputs(
  left: SenaReliabilityClaimEligibilityInputs,
  right: SenaReliabilityClaimEligibilityInputs
) {
  return left.coderCount === right.coderCount &&
    sameStringArray(left.pairwiseKappaStatuses, right.pairwiseKappaStatuses) &&
    sameNullableNumber(left.meanPairwiseKappa, right.meanPairwiseKappa) &&
    left.krippendorffAlphaNominalStatus === right.krippendorffAlphaNominalStatus &&
    sameNullableNumber(left.krippendorffAlphaNominal, right.krippendorffAlphaNominal) &&
    left.unresolvedDisagreementCount === right.unresolvedDisagreementCount;
}

export function deriveSenaReliabilityMachineClaimEligibility(
  value: SenaCodingReliabilityMachineEvidence
): SenaReliabilityClaimEligibility {
  const inputs = canonicalReliabilityInputs(value);
  if (!inputs) throw new Error("SENA reliability machine evidence lacks canonical raw pair or alpha estimates.");
  return deriveSenaReliabilityClaimEligibility(inputs);
}

export function isSemanticallyValidSenaReliabilityMachineEvidence(
  value: unknown
): value is SenaCodingReliabilityMachineEvidence {
  if (!isRecord(value) ||
    value.dashboardSchemaVersion !== SENA_SCHEMA_VERSIONS.codingReliabilityDashboard ||
    (value.sourceSchemaVersion !== SENA_SCHEMA_VERSIONS.codingReliabilityDashboard &&
      value.sourceSchemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.codingReliabilityDashboard) ||
    !isReliabilityEstimationStatus(value.status) ||
    !Array.isArray(value.coderIds) ||
    !value.coderIds.every((coderId) => typeof coderId === "string") ||
    !Array.isArray(value.pairwiseCohenKappa) ||
    !isReliabilityEstimationStatus(value.meanPairwiseKappaStatus) ||
    !finiteNumberOrNull(value.meanPairwiseKappa) ||
    !isReliabilityEstimationStatus(value.krippendorffAlphaNominalStatus) ||
    !finiteNumberOrNull(value.krippendorffAlphaNominalRaw) ||
    !finiteNumberOrNull(value.krippendorffAlphaNominal) ||
    typeof value.allPairwiseKappaEstimable !== "boolean" ||
    !isSenaReliabilityClaimEligibilityInputs(value.claimEligibilityInputs) ||
    !isClaimEligibility(value.claimEligibility) ||
    (value.projectBindingRequired !== undefined && value.projectBindingRequired !== true) ||
    (value.projectBinding !== undefined && (
      value.projectBindingRequired !== true || !isValidSenaReliabilityProjectBinding(value.projectBinding)
    )) ||
    (value.projectBindingRequired === true && value.projectBinding === undefined)) return false;

  const canonicalInputs = canonicalReliabilityInputs(value as unknown as {
    coderIds: string[];
    pairwiseCohenKappa: SenaPairwiseKappa[];
    krippendorffAlphaNominalStatus: SenaReliabilityEstimationStatus;
    krippendorffAlphaNominalRaw: number | null;
    unresolvedDisagreementCount: number;
  });
  if (!canonicalInputs || !sameEligibilityInputs(value.claimEligibilityInputs, canonicalInputs)) return false;
  if (value.projectBinding !== undefined &&
    JSON.stringify(value.projectBinding.coderIds) !== JSON.stringify(value.coderIds)) return false;
  const currentSource = value.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.codingReliabilityDashboard;
  if (currentSource && value.projectBinding !== undefined &&
    !matchesProjectBoundMachineEvidenceDerivedMetrics(
      value as unknown as SenaCodingReliabilityMachineEvidence
    )) return false;
  if (currentSource && (
    value.status === "legacy-ambiguous" ||
    value.meanPairwiseKappaStatus === "legacy-ambiguous" ||
    value.krippendorffAlphaNominalStatus === "legacy-ambiguous" ||
    canonicalInputs.pairwiseKappaStatuses.some((status) => status === "legacy-ambiguous")
  )) return false;
  const expected = deriveSenaReliabilityClaimEligibility(canonicalInputs);
  const expectedStatus = aggregateReliabilityStatus(
    canonicalInputs.coderCount,
    canonicalInputs.pairwiseKappaStatuses,
    canonicalInputs.krippendorffAlphaNominalStatus
  );
  const expectedMeanStatus = canonicalInputs.coderCount < 2
    ? "insufficient-coders"
    : canonicalInputs.pairwiseKappaStatuses.length === 0 || canonicalInputs.pairwiseKappaStatuses.some((status) => status === "insufficient-pairable-units")
      ? "insufficient-pairable-units"
      : canonicalInputs.pairwiseKappaStatuses.some((status) => status === "single-observed-category")
        ? "single-observed-category"
        : canonicalInputs.pairwiseKappaStatuses.every((status) => status === "estimable")
          ? "estimable"
          : "legacy-ambiguous";
  const legacySourceValid = !currentSource &&
    value.status === "legacy-ambiguous" &&
    value.meanPairwiseKappaStatus === "legacy-ambiguous" &&
    value.meanPairwiseKappa === null &&
    value.krippendorffAlphaNominalStatus === "legacy-ambiguous" &&
    value.krippendorffAlphaNominalRaw === null &&
    value.krippendorffAlphaNominal === null &&
    value.claimEligibility.eligible === false &&
    value.claimEligibility.blockers.includes("current-v2-estimates-required");
  if (legacySourceValid) return true;
  return currentSource && isSemanticallyConsistentEligibilityInputs(canonicalInputs) &&
    value.status === expectedStatus &&
    value.meanPairwiseKappaStatus === expectedMeanStatus &&
    sameNullableNumber(value.meanPairwiseKappa, roundNullable(canonicalInputs.meanPairwiseKappa)) &&
    value.krippendorffAlphaNominalStatus === canonicalInputs.krippendorffAlphaNominalStatus &&
    sameNullableNumber(value.krippendorffAlphaNominal, roundNullable(canonicalInputs.krippendorffAlphaNominal)) &&
    value.allPairwiseKappaEstimable === expected.checks.allPairwiseKappaEstimable &&
    sameClaimEligibility(value.claimEligibility, expected);
}

function aggregateReliabilityStatus(
  coderCount: number,
  pairwiseStatuses: SenaReliabilityEstimationStatus[],
  alphaStatus: SenaReliabilityEstimationStatus
): SenaReliabilityEstimationStatus {
  if (coderCount < 2) return "insufficient-coders";
  const statuses = [...pairwiseStatuses, alphaStatus];
  if (statuses.some((status) => status === "legacy-ambiguous")) return "legacy-ambiguous";
  if (statuses.some((status) => status === "insufficient-pairable-units")) return "insufficient-pairable-units";
  if (statuses.some((status) => status === "single-observed-category")) return "single-observed-category";
  return statuses.length > 1 && statuses.every((status) => status === "estimable")
    ? "estimable"
    : "insufficient-pairable-units";
}

export function buildSenaReliabilityDashboard(
  annotations: SenaCoderAnnotation[],
  options: {
    skippedCells?: SenaSkippedCoderCell[];
    projectBinding?: SenaReliabilityProjectBinding;
  } = {}
): SenaReliabilityDashboard {
  const warnings: string[] = [];
  const skippedCells = options.skippedCells ?? [];
  const { coders, items, codes } = preflightSenaReliabilityAnnotations(annotations);
  const itemSet = new Set(items);
  const codeSet = new Set(codes);
  const derivationEvidence = buildReliabilityDerivationEvidence(annotations, skippedCells);
  const annotationIndex = buildAnnotationIndex(annotations);
  const missingCells = buildMissingCellIndex(skippedCells);
  if (options.projectBinding) {
    const coverage = canonicalAnnotationCoverage(annotations);
    if (!isValidSenaReliabilityProjectBinding(options.projectBinding) ||
      options.projectBinding.annotationCoverageHash !== reliabilityBindingHash(coverage) ||
      options.projectBinding.skippedCellCoverageHash !== derivationEvidence.skippedCellCoverageHash ||
      stableBindingValue(options.projectBinding.annotationCoverage) !== stableBindingValue(derivationEvidence.annotations) ||
      stableBindingValue(options.projectBinding.skippedCellCoverage) !== stableBindingValue(derivationEvidence.skippedCells) ||
      JSON.stringify(options.projectBinding.coderIds) !== JSON.stringify(coders) ||
      JSON.stringify(options.projectBinding.annotatedItemIds) !== JSON.stringify(items) ||
      JSON.stringify(options.projectBinding.annotatedCodeIds) !== JSON.stringify(codes)) {
      throw new SenaReliabilityProjectBindingError([{ path: "projectBinding", code: "binding-mismatch" }]);
    }
  }
  const unitKeys = items.flatMap((itemId) => codes.map((codeId) => ({ itemId, codeId })));

  if (coders.length < 2) warnings.push("At least two coders are required for reliability statistics.");
  if (items.length === 0 || codes.length === 0) warnings.push("No codable item-code units were available.");
  // Count only cells actually excluded: a recorded decision beats a skip, and
  // a skipped cell whose item or code never entered the unit universe excludes
  // nothing. Distinct cells; the per-row warnings disclose each skipped row.
  let excludedCellCount = 0;
  for (const [coderId, byItem] of missingCells) {
    for (const [itemId, missingCodeIds] of byItem) {
      if (!itemSet.has(itemId)) continue;
      for (const codeId of missingCodeIds) {
        if (codeSet.has(codeId) && annotationValue(annotationIndex, coderId, itemId, codeId) === undefined) {
          excludedCellCount += 1;
        }
      }
    }
  }
  if (excludedCellCount > 0) {
    warnings.push(`${excludedCellCount} distinct coder cell(s) with an empty value were treated as missing data and excluded from pairable reliability units.`);
  }

  const valuesByUnit = buildUnitRows(unitKeys, coders, annotationIndex, missingCells);

  const pairwiseCohenKappa: SenaPairwiseKappa[] = [];
  const rawPairwiseKappas: number[] = [];
  for (let i = 0; i < coders.length; i += 1) {
    for (let j = i + 1; j < coders.length; j += 1) {
      const coderA = coders[i];
      const coderB = coders[j];
      const stats = cohenKappa(valuesByUnit.map((unit) => unit[coderA]), valuesByUnit.map((unit) => unit[coderB]));
      if (stats.kappa !== null) rawPairwiseKappas.push(stats.kappa);
      pairwiseCohenKappa.push({
        coderA,
        coderB,
        units: stats.units,
        status: stats.status,
        raw: {
          observedAgreement: stats.observedAgreement,
          expectedAgreement: stats.expectedAgreement,
          kappa: stats.kappa
        },
        observedAgreement: roundNullable(stats.observedAgreement),
        expectedAgreement: roundNullable(stats.expectedAgreement),
        kappa: roundNullable(stats.kappa)
      });
    }
  }

  const adjudicationQueue: SenaReliabilityDisagreement[] = [];
  unitKeys.forEach((key, index) => {
    const values = valuesByUnit[index];
    const decisions = new Set(Object.values(values));
    if (decisions.size <= 1) return;
    adjudicationQueue.push({ itemId: key.itemId, codeId: key.codeId, values });
  });

  const unestimablePairCount = pairwiseCohenKappa.filter((entry) => entry.status !== "estimable").length;
  if (unestimablePairCount > 0) {
    warnings.push(`${unestimablePairCount} coder pair(s) were not estimable; their agreement estimates are reported as null with a stable status.`);
  }

  const pairwiseStatuses = pairwiseCohenKappa.map((entry) => entry.status);
  const meanPairwiseKappaStatus: SenaReliabilityEstimationStatus = coders.length < 2
    ? "insufficient-coders"
    : pairwiseStatuses.length === 0 || pairwiseStatuses.some((status) => status === "insufficient-pairable-units")
      ? "insufficient-pairable-units"
      : pairwiseStatuses.some((status) => status === "single-observed-category")
        ? "single-observed-category"
        : pairwiseStatuses.every((status) => status === "estimable")
          ? "estimable"
          : "legacy-ambiguous";
  const rawMeanPairwiseKappa = meanPairwiseKappaStatus === "estimable"
    ? mean(rawPairwiseKappas)
    : null;
  const meanPairwiseKappa = rawMeanPairwiseKappa === null ? null : round(rawMeanPairwiseKappa);
  const alphaEstimate = krippendorffAlphaNominal(valuesByUnit, coders);
  const alpha = roundNullable(alphaEstimate.value);
  if (alphaEstimate.status !== "estimable") {
    warnings.push(`Krippendorff alpha was not estimable (${alphaEstimate.status}); the score is reported as null.`);
  }
  const claimEligibility = buildSenaReliabilityClaimEligibility({
    coderCount: coders.length,
    pairwiseStatuses,
    meanPairwiseKappa: rawMeanPairwiseKappa,
    krippendorffAlphaNominal: alphaEstimate.value,
    krippendorffAlphaNominalStatus: alphaEstimate.status,
    unresolvedDisagreementCount: adjudicationQueue.length
  });
  const claimEligibilityInputs: SenaReliabilityClaimEligibilityInputs = {
    coderCount: coders.length,
    pairwiseKappaStatuses: pairwiseStatuses,
    meanPairwiseKappa: rawMeanPairwiseKappa,
    krippendorffAlphaNominalStatus: alphaEstimate.status,
    krippendorffAlphaNominal: alphaEstimate.value,
    unresolvedDisagreementCount: adjudicationQueue.length
  };
  const status = aggregateReliabilityStatus(coders.length, pairwiseStatuses, alphaEstimate.status);
  const codeDiagnostics = buildCodeDiagnostics(codes, coders, unitKeys, valuesByUnit);
  const interpretation = coders.length < 2
    ? "Reliability cannot be interpreted until at least two coders are uploaded."
    : claimEligibility.eligible
      ? "The machine reliability thresholds are met; human adjudication coverage and study-specific sign-off remain external evidence."
      : rawMeanPairwiseKappa !== null && alphaEstimate.value !== null && rawMeanPairwiseKappa >= 0.6 && alphaEstimate.value >= 0.6
        ? "Reliability evidence is moderate; adjudicate disagreements before publication-facing claims."
        : status === "estimable"
          ? "Reliability evidence needs review before SENA graph patterns are treated as research claims."
          : `Reliability is not estimable (${status}); do not substitute a zero or perfect score.`;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.codingReliabilityDashboard,
    sourceSchemaVersion: SENA_SCHEMA_VERSIONS.codingReliabilityDashboard,
    status,
    coderCount: coders.length,
    coderIds: coders,
    itemCount: items.length,
    codeCount: codes.length,
    binaryUnitCount: unitKeys.length,
    pairwiseCohenKappa,
    codeDiagnostics,
    meanPairwiseKappaStatus,
    meanPairwiseKappa,
    krippendorffAlphaNominalStatus: alphaEstimate.status,
    krippendorffAlphaNominalRaw: alphaEstimate.value,
    krippendorffAlphaNominal: alpha,
    claimEligibilityInputs,
    claimEligibility,
    disagreementCount: adjudicationQueue.length,
    adjudicationQueue,
    derivationEvidence,
    interpretation,
    warnings,
    projectBinding: options.projectBinding ? structuredClone(options.projectBinding) : undefined
  };
}

function reliabilityDashboardDerivedProjection(dashboard: SenaReliabilityDashboard) {
  return {
    status: dashboard.status,
    coderCount: dashboard.coderCount,
    coderIds: dashboard.coderIds,
    itemCount: dashboard.itemCount,
    codeCount: dashboard.codeCount,
    binaryUnitCount: dashboard.binaryUnitCount,
    pairwiseCohenKappa: dashboard.pairwiseCohenKappa,
    codeDiagnostics: dashboard.codeDiagnostics,
    meanPairwiseKappaStatus: dashboard.meanPairwiseKappaStatus,
    meanPairwiseKappa: dashboard.meanPairwiseKappa,
    krippendorffAlphaNominalStatus: dashboard.krippendorffAlphaNominalStatus,
    krippendorffAlphaNominalRaw: dashboard.krippendorffAlphaNominalRaw,
    krippendorffAlphaNominal: dashboard.krippendorffAlphaNominal,
    claimEligibilityInputs: dashboard.claimEligibilityInputs,
    claimEligibility: dashboard.claimEligibility,
    disagreementCount: dashboard.disagreementCount,
    adjudicationQueue: dashboard.adjudicationQueue,
    interpretation: dashboard.interpretation
  };
}

function sameReliabilityDashboardDerivedMetrics(
  submitted: SenaReliabilityDashboard,
  expected: SenaReliabilityDashboard
) {
  return stableBindingValue(reliabilityDashboardDerivedProjection(submitted)) ===
    stableBindingValue(reliabilityDashboardDerivedProjection(expected));
}

export function assertSenaReliabilityDashboardMatchesAnnotations(
  dashboard: SenaReliabilityDashboard,
  annotations: SenaCoderAnnotation[],
  options: { skippedCells?: SenaSkippedCoderCell[] } = {}
) {
  const expected = buildSenaReliabilityDashboard(annotations, options);
  if (!sameReliabilityDashboardDerivedMetrics(dashboard, expected)) {
    throw new SenaReliabilityProjectBindingError([
      { path: "dashboard", code: "derived-metrics-mismatch" }
    ]);
  }
}

function canonicalDashboardFromProjectBinding(binding: SenaReliabilityProjectBinding) {
  return buildSenaReliabilityDashboard(binding.annotationCoverage, {
    skippedCells: binding.skippedCellCoverage,
    projectBinding: binding
  });
}

function matchesProjectBoundDashboardDerivedMetrics(dashboard: SenaReliabilityDashboard) {
  if (!dashboard.projectBinding) return true;
  try {
    return sameReliabilityDashboardDerivedMetrics(
      dashboard,
      canonicalDashboardFromProjectBinding(dashboard.projectBinding)
    );
  } catch {
    return false;
  }
}

function reliabilityMachineDerivedProjection(value: SenaCodingReliabilityMachineEvidence) {
  return {
    status: value.status,
    coderIds: value.coderIds,
    pairwiseCohenKappa: value.pairwiseCohenKappa,
    meanPairwiseKappaStatus: value.meanPairwiseKappaStatus,
    meanPairwiseKappa: value.meanPairwiseKappa,
    krippendorffAlphaNominalStatus: value.krippendorffAlphaNominalStatus,
    krippendorffAlphaNominalRaw: value.krippendorffAlphaNominalRaw,
    krippendorffAlphaNominal: value.krippendorffAlphaNominal,
    unresolvedDisagreementCount: value.unresolvedDisagreementCount,
    allPairwiseKappaEstimable: value.allPairwiseKappaEstimable,
    claimEligibilityInputs: value.claimEligibilityInputs,
    claimEligibility: value.claimEligibility
  };
}

function dashboardMachineDerivedProjection(dashboard: SenaReliabilityDashboard) {
  return {
    status: dashboard.status,
    coderIds: dashboard.coderIds,
    pairwiseCohenKappa: dashboard.pairwiseCohenKappa,
    meanPairwiseKappaStatus: dashboard.meanPairwiseKappaStatus,
    meanPairwiseKappa: dashboard.meanPairwiseKappa,
    krippendorffAlphaNominalStatus: dashboard.krippendorffAlphaNominalStatus,
    krippendorffAlphaNominalRaw: dashboard.krippendorffAlphaNominalRaw,
    krippendorffAlphaNominal: dashboard.krippendorffAlphaNominal,
    unresolvedDisagreementCount: dashboard.disagreementCount,
    allPairwiseKappaEstimable: dashboard.pairwiseCohenKappa.length > 0 &&
      dashboard.pairwiseCohenKappa.every((pair) => pair.status === "estimable"),
    claimEligibilityInputs: dashboard.claimEligibilityInputs,
    claimEligibility: dashboard.claimEligibility
  };
}

function matchesProjectBoundMachineEvidenceDerivedMetrics(
  evidence: SenaCodingReliabilityMachineEvidence
) {
  if (!evidence.projectBinding) return true;
  try {
    return stableBindingValue(reliabilityMachineDerivedProjection(evidence)) ===
      stableBindingValue(dashboardMachineDerivedProjection(
        canonicalDashboardFromProjectBinding(evidence.projectBinding)
      ));
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidSenaReliabilityDerivationEvidence(value: unknown): value is SenaReliabilityDerivationEvidence {
  if (!isRecord(value) || value.hashAlgorithm !== "sena-stable-fnv1a32/v1" ||
    typeof value.annotationCoverageHash !== "string" || !/^0x[a-f0-9]{8}$/.test(value.annotationCoverageHash) ||
    typeof value.skippedCellCoverageHash !== "string" || !/^0x[a-f0-9]{8}$/.test(value.skippedCellCoverageHash) ||
    !Array.isArray(value.annotations) || !value.annotations.every((entry) => (
      isRecord(entry) && typeof entry.coderId === "string" && entry.coderId.length > 0 &&
      typeof entry.itemId === "string" && entry.itemId.length > 0 &&
      typeof entry.codeId === "string" && entry.codeId.length > 0 &&
      typeof entry.value === "boolean"
    )) ||
    !Array.isArray(value.skippedCells) || !value.skippedCells.every((entry) => (
      isRecord(entry) && typeof entry.coderId === "string" && entry.coderId.length > 0 &&
      typeof entry.itemId === "string" && entry.itemId.length > 0 &&
      Array.isArray(entry.codeIds) && entry.codeIds.length > 0 &&
      entry.codeIds.every((codeId) => typeof codeId === "string" && codeId.length > 0)
    ))) return false;
  const annotations = canonicalAnnotationCoverage(value.annotations as SenaCoderAnnotation[]);
  const skippedCells = canonicalSkippedCellCoverage(value.skippedCells as SenaSkippedCoderCell[]);
  const annotationKeys = annotations.map((entry) => canonicalTupleKey([
    entry.coderId,
    entry.itemId,
    entry.codeId
  ]));
  const skippedKeys = skippedCells.flatMap((entry) => entry.codeIds.map((codeId) => (
    canonicalTupleKey([entry.coderId, entry.itemId, codeId])
  )));
  return new Set(annotationKeys).size === annotationKeys.length &&
    new Set(skippedKeys).size === skippedKeys.length &&
    stableBindingValue(value.annotations) === stableBindingValue(annotations) &&
    stableBindingValue(value.skippedCells) === stableBindingValue(skippedCells) &&
    value.annotationCoverageHash === reliabilityBindingHash(annotations) &&
    value.skippedCellCoverageHash === reliabilityBindingHash(skippedCells);
}

function finiteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeLegacyPairwiseKappa(value: unknown): SenaPairwiseKappa {
  const pair = isRecord(value) ? value : {};
  return {
    coderA: typeof pair.coderA === "string" ? pair.coderA : "unknown-coder-a",
    coderB: typeof pair.coderB === "string" ? pair.coderB : "unknown-coder-b",
    units: typeof pair.units === "number" && Number.isFinite(pair.units) ? Math.max(0, Math.trunc(pair.units)) : 0,
    status: "legacy-ambiguous",
    raw: {
      observedAgreement: null,
      expectedAgreement: null,
      kappa: null
    },
    observedAgreement: finiteOrNull(pair.observedAgreement),
    expectedAgreement: finiteOrNull(pair.expectedAgreement),
    kappa: finiteOrNull(pair.kappa)
  };
}

function approximatelyEqual(left: number, right: number, tolerance = 1e-12) {
  return Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
}

function inClosedUnitInterval(value: number) {
  return value >= 0 && value <= 1;
}

function isValidPairwiseKappa(value: unknown) {
  const raw = isRecord(value) && isRecord(value.raw) ? value.raw : null;
  if (!isRecord(value) ||
    typeof value.coderA !== "string" ||
    typeof value.coderB !== "string" ||
    !Number.isInteger(value.units) || Number(value.units) < 0 ||
    !isReliabilityEstimationStatus(value.status) ||
    !raw ||
    !finiteNumberOrNull(raw.observedAgreement) ||
    !finiteNumberOrNull(raw.expectedAgreement) ||
    !finiteNumberOrNull(raw.kappa) ||
    !finiteNumberOrNull(value.observedAgreement) ||
    !finiteNumberOrNull(value.expectedAgreement) ||
    !finiteNumberOrNull(value.kappa)) return false;
  if (value.status === "estimable") {
    if (Number(value.units) < 2 ||
      typeof raw.observedAgreement !== "number" ||
      typeof raw.expectedAgreement !== "number" ||
      typeof raw.kappa !== "number" ||
      typeof value.observedAgreement !== "number" ||
      typeof value.expectedAgreement !== "number" ||
      typeof value.kappa !== "number") return false;
    if (!inClosedUnitInterval(raw.observedAgreement) ||
      !inClosedUnitInterval(raw.expectedAgreement) ||
      raw.expectedAgreement >= 1 ||
      raw.kappa < -1 || raw.kappa > 1) return false;
    const expectedKappa = (raw.observedAgreement - raw.expectedAgreement) / (1 - raw.expectedAgreement);
    return approximatelyEqual(raw.kappa, expectedKappa) &&
      value.observedAgreement === roundNullable(raw.observedAgreement) &&
      value.expectedAgreement === roundNullable(raw.expectedAgreement) &&
      value.kappa === roundNullable(raw.kappa);
  }
  if (value.status === "insufficient-pairable-units" || value.status === "insufficient-coders") {
    return raw.observedAgreement === null && raw.expectedAgreement === null && raw.kappa === null &&
      value.observedAgreement === null && value.expectedAgreement === null && value.kappa === null;
  }
  if (value.status === "legacy-ambiguous") {
    return raw.observedAgreement === null && raw.expectedAgreement === null && raw.kappa === null;
  }
  return Number(value.units) >= 2 &&
    typeof raw.observedAgreement === "number" && raw.observedAgreement === 1 &&
    typeof raw.expectedAgreement === "number" && raw.expectedAgreement === 1 &&
    raw.kappa === null &&
    value.observedAgreement === roundNullable(raw.observedAgreement) &&
    value.expectedAgreement === roundNullable(raw.expectedAgreement) &&
    value.kappa === null;
}

function expectedPairKeys(coderIds: string[]) {
  const keys: string[] = [];
  for (let left = 0; left < coderIds.length; left += 1) {
    for (let right = left + 1; right < coderIds.length; right += 1) {
      keys.push(canonicalTupleKey([coderIds[left], coderIds[right]].sort()));
    }
  }
  return keys.sort();
}

function isSenaReliabilityDashboardV2ReadModel(value: unknown): value is SenaReliabilityDashboard {
  if (!isRecord(value) ||
    value.schemaVersion !== SENA_SCHEMA_VERSIONS.codingReliabilityDashboard ||
    (value.sourceSchemaVersion !== SENA_SCHEMA_VERSIONS.codingReliabilityDashboard &&
      value.sourceSchemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.codingReliabilityDashboard) ||
    !isReliabilityEstimationStatus(value.status) ||
    !Number.isInteger(value.coderCount) || Number(value.coderCount) < 0 ||
    !Array.isArray(value.coderIds) ||
    !value.coderIds.every((coderId) => typeof coderId === "string" && coderId.length > 0) ||
    !Array.isArray(value.pairwiseCohenKappa) ||
    !value.pairwiseCohenKappa.every(isValidPairwiseKappa) ||
    !isReliabilityEstimationStatus(value.meanPairwiseKappaStatus) ||
    !finiteNumberOrNull(value.meanPairwiseKappa) ||
    !isReliabilityEstimationStatus(value.krippendorffAlphaNominalStatus) ||
    !finiteNumberOrNull(value.krippendorffAlphaNominalRaw) ||
    !finiteNumberOrNull(value.krippendorffAlphaNominal) ||
    !Number.isInteger(value.disagreementCount) || Number(value.disagreementCount) < 0 ||
    !Array.isArray(value.adjudicationQueue) ||
    !isSenaReliabilityClaimEligibilityInputs(value.claimEligibilityInputs) ||
    !isClaimEligibility(value.claimEligibility) ||
    (value.projectBinding !== undefined && !isValidSenaReliabilityProjectBinding(value.projectBinding))) return false;

  const currentSource = value.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.codingReliabilityDashboard;
  if (currentSource && !isValidSenaReliabilityDerivationEvidence(value.derivationEvidence)) return false;

  const inputs = value.claimEligibilityInputs;
  const coderIds = value.coderIds as string[];
  const adjudicationQueue = value.adjudicationQueue as unknown[];
  const adjudicationKeys = adjudicationQueue.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.itemId !== "string" || candidate.itemId.length === 0 ||
      typeof candidate.codeId !== "string" || candidate.codeId.length === 0 || !isRecord(candidate.values)) return "";
    const entries = Object.entries(candidate.values);
    if (entries.length < 2 || entries.some(([coderId, decision]) => (
      !coderIds.includes(coderId) || typeof decision !== "boolean"
    )) || new Set(entries.map(([, decision]) => decision)).size < 2) return "";
    return canonicalTupleKey([candidate.itemId, candidate.codeId]);
  });
  if (adjudicationQueue.length !== Number(value.disagreementCount) ||
    adjudicationKeys.some((key) => key.length === 0) ||
    new Set(adjudicationKeys).size !== adjudicationKeys.length) return false;
  const pairwiseStatuses = value.pairwiseCohenKappa.map((pair) => pair.status);
  const pairKeys = value.pairwiseCohenKappa
    .map((pair) => canonicalTupleKey([pair.coderA, pair.coderB].sort()))
    .sort();
  const canonicalPairKeys = expectedPairKeys(coderIds);
  if (new Set(coderIds).size !== coderIds.length ||
    coderIds.length !== value.coderCount ||
    !sameStringArray(pairKeys, canonicalPairKeys)) return false;
  if (value.projectBinding !== undefined && (
    JSON.stringify(value.projectBinding.coderIds) !== JSON.stringify(coderIds) ||
    value.projectBinding.annotatedItemIds.length !== Number(value.itemCount) ||
    value.projectBinding.annotatedCodeIds.length !== Number(value.codeCount) ||
    JSON.stringify(value.projectBinding.annotatedCodeIds) !== JSON.stringify(
      (value.codeDiagnostics as SenaCodeReliabilityDiagnostic[]).map((entry) => entry.codeId).sort()
    )
  )) return false;
  const rawMeanPairwiseKappa = pairwiseStatuses.length > 0 && pairwiseStatuses.every((status) => status === "estimable")
    ? mean(value.pairwiseCohenKappa.map((pair) => pair.raw.kappa as number))
    : null;
  const canonicalInputs: SenaReliabilityClaimEligibilityInputs = {
    coderCount: coderIds.length,
    pairwiseKappaStatuses: pairwiseStatuses,
    meanPairwiseKappa: rawMeanPairwiseKappa,
    krippendorffAlphaNominalStatus: value.krippendorffAlphaNominalStatus,
    krippendorffAlphaNominal: value.krippendorffAlphaNominalRaw,
    unresolvedDisagreementCount: Number(value.disagreementCount)
  };
  const expected = deriveSenaReliabilityClaimEligibility(canonicalInputs);
  const expectedStatus = aggregateReliabilityStatus(
    Number(value.coderCount),
    pairwiseStatuses,
    value.krippendorffAlphaNominalStatus
  );
  const expectedMeanStatus: SenaReliabilityEstimationStatus = Number(value.coderCount) < 2
    ? "insufficient-coders"
    : pairwiseStatuses.length === 0 || pairwiseStatuses.some((status) => status === "insufficient-pairable-units")
      ? "insufficient-pairable-units"
      : pairwiseStatuses.some((status) => status === "single-observed-category")
        ? "single-observed-category"
        : pairwiseStatuses.every((status) => status === "estimable")
          ? "estimable"
          : "legacy-ambiguous";
  if (currentSource) {
    const evidence = value.derivationEvidence as SenaReliabilityDerivationEvidence;
    let rebuilt: SenaReliabilityDashboard;
    try {
      rebuilt = buildSenaReliabilityDashboard(evidence.annotations, {
        skippedCells: evidence.skippedCells,
        projectBinding: value.projectBinding as SenaReliabilityProjectBinding | undefined
      });
    } catch {
      return false;
    }
    if (!sameReliabilityDashboardDerivedMetrics(value as unknown as SenaReliabilityDashboard, rebuilt) ||
      (value.projectBinding !== undefined && (
        stableBindingValue(value.projectBinding.annotationCoverage) !== stableBindingValue(evidence.annotations) ||
        stableBindingValue(value.projectBinding.skippedCellCoverage) !== stableBindingValue(evidence.skippedCells)
      ))) return false;
  }
  const legacySourceValid = !currentSource &&
    value.coderIds.length === value.coderCount &&
    value.status === "legacy-ambiguous" &&
    value.meanPairwiseKappaStatus === "legacy-ambiguous" &&
    value.meanPairwiseKappa === null &&
    value.krippendorffAlphaNominalStatus === "legacy-ambiguous" &&
    value.krippendorffAlphaNominalRaw === null &&
    value.krippendorffAlphaNominal === null &&
    value.claimEligibility.eligible === false &&
    value.claimEligibility.blockers.includes("current-v2-estimates-required");
  if (legacySourceValid) return true;

  if (value.status === "legacy-ambiguous" ||
    value.meanPairwiseKappaStatus === "legacy-ambiguous" ||
    value.krippendorffAlphaNominalStatus === "legacy-ambiguous" ||
    pairwiseStatuses.some((status) => status === "legacy-ambiguous")) return false;

  return inputs.coderCount === canonicalInputs.coderCount &&
    sameStringArray(inputs.pairwiseKappaStatuses, pairwiseStatuses) &&
    sameNullableNumber(inputs.meanPairwiseKappa, canonicalInputs.meanPairwiseKappa) &&
    inputs.krippendorffAlphaNominalStatus === canonicalInputs.krippendorffAlphaNominalStatus &&
    sameNullableNumber(inputs.krippendorffAlphaNominal, canonicalInputs.krippendorffAlphaNominal) &&
    inputs.unresolvedDisagreementCount === canonicalInputs.unresolvedDisagreementCount &&
    value.status === expectedStatus &&
    value.meanPairwiseKappaStatus === expectedMeanStatus &&
    sameNullableNumber(value.meanPairwiseKappa, roundNullable(canonicalInputs.meanPairwiseKappa)) &&
    sameNullableNumber(value.krippendorffAlphaNominal, roundNullable(value.krippendorffAlphaNominalRaw)) &&
    (value.krippendorffAlphaNominalStatus === "estimable"
      ? typeof value.krippendorffAlphaNominalRaw === "number" && value.krippendorffAlphaNominalRaw >= -1 && value.krippendorffAlphaNominalRaw <= 1
      : value.krippendorffAlphaNominalRaw === null && value.krippendorffAlphaNominal === null) &&
    isSemanticallyConsistentEligibilityInputs(canonicalInputs) &&
    sameClaimEligibility(value.claimEligibility, expected);
}

export function isCurrentSenaReliabilityDashboard(value: unknown): value is SenaReliabilityDashboard {
  return isSenaReliabilityDashboardV2ReadModel(value) &&
    value.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.codingReliabilityDashboard;
}

export function normalizeSenaReliabilityDashboard(
  value: SenaReliabilityDashboardReadModel
): SenaReliabilityDashboard {
  if (!isRecord(value)) throw new Error("SENA reliability dashboard must be an object.");
  if (value.schemaVersion === SENA_SCHEMA_VERSIONS.codingReliabilityDashboard) {
    if (!isSenaReliabilityDashboardV2ReadModel(value)) {
      throw new Error("SENA reliability dashboard v2 has contradictory or incomplete semantic eligibility evidence.");
    }
    return structuredClone(value);
  }
  if (value.schemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.codingReliabilityDashboard) {
    throw new Error("SENA reliability dashboard uses an unsupported schemaVersion.");
  }

  const legacy = value as unknown as SenaReliabilityDashboardV1;
  const pairwiseCohenKappa = Array.isArray(value.pairwiseCohenKappa)
    ? value.pairwiseCohenKappa.map(normalizeLegacyPairwiseKappa)
    : [];
  const codeDiagnostics = Array.isArray(value.codeDiagnostics)
    ? value.codeDiagnostics.filter(isRecord).map((diagnostic) => ({
      ...diagnostic,
      pairwiseCohenKappa: Array.isArray(diagnostic.pairwiseCohenKappa)
        ? diagnostic.pairwiseCohenKappa.map(normalizeLegacyPairwiseKappa)
        : []
    })) as SenaCodeReliabilityDiagnostic[]
    : [];
  const coderCount = typeof value.coderCount === "number" && Number.isFinite(value.coderCount) ? Math.max(0, Math.trunc(value.coderCount)) : 0;
  const pairCoderIds = Array.from(new Set(pairwiseCohenKappa.flatMap((pair) => [pair.coderA, pair.coderB]))).sort();
  const coderIds = Array.from({ length: coderCount }, (_, index) => pairCoderIds[index] ?? `legacy-coder-${index + 1}`);
  const meanPairwiseKappa = null;
  const alpha = null;
  const legacyEligibility = buildSenaReliabilityClaimEligibility({
    coderCount,
    pairwiseStatuses: pairwiseCohenKappa.map(() => "legacy-ambiguous"),
    meanPairwiseKappa,
    krippendorffAlphaNominal: alpha,
    krippendorffAlphaNominalStatus: "legacy-ambiguous",
    unresolvedDisagreementCount: Number.isInteger(legacy.disagreementCount)
      ? Math.max(0, legacy.disagreementCount)
      : 0
  });
  const claimEligibilityInputs: SenaReliabilityClaimEligibilityInputs = {
    coderCount,
    pairwiseKappaStatuses: pairwiseCohenKappa.map(() => "legacy-ambiguous"),
    meanPairwiseKappa,
    krippendorffAlphaNominalStatus: "legacy-ambiguous",
    krippendorffAlphaNominal: alpha,
    unresolvedDisagreementCount: Number.isInteger(legacy.disagreementCount)
      ? Math.max(0, legacy.disagreementCount)
      : 0
  };

  return {
    ...legacy,
    schemaVersion: SENA_SCHEMA_VERSIONS.codingReliabilityDashboard,
    sourceSchemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.codingReliabilityDashboard,
    status: "legacy-ambiguous",
    coderIds,
    pairwiseCohenKappa,
    codeDiagnostics,
    meanPairwiseKappaStatus: "legacy-ambiguous",
    meanPairwiseKappa,
    krippendorffAlphaNominalStatus: "legacy-ambiguous",
    krippendorffAlphaNominalRaw: null,
    krippendorffAlphaNominal: alpha,
    claimEligibilityInputs,
    claimEligibility: {
      ...legacyEligibility,
      eligible: false,
      blockers: Array.from(new Set(["current-v2-estimates-required", ...legacyEligibility.blockers]))
    },
    warnings: [
      ...(Array.isArray(value.warnings) ? value.warnings.filter((warning): warning is string => typeof warning === "string") : []),
      "Legacy v1 reliability scores use ambiguous degenerate-case conventions and are not eligible under the v2 machine gate."
    ]
  };
}

export function reliabilityDashboardToReview(
  dashboard: SenaReliabilityDashboard,
  reviewer = "SENA reliability workflow"
): Partial<SenaCodingReliabilityReview> {
  const formatEstimate = (value: number | null, status: SenaReliabilityEstimationStatus) => (
    value === null ? `not estimable (${status})` : String(value)
  );
  return {
    status: dashboard.coderCount >= 2 && dashboard.binaryUnitCount > 0 ? "documented" : "not-documented",
    reviewer,
    codingScheme: "Uploaded multi-coder annotation file",
    unitOfCoding: "item-code binary units",
    coderCount: dashboard.coderCount,
    agreementMetric: "Mean pairwise Cohen kappa; Krippendorff alpha nominal",
    agreementValue: `kappa=${formatEstimate(dashboard.meanPairwiseKappa, dashboard.meanPairwiseKappaStatus)}; alpha=${formatEstimate(dashboard.krippendorffAlphaNominal, dashboard.krippendorffAlphaNominalStatus)}`,
    adjudicationNotes: `${dashboard.disagreementCount} item-code disagreements require or document adjudication.`,
    limitations: dashboard.interpretation,
    machineEvidence: {
      dashboardSchemaVersion: dashboard.schemaVersion,
      sourceSchemaVersion: dashboard.sourceSchemaVersion,
      status: dashboard.status,
      coderIds: structuredClone(dashboard.coderIds),
      pairwiseCohenKappa: structuredClone(dashboard.pairwiseCohenKappa),
      meanPairwiseKappaStatus: dashboard.meanPairwiseKappaStatus,
      meanPairwiseKappa: dashboard.meanPairwiseKappa,
      krippendorffAlphaNominalStatus: dashboard.krippendorffAlphaNominalStatus,
      krippendorffAlphaNominalRaw: dashboard.krippendorffAlphaNominalRaw,
      krippendorffAlphaNominal: dashboard.krippendorffAlphaNominal,
      unresolvedDisagreementCount: dashboard.disagreementCount,
      allPairwiseKappaEstimable: dashboard.pairwiseCohenKappa.length > 0 && dashboard.pairwiseCohenKappa.every((pair) => pair.status === "estimable"),
      claimEligibilityInputs: structuredClone(dashboard.claimEligibilityInputs),
      claimEligibility: dashboard.claimEligibility,
      projectBindingRequired: dashboard.projectBinding ? true : undefined,
      projectBinding: dashboard.projectBinding ? structuredClone(dashboard.projectBinding) : undefined
    }
  };
}
