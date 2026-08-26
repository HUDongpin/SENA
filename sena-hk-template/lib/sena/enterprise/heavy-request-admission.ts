import { SENA_GROUP_COMPARISON_MAX_SUITE_COMPARISONS } from "../analytical-input-validation";
import { SenaEnterpriseError } from "./errors";
import {
  assertSenaRequestExactKeys,
  assertSenaRequestStringTreeBudget,
  readSenaBoundedJsonObjectRequest,
  readSenaBoundedMultipartRequest
} from "./request-admission";
import { senaEnterpriseUploadMaxBytes } from "./upload-limits";

export const SENA_VALIDATION_POST_REQUEST_BYTE_LIMIT = 32 * 1024 * 1024;
export const SENA_VALIDATION_PATCH_REQUEST_BYTE_LIMIT = 64 * 1024;
export const SENA_EXPERT_REVIEW_REQUEST_BYTE_LIMIT = 64 * 1024;
export const SENA_ANALYSIS_REQUEST_BYTE_LIMIT = 32 * 1024 * 1024;
export const SENA_IMPORT_REQUEST_BYTE_LIMIT = 128 * 1024 * 1024;
export const SENA_HEAVY_JSON_REQUEST_CHUNK_LIMIT = 8_192;
export const SENA_SMALL_JSON_REQUEST_CHUNK_LIMIT = 1_024;
export const SENA_IMPORT_REQUEST_CHUNK_LIMIT = 8_192;
export const SENA_IMPORT_MAX_FILES = 100;
export const SENA_IMPORT_MAX_AGGREGATE_FILE_BYTES = 100 * 1024 * 1024;
export const SENA_IMPORT_MAX_FIELDS = 32;
export const SENA_IMPORT_MAX_FIELD_BYTES = 64 * 1024;
export const SENA_IMPORT_MAX_AGGREGATE_FIELD_BYTES = 256 * 1024;

const validationCodes = {
  contentTypeInvalid: "validation_request_content_type_invalid",
  requestInvalid: "validation_request_invalid",
  requestTooLarge: "validation_request_too_large",
  requestTooFragmented: "validation_request_too_fragmented"
};

const expertReviewCodes = {
  contentTypeInvalid: "expert_review_request_content_type_invalid",
  requestInvalid: "expert_review_request_invalid",
  requestTooLarge: "expert_review_request_too_large",
  requestTooFragmented: "expert_review_request_too_fragmented"
};

const analysisCodes = {
  contentTypeInvalid: "analysis_request_content_type_invalid",
  requestInvalid: "analysis_request_invalid",
  requestTooLarge: "analysis_request_too_large",
  requestTooFragmented: "analysis_request_too_fragmented"
};

const importCodes = {
  contentTypeInvalid: "import_request_content_type_invalid",
  requestInvalid: "import_request_invalid",
  requestTooLarge: "import_request_too_large",
  requestTooFragmented: "import_request_too_fragmented",
  multipartLimitsExceeded: "import_request_multipart_limits_exceeded"
};

const buildOptionKeys = [
  "alpha",
  "beta",
  "gamma",
  "normalization",
  "bridgeWeightRule",
  "direction",
  "deg_convention",
  "delta",
  "Phi",
  "d",
  "seed",
  "undirectedSocial",
  "temporal"
] as const;

const temporalOptionKeys = [
  "mode",
  "movingWindowSize",
  "movingWindowStep",
  "turnWindowRadius"
] as const;

const codingReliabilityKeys = [
  "status",
  "reviewer",
  "reviewedAt",
  "codingScheme",
  "unitOfCoding",
  "coderCount",
  "agreementMetric",
  "agreementValue",
  "adjudicationNotes",
  "limitations",
  "machineEvidence"
] as const;

const dataGovernanceKeys = [
  "schemaVersion",
  "status",
  "irbApprovalId",
  "consentScope",
  "retentionPolicy",
  "usageConstraints",
  "dataSteward",
  "reviewedAt",
  "requiredEvidence",
  "blockers",
  "guardrail"
] as const;

function fieldsInvalid(label: string, code: string): never {
  throw new SenaEnterpriseError(
    `${label} contains unsupported or over-budget fields.`,
    400,
    code
  );
}

function assertExactObjectIfPresent(
  value: unknown,
  allowedKeys: readonly string[],
  label: string,
  code: string
) {
  if (value === undefined) return;
  assertSenaRequestExactKeys(value, allowedKeys, { label, code });
}

function assertArrayLimit(value: unknown, maximum: number, label: string, code: string) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > maximum) fieldsInvalid(label, code);
}

function assertArrayLengthIfArray(value: unknown, maximum: number, label: string, code: string) {
  if (Array.isArray(value) && value.length > maximum) fieldsInvalid(label, code);
}

