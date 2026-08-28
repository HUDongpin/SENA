#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_REPO_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const REPO_ROOT = process.env.SENA_GOVERNANCE_TARGET_ROOT
  ? realpathSync(resolve(process.env.SENA_GOVERNANCE_TARGET_ROOT))
  : SCRIPT_REPO_ROOT;
const DEFAULT_REGISTRY = join(SCRIPT_REPO_ROOT, "coordination", "repo-governance", "active-work.json");
const REGISTRY_REPO_PATH = "coordination/repo-governance/active-work.json";
const ZERO_SHA = "0".repeat(40);
const MAX_TEXT_SCAN_BYTES = 64 * 1024 * 1024;
const MAX_ACTIVE_WRITE_WORKTREES = 3;
const MAX_ACTIVE_INTEGRATION_RELEASE_LANES = 1;
const MAX_ACTIVE_FEATURE_LANES = 2;
const ACTIVE_WRITE_DISPOSITIONS = new Set(["active", "ready-for-pr"]);
const REF_DELETION_AUTHORIZATION_STATUSES = new Set(["pending-provider-readback", "active", "consumed"]);
const LOCAL_REF_RETIREMENT_AUTHORIZATION_STATUSES = new Set(["pending-release", "active", "consumed"]);
const LOCAL_REF_RETIREMENT_AUTHORIZATION_ID_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,127}$/;
const EXPECTED_REMOTE_IDENTITY = Object.freeze({
  name: "origin",
  provider: "github.com",
  owner: "HUDongpin",
  repository: "SENA"
});
const EXPECTED_REMOTE_HTTPS_URL = "https://github.com/HUDongpin/SENA.git";
const QUARANTINED_LEDGER_BRANCH_REF = "refs/heads/docs/ledger-reconciliation-2026-08-19";
const QUARANTINED_LEDGER_TIP = "18d542f707e56aa9d043dd497e0efe48b540db20";
const ORDINARY_ARCHIVE_EXCLUDED_REF_NAMESPACES = [
  "refs/heads/*",
  "refs/remotes/*",
  "refs/rescue/*",
  "refs/quarantine/*",
  "HEAD",
  "main-worktree/HEAD",
  "worktrees/*/HEAD"
];
const LOCAL_RETIREMENT_PRODUCTION_ROOT = "/Volumes/Starship/SENA";
const LOCAL_RETIREMENT_DANGEROUS_GIT_ENV = new Set([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_DIR",
  "GIT_INDEX_FILE",
  "GIT_NAMESPACE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
  "GIT_REPLACE_REF_BASE",
  "GIT_WORK_TREE"
]);
const WORK_ITEM_DISPOSITIONS = new Set([
  ...ACTIVE_WRITE_DISPOSITIONS,
  "integrated",
  "security-quarantine",
  "frozen-recovery",
  "preservation-review",
  "archived",
  "cleanup-approved"
]);
const BRANCH_DISPOSITIONS = new Set([
  "active",
  "ready-for-pr",
  "integrated",
  "security-quarantine",
  "frozen-recovery",
  "preservation-review",
  "archived",
  "cleanup-approved"
]);
const ORPHAN_DISPOSITIONS = new Set(["preservation-review", "archived", "cleanup-approved"]);
const LANE_TYPES = new Set(["feature", "integration-release", "security-quarantine", "read-only"]);
const FREEZE_EXCEPTIONS = new Set([
  "governance-preservation",
  "security-containment",
  "exact-sha-verification",
  "sanitized-salvage-review"
]);
const MANUAL_REVIEW_BRANCH_DISPOSITIONS = new Set([
  "integrated",
  "security-quarantine",
  "frozen-recovery",
  "preservation-review",
  "archived",
  "cleanup-approved"
]);

export function monotonicPrTransitionAllowed({
  observationMode,
  recordedState,
  liveState,
  recordedHeadPresent,
  recordedHeadMatches,
  permittedForwardAdvance
}) {
  return Boolean(
    observationMode === "monotonic" &&
      recordedState === "OPEN" &&
      new Set(["CLOSED", "MERGED"]).has(liveState) &&
      (!recordedHeadPresent || recordedHeadMatches || permittedForwardAdvance)
  );
}
const KNOWN_SENSITIVE_BLOB_OIDS = new Set([
  "15a131415d0206782265902b0af612a80e16bae2",
  ...String(process.env.SENA_GOVERNANCE_ADDITIONAL_DENY_BLOB_OIDS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[0-9a-f]{40,64}$/.test(value))
]);

const GENERATED_DIRECTORY_NAMES = new Set([
  ".cache",
  ".next",
  ".playwright-cli",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "output",
  "playwright-report",
  "qa_chatgpt_docx_render"
]);

const SENSITIVE_RUNTIME_DIRECTORY_NAMES = new Set([
  ".sena-enterprise",
  ".vercel"
]);

