import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { senaProductionPosture } from "./auth-config";
import {
  envValue,
  now,
  productionEvidenceTimestampConfigured,
  productionEvidenceTimestampEvidenceValue,
  sha256Text
} from "./ops-runtime";
import {
  serverJobQueueStatus,
  serverJobStoreRuntime
} from "./server-job-queue";

export type SenaEnterpriseServerJobWorkerContract = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerContract;
  generatedAt: string;
  status: "pass" | "review";
  productionReady: boolean;
  provider: {
    queueConfigured: boolean;
    queueProductionReady: boolean;
    queueMode: string;
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
    runbookConfigured: boolean;
    callbackConfigured: boolean;
    heartbeatConfirmed: boolean;
    heartbeatArtifactHashConfigured: boolean;
    heartbeatVerifiedAtConfigured: boolean;
    callbackUrlHash?: string;
    runbookUrlHash?: string;
    heartbeatArtifactSha256?: string;
    heartbeatVerifiedAt?: string;
    callbackUrlValueExcluded: true;
    runbookUrlValueExcluded: true;
    ownerValueExcluded: true;
  };
  contract: {
    queuePayloadSchema: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhook;
    receiptSchema: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJob;
    statusUpdateSchema: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobStatusUpdate;
    statusListSchema: typeof SENA_SCHEMA_VERSIONS.enterpriseServerJobList;
    statusCallback: "/api/sena/ops/jobs";
    acceptedActions: ["mark-running", "mark-succeeded", "mark-failed", "retry", "dead-letter"];
    acceptedWorkerActions: ["run-import", "run-analysis", "run-publication-export", "run-reliability", "run-validation"];
    payloadPolicy: "project-or-upload-pointer-default";
    inlinePayloadAllowed: false;
    inlinePayloadPolicy: "disabled";
    legacyInlineEnvEffect: "none-deprecated";
    /** Legacy v1 key retained as a null tombstone; no environment value enables inline custody. */
    inlinePayloadRequiresExplicitEnv: null;
    rawPayloadPersistedInJobStore: false;
    retryAndDeadLetterPolicy: "local-max-attempts-with-operator-force-retry";
    retryDispatchPolicy: "local-polling-only";
    pushProviderRetryPolicy: "provider-native-or-resubmit";
    parseWarningDisclosurePolicy: "run-import-and-run-reliability-must-report-parse-repair-warnings";
    uploadWarningCountSemantics: "unset-until-a-parser-reports";
    uploadWarningsCallbackField: "uploadWarnings";
  };
  evidence: string[];
  missing: string[];
};

export type SenaEnterpriseServerJobWorkerContractReadiness = {
  required: boolean;
  confirmed: boolean;
  artifactHash?: string;
  verifiedAt?: string;
  artifactHashConfigured: boolean;
  verifiedAtConfigured: boolean;
  evidence: string[];
};

function booleanEnv(key: string) {
  const value = envValue(key)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function validSha256(value: string | undefined) {
  return Boolean(value && /^[a-f0-9]{64}$/i.test(value));
}

function validIsoTimestamp(value: string | undefined) {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= Date.now() + 60_000;
}

function hashedUrlEvidence(key: string) {
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

// Production posture is answered by senaProductionPosture() (auth-config.ts),
// never re-derived here: re-derivation is what let the password-reset interlock
// drift onto a NODE_ENV-only test and fail open (f5d94fa). The site-local
// opt-in flag is the only term this gate adds on top.
export function serverJobWorkerContractRequired() {
  return booleanEnv("SENA_JOB_WORKER_CONTRACT_REQUIRED") || senaProductionPosture();
}

export function serverJobWorkerContractReadiness(): SenaEnterpriseServerJobWorkerContractReadiness {
  const artifactHash = envValue("SENA_JOB_WORKER_CONTRACT_ARTIFACT_SHA256");
  const verifiedAt = envValue("SENA_JOB_WORKER_CONTRACT_VERIFIED_AT");
  const artifactHashConfigured = validSha256(artifactHash);
  const verifiedAtConfigured = productionEvidenceTimestampConfigured(verifiedAt);
  const artifactValidationPassed = envValue("SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION") === "pass";
  const required = serverJobWorkerContractRequired();
  const confirmed = booleanEnv("SENA_JOB_WORKER_CONTRACT_CONFIRMED") &&
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
      `serverJobWorkerContractRequired=${required}`,
      `serverJobWorkerContractConfirmed=${confirmed}`,
      `serverJobWorkerContractExplicitlyRequired=${booleanEnv("SENA_JOB_WORKER_CONTRACT_REQUIRED")}`,
      `serverJobWorkerContractProductionRuntime=${process.env.NODE_ENV === "production"}`,
      `serverJobWorkerContractProductionPerformancePathRequired=${booleanEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH")}`,
      `serverJobWorkerContractProductionEvidenceManifestRequired=${booleanEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED")}`,
      `serverJobWorkerContractSaasOperatingModelApproved=${booleanEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED")}`,
      `serverJobWorkerContractArtifactSha256=${artifactHashConfigured ? "present" : "missing-or-invalid"}`,
      `serverJobWorkerContractVerifiedAt=${productionEvidenceTimestampEvidenceValue(verifiedAt)}`,
      `serverJobWorkerContractArtifactValidation=${artifactValidationPassed ? "pass" : "missing-or-invalid"}`,
      `serverJobWorkerContractSchema=${SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerContract}`,
      "serverJobWorkerContractCommand=npm run sena:jobs:worker-contract",
      "serverJobWorkerContractChecks=managed-queue|postgres-status-store|callback|owner|runbook|heartbeat",
      "serverJobWorkerContractSource=server-job-worker-contract"
    ]
  };
}

