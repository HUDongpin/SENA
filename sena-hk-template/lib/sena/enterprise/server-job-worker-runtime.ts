import { createHash, randomBytes } from "node:crypto";
import { buildSenaAnalysisRun, type SenaAnalysisRunInput } from "../analysis-run";
import { buildSenaAnalysisRunRequestInput, sanitizeSenaClientCodingReliability } from "../analysis-api";
import {
  SenaInputValidationError,
  type SenaInputValidationIssue
} from "../analytical-input-validation";
import {
  importSenaEnterpriseFiles,
  withSenaImportDatasetMetadata
} from "../import-adapters";
import {
  assertSenaReliabilitySingleSourceMode,
  buildSenaReliabilityDashboard,
  normalizeSenaReliabilityUploadIds,
  reliabilityDashboardToReview,
  SenaReliabilityAnnotationValidationError,
  SenaReliabilitySourceInputError,
  SenaReliabilityUniverseLimitError,
  senaReliabilitySnapshotFingerprint,
  type SenaReliabilityAnnotationValidationIssue,
  type SenaReliabilitySourceInputIssue,
  type SenaReliabilityUniverseLimitIssue
} from "../reliability";
import {
  assertSenaReliabilityJsonRequestWithinLimits,
  prepareSenaReliabilityJsonRequest,
  type SenaPreparedReliabilityRunInput,
  type SenaReliabilityJsonRequest
} from "../reliability-api";
import {
  parseSenaReliabilityReviewerEnvelope,
  SENA_RELIABILITY_REVIEWER_ENVELOPE_PROFILE
} from "../reliability-queue-reviewer";
import { contextFromDb, type SenaEnterpriseSession, type SenaEnterpriseSessionContext } from "./auth-session";
import { SenaEnterpriseError } from "./errors";
import {
  createEnterpriseAnalysisRunWithPostgresMirrorAsync,
  createEnterpriseImportRunWithPostgresMirrorAsync,
  readEnterpriseUploadContentsAsync,
  recordEnterpriseUploadWarningCountsAsync,
  type SenaEnterpriseUploadContent
} from "./import-analysis";
import { now } from "./ops-runtime";
import {
  parseEnterpriseReliabilityUploadContents,
  prepareEnterpriseReliabilityQueuedJsonUploads,
  readEnterpriseReliabilityUploadPointerContents
} from "./reliability-upload-reader";
import { senaReliabilityServerSourceByteLimit } from "./upload-limits";
import {
  buildEnterpriseReliabilityRunResponseWithPostgresMirrorAsync
} from "./reliability-runs";
import {
  claimEnterpriseServerJob,
  getEnterpriseServerJob,
  listEnterpriseServerJobs,
  stableServerJobPayloadSha256,
  updateEnterpriseServerJobStatus,
  type SenaEnterpriseServerJob,
  type SenaEnterpriseServerJobKind,
  type SenaEnterpriseServerJobStatus
} from "./server-job-queue";
import { readEnterpriseState } from "./state";
import {
  createEnterpriseProjectAsync,
  getEnterpriseProjectAsync,
  getEnterpriseProjectReadOnlyAsync,
  updateEnterpriseProjectAsync
} from "./team-project";
import { runWithSenaValidationRequestScope } from "./validation-request-scope";

/**
 * The in-repo executor for queued SENA server jobs.
 *
 * Before this module the queue had no consumer anywhere in the repository: the
 * worker webhook route acknowledged signed deliveries and returned 202 without
 * running anything, so with any production gate set (which forces every heavy
 * POST through the queue) an import or analysis could never complete. This
 * module is that missing consumer. It claims a queued job, runs it through the
 * same builders the synchronous routes use, and reports the terminal state back
 * through updateEnterpriseServerJobStatus — the existing lifecycle, not a new
 * one.
 *
 * It does not duplicate queue persistence: enqueue, dispatch, signing, the
 * atomic claim, and the status machine stay in server-job-queue.ts, while this
 * module remains a caller of those boundaries.
 */

export type SenaServerJobWorkerAction = SenaEnterpriseServerJob["worker"]["expectedAction"];

/**
 * Kinds this repository can actually run today.
 *
 * `import` and the upload-pointer half of `reliability` joined this list once
 * import-analysis.ts exported readEnterpriseUploadContentsAsync: both need the
 * bytes of a registered upload, and the only acceptable way to get them is
 * through the module that owns the upload envelope, not a second decryptor
 * here. `publication-export` and `validation` are still absent — nothing in
 * this module executes them, so they are reported as having no executor rather
 * than being claimed and failed.
 */
export const senaServerJobWorkerExecutableKinds = ["analysis", "import", "reliability"] as const;

export type SenaServerJobWorkerExecutableKind = typeof senaServerJobWorkerExecutableKinds[number];