const CONTENT_RULES = [
  {
    id: "private-key-material",
    pattern: /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/
  },
  {
    id: "github-token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,})\b/
  },
  {
    id: "aws-access-key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/
  },
  {
    id: "google-api-key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/
  },
  {
    id: "openai-api-key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/
  },
  {
    id: "stripe-live-secret",
    pattern: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/
  },
  {
    id: "slack-token",
    pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/
  }
];

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function git(args, options = {}) {
  const gitEnvironment = { ...process.env };
  for (const variable of options.unsetEnv ?? []) delete gitEnvironment[variable];
  const result = spawnSync("git", args, {
    cwd: options.cwd ?? REPO_ROOT,
    encoding: options.binary ? null : "utf8",
    input: options.input,
    maxBuffer: options.maxBuffer ?? 256 * 1024 * 1024,
    env: gitEnvironment
  });
  if (result.error) {
    if (options.allowFailure) return result;
    throw result.error;
  }
  if (result.status !== 0 && !options.allowFailure) {
    const detail = String(result.stderr ?? "").trim();
    throw new Error(`git ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

function gitText(args, options = {}) {
  return String(git(args, options).stdout ?? "");
}

const CONTROL_ROOT = dirname(resolve(gitText(["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim()));

function parseArguments(argv) {
  const [command = "audit", ...rest] = argv;
  const flags = new Map();
  const positional = [];
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = rest[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      const existing = flags.get(key);
      flags.set(key, existing === undefined ? next : [...(Array.isArray(existing) ? existing : [existing]), next]);
      index += 1;
    } else {
      flags.set(key, true);
    }
  }
  return { command, flags, positional };
}

function flagValues(flags, key) {
  const value = flags.get(key);
  if (value === undefined || value === true) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeRepoPath(input) {
  return String(input)
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

export function classifySensitivePath(input) {
  const path = normalizeRepoPath(input);
  const name = basename(path).toLowerCase();

  if (name === "all api keys.docx") return "all-api-keys-docx";
  if (pathContainsSensitiveValue(name)) return "sensitive-value-in-filename";
  if (/^\.env/i.test(name) && name !== ".env.example" && !name.endsWith(".example")) {
    return "non-example-env";
  }
  if (/^(?:id_rsa|id_ed25519|id_ecdsa)$/i.test(name)) return "private-key-filename";
  if (/\.(?:pem|p12|pfx|key)$/i.test(name)) return "private-key-extension";
  if (
    /(?:credential|credentials|secret|secrets|api[-_ ]?keys?)/i.test(name) &&
    /\.(?:docx|xlsx|csv|json|ya?ml|toml|txt|zip|7z|tar|gz)$/i.test(name)
  ) {
    return "credential-export-filename";
  }
  if (
    /(?:^(?:id_rsa|id_ed25519|id_ecdsa)|(?:^|[-_ ])(?:private[-_ ]?keys?|keys?|keyring|keystore)(?:[-_ .]|$))/i.test(name) &&
    /\.(?:zip|7z|tar|tar\.gz|tgz|gz)$/i.test(name)
  ) {
    return "sensitive-key-archive-filename";
  }
  return null;
}

function pathContainsSensitiveValue(path) {
  const text = String(path);
  return CONTENT_RULES.some(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

function safePathForLog(path) {
  const normalized = normalizeRepoPath(path).replace(/[\u0000-\u001f\u007f-\u009f\u001b]/g, "?");
  if (pathContainsSensitiveValue(normalized)) {
    return `<redacted-sensitive-path:${sha256Buffer(Buffer.from(normalized, "utf8")).slice(0, 12)}>`;
  }
  return normalized;
}

function safeSourceForLog(source) {
  const text = String(source ?? "local").replace(/[\u0000-\u001f\u007f-\u009f\u001b]/g, "?");
  if (/^[A-Za-z0-9._/-]{1,80}$/.test(text) && !pathContainsSensitiveValue(text)) return text.slice(0, 12);
  return `redacted-${sha256Buffer(Buffer.from(text, "utf8")).slice(0, 12)}`;
}

function isLikelyBinary(buffer) {
  const sampleLength = Math.min(buffer.length, 8192);
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

export function classifySensitiveContent(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.length > MAX_TEXT_SCAN_BYTES) return ["oversized-unscanned-blob"];
  if (isLikelyBinary(buffer)) return [];
  const text = buffer.toString("utf8");
  return CONTENT_RULES.filter(({ pattern }) => pattern.test(text)).map(({ id }) => id);
}

function addFinding(findings, finding) {
  const key = `${finding.source ?? ""}\u0000${finding.path}\u0000${finding.rule}`;
  if (!findings.some((candidate) => candidate.key === key)) {
    findings.push({ ...finding, key });
  }
}

function parseLsTree(output) {
  if (!output) return [];
  return output
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const tab = record.indexOf("\t");
      const metadata = record.slice(0, tab).split(" ");
      return {
        mode: metadata[0],
        type: metadata[1],
        oid: metadata[2],
        path: record.slice(tab + 1)
      };
    });
}

function treeEntries(ref) {
  return parseLsTree(gitText(["ls-tree", "-r", "-z", ref]));
}

function commitParents(commit) {
  const record = gitText(["rev-list", "--parents", "-n", "1", commit]).trim();
  return record ? record.split(/\s+/).slice(1) : [];
}

function changedPaths(commit) {
  const parents = commitParents(commit);
  const paths = new Set();
  if (parents.length === 0) {
    for (const path of gitText([
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "-z",
      "--root",
      "--no-renames",
      commit
    ]).split("\0")) {
      if (path) paths.add(path);
    }
  } else {
    for (const parent of parents) {
      for (const path of gitText(["diff", "--name-only", "-z", "--no-renames", parent, commit]).split("\0")) {
        if (path) paths.add(path);
      }
    }
  }
  return [...paths];
}

function entryAtCommit(commit, path) {
  const output = gitText(["ls-tree", "-z", commit, "--", `:(literal)${path}`]);
  return parseLsTree(output)[0] ?? null;
}

function blobBuffer(oid) {
  const size = Number(gitText(["cat-file", "-s", oid]).trim());
  if (!Number.isFinite(size) || size < 0) return { buffer: null, blockedReason: "invalid-blob-size" };
  if (size > MAX_TEXT_SCAN_BYTES) return { buffer: null, blockedReason: "oversized-unscanned-blob" };
  return { buffer: git(["cat-file", "blob", oid], { binary: true }).stdout, blockedReason: null };
}

function scanEntry(entry, source, findings, scanned) {
  const pathRule = classifySensitivePath(entry.path);
  if (pathRule) addFinding(findings, { path: entry.path, rule: pathRule, source });
  if (entry.type !== "blob") return;
  if (KNOWN_SENSITIVE_BLOB_OIDS.has(entry.oid.toLowerCase())) {
    addFinding(findings, { path: entry.path, rule: "known-sensitive-blob-oid", source });
  }
  const scanKey = `${entry.oid}\u0000${entry.path}`;
  if (scanned.has(scanKey)) return;
  scanned.add(scanKey);
  const { buffer: content, blockedReason } = blobBuffer(entry.oid);
  if (blockedReason) {
    addFinding(findings, { path: entry.path, rule: blockedReason, source });
    return;
  }
  for (const rule of classifySensitiveContent(content)) {
    addFinding(findings, { path: entry.path, rule, source });
  }
}

function stagedEntries(findings) {
  const paths = gitText(["diff", "--cached", "--name-only", "--diff-filter=ACMRT", "--no-renames", "-z"])
    .split("\0")
    .filter(Boolean);
  const entries = [];
  for (const path of paths) {
    const pathRule = classifySensitivePath(path);
    if (pathRule) addFinding(findings, { path, rule: pathRule, source: "index" });
    const record = gitText(["ls-files", "--stage", "-z", "--", `:(literal)${path}`])
      .split("\0")
      .find(Boolean);
    if (!record) continue;
    const tab = record.indexOf("\t");
    const [mode, oid, stage] = record.slice(0, tab).split(" ");
    if (stage === "0") entries.push({ mode, type: "blob", oid, path: record.slice(tab + 1) });
  }
  return entries;
}

function scanTree(ref, findings, scanned) {
  for (const entry of treeEntries(ref)) scanEntry(entry, ref, findings, scanned);
}

function scanCommits(commits, findings, scanned) {
  for (const commit of commits) {
    for (const path of changedPaths(commit)) {
      const pathRule = classifySensitivePath(path);
      if (pathRule) addFinding(findings, { path, rule: pathRule, source: commit });
      const entry = entryAtCommit(commit, path);
      if (entry) scanEntry(entry, commit, findings, scanned);
    }
  }
}

function revList(args) {
  return gitText(["rev-list", "--reverse", ...args])
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function gitObjectExists(object) {
  return git(["cat-file", "-e", object], { allowFailure: true }).status === 0;
}

function parsePrePushUpdates(input) {
  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) throw new Error("pre-push input is empty; refusing HEAD fallback");
  return lines.map((line) => {
    const fields = line.split(/\s+/);
    if (fields.length !== 4) throw new Error("pre-push input must contain four fields per ref update");
    const [localRef, localSha, remoteRef, remoteSha] = fields;
    return { localRef, localSha, remoteRef, remoteSha };
  });
}

function existingPathResolution(path) {
  try {
    return { ok: true, path: realpathSync(path), errorCode: null };
  } catch (error) {
    const errorCode =
      error && typeof error === "object" && typeof error.code === "string"
        ? error.code
        : "UNKNOWN";
    return { ok: false, path: null, errorCode };
  }
}

function canonicalExistingPath(path) {
  const resolution = existingPathResolution(path);
  return resolution.ok
    ? resolution.path
    : `unresolved:${resolution.errorCode}:${resolve(path)}`;
}

function sameExistingPath(left, right) {
  const leftResolution = existingPathResolution(left);
  const rightResolution = existingPathResolution(right);
  return Boolean(
    leftResolution.ok &&
    rightResolution.ok &&
    leftResolution.path === rightResolution.path
  );
}

function normalizeRemoteIdentity(value) {
  const raw = String(value ?? "").trim();
  if (!raw || /[?#%\\]/.test(raw) || /(?:^|\/)\.{1,2}(?:\/|$)/.test(raw)) return null;

  let provider;
  let owner;
  let repository;

  if (raw.startsWith("https://")) {
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return null;
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.hostname.toLowerCase() !== EXPECTED_REMOTE_IDENTITY.provider ||
      parsed.port ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    let path = parsed.pathname;
    if (path.endsWith("/")) path = path.slice(0, -1);
    const segments = path.split("/");
    if (segments.length !== 3 || segments[0] !== "" || !segments[1] || !segments[2]) return null;
    provider = parsed.hostname.toLowerCase();
    owner = segments[1];
    repository = segments[2];
  } else if (/^git@github\.com:/i.test(raw)) {
    const match = /^git@(github\.com):([^/:]+)\/([^/:]+)$/i.exec(raw);
    if (!match) return null;
    [, provider, owner, repository] = match;
    provider = provider.toLowerCase();
  } else if (raw.startsWith("ssh://")) {
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      return null;
    }
    if (
      parsed.protocol !== "ssh:" ||
      parsed.username !== "git" ||
      parsed.password ||
      parsed.hostname.toLowerCase() !== EXPECTED_REMOTE_IDENTITY.provider ||
      !new Set(["", "22"]).has(parsed.port) ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    let path = parsed.pathname;
    if (path.endsWith("/")) path = path.slice(0, -1);
    const segments = path.split("/");
    if (segments.length !== 3 || segments[0] !== "" || !segments[1] || !segments[2]) return null;
    provider = parsed.hostname.toLowerCase();
    owner = segments[1];
    repository = segments[2];
  } else {
    return null;
  }

  repository = repository.replace(/\.git$/i, "");
  if (!owner || !repository || owner === "." || owner === ".." || repository === "." || repository === "..") {
    return null;
  }
  return { provider, owner, repository };
}

function remoteIdentityMatchesExpected(identity) {
  return Boolean(
    identity &&
      identity.provider.toLowerCase() === EXPECTED_REMOTE_IDENTITY.provider.toLowerCase() &&
      identity.owner.toLowerCase() === EXPECTED_REMOTE_IDENTITY.owner.toLowerCase() &&
      identity.repository.toLowerCase() === EXPECTED_REMOTE_IDENTITY.repository.toLowerCase()
  );
}

function configuredRemoteUrls(remoteName, push) {
  const args = ["remote", "get-url"];
  if (push) args.push("--push");
  args.push("--all", remoteName);
  const result = git(args, { allowFailure: true });
  if (result.status !== 0) return [];
  return String(result.stdout ?? "")
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function addRemoteIdentityFindings(remoteName, remoteLocation, registry, findings) {
  const registryIdentity = registry.policy?.remoteIdentity;
  if (
    !registryIdentity ||
    registryIdentity.name !== EXPECTED_REMOTE_IDENTITY.name ||
    registryIdentity.provider !== EXPECTED_REMOTE_IDENTITY.provider ||
    registryIdentity.owner !== EXPECTED_REMOTE_IDENTITY.owner ||
    registryIdentity.repository !== EXPECTED_REMOTE_IDENTITY.repository
  ) {
    addFinding(findings, {
      path: "remote:origin",
      rule: "registry-remote-identity-mismatch",
      source: "push-policy"
    });
  }
  if (remoteName !== EXPECTED_REMOTE_IDENTITY.name) {
    addFinding(findings, {
      path: "remote:name",
      rule: "non-origin-remote-not-authorized",
      source: "push-policy"
    });
  }
  if (!remoteLocation) {
    addFinding(findings, { path: "remote:location", rule: "remote-location-missing", source: "push-policy" });
  } else if (!remoteIdentityMatchesExpected(normalizeRemoteIdentity(remoteLocation))) {
    addFinding(findings, {
      path: "remote:location",
      rule: "remote-location-identity-mismatch",
      source: "push-policy"
    });
  }

  const fetchUrls = configuredRemoteUrls(EXPECTED_REMOTE_IDENTITY.name, false);
  if (fetchUrls.length !== 1 || fetchUrls.some((url) => !remoteIdentityMatchesExpected(normalizeRemoteIdentity(url)))) {
    addFinding(findings, {
      path: "remote:origin",
      rule: "configured-fetch-remote-identity-mismatch",
      source: "push-policy"
    });
  }
  const pushUrls = configuredRemoteUrls(EXPECTED_REMOTE_IDENTITY.name, true);
  if (pushUrls.length !== 1 || pushUrls.some((url) => !remoteIdentityMatchesExpected(normalizeRemoteIdentity(url)))) {
    addFinding(findings, {
      path: "remote:origin",
      rule: "configured-push-remote-identity-mismatch",
      source: "push-policy"
    });
  }
}

function loadProtectedMainAuthorizationRegistry(
  flags,
  { required = false, localRefRetirementAuthorizationId = null } = {}
) {
  const commits = flagValues(flags, "authorization-registry-commit");
  if (commits.length === 0) {
    if (required) throw new Error("protected-main authorization registry commit is required");
    return null;
  }
  if (commits.length !== 1 || !isSha(commits[0])) {
    throw new Error("protected-main authorization registry requires exactly one commit SHA");
  }
  const trackedMain = git(["rev-parse", "--verify", "refs/remotes/origin/main"], { allowFailure: true });
  const trackedMainSha = trackedMain.status === 0 ? String(trackedMain.stdout).trim() : null;
  if (trackedMainSha !== commits[0]) {
    throw new Error("protected-main authorization registry is not the fetched origin/main commit");
  }
  const loaded = loadRegistryFromCommit(commits[0]);
  if (localRefRetirementAuthorizationId !== null) {
    const requestedAuthorization = (
      loaded.parsed.policy?.localRefRetirementAuthorizations ?? []
    ).find((entry) => entry.id === localRefRetirementAuthorizationId);
    if (!requestedAuthorization) {
      throw new Error("rule=local-ref-retirement-authorization-missing");
    }
    if (requestedAuthorization.status === "pending-release") {
      throw new Error("rule=local-ref-retirement-release-pending");
    }
    if (requestedAuthorization.status === "consumed") {
      throw new Error("rule=local-ref-retirement-authorization-consumed");
    }
    if (
      requestedAuthorization.status === "active" &&
      isIsoTimestamp(requestedAuthorization.expiresAt) &&
      Date.parse(requestedAuthorization.expiresAt) <= Date.now()
    ) {
      throw new Error("rule=local-ref-retirement-authorization-expired");
    }
  }
  const validation = validateRegistry(loaded.parsed);
  if (validation.errors.length > 0) {
    throw new Error("protected-main authorization registry snapshot is invalid");
  }
  return { ...loaded, commit: commits[0] };
}

function addPrePushPolicyFindings(updates, remoteName, remoteLocation, registry, findings) {
  const branchResult = git(["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true });
  const branchName = branchResult.status === 0 ? String(branchResult.stdout).trim() : null;
  const expectedRef = branchName ? `refs/heads/${branchName}` : null;
  const currentItem = (registry.workItems ?? []).find(
    (item) => sameExistingPath(item.worktreePath, REPO_ROOT) && item.branch === branchName
  );
  const branchRecord = (registry.branches ?? []).find((branch) => branch.name === branchName);

  addRemoteIdentityFindings(remoteName, remoteLocation, registry, findings);
  if (!branchName || !currentItem || !branchRecord) {
    addFinding(findings, {
      path: expectedRef ?? "detached-head",
      rule: "outgoing-ref-owner-unregistered",
      source: "push-policy"
    });
  } else {
    if (!ACTIVE_WRITE_DISPOSITIONS.has(currentItem.disposition)) {
      addFinding(findings, { path: expectedRef, rule: "work-item-not-writable", source: currentItem.taskId });
    }
    if (!ACTIVE_WRITE_DISPOSITIONS.has(branchRecord.disposition)) {
      addFinding(findings, { path: expectedRef, rule: "branch-disposition-not-writable", source: branchRecord.disposition });
    }
    if (
      currentItem.disposition !== branchRecord.disposition ||
      currentItem.ownerKey !== branchRecord.ownerKey ||
      currentItem.branch !== branchRecord.name
    ) {
      addFinding(findings, { path: expectedRef, rule: "work-item-branch-ownership-mismatch", source: "push-policy" });
    }
  }

  for (const update of updates) {
    const { localRef, localSha, remoteRef, remoteSha } = update;
    const deletionAuthorization =
      localSha === ZERO_SHA ? activeRefDeletionAuthorization(registry, remoteRef, remoteSha) : null;
    if (localRef !== expectedRef && !deletionAuthorization) {
      addFinding(findings, { path: localRef, rule: "outgoing-local-ref-ownership-mismatch", source: "push-policy" });
    }
    if (remoteRef !== expectedRef && !deletionAuthorization) {
      let rule = "outgoing-remote-ref-ownership-mismatch";
      if (remoteRef === "refs/heads/main") rule = "protected-main-direct-push-not-authorized";
      else if (remoteRef.startsWith("refs/rescue/")) rule = "rescue-ref-remote-push-not-authorized";
      else if (remoteRef.startsWith("refs/tags/")) rule = "tag-ref-mutation-not-authorized";
      else if (remoteRef.startsWith("refs/notes/")) rule = "notes-ref-mutation-not-authorized";
      else if (!remoteRef.startsWith("refs/heads/")) rule = "non-branch-ref-mutation-not-authorized";
      addFinding(findings, { path: remoteRef, rule, source: "push-policy" });
    }
    if (remoteRef === "refs/heads/main") {
      addFinding(findings, { path: remoteRef, rule: "protected-main-direct-push-not-authorized", source: "push-policy" });
    }
    if (remoteRef.startsWith("refs/rescue/") && registry.rescue?.remotePushAllowed !== true) {
      addFinding(findings, { path: remoteRef, rule: "rescue-ref-remote-push-not-authorized", source: "push-policy" });
    }
    if (expectedRef && localRef === expectedRef && localSha !== ZERO_SHA) {
      const observedLocalSha = gitText(["rev-parse", expectedRef]).trim();
      if (observedLocalSha !== localSha) {
        addFinding(findings, { path: localRef, rule: "local-ref-sha-mismatch", source: localSha });
      }
    }
    if (
      currentItem &&
      localSha !== ZERO_SHA &&
      localSha !== currentItem.headSha &&
      !permittedActiveAdvance(currentItem.headSha, localSha, currentItem)
    ) {
      addFinding(findings, {
        path: localRef,
        rule: "outgoing-head-not-permitted-by-commit-registry",
        source: "push-policy"
      });
    }
    if (branchRecord && !deletionAuthorization) {
      if (branchRecord.remotePresent && remoteSha === ZERO_SHA) {
        addFinding(findings, { path: remoteRef, rule: "registered-remote-state-mismatch", source: "expected-present" });
      } else if (!branchRecord.remotePresent && remoteSha !== ZERO_SHA) {
        addFinding(findings, { path: remoteRef, rule: "registered-remote-state-mismatch", source: "expected-absent" });
      } else if (
        branchRecord.remotePresent &&
        remoteSha !== ZERO_SHA &&
        branchRecord.remoteHeadSha !== remoteSha
      ) {
        addFinding(findings, { path: remoteRef, rule: "registered-remote-sha-mismatch", source: remoteSha });
      }
    }
    if (localSha === ZERO_SHA && !deletionAuthorization) {
      addFinding(findings, { path: remoteRef, rule: "ref-deletion-receipt-missing-or-inactive", source: remoteSha });
    }
  }
}

function permittedActiveAdvance(fromSha, toSha, item) {
  const advance = scopedActiveAdvance(fromSha, toSha, item);
  return advance.isForward && advance.laneChangedPaths.every((path) => pathIsAllowed(path, item.allowedPaths));
}

function activeIncidentRefDeletionAuthorization(registry, remoteRef, remoteSha, options = {}) {
  if (!remoteRef.startsWith("refs/heads/") || remoteRef === "refs/heads/main" || !isSha(remoteSha)) return null;
  const authorization = (registry.policy?.refDeletionAuthorizations ?? []).find(
    (entry) =>
      entry.status === "active" &&
      entry.ref === remoteRef &&
      entry.expectedOldSha === remoteSha &&
      entry.exactLeaseRequired === true &&
      entry.oneShot === true &&
      typeof entry.githubActor === "string" &&
      entry.githubActor.length > 0 &&
      isIsoTimestamp(entry.authorizedAt) &&
      isIsoTimestamp(entry.expiresAt) &&
      Date.parse(entry.expiresAt) > Date.now()
  );
  if (!authorization) return null;

  if (options.requireGitHubActor === true && authorization.githubActor !== options.githubActor) return null;

  const targetBranchName = remoteRef.slice("refs/heads/".length);
  const targetBranch = (registry.branches ?? []).find((branch) => branch.name === targetBranchName);
  if (
    !targetBranch ||
    targetBranch.disposition !== "security-quarantine" ||
    targetBranch.remotePresent !== true ||
    targetBranch.remoteHeadSha !== remoteSha ||
    authorization.purpose !== "credential-incident-containment" ||
    registry.incident?.credentialExposure?.providerContainmentStatus !== "complete" ||
    !isIsoTimestamp(authorization.providerReadbackAt) ||
    typeof authorization.providerEvidenceId !== "string" ||
    authorization.providerEvidenceId.length === 0 ||
    !/^[0-9a-f]{64}$/.test(authorization.providerEvidenceSha256)
  ) {
    return null;
  }

  if (options.requireOperator !== false) {
    const branchResult = git(["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true });
    const operatorBranch = branchResult.status === 0 ? String(branchResult.stdout).trim() : null;
    const operatorItem = (registry.workItems ?? []).find(
      (item) => sameExistingPath(item.worktreePath, REPO_ROOT) && item.branch === operatorBranch
    );
    if (
      !operatorItem ||
      !ACTIVE_WRITE_DISPOSITIONS.has(operatorItem.disposition) ||
      authorization.operatorBranch !== operatorBranch ||
      authorization.operatorTaskId !== operatorItem.taskId ||
      authorization.operatorOwnerKey !== operatorItem.ownerKey
    ) {
      return null;
    }
  }
  return { ...authorization, authorizationKind: "credential-incident" };
}

function activeIntegratedCleanupAuthorization(registry, remoteRef, remoteSha, options = {}) {
  if (!remoteRef.startsWith("refs/heads/") || remoteRef === "refs/heads/main" || !isSha(remoteSha)) return null;
  const branchName = remoteRef.slice("refs/heads/".length);
  const item = (registry.workItems ?? []).find((candidate) => candidate.branch === branchName);
  const branch = (registry.branches ?? []).find((candidate) => candidate.name === branchName);
  const cleanup = item?.cleanupAuthorization;
  if (
    !item ||
    !branch ||
    item.disposition !== "integrated" ||
    branch.disposition !== "integrated" ||
    item.headSha !== remoteSha ||
    branch.headSha !== remoteSha ||
    branch.remotePresent !== true ||
    branch.remoteHeadSha !== remoteSha ||
    branch.prState !== "MERGED" ||
    branch.prHeadSha !== remoteSha ||
    cleanup?.status !== "active" ||
    cleanup.purpose !== "integrated-lane-cleanup" ||
    cleanup.ref !== remoteRef ||
    cleanup.expectedOldSha !== remoteSha ||
    cleanup.requiredCleanHeadSha !== remoteSha ||
    cleanup.effectiveOnlyAfterThisCloseoutReachesProtectedMain !== true ||
    cleanup.ordinaryLocalWorktreeRemoval !== true ||
    cleanup.ordinaryLocalBranchDeletion !== true ||
    cleanup.ordinaryRemoteBranchDeletion !== true ||
    cleanup.forceResetRebaseOrHistoryRewrite !== false ||
    cleanup.exactLeaseRequired !== true ||
    cleanup.oneShot !== true ||
    !isIsoTimestamp(cleanup.authorizedAt) ||
    !isIsoTimestamp(cleanup.expiresAt) ||
    Date.parse(cleanup.expiresAt) <= Date.now() ||
    typeof cleanup.githubActor !== "string" ||
    cleanup.githubActor.length === 0 ||
    item.lastMergedPullRequest?.headSha !== remoteSha ||
    item.lastMergedPullRequest?.postMainChecksPassed !== true ||
    !isSha(item.lastMergedPullRequest?.mergeCommitSha) ||
    branch.lastMergedPullRequest?.headSha !== remoteSha ||
    branch.lastMergedPullRequest?.mergeCommitSha !== item.lastMergedPullRequest.mergeCommitSha ||
    git(["merge-base", "--is-ancestor", remoteSha, "origin/main"], { allowFailure: true }).status !== 0 ||
    git(["merge-base", "--is-ancestor", item.lastMergedPullRequest.mergeCommitSha, "origin/main"], {
      allowFailure: true
    }).status !== 0
  ) {
    return null;
  }
  if (options.requireGitHubActor === true && cleanup.githubActor !== options.githubActor) return null;

  if (options.requireOperator !== false) {
    const registryRepoResolution = existingPathResolution(registry.repo);
    const controlRootResolution = existingPathResolution(CONTROL_ROOT);
    if (
      !registryRepoResolution.ok ||
      !controlRootResolution.ok ||
      registryRepoResolution.path !== controlRootResolution.path ||
      physicalWorkItemCustodyError(registryRepoResolution, item)
    ) {
      return null;
    }
    const branchResult = git(["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true });
    const operatorBranch = branchResult.status === 0 ? String(branchResult.stdout).trim() : null;
    const operatorItem = (registry.workItems ?? []).find(
      (candidate) => sameExistingPath(candidate.worktreePath, REPO_ROOT) && candidate.branch === operatorBranch
    );
    const targetWorktree = parseWorktreeList().find((candidate) => sameExistingPath(candidate.path, item.worktreePath));
    if (
      !operatorItem ||
      !ACTIVE_WRITE_DISPOSITIONS.has(operatorItem.disposition) ||
      cleanup.operatorBranch !== operatorBranch ||
      cleanup.operatorTaskId !== operatorItem.taskId ||
      cleanup.operatorOwnerKey !== operatorItem.ownerKey ||
      !targetWorktree ||
      targetWorktree.branch !== branchName ||
      targetWorktree.headSha !== remoteSha ||
      worktreeStatusPaths(item.worktreePath).length !== 0
    ) {
      return null;
    }
  }
  return {
    ...cleanup,
    authorizationKind: "integrated-cleanup",
    targetTaskId: item.taskId,
    targetBranch: branchName
  };
}

function activeRefDeletionAuthorization(registry, remoteRef, remoteSha, options = {}) {
  return activeIncidentRefDeletionAuthorization(registry, remoteRef, remoteSha, options) ??
    activeIntegratedCleanupAuthorization(registry, remoteRef, remoteSha, options);
}

function liveQuarantineRulesetMatches(authorization, options = {}) {
  const result = spawnSync(
    "gh",
    ["api", `repos/HUDongpin/SENA/rulesets/${authorization.remoteRulesetId}`],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 4 * 1024 * 1024, env: process.env }
  );
  if (result.status !== 0) return false;
  let ruleset;
  try {
    ruleset = JSON.parse(result.stdout);
  } catch {
    return false;
  }
  const include = ruleset.conditions?.ref_name?.include;
  const exclude = ruleset.conditions?.ref_name?.exclude;
  const ruleTypes = (ruleset.rules ?? []).map((rule) => rule.type);
  const bypassActorsVisible = Object.hasOwn(ruleset, "bypass_actors");
  const bypassActors = ruleset.bypass_actors ?? [];
  const bypassActorsMatch =
    bypassActorsVisible &&
    bypassActors.length === 1 &&
    bypassActors[0].actor_id === authorization.githubActorId &&
    bypassActors[0].actor_type === "User" &&
    bypassActors[0].bypass_mode === "always";
  return Boolean(
    ruleset.id === authorization.remoteRulesetId &&
      ruleset.name === authorization.remoteRulesetName &&
      ruleset.target === "branch" &&
      ruleset.enforcement === "active" &&
      sameStringSet(include, [authorization.ref]) &&
      sameStringSet(exclude, []) &&
      sameStringSet(ruleTypes, ["creation", "deletion", "non_fast_forward"]) &&
      (bypassActorsMatch || (options.allowHiddenBypassActors === true && !bypassActorsVisible))
  );
}

function runDeletionBoundary(flags) {
  const updates = parsePrePushUpdates(readFileSync(0, "utf8"));
  if (updates.length !== 1 || updates[0].localSha !== ZERO_SHA) {
    throw new Error("deletion-boundary requires exactly one deletion update");
  }
  const { parsed: registry } = loadProtectedMainAuthorizationRegistry(flags, { required: true });
  const update = updates[0];
  const isPushEvent = flags.has("push-event");
  if (!isPushEvent) {
    const physicalCustodyErrors = [];
    appendHostPhysicalCustodyErrors(registry, physicalCustodyErrors);
    if (physicalCustodyErrors.length > 0) {
      throw new Error("deletion-boundary host physical custody is invalid");
    }
  }
  const githubActor = flagValues(flags, "event-actor")[0] ?? null;
  const authorization = activeRefDeletionAuthorization(registry, update.remoteRef, update.remoteSha, {
    requireOperator: !isPushEvent,
    requireGitHubActor: isPushEvent,
    githubActor
  });
  if (!authorization) throw new Error("deletion-boundary lacks an active exact protected-main authorization");
  if (authorization.authorizationKind === "credential-incident") {
    if (!liveQuarantineRulesetMatches(authorization, { allowHiddenBypassActors: isPushEvent })) {
      throw new Error("deletion-boundary live GitHub quarantine ruleset does not match the authorization");
    }
    process.stdout.write(
      `SENA_DELETION_BOUNDARY pass ruleset=${authorization.remoteRulesetId} ref=${safePathForLog(update.remoteRef)}\n`
    );
    return;
  }
  process.stdout.write(
    `SENA_DELETION_BOUNDARY pass cleanup=${safePathForLog(authorization.targetTaskId)} ref=${safePathForLog(update.remoteRef)}\n`
  );
}

function exactLiveRemoteHead(ref) {
  const result = git(["ls-remote", "--heads", EXPECTED_REMOTE_HTTPS_URL, ref], { allowFailure: true });
  if (result.status !== 0) {
    throw new Error("rule=local-ref-retirement-canonical-remote-readback-failed");
  }
  const lines = String(result.stdout ?? "")
    .trim()
    .split("\n")
    .filter(Boolean);
  const matches = lines.map((line) => line.trim().split(/\s+/));
  if (
    matches.length > 1 ||
    matches.some((fields) => fields.length !== 2 || fields[1] !== ref || !isSha(fields[0]))
  ) {
    throw new Error("rule=local-ref-retirement-canonical-remote-ambiguous");
  }
  return matches.length === 1 ? matches[0][0] : null;
}

function exactOwnerOnlyMode(path, expectedMode) {
  return (statSync(path).mode & 0o777) === expectedMode;
}

function pathEntryExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function parseBundleHeads(bundlePath) {
  const result = git(["bundle", "list-heads", bundlePath], { allowFailure: true });
  if (result.status !== 0) throw new Error("local retirement archive bundle heads cannot be read");
  return String(result.stdout ?? "")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, ref] = line.trim().split(/\s+/, 2);
      return { sha, ref };
    });
}

function localRefRetirementDeletionReleaseIsStructurallyValid(authorization) {
  const release = authorization.deletionRelease;
  if (!release || typeof release !== "object" || Array.isArray(release)) return false;
  const releasedAtMs = Date.parse(release.releasedAt);
  const releaseExpiresAtMs = Date.parse(release.expiresAt);
  const authorizedAtMs = Date.parse(authorization.authorizedAt);
  const authorizationExpiresAtMs = Date.parse(authorization.expiresAt);
  return Boolean(
    LOCAL_REF_RETIREMENT_AUTHORIZATION_ID_PATTERN.test(release.id ?? "") &&
      typeof release.releasedBy === "string" &&
      release.releasedBy.length > 0 &&
      typeof release.releaseBasis === "string" &&
      release.releaseBasis.length > 0 &&
      isIsoTimestamp(release.releasedAt) &&
      isIsoTimestamp(release.expiresAt) &&
      Number.isFinite(releasedAtMs) &&
      Number.isFinite(releaseExpiresAtMs) &&
      releaseExpiresAtMs > releasedAtMs &&
      releaseExpiresAtMs - releasedAtMs <= 72 * 60 * 60 * 1000 &&
      releasedAtMs >= authorizedAtMs &&
      releaseExpiresAtMs <= authorizationExpiresAtMs &&
      isSha(release.pendingAuthorizationCommit) &&
      release.exactTargetRef === authorization.ref &&
      release.exactExpectedOldSha === authorization.expectedOldSha &&
      release.operatorTaskId === authorization.operatorTaskId &&
      release.operatorOwnerKey === authorization.operatorOwnerKey &&
      release.effectiveOnlyAfterReleaseReachesProtectedMain === true
  );
}

function assertLocalRefRetirementDeletionReleaseWindow(
  authorization,
  validationNow = Date.now()
) {
  const release = authorization.deletionRelease;
  if (Date.parse(release.releasedAt) > validationNow) {
    throw new Error("rule=local-ref-retirement-release-not-effective");
  }
  if (Date.parse(release.expiresAt) <= validationNow) {
    throw new Error("rule=local-ref-retirement-release-expired");
  }
}

function assertLocalRefRetirementDeletionRelease(
  authorization,
  authorizationCommit,
  validationNow = Date.now()
) {
  if (!localRefRetirementDeletionReleaseIsStructurallyValid(authorization)) {
    throw new Error("rule=local-ref-retirement-release-invalid");
  }
  assertLocalRefRetirementDeletionReleaseWindow(authorization, validationNow);
  const release = authorization.deletionRelease;
  const firstParentHistory = git(["rev-list", "--first-parent", authorizationCommit], {
    allowFailure: true
  });
  const firstParentCommits = new Set(
    String(firstParentHistory.stdout ?? "")
      .trim()
      .split("\n")
      .filter(Boolean)
  );
  if (
    firstParentHistory.status !== 0 ||
    release.pendingAuthorizationCommit === authorizationCommit ||
    !firstParentCommits.has(release.pendingAuthorizationCommit)
  ) {
    throw new Error("rule=local-ref-retirement-release-not-protected-main");
  }
  let pendingAuthorization;
  try {
    const pendingRegistry = loadRegistryFromCommit(release.pendingAuthorizationCommit).parsed;
    const pendingValidation = validateRegistry(pendingRegistry, { now: validationNow });
    if (pendingValidation.errors.length > 0) {
      throw new Error("pending registry invalid");
    }
    pendingAuthorization = (pendingRegistry.policy?.localRefRetirementAuthorizations ?? []).find(
      (entry) => entry.id === authorization.id
    );
  } catch {
    throw new Error("rule=local-ref-retirement-release-pending-custody-mismatch");
  }
  if (
    !pendingAuthorization ||
    pendingAuthorization.status !== "pending-release" ||
    pendingAuthorization.deletionRelease !== null ||
    JSON.stringify(localRetirementAuthorizationCoreContract(pendingAuthorization)) !==
      JSON.stringify(localRetirementAuthorizationCoreContract(authorization))
  ) {
    throw new Error("rule=local-ref-retirement-release-pending-custody-mismatch");
  }
}

function localRefRetirementAuthorization(registry, authorizationId, authorizationCommit) {
  const authorization = (registry.policy?.localRefRetirementAuthorizations ?? []).find(
    (entry) => entry.id === authorizationId
  );
  if (!authorization) {
    throw new Error("rule=local-ref-retirement-authorization-missing");
  }
  if (authorization.status === "pending-release") {
    throw new Error("rule=local-ref-retirement-release-pending");
  }
  if (authorization.status === "consumed") {
    throw new Error("rule=local-ref-retirement-authorization-consumed");
  }
  if (isIsoTimestamp(authorization.expiresAt) && Date.parse(authorization.expiresAt) <= Date.now()) {
    throw new Error("rule=local-ref-retirement-authorization-expired");
  }
  if (
    !LOCAL_REF_RETIREMENT_AUTHORIZATION_STATUSES.has(authorization.status) ||
    authorization.status !== "active" ||
    authorization.purpose !== "archive-ref-retirement" ||
    !authorization.ref?.startsWith("refs/heads/") ||
    authorization.ref === "refs/heads/main" ||
    !isSha(authorization.expectedOldSha) ||
    authorization.expectedOldSha === ZERO_SHA ||
    authorization.effectiveOnlyAfterAuthorizationReachesProtectedMain !== true ||
    authorization.exactCasRequired !== true ||
    authorization.ordinaryBranchDAllowed !== false ||
    authorization.forceBranchDAllowed !== false ||
    authorization.oneShot !== true ||
    authorization.registeredWorktreeOccupancyRequired !== "none" ||
    authorization.remoteHeadRequiredAbsent !== true ||
    !isIsoTimestamp(authorization.authorizedAt) ||
    !isIsoTimestamp(authorization.expiresAt) ||
    Date.parse(authorization.expiresAt) <= Date.now()
  ) {
    throw new Error("local archive-ref retirement authorization is absent or inactive");
  }
  assertLocalRefRetirementDeletionRelease(authorization, authorizationCommit);

  const branchName = authorization.ref.slice("refs/heads/".length);
  const branchRecord = (registry.branches ?? []).find((entry) => entry.name === branchName);
  if (
    !branchRecord ||
    branchRecord.headSha !== authorization.expectedOldSha ||
    branchRecord.disposition !== authorization.targetDispositionBeforeRetirement ||
    branchRecord.remotePresent !== false
  ) {
    throw new Error("local archive-ref retirement target registry does not match");
  }
  if (
    authorization.ref === QUARANTINED_LEDGER_BRANCH_REF ||
    authorization.expectedOldSha === QUARANTINED_LEDGER_TIP ||
    branchRecord.disposition === "security-quarantine"
  ) {
    throw new Error("rule=local-ref-retirement-ordinary-quarantine-isolation");
  }

  const branchResult = git(["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true });
  const operatorBranch = branchResult.status === 0 ? String(branchResult.stdout).trim() : null;
  const operatorItem = (registry.workItems ?? []).find(
    (item) => sameExistingPath(item.worktreePath, REPO_ROOT) && item.branch === operatorBranch
  );
  const registryRepoResolution = existingPathResolution(registry.repo);
  if (
    !operatorItem ||
    !ACTIVE_WRITE_DISPOSITIONS.has(operatorItem.disposition) ||
    authorization.operatorBranch !== operatorBranch ||
    authorization.operatorTaskId !== operatorItem.taskId ||
    authorization.operatorOwnerKey !== operatorItem.ownerKey
  ) {
    throw new Error("local archive-ref retirement operator is not authorized");
  }
  if (!registryRepoResolution.ok) {
    throw new Error("local archive-ref retirement registry repository cannot be resolved");
  }
  const operatorCustodyError = physicalWorkItemCustodyError(registryRepoResolution, operatorItem);
  if (operatorCustodyError) throw new Error(operatorCustodyError);
  if (worktreeStatusPaths(REPO_ROOT).length !== 0) {
    throw new Error("rule=local-ref-retirement-operator-dirty");
  }
  const operatorHead = git(["rev-parse", "--verify", "HEAD"], { allowFailure: true });
  if (
    !isSha(authorizationCommit) ||
    operatorHead.status !== 0 ||
    String(operatorHead.stdout).trim() !== authorizationCommit
  ) {
    throw new Error("rule=local-ref-retirement-operator-head-mismatch");
  }

  const observedTarget = git(["rev-parse", "--verify", authorization.ref], { allowFailure: true });
  const observedTargetType = git(["cat-file", "-t", authorization.ref], { allowFailure: true });
  const symbolicTarget = git(["symbolic-ref", "--quiet", authorization.ref], { allowFailure: true });
  if (
    observedTarget.status !== 0 ||
    String(observedTarget.stdout).trim() !== authorization.expectedOldSha ||
    observedTargetType.status !== 0 ||
    String(observedTargetType.stdout).trim() !== "commit" ||
    symbolicTarget.status === 0
  ) {
    throw new Error("rule=local-ref-retirement-target-sha-mismatch");
  }
  if (parseWorktreeList().some((entry) => entry.branch === branchName)) {
    throw new Error("rule=local-ref-retirement-target-worktree-occupied");
  }
  if (exactLiveRemoteHead(authorization.ref) !== null) {
    throw new Error("rule=local-ref-retirement-target-remote-present");
  }

  const custody = authorization.custody;
  if (
    !custody ||
    custody.kind !== "ordinary-archive" ||
    typeof custody.root !== "string" ||
    typeof custody.bundlePath !== "string" ||
    typeof custody.manifestPath !== "string" ||
    typeof custody.bundleRef !== "string" ||
    custody.bundleRef !== custody.tagRef ||
    !isSha(custody.tagObjectSha) ||
    custody.peeledCommitSha !== authorization.expectedOldSha ||
    custody.bundleSha256?.length !== 64 ||
    custody.manifestSha256?.length !== 64 ||
    !Number.isInteger(custody.bundleBytes) ||
    custody.bundleBytes <= 0
  ) {
    throw new Error("local archive-ref retirement custody contract is invalid");
  }
  const rootResolution = existingPathResolution(custody.root);
  const bundleResolution = existingPathResolution(custody.bundlePath);
  const manifestResolution = existingPathResolution(custody.manifestPath);
  if (
    !rootResolution.ok ||
    !bundleResolution.ok ||
    !manifestResolution.ok ||
    !pathIsWithin(rootResolution.path, bundleResolution.path) ||
    !pathIsWithin(rootResolution.path, manifestResolution.path)
  ) {
    throw new Error("local archive-ref retirement custody escapes its owner-only root");
  }
  const bundleInfo = lstatSync(custody.bundlePath);
  const manifestInfo = lstatSync(custody.manifestPath);
  const rootInfo = lstatSync(custody.root);
  if (
    !rootInfo.isDirectory() ||
    rootInfo.isSymbolicLink() ||
    !bundleInfo.isFile() ||
    bundleInfo.isSymbolicLink() ||
    !manifestInfo.isFile() ||
    manifestInfo.isSymbolicLink() ||
    !exactOwnerOnlyMode(custody.root, 0o700) ||
    !exactOwnerOnlyMode(custody.bundlePath, 0o600) ||
    !exactOwnerOnlyMode(custody.manifestPath, 0o600) ||
    rootInfo.uid !== process.geteuid() ||
    bundleInfo.uid !== process.geteuid() ||
    manifestInfo.uid !== process.geteuid() ||
    bundleInfo.nlink !== 1 ||
    manifestInfo.nlink !== 1 ||
    dirname(bundleResolution.path) !== rootResolution.path ||
    dirname(manifestResolution.path) !== rootResolution.path
  ) {
    throw new Error("rule=local-ref-retirement-bundle-mode-mismatch");
  }
  if (
    bundleInfo.size !== custody.bundleBytes ||
    sha256File(custody.bundlePath) !== custody.bundleSha256
  ) {
    throw new Error("rule=local-ref-retirement-bundle-sha256-mismatch");
  }
  if (sha256File(custody.manifestPath) !== custody.manifestSha256) {
    throw new Error("rule=local-ref-retirement-manifest-sha256-mismatch");
  }
  const bundleVerify = git(["bundle", "verify", custody.bundlePath], { allowFailure: true });
  const bundleVerifyOutput = `${String(bundleVerify.stdout ?? "")}\n${String(bundleVerify.stderr ?? "")}`;
  if (bundleVerify.status !== 0 || !bundleVerifyOutput.includes("The bundle records a complete history.")) {
    throw new Error("local archive-ref retirement bundle verification failed");
  }
  const bundleHeads = parseBundleHeads(custody.bundlePath);
  const matchingBundleHeads = bundleHeads.filter(
    (entry) => entry.ref === custody.bundleRef && entry.sha === custody.tagObjectSha
  );
  if (matchingBundleHeads.length !== 1) {
    throw new Error("rule=local-ref-retirement-bundle-ref-mismatch");
  }
  const tagObject = git(["rev-parse", "--verify", custody.tagRef], { allowFailure: true });
  const tagPeel = git(["rev-parse", "--verify", `${custody.tagRef}^{}`], { allowFailure: true });
  const tagType = git(["cat-file", "-t", custody.tagRef], { allowFailure: true });
  if (
    tagObject.status !== 0 ||
    tagPeel.status !== 0 ||
    tagType.status !== 0 ||
    String(tagType.stdout).trim() !== "tag" ||
    String(tagObject.stdout).trim() !== custody.tagObjectSha ||
    String(tagPeel.stdout).trim() !== custody.peeledCommitSha
  ) {
    throw new Error("rule=local-ref-retirement-tag-peel-mismatch");
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(custody.manifestPath, "utf8"));
  } catch {
    throw new Error("local archive-ref retirement manifest is not valid JSON");
  }
  const manifestRef = (manifest.archiveRefs ?? []).find((entry) => entry.ref === custody.tagRef);
  const manifestRefs = Array.isArray(manifest.archiveRefs) ? manifest.archiveRefs : [];
  const bundleRefMap = new Map(bundleHeads.map((entry) => [entry.ref, entry.sha]));
  const manifestBundleRefSetMatches =
    manifestRefs.length === bundleHeads.length &&
    new Set(manifestRefs.map((entry) => entry.ref)).size === manifestRefs.length &&
    bundleRefMap.size === bundleHeads.length &&
    manifestRefs.every(
      (entry) =>
        typeof entry.ref === "string" &&
        entry.ref.startsWith("refs/tags/archive/") &&
        bundleRefMap.get(entry.ref) === entry.tagObjectSha &&
        git(["cat-file", "-t", entry.ref], { allowFailure: true }).status === 0 &&
        gitText(["cat-file", "-t", entry.ref]).trim() === "tag" &&
        gitText(["rev-parse", "--verify", entry.ref]).trim() === entry.tagObjectSha &&
        gitText(["rev-parse", "--verify", `${entry.ref}^{}`]).trim() === entry.peeledCommitSha
    );
  if (!manifestBundleRefSetMatches) {
    throw new Error("rule=local-ref-retirement-bundle-ref-mismatch");
  }
  const ordinaryReachability = git(
    ["rev-list", "--objects", ...manifestRefs.map((entry) => entry.peeledCommitSha)],
    { allowFailure: true }
  );
  const ordinaryReachableObjectIds = new Set(
    String(ordinaryReachability.stdout ?? "")
      .split("\n")
      .filter(Boolean)
      .map((line) => line.trim().split(/\s+/, 1)[0])
  );
  if (
    manifest.knownQuarantinedBlobReachableCommitCount !== 0 ||
    !sameStringSet(manifest.excludedRefNamespaces, ORDINARY_ARCHIVE_EXCLUDED_REF_NAMESPACES) ||
    manifest.remoteTagPublicationAuthorized !== false ||
    manifest.deploymentAuthorized !== false ||
    ordinaryReachability.status !== 0 ||
    ordinaryReachableObjectIds.has(QUARANTINED_LEDGER_TIP) ||
    [...KNOWN_SENSITIVE_BLOB_OIDS].some((oid) => ordinaryReachableObjectIds.has(oid))
  ) {
    throw new Error("rule=local-ref-retirement-ordinary-quarantine-isolation");
  }
  if (
    manifest.schemaVersion !== "sena-local-archive-bundle-custody/v1" ||
    manifest.bundle?.path !== custody.bundlePath ||
    manifest.bundle?.sha256 !== custody.bundleSha256 ||
    manifest.bundle?.bytes !== custody.bundleBytes ||
    manifest.bundle?.fileMode !== "0600" ||
    manifest.bundle?.parentMode !== "0700" ||
    manifest.bundle?.bundleVerify !== "pass" ||
    manifest.bundle?.completeHistory !== true ||
    !Array.isArray(manifest.bundle?.prerequisites) ||
    manifest.bundle.prerequisites.length !== 0 ||
    !manifestBundleRefSetMatches ||
    manifestRef?.tagObjectSha !== custody.tagObjectSha ||
    manifestRef?.peeledCommitSha !== custody.peeledCommitSha ||
    manifest.credentialContentsRead !== false ||
    manifest.targetBranchRefsRetainedAtReceipt !== true
  ) {
    throw new Error("local archive-ref retirement manifest contract does not match");
  }
  return authorization;
}

function runLocalRefRetirementBoundary(flags) {
  const authorizationIds = flagValues(flags, "authorization-id");
  if (authorizationIds.length !== 1) {
    throw new Error("rule=local-ref-retirement-authorization-id-ambiguous");
  }
  const authorizationId = authorizationIds[0];
  const loaded = loadProtectedMainAuthorizationRegistry(flags, {
    required: true,
    localRefRetirementAuthorizationId: authorizationId
  });
  if (exactLiveRemoteHead("refs/heads/main") !== loaded.commit) {
    throw new Error("rule=local-ref-retirement-live-main-mismatch");
  }
  const authorization = localRefRetirementAuthorization(loaded.parsed, authorizationId, loaded.commit);
  process.stdout.write(
    `SENA_LOCAL_REF_RETIREMENT_BOUNDARY pass authorization=${safePathForLog(authorization.id)} ref=${safePathForLog(authorization.ref)}\n`
  );
}

function writeOwnerOnlyExclusive(outputPath, content) {
  const resolvedOutput = resolve(outputPath);
  if (existsSync(resolvedOutput)) throw new Error("rule=local-ref-retirement-replay");
  let descriptor = null;
  let directoryDescriptor = null;
  try {
    descriptor = openSync(resolvedOutput, "wx", 0o600);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    chmodSync(resolvedOutput, 0o600);
    const outputInfo = lstatSync(resolvedOutput);
    if (
      !outputInfo.isFile() ||
      outputInfo.isSymbolicLink() ||
      outputInfo.uid !== process.geteuid() ||
      outputInfo.nlink !== 1 ||
      !exactOwnerOnlyMode(resolvedOutput, 0o600)
    ) {
      throw new Error("rule=local-ref-retirement-receipt-mode-mismatch");
    }
    directoryDescriptor = openSync(dirname(resolvedOutput), "r");
    fsyncSync(directoryDescriptor);
    closeSync(directoryDescriptor);
    directoryDescriptor = null;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (directoryDescriptor !== null) closeSync(directoryDescriptor);
  }
  return resolvedOutput;
}

function retirementReceiptPaths(authorization) {
  const directoryResolution = existingPathResolution(authorization.receiptDirectory);
  const custodyRootResolution = existingPathResolution(authorization.custody.root);
  if (
    !directoryResolution.ok ||
    !custodyRootResolution.ok ||
    !pathIsWithin(custodyRootResolution.path, directoryResolution.path) ||
    !lstatSync(authorization.receiptDirectory).isDirectory() ||
    lstatSync(authorization.receiptDirectory).isSymbolicLink() ||
    !exactOwnerOnlyMode(authorization.receiptDirectory, 0o700) ||
    statSync(authorization.receiptDirectory).uid !== process.geteuid()
  ) {
    throw new Error("rule=local-ref-retirement-receipt-directory-mismatch");
  }
  if (!LOCAL_REF_RETIREMENT_AUTHORIZATION_ID_PATTERN.test(authorization.id)) {
    throw new Error("rule=local-ref-retirement-authorization-id-invalid");
  }
  const prepared = resolve(directoryResolution.path, `${authorization.id}.prepared.json`);
  const completed = resolve(directoryResolution.path, `${authorization.id}.completed.json`);
  if (
    dirname(prepared) !== directoryResolution.path ||
    dirname(completed) !== directoryResolution.path ||
    !pathIsWithin(directoryResolution.path, prepared) ||
    !pathIsWithin(directoryResolution.path, completed)
  ) {
    throw new Error("rule=local-ref-retirement-receipt-directory-mismatch");
  }
  return { prepared, completed };
}

function assertLocalRefRetirementProcessEnvironment() {
  if (process.env.SENA_GOVERNANCE_TARGET_ROOT) {
    throw new Error("rule=local-ref-retirement-target-root-override");
  }
  const dangerousNames = Object.keys(process.env).filter(
    (name) =>
      LOCAL_RETIREMENT_DANGEROUS_GIT_ENV.has(name) ||
      name === "GIT_CONFIG_PARAMETERS" ||
      name.startsWith("GIT_CONFIG_")
  );
  if (dangerousNames.length > 0) {
    throw new Error("rule=local-ref-retirement-dangerous-git-environment");
  }
  process.env.GIT_NO_REPLACE_OBJECTS = "1";
  process.env.LC_ALL = "C";
}

function assertLocalRefRetirementRuntimeCustody(registry, authorizationCommit) {
  const registryRoot = existingPathResolution(registry.repo);
  const commonDir = existingPathResolution(
    gitText(["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim()
  );
  const expectedCommonDir = registryRoot.ok
    ? existingPathResolution(join(registryRoot.path, ".git"))
    : { ok: false, path: null };
  if (
    !registryRoot.ok ||
    !commonDir.ok ||
    !expectedCommonDir.ok ||
    commonDir.path !== expectedCommonDir.path ||
    realpathSync(CONTROL_ROOT) !== registryRoot.path
  ) {
    throw new Error("rule=local-ref-retirement-common-dir-mismatch");
  }

  if (registryRoot.path === LOCAL_RETIREMENT_PRODUCTION_ROOT) {
    const whichGit = spawnSync("/usr/bin/which", ["git"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: process.env
    });
    const gitPath = whichGit.status === 0 ? existingPathResolution(String(whichGit.stdout).trim()) : null;
    if (!gitPath?.ok || gitPath.path !== "/usr/bin/git") {
      throw new Error("rule=local-ref-retirement-git-binary-mismatch");
    }
  }
  const urlRewrite = git(["config", "--get-regexp", "^url\\..*\\.insteadof$"], {
    allowFailure: true
  });
  if (urlRewrite.status === 0 || ![0, 1].includes(urlRewrite.status)) {
    throw new Error("rule=local-ref-retirement-canonical-url-rewrite-configured");
  }

  const hookErrors = [];
  verifyHookCustody(registry, hookErrors);
  const configuredHooksPath = gitText(["config", "--get", "core.hooksPath"], {
    allowFailure: true
  }).trim();
  const hookCustody = resolveHookCustodyDirectory(
    CONTROL_ROOT,
    REPO_ROOT,
    registry.policy?.hookCustodyPath,
    configuredHooksPath
  );
  if (
    hookErrors.length > 0 ||
    hookCustody.error ||
    pathEntryExists(join(hookCustody.path, "reference-transaction"))
  ) {
    throw new Error("rule=local-ref-retirement-hook-custody-mismatch");
  }

  const scriptInfo = lstatSync(SCRIPT_PATH);
  const scriptRelativePath = normalizeRepoPath(relative(REPO_ROOT, SCRIPT_PATH));
  const authorizedScript = git(
    ["rev-parse", "--verify", `${authorizationCommit}:${scriptRelativePath}`],
    { allowFailure: true }
  );
  const currentScript = git(["hash-object", SCRIPT_PATH], { allowFailure: true });
  if (
    !scriptInfo.isFile() ||
    scriptInfo.isSymbolicLink() ||
    scriptRelativePath.startsWith("../") ||
    authorizedScript.status !== 0 ||
    currentScript.status !== 0 ||
    String(authorizedScript.stdout).trim() !== String(currentScript.stdout).trim()
  ) {
    throw new Error("rule=local-ref-retirement-script-custody-mismatch");
  }
}

function runLocalRefRetirement(flags) {
  assertLocalRefRetirementProcessEnvironment();
  const authorizationIds = flagValues(flags, "authorization-id");
  if (authorizationIds.length !== 1) {
    throw new Error("rule=local-ref-retirement-authorization-id-ambiguous");
  }
  const authorizationId = authorizationIds[0];
  const loaded = loadProtectedMainAuthorizationRegistry(flags, {
    required: true,
    localRefRetirementAuthorizationId: authorizationId
  });
  assertLocalRefRetirementRuntimeCustody(loaded.parsed, loaded.commit);
  if (exactLiveRemoteHead("refs/heads/main") !== loaded.commit) {
    throw new Error("rule=local-ref-retirement-live-main-mismatch");
  }
  const candidate = (loaded.parsed.policy?.localRefRetirementAuthorizations ?? []).find(
    (entry) => entry.id === authorizationId
  );
  if (!candidate) throw new Error("rule=local-ref-retirement-authorization-missing");
  const receiptPaths = retirementReceiptPaths(candidate);
  if (existsSync(receiptPaths.prepared) || existsSync(receiptPaths.completed)) {
    throw new Error("rule=local-ref-retirement-replay");
  }
  const authorization = localRefRetirementAuthorization(loaded.parsed, authorizationId, loaded.commit);
  const eventId = sha256Buffer(Buffer.from(`${loaded.commit}\0${authorization.id}\0${authorization.ref}`, "utf8"));
  const preparedAt = new Date().toISOString();
  const preparedReceipt = {
    schemaVersion: "sena-local-ref-retirement-prepared/v1",
    eventId,
    authorizationId: authorization.id,
    authorizationRegistryCommit: loaded.commit,
    ref: authorization.ref,
    expectedOldSha: authorization.expectedOldSha,
    operatorTaskId: authorization.operatorTaskId,
    operatorOwnerKey: authorization.operatorOwnerKey,
    preparedAt,
    result: "prepared",
    credentialContentsRead: false
  };
  writeOwnerOnlyExclusive(receiptPaths.prepared, `${JSON.stringify(preparedReceipt, null, 2)}\n`);

  assertLocalRefRetirementRuntimeCustody(loaded.parsed, loaded.commit);
  localRefRetirementAuthorization(loaded.parsed, authorizationId, loaded.commit);
  if (exactLiveRemoteHead("refs/heads/main") !== loaded.commit) {
    throw new Error("rule=local-ref-retirement-live-main-mismatch");
  }
  const mutationNow = Date.now();
  if (Date.parse(authorization.expiresAt) <= mutationNow) {
    throw new Error("rule=local-ref-retirement-authorization-expired");
  }
  assertLocalRefRetirementDeletionReleaseWindow(authorization, mutationNow);
  const mutation = git(["update-ref", "--no-deref", "-d", authorization.ref, authorization.expectedOldSha], {
    unsetEnv: [
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_COMMON_DIR",
      "GIT_DIR",
      "GIT_INDEX_FILE",
      "GIT_OBJECT_DIRECTORY",
      "GIT_PREFIX",
      "GIT_WORK_TREE"
    ],
    allowFailure: true
  });
  if (mutation.status !== 0) throw new Error("rule=local-ref-retirement-exact-cas-failed");
  if (git(["show-ref", "--verify", "--quiet", authorization.ref], { allowFailure: true }).status === 0) {
    throw new Error("rule=local-ref-retirement-post-delete-readback-failed");
  }

  const localRefAbsenceReadbackAt = new Date().toISOString();
  const liveMainSha = exactLiveRemoteHead("refs/heads/main");
  const liveTargetHeadSha = exactLiveRemoteHead(authorization.ref);
  const liveRemoteReadbackAt = new Date().toISOString();
  if (liveMainSha !== loaded.commit) {
    throw new Error("rule=local-ref-retirement-post-action-live-main-mismatch");
  }
  if (liveTargetHeadSha !== null) {
    throw new Error("rule=local-ref-retirement-post-action-target-remote-present");
  }
  const completedReceipt = {
    schemaVersion: "sena-local-ref-retirement-receipt/v1",
    eventId,
    authorizationId: authorization.id,
    authorizationRegistryCommit: loaded.commit,
    ref: authorization.ref,
    expectedOldSha: authorization.expectedOldSha,
    afterSha: ZERO_SHA,
    preparedReceiptSha256: sha256File(receiptPaths.prepared),
    executedBy: authorization.operatorOwnerKey,
    executedAt: localRefAbsenceReadbackAt,
    localRefAbsenceReadbackAt,
    liveMainSha,
    liveMainReadbackAt: liveRemoteReadbackAt,
    liveTargetHeadSha,
    liveTargetAbsenceReadbackAt: liveRemoteReadbackAt,
    result: "deleted",
    exactCasUsed: true,
    branchDUsed: false,
    forceUsed: false,
    resetUsed: false,
    rebaseUsed: false,
    historyRewriteUsed: false,
    credentialContentsRead: false
  };
  writeOwnerOnlyExclusive(receiptPaths.completed, `${JSON.stringify(completedReceipt, null, 2)}\n`);
  process.stdout.write(
    `SENA_LOCAL_REF_RETIREMENT pass authorization=${safePathForLog(authorization.id)} ref=${safePathForLog(authorization.ref)}\n`
  );
}

function addPushEventPolicyFindings(flags, registry, findings, options = {}) {
  const eventRef = flagValues(flags, "event-ref")[0] ?? "";
  const beforeSha = flagValues(flags, "event-before")[0] ?? ZERO_SHA;
  const afterSha = flagValues(flags, "event-after")[0] ?? ZERO_SHA;
  const forced = flagValues(flags, "event-forced")[0] === "true";
  const deleted = flagValues(flags, "event-deleted")[0] === "true";
  const githubActor = flagValues(flags, "event-actor")[0] ?? null;
  const deletionAuthorization =
    options.protectedMainAuthorization === true && (deleted || afterSha === ZERO_SHA)
      ? activeRefDeletionAuthorization(registry, eventRef, beforeSha, {
          requireOperator: false,
          requireGitHubActor: true,
          githubActor
        })
      : null;

  if (forced) addFinding(findings, { path: eventRef, rule: "forced-push-event-not-authorized", source: "push-event" });
  if ((deleted || afterSha === ZERO_SHA) && !deletionAuthorization) {
    addFinding(findings, { path: eventRef, rule: "ref-deletion-event-not-authorized", source: "push-event" });
  }
  if (!eventRef.startsWith("refs/heads/")) {
    const rule = eventRef.startsWith("refs/tags/")
      ? "tag-ref-mutation-not-authorized"
      : eventRef.startsWith("refs/rescue/")
        ? "rescue-ref-remote-push-not-authorized"
        : "non-branch-ref-mutation-not-authorized";
    addFinding(findings, { path: eventRef || "missing-event-ref", rule, source: "push-event" });
    return;
  }
  if (deletionAuthorization) return;

  const branchName = eventRef.slice("refs/heads/".length);
  if (branchName === "main") return;
  const branchRecord = (registry.branches ?? []).find((branch) => branch.name === branchName);
  const workItem = (registry.workItems ?? []).find((item) => item.branch === branchName);
  if (!branchRecord || !workItem) {
    addFinding(findings, { path: eventRef, rule: "push-event-branch-unregistered", source: "push-event" });
    return;
  }
  if (
    !ACTIVE_WRITE_DISPOSITIONS.has(branchRecord.disposition) ||
    workItem.disposition !== branchRecord.disposition ||
    workItem.ownerKey !== branchRecord.ownerKey
  ) {
    addFinding(findings, { path: eventRef, rule: "push-event-branch-not-writable", source: "push-event" });
  }
  if (branchRecord.remotePresent) {
    if (
      beforeSha !== branchRecord.remoteHeadSha &&
      !permittedActiveAdvance(branchRecord.remoteHeadSha, beforeSha, workItem)
    ) {
      addFinding(findings, { path: eventRef, rule: "push-event-before-sha-mismatch", source: beforeSha });
    }
  } else if (beforeSha !== ZERO_SHA) {
    addFinding(findings, { path: eventRef, rule: "push-event-expected-new-branch", source: beforeSha });
  }
  if (afterSha !== branchRecord.headSha && !permittedActiveAdvance(branchRecord.headSha, afterSha, workItem)) {
    addFinding(findings, { path: eventRef, rule: "push-event-head-not-permitted", source: afterSha });
  }
}

function commitsForPrePush(updates, remoteName, findings, registry = null) {
  const commits = new Set();
  const trees = new Set();
  for (const update of updates) {
    const { localRef, localSha, remoteRef, remoteSha } = update;
    if (localSha === ZERO_SHA) {
      if (!registry || !activeRefDeletionAuthorization(registry, remoteRef, remoteSha)) {
        addFinding(findings, {
          path: remoteRef,
          rule: "ref-deletion-not-authorized",
          source: remoteSha
        });
      }
      continue;
    }
    if (!gitObjectExists(`${localSha}^{commit}`)) {
      addFinding(findings, { path: localRef, rule: "non-commit-ref-update-not-authorized", source: localSha });
      continue;
    }
    trees.add(localSha);
    let listed;
    if (remoteSha !== ZERO_SHA) {
      if (!gitObjectExists(`${remoteSha}^{commit}`)) {
        addFinding(findings, { path: remoteRef, rule: "remote-base-object-unavailable", source: remoteSha });
        continue;
      }
      const fastForward = git(["merge-base", "--is-ancestor", remoteSha, localSha], { allowFailure: true }).status === 0;
      if (!fastForward) {
        addFinding(findings, { path: remoteRef, rule: "non-fast-forward-update-not-authorized", source: remoteSha });
      }
      listed = revList([localSha, `^${remoteSha}`]);
    } else {
      const trustedBaseline = remoteName && remoteName !== "." ? `${remoteName}/main` : "main";
      listed = gitObjectExists(`${trustedBaseline}^{commit}`)
        ? revList([localSha, `^${trustedBaseline}`])
        : revList([localSha]);
      if (listed.length === 0) listed = [localSha];
    }
    for (const commit of listed) commits.add(commit);
  }
  return { commits: [...commits], trees: [...trees] };
}

function printSecurityResult(findings, metadata) {
  const cleaned = findings
    .map(({ key: _key, ...finding }) => finding)
    .sort((left, right) => `${left.path}\u0000${left.rule}`.localeCompare(`${right.path}\u0000${right.rule}`));
  if (cleaned.length === 0) {
    process.stdout.write(
      `SENA_SECURITY_GATE pass trees=${metadata.treeCount} commits=${metadata.commitCount} staged=${metadata.stagedCount ?? 0} localFiles=${metadata.localFileCount}\n`
    );
    return 0;
  }
  for (const finding of cleaned) {
    const source = safeSourceForLog(finding.source);
    process.stderr.write(
      `SENA_SECURITY_GATE blocked path=${safePathForLog(finding.path)} rule=${finding.rule} source=${source}\n`
    );
  }
  process.stderr.write(`SENA_SECURITY_GATE blocked findingCount=${cleaned.length}; secret values were not printed.\n`);
  return 1;
}

function runSecurity(flags) {
  const findings = [];
  const scanned = new Set();
  const trees = new Set(flagValues(flags, "tree"));
  const commits = new Set();
  let localFileCount = 0;
  let stagedCount = 0;

  for (const range of flagValues(flags, "range")) {
    for (const commit of revList([range])) commits.add(commit);
  }

  const newBranchHeads = flagValues(flags, "new-branch");
  for (const head of newBranchHeads) {
    const baseline = flagValues(flags, "baseline")[0] ?? "origin/main";
    const listed = gitObjectExists(`${baseline}^{commit}`)
      ? revList([head, `^${baseline}`])
      : revList([head]);
    for (const commit of listed.length > 0 ? listed : [head]) commits.add(commit);
    trees.add(head);
  }

  if (flags.has("pre-push")) {
    const input = readFileSync(0, "utf8");
    const remoteName = flagValues(flags, "remote-name")[0] ?? "origin";
    const updates = parsePrePushUpdates(input);
    let deletionRegistry = null;
    if (updates.some((update) => update.localSha === ZERO_SHA)) {
      deletionRegistry = loadProtectedMainAuthorizationRegistry(flags)?.parsed ?? null;
    }
    const prePush = commitsForPrePush(updates, remoteName, findings, deletionRegistry);
    for (const commit of prePush.commits) commits.add(commit);
    for (const tree of prePush.trees) trees.add(tree);
  }

  if (flags.has("push-event")) {
    const deleted = flagValues(flags, "event-deleted")[0] === "true";
    const afterSha = flagValues(flags, "event-after")[0] ?? ZERO_SHA;
    const authorizationRegistry =
      deleted || afterSha === ZERO_SHA
        ? loadProtectedMainAuthorizationRegistry(flags)
        : null;
    const registryPath = flagValues(flags, "registry")[0] ?? DEFAULT_REGISTRY;
    const { parsed: registry } = authorizationRegistry ?? loadRegistry(registryPath);
    const validation = validateRegistry(registry);
    if (validation.errors.length > 0) {
      throw new Error(`push-event registry is invalid: ${validation.errors.join("; ")}`);
    }
    addPushEventPolicyFindings(flags, registry, findings, {
      protectedMainAuthorization: Boolean(authorizationRegistry)
    });
  }

  if (flags.has("paths-from-stdin")) {
    for (const path of readFileSync(0, "utf8").split("\n").filter(Boolean)) {
      const rule = classifySensitivePath(path);
      if (rule) addFinding(findings, { path: normalizeRepoPath(path), rule, source: "stdin" });
    }
  }

  if (flags.has("files-from-stdin")) {
    for (const localPath of readFileSync(0, "utf8").split("\n").filter(Boolean)) {
      localFileCount += 1;
      const path = basename(localPath);
      const pathRule = classifySensitivePath(path);
      if (pathRule) addFinding(findings, { path, rule: pathRule, source: "local-file" });
      const buffer = readFileSync(localPath);
      const oid = gitBlobId(buffer);
      if (KNOWN_SENSITIVE_BLOB_OIDS.has(oid)) {
        addFinding(findings, { path, rule: "known-sensitive-blob-oid", source: "local-file" });
      }
      for (const rule of classifySensitiveContent(buffer)) {
        addFinding(findings, { path, rule, source: "local-file" });
      }
    }
  }

  if (flags.has("staged")) {
    const entries = stagedEntries(findings);
    stagedCount = entries.length;
    for (const entry of entries) scanEntry(entry, "index", findings, scanned);
  }

  if (
    trees.size === 0 &&
    commits.size === 0 &&
    findings.length === 0 &&
    !flags.has("files-from-stdin") &&
    !flags.has("paths-from-stdin") &&
    !flags.has("staged") &&
    !flags.has("pre-push") &&
    !flags.has("push-event")
  ) {
    trees.add("HEAD");
  }
  for (const tree of trees) scanTree(tree, findings, scanned);
  scanCommits([...commits], findings, scanned);

  const exitCode = printSecurityResult(findings, {
    treeCount: trees.size,
    commitCount: commits.size,
    localFileCount,
    stagedCount
  });
  process.exitCode = exitCode;
}

function runPushPolicy(flags) {
  const findings = [];
  const input = readFileSync(0, "utf8");
  const remoteName = flagValues(flags, "remote-name")[0] ?? "origin";
  const remoteLocation = process.env.SENA_GOVERNANCE_REMOTE_LOCATION ?? "";
  const updates = parsePrePushUpdates(input);
  if (updates.length !== 1) {
    throw new Error("push-policy requires exactly one current-branch ref update");
  }
  const localSha = updates[0].localSha;
  if (!isSha(localSha)) {
    throw new Error("push-policy requires one well-formed ref update");
  }
  const isDeletion = localSha === ZERO_SHA;
  if (flags.has("identity-only")) {
    const identityCommit = isDeletion ? gitText(["rev-parse", "HEAD"]).trim() : localSha;
    const { parsed: identityRegistry } = loadRegistryFromCommit(identityCommit);
    const identityValidation = validateRegistry(identityRegistry);
    appendHostPhysicalCustodyErrors(identityRegistry, identityValidation.errors);
    if (identityValidation.errors.length > 0) {
      throw new Error("push-policy identity registry snapshot is invalid");
    }
    addRemoteIdentityFindings(remoteName, remoteLocation, identityRegistry, findings);
    const identityFindings = findings
      .map(({ key: _key, ...finding }) => finding)
      .sort((left, right) => `${left.path}\0${left.rule}`.localeCompare(`${right.path}\0${right.rule}`));
    if (identityFindings.length === 0) {
      process.stdout.write("SENA_PUSH_IDENTITY pass\n");
      return;
    }
    for (const finding of identityFindings) {
      process.stderr.write(
        `SENA_PUSH_POLICY blocked path=${safePathForLog(finding.path)} rule=${finding.rule} source=${safeSourceForLog(finding.source)}\n`
      );
    }
    process.stderr.write(
      `SENA_PUSH_POLICY blocked findingCount=${identityFindings.length}; secret values were not printed.\n`
    );
    process.exitCode = 1;
    return;
  }
  const authorizationRegistry = isDeletion
    ? loadProtectedMainAuthorizationRegistry(flags, { required: true })
    : null;
  if (!isDeletion && flagValues(flags, "authorization-registry-commit").length > 0) {
    throw new Error("protected-main deletion authorization cannot be attached to a non-deletion update");
  }
  const registryCommit = authorizationRegistry?.commit ?? localSha;
  if (!gitObjectExists(`${registryCommit}^{commit}`)) {
    throw new Error("push-policy registry commit is unavailable");
  }
  const { parsed: registry } = authorizationRegistry ?? loadRegistryFromCommit(registryCommit);
  const validation = validateRegistry(registry);
  appendHostPhysicalCustodyErrors(registry, validation.errors);
  if (validation.errors.length > 0) {
    throw new Error("push-policy outgoing-commit registry snapshot is invalid");
  }
  addPrePushPolicyFindings(updates, remoteName, remoteLocation, registry, findings);
  commitsForPrePush(updates, remoteName, findings, registry);
  const cleaned = findings
    .map(({ key: _key, ...finding }) => finding)
    .sort((left, right) => `${left.path}\0${left.rule}`.localeCompare(`${right.path}\0${right.rule}`));
  if (cleaned.length === 0) {
    process.stdout.write(`SENA_PUSH_POLICY pass updates=${updates.length}\n`);
    return;
  }
  for (const finding of cleaned) {
    process.stderr.write(
      `SENA_PUSH_POLICY blocked path=${safePathForLog(finding.path)} rule=${finding.rule} source=${safeSourceForLog(finding.source)}\n`
    );
  }
  process.stderr.write(`SENA_PUSH_POLICY blocked findingCount=${cleaned.length}; secret values were not printed.\n`);
  process.exitCode = 1;
}

function loadRegistry(registryPath = DEFAULT_REGISTRY) {
  const parsed = JSON.parse(readFileSync(registryPath, "utf8"));
  return { parsed, registryPath };
}

function parseRegistryBytes(bytes, source) {
  try {
    return { parsed: JSON.parse(String(bytes)), registryPath: source };
  } catch {
    throw new Error(`registry snapshot is not valid JSON: ${source}`);
  }
}

function loadRegistryFromIndex() {
  const result = git(["show", `:${REGISTRY_REPO_PATH}`], { allowFailure: true });
  if (result.status !== 0) {
    throw new Error("stage-0 registry snapshot is absent or conflicted in the index");
  }
  return parseRegistryBytes(result.stdout, "index");
}

function loadRegistryFromCommit(commit) {
  if (!isSha(commit) || !gitObjectExists(`${commit}^{commit}`)) {
    throw new Error("registry commit snapshot requires a valid commit SHA");
  }
  const result = git(["show", `${commit}:${REGISTRY_REPO_PATH}`], { allowFailure: true });
  if (result.status !== 0) {
    throw new Error("outgoing commit does not contain the governance registry snapshot");
  }
  return parseRegistryBytes(result.stdout, `commit:${commit}`);
}

function loadRegistryForFlags(flags) {
  const fromIndex = flags.has("registry-from-index");
  const fromCommits = flagValues(flags, "registry-from-commit");
  const explicitPaths = flagValues(flags, "registry");
  const sourceCount = Number(fromIndex) + fromCommits.length + explicitPaths.length;
  if (sourceCount > 1) throw new Error("choose exactly one registry snapshot source");
  if (fromIndex) return loadRegistryFromIndex();
  if (fromCommits.length === 1) return loadRegistryFromCommit(fromCommits[0]);
  return loadRegistry(explicitPaths[0] ?? DEFAULT_REGISTRY);
}

function stagedChangedPaths() {
  return gitText(["diff", "--cached", "--name-only", "--diff-filter=ACMRTD", "--no-renames", "-z"])
    .split("\0")
    .filter(Boolean);
}

function runWritePolicy(flags) {
  if (!flags.has("registry-from-index") || !flags.has("staged")) {
    throw new Error("write-policy requires --registry-from-index --staged");
  }
  const { parsed: registry } = loadRegistryForFlags(flags);
  const validation = validateRegistry(registry);
  appendHostPhysicalCustodyErrors(registry, validation.errors);
  if (validation.errors.length > 0) throw new Error("index registry snapshot is invalid");

  const findings = [];
  const branchResult = git(["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true });
  const branchName = branchResult.status === 0 ? String(branchResult.stdout).trim() : null;
  const currentItem = (registry.workItems ?? []).find(
    (item) => sameExistingPath(item.worktreePath, REPO_ROOT) && item.branch === branchName
  );
  const branchRecord = (registry.branches ?? []).find((branch) => branch.name === branchName);
  const expectedRef = branchName ? `refs/heads/${branchName}` : "detached-head";

  if (!branchName || !currentItem || !branchRecord) {
    addFinding(findings, { path: expectedRef, rule: "index-writer-unregistered", source: "write-policy" });
  } else {
    if (
      !ACTIVE_WRITE_DISPOSITIONS.has(currentItem.disposition) ||
      currentItem.disposition !== branchRecord.disposition ||
      currentItem.ownerKey !== branchRecord.ownerKey
    ) {
      addFinding(findings, { path: expectedRef, rule: "index-writer-ownership-mismatch", source: "write-policy" });
    }
    for (const path of stagedChangedPaths()) {
      if (!pathIsAllowed(path, currentItem.allowedPaths)) {
        addFinding(findings, { path, rule: "staged-path-outside-commit-registry-allowlist", source: "index" });
      }
    }
  }
  if (gitText(["ls-files", "--unmerged", "-z"]).length > 0) {
    addFinding(findings, { path: "index", rule: "unmerged-index-not-authorized", source: "write-policy" });
  }

  const cleaned = findings.map(({ key: _key, ...finding }) => finding);
  if (cleaned.length === 0) {
    process.stdout.write(`SENA_WRITE_POLICY pass staged=${stagedChangedPaths().length} registrySource=index\n`);
    return;
  }
  for (const finding of cleaned) {
    process.stderr.write(
      `SENA_WRITE_POLICY blocked path=${safePathForLog(finding.path)} rule=${finding.rule} source=${safeSourceForLog(finding.source)}\n`
    );
  }
  process.stderr.write(`SENA_WRITE_POLICY blocked findingCount=${cleaned.length}; registrySource=index\n`);
  process.exitCode = 1;
}

function isIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && value.includes("T");
}

function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40,64}$/i.test(value);
}

function isExpectedClose(value) {
  return isIsoTimestamp(value) || (typeof value === "string" && value.startsWith("owner-gated:"));
}

function isNullableIsoTimestamp(value) {
  return value === null || isIsoTimestamp(value);
}

function timestampIsInFuture(value, now = Date.now(), toleranceMs = 5 * 60 * 1000) {
  return isIsoTimestamp(value) && Date.parse(value) > now + toleranceMs;
}

function pathIsWithin(parent, child) {
  const parentPath = resolve(parent);
  const childPath = resolve(child);
  return childPath === parentPath || childPath.startsWith(`${parentPath}${sep}`);
}

function workItemRequiresPhysicalCustody(item, registry) {
  const branch = (registry.branches ?? []).find((candidate) => candidate.name === item.branch);
  return Boolean(
    ACTIVE_WRITE_DISPOSITIONS.has(item.disposition) ||
    item.cleanupAuthorization?.status === "active" ||
    branch?.disposition === "security-quarantine"
  );
}

function physicalWorkItemCustodyError(registryRepoResolution, item) {
  const custodyLabel = ACTIVE_WRITE_DISPOSITIONS.has(item.disposition)
    ? "active workItem physical repo/worktreePath/cwd custody"
    : "authorization-bearing workItem physical custody";
  const itemRepoResolution = existingPathResolution(item.repo);
  const worktreeResolution = existingPathResolution(item.worktreePath);
  const cwdResolution = existingPathResolution(item.cwd);
  if (!itemRepoResolution.ok || !worktreeResolution.ok || !cwdResolution.ok) {
    return `${custodyLabel} cannot be resolved: ${item.taskId ?? "<unknown>"}`;
  }
  if (
    !registryRepoResolution.ok ||
    itemRepoResolution.path !== registryRepoResolution.path ||
    !pathIsWithin(registryRepoResolution.path, worktreeResolution.path) ||
    !pathIsWithin(worktreeResolution.path, cwdResolution.path)
  ) {
    return `${custodyLabel} escapes the control root: ${item.taskId ?? "<unknown>"}`;
  }
  return null;
}

function appendHostPhysicalCustodyErrors(registry, errors) {
  const controlRootResolution = existingPathResolution(CONTROL_ROOT);
  const registryRepoResolution = existingPathResolution(registry.repo);
  if (!controlRootResolution.ok || !registryRepoResolution.ok) {
    errors.push("host authorization control-root/repository custody cannot be physically resolved");
  } else if (controlRootResolution.path !== registryRepoResolution.path) {
    errors.push("host authorization registry repository differs from the physical Git control root");
  }

  for (const item of registry.workItems ?? []) {
    if (!workItemRequiresPhysicalCustody(item, registry)) continue;
    const custodyError = physicalWorkItemCustodyError(registryRepoResolution, item);
    if (custodyError) errors.push(custodyError);
  }
}

function ageHours(value, now = Date.now()) {
  return (now - Date.parse(value)) / (60 * 60 * 1000);
}

function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const leftSet = new Set(left);
  return leftSet.size === left.length && right.every((value) => leftSet.has(value));
}

function validateRegistry(registry, { now = Date.now() } = {}) {
  const errors = [];
  const warnings = [];
  if (registry.schemaVersion !== "sena-repo-governance/v1") errors.push("unsupported schemaVersion");
  if (!isIsoTimestamp(registry.updatedAt)) errors.push("updatedAt must be an ISO timestamp");
  if (!registry.policy || registry.policy.maxWriteWorktrees !== MAX_ACTIVE_WRITE_WORKTREES) {
    errors.push(`policy.maxWriteWorktrees must equal ${MAX_ACTIVE_WRITE_WORKTREES}`);
  }
  const remoteIdentity = registry.policy?.remoteIdentity;
  if (
    !remoteIdentity ||
    remoteIdentity.name !== EXPECTED_REMOTE_IDENTITY.name ||
    remoteIdentity.provider !== EXPECTED_REMOTE_IDENTITY.provider ||
    remoteIdentity.owner !== EXPECTED_REMOTE_IDENTITY.owner ||
    remoteIdentity.repository !== EXPECTED_REMOTE_IDENTITY.repository
  ) {
    errors.push("policy.remoteIdentity must match the hard-coded SENA GitHub repository identity");
  }
  const freezeExceptionBindings = registry.policy?.freezeExceptionBindings;
  if (!Array.isArray(freezeExceptionBindings) || freezeExceptionBindings.length === 0) {
    errors.push("policy.freezeExceptionBindings must be a non-empty array");
  }
  const freezeBindingKeys = new Set();
  for (const binding of freezeExceptionBindings ?? []) {
    const key = `${binding.exception ?? ""}\0${binding.taskId ?? ""}`;
    if (
      !FREEZE_EXCEPTIONS.has(binding.exception) ||
      typeof binding.taskId !== "string" ||
      typeof binding.ownerKey !== "string" ||
      typeof binding.ownerLane !== "string" ||
      typeof binding.branch !== "string" ||
      !Array.isArray(binding.allowedPaths) ||
      binding.allowedPaths.length === 0 ||
      typeof binding.authorizationBasis !== "string" ||
      binding.authorizationBasis.length === 0
    ) {
      errors.push(`invalid freeze-exception binding: ${binding.taskId ?? "<unknown>"}`);
    }
    if (freezeBindingKeys.has(key)) errors.push(`duplicate freeze-exception binding: ${key}`);
    freezeBindingKeys.add(key);
  }
  const refDeletionAuthorizations = registry.policy?.refDeletionAuthorizations;
  if (!Array.isArray(refDeletionAuthorizations)) {
    errors.push("policy.refDeletionAuthorizations must be an array");
  }
  const refDeletionAuthorizationIds = new Set();
  const activeRefDeletionTargets = new Set();
  const credentialIncident = registry.incident?.credentialExposure;
  const quarantineRuleset = registry.policy?.githubControlPlane?.credentialQuarantineRuleset;
  for (const authorization of refDeletionAuthorizations ?? []) {
    const authorizedAtMs = Date.parse(authorization.authorizedAt);
    const expiresAtMs = Date.parse(authorization.expiresAt);
    const providerReadbackAtMs = Date.parse(authorization.providerReadbackAt);
    const consumedAtMs = Date.parse(authorization.consumedAt);
    const expectedIncidentRef = credentialIncident?.remoteBranch
      ? `refs/heads/${credentialIncident.remoteBranch}`
      : null;
    const operatorItem = (registry.workItems ?? []).find(
      (item) =>
        item.branch === authorization.operatorBranch &&
        item.taskId === authorization.operatorTaskId &&
        item.ownerKey === authorization.operatorOwnerKey
    );
    if (
      typeof authorization.id !== "string" ||
      authorization.id.length === 0 ||
      !REF_DELETION_AUTHORIZATION_STATUSES.has(authorization.status) ||
      typeof authorization.ref !== "string" ||
      !authorization.ref.startsWith("refs/heads/") ||
      authorization.ref === "refs/heads/main" ||
      !/^[0-9a-f]{40}$/.test(authorization.expectedOldSha) ||
      authorization.expectedOldSha === ZERO_SHA ||
      authorization.purpose !== "credential-incident-containment" ||
      typeof authorization.operatorBranch !== "string" ||
      typeof authorization.operatorTaskId !== "string" ||
      typeof authorization.operatorOwnerKey !== "string" ||
      typeof authorization.githubActor !== "string" ||
      authorization.githubActor.length === 0 ||
      !Number.isInteger(authorization.githubActorId) ||
      authorization.githubActorId <= 0 ||
      !Number.isInteger(authorization.remoteRulesetId) ||
      authorization.remoteRulesetId <= 0 ||
      typeof authorization.remoteRulesetName !== "string" ||
      authorization.remoteRulesetName.length === 0 ||
      authorization.remoteRulesetEnforcement !== "active" ||
      typeof authorization.authorizedBy !== "string" ||
      authorization.authorizedBy.length === 0 ||
      typeof authorization.authorizationBasis !== "string" ||
      authorization.authorizationBasis.length === 0 ||
      !isIsoTimestamp(authorization.authorizedAt) ||
      !isIsoTimestamp(authorization.expiresAt) ||
      Date.parse(authorization.expiresAt) <= Date.parse(authorization.authorizedAt) ||
      authorization.exactLeaseRequired !== true ||
      authorization.oneShot !== true ||
      !Object.hasOwn(authorization, "providerReadbackAt") ||
      !isNullableIsoTimestamp(authorization.providerReadbackAt) ||
      !Object.hasOwn(authorization, "providerEvidenceId") ||
      ![null, "string"].includes(authorization.providerEvidenceId === null ? null : typeof authorization.providerEvidenceId) ||
      !Object.hasOwn(authorization, "providerEvidenceSha256") ||
      ![null, "string"].includes(
        authorization.providerEvidenceSha256 === null ? null : typeof authorization.providerEvidenceSha256
      ) ||
      !Object.hasOwn(authorization, "consumedAt") ||
      !isNullableIsoTimestamp(authorization.consumedAt) ||
      !Object.hasOwn(authorization, "deletionEventId") ||
      ![null, "string"].includes(authorization.deletionEventId === null ? null : typeof authorization.deletionEventId) ||
      !Object.hasOwn(authorization, "executedBy") ||
      ![null, "string"].includes(authorization.executedBy === null ? null : typeof authorization.executedBy) ||
      !Object.hasOwn(authorization, "remoteRefAbsenceReadbackAt") ||
      !isNullableIsoTimestamp(authorization.remoteRefAbsenceReadbackAt) ||
      !Object.hasOwn(authorization, "result") ||
      ![null, "string"].includes(authorization.result === null ? null : typeof authorization.result)
    ) {
      errors.push(`invalid ref-deletion authorization: ${authorization.id ?? "<unknown>"}`);
    }
    if (
      authorization.ref !== expectedIncidentRef ||
      authorization.expectedOldSha !== credentialIncident?.commitSha
    ) {
      errors.push(`ref-deletion authorization does not bind the credential incident: ${authorization.id ?? "<unknown>"}`);
    }
    if (!operatorItem) {
      errors.push(`ref-deletion authorization operator is not a registered workItem: ${authorization.id ?? "<unknown>"}`);
    }
    if (
      !quarantineRuleset ||
      quarantineRuleset.id !== authorization.remoteRulesetId ||
      quarantineRuleset.name !== authorization.remoteRulesetName ||
      quarantineRuleset.enforcement !== "active" ||
      quarantineRuleset.targetRef !== authorization.ref ||
      !sameStringSet(quarantineRuleset.rules, ["creation", "deletion", "non_fast_forward"]) ||
      quarantineRuleset.soleBypassActor !== authorization.githubActor ||
      quarantineRuleset.soleBypassActorId !== authorization.githubActorId
    ) {
      errors.push(`ref-deletion authorization is not bound to the quarantine ruleset: ${authorization.id ?? "<unknown>"}`);
    }
    if (
      timestampIsInFuture(authorization.authorizedAt, now) ||
      timestampIsInFuture(authorization.providerReadbackAt, now) ||
      timestampIsInFuture(authorization.consumedAt, now) ||
      timestampIsInFuture(authorization.remoteRefAbsenceReadbackAt, now) ||
      (Number.isFinite(authorizedAtMs) && Number.isFinite(expiresAtMs) && expiresAtMs - authorizedAtMs > 72 * 60 * 60 * 1000)
    ) {
      errors.push(`ref-deletion authorization timestamps exceed policy: ${authorization.id ?? "<unknown>"}`);
    }
    if (authorization.status === "active" && !isIsoTimestamp(authorization.providerReadbackAt)) {
      errors.push(`active ref-deletion authorization lacks provider readback: ${authorization.id ?? "<unknown>"}`);
    }
    if (authorization.status === "active" && (!Number.isFinite(expiresAtMs) || expiresAtMs <= now)) {
      errors.push(`active ref-deletion authorization is expired: ${authorization.id ?? "<unknown>"}`);
    }
    if (
      authorization.status === "pending-provider-readback" &&
      (authorization.providerReadbackAt !== null ||
        authorization.providerEvidenceId !== null ||
        authorization.providerEvidenceSha256 !== null ||
        authorization.consumedAt !== null ||
        authorization.deletionEventId !== null ||
        authorization.executedBy !== null ||
        authorization.remoteRefAbsenceReadbackAt !== null ||
        authorization.result !== null)
    ) {
      errors.push(`pending ref-deletion authorization contains completion evidence: ${authorization.id ?? "<unknown>"}`);
    }
    if (
      isIsoTimestamp(authorization.providerReadbackAt) &&
      (!Number.isFinite(authorizedAtMs) || providerReadbackAtMs < authorizedAtMs)
    ) {
      errors.push(`ref-deletion provider readback predates authorization: ${authorization.id ?? "<unknown>"}`);
    }
    if (
      authorization.status === "active" &&
      (typeof authorization.providerEvidenceId !== "string" ||
        authorization.providerEvidenceId.length === 0 ||
        !/^[0-9a-f]{64}$/.test(authorization.providerEvidenceSha256) ||
        authorization.consumedAt !== null ||
        authorization.deletionEventId !== null ||
        authorization.executedBy !== null ||
        authorization.remoteRefAbsenceReadbackAt !== null ||
        authorization.result !== null)
    ) {
      errors.push(`active ref-deletion authorization is already consumed: ${authorization.id ?? "<unknown>"}`);
    }
    if (
      authorization.status === "consumed" &&
      (!isIsoTimestamp(authorization.providerReadbackAt) ||
        typeof authorization.providerEvidenceId !== "string" ||
        authorization.providerEvidenceId.length === 0 ||
        !/^[0-9a-f]{64}$/.test(authorization.providerEvidenceSha256) ||
        !isIsoTimestamp(authorization.consumedAt) ||
        typeof authorization.deletionEventId !== "string" ||
        authorization.deletionEventId.length === 0 ||
        authorization.executedBy !== authorization.githubActor ||
        !isIsoTimestamp(authorization.remoteRefAbsenceReadbackAt) ||
        authorization.result !== "deleted")
    ) {
      errors.push(`consumed ref-deletion authorization lacks event custody: ${authorization.id ?? "<unknown>"}`);
    }
    if (
      authorization.status === "consumed" &&
      (consumedAtMs < providerReadbackAtMs ||
        consumedAtMs < authorizedAtMs ||
        Date.parse(authorization.remoteRefAbsenceReadbackAt) < consumedAtMs)
    ) {
      errors.push(`consumed ref-deletion authorization has invalid timestamp order: ${authorization.id ?? "<unknown>"}`);
    }
    if (refDeletionAuthorizationIds.has(authorization.id)) {
      errors.push(`duplicate ref-deletion authorization: ${authorization.id}`);
    }
    refDeletionAuthorizationIds.add(authorization.id);
    if (authorization.status === "active") {
      const target = `${authorization.ref}\0${authorization.expectedOldSha}`;
      if (activeRefDeletionTargets.has(target)) {
        errors.push(`duplicate active ref-deletion target: ${authorization.ref}`);
      }
      activeRefDeletionTargets.add(target);
    }
  }
  const localRefRetirementAuthorizations = registry.policy?.localRefRetirementAuthorizations ?? [];
  if (!Array.isArray(localRefRetirementAuthorizations)) {
    errors.push("policy.localRefRetirementAuthorizations must be an array");
  }
  const localRetirementAuthorizationIds = new Set();
  const activeLocalRetirementTargets = new Set();
  let activeLocalRetirementCount = 0;
  for (const authorization of Array.isArray(localRefRetirementAuthorizations)
    ? localRefRetirementAuthorizations
    : []) {
    if (!LOCAL_REF_RETIREMENT_AUTHORIZATION_ID_PATTERN.test(authorization.id ?? "")) {
      errors.push("rule=local-ref-retirement-authorization-id-invalid");
    }
    const custody = authorization.custody;
    const deletionRelease = authorization.deletionRelease;
    const operatorItem = (registry.workItems ?? []).find(
      (item) =>
        item.branch === authorization.operatorBranch &&
        item.taskId === authorization.operatorTaskId &&
        item.ownerKey === authorization.operatorOwnerKey
    );
    const targetBranchName = authorization.ref?.startsWith("refs/heads/")
      ? authorization.ref.slice("refs/heads/".length)
      : null;
    const targetBranchRecord = (registry.branches ?? []).find(
      (branch) => branch.name === targetBranchName
    );
    const commonInvalid =
      typeof authorization.id !== "string" ||
      authorization.id.length === 0 ||
      !LOCAL_REF_RETIREMENT_AUTHORIZATION_STATUSES.has(authorization.status) ||
      authorization.purpose !== "archive-ref-retirement" ||
      !(
        authorization.predecessorAuthorizationId === null ||
        (typeof authorization.predecessorAuthorizationId === "string" &&
          authorization.predecessorAuthorizationId.length > 0)
      ) ||
      typeof authorization.ref !== "string" ||
      !authorization.ref.startsWith("refs/heads/") ||
      authorization.ref === "refs/heads/main" ||
      !isSha(authorization.expectedOldSha) ||
      authorization.expectedOldSha === ZERO_SHA ||
      !BRANCH_DISPOSITIONS.has(authorization.targetDispositionBeforeRetirement) ||
      !BRANCH_DISPOSITIONS.has(authorization.targetDispositionAfterRetirement) ||
      authorization.effectiveOnlyAfterAuthorizationReachesProtectedMain !== true ||
      authorization.exactCasRequired !== true ||
      authorization.ordinaryBranchDAllowed !== false ||
      authorization.forceBranchDAllowed !== false ||
      authorization.historyRewriteAllowed !== false ||
      authorization.oneShot !== true ||
      typeof authorization.operatorBranch !== "string" ||
      typeof authorization.operatorTaskId !== "string" ||
      typeof authorization.operatorOwnerKey !== "string" ||
      typeof authorization.authorizedBy !== "string" ||
      authorization.authorizedBy.length === 0 ||
      typeof authorization.authorizationBasis !== "string" ||
      authorization.authorizationBasis.length === 0 ||
      !isIsoTimestamp(authorization.authorizedAt) ||
      !isIsoTimestamp(authorization.expiresAt) ||
      Date.parse(authorization.expiresAt) <= Date.parse(authorization.authorizedAt) ||
      authorization.registeredWorktreeOccupancyRequired !== "none" ||
      authorization.remoteHeadRequiredAbsent !== true ||
      !custody ||
      typeof custody.kind !== "string" ||
      typeof custody.root !== "string" ||
      typeof custody.manifestPath !== "string" ||
      !/^[0-9a-f]{64}$/.test(custody.manifestSha256 ?? "") ||
      typeof custody.bundlePath !== "string" ||
      !/^[0-9a-f]{64}$/.test(custody.bundleSha256 ?? "") ||
      !Number.isInteger(custody.bundleBytes) ||
      custody.bundleBytes <= 0 ||
      typeof custody.bundleRef !== "string" ||
      typeof authorization.receiptDirectory !== "string" ||
      authorization.receiptDirectory.length === 0 ||
      !Object.hasOwn(authorization, "deletionRelease") ||
      !(
        deletionRelease === null ||
        (typeof deletionRelease === "object" && !Array.isArray(deletionRelease))
      ) ||
      !Object.hasOwn(authorization, "authorizationRegistryCommit") ||
      !(
        authorization.authorizationRegistryCommit === null ||
        isSha(authorization.authorizationRegistryCommit)
      ) ||
      !Object.hasOwn(authorization, "eventId") ||
      !(
        authorization.eventId === null ||
        /^[0-9a-f]{64}$/.test(authorization.eventId)
      ) ||
      !Object.hasOwn(authorization, "consumedAt") ||
      !isNullableIsoTimestamp(authorization.consumedAt) ||
      !Object.hasOwn(authorization, "executedBy") ||
      ![null, "string"].includes(authorization.executedBy === null ? null : typeof authorization.executedBy) ||
      !Object.hasOwn(authorization, "localRefAbsenceReadbackAt") ||
      !isNullableIsoTimestamp(authorization.localRefAbsenceReadbackAt) ||
      !Object.hasOwn(authorization, "result") ||
      ![null, "string"].includes(authorization.result === null ? null : typeof authorization.result) ||
      !Object.hasOwn(authorization, "preparedReceiptPath") ||
      ![null, "string"].includes(
        authorization.preparedReceiptPath === null ? null : typeof authorization.preparedReceiptPath
      ) ||
      !Object.hasOwn(authorization, "preparedReceiptSha256") ||
      ![null, "string"].includes(
        authorization.preparedReceiptSha256 === null ? null : typeof authorization.preparedReceiptSha256
      ) ||
      !Object.hasOwn(authorization, "completedReceiptPath") ||
      ![null, "string"].includes(
        authorization.completedReceiptPath === null ? null : typeof authorization.completedReceiptPath
      ) ||
      !Object.hasOwn(authorization, "completedReceiptSha256") ||
      ![null, "string"].includes(
        authorization.completedReceiptSha256 === null ? null : typeof authorization.completedReceiptSha256
      );
    const ordinaryCustodyInvalid =
      authorization.purpose === "archive-ref-retirement" &&
      (custody?.kind !== "ordinary-archive" ||
        authorization.targetDispositionAfterRetirement !== "archived" ||
        typeof custody.tagRef !== "string" ||
        !custody.tagRef.startsWith("refs/tags/archive/") ||
        custody.bundleRef !== custody.tagRef ||
        !isSha(custody.tagObjectSha) ||
        custody.peeledCommitSha !== authorization.expectedOldSha);
    const deletionReleaseInvalid =
      (authorization.status === "pending-release" && deletionRelease !== null) ||
      (new Set(["active", "consumed"]).has(authorization.status) &&
        !localRefRetirementDeletionReleaseIsStructurallyValid(authorization));
    if (commonInvalid || ordinaryCustodyInvalid) {
      errors.push(`invalid local-ref retirement authorization: ${authorization.id ?? "<unknown>"}`);
    }
    if (deletionReleaseInvalid) {
      errors.push(
        `${authorization.status === "pending-release" ? "pending" : "active"} local-ref retirement authorization lacks deletion release: ${authorization.id ?? "<unknown>"}`
      );
    }
    if (!operatorItem) {
      errors.push(
        `local-ref retirement authorization operator is not a registered workItem: ${authorization.id ?? "<unknown>"}`
      );
    }
    if (
      !targetBranchRecord ||
      targetBranchRecord.headSha !== authorization.expectedOldSha ||
      targetBranchRecord.retirementAuthorizationId !== authorization.id ||
      (new Set(["pending-release", "active"]).has(authorization.status) &&
        (targetBranchRecord.localRefState !== "present" ||
          targetBranchRecord.disposition !== authorization.targetDispositionBeforeRetirement)) ||
      (authorization.status === "consumed" &&
        (targetBranchRecord.localRefState !== "retired" ||
          targetBranchRecord.disposition !== authorization.targetDispositionAfterRetirement))
    ) {
      errors.push(`local-ref retirement authorization target state is invalid: ${authorization.id ?? "<unknown>"}`);
    }
    if (
      timestampIsInFuture(authorization.authorizedAt, now) ||
      timestampIsInFuture(authorization.consumedAt, now) ||
      timestampIsInFuture(authorization.localRefAbsenceReadbackAt, now) ||
      timestampIsInFuture(deletionRelease?.releasedAt, now) ||
      Date.parse(authorization.expiresAt) - Date.parse(authorization.authorizedAt) > 72 * 60 * 60 * 1000
    ) {
      errors.push(`local-ref retirement authorization timestamps exceed policy: ${authorization.id ?? "<unknown>"}`);
    }
    if (
      authorization.status === "active" &&
      localRefRetirementDeletionReleaseIsStructurallyValid(authorization) &&
      Date.parse(deletionRelease.expiresAt) <= now
    ) {
      errors.push(`active local-ref retirement deletion release expired: ${authorization.id}`);
    }
    if (
      new Set(["pending-release", "active"]).has(authorization.status) &&
      (Date.parse(authorization.expiresAt) <= now ||
        authorization.authorizationRegistryCommit !== null ||
        authorization.eventId !== null ||
        authorization.consumedAt !== null ||
        authorization.executedBy !== null ||
        authorization.localRefAbsenceReadbackAt !== null ||
        authorization.result !== null ||
        authorization.preparedReceiptPath !== null ||
        authorization.preparedReceiptSha256 !== null ||
        authorization.completedReceiptPath !== null ||
        authorization.completedReceiptSha256 !== null)
    ) {
      errors.push(`active local-ref retirement authorization contains completion evidence: ${authorization.id}`);
    }
    if (
      authorization.status === "consumed" &&
      (!isSha(authorization.authorizationRegistryCommit) ||
        !/^[0-9a-f]{64}$/.test(authorization.eventId ?? "") ||
        !isIsoTimestamp(authorization.consumedAt) ||
        typeof authorization.executedBy !== "string" ||
        authorization.executedBy.length === 0 ||
        !isIsoTimestamp(authorization.localRefAbsenceReadbackAt) ||
        authorization.result !== "deleted" ||
        typeof authorization.preparedReceiptPath !== "string" ||
        authorization.preparedReceiptPath.length === 0 ||
        !/^[0-9a-f]{64}$/.test(authorization.preparedReceiptSha256 ?? "") ||
        typeof authorization.completedReceiptPath !== "string" ||
        authorization.completedReceiptPath.length === 0 ||
        !/^[0-9a-f]{64}$/.test(authorization.completedReceiptSha256 ?? ""))
    ) {
      errors.push(`consumed local-ref retirement authorization lacks custody: ${authorization.id}`);
    }
    if (localRetirementAuthorizationIds.has(authorization.id)) {
      errors.push(`duplicate local-ref retirement authorization: ${authorization.id}`);
    }
    localRetirementAuthorizationIds.add(authorization.id);
    if (authorization.status === "active") {
      activeLocalRetirementCount += 1;
      if (activeLocalRetirementTargets.has(authorization.ref)) {
        errors.push(`duplicate active local-ref retirement target: ${authorization.ref}`);
      }
      activeLocalRetirementTargets.add(authorization.ref);
    }
  }
  if (Array.isArray(localRefRetirementAuthorizations)) {
    for (const [index, authorization] of localRefRetirementAuthorizations.entries()) {
      const predecessor =
        typeof authorization.predecessorAuthorizationId === "string"
          ? localRefRetirementAuthorizations
              .slice(0, index)
              .find((entry) => entry.id === authorization.predecessorAuthorizationId)
          : null;
      if (
        (index === 0 && authorization.predecessorAuthorizationId !== null) ||
        (index > 0 && (!predecessor || predecessor.status !== "consumed"))
      ) {
        errors.push("rule=local-ref-retirement-predecessor-not-consumed");
      }
    }
  }
  if (activeLocalRetirementCount > 1) {
    errors.push("rule=local-ref-retirement-multiple-active");
  }
  if (!Array.isArray(registry.workItems)) errors.push("workItems must be an array");
  if (!Array.isArray(registry.branches)) errors.push("branches must be an array");
  if (!Array.isArray(registry.orphanWorktrees)) errors.push("orphanWorktrees must be an array");

  const activeWriters = [];
  const activeLaneCounts = { "integration-release": 0, feature: 0 };
  const branchOwners = new Map();
  for (const item of registry.workItems ?? []) {
    for (const key of [
      "taskId",
      "threadId",
      "repo",
      "cwd",
      "owner",
      "ownerKey",
      "ownerLane",
      "branch",
      "worktreePath",
      "baseSha",
      "headSha",
      "createdAt",
      "lastObservedAt",
      "nextReviewAt",
      "expectedCloseAt",
      "dirtyState",
      "disposition",
      "laneType"
    ]) {
      if (typeof item[key] !== "string" || item[key].length === 0) {
        errors.push(`workItem ${item.taskId ?? "<unknown>"} is missing ${key}`);
      }
    }
    if (!isSha(item.baseSha) || !isSha(item.headSha)) {
      errors.push(`workItem ${item.taskId ?? "<unknown>"} must declare full baseSha/headSha values`);
    }
    if (
      !isIsoTimestamp(item.createdAt) ||
      !isIsoTimestamp(item.lastObservedAt) ||
      !isIsoTimestamp(item.nextReviewAt) ||
      !Object.hasOwn(item, "lastHeartbeatAt") ||
      !isNullableIsoTimestamp(item.lastHeartbeatAt)
    ) {
      errors.push(
        `workItem ${item.taskId ?? "<unknown>"} must declare ISO createdAt/lastObservedAt/nextReviewAt and nullable ISO lastHeartbeatAt`
      );
    }
    for (const [field, value] of [
      ["createdAt", item.createdAt],
      ["lastObservedAt", item.lastObservedAt],
      ["lastHeartbeatAt", item.lastHeartbeatAt]
    ]) {
      if (timestampIsInFuture(value, now)) errors.push(`workItem ${item.taskId ?? "<unknown>"} has future ${field}`);
    }
    if (!isExpectedClose(item.expectedCloseAt)) {
      errors.push(`workItem ${item.taskId ?? "<unknown>"} must declare ISO or owner-gated expectedCloseAt`);
    }
    if (!Array.isArray(item.aheadBehind?.baseRef ? [item.aheadBehind] : null)) {
      errors.push(`workItem ${item.taskId ?? "<unknown>"} must declare aheadBehind.baseRef/ahead/behind`);
    } else if (
      typeof item.aheadBehind.baseRef !== "string" ||
      !Number.isInteger(item.aheadBehind.ahead) ||
      !Number.isInteger(item.aheadBehind.behind)
    ) {
      errors.push(`workItem ${item.taskId ?? "<unknown>"} has invalid aheadBehind values`);
    }
    if (!Array.isArray(item.allowedPaths) || item.allowedPaths.length === 0) {
      errors.push(`workItem ${item.taskId ?? "<unknown>"} must declare allowedPaths`);
    }
    if (item.repo !== registry.repo || !pathIsWithin(item.repo, item.worktreePath) || !pathIsWithin(item.worktreePath, item.cwd)) {
      errors.push(`workItem ${item.taskId ?? "<unknown>"} repo/worktreePath/cwd custody is inconsistent`);
    }
    if (!WORK_ITEM_DISPOSITIONS.has(item.disposition)) {
      errors.push(`workItem ${item.taskId ?? "<unknown>"} has unsupported disposition ${item.disposition}`);
    }
    if (!LANE_TYPES.has(item.laneType)) {
      errors.push(`workItem ${item.taskId ?? "<unknown>"} has unsupported laneType ${item.laneType}`);
    }
    if (!Array.isArray(item.sensitivePaths)) {
      errors.push(`workItem ${item.taskId ?? "<unknown>"} must declare sensitivePaths`);
    }
    if (
      !item.evidenceState ||
      !["local", "ci", "merged", "deployed", "live"].every(
        (key) => typeof item.evidenceState[key] === "string"
      )
    ) {
      errors.push(
        `workItem ${item.taskId ?? "<unknown>"} must declare string evidenceState.local/ci/merged/deployed/live`
      );
    }
    if (ACTIVE_WRITE_DISPOSITIONS.has(item.disposition)) {
      activeWriters.push(item);
      if (!isIsoTimestamp(item.lastHeartbeatAt)) {
        errors.push(`active workItem ${item.taskId} requires an owner heartbeat`);
      }
      if (!new Set(["feature", "integration-release"]).has(item.laneType)) {
        errors.push(`active workItem ${item.taskId} must use feature or integration-release laneType`);
      }
      if (
        registry.incident?.credentialExposure?.status === "blocked-owner"
      ) {
        const binding = (freezeExceptionBindings ?? []).find(
          (candidate) => candidate.exception === item.freezeException && candidate.taskId === item.taskId
        );
        if (
          !binding ||
          binding.ownerKey !== item.ownerKey ||
          binding.ownerLane !== item.ownerLane ||
          binding.branch !== item.branch ||
          !sameStringSet(binding.allowedPaths, item.allowedPaths)
        ) {
          errors.push(`active workItem ${item.taskId} lacks an exact P0 freeze-exception binding`);
        }
      }
      if (item.laneType === "integration-release") activeLaneCounts["integration-release"] += 1;
      if (item.laneType === "feature") activeLaneCounts.feature += 1;
      if (branchOwners.has(item.branch)) {
        errors.push(`branch ${item.branch} has multiple active writers`);
      }
      branchOwners.set(item.branch, item.owner);
      const heartbeatAge = isIsoTimestamp(item.lastHeartbeatAt)
        ? ageHours(item.lastHeartbeatAt, now)
        : Number.POSITIVE_INFINITY;
      if (heartbeatAge > 72) {
        errors.push(`active workItem ${item.taskId} has no heartbeat for more than 72 hours and must be frozen`);
      } else if (heartbeatAge > 24) {
        warnings.push(`active workItem ${item.taskId} has no heartbeat for more than 24 hours`);
      }
    }
    if (Date.parse(item.nextReviewAt) < now) {
      if (ACTIVE_WRITE_DISPOSITIONS.has(item.disposition)) {
        errors.push(`active workItem ${item.taskId} has an overdue nextReviewAt`);
      } else {
        warnings.push(`workItem ${item.taskId} requires scheduled preservation review`);
      }
    }
    if (!item.prNumber && !item.noPrReason) {
      errors.push(`workItem ${item.taskId ?? "<unknown>"} requires prNumber or noPrReason`);
    }
    if (item.cleanupAuthorization !== undefined) {
      const cleanup = item.cleanupAuthorization;
      const targetRef = `refs/heads/${item.branch}`;
      const targetBranch = (registry.branches ?? []).find((branch) => branch.name === item.branch);
      const operatorItem = (registry.workItems ?? []).find(
        (candidate) => candidate.taskId === cleanup.operatorTaskId
      );
      if (
        item.disposition !== "integrated" ||
        targetBranch?.disposition !== "integrated" ||
        cleanup.status !== "active" ||
        cleanup.purpose !== "integrated-lane-cleanup" ||
        cleanup.ref !== targetRef ||
        cleanup.expectedOldSha !== item.headSha ||
        cleanup.requiredCleanHeadSha !== item.headSha ||
        cleanup.effectiveOnlyAfterThisCloseoutReachesProtectedMain !== true ||
        cleanup.ordinaryLocalWorktreeRemoval !== true ||
        cleanup.ordinaryLocalBranchDeletion !== true ||
        cleanup.ordinaryRemoteBranchDeletion !== true ||
        cleanup.forceResetRebaseOrHistoryRewrite !== false ||
        cleanup.exactLeaseRequired !== true ||
        cleanup.oneShot !== true ||
        !isIsoTimestamp(cleanup.authorizedAt) ||
        !isIsoTimestamp(cleanup.expiresAt) ||
        Date.parse(cleanup.expiresAt) <= now ||
        Date.parse(cleanup.expiresAt) - Date.parse(cleanup.authorizedAt) > 72 * 60 * 60 * 1000 ||
        typeof cleanup.githubActor !== "string" ||
        cleanup.githubActor.length === 0 ||
        !operatorItem ||
        cleanup.operatorBranch !== operatorItem.branch ||
        cleanup.operatorOwnerKey !== operatorItem.ownerKey ||
        !ACTIVE_WRITE_DISPOSITIONS.has(operatorItem.disposition) ||
        cleanup.consumedAt !== null ||
        cleanup.deletionEventId !== null ||
        cleanup.executedBy !== null ||
        cleanup.remoteRefAbsenceReadbackAt !== null ||
        cleanup.result !== null
      ) {
        errors.push(`workItem ${item.taskId ?? "<unknown>"} has invalid integrated cleanup authorization`);
      }
    }
  }
  if (activeWriters.length > MAX_ACTIVE_WRITE_WORKTREES) {
    errors.push(`active write worktree count ${activeWriters.length} exceeds ${MAX_ACTIVE_WRITE_WORKTREES}`);
  }
  if (activeLaneCounts["integration-release"] > MAX_ACTIVE_INTEGRATION_RELEASE_LANES) {
    errors.push(`active integration/release lane count exceeds ${MAX_ACTIVE_INTEGRATION_RELEASE_LANES}`);
  }
  if (activeLaneCounts.feature > MAX_ACTIVE_FEATURE_LANES) {
    errors.push(`active feature lane count exceeds ${MAX_ACTIVE_FEATURE_LANES}`);
  }

  const branchNames = new Set();
  for (const branch of registry.branches ?? []) {
    if (
      !branch.name ||
      !branch.owner ||
      !branch.ownerKey ||
      !branch.disposition ||
      !isSha(branch.baseSha) ||
      !isSha(branch.headSha)
    ) {
      errors.push(`branch disposition is missing required fields: ${branch.name ?? "<unknown>"}`);
    }
    if (!BRANCH_DISPOSITIONS.has(branch.disposition)) {
      errors.push(`branch ${branch.name ?? "<unknown>"} has unsupported disposition ${branch.disposition}`);
    }
    if (
      !isIsoTimestamp(branch.lastObservedAt) ||
      !isIsoTimestamp(branch.lastCommitAt) ||
      !isIsoTimestamp(branch.nextReviewAt) ||
      !Object.hasOwn(branch, "lastOwnerHeartbeatAt") ||
      !isNullableIsoTimestamp(branch.lastOwnerHeartbeatAt) ||
      !isExpectedClose(branch.expectedCloseAt)
    ) {
      errors.push(
        `branch ${branch.name ?? "<unknown>"} requires observed/commit/review timestamps, nullable owner heartbeat, and expectedCloseAt`
      );
    }
    if (
      timestampIsInFuture(branch.lastObservedAt, now) ||
      timestampIsInFuture(branch.lastOwnerHeartbeatAt, now)
    ) {
      errors.push(`branch ${branch.name ?? "<unknown>"} has a future observation or owner heartbeat`);
    }
    if (!new Set(["live", "gone", "base-only", "not-applicable"]).has(branch.upstreamState)) {
      errors.push(`branch ${branch.name ?? "<unknown>"} has invalid upstreamState`);
    }
    if (!new Set(["present", "present-stale", "absent", "not-applicable"]).has(branch.upstreamCacheState)) {
      errors.push(`branch ${branch.name ?? "<unknown>"} has invalid upstreamCacheState`);
    }
    if (typeof branch.remotePresent !== "boolean") {
      errors.push(`branch ${branch.name ?? "<unknown>"} must declare remotePresent`);
    }
    if (branch.remoteObservationMode && branch.remoteObservationMode !== "lower-bound") {
      errors.push(`branch ${branch.name ?? "<unknown>"} has invalid remoteObservationMode`);
    }
    if (branch.prStateObservationMode && branch.prStateObservationMode !== "monotonic") {
      errors.push(`branch ${branch.name ?? "<unknown>"} has invalid prStateObservationMode`);
    }
    if (!isIsoTimestamp(branch.remoteObservedAt)) {
      errors.push(`branch ${branch.name ?? "<unknown>"} must declare remoteObservedAt`);
    }
    if (branch.remotePresent && !isSha(branch.remoteHeadSha)) {
      errors.push(`branch ${branch.name ?? "<unknown>"} must bind the observed remote head SHA`);
    }
    if (!branch.pr && !branch.noPrReason) {
      errors.push(`branch ${branch.name ?? "<unknown>"} requires pr or noPrReason`);
    }
    if (
      !branch.pr &&
      ageHours(branch.lastCommitAt, now) > 7 * 24 &&
      !MANUAL_REVIEW_BRANCH_DISPOSITIONS.has(branch.disposition)
    ) {
      errors.push(`branch ${branch.name ?? "<unknown>"} is older than seven days without a PR and must enter manual preservation review`);
    }
    if (Date.parse(branch.nextReviewAt) < now) {
      if (ACTIVE_WRITE_DISPOSITIONS.has(branch.disposition)) {
        errors.push(`active branch ${branch.name ?? "<unknown>"} has an overdue nextReviewAt`);
      } else {
        warnings.push(`branch ${branch.name ?? "<unknown>"} requires scheduled preservation review`);
      }
    }
    if (branchNames.has(branch.name)) errors.push(`duplicate branch disposition: ${branch.name}`);
    branchNames.add(branch.name);
  }

  const orphanPaths = new Set();
  for (const orphan of registry.orphanWorktrees ?? []) {
    if (
      !orphan.path ||
      !orphan.owner ||
      !orphan.disposition ||
      !orphan.gitPointerState ||
      !orphan.gitPointerTarget ||
      orphan.expectedMarkerKind !== "gitdir-file" ||
      !isIsoTimestamp(orphan.lastObservedAt) ||
      !isIsoTimestamp(orphan.nextReviewAt) ||
      !Object.hasOwn(orphan, "lastOwnerHeartbeatAt") ||
      !isNullableIsoTimestamp(orphan.lastOwnerHeartbeatAt) ||
      !orphan.noPrReason ||
      !Array.isArray(orphan.allowedPaths) ||
      !orphan.manifestClassification
    ) {
      errors.push(`orphan worktree entry is missing required fields: ${orphan.path ?? "<unknown>"}`);
    }
    if (!ORPHAN_DISPOSITIONS.has(orphan.disposition)) {
      errors.push(`orphan worktree has unsupported disposition: ${orphan.path ?? "<unknown>"}`);
    }
    if (Date.parse(orphan.nextReviewAt) < now) {
      warnings.push(`orphan worktree requires scheduled preservation review: ${orphan.path ?? "<unknown>"}`);
    }
    if (orphanPaths.has(orphan.path)) errors.push(`duplicate orphan path: ${orphan.path}`);
    orphanPaths.add(orphan.path);
  }

  const incidentStatus = registry.incident?.credentialExposure?.status;
  if (!new Set(["blocked-owner", "closed"]).has(incidentStatus)) {
    errors.push("credential incident status must be blocked-owner or closed");
  }
  if (incidentStatus === "closed") {
    const closure = registry.incident?.credentialExposure?.closureEvidence;
    if (
      !closure ||
      !isIsoTimestamp(closure.providerReadbackAt) ||
      !isIsoTimestamp(closure.liveRefAuditAt) ||
      typeof closure.authorizedBy !== "string" ||
      closure.authorizedBy.length === 0
    ) {
      errors.push("closed credential incident requires provider readback, live-ref audit, and named authorization evidence");
    }
  }
  const liveMainObservationMode = registry.incident?.credentialExposure?.liveMainObservationMode;
  if (liveMainObservationMode && liveMainObservationMode !== "lower-bound") {
    errors.push("credential incident live-main observation mode must be lower-bound when declared");
  }
  if (
    (registry.policy?.refDeletionAuthorizations ?? []).some((entry) => entry.status === "active") &&
    registry.incident?.credentialExposure?.providerContainmentStatus !== "complete"
  ) {
    errors.push("active ref-deletion authorization requires complete provider containment");
  }
  const branchByName = new Map((registry.branches ?? []).map((branch) => [branch.name, branch]));
  for (const item of registry.workItems ?? []) {
    const branch = branchByName.get(item.branch);
    if (!branch || branch.ownerKey !== item.ownerKey) {
      errors.push(`workItem ${item.taskId ?? "<unknown>"} ownerKey does not match its branch disposition`);
    }
    if (ACTIVE_WRITE_DISPOSITIONS.has(item.disposition) && branch?.disposition !== item.disposition) {
      errors.push(`active workItem ${item.taskId ?? "<unknown>"} disposition does not match its writable branch`);
    }
  }
  for (const branch of registry.branches ?? []) {
    if (!ACTIVE_WRITE_DISPOSITIONS.has(branch.disposition)) continue;
    const matchingWriters = (registry.workItems ?? []).filter(
      (item) => item.branch === branch.name && item.disposition === branch.disposition
    );
    if (matchingWriters.length !== 1) {
      errors.push(`writable branch ${branch.name} must have exactly one disposition-matched workItem`);
    }
  }
  return { errors, warnings, activeWriterCount: activeWriters.length };
}

function parseWorktreeList() {
  const records = [];
  let current = null;
  for (const line of gitText(["worktree", "list", "--porcelain"]).split("\n")) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice("worktree ".length) };
      records.push(current);
    } else if (current && line.startsWith("HEAD ")) {
      current.headSha = line.slice("HEAD ".length);
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch refs/heads/".length);
    } else if (current && line === "detached") {
      current.detached = true;
    }
  }
  return records;
}

function markerInfo(worktreePath) {
  const markerPath = join(worktreePath, ".git");
  if (!existsSync(markerPath)) return { markerPath, kind: "missing", valid: false };
  const markerStat = lstatSync(markerPath);
  if (markerStat.isDirectory()) return { markerPath, kind: "directory", valid: true };
  const firstLine = readFileSync(markerPath, "utf8").split(/\r?\n/, 1)[0];
  if (!firstLine.startsWith("gitdir: ")) return { markerPath, kind: "file", valid: false };
  const rawTarget = firstLine.slice("gitdir: ".length).trim();
  const target = resolve(worktreePath, rawTarget);
  return { markerPath, kind: "gitdir-file", rawTarget, target, valid: existsSync(target) };
}

function immediateWorktreeMarkers() {
  const entries = [];
  const walk = (current) => {
    for (const item of readdirSync(current, { withFileTypes: true })) {
      if (!item.isDirectory() || item.isSymbolicLink()) continue;
      if (item.name === ".git" || GENERATED_DIRECTORY_NAMES.has(item.name)) continue;
      const path = join(current, item.name);
      if (existsSync(join(path, ".git"))) {
        entries.push({ path, ...markerInfo(path) });
        continue;
      }
      walk(path);
    }
  };
  walk(CONTROL_ROOT);
  return entries;
}

function localBranches() {
  const output = gitText([
    "for-each-ref",
    "--format=%(refname:short)%00%(objectname)%00%(upstream:short)%00%(upstream:trackshort)",
    "refs/heads"
  ]);
  const branches = [];
  for (const line of output.split("\n").filter(Boolean)) {
    const fields = line.split("\0");
    if (fields.length !== 4) throw new Error("unexpected git for-each-ref branch record");
    branches.push({
      name: fields[0],
      headSha: fields[1],
      upstream: fields[2] || null,
      upstreamTrack: fields[3] || null,
      upstreamCachedPresent: fields[2]
        ? git(["show-ref", "--verify", "--quiet", `refs/remotes/${fields[2]}`], { allowFailure: true }).status === 0
        : false
    });
  }
  return branches;
}

function worktreeStatusPaths(path) {
  const targetRoot = realpathSync(path);
  const unsetEnv = targetRoot === REPO_ROOT
    ? []
    : [
        "GIT_ALTERNATE_OBJECT_DIRECTORIES",
        "GIT_COMMON_DIR",
        "GIT_DIR",
        "GIT_IMPLICIT_WORK_TREE",
        "GIT_INDEX_FILE",
        "GIT_OBJECT_DIRECTORY",
        "GIT_PREFIX",
        "GIT_WORK_TREE"
      ];
  const output = gitText(
    ["-C", path, "status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { unsetEnv }
  );
  const records = output.split("\0").filter(Boolean);
  const paths = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const status = record.slice(0, 2);
    const firstPath = normalizeRepoPath(record.slice(3));
    paths.push(firstPath);
    if ((status.includes("R") || status.includes("C")) && records[index + 1]) {
      paths.push(normalizeRepoPath(records[index + 1]));
      index += 1;
    }
  }
  return [...new Set(paths)];
}

function pathMatchesAllowed(path, rule) {
  if (rule.startsWith("<") && rule.endsWith(">")) return false;
  const normalizedRule = normalizeRepoPath(rule);
  if (normalizedRule.endsWith("/**")) {
    const prefix = normalizedRule.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  return path === normalizedRule;
}

function pathIsAllowed(path, allowedPaths) {
  return allowedPaths.some((rule) => pathMatchesAllowed(path, rule));
}

function actualAheadBehind(head, baseRef) {
  if (!gitObjectExists(`${head}^{commit}`) || !gitObjectExists(`${baseRef}^{commit}`)) return null;
  const [behind, ahead] = gitText(["rev-list", "--left-right", "--count", `${baseRef}...${head}`])
    .trim()
    .split(/\s+/)
    .map(Number);
  return { baseRef, ahead, behind };
}

function integratedCleanupBehindAdvanceAllowed(item, actualHeadSha, observed) {
  const recorded = item.aheadBehind;
  const cleanup = item.cleanupAuthorization;
  const merged = item.lastMergedPullRequest;
  if (
    item.disposition !== "integrated" ||
    recorded?.baseRef !== "origin/main" ||
    actualHeadSha !== item.headSha ||
    recorded.ahead !== 0 ||
    observed?.ahead !== 0 ||
    observed.behind < recorded.behind ||
    cleanup?.effectiveOnlyAfterThisCloseoutReachesProtectedMain !== true ||
    cleanup.requiredCleanHeadSha !== actualHeadSha ||
    cleanup.forceResetRebaseOrHistoryRewrite !== false ||
    merged?.headSha !== actualHeadSha ||
    merged.postMainChecksPassed !== true ||
    !isSha(merged.mergeCommitSha)
  ) {
    return false;
  }
  const headIsIntegrated =
    git(["merge-base", "--is-ancestor", actualHeadSha, recorded.baseRef], { allowFailure: true }).status === 0;
  const recordedMergeIsOnProtectedMain =
    git(["merge-base", "--is-ancestor", merged.mergeCommitSha, recorded.baseRef], { allowFailure: true }).status === 0;
  return headIsIntegrated && recordedMergeIsOnProtectedMain;
}

function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

function fileModeIsOwnerOnly(path) {
  return (statSync(path).mode & 0o077) === 0;
}

function verifyOrphanInventorySnapshot(inventoryReport, registry, errors) {
  const rootsByPath = new Map((inventoryReport.roots ?? []).map((root) => [resolve(root.path), root]));
  for (const orphan of registry.orphanWorktrees ?? []) {
    const expectedRoot = rootsByPath.get(resolve(orphan.path));
    if (!expectedRoot || expectedRoot.status !== "present") {
      errors.push(`orphan inventory lacks a present root record: ${orphan.path}`);
      continue;
    }
    const expectedFiles = new Map((expectedRoot.files ?? []).map((file) => [file.relativePath, file]));
    const skippedDirectories = [];
    const currentFiles = collectInventoryFiles(orphan.path, skippedDirectories);
    const currentPaths = new Set(currentFiles.map((file) => file.relativePath));
    if (currentPaths.size !== expectedFiles.size) {
      errors.push(`orphan non-generated file count changed since inventory: ${orphan.path}`);
      continue;
    }
    for (const candidate of currentFiles) {
      const expected = expectedFiles.get(candidate.relativePath);
      if (!expected) {
        errors.push(`orphan gained an unmanifested path: ${safePathForLog(candidate.relativePath)}`);
        continue;
      }
      const info = lstatSync(candidate.path);
      let observedSha;
      if (info.isSymbolicLink()) {
        observedSha = sha256Buffer(Buffer.from(readlinkSync(candidate.path), "utf8"));
        if (expected.type !== "symlink") errors.push(`orphan path type changed: ${safePathForLog(candidate.relativePath)}`);
      } else if (info.isFile()) {
        observedSha = sha256File(candidate.path);
        if (expected.type !== "file") errors.push(`orphan path type changed: ${safePathForLog(candidate.relativePath)}`);
      } else {
        errors.push(`orphan path is no longer a regular file or symlink: ${safePathForLog(candidate.relativePath)}`);
        continue;
      }
      if (observedSha !== expected.sha256 || info.size !== expected.size) {
        errors.push(`orphan path changed since inventory: ${safePathForLog(candidate.relativePath)}`);
      }
    }
    const expectedSkipped = new Set((expectedRoot.skippedDirectories ?? []).map((entry) => entry.path));
    const observedSkipped = new Set(skippedDirectories.map((entry) => entry.path));
    if (
      expectedSkipped.size !== observedSkipped.size ||
      [...expectedSkipped].some((path) => !observedSkipped.has(path))
    ) {
      errors.push(`orphan generated-directory topology changed since inventory: ${orphan.path}`);
    }
  }
}

function verifyRescueArtifacts(registry, errors, warnings) {
  const rescue = registry.rescue ?? {};
  const refLines = gitText([
    "for-each-ref",
    "--format=%(refname) %(objectname)",
    rescue.namespace ? `refs/rescue/${rescue.namespace.replace(/^refs\/rescue\//, "")}` : "refs/rescue/sena-20260827"
  ])
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort();
  const refListBytes = Buffer.from(refLines.length > 0 ? `${refLines.join("\n")}\n` : "", "utf8");
  const refListHash = sha256Buffer(refListBytes);
  if (refLines.length !== Number(rescue.expectedRefCount ?? -1)) {
    errors.push(`rescue ref count ${refLines.length} does not equal registry expectation ${rescue.expectedRefCount}`);
  }
  if (refListHash !== rescue.refListSha256) errors.push("rescue ref-list SHA-256 does not match registry");
  if (refLines.some((line) => line.endsWith(` ${registry.incident?.credentialExposure?.blobSha}`))) {
    errors.push("known sensitive blob is a direct rescue-ref target");
  }
  if (refLines.length > 0) {
    const reachable = gitText(["rev-list", "--objects", ...refLines.map((line) => line.split(" ", 1)[0])]);
    if (reachable.split("\n").some((line) => line.split(" ", 1)[0] === registry.incident?.credentialExposure?.blobSha)) {
      errors.push("known sensitive blob is reachable from rescue refs");
    }
  }

  const bundlePath = rescue.bundlePath;
  if (!bundlePath || !existsSync(bundlePath)) {
    errors.push(`rescue bundle is absent: ${bundlePath ?? "<missing-path>"}`);
  } else {
    if (!fileModeIsOwnerOnly(bundlePath)) errors.push("rescue bundle permissions are not owner-only");
    if (sha256File(bundlePath) !== rescue.bundleSha256) errors.push("rescue bundle SHA-256 does not match registry");
    const verify = git(["bundle", "verify", bundlePath], { allowFailure: true });
    if (verify.status !== 0) errors.push("git bundle verify failed for rescue bundle");
  }

  const inventory = rescue.orphanInventory ?? {};
  if (!inventory.path || !existsSync(inventory.path)) {
    errors.push(`orphan inventory is absent: ${inventory.path ?? "<missing-path>"}`);
  } else {
    if (!fileModeIsOwnerOnly(inventory.path)) errors.push("orphan inventory permissions are not owner-only");
    if (sha256File(inventory.path) !== inventory.sha256) errors.push("orphan inventory SHA-256 does not match registry");
    try {
      const inventoryReport = JSON.parse(readFileSync(inventory.path, "utf8"));
      verifyOrphanInventorySnapshot(inventoryReport, registry, errors);
    } catch {
      errors.push("orphan inventory snapshot verification failed closed");
    }
  }

  for (const copy of rescue.diskOnlySourceCopies ?? []) {
    if (!existsSync(copy.path)) {
      errors.push(`rescued disk-only source copy is absent: ${copy.path}`);
      continue;
    }
    const buffer = readFileSync(copy.path);
    if (!fileModeIsOwnerOnly(copy.path)) errors.push(`rescued source copy is not owner-only: ${copy.path}`);
    if (buffer.length !== copy.size) errors.push(`rescued source size mismatch: ${copy.path}`);
    if (gitBlobId(buffer) !== copy.gitBlob) errors.push(`rescued source Git blob mismatch: ${copy.path}`);
    if (sha256Buffer(buffer) !== copy.sha256) errors.push(`rescued source SHA-256 mismatch: ${copy.path}`);
  }
  return { refLines, refListHash };
}

function fsckState() {
  const result = git(["fsck", "--full", "--unreachable", "--no-reflogs"], { allowFailure: true });
  const output = `${String(result.stdout ?? "")}\n${String(result.stderr ?? "")}`;
  const unreachableCommits = output
    .split("\n")
    .filter((line) => /^unreachable commit [0-9a-f]{40,64}$/.test(line.trim()))
    .map((line) => line.trim().split(" ")[2]);
  return { status: result.status, unreachableCommits };
}

function remoteRefs() {
  const result = git(["ls-remote", "--heads", "--tags", EXPECTED_REMOTE_HTTPS_URL], { allowFailure: true });
  if (result.status !== 0) return { available: false, refs: [] };
  const refs = String(result.stdout ?? "")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [headSha, ref] = line.split(/\s+/);
      return { name: ref, headSha };
    })
    .filter((entry) => !entry.name.endsWith("^{}"));
  return { available: true, refs };
}

