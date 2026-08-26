import { createHash } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { now } from "./ops-runtime";

export type SenaEnterpriseProductionRuntimeEnvPacketStatus = "ready" | "blocked";
export type SenaEnterpriseProductionRuntimeEnvPacketGroupStatus = "pass" | "blocked";

export type SenaEnterpriseProductionRuntimeEnvPacketProviderGroup = {
  id:
    | "vercel-project-custody"
    | "neon-postgres"
    | "object-storage"
    | "cdn"
    | "server-job-queue"
    | "observability-alerting"
    | "performance-clean-build"
    | "conference-load-rehearsal";
  label: string;
  status: SenaEnterpriseProductionRuntimeEnvPacketGroupStatus;
  requiredForProduction: true;
  currentBlockers: string[];
  preflightRequirementId?: string;
  preflightEnvPresent?: boolean;
  preflightMissingEnv: string[];
  canonicalEnv: string[];
  acceptedAliases: string[];
  configureCommand?: string;
  verifyCommands: string[];
  nextAction: string;
};

type SourceArtifactSummary = {
  path?: string;
  found: boolean;
  schemaVersion?: string;
  status?: string;
  generatedAt?: string;
  artifactSha256?: string;
  blockerIds: string[];
  valuesExcluded: true;
};

export type SenaEnterpriseProductionRuntimeEnvPacket = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseProductionRuntimeEnvPacket;
  generatedAt: string;
  status: SenaEnterpriseProductionRuntimeEnvPacketStatus;
  target: {
    domainConfigured: boolean;
    domainHostHash?: string;
    domainValueExcluded: true;
    scopeConfigured: boolean;
    scopeValueExcluded: true;
  };
  summary: {
    requiredProviderGroups: number;
    readyProviderGroups: number;
    blockerIds: string[];
  };
  sources: {
    preflight: SourceArtifactSummary;
    archive: SourceArtifactSummary;
  };
  providerGroups: SenaEnterpriseProductionRuntimeEnvPacketProviderGroup[];
  secureInputTemplates: {
    vercelTokenStdinPlaceholder: "<VERCEL_TOKEN>";
    neonPostgresUrlStdinPlaceholder: "<NEON_POSTGRES_URL>";
    vercelBlobProductionServicesEnvJson: Record<string, string>;
    cloudflareR2ProductionServicesEnvJson: Record<string, string>;
  };
  commandPlan: Array<{
    id: string;
    label: string;
    command: string;
    purpose: string;
    valuesExcluded: true;
  }>;
  policy: {
    researchPilotCandidate: true;
    localFileStoreIsProductionBackend: false;
    secretValuesExcluded: true;
    endpointValuesExcluded: true;
    providerValuesMustBeEnteredOutsideArtifact: true;
  };
  nextActions: string[];
  redaction: {
    secretValuesExcluded: true;
    endpointValuesExcluded: true;
    domainValueExcluded: true;
    scopeValueExcluded: true;
    sourceArtifactValuesExcluded: true;
    placeholdersOnly: true;
  };
};

type BuildProductionRuntimeEnvPacketInput = {
  domain?: string;
  vercelScope?: string;
  preflightArtifact?: unknown;
  preflightPath?: string;
  preflightArtifactSha256?: string;
  archiveArtifact?: unknown;
  archivePath?: string;
  archiveArtifactSha256?: string;
  generatedAt?: string;
};

const vercelScopePlaceholder = "<vercel-team-slug>";
const releaseEvidenceDirPlaceholder = "output/production-evidence/<release-id>";

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function validSha256(value: unknown) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function httpStatusSuccess(value: unknown) {
  const status = numberValue(value);
  return status !== undefined && status >= 200 && status < 400;
}

function hashDomainHost(domain: string | undefined) {
  if (!domain) return undefined;
  try {
    const parsed = domain.startsWith("http://") || domain.startsWith("https://")
      ? new URL(domain)
      : new URL(`https://${domain}`);
    return sha256Text(parsed.host);
  } catch {
    return undefined;
  }
}

function summarizeSourceArtifact(input: {
  artifact?: unknown;
  path?: string;
  artifactSha256?: string;
}): SourceArtifactSummary {
  if (!isRecord(input.artifact)) {
    return {
      path: input.path,
      found: false,
      artifactSha256: input.artifactSha256,
      blockerIds: [],
      valuesExcluded: true
    };
  }

  const summary = isRecord(input.artifact.summary) ? input.artifact.summary : undefined;
  return {
    path: input.path,
    found: true,
    schemaVersion: stringValue(input.artifact.schemaVersion),
    status: stringValue(input.artifact.status),
    generatedAt: stringValue(input.artifact.generatedAt),
    artifactSha256: input.artifactSha256,
    blockerIds: unique([
      ...strings(summary?.blockers),
      ...strings(summary?.productionBlockers)
    ]),
    valuesExcluded: true
  };
}

function preflightRequirementPresent(artifact: unknown, requirementId: string) {
  const requirement = preflightRequirement(artifact, requirementId);
  return requirement?.present === true;
}

