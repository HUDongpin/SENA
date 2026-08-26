import { createHash } from "node:crypto";
import {
  SENA_CANONICAL_UINT32_MAX,
  SENA_GROUP_COMPARISON_MAX_ITERATIONS,
  SENA_GROUP_COMPARISON_MAX_SUITE_COMPARISONS,
  SENA_GROUP_COMPARISON_MIN_ITERATIONS
} from "../analytical-input-validation";
import { canonicalSenaJson, senaJsonValuesEqual } from "../canonical-json";
import {
  createSenaGroupComparisonCarrierBudget,
  isSenaGroupComparisonValidationCarrierAdmitted,
  normalizeSenaGroupComparisonValidationResult,
  SenaGroupComparisonSourceVerificationCache,
  type SenaGroupComparisonCarrierBudget,
  type SenaGroupComparisonResult,
  type SenaGroupComparisonValidationResult
} from "../inference";
import { senaRuntimeProvenance } from "../runtime-constants";
import { SENA_LEGACY_SCHEMA_VERSIONS, SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { assertSenaProjectSnapshotAdmission } from "../snapshot";
import { SenaEnterpriseError } from "./errors";
import type { SenaEnterpriseAnalysisRun } from "./import-analysis";
import {
  enterpriseProjectEvidenceBindingMatches,
  type SenaEnterpriseProject
} from "./team-project";
import type {
  SenaEnterpriseFormalInferenceReadiness,
  SenaEnterpriseValidationParityEvidence,
  SenaEnterpriseValidationParityEvidenceInput,
  SenaEnterpriseValidationPreregistrationPlan,
  SenaEnterpriseValidationRun
} from "./validation-runs";
import { senaValidationSourceVerificationCache } from "./validation-request-scope";

export type SenaEnterpriseValidationRunSummary = Pick<
  SenaEnterpriseValidationRun,
  | "metric"
  | "groupField"
  | "groupA"
  | "groupB"
  | "iterations"
  | "seed"
  | "pTwoSided"
  | "comparisonCount"
  | "minHolmAdjustedP"
  | "significantHolmCount"
  | "observedDifference"
>;

export class SenaEnterpriseValidationRunIntegrityError extends SenaEnterpriseError {
  readonly name = "SenaEnterpriseValidationRunIntegrityError";

  constructor(readonly path: string) {
    super(
      "Stored validation evidence is not canonically bound to its reviewed result.",
      409,
      "validation_run_evidence_invalid"
    );
  }
}

function validationIntegrityFailure(path: string): never {
  throw new SenaEnterpriseValidationRunIntegrityError(path);
}

function primaryComparison(result: SenaGroupComparisonValidationResult): SenaGroupComparisonResult {
  return result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite
    ? result.primary
    : result;
}

function comparisonPlanRow(result: SenaGroupComparisonResult) {
  return {
    metric: result.metric,
    groupField: result.groupField,
    groupA: result.groupA,
    groupB: result.groupB
  };
}

function artifactSha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const SENA_VALIDATION_EVIDENCE_MAX_TEXT_BYTES = 4 * 1024;
const SENA_VALIDATION_EVIDENCE_MAX_ARRAY_ENTRIES = 28;
const SENA_VALIDATION_EVIDENCE_MAX_NOTES = 29;
const SENA_VALIDATION_FORMAL_CHECK_COUNT = 6;
const SENA_VALIDATION_GATE_COUNT = 5;
const SENA_VALIDATION_RUNTIME_PARITY_MAX_COVERAGE_ENTRIES = Math.max(
  0,
  ...senaRuntimeProvenance.parityEvidence.map((entry) => entry.coverage.length)
);
export const SENA_ENTERPRISE_VALIDATION_RUN_RETENTION_LIMIT = 1_000;

const SENA_ENTERPRISE_VALIDATION_RUN_REQUIRED_KEYS = [
  "id", "teamId", "userId", "status", "preregistrationNote", "methodNote",
  "metric", "groupField", "groupA", "groupB", "iterations", "seed",
  "pTwoSided", "observedDifference", "result", "createdAt"
] as const;
const SENA_ENTERPRISE_VALIDATION_RUN_OPTIONAL_KEYS = [
  "projectId", "projectBinding", "reviewerId", "reviewedAt", "reviewNotes",
  "comparisonCount", "minHolmAdjustedP", "significantHolmCount",
  "validationRunEvidenceSchemaVersion", "validationRunEvidenceHash",
  "preregistrationPlan", "parityEvidence"
] as const;
const SENA_ENTERPRISE_VALIDATION_ANALYSIS_SOURCE_REQUIRED_KEYS = [
  "id", "teamId", "artifactFingerprints"
] as const;
const SENA_ENTERPRISE_VALIDATION_ANALYSIS_SOURCE_OPTIONAL_KEYS = [
  "projectId", "persistedProjectId", "userId", "sourceKind", "title",
  "includeRuntimeBundle", "datasetCounts", "analysisDatasetCounts",
  "activeTemporalWindow", "summary", "createdAt"
] as const;
const SENA_ENTERPRISE_VALIDATION_ANALYSIS_FINGERPRINT_REQUIRED_KEYS = [
  "reportSha256", "projectSnapshotSha256"
] as const;
const SENA_ENTERPRISE_VALIDATION_ANALYSIS_FINGERPRINT_OPTIONAL_KEYS = [
  "projectSnapshotBindingSha256", "runtimeBundleSha256"
] as const;
const SENA_ENTERPRISE_VALIDATION_PROJECT_SOURCE_REQUIRED_KEYS = [
  "id", "teamId", "currentVersion", "snapshot"
] as const;
const SENA_ENTERPRISE_VALIDATION_PROJECT_SOURCE_OPTIONAL_KEYS = [
  "ownerId", "title", "description", "datasetCounts", "activeWindowLabel",
  "claimUse", "createdAt", "updatedAt"
] as const;
const SENA_ENTERPRISE_VALIDATION_REVISION_SOURCE_REQUIRED_KEYS = [
  "projectId", "teamId", "version", "snapshot"
] as const;
const SENA_ENTERPRISE_VALIDATION_REVISION_SOURCE_OPTIONAL_KEYS = [
  "id", "userId", "summary", "datasetCounts", "activeWindowLabel",
  "claimUse", "createdAt"
] as const;

function isEvidenceRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function evidenceRuntimeIdentifiesProxy(value: object) {
  try {
    const runtimeProcess = (globalThis as typeof globalThis & {
      process?: {
        getBuiltinModule?: (id: string) => unknown;
      };
    }).process;
    const util = runtimeProcess?.getBuiltinModule?.("node:util") as {
      types?: { isProxy?: (candidate: unknown) => boolean };
    } | undefined;
    return util?.types?.isProxy?.(value) === true;
  } catch {
    return false;
  }
}

function evidenceOwnDataDescriptors(value: object, expectedPrototype: object | null) {
  if (evidenceRuntimeIdentifiesProxy(value)) return undefined;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== expectedPrototype && prototype !== null) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const descriptor of Object.values(descriptors)) {
      if (!("value" in descriptor)) return undefined;
    }
    return descriptors;
  } catch {
    return undefined;
  }
}

function hasExactEvidenceKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> {
  if (!isEvidenceRecord(value)) return false;
  const allowed = new Set([...required, ...optional]);
  const descriptors = evidenceOwnDataDescriptors(value, Object.prototype);
  if (!descriptors) return false;
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.length > allowed.size) return false;
  for (const key of ownKeys) {
    if (typeof key !== "string" || !allowed.has(key)) return false;
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return false;
  }
  return required.every((key) => Object.hasOwn(descriptors, key));
}

function isDenseEvidenceArray(value: unknown, maximum: number): value is unknown[] {
  if (!Array.isArray(value)) return false;
  const descriptors = evidenceOwnDataDescriptors(value, Array.prototype);
  const lengthDescriptor = descriptors?.length;
  const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : undefined;
  if (!descriptors || !Number.isSafeInteger(length) || (length as number) > maximum) return false;
  let ownIndexes = 0;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)) return false;
    const index = Number(key);
    const descriptor = descriptors[key];
    if (!Number.isSafeInteger(index) || index < 0 || index >= (length as number) || String(index) !== key ||
      !descriptor || !("value" in descriptor) || !descriptor.enumerable) return false;
    ownIndexes += 1;
  }
  return ownIndexes === length;
}

function isBoundedEvidenceText(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= SENA_VALIDATION_EVIDENCE_MAX_TEXT_BYTES &&
    Buffer.byteLength(value, "utf8") <= SENA_VALIDATION_EVIDENCE_MAX_TEXT_BYTES;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && value.length === 64 && /^[a-f0-9]{64}$/.test(value);
}

function isSafeIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function isFiniteNumberBetween(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isBoundedEvidenceTextArray(
  value: unknown,
  maximumEntries = SENA_VALIDATION_EVIDENCE_MAX_ARRAY_ENTRIES
): value is string[] {
  if (!isDenseEvidenceArray(value, maximumEntries)) return false;
  let totalBytes = 0;
  for (const entry of value) {
    if (!isBoundedEvidenceText(entry)) return false;
    totalBytes += entry.length;
    if (totalBytes > SENA_VALIDATION_EVIDENCE_MAX_TEXT_BYTES * maximumEntries) return false;
  }
  return true;
}

function isBoundedComparisonPlanRow(value: unknown) {
  return hasExactEvidenceKeys(value, ["metric", "groupField", "groupA", "groupB"]) &&
    isBoundedEvidenceText(value.metric) &&
    isBoundedEvidenceText(value.groupField) &&
    isBoundedEvidenceText(value.groupA) &&
    isBoundedEvidenceText(value.groupB);
}

function validationResultComparisonCount(value: unknown) {
  if (!isEvidenceRecord(value)) return undefined;
  if (value.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparison ||
    value.schemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.groupComparison) return 1;
  if (value.schemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite &&
    value.schemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite) return undefined;
  if (!Array.isArray(value.comparisons) || value.comparisons.length === 0 ||
    value.comparisons.length > SENA_GROUP_COMPARISON_MAX_SUITE_COMPARISONS) return undefined;
  return value.comparisons.length;
}

function hasBoundedValidationPreregistrationPlan(
  value: unknown,
  expectedComparisonCount?: number
): value is SenaEnterpriseValidationPreregistrationPlan {
  if (!hasExactEvidenceKeys(value, [
    "schemaVersion", "planHash", "hashAlgorithm", "analysis", "primary",
    "comparisons", "parameters", "guardrail", "evidence"
  ], ["protocolNoteHash", "methodNoteHash"])) return false;
  const suite = value.analysis === "holm-suite";
  if (value.schemaVersion !== SENA_SCHEMA_VERSIONS.validationPreregistrationPlan ||
    !isSha256(value.planHash) || value.hashAlgorithm !== "sha256" ||
    (value.analysis !== "single-comparison" && !suite) ||
    (value.protocolNoteHash !== undefined && !isSha256(value.protocolNoteHash)) ||
    (value.methodNoteHash !== undefined && !isSha256(value.methodNoteHash)) ||
    !Array.isArray(value.comparisons) || value.comparisons.length === 0 ||
    value.comparisons.length > SENA_GROUP_COMPARISON_MAX_SUITE_COMPARISONS ||
    (expectedComparisonCount !== undefined && value.comparisons.length !== expectedComparisonCount) ||
    !isBoundedComparisonPlanRow(value.primary) ||
    !value.comparisons.every(isBoundedComparisonPlanRow) ||
    !hasExactEvidenceKeys(value.parameters, [
      "permutationIterations", "bootstrapIterations", "seed"
    ], ["alpha", "correction"]) ||
    !isSafeIntegerBetween(
      value.parameters.permutationIterations,
      SENA_GROUP_COMPARISON_MIN_ITERATIONS,
      SENA_GROUP_COMPARISON_MAX_ITERATIONS
    ) ||
    !isSafeIntegerBetween(
      value.parameters.bootstrapIterations,
      SENA_GROUP_COMPARISON_MIN_ITERATIONS,
      SENA_GROUP_COMPARISON_MAX_ITERATIONS
    ) ||
    !isSafeIntegerBetween(value.parameters.seed, 0, SENA_CANONICAL_UINT32_MAX) ||
    (suite
      ? !isFiniteNumberBetween(value.parameters.alpha, Number.MIN_VALUE, 1) ||
        value.parameters.correction !== "holm"
      : value.parameters.alpha !== undefined || value.parameters.correction !== undefined) ||
    !isBoundedEvidenceText(value.guardrail) ||
    !isBoundedEvidenceTextArray(value.evidence, suite ? 8 : 7) ||
    value.evidence.length !== (suite ? 8 : 7)) return false;
  return true;
}

function hasBoundedValidationFormalInference(value: unknown) {
  if (!hasExactEvidenceKeys(value, [
    "schemaVersion", "status", "resultSchemaVersion", "analysis",
    "preregistrationPlanHash", "comparisonCount", "minGroupSize",
    "smallSampleComparisons", "permutationIterations", "bootstrapIterations",
    "checks", "blockers", "warnings", "guardrail"
  ], ["studySpecificInferenceReference", "alpha", "correction"]) ||
    value.schemaVersion !== SENA_SCHEMA_VERSIONS.formalInferenceReadiness ||
    (value.status !== "model-referenced" &&
      value.status !== "model-required" &&
      value.status !== "incomplete") ||
    (value.resultSchemaVersion !== SENA_SCHEMA_VERSIONS.groupComparison &&
      value.resultSchemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite) ||
    (value.analysis !== "single-comparison" && value.analysis !== "holm-suite") ||
    !isSha256(value.preregistrationPlanHash) ||
    (value.studySpecificInferenceReference !== undefined &&
      !isBoundedEvidenceText(value.studySpecificInferenceReference)) ||
    !isSafeIntegerBetween(value.comparisonCount, 1, SENA_GROUP_COMPARISON_MAX_SUITE_COMPARISONS) ||
    !isSafeIntegerBetween(value.minGroupSize, 0, Number.MAX_SAFE_INTEGER) ||
    !isSafeIntegerBetween(value.smallSampleComparisons, 0, SENA_GROUP_COMPARISON_MAX_SUITE_COMPARISONS) ||
    !isSafeIntegerBetween(
      value.permutationIterations,
      SENA_GROUP_COMPARISON_MIN_ITERATIONS,
      SENA_GROUP_COMPARISON_MAX_ITERATIONS
    ) ||
    !isSafeIntegerBetween(
      value.bootstrapIterations,
      SENA_GROUP_COMPARISON_MIN_ITERATIONS,
      SENA_GROUP_COMPARISON_MAX_ITERATIONS
    ) ||
    (value.analysis === "holm-suite"
      ? !isFiniteNumberBetween(value.alpha, Number.MIN_VALUE, 1) || value.correction !== "holm"
      : value.alpha !== undefined || value.correction !== undefined) ||
    !Array.isArray(value.checks) || value.checks.length !== SENA_VALIDATION_FORMAL_CHECK_COUNT ||
    !isBoundedEvidenceTextArray(value.blockers, 5) ||
    !isBoundedEvidenceTextArray(value.warnings, 2) ||
    !isBoundedEvidenceText(value.guardrail)) return false;
  for (const check of value.checks) {
    if (!hasExactEvidenceKeys(check, ["id", "label", "status", "evidence"]) ||
      !isBoundedEvidenceText(check.id) || !isBoundedEvidenceText(check.label) ||
      !isBoundedEvidenceText(check.status) || !isBoundedEvidenceTextArray(check.evidence, 4)) return false;
  }
  return true;
}

function hasBoundedValidationParityEvidence(
  value: unknown
): value is SenaEnterpriseValidationParityEvidence {
  if (!hasExactEvidenceKeys(value, [
    "schemaVersion", "status", "validationRunHash", "hashAlgorithm", "analysis",
    "preregistrationPlanHash", "runtimeParity", "walkthrough", "inference",
    "formalInference", "gates", "notes"
  ]) ||
    value.schemaVersion !== SENA_SCHEMA_VERSIONS.validationParityEvidence ||
    (value.status !== "ready-for-review" && value.status !== "incomplete") ||
    !isSha256(value.validationRunHash) || value.hashAlgorithm !== "sha256" ||
    (value.analysis !== "single-comparison" && value.analysis !== "holm-suite") ||
    !isSha256(value.preregistrationPlanHash) ||
    !Array.isArray(value.runtimeParity) ||
    value.runtimeParity.length > senaRuntimeProvenance.parityEvidence.length ||
    !Array.isArray(value.gates) || value.gates.length !== SENA_VALIDATION_GATE_COUNT ||
    !isBoundedEvidenceTextArray(value.notes, SENA_VALIDATION_EVIDENCE_MAX_NOTES) ||
    !hasExactEvidenceKeys(value.walkthrough, ["datasetLabel", "source", "status"], ["datasetHash", "sourceId"]) ||
    !isBoundedEvidenceText(value.walkthrough.datasetLabel) ||
    !isBoundedEvidenceText(value.walkthrough.source) ||
    !isBoundedEvidenceText(value.walkthrough.status) ||
    (value.walkthrough.datasetHash !== undefined && !isSha256(value.walkthrough.datasetHash)) ||
    (value.walkthrough.sourceId !== undefined && !isBoundedEvidenceText(value.walkthrough.sourceId)) ||
    !hasExactEvidenceKeys(value.inference, [
      "resultSchemaVersion", "guardrail", "comparisonCount", "permutationIterations",
      "bootstrapIterations"
    ], ["alpha", "correction", "studySpecificInferenceReference"]) ||
    (value.inference.resultSchemaVersion !== SENA_SCHEMA_VERSIONS.groupComparison &&
      value.inference.resultSchemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite) ||
    !isBoundedEvidenceText(value.inference.guardrail) ||
    !isSafeIntegerBetween(value.inference.comparisonCount, 1, SENA_GROUP_COMPARISON_MAX_SUITE_COMPARISONS) ||
    !isSafeIntegerBetween(
      value.inference.permutationIterations,
      SENA_GROUP_COMPARISON_MIN_ITERATIONS,
      SENA_GROUP_COMPARISON_MAX_ITERATIONS
    ) ||
    !isSafeIntegerBetween(
      value.inference.bootstrapIterations,
      SENA_GROUP_COMPARISON_MIN_ITERATIONS,
      SENA_GROUP_COMPARISON_MAX_ITERATIONS
    ) ||
    (value.analysis === "holm-suite"
      ? !isFiniteNumberBetween(value.inference.alpha, Number.MIN_VALUE, 1) ||
        value.inference.correction !== "holm"
      : value.inference.alpha !== undefined || value.inference.correction !== undefined) ||
    (value.inference.studySpecificInferenceReference !== undefined &&
      !isBoundedEvidenceText(value.inference.studySpecificInferenceReference)) ||
    !hasBoundedValidationFormalInference(value.formalInference)) return false;
  for (const entry of value.runtimeParity) {
    if (!hasExactEvidenceKeys(entry, [
      "id", "referenceRuntime", "fixturePath", "status", "coverage", "sampleHash", "interpretation"
    ]) || !isBoundedEvidenceText(entry.id) || !isBoundedEvidenceText(entry.referenceRuntime) ||
      !isBoundedEvidenceText(entry.fixturePath) || !isBoundedEvidenceText(entry.status) ||
      !isBoundedEvidenceTextArray(
        entry.coverage,
        SENA_VALIDATION_RUNTIME_PARITY_MAX_COVERAGE_ENTRIES
      ) || !isSha256(entry.sampleHash) ||
      !isBoundedEvidenceText(entry.interpretation)) return false;
  }
  for (const gate of value.gates) {
    if (!hasExactEvidenceKeys(gate, ["id", "label", "status", "evidence"]) ||
      !isBoundedEvidenceText(gate.id) || !isBoundedEvidenceText(gate.label) ||
      !isBoundedEvidenceText(gate.status) || !isBoundedEvidenceTextArray(gate.evidence, 4)) return false;
  }
  return true;
}

function hasBoundedValidationRunEvidenceCarriers(
  run: SenaEnterpriseValidationRun,
  options: { resultAlreadyAdmitted?: boolean } = {}
) {
  if (!hasExactEvidenceKeys(
    run,
    SENA_ENTERPRISE_VALIDATION_RUN_REQUIRED_KEYS,
    SENA_ENTERPRISE_VALIDATION_RUN_OPTIONAL_KEYS
  )) return false;
  if (!options.resultAlreadyAdmitted &&
    !isSenaGroupComparisonValidationCarrierAdmitted(run.result)) return false;
  const resultComparisonCount = validationResultComparisonCount(run.result);
  if (
    resultComparisonCount === undefined ||
    !isBoundedEvidenceText(run.id) || !isBoundedEvidenceText(run.teamId) ||
    !isBoundedEvidenceText(run.userId) || !isBoundedEvidenceText(run.preregistrationNote) ||
    !isBoundedEvidenceText(run.methodNote) ||
    !isBoundedEvidenceText(run.metric) || !isBoundedEvidenceText(run.groupField) ||
    !isBoundedEvidenceText(run.groupA) || !isBoundedEvidenceText(run.groupB) ||
    !isSafeIntegerBetween(run.iterations, SENA_GROUP_COMPARISON_MIN_ITERATIONS, SENA_GROUP_COMPARISON_MAX_ITERATIONS) ||
    !isSafeIntegerBetween(run.seed, 0, SENA_CANONICAL_UINT32_MAX) ||
    !isFiniteNumberBetween(run.pTwoSided, 0, 1) ||
    typeof run.observedDifference !== "number" || !Number.isFinite(run.observedDifference) ||
    !isBoundedEvidenceText(run.createdAt) ||
    (run.status !== "pending-review" && run.status !== "approved" && run.status !== "rejected") ||
    (run.projectId !== undefined && !isBoundedEvidenceText(run.projectId)) ||
    (run.reviewerId !== undefined && !isBoundedEvidenceText(run.reviewerId)) ||
    (run.reviewedAt !== undefined && !isBoundedEvidenceText(run.reviewedAt)) ||
    (run.reviewNotes !== undefined && !isBoundedEvidenceText(run.reviewNotes)) ||
    (run.validationRunEvidenceSchemaVersion !== undefined &&
      run.validationRunEvidenceSchemaVersion !== SENA_SCHEMA_VERSIONS.enterpriseValidationRunEvidence) ||
    (run.validationRunEvidenceHash !== undefined && !isSha256(run.validationRunEvidenceHash)) ||
    (run.projectBinding !== undefined && !hasExactEvidenceKeys(
      run.projectBinding,
      ["projectId", "projectVersion", "snapshotSha256"]
    )) ||
    (run.projectBinding !== undefined && (
      !isBoundedEvidenceText(run.projectBinding.projectId) ||
      !isSafeIntegerBetween(run.projectBinding.projectVersion, 1, Number.MAX_SAFE_INTEGER) ||
      !isSha256(run.projectBinding.snapshotSha256)
    )) ||
    (run.preregistrationPlan !== undefined &&
      !hasBoundedValidationPreregistrationPlan(run.preregistrationPlan, resultComparisonCount)) ||
    (run.parityEvidence !== undefined &&
      !hasBoundedValidationParityEvidence(run.parityEvidence))) return false;
  return true;
}

export function projectEnterpriseValidationRunReadCarrier(
  raw: unknown,
  resultCarrierBudget?: SenaGroupComparisonCarrierBudget
): SenaEnterpriseValidationRun {
  const legacyRequiredKeys = SENA_ENTERPRISE_VALIDATION_RUN_REQUIRED_KEYS.filter((key) => (
    key !== "status" && key !== "preregistrationNote" && key !== "methodNote"
  ));
  const legacyOptionalKeys = [
    ...SENA_ENTERPRISE_VALIDATION_RUN_OPTIONAL_KEYS,
    "status",
    "preregistrationNote",
    "methodNote"
  ];
  if (!hasExactEvidenceKeys(raw, legacyRequiredKeys, legacyOptionalKeys) ||
    !isSenaGroupComparisonValidationCarrierAdmitted(raw.result, resultCarrierBudget)) {
    return validationIntegrityFailure("resourceAdmission");
  }
  const sealFieldPresent = Object.hasOwn(raw, "validationRunEvidenceSchemaVersion") ||
    Object.hasOwn(raw, "validationRunEvidenceHash");
  if (sealFieldPresent && (
    !Object.hasOwn(raw, "status") ||
    !Object.hasOwn(raw, "preregistrationNote") ||
    !Object.hasOwn(raw, "methodNote")
  )) return validationIntegrityFailure("resourceAdmission");

  const result = raw.result as Record<string, unknown>;
  const projected: Record<string, unknown> = {
    id: raw.id,
    teamId: raw.teamId,
    userId: raw.userId,
    status: raw.status ?? "pending-review",
    preregistrationNote: raw.preregistrationNote ?? "",
    methodNote: raw.methodNote ?? result.guardrail ?? "",
    metric: raw.metric,
    groupField: raw.groupField,
    groupA: raw.groupA,
    groupB: raw.groupB,
    iterations: raw.iterations,
    seed: raw.seed,
    pTwoSided: raw.pTwoSided,
    observedDifference: raw.observedDifference,
    result: raw.result,
    createdAt: raw.createdAt
  };
  for (const key of SENA_ENTERPRISE_VALIDATION_RUN_OPTIONAL_KEYS) {
    if (Object.hasOwn(raw, key)) projected[key] = raw[key];
  }
  if (!hasBoundedValidationRunEvidenceCarriers(
    projected as unknown as SenaEnterpriseValidationRun,
    { resultAlreadyAdmitted: true }
  )) return validationIntegrityFailure("resourceAdmission");
  return projected as unknown as SenaEnterpriseValidationRun;
}

const SENA_ENTERPRISE_VALIDATION_ANALYSIS_RUN_RETENTION_LIMIT = 2_000;
const SENA_ENTERPRISE_VALIDATION_PROJECT_REVISION_LIMIT = 100_000;
const SENA_ENTERPRISE_VALIDATION_PROJECT_LIMIT = 10_000;
const SENA_ENTERPRISE_VALIDATION_SOURCE_IDENTITY_MAX_BYTES = 8 * 1024 * 1024;
const SENA_ENTERPRISE_VALIDATION_SOURCE_SNAPSHOT_MAX_BYTES = 128 * 1024 * 1024;

type SenaEnterpriseValidationSourceCarrierBudget = {
  identityBytes: number;
  snapshotBytes: number;
};

function reserveEnterpriseValidationSourceIdentityText(
  value: string,
  budget: SenaEnterpriseValidationSourceCarrierBudget
) {
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes > SENA_VALIDATION_EVIDENCE_MAX_TEXT_BYTES ||
    bytes > SENA_ENTERPRISE_VALIDATION_SOURCE_IDENTITY_MAX_BYTES - budget.identityBytes) {
    return validationIntegrityFailure("resourceAdmission");
  }
  budget.identityBytes += bytes;
}

