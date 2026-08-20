import { createHash, randomBytes } from "node:crypto";
import { buildSenaAnalysisRun, type SenaAnalysisRunInput } from "../analysis-run";
import { buildSenaAnalysisRunRequestInput } from "../analysis-api";
import {
  SenaInputValidationError,
  type SenaInputValidationIssue
} from "../analytical-input-validation";
import {
  importSenaEnterpriseFiles,
  readSenaReliabilityUploadRows,
  withSenaImportDatasetMetadata
} from "../import-adapters";
import {
  buildSenaReliabilityDashboard,
  parseCoderAnnotationsFromRows,
  reliabilityDashboardToReview
} from "../reliability";
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
  buildEnterpriseReliabilityJsonRunResponseWithPostgresMirrorAsync,
  buildEnterpriseReliabilityRunResponseWithPostgresMirrorAsync
} from "./reliability-runs";
import {
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
  updateEnterpriseProjectAsync
} from "./team-project";

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
 * It deliberately does not touch server-job-queue.ts: enqueue, dispatch,
 * signing and the status machine stay where they are, and this module is only
 * ever a caller of them.
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
  issues?: SenaInputValidationIssue[];
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
  if (error instanceof SenaEnterpriseError) return error.code;
  return "server_job_worker_execution_failed";
}

