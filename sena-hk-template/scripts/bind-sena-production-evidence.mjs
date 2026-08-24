#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isSenaFullGitObjectId,
  senaBuildInputSha256,
  senaNextBuildIdSha256FromInputSha256,
  SENA_NEXT_BUILD_ID_GENERATOR
} from "../lib/sena/enterprise/performance-build-identity.mjs";
import {
  observeSenaLocalPerformanceBuildEvidence,
  validateSenaLocalPerformanceBuildEvidence
} from "../lib/sena/enterprise/performance-build-measurement.mjs";
import { validateSenaPerformanceBudgetSemantics } from "../lib/sena/enterprise/performance-budget-validation.mjs";

const defaultProductionTargetUrl = process.env.SENA_CDN_VERIFY_URL || "https://www.sena.hk";
const senaProjectRoot = fileURLToPath(new URL("../", import.meta.url));

const artifactBindings = new Map([
  ["sena-enterprise-vercel-production-preflight/v1", {
    label: "Vercel production preflight",
    expectedStatus: "pass",
    env: {
      confirmed: "SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED",
      sha256: "SENA_VERCEL_PRODUCTION_PREFLIGHT_ARTIFACT_SHA256",
      verifiedAt: "SENA_VERCEL_PRODUCTION_PREFLIGHT_VERIFIED_AT"
    },
    validate: validateVercelProductionPreflightArtifact,
    extraEnv: (artifact) => ({
      SENA_VERCEL_PRODUCTION_PREFLIGHT_TARGET_HOST_SHA256: hostHashFromDomainValue(artifact.target?.domain),
      SENA_VERCEL_PRODUCTION_PREFLIGHT_DEPLOYMENT_URL_SHA256: artifact.deployment?.deploymentUrlHash,
      SENA_VERCEL_PRODUCTION_PREFLIGHT_HTTP_STATUS: artifact.http?.httpStatus,
      SENA_VERCEL_PRODUCTION_PREFLIGHT_RUNTIME_HEADER: artifact.http?.xSenaRuntime
    })
	  }],
  ["sena-enterprise-postgres-probe/v1", {
    label: "Postgres live probe",
    expectedStatus: "pass",
    env: {
      confirmed: "SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_CONFIRMED",
      sha256: "SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_SHA256",
      verifiedAt: "SENA_ENTERPRISE_POSTGRES_PROBE_VERIFIED_AT",
      validation: "SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_VALIDATION"
    },
    validate: validatePostgresProbeArtifact
  }],
  ["sena-enterprise-postgres-schema-contract/v1", {
    label: "Postgres schema contract",
    expectedStatus: "pass",
    env: {
      confirmed: "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_CONFIRMED",
      sha256: "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_SHA256",
      verifiedAt: "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_VERIFIED_AT",
      validation: "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_VALIDATION"
    },
    validate: validatePostgresSchemaContractArtifact
  }],
  ["sena-enterprise-object-storage-contract/v1", {
    label: "Object storage contract",
    expectedStatus: "pass",
    env: {
      confirmed: "SENA_OBJECT_STORAGE_CONTRACT_CONFIRMED",
      sha256: "SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_SHA256",
      verifiedAt: "SENA_OBJECT_STORAGE_CONTRACT_VERIFIED_AT",
      validation: "SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_VALIDATION"
    },
    validate: validateObjectStorageContractArtifact
  }],
  ["sena-enterprise-object-storage-probe/v1", {
    label: "Object storage live probe",
    expectedStatus: "pass",
    env: {
      confirmed: "SENA_OBJECT_STORAGE_LIVE_PROBE_CONFIRMED",
      sha256: "SENA_OBJECT_STORAGE_PROBE_ARTIFACT_SHA256",
      verifiedAt: "SENA_OBJECT_STORAGE_PROBE_VERIFIED_AT",
      validation: "SENA_OBJECT_STORAGE_PROBE_ARTIFACT_VALIDATION"
    },
    validate: validateObjectStorageProbeArtifact
  }],
  ["sena-enterprise-cdn-contract/v1", {
    label: "CDN contract",
    expectedStatus: "pass",
    env: {
      confirmed: "SENA_CDN_CONTRACT_CONFIRMED",
      sha256: "SENA_CDN_CONTRACT_ARTIFACT_SHA256",
      verifiedAt: "SENA_CDN_CONTRACT_VERIFIED_AT",
      validation: "SENA_CDN_CONTRACT_ARTIFACT_VALIDATION"
    },
    validate: validateCdnContractArtifact
  }],
  ["sena-enterprise-cdn-probe/v1", {
    label: "CDN live probe",
    expectedStatus: "pass",
    env: {
      confirmed: "SENA_CDN_LIVE_PROBE_CONFIRMED",
      sha256: "SENA_CDN_PROBE_ARTIFACT_SHA256",
      verifiedAt: "SENA_CDN_PROBE_VERIFIED_AT",
      validation: "SENA_CDN_PROBE_ARTIFACT_VALIDATION"
    },
    validate: validateCdnProbeArtifact
  }],
  ["sena-enterprise-server-job-queue-contract/v1", {
    label: "Server job queue contract",
    expectedStatus: "pass",
    env: {
      confirmed: "SENA_JOB_QUEUE_CONTRACT_CONFIRMED",
      sha256: "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256",
      verifiedAt: "SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT",
      validation: "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION"
    },
    validate: validateServerJobQueueContractArtifact
  }],
  ["sena-enterprise-server-job-queue-probe/v1", {
    label: "Server job queue live probe",
    expectedStatus: "pass",
    env: {
      confirmed: "SENA_JOB_QUEUE_LIVE_PROBE_CONFIRMED",
      sha256: "SENA_JOB_QUEUE_PROBE_ARTIFACT_SHA256",
      verifiedAt: "SENA_JOB_QUEUE_PROBE_VERIFIED_AT",
      validation: "SENA_JOB_QUEUE_PROBE_ARTIFACT_VALIDATION"
    },
    validate: validateServerJobQueueProbeArtifact
  }],
  ["sena-enterprise-server-job-worker-contract/v1", {
    label: "Server job worker contract",
    expectedStatus: "pass",
    env: {
      confirmed: "SENA_JOB_WORKER_CONTRACT_CONFIRMED",
      sha256: "SENA_JOB_WORKER_CONTRACT_ARTIFACT_SHA256",
      verifiedAt: "SENA_JOB_WORKER_CONTRACT_VERIFIED_AT",
      validation: "SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION"
    },
    validate: validateServerJobWorkerContractArtifact
  }],
  ["sena-enterprise-observability-contract/v1", {
    label: "Observability contract",
    expectedStatus: "pass",
    env: {
      confirmed: "SENA_OBSERVABILITY_CONTRACT_CONFIRMED",
      sha256: "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256",
      verifiedAt: "SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT",
      validation: "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION"
    },
    validate: validateObservabilityContractArtifact
  }],
  ["sena-enterprise-observability-probe/v1", {
    label: "Observability live probe",
    expectedStatus: "pass",
    env: {
      confirmed: "SENA_OBSERVABILITY_LIVE_PROBE_CONFIRMED",
      sha256: "SENA_OBSERVABILITY_PROBE_ARTIFACT_SHA256",
      verifiedAt: "SENA_OBSERVABILITY_PROBE_VERIFIED_AT",
      validation: "SENA_OBSERVABILITY_PROBE_ARTIFACT_VALIDATION"
    },
    validate: validateObservabilityProbeArtifact
  }],
  ["sena-enterprise-production-performance-budget/v2", {
    label: "Production performance budget",
    expectedStatus: "pass",
    env: {
      confirmed: "SENA_PERFORMANCE_BUDGET_CONFIRMED",
      sha256: "SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256",
      verifiedAt: "SENA_PERFORMANCE_BUDGET_VERIFIED_AT"
    },
    validate: validatePerformanceBudgetArtifact,
    extraEnv: (artifact) => ({
      SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION: artifact.schemaVersion,
      SENA_PERFORMANCE_BUDGET_MEASURED_ARTIFACT_SET_SHA256: artifact.buildIdentity?.measuredArtifactSetSha256,
      SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256: artifact.buildIdentity?.nextBuildIdSha256,
      SENA_PERFORMANCE_BUDGET_GIT_COMMIT: artifact.buildIdentity?.gitCommit,
      // Preserve the observed Git fact. Dirty release slices are not bindable
      // and must never be normalized into a false clean-worktree claim.
      SENA_PERFORMANCE_BUDGET_GIT_DIRTY: String(artifact.buildIdentity?.gitDirty),
      SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256: artifact.buildIdentity?.packageLockSha256,
      SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE: artifact.sourceCustody?.mode
    })
  }],
  ["sena-enterprise-conference-load-rehearsal/v1", {
    label: "Conference load rehearsal",
    expectedStatus: "pass",
    env: {
      confirmed: "SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED",
      sha256: "SENA_CONFERENCE_LOAD_REHEARSAL_ARTIFACT_SHA256",
      verifiedAt: "SENA_CONFERENCE_LOAD_REHEARSAL_VERIFIED_AT"
    },
    validate: validateConferenceLoadArtifact,
    extraEnv: (artifact) => ({
      SENA_CONFERENCE_LOAD_REHEARSAL_USERS: artifact.target?.configuredUsers,
      SENA_CONFERENCE_LOAD_REHEARSAL_DURATION_SECONDS: artifact.target?.configuredDurationSeconds,
      SENA_CONFERENCE_LOAD_REHEARSAL_P95_MS: artifact.summary?.p95Ms,
      SENA_CONFERENCE_LOAD_REHEARSAL_ERROR_RATE_PERCENT: artifact.summary?.errorRatePercent
    })
  }],
  ["sena-enterprise-production-runtime-env-packet/v1", {
    label: "Production runtime env packet",
    expectedStatuses: ["blocked", "ready"],
    env: {
      confirmed: "SENA_PRODUCTION_RUNTIME_ENV_PACKET_CONFIRMED",
      sha256: "SENA_PRODUCTION_RUNTIME_ENV_PACKET_ARTIFACT_SHA256",
      verifiedAt: "SENA_PRODUCTION_RUNTIME_ENV_PACKET_VERIFIED_AT"
    },
    validate: validateProductionRuntimeEnvPacket,
    extraEnv: (artifact) => ({
      SENA_PRODUCTION_RUNTIME_ENV_PACKET_STATUS: artifact.status,
      SENA_PRODUCTION_RUNTIME_ENV_PACKET_READY_PROVIDER_GROUPS: artifact.summary?.readyProviderGroups,
      SENA_PRODUCTION_RUNTIME_ENV_PACKET_REQUIRED_PROVIDER_GROUPS: artifact.summary?.requiredProviderGroups
    })
  }],
  ["sena-enterprise-production-go-live-gate/v1", {
    label: "Production go-live gate",
    expectedStatuses: ["blocked", "ready"],
    env: {
      confirmed: "SENA_PRODUCTION_GO_LIVE_GATE_CONFIRMED",
      sha256: "SENA_PRODUCTION_GO_LIVE_GATE_ARTIFACT_SHA256",
      verifiedAt: "SENA_PRODUCTION_GO_LIVE_GATE_VERIFIED_AT"
    },
    validate: validateProductionGoLiveGate,
    extraEnv: (artifact) => ({
      SENA_PRODUCTION_GO_LIVE_GATE_STATUS: artifact.status,
      SENA_PRODUCTION_GO_LIVE_GATE_PRODUCTION_READY: String(artifact.summary?.productionReadyClaimAllowed),
      SENA_PRODUCTION_GO_LIVE_GATE_PASSED_CHECKS: artifact.summary?.passed,
      SENA_PRODUCTION_GO_LIVE_GATE_TOTAL_CHECKS: artifact.summary?.checks
    })
  }]
]);

function validSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

const productionRuntimeHeaderValues = new Set(["enterprise-neon", "enterprise-postgres"]);

function validHttpSuccessStatus(value) {
  return Number.isFinite(value) && value >= 200 && value < 400;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function stringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function trueFlags(record, keys) {
  return record && keys.every((key) => record[key] === true);
}

function httpStatusOk(value) {
  return Number.isFinite(value) && value >= 200 && value < 300;
}

function validIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed <= Date.now() + 60_000;
}

function passStep(step) {
  return step?.attempted === true && step?.status === "pass";
}

function setIncludesAll(values, expected) {
  const set = new Set(Array.isArray(values) ? values : []);
  return expected.every((value) => set.has(value));
}

function validatePostgresSchemaContractArtifact(artifact) {
  if (!trueFlags(artifact?.redaction, ["sqlValuesExcluded", "connectionValuesExcluded", "secretValuesExcluded"])) {
    return "postgres-schema-contract-redaction-missing";
  }
  if (!artifact?.summary ||
    !nonNegativeInteger(artifact.summary.tableCount) ||
    artifact.summary.productionTableCount < 1 ||
    artifact.summary.ddlStatementCount < artifact.summary.tableCount ||
    artifact.summary.destructiveDdlStatementCount !== 0 ||
    artifact.summary.migrationMode !== "create-if-not-exists") {
    return "postgres-schema-contract-summary-missing";
  }
  if (artifact?.ddl?.destructiveDdlExcluded !== true ||
    artifact.ddl.connectionValuesExcluded !== true ||
    !Array.isArray(artifact.ddl.statementFingerprints) ||
    artifact.ddl.statementFingerprints.length !== artifact.summary.ddlStatementCount ||
    !artifact.ddl.statementFingerprints.every((entry) => validSha256(entry?.sqlSha256))) {
    return "postgres-schema-contract-ddl-missing";
  }
  if (!Array.isArray(artifact.tables) || artifact.tables.filter((table) => table?.productionRequired === true).length !== artifact.summary.productionTableCount) {
    return "postgres-schema-contract-tables-missing";
  }
  return undefined;
}

function validatePostgresProbeArtifact(artifact) {
  if (artifact?.provider?.configured !== true ||
    artifact.provider.connectionValueExcluded !== true ||
    !validSha256(artifact.provider.connectionHash)) {
    return "postgres-probe-provider-missing";
  }
  const schemaContractProblem = validatePostgresSchemaContractArtifact(artifact?.schemaContract);
  if (schemaContractProblem) {
    return `postgres-probe-${schemaContractProblem}`;
  }
  if (!validSha256(artifact?.probe?.probeIdHash) || !validSha256(artifact?.probe?.payloadSha256)) {
    return "postgres-probe-custody-hash-missing";
  }
  if (!passStep(artifact?.probe?.createTable) ||
    !passStep(artifact?.probe?.insert) ||
    !passStep(artifact?.probe?.select) ||
    !passStep(artifact?.probe?.delete) ||
    artifact?.probe?.cleanupStatus !== "deleted") {
    return "postgres-probe-steps-missing";
  }
  if (!trueFlags(artifact?.redaction, ["connectionValuesExcluded", "probeIdValuesExcluded", "secretValuesExcluded"])) {
    return "postgres-probe-redaction-missing";
  }
  return undefined;
}