function admitEnterpriseValidationSourceSnapshot(
  snapshot: SenaEnterpriseProject["snapshot"],
  budget: SenaEnterpriseValidationSourceCarrierBudget,
  snapshotHashCache: SenaEnterpriseValidationSnapshotHashCache
) {
  if (snapshotHashCache.has(snapshot as object)) return;
  try {
    assertSenaProjectSnapshotAdmission(snapshot);
  } catch {
    return validationIntegrityFailure("resourceAdmission");
  }
  const canonical = canonicalSenaJson(snapshot);
  if (canonical === undefined) return validationIntegrityFailure("resourceAdmission");
  const bytes = Buffer.byteLength(canonical, "utf8");
  if (bytes > SENA_ENTERPRISE_VALIDATION_SOURCE_SNAPSHOT_MAX_BYTES - budget.snapshotBytes) {
    return validationIntegrityFailure("resourceAdmission");
  }
  budget.snapshotBytes += bytes;
  snapshotHashCache.set(snapshot as object, {
    bindingSha256: createHash("sha256").update(canonical).digest("hex")
  });
}

function validationProjectRevisionIdentityKey(input: {
  projectId: string;
  teamId: string;
  version: number;
}) {
  return JSON.stringify([input.projectId, input.teamId, input.version]);
}

function projectEnterpriseValidationAnalysisRunSources(
  raw: unknown,
  budget: SenaEnterpriseValidationSourceCarrierBudget
): SenaEnterpriseValidationAnalysisRunSource[] {
  if (!isDenseEvidenceArray(raw, SENA_ENTERPRISE_VALIDATION_ANALYSIS_RUN_RETENTION_LIMIT)) {
    return validationIntegrityFailure("resourceAdmission");
  }
  const projected: SenaEnterpriseValidationAnalysisRunSource[] = [];
  const ids = new Set<string>();
  for (const candidate of raw) {
    if (!hasExactEvidenceKeys(
      candidate,
      SENA_ENTERPRISE_VALIDATION_ANALYSIS_SOURCE_REQUIRED_KEYS,
      SENA_ENTERPRISE_VALIDATION_ANALYSIS_SOURCE_OPTIONAL_KEYS
    )) return validationIntegrityFailure("resourceAdmission");
    const artifactFingerprints = candidate.artifactFingerprints;
    if (!hasExactEvidenceKeys(
      artifactFingerprints,
      SENA_ENTERPRISE_VALIDATION_ANALYSIS_FINGERPRINT_REQUIRED_KEYS,
      SENA_ENTERPRISE_VALIDATION_ANALYSIS_FINGERPRINT_OPTIONAL_KEYS
    ) ||
      !isBoundedEvidenceText(candidate.id) || !candidate.id.trim() ||
      !isBoundedEvidenceText(candidate.teamId) || !candidate.teamId.trim() ||
      (candidate.projectId !== undefined &&
        (!isBoundedEvidenceText(candidate.projectId) || !candidate.projectId.trim())) ||
      (candidate.persistedProjectId !== undefined &&
        (!isBoundedEvidenceText(candidate.persistedProjectId) || !candidate.persistedProjectId.trim())) ||
      !isSha256(artifactFingerprints.reportSha256) ||
      !isSha256(artifactFingerprints.projectSnapshotSha256) ||
      (artifactFingerprints.projectSnapshotBindingSha256 !== undefined &&
        !isSha256(artifactFingerprints.projectSnapshotBindingSha256)) ||
      (artifactFingerprints.runtimeBundleSha256 !== undefined &&
        !isSha256(artifactFingerprints.runtimeBundleSha256)) ||
      ids.has(candidate.id)) return validationIntegrityFailure("resourceAdmission");
    for (const text of [
      candidate.id,
      candidate.teamId,
      candidate.projectId,
      candidate.persistedProjectId,
      artifactFingerprints.reportSha256,
      artifactFingerprints.projectSnapshotSha256,
      artifactFingerprints.projectSnapshotBindingSha256,
      artifactFingerprints.runtimeBundleSha256
    ]) {
      if (text !== undefined) reserveEnterpriseValidationSourceIdentityText(text, budget);
    }
    ids.add(candidate.id);
    projected.push({
      id: candidate.id,
      teamId: candidate.teamId,
      ...(candidate.projectId !== undefined ? { projectId: candidate.projectId } : {}),
      ...(candidate.persistedProjectId !== undefined
        ? { persistedProjectId: candidate.persistedProjectId }
        : {}),
      artifactFingerprints: {
        reportSha256: artifactFingerprints.reportSha256,
        projectSnapshotSha256: artifactFingerprints.projectSnapshotSha256,
        ...(artifactFingerprints.projectSnapshotBindingSha256 !== undefined
          ? {
              projectSnapshotBindingSha256:
                artifactFingerprints.projectSnapshotBindingSha256
            }
          : {}),
        ...(artifactFingerprints.runtimeBundleSha256 !== undefined
          ? { runtimeBundleSha256: artifactFingerprints.runtimeBundleSha256 }
          : {})
      }
    });
  }
  return projected;
}

