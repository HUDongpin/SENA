import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

const envNames = [
  "NODE_ENV",
  "SENA_PRODUCTION_EVIDENCE_MAX_AGE_HOURS",
  "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED",
  "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH",
  "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_REQUIRED",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_ARTIFACT_SHA256",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_VERIFIED_AT",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_TARGET_HOST_SHA256",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_DEPLOYMENT_URL_SHA256",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_HTTP_STATUS",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_RUNTIME_HEADER",
  "SENA_PERFORMANCE_BUDGET_ARTIFACT_REQUIRED",
  "SENA_PERFORMANCE_BUDGET_CONFIRMED",
  "SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256",
  "SENA_PERFORMANCE_BUDGET_VERIFIED_AT",
  "SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION",
  "SENA_PERFORMANCE_BUDGET_MEASURED_ARTIFACT_SET_SHA256",
  "SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256",
  "SENA_PERFORMANCE_BUDGET_GIT_COMMIT",
  "SENA_PERFORMANCE_BUDGET_GIT_DIRTY",
  "SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256",
  "SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE",
  "SENA_OPS_TOKEN",
  "SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_REQUIRED",
  "SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_CONFIRMED",
  "SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_SHA256",
  "SENA_ENTERPRISE_POSTGRES_PROBE_VERIFIED_AT",
  "SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_VALIDATION",
  "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_REQUIRED",
  "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_CONFIRMED",
  "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_SHA256",
  "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_VERIFIED_AT",
  "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_OBJECT_STORAGE_CONTRACT_REQUIRED",
  "SENA_OBJECT_STORAGE_CONTRACT_CONFIRMED",
  "SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_SHA256",
  "SENA_OBJECT_STORAGE_CONTRACT_VERIFIED_AT",
  "SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_OBJECT_STORAGE_LIVE_PROBE_REQUIRED",
  "SENA_OBJECT_STORAGE_LIVE_PROBE_CONFIRMED",
  "SENA_OBJECT_STORAGE_PROBE_ARTIFACT_SHA256",
  "SENA_OBJECT_STORAGE_PROBE_VERIFIED_AT",
  "SENA_OBJECT_STORAGE_PROBE_ARTIFACT_VALIDATION",
  "SENA_CDN_CONTRACT_REQUIRED",
  "SENA_CDN_CONTRACT_CONFIRMED",
  "SENA_CDN_CONTRACT_ARTIFACT_SHA256",
  "SENA_CDN_CONTRACT_VERIFIED_AT",
  "SENA_CDN_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_CDN_LIVE_PROBE_REQUIRED",
  "SENA_CDN_LIVE_PROBE_CONFIRMED",
  "SENA_CDN_PROBE_ARTIFACT_SHA256",
  "SENA_CDN_PROBE_VERIFIED_AT",
  "SENA_CDN_PROBE_ARTIFACT_VALIDATION",
  "SENA_JOB_QUEUE_CONTRACT_REQUIRED",
  "SENA_JOB_QUEUE_CONTRACT_CONFIRMED",
  "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256",
  "SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT",
  "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_JOB_QUEUE_LIVE_PROBE_REQUIRED",
  "SENA_JOB_QUEUE_LIVE_PROBE_CONFIRMED",
  "SENA_JOB_QUEUE_PROBE_ARTIFACT_SHA256",
  "SENA_JOB_QUEUE_PROBE_VERIFIED_AT",
  "SENA_JOB_QUEUE_PROBE_ARTIFACT_VALIDATION",
  "SENA_JOB_WORKER_CONTRACT_REQUIRED",
  "SENA_JOB_WORKER_CONTRACT_CONFIRMED",
  "SENA_JOB_WORKER_CONTRACT_ARTIFACT_SHA256",
  "SENA_JOB_WORKER_CONTRACT_VERIFIED_AT",
  "SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_OBSERVABILITY_CONTRACT_REQUIRED",
  "SENA_OBSERVABILITY_CONTRACT_CONFIRMED",
  "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256",
  "SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT",
  "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_OBSERVABILITY_LIVE_PROBE_REQUIRED",
  "SENA_OBSERVABILITY_LIVE_PROBE_CONFIRMED",
  "SENA_OBSERVABILITY_PROBE_ARTIFACT_SHA256",
  "SENA_OBSERVABILITY_PROBE_VERIFIED_AT",
  "SENA_OBSERVABILITY_PROBE_ARTIFACT_VALIDATION",
  "SENA_CONFERENCE_LOAD_REHEARSAL_REQUIRED",
  "SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED",
  "SENA_CONFERENCE_LOAD_REHEARSAL_ARTIFACT_SHA256",
  "SENA_CONFERENCE_LOAD_REHEARSAL_VERIFIED_AT",
  "SENA_CONFERENCE_LOAD_REHEARSAL_USERS",
  "SENA_CONFERENCE_LOAD_REHEARSAL_DURATION_SECONDS",
  "SENA_CONFERENCE_LOAD_REHEARSAL_P95_MS",
  "SENA_CONFERENCE_LOAD_REHEARSAL_ERROR_RATE_PERCENT",
  "SENA_PRODUCTION_RUNTIME_ENV_PACKET_REQUIRED",
  "SENA_PRODUCTION_RUNTIME_ENV_PACKET_CONFIRMED",
  "SENA_PRODUCTION_RUNTIME_ENV_PACKET_ARTIFACT_SHA256",
  "SENA_PRODUCTION_RUNTIME_ENV_PACKET_VERIFIED_AT",
  "SENA_PRODUCTION_RUNTIME_ENV_PACKET_STATUS",
  "SENA_PRODUCTION_RUNTIME_ENV_PACKET_READY_PROVIDER_GROUPS",
  "SENA_PRODUCTION_RUNTIME_ENV_PACKET_REQUIRED_PROVIDER_GROUPS",
  "SENA_PRODUCTION_GO_LIVE_GATE_REQUIRED",
  "SENA_PRODUCTION_GO_LIVE_GATE_CONFIRMED",
  "SENA_PRODUCTION_GO_LIVE_GATE_ARTIFACT_SHA256",
  "SENA_PRODUCTION_GO_LIVE_GATE_VERIFIED_AT",
  "SENA_PRODUCTION_GO_LIVE_GATE_STATUS",
  "SENA_PRODUCTION_GO_LIVE_GATE_PRODUCTION_READY",
  "SENA_PRODUCTION_GO_LIVE_GATE_PASSED_CHECKS",
  "SENA_PRODUCTION_GO_LIVE_GATE_TOTAL_CHECKS"
];