function assertBuildOptions(value: unknown, label: string, code: string) {
  if (value === undefined) return;
  assertSenaRequestExactKeys(value, buildOptionKeys, { label, code });
  const options = value as Record<string, unknown>;
  assertExactObjectIfPresent(options.temporal, temporalOptionKeys, `${label}.temporal`, code);
  assertSenaRequestStringTreeBudget(value, {
    label,
    maximumStringBytes: 512,
    maximumTotalBytes: 2_048,
    maximumNodes: 64,
    maximumDepth: 4,
    code
  });
}

function assertAnalysisDocumentation(
  input: {
    humanReview?: unknown;
    codingReliability?: unknown;
    dataGovernance?: unknown;
  },
  label: string,
  code: string
) {
  assertExactObjectIfPresent(input.humanReview, [
    "status",
    "reviewer",
    "reviewedAt",
    "interpretation",
    "limitations",
    "nextActions"
  ], `${label}.humanReview`, code);
  assertExactObjectIfPresent(
    input.codingReliability,
    codingReliabilityKeys,
    `${label}.codingReliability`,
    code
  );
  assertExactObjectIfPresent(
    input.dataGovernance,
    dataGovernanceKeys,
    `${label}.dataGovernance`,
    code
  );
  assertSenaRequestStringTreeBudget(input, {
    label,
    maximumStringBytes: 8 * 1024,
    maximumTotalBytes: 64 * 1024,
    maximumNodes: 512,
    maximumDepth: 8,
    code
  });
}

function assertValidationPostBody(body: Record<string, unknown>) {
  const code = "validation_request_fields_invalid";
  assertSenaRequestExactKeys(body, [
    "projectId",
    "snapshot",
    "dataset",
    "buildOptions",
    "comparisons",
    "groupField",
    "groupA",
    "groupB",
    "metric",
    "metrics",
    "iterations",
    "bootstrapIterations",
    "seed",
    "alpha",
    "suite",
    "teamId",
    "preregistrationNote",
    "methodNote",
    "parityEvidence",
    "queue"
  ], { label: "Validation request", code });
  assertBuildOptions(body.buildOptions, "Validation request.buildOptions", code);
  // Transport admission owns carrier/cardinality budgets. Recognized controls
  // with the wrong semantic type remain the canonical analytical validator's
  // responsibility so synchronous and queued routes expose the same stable
  // numeric-domain contract.
  assertArrayLengthIfArray(
    body.comparisons,
    SENA_GROUP_COMPARISON_MAX_SUITE_COMPARISONS,
    "Validation comparisons",
    code
  );
  if (Array.isArray(body.comparisons)) {
    for (const [index, comparison] of body.comparisons.entries()) {
      if (comparison && typeof comparison === "object" && !Array.isArray(comparison)) {
        assertSenaRequestExactKeys(comparison, ["groupField", "groupA", "groupB", "metric"], {
          label: `Validation request.comparisons[${index}]`,
          code
        });
      }
    }
  }
  assertArrayLengthIfArray(body.metrics, 40, "Validation metrics", code);
  assertExactObjectIfPresent(body.parityEvidence, [
    "walkthroughDatasetLabel",
    "walkthroughDatasetHash",
    "expertReviewRequired",
    "studySpecificInferenceReference",
    "notes",
    "runtimeParityIds"
  ], "Validation request.parityEvidence", code);
  if (body.parityEvidence && typeof body.parityEvidence === "object" && !Array.isArray(body.parityEvidence)) {
    const parity = body.parityEvidence as Record<string, unknown>;
    assertArrayLimit(parity.notes, 20, "Validation parity notes", code);
    assertArrayLimit(parity.runtimeParityIds, 20, "Validation runtime parity IDs", code);
  }
  assertSenaRequestStringTreeBudget({
    projectId: body.projectId,
    teamId: body.teamId,
    groupField: body.groupField,
    groupA: body.groupA,
    groupB: body.groupB,
    metric: body.metric,
    metrics: body.metrics,
    comparisons: body.comparisons,
    preregistrationNote: body.preregistrationNote,
    methodNote: body.methodNote,
    parityEvidence: body.parityEvidence
  }, {
    label: "Validation request control metadata",
    maximumStringBytes: 4 * 1024,
    maximumTotalBytes: 32 * 1024,
    maximumNodes: 512,
    maximumDepth: 8,
    code
  });
}

function assertValidationPatchBody(body: Record<string, unknown>) {
  const code = "validation_request_fields_invalid";
  assertSenaRequestExactKeys(body, ["runId", "status", "notes"], {
    label: "Validation review request",
    code
  });
  assertSenaRequestStringTreeBudget(body, {
    label: "Validation review request",
    maximumStringBytes: 8 * 1024,
    maximumTotalBytes: 12 * 1024,
    maximumNodes: 32,
    maximumDepth: 3,
    code
  });
}