function projectEnterpriseValidationProjectRevisionSources(
  raw: unknown,
  requiredIdentities: ReadonlySet<string> | undefined,
  budget: SenaEnterpriseValidationSourceCarrierBudget,
  snapshotHashCache: SenaEnterpriseValidationSnapshotHashCache
): SenaEnterpriseValidationProjectRevisionSource[] {
  if (!isDenseEvidenceArray(raw, SENA_ENTERPRISE_VALIDATION_PROJECT_REVISION_LIMIT)) {
    return validationIntegrityFailure("resourceAdmission");
  }
  const projected: SenaEnterpriseValidationProjectRevisionSource[] = [];
  for (const candidate of raw) {
    if (!hasExactEvidenceKeys(
      candidate,
      SENA_ENTERPRISE_VALIDATION_REVISION_SOURCE_REQUIRED_KEYS,
      SENA_ENTERPRISE_VALIDATION_REVISION_SOURCE_OPTIONAL_KEYS
    ) ||
      !isBoundedEvidenceText(candidate.projectId) || !candidate.projectId.trim() ||
      !isBoundedEvidenceText(candidate.teamId) || !candidate.teamId.trim() ||
      !isSafeIntegerBetween(candidate.version, 1, Number.MAX_SAFE_INTEGER) ||
      !isEvidenceRecord(candidate.snapshot)) return validationIntegrityFailure("resourceAdmission");
    reserveEnterpriseValidationSourceIdentityText(candidate.projectId, budget);
    reserveEnterpriseValidationSourceIdentityText(candidate.teamId, budget);
    const identityKey = validationProjectRevisionIdentityKey({
      projectId: candidate.projectId,
      teamId: candidate.teamId,
      version: candidate.version
    });
    if (requiredIdentities && !requiredIdentities.has(identityKey)) continue;
    // Preserve every bounded candidate for the semantic index below. The
    // binding hash may disambiguate historical rows that share an identity,
    // while an exact duplicate must remain ambiguous and fail projectBinding.
    admitEnterpriseValidationSourceSnapshot(
      candidate.snapshot as SenaEnterpriseProject["snapshot"],
      budget,
      snapshotHashCache
    );
    projected.push({
      projectId: candidate.projectId,
      teamId: candidate.teamId,
      version: candidate.version,
      snapshot: candidate.snapshot as SenaEnterpriseProject["snapshot"]
    });
  }
  return projected;
}

function projectEnterpriseValidationProjects(
  raw: unknown,
  requiredProjectIds: ReadonlySet<string>,
  budget: SenaEnterpriseValidationSourceCarrierBudget,
  snapshotHashCache: SenaEnterpriseValidationSnapshotHashCache
): Array<Pick<SenaEnterpriseProject, "id" | "teamId" | "currentVersion" | "snapshot">> {
  if (!isDenseEvidenceArray(raw, SENA_ENTERPRISE_VALIDATION_PROJECT_LIMIT)) {
    return validationIntegrityFailure("resourceAdmission");
  }
  const ids = new Set<string>();
  const projected: Array<Pick<
    SenaEnterpriseProject,
    "id" | "teamId" | "currentVersion" | "snapshot"
  >> = [];
  for (const candidate of raw) {
    if (!hasExactEvidenceKeys(
      candidate,
      SENA_ENTERPRISE_VALIDATION_PROJECT_SOURCE_REQUIRED_KEYS,
      SENA_ENTERPRISE_VALIDATION_PROJECT_SOURCE_OPTIONAL_KEYS
    ) ||
      !isBoundedEvidenceText(candidate.id) || !candidate.id.trim() ||
      !isBoundedEvidenceText(candidate.teamId) || !candidate.teamId.trim() ||
      !isSafeIntegerBetween(candidate.currentVersion, 1, Number.MAX_SAFE_INTEGER) ||
      !isEvidenceRecord(candidate.snapshot) || ids.has(candidate.id)) {
      return validationIntegrityFailure("resourceAdmission");
    }
    ids.add(candidate.id);
    reserveEnterpriseValidationSourceIdentityText(candidate.id, budget);
    reserveEnterpriseValidationSourceIdentityText(candidate.teamId, budget);
    if (!requiredProjectIds.has(candidate.id)) continue;
    admitEnterpriseValidationSourceSnapshot(
      candidate.snapshot as SenaEnterpriseProject["snapshot"],
      budget,
      snapshotHashCache
    );
    projected.push({
      id: candidate.id,
      teamId: candidate.teamId,
      currentVersion: candidate.currentVersion,
      snapshot: candidate.snapshot as SenaEnterpriseProject["snapshot"]
    });
  }
  return projected;
}

export function normalizeEnterpriseValidationRunCollectionEvidence(input: {
  runs: unknown;
  projects: Array<Pick<SenaEnterpriseProject, "id" | "teamId" | "currentVersion" | "snapshot">>;
  projectRevisions?: SenaEnterpriseValidationProjectRevisionSource[];
  analysisRuns?: SenaEnterpriseValidationAnalysisRunSource[];
  evidenceHash?: "ignore" | "optional" | "required";
  sourceVerificationCache?: SenaGroupComparisonSourceVerificationCache;
}) {
  if (!isDenseEvidenceArray(input.runs, SENA_ENTERPRISE_VALIDATION_RUN_RETENTION_LIMIT)) {
    return validationIntegrityFailure("resourceAdmission");
  }
  // Phase 1 is intentionally carrier-only across the entire collection. A
  // malformed final row must be rejected before an earlier row can hash a
  // project snapshot, construct a model, or replay statistical evidence.
  const resultCarrierBudget = createSenaGroupComparisonCarrierBudget();
  const runs = input.runs.map((raw) => (
    projectEnterpriseValidationRunReadCarrier(raw, resultCarrierBudget)
  ));
  const sourceCarrierBudget: SenaEnterpriseValidationSourceCarrierBudget = {
    identityBytes: 0,
    snapshotBytes: 0
  };
  const snapshotHashCache: SenaEnterpriseValidationSnapshotHashCache = new WeakMap();
  const requiredProjectIds = new Set<string>();
  const requiredRevisionIdentities = new Set<string>();
  for (const run of runs) {
    if (!run.projectId) continue;
    requiredProjectIds.add(run.projectId);
    if (run.projectBinding) {
      requiredRevisionIdentities.add(validationProjectRevisionIdentityKey({
        projectId: run.projectId,
        teamId: run.teamId,
        version: run.projectBinding.projectVersion
      }));
    }
  }
  const analysisRuns = projectEnterpriseValidationAnalysisRunSources(
    input.analysisRuns ?? [],
    sourceCarrierBudget
  );
  const projects = projectEnterpriseValidationProjects(
    input.projects,
    requiredProjectIds,
    sourceCarrierBudget,
    snapshotHashCache
  );
  const projectRevisions = projectEnterpriseValidationProjectRevisionSources(
    input.projectRevisions ?? [],
    requiredRevisionIdentities,
    sourceCarrierBudget,
    snapshotHashCache
  );
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const projectRevisionIndex = new SenaEnterpriseValidationProjectRevisionIndex(
    projectRevisions,
    snapshotHashCache
  );
  const sourceVerificationCache = input.sourceVerificationCache ??
    senaValidationSourceVerificationCache();
  const analysisRunIndex = new SenaEnterpriseValidationAnalysisRunIndex(analysisRuns);
  return runs.map((run) => {
    const project = run.projectId ? projectById.get(run.projectId) : undefined;
    return normalizeEnterpriseValidationRunEvidence(run, project, {
      evidenceHash: input.evidenceHash ?? "optional",
      projectRevisions,
      projectRevisionIndex,
      analysisRuns,
      analysisRunIndex,
      snapshotHashCache,
      sourceVerificationCache
    });
  });
}

export type SenaEnterpriseValidationSnapshotHashes = {
  bindingSha256: string;
};

export type SenaEnterpriseValidationSnapshotHashCache = WeakMap<
  object,
  SenaEnterpriseValidationSnapshotHashes
>;

type SenaEnterpriseValidationProjectRevisionSource = {
  projectId: string;
  teamId: string;
  version: number;
  snapshot: SenaEnterpriseProject["snapshot"];
};

export class SenaEnterpriseValidationProjectRevisionIndex {
  private readonly byIdentity = new Map<string, SenaEnterpriseValidationProjectRevisionSource[]>();
  private readonly byIdentityAndHash = new Map<
    string,
    Map<string, SenaEnterpriseValidationProjectRevisionSource | null>
  >();
  private candidateInspections = 0;

  constructor(
    revisions: SenaEnterpriseValidationProjectRevisionSource[],
    private readonly snapshotHashCache: SenaEnterpriseValidationSnapshotHashCache = new WeakMap(),
    targetIdentity?: {
      projectId: string;
      teamId: string;
      version: number;
    }
  ) {
    const requiredIdentities = targetIdentity
      ? new Set([validationProjectRevisionIdentityKey(targetIdentity)])
      : undefined;
    const admitted = projectEnterpriseValidationProjectRevisionSources(
      revisions,
      requiredIdentities,
      { identityBytes: 0, snapshotBytes: 0 },
      this.snapshotHashCache
    );
    for (const revision of admitted) {
      const key = SenaEnterpriseValidationProjectRevisionIndex.identityKey(revision);
      const candidates = this.byIdentity.get(key) ?? [];
      candidates.push(revision);
      this.byIdentity.set(key, candidates);
    }
  }

