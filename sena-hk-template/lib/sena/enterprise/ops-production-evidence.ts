import { enterprisePostgresProbeReadiness, enterprisePostgresSchemaContractReadiness } from "../enterprise-postgres";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { conferenceLoadRehearsalProductionEvidenceReadiness } from "./conference-load-rehearsal";
import { enterpriseCdnContractReadiness, enterpriseCdnProbeReadiness } from "./cdn-verification";
import { enterpriseObjectStorageContractReadiness, enterpriseObjectStorageProbeReadiness } from "./object-storage-adapter";
import { enterpriseObservabilityContractReadiness, enterpriseObservabilityProbeReadiness } from "./ops-observability";
import {
  envValue,
  now,
  productionEvidenceMaxAgeHours,
  productionEvidenceTimestampConfigured,
  productionEvidenceTimestampEvidenceValue,
  sha256Text
} from "./ops-runtime";
import { serverJobQueueContractReadiness, serverJobQueueProbeReadiness } from "./server-job-queue";
import { serverJobWorkerContractReadiness } from "./server-job-worker-contract";

export type SenaEnterpriseProductionEvidenceStatus = "ready" | "review" | "blocked";
export type SenaEnterpriseProductionEvidenceItemStatus = "confirmed" | "missing-required" | "missing-advisory";

export type SenaEnterpriseProductionEvidenceItem = {
  id: "vercel-production-preflight" |
    "postgres-schema-contract" |
    "postgres-live-probe" |
    "object-storage-contract" |
    "object-storage-live-probe" |
    "cdn-contract" |
    "cdn-live-probe" |
    "server-job-queue-contract" |
    "server-job-queue-live-probe" |
    "server-job-worker-contract" |
    "observability-contract" |
    "observability-live-probe" |
    "performance-budget-artifact" |
    "conference-load-rehearsal";
  label: string;
  category: "vercel" | "postgres" | "object-storage" | "cdn" | "server-job-queue" | "observability" | "performance-budget" | "conference-load";
  status: SenaEnterpriseProductionEvidenceItemStatus;
  required: boolean;
  confirmed: boolean;
  artifactHashConfigured: boolean;
  verifiedAtConfigured: boolean;
  artifactHash?: string;
  verifiedAt?: string;
  artifactSchema: string;
  api: string;
  command: string;
  env: {
    required: string;
    confirmed: string;
    artifactSha256: string;
    verifiedAt: string;
    artifactValidation?: string;
  };
  evidence: string[];
  nextAction: string;
};

export type SenaEnterpriseProductionEvidenceAdvisoryItem = {
  id: "production-runtime-env-packet" | "production-go-live-gate";
  label: string;
  category: "production-handoff";
  status: SenaEnterpriseProductionEvidenceItemStatus;
  required: boolean;
  confirmed: boolean;
  artifactHashConfigured: boolean;
  verifiedAtConfigured: boolean;
  artifactHash?: string;
  verifiedAt?: string;
  packetStatus?: "blocked" | "ready";
  gateStatus?: "blocked" | "ready";
  productionReadyClaimAllowed?: boolean;
  readyProviderGroups?: number;
  requiredProviderGroups?: number;
  passedChecks?: number;
  totalChecks?: number;
  artifactSchema: string;
  command: string;
  env: {
    required: string;
    confirmed: string;
    artifactSha256: string;
    verifiedAt: string;
  };
  evidence: string[];
  nextAction: string;
};

export type SenaEnterpriseProductionEvidenceManifest = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceManifest;
  generatedAt: string;
  status: SenaEnterpriseProductionEvidenceStatus;
  summary: {
    evidenceItems: number;
    confirmed: number;
    missing: number;
    missingRequired: number;
    missingAdvisory: number;
    performanceBudgetConfirmed: boolean;
    conferenceLoadConfirmed: boolean;
    advisoryItems: number;
    advisoryConfirmed: number;
    productionRuntimeEnvPacketConfirmed: boolean;
    productionRuntimeEnvPacketStatus?: "blocked" | "ready";
    productionRuntimeEnvPacketReadyProviderGroups?: number;
    productionRuntimeEnvPacketRequiredProviderGroups?: number;
    productionGoLiveGateConfirmed: boolean;
    productionGoLiveGateStatus?: "blocked" | "ready";
    productionGoLiveGateReadyClaimAllowed?: boolean;
    productionGoLiveGatePassedChecks?: number;
    productionGoLiveGateTotalChecks?: number;
    manifestRequired: boolean;
  };
  policy: {
    localFileStoreIsProductionBackend: false;
    requiredScalePath: "vercel-runtime-header-postgres-object-storage-cdn-job-queue-observability";
    artifactCustody: "archive-redacted-probe-json-plus-sha256";
    secretValuesExcluded: true;
    endpointValuesHashed: true;
  };
  export: {
    api: "/api/sena/ops/production-evidence";
    filename: "sena-enterprise-production-evidence-manifest.json";
  };
  items: SenaEnterpriseProductionEvidenceItem[];
  advisoryItems: SenaEnterpriseProductionEvidenceAdvisoryItem[];
  evidence: string[];
  nextActions: string[];
  redaction: {
    secretValuesExcluded: true;
    endpointValuesHashed: true;
    rawProbePayloadValuesExcluded: true;
  };
};

