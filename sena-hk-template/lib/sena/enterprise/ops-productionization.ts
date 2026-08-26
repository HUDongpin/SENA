import {
  enterprisePostgresProbeReadiness,
  enterprisePostgresSchemaContractReadiness,
  resolveEnterprisePostgresConfig,
  type SenaEnterprisePostgresConfig
} from "../enterprise-postgres";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  envValue,
  now,
  productionEvidenceTimestampConfigured,
  productionEvidenceTimestampEvidenceValue,
  sha256Text
} from "./ops-runtime";
import type { SenaEnterpriseDeploymentReadinessItem } from "./ops-deployment-readiness";
import type { SenaEnterpriseOpsStatus } from "./ops-status";
import { auditStoreRuntime } from "./ops-audit";
import { conferenceLoadRehearsalProductionEvidenceReadiness } from "./conference-load-rehearsal";
import { enterpriseCdnContractReadiness, enterpriseCdnProbeReadiness } from "./cdn-verification";
import { isSenaFullGitObjectId } from "./performance-build-identity.mjs";
import {
  enterpriseAnalysisRunRegistryRuntime,
  enterpriseImportRunRegistryRuntime,
  enterpriseUploadRegistryRuntime,
  summarizeEnterpriseUploadObjectStorageCustody,
  type SenaEnterpriseUploadObjectStorageCustodySummary
} from "./import-analysis";
import { enterpriseReliabilityRunRegistryRuntime } from "./reliability-runs";
import { enterpriseValidationRunRegistryRuntime } from "./validation-runs";
import { enterpriseExpertReviewRegistryRuntime } from "./expert-review";
import { enterpriseObjectStorageContractReadiness, enterpriseObjectStorageProbeReadiness } from "./object-storage-adapter";
import {
  enterpriseObservabilityContractReadiness,
  enterpriseObservabilityProbeReadiness,
  enterpriseObservabilityReadiness,
  enterpriseObservabilitySampleStoreRuntime
} from "./ops-observability";
import { serverJobQueueContractReadiness, serverJobQueueProbeReadiness, serverJobQueueStatus, serverJobStoreRuntime } from "./server-job-queue";
import { getEnterpriseServerJobWorkerContract, serverJobWorkerContractReadiness } from "./server-job-worker-contract";

export const productionPerformancePathItemIds = [
  "production-postgres-state",
  "production-runtime-header",
  "production-object-storage",
  "production-cdn-compression",
  "production-server-job-queue",
  "production-observability",
  "production-performance-budget",
  "production-conference-load-rehearsal"
] as const;

export type SenaEnterpriseProductionPerformancePathItemId = (typeof productionPerformancePathItemIds)[number];

export type SenaEnterpriseProductionPerformancePathItem = SenaEnterpriseDeploymentReadinessItem & {
  id: SenaEnterpriseProductionPerformancePathItemId;
};

export type SenaEnterpriseProductionPerformancePath = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseProductionPerformancePath;
  generatedAt: string;
  status: "pass" | "review";
  summary: {
    passed: number;
    review: number;
    blockers: SenaEnterpriseProductionPerformancePathItemId[];
  };
  cacheInvariantsReference: "../uals-team-shared/references/cache-invariants.md";
  posture: {
    localFileStoreIsProductionBackend: false;
    requiredScalePath: "vercel-runtime-header-postgres-object-storage-cdn-job-queue-observability";
  };
  items: SenaEnterpriseProductionPerformancePathItem[];
};