  private static identityKey(input: {
    projectId: string;
    teamId: string;
    version: number;
  }) {
    return validationProjectRevisionIdentityKey(input);
  }

  get candidateInspectionCount() {
    return this.candidateInspections;
  }

  matchingRevision(input: {
    projectId: string;
    teamId: string;
    version: number;
    snapshotSha256: string;
  }) {
    const identityKey = SenaEnterpriseValidationProjectRevisionIndex.identityKey(input);
    let byHash = this.byIdentityAndHash.get(identityKey);
    if (!byHash) {
      byHash = new Map();
      for (const candidate of this.byIdentity.get(identityKey) ?? []) {
        this.candidateInspections += 1;
        const hash = validationSnapshotHashes(
          candidate.snapshot,
          this.snapshotHashCache
        ).bindingSha256;
        byHash.set(hash, byHash.has(hash) ? null : candidate);
      }
      this.byIdentityAndHash.set(identityKey, byHash);
    }
    return byHash.get(input.snapshotSha256) ?? undefined;
  }
}

type SenaEnterpriseValidationAnalysisRunSource = Pick<
  SenaEnterpriseAnalysisRun,
  "id" | "teamId" | "projectId" | "persistedProjectId" | "artifactFingerprints"
>;

export class SenaEnterpriseValidationAnalysisRunIndex {
  private readonly countsByBinding = new Map<string, number>();
  private candidateInspections = 0;
  private lookups = 0;

  constructor(runs: SenaEnterpriseValidationAnalysisRunSource[]) {
    const admitted = projectEnterpriseValidationAnalysisRunSources(runs, {
      identityBytes: 0,
      snapshotBytes: 0
    });
    for (const run of admitted) {
      this.candidateInspections += 1;
      const projectIds = new Set([run.projectId, run.persistedProjectId]);
      const id = run.id;
      const teamId = run.teamId;
      const projectSnapshotBindingSha256 = run.artifactFingerprints.projectSnapshotBindingSha256;
      if (!projectSnapshotBindingSha256) continue;
      for (const projectId of projectIds) {
        const key = SenaEnterpriseValidationAnalysisRunIndex.bindingKey({
          id,
          teamId,
          projectId,
          projectSnapshotArtifactSha256: projectSnapshotBindingSha256
        });
        this.countsByBinding.set(key, (this.countsByBinding.get(key) ?? 0) + 1);
      }
    }
  }

  private static bindingKey(input: {
    id: string;
    teamId: string;
    projectId: string | undefined;
    projectSnapshotArtifactSha256: string;
  }) {
    return JSON.stringify([
      input.id,
      input.teamId,
      input.projectId ?? null,
      input.projectSnapshotArtifactSha256
    ]);
  }

  get candidateInspectionCount() {
    return this.candidateInspections;
  }

  get lookupCount() {
    return this.lookups;
  }

  matchingCount(input: {
    id: string;
    teamId: string;
    projectId: string | undefined;
    projectSnapshotArtifactSha256: string;
  }) {
    this.lookups += 1;
    return this.countsByBinding.get(
      SenaEnterpriseValidationAnalysisRunIndex.bindingKey(input)
    ) ?? 0;
  }
}

export type SenaEnterpriseValidationRunNormalizationOptions = {
  evidenceHash?: "required" | "optional" | "ignore";
  projectRevisions?: SenaEnterpriseValidationProjectRevisionSource[];
  projectRevisionIndex?: SenaEnterpriseValidationProjectRevisionIndex;
  analysisRuns?: SenaEnterpriseValidationAnalysisRunSource[];
  analysisRunIndex?: SenaEnterpriseValidationAnalysisRunIndex;
  snapshotHashCache?: SenaEnterpriseValidationSnapshotHashCache;
  sourceVerificationCache?: SenaGroupComparisonSourceVerificationCache;
};

function validationSnapshotHashes(
  snapshot: SenaEnterpriseProject["snapshot"],
  cache?: SenaEnterpriseValidationSnapshotHashCache
) {
  const cached = cache?.get(snapshot);
  if (cached) return cached;
  const hashes = {
    bindingSha256: createHash("sha256")
      .update(canonicalSenaJson(snapshot) ?? "null")
      .digest("hex")
  };
  cache?.set(snapshot, hashes);
  return hashes;
}

function sha256Text(value: string | undefined) {
  return value ? createHash("sha256").update(value).digest("hex") : undefined;
}

function validationParametersHashBody(
  parameters: SenaEnterpriseValidationPreregistrationPlan["parameters"]
) {
  return {
    permutationIterations: parameters.permutationIterations,
    bootstrapIterations: parameters.bootstrapIterations,
    seed: parameters.seed,
    ...(parameters.alpha === undefined ? {} : { alpha: parameters.alpha }),
    ...(parameters.correction === undefined ? {} : { correction: parameters.correction })
  };
}

function validationPreregistrationPlanHashBody(
  plan: Omit<SenaEnterpriseValidationPreregistrationPlan, "planHash">
) {
  return {
    schemaVersion: plan.schemaVersion,
    hashAlgorithm: plan.hashAlgorithm,
    analysis: plan.analysis,
    primary: comparisonPlanRow(plan.primary as SenaGroupComparisonResult),
    comparisons: plan.comparisons.map((comparison) => comparisonPlanRow(comparison as SenaGroupComparisonResult)),
    parameters: validationParametersHashBody(plan.parameters),
    protocolNoteHash: plan.protocolNoteHash,
    methodNoteHash: plan.methodNoteHash,
    guardrail: plan.guardrail,
    evidence: plan.evidence
  };
}

export function enterpriseValidationPreregistrationPlanHash(
  plan: Omit<SenaEnterpriseValidationPreregistrationPlan, "planHash">
) {
  return artifactSha256(validationPreregistrationPlanHashBody(plan));
}

export function isEnterpriseValidationPreregistrationPlanHashValid(
  plan: SenaEnterpriseValidationPreregistrationPlan | undefined
) {
  if (!hasBoundedValidationPreregistrationPlan(plan) || !/^[a-f0-9]{64}$/.test(plan.planHash)) return false;
  try {
    const { planHash, ...storedBody } = plan;
    const expectedBody = validationPreregistrationPlanHashBody(plan);
    return senaJsonValuesEqual(storedBody, expectedBody) &&
      planHash === artifactSha256(expectedBody);
  } catch {
    return false;
  }
}

export function buildEnterpriseValidationPreregistrationPlan(input: {
  result: SenaGroupComparisonValidationResult;
  preregistrationNote?: string;
  methodNote?: string;
}): SenaEnterpriseValidationPreregistrationPlan {
  const primary = primaryComparison(input.result);
  const suite = input.result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite
    ? input.result
    : null;
  const protocolNote = input.preregistrationNote?.trim() ?? "";
  const methodNote = input.methodNote?.trim() ?? "";
  const analysis: SenaEnterpriseValidationPreregistrationPlan["analysis"] = suite
    ? "holm-suite"
    : "single-comparison";
  const comparisons = suite
    ? suite.comparisons.map(comparisonPlanRow)
    : [comparisonPlanRow(primary)];
  const parameters: SenaEnterpriseValidationPreregistrationPlan["parameters"] = {
    permutationIterations: primary.permutation.iterations,
    bootstrapIterations: primary.bootstrap.iterations,
    seed: primary.permutation.seed,
    ...(suite ? { alpha: suite.alpha, correction: suite.correction } : {})
  };
  const evidence = [
    `protocolNote=${protocolNote ? "present" : "missing"}`,
    `methodNote=${methodNote ? "present" : "missing"}`,
    `analysis=${analysis}`,
    `comparisons=${comparisons.length}`,
    ...(suite ? [`correction=${suite.correction}`] : []),
    `permutationIterations=${parameters.permutationIterations}`,
    `bootstrapIterations=${parameters.bootstrapIterations}`,
    `seed=${parameters.seed}`
  ];
  const planBody = {
    schemaVersion: SENA_SCHEMA_VERSIONS.validationPreregistrationPlan,
    hashAlgorithm: "sha256" as const,
    analysis,
    primary: comparisonPlanRow(primary),
    comparisons,
    parameters,
    protocolNoteHash: sha256Text(protocolNote),
    methodNoteHash: sha256Text(methodNote),
    guardrail: input.result.guardrail,
    evidence
  };
  return {
    ...planBody,
    planHash: enterpriseValidationPreregistrationPlanHash(planBody)
  };
}

function validationFormalInferenceHashBody(
  formal: SenaEnterpriseFormalInferenceReadiness
) {
  return {
    schemaVersion: formal.schemaVersion,
    status: formal.status,
    resultSchemaVersion: formal.resultSchemaVersion,
    analysis: formal.analysis,
    preregistrationPlanHash: formal.preregistrationPlanHash,
    studySpecificInferenceReference: formal.studySpecificInferenceReference,
    comparisonCount: formal.comparisonCount,
    minGroupSize: formal.minGroupSize,
    smallSampleComparisons: formal.smallSampleComparisons,
    permutationIterations: formal.permutationIterations,
    bootstrapIterations: formal.bootstrapIterations,
    alpha: formal.alpha,
    correction: formal.correction,
    checks: formal.checks.map((check) => ({
      id: check.id,
      label: check.label,
      status: check.status,
      evidence: check.evidence
    })),
    blockers: formal.blockers,
    warnings: formal.warnings,
    guardrail: formal.guardrail
  };
}

function validationParityEvidenceHashBody(
  parity: Omit<SenaEnterpriseValidationParityEvidence, "status" | "validationRunHash">
) {
  return {
    schemaVersion: parity.schemaVersion,
    hashAlgorithm: parity.hashAlgorithm,
    analysis: parity.analysis,
    preregistrationPlanHash: parity.preregistrationPlanHash,
    runtimeParity: parity.runtimeParity.map((entry) => ({
      id: entry.id,
      referenceRuntime: entry.referenceRuntime,
      fixturePath: entry.fixturePath,
      status: entry.status,
      coverage: entry.coverage,
      sampleHash: entry.sampleHash,
      interpretation: entry.interpretation
    })),
    walkthrough: {
      datasetLabel: parity.walkthrough.datasetLabel,
      datasetHash: parity.walkthrough.datasetHash,
      source: parity.walkthrough.source,
      sourceId: parity.walkthrough.sourceId,
      status: parity.walkthrough.status
    },
    inference: {
      resultSchemaVersion: parity.inference.resultSchemaVersion,
      guardrail: parity.inference.guardrail,
      comparisonCount: parity.inference.comparisonCount,
      permutationIterations: parity.inference.permutationIterations,
      bootstrapIterations: parity.inference.bootstrapIterations,
      alpha: parity.inference.alpha,
      correction: parity.inference.correction,
      studySpecificInferenceReference: parity.inference.studySpecificInferenceReference
    },
    formalInference: validationFormalInferenceHashBody(parity.formalInference),
    gates: parity.gates.map((gate) => ({
      id: gate.id,
      label: gate.label,
      status: gate.status,
      evidence: gate.evidence
    })),
    notes: parity.notes
  };
}

