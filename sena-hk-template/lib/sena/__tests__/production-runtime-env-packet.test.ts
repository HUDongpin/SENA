import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildEnterpriseProductionRuntimeEnvPacket
} from "../enterprise/production-runtime-env-packet";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";

const generatedAt = "2026-07-01T00:00:00.000Z";

function currentBlockedPreflight() {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseVercelProductionPreflight,
    generatedAt,
    status: "review",
    deployment: {
      attempted: true,
      status: "pass",
      readyState: "READY",
      target: "production",
      deploymentUrl: "sena-secret-deployment.vercel.app"
    },
    cli: {
      available: true,
      status: "pass"
    },
    domain: {
      attempted: true,
      status: "pass",
      deploymentAliasMatched: true
    },
    env: {
      attempted: true,
      status: "review",
      requirements: [
        {
          id: "neon-postgres-env",
          present: false,
          missing: [
            "SENA_ENTERPRISE_DB_ADAPTER",
            "SENA_ENTERPRISE_STATE_STORE",
            "SENA_ENTERPRISE_POSTGRES_URL|SENA_DATABASE_URL|DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL|NEON_DATABASE_URL"
          ]
        },
        {
          id: "legacy-local-file-env",
          present: false,
          missing: [
            "remove:SENA_ENTERPRISE_DB_DIR"
          ]
        },
        {
          id: "object-storage-env",
          present: false,
          missing: [
            "SENA_OBJECT_STORAGE_ADAPTER|R2_ACCOUNT_ID|R2_ENDPOINT|BLOB_READ_WRITE_TOKEN|BLOB_STORE_ID",
            "SENA_OBJECT_STORAGE_BUCKET|R2_BUCKET_NAME|R2_BUCKET|CLOUDFLARE_R2_BUCKET_NAME"
          ]
        },
        {
          id: "server-job-queue-env",
          present: false,
          missing: [
            "SENA_JOB_QUEUE_ADAPTER|QSTASH_TOKEN",
            "SENA_JOB_QUEUE_URL|SENA_JOB_WORKER_CALLBACK_URL",
            "SENA_JOB_QUEUE_SECRET",
            "SENA_JOB_QUEUE_CONTRACT_CONFIRMED|SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256|SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT|SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION"
          ]
        },
        {
          id: "observability-env",
          present: false,
          missing: [
            "SENA_ALERTING_OWNER|SENA_OBSERVABILITY_OWNER|ALERTING_OWNER|OBSERVABILITY_OWNER",
            "SENA_OBSERVABILITY_EXPORTER_URL|SENA_OBSERVABILITY_WEBHOOK_URL|OBSERVABILITY_WEBHOOK_URL|OBSERVABILITY_EXPORTER_URL",
            "SENA_OBSERVABILITY_CONTRACT_CONFIRMED|SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256|SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT|SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION"
          ]
        },
        { id: "cdn-evidence-env", present: true, missing: [] }
      ]
    },
    http: {
      runtimeStatus: "review",
      xSenaRuntime: "enterprise-local"
    },
    summary: {
      blockers: [
        "neon-postgres-env",
        "legacy-local-file-env",
        "object-storage-env",
        "server-job-queue-env",
        "observability-env",
        "runtime-header"
      ]
    }
  };
}