function preflightRequirement(artifact: unknown, requirementId: string) {
  if (!isRecord(artifact)) return undefined;
  const env = isRecord(artifact.env) ? artifact.env : undefined;
  const requirement = records(env?.requirements).find((entry) => entry.id === requirementId);
  return requirement;
}

function preflightRequirementMissingEnv(artifact: unknown, requirementId: string) {
  const requirement = preflightRequirement(artifact, requirementId);
  if (!requirement) return [];
  if (requirement.present === true) return [];
  return strings(requirement.missing);
}

function preflightBlockers(artifact: unknown) {
  if (!isRecord(artifact)) return [];
  const summary = isRecord(artifact.summary) ? artifact.summary : undefined;
  return strings(summary?.blockers);
}

function preflightCliReady(artifact: unknown) {
  if (!isRecord(artifact)) return false;
  const cli = isRecord(artifact.cli) ? artifact.cli : undefined;
  return cli?.available === true && cli.status === "pass" && !preflightBlockers(artifact).includes("vercel-cli");
}

function preflightDeploymentReady(artifact: unknown) {
  if (!isRecord(artifact)) return false;
  const deployment = isRecord(artifact.deployment) ? artifact.deployment : undefined;
  return deployment?.status === "pass" && !preflightBlockers(artifact).includes("deployment-ready");
}

function preflightDomainReady(artifact: unknown) {
  if (!isRecord(artifact)) return false;
  const domain = isRecord(artifact.domain) ? artifact.domain : undefined;
  return domain?.status === "pass" && !preflightBlockers(artifact).includes("domain-configured");
}

function preflightEnvListReady(artifact: unknown) {
  if (!isRecord(artifact)) return false;
  const env = isRecord(artifact.env) ? artifact.env : undefined;
  return env?.attempted === true && !preflightBlockers(artifact).includes("env-list");
}

function runtimeHeaderReady(artifact: unknown) {
  if (!isRecord(artifact)) return false;
  const http = isRecord(artifact.http) ? artifact.http : undefined;
  const deployment = isRecord(artifact.deployment) ? artifact.deployment : undefined;
  const redaction = isRecord(artifact.redaction) ? artifact.redaction : undefined;
  const runtime = stringValue(http?.xSenaRuntime);
  const productionRuntime = runtime === "enterprise-neon" || runtime === "enterprise-postgres";
  return productionRuntime &&
    http?.status === "pass" &&
    http.runtimeStatus === "pass" &&
    httpStatusSuccess(http.httpStatus) &&
    validSha256(deployment?.deploymentUrlHash) &&
    redaction?.secretValuesExcluded === true &&
    redaction.envValuesExcluded === true &&
    redaction.endpointValuesHashed === true &&
    !preflightBlockers(artifact).includes("runtime-header") &&
    !preflightBlockers(artifact).includes("live-http");
}

function archiveItem(artifact: unknown, itemId: string) {
  if (!isRecord(artifact)) return undefined;
  return records(artifact.items).find((entry) => entry.id === itemId);
}

const archiveItemSchemaVersions: Record<string, string> = {
  "postgres-schema-contract": SENA_SCHEMA_VERSIONS.enterprisePostgresSchemaContract,
  "postgres-live-probe": "sena-enterprise-postgres-probe/v1",
  "object-storage-contract": SENA_SCHEMA_VERSIONS.enterpriseObjectStorageContract,
  "object-storage-live-probe": SENA_SCHEMA_VERSIONS.enterpriseObjectStorageProbe,
  "cdn-contract": SENA_SCHEMA_VERSIONS.enterpriseCdnContract,
  "cdn-live-probe": SENA_SCHEMA_VERSIONS.enterpriseCdnProbe,
  "server-job-queue-contract": SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueContract,
  "server-job-queue-live-probe": SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe,
  "server-job-worker-contract": SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerContract,
  "observability-contract": SENA_SCHEMA_VERSIONS.enterpriseObservabilityContract,
  "observability-live-probe": SENA_SCHEMA_VERSIONS.enterpriseObservabilityProbe,
  "performance-budget-artifact": SENA_SCHEMA_VERSIONS.enterpriseProductionPerformanceBudget,
  "conference-load-rehearsal": SENA_SCHEMA_VERSIONS.enterpriseConferenceLoadRehearsal
};

function archiveItemPass(artifact: unknown, itemId: string) {
  const item = archiveItem(artifact, itemId);
  if (!item) return false;
  const expectedSchemaVersion = archiveItemSchemaVersions[itemId];
  if (expectedSchemaVersion && item.artifactSchemaVersion !== expectedSchemaVersion) return false;
  if (typeof item.artifactArchiveValidation === "string" && item.artifactArchiveValidation !== "pass") return false;
  return item.status === "pass" && (item.artifactStatus === "pass" || item.artifactStatus === "ready");
}