export function enterpriseValidationParityEvidenceHash(
  parity: Omit<SenaEnterpriseValidationParityEvidence, "status" | "validationRunHash">
) {
  return artifactSha256(validationParityEvidenceHashBody(parity));
}

export function isEnterpriseValidationParityEvidenceHashValid(
  parity: SenaEnterpriseValidationParityEvidence | undefined
) {
  if (!hasBoundedValidationParityEvidence(parity) || !/^[a-f0-9]{64}$/.test(parity.validationRunHash)) return false;
  try {
    const { status: _status, validationRunHash, ...storedBody } = parity;
    const expectedBody = validationParityEvidenceHashBody(parity);
    return senaJsonValuesEqual(storedBody, expectedBody) &&
      validationRunHash === artifactSha256(expectedBody);
  } catch {
    return false;
  }
}

const VALIDATION_FORMAL_INFERENCE_GUARDRAIL =
  "Formal inference readiness records whether SENA validation has a preregistration-note manifest, runtime parity, a project-bound walkthrough, multiplicity control, and a study-specific model reference; it does not replace the model or domain review, and its SHA-256 links are not signatures or timestamped proof of preregistration.";
const VALIDATION_PARITY_BASE_NOTES = [
  "This manifest links an enterprise validation run to runtime parity, walkthrough, expert-review, and inference guardrail evidence.",
  "Required expert-review and study-specific inference gates are claim-readiness requirements, not automatic blockers for storing descriptive validation output; SHA-256 links detect canonical drift but do not authenticate authorship."
] as const;

function currentValidationRuntimeEvidence(requestedRuntimeIds: Set<string>) {
  return senaRuntimeProvenance.parityEvidence
    .filter((evidence) => requestedRuntimeIds.size === 0 || requestedRuntimeIds.has(evidence.id))
    .map((evidence) => ({
      id: evidence.id,
      referenceRuntime: evidence.referenceRuntime,
      fixturePath: evidence.fixturePath,
      status: evidence.status,
      coverage: evidence.coverage,
      sampleHash: artifactSha256(evidence.sample),
      interpretation: evidence.interpretation
    }));
}

function buildValidationParityGates(input: {
  runtimeEvidence: SenaEnterpriseValidationParityEvidence["runtimeParity"];
  walkthrough: SenaEnterpriseValidationParityEvidence["walkthrough"];
  expertReviewRequired: boolean;
  studySpecificInferenceReference?: string;
  resultGuardrail: string;
}): SenaEnterpriseValidationParityEvidence["gates"] {
  const jenaParity = input.runtimeEvidence.find((evidence) => evidence.id === "jena-rena-sample-parity");
  const jsnaParity = input.runtimeEvidence.find((evidence) => evidence.id === "jsna-r-sna-social-parity");
  return [{
    id: "rena-parity",
    label: "jENA/rENA parity fixture evidence",
    status: jenaParity?.status === "covered" ? "passed" : "missing",
    evidence: jenaParity ? [
      `runtime=${jenaParity.referenceRuntime}`,
      `fixture=${jenaParity.fixturePath}`,
      `coverage=${jenaParity.coverage.join("|")}`,
      `sampleHash=${jenaParity.sampleHash}`
    ] : ["runtimeParity=missing"]
  }, {
    id: "r-sna-parity",
    label: "jSNA/R sna parity fixture evidence",
    status: jsnaParity?.status === "covered" ? "passed" : "missing",
    evidence: jsnaParity ? [
      `runtime=${jsnaParity.referenceRuntime}`,
      `fixture=${jsnaParity.fixturePath}`,
      `coverage=${jsnaParity.coverage.join("|")}`,
      `sampleHash=${jsnaParity.sampleHash}`
    ] : ["runtimeParity=missing"]
  }, {
    id: "real-data-walkthrough",
    label: "Real dataset walkthrough evidence",
    status: input.walkthrough.status === "attached" ? "passed" : "missing",
    evidence: [
      `datasetLabel=${input.walkthrough.datasetLabel}`,
      `datasetHash=${input.walkthrough.datasetHash ?? "missing"}`,
      `source=${input.walkthrough.source}`,
      ...(input.walkthrough.sourceId ? [`sourceId=${input.walkthrough.sourceId}`] : [])
    ]
  }, {
    id: "domain-expert-review",
    label: "Domain expert review requirement",
    status: input.expertReviewRequired ? "required" : "attached",
    evidence: [`required=${input.expertReviewRequired}`]
  }, {
    id: "study-specific-inference",
    label: "Study-specific inferential model requirement",
    status: input.studySpecificInferenceReference ? "attached" : "required",
    evidence: [
      `reference=${input.studySpecificInferenceReference || "required-before-publication-claim"}`,
      `guardrail=${input.resultGuardrail}`
    ]
  }];
}

function buildEnterpriseFormalInferenceReadiness(input: {
  result: SenaGroupComparisonValidationResult;
  preregistrationPlan: SenaEnterpriseValidationPreregistrationPlan;
  inference: SenaEnterpriseValidationParityEvidence["inference"];
  gates: SenaEnterpriseValidationParityEvidence["gates"];
}): SenaEnterpriseFormalInferenceReadiness {
  const primary = primaryComparison(input.result);
  const suite = input.result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite
    ? input.result
    : null;
  const minGroupSize = suite?.diagnostics.minGroupSize ?? primary.diagnostics.minGroupSize;
  const smallSampleComparisons = suite?.diagnostics.smallSampleComparisons ?? (
    primary.diagnostics.smallSample ? 1 : 0
  );
  const runtimeParityPassed = input.gates
    .filter((gate) => gate.id === "rena-parity" || gate.id === "r-sna-parity")
    .every((gate) => gate.status === "passed");
  const walkthroughPassed = input.gates.some((gate) => (
    gate.id === "real-data-walkthrough" && gate.status === "passed"
  ));
  const studySpecificInferenceReference = input.inference.studySpecificInferenceReference?.trim();
  const preregistrationPlanComplete = Boolean(
    input.preregistrationPlan.planHash && input.preregistrationPlan.protocolNoteHash
  );
  const checks: SenaEnterpriseFormalInferenceReadiness["checks"] = [{
    id: "preregistration-plan",
    label: "Preregistration plan hash",
    status: preregistrationPlanComplete ? "passed" : "required",
    evidence: [
      `schema=${input.preregistrationPlan.schemaVersion}`,
      `planHash=${input.preregistrationPlan.planHash || "missing"}`,
      `protocolNoteHash=${input.preregistrationPlan.protocolNoteHash || "missing"}`,
      `analysis=${input.preregistrationPlan.analysis}`
    ]
  }, {
    id: "study-specific-model",
    label: "Study-specific inferential model reference",
    status: studySpecificInferenceReference ? "passed" : "required",
    evidence: [`reference=${studySpecificInferenceReference || "required-before-publication-claim"}`]
  }, {
    id: "runtime-parity",
    label: "rENA and R sna parity fixtures",
    status: runtimeParityPassed ? "passed" : "required",
    evidence: input.gates
      .filter((gate) => gate.id === "rena-parity" || gate.id === "r-sna-parity")
      .map((gate) => `${gate.id}:${gate.status}`)
  }, {
    id: "real-data-walkthrough",
    label: "Real-data walkthrough anchor",
    status: walkthroughPassed ? "passed" : "required",
    evidence: input.gates.find((gate) => gate.id === "real-data-walkthrough")?.evidence ?? ["walkthrough=missing"]
  }, {
    id: "multiplicity-control",
    label: "Multiple-comparison control",
    status: suite ? suite.correction === "holm" ? "passed" : "required" : "passed",
    evidence: suite
      ? [`correction=${suite.correction}`, `comparisons=${suite.comparisonCount}`, `alpha=${suite.alpha}`]
      : ["singleComparison=true"]
  }, {
    id: "sample-size",
    label: "Group-size diagnostic",
    status: smallSampleComparisons > 0 || minGroupSize < 5 ? "review" : "passed",
    evidence: [`minGroupSize=${minGroupSize}`, `smallSampleComparisons=${smallSampleComparisons}`]
  }];
  const blockers = checks
    .filter((check) => check.status === "required")
    .map((check) => check.id);
  const warnings = [
    ...(smallSampleComparisons > 0 ? [`small-sample-comparisons=${smallSampleComparisons}`] : []),
    ...(minGroupSize < 5 ? [`minGroupSize=${minGroupSize}`] : [])
  ];
  const status: SenaEnterpriseFormalInferenceReadiness["status"] =
    !runtimeParityPassed || !walkthroughPassed || !preregistrationPlanComplete
      ? "incomplete"
      : studySpecificInferenceReference
        ? "model-referenced"
        : "model-required";
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.formalInferenceReadiness,
    status,
    resultSchemaVersion: input.result.schemaVersion,
    analysis: input.preregistrationPlan.analysis,
    preregistrationPlanHash: input.preregistrationPlan.planHash,
    studySpecificInferenceReference: studySpecificInferenceReference || undefined,
    comparisonCount: suite?.comparisonCount ?? 1,
    minGroupSize,
    smallSampleComparisons,
    permutationIterations: input.inference.permutationIterations,
    bootstrapIterations: input.inference.bootstrapIterations,
    alpha: input.inference.alpha,
    correction: input.inference.correction,
    checks,
    blockers,
    warnings,
    guardrail: VALIDATION_FORMAL_INFERENCE_GUARDRAIL
  };
}

