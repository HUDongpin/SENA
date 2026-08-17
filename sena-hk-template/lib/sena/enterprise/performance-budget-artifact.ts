import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { brotliCompressSync, constants } from "node:zlib";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { booleanEnvFrom, senaProductionPostureFrom } from "./auth-config";
import { now } from "./ops-runtime";

export type SenaEnterpriseProductionPerformanceBudgetCheckId =
  "production-build-present" |
  "production-build-identity" |
  "workspace-html-br" |
  "workspace-route-js-br" |
  "total-static-js-br";

export type SenaEnterpriseProductionPerformanceBudgetCheck = {
  id: SenaEnterpriseProductionPerformanceBudgetCheckId;
  label: string;
  status: "pass" | "fail";
  actualBrotliBytes?: number;
  budgetBytes?: number;
  evidence: string[];
  nextAction: string;
};

export type SenaEnterpriseProductionPerformanceBudgetArtifact = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseProductionPerformanceBudget;
  generatedAt: string;
  status: "pass" | "fail";
  summary: {
    checks: number;
    passed: number;
    failed: number;
    totalStaticJsFiles: number;
    workspaceRouteJsFiles: number;
  };
  policy: {
    productionBuildRequired: true;
    conferenceTarget: "50-users-30-minutes";
    localFileStoreIsProductionBackend: false;
    artifactPurpose: "archive-performance-budget-json-plus-sha256";
    buildIdentityRequiredForBinding: true;
    strictProductionEvidenceRequired: boolean;
  };
  buildIdentity: {
    nextBuildIdSha256: string | "missing";
    gitCommit: string | "unavailable";
    gitDirty: boolean | "unknown";
    gitDirtyFileCount: number | "unknown";
    gitStatusSha256: string | "unavailable";
    packageLockSha256: string | "missing";
    values: "hashes-and-commit-only";
  };
  sourceCustody: {
    mode: "none" | "git-clean-worktree" | "reviewed-clean-release-slice";
    reviewedClean: boolean;
    manifestSha256?: string;
    sourceTreeSha256?: string;
    fileListSha256?: string;
    fileCount?: number;
    baseGitCommit?: string;
    rootGitDirty?: boolean | "unknown";
    rootGitDirtyFileCount?: number | "unknown";
    rootGitStatusSha256?: string | "unavailable";
    generator?: "sena-performance-source-custody/v1";
    values: "hashes-and-counts-only";
  };
  budgets: {
    workspaceHtmlBrotliBytes: number;
    workspaceRouteJsBrotliBytes: number;
    totalStaticJsBrotliBytes: number;
  };
  budgetEnv: {
    workspaceHtmlBrotliBytes: "SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES";
    workspaceRouteJsBrotliBytes: "SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES";
    totalStaticJsBrotliBytes: "SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES";
  };
  checks: SenaEnterpriseProductionPerformanceBudgetCheck[];
  evidence: string[];
  nextActions: string[];
  redaction: {
    localBuildPathsExcluded: true;
    sourceContentsExcluded: true;
    secretValuesExcluded: true;
  };
};

function walk(dir: string): string[] {
  try {
    return readdirSync(dir).flatMap((entry) => {
      const entryPath = path.join(dir, entry);
      const stats = statSync(entryPath);
      return stats.isDirectory() ? walk(entryPath) : [entryPath];
    });
  } catch {
    return [];
  }
}

function brotliSize(buffer: Buffer) {
  return brotliCompressSync(buffer, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11
    }
  }).length;
}

function budgetEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string, defaultValue: number) {
  const parsed = Number(env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : defaultValue;
}

function boundedIntegerEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>, key: string, defaultValue: number, min: number, max: number) {
  const parsed = Number(env[key]);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

// Production posture is answered by senaProductionPostureFrom() (auth-config.ts),
// never re-derived here: re-derivation is what let the password-reset interlock
// drift onto a NODE_ENV-only test and fail open (f5d94fa). The site-local opt-in
// flag is the only term this gate adds on top.
//
// This file used to carry its own stricter booleanEnv — no trim, no lowercase,
// and no "on" — so " 1 ", "TRUE" and "on" read as production everywhere else in
// SENA but as development here. Adopting the shared parser widens this gate to
// match the rest; every value affected newly reads as production, so the change
// can only engage the binding check, never skip it.
// Exported so production-posture-predicate-agreement.test.ts can hold it to the
// same standard as the other hard-gates; the only production caller is the
// artifact builder below, which reaches it through the real filesystem.
export function performanceBudgetStrictBindingRequired(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  return booleanEnvFrom(env, "SENA_PERFORMANCE_BUDGET_BINDABLE_REQUIRED") ||
    senaProductionPostureFrom(env);
}

function artifactReadErrorHash(error: unknown) {
  const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  return createHash("sha256").update(message).digest("hex");
}

function sha256Text(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

type FileReader = (file: string) => Buffer;

type FileReadPolicy = {
  attempts: number;
};

type FileReadResult =
  { ok: true; buffer: Buffer; attempts: number; errorHashes: string[] } |
  { ok: false; attempts: number; errorHashes: string[] };

function readFileWithStabilization(file: string, readFile: FileReader, policy: FileReadPolicy): FileReadResult {
  const maxAttempts = Math.max(1, policy.attempts);
  const errorHashes: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return {
        ok: true,
        buffer: readFile(file),
        attempts: attempt,
        errorHashes
      };
    } catch (error) {
      errorHashes.push(artifactReadErrorHash(error));
    }
  }
  return {
    ok: false,
    attempts: maxAttempts,
    errorHashes
  };
}

function optionalFileSha256(file: string, readFile: FileReader, policy: FileReadPolicy) {
  try {
    if (!existsSync(file)) return "missing" as const;
    const read = readFileWithStabilization(file, readFile, policy);
    return read.ok ? sha256Text(read.buffer) : "missing" as const;
  } catch {
    return "missing" as const;
  }
}

