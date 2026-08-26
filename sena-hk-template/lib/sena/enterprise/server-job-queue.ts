import { createHash, createHmac, randomBytes } from "node:crypto";
import { SENA_LEGACY_SCHEMA_VERSIONS, SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  SENA_ANALYSIS_QUEUE_COMMAND_CUSTODY,
  SENA_ANALYSIS_QUEUE_LEGACY_COMMAND_CUSTODY,
  SENA_ANALYSIS_QUEUE_SYNTHETIC_HEARTBEAT_CUSTODY
} from "../analysis-queue-command";
import { requireEnterprisePermission, type SenaEnterpriseRole } from "./access-control";
import { recordEnterpriseUploadWarningCountsAsync } from "./import-analysis";
import { SenaEnterpriseError } from "./errors";
import { senaProductionPosture } from "./auth-config";
import {
  envValue,
  now,
  productionEvidenceTimestampConfigured,
  productionEvidenceTimestampEvidenceValue,
  sha256Text
} from "./ops-runtime";
import {
  createEnterprisePostgresServerJobAdapterFromEnv,
  resolveEnterprisePostgresConfig,
  type SenaEnterprisePostgresPool
} from "../enterprise-postgres";
import {
  getEnterprisePrimaryStateRuntime,
  mutateEnterpriseDbAtomically,
  readEnterpriseState,
  writeEnterpriseState
} from "./state";
import {
  webhookEndpointHash,
  webhookErrorHash,
  webhookTimeoutMs,
  webhookUrlFromEnv
} from "./webhook-delivery";
import {
  enterpriseServerJobIsSyntheticWorkerHeartbeat,
  enterpriseServerJobHasValidAnalysisCommandCustodyProfile,
  enterpriseServerJobRequiresAnalysisCustodyQuarantine,
  projectEnterpriseServerJobReadModel
} from "./server-job-contract";

export type SenaEnterpriseServerJobKind = "analysis" | "import" | "publication-export" | "reliability" | "validation";
export type SenaEnterpriseServerJobQueueMode = "managed" | "webhook" | "qstash" | "local" | "not-configured";
export type SenaEnterpriseServerJobSource = "project" | "snapshot" | "dataset" | "upload" | "mixed" | "unknown";
export type SenaEnterpriseServerJobStatus = "queued" | "running" | "succeeded" | "failed" | "dead-lettered";
export type SenaEnterpriseServerJobStatusAction = "mark-running" | "mark-succeeded" | "mark-failed" | "retry" | "dead-letter";

/**
 * Tenant boundary for a session-authenticated ops caller.
 *
 * The ops routes accept two very different callers: an external worker holding
 * a SENA_OPS_TOKEN bearer token, which legitimately reaches across every team,
 * and a signed-in human, who must never leave their own team. Passing the scope
 * down here — rather than filtering in the route — means the check runs at the
 * data-access boundary, so a future caller of these functions cannot forget it.
 * Omitting the scope is the machine-to-machine path and stays cross-team.
 */
export type SenaEnterpriseServerJobCallerScope = {
  teamId: string;
  memberships: Array<{ teamId: string; role: SenaEnterpriseRole; status: string }>;
};

/**
 * Server job lifecycle is a team-administration surface, so the scope check
 * mirrors the RBAC shape the native adapter certification route already uses
 * for session-mode ops reads.
 */
const serverJobScopePermission = "team:manage" as const;

/**
 * Resolves the team filter a scoped caller is allowed to use, and throws before
 * any read or write when they reach outside it. Returns the requested team for
 * unscoped (bearer) callers so their cross-team reach is unchanged.
 */
function scopedServerJobTeamId(
  callerScope: SenaEnterpriseServerJobCallerScope | undefined,
  requestedTeamId?: string
) {
  if (!callerScope) return requestedTeamId;
  const scopeTeamId = callerScope.teamId?.trim();
  if (!scopeTeamId) {
    throw new SenaEnterpriseError(
      "Team id is required for session-scoped SENA server job access.",
      400,
      "server_job_team_required"
    );
  }
  requireEnterprisePermission(callerScope, scopeTeamId, serverJobScopePermission);
  if (requestedTeamId && requestedTeamId !== scopeTeamId) {
    throw new SenaEnterpriseError("Your SENA role does not allow this action.", 403, "permission_denied");
  }
  return scopeTeamId;
}

/**
 * A scoped caller may only touch jobs their own team owns — declaring a team
 * they administer is not enough if the job belongs to someone else.
 */
function assertScopedServerJobAccess(
  callerScope: SenaEnterpriseServerJobCallerScope | undefined,
  scopeTeamId: string | undefined,
  job: { teamId: string }
) {
  if (!callerScope) return;
  if (job.teamId !== scopeTeamId) {
    throw new SenaEnterpriseError("Your SENA role does not allow this action.", 403, "permission_denied");
  }
}

export const senaEnterpriseServerJobKinds = [
  "analysis",
  "import",
  "publication-export",
  "reliability",
  "validation"
] as const satisfies readonly SenaEnterpriseServerJobKind[];

export type SenaEnterpriseServerJobQueueStatus = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobQueue;
  generatedAt: string;
  mode: SenaEnterpriseServerJobQueueMode;
  configured: boolean;
  productionReady: boolean;
  endpointHash?: string;
  secretConfigured: boolean;
  timeoutMs: number;
  inlinePayloadAllowed: boolean;
  localModeEnabled: boolean;
  evidence: string[];
};

export type SenaEnterpriseServerJobQueueContract = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueContract;
  generatedAt: string;
  status: "pass" | "review";
  summary: {
    jobKindCount: number;
    statusActionCount: number;
    acceptedProviderModeCount: number;
    durableJobStoreRequired: true;
    signedDispatchRequired: true;
    workerCallbackRequired: true;
    liveProbeRequiredBeforeProduction: true;
  };
  provider: {
    queueMode: SenaEnterpriseServerJobQueueMode;
    queueConfigured: boolean;
    queueProductionReady: boolean;
    queueEndpointHash?: string;
    queueSecretConfigured: boolean;
    queueProviderTokenRequired: boolean;
    queueEndpointValueExcluded: true;
    queueSecretValuesExcluded: true;
    queueProviderTokenValuesExcluded: true;
  };
  store: {
    requiredForProduction: true;
    acceptedStore: "postgres-table";
    table: "sena_enterprise_server_jobs";
    localStateFallback: "research-pilot-only";
    activeStore: "postgres-table" | "enterprise-state";
    postgresConfigured: boolean;
    postgresPrimaryActive: boolean;
    indexedBy: string[];
  };
  dispatch: {
    queuePayloadSchema: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhook;
    jobReceiptSchema: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJob;
    statusUpdateSchema: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobStatusUpdate;
    statusListSchema: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobList;
    probeSchema: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe;
    enqueueEvent: "server_job.queue";
    probeEvent: "server_job.queue.probe";
    signatureHeader: "x-sena-webhook-signature";
    signatureAlgorithm: "hmac-sha256";
    timestampHeader: "x-sena-webhook-timestamp";
    transportPayloadHashHeader: "x-sena-job-payload-sha256";
    workerPayloadHashHeader: "x-sena-worker-payload-sha256";
    hashSemantics: "exact-body-and-canonical-worker-payload-separated";
    statusCallback: "/api/sena/ops/jobs";
    acceptedJobKinds: SenaEnterpriseServerJobKind[];
    payloadPolicy: "project-or-upload-pointer-default";
    inlinePayloadAllowed: false;
    inlinePayloadPolicy: "disabled";
    legacyInlineEnvEffect: "none-deprecated";
    /** Legacy v1 key retained as a null tombstone; no environment value enables inline custody. */
    inlinePayloadRequiresExplicitEnv: null;
    rawPayloadPersistedInJobStore: false;
  };
  lifecycle: {
    maxAttempts: number;
    acceptedActions: SenaEnterpriseServerJobStatusAction[];
    retryAndDeadLetterPolicy: "local-max-attempts-with-operator-force-retry";
    retryDispatchPolicy: "local-polling-only";
    pushProviderRetryPolicy: "provider-native-or-resubmit";
    workerContractCommand: "npm run sena:jobs:worker-contract";
    liveProbeCommand: "npm run sena:jobs:queue-verify";
  };
  evidence: string[];
  redaction: {
    endpointValuesExcluded: true;
    secretValuesExcluded: true;
    providerTokenValuesExcluded: true;
    payloadValuesExcluded: true;
    responsePayloadValuesExcluded: true;
  };
};

export type SenaEnterpriseServerJobStoreRuntime = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobStoreRuntime;
  generatedAt: string;
  mode: "postgres-table" | "enterprise-state";
  activeStore: "postgres-table" | "enterprise-state";
  postgresConfigured: boolean;
  postgresPrimaryActive: boolean;
  postgresConnectionHash?: string;
  evidence: string[];
  missing: string[];
};

export type SenaEnterpriseServerJobWorkerHeartbeat = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerHeartbeat;
  generatedAt: string;
  status: "pass" | "review";
  proof: {
    scope: "same-process-status-store-cas-self-test";
    sameProcessStatusStoreCasOnly: true;
    managedQueueDispatchObserved: false;
    externalWorkerExecutionObserved: false;
    authenticatedExternalCallbackObserved: false;
    productionWorkerReadinessEligible: false;
  };
  provider: {
    queueMode: SenaEnterpriseServerJobQueueMode;
    queueConfigured: boolean;
    queueProductionReady: boolean;
    queueEndpointHash?: string;
    queueSecretConfigured: boolean;
    queueEndpointValueExcluded: true;
    queueSecretValuesExcluded: true;
  };
  statusStore: {
    activeStore: "postgres-table" | "enterprise-state";
    postgresConfigured: boolean;
    postgresPrimaryActive: boolean;
    indexed: boolean;
  };
  worker: {
    runtime: string;
    ownerConfigured: boolean;
    callbackConfigured: boolean;
    runbookConfigured: boolean;
    callbackUrlHash?: string;
    runbookUrlHash?: string;
    ownerValueExcluded: true;
    callbackUrlValueExcluded: true;
    runbookUrlValueExcluded: true;
  };
  heartbeat: {
    syntheticUserDataIncluded: false;
    jobIdHash?: string;
    workerRunIdHash?: string;
    jobKind: "analysis";
    payloadSha256?: string;
    statusCallback: "/api/sena/ops/jobs";
    statusTransitions: Array<"queued" | "running" | "succeeded">;
    finalStatus?: SenaEnterpriseServerJobStatus;
    attempts?: number;
    writeReadConfirmed: boolean;
    errorCode?: string;
    errorHash?: string;
    callbackActions: ["mark-running", "mark-succeeded"];
  };
  evidence: string[];
  missing: string[];
  redaction: {
    jobIdValueExcluded: true;
    workerRunIdValueExcluded: true;
    payloadValuesExcluded: true;
    ownerValueExcluded: true;
    endpointValuesExcluded: true;
    secretValuesExcluded: true;
  };
};

export type SenaEnterpriseServerJobPayloadSummary = {
  source: SenaEnterpriseServerJobSource;
  projectVersion?: number;
  expectedVersion?: number;
  projectTeamId?: string;
  snapshotFingerprint?: string;
  format?: string;
  fileCount?: number;
  uploadIds?: string[];
  reviewerEnvelopeUploadId?: string;
  reviewerEnvelopeSha256?: string;
  commandCustody?: "encrypted-upload-v1" | "legacy-inline-v2" | "synthetic-heartbeat-v1";
  commandEnvelopeUploadId?: string;
  commandEnvelopeSha256?: string;
  annotationCount?: number;
  comparisonCount?: number;
  validationMethod?: "group-comparison";
  includeRuntimeBundle?: boolean;
  persist?: boolean;
  updateProject?: boolean;
  activeTemporalWindowId?: string;
  hasInlineSnapshot: boolean;
  hasInlineDataset: boolean;
  payloadValuesExcluded: true;
};