function booleanEnv(key: string) {
  const value = envValue(key)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function validSha256(value: string | undefined): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

const vercelProductionPreflightExpectedHost = "www.sena.hk";
const productionRuntimeHeaderValues = ["enterprise-neon", "enterprise-postgres"] as const;

function validProductionRuntimeHeader(value: string | undefined) {
  return productionRuntimeHeaderValues.some((expected) => expected === value);
}

function validHttpSuccessStatus(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return false;
  const status = Number(value);
  return status >= 200 && status < 400;
}

function vercelProductionPreflightTargetHostReady(value: string | undefined) {
  return validSha256(value) && value.toLowerCase() === sha256Text(vercelProductionPreflightExpectedHost);
}

function positiveIntegerEnv(key: string) {
  const parsed = Number(envValue(key));
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
}

function hashedUrlEvidence(key: string) {
  const value = envValue(key);
  if (!value) return [`${key}=missing`];
  let host = "invalid-url";
  try {
    host = new URL(value).host;
  } catch {
    host = "invalid-url";
  }
  return [
    `${key}=configured`,
    `${key}HostHash=${sha256Text(host) ?? "missing"}`,
    `${key}Value=excluded`
  ];
}

function postgresEvidence(config: SenaEnterprisePostgresConfig, primaryStateRuntime: SenaEnterpriseOpsStatus["storage"]["primaryStateRuntime"]) {
  return [
    `adapter=${config.adapter ?? "file"}`,
    `configured=${config.configured}`,
    `stateStore=${primaryStateRuntime.mode}`,
    `activePrimary=${primaryStateRuntime.activePrimary}`,
    `postgresPrimaryRequested=${primaryStateRuntime.postgresPrimaryRequested}`,
    `url=${config.urlEnvName ?? "missing"}`,
    `connectionHash=${config.connectionHash ? "present" : "missing"}`,
    `missing=${config.missingEnv.join("|") || "none"}`,
    "localFileStoreProductionBackend=false"
  ];
}

export function buildEnterpriseProductionPerformancePath(input: {
  opsStatus: SenaEnterpriseOpsStatus;
  postgresConfig?: SenaEnterprisePostgresConfig;
  objectStorageReady: boolean;
  alertReady: boolean;
  uploadObjectStorageCustody?: SenaEnterpriseUploadObjectStorageCustodySummary;
}): SenaEnterpriseProductionPerformancePath {
  const postgresConfig = input.postgresConfig ?? resolveEnterprisePostgresConfig();
  const postgresPrimaryReady = postgresConfig.configured && input.opsStatus.storage.primaryStateRuntime.activePrimary === "postgres";
  const uploadRegistryRuntime = enterpriseUploadRegistryRuntime();
  const importRunRegistryRuntime = enterpriseImportRunRegistryRuntime();
  const analysisRunRegistryRuntime = enterpriseAnalysisRunRegistryRuntime();
  const reliabilityRunRegistryRuntime = enterpriseReliabilityRunRegistryRuntime();
  const validationRunRegistryRuntime = enterpriseValidationRunRegistryRuntime();
  const expertReviewRegistryRuntime = enterpriseExpertReviewRegistryRuntime();
  const postgresSchemaContract = enterprisePostgresSchemaContractReadiness();
  const postgresProbe = enterprisePostgresProbeReadiness();
  const postgresSchemaContractReady = !postgresSchemaContract.required || postgresSchemaContract.confirmed;
  const postgresReady = postgresProbe.required
    ? postgresPrimaryReady && postgresSchemaContractReady && postgresProbe.confirmed
    : postgresPrimaryReady && postgresSchemaContractReady;
  const vercelPreflightArtifactHash = envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_ARTIFACT_SHA256");
  const vercelPreflightVerifiedAt = envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_VERIFIED_AT");
  const vercelPreflightTargetHostHash = envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_TARGET_HOST_SHA256");
  const vercelPreflightDeploymentUrlHash = envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_DEPLOYMENT_URL_SHA256");
  const vercelPreflightHttpStatus = envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_HTTP_STATUS");
  const vercelPreflightRuntimeHeader = envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_RUNTIME_HEADER");
  const vercelPreflightMetadataReady =
    vercelProductionPreflightTargetHostReady(vercelPreflightTargetHostHash) &&
    validSha256(vercelPreflightDeploymentUrlHash) &&
    validHttpSuccessStatus(vercelPreflightHttpStatus) &&
    validProductionRuntimeHeader(vercelPreflightRuntimeHeader);
  const vercelRuntimeHeaderReady = booleanEnv("SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED") &&
    validSha256(vercelPreflightArtifactHash) &&
    productionEvidenceTimestampConfigured(vercelPreflightVerifiedAt) &&
    vercelPreflightMetadataReady;
  const cdnEnabled = booleanEnv("SENA_CDN_ENABLED") || Boolean(envValue("SENA_CDN_PROVIDER")) || Boolean(envValue("SENA_CDN_URL"));
  const cdnCompressionConfirmed = booleanEnv("SENA_CDN_COMPRESSION_CONFIRMED");
  const cdnContract = enterpriseCdnContractReadiness();
  const cdnProbe = enterpriseCdnProbeReadiness();
  const cdnContractReady = !cdnContract.required || cdnContract.confirmed;
  const cdnCompressionReady = cdnProbe.required
    ? cdnContractReady && cdnProbe.confirmed
    : cdnContractReady && (cdnProbe.confirmed || cdnCompressionConfirmed);
  const staticAssetCacheSeconds = positiveIntegerEnv("SENA_CDN_STATIC_ASSET_CACHE_SECONDS");
  const staticAssetCacheReady = staticAssetCacheSeconds === undefined || staticAssetCacheSeconds >= 31_536_000;
  const objectStorageContract = enterpriseObjectStorageContractReadiness();
  const objectStorageProbe = enterpriseObjectStorageProbeReadiness();
  const objectStorageContractReady = !objectStorageContract.required || objectStorageContract.confirmed;
  const uploadObjectStorageCustody = input.uploadObjectStorageCustody ?? summarizeEnterpriseUploadObjectStorageCustody();
  const objectStorageProviderReady = objectStorageProbe.required
    ? objectStorageContractReady && input.objectStorageReady && objectStorageProbe.confirmed
    : objectStorageContractReady && input.objectStorageReady;
  const objectStorageReady = objectStorageProviderReady && uploadObjectStorageCustody.ready;
  const queueStatus = serverJobQueueStatus();
  const queueStoreRuntime = serverJobStoreRuntime();
  const queueStatusStoreReady = queueStoreRuntime.activeStore === "postgres-table";
  const workerContract = getEnterpriseServerJobWorkerContract();
  const workerContractArtifact = serverJobWorkerContractReadiness();
  const queueContract = serverJobQueueContractReadiness();
  const queueProbe = serverJobQueueProbeReadiness();
  const queueReady = queueStatus.productionReady &&
    queueStatusStoreReady &&
    workerContract.productionReady &&
    (!workerContractArtifact.required || workerContractArtifact.confirmed) &&
    (!queueContract.required || queueContract.confirmed) &&
    (!queueProbe.required || queueProbe.confirmed);
  const auditRuntime = auditStoreRuntime();
  const observability = enterpriseObservabilityReadiness();
  const observabilityContract = enterpriseObservabilityContractReadiness();
  const observabilityProbe = enterpriseObservabilityProbeReadiness();
  const observabilitySampleStore = enterpriseObservabilitySampleStoreRuntime();
  const observabilityReady = input.opsStatus.deployment.opsTokenConfigured &&
    input.alertReady &&
    Boolean(envValue("SENA_ALERTING_OWNER")) &&
    auditRuntime.activeStore === "postgres-table" &&
    observabilitySampleStore.activeStore === "postgres-table" &&
    observability.productionReady;
  const performanceBudgetArtifactHash = envValue("SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256");
  const performanceBudgetVerifiedAt = envValue("SENA_PERFORMANCE_BUDGET_VERIFIED_AT");
  const performanceBudgetSchemaCurrent = envValue("SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION") ===
    SENA_SCHEMA_VERSIONS.enterpriseProductionPerformanceBudget;
  const performanceBudgetMeasuredArtifactSetReady = validSha256(
    envValue("SENA_PERFORMANCE_BUDGET_MEASURED_ARTIFACT_SET_SHA256")
  );
  const performanceBudgetRuntimeContractReady = performanceBudgetSchemaCurrent &&
    performanceBudgetMeasuredArtifactSetReady;
  const performanceBudgetBuildIdentityReady = validSha256(envValue("SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256")) &&
    isSenaFullGitObjectId(envValue("SENA_PERFORMANCE_BUDGET_GIT_COMMIT")) &&
    envValue("SENA_PERFORMANCE_BUDGET_GIT_DIRTY") === "false" &&
    validSha256(envValue("SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256")) &&
    envValue("SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE") === "git-clean-worktree";
  const performanceBudgetReady = booleanEnv("SENA_PERFORMANCE_BUDGET_CONFIRMED") &&
    validSha256(performanceBudgetArtifactHash) &&
    productionEvidenceTimestampConfigured(performanceBudgetVerifiedAt) &&
    performanceBudgetRuntimeContractReady &&
    performanceBudgetBuildIdentityReady;
  const conferenceLoad = conferenceLoadRehearsalProductionEvidenceReadiness();

  const items: SenaEnterpriseProductionPerformancePathItem[] = [
    {
      id: "production-postgres-state",
      label: "Postgres-backed enterprise state configured",
      severity: "blocking",
      status: postgresReady ? "pass" : "review",
      evidence: [
        ...postgresEvidence(postgresConfig, input.opsStatus.storage.primaryStateRuntime),
        ...postgresSchemaContract.evidence,
        ...postgresProbe.evidence,
        ...uploadRegistryRuntime.evidence,
        ...importRunRegistryRuntime.evidence,
        ...analysisRunRegistryRuntime.evidence,
        ...reliabilityRunRegistryRuntime.evidence,
        ...validationRunRegistryRuntime.evidence,
        ...expertReviewRegistryRuntime.evidence,
        `opsStorageEngine=${input.opsStatus.storage.engine}`,
        "fileBackend=.sena-enterprise/enterprise-db.json",
        "indexedUploadTable=sena_enterprise_uploads",
        "indexedImportRunTable=sena_enterprise_import_runs",
        "indexedAnalysisRunTable=sena_enterprise_analysis_runs",
        "indexedReliabilityRunTable=sena_enterprise_reliability_runs",
        "indexedValidationRunTable=sena_enterprise_validation_runs",
        "indexedExpertReviewTable=sena_enterprise_expert_reviews",
        "productionPolicy=file-backend-is-research-pilot-only",
        "liveProbe=CREATE_TABLE|INSERT|SELECT|DELETE"
      ],
      nextAction: postgresReady
        ? "Keep migrated enterprise state operations on the async Postgres primary runtime and continue expanding remaining file-backed domains."
        : postgresSchemaContract.required && !postgresSchemaContract.confirmed
          ? "Run npm run sena:postgres:schema-contract, archive the redacted DDL/index contract artifact, and set the Postgres schema-contract confirmation env values before relying on live probe evidence."
        : postgresProbe.required && !postgresProbe.confirmed
          ? "Run npm run sena:postgres:verify against the managed database, archive the redacted probe artifact, and set SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_CONFIRMED with SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_SHA256, SENA_ENTERPRISE_POSTGRES_PROBE_VERIFIED_AT, and SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_VALIDATION=pass."
        : "Configure SENA_ENTERPRISE_DB_ADAPTER=postgres or neon, a Postgres URL, and SENA_ENTERPRISE_STATE_STORE=postgres before production traffic; do not use .sena-enterprise/enterprise-db.json as the production multi-user state store."
    },
    {
      id: "production-runtime-header",
      label: "Vercel runtime header confirms managed state",
      severity: "blocking",
      status: vercelRuntimeHeaderReady ? "pass" : "review",
      evidence: [
        `vercelPreflightConfirmed=${booleanEnv("SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED")}`,
        `vercelPreflightArtifactSha256=${validSha256(vercelPreflightArtifactHash) ? "present" : "missing-or-invalid"}`,
        `vercelPreflightVerifiedAt=${productionEvidenceTimestampEvidenceValue(vercelPreflightVerifiedAt)}`,
        `vercelPreflightTargetHostSha256=${vercelProductionPreflightTargetHostReady(vercelPreflightTargetHostHash) ? "www.sena.hk" : "missing-or-mismatch"}`,
        `vercelPreflightDeploymentUrlSha256=${validSha256(vercelPreflightDeploymentUrlHash) ? "present" : "missing-or-invalid"}`,
        `vercelPreflightHttpStatus=${validHttpSuccessStatus(vercelPreflightHttpStatus) ? "success" : "missing-or-non-success"}`,
        `vercelPreflightRuntimeHeader=${validProductionRuntimeHeader(vercelPreflightRuntimeHeader) ? vercelPreflightRuntimeHeader : "missing-or-local"}`,
        `artifactSchema=${SENA_SCHEMA_VERSIONS.enterpriseVercelProductionPreflight}`,
        "preflightCommand=npm run sena:vercel:preflight",
        "preflightChecks=deployment-ready|domain-configured|env-list|live-http|runtime-header",
        "expectedRuntimeHeader=enterprise-neon|enterprise-postgres",
        "localRuntimeHeader=enterprise-local",
        "runtimeHeaderValues=excluded",
        "localFileStoreProductionBackend=false"
      ],
      nextAction: vercelRuntimeHeaderReady
        ? "Keep the passed Vercel production preflight artifact bound to this release so www.sena.hk proves enterprise-neon or enterprise-postgres at the response-header layer."
        : "After configuring Postgres primary state on Vercel, redeploy, run npm run sena:vercel:preflight against www.sena.hk, archive the passed artifact, and bind SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED with its sha256, verified-at timestamp, target host hash, deployment URL hash, HTTP status, and runtime header."
    },
    {
      id: "production-object-storage",
      label: "Managed object storage configured for uploads",
      severity: "blocking",
      status: objectStorageReady ? "pass" : "review",
      evidence: [
        `objectStorageNative=${input.opsStatus.deployment.objectStorageNativeConfigured ? "configured" : "missing"}`,
        `objectStorageWebhook=${input.opsStatus.deployment.objectStorageWebhookConfigured ? "configured" : "missing"}`,
        ...objectStorageContract.evidence,
        ...objectStorageProbe.evidence,
        ...uploadObjectStorageCustody.evidence,
        `uploads=${input.opsStatus.counts.uploads}`,
        `uploadCustodyTotal=${uploadObjectStorageCustody.totalUploads}`,
        `uploadCustodyDelivered=${uploadObjectStorageCustody.delivered}`,
        `uploadCustodyPending=${uploadObjectStorageCustody.pending}`,
        `uploadCustodyFailed=${uploadObjectStorageCustody.failed}`,
        `uploadCustodySkipped=${uploadObjectStorageCustody.skipped}`,
        `uploadCustodyPendingReview=${uploadObjectStorageCustody.pendingReview}`,
        `uploadCustodyEligibleUndelivered=${uploadObjectStorageCustody.eligibleUndelivered}`,
        "localUploadBlobs=research-pilot-cache",
        "required=managed-object-storage-with-scan-retention",
        "nativeEnv=SENA_OBJECT_STORAGE_ADAPTER|SENA_OBJECT_STORAGE_ENDPOINT|SENA_OBJECT_STORAGE_BUCKET",
        "liveProbe=PUT|HEAD|DELETE"
      ],
      nextAction: objectStorageReady
        ? "Keep upload blob delivery connected to managed object storage with scan, retention, and restore ownership."
        : objectStorageProviderReady && !uploadObjectStorageCustody.ready
          ? "Run POST /api/sena/uploads with action=deliver-object-storage for every passed upload, resolve failed deliveries and review-held uploads, then archive the object-storage custody evidence before production traffic."
          : objectStorageContract.required && !objectStorageContract.confirmed
          ? "Run npm run sena:object-storage:contract, archive the redacted namespace/custody contract artifact, and set SENA_OBJECT_STORAGE_CONTRACT_CONFIRMED with SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_SHA256, SENA_OBJECT_STORAGE_CONTRACT_VERIFIED_AT, and SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_VALIDATION=pass before relying on live probe evidence."
          : objectStorageProbe.required && !objectStorageProbe.confirmed
          ? "Run npm run sena:object-storage:verify against the native bucket, archive the redacted probe artifact, and set SENA_OBJECT_STORAGE_LIVE_PROBE_CONFIRMED with SENA_OBJECT_STORAGE_PROBE_ARTIFACT_SHA256, SENA_OBJECT_STORAGE_PROBE_VERIFIED_AT, and SENA_OBJECT_STORAGE_PROBE_ARTIFACT_VALIDATION=pass."
          : "Set SENA_OBJECT_STORAGE_ADAPTER with native object-storage credentials, or configure SENA_OBJECT_STORAGE_WEBHOOK_URL and SENA_OBJECT_STORAGE_WEBHOOK_SECRET."
    },
    {
      id: "production-cdn-compression",
      label: "CDN and compression confirmed",
      severity: "blocking",
      status: cdnEnabled && cdnCompressionReady && staticAssetCacheReady ? "pass" : "review",
      evidence: [
        `cdnEnabled=${cdnEnabled}`,
        `provider=${envValue("SENA_CDN_PROVIDER") ?? "missing"}`,
        ...hashedUrlEvidence("SENA_CDN_URL"),
        `compressionConfirmed=${cdnCompressionConfirmed}`,
        ...cdnContract.evidence,
        ...cdnProbe.evidence,
        `staticAssetCacheSeconds=${staticAssetCacheSeconds ?? "platform-default"}`,
        "htmlCompressionRequired=gzip-or-brotli",
        "staticAssets=immutable-cache-required"
      ],
      nextAction: cdnEnabled && cdnCompressionReady && staticAssetCacheReady
        ? "Keep CDN live-probe or compression confirmation plus immutable _next/static caching in the release checklist."
        : cdnContract.required && !cdnContract.confirmed
          ? "Run npm run sena:cdn:contract, archive the redacted compression/cache contract artifact, and set SENA_CDN_CONTRACT_CONFIRMED with SENA_CDN_CONTRACT_ARTIFACT_SHA256, SENA_CDN_CONTRACT_VERIFIED_AT, and SENA_CDN_CONTRACT_ARTIFACT_VALIDATION=pass before relying on live CDN probe evidence."
        : cdnProbe.required && !cdnProbe.confirmed
          ? "Run npm run sena:cdn:verify against the deployed CDN, archive the probe artifact, and set SENA_CDN_LIVE_PROBE_CONFIRMED with SENA_CDN_PROBE_ARTIFACT_SHA256, SENA_CDN_PROBE_VERIFIED_AT, and SENA_CDN_PROBE_ARTIFACT_VALIDATION=pass."
          : "Configure a CDN or reverse proxy with gzip/brotli for HTML/JS/CSS and immutable caching for _next/static before conference or production traffic."
    },
    {
      id: "production-server-job-queue",
      label: "Server job queue configured for heavy work",
      severity: "blocking",
      status: queueReady ? "pass" : "review",
      evidence: [
        ...queueStatus.evidence,
        ...queueStoreRuntime.evidence,
        ...workerContract.evidence,
        ...workerContractArtifact.evidence,
        ...queueContract.evidence,
        ...queueProbe.evidence,
        "heavyJobs=analysis-import-publication-export-reliability-validation",
        "statusCallbacks=/api/sena/ops/jobs",
        "workerContractApi=/api/sena/ops/jobs/worker-contract",
        "queueProbeApi=/api/sena/ops/jobs/probe",
        "liveProbe=signed-synthetic-queue-payload",
        "retryAndDlq=worker-status-api",
        "localSynchronousApi=research-pilot-only",
        "statusStoreRequired=postgres-indexed-table"
      ],
      nextAction: queueReady
        ? "Route heavy analysis/export jobs through the managed queue, retain a nonce-bound external-worker authenticated callback receipt, and monitor retry/dead-letter counts from the indexed Postgres job table."
        : !queueStatus.productionReady
          ? "Configure SENA_JOB_QUEUE_ADAPTER=managed, webhook, or qstash plus the required destination URL, SENA_JOB_QUEUE_SECRET, and provider token before allowing concurrent heavy analysis/export workloads."
          : !queueStatusStoreReady
            ? "Set SENA_ENTERPRISE_STATE_STORE=postgres with the configured Postgres adapter so server job status moves from enterprise-db.serverJobs into the indexed Postgres job table."
            : !workerContract.productionReady
              ? "Keep concurrent heavy analysis/export workloads blocked until a nonce-bound managed-queue to external-worker authenticated callback receipt exists; the same-process status-store self-test is insufficient."
              : workerContractArtifact.required && !workerContractArtifact.confirmed
                ? "Run npm run sena:jobs:worker-contract, archive the redacted worker contract artifact, and set SENA_JOB_WORKER_CONTRACT_CONFIRMED with SENA_JOB_WORKER_CONTRACT_ARTIFACT_SHA256, SENA_JOB_WORKER_CONTRACT_VERIFIED_AT, and SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION=pass before relying on live queue probe evidence."
                : queueContract.required && !queueContract.confirmed
                  ? "Run npm run sena:jobs:queue-contract, archive the redacted queue contract artifact, and set SENA_JOB_QUEUE_CONTRACT_CONFIRMED with SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256, SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT, and SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION=pass."
                  : "Run npm run sena:jobs:queue-verify against the managed queue, archive the redacted probe artifact, and set SENA_JOB_QUEUE_LIVE_PROBE_CONFIRMED with SENA_JOB_QUEUE_PROBE_ARTIFACT_SHA256, SENA_JOB_QUEUE_PROBE_VERIFIED_AT, and SENA_JOB_QUEUE_PROBE_ARTIFACT_VALIDATION=pass."
    },
    {
      id: "production-observability",
      label: "Observability and alert ownership configured",
      severity: "blocking",
      status: observabilityReady ? "pass" : "review",
      evidence: [
        ...auditRuntime.evidence,
        ...observability.evidence,
        ...observabilityProbe.evidence,
        ...observabilitySampleStore.evidence,
        `opsToken=${input.opsStatus.deployment.opsTokenConfigured ? "configured" : "missing"}`,
        `alertWebhook=${input.opsStatus.deployment.alertWebhookConfigured ? "configured" : "missing"}`,
        `alertingOwner=${envValue("SENA_ALERTING_OWNER") ? "configured" : "missing"}`,
        "metricsApi=/api/sena/ops/metrics",
        "observabilityApi=/api/sena/ops/observability",
        "observabilityProbeApi=/api/sena/ops/observability/probe",
        "alertsApi=/api/sena/ops/alerts",
        "readinessApi=/api/sena/ops/readiness"
      ],
      nextAction: observabilityReady
        ? "Keep metrics scraping, request-level SLI export, readiness probes, alert delivery, audit-table evidence, and ownership in the release gate."
        : auditRuntime.activeStore !== "postgres-table"
          ? "Set SENA_ENTERPRISE_STATE_STORE=postgres with the configured Postgres adapter so production audit events use the indexed audit table."
          : observabilitySampleStore.activeStore !== "postgres-table"
            ? "Set SENA_ENTERPRISE_STATE_STORE=postgres with the configured Postgres adapter so request-level SLI samples use the indexed observed-request table."
            : observabilityContract.required && !observabilityContract.confirmed
              ? "Run npm run sena:observability:contract, archive the redacted SLI/alerting/exporter contract artifact, and set SENA_OBSERVABILITY_CONTRACT_CONFIRMED with SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256, SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT, and SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION=pass before relying on live observability probe evidence."
              : observabilityProbe.required && !observabilityProbe.confirmed
                ? "Run npm run sena:observability:verify against the exporter, archive the redacted probe artifact, and set SENA_OBSERVABILITY_LIVE_PROBE_CONFIRMED with SENA_OBSERVABILITY_PROBE_ARTIFACT_SHA256, SENA_OBSERVABILITY_PROBE_VERIFIED_AT, and SENA_OBSERVABILITY_PROBE_ARTIFACT_VALIDATION=pass."
                : "Set SENA_OPS_TOKEN, SENA_ALERT_WEBHOOK_URL, SENA_ALERT_WEBHOOK_SECRET, SENA_ALERTING_OWNER, SENA_OBSERVABILITY_PROVIDER, SENA_OBSERVABILITY_EXPORTER_URL, SENA_OBSERVABILITY_EXPORTER_SECRET, SENA_OBSERVABILITY_DASHBOARD_URL, and SENA_OBSERVABILITY_RUNBOOK_URL before claiming production observability."
    },
    {
      id: "production-performance-budget",
      label: "Performance budget verification confirmed",
      severity: "blocking",
      status: performanceBudgetReady ? "pass" : "review",
      evidence: [
        `budgetConfirmed=${performanceBudgetReady}`,
        `budgetArtifactSha256=${validSha256(performanceBudgetArtifactHash) ? "present" : "missing-or-invalid"}`,
        `budgetVerifiedAt=${productionEvidenceTimestampEvidenceValue(performanceBudgetVerifiedAt)}`,
        `budgetRuntimeContractReady=${performanceBudgetRuntimeContractReady}`,
        `budgetSchemaCurrent=${performanceBudgetSchemaCurrent}`,
        `budgetMeasuredArtifactSetSha256=${performanceBudgetMeasuredArtifactSetReady ? "present" : "missing-or-invalid"}`,
        `budgetBuildIdentityReady=${performanceBudgetBuildIdentityReady}`,
        `budgetNextBuildIdSha256=${validSha256(envValue("SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256")) ? "present" : "missing-or-invalid"}`,
        `budgetGitCommit=${isSenaFullGitObjectId(envValue("SENA_PERFORMANCE_BUDGET_GIT_COMMIT")) ? "present" : "missing-or-invalid"}`,
        `budgetGitDirtyClean=${envValue("SENA_PERFORMANCE_BUDGET_GIT_DIRTY") === "false"}`,
        `budgetSourceCustodyMode=${envValue("SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE") || "missing"}`,
        `budgetPackageLockSha256=${validSha256(envValue("SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256")) ? "present" : "missing-or-invalid"}`,
        "script=npm run sena:performance:check",
        `artifactSchema=${SENA_SCHEMA_VERSIONS.enterpriseProductionPerformanceBudget}`,
        "conferenceTarget=50-users-30-minutes",
        "budgets=workspace-html-br,workspace-route-js-br,total-static-js-br"
      ],
      nextAction: performanceBudgetReady
        ? "Keep the performance budget script in release verification and update budgets deliberately."
        : !performanceBudgetRuntimeContractReady
          ? `Rebind the current ${SENA_SCHEMA_VERSIONS.enterpriseProductionPerformanceBudget} artifact through npm run sena:production-evidence:bind so SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION, SENA_PERFORMANCE_BUDGET_MEASURED_ARTIFACT_SET_SHA256, SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256, and the remaining clean build-identity tuple identify the validated runtime contract and exact measured output set.`
        : !performanceBudgetBuildIdentityReady
          ? "Run npm run build and npm run sena:performance:check from a clean Git tree, then use the binder to attach the complete build identity including SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE=git-clean-worktree before claiming the current production build meets the conference budget."
        : "Regenerate the current clean-build performance artifact, archive it, and use npm run sena:production-evidence:bind to bind the complete 10-key performance tuple; do not configure individual performance evidence keys by hand."
    },
    {
      id: "production-conference-load-rehearsal",
      label: "Conference load rehearsal verified",
      severity: "blocking",
      status: conferenceLoad.confirmed ? "pass" : "review",
      evidence: [
        ...conferenceLoad.evidence,
        `loadUsers=${Number.isFinite(conferenceLoad.users) ? conferenceLoad.users : "missing"}`,
        `loadDurationSeconds=${Number.isFinite(conferenceLoad.durationSeconds) ? conferenceLoad.durationSeconds : "missing"}`,
        `loadP95Ms=${Number.isFinite(conferenceLoad.p95Ms) ? conferenceLoad.p95Ms : "missing"}`,
        `loadErrorRatePercent=${Number.isFinite(conferenceLoad.errorRatePercent) ? conferenceLoad.errorRatePercent : "missing"}`,
        `artifactSchema=${SENA_SCHEMA_VERSIONS.enterpriseConferenceLoadRehearsal}`,
        "script=npm run sena:conference:load-check",
        "conferenceTarget=50-users-30-minutes",
        "targetDurationSeconds=1800"
      ],
      nextAction: conferenceLoad.confirmed
        ? "Keep the 50-user, 30-minute load rehearsal artifact and metadata archived with the release evidence."
        : "Run SENA_LOAD_REQUIRE_PRODUCTION_TARGET=1 SENA_LOAD_TARGET_USERS=50 SENA_LOAD_CONCURRENCY=50 SENA_LOAD_RAMP_SECONDS=120 SENA_LOAD_DURATION_SECONDS=1800 npm run sena:conference:load-check against the deployed URL, archive the artifact, and set the SENA_CONFERENCE_LOAD_REHEARSAL_* metadata before conference-scale handoff."
    }
  ];
  const blockers = items
    .filter((item) => item.status !== "pass")
    .map((item) => item.id);

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseProductionPerformancePath,
    generatedAt: now(),
    status: blockers.length === 0 ? "pass" : "review",
    summary: {
      passed: items.length - blockers.length,
      review: blockers.length,
      blockers
    },
    cacheInvariantsReference: "../uals-team-shared/references/cache-invariants.md",
    posture: {
      localFileStoreIsProductionBackend: false,
      requiredScalePath: "vercel-runtime-header-postgres-object-storage-cdn-job-queue-observability"
    },
    items
  };
}