function remotePullRequests() {
  const result = spawnSync(
    "gh",
    ["pr", "list", "--repo", "HUDongpin/SENA", "--state", "all", "--limit", "200", "--json", "number,state,headRefName,headRefOid,baseRefName,mergedAt,closedAt"],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, env: process.env }
  );
  if (result.status !== 0) return { available: false, pullRequests: [] };
  try {
    return { available: true, pullRequests: JSON.parse(result.stdout) };
  } catch {
    return { available: false, pullRequests: [] };
  }
}

function localRetirementAuthorizationCoreContract(authorization) {
  return {
    id: authorization.id,
    purpose: authorization.purpose,
    predecessorAuthorizationId: authorization.predecessorAuthorizationId,
    ref: authorization.ref,
    expectedOldSha: authorization.expectedOldSha,
    targetDispositionBeforeRetirement: authorization.targetDispositionBeforeRetirement,
    targetDispositionAfterRetirement: authorization.targetDispositionAfterRetirement,
    effectiveOnlyAfterAuthorizationReachesProtectedMain:
      authorization.effectiveOnlyAfterAuthorizationReachesProtectedMain,
    exactCasRequired: authorization.exactCasRequired,
    ordinaryBranchDAllowed: authorization.ordinaryBranchDAllowed,
    forceBranchDAllowed: authorization.forceBranchDAllowed,
    historyRewriteAllowed: authorization.historyRewriteAllowed,
    oneShot: authorization.oneShot,
    operatorBranch: authorization.operatorBranch,
    operatorTaskId: authorization.operatorTaskId,
    operatorOwnerKey: authorization.operatorOwnerKey,
    authorizedBy: authorization.authorizedBy,
    authorizationBasis: authorization.authorizationBasis,
    authorizedAt: authorization.authorizedAt,
    expiresAt: authorization.expiresAt,
    registeredWorktreeOccupancyRequired: authorization.registeredWorktreeOccupancyRequired,
    remoteHeadRequiredAbsent: authorization.remoteHeadRequiredAbsent,
    custody: authorization.custody,
    receiptDirectory: authorization.receiptDirectory
  };
}

