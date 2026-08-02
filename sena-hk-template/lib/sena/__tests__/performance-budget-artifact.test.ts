import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildEnterpriseProductionPerformancePath } from "../enterprise/ops-productionization";
import { buildEnterpriseProductionPerformanceBudgetArtifact } from "../enterprise/performance-budget-artifact";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";

const performanceBudgetEnvNames = [
  "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH",
  "SENA_PERFORMANCE_BUDGET_CONFIRMED",
  "SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256",
  "SENA_PERFORMANCE_BUDGET_VERIFIED_AT",
  "SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256",
  "SENA_PERFORMANCE_BUDGET_GIT_COMMIT",
  "SENA_PERFORMANCE_BUDGET_GIT_DIRTY",
  "SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256",
  "SENA_PERFORMANCE_SOURCE_CUSTODY_MODE",
  "SENA_PERFORMANCE_SOURCE_CUSTODY_MANIFEST_SHA256",
  "SENA_PERFORMANCE_SOURCE_CUSTODY_TREE_SHA256",
  "SENA_PERFORMANCE_SOURCE_CUSTODY_FILE_LIST_SHA256",
  "SENA_PERFORMANCE_SOURCE_CUSTODY_FILE_COUNT",
  "SENA_PERFORMANCE_SOURCE_CUSTODY_BASE_GIT_COMMIT",
  "SENA_PERFORMANCE_SOURCE_CUSTODY_ROOT_GIT_STATUS_SHA256",
  "SENA_PERFORMANCE_SOURCE_CUSTODY_ROOT_GIT_DIRTY_FILE_COUNT"
];

function withTempRoot(run: (root: string) => void) {
  const root = mkdtempSync(path.join(tmpdir(), "sena-performance-budget-"));
  try {
    run(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function writeProductionBuildFixture(root: string, input: {
  workspaceHtml?: string;
  workspaceRouteJs?: string;
  sharedJs?: string;
}) {
  const workspaceServerDir = path.join(root, ".next", "server", "app", "workspace");
  const workspaceChunkDir = path.join(root, ".next", "static", "chunks", "app", "workspace", "sena");
  const sharedChunkDir = path.join(root, ".next", "static", "chunks", "shared");
  mkdirSync(workspaceServerDir, { recursive: true });
  mkdirSync(workspaceChunkDir, { recursive: true });
  mkdirSync(sharedChunkDir, { recursive: true });
  const workspaceHtmlPath = path.join(workspaceServerDir, "sena.html");
  const workspaceRouteJsPath = path.join(workspaceChunkDir, "page-fixture.js");
  const sharedJsPath = path.join(sharedChunkDir, "chunk.js");
  writeFileSync(path.join(root, ".next", "BUILD_ID"), "sena-build-fixture");
  writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ name: "sena-fixture", lockfileVersion: 3 }));
  writeFileSync(workspaceHtmlPath, input.workspaceHtml ?? "<main>SENA</main>");
  writeFileSync(workspaceRouteJsPath, input.workspaceRouteJs ?? "export const sena = 1;");
  writeFileSync(sharedJsPath, input.sharedJs ?? "export const shared = 1;");
  return {
    workspaceHtmlPath,
    workspaceRouteJsPath,
    sharedJsPath
  };
}

function runGit(root: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
}

function commitFixture(root: string) {
  runGit(root, ["init"]);
  runGit(root, ["config", "user.email", "sena-test@example.invalid"]);
  runGit(root, ["config", "user.name", "SENA Test"]);
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "fixture"]);
}

