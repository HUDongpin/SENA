import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { brotliCompressSync, constants } from "node:zlib";
import {
  collectSenaBuildInputIdentity,
  parseSenaNextBuildId,
  SENA_NEXT_BUILD_ID_GENERATOR
} from "./performance-build-identity.mjs";

export const SENA_PERFORMANCE_BUILD_MEASUREMENT_GENERATOR = "sena-performance-build-measurement/v2";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedRelativePath(root, file) {
  const relativePath = path.relative(root, file).split(path.sep).join("/");
  return relativePath || ".";
}

function filesystemErrorReason(error) {
  const name = error instanceof Error ? error.name : typeof error;
  const code = error && typeof error === "object" && typeof error.code === "string"
    ? error.code
    : "unknown";
  return `filesystem-error:${name}:${code}`;
}

function traversalErrorHash(root, operation, file, reason) {
  return sha256(JSON.stringify({
    operation,
    path: normalizedRelativePath(root, file),
    reason
  }));
}

function recordTraversalError(errors, root, operation, file, reason) {
  errors.push(traversalErrorHash(root, operation, file, reason));
}

function expectedPathType(root, file, expectedType, lstat, errors) {
  try {
    const stats = lstat(file);
    if (stats.isSymbolicLink()) {
      recordTraversalError(errors, root, "lstat", file, "symbolic-link-rejected");
      return false;
    }
    const matches = expectedType === "directory" ? stats.isDirectory() : stats.isFile();
    if (!matches) {
      recordTraversalError(errors, root, "lstat", file, `non-${expectedType}-rejected`);
      return false;
    }
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return false;
    recordTraversalError(errors, root, "lstat", file, filesystemErrorReason(error));
    return false;
  }
}

function walk(root, dir, readdir, lstat, errors) {
  let entries;
  try {
    entries = [...readdir(dir)].sort();
  } catch (error) {
    recordTraversalError(errors, root, "readdir", dir, filesystemErrorReason(error));
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry);
    let stats;
    try {
      stats = lstat(entryPath);
    } catch (error) {
      recordTraversalError(errors, root, "lstat", entryPath, filesystemErrorReason(error));
      continue;
    }
    if (stats.isSymbolicLink()) {
      recordTraversalError(errors, root, "lstat", entryPath, "symbolic-link-rejected");
    } else if (stats.isDirectory()) {
      files.push(...walk(root, entryPath, readdir, lstat, errors));
    } else if (stats.isFile()) {
      files.push(entryPath);
    } else {
      recordTraversalError(errors, root, "lstat", entryPath, "non-regular-file-rejected");
    }
  }
  return files;
}

function brotliSize(buffer) {
  return brotliCompressSync(buffer, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11
    }
  }).length;
}

function errorSha256(error) {
  const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  return sha256(message);
}

function readWithStabilization(file, readFile, attempts) {
  const maxAttempts = Math.max(1, attempts);
  const errorHashes = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return {
        ok: true,
        buffer: readFile(file),
        attempts: attempt,
        errorHashes
      };
    } catch (error) {
      errorHashes.push(errorSha256(error));
    }
  }
  return {
    ok: false,
    attempts: maxAttempts,
    errorHashes
  };
}

function budgetRead(files, reads, traversalErrorHashes = []) {
  let total = 0;
  let failedFiles = traversalErrorHashes.length;
  const readErrorHashes = [...traversalErrorHashes];
  let readAttempts = 0;
  let transientReadRecoveries = 0;
  for (const file of files) {
    const read = reads.get(file);
    if (!read) {
      failedFiles += 1;
      readErrorHashes.push(sha256(`undiscovered-read:${file}`));
      continue;
    }
    readAttempts += read.attempts;
    if (read.ok) {
      total += brotliSize(read.buffer);
      if (read.attempts > 1) transientReadRecoveries += 1;
    } else {
      failedFiles += 1;
      readErrorHashes.push(...read.errorHashes);
    }
  }
  return {
    actualBrotliBytes: readErrorHashes.length === 0 ? total : undefined,
    missingArtifactFiles: failedFiles,
    readErrorHashes: readErrorHashes.sort(),
    readAttempts,
    transientReadRecoveries
  };
}

