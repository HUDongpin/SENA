import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
import { validateSenaPerformanceBudgetArtifactForArchive } from "../../../scripts/archive-sena-production-evidence";

const projectRoot = process.cwd();
const viteNodePath = path.join(projectRoot, "node_modules", ".bin", "vite-node");
const productionArchiveScriptPath = path.join(projectRoot, "scripts", "archive-sena-production-evidence.ts");
const archiveScriptPath = productionArchiveScriptPath;
let performanceLocalBuildRoot: string;
let performanceLocalEvidence: ReturnType<typeof buildSenaPerformanceLocalEvidenceFixture>;

beforeEach(() => {
  performanceLocalBuildRoot = mkdtempSync(path.join(tmpdir(), "sena-archive-performance-build-"));
  performanceLocalEvidence = buildSenaPerformanceLocalEvidenceFixture(performanceLocalBuildRoot);
});

afterEach(() => {
  rmSync(performanceLocalBuildRoot, { recursive: true, force: true });
});

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
  buildIdentity?: ReturnType<typeof performanceBuildIdentityFixture>;
  sourceCustody?: ReturnType<typeof performanceSourceCustodyFixture> | ReturnType<typeof performanceCleanSourceCustodyFixture>;
  localEvidence?: typeof performanceLocalEvidence;
} = {}) {
  const localEvidence = input.localEvidence ?? performanceLocalEvidence;
  const buildIdentity = input.buildIdentity ?? performanceBuildIdentityFixture({}, localEvidence);
  const sourceCustody = Object.hasOwn(input, "sourceCustody")
    ? input.sourceCustody
    : performanceCleanSourceCustodyFixture(buildIdentity);
  const actual = localEvidence.actualBrotliBytes;
  return {
    schemaVersion: "sena-enterprise-production-performance-budget/v2",
    generatedAt: "2026-07-01T00:00:00.000Z",
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
    redaction: { localBuildPathsExcluded: true, sourceContentsExcluded: true, secretValuesExcluded: true }
  };
}

function cleanEnv() {
  const env = { ...process.env };
  for (const name of [
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "NEON_DATABASE_URL",
    "SENA_DATABASE_URL",
    "SENA_ENTERPRISE_POSTGRES_URL",
    "SENA_OBJECT_STORAGE_ADAPTER",
    "SENA_OBJECT_STORAGE_ENDPOINT",
    "SENA_OBJECT_STORAGE_BUCKET",
    "SENA_OBJECT_STORAGE_ACCESS_KEY_ID",
    "SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY",
    "SENA_CDN_VERIFY_URL",
    "SENA_CDN_URL",
    "SENA_JOB_QUEUE_ADAPTER",
    "SENA_JOB_QUEUE_URL",
    "SENA_JOB_QUEUE_SECRET",
    "SENA_OBSERVABILITY_EXPORTER_URL",
    "SENA_OBSERVABILITY_EXPORTER_SECRET",
    "SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN",
    "SENA_LOAD_REQUIRE_PRODUCTION_TARGET",
    "SENA_LOAD_TARGET_URL",
    "SENA_LOAD_TARGET_USERS",
    "SENA_LOAD_CONCURRENCY",
    "SENA_LOAD_RAMP_SECONDS",
    "SENA_LOAD_DURATION_SECONDS",
    "SENA_LOAD_THINK_TIME_MS"
  ]) {
    delete env[name];
  }
  env.NODE_ENV = "test";
  return env;
}