function archiveItemSchemaVersion(id: string) {
  const schemaVersions: Record<string, string> = {
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
  return schemaVersions[id];
}

function currentBlockedArchive() {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceArchive,
    generatedAt,
    status: "blocked",
    summary: {
      productionBlockers: [
        "vercel-production-preflight",
        "postgres-schema-contract",
        "postgres-live-probe",
        "object-storage-contract",
        "object-storage-live-probe",
        "server-job-queue-contract",
        "server-job-queue-live-probe",
        "server-job-worker-contract",
        "observability-contract",
        "observability-live-probe",
        "performance-budget-artifact",
        "conference-load-rehearsal",
        "production-evidence-manifest"
      ]
    },
    items: [
      { id: "postgres-schema-contract", status: "review", artifactStatus: "review" },
      { id: "postgres-live-probe", status: "review", artifactStatus: "review" },
      { id: "object-storage-contract", status: "review", artifactStatus: "review" },
      { id: "object-storage-live-probe", status: "review", artifactStatus: "review" },
      { id: "cdn-contract", status: "pass", artifactStatus: "pass" },
      { id: "cdn-live-probe", status: "pass", artifactStatus: "pass" },
      { id: "server-job-queue-contract", status: "review", artifactStatus: "review" },
      { id: "server-job-queue-live-probe", status: "review", artifactStatus: "review" },
      { id: "server-job-worker-contract", status: "review", artifactStatus: "review" },
      { id: "observability-contract", status: "review", artifactStatus: "review" },
      { id: "observability-live-probe", status: "review", artifactStatus: "review" },
      {
        id: "performance-budget-artifact",
        status: "review",
        artifactStatus: "pass",
        artifactArchiveValidation: "performance-build-git-dirty"
      },
      { id: "conference-load-rehearsal", status: "skipped" }
    ].map((item) => ({
      ...item,
      artifactSchemaVersion: archiveItemSchemaVersion(item.id)
    }))
  };
}