export async function admitSenaValidationMutationRequest(
  request: Request,
  method: "POST" | "PATCH"
) {
  const admitted = await readSenaBoundedJsonObjectRequest(request, {
    label: "Validation",
    maximumBytes: method === "POST"
      ? SENA_VALIDATION_POST_REQUEST_BYTE_LIMIT
      : SENA_VALIDATION_PATCH_REQUEST_BYTE_LIMIT,
    maximumChunks: method === "POST"
      ? SENA_HEAVY_JSON_REQUEST_CHUNK_LIMIT
      : SENA_SMALL_JSON_REQUEST_CHUNK_LIMIT,
    codes: validationCodes
  });
  if (method === "POST") assertValidationPostBody(admitted.body);
  else assertValidationPatchBody(admitted.body);
  return admitted;
}

function assertExpertReviewBody(body: Record<string, unknown>, method: "POST" | "PATCH") {
  const code = "expert_review_request_fields_invalid";
  const common = [
    "status",
    "claimScope",
    "ratings",
    "dataAdequacy",
    "methodFit",
    "interpretationValidity",
    "strengths",
    "concerns",
    "recommendations",
    "limitations"
  ] as const;
  assertSenaRequestExactKeys(body, method === "POST" ? [
    "projectId",
    "target",
    "kind",
    "id",
    "label",
    "reviewerName",
    "reviewerRole",
    "expertiseArea",
    ...common
  ] : [
    "reviewId",
    "expertReviewId",
    ...common
  ], { label: "Expert review request", code });
  assertExactObjectIfPresent(body.target, ["kind", "id", "label"], "Expert review request.target", code);
  assertExactObjectIfPresent(body.ratings, [
    "dataAdequacy",
    "methodFit",
    "interpretationValidity"
  ], "Expert review request.ratings", code);
  const target = body.target && typeof body.target === "object" && !Array.isArray(body.target)
    ? body.target as Record<string, unknown>
    : undefined;
  assertSenaRequestStringTreeBudget({
    projectId: body.projectId,
    reviewId: body.reviewId,
    expertReviewId: body.expertReviewId,
    id: body.id,
    targetId: target?.id
  }, {
    label: "Expert review identifiers",
    maximumStringBytes: 512,
    maximumTotalBytes: 4 * 1024,
    maximumNodes: 32,
    maximumDepth: 3,
    code
  });
  assertSenaRequestStringTreeBudget({
    reviewerName: body.reviewerName,
    reviewerRole: body.reviewerRole,
    expertiseArea: body.expertiseArea,
    label: body.label,
    targetLabel: target?.label
  }, {
    label: "Expert review labels",
    maximumStringBytes: 1024,
    maximumTotalBytes: 5 * 1024,
    maximumNodes: 32,
    maximumDepth: 3,
    code
  });
  assertSenaRequestStringTreeBudget({
    strengths: body.strengths,
    concerns: body.concerns,
    recommendations: body.recommendations,
    limitations: body.limitations
  }, {
    label: "Expert review narrative",
    maximumStringBytes: 8 * 1024,
    maximumTotalBytes: 32 * 1024,
    maximumNodes: 32,
    maximumDepth: 3,
    code
  });
}

export async function admitSenaExpertReviewMutationRequest(
  request: Request,
  method: "POST" | "PATCH"
) {
  const admitted = await readSenaBoundedJsonObjectRequest(request, {
    label: "Expert review",
    maximumBytes: SENA_EXPERT_REVIEW_REQUEST_BYTE_LIMIT,
    maximumChunks: SENA_SMALL_JSON_REQUEST_CHUNK_LIMIT,
    codes: expertReviewCodes
  });
  assertExpertReviewBody(admitted.body, method);
  return admitted;
}