function writeFakeVercel(binDir: string) {
  const scriptPath = path.join(binDir, "vercel");
  writeFileSync(scriptPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Vercel CLI 54.9.0"
  exit 0
fi
if [ "$1" = "inspect" ]; then
  echo '{"name":"sena-hk","url":"sena-secret-deployment.vercel.app","readyState":"READY","target":"production"}'
  exit 0
fi
if [ "$1" = "domains" ] && [ "$2" = "inspect" ]; then
  echo "Project Domains"
  echo "www.sena.hk"
  exit 0
fi
if [ "$1" = "env" ] && [ "$2" = "ls" ]; then
  echo " name                               value               environments"
  echo " SENA_APP_URL                       Encrypted           Production"
  echo " NEXT_PUBLIC_SENA_APP_URL           Encrypted           Production"
  echo " SENA_SESSION_SECRET                Encrypted           Production"
  echo " SENA_CSRF_SECRET                   Encrypted           Production"
  echo " SENA_MFA_ENCRYPTION_KEY            Encrypted           Production"
  echo " SENA_OPS_TOKEN                     Encrypted           Production"
  exit 0
fi
echo "unexpected vercel args: $*" >&2
exit 1
`);
  chmodSync(scriptPath, 0o755);
}

function writeFakeVerifier(
  binDir: string,
  performanceBuildIdentity = performanceBuildIdentityFixture({ gitDirty: true }),
  performanceSourceCustody?: ReturnType<typeof performanceSourceCustodyFixture>,
  performanceArtifactOverride?: ReturnType<typeof performanceBudgetArtifactFixture>
) {
  const scriptPath = path.join(binDir, "fake-verifier.mjs");
  const performanceBudgetArtifact = performanceArtifactOverride ?? performanceBudgetArtifactFixture({
    buildIdentity: performanceBuildIdentity,
    ...(performanceSourceCustody === undefined ? {} : { sourceCustody: performanceSourceCustody })
  });
  writeFileSync(scriptPath, `#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const script = process.argv[2] || "";
const outputIndex = process.argv.indexOf("--output");
if (outputIndex === -1) {
  console.error("missing --output");
  process.exit(1);
}
const output = process.argv[outputIndex + 1];
function schemaVersionForScript(value) {
  if (value.includes("verify-sena-production-evidence-manifest.ts")) return "sena-enterprise-production-evidence-manifest/v1";
  if (value.includes("verify-sena-postgres-schema-contract.ts")) return "sena-enterprise-postgres-schema-contract/v1";
  if (value.includes("verify-sena-postgres-runtime.ts")) return "sena-enterprise-postgres-probe/v1";
  if (value.includes("verify-sena-cdn-contract.ts")) return "sena-enterprise-cdn-contract/v1";
  if (value.includes("verify-sena-object-storage-contract.ts")) return "sena-enterprise-object-storage-contract/v1";
  if (value.includes("verify-sena-object-storage-runtime.ts")) return "sena-enterprise-object-storage-probe/v1";
  if (value.includes("verify-sena-job-queue-contract.ts")) return "sena-enterprise-server-job-queue-contract/v1";
  if (value.includes("verify-sena-job-queue-runtime.ts")) return "sena-enterprise-server-job-queue-probe/v1";
  if (value.includes("verify-sena-job-worker-contract.ts")) return "sena-enterprise-server-job-worker-contract/v1";
  if (value.includes("verify-sena-observability-contract.ts")) return "sena-enterprise-observability-contract/v1";
  if (value.includes("verify-sena-observability-runtime.ts")) return "sena-enterprise-observability-probe/v1";
  if (value.includes("prepare-sena-production-runtime-env-packet.ts")) return "sena-enterprise-production-runtime-env-packet/v1";
  if (value.includes("check-sena-production-go-live-gate.ts")) return "sena-enterprise-production-go-live-gate/v1";
  return "sena-test-artifact/v1";
}
const status = script.includes("verify-sena-cdn-runtime.ts")
  ? "review"
  : script.includes("verify-sena-production-evidence-manifest.ts")
    ? "ready"
    : script.includes("prepare-sena-production-runtime-env-packet.ts") || script.includes("check-sena-production-go-live-gate.ts")
      ? "blocked"
      : "pass";
const loadUsers = Number(process.env.SENA_LOAD_TARGET_USERS);
const loadConcurrency = Number(process.env.SENA_LOAD_CONCURRENCY);
const loadRampSeconds = Number(process.env.SENA_LOAD_RAMP_SECONDS);
const loadDurationSeconds = Number(process.env.SENA_LOAD_DURATION_SECONDS);
const loadOriginSatisfied = /^https:\\/\\//.test(process.env.SENA_LOAD_TARGET_URL ?? "");
const loadProductionRequired = process.env.SENA_LOAD_REQUIRE_PRODUCTION_TARGET === "1";
const targetHost = new URL(process.env.SENA_CDN_VERIFY_URL ?? "https://www.sena.hk").host;
const targetHostHash = createHash("sha256").update(targetHost).digest("hex");
const loadOriginHash = createHash("sha256").update(new URL(process.env.SENA_LOAD_TARGET_URL ?? "https://www.sena.hk").host).digest("hex");
const artifact = script.includes("verify-sena-vercel-production.ts")
  ? {
    schemaVersion: "sena-enterprise-vercel-production-preflight/v1",
    generatedAt: "2026-07-01T00:00:00.000Z",
    status: "pass",
	    target: {
	      domain: targetHost,
	      domainValueExcluded: false,
	      scopeConfigured: true,
	      scopeValueExcluded: true
	    },
	    deployment: {
	      status: "pass",
	      deploymentUrlHash: "${"d".repeat(64)}",
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
	      xSenaRuntime: "enterprise-neon"
	    },
	    redaction: {
	      secretValuesExcluded: true,
	      envValuesExcluded: true,
	      endpointValuesHashed: true
	    }
	  }
  : script.includes("verify-sena-performance-path.ts")
  ? ${JSON.stringify(performanceBudgetArtifact)}
  : script.includes("verify-sena-conference-load.ts")
    ? {
      schemaVersion: "sena-enterprise-conference-load-rehearsal/v1",
      generatedAt: "2026-07-01T00:00:00.000Z",
      status: "pass",
      target: {
        productionTargetSatisfied: loadUsers >= 50 && loadDurationSeconds >= 1800 && loadOriginSatisfied,
        productionOriginSatisfied: loadOriginSatisfied,
        requireProductionTarget: loadProductionRequired,
        configuredUsers: loadUsers,
        configuredConcurrency: loadConcurrency,
        configuredRampSeconds: loadRampSeconds,
        configuredDurationSeconds: loadDurationSeconds
      },
      origin: {
        configured: true,
        originHash: loadOriginHash,
        originValueExcluded: true,
        pathValuesExcluded: true
      },
      summary: {
        p95Ms: 750,
        errorRatePercent: 0
      }
    }
  : script.includes("verify-sena-cdn-runtime.ts")
    ? {
      schemaVersion: "sena-enterprise-cdn-probe/v1",
      generatedAt: "2026-07-01T00:00:00.000Z",
      status,
      target: {
        configured: true,
        hostHash: targetHostHash,
        urlValueExcluded: true
      },
      cdnTimeoutMs: process.env.SENA_CDN_PROBE_TIMEOUT_MS ?? "missing"
    }
    : {
    schemaVersion: schemaVersionForScript(script),
    generatedAt: "2026-07-01T00:00:00.000Z",
    status
  };
const text = JSON.stringify(artifact, null, 2) + "\\n";
const sha = createHash("sha256").update(text).digest("hex");
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, text);
writeFileSync(output + ".sha256", sha + "  " + path.basename(output) + "\\n");
process.exit(0);
`);
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

function writeFakeDirtyPerformanceVerifier(binDir: string) {
  const scriptPath = path.join(binDir, "fake-dirty-performance-verifier.mjs");
  writeFileSync(scriptPath, `#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const script = process.argv[2] || "";
const outputIndex = process.argv.indexOf("--output");
if (outputIndex === -1) {
  console.error("missing --output");
  process.exit(1);
}
const output = process.argv[outputIndex + 1];
const loadUsers = Number(process.env.SENA_LOAD_TARGET_USERS);
const loadConcurrency = Number(process.env.SENA_LOAD_CONCURRENCY);
const loadRampSeconds = Number(process.env.SENA_LOAD_RAMP_SECONDS);
const loadDurationSeconds = Number(process.env.SENA_LOAD_DURATION_SECONDS);
const loadOriginSatisfied = /^https:\\/\\//.test(process.env.SENA_LOAD_TARGET_URL ?? "");
const loadProductionRequired = process.env.SENA_LOAD_REQUIRE_PRODUCTION_TARGET === "1";
const targetHost = new URL(process.env.SENA_CDN_VERIFY_URL ?? "https://www.sena.hk").host;
const targetHostHash = createHash("sha256").update(targetHost).digest("hex");
const loadOriginHash = createHash("sha256").update(new URL(process.env.SENA_LOAD_TARGET_URL ?? "https://www.sena.hk").host).digest("hex");
const artifact = script.includes("verify-sena-vercel-production.ts")
  ? {
    schemaVersion: "sena-enterprise-vercel-production-preflight/v1",
    generatedAt: "2026-07-01T00:00:00.000Z",
    status: "pass",
	    target: {
	      domain: targetHost,
	      domainValueExcluded: false,
	      scopeConfigured: true,
	      scopeValueExcluded: true
	    },
	    deployment: {
	      status: "pass",
	      deploymentUrlHash: "${"d".repeat(64)}",
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
	      xSenaRuntime: "enterprise-neon"
	    },
	    redaction: {
	      secretValuesExcluded: true,
	      envValuesExcluded: true,
	      endpointValuesHashed: true
	    }
	  }
  : script.includes("verify-sena-performance-path.ts")
  ? ${JSON.stringify(performanceBudgetArtifactFixture({ buildIdentity: performanceBuildIdentityFixture({ gitDirty: true }) }))}
  : script.includes("verify-sena-conference-load.ts")
    ? {
      schemaVersion: "sena-enterprise-conference-load-rehearsal/v1",
      generatedAt: "2026-07-01T00:00:00.000Z",
      status: "pass",
      target: {
        productionTargetSatisfied: loadUsers >= 50 && loadDurationSeconds >= 1800 && loadOriginSatisfied,
        productionOriginSatisfied: loadOriginSatisfied,
        requireProductionTarget: loadProductionRequired,
        configuredUsers: loadUsers,
        configuredConcurrency: loadConcurrency,
        configuredRampSeconds: loadRampSeconds,
        configuredDurationSeconds: loadDurationSeconds
      },
      origin: {
        configured: true,
        originHash: loadOriginHash,
        originValueExcluded: true,
        pathValuesExcluded: true
      },
      summary: {
        p95Ms: 750,
        errorRatePercent: 0
      }
    }
  : script.includes("verify-sena-cdn-runtime.ts")
    ? {
      schemaVersion: "sena-enterprise-cdn-probe/v1",
      generatedAt: "2026-07-01T00:00:00.000Z",
      status: "pass",
      target: {
        configured: true,
        hostHash: targetHostHash,
        urlValueExcluded: true
      }
    }
  : {
    schemaVersion: script.includes("verify-sena-production-evidence-manifest.ts") ? "sena-enterprise-production-evidence-manifest/v1" : "sena-test-artifact/v1",
    generatedAt: "2026-07-01T00:00:00.000Z",
    status: script.includes("verify-sena-production-evidence-manifest.ts") ? "ready" : "pass"
  };
const text = JSON.stringify(artifact, null, 2) + "\\n";
const sha = createHash("sha256").update(text).digest("hex");
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, text);
writeFileSync(output + ".sha256", sha + "  " + path.basename(output) + "\\n");
process.exit(0);
`);
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

function writeFakeShortConferenceLoadVerifier(binDir: string) {
  const scriptPath = path.join(binDir, "fake-short-conference-load-verifier.mjs");
  writeFileSync(scriptPath, `#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const script = process.argv[2] || "";