export type SenaEnterpriseServerJob = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJob |
    typeof SENA_LEGACY_SCHEMA_VERSIONS.enterpriseServerJob;
  id: string;
  kind: SenaEnterpriseServerJobKind;
  status: SenaEnterpriseServerJobStatus;
  queuedAt: string;
  updatedAt: string;
  teamId: string;
  projectId?: string;
  actorUserId: string;
  payloadSha256: string;
  payloadSummary: SenaEnterpriseServerJobPayloadSummary;
  provider: SenaEnterpriseServerJobQueueStatus;
  delivery: SenaEnterpriseServerJobQueueDelivery;
  worker: {
    expectedAction: "run-analysis" | "run-import" | "run-publication-export" | "run-reliability" | "run-validation";
    payloadDelivery: "project-pointer" | "upload-pointer" | "inline-payload-enabled";
    execution: "external-worker-required" | "local-receipt-only";
    statusCallback: "/api/sena/ops/jobs";
  };
  lifecycle: {
    attempts: number;
    maxAttempts: number;
    retryable: boolean;
    lastTransition: SenaEnterpriseServerJobStatusAction | "enqueue";
    startedAt?: string;
    finishedAt?: string;
    retryRequestedAt?: string;
    deadLetteredAt?: string;
    workerRunId?: string;
    lastErrorCode?: string;
    lastErrorHash?: string;
    statusReason?: string;
  };
  redaction: {
    payloadValuesExcluded: true;
    secretValuesExcluded: true;
    endpointValueExcluded: true;
  };
};

export type SenaEnterpriseServerJobQueueDelivery = {
  attempted: boolean;
  webhookStatus: "pending" | "delivered" | "failed" | "local-sink";
  /**
   * Durable claimability fence. A queued record is visible for recovery while
   * its upload/source artifacts are being written, but no worker may claim it
   * until this flag has been persisted as true.
   */
  sourceReady: boolean;
  attemptedAt?: string;
  endpointHash?: string;
  httpStatus?: number;
  errorCode?: string;
  errorHash?: string;
  failureStage?: "source-persistence" | "queue-dispatch";
};

export type SenaEnterpriseServerJobQueueWebhook = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhook;
  generatedAt: string;
  job: Omit<SenaEnterpriseServerJob, "delivery">;
  workerPayload: unknown;
  delivery: {
    provider: SenaEnterpriseServerJobQueueMode;
    endpointHash?: string;
    secretConfigured: boolean;
    workerPayloadSha256: string;
  };
  redaction: {
    responsePayloadValuesExcluded: true;
    auditPayloadValuesExcluded: true;
    secretValuesExcluded: true;
  };
};

export type SenaEnterpriseServerJobQueueProbe = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe;
  generatedAt: string;
  status: "pass" | "review";
  provider: {
    queueMode: SenaEnterpriseServerJobQueueMode;
    queueConfigured: boolean;
    queueProductionReady: boolean;
    queueEndpointHash?: string;
    queueSecretConfigured: boolean;
    queueTimeoutMs: number;
    queueEndpointValueExcluded: true;
    queueSecretValuesExcluded: true;
  };
  probe: {
    probeIdHash: string;
    queuePayloadSchema: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhook;
    probePayloadSchema: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe;
    dispatchEvent: "server_job.queue.probe";
    payloadSha256?: string;
    deliveryStatus: "delivered" | "failed" | "not-configured";
    attempted: boolean;
    attemptedAt?: string;
    httpStatus?: number;
    errorCode?: string;
    errorHash?: string;
  };
  evidence: string[];
  redaction: {
    endpointValueExcluded: true;
    secretValuesExcluded: true;
    probeIdValueExcluded: true;
    payloadValuesExcluded: true;
    responsePayloadValuesExcluded: true;
  };
  contract: SenaEnterpriseServerJobQueueContract;
};

export type SenaEnterpriseServerJobQueueContractReadiness = {
  required: boolean;
  confirmed: boolean;
  artifactHash?: string;
  verifiedAt?: string;
  artifactHashConfigured: boolean;
  verifiedAtConfigured: boolean;
  evidence: string[];
};

export type SenaEnterpriseServerJobQueueProbeReadiness = {
  required: boolean;
  confirmed: boolean;
  artifactHash?: string;
  verifiedAt?: string;
  artifactHashConfigured: boolean;
  verifiedAtConfigured: boolean;
  evidence: string[];
};

export type SenaEnterpriseServerJobList = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobList;
  generatedAt: string;
  summary: {
    total: number;
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    deadLettered: number;
    retryable: number;
  };
  jobs: SenaEnterpriseServerJob[];
};

export type SenaEnterpriseServerJobStatusUpdate = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobStatusUpdate;
  generatedAt: string;
  action: SenaEnterpriseServerJobStatusAction;
  job: SenaEnterpriseServerJob;
  // Additive optional field: worker-reported parse-repair warning counts that
  // were applied to the upload registry (H10 "until a parser reports").
  uploadWarnings?: Array<{ uploadId: string; warningCount: number }>;
  redaction: {
    payloadValuesExcluded: true;
    secretValuesExcluded: true;
  };
};

function booleanEnv(key: string) {
  const value = envValue(key)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function positiveIntegerEnv(key: string, fallback: number, max: number) {
  const parsed = Number(envValue(key));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.trunc(parsed));
}

function validSha256(value: string | undefined) {
  return Boolean(value && /^[a-f0-9]{64}$/i.test(value));
}

function hashedHttpUrlEnv(key: string) {
  const value = envValue(key);
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return sha256Text(parsed.toString());
  } catch {
    return undefined;
  }
}

function serverJobWorkerRuntime() {
  return envValue("SENA_JOB_WORKER_RUNTIME") ?? "not-configured";
}

function serverJobWorkerOwnerConfigured() {
  return Boolean(envValue("SENA_JOB_WORKER_OWNER") ?? envValue("SENA_ALERTING_OWNER"));
}

// Production posture is answered by senaProductionPosture() (auth-config.ts),
// never re-derived here: re-derivation is what let the password-reset interlock
// drift onto a NODE_ENV-only test and fail open (f5d94fa). The site-local
// opt-in flag is the only term this gate adds on top.
export function serverJobQueueLiveProbeRequired() {
  return booleanEnv("SENA_JOB_QUEUE_LIVE_PROBE_REQUIRED") || senaProductionPosture();
}

function normalizedQueueMode(): SenaEnterpriseServerJobQueueMode {
  const mode = envValue("SENA_JOB_QUEUE_ADAPTER")?.toLowerCase().replace(/_/g, "-");
  if (mode === "managed" || mode === "webhook" || mode === "qstash" || mode === "local") return mode;
  if (serverJobQueueProviderToken()) return "qstash";
  return "not-configured";
}

let enterprisePostgresServerJobStore: {
  adapter: ReturnType<typeof createEnterprisePostgresServerJobAdapterFromEnv>["adapter"];
  pool: SenaEnterprisePostgresPool;
} | null = null;

function canonicalize(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry) ?? null);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return String(value);
}