function validateObjectStorageContractArtifact(artifact) {
  if (!trueFlags(artifact?.redaction, ["endpointValuesExcluded", "bucketValuesExcluded", "objectKeyValuesExcluded", "secretValuesExcluded", "payloadValuesExcluded"])) {
    return "object-storage-contract-redaction-missing";
  }
  if (artifact?.summary?.privateAccessRequired !== true ||
    artifact.summary.uploadCustodyRequired !== true ||
    artifact.summary.liveProbeRequiredBeforeProduction !== true ||
    artifact.summary.localFileStoreIsProductionBackend !== false ||
    artifact.summary.operationCount < 3) {
    return "object-storage-contract-summary-missing";
  }
  if (!setIncludesAll(Array.isArray(artifact.operations) ? artifact.operations.map((entry) => entry?.method) : [], ["PUT", "HEAD", "DELETE"]) ||
    !artifact.operations.every((entry) => entry?.requiredForLiveProbe === true)) {
    return "object-storage-contract-operations-missing";
  }
  if (artifact?.custody?.localJsonFallbackIsProductionBackend !== false ||
    artifact.custody.payloadSha256Required !== true ||
    artifact.custody.objectVersionCaptured !== true ||
    artifact.custody.etagHashed !== true ||
    artifact.custody.postgresColumn !== "sena_enterprise_uploads.object_storage_custody") {
    return "object-storage-contract-custody-missing";
  }
  return undefined;
}

function validateObjectStorageProbeArtifact(artifact) {
  if (artifact?.provider?.configured !== true ||
    artifact.provider.productionReady !== true ||
    artifact.provider.endpointValueExcluded !== true ||
    artifact.provider.bucketValueExcluded !== true ||
    artifact.provider.accessKeyConfigured !== true ||
    artifact.provider.secretConfigured !== true ||
    !validSha256(artifact.provider.endpointHash) ||
    !validSha256(artifact.provider.bucketHash)) {
    return "object-storage-probe-provider-missing";
  }
  if (!validSha256(artifact?.probe?.objectKeyHash) || !validSha256(artifact?.probe?.contentSha256)) {
    return "object-storage-probe-custody-hash-missing";
  }
  if (!passStep(artifact?.probe?.put) ||
    !passStep(artifact?.probe?.head) ||
    !passStep(artifact?.probe?.delete) ||
    artifact?.probe?.cleanupStatus !== "deleted") {
    return "object-storage-probe-steps-missing";
  }
  if (!trueFlags(artifact?.redaction, ["endpointValuesExcluded", "bucketValuesExcluded", "objectKeyValuesExcluded", "secretValuesExcluded"])) {
    return "object-storage-probe-redaction-missing";
  }
  const contractProblem = validateObjectStorageContractArtifact(artifact?.contract);
  if (contractProblem) {
    return `object-storage-probe-${contractProblem}`;
  }
  return undefined;
}

function validateCdnContractArtifact(artifact) {
  if (!trueFlags(artifact?.redaction, ["urlValuesExcluded", "hostValuesHashed", "pathValuesHashed", "queryValuesExcluded"])) {
    return "cdn-contract-redaction-missing";
  }
  if (artifact?.summary?.htmlCompressionRequired !== true ||
    artifact.summary.immutableStaticAssetCachingRequired !== true ||
    artifact.summary.mutableHtmlNotImmutable !== true ||
    artifact.summary.cacheKeyNoiseExcluded !== true ||
    artifact.summary.ruleCount < 6) {
    return "cdn-contract-summary-missing";
  }
  if (artifact?.target?.configured !== true ||
    artifact.target.urlValueExcluded !== true ||
    !validSha256(artifact.target.hostHash)) {
    return "cdn-contract-target-missing";
  }
  if (artifact?.liveProbe?.requiredBeforeProduction !== true ||
    artifact.liveProbe.command !== "npm run sena:cdn:verify" ||
    !setIncludesAll(artifact.liveProbe.checks, ["html-compression", "static-asset-discovery", "static-asset-immutable-cache"])) {
    return "cdn-contract-live-probe-missing";
  }
  return undefined;
}

export function validateSenaPerformanceBudgetArtifactForBinding(artifact, localEvidence) {
  const semanticProblem = validateSenaPerformanceBudgetSemantics(artifact);
  if (semanticProblem) return semanticProblem;
  const identity = artifact?.buildIdentity;
  const sourceCustody = artifact?.sourceCustody;
  if (!identity || identity.values !== "hashes-and-commit-only") {
    return "performance-build-identity-missing";
  }
  if (identity.nextBuildIdGenerator !== SENA_NEXT_BUILD_ID_GENERATOR ||
    typeof identity.nextBuildMatchesCurrentSource !== "boolean" ||
    !validSha256(identity.buildInputSha256) ||
    !validSha256(identity.currentExpectedBuildInputSha256) ||
    typeof identity.buildObservationStable !== "boolean" ||
    typeof identity.measuredArtifactSetStable !== "boolean" ||
    identity.buildInputEnvironmentScope !== "not-bound-use-measured-artifact-set-sha256" ||
    !validSha256(identity.measuredArtifactSetSha256) ||
    !nonNegativeInteger(identity.measuredArtifactFileCount) ||
    identity.measuredArtifactFileCount <= 0) {
    return "performance-build-provenance-missing";
  }
  if (identity.nextBuildMatchesCurrentSource !== true ||
    identity.buildObservationStable !== true ||
    identity.measuredArtifactSetStable !== true ||
    identity.buildInputSha256 !== identity.currentExpectedBuildInputSha256 ||
    identity.measuredArtifactFileCount !== artifact.summary.totalStaticJsFiles + 1) {
    return "performance-build-provenance-mismatch";
  }
  if (!validSha256(identity.nextBuildIdSha256) ||
    !validSha256(identity.packageLockSha256) ||
    !validSha256(identity.gitStatusSha256) ||
    !validSha256(identity.sourceTreeSha256) ||
    !validSha256(identity.sourceFileListSha256) ||
    !validSha256(identity.sourceReadErrorSha256) ||
    !nonNegativeInteger(identity.gitDirtyFileCount) ||
    !nonNegativeInteger(identity.sourceFileCount) ||
    identity.sourceFileCount <= 0 ||
    !nonNegativeInteger(identity.sourceReadErrorCount) ||
    identity.sourceReadErrorCount !== 0 ||
    identity.sourceReadErrorSha256 !== createHash("sha256").update("").digest("hex")) {
    return "performance-build-identity-hash-missing";
  }
  if (!isSenaFullGitObjectId(identity.gitCommit)) {
    return "performance-build-git-commit-missing";
  }
  const cleanGitStatusSha256 = createHash("sha256").update("").digest("hex");
  const coherentGitDirtyIdentity = identity.gitDirty === false
    ? identity.gitDirtyFileCount === 0 && identity.gitStatusSha256 === cleanGitStatusSha256
    : identity.gitDirty === true && identity.gitDirtyFileCount > 0;
  if (!coherentGitDirtyIdentity) {
    return "performance-build-git-identity-invalid";
  }
  const expectedBuildInputSha256 = senaBuildInputSha256(identity);
  if (identity.buildInputSha256 !== expectedBuildInputSha256 ||
    identity.nextBuildIdSha256 !== senaNextBuildIdSha256FromInputSha256(expectedBuildInputSha256)) {
    return "performance-build-provenance-mismatch";
  }
  if (identity.gitDirty !== false) return "performance-build-git-dirty";
  if (!sourceCustody) return "performance-source-custody-missing";
  if (sourceCustody.values !== "hashes-and-counts-only") {
    return "performance-source-custody-missing";
  }
  if (sourceCustody.reviewedClean !== true) {
    return "performance-source-custody-not-clean";
  }
  if (sourceCustody.mode !== "git-clean-worktree" ||
    sourceCustody.baseGitCommit !== identity.gitCommit ||
    sourceCustody.rootGitDirty !== false ||
    sourceCustody.rootGitDirtyFileCount !== 0 ||
    sourceCustody.rootGitStatusSha256 !== identity.gitStatusSha256) {
    return "performance-source-custody-invalid";
  }
  return validateSenaLocalPerformanceBuildEvidence(artifact, localEvidence);
}

