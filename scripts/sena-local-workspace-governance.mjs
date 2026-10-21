import { createHash } from "node:crypto";
import {
  existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";

export const LOCAL_WORKSPACE_PATH = "coordination/repo-governance/local-workspace.json";
export const LOCAL_WORKSPACE_SCHEMA = "sena-local-workspace/v1";
const LEGACY_REGISTRY = "coordination/repo-governance/active-work.json";
const VERIFIER_FILES = [
  ".githooks/pre-commit", ".githooks/pre-push",
  "scripts/verify-sena-repo-governance.mjs",
  "scripts/sena-local-workspace-governance.mjs"
];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (rule) => { throw new Error(`rule=local-workspace-${rule}`); };
const requireFact = (condition, rule) => { if (!condition) fail(rule); };
function validAllowedPaths(paths) {
  return Array.isArray(paths) && paths.length > 0 && new Set(paths).size === paths.length &&
    paths.every(path => typeof path === "string" && path &&
      !isAbsolute(path) && !path.split("/").includes("..") && !/[*?\\]/.test(path) &&
      path !== LEGACY_REGISTRY && path !== ".git" && !path.startsWith(".git/"));
}
const canonical = (path) => {
  requireFact(typeof path === "string" && isAbsolute(path) && resolve(path) === path, "path-invalid");
  requireFact(realpathSync(path) === path && !lstatSync(path).isSymbolicLink(), "path-not-physical");
  return path;
};

function git(root, args, allowFailure = false) {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
  for (const key of Object.keys(env)) {
    if (key.startsWith("GIT_") && key !== "GIT_OPTIONAL_LOCKS") delete env[key];
  }
  Object.assign(env, {
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_PAGER: "cat",
    GIT_NO_LAZY_FETCH: "1"
  });
  const result = spawnSync("git", ["--no-replace-objects", "-C", root, ...args], {
    env, encoding: null, maxBuffer: 256 * 1024 * 1024
  });
  if (!allowFailure && result.status !== 0) fail("git-command-failed");
  return result;
}
const text = (root, args) => git(root, args).stdout.toString().trim();
const bytes = (root, args) => git(root, args).stdout;
const jsonBytes = (value) => Buffer.from(JSON.stringify(value));

export function mapHistoricalWorkspacePath(path, oldRoot, newRoot) {
  if (path === oldRoot) return newRoot;
  return path.startsWith(`${oldRoot}/`) ? `${newRoot}${path.slice(oldRoot.length)}` : path;
}

function worktrees(root) {
  return text(root, ["worktree", "list", "--porcelain"]).split("\n\n").map(block => {
    const values = Object.fromEntries(block.split("\n").map(line => {
      const split = line.indexOf(" ");
      return split < 0 ? [line, true] : [line.slice(0, split), line.slice(split + 1)];
    }));
    return { path: values.worktree, head: values.HEAD, branch: values.branch ?? null };
  });
}

// Hash bytes without logging source or credential-bearing contents. A porcelain
// status alone would miss one dirty value being replaced with another.
function dirtyFingerprint(root) {
  const status = bytes(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const untracked = bytes(root, ["ls-files", "--others", "--exclude-standard", "-z"])
    .toString().split("\0").filter(Boolean).sort();
  const files = untracked.map(path => {
    const full = join(root, path);
    const stat = lstatSync(full);
    return [path, stat.mode, stat.isSymbolicLink()
      ? sha(Buffer.from(readlinkSync(full))) : sha(readFileSync(full))];
  });
  return sha(jsonBytes({
    status: sha(status),
    index: sha(bytes(root, ["ls-files", "--stage", "-z"])),
    staged: sha(bytes(root, ["diff", "--cached", "--binary", "--no-ext-diff", "--no-textconv"])),
    unstaged: sha(bytes(root, ["diff", "--binary", "--no-ext-diff", "--no-textconv"])),
    untracked: files
  }));
}

function orphanFingerprint(root) {
  canonical(root);
  const generated = new Set(["node_modules", ".next", "dist", "build", "coverage", ".git", ".cache", ".venv"]);
  const records = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        if (!generated.has(entry.name) && !entry.name.endsWith("_build")) walk(path);
      } else {
        requireFact(stat.isFile() || stat.isSymbolicLink(), "orphan-file-type");
        records.push([relative(root, path), stat.mode, stat.isSymbolicLink()
          ? sha(Buffer.from(readlinkSync(path))) : sha(readFileSync(path))]);
      }
    }
  };
  walk(root);
  return sha(jsonBytes(records));
}