export function stableServerJobPayloadSha256(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

function serverJobQueueSecret() {
  return envValue("SENA_JOB_QUEUE_SECRET");
}

function serverJobQueueUrl() {
  return webhookUrlFromEnv("SENA_JOB_QUEUE_URL", "invalid_server_job_queue_url");
}

function firstEnvValue(keys: string[]) {
  for (const key of keys) {
    const value = envValue(key);
    if (value) return { key, value };
  }
  return undefined;
}

function httpUrlFromEnv(keys: string[], invalidUrlErrorCode: string) {
  const resolved = firstEnvValue(keys);
  if (!resolved) return undefined;
  try {
    const parsed = new URL(resolved.value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new SenaEnterpriseError(`${resolved.key} must be an HTTP(S) URL.`, 500, invalidUrlErrorCode);
    }
    return parsed.toString();
  } catch (error) {
    if (error instanceof SenaEnterpriseError) throw error;
    throw new SenaEnterpriseError(`${resolved.key} must be an HTTP(S) URL.`, 500, invalidUrlErrorCode);
  }
}

function qstashApiBaseUrl() {
  const value = firstEnvValue([
    "SENA_JOB_QUEUE_PROVIDER_URL",
    "QSTASH_URL",
    "UPSTASH_QSTASH_URL"
  ])?.value ?? "https://qstash.upstash.io";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new SenaEnterpriseError("SENA_JOB_QUEUE_PROVIDER_URL must be an HTTP(S) URL.", 500, "invalid_server_job_queue_provider_url");
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch (error) {
    if (error instanceof SenaEnterpriseError) throw error;
    throw new SenaEnterpriseError("SENA_JOB_QUEUE_PROVIDER_URL must be an HTTP(S) URL.", 500, "invalid_server_job_queue_provider_url");
  }
}

function serverJobQueueProviderToken() {
  return firstEnvValue([
    "SENA_JOB_QUEUE_PROVIDER_TOKEN",
    "QSTASH_TOKEN",
    "UPSTASH_QSTASH_TOKEN"
  ])?.value;
}

function qstashDestinationUrl() {
  return httpUrlFromEnv([
    "SENA_JOB_WORKER_CALLBACK_URL",
    "SENA_JOB_QUEUE_URL"
  ], "invalid_server_job_queue_url");
}

function qstashPublishUrl(destinationUrl: string) {
  const queueName = firstEnvValue([
    "SENA_JOB_QUEUE_NAME",
    "QSTASH_QUEUE_NAME",
    "UPSTASH_QSTASH_QUEUE_NAME"
  ])?.value;
  const encodedDestination = encodeURIComponent(destinationUrl);
  if (queueName) {
    return `${qstashApiBaseUrl()}/v2/enqueue/${encodeURIComponent(queueName)}/${encodedDestination}`;
  }
  return `${qstashApiBaseUrl()}/v2/publish/${encodedDestination}`;
}

function serverJobDispatchUrl(mode: SenaEnterpriseServerJobQueueMode) {
  if (mode === "qstash") {
    const destination = qstashDestinationUrl();
    return destination ? qstashPublishUrl(destination) : undefined;
  }
  if (mode === "managed" || mode === "webhook") return serverJobQueueUrl();
  return undefined;
}

function serverJobWebhookSignature(secret: string, attemptedAt: string, body: string) {
  return createHmac("sha256", secret).update(`${attemptedAt}.${body}`).digest("hex");
}

/**
 * Replay window for the signed queue webhook.
 *
 * The signature covers `${attemptedAt}.${body}`, so the timestamp is
 * authenticated — but that also means a captured request stays signature-valid
 * forever. This window is the only thing that bounds how long a replay of it
 * works, which is why the receiver must check it rather than merely require the
 * header. Five minutes sits an order of magnitude above the dispatch timeout
 * (SENA_JOB_QUEUE_TIMEOUT_MS, default 5s, ceiling 30s) and comfortably covers a
 * managed provider's redelivery plus ordinary NTP drift, while keeping a
 * captured request useful for minutes rather than indefinitely.
 */
export const serverJobWebhookTimestampDefaultSkewSeconds = 300;

/**
 * Ceiling on the tunable. Without it an operator could set the window to a year
 * and quietly restore the unbounded-replay behaviour this control exists to
 * remove; positiveIntegerEnv clamps rather than throws, matching
 * SENA_JOB_QUEUE_MAX_ATTEMPTS.
 */
export const serverJobWebhookTimestampMaxSkewSeconds = 3600;

export function serverJobWebhookTimestampSkewSeconds() {
  return positiveIntegerEnv(
    "SENA_JOB_QUEUE_TIMESTAMP_SKEW_SECONDS",
    serverJobWebhookTimestampDefaultSkewSeconds,
    serverJobWebhookTimestampMaxSkewSeconds
  );
}

// serverJobQueueRequestHeaders sends `now()` — i.e. Date#toISOString — as the
// timestamp header, so the accepted shape is a full ISO-8601 instant with a zone
// designator. Date.parse alone is too permissive: it would accept "2026-08-15"
// or a bare year and, for "0"/"NaN", hand back NaN, whose comparisons are all
// false and would silently pass a naive freshness check.
const serverJobWebhookTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseServerJobWebhookTimestamp(value: string) {
  const candidate = value.trim();
  if (!serverJobWebhookTimestampPattern.test(candidate)) return undefined;
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export type SenaEnterpriseServerJobWebhookTimestampFreshness = "fresh" | "outside-window" | "invalid";

/**
 * Both directions are bounded: a sender whose clock runs slightly fast must
 * still be accepted, but a wildly future-dated timestamp is refused so nobody
 * can mint a request that stays valid for as long as they like.
 */
export function serverJobWebhookTimestampFreshness(
  value: string,
  nowMs: number = Date.now()
): SenaEnterpriseServerJobWebhookTimestampFreshness {
  const parsed = parseServerJobWebhookTimestamp(value);
  if (parsed === undefined) return "invalid";
  return Math.abs(nowMs - parsed) <= serverJobWebhookTimestampSkewSeconds() * 1000
    ? "fresh"
    : "outside-window";
}

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function serverJobMaxAttempts() {
  return positiveIntegerEnv("SENA_JOB_QUEUE_MAX_ATTEMPTS", 3, 25);
}

export function serverJobQueueStatus(): SenaEnterpriseServerJobQueueStatus {
  const mode = normalizedQueueMode();
  const storeRuntime = serverJobStoreRuntime();
  const localModeEnabled = booleanEnv("SENA_JOB_QUEUE_ALLOW_LOCAL");
  const legacyInlinePayloadFlagConfigured = booleanEnv("SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD");
  // The v1 status field remains for compatibility, but current queue custody
  // is pointer-only. The legacy flag is observable as configuration evidence
  // and never re-enables raw inline sources.
  const inlinePayloadAllowed = false;
  const timeoutMs = webhookTimeoutMs("SENA_JOB_QUEUE_TIMEOUT_MS", 5000, 30_000);
  const maxAttempts = serverJobMaxAttempts();
  const url = serverJobDispatchUrl(mode);
  const endpointHash = mode === "local"
    ? createHash("sha256").update("sena-local-server-job-queue").digest("hex")
    : webhookEndpointHash(url);
  const secretConfigured = Boolean(envValue("SENA_JOB_QUEUE_SECRET"));
  const providerTokenConfigured = mode === "qstash" ? Boolean(serverJobQueueProviderToken()) : true;
  const productionReady = (
    (mode === "managed" || mode === "webhook" || mode === "qstash") &&
    Boolean(endpointHash) &&
    secretConfigured &&
    providerTokenConfigured
  );
  const configured = productionReady || (mode === "local" && localModeEnabled);

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueue,
    generatedAt: now(),
    mode,
    configured,
    productionReady,
    endpointHash,
    secretConfigured,
    timeoutMs,
    inlinePayloadAllowed,
    localModeEnabled,
    evidence: [
      `queueAdapter=${mode}`,
      `queueConfigured=${configured}`,
      `queueProductionReady=${productionReady}`,
      `queueEndpointHash=${endpointHash ? "present" : "missing"}`,
      `queueEndpointValue=excluded`,
      `queueSecret=${secretConfigured ? "configured" : "missing"}`,
      `queueProviderToken=${mode === "qstash" ? providerTokenConfigured ? "configured" : "missing" : "not-required"}`,
      `qstashDestination=${mode === "qstash" ? qstashDestinationUrl() ? "configured" : "missing" : "not-applicable"}`,
      `qstashApiBase=${mode === "qstash" ? "configured" : "not-applicable"}`,
      `queueTimeoutMs=${timeoutMs}`,
      `queueMaxAttempts=${maxAttempts}`,
      `inlinePayloadAllowed=${inlinePayloadAllowed}`,
      `legacyInlinePayloadFlagConfigured=${legacyInlinePayloadFlagConfigured}`,
      "inlinePayloadCustodyPolicy=durable-pointers-only",
      `localModeEnabled=${localModeEnabled}`,
      ...storeRuntime.evidence,
      "statusApi=/api/sena/ops/jobs",
      "deadLetterPolicy=max-attempts"
    ]
  };
}

export function buildEnterpriseServerJobQueueContract(): SenaEnterpriseServerJobQueueContract {
  const queue = serverJobQueueStatus();
  const store = serverJobStoreRuntime();
  const acceptedProviderModes: SenaEnterpriseServerJobQueueMode[] = ["managed", "webhook", "qstash"];
  const acceptedActions: SenaEnterpriseServerJobStatusAction[] = [
    "mark-running",
    "mark-succeeded",
    "mark-failed",
    "retry",
    "dead-letter"
  ];
  const status = senaEnterpriseServerJobKinds.length === 5 && acceptedActions.length === 5 ? "pass" : "review";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueContract,
    generatedAt: now(),
    status,
    summary: {
      jobKindCount: senaEnterpriseServerJobKinds.length,
      statusActionCount: acceptedActions.length,
      acceptedProviderModeCount: acceptedProviderModes.length,
      durableJobStoreRequired: true,
      signedDispatchRequired: true,
      workerCallbackRequired: true,
      liveProbeRequiredBeforeProduction: true
    },
    provider: {
      queueMode: queue.mode,
      queueConfigured: queue.configured,
      queueProductionReady: queue.productionReady,
      queueEndpointHash: queue.endpointHash,
      queueSecretConfigured: queue.secretConfigured,
      queueProviderTokenRequired: queue.mode === "qstash",
      queueEndpointValueExcluded: true,
      queueSecretValuesExcluded: true,
      queueProviderTokenValuesExcluded: true
    },
    store: {
      requiredForProduction: true,
      acceptedStore: "postgres-table",
      table: "sena_enterprise_server_jobs",
      localStateFallback: "research-pilot-only",
      activeStore: store.activeStore,
      postgresConfigured: store.postgresConfigured,
      postgresPrimaryActive: store.postgresPrimaryActive,
      indexedBy: [
        "status",
        "updated_at",
        "team_id",
        "project_id",
        "kind",
        "queued_at"
      ]
    },
    dispatch: {
      queuePayloadSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhook,
      jobReceiptSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJob,
      statusUpdateSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobStatusUpdate,
      statusListSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobList,
      probeSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe,
      enqueueEvent: "server_job.queue",
      probeEvent: "server_job.queue.probe",
      signatureHeader: "x-sena-webhook-signature",
      signatureAlgorithm: "hmac-sha256",
      timestampHeader: "x-sena-webhook-timestamp",
      transportPayloadHashHeader: "x-sena-job-payload-sha256",
      workerPayloadHashHeader: "x-sena-worker-payload-sha256",
      hashSemantics: "exact-body-and-canonical-worker-payload-separated",
      statusCallback: "/api/sena/ops/jobs",
      acceptedJobKinds: [...senaEnterpriseServerJobKinds],
      payloadPolicy: "project-or-upload-pointer-default",
      inlinePayloadAllowed: false,
      inlinePayloadPolicy: "disabled",
      legacyInlineEnvEffect: "none-deprecated",
      inlinePayloadRequiresExplicitEnv: null,
      rawPayloadPersistedInJobStore: false
    },
    lifecycle: {
      maxAttempts: serverJobMaxAttempts(),
      acceptedActions,
      retryAndDeadLetterPolicy: "local-max-attempts-with-operator-force-retry",
      retryDispatchPolicy: "local-polling-only",
      pushProviderRetryPolicy: "provider-native-or-resubmit",
      workerContractCommand: "npm run sena:jobs:worker-contract",
      liveProbeCommand: "npm run sena:jobs:queue-verify"
    },
    evidence: [
      "serverJobQueueContractSource=server-job-queue",
      `serverJobQueueContractStatus=${status}`,
      `serverJobQueueContractProviderModes=${acceptedProviderModes.join("|")}`,
      `serverJobQueueContractJobKinds=${senaEnterpriseServerJobKinds.join("|")}`,
      `serverJobQueueContractActions=${acceptedActions.join("|")}`,
      "serverJobQueueContractStore=postgres-table",
      "serverJobQueueContractLocalStateFallback=research-pilot-only",
      `serverJobQueueContractActiveStore=${store.activeStore}`,
      `serverJobQueueContractPostgresPrimaryActive=${store.postgresPrimaryActive}`,
      "serverJobQueueContractSignature=hmac-sha256",
      "serverJobQueueContractTransportPayloadHash=x-sena-job-payload-sha256",
      "serverJobQueueContractWorkerPayloadHash=x-sena-worker-payload-sha256",
      "serverJobQueueContractHashSemantics=exact-body-and-canonical-worker-payload-separated",
      "serverJobQueueContractInlinePayloadAllowed=false",
      "serverJobQueueContractInlinePayloadPolicy=disabled",
      "serverJobQueueContractLegacyInlineEnvEffect=none-deprecated",
      "serverJobQueueContractRetryDispatchPolicy=local-polling-only",
      "serverJobQueueContractPushProviderRetryPolicy=provider-native-or-resubmit",
      "serverJobQueueContractStatusCallback=/api/sena/ops/jobs",
      "serverJobQueueContractPayloadPolicy=project-or-upload-pointer-default",
      "serverJobQueueContractLegacyInlinePayloadFlag=deprecated-and-ignored",
      "serverJobQueueContractInlinePayloadCustody=durable-pointers-only",
      "serverJobQueueContractRawPayloadPersisted=false",
      "serverJobQueueContractRetryPolicy=local-max-attempts-with-operator-force-retry",
      "serverJobQueueContractWorkerContractRequired=true",
      "serverJobQueueContractLiveProbeRequired=true",
      "queueEndpointValue=excluded",
      "queueSecretValues=excluded",
      "queueProviderTokenValues=excluded",
      "payloadValues=excluded",
      "responsePayloadValues=excluded"
    ],
    redaction: {
      endpointValuesExcluded: true,
      secretValuesExcluded: true,
      providerTokenValuesExcluded: true,
      payloadValuesExcluded: true,
      responsePayloadValuesExcluded: true
    }
  };
}

export function serverJobQueueContractReadiness(): SenaEnterpriseServerJobQueueContractReadiness {
  const artifactHash = envValue("SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256");
  const verifiedAt = envValue("SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT");
  const artifactHashConfigured = validSha256(artifactHash);
  const verifiedAtConfigured = productionEvidenceTimestampConfigured(verifiedAt);
  const artifactValidationPassed = envValue("SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION") === "pass";
  const required = serverJobQueueLiveProbeRequired() ||
    booleanEnv("SENA_JOB_QUEUE_CONTRACT_REQUIRED");
  const confirmed = booleanEnv("SENA_JOB_QUEUE_CONTRACT_CONFIRMED") &&
    artifactHashConfigured &&
    verifiedAtConfigured &&
    artifactValidationPassed;
  return {
    required,
    confirmed,
    artifactHash: artifactHashConfigured ? artifactHash?.toLowerCase() : artifactHash,
    verifiedAt,
    artifactHashConfigured,
    verifiedAtConfigured,
    evidence: [
      `serverJobQueueContractRequired=${required}`,
      `serverJobQueueContractConfirmed=${confirmed}`,
      `serverJobQueueContractExplicitlyRequired=${booleanEnv("SENA_JOB_QUEUE_CONTRACT_REQUIRED")}`,
      `serverJobQueueContractProductionRuntime=${process.env.NODE_ENV === "production"}`,
      `serverJobQueueContractProductionPerformancePathRequired=${booleanEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH")}`,
      `serverJobQueueContractProductionEvidenceManifestRequired=${booleanEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED")}`,
      `serverJobQueueContractSaasOperatingModelApproved=${booleanEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED")}`,
      `serverJobQueueContractArtifactSha256=${artifactHashConfigured ? "present" : "missing-or-invalid"}`,
      `serverJobQueueContractVerifiedAt=${productionEvidenceTimestampEvidenceValue(verifiedAt)}`,
      `serverJobQueueContractArtifactValidation=${artifactValidationPassed ? "pass" : "missing-or-invalid"}`,
      `serverJobQueueContractSchema=${SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueContract}`,
      "serverJobQueueContractScript=npm run sena:jobs:queue-contract",
      "serverJobQueueContractSource=server-job-queue"
    ]
  };
}