function validatePerformanceBudgetArtifact(artifact, _options, localEvidence) {
  return validateSenaPerformanceBudgetArtifactForBinding(
    artifact,
    localEvidence ?? observeSenaLocalPerformanceBuildEvidence(senaProjectRoot)
  );
}

function validateVercelProductionPreflightArtifact(artifact, options) {
  const productionTargetProblem = productionTargetUrlProblem(options.productionTargetUrl);
  if (productionTargetProblem) {
    return `vercel-preflight-${productionTargetProblem}`;
  }
  const expectedOriginHash = expectedHostHash(options.productionTargetUrl);
  const artifactHostHash = hostHashFromDomainValue(artifact?.target?.domain);
  if (!artifactHostHash) {
    return "vercel-preflight-target-host-missing";
  }
  if (!expectedOriginHash || artifactHostHash !== expectedOriginHash) {
    return "vercel-preflight-target-host-mismatch";
  }
  if (artifact?.deployment?.status !== "pass" || !validSha256(artifact?.deployment?.deploymentUrlHash)) {
    return "vercel-preflight-deployment-evidence-missing";
  }
  if (artifact?.domain?.status !== "pass") {
    return "vercel-preflight-domain-evidence-missing";
  }
  if (artifact?.http?.status !== "pass" || artifact?.http?.runtimeStatus !== "pass") {
    return "vercel-preflight-runtime-header-not-pass";
  }
  if (!validHttpSuccessStatus(artifact?.http?.httpStatus)) {
    return "vercel-preflight-http-status-missing";
  }
  if (!productionRuntimeHeaderValues.has(artifact?.http?.xSenaRuntime)) {
    return "vercel-preflight-runtime-header-missing";
  }
  if (artifact?.redaction?.secretValuesExcluded !== true ||
    artifact?.redaction?.envValuesExcluded !== true ||
    artifact?.redaction?.endpointValuesHashed !== true) {
    return "vercel-preflight-redaction-missing";
  }
  return undefined;
}

function validateCdnProbeArtifact(artifact, options) {
  const productionTargetProblem = productionTargetUrlProblem(options.productionTargetUrl);
  if (productionTargetProblem) {
    return `cdn-${productionTargetProblem}`;
  }
  const expectedOriginHash = expectedHostHash(options.productionTargetUrl);
  if (!validSha256(artifact?.target?.hostHash)) {
    return "cdn-target-host-hash-missing";
  }
  if (!expectedOriginHash || artifact.target.hostHash !== expectedOriginHash) {
    return "cdn-target-host-hash-mismatch";
  }
  if (!trueFlags(artifact?.redaction, ["urlValuesExcluded", "hostValuesHashed"])) {
    return "cdn-probe-redaction-missing";
  }
  if (artifact?.html?.attempted !== true ||
    artifact.html.status !== "pass" ||
    !httpStatusOk(artifact.html.httpStatus) ||
    artifact.html.compressed !== true) {
    return "cdn-probe-html-missing";
  }
  if (artifact?.staticAsset?.attempted !== true ||
    artifact.staticAsset.discovered !== true ||
    artifact.staticAsset.status !== "pass" ||
    !httpStatusOk(artifact.staticAsset.httpStatus) ||
    artifact.staticAsset.immutable !== true ||
    artifact.staticAsset.maxAgeSeconds < 31_536_000 ||
    !validSha256(artifact.staticAsset.pathHash)) {
    return "cdn-probe-static-asset-missing";
  }
  const contractProblem = validateCdnContractArtifact(artifact?.contract);
  if (contractProblem) {
    return `cdn-probe-${contractProblem}`;
  }
  return undefined;
}

function validateServerJobQueueContractArtifact(artifact) {
  if (!trueFlags(artifact?.redaction, ["endpointValuesExcluded", "secretValuesExcluded", "providerTokenValuesExcluded", "payloadValuesExcluded", "responsePayloadValuesExcluded"])) {
    return "server-job-queue-contract-redaction-missing";
  }
  if (artifact?.summary?.durableJobStoreRequired !== true ||
    artifact.summary.signedDispatchRequired !== true ||
    artifact.summary.workerCallbackRequired !== true ||
    artifact.summary.liveProbeRequiredBeforeProduction !== true ||
    artifact.summary.jobKindCount < 5 ||
    artifact.summary.statusActionCount < 5 ||
    artifact.summary.acceptedProviderModeCount < 3) {
    return "server-job-queue-contract-summary-missing";
  }
  if (artifact?.provider?.queueEndpointValueExcluded !== true ||
    artifact.provider.queueSecretValuesExcluded !== true ||
    artifact.provider.queueProviderTokenValuesExcluded !== true) {
    return "server-job-queue-contract-provider-redaction-missing";
  }
  if (artifact?.store?.acceptedStore !== "postgres-table" ||
    artifact.store.localStateFallback !== "research-pilot-only" ||
    artifact.store.requiredForProduction !== true ||
    artifact.store.table !== "sena_enterprise_server_jobs") {
    return "server-job-queue-contract-store-missing";
  }
  if (artifact?.dispatch?.signatureAlgorithm !== "hmac-sha256" ||
    artifact.dispatch.statusCallback !== "/api/sena/ops/jobs" ||
    artifact.dispatch.rawPayloadPersistedInJobStore !== false ||
    artifact.dispatch.payloadPolicy !== "project-or-upload-pointer-default") {
    return "server-job-queue-contract-dispatch-missing";
  }
  return undefined;
}