const outputIndex = process.argv.indexOf("--output");
if (outputIndex === -1) {
  console.error("missing --output");
  process.exit(1);
}
const output = process.argv[outputIndex + 1];
const targetHost = new URL(process.env.SENA_CDN_VERIFY_URL ?? "https://www.sena.hk").host;
const targetHostHash = createHash("sha256").update(targetHost).digest("hex");
const artifact = script.includes("verify-sena-vercel-production.ts")
  ? {
    schemaVersion: "sena-enterprise-vercel-production-preflight/v1",
    generatedAt: "2026-07-01T00:00:00.000Z",
    status: "pass",
	    target: {
	      domain: targetHost,
	      domainValueExcluded: false,
	      scopeConfigured: true,
	      scopeValueExcluded: true
	    },
	    deployment: {
	      status: "pass",
	      deploymentUrlHash: "${"d".repeat(64)}",
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
	      xSenaRuntime: "enterprise-neon"
	    },
	    redaction: {
	      secretValuesExcluded: true,
	      envValuesExcluded: true,
	      endpointValuesHashed: true
	    }
	  }
  : script.includes("verify-sena-performance-path.ts")
  ? ${JSON.stringify(performanceBudgetArtifactFixture({ buildIdentity: performanceBuildIdentityFixture({ gitDirty: true }) }))}
  : script.includes("verify-sena-conference-load.ts")
    ? {
      schemaVersion: "sena-enterprise-conference-load-rehearsal/v1",
      generatedAt: "2026-07-01T00:00:00.000Z",
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
    }
  : script.includes("verify-sena-cdn-runtime.ts")
    ? {
      schemaVersion: "sena-enterprise-cdn-probe/v1",
      generatedAt: "2026-07-01T00:00:00.000Z",
      status: "pass",
      target: {
        configured: true,
        hostHash: targetHostHash,
        urlValueExcluded: true
      }
    }
  : {
    schemaVersion: script.includes("verify-sena-production-evidence-manifest.ts") ? "sena-enterprise-production-evidence-manifest/v1" : "sena-test-artifact/v1",
      generatedAt: "2026-07-01T00:00:00.000Z",
      status: script.includes("verify-sena-production-evidence-manifest.ts") ? "ready" : "pass"
    };
const text = JSON.stringify(artifact, null, 2) + "\\n";
const sha = createHash("sha256").update(text).digest("hex");
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, text);
writeFileSync(output + ".sha256", sha + "  " + path.basename(output) + "\\n");
process.exit(0);
`);
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

function writeFakeMismatchedConferenceLoadVerifier(binDir: string) {
  const scriptPath = path.join(binDir, "fake-mismatched-conference-load-verifier.mjs");
  writeFileSync(scriptPath, `#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const script = process.argv[2] || "";
const outputIndex = process.argv.indexOf("--output");
if (outputIndex === -1) {
  console.error("missing --output");
  process.exit(1);
}
const output = process.argv[outputIndex + 1];
const targetHost = new URL(process.env.SENA_CDN_VERIFY_URL ?? "https://www.sena.hk").host;
const targetHostHash = createHash("sha256").update(targetHost).digest("hex");
const artifact = script.includes("verify-sena-performance-path.ts")
  ? ${JSON.stringify(performanceBudgetArtifactFixture({ buildIdentity: performanceBuildIdentityFixture({ gitDirty: true }) }))}
  : script.includes("verify-sena-conference-load.ts")
    ? {
      schemaVersion: "sena-enterprise-conference-load-rehearsal/v1",
      generatedAt: "2026-07-01T00:00:00.000Z",
      status: "pass",
      target: {
        productionTargetSatisfied: true,
        productionOriginSatisfied: true,
        requireProductionTarget: true,
        configuredUsers: 50,
        configuredConcurrency: 50,
        configuredRampSeconds: 120,
        configuredDurationSeconds: 1800
      },
      origin: {
        configured: true,
        originHash: createHash("sha256").update("other.sena.hk").digest("hex"),
        originValueExcluded: true,
        pathValuesExcluded: true
      },
      summary: {
        p95Ms: 750,
        errorRatePercent: 0
      }
    }
  : script.includes("verify-sena-vercel-production.ts")
    ? {
      schemaVersion: "sena-enterprise-vercel-production-preflight/v1",
      generatedAt: "2026-07-01T00:00:00.000Z",
      status: "pass",
      target: {
	      domain: targetHost,
	      domainValueExcluded: false,
	      scopeConfigured: true,
	      scopeValueExcluded: true
	    },
	    deployment: {
	      status: "pass",
	      deploymentUrlHash: "${"d".repeat(64)}",
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
	      xSenaRuntime: "enterprise-neon"
	    },
	    redaction: {
	      secretValuesExcluded: true,
	      envValuesExcluded: true,
	      endpointValuesHashed: true
	    }
	  }
  : script.includes("verify-sena-cdn-runtime.ts")
    ? {
      schemaVersion: "sena-enterprise-cdn-probe/v1",
      generatedAt: "2026-07-01T00:00:00.000Z",
      status: "pass",
      target: {
        configured: true,
        hostHash: targetHostHash,
        urlValueExcluded: true
      }
    }
    : {
      schemaVersion: script.includes("verify-sena-production-evidence-manifest.ts") ? "sena-enterprise-production-evidence-manifest/v1" : "sena-test-artifact/v1",
      generatedAt: "2026-07-01T00:00:00.000Z",
      status: script.includes("verify-sena-production-evidence-manifest.ts") ? "ready" : "pass"
    };
const text = JSON.stringify(artifact, null, 2) + "\\n";
const sha = createHash("sha256").update(text).digest("hex");
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, text);
writeFileSync(output + ".sha256", sha + "  " + path.basename(output) + "\\n");
process.exit(0);
`);
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

function writeFakeMismatchedTargetVerifier(binDir: string, mismatch: "cdn" | "vercel" | "vercel-runtime") {
  const scriptPath = path.join(binDir, `fake-mismatched-${mismatch}-target-verifier.mjs`);
  writeFileSync(scriptPath, `#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const mismatch = ${JSON.stringify(mismatch)};