export function serverJobQueueProbeReadiness(): SenaEnterpriseServerJobQueueProbeReadiness {
  const artifactHash = envValue("SENA_JOB_QUEUE_PROBE_ARTIFACT_SHA256");
  const verifiedAt = envValue("SENA_JOB_QUEUE_PROBE_VERIFIED_AT");
  const artifactHashConfigured = validSha256(artifactHash);
  const verifiedAtConfigured = productionEvidenceTimestampConfigured(verifiedAt);
  const artifactValidationPassed = envValue("SENA_JOB_QUEUE_PROBE_ARTIFACT_VALIDATION") === "pass";
  const required = serverJobQueueLiveProbeRequired();
  const confirmed = booleanEnv("SENA_JOB_QUEUE_LIVE_PROBE_CONFIRMED") &&
    artifactHashConfigured &&
    verifiedAtConfigured &&
    artifactValidationPassed;
  return {
    required,
    confirmed,
    artifactHash: artifactHashConfigured ? artifactHash?.toLowerCase() : artifactHash,
    verifiedAt,
    artifactHashConfigured,
    verifiedAtConfigured,
    evidence: [
      `serverJobQueueLiveProbeRequired=${required}`,
      `serverJobQueueLiveProbeConfirmed=${confirmed}`,
      `serverJobQueueProbeExplicitlyRequired=${booleanEnv("SENA_JOB_QUEUE_LIVE_PROBE_REQUIRED")}`,
      `serverJobQueueProductionRuntime=${process.env.NODE_ENV === "production"}`,
      `serverJobQueueProductionPerformancePathRequired=${booleanEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH")}`,
      `serverJobQueueProductionEvidenceManifestRequired=${booleanEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED")}`,
      `serverJobQueueSaasOperatingModelApproved=${booleanEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED")}`,
      `serverJobQueueProbeArtifactSha256=${artifactHashConfigured ? "present" : "missing-or-invalid"}`,
      `serverJobQueueProbeVerifiedAt=${productionEvidenceTimestampEvidenceValue(verifiedAt)}`,
      `serverJobQueueProbeArtifactValidation=${artifactValidationPassed ? "pass" : "missing-or-invalid"}`,
      "serverJobQueueProbeApi=/api/sena/ops/jobs/probe",
      "serverJobQueueProbeScript=npm run sena:jobs:queue-verify"
    ]
  };
}

export function serverJobStoreRuntime(): SenaEnterpriseServerJobStoreRuntime {
  const primaryStateRuntime = getEnterprisePrimaryStateRuntime();
  const postgresConfig = resolveEnterprisePostgresConfig();
  const postgresPrimaryActive = primaryStateRuntime.activePrimary === "postgres";
  const activeStore = postgresPrimaryActive ? "postgres-table" : "enterprise-state";
  const missing = postgresPrimaryActive
    ? []
    : [
      primaryStateRuntime.postgresPrimaryRequested ? null : "SENA_ENTERPRISE_STATE_STORE=postgres",
      ...postgresConfig.missingEnv
    ].filter((value): value is string => Boolean(value));
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobStoreRuntime,
    generatedAt: now(),
    mode: activeStore,
    activeStore,
    postgresConfigured: postgresConfig.configured,
    postgresPrimaryActive,
    postgresConnectionHash: postgresConfig.connectionHash,
    evidence: [
      `serverJobStore=${activeStore}`,
      `serverJobStoreSchema=${activeStore === "postgres-table" ? "sena_enterprise_server_jobs" : "enterprise-db.serverJobs"}`,
      `serverJobStoreIndexed=${activeStore === "postgres-table"}`,
      `postgresConfigured=${postgresConfig.configured}`,
      `postgresPrimaryActive=${postgresPrimaryActive}`,
      `postgresConnectionHash=${postgresConfig.connectionHash ? "present" : "missing"}`
    ],
    missing
  };
}

export function heavyServerJobsRequireQueue() {
  return booleanEnv("SENA_REQUIRE_ASYNC_HEAVY_JOBS") ||
    booleanEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH") ||
    booleanEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED") ||
    booleanEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED");
}

export function shouldQueueServerJob(request: Request, body: { queue?: unknown }) {
  const prefer = request.headers.get("prefer")?.toLowerCase() ?? "";
  return heavyServerJobsRequireQueue() ||
    body.queue === true ||
    prefer.split(",").some((part) => part.trim() === "respond-async");
}

export function assertServerJobQueueReady(queue = serverJobQueueStatus()) {
  if (!queue.configured) {
    throw new SenaEnterpriseError(
      "SENA server job queue is not configured for asynchronous analysis, import, publication export, reliability, or validation jobs.",
      503,
      "server_job_queue_not_configured"
    );
  }
  if (heavyServerJobsRequireQueue() && !queue.productionReady) {
    throw new SenaEnterpriseError(
      "SENA production heavy-job queue must use a managed or webhook provider; local queue receipts are research-pilot only.",
      503,
      "server_job_queue_production_provider_required"
    );
  }
}

export function assertServerJobPayloadAllowed(input: {
  projectId?: string;
  hasInlinePayload: boolean;
  hasUploadPointers?: boolean;
  queue?: SenaEnterpriseServerJobQueueStatus;
}) {
  if (input.hasInlinePayload) {
    throw new SenaEnterpriseError(
      "Queued inline SENA sources require durable upload custody; submit a projectId or registered upload pointer.",
      400,
      "server_job_inline_source_custody_required"
    );
  }
  if (input.projectId || input.hasUploadPointers) return;
  throw new SenaEnterpriseError(
    "Provide projectId or registered upload pointers before queueing a SENA server job.",
    400,
    "server_job_source_required"
  );
}

function serverJobPayloadHasInlineSource(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  return [
    "inlineSnapshot",
    "inlineDataset",
    "inlineAnnotations",
    "files",
    "annotations",
    "rows",
    "data"
  ].some((key) => Object.hasOwn(record, key) && record[key] !== undefined);
}

function normalizedAnalysisPayloadSummary(input: {
  payload: unknown;
  payloadSummary: SenaEnterpriseServerJobPayloadSummary;
}): SenaEnterpriseServerJobPayloadSummary {
  const payload = input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
    ? input.payload as Record<string, unknown>
    : undefined;
  const payloadCustody = payload?.commandCustody;
  const summaryCustody = input.payloadSummary.commandCustody;
  const uploadId = input.payloadSummary.commandEnvelopeUploadId;
  const envelopeSha256 = input.payloadSummary.commandEnvelopeSha256;
  const currentCustody = payloadCustody === SENA_ANALYSIS_QUEUE_COMMAND_CUSTODY &&
    summaryCustody === SENA_ANALYSIS_QUEUE_COMMAND_CUSTODY &&
    typeof uploadId === "string" && /^upload_[a-f0-9]{24}$/.test(uploadId) &&
    typeof envelopeSha256 === "string" && /^[a-f0-9]{64}$/.test(envelopeSha256);
  if (currentCustody) return input.payloadSummary;

  const legacyCustody = payloadCustody === undefined &&
    (summaryCustody === undefined || summaryCustody === SENA_ANALYSIS_QUEUE_LEGACY_COMMAND_CUSTODY) &&
    uploadId === undefined && envelopeSha256 === undefined;
  if (legacyCustody) {
    // New envelope-free compatibility fixtures/receipts are marked explicitly
    // at their trusted enqueue boundary. An unmarked persisted row is therefore
    // not later indistinguishable from a current receipt whose custody pointers
    // were stripped after enqueue.
    return {
      ...input.payloadSummary,
      commandCustody: SENA_ANALYSIS_QUEUE_LEGACY_COMMAND_CUSTODY
    };
  }

  throw new SenaEnterpriseError(
    "Queued SENA analysis command custody is incomplete or inconsistent.",
    400,
    "server_job_analysis_command_custody_invalid"
  );
}

function externalAnalysisCommandCustodyError() {
  return new SenaEnterpriseError(
    "The queued SENA analysis command does not match its durable encrypted custody envelope.",
    409,
    "server_job_worker_analysis_command_custody_invalid"
  );
}

function serverJobWithoutDelivery(input: {
  kind: SenaEnterpriseServerJobKind;
  teamId: string;
  projectId?: string;
  actorUserId: string;
  payload: unknown;
  payloadSummary: SenaEnterpriseServerJobPayloadSummary;
  queue?: SenaEnterpriseServerJobQueueStatus;
}): Omit<SenaEnterpriseServerJob, "delivery"> {
  const queue = input.queue ?? serverJobQueueStatus();
  const payloadSummary = input.kind === "analysis"
    ? normalizedAnalysisPayloadSummary(input)
    : input.payloadSummary;
  assertServerJobQueueReady(queue);
  assertServerJobPayloadAllowed({
    projectId: input.projectId,
    hasInlinePayload: payloadSummary.hasInlineSnapshot ||
      payloadSummary.hasInlineDataset ||
      serverJobPayloadHasInlineSource(input.payload),
    hasUploadPointers: Boolean(payloadSummary.uploadIds?.length),
    queue
  });

  if (queue.mode === "local" && input.kind === "reliability") {
    const uploadIds = payloadSummary.uploadIds ?? [];
    const reproduciblePayload = {
      action: "run-reliability",
      teamId: input.teamId,
      projectId: input.projectId,
      projectVersion: payloadSummary.projectVersion,
      snapshotFingerprint: payloadSummary.snapshotFingerprint,
      uploadIds,
      reviewerEnvelopeUploadId: payloadSummary.reviewerEnvelopeUploadId,
      reviewerEnvelopeSha256: payloadSummary.reviewerEnvelopeSha256
    };
    if (uploadIds.length === 0 ||
      stableServerJobPayloadSha256(input.payload) !== stableServerJobPayloadSha256(reproduciblePayload)) {
      throw new SenaEnterpriseError(
        "Local reliability jobs must use a canonical stored upload-pointer payload that the polling worker can reproduce.",
        400,
        "server_job_local_payload_not_reproducible"
      );
    }
  }

  const queuedAt = now();
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJob,
    id: id("server_job"),
    kind: input.kind,
    status: "queued",
    queuedAt,
    updatedAt: queuedAt,
    teamId: input.teamId,
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    payloadSha256: stableServerJobPayloadSha256(input.payload),
    payloadSummary,
    provider: queue,
    worker: {
      expectedAction: serverJobWorkerAction(input.kind),
      payloadDelivery: payloadSummary.uploadIds?.length
          ? "upload-pointer"
          : input.projectId
            ? "project-pointer"
            : "inline-payload-enabled",
      execution: queue.mode === "local" ? "local-receipt-only" : "external-worker-required",
      statusCallback: "/api/sena/ops/jobs"
    },
    lifecycle: {
      attempts: 0,
      maxAttempts: serverJobMaxAttempts(),
      retryable: false,
      lastTransition: "enqueue"
    },
    redaction: {
      payloadValuesExcluded: true,
      secretValuesExcluded: true,
      endpointValueExcluded: true
    }
  };
}

function serverJobWorkerAction(kind: SenaEnterpriseServerJobKind): SenaEnterpriseServerJob["worker"]["expectedAction"] {
  if (kind === "analysis") return "run-analysis";
  if (kind === "import") return "run-import";
  if (kind === "publication-export") return "run-publication-export";
  if (kind === "reliability") return "run-reliability";
  return "run-validation";
}

function serverJobQueueWebhookPayload(input: {
  job: Omit<SenaEnterpriseServerJob, "delivery">;
  workerPayload: unknown;
  generatedAt: string;
}): SenaEnterpriseServerJobQueueWebhook {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhook,
    generatedAt: input.generatedAt,
    job: input.job,
    workerPayload: canonicalize(input.workerPayload),
    delivery: {
      provider: input.job.provider.mode,
      endpointHash: input.job.provider.endpointHash,
      secretConfigured: input.job.provider.secretConfigured,
      workerPayloadSha256: input.job.payloadSha256
    },
    redaction: {
      responsePayloadValuesExcluded: true,
      auditPayloadValuesExcluded: true,
      secretValuesExcluded: true
    }
  };
}

function serverJobQueueRequestHeaders(input: {
  mode: SenaEnterpriseServerJobQueueMode;
  event: "server_job.queue" | "server_job.queue.probe";
  attemptedAt: string;
  body: string;
  payloadSha256: string;
  workerPayloadSha256?: string;
  jobId?: string;
  jobKind?: SenaEnterpriseServerJobKind;
  schemaVersion?: string;
}) {
  const senaHeaders: Record<string, string> = {
    "x-sena-webhook-event": input.event,
    "x-sena-webhook-timestamp": input.attemptedAt,
    "x-sena-job-payload-sha256": input.payloadSha256
  };
  if (input.workerPayloadSha256) {
    senaHeaders["x-sena-worker-payload-sha256"] = input.workerPayloadSha256;
  }
  if (input.jobId) senaHeaders["x-sena-server-job-id"] = input.jobId;
  if (input.jobKind) senaHeaders["x-sena-server-job-kind"] = input.jobKind;
  if (input.schemaVersion) senaHeaders["x-sena-schema-version"] = input.schemaVersion;

  const secret = serverJobQueueSecret();
  if (secret) {
    senaHeaders["x-sena-webhook-signature"] = `sha256=${serverJobWebhookSignature(secret, input.attemptedAt, input.body)}`;
  }

  if (input.mode !== "qstash") {
    return {
      "content-type": "application/json",
      ...senaHeaders
    };
  }

  const providerToken = serverJobQueueProviderToken();
  if (!providerToken) {
    throw new SenaEnterpriseError("SENA QStash provider token is not configured.", 503, "server_job_queue_provider_token_not_configured");
  }

  return Object.fromEntries([
    ["authorization", `Bearer ${providerToken}`],
    ["content-type", "application/json"],
    ...Object.entries(senaHeaders).map(([key, value]) => [`upstash-forward-${key}`, value])
  ]);
}