function validateServerJobQueueProbeArtifact(artifact) {
  if (artifact?.provider?.queueConfigured !== true ||
    artifact.provider.queueProductionReady !== true ||
    artifact.provider.queueSecretConfigured !== true ||
    artifact.provider.queueEndpointValueExcluded !== true ||
    artifact.provider.queueSecretValuesExcluded !== true ||
    !validSha256(artifact.provider.queueEndpointHash)) {
    return "server-job-queue-probe-provider-missing";
  }
  if (!validSha256(artifact?.probe?.probeIdHash) ||
    !validSha256(artifact.probe.payloadSha256) ||
    artifact.probe.deliveryStatus !== "delivered" ||
    artifact.probe.attempted !== true ||
    !httpStatusOk(artifact.probe.httpStatus) ||
    artifact.probe.dispatchEvent !== "server_job.queue.probe") {
    return "server-job-queue-probe-delivery-missing";
  }
  if (!trueFlags(artifact?.redaction, ["endpointValueExcluded", "secretValuesExcluded", "probeIdValueExcluded", "payloadValuesExcluded", "responsePayloadValuesExcluded"])) {
    return "server-job-queue-probe-redaction-missing";
  }
  const contractProblem = validateServerJobQueueContractArtifact(artifact?.contract);
  if (contractProblem) {
    return `server-job-queue-probe-${contractProblem}`;
  }
  return undefined;
}

function validateServerJobWorkerContractArtifact(artifact) {
  if (artifact?.productionReady !== true) {
    return "server-job-worker-contract-production-ready-missing";
  }
  if (artifact?.provider?.queueConfigured !== true ||
    artifact.provider.queueProductionReady !== true ||
    artifact.provider.queueSecretConfigured !== true ||
    artifact.provider.queueEndpointValueExcluded !== true ||
    artifact.provider.queueSecretValuesExcluded !== true ||
    !validSha256(artifact.provider.queueEndpointHash)) {
    return "server-job-worker-contract-provider-missing";
  }
  if (artifact?.statusStore?.activeStore !== "postgres-table" ||
    artifact.statusStore.postgresConfigured !== true ||
    artifact.statusStore.postgresPrimaryActive !== true ||
    artifact.statusStore.indexed !== true) {
    return "server-job-worker-contract-status-store-missing";
  }
  if (artifact?.worker?.ownerConfigured !== true ||
    artifact.worker.runbookConfigured !== true ||
    artifact.worker.callbackConfigured !== true ||
    artifact.worker.heartbeatConfirmed !== true ||
    artifact.worker.heartbeatArtifactHashConfigured !== true ||
    artifact.worker.heartbeatVerifiedAtConfigured !== true ||
    artifact.worker.callbackUrlValueExcluded !== true ||
    artifact.worker.runbookUrlValueExcluded !== true ||
    artifact.worker.ownerValueExcluded !== true ||
    !validSha256(artifact.worker.callbackUrlHash) ||
    !validSha256(artifact.worker.runbookUrlHash) ||
    !validSha256(artifact.worker.heartbeatArtifactSha256) ||
    !validIsoTimestamp(artifact.worker.heartbeatVerifiedAt)) {
    return "server-job-worker-contract-worker-missing";
  }
  if (artifact?.contract?.statusCallback !== "/api/sena/ops/jobs" ||
    artifact.contract.rawPayloadPersistedInJobStore !== false ||
    artifact.contract.payloadPolicy !== "project-or-upload-pointer-default") {
    return "server-job-worker-contract-contract-missing";
  }
  if (Array.isArray(artifact.missing) && artifact.missing.length > 0) {
    return "server-job-worker-contract-missing-requirements";
  }
  return undefined;
}

function validateObservabilityContractArtifact(artifact) {
  if (!trueFlags(artifact?.redaction, ["exporterUrlValuesExcluded", "dashboardUrlValuesExcluded", "runbookUrlValuesExcluded", "requestIdValuesExcluded", "secretValuesExcluded", "payloadValuesExcluded"])) {
    return "observability-contract-redaction-missing";
  }
  if (artifact?.summary?.durableSampleStoreRequired !== true ||
    artifact.summary.signedExporterRequired !== true ||
    artifact.summary.dashboardRunbookOwnerRequired !== true ||
    artifact.summary.liveProbeRequiredBeforeProduction !== true ||
    artifact.summary.signalCount < 4 ||
    artifact.summary.alertCategoryCount < 5) {
    return "observability-contract-summary-missing";
  }
  if (artifact?.provider?.externalSinkConfigured !== true ||
    artifact.provider.externalSinkOriginAllowed !== true ||
    artifact.provider.dashboardConfigured !== true ||
    artifact.provider.runbookConfigured !== true ||
    artifact.provider.ownerConfigured !== true ||
    artifact.provider.secretConfigured !== true ||
    artifact.provider.urlValuesExcluded !== true ||
    artifact.provider.secretValuesExcluded !== true ||
    !validSha256(artifact.provider.endpointHash) ||
    !validSha256(artifact.provider.dashboardUrlHash) ||
    !validSha256(artifact.provider.runbookUrlHash)) {
    return "observability-contract-provider-missing";
  }
  if (!Array.isArray(artifact.signals) ||
    artifact.signals.length < 4 ||
    !artifact.signals.every((signal) => signal?.required === true && signal.valuesExcluded === true && signal.correlationKey === "requestIdHash")) {
    return "observability-contract-signals-missing";
  }
  if (artifact?.sampleStore?.acceptedStore !== "postgres-table" ||
    artifact.sampleStore.localRingBufferFallback !== "development-only" ||
    artifact.sampleStore.requiredForProduction !== true) {
    return "observability-contract-sample-store-missing";
  }
  if (artifact?.liveProbe?.requiredBeforeProduction !== true ||
    artifact.liveProbe.signedDeliveryRequired !== true) {
    return "observability-contract-live-probe-missing";
  }
  if (artifact?.alerting?.runbookRequired !== true ||
    artifact.alerting.ownerRequired !== true ||
    !Array.isArray(artifact.alerting.requiredCategories) ||
    artifact.alerting.requiredCategories.length < 5) {
    return "observability-contract-alerting-missing";
  }
  return undefined;
}

function validateObservabilityProbeArtifact(artifact) {
  if (artifact?.provider?.externalSinkConfigured !== true ||
    artifact.provider.externalSinkOriginAllowed !== true ||
    artifact.provider.dashboardConfigured !== true ||
    artifact.provider.runbookConfigured !== true ||
    artifact.provider.ownerConfigured !== true ||
    artifact.provider.secretConfigured !== true ||
    artifact.provider.urlValuesExcluded !== true ||
    artifact.provider.secretValuesExcluded !== true ||
    !validSha256(artifact.provider.endpointHash)) {
    return "observability-probe-provider-missing";
  }
  if (artifact?.probe?.sampleRouteId !== "sena-observability-live-probe" ||
    artifact.probe.sampleStatusClass !== "2xx" ||
    !validSha256(artifact.probe.sampleRequestIdHash) ||
    artifact.probe.deliveryStatus !== "delivered" ||
    artifact.probe.attempted !== true ||
    !httpStatusOk(artifact.probe.httpStatus)) {
    return "observability-probe-delivery-missing";
  }
  if (!trueFlags(artifact?.redaction, ["exporterUrlValuesExcluded", "requestIdValuesExcluded", "secretValuesExcluded", "payloadValuesExcluded"])) {
    return "observability-probe-redaction-missing";
  }
  const contractProblem = validateObservabilityContractArtifact(artifact?.contract);
  if (contractProblem) {
    return `observability-probe-${contractProblem}`;
  }
  return undefined;
}