export function captureLocalPreservation(root, taskBranch, orphanPaths = []) {
  const refs = text(root, ["for-each-ref", "--format=%(refname) %(objectname)"]).split("\n")
    .filter(line => line && !line.startsWith(`refs/heads/${taskBranch} `)).sort();
  const retainedWorktrees = worktrees(root)
    .filter(item => item.branch !== `refs/heads/${taskBranch}`)
    .map(item => ({
      ...item,
      present: existsSync(item.path),
      dirtyFingerprint: existsSync(item.path) ? dirtyFingerprint(item.path) : null
    })).sort((a, b) => a.path.localeCompare(b.path));
  const orphans = orphanPaths.map(path => ({
    path, present: existsSync(path), fingerprint: existsSync(path) ? orphanFingerprint(path) : null
  })).sort((a, b) => a.path.localeCompare(b.path));
  return { refs, worktrees: retainedWorktrees, orphans };
}

function checkPrivateFile(path, expectedHash, expectedSize) {
  canonical(path);
  const stat = lstatSync(path);
  requireFact(stat.isFile() && stat.nlink === 1 && (stat.mode & 0o077) === 0 &&
    stat.uid === process.getuid(), "custody-file-permissions");
  const data = readFileSync(path);
  requireFact(sha(data) === expectedHash, "custody-file-hash");
  if (expectedSize !== undefined) requireFact(data.length === expectedSize, "custody-file-size");
  return data;
}

function checkPackage(root, record) {
  canonical(record.packageRoot);
  requireFact((lstatSync(record.packageRoot).mode & 0o077) === 0, "package-permissions");
  const manifestPath = record.packageManifestPath ?? join(record.packageRoot, "PACKAGE.sha256");
  const manifest = checkPrivateFile(manifestPath, record.packageManifestSha256).toString();
  const members = [];
  for (const line of manifest.trim().split("\n")) {
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/.exec(line);
    requireFact(match && !isAbsolute(match[2]) && !match[2].split("/").includes(".."), "package-manifest");
    const file = join(record.packageRoot, match[2]);
    requireFact(dirname(file) === record.packageRoot, "package-member-path");
    checkPrivateFile(file, match[1]);
    members.push(match[2]);
  }
  const actual = readdirSync(record.packageRoot).sort();
  requireFact(isDeepStrictEqual(actual, [...members, "PACKAGE.sha256"].sort()), "package-file-set");
  if (record.expectedFiles) requireFact(isDeepStrictEqual(actual, [...record.expectedFiles].sort()), "package-expected-files");
  if (record.bundlePath) {
    checkPrivateFile(record.bundlePath, record.bundleSha256, record.bundleSizeBytes);
    requireFact(git(root, ["bundle", "verify", record.bundlePath], true).status === 0, "package-bundle");
  }
}

function checkDurableCustody(root, historical) {
  const rescue = historical.rescue;
  requireFact(rescue && rescue.remotePushAllowed === false, "rescue-source-missing");
  const refs = text(root, ["for-each-ref", "--format=%(refname) %(objectname)", rescue.namespace])
    .split("\n").filter(Boolean).sort();
  requireFact(refs.length === rescue.expectedRefCount &&
    sha(Buffer.from(refs.length ? `${refs.join("\n")}\n` : "")) === rescue.refListSha256, "rescue-refs");
  const prohibited = historical.incident?.credentialExposure?.blobSha;
  if (prohibited && refs.length) {
    const reachable = text(root, ["rev-list", "--objects", ...refs.map(line => line.split(" ")[0])]);
    requireFact(!reachable.split("\n").some(line => line.split(" ")[0] === prohibited), "rescue-prohibited-blob");
  }
  checkPrivateFile(rescue.bundlePath, rescue.bundleSha256);
  requireFact(git(root, ["bundle", "verify", rescue.bundlePath], true).status === 0, "rescue-bundle");
  checkPrivateFile(rescue.orphanInventory.path, rescue.orphanInventory.sha256);
  for (const copy of rescue.diskOnlySourceCopies) {
    const data = checkPrivateFile(copy.path, copy.sha256, copy.size);
    const blob = createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");
    requireFact(blob === copy.gitBlob, "rescued-source-blob");
  }
  const reconstruction = historical.jHEvidenceCustodyReconstruction;
  if (reconstruction) {
    checkPackage(root, reconstruction.newPackage);
    checkPackage(root, reconstruction.supersededAttempt);
  }
}