async function dispatchServerJobQueueWebhook(input: {
  job: Omit<SenaEnterpriseServerJob, "delivery">;
  workerPayload: unknown;
}): Promise<SenaEnterpriseServerJobQueueDelivery> {
  const attemptedAt = now();
  if (input.job.provider.mode === "local") {
    return {
      attempted: true,
      webhookStatus: "local-sink",
      sourceReady: true,
      attemptedAt,
      endpointHash: input.job.provider.endpointHash
    };
  }

  const webhookUrl = serverJobDispatchUrl(input.job.provider.mode);
  if (!webhookUrl || !input.job.provider.endpointHash) {
    throw new SenaEnterpriseError("SENA server job queue URL is not configured.", 503, "server_job_queue_url_not_configured");
  }

  const body = JSON.stringify(serverJobQueueWebhookPayload({
    job: input.job,
    workerPayload: input.workerPayload,
    generatedAt: attemptedAt
  }));
  const transportPayloadSha256 = createHash("sha256").update(body).digest("hex");
  const headers = serverJobQueueRequestHeaders({
    mode: input.job.provider.mode,
    event: "server_job.queue",
    attemptedAt,
    body,
    payloadSha256: transportPayloadSha256,
    workerPayloadSha256: input.job.payloadSha256,
    jobId: input.job.id,
    jobKind: input.job.kind
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.job.provider.timeoutMs);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    return {
      attempted: true,
      webhookStatus: response.ok ? "delivered" : "failed",
      sourceReady: true,
      attemptedAt,
      endpointHash: input.job.provider.endpointHash,
      httpStatus: response.status,
      errorCode: response.ok ? undefined : `http_${response.status}`,
      failureStage: response.ok ? undefined : "queue-dispatch"
    };
  } catch (error) {
    return {
      attempted: true,
      webhookStatus: "failed",
      sourceReady: true,
      attemptedAt,
      endpointHash: input.job.provider.endpointHash,
      failureStage: "queue-dispatch",
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function serverJobQueueProbeProvider(queue: SenaEnterpriseServerJobQueueStatus): SenaEnterpriseServerJobQueueProbe["provider"] {
  return {
    queueMode: queue.mode,
    queueConfigured: queue.configured,
    queueProductionReady: queue.productionReady,
    queueEndpointHash: queue.endpointHash,
    queueSecretConfigured: queue.secretConfigured,
    queueTimeoutMs: queue.timeoutMs,
    queueEndpointValueExcluded: true,
    queueSecretValuesExcluded: true
  };
}

function serverJobQueueProbePayload(input: {
  generatedAt: string;
  probeId: string;
  queue: SenaEnterpriseServerJobQueueStatus;
}) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe,
    generatedAt: input.generatedAt,
    probe: {
      probeId: input.probeId,
      purpose: "sena-server-job-queue-live-probe",
      dispatchEvent: "server_job.queue.probe",
      statusCallback: "/api/sena/ops/jobs",
      queuePayloadSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhook,
      expectedWorkerAction: "discard-synthetic-probe",
      syntheticUserDataIncluded: false
    },
    delivery: {
      provider: input.queue.mode,
      endpointHash: input.queue.endpointHash,
      secretConfigured: input.queue.secretConfigured
    },
    redaction: {
      endpointValueExcluded: true,
      secretValuesExcluded: true,
      responsePayloadValuesExcluded: true
    }
  };
}

export async function verifyEnterpriseServerJobQueueProbe(input: {
  fetchImpl?: typeof fetch;
  probeId?: string;
} = {}): Promise<SenaEnterpriseServerJobQueueProbe> {
  const generatedAt = now();
  const queue = serverJobQueueStatus();
  const contract = buildEnterpriseServerJobQueueContract();
  const readiness = serverJobQueueProbeReadiness();
  const probeId = input.probeId ?? id("server_job_queue_probe");
  const probeIdHash = createHash("sha256").update(probeId).digest("hex");
  const liveQueueConfigured = (queue.mode === "managed" || queue.mode === "webhook" || queue.mode === "qstash") &&
    queue.productionReady;

  if (!liveQueueConfigured) {
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe,
      generatedAt,
      status: "review",
      provider: serverJobQueueProbeProvider(queue),
      probe: {
        probeIdHash,
        queuePayloadSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhook,
        probePayloadSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe,
        dispatchEvent: "server_job.queue.probe",
        deliveryStatus: "not-configured",
        attempted: false,
        errorCode: "server_job_queue_not_configured"
      },
      evidence: [
        ...queue.evidence,
        ...readiness.evidence,
        "serverJobQueueProbeStatus=review",
        "serverJobQueueProbeDelivery=not-configured",
        "serverJobQueueProbeAttempted=false",
        "serverJobQueueProbePayload=synthetic-no-user-data",
        "serverJobQueueProbeEndpointValue=excluded"
      ],
      redaction: {
        endpointValueExcluded: true,
        secretValuesExcluded: true,
        probeIdValueExcluded: true,
        payloadValuesExcluded: true,
        responsePayloadValuesExcluded: true
      },
      contract
    };
  }

  const webhookUrl = serverJobDispatchUrl(queue.mode);
  if (!webhookUrl) {
    throw new SenaEnterpriseError("SENA server job queue URL is not configured.", 503, "server_job_queue_url_not_configured");
  }
  const payload = serverJobQueueProbePayload({ generatedAt, probeId, queue });
  const body = JSON.stringify(payload);
  const payloadSha256 = createHash("sha256").update(body).digest("hex");
  const attemptedAt = now();
  const headers = serverJobQueueRequestHeaders({
    mode: queue.mode,
    event: "server_job.queue.probe",
    attemptedAt,
    body,
    payloadSha256,
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), queue.timeoutMs);
  try {
    const response = await (input.fetchImpl ?? fetch)(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    const delivered = response.ok;
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe,
      generatedAt,
      status: delivered ? "pass" : "review",
      provider: serverJobQueueProbeProvider(queue),
      probe: {
        probeIdHash,
        queuePayloadSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhook,
        probePayloadSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe,
        dispatchEvent: "server_job.queue.probe",
        payloadSha256,
        deliveryStatus: delivered ? "delivered" : "failed",
        attempted: true,
        attemptedAt,
        httpStatus: response.status,
        errorCode: delivered ? undefined : `http_${response.status}`,
        errorHash: delivered ? undefined : webhookErrorHash(`server_job_queue_probe_rejected:${response.status}`)
      },
      evidence: [
        ...queue.evidence,
        ...readiness.evidence,
        `serverJobQueueProbeStatus=${delivered ? "pass" : "review"}`,
        `serverJobQueueProbeDelivery=${delivered ? "delivered" : "failed"}`,
        "serverJobQueueProbeAttempted=true",
        `serverJobQueueProbeHttpStatus=${response.status}`,
        "serverJobQueueProbePayload=synthetic-no-user-data",
        "serverJobQueueProbeEndpointValue=excluded"
      ],
      redaction: {
        endpointValueExcluded: true,
        secretValuesExcluded: true,
        probeIdValueExcluded: true,
        payloadValuesExcluded: true,
        responsePayloadValuesExcluded: true
      },
      contract
    };
  } catch (error) {
    const errorCode = error instanceof Error && error.name === "AbortError"
      ? "server_job_queue_probe_timeout"
      : "server_job_queue_probe_delivery_failed";
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe,
      generatedAt,
      status: "review",
      provider: serverJobQueueProbeProvider(queue),
      probe: {
        probeIdHash,
        queuePayloadSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhook,
        probePayloadSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe,
        dispatchEvent: "server_job.queue.probe",
        payloadSha256,
        deliveryStatus: "failed",
        attempted: true,
        attemptedAt,
        errorCode,
        errorHash: webhookErrorHash(error)
      },
      evidence: [
        ...queue.evidence,
        ...readiness.evidence,
        "serverJobQueueProbeStatus=review",
        "serverJobQueueProbeDelivery=failed",
        "serverJobQueueProbeAttempted=true",
        `serverJobQueueProbeErrorCode=${errorCode}`,
        "serverJobQueueProbePayload=synthetic-no-user-data",
        "serverJobQueueProbeEndpointValue=excluded"
      ],
      redaction: {
        endpointValueExcluded: true,
        secretValuesExcluded: true,
        probeIdValueExcluded: true,
        payloadValuesExcluded: true,
        responsePayloadValuesExcluded: true
      },
      contract
    };
  } finally {
    clearTimeout(timeout);
  }
}

function serverJobSummary(jobs: SenaEnterpriseServerJob[]): SenaEnterpriseServerJobList["summary"] {
  return {
    total: jobs.length,
    queued: jobs.filter((job) => job.status === "queued").length,
    running: jobs.filter((job) => job.status === "running").length,
    succeeded: jobs.filter((job) => job.status === "succeeded").length,
    failed: jobs.filter((job) => job.status === "failed").length,
    deadLettered: jobs.filter((job) => job.status === "dead-lettered").length,
    retryable: jobs.filter((job) => job.lifecycle.retryable).length
  };
}