const script = process.argv[2] || "";
const outputIndex = process.argv.indexOf("--output");
if (outputIndex === -1) {
  console.error("missing --output");
  process.exit(1);
}
const output = process.argv[outputIndex + 1];
const targetHost = new URL(process.env.SENA_CDN_VERIFY_URL ?? "https://www.sena.hk").host;
const vercelTargetHost = mismatch === "vercel" ? "other.sena.hk" : targetHost;
const vercelRuntime = mismatch === "vercel-runtime" ? "enterprise-local" : "enterprise-neon";
const cdnTargetHost = mismatch === "cdn" ? "other.sena.hk" : targetHost;
const cdnTargetHostHash = createHash("sha256").update(cdnTargetHost).digest("hex");
const loadUsers = Number(process.env.SENA_LOAD_TARGET_USERS);
const loadConcurrency = Number(process.env.SENA_LOAD_CONCURRENCY);
const loadRampSeconds = Number(process.env.SENA_LOAD_RAMP_SECONDS);
const loadDurationSeconds = Number(process.env.SENA_LOAD_DURATION_SECONDS);
const loadOriginSatisfied = /^https:\\/\\//.test(process.env.SENA_LOAD_TARGET_URL ?? "");
const loadOriginHash = createHash("sha256").update(new URL(process.env.SENA_LOAD_TARGET_URL ?? "https://www.sena.hk").host).digest("hex");
const artifact = script.includes("verify-sena-vercel-production.ts")
  ? {
    schemaVersion: "sena-enterprise-vercel-production-preflight/v1",
    generatedAt: "2026-07-01T00:00:00.000Z",
    status: "pass",
	    target: {
	      domain: vercelTargetHost,
	      domainValueExcluded: false,
	      scopeConfigured: true,
	      scopeValueExcluded: true
	    },
	    deployment: {
	      status: "pass",
	      deploymentUrlHash: "${"d".repeat(64)}",
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
	      xSenaRuntime: vercelRuntime
	    },
	    redaction: {
	      secretValuesExcluded: true,
	      envValuesExcluded: true,
	      endpointValuesHashed: true
	    }
	  }
  : script.includes("verify-sena-cdn-runtime.ts")
    ? {
      schemaVersion: "sena-enterprise-cdn-probe/v1",
      generatedAt: "2026-07-01T00:00:00.000Z",
      status: "pass",
      target: {
        configured: true,
        hostHash: cdnTargetHostHash,
        urlValueExcluded: true
      }
    }
  : script.includes("verify-sena-performance-path.ts")
    ? ${JSON.stringify(performanceBudgetArtifactFixture({ buildIdentity: performanceBuildIdentityFixture({ gitDirty: true }) }))}
  : script.includes("verify-sena-conference-load.ts")
    ? {
      schemaVersion: "sena-enterprise-conference-load-rehearsal/v1",
      generatedAt: "2026-07-01T00:00:00.000Z",
      status: "pass",
      target: {
        productionTargetSatisfied: loadUsers >= 50 && loadDurationSeconds >= 1800 && loadOriginSatisfied,
        productionOriginSatisfied: loadOriginSatisfied,
        requireProductionTarget: process.env.SENA_LOAD_REQUIRE_PRODUCTION_TARGET === "1",
        configuredUsers: loadUsers,
        configuredConcurrency: loadConcurrency,
        configuredRampSeconds: loadRampSeconds,
        configuredDurationSeconds: loadDurationSeconds
      },
      origin: {
        configured: true,
        originHash: loadOriginHash,
        originValueExcluded: true,
        pathValuesExcluded: true
      },
      summary: {
        p95Ms: 750,
        errorRatePercent: 0
      }
    }
  : {
    schemaVersion: script.includes("verify-sena-production-evidence-manifest.ts") ? "sena-enterprise-production-evidence-manifest/v1" : "sena-test-artifact/v1",
    generatedAt: "2026-07-01T00:00:00.000Z",
    status: script.includes("verify-sena-production-evidence-manifest.ts") ? "ready" : "pass"
  };