function validateConferenceLoadArtifact(artifact, options) {
  if (artifact?.target?.requireProductionTarget !== true) {
    return "conference-load-production-target-not-required";
  }
  if (artifact?.target?.productionOriginSatisfied !== true) {
    return "conference-load-production-origin-not-satisfied";
  }
  const productionTargetProblem = productionTargetUrlProblem(options.productionTargetUrl);
  if (productionTargetProblem) {
    return `conference-load-${productionTargetProblem}`;
  }
  const expectedOriginHash = expectedHostHash(options.productionTargetUrl);
  if (!validSha256(artifact?.origin?.originHash)) {
    return "conference-load-origin-hash-missing";
  }
  if (!expectedOriginHash || artifact.origin.originHash !== expectedOriginHash) {
    return "conference-load-origin-hash-mismatch";
  }
  if (artifact?.target?.productionTargetSatisfied !== true) {
    return "conference-load-production-target-not-satisfied";
  }
  if (!Number.isFinite(artifact?.target?.configuredUsers) || artifact.target.configuredUsers < 50) {
    return "conference-load-target-users-insufficient";
  }
  if (!Number.isFinite(artifact?.target?.configuredDurationSeconds) || artifact.target.configuredDurationSeconds < 1800) {
    return "conference-load-target-duration-insufficient";
  }
  if (!Number.isFinite(artifact?.summary?.p95Ms) || artifact.summary.p95Ms < 0) {
    return "conference-load-p95-missing";
  }
  if (!Number.isFinite(artifact?.summary?.errorRatePercent) ||
    artifact.summary.errorRatePercent < 0 ||
    artifact.summary.errorRatePercent > 100) {
    return "conference-load-error-rate-missing";
  }
  return undefined;
}

function validateProductionRuntimeEnvPacket(artifact) {
  if (artifact?.status !== "blocked" && artifact?.status !== "ready") {
    return "production-runtime-env-packet-status-invalid";
  }
  if (artifact?.policy?.localFileStoreIsProductionBackend !== false) {
    return "production-runtime-env-packet-policy-missing";
  }
  if (artifact?.redaction?.secretValuesExcluded !== true ||
    artifact?.redaction?.endpointValuesExcluded !== true ||
    artifact?.redaction?.placeholdersOnly !== true) {
    return "production-runtime-env-packet-redaction-missing";
  }
  const readyProviderGroups = artifact?.summary?.readyProviderGroups;
  const requiredProviderGroups = artifact?.summary?.requiredProviderGroups;
  const blockerIds = artifact?.summary?.blockerIds;
  const providerGroups = artifact?.providerGroups;
  if (!nonNegativeInteger(readyProviderGroups) ||
    !nonNegativeInteger(requiredProviderGroups) ||
    readyProviderGroups > requiredProviderGroups) {
    return "production-runtime-env-packet-provider-summary-missing";
  }
  if (!stringArray(blockerIds)) {
    return "production-runtime-env-packet-blocker-summary-missing";
  }
  if (!Array.isArray(providerGroups) ||
    providerGroups.length !== requiredProviderGroups ||
    !providerGroups.every((group) => group && typeof group === "object" && (group.status === "pass" || group.status === "blocked"))) {
    return "production-runtime-env-packet-provider-groups-missing";
  }
  const blockedProviderGroups = providerGroups.filter((group) => group.status !== "pass");
  if (artifact.status === "ready" &&
    (readyProviderGroups !== requiredProviderGroups || blockerIds.length > 0 || blockedProviderGroups.length > 0)) {
    return "production-runtime-env-packet-ready-summary-mismatch";
  }
  if (artifact.status === "blocked" &&
    readyProviderGroups === requiredProviderGroups &&
    blockerIds.length === 0 &&
    blockedProviderGroups.length === 0) {
    return "production-runtime-env-packet-blocked-summary-mismatch";
  }
  return undefined;
}

function validateProductionGoLiveGate(artifact) {
  if (artifact?.status !== "blocked" && artifact?.status !== "ready") {
    return "production-go-live-gate-status-invalid";
  }
  if (artifact?.policy?.localFileStoreIsProductionBackend !== false ||
    artifact?.policy?.localPilotGateSeparateFromEnterpriseGoLive !== true ||
    artifact?.policy?.requirePostgresObjectStorageCdnQueueObservability !== true) {
    return "production-go-live-gate-policy-missing";
  }
  if (artifact?.redaction?.secretValuesExcluded !== true ||
    artifact?.redaction?.envValuesExcluded !== true ||
    artifact?.redaction?.endpointValuesExcluded !== true) {
    return "production-go-live-gate-redaction-missing";
  }
  const productionReadyClaimAllowed = artifact?.summary?.productionReadyClaimAllowed;
  const checks = artifact?.summary?.checks;
  const passed = artifact?.summary?.passed;
  const blockers = artifact?.summary?.blockers;
  if (typeof productionReadyClaimAllowed !== "boolean" ||
    artifact?.summary?.localPilotGateIsProductionGate !== false ||
    !nonNegativeInteger(checks) ||
    !nonNegativeInteger(passed) ||
    passed > checks) {
    return "production-go-live-gate-summary-missing";
  }
  if (!stringArray(blockers)) {
    return "production-go-live-gate-blocker-summary-missing";
  }
  if (artifact.status === "ready" && productionReadyClaimAllowed !== true) {
    return "production-go-live-gate-ready-claim-mismatch";
  }
  if (artifact.status === "blocked" && productionReadyClaimAllowed !== false) {
    return "production-go-live-gate-blocked-claim-mismatch";
  }
  if (artifact.status === "ready" && (passed !== checks || blockers.length > 0)) {
    return "production-go-live-gate-ready-summary-mismatch";
  }
  if (artifact.status === "blocked" && passed === checks && blockers.length === 0) {
    return "production-go-live-gate-blocked-summary-mismatch";
  }
  return undefined;
}

function productionTargetUrlProblem(value) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:") return "target-url-not-https";
    if (hostname === "localhost" || hostname === "::1" || hostname.endsWith(".local")) return "target-url-local";
    if (hostname.startsWith("127.") || hostname === "0.0.0.0") return "target-url-local";
    if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) return "target-url-private-network";
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return "target-url-private-network";
    return undefined;
  } catch {
    return "target-url-invalid";
  }
}