function sortServerJobs(jobs: SenaEnterpriseServerJob[]) {
  return [...jobs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function isPostgresServerJobStoreActive() {
  return serverJobStoreRuntime().activeStore === "postgres-table";
}

function postgresServerJobStore() {
  enterprisePostgresServerJobStore ??= createEnterprisePostgresServerJobAdapterFromEnv({});
  return enterprisePostgresServerJobStore.adapter;
}

async function writeServerJob(job: SenaEnterpriseServerJob) {
  if (isPostgresServerJobStoreActive()) {
    await postgresServerJobStore().upsertJob(job);
    return job;
  }
  const state = await readEnterpriseState();
  const db = state.db;
  const existing = db.serverJobs ?? [];
  db.serverJobs = [
    job,
    ...existing.filter((candidate) => candidate.id !== job.id)
  ].slice(0, 2000);
  await writeEnterpriseState(state, db);
  return job;
}

async function finalizeServerJobQueueDelivery(
  jobId: string,
  delivery: SenaEnterpriseServerJobQueueDelivery
) {
  const timestamp = now();
  const failureReason = delivery.failureStage === "source-persistence"
    ? "source-artifact-persistence-failed"
    : "queue-dispatch-failed";
  if (isPostgresServerJobStoreActive()) {
    const current = await getEnterpriseServerJob(jobId);
    const failQueuedJob = delivery.webhookStatus === "failed" && current.status === "queued";
    const retryable = failQueuedJob &&
      delivery.failureStage !== "source-persistence" &&
      current.provider.mode === "local" &&
      delivery.sourceReady === true &&
      current.lifecycle.attempts < current.lifecycle.maxAttempts;
    const failedLifecycle = failQueuedJob
      ? {
          ...current.lifecycle,
          retryable,
          lastTransition: "mark-failed" as const,
          finishedAt: timestamp,
          lastErrorCode: delivery.errorCode,
          lastErrorHash: delivery.errorHash,
          statusReason: failureReason
        }
      : current.lifecycle;
    const updated = await postgresServerJobStore().finalizeDelivery({
      jobId,
      delivery,
      failQueuedJob,
      failedLifecycle,
      updatedAt: timestamp
    });
    if (!updated) {
      throw new SenaEnterpriseError("SENA server job was not found.", 404, "server_job_not_found");
    }
    return updated;
  }
  return mutateEnterpriseDbAtomically((db) => {
    const current = (db.serverJobs ?? []).find((candidate) => candidate.id === jobId);
    if (!current) {
      throw new SenaEnterpriseError("SENA server job was not found.", 404, "server_job_not_found");
    }
    const failQueuedJob = delivery.webhookStatus === "failed" && current.status === "queued";
    const retryable = failQueuedJob &&
      delivery.failureStage !== "source-persistence" &&
      current.provider.mode === "local" &&
      delivery.sourceReady === true &&
      current.lifecycle.attempts < current.lifecycle.maxAttempts;
    const updated: SenaEnterpriseServerJob = {
      ...current,
      status: failQueuedJob ? "failed" : current.status,
      updatedAt: timestamp,
      delivery,
      lifecycle: failQueuedJob
        ? {
            ...current.lifecycle,
            retryable,
            lastTransition: "mark-failed",
            finishedAt: timestamp,
            lastErrorCode: delivery.errorCode,
            lastErrorHash: delivery.errorHash,
            statusReason: failureReason
          }
        : current.lifecycle
    };
    db.serverJobs = [
      updated,
      ...(db.serverJobs ?? []).filter((candidate) => candidate.id !== updated.id)
    ].slice(0, 2000);
    return updated;
  });
}

export async function listEnterpriseServerJobs(input: {
  status?: SenaEnterpriseServerJobStatus;
  kind?: SenaEnterpriseServerJobKind;
  teamId?: string;
  projectId?: string;
  limit?: number;
  claimableOnly?: boolean;
  analysisCustodyQuarantineOnly?: boolean;
  excludeSyntheticWorkerHeartbeat?: boolean;
  callerScope?: SenaEnterpriseServerJobCallerScope;
} = {}): Promise<SenaEnterpriseServerJobList> {
  // Resolved before either store is touched: a scoped caller's team is not an
  // optional filter, it is the only team the query may see.
  const teamId = scopedServerJobTeamId(input.callerScope, input.teamId);
  if (isPostgresServerJobStoreActive()) {
    const { callerScope: _callerScope, ...filters } = input;
    return postgresServerJobStore().listJobs({ ...filters, teamId });
  }
  const state = await readEnterpriseState();
  const limit = Math.max(1, Math.min(input.limit ?? 100, 500));
  const allJobs = sortServerJobs((state.db.serverJobs ?? [])
    .filter((job) => !input.analysisCustodyQuarantineOnly ||
      enterpriseServerJobRequiresAnalysisCustodyQuarantine(job))
    .filter((job) => !input.excludeSyntheticWorkerHeartbeat ||
      !enterpriseServerJobIsSyntheticWorkerHeartbeat(job))
    .map((job) => projectEnterpriseServerJobReadModel(job))
    .filter((job) => !input.status || job.status === input.status)
    .filter((job) => !input.claimableOnly || job.delivery.sourceReady === true)
    .filter((job) => !input.kind || job.kind === input.kind)
    .filter((job) => !teamId || job.teamId === teamId)
    .filter((job) => !input.projectId || job.projectId === input.projectId));
  const jobs = allJobs.slice(0, limit);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobList,
    generatedAt: now(),
    summary: serverJobSummary(allJobs),
    jobs
  };
}

/**
 * Finds one oldest source-ready job the built-in polling worker can execute.
 *
 * This is deliberately separate from the mixed-kind list API: Postgres applies
 * its kind/status/source predicates before `LIMIT 1` and does not run the list
 * summary count, while the file store performs one O(n) linear scan over the
 * retained receipt array (normal writes cap n at 2,000). Unsupported kinds
 * therefore cannot consume this reservation window.
 */
export async function findOldestClaimableEnterpriseServerJob(input: {
  kinds: readonly SenaEnterpriseServerJobKind[];
  teamId?: string;
  callerScope?: SenaEnterpriseServerJobCallerScope;
}): Promise<SenaEnterpriseServerJob | undefined> {
  if (input.kinds.length === 0) return undefined;
  const teamId = scopedServerJobTeamId(input.callerScope, input.teamId);
  if (isPostgresServerJobStoreActive()) {
    return await postgresServerJobStore().findOldestClaimableJob({
      kinds: input.kinds,
      teamId
    }) ?? undefined;
  }
  const state = await readEnterpriseState();
  return (state.db.serverJobs ?? [])
    .filter((job) => !enterpriseServerJobIsSyntheticWorkerHeartbeat(job))
    .map((job) => projectEnterpriseServerJobReadModel(job))
    .filter((job) => job.status === "queued")
    .filter((job) => job.delivery.sourceReady === true)
    .filter((job) => input.kinds.includes(job.kind))
    .filter((job) => !teamId || job.teamId === teamId)
    .reduce<SenaEnterpriseServerJob | undefined>((oldest, job) => {
      if (!oldest) return job;
      const timestampOrder = job.updatedAt.localeCompare(oldest.updatedAt);
      return timestampOrder < 0 || (timestampOrder === 0 && job.id.localeCompare(oldest.id) < 0)
        ? job
        : oldest;
    }, undefined);
}

export async function getEnterpriseServerJob(jobId: string) {
  if (isPostgresServerJobStoreActive()) {
    const job = await postgresServerJobStore().getJob(jobId);
    if (!job) {
      throw new SenaEnterpriseError("SENA server job was not found.", 404, "server_job_not_found");
    }
    return job;
  }
  const state = await readEnterpriseState();
  const storedJob = (state.db.serverJobs ?? []).find((candidate) => candidate.id === jobId);
  const job = storedJob ? projectEnterpriseServerJobReadModel(storedJob) : undefined;
  if (!job) {
    throw new SenaEnterpriseError("SENA server job was not found.", 404, "server_job_not_found");
  }
  return job;
}

function updatedLifecycle(input: {
  job: SenaEnterpriseServerJob;
  action: SenaEnterpriseServerJobStatusAction;
  timestamp: string;
  workerRunId?: string;
  errorCode?: string;
  errorHash?: string;
  reason?: string;
}) {
  const lifecycle = {
    ...input.job.lifecycle,
    lastTransition: input.action,
    workerRunId: input.workerRunId ?? input.job.lifecycle.workerRunId,
    lastErrorCode: input.errorCode ?? input.job.lifecycle.lastErrorCode,
    lastErrorHash: input.errorHash ?? input.job.lifecycle.lastErrorHash,
    statusReason: input.reason ?? input.job.lifecycle.statusReason
  };
  if (input.action === "mark-running") {
    lifecycle.attempts = input.job.lifecycle.attempts + 1;
    lifecycle.startedAt = input.timestamp;
    lifecycle.finishedAt = undefined;
    lifecycle.retryable = false;
  }
  if (input.action === "mark-succeeded") {
    lifecycle.finishedAt = input.timestamp;
    lifecycle.retryable = false;
  }
  if (input.action === "mark-failed") {
    lifecycle.finishedAt = input.timestamp;
    lifecycle.retryable = input.job.provider.mode === "local" &&
      input.job.delivery.sourceReady === true &&
      lifecycle.attempts < lifecycle.maxAttempts;
    lifecycle.deadLetteredAt = lifecycle.attempts >= lifecycle.maxAttempts
      ? input.timestamp
      : undefined;
  }
  if (input.action === "retry") {
    lifecycle.retryRequestedAt = input.timestamp;
    lifecycle.retryable = false;
    lifecycle.finishedAt = undefined;
    lifecycle.deadLetteredAt = undefined;
    lifecycle.startedAt = undefined;
    lifecycle.workerRunId = undefined;
  }
  if (input.action === "dead-letter") {
    lifecycle.finishedAt = input.timestamp;
    lifecycle.deadLetteredAt = input.timestamp;
    lifecycle.retryable = false;
  }
  return lifecycle;
}

function statusForAction(job: SenaEnterpriseServerJob, action: SenaEnterpriseServerJobStatusAction): SenaEnterpriseServerJobStatus {
  if (action === "mark-running") return "running";
  if (action === "mark-succeeded") return "succeeded";
  if (action === "retry") return "queued";
  if (action === "dead-letter") return "dead-lettered";
  if (action === "mark-failed") {
    return job.lifecycle.attempts < job.lifecycle.maxAttempts ? "failed" : "dead-lettered";
  }
  return job.status;
}

type SenaEnterpriseServerJobTransitionDecision = {
  idempotent: boolean;
  expectedStatus: SenaEnterpriseServerJobStatus;
  expectedWorkerRunId?: string;
  requireSourceReady: boolean;
  workerRunId?: string;
};

export function requiredWorkerRunId(workerRunId: string | undefined) {
  const normalized = workerRunId?.trim();
  if (!normalized) {
    throw new SenaEnterpriseError(
      "workerRunId is required for SENA worker lifecycle callbacks.",
      400,
      "server_job_worker_run_id_required"
    );
  }
  return normalized;
}

function transitionNotAllowed(job: SenaEnterpriseServerJob, action: SenaEnterpriseServerJobStatusAction): never {
  throw new SenaEnterpriseError(
    `SENA server job action ${action} is not allowed from status ${job.status}.`,
    409,
    "server_job_status_transition_not_allowed"
  );
}

function assertEnterpriseServerJobTransition(input: {
  job: SenaEnterpriseServerJob;
  action: SenaEnterpriseServerJobStatusAction;
  workerRunId?: string;
  force?: boolean;
}): SenaEnterpriseServerJobTransitionDecision {
  const { job, action } = input;
  if (action === "mark-running") {
    const workerRunId = requiredWorkerRunId(input.workerRunId);
    if (job.status !== "queued") transitionNotAllowed(job, action);
    if (job.delivery.sourceReady !== true) {
      throw new SenaEnterpriseError(
        "SENA server job source artifacts are not ready for worker execution.",
        409,
        "server_job_worker_source_not_ready"
      );
    }
    return {
      idempotent: false,
      expectedStatus: "queued",
      requireSourceReady: true,
      workerRunId
    };
  }

  if (action === "mark-succeeded" || action === "mark-failed") {
    const workerRunId = requiredWorkerRunId(input.workerRunId);
    const owner = job.lifecycle.workerRunId?.trim();
    const terminalMatches = job.lifecycle.lastTransition === action && (
      (action === "mark-succeeded" && job.status === "succeeded") ||
      (action === "mark-failed" && (job.status === "failed" || job.status === "dead-lettered"))
    );
    if (job.status !== "running" && !terminalMatches) transitionNotAllowed(job, action);
    if (!owner || owner !== workerRunId) {
      throw new SenaEnterpriseError(
        "SENA server job callback does not match the worker that owns the running lifecycle.",
        409,
        "server_job_worker_run_mismatch"
      );
    }
    return {
      idempotent: terminalMatches,
      expectedStatus: job.status,
      expectedWorkerRunId: owner,
      requireSourceReady: false,
      workerRunId
    };
  }

  if (action === "retry") {
    if (job.status !== "failed" && job.status !== "dead-lettered") {
      throw new SenaEnterpriseError(
        "Only failed or dead-lettered SENA server jobs can be retried.",
        409,
        "server_job_retry_not_allowed"
      );
    }
    if (job.delivery.sourceReady !== true) {
      throw new SenaEnterpriseError(
        "SENA server job source custody must be repaired by re-submission before retry.",
        409,
        "server_job_source_repair_required"
      );
    }
    if (job.provider.mode !== "local") {
      throw new SenaEnterpriseError(
        "Push-provider SENA jobs require provider-native delivery retry or a fresh source-bound re-submission.",
        409,
        "server_job_resubmission_required"
      );
    }
    if (job.lifecycle.attempts >= job.lifecycle.maxAttempts && !input.force) {
      throw new SenaEnterpriseError(
        "SENA server job has reached max attempts; pass force=true to move it out of dead letter review.",
        409,
        "server_job_retry_requires_force"
      );
    }
    return {
      idempotent: false,
      expectedStatus: job.status,
      requireSourceReady: true
    };
  }

  if (action === "dead-letter") {
    if (job.status !== "failed") transitionNotAllowed(job, action);
    return {
      idempotent: false,
      expectedStatus: "failed",
      requireSourceReady: false
    };
  }

  return transitionNotAllowed(job, action);
}

/**
 * Atomically transitions one queued job to running for a worker contender.
 *
 * Production Postgres uses a queued-status compare-and-set. The local
 * enterprise-state fallback holds its filesystem lock across the complete
 * read, queued predicate, and write so independent Node processes share the
 * same single-winner guarantee.
 */
export async function claimEnterpriseServerJob(input: {
  jobId: string;
  workerRunId: string;
}) {
  const workerRunId = requiredWorkerRunId(input.workerRunId);
  const timestamp = now();
  if (isPostgresServerJobStoreActive()) {
    const current = await getEnterpriseServerJob(input.jobId);
    if (current.status !== "queued") {
      return { claimed: false as const, reason: "server_job_worker_job_not_queued", job: current };
    }
    if (current.delivery.sourceReady !== true) {
      return { claimed: false as const, reason: "server_job_worker_source_not_ready", job: current };
    }
    const lifecycle = updatedLifecycle({
      job: current,
      action: "mark-running",
      timestamp,
      workerRunId
    });
    const nextJob: SenaEnterpriseServerJob = {
      ...current,
      status: statusForAction({ ...current, lifecycle }, "mark-running"),
      updatedAt: timestamp,
      lifecycle
    };
    const claimed = await postgresServerJobStore().claimQueuedJob(nextJob);
    if (claimed) return { claimed: true as const, job: claimed };
    return {
      claimed: false as const,
      reason: "server_job_worker_claim_lost",
      job: await getEnterpriseServerJob(input.jobId)
    };
  }

  return mutateEnterpriseDbAtomically((db) => {
    const storedCurrent = (db.serverJobs ?? []).find((candidate) => candidate.id === input.jobId);
    if (!storedCurrent) {
      throw new SenaEnterpriseError("SENA server job was not found.", 404, "server_job_not_found");
    }
    const current = projectEnterpriseServerJobReadModel(storedCurrent);
    if (current.status !== "queued") {
      return { claimed: false as const, reason: "server_job_worker_job_not_queued", job: current };
    }
    if (current.delivery.sourceReady !== true) {
      return { claimed: false as const, reason: "server_job_worker_source_not_ready", job: current };
    }
    const lifecycle = updatedLifecycle({
      job: current,
      action: "mark-running",
      timestamp,
      workerRunId
    });
    const claimed: SenaEnterpriseServerJob = {
      ...current,
      status: statusForAction({ ...current, lifecycle }, "mark-running"),
      updatedAt: timestamp,
      lifecycle
    };
    db.serverJobs = [
      claimed,
      ...(db.serverJobs ?? []).filter((candidate) => candidate.id !== claimed.id)
    ].slice(0, 2000);
    return { claimed: true as const, job: claimed };
  });
}

/**
 * Atomically terminalizes an immutable queued command that cannot be admitted
 * or reproduced. No worker owns this claim, so it is rejected without
 * incrementing attempts; the existing attempt count is preserved and no
 * workerRunId is invented. This prevents poison receipts from being accepted by
 * push providers or rescanned forever by the local poller.
 */
export async function rejectEnterpriseServerJobBeforeClaim(input: {
  jobId: string;
  errorCode: string;
  errorHash?: string;
  reason: string;
}) {
  const timestamp = now();
  const reject = (current: SenaEnterpriseServerJob): SenaEnterpriseServerJob => ({
    ...current,
    status: "failed",
    updatedAt: timestamp,
    lifecycle: {
      ...current.lifecycle,
      attempts: current.lifecycle.attempts,
      retryable: false,
      lastTransition: "mark-failed",
      finishedAt: timestamp,
      workerRunId: undefined,
      lastErrorCode: input.errorCode,
      lastErrorHash: input.errorHash,
      statusReason: input.reason,
      deadLetteredAt: undefined
    }
  });

  if (isPostgresServerJobStoreActive()) {
    const current = await getEnterpriseServerJob(input.jobId);
    if (current.status !== "queued") return current;
    const rejected = reject(current);
    return await postgresServerJobStore().transitionJobStatus({
      job: rejected,
      expectedStatus: "queued",
      requireSourceReady: false
    }) ?? await getEnterpriseServerJob(input.jobId);
  }

  return mutateEnterpriseDbAtomically((db) => {
    const storedCurrent = (db.serverJobs ?? []).find((candidate) => candidate.id === input.jobId);
    if (!storedCurrent) {
      throw new SenaEnterpriseError("SENA server job was not found.", 404, "server_job_not_found");
    }
    const current = projectEnterpriseServerJobReadModel(storedCurrent);
    if (current.status !== "queued") return current;
    const rejected = reject(current);
    db.serverJobs = [
      rejected,
      ...(db.serverJobs ?? []).filter((candidate) => candidate.id !== rejected.id)
    ].slice(0, 2000);
    return rejected;
  });
}

// Counts only (no warning text): parse-repair disclosure that is safe to carry
// through the redacted status callback. Entries must reference uploads queued
// with this job — anything else is rejected rather than silently dropped.
function sanitizedUploadWarnings(
  entries: Array<{ uploadId?: unknown; warningCount?: unknown }> | undefined,
  job: SenaEnterpriseServerJob
): Array<{ uploadId: string; warningCount: number }> {
  if (entries === undefined) return [];
  if (!Array.isArray(entries)) {
    throw new SenaEnterpriseError(
      "uploadWarnings must be an array of { uploadId, warningCount } entries.",
      400,
      "server_job_upload_warnings_invalid"
    );
  }
  const allowed = new Set(job.payloadSummary.uploadIds ?? []);
  // Every entry is validated — no silent truncation: a report can never carry
  // more entries than the job queued uploads, so over-length arrays and
  // duplicates are rejected instead of dropped past an arbitrary cap.
  if (entries.length > allowed.size) {
    throw new SenaEnterpriseError(
      "uploadWarnings may not contain more entries than the job's queued uploads.",
      400,
      "server_job_upload_warnings_too_many"
    );
  }
  const seen = new Set<string>();
  return entries.map((entry) => {
    const uploadId = typeof entry?.uploadId === "string" ? entry.uploadId.trim() : "";
    const rawCount = entry?.warningCount;
    const warningCount = typeof rawCount === "number" && Number.isFinite(rawCount) && rawCount >= 0
      ? Math.trunc(rawCount)
      : undefined;
    if (!uploadId || warningCount === undefined) {
      throw new SenaEnterpriseError(
        "uploadWarnings entries require a non-empty uploadId and a non-negative warningCount.",
        400,
        "server_job_upload_warnings_invalid"
      );
    }
    if (!allowed.has(uploadId) || seen.has(uploadId)) {
      throw new SenaEnterpriseError(
        "uploadWarnings may only reference uploads queued with this job, once each.",
        400,
        "server_job_upload_warnings_unknown_upload"
      );
    }
    seen.add(uploadId);
    return { uploadId, warningCount };
  });
}

export async function updateEnterpriseServerJobStatus(input: {
  jobId: string;
  action: SenaEnterpriseServerJobStatusAction;
  workerRunId?: string;
  errorCode?: string;
  errorHash?: string;
  reason?: string;
  force?: boolean;
  uploadWarnings?: Array<{ uploadId?: unknown; warningCount?: unknown }>;
  callerScope?: SenaEnterpriseServerJobCallerScope;
  preclaimAdmission?: (job: SenaEnterpriseServerJob) => Promise<void>;
}): Promise<SenaEnterpriseServerJobStatusUpdate> {
  // Resolved before the job is looked up, so a caller with no rights on the
  // team they declared cannot use job ids as an existence oracle.
  const scopeTeamId = scopedServerJobTeamId(input.callerScope);
  const current = await getEnterpriseServerJob(input.jobId);
  // Ownership is checked before any lifecycle validation or write, so a scoped
  // caller cannot mark another tenant's job running, succeeded, or failed.
  assertScopedServerJobAccess(input.callerScope, scopeTeamId, current);
  if (input.action === "mark-running" && current.kind === "analysis" &&
    !enterpriseServerJobHasValidAnalysisCommandCustodyProfile(current)) {
    const error = externalAnalysisCommandCustodyError();
    await rejectEnterpriseServerJobBeforeClaim({
      jobId: current.id,
      errorCode: error.code,
      errorHash: webhookErrorHash(error),
      reason: "server-job-external-analysis-command-custody-invalid"
    });
    throw error;
  }
  const uploadWarnings = sanitizedUploadWarnings(input.uploadWarnings, current);
  const initialDecision = assertEnterpriseServerJobTransition({
    job: current,
    action: input.action,
    workerRunId: input.workerRunId,
    force: input.force
  });
  if (!initialDecision.idempotent && input.action === "mark-running" &&
    current.kind === "analysis" &&
    current.payloadSummary.commandCustody === SENA_ANALYSIS_QUEUE_COMMAND_CUSTODY) {
    let admissionError: unknown;
    try {
      if (!input.preclaimAdmission) throw externalAnalysisCommandCustodyError();
      await input.preclaimAdmission(current);
    } catch (error) {
      admissionError = error instanceof SenaEnterpriseError
        ? error
        : externalAnalysisCommandCustodyError();
    }
    if (admissionError) {
      const error = admissionError as SenaEnterpriseError;
      await rejectEnterpriseServerJobBeforeClaim({
        jobId: current.id,
        errorCode: error.code,
        errorHash: webhookErrorHash(error),
        reason: "server-job-external-analysis-preclaim-rejected"
      });
      throw error;
    }
  }
  const timestamp = now();
  let committedJob: SenaEnterpriseServerJob;
  if (initialDecision.idempotent) {
    committedJob = current;
  } else if (isPostgresServerJobStoreActive()) {
    const lifecycle = updatedLifecycle({
      job: current,
      action: input.action,
      timestamp,
      workerRunId: initialDecision.workerRunId,
      errorCode: input.errorCode,
      errorHash: input.errorHash,
      reason: input.reason
    });
    const nextJob: SenaEnterpriseServerJob = {
      ...current,
      status: statusForAction({ ...current, lifecycle }, input.action),
      updatedAt: timestamp,
      lifecycle
    };
    const transitioned = await postgresServerJobStore().transitionJobStatus({
      job: nextJob,
      expectedStatus: initialDecision.expectedStatus,
      expectedWorkerRunId: initialDecision.expectedWorkerRunId,
      requireSourceReady: initialDecision.requireSourceReady
    });
    if (!transitioned) {
      throw new SenaEnterpriseError(
        "SENA server job status changed before this lifecycle transition could be committed.",
        409,
        "server_job_status_transition_conflict"
      );
    }
    committedJob = transitioned;
  } else {
    committedJob = await mutateEnterpriseDbAtomically((db) => {
      const storedCurrent = (db.serverJobs ?? []).find((candidate) => candidate.id === input.jobId);
      if (!storedCurrent) {
        throw new SenaEnterpriseError("SENA server job was not found.", 404, "server_job_not_found");
      }
      const lockedCurrent = projectEnterpriseServerJobReadModel(storedCurrent);
      assertScopedServerJobAccess(input.callerScope, scopeTeamId, lockedCurrent);
      const lockedDecision = assertEnterpriseServerJobTransition({
        job: lockedCurrent,
        action: input.action,
        workerRunId: input.workerRunId,
        force: input.force
      });
      if (lockedDecision.idempotent) return lockedCurrent;
      const lifecycle = updatedLifecycle({
        job: lockedCurrent,
        action: input.action,
        timestamp,
        workerRunId: lockedDecision.workerRunId,
        errorCode: input.errorCode,
        errorHash: input.errorHash,
        reason: input.reason
      });
      const nextJob: SenaEnterpriseServerJob = {
        ...lockedCurrent,
        status: statusForAction({ ...lockedCurrent, lifecycle }, input.action),
        updatedAt: timestamp,
        lifecycle
      };
      db.serverJobs = [
        nextJob,
        ...(db.serverJobs ?? []).filter((candidate) => candidate.id !== nextJob.id)
      ].slice(0, 2000);
      return nextJob;
    });
  }
  let appliedUploadWarnings: Array<{ uploadId: string; warningCount: number }> | undefined;
  if (uploadWarnings.length > 0) {
    try {
      // Team-scoped: counts only land on uploads owned by the job's team, so a
      // payloadSummary carrying a foreign upload id can never write across
      // tenants.
      appliedUploadWarnings = (await recordEnterpriseUploadWarningCountsAsync(uploadWarnings, committedJob.teamId)).map((upload) => ({
        uploadId: upload.id,
        warningCount: upload.warningCount ?? 0
      }));
    } catch {
      // The job transition above is already committed. mark-* updates are
      // idempotent, so the worker can re-send the same status update to
      // re-apply the warnings.
      throw new SenaEnterpriseError(
        "The job status was updated, but applying uploadWarnings to the upload registry failed; re-send the same status update to re-apply them.",
        503,
        "server_job_upload_warnings_apply_failed"
      );
    }
  }
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobStatusUpdate,
    generatedAt: timestamp,
    action: input.action,
    job: committedJob,
    ...(appliedUploadWarnings ? { uploadWarnings: appliedUploadWarnings } : {}),
    redaction: {
      payloadValuesExcluded: true,
      secretValuesExcluded: true
    }
  };
}