export function buildEnterpriseValidationParityEvidence(input: {
  result: SenaGroupComparisonValidationResult;
  preregistrationPlan: SenaEnterpriseValidationPreregistrationPlan;
  parityEvidence?: SenaEnterpriseValidationParityEvidenceInput;
}): SenaEnterpriseValidationParityEvidence {
  const primary = primaryComparison(input.result);
  const suite = input.result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite
    ? input.result
    : null;
  const requestedRuntimeIds = new Set(
    input.parityEvidence?.runtimeParityIds?.map((runtimeId) => runtimeId.trim()).filter(Boolean)
  );
  const runtimeEvidence = currentValidationRuntimeEvidence(requestedRuntimeIds);
  const walkthroughLabel = input.parityEvidence?.walkthroughDatasetLabel?.trim() || "missing walkthrough dataset";
  const walkthroughHash = input.parityEvidence?.walkthroughDatasetHash?.trim();
  const walkthroughStatus: SenaEnterpriseValidationParityEvidence["walkthrough"]["status"] =
    walkthroughHash ? "attached" : "missing";
  const walkthroughSource: SenaEnterpriseValidationParityEvidence["walkthrough"]["source"] =
    walkthroughHash ? input.parityEvidence?.walkthroughSource ?? "input" : "missing";
  const walkthroughSourceId = input.parityEvidence?.walkthroughSourceId?.trim();
  const expertReviewRequired = input.parityEvidence?.expertReviewRequired ?? true;
  const studySpecificInferenceReference = input.parityEvidence?.studySpecificInferenceReference?.trim();
  const inference: SenaEnterpriseValidationParityEvidence["inference"] = {
    resultSchemaVersion: input.result.schemaVersion,
    guardrail: input.result.guardrail,
    comparisonCount: suite?.comparisonCount ?? 1,
    permutationIterations: primary.permutation.iterations,
    bootstrapIterations: primary.bootstrap.iterations,
    alpha: suite?.alpha,
    correction: suite?.correction,
    studySpecificInferenceReference
  };
  const walkthrough: SenaEnterpriseValidationParityEvidence["walkthrough"] = {
    datasetLabel: walkthroughLabel,
    datasetHash: walkthroughHash,
    source: walkthroughSource,
    sourceId: walkthroughSourceId,
    status: walkthroughStatus
  };
  const gates = buildValidationParityGates({
    runtimeEvidence,
    walkthrough,
    expertReviewRequired,
    studySpecificInferenceReference,
    resultGuardrail: input.result.guardrail
  });
  const passedFoundation = gates
    .filter((gate) => gate.id === "rena-parity" || gate.id === "r-sna-parity" || gate.id === "real-data-walkthrough")
    .every((gate) => gate.status === "passed");
  const formalInference = buildEnterpriseFormalInferenceReadiness({
    result: input.result,
    preregistrationPlan: input.preregistrationPlan,
    inference,
    gates
  });
  const notes = [
    ...VALIDATION_PARITY_BASE_NOTES,
    ...(input.parityEvidence?.notes?.map((note) => note.trim()).filter(Boolean) ?? [])
  ];
  const manifestBody = {
    schemaVersion: SENA_SCHEMA_VERSIONS.validationParityEvidence,
    hashAlgorithm: "sha256" as const,
    analysis: input.preregistrationPlan.analysis,
    preregistrationPlanHash: input.preregistrationPlan.planHash,
    runtimeParity: runtimeEvidence,
    walkthrough,
    inference,
    formalInference,
    gates,
    notes
  };
  return {
    ...manifestBody,
    status: passedFoundation ? "ready-for-review" : "incomplete",
    validationRunHash: enterpriseValidationParityEvidenceHash(manifestBody)
  };
}

function isCanonicalEnterpriseValidationPreregistrationPlan(
  plan: SenaEnterpriseValidationPreregistrationPlan | undefined,
  result: SenaGroupComparisonValidationResult,
  preregistrationNote: string,
  methodNote: string
) {
  if (!plan || !isEnterpriseValidationPreregistrationPlanHashValid(plan)) return false;
  return senaJsonValuesEqual(plan, buildEnterpriseValidationPreregistrationPlan({
    result,
    preregistrationNote,
    methodNote
  }));
}

function rebuildEnterpriseValidationParityEvidenceFromStoredRuntime(
  parity: SenaEnterpriseValidationParityEvidence,
  result: SenaGroupComparisonValidationResult,
  plan: SenaEnterpriseValidationPreregistrationPlan
) {
  const expertGates = parity.gates.filter((gate) => gate.id === "domain-expert-review");
  if (expertGates.length !== 1 ||
    (expertGates[0].status !== "required" && expertGates[0].status !== "attached")) return undefined;
  if (new Set(parity.runtimeParity.map((entry) => entry.id)).size !== parity.runtimeParity.length) return undefined;
  const primary = primaryComparison(result);
  const suite = result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite ? result : null;
  const studySpecificInferenceReference = parity.inference.studySpecificInferenceReference?.trim();
  const inference: SenaEnterpriseValidationParityEvidence["inference"] = {
    resultSchemaVersion: result.schemaVersion,
    guardrail: result.guardrail,
    comparisonCount: suite?.comparisonCount ?? 1,
    permutationIterations: primary.permutation.iterations,
    bootstrapIterations: primary.bootstrap.iterations,
    alpha: suite?.alpha,
    correction: suite?.correction,
    studySpecificInferenceReference
  };
  const walkthrough: SenaEnterpriseValidationParityEvidence["walkthrough"] = {
    datasetLabel: parity.walkthrough.datasetLabel.trim(),
    datasetHash: parity.walkthrough.datasetHash?.trim(),
    source: parity.walkthrough.source,
    sourceId: parity.walkthrough.sourceId?.trim(),
    status: parity.walkthrough.datasetHash ? "attached" : "missing"
  };
  const gates = buildValidationParityGates({
    runtimeEvidence: parity.runtimeParity,
    walkthrough,
    expertReviewRequired: expertGates[0].status === "required",
    studySpecificInferenceReference,
    resultGuardrail: result.guardrail
  });
  const formalInference = buildEnterpriseFormalInferenceReadiness({
    result,
    preregistrationPlan: plan,
    inference,
    gates
  });
  const notes = [
    ...VALIDATION_PARITY_BASE_NOTES,
    ...parity.notes.slice(VALIDATION_PARITY_BASE_NOTES.length)
      .map((note) => note.trim())
      .filter(Boolean)
  ];
  const passedFoundation = gates
    .filter((gate) => gate.id === "rena-parity" || gate.id === "r-sna-parity" || gate.id === "real-data-walkthrough")
    .every((gate) => gate.status === "passed");
  const body = {
    schemaVersion: SENA_SCHEMA_VERSIONS.validationParityEvidence,
    hashAlgorithm: "sha256" as const,
    analysis: plan.analysis,
    preregistrationPlanHash: plan.planHash,
    runtimeParity: parity.runtimeParity,
    walkthrough,
    inference,
    formalInference,
    gates,
    notes
  };
  return {
    ...body,
    status: passedFoundation ? "ready-for-review" as const : "incomplete" as const,
    validationRunHash: enterpriseValidationParityEvidenceHash(body)
  };
}

function isCanonicalEnterpriseValidationParityEvidence(
  parity: SenaEnterpriseValidationParityEvidence | undefined,
  result: SenaGroupComparisonValidationResult,
  plan: SenaEnterpriseValidationPreregistrationPlan
) {
  if (!parity || !isEnterpriseValidationParityEvidenceHashValid(parity)) return false;
  try {
    if (parity.notes.length < VALIDATION_PARITY_BASE_NOTES.length ||
      !VALIDATION_PARITY_BASE_NOTES.every((note, index) => parity.notes[index] === note)) return false;
    const rebuilt = rebuildEnterpriseValidationParityEvidenceFromStoredRuntime(parity, result, plan);
    return rebuilt !== undefined && senaJsonValuesEqual(parity, rebuilt);
  } catch {
    return false;
  }
}

export function isEnterpriseValidationRuntimeProvenanceCurrent(
  run: Pick<SenaEnterpriseValidationRun, "parityEvidence">
) {
  const parity = run.parityEvidence;
  if (!parity || !hasBoundedValidationParityEvidence(parity)) return false;
  const requestedIds = new Set(parity.runtimeParity.map((entry) => entry.id));
  return senaJsonValuesEqual(
    parity.runtimeParity,
    currentValidationRuntimeEvidence(requestedIds)
  );
}

export function isEnterpriseValidationRunCurrentProvenance(
  run: SenaEnterpriseValidationRun,
  project: Pick<SenaEnterpriseProject, "id" | "teamId" | "currentVersion" | "snapshot">,
  options: Pick<
    SenaEnterpriseValidationRunNormalizationOptions,
    "analysisRuns" | "analysisRunIndex" | "snapshotHashCache"
  > = {}
) {
  if (run.teamId !== project.teamId || run.projectId !== project.id ||
    !enterpriseProjectEvidenceBindingMatches(run.projectBinding, project) ||
    !isEnterpriseValidationRuntimeProvenanceCurrent(run)) return false;
  const walkthrough = run.parityEvidence?.walkthrough;
  const expectedBindingHash = validationSnapshotHashes(
    project.snapshot,
    options.snapshotHashCache
  ).bindingSha256;
  if (!walkthrough || walkthrough.status !== "attached" ||
    walkthrough.datasetHash !== expectedBindingHash) return false;
  if (walkthrough.source === "project-snapshot") {
    return walkthrough.sourceId === project.id;
  }
  if (walkthrough.source !== "analysis-run" || !walkthrough.sourceId) return false;
  const index = options.analysisRunIndex ??
    new SenaEnterpriseValidationAnalysisRunIndex(options.analysisRuns ?? []);
  return index.matchingCount({
    id: walkthrough.sourceId,
    teamId: run.teamId,
    projectId: run.projectId,
    projectSnapshotArtifactSha256: expectedBindingHash
  }) === 1;
}

export function deriveEnterpriseValidationRunSummary(
  result: SenaGroupComparisonValidationResult
): SenaEnterpriseValidationRunSummary {
  const primary = primaryComparison(result);
  const suite = result.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite
    ? result
    : undefined;
  return {
    metric: primary.metric,
    groupField: primary.groupField,
    groupA: primary.groupA,
    groupB: primary.groupB,
    iterations: primary.permutation.iterations,
    seed: primary.permutation.seed,
    pTwoSided: primary.permutation.pTwoSided,
    comparisonCount: suite?.comparisonCount ?? 1,
    minHolmAdjustedP: suite
      ? suite.comparisons.reduce(
          (minimum, comparison) => Math.min(minimum, comparison.holmAdjustedP),
          1
        )
      : undefined,
    significantHolmCount: suite?.significantHolmCount,
    observedDifference: primary.observedDifference
  };
}