function parseArgs(argv) {
  const options = {
    artifacts: [],
    evidenceDirs: [],
    environment: "production",
    productionTargetUrl: defaultProductionTargetUrl,
    scope: process.env.VERCEL_SCOPE,
    yes: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--artifact") options.artifacts.push(next());
    else if (arg === "--evidence-dir") options.evidenceDirs.push(next());
    else if (arg === "--env") options.environment = next();
    else if (arg === "--target-url" || arg === "--cdn-verify-url") options.productionTargetUrl = next();
    else if (arg === "--scope") options.scope = next();
    else if (arg === "--yes") options.yes = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (options.artifacts.length === 0 && options.evidenceDirs.length === 0) {
    options.evidenceDirs.push(path.join("output", "production-evidence"));
  }
  if (options.environment !== "production") {
    throw new Error(`SENA production evidence binding only writes to the Vercel production environment. Refusing --env ${options.environment}.`);
  }
  return options;
}

function printHelp() {
  console.log(`Bind passed SENA production evidence artifacts to Vercel env.

Usage:
  npm run sena:production-evidence:bind -- --evidence-dir output/production-evidence/<release-id> [--yes] [--scope <team>]
  npm run sena:production-evidence:bind -- --artifact output/production-evidence/cdn-probe.json [--yes]
  npm run sena:production-evidence:bind -- --artifact output/production-evidence/<release-id>/sena-production-evidence-archive.json [--yes]

Options:
  --artifact <file>      Redacted verifier artifact JSON. Can be repeated.
  --evidence-dir <dir>   Directory containing verifier artifact JSON files. Can be repeated.
  --env <name>           Vercel environment. Must be production.
  --target-url <url>     Deployed HTTPS production URL whose host hash must match conference-load evidence.
  --cdn-verify-url <url> Alias for --target-url. Defaults to SENA_CDN_VERIFY_URL or https://www.sena.hk.
  --scope <team-slug>    Vercel team scope. Defaults to VERCEL_SCOPE or linked project scope.
  --yes                  Actually write Vercel env values. Without this, prints a dry run.

Only artifacts with a known schemaVersion and an accepted status are bound. Most verifier
artifacts require status=pass; the redacted production runtime env packet may be status=blocked
because it is advisory handoff custody rather than provider-readiness evidence. The production
go-live gate may also be status=blocked as advisory custody, but it must never replace the live
provider probes, performance budget, conference load rehearsal, or closeout gate. Production evidence
archive manifests are expanded to their child artifact files only when they are status=ready
and their sha256 custody file matches. Values from service configuration, endpoints, buckets, and secrets are never
read or printed. Performance budget artifacts must include build identity hashes and a clean
git status before they can be bound as production evidence. Vercel preflight, CDN, and conference
load rehearsal artifacts must match the configured production target host.`);
}

function walkJsonFiles(dir) {
  if (!existsSync(dir)) return [];
  const stats = statSync(dir);
  if (stats.isFile()) return dir.endsWith(".json") ? [dir] : [];
  return readdirSync(dir).flatMap((entry) => {
    const entryPath = path.join(dir, entry);
    const entryStats = statSync(entryPath);
    if (entryStats.isDirectory()) return walkJsonFiles(entryPath);
    return entryPath.endsWith(".json") ? [entryPath] : [];
  });
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function expectedHostHash(value) {
  try {
    return sha256(new URL(value).host);
  } catch {
    return undefined;
  }
}

function hostHashFromDomainValue(value) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    return sha256(new URL(value).host);
  } catch {
    try {
      return sha256(new URL(`https://${value}`).host);
    } catch {
      return undefined;
    }
  }
}

function readArtifact(file, contentFile = file) {
  const absolutePath = path.resolve(file);
  const text = readFileSync(path.resolve(contentFile), "utf8");
  const artifact = JSON.parse(text);
  const artifactSha256 = sha256(text);
  const shaPath = `${absolutePath}.sha256`;
  const shaText = existsSync(shaPath) ? readFileSync(shaPath, "utf8").trim() : "";
  const expectedShaLine = `${artifactSha256}  ${path.basename(absolutePath)}`;
  return {
    file: absolutePath,
    artifact,
    artifactSha256,
    shaFilePresent: existsSync(shaPath),
    shaFileMatches: shaText === expectedShaLine
  };
}

function pathIsInsideDir(file, dir) {
  const relative = path.relative(dir, file);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function planSenaProductionEvidenceArtifactBinding(read, options, localPerformanceEvidence) {
  const schemaVersion = read.artifact?.schemaVersion;
  const binding = artifactBindings.get(schemaVersion);
  if (!binding) {
    return {
      bindable: false,
      reason: `unknown-schema:${schemaVersion ?? "missing"}`
    };
  }
  const expectedStatuses = binding.expectedStatuses ?? [binding.expectedStatus];
  if (!expectedStatuses.includes(read.artifact?.status)) {
    return {
      bindable: false,
      binding,
      reason: `artifact-status:${read.artifact?.status ?? "missing"}`
    };
  }
  if (!read.shaFileMatches) {
    return {
      bindable: false,
      binding,
      reason: read.shaFilePresent ? "sha256-file-mismatch" : "sha256-file-missing"
    };
  }
  const verifiedAt = read.artifact?.generatedAt;
  if (!verifiedAt || Number.isNaN(Date.parse(verifiedAt))) {
    return {
      bindable: false,
      binding,
      reason: "generatedAt-missing-or-invalid"
    };
  }
  const validationReason = binding.validate?.(read.artifact, options, localPerformanceEvidence);
  if (validationReason) {
    return {
      bindable: false,
      binding,
      reason: validationReason
    };
  }
  const env = new Map([
    [binding.env.confirmed, "1"],
    [binding.env.sha256, read.artifactSha256],
    [binding.env.verifiedAt, verifiedAt]
  ]);
  if (binding.env.validation) {
    env.set(binding.env.validation, "pass");
  }
  for (const [key, value] of Object.entries(binding.extraEnv?.(read.artifact) ?? {})) {
    if (value !== undefined && value !== null && value !== "") env.set(key, String(value));
  }
  return {
    bindable: true,
    binding,
    env
  };
}

function resolveArchiveChildArtifactCandidate(archiveDir, outputFile) {
  if (typeof outputFile !== "string" || !outputFile.endsWith(".json")) return undefined;
  const realArchiveDir = realpathSync(archiveDir);
  const candidates = [
    path.resolve(process.cwd(), outputFile),
    path.resolve(archiveDir, outputFile)
  ];
  let escapedCandidate;
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const canonicalFile = realpathSync(candidate);
      const resolved = {
        file: candidate,
        canonicalFile,
        realArchiveDir,
        contained: pathIsInsideDir(canonicalFile, realArchiveDir)
      };
      if (resolved.contained) return resolved;
      escapedCandidate ??= resolved;
    } catch {
      // A disappearing or unreadable child is not archive-bound evidence.
    }
  }
  return escapedCandidate;
}

function archiveChildArtifactPins(read) {
  if (read.artifact?.schemaVersion !== "sena-enterprise-production-evidence-archive/v1") {
    return [];
  }
  if (read.artifact?.status !== "ready") {
    return [];
  }
  if (!read.shaFileMatches) {
    return [];
  }
  const archiveDir = path.dirname(read.file);
  return (Array.isArray(read.artifact.items) ? read.artifact.items : [])
    .map((item) => {
      const resolved = resolveArchiveChildArtifactCandidate(archiveDir, item.outputFile);
      return resolved
        ? {
            ...resolved,
            itemStatus: item?.status,
            artifactHashMatches: item?.artifactHashMatches,
            artifactSha256: item?.artifactSha256
          }
        : undefined;
    })
    .filter(Boolean);
}

function sha256SidecarMatches(file, artifactSha256) {
  const shaPath = `${file}.sha256`;
  if (!existsSync(shaPath)) return false;
  try {
    return readFileSync(shaPath, "utf8").trim() ===
      `${artifactSha256}  ${path.basename(file)}`;
  } catch {
    return false;
  }
}