export async function verifyEnterpriseServerJobWorkerHeartbeat(): Promise<SenaEnterpriseServerJobWorkerHeartbeat> {
  const generatedAt = now();
  const queue = serverJobQueueStatus();
  const store = serverJobStoreRuntime();
  const runtime = serverJobWorkerRuntime();
  const callbackUrlHash = hashedHttpUrlEnv("SENA_JOB_WORKER_CALLBACK_URL");
  const runbookUrlHash = hashedHttpUrlEnv("SENA_JOB_WORKER_RUNBOOK_URL");
  const ownerConfigured = serverJobWorkerOwnerConfigured();
  const provider = {
    queueMode: queue.mode,
    queueConfigured: queue.configured,
    queueProductionReady: queue.productionReady,
    queueEndpointHash: queue.endpointHash,
    queueSecretConfigured: queue.secretConfigured,
    queueEndpointValueExcluded: true as const,
    queueSecretValuesExcluded: true as const
  };
  const statusStore = {
    activeStore: store.activeStore,
    postgresConfigured: store.postgresConfigured,
    postgresPrimaryActive: store.postgresPrimaryActive,
    indexed: store.activeStore === "postgres-table"
  };
  const worker = {
    runtime,
    ownerConfigured,
    callbackConfigured: Boolean(callbackUrlHash),
    runbookConfigured: Boolean(runbookUrlHash),
    callbackUrlHash,
    runbookUrlHash,
    ownerValueExcluded: true as const,
    callbackUrlValueExcluded: true as const,
    runbookUrlValueExcluded: true as const
  };
  const missing = [
    store.activeStore === "postgres-table"
      ? null
      : "SENA_ENTERPRISE_STATE_STORE=postgres with configured Postgres adapter"
  ].filter((value): value is string => Boolean(value));
  const baseEvidence = [
    ...queue.evidence,
    ...store.evidence,
    `workerRuntime=${runtime}`,
    `workerOwner=${ownerConfigured ? "configured" : "missing"}`,
    `workerCallback=${callbackUrlHash ? "configured" : "missing"}`,
    `workerRunbook=${runbookUrlHash ? "configured" : "missing"}`,
    "workerHeartbeatPayload=synthetic-no-user-data",
    "workerHeartbeatProofScope=same-process-status-store-cas-self-test",
    "workerHeartbeatManagedQueueDispatchObserved=false",
    "workerHeartbeatExternalWorkerExecutionObserved=false",
    "workerHeartbeatAuthenticatedExternalCallbackObserved=false",
    "workerHeartbeatProductionWorkerReadinessEligible=false",
    "workerHeartbeatDirectStatusTransitionTarget=/api/sena/ops/jobs",
    "workerHeartbeatRawValues=excluded"
  ];
  const baseHeartbeat = {
    syntheticUserDataIncluded: false as const,
    jobKind: "analysis" as const,
    statusCallback: "/api/sena/ops/jobs" as const,
    statusTransitions: ["queued", "running", "succeeded"] as Array<"queued" | "running" | "succeeded">,
    writeReadConfirmed: false,
    callbackActions: ["mark-running", "mark-succeeded"] as ["mark-running", "mark-succeeded"]
  };
  const redaction = {
    jobIdValueExcluded: true as const,
    workerRunIdValueExcluded: true as const,
    payloadValuesExcluded: true as const,
    ownerValueExcluded: true as const,
    endpointValuesExcluded: true as const,
    secretValuesExcluded: true as const
  };
  const proof = {
    scope: "same-process-status-store-cas-self-test" as const,
    sameProcessStatusStoreCasOnly: true as const,
    managedQueueDispatchObserved: false as const,
    externalWorkerExecutionObserved: false as const,
    authenticatedExternalCallbackObserved: false as const,
    productionWorkerReadinessEligible: false as const
  };

  if (missing.length > 0) {
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerHeartbeat,
      generatedAt,
      status: "review",
      proof,
      provider,
      statusStore,
      worker,
      heartbeat: baseHeartbeat,
      evidence: [
        ...baseEvidence,
        "workerHeartbeatStatus=review",
        "workerHeartbeatAttempted=false",
        `workerHeartbeatMissing=${missing.join("|")}`
      ],
      missing,
      redaction
    };
  }

  const jobId = id("server_job_worker_heartbeat");
  const workerRunId = id("server_job_worker_run");
  const payload = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerHeartbeat,
    generatedAt,
    purpose: "sena-server-job-worker-status-callback-heartbeat",
    commandCustody: SENA_ANALYSIS_QUEUE_SYNTHETIC_HEARTBEAT_CUSTODY,
    syntheticUserDataIncluded: false
  };
  const payloadSha256 = stableServerJobPayloadSha256(payload);
  const queuedJob: SenaEnterpriseServerJob = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJob,
    id: jobId,
    kind: "analysis",
    status: "queued",
    queuedAt: generatedAt,
    updatedAt: generatedAt,
    teamId: "ops-heartbeat",
    projectId: "worker-heartbeat",
    actorUserId: "ops-heartbeat",
    payloadSha256,
    payloadSummary: {
      source: "project",
      projectVersion: 1,
      commandCustody: SENA_ANALYSIS_QUEUE_SYNTHETIC_HEARTBEAT_CUSTODY,
      hasInlineSnapshot: false,
      hasInlineDataset: false,
      payloadValuesExcluded: true
    },
    provider: queue,
    delivery: {
      attempted: true,
      webhookStatus: "delivered",
      sourceReady: true,
      attemptedAt: generatedAt,
      endpointHash: queue.endpointHash,
      httpStatus: 202
    },
    worker: {
      expectedAction: "run-analysis",
      payloadDelivery: "project-pointer",
      execution: "external-worker-required",
      statusCallback: "/api/sena/ops/jobs"
    },
    lifecycle: {
      attempts: 0,
      maxAttempts: serverJobMaxAttempts(),
      retryable: false,
      lastTransition: "enqueue"
    },
    redaction: {
      payloadValuesExcluded: true,
      secretValuesExcluded: true,
      endpointValueExcluded: true
    }
  };

  try {
    await writeServerJob(queuedJob);
    await updateEnterpriseServerJobStatus({
      jobId,
      action: "mark-running",
      workerRunId,
      reason: "server-job-worker-heartbeat"
    });
    await updateEnterpriseServerJobStatus({
      jobId,
      action: "mark-succeeded",
      workerRunId,
      reason: "server-job-worker-heartbeat"
    });
    const finalJob = await getEnterpriseServerJob(jobId);
    const passed = finalJob.status === "succeeded" &&
      finalJob.lifecycle.attempts === 1 &&
      finalJob.lifecycle.workerRunId === workerRunId &&
      finalJob.payloadSha256 === payloadSha256;
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerHeartbeat,
      generatedAt,
      status: passed ? "pass" : "review",
      proof,
      provider,
      statusStore,
      worker,
      heartbeat: {
        ...baseHeartbeat,
        jobIdHash: createHash("sha256").update(jobId).digest("hex"),
        workerRunIdHash: createHash("sha256").update(workerRunId).digest("hex"),
        payloadSha256,
        finalStatus: finalJob.status,
        attempts: finalJob.lifecycle.attempts,
        writeReadConfirmed: passed
      },
      evidence: [
        ...baseEvidence,
        `workerHeartbeatStatus=${passed ? "pass" : "review"}`,
        "workerHeartbeatAttempted=true",
        "workerHeartbeatJobIdHash=present",
        "workerHeartbeatWorkerRunIdHash=present",
        "workerHeartbeatPayloadSha256=present",
        `workerHeartbeatFinalStatus=${finalJob.status}`,
        `workerHeartbeatAttempts=${finalJob.lifecycle.attempts}`,
        `workerHeartbeatWriteReadConfirmed=${passed}`
      ],
      missing: passed ? [] : ["status-store CAS self-test final status did not reach succeeded"],
      redaction
    };
  } catch (error) {
    const errorCode = error instanceof SenaEnterpriseError
      ? error.code
      : "server_job_worker_heartbeat_failed";
    return {
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerHeartbeat,
      generatedAt,
      status: "review",
      proof,
      provider,
      statusStore,
      worker,
      heartbeat: {
        ...baseHeartbeat,
        jobIdHash: createHash("sha256").update(jobId).digest("hex"),
        workerRunIdHash: createHash("sha256").update(workerRunId).digest("hex"),
        payloadSha256,
        errorCode,
        errorHash: webhookErrorHash(error)
      },
      evidence: [
        ...baseEvidence,
        "workerHeartbeatStatus=review",
        "workerHeartbeatAttempted=true",
        `workerHeartbeatErrorCode=${errorCode}`,
        "workerHeartbeatErrorHash=present"
      ],
      missing: ["status-store CAS self-test transition failed"],
      redaction
    };
  }
}