describe("SENA production runtime env packet", () => {
  it("summarizes the current productionization blockers without leaking provider values", () => {
    const artifact = buildEnterpriseProductionRuntimeEnvPacket({
      domain: "https://www.sena.hk/workspace/sena?token=secret",
      vercelScope: "private-team-scope",
      generatedAt,
      preflightArtifact: currentBlockedPreflight(),
      preflightPath: "output/production-evidence/vercel-production-preflight-current.json",
      archiveArtifact: currentBlockedArchive(),
      archivePath: "output/production-evidence/current-advisory/sena-production-evidence-archive.json"
    });
    const serialized = JSON.stringify(artifact);

    expect(artifact.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterpriseProductionRuntimeEnvPacket);
    expect(artifact.status).toBe("blocked");
    expect(artifact.summary.readyProviderGroups).toBe(2);
    expect(artifact.summary.requiredProviderGroups).toBe(8);
    expect(artifact.summary.blockerIds).toEqual(expect.arrayContaining([
      "neon-postgres-env",
      "legacy-local-file-env",
      "runtime-header",
      "postgres-schema-contract",
      "postgres-live-probe",
      "object-storage-env",
      "object-storage-contract",
      "server-job-queue-contract",
      "server-job-queue-live-probe",
      "observability-contract",
      "observability-live-probe",
      "performance-budget-artifact",
      "performance-build-git-dirty",
      "conference-load-rehearsal"
    ]));
    expect(artifact.providerGroups.find((group) => group.id === "vercel-project-custody")).toEqual(expect.objectContaining({
      status: "pass",
      canonicalEnv: expect.arrayContaining(["VERCEL_TOKEN", "VERCEL_PROJECT_ID"]),
      acceptedAliases: expect.arrayContaining([".vercel/project.json", ".vercel/repo.json"])
    }));
    expect(artifact.providerGroups.find((group) => group.id === "cdn")?.status).toBe("pass");
    expect(artifact.providerGroups.find((group) => group.id === "cdn")).toEqual(expect.objectContaining({
      preflightRequirementId: "cdn-evidence-env",
      preflightEnvPresent: true,
      preflightMissingEnv: []
    }));
    expect(artifact.providerGroups.find((group) => group.id === "cdn")?.verifyCommands)
      .toEqual([
        "npm run sena:cdn:contract -- --output output/production-evidence/cdn-contract.json",
        "npm run sena:cdn:verify -- --output output/production-evidence/cdn-probe.json",
        "npm run sena:production-evidence:bind -- --artifact output/production-evidence/cdn-contract.json --scope <vercel-team-slug> --yes",
        "npm run sena:production-evidence:bind -- --artifact output/production-evidence/cdn-probe.json --scope <vercel-team-slug> --yes"
      ]);
    expect(artifact.providerGroups.find((group) => group.id === "neon-postgres")).toEqual(expect.objectContaining({
      preflightRequirementId: "neon-postgres-env",
      preflightEnvPresent: false,
      preflightMissingEnv: expect.arrayContaining([
        "SENA_ENTERPRISE_DB_ADAPTER",
        "SENA_ENTERPRISE_STATE_STORE",
        "remove:SENA_ENTERPRISE_DB_DIR"
      ])
    }));
    expect(artifact.providerGroups.find((group) => group.id === "object-storage")?.preflightMissingEnv)
      .toEqual(expect.arrayContaining([
        "SENA_OBJECT_STORAGE_ADAPTER|R2_ACCOUNT_ID|R2_ENDPOINT|BLOB_READ_WRITE_TOKEN|BLOB_STORE_ID"
      ]));
    expect(artifact.providerGroups.find((group) => group.id === "object-storage")?.verifyCommands)
      .toEqual([
        "npm run sena:object-storage:contract -- --output output/production-evidence/object-storage-contract.json",
        "npm run sena:object-storage:verify -- --output output/production-evidence/object-storage-probe.json",
        "npm run sena:production-evidence:bind -- --artifact output/production-evidence/object-storage-contract.json --scope <vercel-team-slug> --yes",
        "npm run sena:production-evidence:bind -- --artifact output/production-evidence/object-storage-probe.json --scope <vercel-team-slug> --yes"
      ]);
    expect(artifact.providerGroups.find((group) => group.id === "server-job-queue")?.preflightMissingEnv)
      .toEqual(expect.arrayContaining([
        "SENA_JOB_QUEUE_ADAPTER|QSTASH_TOKEN",
        "SENA_JOB_QUEUE_SECRET",
        "SENA_JOB_QUEUE_CONTRACT_CONFIRMED|SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256|SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT|SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION"
      ]));
    expect(artifact.providerGroups.find((group) => group.id === "server-job-queue")?.currentBlockers)
      .toEqual(expect.arrayContaining([
        "server-job-queue-env",
        "server-job-queue-contract",
        "server-job-queue-live-probe",
        "server-job-worker-contract"
      ]));
    expect(artifact.providerGroups.find((group) => group.id === "server-job-queue")?.verifyCommands)
      .toEqual([
        "npm run sena:jobs:queue-contract -- --output output/production-evidence/server-job-queue-contract.json",
        "npm run sena:jobs:queue-verify -- --output output/production-evidence/server-job-queue-probe.json",
        "npm run sena:jobs:worker-contract -- --output output/production-evidence/server-job-worker-contract.json",
        "npm run sena:production-evidence:bind -- --artifact output/production-evidence/server-job-queue-contract.json --scope <vercel-team-slug> --yes",
        "npm run sena:production-evidence:bind -- --artifact output/production-evidence/server-job-queue-probe.json --scope <vercel-team-slug> --yes",
        "npm run sena:production-evidence:bind -- --artifact output/production-evidence/server-job-worker-contract.json --scope <vercel-team-slug> --yes"
      ]);
    expect(artifact.providerGroups.find((group) => group.id === "observability-alerting")?.preflightMissingEnv)
      .toEqual(expect.arrayContaining([
        "SENA_ALERTING_OWNER|SENA_OBSERVABILITY_OWNER|ALERTING_OWNER|OBSERVABILITY_OWNER",
        "SENA_OBSERVABILITY_CONTRACT_CONFIRMED|SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256|SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT|SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION"
      ]));
    expect(artifact.providerGroups.find((group) => group.id === "observability-alerting")?.currentBlockers)
      .toEqual(expect.arrayContaining([
        "observability-env",
        "observability-contract",
        "observability-live-probe"
      ]));
    expect(artifact.providerGroups.find((group) => group.id === "observability-alerting")?.verifyCommands)
      .toEqual([
        "npm run sena:observability:contract -- --output output/production-evidence/observability-contract.json",
        "npm run sena:observability:verify -- --output output/production-evidence/observability-probe.json",
        "npm run sena:production-evidence:bind -- --artifact output/production-evidence/observability-contract.json --scope <vercel-team-slug> --yes",
        "npm run sena:production-evidence:bind -- --artifact output/production-evidence/observability-probe.json --scope <vercel-team-slug> --yes"
      ]);
    expect(artifact.providerGroups.find((group) => group.id === "performance-clean-build")?.currentBlockers)
      .toEqual(expect.arrayContaining([
        "performance-budget-artifact",
        "performance-build-git-dirty"
      ]));
    expect(artifact.providerGroups.find((group) => group.id === "performance-clean-build")?.nextAction)
      .toContain("performance-build-git-dirty");
    expect(artifact.providerGroups.find((group) => group.id === "neon-postgres")?.configureCommand)
      .toContain("--postgres-url-stdin");
    expect(artifact.providerGroups.find((group) => group.id === "neon-postgres")?.configureCommand)
      .toContain("--strict-production");
    expect(artifact.providerGroups.find((group) => group.id === "object-storage")?.configureCommand)
      .toContain("--strict-production");
    expect(artifact.commandPlan.find((command) => command.id === "configure-neon")?.purpose)
      .toContain("remove the legacy file-state env");
    expect(artifact.commandPlan.find((command) => command.id === "verify-vercel-custody")?.command)
      .toContain("vercel whoami");
    expect(artifact.commandPlan.findIndex((command) => command.id === "verify-vercel-custody"))
      .toBeLessThan(artifact.commandPlan.findIndex((command) => command.id === "configure-neon"));
    expect(artifact.commandPlan.find((command) => command.id === "configure-neon")?.command)
      .toContain("--strict-production");
    expect(artifact.commandPlan.find((command) => command.id === "configure-services")?.command)
      .toContain("--strict-production");
    expect(artifact.commandPlan.find((command) => command.id === "deploy-production")?.command)
      .toBe("vercel deploy --prod -y --no-wait --scope <vercel-team-slug>");
    expect(artifact.commandPlan.findIndex((command) => command.id === "deploy-production"))
      .toBeLessThan(artifact.commandPlan.findIndex((command) => command.id === "verify-and-archive"));
    expect(artifact.commandPlan.find((command) => command.id === "final-production-gate")?.command)
      .toContain("npm run sena:production:gate");
    expect(artifact.commandPlan.find((command) => command.id === "bind-final-production-gate")?.command)
      .toBe("npm run sena:production-evidence:bind -- --artifact output/production-evidence/production-go-live-gate.json --scope <vercel-team-slug>");
    expect(artifact.commandPlan.findIndex((command) => command.id === "final-production-gate"))
      .toBeLessThan(artifact.commandPlan.findIndex((command) => command.id === "bind-final-production-gate"));
    expect(artifact.secureInputTemplates.vercelTokenStdinPlaceholder).toBe("<VERCEL_TOKEN>");
    expect(artifact.secureInputTemplates.neonPostgresUrlStdinPlaceholder).toBe("<NEON_POSTGRES_URL>");
    expect(artifact.policy.localFileStoreIsProductionBackend).toBe(false);
    expect(artifact.redaction.placeholdersOnly).toBe(true);
    expect(artifact.target.domainHostHash).toMatch(/^[a-f0-9]{64}$/);
    expect(serialized).not.toContain("www.sena.hk");
    expect(serialized).not.toContain("token=secret");
    expect(serialized).not.toContain("private-team-scope");
    expect(serialized).not.toContain("sena-secret-deployment.vercel.app");
    expect(serialized).not.toContain("postgres://");
  });

  it("keeps provider handoff blocked when Vercel CLI cannot inspect the production project", () => {
    const preflight = {
      ...currentBlockedPreflight(),
      cli: {
        available: false,
        status: "review"
      },
      deployment: {
        attempted: false,
        status: "review"
      },
      domain: {
        attempted: false,
        status: "review",
        deploymentAliasMatched: false
      },
      env: {
        ...currentBlockedPreflight().env,
        attempted: false,
        status: "review"
      },
      summary: {
        blockers: [
          "vercel-cli",
          "deployment-ready",
          "domain-configured",
          "env-list"
        ]
      }
    };

    const artifact = buildEnterpriseProductionRuntimeEnvPacket({
      domain: "https://www.sena.hk",
      vercelScope: "private-team-scope",
      generatedAt,
      preflightArtifact: preflight,
      archiveArtifact: currentBlockedArchive()
    });
    const custody = artifact.providerGroups.find((group) => group.id === "vercel-project-custody");
    const serialized = JSON.stringify(artifact);

    expect(artifact.status).toBe("blocked");
    expect(custody).toEqual(expect.objectContaining({
      status: "blocked",
      currentBlockers: [
        "vercel-cli",
        "vercel-production-deployment",
        "vercel-domain",
        "vercel-env-list"
      ],
      nextAction: expect.stringContaining("Vercel token")
    }));
    expect(artifact.summary.blockerIds).toEqual(expect.arrayContaining([
      "vercel-cli",
      "vercel-production-deployment",
      "vercel-domain",
      "vercel-env-list"
    ]));
    expect(serialized).not.toContain("private-team-scope");
  });

  it("does not trust archive pass items with mismatched artifact schema versions", () => {
    const preflight = {
      ...currentBlockedPreflight(),
      status: "pass",
      deployment: {
        ...currentBlockedPreflight().deployment,
        deploymentUrlHash: "7".repeat(64)
      },
      env: {
        ...currentBlockedPreflight().env,
        status: "pass",
        requirements: currentBlockedPreflight().env.requirements.map((requirement) => ({
          ...requirement,
          present: true,
          missing: []
        }))
      },
      http: {
        status: "pass",
        runtimeStatus: "pass",
        httpStatus: 200,
        xSenaRuntime: "enterprise-postgres"
      },
      redaction: {
        secretValuesExcluded: true,
        envValuesExcluded: true,
        endpointValuesHashed: true
      },
      summary: {
        blockers: []
      }
    };
    const forgedArchive = {
      ...currentBlockedArchive(),
      summary: {
        productionBlockers: []
      },
      items: currentBlockedArchive().items.map((item) => ({
        ...item,
        status: "pass",
        artifactStatus: "pass",
        artifactArchiveValidation: undefined,
        artifactSchemaVersion: "sena-test-artifact/v1"
      }))
    };

    const artifact = buildEnterpriseProductionRuntimeEnvPacket({
      domain: "https://www.sena.hk",
      vercelScope: "private-team-scope",
      generatedAt,
      preflightArtifact: preflight,
      archiveArtifact: forgedArchive
    });

    expect(artifact.status).toBe("blocked");
    expect(artifact.summary.readyProviderGroups).toBe(1);
    expect(artifact.providerGroups.find((group) => group.id === "vercel-project-custody")?.status).toBe("pass");
    expect(artifact.providerGroups.filter((group) => group.id !== "vercel-project-custody").map((group) => group.status))
      .toEqual(Array(7).fill("blocked"));
    expect(artifact.summary.blockerIds).toEqual(expect.arrayContaining([
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
      "observability-live-probe",
      "performance-budget-artifact",
      "conference-load-rehearsal"
    ]));
  });

  it("does not accept a managed runtime header without passed HTTP and deployment custody evidence", () => {
    const preflight = {
      ...currentBlockedPreflight(),
      status: "review",
      env: {
        ...currentBlockedPreflight().env,
        status: "pass",
        requirements: currentBlockedPreflight().env.requirements.map((requirement) => ({
          ...requirement,
          present: true,
          missing: []
        }))
      },
      http: {
        runtimeStatus: "review",
        status: "review",
        httpStatus: 503,
        xSenaRuntime: "enterprise-neon"
      },
      deployment: {
        attempted: true,
        status: "pass",
        readyState: "READY",
        target: "production",
        deploymentUrlHash: "missing"
      },
      redaction: {
        secretValuesExcluded: true,
        envValuesExcluded: true,
        endpointValuesHashed: true
      },
      summary: {
        blockers: [
          "live-http"
        ]
      }
    };
    const archive = {
      ...currentBlockedArchive(),
      items: currentBlockedArchive().items.map((item) => ({
        ...item,
        status: item.id === "conference-load-rehearsal" ? "pass" : "pass",
        artifactStatus: "pass",
        artifactArchiveValidation: undefined
      }))
    };

    const artifact = buildEnterpriseProductionRuntimeEnvPacket({
      domain: "https://www.sena.hk",
      vercelScope: "private-team-scope",
      generatedAt,
      preflightArtifact: preflight,
      archiveArtifact: archive
    });
    const postgres = artifact.providerGroups.find((group) => group.id === "neon-postgres");

    expect(postgres).toEqual(expect.objectContaining({
      status: "blocked",
      currentBlockers: expect.arrayContaining(["runtime-header"])
    }));
    expect(artifact.summary.blockerIds).toContain("runtime-header");

    const readyArtifact = buildEnterpriseProductionRuntimeEnvPacket({
      domain: "https://www.sena.hk",
      vercelScope: "private-team-scope",
      generatedAt,
      preflightArtifact: {
        ...preflight,
        status: "pass",
        deployment: {
          ...preflight.deployment,
          deploymentUrlHash: "7".repeat(64)
        },
        http: {
          status: "pass",
          runtimeStatus: "pass",
          httpStatus: 200,
          xSenaRuntime: "enterprise-postgres"
        },
        summary: {
          blockers: []
        }
      },
      archiveArtifact: archive
    });
    const readyPostgres = readyArtifact.providerGroups.find((group) => group.id === "neon-postgres");

    expect(readyPostgres?.status).toBe("pass");
    expect(readyArtifact.summary.blockerIds).not.toContain("runtime-header");
  });

  it("writes a custody-hashed packet from the CLI even while production is still blocked", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-env-packet-"));
    const preflightPath = path.join(root, "preflight.json");
    const archivePath = path.join(root, "archive.json");
    const outputPath = path.join(root, "packet.json");

    try {
      mkdirSync(root, { recursive: true });
      writeFileSync(preflightPath, JSON.stringify(currentBlockedPreflight(), null, 2));
      writeFileSync(archivePath, JSON.stringify(currentBlockedArchive(), null, 2));

      const result = spawnSync("./node_modules/.bin/vite-node", [
        "scripts/prepare-sena-production-runtime-env-packet.ts",
        "--domain",
        "https://www.sena.hk/workspace/sena?token=secret",
        "--scope",
        "private-team-scope",
        "--preflight",
        preflightPath,
        "--archive",
        archivePath,
        "--output",
        outputPath
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          SENA_ENTERPRISE_POSTGRES_URL: "postgres://sena_user:super-secret@example.neon.tech/senadb"
        }
      });
      const artifactText = readFileSync(outputPath, "utf8");
      const artifact = JSON.parse(artifactText) as {
        status?: string;
        summary?: { readyProviderGroups?: number; requiredProviderGroups?: number };
      };
      const expectedSha = createHash("sha256").update(artifactText).digest("hex");
      const shaText = readFileSync(`${outputPath}.sha256`, "utf8").trim();

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`productionRuntimeEnvPacketArtifactPath=${outputPath}`);
      expect(result.stdout).toContain("productionRuntimeEnvPacketStatus=blocked");
      expect(artifact.status).toBe("blocked");
      expect(artifact.summary?.readyProviderGroups).toBe(2);
      expect(artifact.summary?.requiredProviderGroups).toBe(8);
      expect(shaText).toBe(`${expectedSha}  packet.json`);
      expect(artifactText).not.toContain("www.sena.hk");
      expect(artifactText).not.toContain("token=secret");
      expect(artifactText).not.toContain("private-team-scope");
      expect(artifactText).not.toContain("super-secret");
      expect(artifactText).not.toContain("example.neon.tech");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 10_000);
});