export type SenaServerJobWorkerResult = {
  analysisRunId?: string;
  importRunId?: string;
  persistedProjectId?: string;
  reliabilityRunId?: string;
  reportSha256?: string;
  projectSnapshotSha256?: string;
};

export type SenaServerJobWorkerOutcomeStatus = "succeeded" | "failed" | "skipped";

export type SenaServerJobWorkerIssue = SenaInputValidationIssue
  | SenaReliabilityUniverseLimitIssue
  | SenaReliabilitySourceInputIssue
  | SenaReliabilityAnnotationValidationIssue;

export type SenaServerJobWorkerOutcome = {
  jobId: string;
  kind: SenaEnterpriseServerJobKind;
  action: SenaServerJobWorkerAction;
  status: SenaServerJobWorkerOutcomeStatus;
  workerRunId?: string;
  jobStatus?: SenaEnterpriseServerJobStatus;
  attempts?: number;
  retryable?: boolean;
  errorCode?: string;
  errorHash?: string;
  issues?: SenaServerJobWorkerIssue[];
  skipReason?: string;
  result?: SenaServerJobWorkerResult;
};

export type SenaServerJobWorkerDrainReport = {
  generatedAt: string;
  scanned: number;
  succeeded: number;
  failed: number;
  skipped: number;
  outcomes: SenaServerJobWorkerOutcome[];
};

/**
 * Jobs this process is executing right now.
 *
 * The set is read and written synchronously at the top of runEnterpriseServerJob
 * before it awaits anything, so two overlapping calls in one process can never
 * both pass the guard — Node's single-threaded event loop makes the check-then-
 * add atomic. Across processes the claim below adds a store-level check.
 */
const inFlightServerJobIds = new Set<string>();

function workerRunId() {
  return `worker_run_${randomBytes(12).toString("hex")}`;
}

function errorCodeOf(error: unknown) {
  if (error instanceof SenaInputValidationError) return "invalid_sena_numeric_domain";
  if (error instanceof SenaReliabilityUniverseLimitError ||
    error instanceof SenaReliabilitySourceInputError ||
    error instanceof SenaReliabilityAnnotationValidationError) return error.code;
  if (error instanceof SenaEnterpriseError) return error.code;
  return "server_job_worker_execution_failed";
}

function errorIssuesOf(error: unknown) {
  if (error instanceof SenaInputValidationError) {
    return error.issues.map(({ path, rule }) => ({ path, rule }));
  }
  if (error instanceof SenaReliabilityUniverseLimitError) {
    return error.issues.map(({ path, rule, actual, maximum }) => ({ path, rule, actual, maximum }));
  }
  if (error instanceof SenaReliabilitySourceInputError) {
    return error.issues.map(({ path, rule }) => ({ path, rule }));
  }
  if (error instanceof SenaReliabilityAnnotationValidationError) {
    return error.issues.map(({ path, code }) => ({ path, code }));
  }
  return undefined;
}

function errorHashOf(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return createHash("sha256").update(message.trim() || errorCodeOf(error)).digest("hex");
}

function isExecutableKind(kind: SenaEnterpriseServerJobKind): kind is SenaServerJobWorkerExecutableKind {
  return (senaServerJobWorkerExecutableKinds as readonly string[]).includes(kind);
}

/**
 * Rebuilds the queueing actor's rights so the executor runs with exactly the
 * permissions the requester had — no wider. The session object is synthetic and
 * never persisted: it exists only to satisfy contextFromDb, which is where the
 * user's live memberships are read from. If the user has since been removed the
 * job fails loudly instead of running unauthenticated.
 */
async function workerSessionContext(job: SenaEnterpriseServerJob): Promise<SenaEnterpriseSessionContext> {
  const state = await readEnterpriseState();
  const session: SenaEnterpriseSession = {
    id: `sess_worker_${job.id}`,
    userId: job.actorUserId,
    tokenHash: "server-job-worker-runtime-no-token",
    createdAt: job.queuedAt,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    sessionProfile: "standard",
    ttlDays: 1
  };
  return contextFromDb(state.db, session);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function uploadPointers(payload: Record<string, unknown>) {
  return Array.isArray(payload.uploadIds)
    ? payload.uploadIds.map((value) => String(value)).filter(Boolean)
    : [];
}

function reliabilityUploadPointers(payload: Record<string, unknown>) {
  return normalizeSenaReliabilityUploadIds(payload.uploadIds);
}

/**
 * Presents a decrypted upload to the import adapters in the same shape the
 * synchronous route hands them a multipart File.
 *
 * The name is upload.originalName, which is what the upload registry kept: the
 * raw multipart filename is not persisted anywhere, so a queued import names
 * its sources by the sanitized name. Everything downstream of the adapters
 * (createEnterpriseImportRunInDb) sanitizes the name again anyway.
 */
function importAdapterFile(content: SenaEnterpriseUploadContent) {
  const bytes = content.bytes;
  return {
    name: content.upload.originalName,
    contentType: content.upload.contentType,
    text: async () => bytes.toString("utf8"),
    arrayBuffer: async () => {
      // A standalone copy rather than a view into Node's shared Buffer pool.
      const copy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copy).set(bytes);
      return copy;
    }
  };
}