function nativeContext(root, controlRoot) {
  canonical(root);
  canonical(controlRoot);
  const common = canonical(text(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  const gitDir = canonical(text(root, ["rev-parse", "--absolute-git-dir"]));
  const index = text(root, ["rev-parse", "--path-format=absolute", "--git-path", "index"]);
  requireFact(common === join(controlRoot, ".git") && root !== controlRoot &&
    gitDir.startsWith(`${common}/worktrees/`) && index === join(gitDir, "index"), "native-context");
  canonical(index);
  requireFact(lstatSync(index).isFile() && lstatSync(index).nlink === 1, "native-index");
  canonical(join(root, ".git"));
  requireFact(readFileSync(join(root, ".git"), "utf8").trim() === `gitdir: ${gitDir}` &&
    canonical(resolve(gitDir, readFileSync(join(gitDir, "commondir"), "utf8").trim())) === common &&
    canonical(readFileSync(join(gitDir, "gitdir"), "utf8").trim()) === join(root, ".git"),
  "reciprocal-git-markers");
  if (process.env.GIT_INDEX_FILE) {
    requireFact(resolve(process.cwd(), process.env.GIT_INDEX_FILE) === index, "alternate-index");
  }
  const branch = text(root, ["symbolic-ref", "--short", "HEAD"]);
  requireFact(branch !== "main" && branch.startsWith("codex/"), "branch");
  const head = text(root, ["rev-parse", "HEAD"]);
  const registered = worktrees(root).filter(item => item.path === root);
  requireFact(registered.length === 1 && registered[0].branch === `refs/heads/${branch}` &&
    registered[0].head === head, "worktree-registration");
  requireFact(text(root, ["config", "--get", "core.hooksPath"]) === ".githooks", "hooks-path");
  return { root, common, gitDir, index, branch, head };
}

function candidateIdentity(root, controlRoot, overlayBytes) {
  const context = nativeContext(root, controlRoot);
  return {
    worktree: context.root, commonGitDirectory: context.common, branch: context.branch,
    head: context.head, indexTree: text(root, ["write-tree"]), registrySha256: sha(overlayBytes)
  };
}

export function localCandidateIdentity(root, controlRoot) {
  return candidateIdentity(root, controlRoot, bytes(root, ["show", `:${LOCAL_WORKSPACE_PATH}`]));
}

function checkExecutingCode(root, sourceCommit) {
  requireFact(bytes(root, ["diff", "--name-only", "--no-renames"]).length === 0, "unstaged-tracked-changes");
  for (const path of VERIFIER_FILES) {
    canonical(join(root, path));
    requireFact(sha(readFileSync(join(root, path))) === sha(bytes(root, ["show", `:${path}`])),
      "executing-code-not-staged");
    if (path.startsWith(".githooks/")) {
      requireFact(sha(readFileSync(join(root, path))) ===
        sha(bytes(root, ["show", `${sourceCommit}:${path}`])) &&
        (lstatSync(join(root, path)).mode & 0o111) !== 0, "hook-identity");
    }
  }
}

function receiptFor(root, context, registry, kind = "commit") {
  requireFact(/^[A-Za-z0-9_-]{1,100}$/.test(registry.task.taskId), "task-id");
  const receiptDirectory = join(context.common, "sena-local-authorizations");
  canonical(receiptDirectory);
  const directoryStat = lstatSync(receiptDirectory);
  requireFact(directoryStat.isDirectory() && directoryStat.uid === process.getuid() &&
    (directoryStat.mode & 0o077) === 0, "authorization-directory");
  const receiptPath = join(receiptDirectory, `${registry.task.taskId}${kind === "push" ? ".push" : ""}.json`);
  canonical(receiptPath);
  const stat = lstatSync(receiptPath);
  requireFact(stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid() &&
    (stat.mode & 0o777) === 0o600, "authorization-file");
  const raw = readFileSync(receiptPath);
  const receipt = JSON.parse(raw);
  requireFact(isDeepStrictEqual(Object.keys(receipt).sort(),
    ["schemaVersion", "taskId", "ownerKey", "authorization", "createdAt", "expiresAt", "candidate",
      ...(kind === "push" ? ["remote"] : [])].sort()),
  "authorization-fields");
  requireFact(receipt.schemaVersion === `sena-local-${kind}-authorization/v1` &&
    receipt.taskId === registry.task.taskId && receipt.ownerKey === registry.task.ownerKey &&
    isDeepStrictEqual(receipt.authorization, registry.authorization), "authorization-identity");
  const now = Date.now();
  const created = Date.parse(receipt.createdAt);
  const expires = Date.parse(receipt.expiresAt);
  requireFact(created <= now && now < expires && expires - created <= 24 * 60 * 60 * 1000,
    "authorization-expired");
  return { receipt, path: receiptPath, sha256: sha(raw) };
}

export function validateLocalWorkspace({ root, controlRoot, registryBytes, requireStaged = false }) {
  const registry = JSON.parse(registryBytes);
  requireFact(registry.schemaVersion === LOCAL_WORKSPACE_SCHEMA && registry.repo === controlRoot, "registry");
  requireFact(["local-commit-only", "local-commit-and-pr"].includes(registry.scope) &&
    registry.historicalAuthority === "non-authorizing",
    "scope");
  const context = nativeContext(root, controlRoot);
  const task = registry.task;
  requireFact(task && task.worktreePath === root && task.branch === context.branch &&
    task.threadId === registry.authorization?.threadId &&
    typeof task.ownerKey === "string" && task.ownerKey.length > 0 &&
    task.disposition === "active" && typeof task.noPrReason === "string" && task.noPrReason.length > 0,
  "task-identity");
  requireFact(registry.authorization.operations.join(",") ===
    (registry.scope === "local-commit-and-pr" ? "commit,push,pr" : "relocate,register,branch,commit") &&
    typeof registry.authorization.userInstruction === "string" &&
    registry.authorization.userInstruction.length > 0, "authorization-scope");
  const source = registry.historicalSource;
  const commitBase = task.commitBaseSha ?? source?.commit;
  requireFact(/^[a-f0-9]{40}$/.test(source?.commit) && source.registryPath === LEGACY_REGISTRY &&
    task.baseSha === source.commit && /^[a-f0-9]{40}$/.test(commitBase), "historical-source");
  requireFact(git(root, ["merge-base", "--is-ancestor", source.commit, commitBase], true).status === 0,
    "commit-base-ancestry");
  requireFact(text(root, ["rev-parse", `${source.commit}^{tree}`]) === source.tree &&
    text(root, ["rev-parse", `${source.commit}:${LEGACY_REGISTRY}`]) === source.registryBlob,
  "historical-source-identity");
  const historicalBytes = bytes(root, ["show", `${source.commit}:${LEGACY_REGISTRY}`]);
  requireFact(sha(historicalBytes) === source.registrySha256, "historical-registry-hash");
  const historical = JSON.parse(historicalBytes);
  requireFact(historical.repo === source.repo && source.repo !== registry.repo, "historical-root");
  requireFact(isDeepStrictEqual(registry.pathMapping, { from: source.repo, to: registry.repo }), "path-mapping");
  requireFact(sha(bytes(root, ["show", `:${LEGACY_REGISTRY}`])) === source.registrySha256 &&
    sha(readFileSync(join(root, LEGACY_REGISTRY))) === source.registrySha256, "historical-registry-mutated");
  requireFact(text(root, ["remote", "get-url", "origin"]) === "https://github.com/HUDongpin/SENA.git",
    "remote-identity");
  requireFact(git(root, ["merge-base", "--is-ancestor", source.commit, context.head], true).status === 0,
    "base-ancestry");
  requireFact(validAllowedPaths(task.allowedPaths), "allowed-paths");
  const changedSinceBase = changedHistoryPaths(root, source.commit, context.head);
  requireFact(changedSinceBase.every(path => task.allowedPaths.includes(path)), "committed-path-scope");
  requireFact(bytes(root, ["ls-files", "--unmerged"]).length === 0, "unmerged-index");
  checkExecutingCode(root, source.commit);
  const initialCandidate = candidateIdentity(root, controlRoot, registryBytes);
  const authorization = receiptFor(root, context, registry);
  if (requireStaged) {
    requireFact(context.head === commitBase, "single-commit-base");
    requireFact(isDeepStrictEqual(authorization.receipt.candidate, initialCandidate), "candidate-not-authorized");
    const stagedPaths = text(root, ["diff", "--cached", "--name-only", "--no-renames"]).split("\n").filter(Boolean);
    requireFact(stagedPaths.length > 0 && stagedPaths.every(path => task.allowedPaths.includes(path)),
      "staged-path-scope");
  } else {
    // Read-only post-commit inspection may observe the one authorized tree as HEAD.
    requireFact(authorization.receipt.candidate.commonGitDirectory === context.common &&
      authorization.receipt.candidate.worktree === root &&
      authorization.receipt.candidate.branch === context.branch &&
      authorization.receipt.candidate.registrySha256 === sha(registryBytes) &&
      (isDeepStrictEqual(authorization.receipt.candidate, initialCandidate) ||
        (initialCandidate.indexTree === authorization.receipt.candidate.indexTree &&
          text(root, ["rev-parse", "HEAD^{tree}"]) === authorization.receipt.candidate.indexTree &&
          text(root, ["rev-list", "--parents", "-n", "1", "HEAD"]) ===
            `${context.head} ${authorization.receipt.candidate.head}` &&
          authorization.receipt.candidate.head === commitBase)),
    "inspection-not-authorized");
  }
  checkDurableCustody(root, historical);
  const orphanPaths = (historical.orphanWorktrees ?? []).map(item =>
    mapHistoricalWorkspacePath(item.path, source.repo, registry.repo));
  const preservation = captureLocalPreservation(root, task.branch, orphanPaths);
  const ownRemoteRef = `refs/remotes/origin/${task.branch} ${context.head}`;
  if (registry.scope === "local-commit-and-pr" && preservation.refs.includes(ownRemoteRef) &&
      !registry.preservation.refs.includes(ownRemoteRef)) {
    const pushAuthorization = receiptFor(root, context, registry, "push");
    requireFact(isDeepStrictEqual(pushAuthorization.receipt.candidate, initialCandidate) &&
      pushAuthorization.receipt.remote?.ref === `refs/heads/${task.branch}` &&
      pushAuthorization.receipt.remote?.name === "origin" &&
      pushAuthorization.receipt.remote?.url === "https://github.com/HUDongpin/SENA.git",
    "published-ref-not-authorized");
    preservation.refs = preservation.refs.filter(line => line !== ownRemoteRef);
  }
  requireFact(isDeepStrictEqual(preservation, registry.preservation),
    "preservation-changed");
  // Resample after slow bundle/file checks. Equal filenames do not imply equal bytes.
  requireFact(isDeepStrictEqual(initialCandidate,
    candidateIdentity(root, controlRoot, bytes(root, ["show", `:${LOCAL_WORKSPACE_PATH}`]))) &&
    receiptFor(root, context, registry).sha256 === authorization.sha256, "final-observation-changed");
  checkExecutingCode(root, source.commit);
  return {
    schemaVersion: LOCAL_WORKSPACE_SCHEMA,
    taskId: task.taskId,
    localCommitAuthorized: requireStaged,
    durableCustody: "verified",
    historicalLiveCustody: "not-recertified",
    remoteOperationsAuthorized: false
  };
}

function changedHistoryPaths(root, base, head) {
  const commits = text(root, ["rev-list", `${base}..${head}`]).split("\n").filter(Boolean);
  const paths = new Set();
  for (const commit of commits) {
    requireFact(text(root, ["rev-list", "--parents", "-n", "1", commit]).split(" ").length === 2,
      "nonlinear-task-history");
    for (const path of text(root, ["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", commit])
      .split("\n").filter(Boolean)) paths.add(path);
  }
  return [...paths];
}

export function validateLocalPush({ root, controlRoot, updatesText, remoteName, remoteLocation }) {
  const context = nativeContext(root, controlRoot);
  const registryBytes = bytes(root, ["show", `HEAD:${LOCAL_WORKSPACE_PATH}`]);
  const registry = JSON.parse(registryBytes);
  requireFact(registry.scope === "local-commit-and-pr", "remote-operation-denied");
  const authorization = receiptFor(root, context, registry, "push");
  const candidate = candidateIdentity(root, controlRoot, registryBytes);
  const remote = authorization.receipt.remote;
  const ref = `refs/heads/${registry.task.branch}`;
  requireFact(remoteName === "origin" && remoteLocation === "https://github.com/HUDongpin/SENA.git" &&
    isDeepStrictEqual(Object.keys(remote).sort(), ["name", "url", "ref", "expectedOldSha"].sort()) &&
    remote.name === remoteName && remote.url === remoteLocation && remote.ref === ref &&
    /^[a-f0-9]{40}$/.test(remote.expectedOldSha), "push-remote-identity");
  requireFact(isDeepStrictEqual(authorization.receipt.candidate, candidate) &&
    candidate.indexTree === text(root, ["rev-parse", "HEAD^{tree}"]) &&
    bytes(root, ["status", "--porcelain=v1"]).length === 0, "push-candidate");
  const lines = (updatesText ?? `${ref} ${context.head} ${ref} ${remote.expectedOldSha}`)
    .trim().split("\n");
  requireFact(lines.length === 1, "push-update-count");
  const update = lines[0].trim().split(/\s+/);
  requireFact(isDeepStrictEqual(update, [ref, context.head, ref, remote.expectedOldSha]), "push-update");
  if (remote.expectedOldSha !== "0".repeat(40)) {
    requireFact(git(root, ["merge-base", "--is-ancestor", remote.expectedOldSha, context.head], true).status === 0,
      "push-not-fast-forward");
  }
  validateLocalWorkspace({ root, controlRoot, registryBytes });
  const live = text(root, ["ls-remote", "--refs", remote.url, ref]);
  requireFact(live === (remote.expectedOldSha === "0".repeat(40) ? "" : `${remote.expectedOldSha}\t${ref}`),
    "push-remote-changed");
  requireFact(isDeepStrictEqual(candidate, candidateIdentity(root, controlRoot,
    bytes(root, ["show", `HEAD:${LOCAL_WORKSPACE_PATH}`]))) &&
    receiptFor(root, context, registry, "push").sha256 === authorization.sha256 &&
    bytes(root, ["status", "--porcelain=v1"]).length === 0,
  "push-final-observation-changed");
  checkExecutingCode(root, registry.historicalSource.commit);
  return { taskId: registry.task.taskId, head: context.head, ref, expectedOldSha: remote.expectedOldSha };
}

// CI verifies committed provenance only. It neither loads private host receipts
// nor enables any native write/push command.
export function isHistoricalLocalMainEvent({ root, event, environment = process.env }) {
  if (environment.GITHUB_EVENT_NAME !== "push" || environment.GITHUB_REF !== "refs/heads/main") return false;
  requireFact(environment.GITHUB_ACTIONS === "true" &&
    environment.GITHUB_REPOSITORY === "HUDongpin/SENA" &&
    event.repository?.full_name === "HUDongpin/SENA" && event.ref === "refs/heads/main" &&
    event.forced === false && event.deleted === false &&
    /^[a-f0-9]{40}$/.test(event.before) && event.before !== "0".repeat(40) &&
    /^[a-f0-9]{40}$/.test(event.after) &&
    environment.GITHUB_SHA === event.after && text(root, ["rev-parse", "HEAD"]) === event.after,
  "ci-main-event");
  requireFact(git(root, ["merge-base", "--is-ancestor", event.before, event.after], true).status === 0,
    "ci-main-ancestry");
  const registry = JSON.parse(bytes(root, ["show", `${event.after}:${LOCAL_WORKSPACE_PATH}`]));
  const source = registry.historicalSource;
  requireFact(registry.schemaVersion === LOCAL_WORKSPACE_SCHEMA &&
    registry.historicalAuthority === "non-authorizing" &&
    /^[a-f0-9]{40}$/.test(source?.commit) && source.registryPath === LEGACY_REGISTRY &&
    git(root, ["merge-base", "--is-ancestor", source.commit, event.after], true).status === 0 &&
    text(root, ["rev-parse", `${source.commit}^{tree}`]) === source.tree &&
    text(root, ["rev-parse", `${source.commit}:${LEGACY_REGISTRY}`]) === source.registryBlob &&
    sha(bytes(root, ["show", `${source.commit}:${LEGACY_REGISTRY}`])) === source.registrySha256,
  "ci-main-historical-source");
  return true;
}

const isSha40 = (value) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const ZERO_SHA = "0".repeat(40);

function gitSucceeded(root, args) {
  const result = git(root, args, true);
  return result.status === 0 ? result.stdout.toString() : null;
}

function nonemptyLines(text) {
  return text.split("\n").some(line => line.length > 0);
}

export function localWorkspaceHistoryTouches(root, from, to) {
  if (!isSha40(from) || !isSha40(to)) return true;
  const finalDiff = gitSucceeded(root, ["diff", "--name-only", "--no-renames", from, to, "--", LOCAL_WORKSPACE_PATH]);
  if (finalDiff === null || nonemptyLines(finalDiff)) return true;
  // --full-history keeps an edit that a later merge makes treesame to its parent.
  const history = gitSucceeded(root, [
    "log", "--full-history", "--name-only", "--pretty=format:", "--no-renames",
    `${from}..${to}`, "--", LOCAL_WORKSPACE_PATH
  ]);
  if (history === null) return true;
  return nonemptyLines(history);
}

function integratedMainBase(root, head) {
  const candidates = [];
  for (const ref of ["refs/heads/main", "refs/remotes/origin/main"]) {
    const sha = gitSucceeded(root, ["rev-parse", "--verify", ref]);
    if (!sha || !isSha40(sha.trim())) continue;
    if (gitSucceeded(root, ["merge-base", "--is-ancestor", sha.trim(), head]) === null) continue;
    candidates.push(sha.trim());
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((newest, sha) => (
    gitSucceeded(root, ["merge-base", "--is-ancestor", newest, sha]) !== null ? sha : newest
  ));
}

export function registeredLocalWorkspaceCheckout(root) {
  const shown = git(root, ["show", `HEAD:${LOCAL_WORKSPACE_PATH}`], true);
  if (shown.status !== 0) return false;
  let registry;
  try {
    registry = JSON.parse(shown.stdout.toString());
  } catch {
    return true;
  }
  const taskPath = registry?.task?.worktreePath;
  if (typeof taskPath !== "string" || taskPath.length === 0) return true;
  let physicalRoot;
  try {
    physicalRoot = realpathSync(root);
  } catch {
    return true;
  }
  let physicalTask;
  try {
    physicalTask = realpathSync(taskPath);
  } catch {
    return false;
  }
  return physicalRoot === physicalTask;
}

function worktreePathTouches(root, args) {
  const listed = gitSucceeded(root, args);
  if (listed === null) return true;
  return nonemptyLines(listed);
}

function updateTips(updatesText) {
  const tips = [];
  for (const line of updatesText.trim().split("\n").filter(line => line.length > 0)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) return null;
    const localSha = parts[1];
    if (localSha === ZERO_SHA) continue;
    if (!isSha40(localSha)) return null;
    tips.push(localSha);
  }
  return tips;
}

function tipChangesEntry(root, tip) {
  const base = integratedMainBase(root, tip);
  if (base === null) return true;
  return localWorkspaceHistoryTouches(root, base, tip);
}

export function localWorkspaceReviewRequiresTaskGate({ root }) {
  if (registeredLocalWorkspaceCheckout(root)) return true;
  if (worktreePathTouches(root, ["diff", "--cached", "--name-only", "--no-renames", "--", LOCAL_WORKSPACE_PATH]) ||
      worktreePathTouches(root, ["diff", "--name-only", "--no-renames", "--", LOCAL_WORKSPACE_PATH]) ||
      worktreePathTouches(root, ["ls-files", "--others", "--exclude-standard", "--", LOCAL_WORKSPACE_PATH])) {
    return true;
  }
  const head = gitSucceeded(root, ["rev-parse", "HEAD"]);
  if (head === null || !isSha40(head.trim())) return true;
  return tipChangesEntry(root, head.trim());
}

export function localWorkspacePushRequiresTaskGate({ root, head, updatesText }) {
  if (registeredLocalWorkspaceCheckout(root)) return true;
  const tips = typeof updatesText === "string" ? updateTips(updatesText) : [];
  if (tips === null) return true;
  if (tips.length === 0) {
    if (!isSha40(head)) return true;
    tips.push(head);
  }
  return tips.some(tip => tipChangesEntry(root, tip));
}

export function isHistoricalUntouchedLocalWorkspaceEvent({ root, event, environment = process.env }) {
  if (environment.GITHUB_ACTIONS !== "true") return false;
  if (environment.GITHUB_REPOSITORY !== "HUDongpin/SENA") return false;
  if (event?.repository?.full_name !== "HUDongpin/SENA") return false;
  const checkout = gitSucceeded(root, ["rev-parse", "HEAD"]);
  if (checkout === null || environment.GITHUB_SHA !== checkout.trim()) return false;
  const kind = environment.GITHUB_EVENT_NAME;
  let base;
  let head;
  if (kind === "pull_request") {
    const pullRequest = event.pull_request;
    if (pullRequest?.base?.repo?.full_name !== "HUDongpin/SENA") return false;
    if (pullRequest?.head?.repo?.full_name !== "HUDongpin/SENA") return false;
    if (pullRequest?.base?.ref !== "main") return false;
    base = pullRequest.base?.sha;
    head = pullRequest.head?.sha;
    if (!isSha40(base) || !isSha40(head)) return false;
    const ref = `refs/heads/${pullRequest.head?.ref}`;
    if (environment.GITHUB_REF !== `refs/pull/${event.number}/merge` && environment.GITHUB_REF !== ref) {
      return false;
    }
    const parents = gitSucceeded(root, ["rev-list", "--parents", "-n", "1", checkout.trim()]);
    if (parents === null) return false;
    if (checkout.trim() !== head && parents.trim() !== `${checkout.trim()} ${base} ${head}`) return false;
  } else if (kind === "push") {
    if (environment.GITHUB_REF === "refs/heads/main" || event?.ref === "refs/heads/main") return false;
    if (event?.forced !== false || event?.deleted !== false) return false;
    if (event?.ref !== environment.GITHUB_REF) return false;
    head = event.after;
    if (!isSha40(head) || checkout.trim() !== head) return false;
    base = integratedMainBase(root, head);
    if (base === null) return false;
  } else {
    return false;
  }
  if (gitSucceeded(root, ["cat-file", "-e", `${base}^{commit}`]) === null) return false;
  if (gitSucceeded(root, ["cat-file", "-e", `${head}^{commit}`]) === null) return false;
  const mergeBase = gitSucceeded(root, ["merge-base", base, head]);
  if (mergeBase === null) return false;
  return !localWorkspaceHistoryTouches(root, mergeBase.trim(), head);
}

export function validatePortableLocalWorkspace({ root, event, environment = process.env }) {
  requireFact(environment.GITHUB_ACTIONS === "true" &&
    environment.GITHUB_REPOSITORY === "HUDongpin/SENA" &&
    event.repository?.full_name === "HUDongpin/SENA", "ci-repository");
  const kind = environment.GITHUB_EVENT_NAME;
  let head, ref, before;
  const checkout = text(root, ["rev-parse", "HEAD"]);
  requireFact(environment.GITHUB_SHA === checkout, "ci-checkout");
  if (kind === "push") {
    ({ after: head, ref, before } = event);
    requireFact(event.deleted === false && event.forced === false &&
      environment.GITHUB_REF === ref && checkout === head, "ci-push-event");
  } else {
    requireFact(kind === "pull_request" && event.pull_request?.base?.repo?.full_name === "HUDongpin/SENA" &&
      event.pull_request?.head?.repo?.full_name === "HUDongpin/SENA" &&
      event.pull_request.base.ref === "main", "ci-pr-event");
    head = event.pull_request.head.sha;
    before = event.pull_request.base.sha;
    ref = `refs/heads/${event.pull_request.head.ref}`;
    requireFact(environment.GITHUB_REF === `refs/pull/${event.number}/merge` ||
      environment.GITHUB_REF === ref, "ci-pr-ref");
    requireFact(checkout === head ||
      text(root, ["rev-list", "--parents", "-n", "1", checkout]) === `${checkout} ${before} ${head}`,
    "ci-pr-checkout");
  }
  requireFact(/^[a-f0-9]{40}$/.test(head) && /^[a-f0-9]{40}$/.test(before), "ci-event-sha");
  const registry = JSON.parse(bytes(root, ["show", `${head}:${LOCAL_WORKSPACE_PATH}`]));
  requireFact(registry.schemaVersion === LOCAL_WORKSPACE_SCHEMA && registry.scope === "local-commit-and-pr" &&
    registry.historicalAuthority === "non-authorizing" &&
    registry.authorization?.operations?.join(",") === "commit,push,pr" &&
    registry.authorization.threadId === registry.task.threadId &&
    registry.task.branch.startsWith("codex/") && ref === `refs/heads/${registry.task.branch}`, "ci-task");
  const source = registry.historicalSource;
  requireFact(validAllowedPaths(registry.task.allowedPaths), "ci-allowed-paths");
  requireFact(/^[a-f0-9]{40}$/.test(source.commit) && source.registryPath === LEGACY_REGISTRY &&
    registry.task.baseSha === source.commit, "ci-source");
  requireFact(text(root, ["rev-parse", `${source.commit}^{tree}`]) === source.tree &&
    text(root, ["rev-parse", `${source.commit}:${LEGACY_REGISTRY}`]) === source.registryBlob &&
    sha(bytes(root, ["show", `${source.commit}:${LEGACY_REGISTRY}`])) === source.registrySha256 &&
    sha(bytes(root, ["show", `${head}:${LEGACY_REGISTRY}`])) === source.registrySha256, "ci-source-identity");
  requireFact(git(root, ["merge-base", "--is-ancestor", source.commit, head], true).status === 0 &&
    changedHistoryPaths(root, source.commit, head).every(path => registry.task.allowedPaths.includes(path)),
  "ci-history-scope");
  const commitBase = registry.task.commitBaseSha ?? source.commit;
  requireFact(/^[a-f0-9]{40}$/.test(commitBase) &&
    git(root, ["merge-base", "--is-ancestor", source.commit, commitBase], true).status === 0 &&
    text(root, ["rev-list", "--parents", "-n", "1", head]) === `${head} ${commitBase}`,
  "ci-commit-base");
  if (kind === "push" && before !== "0".repeat(40)) {
    requireFact(git(root, ["merge-base", "--is-ancestor", before, head], true).status === 0, "ci-push-ancestry");
  }
  return {
    head, ref, before, kind, sourceCommit: source.commit, portableProvenance: "verified",
    historicalLiveCustody: "not-recertified", localCommitAuthorized: false, remoteOperationsAuthorized: false
  };
}

export function hasLocalWorkspaceIdentity(root) {
  for (const ref of [":", "HEAD:"]) {
    if (git(root, ["cat-file", "-e", `${ref}${LOCAL_WORKSPACE_PATH}`], true).status === 0) return true;
  }
  return existsSync(join(root, LOCAL_WORKSPACE_PATH));
}