function localRetirementExecutionContract(authorization) {
  return {
    ...localRetirementAuthorizationCoreContract(authorization),
    deletionRelease: authorization.deletionRelease
  };
}

function completedLocalRetirementReceipt(registry, branchRecord, currentRegistryCommit) {
  const ref = `refs/heads/${branchRecord.name}`;
  const authorization = (registry.policy?.localRefRetirementAuthorizations ?? []).find(
    (entry) =>
      new Set(["active", "consumed"]).has(entry.status) &&
      entry.ref === ref &&
      entry.expectedOldSha === branchRecord.headSha
  );
  if (!authorization) return null;
  let receiptPaths;
  try {
    receiptPaths = retirementReceiptPaths(authorization);
  } catch {
    return null;
  }
  if (!existsSync(receiptPaths.prepared) || !existsSync(receiptPaths.completed)) return null;
  const preparedInfo = lstatSync(receiptPaths.prepared);
  const completedInfo = lstatSync(receiptPaths.completed);
  if (
    !preparedInfo.isFile() ||
    preparedInfo.isSymbolicLink() ||
    !completedInfo.isFile() ||
    completedInfo.isSymbolicLink() ||
    preparedInfo.nlink !== 1 ||
    completedInfo.nlink !== 1 ||
    preparedInfo.uid !== process.geteuid() ||
    completedInfo.uid !== process.geteuid() ||
    !exactOwnerOnlyMode(receiptPaths.prepared, 0o600) ||
    !exactOwnerOnlyMode(receiptPaths.completed, 0o600)
  ) {
    return null;
  }
  let prepared;
  let completed;
  try {
    prepared = JSON.parse(readFileSync(receiptPaths.prepared, "utf8"));
    completed = JSON.parse(readFileSync(receiptPaths.completed, "utf8"));
  } catch {
    return null;
  }
  const executedAtMs = Date.parse(completed.executedAt);
  if (!Number.isFinite(executedAtMs)) return null;
  if (!isSha(currentRegistryCommit)) return null;
  const closeoutFirstParentHistory = git(
    ["rev-list", "--first-parent", currentRegistryCommit],
    { allowFailure: true }
  );
  const closeoutFirstParentCommits = new Set(
    String(closeoutFirstParentHistory.stdout ?? "")
      .trim()
      .split("\n")
      .filter(Boolean)
  );
  if (
    closeoutFirstParentHistory.status !== 0 ||
    !closeoutFirstParentCommits.has(prepared.authorizationRegistryCommit)
  ) {
    return null;
  }
  let protectedAuthorization;
  try {
    const protectedRegistry = loadRegistryFromCommit(prepared.authorizationRegistryCommit).parsed;
    const protectedValidation = validateRegistry(protectedRegistry, { now: executedAtMs });
    if (protectedValidation.errors.length > 0) return null;
    protectedAuthorization = (protectedRegistry.policy?.localRefRetirementAuthorizations ?? []).find(
      (entry) => entry.id === authorization.id
    );
    assertLocalRefRetirementDeletionRelease(
      protectedAuthorization,
      prepared.authorizationRegistryCommit,
      executedAtMs
    );
  } catch {
    return null;
  }
  const expectedEventId = sha256Buffer(
    Buffer.from(
      `${prepared.authorizationRegistryCommit}\0${authorization.id}\0${authorization.ref}`,
      "utf8"
    )
  );
  const authorizedAtMs = Date.parse(authorization.authorizedAt);
  const authorizationExpiresAtMs = Date.parse(authorization.expiresAt);
  const releaseAtMs = Date.parse(authorization.deletionRelease?.releasedAt);
  const releaseExpiresAtMs = Date.parse(authorization.deletionRelease?.expiresAt);
  const preparedAtMs = Date.parse(prepared.preparedAt);
  const absenceAtMs = Date.parse(completed.localRefAbsenceReadbackAt);
  const liveMainAtMs = Date.parse(completed.liveMainReadbackAt);
  const liveTargetAtMs = Date.parse(completed.liveTargetAbsenceReadbackAt);
  const consumedAtMs = Date.parse(authorization.consumedAt);
  const consumedReceiptMismatch =
    authorization.status === "consumed" &&
    (authorization.authorizationRegistryCommit !== prepared.authorizationRegistryCommit ||
      authorization.eventId !== prepared.eventId ||
      authorization.executedBy !== completed.executedBy ||
      authorization.localRefAbsenceReadbackAt !== completed.localRefAbsenceReadbackAt ||
      authorization.result !== "deleted" ||
      authorization.preparedReceiptPath !== receiptPaths.prepared ||
      authorization.preparedReceiptSha256 !== sha256File(receiptPaths.prepared) ||
      authorization.completedReceiptPath !== receiptPaths.completed ||
      authorization.completedReceiptSha256 !== sha256File(receiptPaths.completed) ||
      !isIsoTimestamp(authorization.consumedAt) ||
      consumedAtMs < absenceAtMs ||
      consumedAtMs < liveMainAtMs ||
      consumedAtMs < liveTargetAtMs ||
      branchRecord.localRefState !== "retired" ||
      branchRecord.disposition !== authorization.targetDispositionAfterRetirement);
  if (
    !protectedAuthorization ||
    protectedAuthorization.status !== "active" ||
    JSON.stringify(localRetirementExecutionContract(protectedAuthorization)) !==
      JSON.stringify(localRetirementExecutionContract(authorization)) ||
    (authorization.status === "active" &&
      (branchRecord.localRefState !== "present" ||
        branchRecord.disposition !== authorization.targetDispositionBeforeRetirement)) ||
    consumedReceiptMismatch ||
    prepared.schemaVersion !== "sena-local-ref-retirement-prepared/v1" ||
    !isSha(prepared.authorizationRegistryCommit) ||
    prepared.authorizationId !== authorization.id ||
    prepared.eventId !== expectedEventId ||
    prepared.ref !== authorization.ref ||
    prepared.expectedOldSha !== authorization.expectedOldSha ||
    prepared.operatorTaskId !== authorization.operatorTaskId ||
    prepared.operatorOwnerKey !== authorization.operatorOwnerKey ||
    !isIsoTimestamp(prepared.preparedAt) ||
    prepared.result !== "prepared" ||
    prepared.credentialContentsRead !== false ||
    completed.schemaVersion !== "sena-local-ref-retirement-receipt/v1" ||
    completed.eventId !== prepared.eventId ||
    completed.authorizationRegistryCommit !== prepared.authorizationRegistryCommit ||
    completed.authorizationId !== authorization.id ||
    completed.ref !== authorization.ref ||
    completed.expectedOldSha !== authorization.expectedOldSha ||
    completed.afterSha !== ZERO_SHA ||
    completed.preparedReceiptSha256 !== sha256File(receiptPaths.prepared) ||
    completed.executedBy !== authorization.operatorOwnerKey ||
    !isIsoTimestamp(completed.executedAt) ||
    !isIsoTimestamp(completed.localRefAbsenceReadbackAt) ||
    completed.liveMainSha !== prepared.authorizationRegistryCommit ||
    !isIsoTimestamp(completed.liveMainReadbackAt) ||
    completed.liveTargetHeadSha !== null ||
    !isIsoTimestamp(completed.liveTargetAbsenceReadbackAt) ||
    completed.result !== "deleted" ||
    completed.exactCasUsed !== true ||
    completed.branchDUsed !== false ||
    completed.forceUsed !== false ||
    completed.resetUsed !== false ||
    completed.rebaseUsed !== false ||
    completed.historyRewriteUsed !== false ||
    completed.credentialContentsRead !== false ||
    !Number.isFinite(authorizedAtMs) ||
    !Number.isFinite(authorizationExpiresAtMs) ||
    !Number.isFinite(releaseAtMs) ||
    !Number.isFinite(releaseExpiresAtMs) ||
    !Number.isFinite(preparedAtMs) ||
    !Number.isFinite(executedAtMs) ||
    !Number.isFinite(absenceAtMs) ||
    !Number.isFinite(liveMainAtMs) ||
    !Number.isFinite(liveTargetAtMs) ||
    timestampIsInFuture(prepared.preparedAt) ||
    timestampIsInFuture(completed.executedAt) ||
    timestampIsInFuture(completed.localRefAbsenceReadbackAt) ||
    timestampIsInFuture(completed.liveMainReadbackAt) ||
    timestampIsInFuture(completed.liveTargetAbsenceReadbackAt) ||
    authorizedAtMs > preparedAtMs ||
    releaseAtMs > preparedAtMs ||
    preparedAtMs > executedAtMs ||
    executedAtMs > absenceAtMs ||
    absenceAtMs > liveMainAtMs ||
    absenceAtMs > liveTargetAtMs ||
    preparedAtMs >= releaseExpiresAtMs ||
    executedAtMs >= releaseExpiresAtMs ||
    absenceAtMs >= releaseExpiresAtMs ||
    executedAtMs > authorizationExpiresAtMs
  ) {
    return null;
  }
  return { authorization, prepared, completed, receiptPaths };
}