function errorIssuesOf(error: unknown) {
  return error instanceof SenaInputValidationError
    ? error.issues.map(({ path, rule }) => ({ path, rule }))
    : undefined;
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
    codingReliability: payload.codingReliability as SenaAnalysisRunInput["codingReliability"],
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

/**
 * Presents a decrypted upload to the shared reliability row reader in the shape
 * the synchronous route hands it a buffered multipart file.
 *
 * The name is upload.originalName for the same reason importAdapterFile uses it:
 * the raw multipart filename is not persisted, so that is the name the reader
 * dispatches on and the name its warnings are prefixed with.
 */
function reliabilityUploadFile(content: SenaEnterpriseUploadContent) {
  return { name: content.upload.originalName, bytes: content.bytes };
}

async function executeReliabilityUploadsJob(
  job: SenaEnterpriseServerJob,
  payload: Record<string, unknown>,
  context: SenaEnterpriseSessionContext,
  uploadIds: string[]
): Promise<SenaServerJobWorkerResult> {
  const teamId = optionalString(payload.teamId) ?? job.teamId;
  const contents = await readEnterpriseUploadContentsAsync(context, { teamId, uploadIds });
  const parsedFiles = await Promise.all(contents.map((content) => readSenaReliabilityUploadRows(reliabilityUploadFile(content))));
  const rows = parsedFiles.flatMap((file) => file.rows);
  const fileWarnings = parsedFiles.flatMap((file) => file.warnings);
  const parsed = parseCoderAnnotationsFromRows(rows);
  const dashboard = buildSenaReliabilityDashboard(parsed.annotations, { skippedCells: parsed.skippedCells });
  const dashboardWithWarnings = {
    ...dashboard,
    warnings: [...fileWarnings, ...parsed.warnings, ...dashboard.warnings]
  };
  const reviewer = optionalString(payload.reviewer) ?? context.user.name;
  const response = await buildEnterpriseReliabilityRunResponseWithPostgresMirrorAsync(context, {
    teamId,
    projectId: optionalString(payload.projectId) ?? job.projectId,
    reviewer,
    fileCount: contents.length,
    annotationCount: parsed.annotations.length,
    // upload.sha256 is the checksum of exactly these plaintext bytes; the
    // reader refuses to return content that no longer matches it.
    inputFiles: contents.map((content) => ({
      name: content.upload.originalName,
      size: content.bytes.byteLength,
      sha256: content.upload.sha256
    })),
    dashboard: dashboardWithWarnings,
    reviewPatch: reliabilityDashboardToReview(dashboardWithWarnings, reviewer)
  });
  await reportUploadParseWarnings(teamId, contents.map((content, index) => ({
    uploadId: content.upload.id,
    warningCount: parsedFiles[index].warnings.length
  })));

  const reliabilityRun = (response.body as { reliabilityRun?: { id?: string } }).reliabilityRun;
  return { reliabilityRunId: reliabilityRun?.id };
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
  context: SenaEnterpriseSessionContext
): Promise<SenaServerJobWorkerResult> {
  const uploadIds = uploadPointers(payload);
  // Upload pointers are the default queued shape (inline annotations exist only
  // where SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD is set), so they win when both
  // are present: the uploads are what the enqueueing route actually registered.
  if (uploadIds.length > 0) {
    return executeReliabilityUploadsJob(job, payload, context, uploadIds);
  }

  const annotations = payload.inlineAnnotations ?? payload.annotations;
  if (!Array.isArray(annotations) || annotations.length === 0) {
    // Neither uploads nor annotations: scoring an empty dashboard would publish
    // a reliability run that no coder ever produced.
    throw new SenaEnterpriseError(
      "Queued reliability jobs need either upload pointers or inline annotations.",
      400,
      "server_job_worker_reliability_source_missing"
    );
  }

  const response = await buildEnterpriseReliabilityJsonRunResponseWithPostgresMirrorAsync(context, {
    teamId: job.teamId,
    projectId: optionalString(payload.projectId) ?? job.projectId,
    reviewer: payload.reviewer,
    sourceName: payload.sourceName,
    annotations
  });
  const reliabilityRun = (response.body as { reliabilityRun?: { id?: string } }).reliabilityRun;
  return { reliabilityRunId: reliabilityRun?.id };
}

async function executeByKind(
  job: SenaEnterpriseServerJob,
  payload: Record<string, unknown>
): Promise<SenaServerJobWorkerResult> {
  const context = await workerSessionContext(job);
  if (job.kind === "analysis") return executeAnalysisJob(job, payload, context);
  if (job.kind === "import") return executeImportJob(job, payload, context);
  if (job.kind === "reliability") return executeReliabilityJob(job, payload, context);
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

/**
 * Takes the job out of `queued` for this worker run.
 *
 * Two guards, because the queue's status writer is a read-modify-write and this
 * module may not change it: the in-process set above stops overlapping calls in
 * one runtime, and re-reading the job after mark-running confirms that *our*
 * workerRunId is the one that stuck. A worker that loses that race abandons the
 * job instead of executing it, so a job is executed at most once per claim.
 */
async function claimServerJob(jobId: string, runId: string) {
  const current = await getEnterpriseServerJob(jobId);
  if (current.status !== "queued") {
    return { claimed: false as const, reason: "server_job_worker_job_not_queued", job: current };
  }
  await updateEnterpriseServerJobStatus({ jobId, action: "mark-running", workerRunId: runId });
  const claimed = await getEnterpriseServerJob(jobId);
  if (claimed.status !== "running" || claimed.lifecycle.workerRunId !== runId) {
    return { claimed: false as const, reason: "server_job_worker_claim_lost", job: claimed };
  }
  return { claimed: true as const, job: claimed };
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
    const claim = await claimServerJob(job.id, runId);
    if (!claim.claimed) return skipped(claim.job, claim.reason);

    const payload = (input.workerPayload ?? {}) as Record<string, unknown>;
    try {
      const result = await executeByKind(claim.job, payload);
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

async function reproducedWorkerPayload(job: SenaEnterpriseServerJob) {
  const context = await workerSessionContext(job).catch(() => null);
  if (!context) return undefined;
  const candidate = job.kind === "analysis"
    ? await reproduceAnalysisPayload(job, context)
    : job.kind === "import"
      ? reproduceImportPayload(job)
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
  const queued = await listEnterpriseServerJobs({
    status: "queued",
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
  const job = await getEnterpriseServerJob(input.jobId);
  if (stableServerJobPayloadSha256(input.workerPayload) !== job.payloadSha256) {
    return skipped(job, "server_job_worker_payload_sha256_mismatch");
  }
  return runEnterpriseServerJob({ job, workerPayload: input.workerPayload });
}

export function serverJobWorkerInlineExecutionEnabled() {
  const configured = process.env.SENA_JOB_WORKER_INLINE_EXECUTION?.trim().toLowerCase();
  if (configured === undefined || configured === "") return true;
  return !(configured === "0" || configured === "false" || configured === "no" || configured === "off");
}