function snapshot(root, readFile, attempts, readdir, lstat) {
  const nextDir = path.join(root, ".next");
  const staticChunksDir = path.join(nextDir, "static", "chunks");
  const workspaceHtmlPath = path.join(nextDir, "server", "app", "workspace", "sena.html");
  const traversalErrorHashes = [];
  const nextDirectoryPresent = expectedPathType(
    root,
    nextDir,
    "directory",
    lstat,
    traversalErrorHashes
  );
  const staticChunksPresent = nextDirectoryPresent && expectedPathType(
    root,
    staticChunksDir,
    "directory",
    lstat,
    traversalErrorHashes
  );
  const totalStaticJsPaths = staticChunksPresent
    ? walk(root, staticChunksDir, readdir, lstat, traversalErrorHashes)
      .filter((file) => file.endsWith(".js"))
      .sort()
    : [];
  const workspaceRouteJsPaths = totalStaticJsPaths.filter((file) =>
    file.includes(`${path.sep}app${path.sep}workspace${path.sep}sena${path.sep}page-`)
  );
  const workspaceHtmlPresent = nextDirectoryPresent && expectedPathType(
    root,
    workspaceHtmlPath,
    "file",
    lstat,
    traversalErrorHashes
  );
  traversalErrorHashes.sort();
  const productionBuildPresent = nextDirectoryPresent &&
    staticChunksPresent &&
    traversalErrorHashes.length === 0;
  const measuredPaths = Array.from(new Set([
    ...totalStaticJsPaths,
    ...(workspaceHtmlPresent ? [workspaceHtmlPath] : [])
  ])).sort();
  const reads = new Map();
  for (const file of measuredPaths) {
    reads.set(file, readWithStabilization(file, readFile, attempts));
  }

  const canonicalFiles = [];
  const readErrorHashes = [];
  let readAttempts = 0;
  let transientReadRecoveries = 0;
  for (const file of measuredPaths) {
    const read = reads.get(file);
    readAttempts += read.attempts;
    const relativePath = path.relative(nextDir, file).split(path.sep).join("/");
    if (read.ok) {
      canonicalFiles.push({
        path: relativePath,
        sha256: sha256(read.buffer)
      });
      if (read.attempts > 1) transientReadRecoveries += 1;
    } else {
      readErrorHashes.push(sha256(`${relativePath}:${read.errorHashes.join("|")}`));
    }
  }

  const workspaceHtml = workspaceHtmlPresent
    ? budgetRead([workspaceHtmlPath], reads, traversalErrorHashes)
    : {
        actualBrotliBytes: undefined,
        missingArtifactFiles: (nextDirectoryPresent && staticChunksPresent ? 1 : 0) + traversalErrorHashes.length,
        readErrorHashes: [...traversalErrorHashes],
        readAttempts: 0,
        transientReadRecoveries: 0
      };
  const workspaceRouteJs = budgetRead(workspaceRouteJsPaths, reads, traversalErrorHashes);
  const totalStaticJs = budgetRead(totalStaticJsPaths, reads, traversalErrorHashes);
  const fileListSha256 = sha256(JSON.stringify(canonicalFiles.map((entry) => entry.path)));
  const contentTreeSha256 = sha256(JSON.stringify(canonicalFiles));
  const outputSetSha256 = traversalErrorHashes.length === 0 &&
    readErrorHashes.length === 0 &&
    measuredPaths.length > 0
    ? sha256(JSON.stringify({
        generator: SENA_PERFORMANCE_BUILD_MEASUREMENT_GENERATOR,
        fileCount: measuredPaths.length,
        fileListSha256,
        contentTreeSha256
      }))
    : "unavailable";

  return {
    productionBuildPresent,
    workspaceHtmlPresent,
    totalStaticJsFiles: totalStaticJsPaths.length,
    workspaceRouteJsFiles: workspaceRouteJsPaths.length,
    measuredArtifactFileCount: measuredPaths.length,
    fileListSha256,
    contentTreeSha256,
    outputSetSha256,
    traversalErrorCount: traversalErrorHashes.length,
    traversalErrorSha256: sha256(JSON.stringify(traversalErrorHashes)),
    traversalErrorHashes,
    readErrorCount: readErrorHashes.length,
    readErrorSha256: sha256(JSON.stringify(readErrorHashes)),
    readAttempts,
    transientReadRecoveries,
    metrics: {
      workspaceHtml,
      workspaceRouteJs,
      totalStaticJs
    }
  };
}