function runRegistry(flags) {
  const { parsed } = loadRegistryForFlags(flags);
  const validation = validateRegistry(parsed);
  for (const warning of validation.warnings) process.stderr.write(`SENA_REPO_REGISTRY warning=${warning}\n`);
  if (validation.errors.length > 0) {
    for (const error of validation.errors) process.stderr.write(`SENA_REPO_REGISTRY error=${error}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `SENA_REPO_REGISTRY pass workItems=${parsed.workItems.length} branches=${parsed.branches.length} orphanWorktrees=${parsed.orphanWorktrees.length} activeWriters=${validation.activeWriterCount}\n`
  );
}

export function resolveHookCustodyDirectory(controlRoot, repoRoot, expectedPath, configuredPath) {
  if (
    typeof expectedPath !== "string" ||
    expectedPath.length === 0 ||
    typeof configuredPath !== "string" ||
    configuredPath.length === 0
  ) {
    return { path: null, error: "hook custody path is not configured" };
  }
  const controlRootResolution = existingPathResolution(controlRoot);
  const repoRootResolution = existingPathResolution(repoRoot);
  if (!controlRootResolution.ok || !repoRootResolution.ok) {
    return { path: null, error: "hook custody control/repository root cannot be physically resolved" };
  }
  if (!pathIsWithin(controlRootResolution.path, repoRootResolution.path)) {
    return { path: null, error: "hook custody repository root is outside the physical control root" };
  }

  const canonicalHooksResolution = existingPathResolution(join(repoRootResolution.path, ".githooks"));
  const expectedResolution = existingPathResolution(resolve(repoRootResolution.path, expectedPath));
  const configuredResolution = existingPathResolution(resolve(repoRootResolution.path, configuredPath));
  if (!canonicalHooksResolution.ok || !expectedResolution.ok || !configuredResolution.ok) {
    return { path: null, error: "hook custody path cannot be physically resolved" };
  }
  if (
    !pathIsWithin(controlRootResolution.path, canonicalHooksResolution.path) ||
    expectedResolution.path !== canonicalHooksResolution.path ||
    configuredResolution.path !== canonicalHooksResolution.path
  ) {
    return {
      path: null,
      error: "hook custody path is outside the canonical control-root hooks directory"
    };
  }
  return { path: canonicalHooksResolution.path, error: null };
}

function verifyHookCustody(registry, errors) {
  const expectedPath = registry.policy?.hookCustodyPath;
  const configured = gitText(["config", "--get", "core.hooksPath"], { allowFailure: true }).trim();
  const custody = resolveHookCustodyDirectory(CONTROL_ROOT, REPO_ROOT, expectedPath, configured);
  if (custody.error) {
    errors.push(custody.error);
    return;
  }
  const resolvedConfigured = custody.path;
  for (const hookName of ["pre-commit", "pre-push"]) {
    const hookPath = join(resolvedConfigured, hookName);
    if (!existsSync(hookPath) || !lstatSync(hookPath).isFile()) {
      errors.push(`required local hook is absent: ${hookName}`);
      continue;
    }
    if ((statSync(hookPath).mode & 0o111) === 0) errors.push(`required local hook is not executable: ${hookName}`);
  }
}

function changedPathsAcrossCommitRange(baseSha, headSha) {
  const paths = new Set();
  for (const commit of revList([`${baseSha}..${headSha}`])) {
    for (const path of changedPaths(commit)) paths.add(path);
  }
  return [...paths];
}

function changedPathsAgainstParent(parentSha, commitSha) {
  return gitText(["diff", "--name-only", "-z", "--no-renames", parentSha, commitSha])
    .split("\0")
    .filter(Boolean);
}

function changedPathsAcrossProtectedMainCandidateRange(baseSha, headSha, protectedMainSha) {
  const paths = new Set();
  for (const commit of revList([`${baseSha}..${headSha}`])) {
    const protectedMainParents = commitParents(commit).filter(
      (parent) => git(["merge-base", "--is-ancestor", parent, protectedMainSha], { allowFailure: true }).status === 0
    );
    if (protectedMainParents.length > 0) {
      for (const parent of protectedMainParents) {
        for (const path of changedPathsAgainstParent(parent, commit)) paths.add(path);
      }
      continue;
    }
    for (const path of changedPaths(commit)) paths.add(path);
  }
  return [...paths];
}

function scopedActiveAdvance(fromSha, actualHeadSha, item) {
  if (
    !isSha(fromSha) ||
    !isSha(actualHeadSha) ||
    !item ||
    !ACTIVE_WRITE_DISPOSITIONS.has(item.disposition) ||
    !gitObjectExists(`${fromSha}^{commit}`) ||
    !gitObjectExists(`${actualHeadSha}^{commit}`)
  ) {
    return { isForward: false, protectedMainBaseline: false, laneChangedPaths: [] };
  }
  const isForward =
    git(["merge-base", "--is-ancestor", fromSha, actualHeadSha], { allowFailure: true }).status === 0;
  if (!isForward) {
    return { isForward: false, protectedMainBaseline: false, laneChangedPaths: [] };
  }

  const baseRef = item.aheadBehind?.baseRef;
  const protectedMainSha =
    baseRef === "origin/main" && gitObjectExists("origin/main^{commit}")
      ? gitText(["rev-parse", "origin/main"]).trim()
      : null;
  if (!protectedMainSha) {
    return {
      isForward: true,
      protectedMainBaseline: false,
      laneChangedPaths: changedPathsAcrossCommitRange(fromSha, actualHeadSha)
    };
  }

  const actualIsProtectedMainHistory =
    git(["merge-base", "--is-ancestor", actualHeadSha, protectedMainSha], { allowFailure: true }).status === 0;
  if (actualIsProtectedMainHistory) {
    return { isForward: true, protectedMainBaseline: true, laneChangedPaths: [] };
  }

  const mergeBase = git(["merge-base", actualHeadSha, protectedMainSha], { allowFailure: true });
  const candidateBase = mergeBase.status === 0 ? String(mergeBase.stdout ?? "").trim() : fromSha;
  return {
    isForward: true,
    protectedMainBaseline: false,
    laneChangedPaths: changedPathsAcrossProtectedMainCandidateRange(
      candidateBase || fromSha,
      actualHeadSha,
      protectedMainSha
    )
  };
}

function scopedWorkItemAdvance(item, actualHeadSha) {
  return scopedActiveAdvance(item.headSha, actualHeadSha, item);
}

function runPortableAudit(registry, validation) {
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];
  const registered = parseWorktreeList();
  const currentPath = realpathSync(REPO_ROOT);
  const current = registered.find((entry) => realpathSync(entry.path) === currentPath);
  const markers = immediateWorktreeMarkers();
  const fsck = fsckState();
  const unreachableCommits = fsck.unreachableCommits;
  if (!current) errors.push("current checkout is absent from git worktree registry");
  if (registered.length > MAX_ACTIVE_WRITE_WORKTREES) {
    errors.push(`registered worktree count ${registered.length} exceeds portable ceiling ${MAX_ACTIVE_WRITE_WORKTREES}`);
  }
  for (const marker of markers) {
    if (!marker.valid) errors.push(`portable checkout contains invalid .git marker: ${marker.path}`);
  }
  if (fsck.status !== 0) errors.push("portable git fsck failed closed because object integrity is not clean");
  if (unreachableCommits.length > 0) {
    errors.push(`portable checkout has ${unreachableCommits.length} unreachable commit(s)`);
  }
  if (current?.branch && !(registry.branches ?? []).some((entry) => entry.name === current.branch)) {
    errors.push(`current branch lacks governance disposition: ${current.branch}`);
  }
  const report = {
    schemaVersion: "sena-repo-governance-portable-audit/v1",
    generatedAt: new Date().toISOString(),
    status: errors.length > 0 ? "fail" : "pass",
    registeredWorktreeCount: registered.length,
    invalidDiskMarkerCount: markers.filter((entry) => !entry.valid).length,
    unreachableCommitCount: unreachableCommits.length,
    currentWorktree: current ?? null,
    errors,
    warnings
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (errors.length > 0) process.exitCode = 1;
}

export function shouldRunPortableAudit(flags, controlRoot, registryRepo) {
  if (flags.has("ci")) return true;
  if (!flags.has("pre-push")) return false;
  if (typeof registryRepo !== "string") {
    throw new Error("registry repo path is missing; portable audit selection failed closed");
  }
  const controlRootResolution = existingPathResolution(controlRoot);
  if (!controlRootResolution.ok) {
    throw new Error(
      `control root path cannot be resolved; portable audit selection failed closed code=${controlRootResolution.errorCode}`
    );
  }
  const registryRepoResolution = existingPathResolution(registryRepo);
  if (registryRepoResolution.ok) {
    return controlRootResolution.path !== registryRepoResolution.path;
  }
  if (registryRepoResolution.errorCode === "ENOENT") return true;
  throw new Error(
    `registry repo path cannot be resolved; portable audit selection failed closed code=${registryRepoResolution.errorCode}`
  );
}

function runAudit(flags) {
  const loadedRegistry = loadRegistryForFlags(flags);
  const registry = loadedRegistry.parsed;
  let currentRegistryCommit = null;
  if (loadedRegistry.registryPath.startsWith("commit:")) {
    currentRegistryCommit = loadedRegistry.registryPath.slice("commit:".length);
  } else if (
    loadedRegistry.registryPath === "index" ||
    flagValues(flags, "registry").length === 0
  ) {
    const head = git(["rev-parse", "--verify", "HEAD"], { allowFailure: true });
    const headSha = head.status === 0 ? String(head.stdout).trim() : null;
    if (isSha(headSha)) currentRegistryCommit = headSha;
  }
  const validation = validateRegistry(registry);
  if (shouldRunPortableAudit(flags, CONTROL_ROOT, registry.repo)) {
    runPortableAudit(registry, validation);
    return;
  }
  appendHostPhysicalCustodyErrors(registry, validation.errors);
  const registered = parseWorktreeList();
  const markers = immediateWorktreeMarkers();
  const branches = localBranches();
  const fsck = fsckState();
  const unreachableCommits = fsck.unreachableCommits;
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];
  const ownerBlockers = [];
  const rescueVerification = verifyRescueArtifacts(registry, errors, warnings);
  const rescueRefs = rescueVerification.refLines;
  const registryOrphans = new Set(
    (registry.orphanWorktrees ?? []).map((entry) => canonicalExistingPath(entry.path))
  );
  const registeredPaths = new Set(registered.map((entry) => canonicalExistingPath(entry.path)));
  const registeredByPath = new Map(
    registered.map((entry) => [canonicalExistingPath(entry.path), entry])
  );
  const actualBranches = new Map(branches.map((entry) => [entry.name, entry]));
  const registryBranches = new Map((registry.branches ?? []).map((entry) => [entry.name, entry]));
  verifyHookCustody(registry, errors);
  if (fsck.status !== 0) errors.push("git fsck failed closed because object integrity is not clean");

  for (const marker of markers) {
    const path = canonicalExistingPath(marker.path);
    if (!marker.valid && !registryOrphans.has(path)) errors.push(`unregistered invalid .git pointer: ${path}`);
    if (!marker.valid && registryOrphans.has(path)) warnings.push(`preserved invalid .git pointer: ${path}`);
    if (marker.valid && !registeredPaths.has(path) && !registryOrphans.has(path)) {
      errors.push(`valid disk worktree marker is absent from Git registry and governance registry: ${path}`);
    }
  }
  for (const orphan of registry.orphanWorktrees ?? []) {
    if (!existsSync(orphan.path)) {
      if (orphan.cleanupApproved) warnings.push(`cleanup-approved orphan path is absent: ${orphan.path}`);
      else errors.push(`preserved orphan path is absent without cleanup approval: ${orphan.path}`);
      continue;
    }
    const observedMarker = markerInfo(orphan.path);
    if (
      observedMarker.kind !== orphan.expectedMarkerKind ||
      observedMarker.valid !== false ||
      resolve(observedMarker.target ?? orphan.path) !== resolve(orphan.gitPointerTarget)
    ) {
      errors.push(`preserved orphan .git pointer identity changed: ${orphan.path}`);
    }
  }

  const workItemsByPath = new Map(
    (registry.workItems ?? []).map((item) => [canonicalExistingPath(item.worktreePath), item])
  );
  for (const worktree of registered) {
    if (!workItemsByPath.has(canonicalExistingPath(worktree.path))) {
      errors.push(`registered worktree lacks an explicit write/read-only workItem: ${worktree.path}`);
    }
  }
  const dispositionNames = new Set(registryBranches.keys());
  for (const branch of branches) {
    if (!dispositionNames.has(branch.name)) errors.push(`local branch lacks governance disposition: ${branch.name}`);
  }
  for (const branchRecord of registry.branches ?? []) {
    const actual = actualBranches.get(branchRecord.name);
    if (!actual) {
      const retirementReceipt = completedLocalRetirementReceipt(
        registry,
        branchRecord,
        currentRegistryCommit
      );
      if (retirementReceipt) {
        if (retirementReceipt.authorization.status === "active") {
          warnings.push(`local ref retirement executed pending protected closeout: refs/heads/${branchRecord.name}`);
        }
        continue;
      }
      errors.push(`governed local branch is absent: ${branchRecord.name}`);
      continue;
    }
    const consumedRetirement = (registry.policy?.localRefRetirementAuthorizations ?? []).find(
      (entry) =>
        entry.status === "consumed" &&
        entry.ref === `refs/heads/${branchRecord.name}` &&
        entry.expectedOldSha === branchRecord.headSha
    );
    if (consumedRetirement || branchRecord.localRefState === "retired") {
      errors.push(`rule=local-ref-retirement-ref-reappeared ref=refs/heads/${branchRecord.name}`);
      continue;
    }
    const activeItem = (registry.workItems ?? []).find(
      (item) => item.branch === branchRecord.name && ACTIVE_WRITE_DISPOSITIONS.has(item.disposition)
    );
    if (actual.headSha !== branchRecord.headSha && !activeItem) {
      errors.push(`branch head differs from registry: ${branchRecord.name}`);
    }
    if ((actual.upstream ?? null) !== (branchRecord.upstream ?? null)) {
      errors.push(`branch upstream differs from registry: ${branchRecord.name}`);
    }
    const expectedCachedUpstream = new Set(["present", "present-stale"]).has(branchRecord.upstreamCacheState);
    if (actual.upstreamCachedPresent !== expectedCachedUpstream) {
      errors.push(`branch cached-upstream state differs from registry: ${branchRecord.name}`);
    }
  }

  for (const item of registry.workItems ?? []) {
    const isActive = ACTIVE_WRITE_DISPOSITIONS.has(item.disposition);
    const actual = actualBranches.get(item.branch);
    if (!actual) {
      errors.push(`workItem branch is absent: ${item.taskId} branch=${item.branch}`);
      continue;
    }
    const registeredWorktree = registeredByPath.get(canonicalExistingPath(item.worktreePath));
    if (!registeredWorktree) {
      if (isActive) errors.push(`active workItem worktree is not Git-registered: ${item.taskId}`);
    } else {
      if (registeredWorktree.branch !== item.branch) {
        errors.push(`workItem worktree branch mismatch: ${item.taskId}`);
      }
      if (registeredWorktree.headSha !== actual.headSha) {
        errors.push(`workItem worktree HEAD differs from local branch: ${item.taskId}`);
      }
      const dirtyPaths = worktreeStatusPaths(item.worktreePath);
      const unexpectedDirty = dirtyPaths.filter((path) => !pathIsAllowed(path, item.allowedPaths));
      if (unexpectedDirty.length > 0) {
        errors.push(`workItem has dirty paths outside allowedPaths: ${item.taskId} count=${unexpectedDirty.length}`);
      }
      if (item.dirtyState.startsWith("clean") && dirtyPaths.length > 0) {
        errors.push(`workItem declared clean but worktree is dirty: ${item.taskId}`);
      }
    }

    if (actual.headSha !== item.headSha) {
      const advance = scopedWorkItemAdvance(item, actual.headSha);
      const unexpected = advance.laneChangedPaths.filter((path) => !pathIsAllowed(path, item.allowedPaths));
      if (!isActive || !advance.isForward || unexpected.length > 0) {
        errors.push(`workItem headSha is not a permitted forward-only allowed-path advance: ${item.taskId}`);
      } else if (advance.protectedMainBaseline) {
        warnings.push(`active workItem absorbed a protected-main baseline advance: ${item.taskId}`);
      } else {
        warnings.push(`active workItem HEAD advanced beyond last-heartbeated headSha: ${item.taskId}`);
      }
    }
    const observed = actualAheadBehind(actual.headSha, item.aheadBehind.baseRef);
    if (!observed) {
      errors.push(`ahead/behind base is unavailable: ${item.taskId} base=${item.aheadBehind.baseRef}`);
    } else if (observed.ahead !== item.aheadBehind.ahead || observed.behind !== item.aheadBehind.behind) {
      if (isActive) warnings.push(`active workItem ahead/behind advanced since heartbeat: ${item.taskId}`);
      else if (integratedCleanupBehindAdvanceAllowed(item, actual.headSha, observed)) {
        warnings.push(
          `integrated cleanup target fell farther behind protected main without changing head: ${item.taskId}`
        );
      } else {
        errors.push(`workItem ahead/behind differs from registry: ${item.taskId}`);
      }
    }
    if (ageHours(item.createdAt) > 24 && isActive && !actual.upstream) {
      errors.push(`active workItem lacks upstream after 24 hours: ${item.taskId}`);
    }
  }
  if (unreachableCommits.length > 0) {
    errors.push(`git fsck reports ${unreachableCommits.length} unreachable commit(s)`);
  }

  if (flags.has("pre-commit") || flags.has("pre-push")) {
    const currentWorktree = registeredByPath.get(canonicalExistingPath(REPO_ROOT));
    const currentItem = workItemsByPath.get(canonicalExistingPath(REPO_ROOT));
    const currentBranchRecord = currentWorktree?.branch ? registryBranches.get(currentWorktree.branch) : null;
    if (!currentWorktree || !currentItem) {
      errors.push("write gate cannot bind the current checkout to a registered workItem");
    } else if (!ACTIVE_WRITE_DISPOSITIONS.has(currentItem.disposition)) {
      errors.push(`write gate rejects non-active workItem ${currentItem.taskId}`);
    }
    if (currentBranchRecord?.disposition === "security-quarantine") {
      errors.push(`write gate rejects security-quarantine branch ${currentBranchRecord.name}`);
    }
    if (
      registry.incident?.credentialExposure?.status === "blocked-owner" &&
      !FREEZE_EXCEPTIONS.has(currentItem?.freezeException)
    ) {
      errors.push("write gate rejects work outside the P0 freeze exception allowlist");
    }
  }
  if (registry.incident?.credentialExposure?.status === "blocked-owner") {
    ownerBlockers.push("credential inventory, provider rotation/revocation, and remote contaminated-ref cleanup require owner action");
  }
  const rootWorktree = registered.find(
    (entry) => canonicalExistingPath(entry.path) === canonicalExistingPath(CONTROL_ROOT)
  );
  if (rootWorktree?.branch !== "main") {
    ownerBlockers.push(`root checkout remains quarantined on ${rootWorktree?.branch ?? "unknown"}`);
  }

  const liveRemote = flags.has("live") ? remoteRefs() : { available: false, refs: [] };
  const livePrState = flags.has("live") ? remotePullRequests() : { available: false, pullRequests: [] };
  if (flags.has("live") && !liveRemote.available) errors.push("live origin heads/tags query failed closed");
  if (flags.has("live") && !livePrState.available) errors.push("live GitHub PR query failed closed");
  if (liveRemote.available) {
    const liveRefMap = new Map(liveRemote.refs.map((ref) => [ref.name, ref.headSha]));
    const liveMainSha = liveRefMap.get("refs/heads/main");
    const cachedMainSha = gitObjectExists("origin/main^{commit}") ? gitText(["rev-parse", "origin/main"]).trim() : null;
    if (!liveMainSha || liveMainSha !== cachedMainSha) {
      errors.push("live main does not match cached origin/main");
    }
    const recordedIncidentMainSha = registry.incident?.credentialExposure?.liveMainSha;
    if (liveMainSha !== recordedIncidentMainSha) {
      const isPermittedForwardMainObservation = Boolean(
        registry.incident?.credentialExposure?.liveMainObservationMode === "lower-bound" &&
        isSha(recordedIncidentMainSha) &&
        git(["merge-base", "--is-ancestor", recordedIncidentMainSha, liveMainSha], { allowFailure: true }).status === 0
      );
      if (isPermittedForwardMainObservation) {
        warnings.push("live main advanced beyond the incident observation lower bound");
      } else {
        errors.push("live main does not match or descend from the registry live-main observation");
      }
    }
    for (const ref of liveRemote.refs) {
      if (!gitObjectExists(`${ref.headSha}^{commit}`)) {
        errors.push(`live remote ref object is unavailable locally for contamination audit: ${ref.name}`);
        continue;
      }
      const objectLines = gitText(["rev-list", "--objects", ref.headSha]).split("\n").filter(Boolean);
      const contaminated = objectLines.find((line) => {
        const [oid, ...pathParts] = line.split(" ");
        const path = pathParts.join(" ");
        return (
          oid === registry.incident?.credentialExposure?.blobSha ||
          (path && classifySensitivePath(path) === "all-api-keys-docx")
        );
      });
      if (contaminated) ownerBlockers.push(`live remote ref contains prohibited credential history: ${ref.name}`);
      if (ref.name.startsWith("refs/heads/")) {
        const name = ref.name.slice("refs/heads/".length);
        if (!registryBranches.has(name)) errors.push(`live remote branch lacks governance disposition: ${name}`);
      }
    }
    for (const branchRecord of registry.branches ?? []) {
      const liveHeadSha = liveRefMap.get(`refs/heads/${branchRecord.name}`) ?? null;
      const activeItem = (registry.workItems ?? []).find(
        (item) => item.branch === branchRecord.name && ACTIVE_WRITE_DISPOSITIONS.has(item.disposition)
      );
      if (branchRecord.remotePresent) {
        if (!liveHeadSha) errors.push(`registry expects a live remote branch that is absent: ${branchRecord.name}`);
        else if (liveHeadSha !== branchRecord.remoteHeadSha) {
          const isPermittedForwardAdvance = Boolean(
            activeItem &&
            permittedActiveAdvance(branchRecord.remoteHeadSha, liveHeadSha, activeItem)
          );
          const isPermittedLowerBoundObservation = Boolean(
            branchRecord.remoteObservationMode === "lower-bound" &&
            git(["merge-base", "--is-ancestor", branchRecord.remoteHeadSha, liveHeadSha], { allowFailure: true }).status === 0
          );
          if (isPermittedForwardAdvance) {
            warnings.push(`active remote branch advanced beyond its last observed SHA: ${branchRecord.name}`);
          } else if (isPermittedLowerBoundObservation) {
            warnings.push(`remote branch advanced beyond its observation lower bound: ${branchRecord.name}`);
          } else {
            errors.push(`live remote branch SHA differs from registry: ${branchRecord.name}`);
          }
        }
      } else if (liveHeadSha) {
        errors.push(`live remote branch is present but registry marks it absent: ${branchRecord.name}`);
      }
      if (branchRecord.upstream?.startsWith("origin/")) {
        const upstreamName = branchRecord.upstream.slice("origin/".length);
        const upstreamLive = liveRefMap.has(`refs/heads/${upstreamName}`);
        if (branchRecord.upstreamState === "gone" && upstreamLive) {
          errors.push(`registry marks upstream gone but it is live: ${branchRecord.name}`);
        }
        if (branchRecord.upstreamState === "live" && !upstreamLive) {
          errors.push(`registry marks upstream live but it is absent: ${branchRecord.name}`);
        }
      }
    }
  }
  if (livePrState.available) {
    for (const branchRecord of registry.branches ?? []) {
      if (!branchRecord.pr) continue;
      const pr = livePrState.pullRequests.find((entry) => entry.number === branchRecord.pr);
      if (!pr) errors.push(`registry PR could not be found: #${branchRecord.pr}`);
      else {
        if (pr.headRefName !== branchRecord.name) errors.push(`registry PR head branch mismatch: #${branchRecord.pr}`);
        const activeItem = (registry.workItems ?? []).find(
          (item) => item.branch === branchRecord.name && ACTIVE_WRITE_DISPOSITIONS.has(item.disposition)
        );
        const recordedHeadMatches = Boolean(
          branchRecord.prHeadSha && pr.headRefOid === branchRecord.prHeadSha
        );
        const isPermittedForwardAdvance = Boolean(
          branchRecord.prHeadSha &&
            !recordedHeadMatches &&
            activeItem &&
            permittedActiveAdvance(branchRecord.prHeadSha, pr.headRefOid, activeItem)
        );
        if (branchRecord.prHeadSha && pr.headRefOid !== branchRecord.prHeadSha) {
          if (isPermittedForwardAdvance) {
            warnings.push(`active PR head advanced beyond its last observed SHA: #${branchRecord.pr}`);
          } else {
            errors.push(`registry PR head SHA mismatch: #${branchRecord.pr}`);
          }
        }
        if (branchRecord.prState && pr.state !== branchRecord.prState) {
          const isPermittedMonotonicPrTransition = monotonicPrTransitionAllowed({
            observationMode: branchRecord.prStateObservationMode,
            recordedState: branchRecord.prState,
            liveState: pr.state,
            recordedHeadPresent: Boolean(branchRecord.prHeadSha),
            recordedHeadMatches,
            permittedForwardAdvance: isPermittedForwardAdvance
          });
          if (isPermittedMonotonicPrTransition) {
            warnings.push(`PR lifecycle advanced beyond its registry observation: #${branchRecord.pr}`);
          } else {
            errors.push(`registry PR state mismatch: #${branchRecord.pr}`);
          }
        }
        if (branchRecord.prBase && pr.baseRefName !== branchRecord.prBase) {
          errors.push(`registry PR base mismatch: #${branchRecord.pr}`);
        }
      }
    }
    for (const pr of livePrState.pullRequests.filter((entry) => entry.state === "OPEN")) {
      if (!(registry.branches ?? []).some((branch) => branch.pr === pr.number)) {
        errors.push(`open GitHub PR lacks a registry binding: #${pr.number}`);
      }
    }
  }

  const report = {
    schemaVersion: "sena-repo-governance-audit/v1",
    generatedAt: new Date().toISOString(),
    checkoutRoot: REPO_ROOT,
    controlRoot: CONTROL_ROOT,
    status: errors.length > 0 ? "fail" : ownerBlockers.length > 0 ? "blocked-owner" : "pass",
    registeredWorktreeCount: registered.length,
    diskMarkerCount: markers.length,
    invalidDiskMarkerCount: markers.filter((entry) => !entry.valid).length,
    localBranchCount: branches.length,
    rescueRefCount: rescueRefs.length,
    unreachableCommitCount: unreachableCommits.length,
    activeWriterCount: validation.activeWriterCount,
    liveRemoteRefs: liveRemote,
    livePullRequests: livePrState,
    errors,
    warnings,
    ownerBlockers,
    registeredWorktrees: registered,
    diskMarkers: markers.map(({ markerPath, kind, target, valid, path }) => ({
      path,
      markerPath,
      kind,
      target: target ?? null,
      valid
    })),
    branches
  };
  const outputPath = flagValues(flags, "output")[0];
  if (outputPath) {
    writeOwnerOnlyAtomic(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (errors.length > 0) process.exitCode = 1;
}

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function writeOwnerOnlyAtomic(outputPath, content) {
  const resolvedOutput = resolve(outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  if (existsSync(resolvedOutput) && lstatSync(resolvedOutput).isSymbolicLink()) {
    throw new Error("refusing to replace a symlink output target");
  }
  const temporaryPath = `${resolvedOutput}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
  let descriptor = null;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, resolvedOutput);
    chmodSync(resolvedOutput, 0o600);
    if (!fileModeIsOwnerOnly(resolvedOutput)) throw new Error("owner-only output mode verification failed");
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
  return resolvedOutput;
}

function gitBlobId(buffer) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${buffer.length}\0`))
    .update(buffer)
    .digest("hex");
}

function objectSetForRefs(refs) {
  if (refs.length === 0) return new Set();
  return new Set(
    gitText(["rev-list", "--objects", ...refs], { maxBuffer: 512 * 1024 * 1024 })
      .split("\n")
      .map((line) => line.split(" ", 1)[0])
      .filter(Boolean)
  );
}

function refsUnder(prefix) {
  return gitText(["for-each-ref", "--format=%(refname)", prefix])
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function directoryApproximateBytes(path) {
  const result = spawnSync("du", ["-sk", path], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (result.status !== 0) return null;
  const kib = Number(String(result.stdout).trim().split(/\s+/, 1)[0]);
  return Number.isFinite(kib) ? kib * 1024 : null;
}

function runtimeFileRisk(relativePath) {
  const normalized = normalizeRepoPath(relativePath);
  const parts = normalized.split("/");
  if (parts.some((part) => SENSITIVE_RUNTIME_DIRECTORY_NAMES.has(part))) return "sensitive-runtime";
  if (classifySensitivePath(normalized)) return "sensitive-path";
  if (/\.(?:db|sqlite|sqlite3)$/i.test(normalized)) return "sensitive-runtime";
  if (/(?:^|\/)(?:uploads?|runtime-state)(?:\/|$)/i.test(normalized)) return "sensitive-runtime";
  if (normalized === ".claude" || normalized.startsWith(".claude/")) return "machine-local";
  if (normalized.endsWith("/.DS_Store") || normalized === ".DS_Store") return "machine-local";
  if (normalized.endsWith(".tsbuildinfo")) return "regenerable";
  return "reviewable";
}

function representationForBlob(oid, sets, objectDatabase) {
  if (sets.main.has(oid)) return "origin-main";
  if (sets.remote.has(oid)) return "remote-ref";
  if (sets.local.has(oid)) return "local-branch";
  if (sets.rescue.has(oid)) return "rescue-ref";
  if (objectDatabase.has(oid)) return "object-db-only";
  return "disk-only";
}

function collectInventoryFiles(root, skippedDirectories) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const rel = normalizeRepoPath(relative(root, path));
      if (rel === ".git") continue;
      if (entry.isDirectory()) {
        const generated = GENERATED_DIRECTORY_NAMES.has(entry.name) || entry.name.endsWith("_build");
        if (generated) {
          skippedDirectories.push({
            path: rel,
            classification: "regenerable",
            bytesApproximate: directoryApproximateBytes(path)
          });
          continue;
        }
        walk(path);
        continue;
      }
      files.push({ path, relativePath: rel });
    }
  };
  walk(root);
  return files;
}