function safeArchiveValidationReason(artifact: unknown, itemId: string) {
  const reason = stringValue(archiveItem(artifact, itemId)?.artifactArchiveValidation);
  return reason && /^[a-z0-9-]+$/.test(reason) ? reason : undefined;
}

function blockedUnless(pass: boolean, blockerIds: string[]) {
  return pass ? [] : blockerIds;
}

function providerGroup(input: Omit<SenaEnterpriseProductionRuntimeEnvPacketProviderGroup, "status" | "requiredForProduction"> & {
  pass: boolean;
}): SenaEnterpriseProductionRuntimeEnvPacketProviderGroup {
  return {
    id: input.id,
    label: input.label,
    status: input.pass ? "pass" : "blocked",
    requiredForProduction: true,
    currentBlockers: input.pass ? [] : input.currentBlockers,
    preflightRequirementId: input.preflightRequirementId,
    preflightEnvPresent: input.preflightEnvPresent,
    preflightMissingEnv: input.preflightMissingEnv,
    canonicalEnv: input.canonicalEnv,
    acceptedAliases: input.acceptedAliases,
    configureCommand: input.configureCommand,
    verifyCommands: input.verifyCommands,
    nextAction: input.pass
      ? "Keep this provider evidence attached to the production handoff."
      : input.nextAction
  };
}

