import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  senaBuildInputSha256,
  senaNextBuildIdSha256FromInputSha256,
  senaPerformanceSourceCustodyManifestSha256,
  SENA_PERFORMANCE_SOURCE_CUSTODY_GENERATOR,
  SENA_NEXT_BUILD_ID_GENERATOR
} from "../enterprise/performance-build-identity.mjs";
import { observeSenaLocalPerformanceBuildEvidence } from "../enterprise/performance-build-measurement.mjs";
import { buildSenaPerformanceLocalEvidenceFixture } from "./performance-build-measurement-fixture";
import {
  classifySenaProductionEvidenceArchiveChildClaims,
  collectSenaProductionEvidenceArtifactReads,
  planSenaProductionEvidenceArtifactBinding,
  validateSenaPerformanceBudgetArtifactForBinding,
  writeSenaProductionEvidenceBindingPlanToVercel
} from "../../../scripts/bind-sena-production-evidence.mjs";

const projectRoot = process.cwd();
const productionScriptPath = path.join(projectRoot, "scripts", "bind-sena-production-evidence.mjs");
const scriptPath = productionScriptPath;
const generatedAt = "2026-07-01T00:00:00.000Z";
let performanceLocalBuildRoot: string;
let performanceLocalEvidence: ReturnType<typeof buildSenaPerformanceLocalEvidenceFixture>;

beforeEach(() => {
  performanceLocalBuildRoot = mkdtempSync(path.join(tmpdir(), "sena-bind-performance-build-"));
  performanceLocalEvidence = buildSenaPerformanceLocalEvidenceFixture(performanceLocalBuildRoot);
});

afterEach(() => {
  rmSync(performanceLocalBuildRoot, { recursive: true, force: true });
});

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
  cwd?: string;
} = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: options.cwd ?? performanceLocalBuildRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test",
      ...(options.env ?? {})
    }
  });
}