function objectDatabasePresence(oids) {
  if (oids.length === 0) return new Set();
  const result = git(["cat-file", "--batch-check=%(objectname) %(objecttype)"], {
    input: `${oids.join("\n")}\n`,
    maxBuffer: 256 * 1024 * 1024
  });
  const present = new Set();
  for (const line of String(result.stdout ?? "").split("\n")) {
    const [oid, type] = line.trim().split(" ");
    if (type === "blob") present.add(oid);
  }
  return present;
}

function runInventory(flags) {
  const registryPath = flagValues(flags, "registry")[0] ?? DEFAULT_REGISTRY;
  const outputPath = flagValues(flags, "output")[0];
  if (!outputPath) fail("inventory requires --output <absolute-or-relative-path>");
  const { parsed: registry } = loadRegistry(registryPath);
  const validation = validateRegistry(registry);
  if (validation.errors.length > 0) fail(`registry is invalid: ${validation.errors.join("; ")}`);

  const mainRefs = gitObjectExists("origin/main^{commit}") ? ["origin/main"] : [];
  const localRefs = refsUnder("refs/heads");
  const remoteRefs = refsUnder("refs/remotes");
  const rescueRefs = refsUnder("refs/rescue/sena-20260827");
  const sets = {
    main: objectSetForRefs(mainRefs),
    local: objectSetForRefs(localRefs),
    remote: objectSetForRefs(remoteRefs),
    rescue: objectSetForRefs(rescueRefs)
  };

  const roots = [];
  const allRecords = [];
  for (const orphan of registry.orphanWorktrees) {
    const root = orphan.path;
    if (!existsSync(root)) {
      roots.push({ path: root, status: "absent", gitMarker: null, files: [], skippedDirectories: [] });
      continue;
    }
    const skippedDirectories = [];
    const fileCandidates = collectInventoryFiles(root, skippedDirectories);
    const records = [];
    for (const candidate of fileCandidates) {
      const info = lstatSync(candidate.path);
      if (info.isSymbolicLink()) {
        const targetBytes = Buffer.from(readlinkSync(candidate.path), "utf8");
        records.push({
          relativePath: candidate.relativePath,
          type: "symlink",
          size: info.size,
          mtime: info.mtime.toISOString(),
          sha256: sha256Buffer(targetBytes),
          gitBlob: null,
          riskClass: runtimeFileRisk(candidate.relativePath),
          representation: "not-applicable"
        });
        continue;
      }
      if (!info.isFile()) continue;
      const buffer = readFileSync(candidate.path);
      const gitBlob = gitBlobId(buffer);
      records.push({
        relativePath: candidate.relativePath,
        type: "file",
        size: info.size,
        mtime: info.mtime.toISOString(),
        sha256: sha256Buffer(buffer),
        gitBlob,
        riskClass: runtimeFileRisk(candidate.relativePath),
        representation: null
      });
    }
    allRecords.push(...records.filter((record) => record.gitBlob));
    roots.push({
      path: root,
      status: "present",
      gitMarker: markerInfo(root),
      files: records,
      skippedDirectories
    });
  }

  const uniqueOids = [...new Set(allRecords.map((record) => record.gitBlob))];
  const objectDatabase = objectDatabasePresence(uniqueOids);
  for (const root of roots) {
    for (const record of root.files) {
      if (!record.gitBlob) continue;
      record.representation = representationForBlob(record.gitBlob, sets, objectDatabase);
    }
  }

  const summary = {
    totalFiles: 0,
    totalBytes: 0,
    byRepresentation: {},
    byRiskClass: {},
    skippedDirectoryCount: 0,
    diskOnlyReviewableFiles: []
  };
  for (const root of roots) {
    summary.skippedDirectoryCount += root.skippedDirectories.length;
    for (const record of root.files) {
      summary.totalFiles += 1;
      summary.totalBytes += record.size;
      summary.byRepresentation[record.representation] =
        (summary.byRepresentation[record.representation] ?? 0) + 1;
      summary.byRiskClass[record.riskClass] = (summary.byRiskClass[record.riskClass] ?? 0) + 1;
      if (record.representation === "disk-only" && record.riskClass === "reviewable") {
        summary.diskOnlyReviewableFiles.push({
          orphanPath: root.path,
          relativePath: record.relativePath,
          size: record.size,
          sha256: record.sha256,
          gitBlob: record.gitBlob
        });
      }
    }
  }

  const report = {
    schemaVersion: "sena-orphan-worktree-inventory/v1",
    generatedAt: new Date().toISOString(),
    checkoutRoot: REPO_ROOT,
    controlRoot: CONTROL_ROOT,
    scope: "all non-generated file metadata and hashes; sensitive-runtime files are classified and hashed but never copied or content-disclosed",
    objectGroups: {
      originMain: mainRefs,
      localBranches: localRefs,
      remoteRefs,
      rescueRefs
    },
    summary,
    roots
  };
  const resolvedOutput = writeOwnerOnlyAtomic(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `SENA_ORPHAN_INVENTORY written=${resolvedOutput} files=${summary.totalFiles} diskOnlyReviewable=${summary.diskOnlyReviewableFiles.length} skippedDirectories=${summary.skippedDirectoryCount}\n`
  );
}

