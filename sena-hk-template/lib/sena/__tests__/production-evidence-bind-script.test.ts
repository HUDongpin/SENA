import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const scriptPath = "scripts/bind-sena-production-evidence.mjs";
const generatedAt = "2026-07-01T00:00:00.000Z";

function hostHash(url: string) {
  return createHash("sha256").update(new URL(url).host).digest("hex");
}

function writeArtifact(dir: string, filename: string, artifact: Record<string, unknown>) {
  const artifactPath = path.join(dir, filename);
  const text = `${JSON.stringify(artifact, null, 2)}\n`;
  const sha = createHash("sha256").update(text).digest("hex");
  writeFileSync(artifactPath, text);
  writeFileSync(`${artifactPath}.sha256`, `${sha}  ${filename}\n`);
  return { artifactPath, sha };
}

function runBind(args: string[], options: {
  env?: NodeJS.ProcessEnv;
} = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: options.env ?? process.env
  });
}

function outputOf(result: ReturnType<typeof runBind>) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function writeFakeVercel(binDir: string) {
  const scriptPath = path.join(binDir, "vercel");
  writeFileSync(scriptPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Vercel CLI 54.9.0"
  exit 0
fi
if [ "$1" = "env" ] && [ "$2" = "add" ]; then
  cat >/dev/null
  exit 0
fi
echo "unexpected vercel args: $*" >&2
exit 1
`);
  chmodSync(scriptPath, 0o755);
}

const digestA = "a".repeat(64);
const digestB = "b".repeat(64);
const digestC = "c".repeat(64);
const digestD = "d".repeat(64);

function postgresSchemaContractFixture() {
  return {
    schemaVersion: "sena-enterprise-postgres-schema-contract/v1",
    generatedAt,
    status: "pass",
    schemaName: "public",
    summary: {
      tableCount: 2,
      productionTableCount: 1,
      verifierTableCount: 1,
      indexCount: 1,
      uniqueIndexCount: 0,
      ddlStatementCount: 3,
      destructiveDdlStatementCount: 0,
      migrationMode: "create-if-not-exists"
    },
    tables: [
      { id: "primary-state", name: "sena_enterprise_state", role: "state", productionRequired: true },
      { id: "live-postgres-probe", name: "sena_enterprise_postgres_live_probes", role: "probe", productionRequired: false }
    ],
    ddl: {
      statementFingerprints: [
        { kind: "table", name: "sena_enterprise_state", sqlSha256: digestA },
        { kind: "table", name: "sena_enterprise_postgres_live_probes", sqlSha256: digestB },
        { kind: "index", name: "idx_sena_enterprise_state_updated_at", tableName: "sena_enterprise_state", sqlSha256: digestC }
      ],
      destructiveDdlExcluded: true,
      connectionValuesExcluded: true
    },
    redaction: {
      sqlValuesExcluded: true,
      connectionValuesExcluded: true,
      secretValuesExcluded: true
    }
  };
}

function cdnContractFixture(host = "https://www.sena.hk") {
  return {
    schemaVersion: "sena-enterprise-cdn-contract/v1",
    generatedAt,
    status: "pass",
    summary: {
      ruleCount: 6,
      htmlCompressionRequired: true,
      immutableStaticAssetCachingRequired: true,
      mutableHtmlNotImmutable: true,
      cacheKeyNoiseExcluded: true
    },
    target: {
      configured: true,
      source: "SENA_CDN_VERIFY_URL",
      hostHash: hostHash(host),
      urlValueExcluded: true
    },
    liveProbe: {
      requiredBeforeProduction: true,
      checks: ["html-compression", "static-asset-discovery", "static-asset-immutable-cache"],
      command: "npm run sena:cdn:verify"
    },
    redaction: {
      urlValuesExcluded: true,
      hostValuesHashed: true,
      pathValuesHashed: true,
      queryValuesExcluded: true
    }
  };
}

function cdnProbeFixture(host = "https://www.sena.hk") {
  return {
    schemaVersion: "sena-enterprise-cdn-probe/v1",
    generatedAt,
    status: "pass",
    target: {
      configured: true,
      source: "SENA_CDN_VERIFY_URL",
      hostHash: hostHash(host),
      urlValueExcluded: true
    },
    html: {
      attempted: true,
      status: "pass",
      httpStatus: 200,
      contentEncoding: "br",
      compressed: true
    },
    staticAsset: {
      attempted: true,
      discovered: true,
      status: "pass",
      pathHash: digestA,
      httpStatus: 200,
      maxAgeSeconds: 31_536_000,
      immutable: true
    },
    redaction: {
      urlValuesExcluded: true,
      hostValuesHashed: true
    },
    contract: cdnContractFixture(host)
  };
}

function objectStorageContractFixture() {
  return {
    schemaVersion: "sena-enterprise-object-storage-contract/v1",
    generatedAt,
    status: "pass",
    summary: {
      supportedProviderCount: 4,
      operationCount: 3,
      keyPolicyCount: 5,
      privateAccessRequired: true,
      uploadCustodyRequired: true,
      liveProbeRequiredBeforeProduction: true,
      localFileStoreIsProductionBackend: false
    },
    operations: [
      { method: "PUT", requiredForLiveProbe: true },
      { method: "HEAD", requiredForLiveProbe: true },
      { method: "DELETE", requiredForLiveProbe: true }
    ],
    custody: {
      postgresColumn: "sena_enterprise_uploads.object_storage_custody",
      localJsonFallbackIsProductionBackend: false,
      payloadSha256Required: true,
      objectVersionCaptured: true,
      etagHashed: true
    },
    redaction: {
      endpointValuesExcluded: true,
      bucketValuesExcluded: true,
      objectKeyValuesExcluded: true,
      secretValuesExcluded: true,
      payloadValuesExcluded: true
    }
  };
}

function serverJobQueueContractFixture() {
  return {
    schemaVersion: "sena-enterprise-server-job-queue-contract/v1",
    generatedAt,
    status: "pass",
    summary: {
      jobKindCount: 5,
      statusActionCount: 5,
      acceptedProviderModeCount: 3,
      durableJobStoreRequired: true,
      signedDispatchRequired: true,
      workerCallbackRequired: true,
      liveProbeRequiredBeforeProduction: true
    },
    provider: {
      queueEndpointValueExcluded: true,
      queueSecretValuesExcluded: true,
      queueProviderTokenValuesExcluded: true
    },
    store: {
      requiredForProduction: true,
      acceptedStore: "postgres-table",
      table: "sena_enterprise_server_jobs",
      localStateFallback: "research-pilot-only"
    },
    dispatch: {
      signatureAlgorithm: "hmac-sha256",
      statusCallback: "/api/sena/ops/jobs",
      rawPayloadPersistedInJobStore: false,
      payloadPolicy: "project-or-upload-pointer-default"
    },
    redaction: {
      endpointValuesExcluded: true,
      secretValuesExcluded: true,
      providerTokenValuesExcluded: true,
      payloadValuesExcluded: true,
      responsePayloadValuesExcluded: true
    }
  };
}

function serverJobWorkerContractFixture() {
  return {
    schemaVersion: "sena-enterprise-server-job-worker-contract/v1",
    generatedAt,
    status: "pass",
    productionReady: true,
    provider: {
      queueConfigured: true,
      queueProductionReady: true,
      queueMode: "qstash",
      queueEndpointHash: digestA,
      queueSecretConfigured: true,
      queueEndpointValueExcluded: true,
      queueSecretValuesExcluded: true
    },
    statusStore: {
      activeStore: "postgres-table",
      postgresConfigured: true,
      postgresPrimaryActive: true,
      indexed: true
    },
    worker: {
      runtime: "external-worker",
      ownerConfigured: true,
      runbookConfigured: true,
      callbackConfigured: true,
      heartbeatConfirmed: true,
      heartbeatArtifactHashConfigured: true,
      heartbeatVerifiedAtConfigured: true,
      callbackUrlHash: digestB,
      runbookUrlHash: digestC,
      heartbeatArtifactSha256: digestD,
      heartbeatVerifiedAt: generatedAt,
      callbackUrlValueExcluded: true,
      runbookUrlValueExcluded: true,
      ownerValueExcluded: true
    },
    contract: {
      statusCallback: "/api/sena/ops/jobs",
      rawPayloadPersistedInJobStore: false,
      payloadPolicy: "project-or-upload-pointer-default"
    },
    missing: []
  };
}

function observabilityContractFixture() {
  return {
    schemaVersion: "sena-enterprise-observability-contract/v1",
    generatedAt,
    status: "pass",
    summary: {
      signalCount: 4,
      sloCount: 3,
      alertCategoryCount: 5,
      durableSampleStoreRequired: true,
      signedExporterRequired: true,
      dashboardRunbookOwnerRequired: true,
      liveProbeRequiredBeforeProduction: true
    },
    provider: {
      externalSinkConfigured: true,
      externalSinkOriginAllowed: true,
      dashboardConfigured: true,
      runbookConfigured: true,
      ownerConfigured: true,
      secretConfigured: true,
      endpointHash: digestA,
      dashboardUrlHash: digestB,
      runbookUrlHash: digestC,
      urlValuesExcluded: true,
      secretValuesExcluded: true
    },
    signals: ["logs", "metrics", "traces", "alerts"].map((id) => ({
      id,
      required: true,
      correlationKey: "requestIdHash",
      valuesExcluded: true
    })),
    sampleStore: {
      requiredForProduction: true,
      acceptedStore: "postgres-table",
      localRingBufferFallback: "development-only"
    },
    liveProbe: {
      requiredBeforeProduction: true,
      signedDeliveryRequired: true
    },
    alerting: {
      requiredCategories: ["availability", "error-rate", "latency", "downstream", "saturation"],
      runbookRequired: true,
      ownerRequired: true
    },
    redaction: {
      exporterUrlValuesExcluded: true,
      dashboardUrlValuesExcluded: true,
      runbookUrlValuesExcluded: true,
      requestIdValuesExcluded: true,
      secretValuesExcluded: true,
      payloadValuesExcluded: true
    }
  };
}

describe("SENA production evidence binding script", () => {
  it("dry-runs passed artifact bindings without printing artifact payload values", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-"));

    try {
      const { sha: cdnSha } = writeArtifact(root, "cdn-probe.json", {
        ...cdnProbeFixture(),
        secretLookingValue: "https://secret-cdn.example.com"
      });
      writeArtifact(root, "cdn-contract.json", {
        ...cdnContractFixture(),
        secretLookingValue: "https://cdn-contract-secret.example.com/private/path"
      });
      writeArtifact(root, "vercel-preflight.json", {
        schemaVersion: "sena-enterprise-vercel-production-preflight/v1",
        generatedAt,
        status: "pass",
        target: {
          domain: "www.sena.hk",
          domainValueExcluded: false,
          scopeConfigured: true,
          scopeValueExcluded: true
        },
        deployment: {
          urlValueExcluded: true,
          status: "pass",
          deploymentUrlHash: "7".repeat(64),
          secretLookingValue: "https://secret-vercel-deployment.example.com"
        },
        domain: {
          status: "pass",
          deploymentAliasMatched: true
        },
        http: {
          status: "pass",
          runtimeStatus: "pass",
          httpStatus: 200,
          xSenaRuntime: "enterprise-neon"
        },
        redaction: {
          secretValuesExcluded: true,
          envValuesExcluded: true,
          endpointValuesHashed: true
        }
      });
      writeArtifact(root, "worker-contract.json", {
        ...serverJobWorkerContractFixture(),
        secretLookingValue: "https://worker-callback.example.com"
      });
      writeArtifact(root, "postgres-probe.json", {
        schemaVersion: "sena-enterprise-postgres-probe/v1",
        generatedAt,
        status: "review",
        provider: {
          connectionValueExcluded: true,
          secretLookingValue: "postgres://sena:super-secret@example.neon.tech/db"
        }
      });
      writeArtifact(root, "postgres-schema-contract.json", postgresSchemaContractFixture());
      writeArtifact(root, "object-storage-contract.json", {
        ...objectStorageContractFixture(),
        secretLookingValue: "https://objects.secret.example.test/private-bucket"
      });
      const result = runBind(["--evidence-dir", root, "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(0);
      expect(output).toContain("SENA production evidence binding plan");
      expect(output).toContain("cdn-contract.json: CDN contract -> bind");
      expect(output).toContain("cdn-probe.json: CDN live probe -> bind");
      expect(output).toContain("vercel-preflight.json: Vercel production preflight -> bind");
      expect(output).toContain("worker-contract.json: Server job worker contract -> bind");
      expect(output).toContain("postgres-probe.json: Postgres live probe -> skip(artifact-status:review)");
      expect(output).toContain("postgres-schema-contract.json: Postgres schema contract -> bind");
      expect(output).toContain("object-storage-contract.json: Object storage contract -> bind");
      expect(output).toContain("SENA_CDN_LIVE_PROBE_CONFIRMED=configured(redacted)");
      expect(output).toContain("SENA_CDN_PROBE_ARTIFACT_SHA256=configured(redacted)");
      expect(output).toContain("SENA_CDN_PROBE_ARTIFACT_VALIDATION=configured(redacted)");
      expect(output).toContain("SENA_CDN_CONTRACT_CONFIRMED=configured(redacted)");
      expect(output).toContain("SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED=configured(redacted)");
      expect(output).toContain("SENA_VERCEL_PRODUCTION_PREFLIGHT_TARGET_HOST_SHA256=configured(redacted)");
      expect(output).toContain("SENA_VERCEL_PRODUCTION_PREFLIGHT_DEPLOYMENT_URL_SHA256=configured(redacted)");
      expect(output).toContain("SENA_VERCEL_PRODUCTION_PREFLIGHT_HTTP_STATUS=configured(redacted)");
      expect(output).toContain("SENA_VERCEL_PRODUCTION_PREFLIGHT_RUNTIME_HEADER=configured(redacted)");
	      expect(output).toContain("SENA_JOB_WORKER_CONTRACT_CONFIRMED=configured(redacted)");
      expect(output).toContain("SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION=configured(redacted)");
      expect(output).toContain("SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_CONFIRMED=configured(redacted)");
      expect(output).toContain("SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_VALIDATION=configured(redacted)");
      expect(output).toContain("SENA_OBJECT_STORAGE_CONTRACT_CONFIRMED=configured(redacted)");
      expect(output).toContain("SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_VALIDATION=configured(redacted)");
      expect(output).toContain("Dry run only. Re-run with --yes");
      expect(output).not.toContain(cdnSha);
      expect(output).not.toContain("secret-cdn.example.com");
      expect(output).not.toContain("cdn-contract-secret.example.com");
      expect(output).not.toContain("secret-vercel-deployment.example.com");
      expect(output).not.toContain("worker-callback.example.com");
      expect(output).not.toContain("postgres://");
      expect(output).not.toContain("super-secret");
      expect(output).not.toContain("objects.secret.example.test");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to bind production evidence to non-production Vercel environments", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-env-"));

    try {
      writeArtifact(root, "cdn-probe.json", {
        schemaVersion: "sena-enterprise-cdn-probe/v1",
        generatedAt,
        status: "pass"
      });
      const result = runBind(["--artifact", path.join(root, "cdn-probe.json"), "--env", "preview", "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("SENA production evidence binding only writes to the Vercel production environment. Refusing --env preview.");
      expect(output).not.toContain("SENA_CDN_LIVE_PROBE_CONFIRMED=configured(redacted)");
      expect(output).not.toContain("SENA production evidence binding plan");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not require a production target URL when binding non-target-bound production evidence", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-non-load-target-"));

    try {
      writeArtifact(root, "server-job-worker-contract.json", serverJobWorkerContractFixture());
      const result = runBind([
        "--artifact",
        path.join(root, "server-job-worker-contract.json"),
        "--scope",
        "test-team",
        "--target-url",
        "http://localhost:3000"
      ]);
      const output = outputOf(result);

      expect(result.status).toBe(0);
      expect(output).toContain("server-job-worker-contract.json: Server job worker contract -> bind");
      expect(output).toContain("SENA_JOB_WORKER_CONTRACT_CONFIRMED=configured(redacted)");
      expect(output).not.toContain("cdn-target-url-not-https");
      expect(output).not.toContain("vercel-preflight-target-url-not-https");
      expect(output).not.toContain("conference-load-target-url-not-https");
      expect(output).not.toContain("localhost:3000");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to bind CDN probe artifacts whose host hash does not match the production target URL", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-cdn-host-"));

    try {
      writeArtifact(root, "cdn-probe-other-host.json", {
        schemaVersion: "sena-enterprise-cdn-probe/v1",
        generatedAt,
        status: "pass",
        target: {
          configured: true,
          hostHash: hostHash("https://other.sena.hk"),
          urlValueExcluded: true
        }
      });
      const result = runBind([
        "--artifact",
        path.join(root, "cdn-probe-other-host.json"),
        "--scope",
        "test-team",
        "--target-url",
        "https://www.sena.hk"
      ]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("cdn-probe-other-host.json: CDN live probe -> skip(cdn-target-host-hash-mismatch)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
      expect(output).not.toContain("SENA_CDN_LIVE_PROBE_CONFIRMED=configured(redacted)");
      expect(output).not.toContain("other.sena.hk");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses forged pass provider artifacts when live proof or contract custody is missing", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-forged-provider-"));

    try {
      writeArtifact(root, "postgres-probe.json", {
        schemaVersion: "sena-enterprise-postgres-probe/v1",
        generatedAt,
        status: "pass",
        redaction: {
          connectionValuesExcluded: true,
          probeIdValuesExcluded: true,
          secretValuesExcluded: true
        }
      });
      writeArtifact(root, "object-storage-probe.json", {
        schemaVersion: "sena-enterprise-object-storage-probe/v1",
        generatedAt,
        status: "pass",
        redaction: {
          endpointValuesExcluded: true,
          bucketValuesExcluded: true,
          objectKeyValuesExcluded: true,
          secretValuesExcluded: true
        }
      });
      writeArtifact(root, "server-job-queue-probe.json", {
        schemaVersion: "sena-enterprise-server-job-queue-probe/v1",
        generatedAt,
        status: "pass",
        redaction: {
          endpointValueExcluded: true,
          secretValuesExcluded: true,
          probeIdValueExcluded: true,
          payloadValuesExcluded: true,
          responsePayloadValuesExcluded: true
        }
      });
      writeArtifact(root, "server-job-worker-contract.json", {
        schemaVersion: "sena-enterprise-server-job-worker-contract/v1",
        generatedAt,
        status: "pass",
        productionReady: true
      });
      writeArtifact(root, "observability-probe.json", {
        schemaVersion: "sena-enterprise-observability-probe/v1",
        generatedAt,
        status: "pass",
        redaction: {
          exporterUrlValuesExcluded: true,
          requestIdValuesExcluded: true,
          secretValuesExcluded: true,
          payloadValuesExcluded: true
        }
      });
      const result = runBind(["--evidence-dir", root, "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("postgres-probe.json: Postgres live probe -> skip(postgres-probe-provider-missing)");
      expect(output).toContain("object-storage-probe.json: Object storage live probe -> skip(object-storage-probe-provider-missing)");
      expect(output).toContain("server-job-queue-probe.json: Server job queue live probe -> skip(server-job-queue-probe-provider-missing)");
      expect(output).toContain("server-job-worker-contract.json: Server job worker contract -> skip(server-job-worker-contract-provider-missing)");
      expect(output).toContain("observability-probe.json: Observability live probe -> skip(observability-probe-provider-missing)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to bind Vercel preflight artifacts whose target domain does not match the production target URL", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-vercel-host-"));

    try {
      writeArtifact(root, "vercel-preflight-other-host.json", {
        schemaVersion: "sena-enterprise-vercel-production-preflight/v1",
        generatedAt,
        status: "pass",
        target: {
          domain: "other.sena.hk",
          domainValueExcluded: false,
          scopeConfigured: true,
          scopeValueExcluded: true
        }
      });
      const result = runBind([
        "--artifact",
        path.join(root, "vercel-preflight-other-host.json"),
        "--scope",
        "test-team",
        "--target-url",
        "https://www.sena.hk"
      ]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("vercel-preflight-other-host.json: Vercel production preflight -> skip(vercel-preflight-target-host-mismatch)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
      expect(output).not.toContain("SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED=configured(redacted)");
      expect(output).not.toContain("other.sena.hk");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to bind Vercel preflight artifacts without a managed-state runtime header", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-vercel-runtime-"));

    try {
      writeArtifact(root, "vercel-preflight-local-runtime.json", {
        schemaVersion: "sena-enterprise-vercel-production-preflight/v1",
        generatedAt,
        status: "pass",
        target: {
          domain: "www.sena.hk",
          domainValueExcluded: false,
          scopeConfigured: true,
          scopeValueExcluded: true
        },
        deployment: {
          status: "pass",
          deploymentUrlHash: "7".repeat(64),
          urlValueExcluded: true
        },
        domain: {
          status: "pass",
          deploymentAliasMatched: true
        },
        http: {
          status: "pass",
          runtimeStatus: "pass",
          httpStatus: 200,
          xSenaRuntime: "enterprise-local"
        },
        redaction: {
          secretValuesExcluded: true,
          envValuesExcluded: true,
          endpointValuesHashed: true
        }
      });
      const result = runBind([
        "--artifact",
        path.join(root, "vercel-preflight-local-runtime.json"),
        "--scope",
        "test-team",
        "--target-url",
        "https://www.sena.hk"
      ]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("vercel-preflight-local-runtime.json: Vercel production preflight -> skip(vercel-preflight-runtime-header-missing)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
      expect(output).not.toContain("SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED=configured(redacted)");
      expect(output).not.toContain("enterprise-local");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes pass-artifact evidence env values through the Vercel CLI", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-write-"));
    const binDir = path.join(root, "bin");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir);
      writeArtifact(root, "conference-load.json", {
        schemaVersion: "sena-enterprise-conference-load-rehearsal/v1",
        generatedAt,
        status: "pass",
        target: {
          productionTargetSatisfied: true,
          productionOriginSatisfied: true,
          requireProductionTarget: true,
          configuredUsers: 50,
          configuredDurationSeconds: 1800
        },
        origin: {
          configured: true,
          originHash: hostHash("https://www.sena.hk"),
          originValueExcluded: true,
          pathValuesExcluded: true
        },
        summary: {
          p95Ms: 750,
          errorRatePercent: 0
        }
      });
      const result = runBind(["--artifact", path.join(root, "conference-load.json"), "--yes", "--scope", "test-team", "--target-url", "https://www.sena.hk"], {
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`
        }
      });
      const output = outputOf(result);

      expect(result.status).toBe(0);
      expect(output).toContain("SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED=added");
      expect(output).toContain("SENA_CONFERENCE_LOAD_REHEARSAL_ARTIFACT_SHA256=added");
      expect(output).toContain("SENA_CONFERENCE_LOAD_REHEARSAL_USERS=added");
      expect(output).toContain("SENA_CONFERENCE_LOAD_REHEARSAL_DURATION_SECONDS=added");
      expect(output).toContain("SENA production evidence binding complete. Secret values were not read or printed.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 15_000);

  it("refuses to bind conference load artifacts whose origin hash does not match the production target URL", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-load-hash-"));

    try {
      writeArtifact(root, "conference-load-other-host.json", {
        schemaVersion: "sena-enterprise-conference-load-rehearsal/v1",
        generatedAt,
        status: "pass",
        target: {
          productionTargetSatisfied: true,
          productionOriginSatisfied: true,
          requireProductionTarget: true,
          configuredUsers: 50,
          configuredDurationSeconds: 1800
        },
        origin: {
          configured: true,
          originHash: hostHash("https://other.sena.hk"),
          originValueExcluded: true,
          pathValuesExcluded: true
        },
        summary: {
          p95Ms: 750,
          errorRatePercent: 0
        }
      });
      const result = runBind([
        "--artifact",
        path.join(root, "conference-load-other-host.json"),
        "--scope",
        "test-team",
        "--target-url",
        "https://www.sena.hk"
      ]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("conference-load-other-host.json: Conference load rehearsal -> skip(conference-load-origin-hash-mismatch)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
      expect(output).not.toContain("SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED=configured(redacted)");
      expect(output).not.toContain("other.sena.hk");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to bind conference load artifacts when the configured target URL is not production HTTPS", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-load-target-"));

    try {
      writeArtifact(root, "conference-load-local-target.json", {
        schemaVersion: "sena-enterprise-conference-load-rehearsal/v1",
        generatedAt,
        status: "pass",
        target: {
          productionTargetSatisfied: true,
          productionOriginSatisfied: true,
          requireProductionTarget: true,
          configuredUsers: 50,
          configuredDurationSeconds: 1800
        },
        origin: {
          configured: true,
          originHash: hostHash("https://www.sena.hk"),
          originValueExcluded: true,
          pathValuesExcluded: true
        },
        summary: {
          p95Ms: 750,
          errorRatePercent: 0
        }
      });
      const result = runBind([
        "--artifact",
        path.join(root, "conference-load-local-target.json"),
        "--scope",
        "test-team",
        "--target-url",
        "http://localhost:3000"
      ]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("conference-load-local-target.json: Conference load rehearsal -> skip(conference-load-target-url-not-https)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
      expect(output).not.toContain("SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED=configured(redacted)");
      expect(output).not.toContain("localhost:3000");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to bind conference load artifacts that omit the redacted origin host hash", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-load-no-hash-"));

    try {
      writeArtifact(root, "conference-load-no-origin-hash.json", {
        schemaVersion: "sena-enterprise-conference-load-rehearsal/v1",
        generatedAt,
        status: "pass",
        target: {
          productionTargetSatisfied: true,
          productionOriginSatisfied: true,
          requireProductionTarget: true,
          configuredUsers: 50,
          configuredDurationSeconds: 1800
        },
        origin: {
          configured: true,
          originValueExcluded: true,
          pathValuesExcluded: true
        },
        summary: {
          p95Ms: 750,
          errorRatePercent: 0
        }
      });
      const result = runBind([
        "--artifact",
        path.join(root, "conference-load-no-origin-hash.json"),
        "--scope",
        "test-team",
        "--target-url",
        "https://www.sena.hk"
      ]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("conference-load-no-origin-hash.json: Conference load rehearsal -> skip(conference-load-origin-hash-missing)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
      expect(output).not.toContain("SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED=configured(redacted)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to bind conference load artifacts that lack production HTTPS origin evidence", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-local-load-"));

    try {
      writeArtifact(root, "conference-load-local.json", {
        schemaVersion: "sena-enterprise-conference-load-rehearsal/v1",
        generatedAt,
        status: "pass",
        target: {
          productionTargetSatisfied: true,
          productionOriginSatisfied: false,
          requireProductionTarget: true,
          configuredUsers: 50,
          configuredDurationSeconds: 1800
        },
        summary: {
          p95Ms: 750,
          errorRatePercent: 0
        }
      });
      const result = runBind(["--artifact", path.join(root, "conference-load-local.json"), "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("conference-load-local.json: Conference load rehearsal -> skip(conference-load-production-origin-not-satisfied)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
      expect(output).not.toContain("SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED=configured(redacted)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to bind short smoke artifacts as 50-user conference load evidence", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-short-load-"));

    try {
      writeArtifact(root, "conference-load-smoke.json", {
        schemaVersion: "sena-enterprise-conference-load-rehearsal/v1",
        generatedAt,
        status: "pass",
        target: {
          productionTargetSatisfied: false,
          requireProductionTarget: false,
          configuredUsers: 5,
          configuredDurationSeconds: 60
        },
        summary: {
          p95Ms: 750,
          errorRatePercent: 0
        }
      });
      const result = runBind(["--artifact", path.join(root, "conference-load-smoke.json"), "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("conference-load-smoke.json: Conference load rehearsal -> skip(conference-load-production-target-not-required)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
      expect(output).not.toContain("SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED=configured(redacted)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("binds performance budget artifacts only when build identity is clean and reproducible", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-performance-"));

    try {
      writeArtifact(root, "performance-budget.json", {
        schemaVersion: "sena-enterprise-production-performance-budget/v1",
        generatedAt,
        status: "pass",
        buildIdentity: {
          nextBuildIdSha256: "a".repeat(64),
          gitCommit: "b".repeat(40),
          gitDirty: false,
          packageLockSha256: "c".repeat(64),
          values: "hashes-and-commit-only"
        }
      });
      const result = runBind(["--artifact", path.join(root, "performance-budget.json"), "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(0);
      expect(output).toContain("performance-budget.json: Production performance budget -> bind");
      expect(output).toContain("SENA_PERFORMANCE_BUDGET_CONFIRMED=configured(redacted)");
      expect(output).toContain("SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256=configured(redacted)");
      expect(output).toContain("SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256=configured(redacted)");
      expect(output).toContain("SENA_PERFORMANCE_BUDGET_GIT_COMMIT=configured(redacted)");
      expect(output).toContain("SENA_PERFORMANCE_BUDGET_GIT_DIRTY=configured(redacted)");
      expect(output).toContain("SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256=configured(redacted)");
      expect(output).not.toContain("a".repeat(64));
      expect(output).not.toContain("b".repeat(40));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("binds blocked production runtime env packets as advisory handoff custody", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-runtime-packet-"));

    try {
      writeArtifact(root, "production-runtime-env-packet.json", {
        schemaVersion: "sena-enterprise-production-runtime-env-packet/v1",
        generatedAt,
        status: "blocked",
        target: {
          domainHostHash: "1".repeat(64),
          domainValueExcluded: true,
          scopeValueExcluded: true
        },
        summary: {
          requiredProviderGroups: 7,
          readyProviderGroups: 1,
          blockerIds: [
            "neon-postgres-env",
            "postgres-live-probe"
          ]
        },
        providerGroups: [
          { id: "vercel-project-custody", status: "pass" },
          { id: "neon-postgres", status: "blocked" },
          { id: "object-storage", status: "blocked" },
          { id: "cdn", status: "blocked" },
          { id: "server-job-queue", status: "blocked" },
          { id: "observability-alerting", status: "blocked" },
          { id: "conference-load-rehearsal", status: "blocked" }
        ],
        policy: {
          researchPilotCandidate: true,
          localFileStoreIsProductionBackend: false,
          secretValuesExcluded: true,
          endpointValuesExcluded: true,
          providerValuesMustBeEnteredOutsideArtifact: true
        },
        redaction: {
          secretValuesExcluded: true,
          endpointValuesExcluded: true,
          domainValueExcluded: true,
          scopeValueExcluded: true,
          sourceArtifactValuesExcluded: true,
          placeholdersOnly: true
        },
        secureInputTemplates: {
          neonPostgresUrlStdinPlaceholder: "<NEON_POSTGRES_URL>",
          forbiddenIfLeaked: "postgres://sena:super-secret@example.neon.tech/db"
        }
      });
      const result = runBind(["--artifact", path.join(root, "production-runtime-env-packet.json"), "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(0);
      expect(output).toContain("production-runtime-env-packet.json: Production runtime env packet -> bind");
      expect(output).toContain("SENA_PRODUCTION_RUNTIME_ENV_PACKET_CONFIRMED=configured(redacted)");
      expect(output).toContain("SENA_PRODUCTION_RUNTIME_ENV_PACKET_ARTIFACT_SHA256=configured(redacted)");
      expect(output).toContain("SENA_PRODUCTION_RUNTIME_ENV_PACKET_STATUS=configured(redacted)");
      expect(output).toContain("SENA_PRODUCTION_RUNTIME_ENV_PACKET_READY_PROVIDER_GROUPS=configured(redacted)");
      expect(output).toContain("Dry run only. Re-run with --yes");
      expect(output).not.toContain("postgres://");
      expect(output).not.toContain("super-secret");
      expect(output).not.toContain("example.neon.tech");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses production runtime env packets whose ready summary conflicts with provider blockers", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-runtime-packet-conflict-"));

    try {
      writeArtifact(root, "production-runtime-env-packet.json", {
        schemaVersion: "sena-enterprise-production-runtime-env-packet/v1",
        generatedAt,
        status: "ready",
        summary: {
          requiredProviderGroups: 2,
          readyProviderGroups: 2,
          blockerIds: [
            "runtime-header"
          ]
        },
        providerGroups: [
          { id: "vercel-project-custody", status: "pass" },
          { id: "neon-postgres", status: "blocked" }
        ],
        policy: {
          researchPilotCandidate: true,
          localFileStoreIsProductionBackend: false,
          secretValuesExcluded: true,
          endpointValuesExcluded: true,
          providerValuesMustBeEnteredOutsideArtifact: true
        },
        redaction: {
          secretValuesExcluded: true,
          endpointValuesExcluded: true,
          domainValueExcluded: true,
          scopeValueExcluded: true,
          sourceArtifactValuesExcluded: true,
          placeholdersOnly: true
        }
      });
      const result = runBind(["--artifact", path.join(root, "production-runtime-env-packet.json"), "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("production-runtime-env-packet.json: Production runtime env packet -> skip(production-runtime-env-packet-ready-summary-mismatch)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
      expect(output).not.toContain("SENA_PRODUCTION_RUNTIME_ENV_PACKET_CONFIRMED=configured(redacted)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("binds blocked production go-live gates as advisory handoff custody", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-go-live-gate-"));

    try {
      writeArtifact(root, "production-go-live-gate.json", {
        schemaVersion: "sena-enterprise-production-go-live-gate/v1",
        generatedAt,
        status: "blocked",
        summary: {
          productionReadyClaimAllowed: false,
          localPilotGateIsProductionGate: false,
          checks: 3,
          passed: 1,
          blockers: [
            "evidence:postgres-live-probe",
            "deployment-readiness:production-postgres-state"
          ]
        },
        policy: {
          researchPilotCandidateUntilGateReady: true,
          localFileStoreIsProductionBackend: false,
          requirePostgresObjectStorageCdnQueueObservability: true,
          requireFiftyUserConferenceLoadRehearsal: true,
          localPilotGateSeparateFromEnterpriseGoLive: true,
          secretValuesExcluded: true,
          endpointValuesExcluded: true
        },
        redaction: {
          secretValuesExcluded: true,
          envValuesExcluded: true,
          endpointValuesExcluded: true,
          childArtifactsValuesExcluded: true
        },
        secureLeakProbe: "postgres://sena:super-secret@example.neon.tech/db"
      });
      const result = runBind(["--artifact", path.join(root, "production-go-live-gate.json"), "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(0);
      expect(output).toContain("production-go-live-gate.json: Production go-live gate -> bind");
      expect(output).toContain("SENA_PRODUCTION_GO_LIVE_GATE_CONFIRMED=configured(redacted)");
      expect(output).toContain("SENA_PRODUCTION_GO_LIVE_GATE_ARTIFACT_SHA256=configured(redacted)");
      expect(output).toContain("SENA_PRODUCTION_GO_LIVE_GATE_STATUS=configured(redacted)");
      expect(output).toContain("SENA_PRODUCTION_GO_LIVE_GATE_PRODUCTION_READY=configured(redacted)");
      expect(output).toContain("SENA_PRODUCTION_GO_LIVE_GATE_PASSED_CHECKS=configured(redacted)");
      expect(output).toContain("SENA_PRODUCTION_GO_LIVE_GATE_TOTAL_CHECKS=configured(redacted)");
      expect(output).toContain("Dry run only. Re-run with --yes");
      expect(output).not.toContain("postgres://");
      expect(output).not.toContain("super-secret");
      expect(output).not.toContain("example.neon.tech");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses production go-live gates whose ready summary conflicts with checks or blockers", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-go-live-gate-conflict-"));

    try {
      writeArtifact(root, "production-go-live-gate.json", {
        schemaVersion: "sena-enterprise-production-go-live-gate/v1",
        generatedAt,
        status: "ready",
        summary: {
          productionReadyClaimAllowed: true,
          localPilotGateIsProductionGate: false,
          checks: 3,
          passed: 2,
          blockers: [
            "runtime-env:server-job-queue-live-probe"
          ]
        },
        policy: {
          researchPilotCandidateUntilGateReady: true,
          localFileStoreIsProductionBackend: false,
          requirePostgresObjectStorageCdnQueueObservability: true,
          requireFiftyUserConferenceLoadRehearsal: true,
          localPilotGateSeparateFromEnterpriseGoLive: true,
          secretValuesExcluded: true,
          endpointValuesExcluded: true
        },
        redaction: {
          secretValuesExcluded: true,
          envValuesExcluded: true,
          endpointValuesExcluded: true,
          childArtifactsValuesExcluded: true
        }
      });
      const result = runBind(["--artifact", path.join(root, "production-go-live-gate.json"), "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("production-go-live-gate.json: Production go-live gate -> skip(production-go-live-gate-ready-summary-mismatch)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
      expect(output).not.toContain("SENA_PRODUCTION_GO_LIVE_GATE_CONFIRMED=configured(redacted)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to bind dirty performance budget artifacts", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-performance-dirty-"));

    try {
      writeArtifact(root, "performance-budget.json", {
        schemaVersion: "sena-enterprise-production-performance-budget/v1",
        generatedAt,
        status: "pass",
        buildIdentity: {
          nextBuildIdSha256: "a".repeat(64),
          gitCommit: "b".repeat(40),
          gitDirty: true,
          packageLockSha256: "c".repeat(64),
          values: "hashes-and-commit-only"
        }
      });
      const result = runBind(["--artifact", path.join(root, "performance-budget.json"), "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("performance-budget.json: Production performance budget -> skip(performance-build-git-dirty)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("expands a sha256-verified production evidence archive into bindable child artifacts", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-archive-"));

    try {
      const { artifactPath: cdnArtifactPath } = writeArtifact(root, "cdn-probe.json", {
        ...cdnProbeFixture(),
        secretLookingValue: "https://secret-cdn.example.com"
      });
      const { artifactPath: workerArtifactPath } = writeArtifact(root, "server-job-worker-contract.json", {
        ...serverJobWorkerContractFixture(),
        secretLookingValue: "https://worker-callback.example.com"
      });
      const { artifactPath: archivePath } = writeArtifact(root, "sena-production-evidence-archive.json", {
        schemaVersion: "sena-enterprise-production-evidence-archive/v1",
        generatedAt,
        status: "ready",
        items: [
          {
            id: "cdn-live-probe",
            status: "pass",
            artifactHashMatches: true,
            outputFile: path.relative(process.cwd(), cdnArtifactPath)
          },
          {
            id: "server-job-worker-contract",
            status: "pass",
            artifactHashMatches: true,
            outputFile: path.relative(process.cwd(), workerArtifactPath)
          }
        ],
        secretLookingValue: "https://archive-secret.example.com"
      });
      const result = runBind(["--artifact", archivePath, "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(0);
      expect(output).toContain("sena-production-evidence-archive.json: Unrecognized artifact -> skip(unknown-schema:sena-enterprise-production-evidence-archive/v1)");
      expect(output).toContain("cdn-probe.json: CDN live probe -> bind");
      expect(output).toContain("server-job-worker-contract.json: Server job worker contract -> bind");
      expect(output).toContain("SENA_CDN_LIVE_PROBE_CONFIRMED=configured(redacted)");
      expect(output).toContain("SENA_JOB_WORKER_CONTRACT_CONFIRMED=configured(redacted)");
      expect(output).not.toContain("secret-cdn.example.com");
      expect(output).not.toContain("worker-callback.example.com");
      expect(output).not.toContain("archive-secret.example.com");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("only expands pass and hash-matched child artifacts inside a ready production evidence archive", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-archive-filter-"));
    const outsideRoot = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-archive-outside-"));

    try {
      const { artifactPath: cdnArtifactPath } = writeArtifact(root, "cdn-probe.json", cdnProbeFixture());
      const { artifactPath: objectStorageArtifactPath } = writeArtifact(root, "object-storage-probe.json", {
        schemaVersion: "sena-enterprise-object-storage-probe/v1",
        generatedAt,
        status: "pass"
      });
      const { artifactPath: observabilityArtifactPath } = writeArtifact(root, "observability-probe.json", {
        schemaVersion: "sena-enterprise-observability-probe/v1",
        generatedAt,
        status: "pass"
      });
      const { artifactPath: observabilityContractArtifactPath } = writeArtifact(root, "observability-contract.json", observabilityContractFixture());
      const { artifactPath: serverJobQueueContractArtifactPath } = writeArtifact(root, "server-job-queue-contract.json", serverJobQueueContractFixture());
      const { artifactPath: outsideWorkerArtifactPath } = writeArtifact(outsideRoot, "server-job-worker-contract.json", {
        schemaVersion: "sena-enterprise-server-job-worker-contract/v1",
        generatedAt,
        status: "pass",
        productionReady: true
      });
      const { artifactPath: archivePath } = writeArtifact(root, "sena-production-evidence-archive.json", {
        schemaVersion: "sena-enterprise-production-evidence-archive/v1",
        generatedAt,
        status: "ready",
        items: [
          {
            id: "cdn-live-probe",
            status: "pass",
            artifactHashMatches: true,
            outputFile: path.relative(root, cdnArtifactPath)
          },
          {
            id: "object-storage-live-probe",
            status: "review",
            artifactHashMatches: true,
            outputFile: path.relative(root, objectStorageArtifactPath)
          },
          {
            id: "server-job-queue-contract",
            status: "pass",
            artifactHashMatches: true,
            outputFile: path.relative(root, serverJobQueueContractArtifactPath)
          },
          {
            id: "observability-contract",
            status: "pass",
            artifactHashMatches: true,
            outputFile: path.relative(root, observabilityContractArtifactPath)
          },
          {
            id: "observability-live-probe",
            status: "pass",
            artifactHashMatches: false,
            outputFile: path.relative(root, observabilityArtifactPath)
          },
          {
            id: "server-job-worker-contract",
            status: "pass",
            artifactHashMatches: true,
            outputFile: outsideWorkerArtifactPath
          }
        ]
      });
      const result = runBind(["--artifact", archivePath, "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(0);
      expect(output).toContain("cdn-probe.json: CDN live probe -> bind");
      expect(output).toContain("SENA_CDN_LIVE_PROBE_CONFIRMED=configured(redacted)");
      expect(output).toContain("server-job-queue-contract.json: Server job queue contract -> bind");
      expect(output).toContain("SENA_JOB_QUEUE_CONTRACT_CONFIRMED=configured(redacted)");
      expect(output).toContain("observability-contract.json: Observability contract -> bind");
      expect(output).toContain("SENA_OBSERVABILITY_CONTRACT_CONFIRMED=configured(redacted)");
      expect(output).not.toContain("object-storage-probe.json: Object storage live probe -> bind");
      expect(output).not.toContain("observability-probe.json: Observability live probe -> bind");
      expect(output).not.toContain("server-job-worker-contract.json: Server job worker contract -> bind");
      expect(output).not.toContain("SENA_OBJECT_STORAGE_LIVE_PROBE_CONFIRMED=configured(redacted)");
      expect(output).not.toContain("SENA_OBSERVABILITY_LIVE_PROBE_CONFIRMED=configured(redacted)");
      expect(output).not.toContain("SENA_JOB_WORKER_CONTRACT_CONFIRMED=configured(redacted)");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it("does not expand blocked production evidence archives even when their sha256 custody file matches", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-archive-blocked-"));

    try {
      const { artifactPath: cdnArtifactPath } = writeArtifact(root, "cdn-probe.json", {
        schemaVersion: "sena-enterprise-cdn-probe/v1",
        generatedAt,
        status: "pass"
      });
      const { artifactPath: archivePath } = writeArtifact(root, "sena-production-evidence-archive.json", {
        schemaVersion: "sena-enterprise-production-evidence-archive/v1",
        generatedAt,
        status: "blocked",
        items: [{
          id: "cdn-live-probe",
          status: "pass",
          outputFile: path.relative(process.cwd(), cdnArtifactPath)
        }]
      });
      const result = runBind(["--artifact", archivePath, "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("sena-production-evidence-archive.json: Unrecognized artifact -> skip(unknown-schema:sena-enterprise-production-evidence-archive/v1)");
      expect(output).not.toContain("cdn-probe.json: CDN live probe -> bind");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not expand production evidence archives whose sha256 custody file is missing or mismatched", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-archive-bad-sha-"));

    try {
      const { artifactPath: cdnArtifactPath } = writeArtifact(root, "cdn-probe.json", {
        schemaVersion: "sena-enterprise-cdn-probe/v1",
        generatedAt,
        status: "pass"
      });
      const { artifactPath: archivePath } = writeArtifact(root, "sena-production-evidence-archive.json", {
        schemaVersion: "sena-enterprise-production-evidence-archive/v1",
        generatedAt,
        status: "blocked",
        items: [{
          id: "cdn-live-probe",
          status: "pass",
          outputFile: path.relative(process.cwd(), cdnArtifactPath)
        }]
      });
      writeFileSync(`${archivePath}.sha256`, `${"0".repeat(64)}  sena-production-evidence-archive.json\n`);
      const result = runBind(["--artifact", archivePath, "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("sena-production-evidence-archive.json: Unrecognized artifact -> skip(unknown-schema:sena-enterprise-production-evidence-archive/v1)");
      expect(output).not.toContain("cdn-probe.json: CDN live probe -> bind");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to bind artifacts without matching sha256 custody files", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-bad-sha-"));

    try {
      const { artifactPath } = writeArtifact(root, "observability-probe.json", {
        schemaVersion: "sena-enterprise-observability-probe/v1",
        generatedAt,
        status: "pass"
      });
      writeFileSync(`${artifactPath}.sha256`, `${"0".repeat(64)}  observability-probe.json\n`);
      const result = runBind(["--artifact", artifactPath, "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("skip(sha256-file-mismatch)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