function validationRunEvidenceHashBody(run: SenaEnterpriseValidationRun) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseValidationRunEvidence,
    hashAlgorithm: "sha256",
    identity: {
      id: run.id,
      teamId: run.teamId,
      projectId: run.projectId ?? null,
      userId: run.userId,
      createdAt: run.createdAt
    },
    projectBinding: run.projectBinding ?? null,
    workflow: {
      status: run.status,
      reviewerId: run.reviewerId ?? null,
      reviewedAt: run.reviewedAt ?? null,
      reviewNotes: Object.hasOwn(run, "reviewNotes") ? run.reviewNotes ?? "" : null
    },
    notes: {
      preregistrationNote: run.preregistrationNote,
      methodNote: run.methodNote
    },
    summary: deriveEnterpriseValidationRunSummary(run.result),
    preregistrationPlanHash: run.preregistrationPlan?.planHash ?? null,
    parityEvidenceHash: run.parityEvidence?.validationRunHash ?? null,
    parityStatus: run.parityEvidence?.status ?? null,
    formalInferenceStatus: run.parityEvidence?.formalInference?.status ?? null,
    preregistrationPlan: run.preregistrationPlan ?? null,
    parityEvidence: run.parityEvidence ?? null,
    result: run.result
  };
}

export function enterpriseValidationRunEvidenceHash(run: SenaEnterpriseValidationRun) {
  return createHash("sha256")
    .update(canonicalSenaJson(validationRunEvidenceHashBody(run)) ?? "null")
    .digest("hex");
}

export function normalizeEnterpriseValidationRunEvidence(
  run: SenaEnterpriseValidationRun,
  project?: Pick<SenaEnterpriseProject, "id" | "teamId" | "currentVersion" | "snapshot">,
  options: SenaEnterpriseValidationRunNormalizationOptions = {}
) {
  if (!hasBoundedValidationRunEvidenceCarriers(run)) {
    return validationIntegrityFailure("resourceAdmission");
  }
  const contextualSnapshotHashCache = options.snapshotHashCache ?? new WeakMap();
  if (project) {
    project = projectEnterpriseValidationProjects(
      [project],
      new Set(run.projectId ? [run.projectId] : []),
      { identityBytes: 0, snapshotBytes: 0 },
      contextualSnapshotHashCache
    )[0];
  }
  const hashMode = options.evidenceHash ?? "optional";
  const storedHash = run.validationRunEvidenceHash;
  const hasStoredHash = storedHash !== undefined;
  const hasStoredSchemaVersion = run.validationRunEvidenceSchemaVersion !== undefined;
  if (hasStoredHash !== hasStoredSchemaVersion) {
    return validationIntegrityFailure("validationRunEvidenceHash");
  }
  const sealed = hasStoredHash && hasStoredSchemaVersion;
  const sealShapeValid = sealed &&
    run.validationRunEvidenceSchemaVersion === SENA_SCHEMA_VERSIONS.enterpriseValidationRunEvidence &&
    /^[a-f0-9]{64}$/.test(storedHash ?? "");
  if ((hashMode === "required" && !sealShapeValid) ||
    (hashMode !== "ignore" && sealed && !sealShapeValid)) {
    return validationIntegrityFailure("validationRunEvidenceHash");
  }
  const strict = hashMode === "required" || hashMode === "ignore" || sealed;
  if (strict && (
    typeof run.id !== "string" || !run.id.trim() ||
    typeof run.teamId !== "string" || !run.teamId.trim() ||
    typeof run.userId !== "string" || !run.userId.trim() ||
    (run.projectId !== undefined && (typeof run.projectId !== "string" || !run.projectId.trim())) ||
    (run.status !== "pending-review" && run.status !== "approved" && run.status !== "rejected") ||
    typeof run.preregistrationNote !== "string" ||
    typeof run.methodNote !== "string" ||
    typeof run.createdAt !== "string" || !Number.isFinite(Date.parse(run.createdAt)) ||
    (run.reviewNotes !== undefined && typeof run.reviewNotes !== "string")
  )) {
    return validationIntegrityFailure("identity");
  }
  if (run.projectId && (!project || project.id !== run.projectId)) {
    return validationIntegrityFailure("projectSource");
  }
  if (run.projectId && project && run.teamId !== project.teamId) {
    return validationIntegrityFailure("projectBinding");
  }
  const binding = run.projectBinding;
  if (strict && !run.projectId && binding !== undefined) {
    return validationIntegrityFailure("projectBinding");
  }
  let validationSource = run.projectId && binding ? project : undefined;
  if (run.projectId && binding) {
    if (binding.projectId !== run.projectId) {
      return validationIntegrityFailure("projectBinding");
    }
    const currentMatches = project &&
      binding.projectId === project.id &&
      binding.projectVersion === project.currentVersion &&
      binding.snapshotSha256 === validationSnapshotHashes(
        project.snapshot,
        contextualSnapshotHashCache
      ).bindingSha256;
    if (!currentMatches) {
      const revisionIndex = options.projectRevisionIndex ??
        new SenaEnterpriseValidationProjectRevisionIndex(
          options.projectRevisions ?? [],
          contextualSnapshotHashCache,
          {
            projectId: run.projectId,
            teamId: run.teamId,
            version: binding.projectVersion
          }
        );
      const retained = project?.teamId === run.teamId
        ? revisionIndex.matchingRevision({
            projectId: run.projectId,
            teamId: run.teamId,
            version: binding.projectVersion,
            snapshotSha256: binding.snapshotSha256
          })
        : undefined;
      if (!retained) return validationIntegrityFailure("projectBinding");
      validationSource = {
        id: retained.projectId,
        teamId: retained.teamId,
        currentVersion: retained.version,
        snapshot: retained.snapshot
      };
    }
  } else if (strict && run.projectId) {
    return validationIntegrityFailure("projectBinding");
  }

  if (strict && validationSource) {
    const walkthrough = run.parityEvidence?.walkthrough;
    const expectedWalkthroughHash = validationSnapshotHashes(
      validationSource.snapshot,
      contextualSnapshotHashCache
    ).bindingSha256;
    let sourceBound = walkthrough?.source === "project-snapshot" &&
      walkthrough.sourceId === validationSource.id;
    if (walkthrough?.source === "analysis-run" &&
      typeof walkthrough.sourceId === "string" && walkthrough.sourceId.trim()) {
      const analysisRunIndex = options.analysisRunIndex ??
        new SenaEnterpriseValidationAnalysisRunIndex(options.analysisRuns ?? []);
      sourceBound = analysisRunIndex.matchingCount({
        id: walkthrough.sourceId,
        teamId: run.teamId,
        projectId: run.projectId,
        projectSnapshotArtifactSha256: expectedWalkthroughHash
      }) === 1;
    }
    if (!walkthrough || walkthrough.status !== "attached" ||
      walkthrough.datasetHash !== expectedWalkthroughHash || !sourceBound) {
      return validationIntegrityFailure("parityEvidence");
    }
  }

  let result: SenaGroupComparisonValidationResult;
  try {
    result = normalizeSenaGroupComparisonValidationResult(
      run.result,
      validationSource ? {
        dataset: validationSource.snapshot.dataset,
        buildOptions: validationSource.snapshot.reproducibility.buildOptions
      } : undefined,
      options.sourceVerificationCache
    );
  } catch {
    return validationIntegrityFailure("result");
  }

  const summary = deriveEnterpriseValidationRunSummary(result);
  if (strict) {
    for (const [key, expected] of Object.entries(summary)) {
      if (!senaJsonValuesEqual(run[key as keyof SenaEnterpriseValidationRun], expected)) {
        return validationIntegrityFailure(`summary.${key}`);
      }
    }
    const plan = run.preregistrationPlan;
    if (!isCanonicalEnterpriseValidationPreregistrationPlan(
      plan,
      result,
      run.preregistrationNote,
      run.methodNote
    )) {
      return validationIntegrityFailure("preregistrationPlan");
    }
    if (!plan || !isCanonicalEnterpriseValidationParityEvidence(run.parityEvidence, result, plan)) {
      return validationIntegrityFailure("parityEvidence");
    }
    if (run.status === "pending-review") {
      if (run.reviewerId !== undefined || run.reviewedAt !== undefined || run.reviewNotes !== undefined) {
        return validationIntegrityFailure("workflow.pendingReview");
      }
    } else if (
      typeof run.reviewerId !== "string" || !run.reviewerId.trim() ||
      typeof run.reviewedAt !== "string" ||
      !Number.isFinite(Date.parse(run.reviewedAt))
      || typeof run.reviewNotes !== "string"
    ) {
      return validationIntegrityFailure("workflow.review");
    }
  }

  const normalized: SenaEnterpriseValidationRun = {
    ...structuredClone(run),
    ...summary,
    result
  };
  if (hashMode !== "ignore" && storedHash !== undefined && (
    storedHash !== enterpriseValidationRunEvidenceHash(normalized)
  )) {
    return validationIntegrityFailure("validationRunEvidenceHash");
  }
  return normalized;
}

export function sealEnterpriseValidationRunEvidence(
  run: SenaEnterpriseValidationRun,
  project?: Pick<SenaEnterpriseProject, "id" | "teamId" | "currentVersion" | "snapshot">,
  options: Omit<SenaEnterpriseValidationRunNormalizationOptions, "evidenceHash"> = {}
) {
  const normalized = normalizeEnterpriseValidationRunEvidence(run, project, {
    evidenceHash: "ignore",
    projectRevisions: options.projectRevisions,
    projectRevisionIndex: options.projectRevisionIndex,
    analysisRuns: options.analysisRuns,
    analysisRunIndex: options.analysisRunIndex,
    snapshotHashCache: options.snapshotHashCache,
    sourceVerificationCache: options.sourceVerificationCache
  });
  const sealable = {
    ...normalized,
    validationRunEvidenceSchemaVersion: SENA_SCHEMA_VERSIONS.enterpriseValidationRunEvidence
  };
  return {
    ...sealable,
    validationRunEvidenceHash: enterpriseValidationRunEvidenceHash(sealable)
  };
}