function gitBuildIdentity(root: string) {
  const commit = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (commit.status !== 0) {
    return {
      gitCommit: "unavailable" as const,
      gitDirty: "unknown" as const,
      gitDirtyFileCount: "unknown" as const,
      gitStatusSha256: "unavailable" as const
    };
  }
  const status = spawnSync("git", ["-C", root, "status", "--porcelain"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  const statusText = status.status === 0 ? status.stdout.trim() : undefined;
  return {
    gitCommit: commit.stdout.trim() || "unavailable",
    gitDirty: statusText !== undefined ? statusText.length > 0 : "unknown" as const,
    gitDirtyFileCount: statusText !== undefined && statusText.length > 0 ? statusText.split(/\r?\n/).filter(Boolean).length : statusText === "" ? 0 : "unknown" as const,
    gitStatusSha256: statusText !== undefined ? sha256Text(statusText) : "unavailable" as const
  };
}

function validSha256(value: string | "missing") {
  return /^[a-f0-9]{64}$/.test(value);
}

function validGitCommit(value: string | "unavailable") {
  return /^[a-f0-9]{40,64}$/.test(value);
}

function positiveIntegerString(value: string | undefined) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function validSourceCustodyHash(value: string | undefined) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function sourceCustodyFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  gitIdentity: ReturnType<typeof gitBuildIdentity>
): SenaEnterpriseProductionPerformanceBudgetArtifact["sourceCustody"] {
  const mode = env.SENA_PERFORMANCE_SOURCE_CUSTODY_MODE;
  const cleanGit = gitIdentity.gitDirty === false && validGitCommit(gitIdentity.gitCommit);
  if (mode !== "reviewed-clean-release-slice") {
    return {
      mode: cleanGit ? "git-clean-worktree" : "none",
      reviewedClean: cleanGit,
      baseGitCommit: validGitCommit(gitIdentity.gitCommit) ? gitIdentity.gitCommit : undefined,
      rootGitDirty: gitIdentity.gitDirty,
      rootGitDirtyFileCount: gitIdentity.gitDirtyFileCount,
      rootGitStatusSha256: gitIdentity.gitStatusSha256,
      values: "hashes-and-counts-only"
    };
  }

  const manifestSha256 = env.SENA_PERFORMANCE_SOURCE_CUSTODY_MANIFEST_SHA256;
  const sourceTreeSha256 = env.SENA_PERFORMANCE_SOURCE_CUSTODY_TREE_SHA256;
  const fileListSha256 = env.SENA_PERFORMANCE_SOURCE_CUSTODY_FILE_LIST_SHA256;
  const fileCount = positiveIntegerString(env.SENA_PERFORMANCE_SOURCE_CUSTODY_FILE_COUNT);
  const baseGitCommit = env.SENA_PERFORMANCE_SOURCE_CUSTODY_BASE_GIT_COMMIT;
  const rootGitStatusSha256 = env.SENA_PERFORMANCE_SOURCE_CUSTODY_ROOT_GIT_STATUS_SHA256;
  const rootGitDirtyFileCount = positiveIntegerString(env.SENA_PERFORMANCE_SOURCE_CUSTODY_ROOT_GIT_DIRTY_FILE_COUNT);
  const reviewedClean = validSourceCustodyHash(manifestSha256) &&
    validSourceCustodyHash(sourceTreeSha256) &&
    validSourceCustodyHash(fileListSha256) &&
    fileCount !== undefined &&
    validGitCommit(baseGitCommit ?? "unavailable") &&
    baseGitCommit === gitIdentity.gitCommit &&
    validSourceCustodyHash(rootGitStatusSha256) &&
    rootGitStatusSha256 === gitIdentity.gitStatusSha256 &&
    rootGitDirtyFileCount !== undefined &&
    rootGitDirtyFileCount === gitIdentity.gitDirtyFileCount;

  return {
    mode: "reviewed-clean-release-slice",
    reviewedClean,
    manifestSha256,
    sourceTreeSha256,
    fileListSha256,
    fileCount,
    baseGitCommit,
    rootGitDirty: gitIdentity.gitDirty,
    rootGitDirtyFileCount: gitIdentity.gitDirtyFileCount,
    rootGitStatusSha256: gitIdentity.gitStatusSha256,
    generator: "sena-performance-source-custody/v1",
    values: "hashes-and-counts-only"
  };
}

function buildIdentityBindable(
  identity: SenaEnterpriseProductionPerformanceBudgetArtifact["buildIdentity"],
  sourceCustody: SenaEnterpriseProductionPerformanceBudgetArtifact["sourceCustody"]
) {
  return validSha256(identity.nextBuildIdSha256) &&
    validGitCommit(identity.gitCommit) &&
    sourceCustody.reviewedClean === true &&
    validSha256(identity.packageLockSha256);
}

function brotliFileBudgetRead(file: string, readFile: FileReader, policy: FileReadPolicy) {
  const read = readFileWithStabilization(file, readFile, policy);
  if (read.ok) {
    return {
      actualBrotliBytes: brotliSize(read.buffer),
      missingArtifactFiles: 0,
      readErrorHashes: [],
      readAttempts: read.attempts,
      transientReadRecoveries: read.attempts > 1 ? 1 : 0
    };
  }
  return {
    actualBrotliBytes: undefined,
    missingArtifactFiles: 1,
    readErrorHashes: read.errorHashes,
    readAttempts: read.attempts,
    transientReadRecoveries: 0
  };
}

function brotliFilesBudgetRead(files: string[], readFile: FileReader, policy: FileReadPolicy) {
  let total = 0;
  let failedFiles = 0;
  const readErrorHashes: string[] = [];
  let readAttempts = 0;
  let transientReadRecoveries = 0;
  for (const file of files) {
    const read = readFileWithStabilization(file, readFile, policy);
    readAttempts += read.attempts;
    if (read.ok) {
      if (read.attempts > 1) transientReadRecoveries += 1;
      total += brotliSize(read.buffer);
    } else {
      failedFiles += 1;
      readErrorHashes.push(...read.errorHashes);
    }
  }
  return {
    actualBrotliBytes: readErrorHashes.length === 0 ? total : undefined,
    missingArtifactFiles: failedFiles,
    readErrorHashes,
    readAttempts,
    transientReadRecoveries
  };
}

function buildSizeCheck(input: {
  id: Exclude<SenaEnterpriseProductionPerformanceBudgetCheckId, "production-build-present" | "production-build-identity">;
  label: string;
  actualBrotliBytes?: number;
  budgetBytes: number;
  evidence: string[];
  missingBuild: boolean;
  missingArtifactFiles?: number;
  readErrorHashes?: string[];
  readAttempts?: number;
  transientReadRecoveries?: number;
  nextAction: string;
}): SenaEnterpriseProductionPerformanceBudgetCheck {
  const readComplete = (input.missingArtifactFiles ?? 0) === 0;
  // P1 guard: a zero-byte actual can only mean the measured artifact set is
  // empty (stale or dev-polluted .next with no matching chunks), never a
  // legitimately weightless build output — fail instead of trivially passing.
  const zeroByteActual = input.actualBrotliBytes === 0;
  const status = !input.missingBuild && readComplete && input.actualBrotliBytes !== undefined && !zeroByteActual && input.actualBrotliBytes <= input.budgetBytes
    ? "pass"
    : "fail";
  return {
    id: input.id,
    label: input.label,
    status,
    actualBrotliBytes: input.actualBrotliBytes,
    budgetBytes: input.budgetBytes,
    evidence: [
      ...input.evidence,
      `actualBrotliBytes=${input.actualBrotliBytes ?? "missing"}`,
      `budgetBytes=${input.budgetBytes}`,
      `missingProductionBuild=${input.missingBuild}`,
      `zeroByteActual=${zeroByteActual}`,
      `artifactReadComplete=${readComplete}`,
      `missingArtifactFiles=${input.missingArtifactFiles ?? 0}`,
      `readErrorHashes=${input.readErrorHashes?.slice(0, 3).join("|") || "none"}`,
      `artifactReadAttempts=${input.readAttempts ?? 0}`,
      `artifactReadTransientRecoveries=${input.transientReadRecoveries ?? 0}`
    ],
    nextAction: status === "pass"
      ? "Keep this budget check attached to the release evidence."
      : zeroByteActual
        ? "Run npm run build to refresh the stale or incomplete .next output, then rerun npm run sena:performance:check."
        : readComplete
          ? input.nextAction
          : "Run npm run build after any in-progress build finishes, then rerun npm run sena:performance:check."
  };
}

export function buildEnterpriseProductionPerformanceBudgetArtifact(input: {
  root?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  readFile?: FileReader;
} = {}): SenaEnterpriseProductionPerformanceBudgetArtifact {
  const root = input.root ?? process.cwd();
  const env = input.env ?? process.env;
  const readFile = input.readFile ?? readFileSync;
  const readPolicy = {
    attempts: boundedIntegerEnv(env, "SENA_PERFORMANCE_BUDGET_READ_ATTEMPTS", 3, 1, 5)
  };
  const strictProductionEvidenceRequired = performanceBudgetStrictBindingRequired(env);
  const nextDir = path.join(root, ".next");
  const nextBuildIdPath = path.join(nextDir, "BUILD_ID");
  const staticChunksDir = path.join(nextDir, "static", "chunks");
  const workspaceHtmlPath = path.join(nextDir, "server", "app", "workspace", "sena.html");
  const budgets = {
    workspaceHtmlBrotliBytes: budgetEnv(env, "SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES", 80_000),
    workspaceRouteJsBrotliBytes: budgetEnv(env, "SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES", 180_000),
    // 900_000 → 852_000, set 2026-08-03 after the runtime-constants win and held.
    //
    // It was provisional only because it had been set against a pre-redesign build and
    // nobody had re-measured since; iteration 9 (2026-08-16) did, by same-session A/B.
    // Actual is 824,791 B — 27,209 B (3.19%) of headroom — with the fusion redesign
    // accounting for +9,505 B of the growth and the 2026-08-15 remediation +2,808 B.
    //
    // Confirmed at 852_000 rather than re-ratcheted down to the new actual: T7 is still
    // open, and every option for it reorganises this payload (one attempt already moved
    // it +7,874 B before being reverted). Tightening now would spend the headroom that
    // work needs and turn an unrelated build into a red gate. Re-ratchet once T7 lands.
    // Confirmed under delegated authority; see docs/adr/0011.
    totalStaticJsBrotliBytes: budgetEnv(env, "SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES", 852_000)
  };
  const productionBuildPresent = existsSync(nextDir) && existsSync(staticChunksDir);
  const jsFiles = productionBuildPresent
    ? walk(staticChunksDir).filter((file) => file.endsWith(".js"))
    : [];
  const workspaceRouteFiles = jsFiles.filter((file) => file.includes(`${path.sep}app${path.sep}workspace${path.sep}sena${path.sep}page-`));
  const totalStaticJsRead = productionBuildPresent
    ? brotliFilesBudgetRead(jsFiles, readFile, readPolicy)
    : { actualBrotliBytes: undefined, missingArtifactFiles: 0, readErrorHashes: [], readAttempts: 0, transientReadRecoveries: 0 };
  const workspaceRouteJsRead = productionBuildPresent
    ? brotliFilesBudgetRead(workspaceRouteFiles, readFile, readPolicy)
    : { actualBrotliBytes: undefined, missingArtifactFiles: 0, readErrorHashes: [], readAttempts: 0, transientReadRecoveries: 0 };
  const workspaceHtmlRead = productionBuildPresent && existsSync(workspaceHtmlPath)
    ? brotliFileBudgetRead(workspaceHtmlPath, readFile, readPolicy)
    : { actualBrotliBytes: undefined, missingArtifactFiles: productionBuildPresent ? 1 : 0, readErrorHashes: [], readAttempts: 0, transientReadRecoveries: 0 };
  const gitIdentity = gitBuildIdentity(root);
  const sourceCustody = sourceCustodyFromEnv(env, gitIdentity);
  const buildIdentity = {
    nextBuildIdSha256: optionalFileSha256(nextBuildIdPath, readFile, readPolicy),
    gitCommit: gitIdentity.gitCommit,
    gitDirty: gitIdentity.gitDirty,
    gitDirtyFileCount: gitIdentity.gitDirtyFileCount,
    gitStatusSha256: gitIdentity.gitStatusSha256,
    packageLockSha256: optionalFileSha256(path.join(root, "package-lock.json"), readFile, readPolicy),
    values: "hashes-and-commit-only" as const
  };
  const bindableBuildIdentity = buildIdentityBindable(buildIdentity, sourceCustody);

  const checks: SenaEnterpriseProductionPerformanceBudgetCheck[] = [
    {
      id: "production-build-present",
      label: "Next production build artifacts present",
      status: productionBuildPresent ? "pass" : "fail",
      evidence: [
        `nextBuildPresent=${productionBuildPresent}`,
        `staticChunksPresent=${existsSync(staticChunksDir)}`,
        `nextBuildIdSha256=${buildIdentity.nextBuildIdSha256 === "missing" ? "missing" : "present"}`,
        `gitCommit=${buildIdentity.gitCommit === "unavailable" ? "unavailable" : "present"}`,
        `gitDirty=${buildIdentity.gitDirty}`,
        `gitDirtyFileCount=${buildIdentity.gitDirtyFileCount}`,
        `gitStatusSha256=${buildIdentity.gitStatusSha256 === "unavailable" ? "unavailable" : "present"}`,
        `sourceCustodyMode=${sourceCustody.mode}`,
        `sourceCustodyReviewedClean=${sourceCustody.reviewedClean}`,
        `packageLockSha256=${buildIdentity.packageLockSha256 === "missing" ? "missing" : "present"}`,
        "localBuildPaths=excluded",
        "buildIdentityValues=hashes-and-commit-only",
        "requiredBeforePerformanceBudget=true"
      ],
      nextAction: productionBuildPresent
        ? "Keep the current production build artifact attached to this performance budget evidence."
        : "Run npm run build before npm run sena:performance:check."
    },
    {
      id: "production-build-identity",
      label: "Bindable clean build identity for production evidence",
      status: !strictProductionEvidenceRequired || bindableBuildIdentity ? "pass" : "fail",
      evidence: [
        `strictProductionEvidenceRequired=${strictProductionEvidenceRequired}`,
        `bindableBuildIdentity=${bindableBuildIdentity}`,
        `nextBuildIdSha256=${validSha256(buildIdentity.nextBuildIdSha256) ? "present" : "missing-or-invalid"}`,
        `gitCommit=${validGitCommit(buildIdentity.gitCommit) ? "present" : "missing-or-invalid"}`,
        `gitDirtyClean=${buildIdentity.gitDirty === false}`,
        `gitDirtyFileCount=${buildIdentity.gitDirtyFileCount}`,
        `gitStatusSha256=${buildIdentity.gitStatusSha256 === "unavailable" ? "unavailable" : "present"}`,
        `sourceCustodyMode=${sourceCustody.mode}`,
        `sourceCustodyReviewedClean=${sourceCustody.reviewedClean}`,
        `sourceCustodyManifestSha256=${sourceCustody.manifestSha256 ? "present" : "missing"}`,
        `sourceCustodyTreeSha256=${sourceCustody.sourceTreeSha256 ? "present" : "missing"}`,
        `sourceCustodyFileListSha256=${sourceCustody.fileListSha256 ? "present" : "missing"}`,
        `sourceCustodyFileCount=${sourceCustody.fileCount ?? "missing"}`,
        `packageLockSha256=${validSha256(buildIdentity.packageLockSha256) ? "present" : "missing-or-invalid"}`,
        "buildIdentityValues=hashes-and-commit-only",
        "requiredForProductionEvidenceBinding=true"
      ],
      nextAction: !strictProductionEvidenceRequired || bindableBuildIdentity
        ? "Keep this clean build identity attached to the release evidence."
        : "Run npm run build and npm run sena:performance:check from a clean git tree or reviewed clean release-slice source custody before binding or archiving production performance evidence."
    },
    buildSizeCheck({
      id: "workspace-html-br",
      label: "Workspace HTML Brotli size",
      actualBrotliBytes: workspaceHtmlRead.actualBrotliBytes,
      budgetBytes: budgets.workspaceHtmlBrotliBytes,
      missingBuild: !productionBuildPresent,
      missingArtifactFiles: workspaceHtmlRead.missingArtifactFiles,
      readErrorHashes: workspaceHtmlRead.readErrorHashes,
      readAttempts: workspaceHtmlRead.readAttempts,
      transientReadRecoveries: workspaceHtmlRead.transientReadRecoveries,
      evidence: [
        `workspaceHtmlPresent=${workspaceHtmlRead.actualBrotliBytes !== undefined}`,
        "route=/workspace/sena",
        "content=excluded"
      ],
      nextAction: "Reduce prerendered /workspace/sena shell HTML or raise SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES with release-owner approval."
    }),
    buildSizeCheck({
      id: "workspace-route-js-br",
      label: "Workspace route JavaScript Brotli size",
      actualBrotliBytes: workspaceRouteJsRead.actualBrotliBytes,
      budgetBytes: budgets.workspaceRouteJsBrotliBytes,
      missingBuild: !productionBuildPresent,
      missingArtifactFiles: workspaceRouteJsRead.missingArtifactFiles,
      readErrorHashes: workspaceRouteJsRead.readErrorHashes,
      readAttempts: workspaceRouteJsRead.readAttempts,
      transientReadRecoveries: workspaceRouteJsRead.transientReadRecoveries,
      evidence: [
        `workspaceRouteJsFiles=${workspaceRouteFiles.length}`,
        "route=/workspace/sena",
        "chunkPaths=excluded"
      ],
      nextAction: "Keep SENA workspace code split behind the dynamic shell, or raise SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES with release-owner approval."
    }),
    buildSizeCheck({
      id: "total-static-js-br",
      label: "Total static JavaScript Brotli size",
      actualBrotliBytes: totalStaticJsRead.actualBrotliBytes,
      budgetBytes: budgets.totalStaticJsBrotliBytes,
      missingBuild: !productionBuildPresent,
      missingArtifactFiles: totalStaticJsRead.missingArtifactFiles,
      readErrorHashes: totalStaticJsRead.readErrorHashes,
      readAttempts: totalStaticJsRead.readAttempts,
      transientReadRecoveries: totalStaticJsRead.transientReadRecoveries,
      evidence: [
        `staticJsFiles=${jsFiles.length}`,
        "chunkPaths=excluded",
        "sourceContents=excluded"
      ],
      nextAction: "Reduce shared/static JavaScript payload or raise SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES with release-owner approval."
    })
  ];
  const failed = checks.filter((check) => check.status === "fail").length;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseProductionPerformanceBudget,
    generatedAt: now(),
    status: failed === 0 ? "pass" : "fail",
    summary: {
      checks: checks.length,
      passed: checks.length - failed,
      failed,
      totalStaticJsFiles: jsFiles.length,
      workspaceRouteJsFiles: workspaceRouteFiles.length
    },
    policy: {
      productionBuildRequired: true,
      conferenceTarget: "50-users-30-minutes",
      localFileStoreIsProductionBackend: false,
      artifactPurpose: "archive-performance-budget-json-plus-sha256",
      buildIdentityRequiredForBinding: true,
      strictProductionEvidenceRequired
    },
    buildIdentity,
    sourceCustody,
    budgets,
    budgetEnv: {
      workspaceHtmlBrotliBytes: "SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES",
      workspaceRouteJsBrotliBytes: "SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES",
      totalStaticJsBrotliBytes: "SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES"
    },
    checks,
    evidence: [
      `status=${failed === 0 ? "pass" : "fail"}`,
      `checks=${checks.length}`,
      `failed=${failed}`,
      `workspaceRouteJsFiles=${workspaceRouteFiles.length}`,
      `totalStaticJsFiles=${jsFiles.length}`,
      `nextBuildIdSha256=${buildIdentity.nextBuildIdSha256 === "missing" ? "missing" : "present"}`,
      `gitCommit=${buildIdentity.gitCommit === "unavailable" ? "unavailable" : "present"}`,
      `gitDirty=${buildIdentity.gitDirty}`,
      `gitDirtyFileCount=${buildIdentity.gitDirtyFileCount}`,
      `gitStatusSha256=${buildIdentity.gitStatusSha256 === "unavailable" ? "unavailable" : "present"}`,
      `sourceCustodyMode=${sourceCustody.mode}`,
      `sourceCustodyReviewedClean=${sourceCustody.reviewedClean}`,
      `sourceCustodyManifestSha256=${sourceCustody.manifestSha256 ? "present" : "missing"}`,
      `sourceCustodyTreeSha256=${sourceCustody.sourceTreeSha256 ? "present" : "missing"}`,
      `sourceCustodyFileListSha256=${sourceCustody.fileListSha256 ? "present" : "missing"}`,
      `sourceCustodyFileCount=${sourceCustody.fileCount ?? "missing"}`,
      `packageLockSha256=${buildIdentity.packageLockSha256 === "missing" ? "missing" : "present"}`,
      `strictProductionEvidenceRequired=${strictProductionEvidenceRequired}`,
      `bindableBuildIdentity=${bindableBuildIdentity}`,
      "buildIdentityValues=hashes-and-commit-only",
      `artifactReadIncomplete=${checks.some((check) => check.evidence.includes("artifactReadComplete=false"))}`,
      `artifactReadAttempts=${(workspaceHtmlRead.readAttempts ?? 0) + (workspaceRouteJsRead.readAttempts ?? 0) + (totalStaticJsRead.readAttempts ?? 0)}`,
      `artifactReadTransientRecoveries=${(workspaceHtmlRead.transientReadRecoveries ?? 0) + (workspaceRouteJsRead.transientReadRecoveries ?? 0) + (totalStaticJsRead.transientReadRecoveries ?? 0)}`,
      "localBuildPaths=excluded",
      "sourceContents=excluded",
      "secretValues=excluded",
      "localFileStoreProductionBackend=false"
    ],
    nextActions: Array.from(new Set(checks
      .filter((check) => check.status === "fail")
      .map((check) => check.nextAction))),
    redaction: {
      localBuildPathsExcluded: true,
      sourceContentsExcluded: true,
      secretValuesExcluded: true
    }
  };
}