export function classifySenaProductionEvidenceArchiveChildClaims(claims) {
  const pinGroups = new Map();
  const pinHashesByFile = new Map();
  const canonicalFilesByFile = new Map();

  for (const claim of claims) {
    const group = pinGroups.get(claim.canonicalFile) ?? [];
    group.push(claim);
    pinGroups.set(claim.canonicalFile, group);
    const filePins = pinHashesByFile.get(claim.file) ?? new Set();
    filePins.add(claim.artifactSha256);
    pinHashesByFile.set(claim.file, filePins);
    const fileCanonicals = canonicalFilesByFile.get(claim.file) ?? new Set();
    fileCanonicals.add(claim.canonicalFile);
    canonicalFilesByFile.set(claim.file, fileCanonicals);
  }

  const conflictingFiles = new Set(
    [...pinHashesByFile.entries()]
      .filter(([file, hashes]) =>
        hashes.size !== 1 || canonicalFilesByFile.get(file)?.size !== 1
      )
      .map(([file]) => file)
  );
  const blockedCanonicalFiles = new Set();
  for (const [canonicalFile, pins] of pinGroups) {
    const recordedHashes = new Set(pins.map((pin) => pin.artifactSha256));
    if (recordedHashes.size !== 1 || pins.some((pin) => conflictingFiles.has(pin.file))) {
      blockedCanonicalFiles.add(canonicalFile);
    }
  }
  return {
    pinGroups,
    pinHashesByFile,
    canonicalFilesByFile,
    blockedCanonicalFiles
  };
}

export function collectSenaProductionEvidenceArtifactReads(options) {
  const seedFiles = new Set([
    ...options.artifacts,
    ...options.evidenceDirs.flatMap((dir) => walkJsonFiles(path.resolve(dir)))
  ].map((file) => path.resolve(file)));
  const seedRecords = [...seedFiles].sort().map((file) => ({
    read: readArtifact(file),
    canonicalFile: realpathSync(file)
  }));
  const claims = seedRecords.flatMap(({ read }) => archiveChildArtifactPins(read));
  const {
    pinGroups,
    pinHashesByFile,
    blockedCanonicalFiles
  } = classifySenaProductionEvidenceArchiveChildClaims(claims);

  const pinnedReads = [];
  for (const [canonicalFile, pins] of [...pinGroups.entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  )) {
    if (blockedCanonicalFiles.has(canonicalFile) ||
      pins.some((pin) => pin.itemStatus !== "pass") ||
      pins.some((pin) => pin.artifactHashMatches !== true) ||
      pins.some((pin) => !pin.contained) ||
      !validSha256(pins[0]?.artifactSha256)) {
      continue;
    }
    const expectedSha256 = pins[0].artifactSha256;
    const orderedPins = [...pins].sort((left, right) =>
      left.file < right.file ? -1 : left.file > right.file ? 1 : 0
    );
    if (!orderedPins.every((pin) => sha256SidecarMatches(pin.file, expectedSha256))) {
      continue;
    }
    try {
      const pinnedRead = readArtifact(orderedPins[0].file, canonicalFile);
      if (pinnedRead.artifactSha256 === expectedSha256) {
        pinnedReads.push(pinnedRead);
      }
    } catch {
      // Unreadable or concurrently replaced canonical content is not evidence.
    }
  }

  const claimedCanonicalFiles = new Set(pinGroups.keys());
  const claimedFiles = new Set([...pinHashesByFile.keys()]);
  return [
    ...seedRecords
      .filter((record) =>
        !claimedFiles.has(record.read.file) &&
        !claimedCanonicalFiles.has(record.canonicalFile)
      )
      .map((record) => record.read),
    ...pinnedReads
  ].sort((left, right) => left.file < right.file ? -1 : left.file > right.file ? 1 : 0);
}

function run(command, args, input) {
  const result = spawnSync(command, args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function vercelArgs(options, args) {
  return options.scope ? [...args, "--scope", options.scope] : args;
}

function redactOutput(output) {
  return output
    .split(/\r?\n/)
    .filter((line) => !/https?:\/\/|postgres:\/\/|postgresql:\/\/|secret|password|token/i.test(line))
    .join("\n")
    .trim();
}

function assertVercelAvailable() {
  const result = run("vercel", ["--version"]);
  if (result.status !== 0) {
    throw new Error("Vercel CLI is not available. Install it with npm install -g vercel.");
  }
}

function upsertVercelEnv(options, key, value) {
  const addArgs = vercelArgs(options, ["env", "add", key, options.environment]);
  const add = run("vercel", addArgs, `${value}\n`);
  if (add.status === 0) return "added";
  const combined = `${add.stdout}\n${add.stderr}`;
  if (!/already exists|exists/i.test(combined)) {
    throw new Error(`Failed to add ${key}: ${redactOutput(combined)}`);
  }
  const remove = run("vercel", vercelArgs(options, ["env", "rm", key, options.environment, "-y"]));
  if (remove.status !== 0) {
    throw new Error(`Failed to replace existing ${key}: ${redactOutput(`${remove.stdout}\n${remove.stderr}`)}`);
  }
  const retry = run("vercel", addArgs, `${value}\n`);
  if (retry.status !== 0) {
    throw new Error(`Failed to re-add ${key}: ${redactOutput(`${retry.stdout}\n${retry.stderr}`)}`);
  }
  return "replaced";
}

export function writeSenaProductionEvidenceBindingPlanToVercel(options, result) {
  const confirmedKey = result.binding.env.confirmed;
  const confirmedValue = result.env.get(confirmedKey);
  try {
    const revokeAction = upsertVercelEnv(options, confirmedKey, "0");
    console.log(`  ${confirmedKey}=${revokeAction}`);
    for (const [key, value] of result.env) {
      if (key === confirmedKey) continue;
      const action = upsertVercelEnv(options, key, value);
      console.log(`  ${key}=${action}`);
    }
    const confirmAction = upsertVercelEnv(options, confirmedKey, confirmedValue);
    console.log(`  ${confirmedKey}=${confirmAction}`);
  } catch (error) {
    try {
      const rollbackAction = upsertVercelEnv(options, confirmedKey, "0");
      console.log(`  ${confirmedKey}=${rollbackAction}`);
    } catch {
      throw new Error(`Failed to keep ${confirmedKey} unconfirmed after a binding error.`);
    }
    throw error;
  }
}

function runSenaProductionEvidenceBinding(argv) {
  const options = parseArgs(argv);
  const reads = collectSenaProductionEvidenceArtifactReads(options);
  const plans = reads.map((read) => ({
    read,
    result: planSenaProductionEvidenceArtifactBinding(read, options)
  }));
  const bindablePlans = plans.filter((plan) => plan.result.bindable);

  console.log("SENA production evidence binding plan");
  console.log(`  vercelEnvironment=${options.environment}`);
  console.log(`  vercelScope=${options.scope ?? "linked-project-default"}`);
  console.log(`  artifactsScanned=${reads.length}`);
  console.log(`  bindableArtifacts=${bindablePlans.length}`);
  for (const plan of plans) {
    const label = plan.result.binding?.label ?? "Unrecognized artifact";
    console.log(`  ${path.basename(plan.read.file)}: ${label} -> ${plan.result.bindable ? "bind" : `skip(${plan.result.reason})`}`);
  }

  if (bindablePlans.length === 0) {
    console.error("No passed SENA production evidence artifacts were bindable.");
    return 1;
  }

  if (!options.yes) {
    console.log("Dry run only. Re-run with --yes to write evidence env values to Vercel.");
    for (const plan of bindablePlans) {
      for (const key of plan.result.env.keys()) {
        console.log(`    ${key}=configured(redacted)`);
      }
    }
    return 0;
  }

  assertVercelAvailable();
  for (const plan of bindablePlans) {
    writeSenaProductionEvidenceBindingPlanToVercel(options, plan.result);
  }
  console.log("SENA production evidence binding complete. Secret values were not read or printed.");
  return 0;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.exitCode = runSenaProductionEvidenceBinding(process.argv.slice(2));
}