/**
 * H10: the queueing routes leave warningCount unset on purpose. Import enqueue
 * now performs a non-persistent validation preflight, but this worker remains
 * the authoritative parser of the registered bytes and reports what it saw.
 */
async function reportUploadParseWarnings(
  teamId: string,
  entries: Array<{ uploadId: string; warningCount: number }>
) {
  if (entries.length === 0) return;
  await recordEnterpriseUploadWarningCountsAsync(entries, teamId);
}

async function executeImportJob(
  job: SenaEnterpriseServerJob,
  payload: Record<string, unknown>,
  context: SenaEnterpriseSessionContext
): Promise<SenaServerJobWorkerResult> {
  const teamId = optionalString(payload.teamId) ?? job.teamId;
  const uploadIds = uploadPointers(payload);
  if (uploadIds.length === 0) {
    // An import with no files would "succeed" on an empty dataset, which is
    // worse than failing: the user would see a completed import run for
    // nothing. Refuse instead.
    throw new SenaEnterpriseError(
      "Queued import jobs carry upload pointers; this job named none.",
      400,
      "server_job_worker_import_uploads_required"
    );
  }

  // Raises on an unknown id, a foreign team, a missing blob, or a checksum
  // mismatch — the import never runs on partial or empty bytes.
  const contents = await readEnterpriseUploadContentsAsync(context, { teamId, uploadIds });
  const result = await importSenaEnterpriseFiles(contents.map(importAdapterFile));
  const dataGovernance = payload.dataGovernance as SenaAnalysisRunInput["dataGovernance"] | undefined;
  const dataset = withSenaImportDatasetMetadata(result.dataset, dataGovernance, now());

  const importRun = await createEnterpriseImportRunWithPostgresMirrorAsync(context, {
    teamId,
    uploadIds: contents.map((content) => content.upload.id),
    sources: result.sources,
    warnings: result.warnings,
    dataset,
    cleaningManifest: result.cleaningManifest
  });
  const warningCountByName = new Map(result.sources.map((source) => [source.name, source.warnings.length]));
  await reportUploadParseWarnings(teamId, contents.flatMap((content) => {
    const warningCount = warningCountByName.get(content.upload.originalName);
    return warningCount === undefined ? [] : [{ uploadId: content.upload.id, warningCount }];
  }));

  if (payload.persistProject !== true) {
    return { importRunId: importRun.id };
  }

  const title = optionalString(payload.title) ?? `Imported SENA Project ${new Date().toISOString().slice(0, 10)}`;
  const run = buildSenaAnalysisRun({
    sourceKind: "dataset",
    dataset,
    buildOptions: payload.buildOptions as SenaAnalysisRunInput["buildOptions"],
    title,
    activeTemporalWindowId: optionalString(payload.activeTemporalWindowId),
    includeRuntimeBundle: payload.includeRuntimeBundle === true,
    codingReliability: sanitizeSenaClientCodingReliability(payload.codingReliability),
    dataGovernance
  });
  const persistedProject = await createEnterpriseProjectAsync(context, {
    teamId,
    title,
    description: optionalString(payload.description) ?? `Created from import run ${importRun.id}.`,
    snapshot: run.projectSnapshot
  });
  const analysisRun = await createEnterpriseAnalysisRunWithPostgresMirrorAsync(context, {
    teamId,
    persistedProjectId: persistedProject.id,
    run
  });

  return {
    importRunId: importRun.id,
    persistedProjectId: persistedProject.id,
    analysisRunId: analysisRun.id,
    reportSha256: analysisRun.artifactFingerprints.reportSha256,
    projectSnapshotSha256: analysisRun.artifactFingerprints.projectSnapshotSha256
  };
}

async function admitReliabilityUploadContentsJob(
  contents: SenaEnterpriseUploadContent[]
) {
  const pointerInput = await parseEnterpriseReliabilityUploadContents(contents);
  const dashboard = buildSenaReliabilityDashboard(pointerInput.parsed.annotations, {
    skippedCells: pointerInput.parsed.skippedCells
  });
  return {
    contents,
    ...pointerInput,
    dashboard: {
      ...dashboard,
      warnings: [...pointerInput.fileWarnings, ...pointerInput.parsed.warnings, ...dashboard.warnings]
    }
  };
}

type SenaReliabilityJobAdmission =
  | {
      source: "uploads";
      input: Awaited<ReturnType<typeof admitReliabilityUploadContentsJob>>;
    }
  | {
      source: "json";
      input: SenaPreparedReliabilityRunInput;
    };