function sameSnapshot(left, right) {
  return left.productionBuildPresent === right.productionBuildPresent &&
    left.workspaceHtmlPresent === right.workspaceHtmlPresent &&
    left.totalStaticJsFiles === right.totalStaticJsFiles &&
    left.workspaceRouteJsFiles === right.workspaceRouteJsFiles &&
    left.measuredArtifactFileCount === right.measuredArtifactFileCount &&
    left.fileListSha256 === right.fileListSha256 &&
    left.contentTreeSha256 === right.contentTreeSha256 &&
    left.outputSetSha256 === right.outputSetSha256 &&
    left.traversalErrorCount === 0 &&
    right.traversalErrorCount === 0 &&
    left.traversalErrorSha256 === right.traversalErrorSha256 &&
    left.readErrorCount === 0 &&
    right.readErrorCount === 0;
}

export function measureSenaPerformanceBuildOutput(root = process.cwd(), options = {}) {
  const readFile = options.readFile ?? readFileSync;
  const readdir = options.readdir ?? readdirSync;
  const lstat = options.lstat ?? lstatSync;
  const attempts = Number.isSafeInteger(options.attempts) && options.attempts > 0
    ? options.attempts
    : 3;
  const before = snapshot(root, readFile, attempts, readdir, lstat);
  const after = snapshot(root, readFile, attempts, readdir, lstat);
  const traversalErrorHashes = [
    ...before.traversalErrorHashes,
    ...after.traversalErrorHashes
  ].sort();
  const traversalFree = traversalErrorHashes.length === 0;
  return {
    generator: SENA_PERFORMANCE_BUILD_MEASUREMENT_GENERATOR,
    productionBuildPresent: traversalFree && before.productionBuildPresent && after.productionBuildPresent,
    observationStable: traversalFree && sameSnapshot(before, after),
    measuredArtifactSetSha256: traversalFree ? before.outputSetSha256 : "unavailable",
    measuredArtifactFileCount: before.measuredArtifactFileCount,
    totalStaticJsFiles: before.totalStaticJsFiles,
    workspaceRouteJsFiles: before.workspaceRouteJsFiles,
    traversalErrorCount: traversalErrorHashes.length,
    traversalErrorSha256: sha256(JSON.stringify(traversalErrorHashes)),
    metrics: before.metrics,
    observationReadAttempts: before.readAttempts + after.readAttempts,
    observationTransientRecoveries: before.transientReadRecoveries + after.transientReadRecoveries
  };
}

function checkById(artifact, id) {
  return Array.isArray(artifact?.checks)
    ? artifact.checks.find((check) => check?.id === id)
    : undefined;
}

export function validateSenaLocalPerformanceBuildMeasurement(artifact, measurement) {
  if (!measurement.productionBuildPresent || !measurement.observationStable) {
    return "performance-local-build-measurement-unavailable";
  }
  const identity = artifact?.buildIdentity;
  const summary = artifact?.summary;
  if (identity?.measuredArtifactSetSha256 !== measurement.measuredArtifactSetSha256 ||
    identity?.measuredArtifactFileCount !== measurement.measuredArtifactFileCount ||
    summary?.totalStaticJsFiles !== measurement.totalStaticJsFiles ||
    summary?.workspaceRouteJsFiles !== measurement.workspaceRouteJsFiles) {
    return "performance-local-build-measurement-mismatch";
  }
  const expectedActuals = [
    ["workspace-html-br", measurement.metrics.workspaceHtml.actualBrotliBytes],
    ["workspace-route-js-br", measurement.metrics.workspaceRouteJs.actualBrotliBytes],
    ["total-static-js-br", measurement.metrics.totalStaticJs.actualBrotliBytes]
  ];
  if (expectedActuals.some(([id, actual]) =>
    typeof actual !== "number" || checkById(artifact, id)?.actualBrotliBytes !== actual
  )) {
    return "performance-local-build-measurement-mismatch";
  }
  return undefined;
}

const buildIdentityKeys = [
  "gitCommit",
  "gitDirty",
  "gitDirtyFileCount",
  "gitStatusSha256",
  "packageLockSha256",
  "sourceTreeSha256",
  "sourceFileListSha256",
  "sourceFileCount",
  "sourceReadErrorCount",
  "sourceReadErrorSha256",
  "buildInputSha256",
  "buildId"
];