function printUsage() {
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  node scripts/verify-sena-repo-governance.mjs security [--tree REF] [--range A..B] [--staged]\n`);
  process.stdout.write(`  node scripts/verify-sena-repo-governance.mjs security --pre-push --remote-name origin < updates\n`);
  process.stdout.write(`  node scripts/verify-sena-repo-governance.mjs write-policy --registry-from-index --staged\n`);
  process.stdout.write(`  node scripts/verify-sena-repo-governance.mjs push-policy --remote-name origin < updates\n`);
  process.stdout.write(`  node scripts/verify-sena-repo-governance.mjs deletion-boundary --authorization-registry-commit SHA < updates\n`);
  process.stdout.write(`  node scripts/verify-sena-repo-governance.mjs local-ref-retirement-boundary --authorization-registry-commit SHA --authorization-id ID\n`);
  process.stdout.write(`  node scripts/verify-sena-repo-governance.mjs local-ref-retirement --authorization-registry-commit SHA --authorization-id ID\n`);
  process.stdout.write(`  node scripts/verify-sena-repo-governance.mjs registry [--registry PATH]\n`);
  process.stdout.write(`  node scripts/verify-sena-repo-governance.mjs audit [--live] [--registry-from-index|--registry-from-commit SHA] [--output PATH]\n`);
  process.stdout.write(`  node scripts/verify-sena-repo-governance.mjs inventory --output PATH\n`);
}

function main() {
  const { command, flags } = parseArguments(process.argv.slice(2));
  try {
    if (command === "security") return runSecurity(flags);
    if (command === "write-policy") return runWritePolicy(flags);
    if (command === "push-policy") return runPushPolicy(flags);
    if (command === "deletion-boundary") return runDeletionBoundary(flags);
    if (command === "local-ref-retirement-boundary") return runLocalRefRetirementBoundary(flags);
    if (command === "local-ref-retirement") return runLocalRefRetirement(flags);
    if (command === "registry") return runRegistry(flags);
    if (command === "audit") return runAudit(flags);
    if (command === "inventory") return runInventory(flags);
    if (command === "help" || flags.has("help")) return printUsage();
    fail(`unknown command: ${command}`);
  } catch (error) {
    fail(`SENA_REPO_GOVERNANCE error=${error instanceof Error ? error.message : String(error)}`);
  }
}

if (realpathSync(process.argv[1]) === realpathSync(SCRIPT_PATH)) main();
