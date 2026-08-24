import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { booleanEnvFrom, senaProductionPostureFrom } from "./auth-config";
import { now } from "./ops-runtime";
import {
  collectSenaBuildInputIdentity,
  isSenaFullGitObjectId,
  parseSenaNextBuildId,
  senaNextBuildIdSha256FromInputSha256,
  senaPerformanceSourceCustodyManifestSha256,
  SENA_PERFORMANCE_SOURCE_CUSTODY_GENERATOR,
  SENA_NEXT_BUILD_ID_GENERATOR
} from "./performance-build-identity.mjs";
import {
  measureSenaPerformanceBuildOutput,
  senaBuildIdIsRegularFile
} from "./performance-build-measurement.mjs";

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
  headroomBytes?: number;
  minimumHeadroomBytes?: number;
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
    totalStaticJsHeadroomReserveRequired: true;
    strictProductionEvidenceRequired: boolean;
  };
  buildIdentity: {
    nextBuildIdSha256: string | "missing";
    nextBuildIdGenerator: typeof SENA_NEXT_BUILD_ID_GENERATOR | "unknown";
    nextBuildMatchesCurrentSource: boolean;
    buildInputSha256: string | "unavailable";
    currentExpectedBuildInputSha256: string;
    buildInputEnvironmentScope: "not-bound-use-measured-artifact-set-sha256";
    buildObservationStable: boolean;
    measuredArtifactSetStable: boolean;
    measuredArtifactSetSha256: string | "unavailable";
    measuredArtifactFileCount: number | "unknown";
    gitCommit: string | "unavailable";
    gitDirty: boolean | "unknown";
    gitDirtyFileCount: number | "unknown";
    gitStatusSha256: string | "unavailable";
    packageLockSha256: string | "missing";
    sourceTreeSha256: string | "unavailable";
    sourceFileListSha256: string | "unavailable";
    sourceFileCount: number | "unknown";
    sourceReadErrorCount: number | "unknown";
    sourceReadErrorSha256: string | "unavailable";
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
    totalStaticJsMinimumHeadroomBytes: number;
  };
  budgetEnv: {
    workspaceHtmlBrotliBytes: "SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES";
    workspaceRouteJsBrotliBytes: "SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES";
    totalStaticJsBrotliBytes: "SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES";
    totalStaticJsMinimumHeadroomBytes: "SENA_PERF_TOTAL_STATIC_JS_MIN_HEADROOM_BYTES";
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

function sameBuildInputIdentity(
  left: ReturnType<typeof collectSenaBuildInputIdentity>,
  right: ReturnType<typeof collectSenaBuildInputIdentity>
) {
  return left.buildInputSha256 === right.buildInputSha256 &&
    left.buildId === right.buildId &&
    left.gitCommit === right.gitCommit &&
    left.gitDirty === right.gitDirty &&
    left.gitDirtyFileCount === right.gitDirtyFileCount &&
    left.gitStatusSha256 === right.gitStatusSha256 &&
    left.packageLockSha256 === right.packageLockSha256 &&
    left.sourceTreeSha256 === right.sourceTreeSha256 &&
    left.sourceFileListSha256 === right.sourceFileListSha256 &&
    left.sourceFileCount === right.sourceFileCount &&
    left.sourceReadErrorCount === right.sourceReadErrorCount &&
    left.sourceReadErrorSha256 === right.sourceReadErrorSha256;
}

function validSha256(value: string | "missing") {
  return /^[a-f0-9]{64}$/.test(value);
}

function coherentGitDirtyIdentity(identity: SenaEnterpriseProductionPerformanceBudgetArtifact["buildIdentity"]) {
  if (identity.gitDirty === false) {
    return identity.gitDirtyFileCount === 0 && identity.gitStatusSha256 === sha256Text("");
  }
  if (identity.gitDirty === true) {
    return typeof identity.gitDirtyFileCount === "number" && identity.gitDirtyFileCount > 0;
  }
  return false;
}

function positiveIntegerString(value: string | undefined) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function nonNegativeIntegerString(value: string | undefined) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function validSourceCustodyHash(value: string | undefined) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function sourceCustodyFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  gitIdentity: ReturnType<typeof collectSenaBuildInputIdentity>
): SenaEnterpriseProductionPerformanceBudgetArtifact["sourceCustody"] {
  const mode = env.SENA_PERFORMANCE_SOURCE_CUSTODY_MODE;
  const cleanGit = gitIdentity.gitDirty === false && isSenaFullGitObjectId(gitIdentity.gitCommit);
  if (mode !== "reviewed-clean-release-slice") {
    return {
      mode: cleanGit ? "git-clean-worktree" : "none",
      reviewedClean: cleanGit,
      baseGitCommit: isSenaFullGitObjectId(gitIdentity.gitCommit) ? gitIdentity.gitCommit : undefined,
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
  const rootGitDirtyFileCount = nonNegativeIntegerString(env.SENA_PERFORMANCE_SOURCE_CUSTODY_ROOT_GIT_DIRTY_FILE_COUNT);
  const reviewedClean = validSourceCustodyHash(manifestSha256) &&
    validSourceCustodyHash(sourceTreeSha256) &&
    validSourceCustodyHash(fileListSha256) &&
    fileCount !== undefined &&
    isSenaFullGitObjectId(baseGitCommit) &&
    baseGitCommit === gitIdentity.gitCommit &&
    validSourceCustodyHash(rootGitStatusSha256) &&
    rootGitStatusSha256 === gitIdentity.gitStatusSha256 &&
    rootGitDirtyFileCount !== undefined &&
    rootGitDirtyFileCount === gitIdentity.gitDirtyFileCount &&
    gitIdentity.gitDirty === false &&
    rootGitDirtyFileCount === 0 &&
    sourceTreeSha256 === gitIdentity.sourceTreeSha256 &&
    fileListSha256 === gitIdentity.sourceFileListSha256 &&
    fileCount === gitIdentity.sourceFileCount &&
    gitIdentity.sourceReadErrorCount === 0 &&
    manifestSha256 === senaPerformanceSourceCustodyManifestSha256({
      baseGitCommit: gitIdentity.gitCommit,
      rootGitStatusSha256: gitIdentity.gitStatusSha256,
      rootGitDirtyFileCount: gitIdentity.gitDirtyFileCount,
      fileListSha256: gitIdentity.sourceFileListSha256,
      sourceTreeSha256: gitIdentity.sourceTreeSha256,
      fileCount: gitIdentity.sourceFileCount
    });

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
    generator: SENA_PERFORMANCE_SOURCE_CUSTODY_GENERATOR,
    values: "hashes-and-counts-only"
  };
}

function buildIdentityBindable(
  identity: SenaEnterpriseProductionPerformanceBudgetArtifact["buildIdentity"],
  sourceCustody: SenaEnterpriseProductionPerformanceBudgetArtifact["sourceCustody"]
) {
  return validSha256(identity.nextBuildIdSha256) &&
    identity.nextBuildIdGenerator === SENA_NEXT_BUILD_ID_GENERATOR &&
    identity.nextBuildMatchesCurrentSource === true &&
    identity.buildObservationStable === true &&
    identity.measuredArtifactSetStable === true &&
    validSha256(identity.buildInputSha256) &&
    validSha256(identity.currentExpectedBuildInputSha256) &&
    identity.buildInputSha256 === identity.currentExpectedBuildInputSha256 &&
    identity.buildInputEnvironmentScope === "not-bound-use-measured-artifact-set-sha256" &&
    validSha256(identity.measuredArtifactSetSha256) &&
    typeof identity.measuredArtifactFileCount === "number" &&
    identity.measuredArtifactFileCount > 0 &&
    identity.nextBuildIdSha256 === senaNextBuildIdSha256FromInputSha256(identity.buildInputSha256) &&
    isSenaFullGitObjectId(identity.gitCommit) &&
    coherentGitDirtyIdentity(identity) &&
    identity.gitDirty === false &&
    sourceCustody.mode === "git-clean-worktree" &&
    sourceCustody.reviewedClean === true &&
    validSha256(identity.packageLockSha256) &&
    validSha256(identity.sourceTreeSha256) &&
    validSha256(identity.sourceFileListSha256) &&
    typeof identity.sourceFileCount === "number" &&
    identity.sourceFileCount > 0 &&
    identity.sourceReadErrorCount === 0 &&
    validSha256(identity.sourceReadErrorSha256) &&
    identity.sourceReadErrorSha256 === sha256Text("");
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
  minimumHeadroomBytes?: number;
  nextAction: string;
}): SenaEnterpriseProductionPerformanceBudgetCheck {
  const readComplete = (input.missingArtifactFiles ?? 0) === 0;
  // P1 guard: a zero-byte actual can only mean the measured artifact set is
  // empty (stale or dev-polluted .next with no matching chunks), never a
  // legitimately weightless build output — fail instead of trivially passing.
  const zeroByteActual = input.actualBrotliBytes === 0;
  const headroomBytes = input.actualBrotliBytes === undefined
    ? undefined
    : input.budgetBytes - input.actualBrotliBytes;
  const minimumHeadroomBytes = input.minimumHeadroomBytes;
  const headroomReserveSatisfied = headroomBytes !== undefined &&
    (minimumHeadroomBytes === undefined || headroomBytes >= minimumHeadroomBytes);
  const status = !input.missingBuild && readComplete && input.actualBrotliBytes !== undefined && !zeroByteActual && input.actualBrotliBytes <= input.budgetBytes && headroomReserveSatisfied
    ? "pass"
    : "fail";
  return {
    id: input.id,
    label: input.label,
    status,
    actualBrotliBytes: input.actualBrotliBytes,
    budgetBytes: input.budgetBytes,
    headroomBytes,
    minimumHeadroomBytes,
    evidence: [
      ...input.evidence,
      `actualBrotliBytes=${input.actualBrotliBytes ?? "missing"}`,
      `budgetBytes=${input.budgetBytes}`,
      `headroomBytes=${headroomBytes ?? "missing"}`,
      `minimumHeadroomBytes=${minimumHeadroomBytes ?? "not-required"}`,
      `headroomReserveSatisfied=${headroomReserveSatisfied}`,
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
          ? minimumHeadroomBytes !== undefined && headroomBytes !== undefined && headroomBytes < minimumHeadroomBytes
            ? `Reduce static JavaScript until at least ${minimumHeadroomBytes} bytes of budget headroom remain. Production binding fixes the ADR-0011 reserve at 12000 bytes; an override requires a separately implemented and verified release-owner attestation contract.`
            : input.nextAction
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
  const totalStaticJsBrotliBytes = budgetEnv(env, "SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES", 848_000);
  const defaultTotalStaticJsMinimumHeadroomBytes = Math.min(12_000, Math.floor(totalStaticJsBrotliBytes * 0.05));
  const budgets = {
    workspaceHtmlBrotliBytes: budgetEnv(env, "SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES", 80_000),
    workspaceRouteJsBrotliBytes: budgetEnv(env, "SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES", 180_000),
    // 900_000 → 852_000 (2026-08-03) → 848_000 (2026-08-23).
    //
    // It was provisional only because it had been set against a pre-redesign build and
    // nobody had re-measured since; iteration 9 (2026-08-16) did, by same-session A/B.
    // Actual is 824,791 B — 27,209 B (3.19%) of headroom — with the fusion redesign
    // accounting for +9,505 B of the growth and the 2026-08-15 remediation +2,808 B.
    //
    // Round 21 moved canonical snapshot/review-packet restore validation behind a
    // bounded, stateless server boundary. The accepted build measured 830,811 B,
    // 22,101 B below the 852,912 B pre-change build. ADR-0011 therefore closes its
    // deferred re-ratchet at 848,000 B and reserves at least 12,000 B of displayed
    // headroom. The reserve makes a near-zero-headroom green build fail before release.
    totalStaticJsBrotliBytes,
    totalStaticJsMinimumHeadroomBytes: boundedIntegerEnv(
      env,
      "SENA_PERF_TOTAL_STATIC_JS_MIN_HEADROOM_BYTES",
      defaultTotalStaticJsMinimumHeadroomBytes,
      0,
      totalStaticJsBrotliBytes
    )
  };
  // Bracket both the current source identity and every measured build artifact.
  // This turns concurrent source/build writes into an explicit non-bindable
  // observation instead of combining values from different instants.
  const currentBuildInputBefore = collectSenaBuildInputIdentity(root);
  const nextBuildIdPresentBefore = senaBuildIdIsRegularFile(root);
  const nextBuildIdReadBefore = nextBuildIdPresentBefore
    ? readFileWithStabilization(nextBuildIdPath, readFile, readPolicy)
    : undefined;
  const nextBuildIdBufferBefore = nextBuildIdReadBefore?.ok ? nextBuildIdReadBefore.buffer : undefined;

  // One shared measurement reads each selected output once, and derives both
  // the exact output-set digest and all three Brotli values from those same
  // buffers. A second snapshot is used only to prove the observation stayed
  // stable while the measurement was made.
  const buildMeasurement = measureSenaPerformanceBuildOutput(root, {
    readFile,
    attempts: readPolicy.attempts
  });
  const productionBuildPresent = buildMeasurement.productionBuildPresent;
  const totalStaticJsRead = buildMeasurement.metrics.totalStaticJs;
  const workspaceRouteJsRead = buildMeasurement.metrics.workspaceRouteJs;
  const workspaceHtmlRead = buildMeasurement.metrics.workspaceHtml;
  const nextBuildIdPresentAfter = senaBuildIdIsRegularFile(root);
  const nextBuildIdReadAfter = nextBuildIdPresentAfter
    ? readFileWithStabilization(nextBuildIdPath, readFile, readPolicy)
    : undefined;
  const nextBuildIdBufferAfter = nextBuildIdReadAfter?.ok ? nextBuildIdReadAfter.buffer : undefined;
  const currentBuildInputAfter = collectSenaBuildInputIdentity(root);
  const sourceCustody = sourceCustodyFromEnv(env, currentBuildInputAfter);
  const buildIdObservationStable = nextBuildIdPresentBefore && nextBuildIdPresentAfter &&
    nextBuildIdBufferBefore !== undefined &&
    nextBuildIdBufferAfter !== undefined &&
    sha256Text(nextBuildIdBufferBefore) === sha256Text(nextBuildIdBufferAfter);
  const buildObservationStable = buildIdObservationStable &&
    sameBuildInputIdentity(currentBuildInputBefore, currentBuildInputAfter);
  const measuredArtifactSetStable = buildMeasurement.observationStable;
  const nextBuildId = nextBuildIdBufferBefore?.toString("utf8").trim();
  const parsedBuildId = parseSenaNextBuildId(nextBuildId);
  const nextBuildMatchesCurrentSource = buildObservationStable &&
    parsedBuildId.generator === SENA_NEXT_BUILD_ID_GENERATOR &&
    parsedBuildId.buildInputSha256 === currentBuildInputAfter.buildInputSha256;
  const attributeCurrentIdentityToBuild = nextBuildMatchesCurrentSource;
  const buildIdentity = {
    nextBuildIdSha256: nextBuildIdBufferBefore ? sha256Text(nextBuildIdBufferBefore) : "missing" as const,
    nextBuildIdGenerator: parsedBuildId.generator,
    nextBuildMatchesCurrentSource,
    buildInputSha256: parsedBuildId.buildInputSha256,
    currentExpectedBuildInputSha256: currentBuildInputAfter.buildInputSha256,
    buildInputEnvironmentScope: "not-bound-use-measured-artifact-set-sha256" as const,
    buildObservationStable,
    measuredArtifactSetStable,
    measuredArtifactSetSha256: measuredArtifactSetStable && buildMeasurement.measuredArtifactFileCount > 0
      ? buildMeasurement.measuredArtifactSetSha256
      : "unavailable" as const,
    measuredArtifactFileCount: measuredArtifactSetStable && buildMeasurement.measuredArtifactFileCount > 0
      ? buildMeasurement.measuredArtifactFileCount
      : "unknown" as const,
    gitCommit: attributeCurrentIdentityToBuild ? currentBuildInputAfter.gitCommit : "unavailable" as const,
    gitDirty: attributeCurrentIdentityToBuild ? currentBuildInputAfter.gitDirty : "unknown" as const,
    gitDirtyFileCount: attributeCurrentIdentityToBuild ? currentBuildInputAfter.gitDirtyFileCount : "unknown" as const,
    gitStatusSha256: attributeCurrentIdentityToBuild ? currentBuildInputAfter.gitStatusSha256 : "unavailable" as const,
    packageLockSha256: attributeCurrentIdentityToBuild ? currentBuildInputAfter.packageLockSha256 : "missing" as const,
    sourceTreeSha256: attributeCurrentIdentityToBuild ? currentBuildInputAfter.sourceTreeSha256 : "unavailable" as const,
    sourceFileListSha256: attributeCurrentIdentityToBuild ? currentBuildInputAfter.sourceFileListSha256 : "unavailable" as const,
    sourceFileCount: attributeCurrentIdentityToBuild ? currentBuildInputAfter.sourceFileCount : "unknown" as const,
    sourceReadErrorCount: attributeCurrentIdentityToBuild ? currentBuildInputAfter.sourceReadErrorCount : "unknown" as const,
    sourceReadErrorSha256: attributeCurrentIdentityToBuild ? currentBuildInputAfter.sourceReadErrorSha256 : "unavailable" as const,
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
        `staticChunksPresent=${productionBuildPresent}`,
        `nextBuildIdSha256=${buildIdentity.nextBuildIdSha256 === "missing" ? "missing" : "present"}`,
        `nextBuildIdGenerator=${buildIdentity.nextBuildIdGenerator}`,
        `nextBuildMatchesCurrentSource=${buildIdentity.nextBuildMatchesCurrentSource}`,
        `buildInputSha256=${validSha256(buildIdentity.buildInputSha256) ? "present" : "missing-or-invalid"}`,
        `currentExpectedBuildInputSha256=${validSha256(buildIdentity.currentExpectedBuildInputSha256) ? "present" : "missing-or-invalid"}`,
        `buildInputEnvironmentScope=${buildIdentity.buildInputEnvironmentScope}`,
        `buildObservationStable=${buildIdentity.buildObservationStable}`,
        `measuredArtifactSetStable=${buildIdentity.measuredArtifactSetStable}`,
        `measuredArtifactSetSha256=${validSha256(buildIdentity.measuredArtifactSetSha256) ? "present" : "missing-or-invalid"}`,
        `measuredArtifactFileCount=${buildIdentity.measuredArtifactFileCount}`,
        `gitCommit=${buildIdentity.gitCommit === "unavailable" ? "unavailable" : "present"}`,
        `gitDirty=${buildIdentity.gitDirty}`,
        `gitDirtyFileCount=${buildIdentity.gitDirtyFileCount}`,
        `gitStatusSha256=${buildIdentity.gitStatusSha256 === "unavailable" ? "unavailable" : "present"}`,
        `sourceCustodyMode=${sourceCustody.mode}`,
        `sourceCustodyReviewedClean=${sourceCustody.reviewedClean}`,
        `packageLockSha256=${buildIdentity.packageLockSha256 === "missing" ? "missing" : "present"}`,
        `sourceTreeSha256=${validSha256(buildIdentity.sourceTreeSha256) ? "present" : "missing-or-invalid"}`,
        `sourceFileListSha256=${validSha256(buildIdentity.sourceFileListSha256) ? "present" : "missing-or-invalid"}`,
        `sourceFileCount=${buildIdentity.sourceFileCount}`,
        `sourceReadErrorCount=${buildIdentity.sourceReadErrorCount}`,
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
        `nextBuildIdGenerator=${buildIdentity.nextBuildIdGenerator}`,
        `nextBuildMatchesCurrentSource=${buildIdentity.nextBuildMatchesCurrentSource}`,
        `buildInputSha256=${validSha256(buildIdentity.buildInputSha256) ? "present" : "missing-or-invalid"}`,
        `currentExpectedBuildInputSha256=${validSha256(buildIdentity.currentExpectedBuildInputSha256) ? "present" : "missing-or-invalid"}`,
        `buildInputEnvironmentScope=${buildIdentity.buildInputEnvironmentScope}`,
        `buildObservationStable=${buildIdentity.buildObservationStable}`,
        `measuredArtifactSetStable=${buildIdentity.measuredArtifactSetStable}`,
        `measuredArtifactSetSha256=${validSha256(buildIdentity.measuredArtifactSetSha256) ? "present" : "missing-or-invalid"}`,
        `measuredArtifactFileCount=${buildIdentity.measuredArtifactFileCount}`,
        `gitCommit=${isSenaFullGitObjectId(buildIdentity.gitCommit) ? "present" : "missing-or-invalid"}`,
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
        `sourceTreeSha256=${validSha256(buildIdentity.sourceTreeSha256) ? "present" : "missing-or-invalid"}`,
        `sourceFileListSha256=${validSha256(buildIdentity.sourceFileListSha256) ? "present" : "missing-or-invalid"}`,
        `sourceFileCount=${buildIdentity.sourceFileCount}`,
        `sourceReadErrorCount=${buildIdentity.sourceReadErrorCount}`,
        "buildIdentityValues=hashes-and-commit-only",
        "requiredForProductionEvidenceBinding=true"
      ],
      nextAction: !strictProductionEvidenceRequired || bindableBuildIdentity
        ? "Keep this clean build identity attached to the release evidence."
        : "Run npm run build and npm run sena:performance:check from a clean Git worktree before binding or archiving production performance evidence. Source-custody snapshots are diagnostic only and cannot authorize a dirty build."
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
      nextAction: "Reduce prerendered /workspace/sena shell HTML. Production binding fixes the ADR-0011 budget at 80000 bytes; an override requires a separately implemented and verified release-owner attestation contract."
    }),
    buildSizeCheck({
      id: "workspace-route-js-br",
      label: "Workspace route entry-chunk JavaScript Brotli size",
      actualBrotliBytes: workspaceRouteJsRead.actualBrotliBytes,
      budgetBytes: budgets.workspaceRouteJsBrotliBytes,
      missingBuild: !productionBuildPresent,
      missingArtifactFiles: workspaceRouteJsRead.missingArtifactFiles,
      readErrorHashes: workspaceRouteJsRead.readErrorHashes,
      readAttempts: workspaceRouteJsRead.readAttempts,
      transientReadRecoveries: workspaceRouteJsRead.transientReadRecoveries,
      evidence: [
        `workspaceRouteJsFiles=${buildMeasurement.workspaceRouteJsFiles}`,
        "route=/workspace/sena",
        "measurementScope=next-app-route-entry-chunks-only",
        "dynamicChunksIncluded=false",
        "chunkPaths=excluded"
      ],
      nextAction: "Keep the SENA workspace route entry shell within the canonical 180000-byte ADR-0011 budget; an override requires a separately implemented and verified release-owner attestation contract."
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
      minimumHeadroomBytes: budgets.totalStaticJsMinimumHeadroomBytes,
      evidence: [
        `staticJsFiles=${buildMeasurement.totalStaticJsFiles}`,
        "chunkPaths=excluded",
        "sourceContents=excluded"
      ],
      nextAction: "Reduce shared/static JavaScript payload to the canonical 848000-byte ADR-0011 budget with at least 12000 bytes of headroom; an override requires a separately implemented and verified release-owner attestation contract."
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
      totalStaticJsFiles: buildMeasurement.totalStaticJsFiles,
      workspaceRouteJsFiles: buildMeasurement.workspaceRouteJsFiles
    },
    policy: {
      productionBuildRequired: true,
      conferenceTarget: "50-users-30-minutes",
      localFileStoreIsProductionBackend: false,
      artifactPurpose: "archive-performance-budget-json-plus-sha256",
      buildIdentityRequiredForBinding: true,
      totalStaticJsHeadroomReserveRequired: true,
      strictProductionEvidenceRequired
    },
    buildIdentity,
    sourceCustody,
    budgets,
    budgetEnv: {
      workspaceHtmlBrotliBytes: "SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES",
      workspaceRouteJsBrotliBytes: "SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES",
      totalStaticJsBrotliBytes: "SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES",
      totalStaticJsMinimumHeadroomBytes: "SENA_PERF_TOTAL_STATIC_JS_MIN_HEADROOM_BYTES"
    },
    checks,
    evidence: [
      `status=${failed === 0 ? "pass" : "fail"}`,
      `checks=${checks.length}`,
      `failed=${failed}`,
      `workspaceRouteJsFiles=${buildMeasurement.workspaceRouteJsFiles}`,
      `totalStaticJsFiles=${buildMeasurement.totalStaticJsFiles}`,
      `nextBuildIdSha256=${buildIdentity.nextBuildIdSha256 === "missing" ? "missing" : "present"}`,
      `nextBuildIdGenerator=${buildIdentity.nextBuildIdGenerator}`,
      `nextBuildMatchesCurrentSource=${buildIdentity.nextBuildMatchesCurrentSource}`,
      `buildInputSha256=${validSha256(buildIdentity.buildInputSha256) ? "present" : "missing-or-invalid"}`,
      `currentExpectedBuildInputSha256=${validSha256(buildIdentity.currentExpectedBuildInputSha256) ? "present" : "missing-or-invalid"}`,
      `buildInputEnvironmentScope=${buildIdentity.buildInputEnvironmentScope}`,
      `buildObservationStable=${buildIdentity.buildObservationStable}`,
      `measuredArtifactSetStable=${buildIdentity.measuredArtifactSetStable}`,
      `measuredArtifactSetSha256=${validSha256(buildIdentity.measuredArtifactSetSha256) ? "present" : "missing-or-invalid"}`,
      `measuredArtifactFileCount=${buildIdentity.measuredArtifactFileCount}`,
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
      `sourceTreeSha256=${validSha256(buildIdentity.sourceTreeSha256) ? "present" : "missing-or-invalid"}`,
      `sourceFileListSha256=${validSha256(buildIdentity.sourceFileListSha256) ? "present" : "missing-or-invalid"}`,
      `sourceFileCount=${buildIdentity.sourceFileCount}`,
      `sourceReadErrorCount=${buildIdentity.sourceReadErrorCount}`,
      `strictProductionEvidenceRequired=${strictProductionEvidenceRequired}`,
      `bindableBuildIdentity=${bindableBuildIdentity}`,
      "buildIdentityValues=hashes-and-commit-only",
      `artifactReadIncomplete=${checks.some((check) => check.evidence.includes("artifactReadComplete=false"))}`,
      `artifactReadAttempts=${(workspaceHtmlRead.readAttempts ?? 0) + (workspaceRouteJsRead.readAttempts ?? 0) + (totalStaticJsRead.readAttempts ?? 0)}`,
      `artifactReadTransientRecoveries=${(workspaceHtmlRead.transientReadRecoveries ?? 0) + (workspaceRouteJsRead.transientReadRecoveries ?? 0) + (totalStaticJsRead.transientReadRecoveries ?? 0)}`,
      `artifactObservationReadAttempts=${buildMeasurement.observationReadAttempts}`,
      `artifactObservationTransientRecoveries=${buildMeasurement.observationTransientRecoveries}`,
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