function gitOutput(root: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function dirtySourceCustodyEnv(root: string) {
  const commit = gitOutput(root, ["rev-parse", "HEAD"]);
  const statusText = gitOutput(root, ["status", "--porcelain"]);
  const statusHash = createHash("sha256").update(statusText).digest("hex");
  const dirtyFileCount = statusText.split(/\r?\n/).filter(Boolean).length;
  return {
    SENA_PERFORMANCE_SOURCE_CUSTODY_MODE: "reviewed-clean-release-slice",
    SENA_PERFORMANCE_SOURCE_CUSTODY_MANIFEST_SHA256: "a".repeat(64),
    SENA_PERFORMANCE_SOURCE_CUSTODY_TREE_SHA256: "b".repeat(64),
    SENA_PERFORMANCE_SOURCE_CUSTODY_FILE_LIST_SHA256: "c".repeat(64),
    SENA_PERFORMANCE_SOURCE_CUSTODY_FILE_COUNT: "123",
    SENA_PERFORMANCE_SOURCE_CUSTODY_BASE_GIT_COMMIT: commit,
    SENA_PERFORMANCE_SOURCE_CUSTODY_ROOT_GIT_STATUS_SHA256: statusHash,
    SENA_PERFORMANCE_SOURCE_CUSTODY_ROOT_GIT_DIRTY_FILE_COUNT: String(dirtyFileCount)
  };
}

describe("SENA production performance budget artifact", () => {
  afterEach(() => {
    for (const name of performanceBudgetEnvNames) delete process.env[name];
  });

  it("emits a redacted pass artifact for production build budgets", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});

      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env: {
          SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
          SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000"
        }
      });

      expect(artifact.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterpriseProductionPerformanceBudget);
      expect(artifact.status).toBe("pass");
      expect(artifact.summary.failed).toBe(0);
      expect(artifact.summary.workspaceRouteJsFiles).toBe(1);
      expect(artifact.policy.buildIdentityRequiredForBinding).toBe(true);
      expect(artifact.policy.strictProductionEvidenceRequired).toBe(false);
      expect(artifact.buildIdentity).toEqual(expect.objectContaining({
        nextBuildIdSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        gitCommit: "unavailable",
        gitDirty: "unknown",
        gitDirtyFileCount: "unknown",
        gitStatusSha256: "unavailable",
        packageLockSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        values: "hashes-and-commit-only"
      }));
      expect(artifact.sourceCustody).toEqual(expect.objectContaining({
        mode: "none",
        reviewedClean: false,
        values: "hashes-and-counts-only"
      }));
      expect(artifact.evidence).toEqual(expect.arrayContaining([
        "nextBuildIdSha256=present",
        "gitCommit=unavailable",
        "gitDirty=unknown",
        "gitDirtyFileCount=unknown",
        "gitStatusSha256=unavailable",
        "packageLockSha256=present",
        "buildIdentityValues=hashes-and-commit-only"
      ]));
      expect(artifact.redaction).toEqual({
        localBuildPathsExcluded: true,
        sourceContentsExcluded: true,
        secretValuesExcluded: true
      });
      expect(JSON.stringify(artifact)).not.toContain(root);
      expect(artifact.checks.map((check) => check.status)).toEqual(["pass", "pass", "pass", "pass", "pass"]);
    });
  });

  it("fails strict production evidence mode when the build identity cannot be bound", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});

      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env: {
          SENA_PERFORMANCE_BUDGET_BINDABLE_REQUIRED: "1",
          SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
          SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000"
        }
      });

      const identityCheck = artifact.checks.find((check) => check.id === "production-build-identity");

      expect(artifact.status).toBe("fail");
      expect(artifact.policy.strictProductionEvidenceRequired).toBe(true);
      expect(identityCheck).toEqual(expect.objectContaining({
        status: "fail",
        nextAction: "Run npm run build and npm run sena:performance:check from a clean git tree or reviewed clean release-slice source custody before binding or archiving production performance evidence."
      }));
      expect(identityCheck?.evidence).toEqual(expect.arrayContaining([
        "strictProductionEvidenceRequired=true",
        "bindableBuildIdentity=false",
        "gitCommit=missing-or-invalid",
        "gitDirtyClean=false"
      ]));
      expect(artifact.nextActions).toContain("Run npm run build and npm run sena:performance:check from a clean git tree or reviewed clean release-slice source custody before binding or archiving production performance evidence.");
      expect(JSON.stringify(artifact)).not.toContain(root);
    });
  });

  it("passes strict production evidence mode for a clean committed build identity", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});
      commitFixture(root);

      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env: {
          SENA_PERFORMANCE_BUDGET_BINDABLE_REQUIRED: "1",
          SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
          SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000"
        }
      });

      const identityCheck = artifact.checks.find((check) => check.id === "production-build-identity");

      expect(artifact.status).toBe("pass");
      expect(artifact.policy.strictProductionEvidenceRequired).toBe(true);
      expect(artifact.buildIdentity).toEqual(expect.objectContaining({
        nextBuildIdSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        gitCommit: expect.stringMatching(/^[a-f0-9]{40,64}$/),
        gitDirty: false,
        gitDirtyFileCount: 0,
        gitStatusSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        packageLockSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(artifact.sourceCustody).toEqual(expect.objectContaining({
        mode: "git-clean-worktree",
        reviewedClean: true,
        baseGitCommit: artifact.buildIdentity.gitCommit,
        rootGitDirty: false,
        rootGitDirtyFileCount: 0,
        values: "hashes-and-counts-only"
      }));
      expect(identityCheck?.evidence).toEqual(expect.arrayContaining([
        "strictProductionEvidenceRequired=true",
        "bindableBuildIdentity=true",
        "gitDirtyClean=true",
        "sourceCustodyMode=git-clean-worktree",
        "sourceCustodyReviewedClean=true"
      ]));
      expect(artifact.evidence).toEqual(expect.arrayContaining([
        "strictProductionEvidenceRequired=true",
        "bindableBuildIdentity=true"
      ]));
    });
  });

  it("fails strict production evidence mode for dirty build identity", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});
      commitFixture(root);
      writeFileSync(path.join(root, "dirty.txt"), "dirty");

      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env: {
          SENA_PERFORMANCE_BUDGET_BINDABLE_REQUIRED: "1",
          SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
          SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000"
        }
      });

      const identityCheck = artifact.checks.find((check) => check.id === "production-build-identity");

      expect(artifact.status).toBe("fail");
      expect(artifact.buildIdentity).toEqual(expect.objectContaining({
        gitDirty: true,
        gitDirtyFileCount: 1,
        gitStatusSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }));
      expect(identityCheck?.evidence).toEqual(expect.arrayContaining([
        "strictProductionEvidenceRequired=true",
        "bindableBuildIdentity=false",
        "gitDirtyClean=false",
        "gitDirtyFileCount=1",
        "gitStatusSha256=present"
      ]));
    });
  });

  it("passes strict production evidence mode for a reviewed clean release-slice source custody", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});
      commitFixture(root);
      writeFileSync(path.join(root, "dirty.txt"), "dirty");

      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env: {
          SENA_PERFORMANCE_BUDGET_BINDABLE_REQUIRED: "1",
          SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
          SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000",
          ...dirtySourceCustodyEnv(root)
        }
      });
      const identityCheck = artifact.checks.find((check) => check.id === "production-build-identity");

      expect(artifact.status).toBe("pass");
      expect(artifact.buildIdentity.gitDirty).toBe(true);
      expect(artifact.sourceCustody).toEqual(expect.objectContaining({
        mode: "reviewed-clean-release-slice",
        reviewedClean: true,
        manifestSha256: "a".repeat(64),
        sourceTreeSha256: "b".repeat(64),
        fileListSha256: "c".repeat(64),
        fileCount: 123,
        baseGitCommit: artifact.buildIdentity.gitCommit,
        rootGitDirty: true,
        rootGitDirtyFileCount: 1,
        rootGitStatusSha256: artifact.buildIdentity.gitStatusSha256,
        generator: "sena-performance-source-custody/v1",
        values: "hashes-and-counts-only"
      }));
      expect(identityCheck?.evidence).toEqual(expect.arrayContaining([
        "strictProductionEvidenceRequired=true",
        "bindableBuildIdentity=true",
        "gitDirtyClean=false",
        "sourceCustodyMode=reviewed-clean-release-slice",
        "sourceCustodyReviewedClean=true",
        "sourceCustodyManifestSha256=present",
        "sourceCustodyTreeSha256=present",
        "sourceCustodyFileListSha256=present",
        "sourceCustodyFileCount=123"
      ]));
    });
  });

  it("rejects release-slice custody when it does not match the dirty root status hash", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});
      commitFixture(root);
      writeFileSync(path.join(root, "dirty.txt"), "dirty");

      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env: {
          SENA_PERFORMANCE_BUDGET_BINDABLE_REQUIRED: "1",
          SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
          SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000",
          ...dirtySourceCustodyEnv(root),
          SENA_PERFORMANCE_SOURCE_CUSTODY_ROOT_GIT_STATUS_SHA256: "d".repeat(64)
        }
      });

      expect(artifact.status).toBe("fail");
      expect(artifact.sourceCustody.reviewedClean).toBe(false);
      expect(artifact.checks.find((check) => check.id === "production-build-identity")?.evidence).toEqual(expect.arrayContaining([
        "bindableBuildIdentity=false",
        "sourceCustodyMode=reviewed-clean-release-slice",
        "sourceCustodyReviewedClean=false"
      ]));
    });
  });

  it("keeps deployment readiness under review until the budget artifact is bound to the current build identity", () => {
    const verifiedAt = new Date().toISOString();
    process.env.SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH = "1";
    process.env.SENA_PERFORMANCE_BUDGET_CONFIRMED = "1";
    process.env.SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256 = "f".repeat(64);
    process.env.SENA_PERFORMANCE_BUDGET_VERIFIED_AT = verifiedAt;

    const buildPath = () => buildEnterpriseProductionPerformancePath({
      opsStatus: {
        storage: {
          engine: "postgres",
          primaryStateRuntime: {
            mode: "postgres",
            activePrimary: "postgres",
            postgresPrimaryRequested: true
          }
        },
        counts: {
          uploads: 0
        },
        deployment: {
          objectStorageNativeConfigured: true,
          objectStorageWebhookConfigured: false,
          opsTokenConfigured: true,
          alertWebhookConfigured: true
        }
      } as never,
      objectStorageReady: true,
      alertReady: true,
      uploadObjectStorageCustody: {
        source: "postgres-table",
        totalUploads: 0,
        delivered: 0,
        pending: 0,
        failed: 0,
        skipped: 0,
        pendingReview: 0,
        eligibleForDelivery: 0,
        eligibleDelivered: 0,
        eligibleUndelivered: 0,
        ready: true,
        evidence: ["uploadCustodySource=postgres-table"]
      }
    });

    const blockedPath = buildPath();
    const blockedBudget = blockedPath.items.find((item) => item.id === "production-performance-budget");

    expect(blockedPath.summary.blockers).toContain("production-performance-budget");
    expect(blockedBudget).toEqual(expect.objectContaining({
      status: "review"
    }));
    expect(blockedBudget?.evidence).toEqual(expect.arrayContaining([
      "budgetArtifactSha256=present",
      "budgetVerifiedAt=valid",
      "budgetBuildIdentityReady=false",
      "budgetNextBuildIdSha256=missing-or-invalid",
      "budgetGitCommit=missing-or-invalid",
      "budgetGitDirtyClean=false",
      "budgetPackageLockSha256=missing-or-invalid"
    ]));
    expect(blockedBudget?.nextAction).toContain("SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256");

    process.env.SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256 = "6".repeat(64);
    process.env.SENA_PERFORMANCE_BUDGET_GIT_COMMIT = "5".repeat(40);
    process.env.SENA_PERFORMANCE_BUDGET_GIT_DIRTY = "false";
    process.env.SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256 = "4".repeat(64);

    const readyPath = buildPath();
    const readyBudget = readyPath.items.find((item) => item.id === "production-performance-budget");

    expect(readyPath.summary.blockers).not.toContain("production-performance-budget");
    expect(readyBudget).toEqual(expect.objectContaining({
      status: "pass"
    }));
    expect(readyBudget?.evidence).toEqual(expect.arrayContaining([
      "budgetBuildIdentityReady=true",
      "budgetNextBuildIdSha256=present",
      "budgetGitCommit=present",
      "budgetGitDirtyClean=true",
      "budgetPackageLockSha256=present"
    ]));
  });

  it("fails with next actions when the production build artifacts are missing", () => {
    withTempRoot((root) => {
      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({ root, env: {} });

      expect(artifact.status).toBe("fail");
      expect(artifact.summary.failed).toBeGreaterThan(0);
      expect(artifact.checks.find((check) => check.id === "production-build-present")).toEqual(expect.objectContaining({
        status: "fail",
        nextAction: "Run npm run build before npm run sena:performance:check."
      }));
      expect(artifact.nextActions).toContain("Run npm run build before npm run sena:performance:check.");
      expect(JSON.stringify(artifact)).not.toContain(root);
    });
  });

  it("fails when a configured budget is exceeded", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {
        workspaceRouteJs: "export const large = `" + "x".repeat(5000) + "`;"
      });

      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env: {
          SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "1",
          SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000"
        }
      });

      expect(artifact.status).toBe("fail");
      expect(artifact.checks.find((check) => check.id === "workspace-route-js-br")).toEqual(expect.objectContaining({
        status: "fail",
        budgetBytes: 1
      }));
    });
  });

  it("fails a zero-byte actual instead of trivially passing a stale build (P1)", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});
      // A stale .next can predate the workspace route: no page-*.js chunk
      // matches, the measured set is empty, and the pre-guard check passed at
      // actual=0 bytes as if the route were free.
      rmSync(path.join(root, ".next", "static", "chunks", "app"), { recursive: true, force: true });

      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env: {
          SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000"
        }
      });
      const routeCheck = artifact.checks.find((check) => check.id === "workspace-route-js-br");

      expect(artifact.status).toBe("fail");
      expect(routeCheck?.status).toBe("fail");
      expect(routeCheck?.actualBrotliBytes).toBe(0);
      expect(routeCheck?.evidence).toContain("zeroByteActual=true");
      expect(routeCheck?.nextAction).toContain("stale or incomplete");
      expect(artifact.checks.find((check) => check.id === "total-static-js-br")?.evidence).toContain("zeroByteActual=false");
    });
  });

  it("retries transient build artifact reads before failing the performance budget", () => {
    withTempRoot((root) => {
      const fixture = writeProductionBuildFixture(root, {});
      const transientFailures = new Set([fixture.sharedJsPath]);
      const reads = new Map<string, number>();

      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env: {
          SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERFORMANCE_BUDGET_READ_ATTEMPTS: "2"
        },
        readFile: (file) => {
          reads.set(file, (reads.get(file) ?? 0) + 1);
          if (transientFailures.delete(file)) {
            const error = new Error("Simulated transient build artifact read race.");
            error.name = "ENOENT";
            throw error;
          }
          return readFileSync(file);
        }
      });
      const totalStaticJsCheck = artifact.checks.find((check) => check.id === "total-static-js-br");

      expect(artifact.status).toBe("pass");
      expect(artifact.evidence).toContain("artifactReadIncomplete=false");
      expect(artifact.evidence).toContain("artifactReadTransientRecoveries=1");
      expect(reads.get(fixture.sharedJsPath)).toBe(2);
      expect(totalStaticJsCheck?.evidence).toEqual(expect.arrayContaining([
        "artifactReadComplete=true",
        "missingArtifactFiles=0",
        "artifactReadTransientRecoveries=1"
      ]));
    });
  });

  it("fails with redacted evidence when a discovered build artifact cannot be read", () => {
    withTempRoot((root) => {
      const fixture = writeProductionBuildFixture(root, {});
      chmodSync(fixture.sharedJsPath, 0o000);

      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env: {
          SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000"
        }
      });
      const totalStaticJsCheck = artifact.checks.find((check) => check.id === "total-static-js-br");

      expect(artifact.status).toBe("fail");
      expect(artifact.evidence).toContain("artifactReadIncomplete=true");
      expect(totalStaticJsCheck).toEqual(expect.objectContaining({
        status: "fail",
        actualBrotliBytes: undefined,
        nextAction: "Run npm run build after any in-progress build finishes, then rerun npm run sena:performance:check."
      }));
      expect(totalStaticJsCheck?.evidence).toEqual(expect.arrayContaining([
        "artifactReadComplete=false",
        "missingArtifactFiles=1",
        expect.stringMatching(/^readErrorHashes=[a-f0-9]{64}(\|[a-f0-9]{64}){0,2}$/),
        "artifactReadTransientRecoveries=0"
      ]));
      expect(JSON.stringify(artifact)).not.toContain(root);
      expect(JSON.stringify(artifact)).not.toContain("chunk.js");
    });
  });
});
