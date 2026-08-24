import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildEnterpriseProductionPerformancePath } from "../enterprise/ops-productionization";
import { buildEnterpriseProductionPerformanceBudgetArtifact } from "../enterprise/performance-budget-artifact";
import {
  generateSenaNextBuildId,
  isSenaFullGitObjectId,
  parseSenaNextBuildId,
  senaNextBuildIdFromInputSha256
} from "../enterprise/performance-build-identity.mjs";
import {
  measureSenaPerformanceBuildOutput,
  observeSenaLocalPerformanceBuildEvidence
} from "../enterprise/performance-build-measurement.mjs";
import { buildSenaPerformanceSourceCustody } from "../enterprise/performance-source-custody";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";

const performanceBudgetEnvNames = [
  "SENA_REQUIRE_PRODUCTION_PERFORMANCE_PATH",
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
  "SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MANIFEST_SHA256",
  "SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_TREE_SHA256",
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
  writeFileSync(path.join(root, ".gitignore"), ".next/\n");
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

function writeCurrentBuildId(root: string) {
  writeFileSync(path.join(root, ".next", "BUILD_ID"), generateSenaNextBuildId(root));
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

function dirtySourceCustodyEnv(root: string) {
  return buildSenaPerformanceSourceCustody({ root }).env;
}

describe("SENA production performance budget artifact", () => {
  afterEach(() => {
    for (const name of performanceBudgetEnvNames) delete process.env[name];
  });

  it("accepts only full SHA-1 or SHA-256 Git object identifiers", () => {
    expect(isSenaFullGitObjectId("a".repeat(40))).toBe(true);
    expect(isSenaFullGitObjectId("b".repeat(64))).toBe(true);

    for (const length of [39, 41, 63, 65]) {
      expect(isSenaFullGitObjectId("c".repeat(length))).toBe(false);
    }
    expect(isSenaFullGitObjectId("A".repeat(40))).toBe(false);
    expect(isSenaFullGitObjectId("unavailable")).toBe(false);
    expect(isSenaFullGitObjectId(undefined)).toBe(false);
  });

  it("routes performance budget Git OID decisions through the canonical validator", () => {
    const source = readFileSync(
      path.join(process.cwd(), "lib/sena/enterprise/performance-budget-artifact.ts"),
      "utf8"
    );

    expect(source).toContain("isSenaFullGitObjectId");
    expect(source).not.toContain("function validGitCommit");
  });

  it("encodes deterministic BUILD_ID values without the ad-blocker substring and round trips the input digest", () => {
    const inputs = [
      "ad".repeat(32),
      "0123456789abcdef".repeat(4),
      ...Array.from({ length: 256 }, (_, index) => createHash("sha256").update(`sena-build-id-${index}`).digest("hex"))
    ];

    for (const buildInputSha256 of inputs) {
      const buildId = senaNextBuildIdFromInputSha256(buildInputSha256);
      expect(buildId).toMatch(/^sena-v2-[0-9a-ce-fx]{64}$/);
      expect(buildId).not.toMatch(/ad/i);
      expect(parseSenaNextBuildId(buildId)).toEqual({
        generator: "sena-next-build-input/v2",
        buildInputSha256
      });
    }
    expect(parseSenaNextBuildId(`sena-v1-${"a".repeat(64)}`)).toEqual({
      generator: "unknown",
      buildInputSha256: "unavailable"
    });
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
      expect(artifact.policy.totalStaticJsHeadroomReserveRequired).toBe(true);
      expect(artifact.policy.strictProductionEvidenceRequired).toBe(false);
      expect(artifact.buildIdentity).toEqual(expect.objectContaining({
        nextBuildIdSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        nextBuildIdGenerator: "unknown",
        nextBuildMatchesCurrentSource: false,
        buildInputSha256: "unavailable",
        currentExpectedBuildInputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        buildInputEnvironmentScope: "not-bound-use-measured-artifact-set-sha256",
        buildObservationStable: true,
        measuredArtifactSetStable: true,
        measuredArtifactSetSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        measuredArtifactFileCount: 3,
        gitCommit: "unavailable",
        gitDirty: "unknown",
        gitDirtyFileCount: "unknown",
        gitStatusSha256: "unavailable",
        packageLockSha256: "missing",
        sourceTreeSha256: "unavailable",
        sourceFileListSha256: "unavailable",
        sourceFileCount: "unknown",
        sourceReadErrorCount: "unknown",
        sourceReadErrorSha256: "unavailable",
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
        "packageLockSha256=missing",
        "nextBuildMatchesCurrentSource=false",
        "buildIdentityValues=hashes-and-commit-only"
      ]));
      expect(artifact.redaction).toEqual({
        localBuildPathsExcluded: true,
        sourceContentsExcluded: true,
        secretValuesExcluded: true
      });
      expect(JSON.stringify(artifact)).not.toContain(root);
      expect(artifact.checks.map((check) => check.status)).toEqual(["pass", "pass", "pass", "pass", "pass"]);
      const totalStaticJsCheck = artifact.checks.find((check) => check.id === "total-static-js-br");
      expect(totalStaticJsCheck).toEqual(expect.objectContaining({
        minimumHeadroomBytes: 500,
        headroomBytes: expect.any(Number),
        status: "pass"
      }));
      expect(totalStaticJsCheck?.evidence).toContain("headroomReserveSatisfied=true");
      const routeEntryCheck = artifact.checks.find((check) => check.id === "workspace-route-js-br");
      expect(routeEntryCheck).toEqual(expect.objectContaining({
        label: "Workspace route entry-chunk JavaScript Brotli size"
      }));
      expect(routeEntryCheck?.evidence).toEqual(expect.arrayContaining([
        "measurementScope=next-app-route-entry-chunks-only",
        "dynamicChunksIncluded=false"
      ]));
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
        nextAction: "Run npm run build and npm run sena:performance:check from a clean Git worktree before binding or archiving production performance evidence. Source-custody snapshots are diagnostic only and cannot authorize a dirty build."
      }));
      expect(identityCheck?.evidence).toEqual(expect.arrayContaining([
        "strictProductionEvidenceRequired=true",
        "bindableBuildIdentity=false",
        "gitCommit=missing-or-invalid",
        "gitDirtyClean=false"
      ]));
      expect(artifact.nextActions).toContain("Run npm run build and npm run sena:performance:check from a clean Git worktree before binding or archiving production performance evidence. Source-custody snapshots are diagnostic only and cannot authorize a dirty build.");
      expect(JSON.stringify(artifact)).not.toContain(root);
    });
  });

  it("reports a legacy opaque BUILD_ID as unknown instead of attributing current git identity to it", () => {
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

      expect(artifact.status).toBe("fail");
      expect(artifact.buildIdentity).toEqual(expect.objectContaining({
        nextBuildIdGenerator: "unknown",
        nextBuildMatchesCurrentSource: false,
        buildInputSha256: "unavailable",
        currentExpectedBuildInputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        buildInputEnvironmentScope: "not-bound-use-measured-artifact-set-sha256",
        measuredArtifactSetSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        measuredArtifactFileCount: 3,
        gitCommit: "unavailable",
        gitDirty: "unknown",
        gitDirtyFileCount: "unknown",
        gitStatusSha256: "unavailable",
        packageLockSha256: "missing"
      }));
    });
  });

  it("passes strict production evidence mode for a clean committed build identity", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});
      commitFixture(root);
      writeCurrentBuildId(root);

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
        nextBuildIdGenerator: "sena-next-build-input/v2",
        nextBuildMatchesCurrentSource: true,
        buildInputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        currentExpectedBuildInputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        buildInputEnvironmentScope: "not-bound-use-measured-artifact-set-sha256",
        buildObservationStable: true,
        measuredArtifactSetStable: true,
        measuredArtifactSetSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        measuredArtifactFileCount: 3,
        gitCommit: expect.stringMatching(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
        gitDirty: false,
        gitDirtyFileCount: 0,
        gitStatusSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        packageLockSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        sourceTreeSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        sourceFileListSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        sourceFileCount: expect.any(Number),
        sourceReadErrorCount: 0
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
        "nextBuildMatchesCurrentSource=true",
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

  it("fails closed when source identity changes while the BUILD_ID is being observed", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});
      commitFixture(root);
      writeCurrentBuildId(root);
      const buildIdPath = path.join(root, ".next", "BUILD_ID");
      let mutated = false;

      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env: {
          SENA_PERFORMANCE_BUDGET_BINDABLE_REQUIRED: "1",
          SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
          SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000"
        },
        readFile: (file) => {
          const buffer = readFileSync(file);
          if (!mutated && file === buildIdPath) {
            mutated = true;
            writeFileSync(
              path.join(root, "package-lock.json"),
              JSON.stringify({ name: "sena-fixture", lockfileVersion: 3, concurrentMutation: true })
            );
          }
          return buffer;
        }
      });
      const identityCheck = artifact.checks.find((check) => check.id === "production-build-identity");

      expect(artifact.status).toBe("fail");
      expect(identityCheck?.evidence).toEqual(expect.arrayContaining([
        "buildObservationStable=false",
        "bindableBuildIdentity=false"
      ]));
    });
  });

  it("fails closed when a measured static chunk changes during the budget read", () => {
    withTempRoot((root) => {
      const fixture = writeProductionBuildFixture(root, {});
      commitFixture(root);
      writeCurrentBuildId(root);
      let mutated = false;

      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env: {
          SENA_PERFORMANCE_BUDGET_BINDABLE_REQUIRED: "1",
          SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
          SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000"
        },
        readFile: (file) => {
          const buffer = readFileSync(file);
          if (!mutated && file === fixture.sharedJsPath) {
            mutated = true;
            writeFileSync(file, "export const shared = 2;");
          }
          return buffer;
        }
      });
      const identityCheck = artifact.checks.find((check) => check.id === "production-build-identity");

      expect(artifact.status).toBe("fail");
      expect(identityCheck?.evidence).toEqual(expect.arrayContaining([
        "measuredArtifactSetStable=false",
        "bindableBuildIdentity=false"
      ]));
    });
  });

  it("fails strict production evidence mode when the production build predates the current commit", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});
      writeFileSync(path.join(root, "runtime.ts"), "export const version = 1;\n");
      commitFixture(root);
      writeCurrentBuildId(root);

      writeFileSync(path.join(root, "runtime.ts"), "export const version = 2;\n");
      runGit(root, ["add", "runtime.ts"]);
      runGit(root, ["commit", "-m", "advance runtime without rebuilding"]);

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
      expect(identityCheck?.status).toBe("fail");
      expect(identityCheck?.evidence).toEqual(expect.arrayContaining([
        "nextBuildMatchesCurrentSource=false",
        "bindableBuildIdentity=false"
      ]));
    });
  });

  it("fails strict production evidence mode when package-lock changes after the production build", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});
      commitFixture(root);
      writeCurrentBuildId(root);

      writeFileSync(
        path.join(root, "package-lock.json"),
        JSON.stringify({ name: "sena-fixture", lockfileVersion: 3, packages: { changed: true } })
      );

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
      expect(identityCheck?.evidence).toEqual(expect.arrayContaining([
        "nextBuildMatchesCurrentSource=false",
        "bindableBuildIdentity=false"
      ]));
    });
  });

  it("fails strict production evidence mode for dirty build identity", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});
      commitFixture(root);
      writeFileSync(path.join(root, "dirty.txt"), "dirty");
      writeCurrentBuildId(root);

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

  it("does not let an automatic source-custody snapshot self-attest a dirty release slice", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});
      commitFixture(root);
      mkdirSync(path.join(root, "lib"), { recursive: true });
      writeFileSync(path.join(root, "lib", "dirty.ts"), "export const dirty = 1;\n");
      writeCurrentBuildId(root);

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

      expect(artifact.status).toBe("fail");
      expect(artifact.buildIdentity.gitDirty).toBe(true);
      expect(artifact.sourceCustody).toEqual(expect.objectContaining({
        mode: "reviewed-clean-release-slice",
        reviewedClean: false,
        manifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        sourceTreeSha256: artifact.buildIdentity.sourceTreeSha256,
        fileListSha256: artifact.buildIdentity.sourceFileListSha256,
        fileCount: artifact.buildIdentity.sourceFileCount,
        baseGitCommit: artifact.buildIdentity.gitCommit,
        rootGitDirty: true,
        rootGitDirtyFileCount: 1,
        rootGitStatusSha256: artifact.buildIdentity.gitStatusSha256,
        generator: "sena-performance-source-custody/v1",
        values: "hashes-and-counts-only"
      }));
      expect(identityCheck?.evidence).toEqual(expect.arrayContaining([
        "strictProductionEvidenceRequired=true",
        "bindableBuildIdentity=false",
        "gitDirtyClean=false",
        "sourceCustodyMode=reviewed-clean-release-slice",
        "sourceCustodyReviewedClean=false",
        "sourceCustodyManifestSha256=present",
        "sourceCustodyTreeSha256=present",
        "sourceCustodyFileListSha256=present",
        `sourceCustodyFileCount=${artifact.buildIdentity.sourceFileCount}`
      ]));
    });
  });

  it("rejects release-slice custody when it does not match the dirty root status hash", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});
      commitFixture(root);
      mkdirSync(path.join(root, "lib"), { recursive: true });
      writeFileSync(path.join(root, "lib", "dirty.ts"), "export const dirty = 1;\n");
      writeCurrentBuildId(root);

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

  it("rejects release-slice custody when its manifest hash is not canonical for the reviewed source", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});
      commitFixture(root);
      mkdirSync(path.join(root, "lib"), { recursive: true });
      writeFileSync(path.join(root, "lib", "dirty.ts"), "export const dirty = 1;\n");
      writeCurrentBuildId(root);

      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env: {
          SENA_PERFORMANCE_BUDGET_BINDABLE_REQUIRED: "1",
          SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
          SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000",
          ...dirtySourceCustodyEnv(root),
          SENA_PERFORMANCE_SOURCE_CUSTODY_MANIFEST_SHA256: "d".repeat(64)
        }
      });

      expect(artifact.status).toBe("fail");
      expect(artifact.sourceCustody.reviewedClean).toBe(false);
      expect(artifact.checks.find((check) => check.id === "production-build-identity")?.evidence)
        .toEqual(expect.arrayContaining([
          "sourceCustodyReviewedClean=false",
          "bindableBuildIdentity=false"
        ]));
    });
  });

  it("rejects stale release-slice custody and build identity after dirty source content changes at the same path", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});
      commitFixture(root);
      mkdirSync(path.join(root, "lib"), { recursive: true });
      const dirtySourcePath = path.join(root, "lib", "dirty.ts");
      writeFileSync(dirtySourcePath, "export const dirty = 1;\n");
      const staleCustody = dirtySourceCustodyEnv(root);
      writeCurrentBuildId(root);

      writeFileSync(dirtySourcePath, "export const dirty = 2;\n");

      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env: {
          SENA_PERFORMANCE_BUDGET_BINDABLE_REQUIRED: "1",
          SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
          SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000",
          ...staleCustody
        }
      });
      const identityCheck = artifact.checks.find((check) => check.id === "production-build-identity");

      expect(artifact.status).toBe("fail");
      expect(artifact.sourceCustody.reviewedClean).toBe(false);
      expect(identityCheck?.evidence).toEqual(expect.arrayContaining([
        "nextBuildMatchesCurrentSource=false",
        "sourceCustodyReviewedClean=false",
        "bindableBuildIdentity=false"
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

    const legacyTuplePath = buildPath();
    const legacyTupleBudget = legacyTuplePath.items.find((item) => item.id === "production-performance-budget");

    expect(legacyTuplePath.summary.blockers).toContain("production-performance-budget");
    expect(legacyTupleBudget).toEqual(expect.objectContaining({ status: "review" }));

    process.env.SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION = "sena-enterprise-production-performance-budget/v1";
    process.env.SENA_PERFORMANCE_BUDGET_MEASURED_ARTIFACT_SET_SHA256 = "3".repeat(64);

    const v1TuplePath = buildPath();
    const v1TupleBudget = v1TuplePath.items.find((item) => item.id === "production-performance-budget");

    expect(v1TuplePath.summary.blockers).toContain("production-performance-budget");
    expect(v1TupleBudget?.evidence).toEqual(expect.arrayContaining([
      "budgetSchemaCurrent=false",
      "budgetMeasuredArtifactSetSha256=present"
    ]));

    process.env.SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION = SENA_SCHEMA_VERSIONS.enterpriseProductionPerformanceBudget;
    process.env.SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE = "git-clean-worktree";

    const readyPath = buildPath();
    const readyBudget = readyPath.items.find((item) => item.id === "production-performance-budget");

    expect(readyPath.summary.blockers).not.toContain("production-performance-budget");
    expect(readyBudget).toEqual(expect.objectContaining({
      status: "pass"
    }));
    expect(readyBudget?.evidence).toEqual(expect.arrayContaining([
      "budgetBuildIdentityReady=true",
      "budgetSchemaCurrent=true",
      "budgetMeasuredArtifactSetSha256=present",
      "budgetNextBuildIdSha256=present",
      "budgetGitCommit=present",
      "budgetGitDirtyClean=true",
      "budgetPackageLockSha256=present",
      "budgetSourceCustodyMode=git-clean-worktree"
    ]));

    process.env.SENA_PERFORMANCE_BUDGET_GIT_DIRTY = "true";
    process.env.SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE = "reviewed-clean-release-slice";
    process.env.SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MANIFEST_SHA256 = "3".repeat(64);
    process.env.SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_TREE_SHA256 = "2".repeat(64);

    const reviewedSlicePath = buildPath();
    const reviewedSliceBudget = reviewedSlicePath.items.find((item) => item.id === "production-performance-budget");

    expect(reviewedSlicePath.summary.blockers).toContain("production-performance-budget");
    expect(reviewedSliceBudget).toEqual(expect.objectContaining({ status: "review" }));
    expect(reviewedSliceBudget?.evidence).toEqual(expect.arrayContaining([
      "budgetBuildIdentityReady=false",
      "budgetGitDirtyClean=false",
      "budgetSourceCustodyMode=reviewed-clean-release-slice"
    ]));

    delete process.env.SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MANIFEST_SHA256;
    const incompleteCustodyPath = buildPath();
    expect(incompleteCustodyPath.summary.blockers).toContain("production-performance-budget");
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

  it("fails a nominally under-budget build when the required headroom reserve is eroded", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});

      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env: {
          SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_MIN_HEADROOM_BYTES: "9999"
        }
      });
      const totalStaticJsCheck = artifact.checks.find((check) => check.id === "total-static-js-br");

      expect(totalStaticJsCheck?.actualBrotliBytes).toBeLessThan(10_000);
      expect(totalStaticJsCheck).toEqual(expect.objectContaining({
        status: "fail",
        budgetBytes: 10_000,
        minimumHeadroomBytes: 9_999
      }));
      expect(totalStaticJsCheck?.evidence).toContain("headroomReserveSatisfied=false");
      expect(totalStaticJsCheck?.nextAction).toContain("at least 9999 bytes of budget headroom");
      expect(artifact.status).toBe("fail");
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
      expect(artifact.evidence).toContain("artifactObservationTransientRecoveries=1");
      expect(reads.get(fixture.sharedJsPath)).toBe(3);
      expect(totalStaticJsCheck?.evidence).toEqual(expect.arrayContaining([
        "artifactReadComplete=true",
        "missingArtifactFiles=0",
        "artifactReadTransientRecoveries=1"
      ]));
    });
  });

  it("fails closed with deterministic evidence when nested chunk enumeration fails", () => {
    withTempRoot((root) => {
      const fixture = writeProductionBuildFixture(root, {});
      const inaccessibleDirectory = path.dirname(fixture.workspaceRouteJsPath);
      const readdir = (directory: string) => {
        if (directory === inaccessibleDirectory) {
          throw Object.assign(new Error("Simulated nested enumeration failure."), { code: "EACCES" });
        }
        return readdirSync(directory);
      };

      const first = measureSenaPerformanceBuildOutput(root, { readdir });
      const second = measureSenaPerformanceBuildOutput(root, { readdir });

      expect(first.productionBuildPresent).toBe(false);
      expect(first.observationStable).toBe(false);
      expect(first.measuredArtifactSetSha256).toBe("unavailable");
      expect(first.traversalErrorCount).toBe(2);
      expect(first.traversalErrorSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(first.traversalErrorSha256).toBe(second.traversalErrorSha256);
      expect(first.metrics.workspaceRouteJs.actualBrotliBytes).toBeUndefined();
      expect(first.metrics.totalStaticJs.actualBrotliBytes).toBeUndefined();
    });
  });

  it("rejects a broken symlink in the measured chunk tree", () => {
    withTempRoot((root) => {
      const fixture = writeProductionBuildFixture(root, {});
      const brokenLink = path.join(path.dirname(fixture.sharedJsPath), "broken.js");
      symlinkSync("missing-target.js", brokenLink);

      const measurement = measureSenaPerformanceBuildOutput(root);

      expect(measurement.productionBuildPresent).toBe(false);
      expect(measurement.observationStable).toBe(false);
      expect(measurement.measuredArtifactSetSha256).toBe("unavailable");
      expect(measurement.traversalErrorCount).toBe(2);
      expect(measurement.traversalErrorSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(measurement.metrics.totalStaticJs.actualBrotliBytes).toBeUndefined();
    });
  });

  it("rejects a live BUILD_ID symlink instead of following it outside the measured build root", () => {
    withTempRoot((root) => {
      writeProductionBuildFixture(root, {});
      commitFixture(root);
      writeCurrentBuildId(root);
      const buildIdPath = path.join(root, ".next", "BUILD_ID");
      const externalBuildIdPath = path.join(root, "external-build-id.txt");
      writeFileSync(externalBuildIdPath, readFileSync(buildIdPath));
      unlinkSync(buildIdPath);
      symlinkSync(externalBuildIdPath, buildIdPath);

      const observed = observeSenaLocalPerformanceBuildEvidence(root);
      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env: {
          SENA_PERFORMANCE_BUDGET_BINDABLE_REQUIRED: "1",
          SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
          SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "10000",
          SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000"
        }
      });

      expect(observed.buildIdAvailable).toBe(false);
      expect(observed.observationStable).toBe(false);
      expect(artifact.status).toBe("fail");
      expect(artifact.checks.find((check) => check.id === "production-build-identity")?.evidence)
        .toEqual(expect.arrayContaining([
          "nextBuildMatchesCurrentSource=false",
          "buildObservationStable=false",
          "bindableBuildIdentity=false"
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