function assertAnalysisBody(body: Record<string, unknown>) {
  const code = "analysis_request_fields_invalid";
  assertSenaRequestExactKeys(body, [
    "projectId",
    "snapshot",
    "dataset",
    "buildOptions",
    "title",
    "activeTemporalWindowId",
    "includeRuntimeBundle",
    "humanReview",
    "codingReliability",
    "dataGovernance",
    "teamId",
    "queue",
    "persist",
    "updateProject",
    "expectedVersion",
    "description"
  ], { label: "Analysis request", code });
  for (const field of ["title", "description"] as const) {
    if (Object.hasOwn(body, field) && body[field] !== undefined && typeof body[field] !== "string") {
      fieldsInvalid(`Analysis request.${field}`, code);
    }
  }
  assertBuildOptions(body.buildOptions, "Analysis request.buildOptions", code);
  assertSenaRequestStringTreeBudget({
    projectId: body.projectId,
    teamId: body.teamId,
    activeTemporalWindowId: body.activeTemporalWindowId
  }, {
    label: "Analysis request identifiers",
    maximumStringBytes: 512,
    maximumTotalBytes: 2 * 1024,
    maximumNodes: 24,
    maximumDepth: 3,
    code
  });
  assertSenaRequestStringTreeBudget({ title: body.title, description: body.description }, {
    label: "Analysis request project metadata",
    maximumStringBytes: 8 * 1024,
    maximumTotalBytes: 16 * 1024,
    maximumNodes: 16,
    maximumDepth: 3,
    code
  });
  assertAnalysisDocumentation({
    humanReview: body.humanReview,
    codingReliability: body.codingReliability,
    dataGovernance: body.dataGovernance
  }, "Analysis request documentation", code);
}

export async function admitSenaAnalysisMutationRequest(request: Request) {
  const admitted = await readSenaBoundedJsonObjectRequest(request, {
    label: "Analysis",
    maximumBytes: SENA_ANALYSIS_REQUEST_BYTE_LIMIT,
    maximumChunks: SENA_HEAVY_JSON_REQUEST_CHUNK_LIMIT,
    codes: analysisCodes
  });
  assertAnalysisBody(admitted.body);
  return admitted;
}

export async function admitSenaImportMultipartRequest(request: Request) {
  return readSenaBoundedMultipartRequest(request, {
    label: "Import",
    maximumBytes: SENA_IMPORT_REQUEST_BYTE_LIMIT,
    maximumChunks: SENA_IMPORT_REQUEST_CHUNK_LIMIT,
    codes: importCodes,
    multipart: {
      maximumFiles: SENA_IMPORT_MAX_FILES,
      maximumFileBytes: senaEnterpriseUploadMaxBytes(),
      maximumAggregateFileBytes: SENA_IMPORT_MAX_AGGREGATE_FILE_BYTES,
      maximumFields: SENA_IMPORT_MAX_FIELDS,
      maximumFieldBytes: SENA_IMPORT_MAX_FIELD_BYTES,
      maximumAggregateFieldBytes: SENA_IMPORT_MAX_AGGREGATE_FIELD_BYTES
    }
  });
}

const importFileField = "files";
const importScalarFields = new Set([
  "teamId",
  "action",
  "persistProject",
  "buildOptions",
  "activeTemporalWindowId",
  "includeRuntimeBundle",
  "codingReliability",
  "dataGovernance",
  "queue",
  "title",
  "description"
]);

export function assertSenaImportFormDataContract(form: FormData) {
  const seenScalars = new Set<string>();
  let fileCount = 0;
  for (const [name, value] of form.entries()) {
    if (name === importFileField) {
      if (!(value instanceof File)) fieldsInvalid("Import form", "import_request_fields_invalid");
      fileCount += 1;
      if (fileCount > SENA_IMPORT_MAX_FILES) fieldsInvalid("Import form", "import_request_fields_invalid");
      continue;
    }
    if (!importScalarFields.has(name) || typeof value !== "string" || seenScalars.has(name)) {
      fieldsInvalid("Import form", "import_request_fields_invalid");
    }
    seenScalars.add(name);
  }
}

export function assertSenaImportFileCollectionLimits(files: readonly File[]) {
  const maximumFileBytes = senaEnterpriseUploadMaxBytes();
  let aggregateBytes = 0;
  if (files.length > SENA_IMPORT_MAX_FILES) {
    throw new SenaEnterpriseError(
      "Import multipart request exceeds the file-count limit.",
      413,
      "import_request_multipart_limits_exceeded"
    );
  }
  for (const file of files) {
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > maximumFileBytes) {
      throw new SenaEnterpriseError(
        "Import multipart request exceeds the per-file-byte limit.",
        413,
        "import_request_multipart_limits_exceeded"
      );
    }
    if (file.size > SENA_IMPORT_MAX_AGGREGATE_FILE_BYTES - aggregateBytes) {
      throw new SenaEnterpriseError(
        "Import multipart request exceeds the aggregate-file-byte limit.",
        413,
        "import_request_multipart_limits_exceeded"
      );
    }
    aggregateBytes += file.size;
  }
}

export function assertSenaImportControlContracts(input: {
  buildOptions?: unknown;
  codingReliability?: unknown;
  dataGovernance?: unknown;
}) {
  const code = "import_request_fields_invalid";
  assertBuildOptions(input.buildOptions, "Import buildOptions", code);
  assertAnalysisDocumentation({
    codingReliability: input.codingReliability,
    dataGovernance: input.dataGovernance
  }, "Import documentation", code);
}