function sameBuildInputIdentity(left, right) {
  return buildIdentityKeys.every((key) => left[key] === right[key]);
}

export function senaBuildIdIsRegularFile(root, options = {}) {
  const lstat = options.lstat ?? lstatSync;
  try {
    const stats = lstat(path.join(root, ".next", "BUILD_ID"));
    return !stats.isSymbolicLink() && stats.isFile();
  } catch {
    return false;
  }
}

function readBuildId(root, readFile, lstat) {
  if (!senaBuildIdIsRegularFile(root, { lstat })) return undefined;
  try {
    return readFile(path.join(root, ".next", "BUILD_ID"));
  } catch {
    return undefined;
  }
}

/**
 * Observe the local source identity, BUILD_ID, and performance output as one
 * bracketed evidence set. The output measurement itself derives its digest
 * and all Brotli totals from the same buffers.
 */
export function observeSenaLocalPerformanceBuildEvidence(root = process.cwd(), options = {}) {
  const readFile = options.readFile ?? readFileSync;
  const lstat = options.lstat ?? lstatSync;
  const identityBefore = collectSenaBuildInputIdentity(root);
  const buildIdBefore = readBuildId(root, readFile, lstat);
  const measurement = measureSenaPerformanceBuildOutput(root, options);
  const buildIdAfter = readBuildId(root, readFile, lstat);
  const identityAfter = collectSenaBuildInputIdentity(root);
  const buildIdObservationStable = buildIdBefore !== undefined &&
    buildIdAfter !== undefined &&
    sha256(buildIdBefore) === sha256(buildIdAfter);
  const identityObservationStable = sameBuildInputIdentity(identityBefore, identityAfter);
  const buildId = buildIdBefore?.toString("utf8").trim();
  const parsedBuildId = parseSenaNextBuildId(buildId);

  return {
    measurement,
    observationStable: buildIdObservationStable && identityObservationStable,
    buildIdAvailable: buildIdBefore !== undefined && buildIdAfter !== undefined,
    nextBuildIdSha256: buildIdBefore === undefined ? "missing" : sha256(buildIdBefore),
    nextBuildIdGenerator: parsedBuildId.generator,
    nextBuildMatchesCurrentSource: parsedBuildId.generator === SENA_NEXT_BUILD_ID_GENERATOR &&
      parsedBuildId.buildInputSha256 === identityAfter.buildInputSha256,
    currentBuildInputIdentity: identityAfter
  };
}

export function validateSenaLocalPerformanceBuildEvidence(artifact, localEvidence) {
  if (!localEvidence.buildIdAvailable || !localEvidence.observationStable) {
    return "performance-local-build-identity-unavailable";
  }
  const identity = artifact?.buildIdentity;
  const current = localEvidence.currentBuildInputIdentity;
  if (!identity ||
    localEvidence.nextBuildIdGenerator !== SENA_NEXT_BUILD_ID_GENERATOR ||
    localEvidence.nextBuildMatchesCurrentSource !== true ||
    identity.nextBuildIdSha256 !== localEvidence.nextBuildIdSha256 ||
    identity.nextBuildIdGenerator !== localEvidence.nextBuildIdGenerator ||
    identity.nextBuildMatchesCurrentSource !== true ||
    identity.buildInputSha256 !== current.buildInputSha256 ||
    identity.currentExpectedBuildInputSha256 !== current.buildInputSha256 ||
    identity.gitCommit !== current.gitCommit ||
    identity.gitDirty !== current.gitDirty ||
    identity.gitDirtyFileCount !== current.gitDirtyFileCount ||
    identity.gitStatusSha256 !== current.gitStatusSha256 ||
    identity.packageLockSha256 !== current.packageLockSha256 ||
    identity.sourceTreeSha256 !== current.sourceTreeSha256 ||
    identity.sourceFileListSha256 !== current.sourceFileListSha256 ||
    identity.sourceFileCount !== current.sourceFileCount ||
    identity.sourceReadErrorCount !== current.sourceReadErrorCount ||
    identity.sourceReadErrorSha256 !== current.sourceReadErrorSha256) {
    return "performance-local-build-identity-mismatch";
  }
  return validateSenaLocalPerformanceBuildMeasurement(artifact, localEvidence.measurement);
}