function hasOwn(payload: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function queuedReliabilityJsonSourceSupplied(payload: Record<string, unknown>) {
  return ["inlineAnnotations", "files", "annotations", "rows", "data"]
    .some((key) => hasOwn(payload, key));
}

function queuedReliabilityJsonPayload(payload: Record<string, unknown>): SenaReliabilityJsonRequest {
  const result: SenaReliabilityJsonRequest = {
    teamId: payload.teamId,
    projectId: payload.projectId,
    projectVersion: payload.projectVersion,
    reviewer: payload.reviewer,
    sourceName: payload.sourceName
  };
  if (hasOwn(payload, "files")) result.files = payload.files;
  // inlineAnnotations is the managed-worker transport alias and retains its
  // historical semantic precedence. Admission below still counts every
  // additional public alias supplied beside it.
  if (hasOwn(payload, "inlineAnnotations")) result.annotations = payload.inlineAnnotations;
  else if (hasOwn(payload, "annotations")) result.annotations = payload.annotations;
  if (hasOwn(payload, "rows")) result.rows = payload.rows;
  if (hasOwn(payload, "data")) result.data = payload.data;
  return result;
}

function queuedReliabilityAdmissionPayload(payload: Record<string, unknown>): SenaReliabilityJsonRequest {
  if (!hasOwn(payload, "inlineAnnotations")) return queuedReliabilityJsonPayload(payload);
  if (hasOwn(payload, "files") && !Array.isArray(payload.files)) {
    return { files: payload.files };
  }
  const files = Array.isArray(payload.files) ? [...payload.files] : [];
  for (const key of ["inlineAnnotations", "annotations", "rows", "data"] as const) {
    if (!hasOwn(payload, key)) continue;
    files.push({
      name: `queued-reliability-${key}.json`,
      data: payload[key]
    });
  }
  return { files };
}

function admitReliabilityInlineJob(
  payload: Record<string, unknown>,
  defaultReviewer: string
): SenaPreparedReliabilityRunInput {
  const semanticPayload = queuedReliabilityJsonPayload(payload);
  assertSenaReliabilityJsonRequestWithinLimits(queuedReliabilityAdmissionPayload(payload), {
    sourceBytes: senaReliabilityServerSourceByteLimit()
  });
  return prepareSenaReliabilityJsonRequest(semanticPayload, { defaultReviewer });
}

async function admitReliabilityJob(
  job: SenaEnterpriseServerJob,
  payload: Record<string, unknown>,
  context: SenaEnterpriseSessionContext
): Promise<SenaReliabilityJobAdmission> {
  const uploadIds = reliabilityUploadPointers(payload);
  const inlineSourceSupplied = queuedReliabilityJsonSourceSupplied(payload);
  assertSenaReliabilitySingleSourceMode({
    json: inlineSourceSupplied,
    uploadPointers: uploadIds.length > 0
  });
  if (uploadIds.length > 0) {
    const teamId = optionalString(payload.teamId) ?? job.teamId;
    const { contents } = await readEnterpriseReliabilityUploadPointerContents(context, { teamId, uploadIds });
    const queuedJson = prepareEnterpriseReliabilityQueuedJsonUploads(contents, context.user.name);
    if (queuedJson) return { source: "json", input: queuedJson };
    return {
      source: "uploads",
      input: await admitReliabilityUploadContentsJob(contents)
    };
  }
  if (inlineSourceSupplied) {
    return {
      source: "json",
      input: admitReliabilityInlineJob(payload, context.user.name)
    };
  }
  throw new SenaEnterpriseError(
    "Queued reliability jobs need either upload pointers or inline annotations.",
    400,
    "server_job_worker_reliability_source_missing"
  );
}

async function executeReliabilityUploadsJob(
  job: SenaEnterpriseServerJob,
  payload: Record<string, unknown>,
  context: SenaEnterpriseSessionContext,
  admission: Awaited<ReturnType<typeof admitReliabilityUploadContentsJob>>,
  reviewer: string
): Promise<SenaServerJobWorkerResult> {
  const teamId = optionalString(payload.teamId) ?? job.teamId;
  const { contents, parsedFiles, parsed, dashboard } = admission;
  const response = await buildEnterpriseReliabilityRunResponseWithPostgresMirrorAsync(context, {
    teamId,
    projectId: optionalString(payload.projectId) ?? job.projectId,
    projectVersion: typeof payload.projectVersion === "number" ? payload.projectVersion : undefined,
    reviewer,
    fileCount: contents.length,
    annotationCount: parsed.annotations.length,
    annotations: parsed.annotations,
    skippedCells: parsed.skippedCells,
    // upload.sha256 is the checksum of exactly these plaintext bytes; the
    // reader refuses to return content that no longer matches it.
    inputFiles: contents.map((content) => ({
      name: content.upload.originalName,
      size: content.bytes.byteLength,
      sha256: content.upload.sha256
    })),
    dashboard,
    reviewPatch: reliabilityDashboardToReview(dashboard, reviewer)
  });
  await reportUploadParseWarnings(teamId, contents.map((content, index) => ({
    uploadId: content.upload.id,
    warningCount: parsedFiles[index].warnings.length
  })));

  const reliabilityRun = (response.body as { reliabilityRun?: { id?: string } }).reliabilityRun;
  return { reliabilityRunId: reliabilityRun?.id };
}

async function executeReliabilityInlineJob(
  job: SenaEnterpriseServerJob,
  payload: Record<string, unknown>,
  context: SenaEnterpriseSessionContext,
  admission: SenaPreparedReliabilityRunInput,
  reviewer: string
): Promise<SenaServerJobWorkerResult> {
  const response = await buildEnterpriseReliabilityRunResponseWithPostgresMirrorAsync(context, {
    teamId: optionalString(payload.teamId) ?? job.teamId,
    projectId: optionalString(payload.projectId) ?? job.projectId,
    projectVersion: typeof payload.projectVersion === "number" ? payload.projectVersion : undefined,
    reviewer,
    fileCount: admission.fileCount,
    annotationCount: admission.annotationCount,
    annotations: admission.annotations,
    skippedCells: admission.skippedCells,
    inputFiles: admission.inputFiles,
    dashboard: admission.dashboard,
    reviewPatch: reliabilityDashboardToReview(admission.dashboard, reviewer)
  });
  const reliabilityRun = (response.body as { reliabilityRun?: { id?: string } }).reliabilityRun;
  return { reliabilityRunId: reliabilityRun?.id };
}

async function queuedReliabilityReviewer(
  job: SenaEnterpriseServerJob,
  payload: Record<string, unknown>,
  context: SenaEnterpriseSessionContext
) {
  const uploadId = optionalString(payload.reviewerEnvelopeUploadId);
  const expectedSha256 = optionalString(payload.reviewerEnvelopeSha256);
  if (!uploadId && !expectedSha256) {
    // Legacy externally delivered jobs carried reviewer directly. Retain that
    // read compatibility, while every new public queue route uses the encrypted
    // envelope below so the job receipt and payload summary remain PII-free.
    return optionalString(payload.reviewer) ?? context.user.name;
  }
  if (!uploadId || !expectedSha256) {
    throw new SenaEnterpriseError(
      "Queued reliability reviewer evidence is incomplete.",
      400,
      "server_job_worker_reliability_reviewer_invalid"
    );
  }
  const teamId = optionalString(payload.teamId) ?? job.teamId;
  const [content] = await readEnterpriseUploadContentsAsync(context, { teamId, uploadIds: [uploadId] });
  if (content.upload.importProfile !== SENA_RELIABILITY_REVIEWER_ENVELOPE_PROFILE ||
    content.upload.sha256 !== expectedSha256) {
    throw new SenaEnterpriseError(
      "Queued reliability reviewer evidence does not match its canonical envelope.",
      409,
      "server_job_worker_reliability_reviewer_invalid"
    );
  }
  try {
    return parseSenaReliabilityReviewerEnvelope(content.bytes);
  } catch {
    throw new SenaEnterpriseError(
      "Queued reliability reviewer evidence is invalid.",
      400,
      "server_job_worker_reliability_reviewer_invalid"
    );
  }
}

async function executeAnalysisJob(
  job: SenaEnterpriseServerJob,
  payload: Record<string, unknown>,
  context: SenaEnterpriseSessionContext
): Promise<SenaServerJobWorkerResult> {
  const projectId = optionalString(payload.projectId) ?? job.projectId;
  const sourceProject = projectId ? await getEnterpriseProjectAsync(context, projectId) : null;
  if (sourceProject && typeof payload.projectVersion === "number" && sourceProject.currentVersion !== payload.projectVersion) {
    // The queued job named a specific project version. Running against a newer
    // snapshot would silently return an analysis nobody asked for.
    throw new SenaEnterpriseError(
      "The SENA project changed after this job was queued.",
      409,
      "server_job_worker_project_version_changed"
    );
  }

  const body = {
    teamId: job.teamId,
    projectId,
    title: payload.title,
    snapshot: payload.inlineSnapshot,
    dataset: payload.inlineDataset,
    buildOptions: payload.buildOptions,
    activeTemporalWindowId: payload.activeTemporalWindowId,
    includeRuntimeBundle: payload.includeRuntimeBundle === true,
    humanReview: payload.humanReview,
    codingReliability: payload.codingReliability,
    dataGovernance: payload.dataGovernance
  };
  const run = buildSenaAnalysisRun(buildSenaAnalysisRunRequestInput({ body, sourceProject }));

  const persist = payload.persist === true;
  const updateExistingProject = persist && sourceProject && payload.updateProject !== false;
  const persistedProject = persist
    ? updateExistingProject && sourceProject
      ? await updateEnterpriseProjectAsync(context, sourceProject.id, {
        title: optionalString(payload.title),
        expectedVersion: typeof payload.expectedVersion === "number" ? payload.expectedVersion : undefined,
        snapshot: run.projectSnapshot
      })
      : await createEnterpriseProjectAsync(context, {
        teamId: job.teamId,
        title: optionalString(payload.title) ?? run.summary.title,
        description: "Created by the SENA server job worker.",
        snapshot: run.projectSnapshot
      })
    : null;

  const analysisRun = await createEnterpriseAnalysisRunWithPostgresMirrorAsync(context, {
    teamId: job.teamId,
    projectId: sourceProject?.id,
    persistedProjectId: persistedProject?.id,
    run
  });

  return {
    analysisRunId: analysisRun.id,
    persistedProjectId: persistedProject?.id,
    reportSha256: analysisRun.artifactFingerprints.reportSha256,
    projectSnapshotSha256: analysisRun.artifactFingerprints.projectSnapshotSha256
  };
}

async function executeReliabilityJob(
  job: SenaEnterpriseServerJob,
  payload: Record<string, unknown>,
  context: SenaEnterpriseSessionContext,
  admission: SenaReliabilityJobAdmission
): Promise<SenaServerJobWorkerResult> {
  const projectId = optionalString(payload.projectId) ?? job.projectId;
  if (projectId) {
    const project = await getEnterpriseProjectReadOnlyAsync(context, projectId);
    const projectVersion = payload.projectVersion;
    const snapshotFingerprint = optionalString(payload.snapshotFingerprint);
    if (!Number.isInteger(projectVersion) || !snapshotFingerprint ||
      project.currentVersion !== projectVersion ||
      senaReliabilitySnapshotFingerprint(project.snapshot) !== snapshotFingerprint) {
      throw new SenaEnterpriseError(
        "The SENA project binding changed after this reliability job was queued.",
        409,
        "server_job_worker_reliability_project_binding_changed"
      );
    }
  }
  const reviewer = await queuedReliabilityReviewer(job, payload, context);
  if (admission.source === "uploads") {
    return executeReliabilityUploadsJob(job, payload, context, admission.input, reviewer);
  }
  return executeReliabilityInlineJob(job, payload, context, admission.input, reviewer);
}

async function executeByKind(
  job: SenaEnterpriseServerJob,
  payload: Record<string, unknown>,
  options: { reliabilityAdmission?: SenaReliabilityJobAdmission } = {}
): Promise<SenaServerJobWorkerResult> {
  const context = await workerSessionContext(job);
  if (job.kind === "analysis") return executeAnalysisJob(job, payload, context);
  if (job.kind === "import") return executeImportJob(job, payload, context);
  if (job.kind === "reliability") {
    const admission = options.reliabilityAdmission ?? await admitReliabilityJob(job, payload, context);
    return executeReliabilityJob(job, payload, context, admission);
  }
  throw new SenaEnterpriseError(
    `No in-repo executor is registered for SENA server job kind ${job.kind}.`,
    501,
    "server_job_worker_executor_unavailable"
  );
}

function skipped(job: SenaEnterpriseServerJob, skipReason: string): SenaServerJobWorkerOutcome {
  return {
    jobId: job.id,
    kind: job.kind,
    action: job.worker.expectedAction,
    status: "skipped",
    jobStatus: job.status,
    attempts: job.lifecycle.attempts,
    skipReason
  };
}

function failedBeforeClaim(job: SenaEnterpriseServerJob, error: unknown): SenaServerJobWorkerOutcome {
  return {
    jobId: job.id,
    kind: job.kind,
    action: job.worker.expectedAction,
    status: "failed",
    jobStatus: job.status,
    attempts: job.lifecycle.attempts,
    retryable: job.lifecycle.retryable,
    errorCode: errorCodeOf(error),
    errorHash: errorHashOf(error),
    issues: errorIssuesOf(error)
  };
}

/**
 * Takes the job out of `queued` for this worker run.
 *
 * The queue owns the compare-and-set: production Postgres updates only a row
 * whose status is still queued, while the local development store makes its
 * synchronous transition in one process turn. A losing contender never
 * receives the admitted work product for execution.
 */
async function claimServerJob(jobId: string, runId: string) {
  return claimEnterpriseServerJob({ jobId, workerRunId: runId });
}

/**
 * Runs one job end to end: claim, execute, report a terminal status.
 *
 * `workerPayload` is the payload the queue signed and delivered. The job store
 * never persists it (rawPayloadPersistedInJobStore: false), so the caller must
 * supply it — either from the signed webhook body or from a reproduction that
 * matched job.payloadSha256.
 */
export async function runEnterpriseServerJob(input: {
  job: SenaEnterpriseServerJob;
  workerPayload: unknown;
  runId?: string;
}): Promise<SenaServerJobWorkerOutcome> {
  const job = input.job;
  if (!isExecutableKind(job.kind)) {
    // Never claimed, so a real external worker can still take it.
    return skipped(job, "server_job_worker_executor_unavailable");
  }
  if (inFlightServerJobIds.has(job.id)) {
    return skipped(job, "server_job_worker_job_in_flight");
  }
  inFlightServerJobIds.add(job.id);

  const runId = input.runId ?? workerRunId();
  try {
    const payload = (input.workerPayload ?? {}) as Record<string, unknown>;
    let reliabilityAdmission: SenaReliabilityJobAdmission | undefined;
    let candidate = job;
    if (job.kind === "reliability") {
      // Cross-process contenders may repeat this bounded, read-only preflight,
      // but no contender mutates the job until its complete source universe is
      // admitted. claimServerJob below remains the single execution winner.
      candidate = await getEnterpriseServerJob(job.id);
      if (candidate.status !== "queued") {
        return skipped(candidate, "server_job_worker_job_not_queued");
      }
      try {
        const context = await workerSessionContext(candidate);
        reliabilityAdmission = await admitReliabilityJob(candidate, payload, context);
      } catch (error) {
        return failedBeforeClaim(candidate, error);
      }
    }

    const claim = await claimServerJob(candidate.id, runId);
    if (!claim.claimed) return skipped(claim.job, claim.reason);

    try {
      const result = await executeByKind(claim.job, payload, { reliabilityAdmission });
      const update = await updateEnterpriseServerJobStatus({
        jobId: job.id,
        action: "mark-succeeded",
        workerRunId: runId
      });
      return {
        jobId: job.id,
        kind: job.kind,
        action: job.worker.expectedAction,
        status: "succeeded",
        workerRunId: runId,
        jobStatus: update.job.status,
        attempts: update.job.lifecycle.attempts,
        retryable: update.job.lifecycle.retryable,
        result
      };
    } catch (error) {
      // A worker that silently drops a job is worse than no worker: every
      // execution failure is written back as a failure with its code and a
      // hash of the message (the message itself may quote user data).
      const errorCode = errorCodeOf(error);
      const errorHash = errorHashOf(error);
      const issues = errorIssuesOf(error);
      const update = await updateEnterpriseServerJobStatus({
        jobId: job.id,
        action: "mark-failed",
        workerRunId: runId,
        errorCode,
        errorHash,
        reason: "server-job-worker-execution-failed"
      });
      return {
        jobId: job.id,
        kind: job.kind,
        action: job.worker.expectedAction,
        status: "failed",
        workerRunId: runId,
        jobStatus: update.job.status,
        attempts: update.job.lifecycle.attempts,
        retryable: update.job.lifecycle.retryable,
        errorCode,
        errorHash,
        issues
      };
    }
  } finally {
    inFlightServerJobIds.delete(job.id);
  }
}

/**
 * Rebuilds the payload an analysis job was queued with, from what the job store
 * actually kept.
 *
 * The store holds a redacted payloadSummary plus payloadSha256, never the raw
 * payload — so a reproduction is only usable if it hashes to the same value.
 * The caller checks that; anything that does not match is refused rather than
 * executed, which is what keeps the polling worker from running a *different*
 * analysis than the one the user asked for.
 */
async function reproduceAnalysisPayload(
  job: SenaEnterpriseServerJob,
  context: SenaEnterpriseSessionContext
): Promise<Record<string, unknown> | undefined> {
  if (!job.projectId) return undefined;
  const project = await getEnterpriseProjectAsync(context, job.projectId).catch(() => null);
  if (!project) return undefined;
  return {
    action: "run-analysis",
    teamId: job.teamId,
    projectId: job.projectId,
    projectVersion: job.payloadSummary.projectVersion,
    title: project.title,
    activeTemporalWindowId: job.payloadSummary.activeTemporalWindowId,
    includeRuntimeBundle: job.payloadSummary.includeRuntimeBundle === true,
    persist: job.payloadSummary.persist === true,
    updateProject: job.payloadSummary.updateProject !== false
  };
}

/**
 * Rebuilds the payload an import job was queued with, from its payloadSummary.
 *
 * Only the plain shape is recoverable: the summary keeps the upload pointers,
 * the persist flag and the runtime-bundle/temporal-window switches, but never
 * the title, description, buildOptions, codingReliability or dataGovernance the
 * request may have carried. An import queued with any of those simply will not
 * hash back, and the caller leaves it queued for the signed webhook path rather
 * than importing the same files under different options.
 */
function reproduceImportPayload(job: SenaEnterpriseServerJob): Record<string, unknown> | undefined {
  const uploadIds = job.payloadSummary.uploadIds ?? [];
  if (uploadIds.length === 0) return undefined;
  return {
    action: "run-import",
    teamId: job.teamId,
    uploadIds,
    persistProject: job.payloadSummary.persist === true,
    activeTemporalWindowId: job.payloadSummary.activeTemporalWindowId,
    includeRuntimeBundle: job.payloadSummary.includeRuntimeBundle === true
  };
}

/**
 * Rebuilds the only reliability shape accepted by the local polling queue.
 *
 * The annotations themselves remain in the encrypted upload store. The job
 * receipt keeps only its opaque upload ids plus the immutable project binding,
 * which is enough to reproduce and hash-check the worker payload without
 * persisting coder values in the public server-job record.
 */
function reproduceReliabilityPayload(job: SenaEnterpriseServerJob): Record<string, unknown> | undefined {
  const uploadIds = job.payloadSummary.uploadIds ?? [];
  if (uploadIds.length === 0) return undefined;
  return {
    action: "run-reliability",
    teamId: job.teamId,
    projectId: job.projectId,
    projectVersion: job.payloadSummary.projectVersion,
    snapshotFingerprint: job.payloadSummary.snapshotFingerprint,
    uploadIds,
    reviewerEnvelopeUploadId: job.payloadSummary.reviewerEnvelopeUploadId,
    reviewerEnvelopeSha256: job.payloadSummary.reviewerEnvelopeSha256
  };
}

async function reproducedWorkerPayload(job: SenaEnterpriseServerJob) {
  const context = await workerSessionContext(job).catch(() => null);
  if (!context) return undefined;
  const candidate = job.kind === "analysis"
    ? await reproduceAnalysisPayload(job, context)
    : job.kind === "import"
      ? reproduceImportPayload(job)
      : job.kind === "reliability"
        ? reproduceReliabilityPayload(job)
        : undefined;
  if (!candidate) return undefined;
  return stableServerJobPayloadSha256(candidate) === job.payloadSha256 ? candidate : undefined;
}

/**
 * The polling half of the worker, for deployments whose queue mode is `local`
 * (no webhook is ever dispatched, so the push path never fires).
 *
 * It only runs jobs whose payload it could reproduce byte-for-byte, proven
 * against job.payloadSha256. Everything else is reported and left queued.
 */
export async function drainEnterpriseServerJobQueue(input: {
  limit?: number;
  teamId?: string;
  kind?: SenaEnterpriseServerJobKind;
} = {}): Promise<SenaServerJobWorkerDrainReport> {
  return runWithSenaValidationRequestScope(async () => {
    const queued = await listEnterpriseServerJobs({
      status: "queued",
      claimableOnly: true,
      kind: input.kind,
      teamId: input.teamId,
      limit: input.limit ?? 25
    });
    const outcomes: SenaServerJobWorkerOutcome[] = [];
    for (const job of queued.jobs) {
      if (!isExecutableKind(job.kind)) {
        outcomes.push(skipped(job, "server_job_worker_executor_unavailable"));
        continue;
      }
      const workerPayload = await reproducedWorkerPayload(job);
      if (!workerPayload) {
        outcomes.push(skipped(job, "server_job_worker_payload_not_reproducible"));
        continue;
      }
      outcomes.push(await runEnterpriseServerJob({ job, workerPayload }));
    }
    return {
      generatedAt: now(),
      scanned: queued.jobs.length,
      succeeded: outcomes.filter((outcome) => outcome.status === "succeeded").length,
      failed: outcomes.filter((outcome) => outcome.status === "failed").length,
      skipped: outcomes.filter((outcome) => outcome.status === "skipped").length,
      outcomes
    };
  });
}

/**
 * Entry point for the signed webhook receiver.
 *
 * The route has already verified the payload hash and the HMAC signature before
 * calling this; nothing here relaxes that. The extra check is that the delivered
 * workerPayload really is the payload this job was enqueued with — a signed body
 * whose workerPayload does not hash to job.payloadSha256 is refused.
 */
export async function runEnterpriseServerJobFromQueueWebhook(input: {
  jobId: string;
  workerPayload: unknown;
}): Promise<SenaServerJobWorkerOutcome> {
  return runWithSenaValidationRequestScope(async () => {
    const job = await getEnterpriseServerJob(input.jobId);
    if (stableServerJobPayloadSha256(input.workerPayload) !== job.payloadSha256) {
      return skipped(job, "server_job_worker_payload_sha256_mismatch");
    }
    return runEnterpriseServerJob({ job, workerPayload: input.workerPayload });
  });
}

export function serverJobWorkerInlineExecutionEnabled() {
  const configured = process.env.SENA_JOB_WORKER_INLINE_EXECUTION?.trim().toLowerCase();
  if (configured === undefined || configured === "") return true;
  return !(configured === "0" || configured === "false" || configured === "no" || configured === "off");
}