const providerArtifactValidationEnvNames = [
  "SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_VALIDATION",
  "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_OBJECT_STORAGE_PROBE_ARTIFACT_VALIDATION",
  "SENA_CDN_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_CDN_PROBE_ARTIFACT_VALIDATION",
  "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_JOB_QUEUE_PROBE_ARTIFACT_VALIDATION",
  "SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_OBSERVABILITY_PROBE_ARTIFACT_VALIDATION"
];

const providerEvidenceItemIds = [
  "postgres-schema-contract",
  "postgres-live-probe",
  "object-storage-contract",
  "object-storage-live-probe",
  "cdn-contract",
  "cdn-live-probe",
  "server-job-queue-contract",
  "server-job-queue-live-probe",
  "server-job-worker-contract",
  "observability-contract",
  "observability-live-probe"
];

function cleanSpawnEnv(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  const env = { ...process.env };
  for (const name of envNames) delete env[name];
  Object.assign(env, overrides);
  return env;
}

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function configureConfirmedProductionEvidence() {
  const verifiedAt = new Date().toISOString();
  process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED = "1";
  process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_ARTIFACT_SHA256 = "8".repeat(64);
  process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_VERIFIED_AT = verifiedAt;
  process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_TARGET_HOST_SHA256 = sha256Text("www.sena.hk");
  process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_DEPLOYMENT_URL_SHA256 = "7".repeat(64);
  process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_HTTP_STATUS = "200";
  process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_RUNTIME_HEADER = "enterprise-neon";
  process.env.SENA_PERFORMANCE_BUDGET_CONFIRMED = "1";
  process.env.SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256 = "f".repeat(64);
  process.env.SENA_PERFORMANCE_BUDGET_VERIFIED_AT = verifiedAt;
  process.env.SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION = "sena-enterprise-production-performance-budget/v2";
  process.env.SENA_PERFORMANCE_BUDGET_MEASURED_ARTIFACT_SET_SHA256 = "9".repeat(64);
  process.env.SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256 = "6".repeat(64);
  process.env.SENA_PERFORMANCE_BUDGET_GIT_COMMIT = "5".repeat(40);
  process.env.SENA_PERFORMANCE_BUDGET_GIT_DIRTY = "false";
  process.env.SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256 = "4".repeat(64);
  process.env.SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE = "git-clean-worktree";
  process.env.SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_CONFIRMED = "1";
  process.env.SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_SHA256 = "a".repeat(64);
  process.env.SENA_ENTERPRISE_POSTGRES_PROBE_VERIFIED_AT = verifiedAt;
  process.env.SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_CONFIRMED = "1";
  process.env.SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_SHA256 = "1".repeat(64);
  process.env.SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_VERIFIED_AT = verifiedAt;
  process.env.SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_OBJECT_STORAGE_CONTRACT_CONFIRMED = "1";
  process.env.SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_SHA256 = "2".repeat(64);
  process.env.SENA_OBJECT_STORAGE_CONTRACT_VERIFIED_AT = verifiedAt;
  process.env.SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_OBJECT_STORAGE_LIVE_PROBE_CONFIRMED = "1";
  process.env.SENA_OBJECT_STORAGE_PROBE_ARTIFACT_SHA256 = "b".repeat(64);
  process.env.SENA_OBJECT_STORAGE_PROBE_VERIFIED_AT = verifiedAt;
  process.env.SENA_OBJECT_STORAGE_PROBE_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_CDN_CONTRACT_CONFIRMED = "1";
  process.env.SENA_CDN_CONTRACT_ARTIFACT_SHA256 = "3".repeat(64);
  process.env.SENA_CDN_CONTRACT_VERIFIED_AT = verifiedAt;
  process.env.SENA_CDN_CONTRACT_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_CDN_LIVE_PROBE_CONFIRMED = "1";
  process.env.SENA_CDN_PROBE_ARTIFACT_SHA256 = "c".repeat(64);
  process.env.SENA_CDN_PROBE_VERIFIED_AT = verifiedAt;
  process.env.SENA_CDN_PROBE_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_JOB_QUEUE_CONTRACT_CONFIRMED = "1";
  process.env.SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256 = "6".repeat(64);
  process.env.SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT = verifiedAt;
  process.env.SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_JOB_QUEUE_LIVE_PROBE_CONFIRMED = "1";
  process.env.SENA_JOB_QUEUE_PROBE_ARTIFACT_SHA256 = "d".repeat(64);
  process.env.SENA_JOB_QUEUE_PROBE_VERIFIED_AT = verifiedAt;
  process.env.SENA_JOB_QUEUE_PROBE_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_JOB_WORKER_CONTRACT_CONFIRMED = "1";
  process.env.SENA_JOB_WORKER_CONTRACT_ARTIFACT_SHA256 = "7".repeat(64);
  process.env.SENA_JOB_WORKER_CONTRACT_VERIFIED_AT = verifiedAt;
  process.env.SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_OBSERVABILITY_CONTRACT_CONFIRMED = "1";
  process.env.SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256 = "0".repeat(64);
  process.env.SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT = verifiedAt;
  process.env.SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_OBSERVABILITY_LIVE_PROBE_CONFIRMED = "1";
  process.env.SENA_OBSERVABILITY_PROBE_ARTIFACT_SHA256 = "e".repeat(64);
  process.env.SENA_OBSERVABILITY_PROBE_VERIFIED_AT = verifiedAt;
  process.env.SENA_OBSERVABILITY_PROBE_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED = "1";
  process.env.SENA_CONFERENCE_LOAD_REHEARSAL_ARTIFACT_SHA256 = "9".repeat(64);
  process.env.SENA_CONFERENCE_LOAD_REHEARSAL_VERIFIED_AT = verifiedAt;
  process.env.SENA_CONFERENCE_LOAD_REHEARSAL_USERS = "50";
  process.env.SENA_CONFERENCE_LOAD_REHEARSAL_DURATION_SECONDS = "1800";
  process.env.SENA_CONFERENCE_LOAD_REHEARSAL_P95_MS = "750";
  process.env.SENA_CONFERENCE_LOAD_REHEARSAL_ERROR_RATE_PERCENT = "0";
}