export function buildEnterpriseProductionRuntimeEnvPacket(
  input: BuildProductionRuntimeEnvPacketInput = {}
): SenaEnterpriseProductionRuntimeEnvPacket {
  const generatedAt = input.generatedAt ?? now();
  const preflight = input.preflightArtifact;
  const archive = input.archiveArtifact;

  const vercelProjectCustodyReady =
    preflightCliReady(preflight) &&
    preflightDeploymentReady(preflight) &&
    preflightDomainReady(preflight) &&
    preflightEnvListReady(preflight);
  const legacyLocalFileEnvCleared = preflightRequirementPresent(preflight, "legacy-local-file-env");
  const postgresReady =
    preflightRequirementPresent(preflight, "neon-postgres-env") &&
    legacyLocalFileEnvCleared &&
    runtimeHeaderReady(preflight) &&
    archiveItemPass(archive, "postgres-schema-contract") &&
    archiveItemPass(archive, "postgres-live-probe");
  const objectStorageReady =
    preflightRequirementPresent(preflight, "object-storage-env") &&
    archiveItemPass(archive, "object-storage-contract") &&
    archiveItemPass(archive, "object-storage-live-probe");
  const cdnReady =
    preflightRequirementPresent(preflight, "cdn-evidence-env") &&
    archiveItemPass(archive, "cdn-contract") &&
    archiveItemPass(archive, "cdn-live-probe");
  const queueReady =
    preflightRequirementPresent(preflight, "server-job-queue-env") &&
    archiveItemPass(archive, "server-job-queue-contract") &&
    archiveItemPass(archive, "server-job-queue-live-probe") &&
    archiveItemPass(archive, "server-job-worker-contract");
  const observabilityReady =
    preflightRequirementPresent(preflight, "observability-env") &&
    archiveItemPass(archive, "observability-contract") &&
    archiveItemPass(archive, "observability-live-probe");
  const performanceReady = archiveItemPass(archive, "performance-budget-artifact");
  const performanceArchiveValidationReason = safeArchiveValidationReason(archive, "performance-budget-artifact");
  const performanceBlockers = unique([
    "performance-budget-artifact",
    ...(performanceArchiveValidationReason ? [performanceArchiveValidationReason] : [])
  ]);
  const conferenceLoadReady = archiveItemPass(archive, "conference-load-rehearsal");

  const providerGroups: SenaEnterpriseProductionRuntimeEnvPacketProviderGroup[] = [
    providerGroup({
      id: "vercel-project-custody",
      label: "Vercel project, domain, and env-list custody",
      pass: vercelProjectCustodyReady,
      currentBlockers: blockedUnless(vercelProjectCustodyReady, [
        ...(preflightCliReady(preflight) ? [] : ["vercel-cli"]),
        ...(preflightDeploymentReady(preflight) ? [] : ["vercel-production-deployment"]),
        ...(preflightDomainReady(preflight) ? [] : ["vercel-domain"]),
        ...(preflightEnvListReady(preflight) ? [] : ["vercel-env-list"])
      ]),
      preflightMissingEnv: [],
      canonicalEnv: [
        "VERCEL_TOKEN",
        "VERCEL_PROJECT_ID",
        "VERCEL_ORG_ID",
        "VERCEL_SCOPE"
      ],
      acceptedAliases: [
        ".vercel/project.json",
        ".vercel/repo.json"
      ],
      verifyCommands: [
        `read -rs VERCEL_TOKEN && export VERCEL_TOKEN && vercel whoami --scope ${vercelScopePlaceholder}`,
        `npm run sena:vercel:preflight -- --scope ${vercelScopePlaceholder} --output output/production-evidence/vercel-production-preflight.json`
      ],
      nextAction: "Provide a Vercel token through the environment, verify the linked sena-hk project and www.sena.hk production deployment, then rerun the Vercel preflight before writing provider env."
    }),
    providerGroup({
      id: "neon-postgres",
      label: "Neon/Postgres primary state",
      pass: postgresReady,
      currentBlockers: blockedUnless(postgresReady, [
        "neon-postgres-env",
        "legacy-local-file-env",
        "runtime-header",
        "postgres-schema-contract",
        "postgres-live-probe"
      ]),
      preflightRequirementId: "neon-postgres-env",
      preflightEnvPresent: preflightRequirementPresent(preflight, "neon-postgres-env"),
      preflightMissingEnv: unique([
        ...preflightRequirementMissingEnv(preflight, "neon-postgres-env"),
        ...preflightRequirementMissingEnv(preflight, "legacy-local-file-env")
      ]),
      canonicalEnv: [
        "SENA_ENTERPRISE_DB_ADAPTER",
        "SENA_ENTERPRISE_STATE_STORE",
        "SENA_ENTERPRISE_POSTGRES_URL"
      ],
      acceptedAliases: [
        "SENA_DATABASE_URL",
        "DATABASE_URL",
        "POSTGRES_URL",
        "POSTGRES_PRISMA_URL",
        "NEON_DATABASE_URL"
      ],
      configureCommand: `read -rs SENA_NEON_URL && printf '%s\\n' "$SENA_NEON_URL" | npm run sena:vercel:neon:configure -- --yes --postgres-url-stdin --strict-production --scope ${vercelScopePlaceholder}`,
      verifyCommands: [
        "npm run sena:postgres:schema-contract -- --output output/production-evidence/postgres-schema-contract.json",
        "npm run sena:postgres:verify -- --output output/production-evidence/postgres-probe.json",
        `npm run sena:vercel:preflight -- --scope ${vercelScopePlaceholder} --output output/production-evidence/vercel-production-preflight.json`
      ],
      nextAction: "Add the pooled Neon/Postgres URL through stdin, clear the legacy file-state env, redeploy, then generate the schema contract and verify the runtime header plus live Postgres probe."
    }),
    providerGroup({
      id: "object-storage",
      label: "Managed object storage",
      pass: objectStorageReady,
      currentBlockers: blockedUnless(objectStorageReady, ["object-storage-env", "object-storage-contract", "object-storage-live-probe"]),
      preflightRequirementId: "object-storage-env",
      preflightEnvPresent: preflightRequirementPresent(preflight, "object-storage-env"),
      preflightMissingEnv: preflightRequirementMissingEnv(preflight, "object-storage-env"),
      canonicalEnv: [
        "SENA_OBJECT_STORAGE_ADAPTER",
        "SENA_OBJECT_STORAGE_BUCKET",
        "SENA_OBJECT_STORAGE_BLOB_READ_WRITE_TOKEN",
        "SENA_OBJECT_STORAGE_CONTRACT_CONFIRMED",
        "SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_SHA256",
        "SENA_OBJECT_STORAGE_CONTRACT_VERIFIED_AT",
        "SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_VALIDATION",
        "SENA_OBJECT_STORAGE_LIVE_PROBE_CONFIRMED",
        "SENA_OBJECT_STORAGE_PROBE_ARTIFACT_SHA256",
        "SENA_OBJECT_STORAGE_PROBE_VERIFIED_AT",
        "SENA_OBJECT_STORAGE_PROBE_ARTIFACT_VALIDATION"
      ],
      acceptedAliases: [
        "BLOB_READ_WRITE_TOKEN",
        "BLOB_STORE_ID",
        "VERCEL_OIDC_TOKEN",
        "R2_ACCOUNT_ID",
        "R2_BUCKET_NAME",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY"
      ],
      configureCommand: `printf '%s\\n' '<production-services-env-json>' | npm run sena:vercel:production-services:configure -- --env-json-stdin --yes --strict-production --scope ${vercelScopePlaceholder}`,
      verifyCommands: [
        "npm run sena:object-storage:contract -- --output output/production-evidence/object-storage-contract.json",
        "npm run sena:object-storage:verify -- --output output/production-evidence/object-storage-probe.json",
        `npm run sena:production-evidence:bind -- --artifact output/production-evidence/object-storage-contract.json --scope ${vercelScopePlaceholder} --yes`,
        `npm run sena:production-evidence:bind -- --artifact output/production-evidence/object-storage-probe.json --scope ${vercelScopePlaceholder} --yes`
      ],
      nextAction: "Choose Vercel Blob or Cloudflare R2, configure production env, archive the namespace/custody contract, then prove PUT/HEAD/DELETE cleanup."
    }),
    providerGroup({
      id: "cdn",
      label: "CDN and immutable static asset evidence",
      pass: cdnReady,
      currentBlockers: blockedUnless(cdnReady, ["cdn-evidence-env", "cdn-contract", "cdn-live-probe"]),
      preflightRequirementId: "cdn-evidence-env",
      preflightEnvPresent: preflightRequirementPresent(preflight, "cdn-evidence-env"),
      preflightMissingEnv: preflightRequirementMissingEnv(preflight, "cdn-evidence-env"),
      canonicalEnv: [
        "SENA_CDN_VERIFY_URL",
        "SENA_CDN_CONTRACT_CONFIRMED",
        "SENA_CDN_CONTRACT_ARTIFACT_SHA256",
        "SENA_CDN_CONTRACT_VERIFIED_AT",
        "SENA_CDN_CONTRACT_ARTIFACT_VALIDATION",
        "SENA_CDN_LIVE_PROBE_CONFIRMED",
        "SENA_CDN_PROBE_ARTIFACT_SHA256",
        "SENA_CDN_PROBE_VERIFIED_AT",
        "SENA_CDN_PROBE_ARTIFACT_VALIDATION"
      ],
      acceptedAliases: [],
      verifyCommands: [
        "npm run sena:cdn:contract -- --output output/production-evidence/cdn-contract.json",
        "npm run sena:cdn:verify -- --output output/production-evidence/cdn-probe.json",
        `npm run sena:production-evidence:bind -- --artifact output/production-evidence/cdn-contract.json --scope ${vercelScopePlaceholder} --yes`,
        `npm run sena:production-evidence:bind -- --artifact output/production-evidence/cdn-probe.json --scope ${vercelScopePlaceholder} --yes`
      ],
      nextAction: "Archive the CDN compression/cache contract, run the CDN probe against the deployed URL, and bind the emitted artifacts to Vercel production env."
    }),
    providerGroup({
      id: "server-job-queue",
      label: "Managed server job queue and worker contract",
      pass: queueReady,
      currentBlockers: blockedUnless(queueReady, [
        "server-job-queue-env",
        "server-job-queue-contract",
        "server-job-queue-live-probe",
        "server-job-worker-contract"
      ]),
      preflightRequirementId: "server-job-queue-env",
      preflightEnvPresent: preflightRequirementPresent(preflight, "server-job-queue-env"),
      preflightMissingEnv: preflightRequirementMissingEnv(preflight, "server-job-queue-env"),
      canonicalEnv: [
        "SENA_JOB_QUEUE_ADAPTER",
        "SENA_JOB_QUEUE_SECRET",
        "SENA_JOB_WORKER_CALLBACK_URL",
        "SENA_JOB_QUEUE_CONTRACT_CONFIRMED",
        "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256",
        "SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT",
        "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION",
        "SENA_JOB_QUEUE_LIVE_PROBE_CONFIRMED",
        "SENA_JOB_QUEUE_PROBE_ARTIFACT_SHA256",
        "SENA_JOB_QUEUE_PROBE_VERIFIED_AT",
        "SENA_JOB_QUEUE_PROBE_ARTIFACT_VALIDATION",
        "SENA_JOB_WORKER_CONTRACT_CONFIRMED",
        "SENA_JOB_WORKER_CONTRACT_ARTIFACT_SHA256",
        "SENA_JOB_WORKER_CONTRACT_VERIFIED_AT",
        "SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION"
      ],
      acceptedAliases: [
        "QSTASH_TOKEN",
        "QSTASH_URL",
        "QSTASH_QUEUE_NAME"
      ],
      configureCommand: `printf '%s\\n' '<production-services-env-json>' | npm run sena:vercel:production-services:configure -- --env-json-stdin --yes --strict-production --scope ${vercelScopePlaceholder}`,
      verifyCommands: [
        "npm run sena:jobs:queue-contract -- --output output/production-evidence/server-job-queue-contract.json",
        "npm run sena:jobs:queue-verify -- --output output/production-evidence/server-job-queue-probe.json",
        "npm run sena:jobs:worker-contract -- --output output/production-evidence/server-job-worker-contract.json",
        `npm run sena:production-evidence:bind -- --artifact output/production-evidence/server-job-queue-contract.json --scope ${vercelScopePlaceholder} --yes`,
        `npm run sena:production-evidence:bind -- --artifact output/production-evidence/server-job-queue-probe.json --scope ${vercelScopePlaceholder} --yes`,
        `npm run sena:production-evidence:bind -- --artifact output/production-evidence/server-job-worker-contract.json --scope ${vercelScopePlaceholder} --yes`
      ],
      nextAction: "Configure QStash or an accepted managed queue, archive the queue contract, then prove queue acceptance and external worker ownership."
    }),
    providerGroup({
      id: "observability-alerting",
      label: "Observability exporter, dashboard, runbook, and alert owner",
      pass: observabilityReady,
      currentBlockers: blockedUnless(observabilityReady, [
        "observability-env",
        "observability-contract",
        "observability-live-probe"
      ]),
      preflightRequirementId: "observability-env",
      preflightEnvPresent: preflightRequirementPresent(preflight, "observability-env"),
      preflightMissingEnv: preflightRequirementMissingEnv(preflight, "observability-env"),
      canonicalEnv: [
        "SENA_OBSERVABILITY_PROVIDER",
        "SENA_OBSERVABILITY_EXPORTER_URL",
        "SENA_OBSERVABILITY_EXPORTER_SECRET",
        "SENA_OBSERVABILITY_DASHBOARD_URL",
        "SENA_OBSERVABILITY_RUNBOOK_URL",
        "SENA_OBSERVABILITY_OWNER",
        "SENA_OBSERVABILITY_CONTRACT_CONFIRMED",
        "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256",
        "SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT",
        "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION",
        "SENA_OBSERVABILITY_LIVE_PROBE_CONFIRMED",
        "SENA_OBSERVABILITY_PROBE_ARTIFACT_SHA256",
        "SENA_OBSERVABILITY_PROBE_VERIFIED_AT",
        "SENA_OBSERVABILITY_PROBE_ARTIFACT_VALIDATION",
        "SENA_ALERT_WEBHOOK_URL",
        "SENA_ALERT_WEBHOOK_SECRET",
        "SENA_ALERTING_OWNER"
      ],
      acceptedAliases: [
        "OBSERVABILITY_WEBHOOK_URL",
        "OBSERVABILITY_WEBHOOK_SECRET",
        "ALERT_WEBHOOK_URL",
        "ALERT_WEBHOOK_SECRET"
      ],
      configureCommand: `printf '%s\\n' '<production-services-env-json>' | npm run sena:vercel:production-services:configure -- --env-json-stdin --yes --strict-production --scope ${vercelScopePlaceholder}`,
      verifyCommands: [
        "npm run sena:observability:contract -- --output output/production-evidence/observability-contract.json",
        "npm run sena:observability:verify -- --output output/production-evidence/observability-probe.json",
        `npm run sena:production-evidence:bind -- --artifact output/production-evidence/observability-contract.json --scope ${vercelScopePlaceholder} --yes`,
        `npm run sena:production-evidence:bind -- --artifact output/production-evidence/observability-probe.json --scope ${vercelScopePlaceholder} --yes`
      ],
      nextAction: "Configure the exporter, dashboard, runbook, alert owner, and signed alert route, then archive the observability contract and run the live observability probe."
    }),
    providerGroup({
      id: "performance-clean-build",
      label: "Clean-build performance budget evidence",
      pass: performanceReady,
      currentBlockers: blockedUnless(performanceReady, performanceBlockers),
      preflightMissingEnv: [],
      canonicalEnv: [
        "SENA_PERFORMANCE_BUDGET_CONFIRMED",
        "SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256",
        "SENA_PERFORMANCE_BUDGET_VERIFIED_AT",
        "SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION",
        "SENA_PERFORMANCE_BUDGET_MEASURED_ARTIFACT_SET_SHA256",
        "SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256",
        "SENA_PERFORMANCE_BUDGET_GIT_COMMIT",
        "SENA_PERFORMANCE_BUDGET_GIT_DIRTY",
        "SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256",
        "SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE"
      ],
      acceptedAliases: [],
      verifyCommands: [
        "npm run build",
        "SENA_PERFORMANCE_BUDGET_BINDABLE_REQUIRED=1 npm run sena:performance:check -- --output output/production-evidence/performance-budget.json",
        `npm run sena:production-evidence:bind -- --artifact output/production-evidence/performance-budget.json --scope ${vercelScopePlaceholder} --yes`
      ],
      nextAction: performanceArchiveValidationReason
        ? `From a clean Git worktree, create a fresh production build, emit a strict performance artifact, and use the binder to remeasure and configure its complete env tuple; runtime readiness fails closed while any key is missing. Current archive validation reports ${performanceArchiveValidationReason}.`
        : "From a clean Git worktree, create a fresh production build, emit a strict performance artifact, and use the binder to remeasure and configure its complete env tuple; runtime readiness fails closed while any key is missing."
    }),
    providerGroup({
      id: "conference-load-rehearsal",
      label: "50-user, 30-minute conference rehearsal",
      pass: conferenceLoadReady,
      currentBlockers: blockedUnless(conferenceLoadReady, ["conference-load-rehearsal"]),
      preflightMissingEnv: [],
      canonicalEnv: [
        "SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED",
        "SENA_CONFERENCE_LOAD_REHEARSAL_ARTIFACT_SHA256",
        "SENA_CONFERENCE_LOAD_REHEARSAL_VERIFIED_AT",
        "SENA_CONFERENCE_LOAD_REHEARSAL_USERS",
        "SENA_CONFERENCE_LOAD_REHEARSAL_DURATION_SECONDS"
      ],
      acceptedAliases: [],
      verifyCommands: [
        `npm run sena:conference:prepare -- --target-url <target-url> --scope ${vercelScopePlaceholder} --preflight output/production-evidence/vercel-production-preflight.json --archive ${releaseEvidenceDirPlaceholder}/sena-production-evidence-archive.json --output output/production-evidence/conference-rehearsal-plan.json`,
        "SENA_LOAD_REQUIRE_PRODUCTION_TARGET=1 SENA_LOAD_TARGET_USERS=50 SENA_LOAD_DURATION_SECONDS=1800 SENA_LOAD_RAMP_SECONDS=120 npm run sena:conference:load-check -- --output output/production-evidence/conference-load-rehearsal.json"
      ],
      nextAction: "Run the generated rehearsal plan only after Postgres, object storage, queue, observability, CDN, and performance evidence are ready."
    })
  ];

  const blockerIds = unique(providerGroups.flatMap((group) => group.currentBlockers));
  const readyProviderGroups = providerGroups.filter((group) => group.status === "pass").length;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseProductionRuntimeEnvPacket,
    generatedAt,
    status: blockerIds.length === 0 ? "ready" : "blocked",
    target: {
      domainConfigured: Boolean(input.domain),
      domainHostHash: hashDomainHost(input.domain),
      domainValueExcluded: true,
      scopeConfigured: Boolean(input.vercelScope),
      scopeValueExcluded: true
    },
    summary: {
      requiredProviderGroups: providerGroups.length,
      readyProviderGroups,
      blockerIds
    },
    sources: {
      preflight: summarizeSourceArtifact({
        artifact: input.preflightArtifact,
        path: input.preflightPath,
        artifactSha256: input.preflightArtifactSha256
      }),
      archive: summarizeSourceArtifact({
        artifact: input.archiveArtifact,
        path: input.archivePath,
        artifactSha256: input.archiveArtifactSha256
      })
    },
    providerGroups,
    secureInputTemplates: {
      vercelTokenStdinPlaceholder: "<VERCEL_TOKEN>",
      neonPostgresUrlStdinPlaceholder: "<NEON_POSTGRES_URL>",
      vercelBlobProductionServicesEnvJson: {
        SENA_OBJECT_STORAGE_ADAPTER: "vercel-blob",
        BLOB_READ_WRITE_TOKEN: "<VERCEL_BLOB_READ_WRITE_TOKEN>",
        SENA_JOB_QUEUE_ADAPTER: "qstash",
        QSTASH_TOKEN: "<UPSTASH_QSTASH_TOKEN>",
        QSTASH_QUEUE_NAME: "<QSTASH_QUEUE_NAME>",
        SENA_JOB_WORKER_CALLBACK_URL: "<APP_URL>/api/sena/ops/jobs",
        SENA_JOB_QUEUE_SECRET: "<SENA_JOB_QUEUE_SECRET>",
        SENA_ALERTING_OWNER: "<ALERT_OWNER>",
        SENA_ALERT_WEBHOOK_URL: "<ALERT_WEBHOOK_URL>",
        SENA_ALERT_WEBHOOK_SECRET: "<ALERT_WEBHOOK_SECRET>",
        SENA_OBSERVABILITY_PROVIDER: "<OBSERVABILITY_PROVIDER>",
        SENA_OBSERVABILITY_EXPORTER_URL: "<OBSERVABILITY_EXPORTER_URL>",
        SENA_OBSERVABILITY_EXPORTER_SECRET: "<OBSERVABILITY_EXPORTER_SECRET>",
        SENA_OBSERVABILITY_DASHBOARD_URL: "<OBSERVABILITY_DASHBOARD_URL>",
        SENA_OBSERVABILITY_RUNBOOK_URL: "<OBSERVABILITY_RUNBOOK_URL>",
        SENA_OBSERVABILITY_OWNER: "<OBSERVABILITY_OWNER>"
      },
      cloudflareR2ProductionServicesEnvJson: {
        SENA_OBJECT_STORAGE_ADAPTER: "r2",
        R2_ACCOUNT_ID: "<CLOUDFLARE_R2_ACCOUNT_ID>",
        R2_BUCKET_NAME: "<CLOUDFLARE_R2_BUCKET_NAME>",
        R2_ACCESS_KEY_ID: "<CLOUDFLARE_R2_ACCESS_KEY_ID>",
        R2_SECRET_ACCESS_KEY: "<CLOUDFLARE_R2_SECRET_ACCESS_KEY>",
        SENA_JOB_QUEUE_ADAPTER: "qstash",
        QSTASH_TOKEN: "<UPSTASH_QSTASH_TOKEN>",
        QSTASH_QUEUE_NAME: "<QSTASH_QUEUE_NAME>",
        SENA_JOB_WORKER_CALLBACK_URL: "<APP_URL>/api/sena/ops/jobs",
        SENA_JOB_QUEUE_SECRET: "<SENA_JOB_QUEUE_SECRET>",
        SENA_ALERTING_OWNER: "<ALERT_OWNER>",
        SENA_ALERT_WEBHOOK_URL: "<ALERT_WEBHOOK_URL>",
        SENA_ALERT_WEBHOOK_SECRET: "<ALERT_WEBHOOK_SECRET>",
        SENA_OBSERVABILITY_PROVIDER: "<OBSERVABILITY_PROVIDER>",
        SENA_OBSERVABILITY_EXPORTER_URL: "<OBSERVABILITY_EXPORTER_URL>",
        SENA_OBSERVABILITY_EXPORTER_SECRET: "<OBSERVABILITY_EXPORTER_SECRET>",
        SENA_OBSERVABILITY_DASHBOARD_URL: "<OBSERVABILITY_DASHBOARD_URL>",
        SENA_OBSERVABILITY_RUNBOOK_URL: "<OBSERVABILITY_RUNBOOK_URL>",
        SENA_OBSERVABILITY_OWNER: "<OBSERVABILITY_OWNER>"
      }
    },
    commandPlan: [
      {
        id: "verify-vercel-custody",
        label: "Verify Vercel project custody",
        command: `read -rs VERCEL_TOKEN && export VERCEL_TOKEN && vercel whoami --scope ${vercelScopePlaceholder} && npm run sena:vercel:preflight -- --scope ${vercelScopePlaceholder} --output output/production-evidence/vercel-production-preflight.json`,
        purpose: "Confirm the CLI can access the intended Vercel team/project, production domain, and production env-name list before provider secrets are written.",
        valuesExcluded: true
      },
      {
        id: "configure-neon",
        label: "Configure Neon/Postgres production env",
        command: `read -rs SENA_NEON_URL && printf '%s\\n' "$SENA_NEON_URL" | npm run sena:vercel:neon:configure -- --yes --postgres-url-stdin --strict-production --scope ${vercelScopePlaceholder}`,
        purpose: "Write SENA_ENTERPRISE_DB_ADAPTER, SENA_ENTERPRISE_STATE_STORE, the pooled Postgres URL, public app URL env names, strict production gates, and remove the legacy file-state env from Vercel production.",
        valuesExcluded: true
      },
      {
        id: "configure-services",
        label: "Configure object storage, queue, and observability",
        command: `printf '%s\\n' '<production-services-env-json>' | npm run sena:vercel:production-services:configure -- --env-json-stdin --yes --strict-production --scope ${vercelScopePlaceholder}`,
        purpose: "Write remaining production service env names after replacing placeholders with real provider values outside this artifact.",
        valuesExcluded: true
      },
      {
        id: "deploy-production",
        label: "Redeploy Vercel production after env cutover",
        command: `vercel deploy --prod -y --no-wait --scope ${vercelScopePlaceholder}`,
        purpose: "Create a fresh production deployment so x-sena-runtime can reflect the Postgres-backed runtime instead of the old enterprise-local build.",
        valuesExcluded: true
      },
      {
        id: "verify-and-archive",
        label: "Verify and archive production evidence",
        command: `npm run sena:production-evidence:archive -- --output-dir ${releaseEvidenceDirPlaceholder} --vercel-scope ${vercelScopePlaceholder} --cdn-verify-url <target-url>`,
        purpose: "Regenerate the redacted production evidence archive after the production provider env is configured.",
        valuesExcluded: true
      },
      {
        id: "bind-ready-archive",
        label: "Bind ready archive evidence to Vercel",
        command: `npm run sena:production-evidence:bind -- --artifact ${releaseEvidenceDirPlaceholder}/sena-production-evidence-archive.json --scope ${vercelScopePlaceholder} --yes`,
        purpose: "Bind only a ready archive with matching child custody hashes.",
        valuesExcluded: true
      },
      {
        id: "final-production-gate",
        label: "Run final production go-live gate",
        command: `npm run sena:production:gate -- --scope ${vercelScopePlaceholder} --manifest output/production-evidence/sena-enterprise-production-evidence-manifest.json --preflight output/production-evidence/vercel-production-preflight.json --archive ${releaseEvidenceDirPlaceholder}/sena-production-evidence-archive.json --output output/production-evidence/production-go-live-gate.json`,
        purpose: "Require production evidence, runtime env packet, and enterprise go-live closeout to be ready before any production-ready claim.",
        valuesExcluded: true
      },
      {
        id: "bind-final-production-gate",
        label: "Bind final production gate custody",
        command: `npm run sena:production-evidence:bind -- --artifact output/production-evidence/production-go-live-gate.json --scope ${vercelScopePlaceholder}`,
        purpose: "Attach the final production gate custody hash to Vercel production env without replacing live provider evidence.",
        valuesExcluded: true
      }
    ],
    policy: {
      researchPilotCandidate: true,
      localFileStoreIsProductionBackend: false,
      secretValuesExcluded: true,
      endpointValuesExcluded: true,
      providerValuesMustBeEnteredOutsideArtifact: true
    },
    nextActions: providerGroups
      .filter((group) => group.status !== "pass")
      .map((group) => group.nextAction),
    redaction: {
      secretValuesExcluded: true,
      endpointValuesExcluded: true,
      domainValueExcluded: true,
      scopeValueExcluded: true,
      sourceArtifactValuesExcluded: true,
      placeholdersOnly: true
    }
  };
}