export function getEnterpriseServerJobWorkerContract(): SenaEnterpriseServerJobWorkerContract {
  const generatedAt = now();
  const queue = serverJobQueueStatus();
  const store = serverJobStoreRuntime();
  const runtime = envValue("SENA_JOB_WORKER_RUNTIME") ?? "not-configured";
  const ownerConfigured = Boolean(envValue("SENA_JOB_WORKER_OWNER") ?? envValue("SENA_ALERTING_OWNER"));
  const callbackUrlHash = hashedUrlEvidence("SENA_JOB_WORKER_CALLBACK_URL");
  const runbookUrlHash = hashedUrlEvidence("SENA_JOB_WORKER_RUNBOOK_URL");
  const heartbeatConfirmed = booleanEnv("SENA_JOB_WORKER_HEARTBEAT_CONFIRMED");
  const heartbeatArtifactSha256 = envValue("SENA_JOB_WORKER_HEARTBEAT_SHA256");
  const heartbeatVerifiedAt = envValue("SENA_JOB_WORKER_HEARTBEAT_VERIFIED_AT");
  const heartbeatArtifactHashConfigured = validSha256(heartbeatArtifactSha256);
  const heartbeatVerifiedAtConfigured = validIsoTimestamp(heartbeatVerifiedAt);

  const requirements = [
    [queue.productionReady, "SENA_JOB_QUEUE_ADAPTER=managed, webhook, or qstash with a destination URL, SENA_JOB_QUEUE_SECRET, and any provider token required by the adapter"],
    [store.activeStore === "postgres-table", "SENA_ENTERPRISE_STATE_STORE=postgres with configured Postgres adapter"],
    [Boolean(envValue("SENA_OPS_TOKEN")), "SENA_OPS_TOKEN"],
    [runtime !== "not-configured", "SENA_JOB_WORKER_RUNTIME"],
    [Boolean(callbackUrlHash), "SENA_JOB_WORKER_CALLBACK_URL"],
    [ownerConfigured, "SENA_JOB_WORKER_OWNER or SENA_ALERTING_OWNER"],
    [Boolean(runbookUrlHash), "SENA_JOB_WORKER_RUNBOOK_URL"],
    [heartbeatConfirmed, "SENA_JOB_WORKER_HEARTBEAT_CONFIRMED=1"],
    [heartbeatArtifactHashConfigured, "SENA_JOB_WORKER_HEARTBEAT_SHA256"],
    [heartbeatVerifiedAtConfigured, "SENA_JOB_WORKER_HEARTBEAT_VERIFIED_AT"]
  ] as const;
  const missing = requirements
    .filter(([ok]) => !ok)
    .map(([, label]) => label);
  const productionReady = missing.length === 0;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerContract,
    generatedAt,
    status: productionReady ? "pass" : "review",
    productionReady,
    provider: {
      queueConfigured: queue.configured,
      queueProductionReady: queue.productionReady,
      queueMode: queue.mode,
      queueEndpointHash: queue.endpointHash,
      queueSecretConfigured: queue.secretConfigured,
      queueEndpointValueExcluded: true,
      queueSecretValuesExcluded: true
    },
    statusStore: {
      activeStore: store.activeStore,
      postgresConfigured: store.postgresConfigured,
      postgresPrimaryActive: store.postgresPrimaryActive,
      indexed: store.activeStore === "postgres-table"
    },
    worker: {
      runtime,
      ownerConfigured,
      runbookConfigured: Boolean(runbookUrlHash),
      callbackConfigured: Boolean(callbackUrlHash),
      heartbeatConfirmed,
      heartbeatArtifactHashConfigured,
      heartbeatVerifiedAtConfigured,
      callbackUrlHash,
      runbookUrlHash,
      heartbeatArtifactSha256: heartbeatArtifactHashConfigured ? heartbeatArtifactSha256?.toLowerCase() : undefined,
      heartbeatVerifiedAt: heartbeatVerifiedAtConfigured ? heartbeatVerifiedAt : undefined,
      callbackUrlValueExcluded: true,
      runbookUrlValueExcluded: true,
      ownerValueExcluded: true
    },
    contract: {
      queuePayloadSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueWebhook,
      receiptSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJob,
      statusUpdateSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobStatusUpdate,
      statusListSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobList,
      statusCallback: "/api/sena/ops/jobs",
      acceptedActions: ["mark-running", "mark-succeeded", "mark-failed", "retry", "dead-letter"],
      acceptedWorkerActions: ["run-import", "run-analysis", "run-publication-export", "run-reliability", "run-validation"],
      payloadPolicy: "project-or-upload-pointer-default",
      inlinePayloadAllowed: false,
      inlinePayloadPolicy: "disabled",
      legacyInlineEnvEffect: "none-deprecated",
      inlinePayloadRequiresExplicitEnv: null,
      rawPayloadPersistedInJobStore: false,
      retryAndDeadLetterPolicy: "local-max-attempts-with-operator-force-retry",
      retryDispatchPolicy: "local-polling-only",
      pushProviderRetryPolicy: "provider-native-or-resubmit",
      // H10: an external worker that parses queued files (run-import,
      // run-reliability) must report parse-repair warning counts — ragged-row
      // disclosure included — via the status callback's additive
      // `uploadWarnings` field (counts only, validated against the job's own
      // uploadIds). Until the worker reports, the registry's warningCount
      // stays unset: unset asserts nothing, 0 asserts "parsed, clean".
      parseWarningDisclosurePolicy: "run-import-and-run-reliability-must-report-parse-repair-warnings",
      uploadWarningCountSemantics: "unset-until-a-parser-reports",
      uploadWarningsCallbackField: "uploadWarnings"
    },
    evidence: [
      ...queue.evidence,
      `workerRuntime=${runtime}`,
      `workerOwner=${ownerConfigured ? "configured" : "missing"}`,
      `workerCallback=${callbackUrlHash ? "configured" : "missing"}`,
      `workerCallbackUrlHash=${callbackUrlHash ? "present" : "missing"}`,
      "workerCallbackUrlValue=excluded",
      `workerRunbook=${runbookUrlHash ? "configured" : "missing"}`,
      `workerRunbookUrlHash=${runbookUrlHash ? "present" : "missing"}`,
      "workerRunbookUrlValue=excluded",
      `workerHeartbeatConfirmed=${heartbeatConfirmed}`,
      `workerHeartbeatArtifactSha256=${heartbeatArtifactHashConfigured ? "present" : "missing"}`,
      `workerHeartbeatVerifiedAt=${heartbeatVerifiedAtConfigured ? "configured" : "missing"}`,
      "statusCallback=/api/sena/ops/jobs",
      "workerActions=mark-running|mark-succeeded|mark-failed|retry|dead-letter",
      "workerJobActions=run-import|run-analysis|run-publication-export|run-reliability|run-validation",
      "workerInlinePayloadCustody=durable-pointers-only",
      "workerInlinePayloadAllowed=false",
      "workerInlinePayloadPolicy=disabled",
      "workerLegacyInlineEnvEffect=none-deprecated",
      "workerRetryDispatchPolicy=local-polling-only",
      "workerPushProviderRetryPolicy=provider-native-or-resubmit",
      "rawPayloadPersistedInJobStore=false",
      "parseWarningDisclosurePolicy=run-import-and-run-reliability-must-report-parse-repair-warnings",
      "uploadWarningCountSemantics=unset-until-a-parser-reports",
      "uploadWarningsCallbackField=uploadWarnings"
    ],
    missing
  };
}