describe("SENA production evidence manifest", () => {
  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    vi.resetModules();
  });

  it("keeps the manifest under review without an authenticated external worker callback receipt", async () => {
    configureConfirmedProductionEvidence();

    const { buildEnterpriseProductionEvidenceManifest } = await import("../enterprise/ops-production-evidence");
    const manifest = buildEnterpriseProductionEvidenceManifest();
    const serialized = JSON.stringify(manifest);

    expect(manifest.schemaVersion).toBe("sena-enterprise-production-evidence-manifest/v1");
    expect(manifest.status).toBe("review");
    expect(manifest.summary).toEqual(expect.objectContaining({
      evidenceItems: 14,
      confirmed: 13,
      missing: 1,
      missingRequired: 0,
      missingAdvisory: 1,
      advisoryItems: 2,
      advisoryConfirmed: 0,
      productionRuntimeEnvPacketConfirmed: false,
      productionGoLiveGateConfirmed: false,
      performanceBudgetConfirmed: true,
      conferenceLoadConfirmed: true
    }));
    expect(manifest.policy.localFileStoreIsProductionBackend).toBe(false);
    expect(manifest.items.map((item) => item.status)).toEqual([
      "confirmed",
      "confirmed",
      "confirmed",
      "confirmed",
      "confirmed",
      "confirmed",
      "confirmed",
      "confirmed",
      "confirmed",
      "missing-advisory",
      "confirmed",
      "confirmed",
      "confirmed",
      "confirmed"
    ]);
    const workerContract = manifest.items.find((item) => item.id === "server-job-worker-contract");
    expect(workerContract).toEqual(expect.objectContaining({
      confirmed: false,
      status: "missing-advisory",
      artifactHash: "7".repeat(64)
    }));
    expect(workerContract?.evidence).toEqual(expect.arrayContaining([
      "serverJobWorkerExternalCallbackReceiptSupported=false",
      "serverJobWorkerExternalCallbackReceiptConfirmed=false"
    ]));
    expect(workerContract?.nextAction).toContain("same-process status-store self-test cannot confirm");
    expect(manifest.items.map((item) => item.artifactHash)).toEqual([
      "8".repeat(64),
      "1".repeat(64),
      "a".repeat(64),
      "2".repeat(64),
      "b".repeat(64),
      "3".repeat(64),
      "c".repeat(64),
      "6".repeat(64),
      "d".repeat(64),
      "7".repeat(64),
      "0".repeat(64),
      "e".repeat(64),
      "f".repeat(64),
      "9".repeat(64)
    ]);
    expect(manifest.advisoryItems).toEqual([
      expect.objectContaining({
        id: "production-runtime-env-packet",
        status: "missing-advisory",
        required: false,
        confirmed: false,
        artifactSchema: "sena-enterprise-production-runtime-env-packet/v1"
      }),
      expect.objectContaining({
        id: "production-go-live-gate",
        status: "missing-advisory",
        required: false,
        confirmed: false,
        artifactSchema: "sena-enterprise-production-go-live-gate/v1"
      })
    ]);
    expect(serialized).not.toContain("postgres://");
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("sena-test-secret");
    expect(serialized).not.toContain("SENA_JOB_QUEUE_SECRET");
  });

  it("does not confirm provider evidence without bind-validated artifact metadata", async () => {
    configureConfirmedProductionEvidence();
    for (const name of providerArtifactValidationEnvNames) delete process.env[name];

    const { buildEnterpriseProductionEvidenceManifest } = await import("../enterprise/ops-production-evidence");
    const manifest = buildEnterpriseProductionEvidenceManifest();
    const providerItems = manifest.items.filter((item) => providerEvidenceItemIds.includes(item.id));

    expect(manifest.status).toBe("review");
    expect(manifest.summary).toEqual(expect.objectContaining({
      evidenceItems: 14,
      confirmed: 3,
      missing: 11,
      missingRequired: 0,
      performanceBudgetConfirmed: true,
      conferenceLoadConfirmed: true
    }));
    expect(providerItems).toHaveLength(providerEvidenceItemIds.length);
    expect(providerItems.every((item) => item.confirmed === false)).toBe(true);
    expect(providerItems.every((item) => item.status === "missing-advisory")).toBe(true);
    expect(providerItems.flatMap((item) => item.evidence)).toEqual(expect.arrayContaining([
      "postgresProbeArtifactValidation=missing-or-invalid",
      "objectStorageProbeArtifactValidation=missing-or-invalid",
      "cdnProbeArtifactValidation=missing-or-invalid",
      "serverJobQueueProbeArtifactValidation=missing-or-invalid",
      "serverJobWorkerContractArtifactValidation=missing-or-invalid",
      "observabilityProbeArtifactValidation=missing-or-invalid"
    ]));
  });

  it("requires Vercel preflight target, deployment, HTTP, and runtime metadata before confirming production evidence", async () => {
    const verifiedAt = new Date().toISOString();
    process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_REQUIRED = "1";
    process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED = "1";
    process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_ARTIFACT_SHA256 = "8".repeat(64);
    process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_VERIFIED_AT = verifiedAt;

    const { buildEnterpriseProductionEvidenceManifest } = await import("../enterprise/ops-production-evidence");
    const missingMetadataManifest = buildEnterpriseProductionEvidenceManifest();
    const missingMetadataItem = missingMetadataManifest.items.find((item) => item.id === "vercel-production-preflight");

    expect(missingMetadataItem).toEqual(expect.objectContaining({
      required: true,
      status: "missing-required",
      artifactHashConfigured: true,
      verifiedAtConfigured: true,
      confirmed: false
    }));
    expect(missingMetadataItem?.evidence).toEqual(expect.arrayContaining([
      "vercelProductionPreflightConfirmed=true",
      "vercelProductionPreflightMetadataReady=false",
      "vercelProductionPreflightTargetHostSha256=missing-or-mismatch",
      "vercelProductionPreflightDeploymentUrlSha256=missing-or-invalid",
      "vercelProductionPreflightHttpStatus=missing-or-non-success",
      "vercelProductionPreflightRuntimeHeader=missing-or-local"
    ]));

    process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_TARGET_HOST_SHA256 = sha256Text("www.sena.hk");
    process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_DEPLOYMENT_URL_SHA256 = "7".repeat(64);
    process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_HTTP_STATUS = "200";
    process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_RUNTIME_HEADER = "enterprise-postgres";

    const confirmedManifest = buildEnterpriseProductionEvidenceManifest();
    const confirmedItem = confirmedManifest.items.find((item) => item.id === "vercel-production-preflight");

    expect(confirmedItem).toEqual(expect.objectContaining({
      required: true,
      status: "confirmed",
      confirmed: true
    }));
    expect(confirmedItem?.evidence).toEqual(expect.arrayContaining([
      "vercelProductionPreflightMetadataReady=true",
      "vercelProductionPreflightTargetHostSha256=www.sena.hk",
      "vercelProductionPreflightDeploymentUrlSha256=present",
      "vercelProductionPreflightHttpStatus=success",
      "vercelProductionPreflightRuntimeHeader=enterprise-postgres"
    ]));
  });

  it("tracks a confirmed production runtime env packet as advisory custody without replacing live probes", async () => {
    configureConfirmedProductionEvidence();
    const verifiedAt = new Date().toISOString();
    process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_CONFIRMED = "1";
    process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_ARTIFACT_SHA256 = "1".repeat(64);
    process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_VERIFIED_AT = verifiedAt;
    process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_STATUS = "blocked";
    process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_READY_PROVIDER_GROUPS = "1";
    process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_REQUIRED_PROVIDER_GROUPS = "8";

    const { buildEnterpriseProductionEvidenceManifest } = await import("../enterprise/ops-production-evidence");
    const manifest = buildEnterpriseProductionEvidenceManifest();
    const packet = manifest.advisoryItems.find((item) => item.id === "production-runtime-env-packet");

    expect(manifest.status).toBe("review");
    expect(manifest.summary).toEqual(expect.objectContaining({
      evidenceItems: 14,
      confirmed: 13,
      missing: 1,
      missingAdvisory: 1,
      advisoryItems: 2,
      advisoryConfirmed: 1,
      productionRuntimeEnvPacketConfirmed: true,
      productionRuntimeEnvPacketStatus: "blocked",
      productionRuntimeEnvPacketReadyProviderGroups: 1,
      productionRuntimeEnvPacketRequiredProviderGroups: 8
    }));
    expect(packet).toEqual(expect.objectContaining({
      status: "confirmed",
      required: false,
      artifactHash: "1".repeat(64),
      verifiedAt,
      packetStatus: "blocked",
      readyProviderGroups: 1,
      requiredProviderGroups: 8
    }));
    expect(packet?.evidence).toEqual(expect.arrayContaining([
      "productionRuntimeEnvPacketStatus=blocked",
      "productionRuntimeEnvPacketReadyProviderGroups=1",
      "productionRuntimeEnvPacketRequiredProviderGroups=8",
      "productionRuntimeEnvPacketReadinessEvidence=advisory-not-provider-pass",
      "productionEvidenceAdvisoryConfirmed=true"
    ]));
    expect(manifest.evidence).toEqual(expect.arrayContaining([
      "productionRuntimeEnvPacketStatus=blocked",
      "productionRuntimeEnvPacketProviderGroups=1/8"
    ]));
  });

  it("tracks a confirmed production go-live gate as advisory claim custody without replacing live probes", async () => {
    configureConfirmedProductionEvidence();
    const verifiedAt = new Date().toISOString();
    process.env.SENA_PRODUCTION_GO_LIVE_GATE_CONFIRMED = "1";
    process.env.SENA_PRODUCTION_GO_LIVE_GATE_ARTIFACT_SHA256 = "2".repeat(64);
    process.env.SENA_PRODUCTION_GO_LIVE_GATE_VERIFIED_AT = verifiedAt;
    process.env.SENA_PRODUCTION_GO_LIVE_GATE_STATUS = "blocked";
    process.env.SENA_PRODUCTION_GO_LIVE_GATE_PRODUCTION_READY = "false";
    process.env.SENA_PRODUCTION_GO_LIVE_GATE_PASSED_CHECKS = "0";
    process.env.SENA_PRODUCTION_GO_LIVE_GATE_TOTAL_CHECKS = "3";

    const { buildEnterpriseProductionEvidenceManifest } = await import("../enterprise/ops-production-evidence");
    const manifest = buildEnterpriseProductionEvidenceManifest();
    const gate = manifest.advisoryItems.find((item) => item.id === "production-go-live-gate");

    expect(manifest.status).toBe("review");
    expect(manifest.summary).toEqual(expect.objectContaining({
      evidenceItems: 14,
      confirmed: 13,
      missing: 1,
      missingAdvisory: 1,
      advisoryItems: 2,
      advisoryConfirmed: 1,
      productionGoLiveGateConfirmed: true,
      productionGoLiveGateStatus: "blocked",
      productionGoLiveGateReadyClaimAllowed: false,
      productionGoLiveGatePassedChecks: 0,
      productionGoLiveGateTotalChecks: 3
    }));
    expect(gate).toEqual(expect.objectContaining({
      status: "confirmed",
      required: false,
      artifactHash: "2".repeat(64),
      verifiedAt,
      gateStatus: "blocked",
      productionReadyClaimAllowed: false,
      passedChecks: 0,
      totalChecks: 3
    }));
    expect(gate?.evidence).toEqual(expect.arrayContaining([
      "productionGoLiveGateStatus=blocked",
      "productionGoLiveGateProductionReadyClaimAllowed=false",
      "productionGoLiveGatePassedChecks=0",
      "productionGoLiveGateTotalChecks=3",
      "productionGoLiveGateMetadataReady=true",
      "productionGoLiveGateReadinessEvidence=advisory-not-provider-pass",
      "productionEvidenceAdvisoryConfirmed=true"
    ]));
    expect(manifest.evidence).toEqual(expect.arrayContaining([
      "productionGoLiveGateConfirmed=true",
      "productionGoLiveGateStatus=blocked",
      "productionGoLiveGateProductionReadyClaimAllowed=false",
      "productionGoLiveGateChecks=0/3"
    ]));
  });

  it("can require the production runtime env packet without treating it as a provider pass", async () => {
    configureConfirmedProductionEvidence();
    process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_REQUIRED = "1";

    const { buildEnterpriseProductionEvidenceManifest } = await import("../enterprise/ops-production-evidence");
    const manifest = buildEnterpriseProductionEvidenceManifest();
    const packet = manifest.advisoryItems.find((item) => item.id === "production-runtime-env-packet");

    expect(manifest.status).toBe("blocked");
    expect(manifest.summary).toEqual(expect.objectContaining({
      missingRequired: 1,
      advisoryItems: 2,
      advisoryConfirmed: 0,
      productionRuntimeEnvPacketConfirmed: false
    }));
    expect(packet).toEqual(expect.objectContaining({
      status: "missing-required",
      required: true,
      confirmed: false
    }));
  });

  it("does not confirm manually-set performance budget evidence without clean build identity", async () => {
    const verifiedAt = new Date().toISOString();
    process.env.SENA_PERFORMANCE_BUDGET_CONFIRMED = "1";
    process.env.SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256 = "f".repeat(64);
    process.env.SENA_PERFORMANCE_BUDGET_VERIFIED_AT = verifiedAt;

    const { buildEnterpriseProductionEvidenceManifest } = await import("../enterprise/ops-production-evidence");
    const manifest = buildEnterpriseProductionEvidenceManifest();
    const performanceBudget = manifest.items.find((item) => item.id === "performance-budget-artifact");

    expect(performanceBudget).toEqual(expect.objectContaining({
      confirmed: false,
      status: "missing-advisory",
      artifactHashConfigured: true,
      verifiedAtConfigured: true
    }));
    expect(performanceBudget?.evidence).toEqual(expect.arrayContaining([
      "performanceBudgetConfirmed=true",
      "performanceBudgetBuildIdentityReady=false",
      "performanceBudgetNextBuildIdSha256=missing-or-invalid",
      "performanceBudgetGitCommit=missing-or-invalid",
      "performanceBudgetGitDirtyClean=false",
      "performanceBudgetPackageLockSha256=missing-or-invalid",
      "productionEvidenceConfirmed=false"
    ]));
  });

  it("does not confirm a legacy v1 performance env tuple as current v2 evidence", async () => {
    const verifiedAt = new Date().toISOString();
    process.env.SENA_PERFORMANCE_BUDGET_CONFIRMED = "1";
    process.env.SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256 = "f".repeat(64);
    process.env.SENA_PERFORMANCE_BUDGET_VERIFIED_AT = verifiedAt;
    process.env.SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION = "sena-enterprise-production-performance-budget/v1";
    process.env.SENA_PERFORMANCE_BUDGET_MEASURED_ARTIFACT_SET_SHA256 = "7".repeat(64);
    process.env.SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256 = "6".repeat(64);
    process.env.SENA_PERFORMANCE_BUDGET_GIT_COMMIT = "5".repeat(40);
    process.env.SENA_PERFORMANCE_BUDGET_GIT_DIRTY = "false";
    process.env.SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256 = "4".repeat(64);
    process.env.SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE = "git-clean-worktree";

    const { buildEnterpriseProductionEvidenceManifest } = await import("../enterprise/ops-production-evidence");
    const legacyManifest = buildEnterpriseProductionEvidenceManifest();
    const legacyBudget = legacyManifest.items.find((item) => item.id === "performance-budget-artifact");

    expect(legacyBudget).toEqual(expect.objectContaining({
      confirmed: false,
      status: "missing-advisory"
    }));
    expect(legacyBudget?.evidence).toEqual(expect.arrayContaining([
      "performanceBudgetSchemaCurrent=false",
      "performanceBudgetMeasuredArtifactSetSha256=present"
    ]));

    process.env.SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION = "sena-enterprise-production-performance-budget/v2";
    const currentManifest = buildEnterpriseProductionEvidenceManifest();
    const currentBudget = currentManifest.items.find((item) => item.id === "performance-budget-artifact");

    expect(currentBudget).toEqual(expect.objectContaining({
      confirmed: true,
      status: "confirmed"
    }));

    delete process.env.SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE;
    const missingCustodyMode = buildEnterpriseProductionEvidenceManifest().items
      .find((item) => item.id === "performance-budget-artifact");
    expect(missingCustodyMode).toEqual(expect.objectContaining({
      confirmed: false,
      status: "missing-advisory"
    }));
    expect(missingCustodyMode?.evidence).toContain("performanceBudgetSourceCustodyMode=missing");

    process.env.SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE = "reviewed-clean-release-slice";
    const legacyCustodyMode = buildEnterpriseProductionEvidenceManifest().items
      .find((item) => item.id === "performance-budget-artifact");
    expect(legacyCustodyMode).toEqual(expect.objectContaining({
      confirmed: false,
      status: "missing-advisory"
    }));
  });

  it("accepts a complete current performance tuple from a Git SHA-256 repository", async () => {
    configureConfirmedProductionEvidence();
    process.env.SENA_PERFORMANCE_BUDGET_GIT_COMMIT = "5".repeat(64);

    const { buildEnterpriseProductionEvidenceManifest } = await import("../enterprise/ops-production-evidence");
    const manifest = buildEnterpriseProductionEvidenceManifest();
    const performanceBudget = manifest.items.find((item) => item.id === "performance-budget-artifact");

    expect(performanceBudget).toEqual(expect.objectContaining({
      confirmed: true,
      status: "confirmed"
    }));
    expect(performanceBudget?.evidence).toEqual(expect.arrayContaining([
      "performanceBudgetGitCommit=present",
      "performanceBudgetBuildIdentityReady=true"
    ]));
  });

  it("does not confirm stale verified-at production evidence even when flags and artifact hashes are configured", async () => {
    configureConfirmedProductionEvidence();
    process.env.SENA_PRODUCTION_EVIDENCE_MAX_AGE_HOURS = "1";
    process.env.SENA_ENTERPRISE_POSTGRES_PROBE_VERIFIED_AT = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { buildEnterpriseProductionEvidenceManifest } = await import("../enterprise/ops-production-evidence");
    const manifest = buildEnterpriseProductionEvidenceManifest();
    const postgresProbe = manifest.items.find((item) => item.id === "postgres-live-probe");

    expect(manifest.status).toBe("review");
    expect(manifest.summary).toEqual(expect.objectContaining({
      confirmed: 12,
      missing: 2,
      missingRequired: 0,
      missingAdvisory: 2
    }));
    expect(manifest.evidence).toEqual(expect.arrayContaining([
      "productionEvidenceMaxAgeHours=1"
    ]));
    expect(postgresProbe).toEqual(expect.objectContaining({
      confirmed: false,
      status: "missing-advisory",
      artifactHashConfigured: true,
      verifiedAtConfigured: false,
      verifiedAt: undefined
    }));
    expect(postgresProbe?.evidence).toEqual(expect.arrayContaining([
      "postgresProbeVerifiedAt=stale",
      "productionEvidenceVerifiedAt=stale",
      "productionEvidenceConfirmed=false"
    ]));
  });

  it("blocks when production evidence is required but live probe artifacts are missing", async () => {
    process.env.SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED = "1";

    const { buildEnterpriseProductionEvidenceManifest } = await import("../enterprise/ops-production-evidence");
    const manifest = buildEnterpriseProductionEvidenceManifest();

    expect(manifest.status).toBe("blocked");
    expect(manifest.summary).toEqual(expect.objectContaining({
      manifestRequired: true,
      confirmed: 0,
      missingRequired: 14,
      performanceBudgetConfirmed: false,
      conferenceLoadConfirmed: false
    }));
    expect(manifest.items.every((item) => item.status === "missing-required")).toBe(true);
    expect(manifest.nextActions).toContain("Run npm run sena:performance:check after a clean, identified production build, archive the redacted sena-enterprise-production-performance-budget/v2 artifact, and bind it through npm run sena:production-evidence:bind so schema version, measured output-set hash, artifact hash, verified-at, Next build ID hash, git commit, actual clean status, and package-lock hash are all attached.");
  });

  it("requires external live probes, performance budget, and conference rehearsal for production runtime even before manifest-required mode", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    const { buildEnterpriseProductionEvidenceManifest } = await import("../enterprise/ops-production-evidence");
    const manifest = buildEnterpriseProductionEvidenceManifest();
    const observabilityContract = manifest.items.find((item) => item.id === "observability-contract");
    const observabilityProbe = manifest.items.find((item) => item.id === "observability-live-probe");
    const performanceBudget = manifest.items.find((item) => item.id === "performance-budget-artifact");
    const conferenceLoad = manifest.items.find((item) => item.id === "conference-load-rehearsal");
    const vercelPreflight = manifest.items.find((item) => item.id === "vercel-production-preflight");
    const workerContract = manifest.items.find((item) => item.id === "server-job-worker-contract");

    expect(manifest.status).toBe("blocked");
    expect(manifest.summary).toEqual(expect.objectContaining({
      manifestRequired: false,
      missingRequired: 14,
      missingAdvisory: 0
    }));
    expect(vercelPreflight).toEqual(expect.objectContaining({
      required: true,
      status: "missing-required"
    }));
    expect(vercelPreflight?.evidence).toEqual(expect.arrayContaining([
      "vercelProductionPreflightRequired=true",
      "vercelProductionPreflightProductionRuntime=true",
      "vercelProductionPreflightArtifactSha256=missing-or-invalid",
      "vercelProductionPreflightVerifiedAt=missing-or-invalid"
    ]));
    expect(workerContract).toEqual(expect.objectContaining({
      required: true,
      status: "missing-required"
    }));
    expect(workerContract?.evidence).toEqual(expect.arrayContaining([
      "serverJobWorkerContractRequired=true",
      "serverJobWorkerContractProductionRuntime=true",
      "serverJobWorkerContractArtifactSha256=missing-or-invalid",
      "serverJobWorkerContractVerifiedAt=missing-or-invalid"
    ]));
    expect(observabilityContract).toEqual(expect.objectContaining({
      required: true,
      status: "missing-required"
    }));
    expect(observabilityContract?.evidence).toEqual(expect.arrayContaining([
      "observabilityContractRequired=true",
      "observabilityContractProductionRuntime=true",
      "observabilityContractArtifactSha256=missing-or-invalid",
      "observabilityContractVerifiedAt=missing-or-invalid"
    ]));
    expect(observabilityProbe).toEqual(expect.objectContaining({
      required: true,
      status: "missing-required"
    }));
    expect(observabilityProbe?.evidence).toEqual(expect.arrayContaining([
      "observabilityLiveProbeRequired=true",
      "observabilityProbeProductionRuntime=true",
      "observabilityProbeArtifactSha256=missing-or-invalid",
      "observabilityProbeVerifiedAt=missing-or-invalid"
    ]));
    expect(performanceBudget).toEqual(expect.objectContaining({
      required: true,
      status: "missing-required"
    }));
    expect(performanceBudget?.evidence).toEqual(expect.arrayContaining([
      "performanceBudgetRequired=true",
      "performanceBudgetProductionRuntime=true",
      "performanceBudgetArtifactSha256=missing-or-invalid",
      "performanceBudgetVerifiedAt=missing-or-invalid",
      "performanceBudgetBuildIdentityReady=false"
    ]));
    expect(conferenceLoad).toEqual(expect.objectContaining({
      required: true,
      status: "missing-required"
    }));
    expect(conferenceLoad?.evidence).toEqual(expect.arrayContaining([
      "conferenceLoadRequired=true",
      "conferenceLoadProductionRuntime=true",
      "conferenceLoadArtifactSha256=missing-or-invalid",
      "conferenceLoadDurationSeconds=missing-or-insufficient"
    ]));
  });

  it("exposes the production evidence manifest through an ops bearer route", async () => {
    process.env.SENA_OPS_TOKEN = "sena-test-ops-token";
    process.env.SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED = "1";
    process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_CONFIRMED = "1";
    process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_ARTIFACT_SHA256 = "1".repeat(64);
    process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_VERIFIED_AT = new Date().toISOString();
    process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_STATUS = "blocked";
    process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_READY_PROVIDER_GROUPS = "1";
    process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_REQUIRED_PROVIDER_GROUPS = "8";
    process.env.SENA_PRODUCTION_GO_LIVE_GATE_CONFIRMED = "1";
    process.env.SENA_PRODUCTION_GO_LIVE_GATE_ARTIFACT_SHA256 = "2".repeat(64);
    process.env.SENA_PRODUCTION_GO_LIVE_GATE_VERIFIED_AT = new Date().toISOString();
    process.env.SENA_PRODUCTION_GO_LIVE_GATE_STATUS = "blocked";
    process.env.SENA_PRODUCTION_GO_LIVE_GATE_PRODUCTION_READY = "false";
    process.env.SENA_PRODUCTION_GO_LIVE_GATE_PASSED_CHECKS = "0";
    process.env.SENA_PRODUCTION_GO_LIVE_GATE_TOTAL_CHECKS = "3";
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    const route = await import("../../../app/api/sena/ops/production-evidence/route");
    const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/production-evidence", {
      headers: {
        authorization: "Bearer sena-test-ops-token"
      }
    }));
    const body = await response.json() as {
      schemaVersion?: string;
      status?: string;
      access?: { mode?: string };
      summary?: {
        missingRequired?: number;
        productionRuntimeEnvPacketStatus?: string;
        productionGoLiveGateStatus?: string;
        productionGoLiveGateReadyClaimAllowed?: boolean;
      };
    };

    expect(response.status).toBe(503);
    expect(response.headers.get("x-sena-production-evidence-status")).toBe("blocked");
    expect(response.headers.get("x-sena-production-evidence-missing-required")).toBe("14");
    expect(response.headers.get("x-sena-production-evidence-advisory-confirmed")).toBe("2");
    expect(response.headers.get("x-sena-production-evidence-vercel-preflight")).toBe("missing-required");
    expect(response.headers.get("x-sena-production-evidence-performance-budget-artifact")).toBe("missing-required");
    expect(response.headers.get("x-sena-production-evidence-server-job-worker-contract")).toBe("missing-required");
    expect(response.headers.get("x-sena-production-evidence-conference-load-rehearsal")).toBe("missing-required");
    expect(response.headers.get("x-sena-production-runtime-env-packet")).toBe("confirmed");
    expect(response.headers.get("x-sena-production-runtime-env-packet-status")).toBe("blocked");
    expect(response.headers.get("x-sena-production-runtime-env-packet-provider-groups")).toBe("1/8");
    expect(response.headers.get("x-sena-production-go-live-gate")).toBe("confirmed");
    expect(response.headers.get("x-sena-production-go-live-gate-status")).toBe("blocked");
    expect(response.headers.get("x-sena-production-go-live-gate-ready-claim")).toBe("false");
    expect(response.headers.get("x-sena-production-go-live-gate-checks")).toBe("0/3");
    expect(response.headers.get("x-sena-production-evidence-secret-values")).toBe("excluded");
    expect(response.headers.get("x-sena-production-evidence-endpoint-values")).toBe("hashed");
    expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-production-evidence");
    expect(body.schemaVersion).toBe("sena-enterprise-production-evidence-manifest/v1");
    expect(body.status).toBe("blocked");
    expect(body.access?.mode).toBe("bearer");
    expect(body.summary?.missingRequired).toBe(14);
    expect(body.summary?.productionRuntimeEnvPacketStatus).toBe("blocked");
    expect(body.summary?.productionGoLiveGateStatus).toBe("blocked");
    expect(body.summary?.productionGoLiveGateReadyClaimAllowed).toBe(false);
  });

  it("archives the redacted manifest and sha256 custody file even while production evidence is blocked", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-"));
    const outputPath = path.join(root, "sena-enterprise-production-evidence-manifest.json");

    try {
      const result = spawnSync("./node_modules/.bin/vite-node", [
        "scripts/verify-sena-production-evidence-manifest.ts",
        "--output",
        outputPath
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: cleanSpawnEnv({
          SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED: "1",
          SENA_ENTERPRISE_POSTGRES_URL: "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require"
        })
      });
      const manifestText = readFileSync(outputPath, "utf8");
      const shaText = readFileSync(`${outputPath}.sha256`, "utf8").trim();
      const expectedSha = createHash("sha256").update(manifestText).digest("hex");
      const manifest = JSON.parse(manifestText) as {
        schemaVersion?: string;
        status?: string;
        summary?: { missingRequired?: number };
      };

      expect(result.status).toBe(1);
      expect(result.stdout).toContain(`productionEvidenceManifestArtifactPath=${outputPath}`);
      expect(result.stdout).toContain(`productionEvidenceManifestArtifactSha256=${expectedSha}`);
      expect(result.stdout).toContain("productionEvidenceManifestVerifiedAt=");
      expect(result.stderr).toContain("SENA production evidence manifest is not ready.");
      expect(shaText).toBe(`${expectedSha}  ${path.basename(outputPath)}`);
      expect(manifest.schemaVersion).toBe("sena-enterprise-production-evidence-manifest/v1");
      expect(manifest.status).toBe("blocked");
      expect(manifest.summary?.missingRequired).toBe(14);
      expect(manifestText).not.toContain("postgres://");
      expect(manifestText).not.toContain("super-secret");
      expect(manifestText).not.toContain("example.neon.tech");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