function booleanEnv(key: string) {
  const value = envValue(key)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function validSha256(value: string | undefined): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function validGitCommit(value: string | undefined) {
  return Boolean(value && /^[a-f0-9]{40}$/i.test(value));
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

function vercelProductionPreflightMetadataReady() {
  return vercelProductionPreflightTargetHostReady(envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_TARGET_HOST_SHA256")) &&
    validSha256(envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_DEPLOYMENT_URL_SHA256")) &&
    validHttpSuccessStatus(envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_HTTP_STATUS")) &&
    validProductionRuntimeHeader(envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_RUNTIME_HEADER"));
}

function productionEvidenceManifestRequired() {
  return booleanEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED") ||
    booleanEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH") ||
    booleanEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED");
}

function productionRuntimeRequired() {
  return process.env.NODE_ENV === "production";
}

function productionPerformanceBudgetArtifactRequired() {
  return productionRuntimeRequired() ||
    productionEvidenceManifestRequired() ||
    booleanEnv("SENA_PERFORMANCE_BUDGET_ARTIFACT_REQUIRED");
}

function vercelProductionPreflightRequired() {
  return productionRuntimeRequired() ||
    productionEvidenceManifestRequired() ||
    booleanEnv("SENA_VERCEL_PRODUCTION_PREFLIGHT_REQUIRED");
}

function performanceBudgetBuildIdentityReady() {
  return validSha256(envValue("SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256")) &&
    validGitCommit(envValue("SENA_PERFORMANCE_BUDGET_GIT_COMMIT")) &&
    envValue("SENA_PERFORMANCE_BUDGET_GIT_DIRTY") === "false" &&
    validSha256(envValue("SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256"));
}

function evidenceStatus(input: { required: boolean; confirmed: boolean }): SenaEnterpriseProductionEvidenceItemStatus {
  if (input.confirmed) return "confirmed";
  return input.required ? "missing-required" : "missing-advisory";
}

function buildEvidenceItem(input: {
  id: SenaEnterpriseProductionEvidenceItem["id"];
  label: string;
  category: SenaEnterpriseProductionEvidenceItem["category"];
  required: boolean;
  confirmed: boolean;
  artifactHash?: string;
  verifiedAt?: string;
  artifactSchema: string;
  api: string;
  command: string;
  env: SenaEnterpriseProductionEvidenceItem["env"];
  evidence: string[];
  nextAction: string;
}): SenaEnterpriseProductionEvidenceItem {
  const artifactHashConfigured = validSha256(input.artifactHash);
  const verifiedAtConfigured = productionEvidenceTimestampConfigured(input.verifiedAt);
  const confirmed = input.confirmed && artifactHashConfigured && verifiedAtConfigured;
  return {
    id: input.id,
    label: input.label,
    category: input.category,
    status: evidenceStatus({ required: input.required, confirmed }),
    required: input.required,
    confirmed,
    artifactHashConfigured,
    verifiedAtConfigured,
    artifactHash: artifactHashConfigured ? input.artifactHash?.toLowerCase() : undefined,
    verifiedAt: verifiedAtConfigured ? input.verifiedAt : undefined,
    artifactSchema: input.artifactSchema,
    api: input.api,
    command: input.command,
    env: input.env,
    evidence: [
      ...input.evidence,
      `productionEvidenceItem=${input.id}`,
      `productionEvidenceConfirmed=${confirmed}`,
      `productionEvidenceArtifactSha256=${artifactHashConfigured ? "present" : "missing-or-invalid"}`,
      `productionEvidenceVerifiedAt=${productionEvidenceTimestampEvidenceValue(input.verifiedAt)}`
    ],
    nextAction: confirmed ? `Keep ${input.label.toLowerCase()} artifact archived with this release.` : input.nextAction
  };
}

function buildAdvisoryItem(input: {
  id: SenaEnterpriseProductionEvidenceAdvisoryItem["id"];
  label: string;
  category: SenaEnterpriseProductionEvidenceAdvisoryItem["category"];
  required: boolean;
  confirmed: boolean;
  artifactHash?: string;
  verifiedAt?: string;
  packetStatus?: "blocked" | "ready";
  gateStatus?: "blocked" | "ready";
  productionReadyClaimAllowed?: boolean;
  readyProviderGroups?: number;
  requiredProviderGroups?: number;
  passedChecks?: number;
  totalChecks?: number;
  artifactSchema: string;
  command: string;
  env: SenaEnterpriseProductionEvidenceAdvisoryItem["env"];
  evidence: string[];
  nextAction: string;
}): SenaEnterpriseProductionEvidenceAdvisoryItem {
  const artifactHashConfigured = validSha256(input.artifactHash);
  const verifiedAtConfigured = productionEvidenceTimestampConfigured(input.verifiedAt);
  const confirmed = input.confirmed && artifactHashConfigured && verifiedAtConfigured;
  return {
    id: input.id,
    label: input.label,
    category: input.category,
    status: evidenceStatus({ required: input.required, confirmed }),
    required: input.required,
    confirmed,
    artifactHashConfigured,
    verifiedAtConfigured,
    artifactHash: artifactHashConfigured ? input.artifactHash?.toLowerCase() : undefined,
    verifiedAt: verifiedAtConfigured ? input.verifiedAt : undefined,
    packetStatus: input.packetStatus,
    gateStatus: input.gateStatus,
    productionReadyClaimAllowed: input.productionReadyClaimAllowed,
    readyProviderGroups: input.readyProviderGroups,
    requiredProviderGroups: input.requiredProviderGroups,
    passedChecks: input.passedChecks,
    totalChecks: input.totalChecks,
    artifactSchema: input.artifactSchema,
    command: input.command,
    env: input.env,
    evidence: [
      ...input.evidence,
      `productionEvidenceAdvisoryItem=${input.id}`,
      `productionEvidenceAdvisoryConfirmed=${confirmed}`,
      `productionEvidenceAdvisoryArtifactSha256=${artifactHashConfigured ? "present" : "missing-or-invalid"}`,
      `productionEvidenceAdvisoryVerifiedAt=${productionEvidenceTimestampEvidenceValue(input.verifiedAt)}`
    ],
    nextAction: confirmed ? `Keep ${input.label.toLowerCase()} archived with this production handoff.` : input.nextAction
  };
}

function productionRuntimeEnvPacketStatus() {
  const value = envValue("SENA_PRODUCTION_RUNTIME_ENV_PACKET_STATUS");
  return value === "blocked" || value === "ready" ? value : undefined;
}

function productionGoLiveGateStatus() {
  const value = envValue("SENA_PRODUCTION_GO_LIVE_GATE_STATUS");
  return value === "blocked" || value === "ready" ? value : undefined;
}

function booleanStatusEnv(key: string) {
  const value = envValue(key)?.toLowerCase();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return undefined;
}

function nonNegativeIntegerEnv(key: string) {
  const value = envValue(key);
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function buildEnterpriseProductionEvidenceManifest(): SenaEnterpriseProductionEvidenceManifest {
  const postgres = enterprisePostgresProbeReadiness();
  const postgresSchemaContract = enterprisePostgresSchemaContractReadiness();
  const objectStorageContract = enterpriseObjectStorageContractReadiness();
  const objectStorage = enterpriseObjectStorageProbeReadiness();
  const cdnContract = enterpriseCdnContractReadiness();
  const cdn = enterpriseCdnProbeReadiness();
  const serverJobQueueContract = serverJobQueueContractReadiness();
  const serverJobQueue = serverJobQueueProbeReadiness();
  const serverJobWorkerContract = serverJobWorkerContractReadiness();
  const observabilityContract = enterpriseObservabilityContractReadiness();
  const observability = enterpriseObservabilityProbeReadiness();
  const conferenceLoad = conferenceLoadRehearsalProductionEvidenceReadiness();
  const manifestRequired = productionEvidenceManifestRequired();
  const performanceBudgetRequired = productionPerformanceBudgetArtifactRequired();
  const productionRuntimeEnvPacketRequired = booleanEnv("SENA_PRODUCTION_RUNTIME_ENV_PACKET_REQUIRED");
  const productionGoLiveGateRequired = booleanEnv("SENA_PRODUCTION_GO_LIVE_GATE_REQUIRED");
  const runtimeEnvPacketStatus = productionRuntimeEnvPacketStatus();
  const runtimeEnvPacketReadyProviderGroups = nonNegativeIntegerEnv("SENA_PRODUCTION_RUNTIME_ENV_PACKET_READY_PROVIDER_GROUPS");
  const runtimeEnvPacketRequiredProviderGroups = nonNegativeIntegerEnv("SENA_PRODUCTION_RUNTIME_ENV_PACKET_REQUIRED_PROVIDER_GROUPS");
  const productionGoLiveGateStatusValue = productionGoLiveGateStatus();
  const productionGoLiveGateReadyClaimAllowed = booleanStatusEnv("SENA_PRODUCTION_GO_LIVE_GATE_PRODUCTION_READY");
  const productionGoLiveGatePassedChecks = nonNegativeIntegerEnv("SENA_PRODUCTION_GO_LIVE_GATE_PASSED_CHECKS");
  const productionGoLiveGateTotalChecks = nonNegativeIntegerEnv("SENA_PRODUCTION_GO_LIVE_GATE_TOTAL_CHECKS");
  const vercelPreflightTargetHostHash = envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_TARGET_HOST_SHA256");
  const vercelPreflightDeploymentUrlHash = envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_DEPLOYMENT_URL_SHA256");
  const vercelPreflightHttpStatus = envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_HTTP_STATUS");
  const vercelPreflightRuntimeHeader = envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_RUNTIME_HEADER");
  const vercelPreflightMetadataReady = vercelProductionPreflightMetadataReady();
  const productionGoLiveGateMetadataReady =
    productionGoLiveGateStatusValue !== undefined &&
    productionGoLiveGateReadyClaimAllowed !== undefined &&
    productionGoLiveGatePassedChecks !== undefined &&
    productionGoLiveGateTotalChecks !== undefined;

  const items = [
    buildEvidenceItem({
      id: "vercel-production-preflight",
      label: "Vercel production deployment preflight",
      category: "vercel",
      required: vercelProductionPreflightRequired(),
      confirmed: booleanEnv("SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED") && vercelPreflightMetadataReady,
      artifactHash: envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_ARTIFACT_SHA256"),
      verifiedAt: envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_VERIFIED_AT"),
      artifactSchema: SENA_SCHEMA_VERSIONS.enterpriseVercelProductionPreflight,
      api: "cli:npm run sena:vercel:preflight",
      command: "npm run sena:vercel:preflight",
      env: {
        required: "SENA_VERCEL_PRODUCTION_PREFLIGHT_REQUIRED",
        confirmed: "SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED",
        artifactSha256: "SENA_VERCEL_PRODUCTION_PREFLIGHT_ARTIFACT_SHA256",
        verifiedAt: "SENA_VERCEL_PRODUCTION_PREFLIGHT_VERIFIED_AT"
      },
      evidence: [
        `vercelProductionPreflightRequired=${vercelProductionPreflightRequired()}`,
        `vercelProductionPreflightConfirmed=${booleanEnv("SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED")}`,
        `vercelProductionPreflightExplicitlyRequired=${booleanEnv("SENA_VERCEL_PRODUCTION_PREFLIGHT_REQUIRED")}`,
        `vercelProductionPreflightProductionRuntime=${productionRuntimeRequired()}`,
        `vercelProductionPreflightManifestRequired=${manifestRequired}`,
        `vercelProductionPreflightArtifactSha256=${validSha256(envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_ARTIFACT_SHA256")) ? "present" : "missing-or-invalid"}`,
        `vercelProductionPreflightVerifiedAt=${productionEvidenceTimestampEvidenceValue(envValue("SENA_VERCEL_PRODUCTION_PREFLIGHT_VERIFIED_AT"))}`,
        `vercelProductionPreflightMetadataReady=${vercelPreflightMetadataReady}`,
        `vercelProductionPreflightTargetHostSha256=${vercelProductionPreflightTargetHostReady(vercelPreflightTargetHostHash) ? "www.sena.hk" : "missing-or-mismatch"}`,
        `vercelProductionPreflightDeploymentUrlSha256=${validSha256(vercelPreflightDeploymentUrlHash) ? "present" : "missing-or-invalid"}`,
        `vercelProductionPreflightHttpStatus=${validHttpSuccessStatus(vercelPreflightHttpStatus) ? "success" : "missing-or-non-success"}`,
        `vercelProductionPreflightRuntimeHeader=${validProductionRuntimeHeader(vercelPreflightRuntimeHeader) ? vercelPreflightRuntimeHeader : "missing-or-local"}`,
        `vercelProductionPreflightSchema=${SENA_SCHEMA_VERSIONS.enterpriseVercelProductionPreflight}`,
        "vercelProductionPreflightCommand=npm run sena:vercel:preflight",
        "vercelProductionPreflightChecks=deployment-ready|domain-configured|env-list|live-http|runtime-header"
      ],
      nextAction: "Run npm run sena:vercel:preflight against www.sena.hk after configuring Vercel production env, archive the redacted JSON artifact, and set SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED with its sha256, verified-at timestamp, target host hash, deployment URL hash, HTTP status, and runtime header."
    }),
    buildEvidenceItem({
      id: "postgres-schema-contract",
      label: "Managed Postgres schema contract",
      category: "postgres",
      required: manifestRequired || postgresSchemaContract.required,
      confirmed: postgresSchemaContract.confirmed,
      artifactHash: postgresSchemaContract.artifactHash,
      verifiedAt: postgresSchemaContract.verifiedAt,
      artifactSchema: SENA_SCHEMA_VERSIONS.enterprisePostgresSchemaContract,
      api: "cli:npm run sena:postgres:schema-contract",
      command: "npm run sena:postgres:schema-contract",
      env: {
        required: "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_REQUIRED",
        confirmed: "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_CONFIRMED",
        artifactSha256: "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_SHA256",
        verifiedAt: "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_VERIFIED_AT",
        artifactValidation: "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_VALIDATION"
      },
      evidence: postgresSchemaContract.evidence,
      nextAction: "Run npm run sena:postgres:schema-contract, archive the redacted DDL/index contract artifact, and bind the Postgres schema-contract confirmation, sha256, verified-at, and artifact-validation env values before relying on live probe evidence."
    }),
    buildEvidenceItem({
      id: "postgres-live-probe",
      label: "Managed Postgres live DDL/DML/read/delete probe",
      category: "postgres",
      required: manifestRequired || postgres.required,
      confirmed: postgres.confirmed,
      artifactHash: postgres.artifactHash,
      verifiedAt: postgres.verifiedAt,
      artifactSchema: SENA_SCHEMA_VERSIONS.enterprisePostgresProbe,
      api: "/api/sena/ops/postgres",
      command: "npm run sena:postgres:verify",
      env: {
        required: "SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_REQUIRED",
        confirmed: "SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_CONFIRMED",
        artifactSha256: "SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_SHA256",
        verifiedAt: "SENA_ENTERPRISE_POSTGRES_PROBE_VERIFIED_AT",
        artifactValidation: "SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_VALIDATION"
      },
      evidence: postgres.evidence,
      nextAction: "Run npm run sena:postgres:verify, archive the redacted JSON artifact, and bind the Postgres probe confirmation, sha256, verified-at, and artifact-validation env values."
    }),
    buildEvidenceItem({
      id: "object-storage-contract",
      label: "Managed object-storage namespace and custody contract",
      category: "object-storage",
      required: manifestRequired || objectStorageContract.required,
      confirmed: objectStorageContract.confirmed,
      artifactHash: objectStorageContract.artifactHash,
      verifiedAt: objectStorageContract.verifiedAt,
      artifactSchema: SENA_SCHEMA_VERSIONS.enterpriseObjectStorageContract,
      api: "cli:npm run sena:object-storage:contract",
      command: "npm run sena:object-storage:contract",
      env: {
        required: "SENA_OBJECT_STORAGE_CONTRACT_REQUIRED",
        confirmed: "SENA_OBJECT_STORAGE_CONTRACT_CONFIRMED",
        artifactSha256: "SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_SHA256",
        verifiedAt: "SENA_OBJECT_STORAGE_CONTRACT_VERIFIED_AT",
        artifactValidation: "SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_VALIDATION"
      },
      evidence: objectStorageContract.evidence,
      nextAction: "Run npm run sena:object-storage:contract, archive the redacted namespace/custody contract artifact, and bind the object-storage contract confirmation, sha256, verified-at, and artifact-validation env values before relying on live probe evidence."
    }),
    buildEvidenceItem({
      id: "object-storage-live-probe",
      label: "Managed object-storage PUT/HEAD/DELETE probe",
      category: "object-storage",
      required: manifestRequired || objectStorage.required,
      confirmed: objectStorage.confirmed,
      artifactHash: objectStorage.artifactHash,
      verifiedAt: objectStorage.verifiedAt,
      artifactSchema: SENA_SCHEMA_VERSIONS.enterpriseObjectStorageProbe,
      api: "/api/sena/ops/object-storage",
      command: "npm run sena:object-storage:verify",
      env: {
        required: "SENA_OBJECT_STORAGE_LIVE_PROBE_REQUIRED",
        confirmed: "SENA_OBJECT_STORAGE_LIVE_PROBE_CONFIRMED",
        artifactSha256: "SENA_OBJECT_STORAGE_PROBE_ARTIFACT_SHA256",
        verifiedAt: "SENA_OBJECT_STORAGE_PROBE_VERIFIED_AT",
        artifactValidation: "SENA_OBJECT_STORAGE_PROBE_ARTIFACT_VALIDATION"
      },
      evidence: objectStorage.evidence,
      nextAction: "Run npm run sena:object-storage:verify, archive the redacted JSON artifact, and bind the object-storage probe confirmation, sha256, verified-at, and artifact-validation env values."
    }),
    buildEvidenceItem({
      id: "cdn-contract",
      label: "CDN compression and immutable-cache contract",
      category: "cdn",
      required: manifestRequired || cdnContract.required,
      confirmed: cdnContract.confirmed,
      artifactHash: cdnContract.artifactHash,
      verifiedAt: cdnContract.verifiedAt,
      artifactSchema: SENA_SCHEMA_VERSIONS.enterpriseCdnContract,
      api: "cli:npm run sena:cdn:contract",
      command: "npm run sena:cdn:contract",
      env: {
        required: "SENA_CDN_CONTRACT_REQUIRED",
        confirmed: "SENA_CDN_CONTRACT_CONFIRMED",
        artifactSha256: "SENA_CDN_CONTRACT_ARTIFACT_SHA256",
        verifiedAt: "SENA_CDN_CONTRACT_VERIFIED_AT",
        artifactValidation: "SENA_CDN_CONTRACT_ARTIFACT_VALIDATION"
      },
      evidence: cdnContract.evidence,
      nextAction: "Run npm run sena:cdn:contract, archive the redacted compression/cache contract artifact, and bind the CDN contract confirmation, sha256, verified-at, and artifact-validation env values before relying on live CDN probe evidence."
    }),
    buildEvidenceItem({
      id: "cdn-live-probe",
      label: "CDN compression and immutable static asset probe",
      category: "cdn",
      required: manifestRequired || cdn.required,
      confirmed: cdn.confirmed,
      artifactHash: cdn.artifactHash,
      verifiedAt: cdn.verifiedAt,
      artifactSchema: SENA_SCHEMA_VERSIONS.enterpriseCdnProbe,
      api: "/api/sena/ops/cdn",
      command: "npm run sena:cdn:verify",
      env: {
        required: "SENA_CDN_LIVE_PROBE_REQUIRED",
        confirmed: "SENA_CDN_LIVE_PROBE_CONFIRMED",
        artifactSha256: "SENA_CDN_PROBE_ARTIFACT_SHA256",
        verifiedAt: "SENA_CDN_PROBE_VERIFIED_AT",
        artifactValidation: "SENA_CDN_PROBE_ARTIFACT_VALIDATION"
      },
      evidence: cdn.evidence,
      nextAction: "Run npm run sena:cdn:verify against the deployed CDN, archive the redacted JSON artifact, and bind the CDN probe confirmation, sha256, verified-at, and artifact-validation env values."
    }),
    buildEvidenceItem({
      id: "server-job-queue-contract",
      label: "Managed server job queue dispatch and custody contract",
      category: "server-job-queue",
      required: manifestRequired || serverJobQueueContract.required,
      confirmed: serverJobQueueContract.confirmed,
      artifactHash: serverJobQueueContract.artifactHash,
      verifiedAt: serverJobQueueContract.verifiedAt,
      artifactSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueContract,
      api: "cli:npm run sena:jobs:queue-contract",
      command: "npm run sena:jobs:queue-contract",
      env: {
        required: "SENA_JOB_QUEUE_CONTRACT_REQUIRED",
        confirmed: "SENA_JOB_QUEUE_CONTRACT_CONFIRMED",
        artifactSha256: "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256",
        verifiedAt: "SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT",
        artifactValidation: "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION"
      },
      evidence: serverJobQueueContract.evidence,
      nextAction: "Run npm run sena:jobs:queue-contract, archive the redacted dispatch/custody contract artifact, and bind the server job queue contract confirmation, sha256, verified-at, and artifact-validation env values before relying on live queue probe evidence."
    }),
    buildEvidenceItem({
      id: "server-job-queue-live-probe",
      label: "Managed server job queue signed dispatch probe",
      category: "server-job-queue",
      required: manifestRequired || serverJobQueue.required,
      confirmed: serverJobQueue.confirmed,
      artifactHash: serverJobQueue.artifactHash,
      verifiedAt: serverJobQueue.verifiedAt,
      artifactSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe,
      api: "/api/sena/ops/jobs/probe",
      command: "npm run sena:jobs:queue-verify",
      env: {
        required: "SENA_JOB_QUEUE_LIVE_PROBE_REQUIRED",
        confirmed: "SENA_JOB_QUEUE_LIVE_PROBE_CONFIRMED",
        artifactSha256: "SENA_JOB_QUEUE_PROBE_ARTIFACT_SHA256",
        verifiedAt: "SENA_JOB_QUEUE_PROBE_VERIFIED_AT",
        artifactValidation: "SENA_JOB_QUEUE_PROBE_ARTIFACT_VALIDATION"
      },
      evidence: serverJobQueue.evidence,
      nextAction: "Run npm run sena:jobs:queue-verify, archive the redacted JSON artifact, and bind the server job queue probe confirmation, sha256, verified-at, and artifact-validation env values."
    }),
    buildEvidenceItem({
      id: "server-job-worker-contract",
      label: "External server job worker contract",
      category: "server-job-queue",
      required: serverJobWorkerContract.required,
      confirmed: serverJobWorkerContract.confirmed,
      artifactHash: serverJobWorkerContract.artifactHash,
      verifiedAt: serverJobWorkerContract.verifiedAt,
      artifactSchema: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerContract,
      api: "/api/sena/ops/jobs/worker-contract",
      command: "npm run sena:jobs:worker-contract",
      env: {
        required: "SENA_JOB_WORKER_CONTRACT_REQUIRED",
        confirmed: "SENA_JOB_WORKER_CONTRACT_CONFIRMED",
        artifactSha256: "SENA_JOB_WORKER_CONTRACT_ARTIFACT_SHA256",
        verifiedAt: "SENA_JOB_WORKER_CONTRACT_VERIFIED_AT",
        artifactValidation: "SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION"
      },
      evidence: serverJobWorkerContract.evidence,
      nextAction: "Run npm run sena:jobs:worker-contract after configuring the managed queue, Postgres job store, worker callback, owner, runbook, and heartbeat artifact; then bind SENA_JOB_WORKER_CONTRACT_CONFIRMED with its sha256, verified-at timestamp, and artifact-validation pass."
    }),
    buildEvidenceItem({
      id: "observability-contract",
      label: "Observability SLI, alerting, and exporter contract",
      category: "observability",
      required: manifestRequired || observabilityContract.required,
      confirmed: observabilityContract.confirmed,
      artifactHash: observabilityContract.artifactHash,
      verifiedAt: observabilityContract.verifiedAt,
      artifactSchema: SENA_SCHEMA_VERSIONS.enterpriseObservabilityContract,
      api: "cli:npm run sena:observability:contract",
      command: "npm run sena:observability:contract",
      env: {
        required: "SENA_OBSERVABILITY_CONTRACT_REQUIRED",
        confirmed: "SENA_OBSERVABILITY_CONTRACT_CONFIRMED",
        artifactSha256: "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256",
        verifiedAt: "SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT",
        artifactValidation: "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION"
      },
      evidence: observabilityContract.evidence,
      nextAction: "Run npm run sena:observability:contract, archive the redacted SLI/alerting/exporter contract artifact, and bind the observability contract confirmation, sha256, verified-at, and artifact-validation env values before relying on live observability probe evidence."
    }),
    buildEvidenceItem({
      id: "observability-live-probe",
      label: "Observability exporter signed delivery probe",
      category: "observability",
      required: manifestRequired || observability.required,
      confirmed: observability.confirmed,
      artifactHash: observability.artifactHash,
      verifiedAt: observability.verifiedAt,
      artifactSchema: SENA_SCHEMA_VERSIONS.enterpriseObservabilityProbe,
      api: "/api/sena/ops/observability/probe",
      command: "npm run sena:observability:verify",
      env: {
        required: "SENA_OBSERVABILITY_LIVE_PROBE_REQUIRED",
        confirmed: "SENA_OBSERVABILITY_LIVE_PROBE_CONFIRMED",
        artifactSha256: "SENA_OBSERVABILITY_PROBE_ARTIFACT_SHA256",
        verifiedAt: "SENA_OBSERVABILITY_PROBE_VERIFIED_AT",
        artifactValidation: "SENA_OBSERVABILITY_PROBE_ARTIFACT_VALIDATION"
      },
      evidence: observability.evidence,
      nextAction: "Run npm run sena:observability:verify, archive the redacted JSON artifact, and bind the observability probe confirmation, sha256, verified-at, and artifact-validation env values."
    }),
    buildEvidenceItem({
      id: "performance-budget-artifact",
      label: "Production performance budget",
      category: "performance-budget",
      required: performanceBudgetRequired,
      confirmed: booleanEnv("SENA_PERFORMANCE_BUDGET_CONFIRMED") && performanceBudgetBuildIdentityReady(),
      artifactHash: envValue("SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256"),
      verifiedAt: envValue("SENA_PERFORMANCE_BUDGET_VERIFIED_AT"),
      artifactSchema: SENA_SCHEMA_VERSIONS.enterpriseProductionPerformanceBudget,
      api: "cli:npm run sena:performance:check",
      command: "npm run sena:performance:check",
      env: {
        required: "SENA_PERFORMANCE_BUDGET_ARTIFACT_REQUIRED",
        confirmed: "SENA_PERFORMANCE_BUDGET_CONFIRMED",
        artifactSha256: "SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256",
        verifiedAt: "SENA_PERFORMANCE_BUDGET_VERIFIED_AT"
      },
      evidence: [
        `performanceBudgetRequired=${performanceBudgetRequired}`,
        `performanceBudgetConfirmed=${booleanEnv("SENA_PERFORMANCE_BUDGET_CONFIRMED")}`,
        `performanceBudgetExplicitlyRequired=${booleanEnv("SENA_PERFORMANCE_BUDGET_ARTIFACT_REQUIRED")}`,
        `performanceBudgetProductionRuntime=${productionRuntimeRequired()}`,
        `performanceBudgetProductionPerformancePathRequired=${booleanEnv("SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH")}`,
        `performanceBudgetProductionEvidenceManifestRequired=${booleanEnv("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED")}`,
        `performanceBudgetSaasOperatingModelApproved=${booleanEnv("SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED")}`,
        `performanceBudgetArtifactSha256=${validSha256(envValue("SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256")) ? "present" : "missing-or-invalid"}`,
        `performanceBudgetVerifiedAt=${productionEvidenceTimestampEvidenceValue(envValue("SENA_PERFORMANCE_BUDGET_VERIFIED_AT"))}`,
        `performanceBudgetBuildIdentityReady=${performanceBudgetBuildIdentityReady()}`,
        `performanceBudgetNextBuildIdSha256=${validSha256(envValue("SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256")) ? "present" : "missing-or-invalid"}`,
        `performanceBudgetGitCommit=${validGitCommit(envValue("SENA_PERFORMANCE_BUDGET_GIT_COMMIT")) ? "present" : "missing-or-invalid"}`,
        `performanceBudgetGitDirtyClean=${envValue("SENA_PERFORMANCE_BUDGET_GIT_DIRTY") === "false"}`,
        `performanceBudgetPackageLockSha256=${validSha256(envValue("SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256")) ? "present" : "missing-or-invalid"}`,
        `performanceBudgetSchema=${SENA_SCHEMA_VERSIONS.enterpriseProductionPerformanceBudget}`,
        "performanceBudgetCommand=npm run sena:performance:check"
      ],
      nextAction: "Run npm run sena:performance:check after a clean production build, archive the redacted performance budget JSON artifact, and bind it through npm run sena:production-evidence:bind so artifact hash, verified-at, Next build ID hash, git commit, clean status, and package-lock hash are all attached."
    }),
    buildEvidenceItem({
      id: "conference-load-rehearsal",
      label: "Conference load rehearsal",
      category: "conference-load",
      required: manifestRequired || conferenceLoad.required,
      confirmed: conferenceLoad.confirmed,
      artifactHash: conferenceLoad.artifactHash,
      verifiedAt: conferenceLoad.verifiedAt,
      artifactSchema: SENA_SCHEMA_VERSIONS.enterpriseConferenceLoadRehearsal,
      api: "cli:npm run sena:conference:load-check",
      command: "npm run sena:conference:load-check",
      env: {
        required: "SENA_CONFERENCE_LOAD_REHEARSAL_REQUIRED",
        confirmed: "SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED",
        artifactSha256: "SENA_CONFERENCE_LOAD_REHEARSAL_ARTIFACT_SHA256",
        verifiedAt: "SENA_CONFERENCE_LOAD_REHEARSAL_VERIFIED_AT"
      },
      evidence: [
        ...conferenceLoad.evidence,
        `conferenceLoadUsers=${Number.isFinite(conferenceLoad.users) ? conferenceLoad.users : "missing"}`,
        `conferenceLoadDurationSeconds=${Number.isFinite(conferenceLoad.durationSeconds) ? conferenceLoad.durationSeconds : "missing"}`,
        `conferenceLoadP95Ms=${Number.isFinite(conferenceLoad.p95Ms) ? conferenceLoad.p95Ms : "missing"}`,
        `conferenceLoadErrorRatePercent=${Number.isFinite(conferenceLoad.errorRatePercent) ? conferenceLoad.errorRatePercent : "missing"}`
      ],
      nextAction: "Run SENA_LOAD_REQUIRE_PRODUCTION_TARGET=1 SENA_LOAD_TARGET_USERS=50 SENA_LOAD_DURATION_SECONDS=1800 npm run sena:conference:load-check against the deployed URL, archive the redacted JSON artifact, and set SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED with its sha256, verified-at timestamp, users, duration, p95, and error-rate metadata."
    })
  ];
  const advisoryItems = [
    buildAdvisoryItem({
      id: "production-runtime-env-packet",
      label: "Production runtime env packet",
      category: "production-handoff",
      required: productionRuntimeEnvPacketRequired,
      confirmed: booleanEnv("SENA_PRODUCTION_RUNTIME_ENV_PACKET_CONFIRMED"),
      artifactHash: envValue("SENA_PRODUCTION_RUNTIME_ENV_PACKET_ARTIFACT_SHA256"),
      verifiedAt: envValue("SENA_PRODUCTION_RUNTIME_ENV_PACKET_VERIFIED_AT"),
      packetStatus: runtimeEnvPacketStatus,
      readyProviderGroups: runtimeEnvPacketReadyProviderGroups,
      requiredProviderGroups: runtimeEnvPacketRequiredProviderGroups,
      artifactSchema: SENA_SCHEMA_VERSIONS.enterpriseProductionRuntimeEnvPacket,
      command: "npm run sena:production-env:packet",
      env: {
        required: "SENA_PRODUCTION_RUNTIME_ENV_PACKET_REQUIRED",
        confirmed: "SENA_PRODUCTION_RUNTIME_ENV_PACKET_CONFIRMED",
        artifactSha256: "SENA_PRODUCTION_RUNTIME_ENV_PACKET_ARTIFACT_SHA256",
        verifiedAt: "SENA_PRODUCTION_RUNTIME_ENV_PACKET_VERIFIED_AT"
      },
      evidence: [
        `productionRuntimeEnvPacketRequired=${productionRuntimeEnvPacketRequired}`,
        `productionRuntimeEnvPacketConfirmed=${booleanEnv("SENA_PRODUCTION_RUNTIME_ENV_PACKET_CONFIRMED")}`,
        `productionRuntimeEnvPacketArtifactSha256=${validSha256(envValue("SENA_PRODUCTION_RUNTIME_ENV_PACKET_ARTIFACT_SHA256")) ? "present" : "missing-or-invalid"}`,
        `productionRuntimeEnvPacketVerifiedAt=${productionEvidenceTimestampEvidenceValue(envValue("SENA_PRODUCTION_RUNTIME_ENV_PACKET_VERIFIED_AT"))}`,
        `productionRuntimeEnvPacketStatus=${runtimeEnvPacketStatus ?? "missing-or-invalid"}`,
        `productionRuntimeEnvPacketReadyProviderGroups=${runtimeEnvPacketReadyProviderGroups ?? "missing-or-invalid"}`,
        `productionRuntimeEnvPacketRequiredProviderGroups=${runtimeEnvPacketRequiredProviderGroups ?? "missing-or-invalid"}`,
        `productionRuntimeEnvPacketSchema=${SENA_SCHEMA_VERSIONS.enterpriseProductionRuntimeEnvPacket}`,
        "productionRuntimeEnvPacketCommand=npm run sena:production-env:packet",
        "productionRuntimeEnvPacketPurpose=redacted-provider-env-handoff",
        "productionRuntimeEnvPacketSecretValues=excluded",
        "productionRuntimeEnvPacketReadinessEvidence=advisory-not-provider-pass"
      ],
      nextAction: "Run npm run sena:production-env:packet, archive the redacted packet JSON artifact, and bind it through npm run sena:production-evidence:bind so the production handoff records the current provider-env blockers without exposing values."
    }),
    buildAdvisoryItem({
      id: "production-go-live-gate",
      label: "Production go-live gate",
      category: "production-handoff",
      required: productionGoLiveGateRequired,
      confirmed: booleanEnv("SENA_PRODUCTION_GO_LIVE_GATE_CONFIRMED") && productionGoLiveGateMetadataReady,
      artifactHash: envValue("SENA_PRODUCTION_GO_LIVE_GATE_ARTIFACT_SHA256"),
      verifiedAt: envValue("SENA_PRODUCTION_GO_LIVE_GATE_VERIFIED_AT"),
      gateStatus: productionGoLiveGateStatusValue,
      productionReadyClaimAllowed: productionGoLiveGateReadyClaimAllowed,
      passedChecks: productionGoLiveGatePassedChecks,
      totalChecks: productionGoLiveGateTotalChecks,
      artifactSchema: SENA_SCHEMA_VERSIONS.enterpriseProductionGoLiveGate,
      command: "npm run sena:production:gate",
      env: {
        required: "SENA_PRODUCTION_GO_LIVE_GATE_REQUIRED",
        confirmed: "SENA_PRODUCTION_GO_LIVE_GATE_CONFIRMED",
        artifactSha256: "SENA_PRODUCTION_GO_LIVE_GATE_ARTIFACT_SHA256",
        verifiedAt: "SENA_PRODUCTION_GO_LIVE_GATE_VERIFIED_AT"
      },
      evidence: [
        `productionGoLiveGateRequired=${productionGoLiveGateRequired}`,
        `productionGoLiveGateConfirmed=${booleanEnv("SENA_PRODUCTION_GO_LIVE_GATE_CONFIRMED")}`,
        `productionGoLiveGateArtifactSha256=${validSha256(envValue("SENA_PRODUCTION_GO_LIVE_GATE_ARTIFACT_SHA256")) ? "present" : "missing-or-invalid"}`,
        `productionGoLiveGateVerifiedAt=${productionEvidenceTimestampEvidenceValue(envValue("SENA_PRODUCTION_GO_LIVE_GATE_VERIFIED_AT"))}`,
        `productionGoLiveGateStatus=${productionGoLiveGateStatusValue ?? "missing-or-invalid"}`,
        `productionGoLiveGateProductionReadyClaimAllowed=${productionGoLiveGateReadyClaimAllowed ?? "missing-or-invalid"}`,
        `productionGoLiveGatePassedChecks=${productionGoLiveGatePassedChecks ?? "missing-or-invalid"}`,
        `productionGoLiveGateTotalChecks=${productionGoLiveGateTotalChecks ?? "missing-or-invalid"}`,
        `productionGoLiveGateMetadataReady=${productionGoLiveGateMetadataReady}`,
        `productionGoLiveGateSchema=${SENA_SCHEMA_VERSIONS.enterpriseProductionGoLiveGate}`,
        "productionGoLiveGateCommand=npm run sena:production:gate",
        "productionGoLiveGatePurpose=final-production-ready-claim-custody",
        "productionGoLiveGateSecretValues=excluded",
        "productionGoLiveGateReadinessEvidence=advisory-not-provider-pass"
      ],
      nextAction: "Run npm run sena:production:gate, archive the redacted gate JSON artifact, and bind it through npm run sena:production-evidence:bind so the production handoff records whether a production-ready claim is allowed."
    })
  ];
  const missingRequired = items.filter((item) => item.status === "missing-required").length;
  const missingRequiredAdvisory = advisoryItems.filter((item) => item.status === "missing-required").length;
  const missingAdvisory = items.filter((item) => item.status === "missing-advisory").length;
  const confirmed = items.filter((item) => item.status === "confirmed").length;
  const advisoryConfirmed = advisoryItems.filter((item) => item.status === "confirmed").length;
  const performanceBudgetConfirmed = items.find((item) => item.id === "performance-budget-artifact")?.confirmed ?? false;
  const conferenceLoadConfirmed = items.find((item) => item.id === "conference-load-rehearsal")?.confirmed ?? false;
  const productionRuntimeEnvPacketConfirmed =
    advisoryItems.find((item) => item.id === "production-runtime-env-packet")?.confirmed ?? false;
  const productionGoLiveGateConfirmed =
    advisoryItems.find((item) => item.id === "production-go-live-gate")?.confirmed ?? false;
  const status: SenaEnterpriseProductionEvidenceStatus = missingRequired + missingRequiredAdvisory > 0
    ? "blocked"
    : confirmed === items.length
      ? "ready"
      : "review";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceManifest,
    generatedAt: now(),
    status,
    summary: {
      evidenceItems: items.length,
      confirmed,
      missing: items.length - confirmed,
      missingRequired: missingRequired + missingRequiredAdvisory,
      missingAdvisory,
      performanceBudgetConfirmed,
      conferenceLoadConfirmed,
      advisoryItems: advisoryItems.length,
      advisoryConfirmed,
      productionRuntimeEnvPacketConfirmed,
      productionRuntimeEnvPacketStatus: runtimeEnvPacketStatus,
      productionRuntimeEnvPacketReadyProviderGroups: runtimeEnvPacketReadyProviderGroups,
      productionRuntimeEnvPacketRequiredProviderGroups: runtimeEnvPacketRequiredProviderGroups,
      productionGoLiveGateConfirmed,
      productionGoLiveGateStatus: productionGoLiveGateStatusValue,
      productionGoLiveGateReadyClaimAllowed: productionGoLiveGateReadyClaimAllowed,
      productionGoLiveGatePassedChecks: productionGoLiveGatePassedChecks,
      productionGoLiveGateTotalChecks: productionGoLiveGateTotalChecks,
      manifestRequired
    },
    policy: {
      localFileStoreIsProductionBackend: false,
      requiredScalePath: "vercel-runtime-header-postgres-object-storage-cdn-job-queue-observability",
      artifactCustody: "archive-redacted-probe-json-plus-sha256",
      secretValuesExcluded: true,
      endpointValuesHashed: true
    },
    export: {
      api: "/api/sena/ops/production-evidence",
      filename: "sena-enterprise-production-evidence-manifest.json"
    },
    items,
    advisoryItems,
    evidence: [
      `productionEvidenceManifestRequired=${manifestRequired}`,
      `productionEvidenceStatus=${status}`,
      `productionEvidenceConfirmed=${confirmed}`,
      `productionEvidenceMissingRequired=${missingRequired + missingRequiredAdvisory}`,
      `productionEvidenceMissingAdvisory=${missingAdvisory}`,
      `productionEvidenceAdvisoryItems=${advisoryItems.length}`,
      `productionEvidenceAdvisoryConfirmed=${advisoryConfirmed}`,
      `productionRuntimeEnvPacketConfirmed=${productionRuntimeEnvPacketConfirmed}`,
      `productionRuntimeEnvPacketStatus=${runtimeEnvPacketStatus ?? "missing-or-invalid"}`,
      `productionRuntimeEnvPacketProviderGroups=${
        runtimeEnvPacketReadyProviderGroups !== undefined && runtimeEnvPacketRequiredProviderGroups !== undefined
          ? `${runtimeEnvPacketReadyProviderGroups}/${runtimeEnvPacketRequiredProviderGroups}`
          : "missing-or-invalid"
      }`,
      `productionGoLiveGateConfirmed=${productionGoLiveGateConfirmed}`,
      `productionGoLiveGateStatus=${productionGoLiveGateStatusValue ?? "missing-or-invalid"}`,
      `productionGoLiveGateProductionReadyClaimAllowed=${productionGoLiveGateReadyClaimAllowed ?? "missing-or-invalid"}`,
      `productionGoLiveGateChecks=${
        productionGoLiveGatePassedChecks !== undefined && productionGoLiveGateTotalChecks !== undefined
          ? `${productionGoLiveGatePassedChecks}/${productionGoLiveGateTotalChecks}`
          : "missing-or-invalid"
      }`,
      `productionEvidenceMaxAgeHours=${productionEvidenceMaxAgeHours()}`,
      `performanceBudgetConfirmed=${performanceBudgetConfirmed}`,
      `conferenceLoadConfirmed=${conferenceLoadConfirmed}`,
      "localFileStoreProductionBackend=false",
      "artifactValues=sha256-only",
      "secretValues=excluded",
      "endpointValues=hashed"
    ],
    nextActions: [
      ...items
        .filter((item) => item.status !== "confirmed")
        .map((item) => item.nextAction),
      ...advisoryItems
        .filter((item) => item.status !== "confirmed")
        .map((item) => item.nextAction)
    ].filter((action): action is string => Boolean(action)),
    redaction: {
      secretValuesExcluded: true,
      endpointValuesHashed: true,
      rawProbePayloadValuesExcluded: true
    }
  };
}