export async function enqueueEnterpriseServerJob(input: {
  kind: SenaEnterpriseServerJobKind;
  teamId: string;
  projectId?: string;
  actorUserId: string;
  payload: unknown;
  payloadSummary: SenaEnterpriseServerJobPayloadSummary;
  queue?: SenaEnterpriseServerJobQueueStatus;
  beforeDispatch?: (job: SenaEnterpriseServerJob) => Promise<void>;
}): Promise<SenaEnterpriseServerJob> {
  const job = serverJobWithoutDelivery(input);
  const pendingJob: SenaEnterpriseServerJob = {
    ...job,
    delivery: {
      attempted: false,
      webhookStatus: "pending",
      sourceReady: false,
      endpointHash: job.provider.endpointHash
    }
  };
  // Persist the complete recovery receipt before source persistence begins.
  // It deliberately remains non-claimable until the source-ready transition;
  // otherwise a local poller could execute a pointer whose artifacts do not
  // exist yet.
  await writeServerJob(pendingJob);
  if (input.beforeDispatch) {
    try {
      await input.beforeDispatch(pendingJob);
    } catch (error) {
      await finalizeServerJobQueueDelivery(job.id, {
        attempted: false,
        webhookStatus: "failed",
        sourceReady: false,
        endpointHash: job.provider.endpointHash,
        failureStage: "source-persistence",
        errorCode: "server_job_source_persistence_failed",
        errorHash: webhookErrorHash(error)
      });
      throw new SenaEnterpriseError(
        "SENA server job source persistence failed before queue dispatch.",
        503,
        "server_job_source_persistence_failed"
      );
    }
  }
  // Source artifacts and reviewer envelopes are now durable. Publish that
  // fact before dispatch so a fast webhook receiver can claim immediately,
  // while a local poller can never observe the earlier preparation window as
  // executable work.
  await finalizeServerJobQueueDelivery(job.id, {
    attempted: false,
    webhookStatus: "pending",
    sourceReady: true,
    endpointHash: job.provider.endpointHash
  });
  let delivery: SenaEnterpriseServerJobQueueDelivery;
  try {
    delivery = await dispatchServerJobQueueWebhook({
      job,
      workerPayload: input.payload
    });
  } catch (error) {
    delivery = {
      attempted: false,
      webhookStatus: "failed",
      sourceReady: true,
      endpointHash: job.provider.endpointHash,
      failureStage: "queue-dispatch",
      errorCode: error instanceof SenaEnterpriseError ? error.code : "queue_dispatch_setup_failed",
      errorHash: webhookErrorHash(error)
    };
  }
  // Merge delivery evidence into the current durable record. A receiver may
  // already have advanced queued -> running -> succeeded before fetch returns;
  // never overwrite that lifecycle with the stale pre-dispatch job value.
  const queuedJob = await finalizeServerJobQueueDelivery(job.id, delivery);
  if (delivery.webhookStatus === "failed") {
    throw new SenaEnterpriseError(
      "SENA server job queue dispatch failed.",
      503,
      "server_job_queue_dispatch_failed"
    );
  }
  return queuedJob;
}

export function serverJobHeaders(job: SenaEnterpriseServerJob): HeadersInit {
  return {
    "x-sena-server-job-id": job.id,
    "x-sena-server-job-kind": job.kind,
    "x-sena-server-job-status": job.status,
    "x-sena-job-queue-provider": job.provider.mode,
    "x-sena-job-payload-sha256": job.payloadSha256,
    "x-sena-job-queue-delivery": job.delivery.webhookStatus,
    ...(job.delivery.httpStatus ? { "x-sena-job-queue-http-status": String(job.delivery.httpStatus) } : {})
  };
}