function outputOf(result: ReturnType<typeof runBind>) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function writeFakeVercel(binDir: string, capturePath?: string, failAtAdd?: number) {
  const scriptPath = path.join(binDir, "vercel");
  const countPath = path.join(binDir, "vercel-add-count");
  const captureValue = capturePath
    ? `value="$(cat)"\nprintf '%s=%s\\n' "$3" "$value" >> ${JSON.stringify(capturePath)}`
    : "cat >/dev/null";
  const failValue = failAtAdd
    ? `count=0
if [ -f ${JSON.stringify(countPath)} ]; then count="$(cat ${JSON.stringify(countPath)})"; fi
count=$((count + 1))
printf '%s' "$count" > ${JSON.stringify(countPath)}
if [ "$count" -eq ${failAtAdd} ]; then
  cat >/dev/null
  echo "injected Vercel env add failure" >&2
  exit 17
fi`
    : "";
  writeFileSync(scriptPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Vercel CLI 54.9.0"
  exit 0
fi
if [ "$1" = "env" ] && [ "$2" = "add" ]; then
  ${failValue}
  ${captureValue}
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

function performanceBuildIdentityFixture(input: {
  gitDirty?: boolean;
  nextBuildMatchesCurrentSource?: boolean;
  buildObservationStable?: boolean;
  measuredArtifactSetStable?: boolean;
} = {}, localEvidence = performanceLocalEvidence) {
  const gitDirty = input.gitDirty ?? false;
  const base = localEvidence.buildIdentity;
  const buildInput = {
    gitCommit: base.gitCommit,
    gitDirty,
    gitStatusSha256: gitDirty
      ? "d".repeat(64)
      : base.gitStatusSha256,
    gitDirtyFileCount: gitDirty ? 1 : 0,
    packageLockSha256: base.packageLockSha256,
    sourceTreeSha256: base.sourceTreeSha256,
    sourceFileListSha256: base.sourceFileListSha256,
    sourceFileCount: base.sourceFileCount,
    sourceReadErrorCount: base.sourceReadErrorCount,
    sourceReadErrorSha256: base.sourceReadErrorSha256
  };
  const buildInputSha256 = senaBuildInputSha256(buildInput);
  return {
    ...localEvidence.buildIdentity,
    nextBuildIdSha256: senaNextBuildIdSha256FromInputSha256(buildInputSha256),
    nextBuildIdGenerator: SENA_NEXT_BUILD_ID_GENERATOR,
    nextBuildMatchesCurrentSource: input.nextBuildMatchesCurrentSource ?? true,
    buildInputSha256,
    currentExpectedBuildInputSha256: buildInputSha256,
    buildInputEnvironmentScope: "not-bound-use-measured-artifact-set-sha256",
    buildObservationStable: input.buildObservationStable ?? true,
    measuredArtifactSetStable: input.measuredArtifactSetStable ?? true,
    ...buildInput,
    values: "hashes-and-commit-only"
  };
}

function performanceCleanSourceCustodyFixture(
  identity: ReturnType<typeof performanceBuildIdentityFixture>
) {
  return {
    ...performanceLocalEvidence.sourceCustody,
    baseGitCommit: identity.gitCommit,
    rootGitDirty: identity.gitDirty,
    rootGitDirtyFileCount: identity.gitDirtyFileCount,
    rootGitStatusSha256: identity.gitStatusSha256
  };
}

function performanceSourceCustodyFixture(
  identity: ReturnType<typeof performanceBuildIdentityFixture>,
  overrides: Partial<{
    sourceTreeSha256: string;
    fileListSha256: string;
    fileCount: number;
    rootGitStatusSha256: string;
    rootGitDirtyFileCount: number;
    rootGitDirty: boolean;
  }> = {}
) {
  const custody = {
    mode: "reviewed-clean-release-slice" as const,
    reviewedClean: true,
    sourceTreeSha256: overrides.sourceTreeSha256 ?? identity.sourceTreeSha256,
    fileListSha256: overrides.fileListSha256 ?? identity.sourceFileListSha256,
    fileCount: overrides.fileCount ?? identity.sourceFileCount,
    baseGitCommit: identity.gitCommit,
    rootGitDirty: overrides.rootGitDirty ?? identity.gitDirty,
    rootGitDirtyFileCount: overrides.rootGitDirtyFileCount ?? identity.gitDirtyFileCount,
    rootGitStatusSha256: overrides.rootGitStatusSha256 ?? identity.gitStatusSha256,
    generator: SENA_PERFORMANCE_SOURCE_CUSTODY_GENERATOR,
    values: "hashes-and-counts-only" as const
  };
  return {
    ...custody,
    manifestSha256: senaPerformanceSourceCustodyManifestSha256(custody)
  };
}

function performanceBudgetArtifactFixture(input: {
  buildIdentity?: ReturnType<typeof performanceBuildIdentityFixture> | Record<string, unknown>;
  sourceCustody?: ReturnType<typeof performanceSourceCustodyFixture> | Record<string, unknown>;
  localEvidence?: typeof performanceLocalEvidence;
} = {}) {
  const localEvidence = input.localEvidence ?? performanceLocalEvidence;
  const buildIdentity = input.buildIdentity ?? performanceBuildIdentityFixture({}, localEvidence);
  const sourceCustody = Object.hasOwn(input, "sourceCustody")
    ? input.sourceCustody
    : performanceCleanSourceCustodyFixture(buildIdentity as ReturnType<typeof performanceBuildIdentityFixture>);
  const actual = localEvidence.actualBrotliBytes;
  return {
    schemaVersion: "sena-enterprise-production-performance-budget/v2",
    generatedAt,
    status: "pass",
    summary: {
      checks: 5,
      passed: 5,
      failed: 0,
      totalStaticJsFiles: localEvidence.summary.totalStaticJsFiles,
      workspaceRouteJsFiles: localEvidence.summary.workspaceRouteJsFiles
    },
    policy: {
      productionBuildRequired: true,
      artifactPurpose: "archive-performance-budget-json-plus-sha256",
      buildIdentityRequiredForBinding: true,
      totalStaticJsHeadroomReserveRequired: true,
      strictProductionEvidenceRequired: true
    },
    buildIdentity,
    sourceCustody,
    budgets: {
      workspaceHtmlBrotliBytes: 80_000,
      workspaceRouteJsBrotliBytes: 180_000,
      totalStaticJsBrotliBytes: 848_000,
      totalStaticJsMinimumHeadroomBytes: 12_000
    },
    checks: [
      { id: "production-build-present", status: "pass" },
      { id: "production-build-identity", status: "pass" },
      { id: "workspace-html-br", status: "pass", actualBrotliBytes: actual.workspaceHtml, budgetBytes: 80_000, headroomBytes: 80_000 - actual.workspaceHtml },
      { id: "workspace-route-js-br", status: "pass", actualBrotliBytes: actual.workspaceRouteJs, budgetBytes: 180_000, headroomBytes: 180_000 - actual.workspaceRouteJs },
      { id: "total-static-js-br", status: "pass", actualBrotliBytes: actual.totalStaticJs, budgetBytes: 848_000, headroomBytes: 848_000 - actual.totalStaticJs, minimumHeadroomBytes: 12_000 }
    ],
    redaction: {
      localBuildPathsExcluded: true,
      sourceContentsExcluded: true,
      secretValuesExcluded: true
    }
  };
}

function planPerformanceArtifact(
  artifact: ReturnType<typeof performanceBudgetArtifactFixture>,
  localEvidence = observeSenaLocalPerformanceBuildEvidence(performanceLocalBuildRoot)
) {
  const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
  return planSenaProductionEvidenceArtifactBinding({
    artifact,
    artifactSha256: createHash("sha256").update(artifactText).digest("hex"),
    shaFilePresent: true,
    shaFileMatches: true
  }, {}, localEvidence);
}

function bindablePerformancePlan() {
  const plan = planPerformanceArtifact(performanceBudgetArtifactFixture());
  if (!plan.bindable || !plan.binding || !plan.env) {
    throw new Error(`Expected a bindable performance plan, received ${plan.reason ?? "unknown"}.`);
  }
  return {
    ...plan,
    binding: plan.binding,
    env: plan.env
  };
}

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
  it("cannot redirect production performance remeasurement with cwd or the legacy test root env", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-root-anchor-"));

    try {
      writeArtifact(root, "performance-budget.json", performanceBudgetArtifactFixture());
      const result = spawnSync(process.execPath, [
        productionScriptPath,
        "--artifact",
        path.join(root, "performance-budget.json"),
        "--scope",
        "test-team"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "test",
          SENA_TEST_PERFORMANCE_BUILD_ROOT: performanceLocalBuildRoot
        }
      });
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("performance-budget.json: Production performance budget -> skip(");
      expect(output).not.toContain("Production performance budget -> bind");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

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

      expect(result.status, output).toBe(0);
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

  it("writes pass-artifact evidence env values through the Vercel CLI with confirmation last", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-write-"));
    const binDir = path.join(root, "bin");
    const capturePath = path.join(root, "vercel-env-writes.txt");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir, capturePath);
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
      const writes = readFileSync(capturePath, "utf8").trim().split("\n");
      expect(writes[0]).toBe("SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED=0");
      expect(writes.at(-1)).toBe("SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED=1");
      expect(writes.filter((line) => line.startsWith("SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED=")))
        .toEqual([
          "SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED=0",
          "SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED=1"
        ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 15_000);

  it.each(Array.from({ length: 8 }, (_, index) => index + 1))(
    "leaves conference evidence unconfirmed when Vercel interrupts env write %i of 8",
    (failAtAdd) => {
      const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-interrupt-"));
      const binDir = path.join(root, "bin");
      const capturePath = path.join(root, "vercel-env-writes.txt");

      try {
        mkdirSync(binDir, { recursive: true });
        writeFakeVercel(binDir, capturePath, failAtAdd);
        writeFileSync(capturePath, "SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED=1\n");
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

        const result = runBind([
          "--artifact",
          path.join(root, "conference-load.json"),
          "--yes",
          "--scope",
          "test-team",
          "--target-url",
          "https://www.sena.hk"
        ], {
          env: {
            ...process.env,
            PATH: `${binDir}:${process.env.PATH ?? ""}`
          }
        });
        const writes = existsSync(capturePath)
          ? readFileSync(capturePath, "utf8").trim().split("\n").filter(Boolean)
          : [];

        expect(result.status).toBe(1);
        expect(writes.filter((line) => line.startsWith("SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED=")).at(-1))
          .toBe("SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED=0");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    15_000
  );

  it("writes the exact 10-key performance tuple with confirmation last", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-performance-write-"));
    const binDir = path.join(root, "bin");
    const capturePath = path.join(root, "vercel-env-writes.txt");
    const originalPath = process.env.PATH;

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir, capturePath);
      process.env.PATH = `${binDir}:${originalPath ?? ""}`;

      writeSenaProductionEvidenceBindingPlanToVercel(
        { environment: "production", scope: "test-team" },
        bindablePerformancePlan()
      );

      const writes = readFileSync(capturePath, "utf8").trim().split("\n");
      expect(writes).toHaveLength(11);
      expect(writes[0]).toBe("SENA_PERFORMANCE_BUDGET_CONFIRMED=0");
      expect(writes.at(-1)).toBe("SENA_PERFORMANCE_BUDGET_CONFIRMED=1");
      expect(new Set(writes.map((line) => line.slice(0, line.indexOf("="))))).toEqual(new Set([
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
      ]));
    } finally {
      process.env.PATH = originalPath;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(Array.from({ length: 11 }, (_, index) => index + 1))(
    "leaves the performance tuple unconfirmed when Vercel interrupts logical write %i of 11",
    (failAtAdd) => {
      const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-performance-interrupt-"));
      const binDir = path.join(root, "bin");
      const capturePath = path.join(root, "vercel-env-writes.txt");
      const originalPath = process.env.PATH;

      try {
        mkdirSync(binDir, { recursive: true });
        writeFakeVercel(binDir, capturePath, failAtAdd);
        writeFileSync(capturePath, "SENA_PERFORMANCE_BUDGET_CONFIRMED=1\n");
        process.env.PATH = `${binDir}:${originalPath ?? ""}`;

        expect(() => writeSenaProductionEvidenceBindingPlanToVercel(
          { environment: "production", scope: "test-team" },
          bindablePerformancePlan()
        )).toThrow("injected Vercel env add failure");

        const writes = existsSync(capturePath)
          ? readFileSync(capturePath, "utf8").trim().split("\n").filter(Boolean)
          : [];
        expect(writes.filter((line) => line.startsWith("SENA_PERFORMANCE_BUDGET_CONFIRMED=")).at(-1))
          .toBe("SENA_PERFORMANCE_BUDGET_CONFIRMED=0");
      } finally {
        process.env.PATH = originalPath;
        rmSync(root, { recursive: true, force: true });
      }
    }
  );

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

  it("accepts clean reproducible performance evidence in the side-effect-free validator", () => {
    const artifact = performanceBudgetArtifactFixture();
    const observed = observeSenaLocalPerformanceBuildEvidence(performanceLocalBuildRoot);

    expect(validateSenaPerformanceBudgetArtifactForBinding(artifact, observed)).toBeUndefined();
  });

  it("accepts clean reproducible performance evidence from a Git SHA-256 repository", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-bind-performance-sha256-"));
    try {
      const localEvidence = buildSenaPerformanceLocalEvidenceFixture(root, { objectFormat: "sha256" });
      const artifact = performanceBudgetArtifactFixture({ localEvidence });
      const observed = observeSenaLocalPerformanceBuildEvidence(root);

      expect(artifact.buildIdentity.gitCommit).toMatch(/^[a-f0-9]{64}$/);
      expect(validateSenaPerformanceBudgetArtifactForBinding(artifact, observed)).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("plans the exact v2 performance schema and measured output-set hash without side effects", () => {
    const artifact = performanceBudgetArtifactFixture();
    Object.assign(artifact.sourceCustody ?? {}, {
      manifestSha256: "1".repeat(64),
      sourceTreeSha256: "2".repeat(64)
    });
    const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
    const artifactSha256 = createHash("sha256").update(artifactText).digest("hex");
    const result = planSenaProductionEvidenceArtifactBinding({
      artifact,
      artifactSha256,
      shaFilePresent: true,
      shaFileMatches: true
    }, {}, observeSenaLocalPerformanceBuildEvidence(performanceLocalBuildRoot));

    expect(result.bindable).toBe(true);
    expect(result.env?.get("SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION"))
      .toBe("sena-enterprise-production-performance-budget/v2");
    expect(result.env?.get("SENA_PERFORMANCE_BUDGET_MEASURED_ARTIFACT_SET_SHA256"))
      .toBe(artifact.buildIdentity.measuredArtifactSetSha256);
    const expectedEnv = [
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
    ];
    expect(Array.from(result.env?.keys() ?? [])).toEqual(expectedEnv);
    expect(result.env?.has("SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MANIFEST_SHA256")).toBe(false);
    expect(result.env?.has("SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_TREE_SHA256")).toBe(false);
    const readme = readFileSync(path.join(projectRoot, "README.md"), "utf8");
    for (const name of expectedEnv) expect(readme).toContain(name);
    expect(readme).toContain("do not hand-assemble a partial performance env tuple");
    expect(readme).toContain("trusted deployment assertion handed off by the binder");
  });

  it.each([39, 41, 63, 65])("rejects a %i-character Git commit identity", (length) => {
    const artifact = performanceBudgetArtifactFixture();
    const identity = artifact.buildIdentity as ReturnType<typeof performanceBuildIdentityFixture>;
    const sourceCustody = artifact.sourceCustody as ReturnType<typeof performanceCleanSourceCustodyFixture>;
    identity.gitCommit = "5".repeat(length);
    identity.buildInputSha256 = senaBuildInputSha256(identity);
    identity.currentExpectedBuildInputSha256 = identity.buildInputSha256;
    identity.nextBuildIdSha256 = senaNextBuildIdSha256FromInputSha256(identity.buildInputSha256);
    sourceCustody.baseGitCommit = identity.gitCommit;

    expect(validateSenaPerformanceBudgetArtifactForBinding(
      artifact,
      observeSenaLocalPerformanceBuildEvidence(performanceLocalBuildRoot)
    )).toBe("performance-build-git-commit-missing");
  });

  it("does not bind legacy v1 performance artifacts as current production evidence", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-performance-v1-"));

    try {
      const artifact = performanceBudgetArtifactFixture();
      artifact.schemaVersion = "sena-enterprise-production-performance-budget/v1";
      writeArtifact(root, "performance-budget-v1.json", artifact);
      const result = runBind(["--artifact", path.join(root, "performance-budget-v1.json"), "--scope", "test-team"]);

      expect(result.status).toBe(1);
      expect(outputOf(result)).toContain("skip(unknown-schema:sena-enterprise-production-performance-budget/v1)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects forged performance pass artifacts whose checks, summary, or budget math are inconsistent", () => {
    const cases = [
      {
        name: "flipped-check",
        reason: "performance-budget-checks-invalid",
        mutate: (artifact: ReturnType<typeof performanceBudgetArtifactFixture>) => {
          artifact.checks[4].status = "fail";
        }
      },
      {
        name: "summary",
        reason: "performance-budget-summary-invalid",
        mutate: (artifact: ReturnType<typeof performanceBudgetArtifactFixture>) => {
          artifact.summary.failed = 1;
        }
      },
      {
        name: "headroom",
        reason: "performance-budget-math-invalid",
        mutate: (artifact: ReturnType<typeof performanceBudgetArtifactFixture>) => {
          artifact.checks[4].headroomBytes = 18_001;
        }
      },
      {
        name: "duplicate-check",
        reason: "performance-budget-checks-invalid",
        mutate: (artifact: ReturnType<typeof performanceBudgetArtifactFixture>) => {
          artifact.checks[4] = { ...artifact.checks[3] };
        }
      },
      {
        name: "widened-total-budget",
        reason: "performance-budget-values-invalid",
        mutate: (artifact: ReturnType<typeof performanceBudgetArtifactFixture>) => {
          artifact.budgets.totalStaticJsBrotliBytes = 999_999_999;
          artifact.checks[4].budgetBytes = 999_999_999;
          artifact.checks[4].headroomBytes = 999_169_999;
        }
      },
      {
        name: "weakened-reserve",
        reason: "performance-budget-values-invalid",
        mutate: (artifact: ReturnType<typeof performanceBudgetArtifactFixture>) => {
          artifact.budgets.totalStaticJsMinimumHeadroomBytes = 1;
          artifact.checks[4].minimumHeadroomBytes = 1;
        }
      }
    ];

    for (const testCase of cases) {
      const artifact = performanceBudgetArtifactFixture();
      testCase.mutate(artifact);
      const result = planPerformanceArtifact(artifact);

      expect(result.bindable, testCase.name).toBe(false);
      expect(result.reason, testCase.name).toBe(testCase.reason);
    }
  });

  it("rejects a self-consistent lowered performance measurement after the sha sidecar is recomputed", () => {
    // Start from the exact locally measured output digest, file counts,
    // source identity, and BUILD_ID. Only the three actual/headroom pairs
    // are forged while the pure planner receives the unchanged local build.
    const artifact = performanceBudgetArtifactFixture();
    artifact.checks[2].actualBrotliBytes = 1;
    artifact.checks[2].headroomBytes = 79_999;
    artifact.checks[3].actualBrotliBytes = 1;
    artifact.checks[3].headroomBytes = 179_999;
    artifact.checks[4].actualBrotliBytes = 1;
    artifact.checks[4].headroomBytes = 847_999;

    const result = planPerformanceArtifact(artifact);

    expect(result.bindable).toBe(false);
    expect(result.reason).toBe("performance-local-build-measurement-mismatch");
  });

  it("rejects performance evidence when local source changes without a matching BUILD_ID", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-performance-source-drift-"));
    const localBuildRoot = path.join(root, "local-build");

    try {
      const localEvidence = buildSenaPerformanceLocalEvidenceFixture(localBuildRoot);
      const artifact = performanceBudgetArtifactFixture({ localEvidence });
      writeFileSync(path.join(localBuildRoot, "lib", "runtime.ts"), "export const fixtureRuntime = 'changed-after-build';\n");

      const result = planPerformanceArtifact(
        artifact,
        observeSenaLocalPerformanceBuildEvidence(localBuildRoot)
      );

      expect(result.bindable).toBe(false);
      expect(result.reason).toBe("performance-local-build-identity-mismatch");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects performance evidence when the local BUILD_ID changes after measurement", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-performance-build-id-drift-"));
    const localBuildRoot = path.join(root, "local-build");

    try {
      const localEvidence = buildSenaPerformanceLocalEvidenceFixture(localBuildRoot);
      const artifact = performanceBudgetArtifactFixture({ localEvidence });
      writeFileSync(path.join(localBuildRoot, ".next", "BUILD_ID"), `sena-v2-${"a".repeat(64)}`);

      const result = planPerformanceArtifact(
        artifact,
        observeSenaLocalPerformanceBuildEvidence(localBuildRoot)
      );

      expect(result.bindable).toBe(false);
      expect(result.reason).toBe("performance-local-build-identity-mismatch");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects clean performance evidence without explicit source custody", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-performance-missing-custody-"));

    try {
      writeArtifact(root, "performance-budget.json", performanceBudgetArtifactFixture({
        sourceCustody: undefined
      }));
      const result = runBind(["--artifact", path.join(root, "performance-budget.json"), "--scope", "test-team"]);

      expect(result.status).toBe(1);
      expect(outputOf(result)).toContain("skip(performance-source-custody-missing)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses to bind performance evidence whose build provenance does not match current source", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-performance-stale-"));

    try {
      writeArtifact(root, "performance-budget.json", performanceBudgetArtifactFixture({
        buildIdentity: performanceBuildIdentityFixture({ nextBuildMatchesCurrentSource: false })
      }));
      const result = runBind(["--artifact", path.join(root, "performance-budget.json"), "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("performance-budget.json: Production performance budget -> skip(performance-build-provenance-mismatch)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["source observation", { buildObservationStable: false }],
    ["measured artifact set", { measuredArtifactSetStable: false }]
  ])("refuses to bind performance evidence with an unstable %s", (_label, overrides) => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-performance-unstable-"));

    try {
      writeArtifact(root, "performance-budget.json", performanceBudgetArtifactFixture({
        buildIdentity: performanceBuildIdentityFixture(overrides)
      }));
      const result = runBind(["--artifact", path.join(root, "performance-budget.json"), "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("performance-budget.json: Production performance budget -> skip(performance-build-provenance-mismatch)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
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
      writeArtifact(root, "performance-budget.json", performanceBudgetArtifactFixture({
        buildIdentity: performanceBuildIdentityFixture({ gitDirty: true })
      }));
      const result = runBind(["--artifact", path.join(root, "performance-budget.json"), "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("performance-budget.json: Production performance budget -> skip(performance-build-git-dirty)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses reviewed dirty performance evidence regardless of its custody manifest", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-performance-custody-manifest-"));

    try {
      const buildIdentity = performanceBuildIdentityFixture({ gitDirty: true });
      const sourceCustody = performanceSourceCustodyFixture(buildIdentity);
      writeArtifact(root, "performance-budget.json", performanceBudgetArtifactFixture({
        buildIdentity,
        sourceCustody: {
          ...sourceCustody,
          manifestSha256: "a".repeat(64),
        }
      }));
      const result = runBind(["--artifact", path.join(root, "performance-budget.json"), "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).toContain("performance-budget.json: Production performance budget -> skip(performance-build-git-dirty)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses reviewed dirty performance evidence even when every custody field matches build identity", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-performance-reviewed-custody-"));

    try {
      const buildIdentity = performanceBuildIdentityFixture({ gitDirty: true });
      writeArtifact(root, "performance-budget.json", performanceBudgetArtifactFixture({
        buildIdentity,
        sourceCustody: performanceSourceCustodyFixture(buildIdentity)
      }));
      const result = runBind(["--artifact", path.join(root, "performance-budget.json"), "--scope", "test-team"]);

      expect(result.status).toBe(1);
      expect(outputOf(result)).toContain("performance-budget.json: Production performance budget -> skip(performance-build-git-dirty)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses every reviewed-dirty custody variant before field-level authorization", () => {
    const cases = [
      { name: "source-tree", overrides: { sourceTreeSha256: "1".repeat(64) } },
      { name: "file-list", overrides: { fileListSha256: "2".repeat(64) } },
      { name: "file-count", overrides: { fileCount: 124 } },
      { name: "status", overrides: { rootGitStatusSha256: "3".repeat(64) } },
      { name: "dirty-count", overrides: { rootGitDirtyFileCount: 2 } },
      { name: "dirty-flag", overrides: { rootGitDirty: false } }
    ] as const;

    for (const testCase of cases) {
      const buildIdentity = performanceBuildIdentityFixture({ gitDirty: true });
      const result = planPerformanceArtifact(performanceBudgetArtifactFixture({
        buildIdentity,
        sourceCustody: performanceSourceCustodyFixture(buildIdentity, testCase.overrides)
      }));

      expect(result.bindable, testCase.name).toBe(false);
      expect(result.reason, testCase.name).toBe("performance-build-git-dirty");
    }
  });

  it("refuses a self-consistent build identity whose clean flag contradicts its dirty count", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-performance-dirty-invariant-"));

    try {
      const contradictoryInput = {
        ...performanceBuildIdentityFixture({ gitDirty: true }),
        gitDirty: false
      };
      const buildInputSha256 = senaBuildInputSha256(contradictoryInput);
      const buildIdentity = {
        ...contradictoryInput,
        buildInputSha256,
        currentExpectedBuildInputSha256: buildInputSha256,
        nextBuildIdSha256: senaNextBuildIdSha256FromInputSha256(buildInputSha256)
      };
      writeArtifact(root, "performance-budget.json", performanceBudgetArtifactFixture({
        buildIdentity
      }));
      const result = runBind(["--artifact", path.join(root, "performance-budget.json"), "--scope", "test-team"]);

      expect(result.status).toBe(1);
      expect(outputOf(result)).toContain("skip(performance-build-git-identity-invalid)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses a self-consistent build identity whose zero read-error count has a non-empty digest", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-performance-read-error-invariant-"));

    try {
      const impossibleInput = {
        ...performanceBuildIdentityFixture(),
        sourceReadErrorSha256: "9".repeat(64)
      };
      const buildInputSha256 = senaBuildInputSha256(impossibleInput);
      const buildIdentity = {
        ...impossibleInput,
        buildInputSha256,
        currentExpectedBuildInputSha256: buildInputSha256,
        nextBuildIdSha256: senaNextBuildIdSha256FromInputSha256(buildInputSha256)
      };
      writeArtifact(root, "performance-budget.json", performanceBudgetArtifactFixture({
        buildIdentity
      }));
      const result = runBind(["--artifact", path.join(root, "performance-budget.json"), "--scope", "test-team"]);

      expect(result.status).toBe(1);
      expect(outputOf(result)).toContain("skip(performance-build-identity-hash-missing)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("expands a sha256-verified production evidence archive into bindable child artifacts", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-archive-"));

    try {
      const { artifactPath: cdnArtifactPath, sha: cdnArtifactSha256 } = writeArtifact(root, "cdn-probe.json", {
        ...cdnProbeFixture(),
        secretLookingValue: "https://secret-cdn.example.com"
      });
      const { artifactPath: workerArtifactPath, sha: workerArtifactSha256 } = writeArtifact(root, "server-job-worker-contract.json", {
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
            artifactSha256: cdnArtifactSha256,
            outputFile: path.relative(root, cdnArtifactPath)
          },
          {
            id: "server-job-worker-contract",
            status: "pass",
            artifactHashMatches: true,
            artifactSha256: workerArtifactSha256,
            outputFile: path.relative(root, workerArtifactPath)
          }
        ],
        secretLookingValue: "https://archive-secret.example.com"
      });
      const result = runBind(["--artifact", archivePath, "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status, output).toBe(0);
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
      const { artifactPath: cdnArtifactPath, sha: cdnArtifactSha256 } = writeArtifact(root, "cdn-probe.json", cdnProbeFixture());
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
      const { artifactPath: observabilityContractArtifactPath, sha: observabilityContractArtifactSha256 } = writeArtifact(root, "observability-contract.json", observabilityContractFixture());
      const { artifactPath: serverJobQueueContractArtifactPath, sha: serverJobQueueContractArtifactSha256 } = writeArtifact(root, "server-job-queue-contract.json", serverJobQueueContractFixture());
      const { artifactPath: outsideWorkerArtifactPath, sha: outsideWorkerArtifactSha256 } = writeArtifact(outsideRoot, "server-job-worker-contract.json", {
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
            artifactSha256: cdnArtifactSha256,
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
            artifactSha256: serverJobQueueContractArtifactSha256,
            outputFile: path.relative(root, serverJobQueueContractArtifactPath)
          },
          {
            id: "observability-contract",
            status: "pass",
            artifactHashMatches: true,
            artifactSha256: observabilityContractArtifactSha256,
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
            artifactSha256: outsideWorkerArtifactSha256,
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

  it("does not expand an archive child whose current artifact hash differs from the recorded hash", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-archive-child-sha-"));

    try {
      const { artifactPath: cdnArtifactPath } = writeArtifact(root, "cdn-probe.json", cdnProbeFixture());
      const { artifactPath: archivePath } = writeArtifact(root, "sena-production-evidence-archive.json", {
        schemaVersion: "sena-enterprise-production-evidence-archive/v1",
        generatedAt,
        status: "ready",
        items: [{
          id: "cdn-live-probe",
          status: "pass",
          artifactHashMatches: true,
          artifactSha256: "0".repeat(64),
          outputFile: path.relative(root, cdnArtifactPath)
        }]
      });

      const result = runBind(["--artifact", archivePath, "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).not.toContain("cdn-probe.json: CDN live probe -> bind");
      expect(output).not.toContain("SENA_CDN_LIVE_PROBE_CONFIRMED=configured(redacted)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not expand an archive child symlink whose real path escapes the archive directory", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-archive-child-link-"));
    const outsideRoot = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-archive-child-link-outside-"));

    try {
      const { artifactPath: outsideArtifactPath, sha: outsideArtifactSha256 } = writeArtifact(
        outsideRoot,
        "outside-cdn-probe.json",
        cdnProbeFixture()
      );
      const linkedArtifactPath = path.join(root, "linked-cdn-probe.json");
      symlinkSync(outsideArtifactPath, linkedArtifactPath);
      writeFileSync(
        `${linkedArtifactPath}.sha256`,
        `${outsideArtifactSha256}  ${path.basename(linkedArtifactPath)}\n`
      );
      const { artifactPath: archivePath } = writeArtifact(root, "sena-production-evidence-archive.json", {
        schemaVersion: "sena-enterprise-production-evidence-archive/v1",
        generatedAt,
        status: "ready",
        items: [{
          id: "cdn-live-probe",
          status: "pass",
          artifactHashMatches: true,
          artifactSha256: outsideArtifactSha256,
          outputFile: path.basename(linkedArtifactPath)
        }]
      });

      const result = runBind(["--artifact", archivePath, "--scope", "test-team"]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).not.toContain("linked-cdn-probe.json: CDN live probe -> bind");
      expect(output).not.toContain("SENA_CDN_LIVE_PROBE_CONFIRMED=configured(redacted)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it("plans from the archive-pinned read when the child and sidecar are replaced after collection", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-archive-child-race-"));

    try {
      const { artifactPath: cdnArtifactPath, sha: originalSha256 } = writeArtifact(
        root,
        "cdn-probe.json",
        { ...cdnProbeFixture(), raceMarker: "original" }
      );
      const { artifactPath: archivePath } = writeArtifact(root, "sena-production-evidence-archive.json", {
        schemaVersion: "sena-enterprise-production-evidence-archive/v1",
        generatedAt,
        status: "ready",
        items: [{
          id: "cdn-live-probe",
          status: "pass",
          artifactHashMatches: true,
          artifactSha256: originalSha256,
          outputFile: path.basename(cdnArtifactPath)
        }]
      });

      const reads = collectSenaProductionEvidenceArtifactReads({
        artifacts: [archivePath],
        evidenceDirs: []
      });
      const pinnedRead = reads.find((read) => path.basename(read.file) === "cdn-probe.json");
      writeArtifact(root, "cdn-probe.json", { ...cdnProbeFixture(), raceMarker: "replacement" });

      expect(pinnedRead?.artifactSha256).toBe(originalSha256);
      expect(pinnedRead?.artifact.raceMarker).toBe("original");
      expect(planSenaProductionEvidenceArtifactBinding(pinnedRead!, {
        productionTargetUrl: "https://www.sena.hk"
      })).toMatchObject({
        bindable: true
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("plans from the archive-pinned canonical read when its symlink is retargeted after collection", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-archive-link-race-"));
    const outsideRoot = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-archive-link-race-outside-"));

    try {
      const { artifactPath: insideArtifactPath, sha: insideSha256 } = writeArtifact(
        root,
        "inside-cdn-probe.json",
        { ...cdnProbeFixture(), raceMarker: "inside" }
      );
      const { artifactPath: outsideArtifactPath, sha: outsideSha256 } = writeArtifact(
        outsideRoot,
        "outside-cdn-probe.json",
        { ...cdnProbeFixture(), raceMarker: "outside" }
      );
      const linkedArtifactPath = path.join(root, "linked-cdn-probe.json");
      symlinkSync(insideArtifactPath, linkedArtifactPath);
      writeFileSync(`${linkedArtifactPath}.sha256`, `${insideSha256}  ${path.basename(linkedArtifactPath)}\n`);
      const { artifactPath: archivePath } = writeArtifact(root, "sena-production-evidence-archive.json", {
        schemaVersion: "sena-enterprise-production-evidence-archive/v1",
        generatedAt,
        status: "ready",
        items: [{
          id: "cdn-live-probe",
          status: "pass",
          artifactHashMatches: true,
          artifactSha256: insideSha256,
          outputFile: path.basename(linkedArtifactPath)
        }]
      });

      const reads = collectSenaProductionEvidenceArtifactReads({
        artifacts: [archivePath],
        evidenceDirs: []
      });
      const pinnedRead = reads.find((read) => path.basename(read.file) === "linked-cdn-probe.json");
      rmSync(linkedArtifactPath);
      symlinkSync(outsideArtifactPath, linkedArtifactPath);
      writeFileSync(`${linkedArtifactPath}.sha256`, `${outsideSha256}  ${path.basename(linkedArtifactPath)}\n`);

      expect(pinnedRead?.artifactSha256).toBe(insideSha256);
      expect(pinnedRead?.artifact.raceMarker).toBe("inside");
      expect(planSenaProductionEvidenceArtifactBinding(pinnedRead!, {
        productionTargetUrl: "https://www.sena.hk"
      })).toMatchObject({
        bindable: true
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it("fails closed when two ready archives record conflicting pins for the same canonical child", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-archive-pin-conflict-"));

    try {
      const { artifactPath: cdnArtifactPath, sha: cdnArtifactSha256 } = writeArtifact(
        root,
        "cdn-probe.json",
        cdnProbeFixture()
      );
      const archiveBody = {
        schemaVersion: "sena-enterprise-production-evidence-archive/v1",
        generatedAt,
        status: "ready",
        items: [{
          id: "cdn-live-probe",
          status: "pass",
          artifactHashMatches: true,
          artifactSha256: cdnArtifactSha256,
          outputFile: path.basename(cdnArtifactPath)
        }]
      };
      const { artifactPath: firstArchivePath } = writeArtifact(
        root,
        "sena-production-evidence-archive-a.json",
        archiveBody
      );
      const { artifactPath: secondArchivePath } = writeArtifact(
        root,
        "sena-production-evidence-archive-b.json",
        {
          ...archiveBody,
          items: [{ ...archiveBody.items[0], artifactSha256: "0".repeat(64) }]
        }
      );

      const result = runBind([
        "--artifact",
        firstArchivePath,
        "--artifact",
        secondArchivePath,
        "--scope",
        "test-team"
      ]);
      const output = outputOf(result);

      expect(result.status).toBe(1);
      expect(output).not.toContain("cdn-probe.json: CDN live probe -> bind");
      expect(output).not.toContain("SENA_CDN_LIVE_PROBE_CONFIRMED=configured(redacted)");
      expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    { itemStatus: "review", artifactHashMatches: true, label: "review status" },
    { itemStatus: "pass", artifactHashMatches: false, label: "false artifactHashMatches" }
  ])(
    "blocks evidence-dir fallback for a ready archive child with $label",
    ({ itemStatus, artifactHashMatches }) => {
      const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-bind-archive-invalid-claim-"));

      try {
        const { artifactPath: cdnArtifactPath, sha: cdnArtifactSha256 } = writeArtifact(
          root,
          "cdn-probe.json",
          cdnProbeFixture()
        );
        const { artifactPath: archivePath } = writeArtifact(root, "sena-production-evidence-archive.json", {
          schemaVersion: "sena-enterprise-production-evidence-archive/v1",
          generatedAt,
          status: "ready",
          items: [{
            id: "cdn-live-probe",
            status: itemStatus,
            artifactHashMatches,
            artifactSha256: cdnArtifactSha256,
            outputFile: path.basename(cdnArtifactPath)
          }]
        });

        const result = runBind([
          "--artifact",
          archivePath,
          "--evidence-dir",
          root,
          "--scope",
          "test-team"
        ]);
        const output = outputOf(result);

        expect(result.status).toBe(1);
        expect(output).not.toContain("cdn-probe.json: CDN live probe -> bind");
        expect(output).not.toContain("SENA_CDN_LIVE_PROBE_CONFIRMED=configured(redacted)");
        expect(output).toContain("No passed SENA production evidence artifacts were bindable.");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );

  it("classifies conflicting pins from distinct lexical aliases of one canonical child", () => {
    const canonicalFile = "/archive/child.json";

    const result = classifySenaProductionEvidenceArchiveChildClaims([
      {
        file: "/archive/alias-a.json",
        canonicalFile,
        artifactSha256: "a".repeat(64)
      },
      {
        file: "/archive/alias-b.json",
        canonicalFile,
        artifactSha256: "b".repeat(64)
      }
    ]);

    expect(result.blockedCanonicalFiles).toEqual(new Set([canonicalFile]));
  });

  it("classifies conflicting pins when one lexical child resolves to different canonicals", () => {
    const lexicalFile = "/archive/child-link.json";
    const firstCanonical = "/archive/child-a.json";
    const secondCanonical = "/archive/child-b.json";

    const result = classifySenaProductionEvidenceArchiveChildClaims([
      {
        file: lexicalFile,
        canonicalFile: firstCanonical,
        artifactSha256: "a".repeat(64)
      },
      {
        file: lexicalFile,
        canonicalFile: secondCanonical,
        artifactSha256: "a".repeat(64)
      }
    ]);

    expect(result.blockedCanonicalFiles).toEqual(new Set([firstCanonical, secondCanonical]));
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