const text = JSON.stringify(artifact, null, 2) + "\\n";
const sha = createHash("sha256").update(text).digest("hex");
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, text);
writeFileSync(output + ".sha256", sha + "  " + path.basename(output) + "\\n");
process.exit(0);
`);
  chmodSync(scriptPath, 0o755);
  return scriptPath;
}

describe("SENA production evidence archive", () => {
  it("runs the intentional archive CLI through vite-node script mode", () => {
    const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.["sena:production-evidence:archive"])
      .toBe("vite-node --script scripts/archive-sena-production-evidence.ts");
  });

  it("does not run archive side effects when another plain vite-node script imports the validator", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-import-"));
    const binDir = path.join(root, "bin");
    const importerPath = path.join(root, "import-validator.ts");
    const outputDir = path.join(root, "unexpected-archive");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir);
      const fakeVerifier = writeFakeVerifier(binDir, performanceBuildIdentityFixture());
      writeFileSync(importerPath, [
        `import { validateSenaPerformanceBudgetArtifactForArchive } from ${JSON.stringify(pathToFileURL(productionArchiveScriptPath).href)};`,
        "process.stdout.write(`validatorType=${typeof validateSenaPerformanceBudgetArtifactForArchive}\\n`);"
      ].join("\n"));

      const result = spawnSync(viteNodePath, [
        "--root",
        projectRoot,
        importerPath,
        "--",
        "--output-dir",
        outputDir,
        "--vercel-skip-http"
      ], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          NODE_ENV: "test",
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN: fakeVerifier
        }
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("validatorType=function\n");
      expect(result.stderr).toBe("");
      expect(existsSync(outputDir)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("cannot redirect production archive performance remeasurement with cwd or the legacy test root env", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-root-anchor-"));
    const binDir = path.join(root, "bin");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir);
      const fakeVerifier = writeFakeVerifier(binDir, performanceBuildIdentityFixture());
      const result = spawnSync(viteNodePath, [
        "--script",
        productionArchiveScriptPath,
        "--output-dir",
        root,
        "--vercel-scope",
        "test-team",
        "--vercel-skip-http",
        "--include-load"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          NODE_ENV: "test",
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN: fakeVerifier,
          SENA_CDN_VERIFY_URL: "https://www.sena.hk",
          SENA_TEST_PERFORMANCE_BUILD_ROOT: performanceLocalBuildRoot
        }
      });
      expect(
        existsSync(path.join(root, "sena-production-evidence-archive.json")),
        `${result.stdout ?? ""}\n${result.stderr ?? ""}`
      ).toBe(true);
      const archive = JSON.parse(readFileSync(
        path.join(root, "sena-production-evidence-archive.json"),
        "utf8"
      )) as {
        status?: string;
        items?: Array<{ id?: string; status?: string; artifactArchiveValidation?: string }>;
      };
      const performanceItem = archive.items?.find((item) => item.id === "performance-budget-artifact");

      expect(archive.status).toBe("blocked");
      expect(archive.items?.map((item) => item.id)).toContain("performance-budget-artifact");
      expect(performanceItem?.status).toBe("review");
      expect(performanceItem?.artifactArchiveValidation).toMatch(/^performance-local-build-/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("accepts clean reproducible performance evidence in the side-effect-free archive validator", () => {
    const artifact = performanceBudgetArtifactFixture();
    const observed = observeSenaLocalPerformanceBuildEvidence(performanceLocalBuildRoot);

    expect(validateSenaPerformanceBudgetArtifactForArchive(artifact, observed)).toBeUndefined();
  });

  it("accepts clean reproducible archive evidence from a Git SHA-256 repository", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-archive-performance-sha256-"));
    try {
      const localEvidence = buildSenaPerformanceLocalEvidenceFixture(root, { objectFormat: "sha256" });
      const artifact = performanceBudgetArtifactFixture({ localEvidence });
      const observed = observeSenaLocalPerformanceBuildEvidence(root);

      expect(artifact.buildIdentity.gitCommit).toMatch(/^[a-f0-9]{64}$/);
      expect(validateSenaPerformanceBudgetArtifactForArchive(artifact, observed)).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([39, 41, 63, 65])(
    "rejects a non-full %i-character Git object identifier before archive comparison",
    (length) => {
      const artifact = performanceBudgetArtifactFixture();
      const identity = artifact.buildIdentity;
      const invalidGitCommit = "c".repeat(length);
      identity.gitCommit = invalidGitCommit;
      const buildInputSha256 = senaBuildInputSha256({
        gitCommit: identity.gitCommit,
        gitDirty: identity.gitDirty,
        gitStatusSha256: identity.gitStatusSha256,
        gitDirtyFileCount: identity.gitDirtyFileCount,
        packageLockSha256: identity.packageLockSha256,
        sourceTreeSha256: identity.sourceTreeSha256,
        sourceFileListSha256: identity.sourceFileListSha256,
        sourceFileCount: identity.sourceFileCount,
        sourceReadErrorCount: identity.sourceReadErrorCount,
        sourceReadErrorSha256: identity.sourceReadErrorSha256
      });
      identity.buildInputSha256 = buildInputSha256;
      identity.currentExpectedBuildInputSha256 = buildInputSha256;
      identity.nextBuildIdSha256 = senaNextBuildIdSha256FromInputSha256(buildInputSha256);
      if (!artifact.sourceCustody) throw new Error("source custody fixture missing");
      artifact.sourceCustody.baseGitCommit = invalidGitCommit;

      expect(validateSenaPerformanceBudgetArtifactForArchive(
        artifact,
        observeSenaLocalPerformanceBuildEvidence(performanceLocalBuildRoot)
      )).toBe("performance-build-git-commit-missing");
    }
  );

  it("refuses include-load before running verifiers when the target URL is not production HTTPS", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-local-load-"));

    try {
      const result = spawnSync(viteNodePath, [
        "--script",
        archiveScriptPath,
        "--output-dir",
        root,
        "--include-load",
        "--cdn-verify-url",
        "http://127.0.0.1:3005"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          NODE_ENV: "test"
        }
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("SENA production evidence archive refused --include-load: target-url-not-https.");
      expect(result.stdout).not.toContain("productionEvidenceArchivePath=");
      expect(existsSync(path.join(root, "sena-production-evidence-archive.json"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("bundles redacted verifier artifacts and keeps controlled production blockers", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-"));
    const binDir = path.join(root, "bin");

    try {
      mkdirSync(binDir, { recursive: true });
      writeFakeVercel(binDir);
      const fakeVerifier = writeFakeVerifier(binDir);
      const result = spawnSync(viteNodePath, [
        "--script",
        archiveScriptPath,
        "--output-dir",
        root,
        "--vercel-scope",
        "test-team",
        "--vercel-skip-http"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          NODE_ENV: "test",
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN: fakeVerifier,
          SENA_CDN_VERIFY_URL: "https://www.sena.hk",
          SENA_ENTERPRISE_POSTGRES_URL: "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require"
        }
      });
      const archivePath = path.join(root, "sena-production-evidence-archive.json");
      const archiveText = readFileSync(archivePath, "utf8");
      const archiveSha = createHash("sha256").update(archiveText).digest("hex");
      const archiveShaText = readFileSync(`${archivePath}.sha256`, "utf8").trim();
      const archive = JSON.parse(archiveText) as {
        schemaVersion?: string;
        status?: string;
        summary?: {
          totalItems?: number;
          skipped?: number;
          productionBlockers?: string[];
        };
        items?: Array<{
          id: string;
          status: string;
          outputFile?: string;
          sha256File?: string;
          artifactHashMatches?: boolean;
          artifactSchemaVersion?: string;
          artifactStatus?: string;
          requiredForProduction?: boolean;
        }>;
      };
      const nonSkipped = archive.items?.filter((item) => item.status !== "skipped") ?? [];
      const vercelItem = archive.items?.find((item) => item.id === "vercel-production-preflight");
      const postgresSchemaItem = archive.items?.find((item) => item.id === "postgres-schema-contract");
      const objectStorageContractItem = archive.items?.find((item) => item.id === "object-storage-contract");
      const serverJobQueueContractItem = archive.items?.find((item) => item.id === "server-job-queue-contract");
      const observabilityContractItem = archive.items?.find((item) => item.id === "observability-contract");
      const packetItem = archive.items?.find((item) => item.id === "production-runtime-env-packet");
      const gateItem = archive.items?.find((item) => item.id === "production-go-live-gate");

      expect(result.status).toBe(1);
      expect(result.stdout).toContain(`productionEvidenceArchivePath=${archivePath}`);
      expect(result.stderr).toContain("SENA production evidence archive is blocked.");
      expect(archiveShaText).toBe(`${archiveSha}  sena-production-evidence-archive.json`);
      expect(archive.schemaVersion).toBe("sena-enterprise-production-evidence-archive/v1");
      expect(archive.status).toBe("blocked");
      expect(archive.summary).toEqual(expect.objectContaining({
        totalItems: 17,
        skipped: 1
      }));
      expect(archive.summary?.productionBlockers).toEqual([
        "cdn-live-probe",
        "performance-budget-artifact",
        "conference-load-rehearsal"
      ]);
      expect(vercelItem).toEqual(expect.objectContaining({
        status: "pass",
        artifactSchemaVersion: "sena-enterprise-vercel-production-preflight/v1",
        artifactHashMatches: true
      }));
      expect(postgresSchemaItem).toEqual(expect.objectContaining({
        status: "pass",
        requiredForProduction: true,
        command: expect.stringContaining("npm run sena:postgres:schema-contract")
      }));
      expect(objectStorageContractItem).toEqual(expect.objectContaining({
        status: "pass",
        requiredForProduction: true,
        command: expect.stringContaining("npm run sena:object-storage:contract"),
        artifactSchemaVersion: "sena-enterprise-object-storage-contract/v1"
      }));
      expect(serverJobQueueContractItem).toEqual(expect.objectContaining({
        status: "pass",
        requiredForProduction: true,
        command: expect.stringContaining("npm run sena:jobs:queue-contract"),
        artifactSchemaVersion: "sena-enterprise-server-job-queue-contract/v1"
      }));
      expect(observabilityContractItem).toEqual(expect.objectContaining({
        status: "pass",
        requiredForProduction: true,
        command: expect.stringContaining("npm run sena:observability:contract"),
        artifactSchemaVersion: "sena-enterprise-observability-contract/v1"
      }));
      expect(packetItem).toEqual(expect.objectContaining({
        status: "pass",
        requiredForProduction: false,
        artifactSchemaVersion: "sena-enterprise-production-runtime-env-packet/v1",
        artifactStatus: "blocked",
        artifactHashMatches: true
      }));
      expect(gateItem).toEqual(expect.objectContaining({
        status: "pass",
        requiredForProduction: false,
        artifactSchemaVersion: "sena-enterprise-production-go-live-gate/v1",
        artifactStatus: "blocked",
        artifactHashMatches: true
      }));
      expect(nonSkipped.every((item) => item.outputFile && item.sha256File && item.artifactHashMatches)).toBe(true);
      expect(readFileSync(path.join(root, "production-runtime-env-packet.json"), "utf8"))
        .not.toContain("super-secret");
      expect(readFileSync(path.join(root, "production-go-live-gate.json"), "utf8"))
        .not.toContain("super-secret");
      expect(archiveText).not.toContain("postgres://");
      expect(archiveText).not.toContain("super-secret");
      expect(archiveText).not.toContain("example.neon.tech");
      expect(archiveText).not.toContain("sena-secret-deployment.vercel.app");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps the archive blocked when a child verifier exits zero but emits a non-ready artifact", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-status-"));
    const binDir = path.join(root, "bin");

    try {
      mkdirSync(binDir, { recursive: true });
      const fakeVerifier = writeFakeVerifier(binDir);
      const result = spawnSync(viteNodePath, [
        "--script",
        archiveScriptPath,
        "--output-dir",
        root,
        "--include-load"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          NODE_ENV: "test",
          SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN: fakeVerifier
        }
      });
      const archivePath = path.join(root, "sena-production-evidence-archive.json");
      const archive = JSON.parse(readFileSync(archivePath, "utf8")) as {
        status?: string;
        summary?: {
          productionBlockers?: string[];
        };
        items?: Array<{
          id: string;
          status: string;
          command?: string;
          exitCode?: number;
          artifactStatus?: string;
          evidence?: string[];
          nextAction?: string;
        }>;
      };
      const cdnItem = archive.items?.find((item) => item.id === "cdn-live-probe");
      const loadItem = archive.items?.find((item) => item.id === "conference-load-rehearsal");
      const loadArtifact = JSON.parse(readFileSync(path.join(root, "conference-load-rehearsal.json"), "utf8")) as {
        target?: {
          productionTargetSatisfied?: boolean;
          productionOriginSatisfied?: boolean;
          requireProductionTarget?: boolean;
          configuredUsers?: number;
          configuredConcurrency?: number;
          configuredRampSeconds?: number;
          configuredDurationSeconds?: number;
        };
      };

      expect(result.status).toBe(1);
      expect(archive.status).toBe("blocked");
      expect(archive.summary?.productionBlockers).toEqual(["cdn-live-probe", "performance-budget-artifact"]);
      expect(loadItem?.command).toContain("SENA_LOAD_REQUIRE_PRODUCTION_TARGET=1 SENA_LOAD_TARGET_URL=<configured>");
      expect(loadItem?.command).toContain("SENA_LOAD_TARGET_USERS=50 SENA_LOAD_CONCURRENCY=50 SENA_LOAD_RAMP_SECONDS=120 SENA_LOAD_DURATION_SECONDS=1800");
      expect(loadItem?.command).toContain("SENA_LOAD_THINK_TIME_MS=1000");
      expect(loadArtifact.target).toEqual(expect.objectContaining({
        productionTargetSatisfied: true,
        productionOriginSatisfied: true,
        requireProductionTarget: true,
        configuredUsers: 50,
        configuredConcurrency: 50,
        configuredRampSeconds: 120,
        configuredDurationSeconds: 1800
      }));
      expect(archive.items?.find((item) => item.id === "production-runtime-env-packet")).toEqual(expect.objectContaining({
        status: "pass",
        requiredForProduction: false,
        artifactStatus: "blocked"
      }));
      expect(cdnItem).toEqual(expect.objectContaining({
        status: "review",
        exitCode: 0,
        artifactStatus: "review",
        nextAction: "Fix npm run sena:cdn:verify so the emitted artifact status is pass or ready before archive binding."
      }));
      expect(cdnItem?.evidence).toEqual(expect.arrayContaining([
        "artifactStatus=review",
        "artifactReadyForArchive=false",
        "artifactHashMatches=true"
      ]));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("passes a configured CDN timeout through to child verifier evidence", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-cdn-timeout-"));
    const binDir = path.join(root, "bin");

    try {
      mkdirSync(binDir, { recursive: true });
      const fakeVerifier = writeFakeVerifier(binDir);
      const result = spawnSync(viteNodePath, [
        "--script",
        archiveScriptPath,
        "--output-dir",
        root,
        "--cdn-timeout-ms",
        "15000"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          NODE_ENV: "test",
          SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN: fakeVerifier
        }
      });
      const archive = JSON.parse(readFileSync(path.join(root, "sena-production-evidence-archive.json"), "utf8")) as {
        evidence?: string[];
      };
      const cdnArtifact = JSON.parse(readFileSync(path.join(root, "cdn-probe.json"), "utf8")) as {
        cdnTimeoutMs?: string;
      };

      expect(result.status).toBe(1);
      expect(archive.evidence).toContain("cdnProbeTimeoutMs=15000");
      expect(cdnArtifact.cdnTimeoutMs).toBe("15000");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps the archive blocked when a passed performance artifact is not bindable", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-dirty-performance-"));
    const binDir = path.join(root, "bin");

    try {
      mkdirSync(binDir, { recursive: true });
      const fakeVerifier = writeFakeDirtyPerformanceVerifier(binDir);
      const result = spawnSync(viteNodePath, [
        "--script",
        archiveScriptPath,
        "--output-dir",
        root,
        "--include-load",
        "--advisory"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          NODE_ENV: "test",
          SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN: fakeVerifier
        }
      });
      const archivePath = path.join(root, "sena-production-evidence-archive.json");
      const archive = JSON.parse(readFileSync(archivePath, "utf8")) as {
        status?: string;
        summary?: {
          productionBlockers?: string[];
        };
        items?: Array<{
          id: string;
          status: string;
          exitCode?: number;
          artifactStatus?: string;
          artifactArchiveValidation?: string;
          evidence?: string[];
          nextAction?: string;
        }>;
      };
      const performanceItem = archive.items?.find((item) => item.id === "performance-budget-artifact");

      expect(result.status).toBe(1);
      expect(archive.status).toBe("blocked");
      expect(archive.summary?.productionBlockers).toEqual(["performance-budget-artifact"]);
      expect(archive.items?.find((item) => item.id === "production-runtime-env-packet")).toEqual(expect.objectContaining({
        status: "pass",
        requiredForProduction: false,
        artifactStatus: "blocked"
      }));
      expect(performanceItem).toEqual(expect.objectContaining({
        status: "review",
        exitCode: 0,
        artifactStatus: "pass",
        artifactArchiveValidation: "performance-build-git-dirty",
        nextAction: "Fix npm run sena:performance:check so the emitted artifact is bindable before archive binding (performance-build-git-dirty)."
      }));
      expect(performanceItem?.evidence).toEqual(expect.arrayContaining([
        "artifactStatus=pass",
        "artifactReadyForArchive=true",
        "artifactBindableForArchive=false",
        "artifactArchiveValidation=performance-build-git-dirty"
      ]));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps the archive blocked when performance build provenance does not match current source", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-stale-performance-"));
    const binDir = path.join(root, "bin");

    try {
      mkdirSync(binDir, { recursive: true });
      const fakeVerifier = writeFakeVerifier(
        binDir,
        performanceBuildIdentityFixture({ nextBuildMatchesCurrentSource: false })
      );
      const result = spawnSync(viteNodePath, [
        "--script",
        archiveScriptPath,
        "--output-dir",
        root,
        "--include-load",
        "--advisory"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          NODE_ENV: "test",
          SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN: fakeVerifier
        }
      });
      const archivePath = path.join(root, "sena-production-evidence-archive.json");
      const archive = JSON.parse(readFileSync(archivePath, "utf8")) as {
        status?: string;
        summary?: { productionBlockers?: string[] };
        items?: Array<{
          id: string;
          status: string;
          artifactArchiveValidation?: string;
          evidence?: string[];
          nextAction?: string;
        }>;
      };
      const performanceItem = archive.items?.find((item) => item.id === "performance-budget-artifact");

      expect(result.status).toBe(1);
      expect(archive.status).toBe("blocked");
      expect(archive.summary?.productionBlockers).toContain("performance-budget-artifact");
      expect(performanceItem).toEqual(expect.objectContaining({
        status: "review",
        artifactArchiveValidation: "performance-build-provenance-mismatch",
        nextAction: "Fix npm run sena:performance:check so the emitted artifact is bindable before archive binding (performance-build-provenance-mismatch)."
      }));
      expect(performanceItem?.evidence).toEqual(expect.arrayContaining([
        "artifactBindableForArchive=false",
        "artifactArchiveValidation=performance-build-provenance-mismatch"
      ]));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps the archive blocked when the measured performance artifact set was unstable", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-unstable-performance-"));
    const binDir = path.join(root, "bin");

    try {
      mkdirSync(binDir, { recursive: true });
      const fakeVerifier = writeFakeVerifier(
        binDir,
        performanceBuildIdentityFixture({ measuredArtifactSetStable: false })
      );
      const result = spawnSync(viteNodePath, [
        "--script",
        archiveScriptPath,
        "--output-dir",
        root,
        "--include-load",
        "--advisory"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          NODE_ENV: "test",
          SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN: fakeVerifier
        }
      });
      const archive = JSON.parse(readFileSync(path.join(root, "sena-production-evidence-archive.json"), "utf8")) as {
        items?: Array<{ id: string; artifactArchiveValidation?: string }>;
      };

      expect(result.status).toBe(1);
      expect(archive.items?.find((item) => item.id === "performance-budget-artifact"))
        .toEqual(expect.objectContaining({
          artifactArchiveValidation: "performance-build-provenance-mismatch"
        }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps the archive blocked when a performance pass artifact has forged budget math", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-forged-performance-math-"));
    const binDir = path.join(root, "bin");

    try {
      mkdirSync(binDir, { recursive: true });
      const forgedArtifact = performanceBudgetArtifactFixture();
      forgedArtifact.checks[4].headroomBytes = 18_001;
      const fakeVerifier = writeFakeVerifier(binDir, undefined, undefined, forgedArtifact);
      const result = spawnSync(viteNodePath, [
        "--script",
        archiveScriptPath,
        "--output-dir",
        root,
        "--include-load",
        "--advisory"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          NODE_ENV: "test",
          SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN: fakeVerifier
        }
      });
      const archive = JSON.parse(readFileSync(path.join(root, "sena-production-evidence-archive.json"), "utf8")) as {
        items?: Array<{ id: string; artifactArchiveValidation?: string }>;
      };

      expect(result.status).toBe(1);
      expect(archive.items?.find((item) => item.id === "performance-budget-artifact"))
        .toEqual(expect.objectContaining({
          artifactArchiveValidation: "performance-budget-math-invalid"
        }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps the archive blocked after lowered performance measurements and the sha sidecar are made self-consistent", () => {
    // Preserve the exact local output set, summary, and build identity. The
    // forged artifact changes only actual/headroom values while validation
    // remains side-effect free.
    const forgedArtifact = performanceBudgetArtifactFixture();
    forgedArtifact.checks[2].actualBrotliBytes = 1;
    forgedArtifact.checks[2].headroomBytes = 79_999;
    forgedArtifact.checks[3].actualBrotliBytes = 1;
    forgedArtifact.checks[3].headroomBytes = 179_999;
    forgedArtifact.checks[4].actualBrotliBytes = 1;
    forgedArtifact.checks[4].headroomBytes = 847_999;

    expect(validateSenaPerformanceBudgetArtifactForArchive(
      forgedArtifact,
      observeSenaLocalPerformanceBuildEvidence(performanceLocalBuildRoot)
    )).toBe("performance-local-build-measurement-mismatch");
  });

  it("keeps the archive blocked when local source no longer matches BUILD_ID", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-source-drift-"));
    const localBuildRoot = path.join(root, "local-build");

    try {
      const localEvidence = buildSenaPerformanceLocalEvidenceFixture(localBuildRoot);
      const performanceArtifact = performanceBudgetArtifactFixture({ localEvidence });
      writeFileSync(path.join(localBuildRoot, "lib", "runtime.ts"), "export const fixtureRuntime = 'changed-after-build';\n");

      expect(validateSenaPerformanceBudgetArtifactForArchive(
        performanceArtifact,
        observeSenaLocalPerformanceBuildEvidence(localBuildRoot)
      )).toBe("performance-local-build-identity-mismatch");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps the archive blocked when clean performance evidence omits source custody", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-missing-custody-"));
    const binDir = path.join(root, "bin");

    try {
      mkdirSync(binDir, { recursive: true });
      const performanceArtifact = performanceBudgetArtifactFixture({ sourceCustody: undefined });
      const fakeVerifier = writeFakeVerifier(binDir, undefined, undefined, performanceArtifact);
      const result = spawnSync(viteNodePath, [
        "--script",
        archiveScriptPath,
        "--output-dir",
        root,
        "--vercel-skip-http"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN: fakeVerifier
        }
      });
      const archive = JSON.parse(readFileSync(path.join(root, "sena-production-evidence-archive.json"), "utf8")) as {
        items?: Array<{ id?: string; artifactArchiveValidation?: string; status?: string }>;
      };

      expect(result.status).toBe(1);
      expect(archive.items?.find((item) => item.id === "performance-budget-artifact"))
        .toEqual(expect.objectContaining({
          status: "review",
          artifactArchiveValidation: "performance-source-custody-missing"
        }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps the archive blocked before a reviewed dirty custody claim can authorize evidence", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-custody-mismatch-"));
    const binDir = path.join(root, "bin");

    try {
      mkdirSync(binDir, { recursive: true });
      const buildIdentity = performanceBuildIdentityFixture({ gitDirty: true });
      const fakeVerifier = writeFakeVerifier(
        binDir,
        buildIdentity,
        performanceSourceCustodyFixture(buildIdentity, { sourceTreeSha256: "1".repeat(64) })
      );
      const result = spawnSync(viteNodePath, [
        "--script",
        archiveScriptPath,
        "--output-dir",
        root,
        "--include-load",
        "--advisory"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          NODE_ENV: "test",
          SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN: fakeVerifier
        }
      });
      const archive = JSON.parse(
        readFileSync(path.join(root, "sena-production-evidence-archive.json"), "utf8")
      ) as {
        items?: Array<{
          id: string;
          artifactArchiveValidation?: string;
          evidence?: string[];
        }>;
      };
      const performanceItem = archive.items?.find((item) => item.id === "performance-budget-artifact");

      expect(result.status).toBe(1);
      expect(performanceItem?.artifactArchiveValidation).toBe("performance-build-git-dirty");
      expect(performanceItem?.evidence).toContain("artifactArchiveValidation=performance-build-git-dirty");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps the archive blocked when conference load evidence targets a different host hash", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-mismatched-load-"));
    const binDir = path.join(root, "bin");

    try {
      mkdirSync(binDir, { recursive: true });
      const fakeVerifier = writeFakeMismatchedConferenceLoadVerifier(binDir);
      const result = spawnSync(viteNodePath, [
        "--script",
        archiveScriptPath,
        "--output-dir",
        root,
        "--include-load",
        "--advisory",
        "--cdn-verify-url",
        "https://www.sena.hk"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          NODE_ENV: "test",
          SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN: fakeVerifier
        }
      });
      const archive = JSON.parse(readFileSync(path.join(root, "sena-production-evidence-archive.json"), "utf8")) as {
        status?: string;
        summary?: {
          productionBlockers?: string[];
        };
        items?: Array<{
          id: string;
          status: string;
          exitCode?: number;
          artifactStatus?: string;
          artifactArchiveValidation?: string;
          evidence?: string[];
          nextAction?: string;
        }>;
      };
      const loadItem = archive.items?.find((item) => item.id === "conference-load-rehearsal");

      expect(result.status).toBe(1);
      expect(archive.status).toBe("blocked");
      expect(archive.summary?.productionBlockers).toEqual(["performance-budget-artifact", "conference-load-rehearsal"]);
      expect(loadItem).toEqual(expect.objectContaining({
        status: "review",
        exitCode: 0,
        artifactStatus: "pass",
        artifactArchiveValidation: "conference-load-origin-hash-mismatch",
        nextAction: "Fix npm run sena:conference:load-check so the emitted artifact is bindable before archive binding (conference-load-origin-hash-mismatch)."
      }));
      expect(loadItem?.evidence).toEqual(expect.arrayContaining([
        "artifactStatus=pass",
        "artifactReadyForArchive=true",
        "artifactBindableForArchive=false",
        "artifactArchiveValidation=conference-load-origin-hash-mismatch"
      ]));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps the archive blocked when CDN evidence targets a different host hash", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-mismatched-cdn-"));
    const binDir = path.join(root, "bin");

    try {
      mkdirSync(binDir, { recursive: true });
      const fakeVerifier = writeFakeMismatchedTargetVerifier(binDir, "cdn");
      const result = spawnSync(viteNodePath, [
        "--script",
        archiveScriptPath,
        "--output-dir",
        root,
        "--include-load",
        "--advisory",
        "--cdn-verify-url",
        "https://www.sena.hk"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          NODE_ENV: "test",
          SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN: fakeVerifier
        }
      });
      const archive = JSON.parse(readFileSync(path.join(root, "sena-production-evidence-archive.json"), "utf8")) as {
        status?: string;
        summary?: {
          productionBlockers?: string[];
        };
        items?: Array<{
          id: string;
          status: string;
          exitCode?: number;
          artifactStatus?: string;
          artifactArchiveValidation?: string;
          evidence?: string[];
          nextAction?: string;
        }>;
      };
      const cdnItem = archive.items?.find((item) => item.id === "cdn-live-probe");

      expect(result.status).toBe(1);
      expect(archive.status).toBe("blocked");
      expect(archive.summary?.productionBlockers).toEqual(["cdn-live-probe", "performance-budget-artifact"]);
      expect(cdnItem).toEqual(expect.objectContaining({
        status: "review",
        exitCode: 0,
        artifactStatus: "pass",
        artifactArchiveValidation: "cdn-target-host-hash-mismatch",
        nextAction: "Fix npm run sena:cdn:verify so the emitted artifact is bindable before archive binding (cdn-target-host-hash-mismatch)."
      }));
      expect(cdnItem?.evidence).toEqual(expect.arrayContaining([
        "artifactStatus=pass",
        "artifactReadyForArchive=true",
        "artifactBindableForArchive=false",
        "artifactArchiveValidation=cdn-target-host-hash-mismatch"
      ]));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps the archive blocked when Vercel preflight evidence targets a different domain", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-mismatched-vercel-"));
    const binDir = path.join(root, "bin");

    try {
      mkdirSync(binDir, { recursive: true });
      const fakeVerifier = writeFakeMismatchedTargetVerifier(binDir, "vercel");
      const result = spawnSync(viteNodePath, [
        "--script",
        archiveScriptPath,
        "--output-dir",
        root,
        "--include-load",
        "--advisory",
        "--cdn-verify-url",
        "https://www.sena.hk"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          NODE_ENV: "test",
          SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN: fakeVerifier
        }
      });
      const archive = JSON.parse(readFileSync(path.join(root, "sena-production-evidence-archive.json"), "utf8")) as {
        status?: string;
        summary?: {
          productionBlockers?: string[];
        };
        items?: Array<{
          id: string;
          status: string;
          exitCode?: number;
          artifactStatus?: string;
          artifactArchiveValidation?: string;
          evidence?: string[];
          nextAction?: string;
        }>;
      };
      const vercelItem = archive.items?.find((item) => item.id === "vercel-production-preflight");

      expect(result.status).toBe(1);
      expect(archive.status).toBe("blocked");
      expect(archive.summary?.productionBlockers).toEqual(["vercel-production-preflight", "performance-budget-artifact"]);
      expect(vercelItem).toEqual(expect.objectContaining({
        status: "review",
        exitCode: 0,
        artifactStatus: "pass",
        artifactArchiveValidation: "vercel-preflight-target-host-mismatch",
        nextAction: "Fix npm run sena:vercel:preflight so the emitted artifact is bindable before archive binding (vercel-preflight-target-host-mismatch)."
      }));
      expect(vercelItem?.evidence).toEqual(expect.arrayContaining([
        "artifactStatus=pass",
        "artifactReadyForArchive=true",
        "artifactBindableForArchive=false",
        "artifactArchiveValidation=vercel-preflight-target-host-mismatch"
      ]));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps the archive blocked when Vercel preflight runtime header is not managed state", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-vercel-runtime-"));
    const binDir = path.join(root, "bin");

    try {
      mkdirSync(binDir, { recursive: true });
      const fakeVerifier = writeFakeMismatchedTargetVerifier(binDir, "vercel-runtime");
      const result = spawnSync(viteNodePath, [
        "--script",
        archiveScriptPath,
        "--output-dir",
        root,
        "--include-load",
        "--advisory",
        "--cdn-verify-url",
        "https://www.sena.hk"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          NODE_ENV: "test",
          SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN: fakeVerifier
        }
      });
      const archive = JSON.parse(readFileSync(path.join(root, "sena-production-evidence-archive.json"), "utf8")) as {
        status?: string;
        summary?: {
          productionBlockers?: string[];
        };
        items?: Array<{
          id: string;
          status: string;
          exitCode?: number;
          artifactStatus?: string;
          artifactArchiveValidation?: string;
          evidence?: string[];
          nextAction?: string;
        }>;
      };
      const vercelItem = archive.items?.find((item) => item.id === "vercel-production-preflight");

      expect(result.status).toBe(1);
      expect(archive.status).toBe("blocked");
      expect(archive.summary?.productionBlockers).toEqual(["vercel-production-preflight", "performance-budget-artifact"]);
      expect(vercelItem).toEqual(expect.objectContaining({
        status: "review",
        exitCode: 0,
        artifactStatus: "pass",
        artifactArchiveValidation: "vercel-preflight-runtime-header-missing",
        nextAction: "Fix npm run sena:vercel:preflight so the emitted artifact is bindable before archive binding (vercel-preflight-runtime-header-missing)."
      }));
      expect(vercelItem?.evidence).toEqual(expect.arrayContaining([
        "artifactStatus=pass",
        "artifactReadyForArchive=true",
        "artifactBindableForArchive=false",
        "artifactArchiveValidation=vercel-preflight-runtime-header-missing"
      ]));
      expect(JSON.stringify(archive)).not.toContain("enterprise-local");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("keeps the archive blocked when a short smoke load is emitted as conference evidence", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sena-production-evidence-archive-short-load-"));
    const binDir = path.join(root, "bin");

    try {
      mkdirSync(binDir, { recursive: true });
      const fakeVerifier = writeFakeShortConferenceLoadVerifier(binDir);
      const result = spawnSync(viteNodePath, [
        "--script",
        archiveScriptPath,
        "--output-dir",
        root,
        "--include-load",
        "--advisory"
      ], {
        cwd: performanceLocalBuildRoot,
        encoding: "utf8",
        env: {
          ...cleanEnv(),
          NODE_ENV: "test",
          SENA_PRODUCTION_EVIDENCE_VERIFIER_BIN: fakeVerifier
        }
      });
      const archive = JSON.parse(readFileSync(path.join(root, "sena-production-evidence-archive.json"), "utf8")) as {
        status?: string;
        summary?: {
          productionBlockers?: string[];
        };
        items?: Array<{
          id: string;
          status: string;
          exitCode?: number;
          artifactStatus?: string;
          artifactArchiveValidation?: string;
          evidence?: string[];
          nextAction?: string;
        }>;
      };
      const loadItem = archive.items?.find((item) => item.id === "conference-load-rehearsal");

      expect(result.status).toBe(1);
      expect(archive.status).toBe("blocked");
      expect(archive.summary?.productionBlockers).toEqual(["performance-budget-artifact", "conference-load-rehearsal"]);
      expect(loadItem).toEqual(expect.objectContaining({
        status: "review",
        exitCode: 0,
        artifactStatus: "pass",
        artifactArchiveValidation: "conference-load-production-target-not-required",
        nextAction: "Fix npm run sena:conference:load-check so the emitted artifact is bindable before archive binding (conference-load-production-target-not-required)."
      }));
      expect(loadItem?.evidence).toEqual(expect.arrayContaining([
        "artifactStatus=pass",
        "artifactReadyForArchive=true",
        "artifactBindableForArchive=false",
        "artifactArchiveValidation=conference-load-production-target-not-required"
      ]));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
