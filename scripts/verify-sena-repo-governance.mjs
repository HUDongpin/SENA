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
import { isDeepStrictEqual, types } from "node:util";

const GOVERNANCE_CALLER_GIT_ENVIRONMENT_ALLOWLIST = new Set([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_AUTHOR_DATE",
  "GIT_AUTHOR_EMAIL",
  "GIT_AUTHOR_NAME",
  "GIT_COMMON_DIR",
  "GIT_DIR",
  "GIT_EDITOR",
  "GIT_EXEC_PATH",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_OPTIONAL_LOCKS",
  "GIT_PAGER",
  "GIT_PREFIX",
  "GIT_REFLOG_ACTION",
  "GIT_WORK_TREE"
]);

export function validateGovernanceGitEnvironment(environment) {
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) {
    throw new Error("rule=governance-git-environment-invalid");
  }
  for (const name of Object.keys(environment)) {
    if (
      name.startsWith("GIT_") &&
      !GOVERNANCE_CALLER_GIT_ENVIRONMENT_ALLOWLIST.has(name)
    ) {
      throw new Error("rule=governance-git-environment-invalid");
    }
  }
  return true;
}

validateGovernanceGitEnvironment(process.env);

const protectedActivationNativeStructuredClone =
  globalThis.structuredClone.bind(globalThis);

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
const EXPECTED_REMOTE_IDENTITY = Object.freeze({
  name: "origin",
  provider: "github.com",
  owner: "HUDongpin",
  repository: "SENA"
});
const EXPECTED_REMOTE_HTTPS_URL = "https://github.com/HUDongpin/SENA.git";
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

const GOVERNANCE_FORWARDED_CONTROL_GIT_ENVIRONMENT = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_WORK_TREE"
];

export function governanceGitEnvironment(environment) {
  validateGovernanceGitEnvironment(environment);
  const sanitized = Object.fromEntries(
    Object.entries(environment).filter(([name]) => !name.startsWith("GIT_"))
  );
  for (const name of GOVERNANCE_FORWARDED_CONTROL_GIT_ENVIRONMENT) {
    if (typeof environment[name] === "string") {
      sanitized[name] = environment[name];
    }
  }
  sanitized.GIT_CONFIG_GLOBAL = "/dev/null";
  sanitized.GIT_CONFIG_SYSTEM = "/dev/null";
  sanitized.GIT_CONFIG_NOSYSTEM = "1";
  sanitized.GIT_OPTIONAL_LOCKS = "0";
  sanitized.GIT_PAGER = "cat";
  sanitized.GIT_TERMINAL_PROMPT = "0";
  return sanitized;
}

const GOVERNANCE_GIT_ENVIRONMENT = governanceGitEnvironment(process.env);

function git(args, options = {}) {
  const gitEnvironment = { ...GOVERNANCE_GIT_ENVIRONMENT };
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

function gitDerivedControlRoot() {
  return dirname(
    resolve(
      gitText(["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim()
    )
  );
}

export function validateIsolatedGovernanceControlRootContext(context) {
  const fail = () => {
    throw new Error("rule=isolated-governance-control-root-context-invalid");
  };
  if (!isPlainRecord(context)) fail();
  const {
    canonicalRegistryRepositoryRoot,
    requestedControlRoot,
    targetRoot,
    gitWorkTree,
    gitDirectory,
    gitCommonDirectory,
    gitIndex,
    gitObjectDirectory,
    alternateObjectDirectories
  } = context;
  const requiredPaths = [
    canonicalRegistryRepositoryRoot,
    requestedControlRoot,
    targetRoot,
    gitWorkTree,
    gitDirectory,
    gitCommonDirectory,
    gitIndex,
    gitObjectDirectory
  ];
  if (
    requiredPaths.some(
      (value) =>
        typeof value !== "string" ||
        value.length === 0 ||
        resolve(value) !== value
    ) ||
    !Array.isArray(alternateObjectDirectories) ||
    alternateObjectDirectories.some(
      (value) =>
        typeof value !== "string" ||
        value.length === 0 ||
        resolve(value) !== value
    )
  ) {
    fail();
  }
  const canonicalRealGitDirectory = join(
    canonicalRegistryRepositoryRoot,
    ".git"
  );
  const isolatedParent = dirname(gitDirectory);
  if (
    requestedControlRoot !== canonicalRegistryRepositoryRoot ||
    targetRoot !== gitWorkTree ||
    !pathIsWithin(canonicalRegistryRepositoryRoot, targetRoot) ||
    gitCommonDirectory !== gitDirectory ||
    dirname(gitIndex) !== isolatedParent ||
    dirname(gitObjectDirectory) !== isolatedParent ||
    pathIsWithin(targetRoot, isolatedParent) ||
    pathIsWithin(canonicalRealGitDirectory, isolatedParent) ||
    pathIsWithin(targetRoot, gitDirectory) ||
    pathIsWithin(targetRoot, gitIndex) ||
    pathIsWithin(targetRoot, gitObjectDirectory) ||
    pathIsWithin(canonicalRealGitDirectory, gitDirectory) ||
    pathIsWithin(canonicalRealGitDirectory, gitIndex) ||
    pathIsWithin(canonicalRealGitDirectory, gitObjectDirectory) ||
    alternateObjectDirectories.length !== 1 ||
    alternateObjectDirectories[0] !== join(canonicalRealGitDirectory, "objects")
  ) {
    fail();
  }
  return true;
}

function exactNativeGitPathFile(path, prefix = "") {
  const marker = readFileSync(path, "utf8");
  const expression = prefix === "gitdir: "
    ? /^gitdir: ([^\r\n]+)\r?\n?$/
    : /^([^\r\n]+)\r?\n?$/;
  const match = marker.match(expression);
  if (!match || match[1].length === 0) {
    throw new Error("invalid native Git path file");
  }
  return match[1];
}

export function resolveCanonicalNativeGitControlPlaneContext(
  scriptRepoRoot,
  environment
) {
  try {
    if (
      typeof scriptRepoRoot !== "string" ||
      scriptRepoRoot.length === 0 ||
      !environment ||
      typeof environment !== "object" ||
      Array.isArray(environment) ||
      Object.hasOwn(environment, "SENA_GOVERNANCE_CONTROL_ROOT") ||
      Object.hasOwn(environment, "GIT_OBJECT_DIRECTORY") ||
      Object.hasOwn(environment, "GIT_ALTERNATE_OBJECT_DIRECTORIES")
    ) {
      return undefined;
    }
    const workTree = realpathSync(resolve(scriptRepoRoot));
    const gitMarker = join(workTree, ".git");
    const gitMarkerStat = lstatSync(gitMarker);
    let gitDirectory;
    let commonDirectory;
    if (gitMarkerStat.isDirectory() && !gitMarkerStat.isSymbolicLink()) {
      gitDirectory = realpathSync(gitMarker);
      const commonMarker = join(gitDirectory, "commondir");
      if (existsSync(commonMarker)) {
        const commonMarkerStat = lstatSync(commonMarker);
        if (!commonMarkerStat.isFile() || commonMarkerStat.isSymbolicLink()) {
          return undefined;
        }
        commonDirectory = realpathSync(
          resolve(
            gitDirectory,
            exactNativeGitPathFile(commonMarker)
          )
        );
      } else {
        commonDirectory = gitDirectory;
      }
    } else if (gitMarkerStat.isFile() && !gitMarkerStat.isSymbolicLink()) {
      gitDirectory = realpathSync(
        resolve(
          workTree,
          exactNativeGitPathFile(gitMarker, "gitdir: ")
        )
      );
      if (!statSync(gitDirectory).isDirectory()) {
        return undefined;
      }
      const commonMarker = join(gitDirectory, "commondir");
      const commonMarkerStat = lstatSync(commonMarker);
      if (!commonMarkerStat.isFile() || commonMarkerStat.isSymbolicLink()) {
        return undefined;
      }
      commonDirectory = realpathSync(
        resolve(
          gitDirectory,
          exactNativeGitPathFile(commonMarker)
        )
      );
    } else {
      return undefined;
    }
    const indexMarker = join(gitDirectory, "index");
    const indexMarkerStat = lstatSync(indexMarker);
    if (!indexMarkerStat.isFile() || indexMarkerStat.isSymbolicLink()) {
      return undefined;
    }
    const indexPath = realpathSync(indexMarker);
    const requiredEnvironmentPaths = [
      environment.SENA_GOVERNANCE_TARGET_ROOT,
      environment.GIT_DIR
    ];
    if (
      requiredEnvironmentPaths.some(
        (value) =>
          typeof value !== "string" ||
          value.length === 0 ||
          resolve(value) !== value
      ) ||
      realpathSync(environment.SENA_GOVERNANCE_TARGET_ROOT) !== workTree ||
      realpathSync(environment.GIT_DIR) !== gitDirectory ||
      (Object.hasOwn(environment, "GIT_INDEX_FILE") &&
        (
          typeof environment.GIT_INDEX_FILE !== "string" ||
          environment.GIT_INDEX_FILE.length === 0 ||
          resolve(environment.GIT_INDEX_FILE) !== environment.GIT_INDEX_FILE ||
          realpathSync(environment.GIT_INDEX_FILE) !== indexPath
        )) ||
      (Object.hasOwn(environment, "GIT_WORK_TREE") &&
        (
          typeof environment.GIT_WORK_TREE !== "string" ||
          environment.GIT_WORK_TREE.length === 0 ||
          resolve(environment.GIT_WORK_TREE) !== environment.GIT_WORK_TREE ||
          realpathSync(environment.GIT_WORK_TREE) !== workTree
        )) ||
      (Object.hasOwn(environment, "GIT_COMMON_DIR") &&
        (
          typeof environment.GIT_COMMON_DIR !== "string" ||
          environment.GIT_COMMON_DIR.length === 0 ||
          resolve(environment.GIT_COMMON_DIR) !== environment.GIT_COMMON_DIR ||
          realpathSync(environment.GIT_COMMON_DIR) !== commonDirectory
        ))
    ) {
      return undefined;
    }
    return {
      controlRoot: realpathSync(dirname(commonDirectory)),
      workTree,
      gitDirectory,
      commonDirectory,
      indexPath
    };
  } catch {
    return undefined;
  }
}

function isolatedGovernanceControlRootFromEnvironment() {
  const canonicalNativeContext = resolveCanonicalNativeGitControlPlaneContext(
    SCRIPT_REPO_ROOT,
    process.env
  );
  if (canonicalNativeContext) return canonicalNativeContext.controlRoot;
  const requestedControlRoot = process.env.SENA_GOVERNANCE_CONTROL_ROOT;
  const isolationEnvironmentNames = [
    "SENA_GOVERNANCE_CONTROL_ROOT",
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES"
  ];
  const isolationSignalPresent = isolationEnvironmentNames.some(
    (name) => Object.hasOwn(process.env, name)
  );
  const legacyTargetRootOnly =
    !isolationSignalPresent &&
    typeof process.env.SENA_GOVERNANCE_TARGET_ROOT === "string" &&
    process.env.SENA_GOVERNANCE_TARGET_ROOT.length > 0;
  if (!isolationSignalPresent) {
    if (legacyTargetRootOnly) {
      try {
        const requestedTargetRoot = realpathSync(
          resolve(process.env.SENA_GOVERNANCE_TARGET_ROOT)
        );
        const gitDerivedWorkTree = realpathSync(
          resolve(gitText(["rev-parse", "--show-toplevel"]).trim())
        );
        if (requestedTargetRoot !== gitDerivedWorkTree) {
          throw new Error("target root differs from Git worktree");
        }
      } catch {
        throw new Error(
          "rule=isolated-governance-control-root-context-invalid"
        );
      }
    }
    return gitDerivedControlRoot();
  }
  const requiredEnvironment = [
    requestedControlRoot,
    process.env.SENA_GOVERNANCE_TARGET_ROOT,
    process.env.GIT_DIR,
    process.env.GIT_WORK_TREE,
    process.env.GIT_INDEX_FILE,
    process.env.GIT_OBJECT_DIRECTORY,
    process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES
  ];
  try {
    if (
      requiredEnvironment.some(
        (value) => typeof value !== "string" || value.length === 0
      )
    ) {
      throw new Error("incomplete isolated control-plane environment");
    }
    const controlRoot = realpathSync(resolve(requestedControlRoot));
    const targetRoot = realpathSync(resolve(process.env.SENA_GOVERNANCE_TARGET_ROOT));
    const gitWorkTree = realpathSync(resolve(process.env.GIT_WORK_TREE));
    const gitDirectory = realpathSync(resolve(process.env.GIT_DIR));
    const gitIndex = realpathSync(resolve(process.env.GIT_INDEX_FILE));
    const gitObjectDirectory = realpathSync(
      resolve(process.env.GIT_OBJECT_DIRECTORY)
    );
    const alternateObjectDirectories = process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES
      .split(":")
      .filter(Boolean)
      .map((entry) => realpathSync(resolve(entry)));
    const gitCommonDirectory = realpathSync(
      resolve(
        gitText([
          "rev-parse",
          "--path-format=absolute",
          "--git-common-dir"
        ]).trim()
      )
    );
    const canonicalRegistryRepositoryRoot = realpathSync(
      resolve(JSON.parse(readFileSync(DEFAULT_REGISTRY, "utf8")).repo)
    );
    if (targetRoot !== REPO_ROOT) {
      throw new Error("isolated target root mismatch");
    }
    validateIsolatedGovernanceControlRootContext({
      canonicalRegistryRepositoryRoot,
      requestedControlRoot: controlRoot,
      targetRoot,
      gitWorkTree,
      gitDirectory,
      gitCommonDirectory,
      gitIndex,
      gitObjectDirectory,
      alternateObjectDirectories
    });
    return controlRoot;
  } catch {
    throw new Error(
      "rule=isolated-governance-control-root-context-invalid"
    );
  }
}

const CONTROL_ROOT = isolatedGovernanceControlRootFromEnvironment();

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

function loadProtectedMainAuthorizationRegistry(flags, { required = false } = {}) {
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

function unstagedChangedPaths() {
  return gitText(["diff", "--name-only", "--diff-filter=ACMRTD", "--no-renames", "-z"])
    .split("\0")
    .filter(Boolean);
}

export function postPr82FinalHeartbeatPreCommitCleanClaimAllowed({
  taskId,
  dirtyState,
  lifecycleStatus,
  preCommit,
  registryFromIndex,
  dirtyPaths,
  stagedPaths,
  unstagedPaths
} = {}) {
  return (
    taskId === "SENA-A01-REPO-GOVERNANCE-20260827" &&
    dirtyState === "clean-registry-only-post-pr82-topology-heartbeat-final" &&
    lifecycleStatus === POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_STATUS &&
    preCommit === true &&
    registryFromIndex === true &&
    sameJson(dirtyPaths, POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_SCOPE) &&
    sameJson(stagedPaths, POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_SCOPE) &&
    sameJson(unstagedPaths, [])
  );
}

function runWritePolicy(flags) {
  if (!flags.has("registry-from-index") || !flags.has("staged")) {
    throw new Error("write-policy requires --registry-from-index --staged");
  }
  const { parsed: registry } = loadRegistryForFlags(flags);
  const validation = validateRegistry(registry);
  appendHostPhysicalCustodyErrors(registry, validation.errors);
  if (validation.errors.length > 0) throw new Error("index registry snapshot is invalid");
  const exactLifecycleIndexTransition = Boolean(
    validatePr80RepairIndexTransition(registry) ||
      validateEvidenceFlowCurrentnessIndexTransition(registry) ||
      validateProtectedCurrentnessRepairIndexTransition(registry) ||
      validatePostPr83CurrentnessIndexTransition(registry)
  );

  const findings = [];
  const stagedPaths = stagedChangedPaths();
  const branchResult = git(["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true });
  const branchName = branchResult.status === 0 ? String(branchResult.stdout).trim() : null;
  const pathBoundCurrentItem = (registry.workItems ?? []).find(
    (item) => sameExistingPath(item.worktreePath, REPO_ROOT) && item.branch === branchName
  );
  const currentItem = pathBoundCurrentItem ?? (
    exactLifecycleIndexTransition
      ? (registry.workItems ?? []).find(
          (item) => item.branch === branchName && ACTIVE_WRITE_DISPOSITIONS.has(item.disposition)
        )
      : null
  );
  const branchRecord = (registry.branches ?? []).find((branch) => branch.name === branchName);
  const expectedRef = branchName ? `refs/heads/${branchName}` : "detached-head";

  if (stagedPaths.length === 0) {
    addFinding(findings, {
      path: "index",
      rule: "empty-staged-index-not-authorized",
      source: "write-policy"
    });
  }
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
    for (const path of stagedPaths) {
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
    process.stdout.write(`SENA_WRITE_POLICY pass staged=${stagedPaths.length} registrySource=index\n`);
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

const PR80_REPAIR_TASK_ID = "SENA-A01-REPO-GOVERNANCE-20260827";
const PR80_REPAIR_OWNER_KEY = "Codex-primary-writer";
const PR80_REPAIR_INITIAL_STATUS = "pr80-repair-authorization-candidate-awaiting-initial-checks";
const PR80_REPAIR_FINAL_STATUS = "pr80-ready-authorization-pending-final-head-checks";
const PR80_REPAIR_INITIAL_ACTION =
  "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks";
const PR80_REPAIR_FINAL_ACTION = "pr80ReadyAndProtectedMergeAuthorizedAfterFinalChecks";
const PR80_REPAIR_INITIAL_RECEIPT_KIND =
  "pr80-final-ready-test-repair-authorization-candidate";
const PR80_REPAIR_FINAL_RECEIPT_KIND =
  "pr80-final-ready-test-repair-final-authorization";
const PR80_REPAIR_INITIAL_SCOPE = [
  "coordination/repo-governance/active-work.json",
  "coordination/repo-governance/pr46-final-ready-repair-design.md",
  "coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md",
  "scripts/verify-sena-repo-governance.mjs",
  "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
];
const PR80_REPAIR_IMPLEMENTATION_SCOPE = [
  "scripts/verify-sena-repo-governance.mjs",
  "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
];
const PR80_REPAIR_FINAL_SCOPE = [REGISTRY_REPO_PATH];
const PR80_REPAIR_CLOSED_ACTIONS = [
  "pr46ReadyAndProtectedMergeAuthorizedNow",
  "localRefRetirementAuthorized",
  "retirementReceiptMintingAuthorized",
  "branchDeletionAuthorized",
  "worktreeRemovalAuthorized",
  "orphanWorktreeMutationAuthorized",
  "targetTagMutationAuthorized",
  "quarantineMutationAuthorized",
  "deploymentAuthorized",
  "providerMutationAuthorized",
  "resetAuthorized",
  "rebaseAuthorized",
  "stashAuthorized",
  "forceAuthorized",
  "historyRewriteAuthorized"
];

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactDistinctPositiveIntegerArray(value, count) {
  return (
    Array.isArray(value) &&
    value.length === count &&
    new Set(value).size === count &&
    value.every((entry) => Number.isInteger(entry) && entry > 0)
  );
}

function validSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function pr80RepairLifecycleWorkItem(registry) {
  return (registry?.workItems ?? []).find((entry) => entry?.taskId === PR80_REPAIR_TASK_ID);
}

function pr80RepairLifecycleReceipts(registry) {
  return (registry?.releaseReceipts ?? []).filter((entry) =>
    [PR80_REPAIR_INITIAL_RECEIPT_KIND, PR80_REPAIR_FINAL_RECEIPT_KIND].includes(entry?.receiptKind)
  );
}

export function pr80RepairLifecycleTrueAuthorizationPaths(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const paths = [];
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (entry === true && key.includes("Authorized")) paths.push(nextPath.join("."));
    if (entry && typeof entry === "object") {
      paths.push(...pr80RepairLifecycleTrueAuthorizationPaths(entry, nextPath));
    }
  }
  return paths.sort();
}

function pr80RepairReceiptPrefixSha256(receipts, count) {
  return sha256Buffer(Buffer.from(JSON.stringify(receipts.slice(0, count))));
}

function validatePr80RepairTransitionReceipt(receipt, expectedKind, expectedScope, allowedAction) {
  if (
    !receipt ||
    receipt.schemaVersion !== "sena-registry-reconciliation-receipt/v1" ||
    receipt.receiptKind !== expectedKind ||
    receipt.taskId !== PR80_REPAIR_TASK_ID ||
    receipt.ownerKey !== PR80_REPAIR_OWNER_KEY ||
    !sameStringSet(receipt.scope ?? [], expectedScope) ||
    !receipt.authorizationBoundary ||
    !sameStringSet(
      pr80RepairLifecycleTrueAuthorizationPaths(receipt),
      [`authorizationBoundary.${allowedAction}`]
    )
  ) {
    throw new Error("rule=pr80-repair-transition-receipt-invalid");
  }
}

function validatePr80RepairTransitionSemantics(lifecycle) {
  const transition = lifecycle?.authorizedTransition;
  if (
    !transition ||
    !sameStringSet(transition.allowedStatuses ?? [], [
      PR80_REPAIR_INITIAL_STATUS,
      PR80_REPAIR_FINAL_STATUS
    ]) ||
    transition.arbitraryStatusMustFailClosed !== true ||
    transition.unknownTrueAuthorizationMustFailClosedRecursively !== true ||
    transition.replayOfEarlierActionMustFailClosed !== true ||
    transition.receiptPrefixMustRemainByteEquivalent !== true ||
    transition.exactTransitionOrderRequired !== true ||
    transition.completeA01WorkItemAndBranchAuthorizationSetMustBeCompared !== true ||
    !sameStringSet(
      transition.finalFieldLevelDelta?.allowedWorkItemFields ?? [],
      PR80_FINAL_MUTABLE_WORK_ITEM_FIELDS
    ) ||
    !sameStringSet(
      transition.finalFieldLevelDelta?.allowedLifecycleFields ?? [],
      PR80_FINAL_MUTABLE_LIFECYCLE_FIELDS
    ) ||
    !sameStringSet(
      transition.finalFieldLevelDelta?.allowedBranchFields ?? [],
      PR80_FINAL_MUTABLE_BRANCH_FIELDS
    ) ||
    transition.finalFieldLevelDelta?.siblingAuthorizationWideningMustFailClosed !== true ||
    transition.finalFieldLevelDelta
      ?.allowedPathsOwnerDispositionAndHistoricalAuthorizationDriftMustFailClosed !== true ||
    transition.finalEvidenceBinding?.buildRunIdCount !== 1 ||
    transition.finalEvidenceBinding?.repositorySecurityRunIdCount !== 2 ||
    transition.finalEvidenceBinding?.checkJobIdCount !== 3 ||
    transition.finalEvidenceBinding?.arraysMustContainDistinctPositiveIntegers !== true ||
    transition.finalEvidenceBinding
      ?.lifecycleReceiptAndExplicitObservationContextMustMatch !== true ||
    !sameStringSet(
      transition.initialState?.allowedTrueAuthorizationPaths ?? [],
      [PR80_REPAIR_INITIAL_ACTION]
    ) ||
    transition.initialState?.requiredReceiptKind !== PR80_REPAIR_INITIAL_RECEIPT_KIND ||
    !sameStringSet(
      transition.initialState?.requiredReceiptScope ?? [],
      PR80_REPAIR_INITIAL_SCOPE
    ) ||
    transition.initialState
      ?.completeA01AuthorizationSetMustEqualProtectedSourcePlusInitialAction !== true ||
    !sameStringSet(
      transition.finalState?.allowedTrueAuthorizationPaths ?? [],
      [PR80_REPAIR_FINAL_ACTION]
    ) ||
    transition.finalState?.requiredReceiptKind !== PR80_REPAIR_FINAL_RECEIPT_KIND ||
    !sameStringSet(
      transition.finalState?.requiredReceiptScope ?? [],
      PR80_REPAIR_FINAL_SCOPE
    ) ||
    transition.finalState?.a01WriterLaneSealedAfterFinalCommit !== true ||
    transition.finalState?.unchangedFinalLifecycleDeltaOnA01MustFailClosed !== true ||
    transition.finalState?.laterRegistryLifecyclesMustUseSeparatelyValidatedNonA01Lane !== true ||
    transition.finalState?.requiredFinalPreCommitPrState?.pullRequestNumber !== 80 ||
    transition.finalState?.requiredFinalPreCommitPrState?.state !== "OPEN" ||
    transition.finalState?.requiredFinalPreCommitPrState?.base !== "main" ||
    transition.finalState?.requiredFinalPreCommitPrState?.isDraft !== true ||
    transition.finalState?.requiredFinalPreCommitPrState?.prReadyForReview !== false ||
    transition.finalState?.requiredFinalPreCommitPrState?.mergeAuthorized !== false ||
    transition.finalState?.requiredFinalPreCommitPrState?.mergeable !== "MERGEABLE" ||
    transition.finalState?.requiredFinalPreCommitPrState?.mergeStateStatus !== "CLEAN" ||
    transition.finalState?.requiredFinalPreCommitPrState
      ?.workItemBranchRemoteAndPrHeadMustEqualInitialCandidateHead !== true ||
    transition.finalState?.requiredFinalPreCommitPrState
      ?.appliesOnlyDuringInitialToFinalTransition !== true ||
    transition.finalState?.requiredFinalPreCommitPrState
      ?.standalonePostMainSnapshotMayRecordMonotonicMergedCurrentness !== true
  ) {
    throw new Error("rule=pr80-repair-transition-semantics-invalid");
  }
}

function validatePr80RepairFinalEvidence(evidence, receipt, context = null) {
  if (
    !evidence ||
    !isSha(evidence.headSha) ||
    !isSha(evidence.treeSha) ||
    !isSha(evidence.registryBlobSha) ||
    !Number.isInteger(evidence.buildRunId) ||
    evidence.buildRunId <= 0 ||
    !exactDistinctPositiveIntegerArray(evidence.repositorySecurityRunIds, 2) ||
    !exactDistinctPositiveIntegerArray(evidence.checkJobIds, 3) ||
    evidence.requiredChecksPassed !== true ||
    evidence.annotationsEmpty !== true ||
    evidence.specReviewApproved !== true ||
    evidence.qualityReviewApproved !== true ||
    receipt?.authorizationSourceInitialHeadSha !== evidence.headSha ||
    receipt?.authorizationSourceInitialTreeSha !== evidence.treeSha ||
    receipt?.authorizationSourceInitialRegistryBlobSha !== evidence.registryBlobSha ||
    receipt?.buildRunId !== evidence.buildRunId ||
    !sameJson(receipt?.repositorySecurityRunIds, evidence.repositorySecurityRunIds) ||
    !sameJson(receipt?.checkJobIds, evidence.checkJobIds) ||
    receipt?.requiredChecksPassed !== evidence.requiredChecksPassed ||
    receipt?.annotationsEmpty !== evidence.annotationsEmpty ||
    receipt?.specReviewApproved !== evidence.specReviewApproved ||
    receipt?.qualityReviewApproved !== evidence.qualityReviewApproved ||
    (context &&
      (context.sourceHeadSha !== evidence.headSha ||
        context.sourceTreeSha !== evidence.treeSha ||
        context.sourceRegistryBlobSha !== evidence.registryBlobSha ||
        context.buildRunId !== evidence.buildRunId ||
        !sameJson(context.repositorySecurityRunIds, evidence.repositorySecurityRunIds) ||
        !sameJson(context.checkJobIds, evidence.checkJobIds) ||
        context.requiredChecksPassed !== evidence.requiredChecksPassed ||
        context.annotationsEmpty !== evidence.annotationsEmpty ||
        context.specReviewApproved !== evidence.specReviewApproved ||
        context.qualityReviewApproved !== evidence.qualityReviewApproved))
  ) {
    throw new Error("rule=pr80-repair-final-evidence-invalid");
  }
}

function validatePr80RepairFinalPrState(registry, evidence) {
  const item = pr80RepairLifecycleWorkItem(registry);
  const branch = (registry?.branches ?? []).find(
    (entry) => entry?.name === "codex/sena-a01-repo-governance-20260827"
  );
  if (
    !item ||
    !branch ||
    item.plannedPullRequestNumber !== 80 ||
    item.prNumber !== 80 ||
    item.prIsDraft !== true ||
    item.prReadyForReview !== false ||
    item.mergeAuthorized !== false ||
    item.headSha !== evidence?.headSha ||
    branch.plannedPullRequestNumber !== 80 ||
    branch.pr !== 80 ||
    branch.prState !== "OPEN" ||
    branch.prBase !== "main" ||
    branch.prIsDraft !== true ||
    branch.prReadyForReview !== false ||
    branch.mergeAuthorized !== false ||
    branch.mergeable !== "MERGEABLE" ||
    branch.mergeStateStatus !== "CLEAN" ||
    branch.remotePresent !== true ||
    branch.headSha !== evidence?.headSha ||
    branch.remoteHeadSha !== evidence?.headSha ||
    branch.prHeadSha !== evidence?.headSha
  ) {
    throw new Error("rule=pr80-repair-final-pr-state-invalid");
  }
}

export function validatePr80RepairLifecycleSnapshot(registry, context = null) {
  const item = pr80RepairLifecycleWorkItem(registry);
  const lifecycle = item?.pr80FinalReadyTestRepairLifecycle;
  const lifecycleReceipts = pr80RepairLifecycleReceipts(registry);
  if (!lifecycle) {
    if (lifecycleReceipts.length > 0) throw new Error("rule=pr80-repair-lifecycle-missing");
    return null;
  }
  if (
    lifecycle.oneShot !== true ||
    lifecycle.pullRequestNumber !== 80 ||
    !isSha(lifecycle.protectedBaseSha) ||
    !isSha(lifecycle.protectedBaseTreeSha) ||
    !isSha(lifecycle.protectedBaseRegistryBlobSha) ||
    !sameStringSet(lifecycle.requiredCandidatePaths ?? [], PR80_REPAIR_INITIAL_SCOPE) ||
    !sameStringSet(lifecycle.repairImplementationPaths ?? [], PR80_REPAIR_IMPLEMENTATION_SCOPE)
  ) {
    throw new Error("rule=pr80-repair-lifecycle-core-invalid");
  }
  validatePr80RepairTransitionSemantics(lifecycle);
  if (
    !Number.isInteger(lifecycle.protectedBaseReceiptPrefix?.count) ||
    lifecycle.protectedBaseReceiptPrefix.count < 0 ||
    !validSha256(lifecycle.protectedBaseReceiptPrefix?.sha256) ||
    !Array.isArray(registry.releaseReceipts) ||
    registry.releaseReceipts.length < lifecycle.protectedBaseReceiptPrefix.count ||
    pr80RepairReceiptPrefixSha256(
      registry.releaseReceipts,
      lifecycle.protectedBaseReceiptPrefix.count
    ) !== lifecycle.protectedBaseReceiptPrefix.sha256
  ) {
    throw new Error("rule=pr80-repair-receipt-prefix-invalid");
  }
  if (
    lifecycle.status !== PR80_REPAIR_INITIAL_STATUS &&
    lifecycle.status !== PR80_REPAIR_FINAL_STATUS
  ) {
    throw new Error("rule=pr80-repair-status-invalid");
  }
  if (!PR80_REPAIR_CLOSED_ACTIONS.every((field) => lifecycle[field] === false)) {
    throw new Error(`rule=pr80-repair-${lifecycle.status === PR80_REPAIR_INITIAL_STATUS ? "initial" : "final"}-action-set-invalid`);
  }

  const prefixCount = lifecycle.protectedBaseReceiptPrefix.count;
  const initialReceipt = registry.releaseReceipts[prefixCount];
  if (lifecycle.status === PR80_REPAIR_INITIAL_STATUS) {
    if (
      lifecycle[PR80_REPAIR_INITIAL_ACTION] !== true ||
      lifecycle[PR80_REPAIR_FINAL_ACTION] !== false ||
      lifecycle.initialCandidateCompletionEvidence !== null ||
      !sameStringSet(
        pr80RepairLifecycleTrueAuthorizationPaths(lifecycle),
        [PR80_REPAIR_INITIAL_ACTION]
      )
    ) {
      throw new Error("rule=pr80-repair-initial-action-set-invalid");
    }
    if (
      registry.releaseReceipts.length < prefixCount + 1 ||
      lifecycleReceipts.length !== 1 ||
      initialReceipt?.receiptKind !== PR80_REPAIR_INITIAL_RECEIPT_KIND
    ) {
      throw new Error("rule=pr80-repair-initial-receipt-delta-invalid");
    }
    validatePr80RepairTransitionReceipt(
      initialReceipt,
      PR80_REPAIR_INITIAL_RECEIPT_KIND,
      PR80_REPAIR_INITIAL_SCOPE,
      PR80_REPAIR_INITIAL_ACTION
    );
    return lifecycle;
  }

  if (
    lifecycle[PR80_REPAIR_INITIAL_ACTION] !== false ||
    lifecycle[PR80_REPAIR_FINAL_ACTION] !== true ||
    !sameStringSet(
      pr80RepairLifecycleTrueAuthorizationPaths(lifecycle),
      [PR80_REPAIR_FINAL_ACTION]
    )
  ) {
    throw new Error("rule=pr80-repair-final-action-set-invalid");
  }
  const finalReceipt = registry.releaseReceipts[prefixCount + 1];
  if (
    registry.releaseReceipts.length < prefixCount + 2 ||
    lifecycleReceipts.length !== 2 ||
    initialReceipt?.receiptKind !== PR80_REPAIR_INITIAL_RECEIPT_KIND ||
    finalReceipt?.receiptKind !== PR80_REPAIR_FINAL_RECEIPT_KIND
  ) {
    throw new Error("rule=pr80-repair-final-receipt-delta-invalid");
  }
  validatePr80RepairTransitionReceipt(
    initialReceipt,
    PR80_REPAIR_INITIAL_RECEIPT_KIND,
    PR80_REPAIR_INITIAL_SCOPE,
    PR80_REPAIR_INITIAL_ACTION
  );
  validatePr80RepairTransitionReceipt(
    finalReceipt,
    PR80_REPAIR_FINAL_RECEIPT_KIND,
    PR80_REPAIR_FINAL_SCOPE,
    PR80_REPAIR_FINAL_ACTION
  );
  validatePr80RepairFinalEvidence(
    lifecycle.initialCandidateCompletionEvidence,
    finalReceipt,
    context
  );
  return lifecycle;
}

const PR80_FINAL_MUTABLE_WORK_ITEM_FIELDS = [
  "headSha",
  "aheadBehind",
  "lastHeartbeatAt",
  "lastObservedAt",
  "nextReviewAt",
  "prNumber",
  "noPrReason",
  "prIsDraft",
  "prReadyForReview",
  "mergeAuthorized",
  "dirtyState",
  "evidenceState"
];
const PR80_FINAL_MUTABLE_LIFECYCLE_FIELDS = [
  "status",
  "initialCandidateCompletionEvidence",
  PR80_REPAIR_INITIAL_ACTION,
  PR80_REPAIR_FINAL_ACTION
];
const PR80_FINAL_MUTABLE_BRANCH_FIELDS = [
  "headSha",
  "remoteHeadSha",
  "remoteObservedAt",
  "pr",
  "prState",
  "prIsDraft",
  "prReadyForReview",
  "mergeAuthorized",
  "prHeadSha",
  "noPrReason",
  "lastOwnerHeartbeatAt",
  "lastObservedAt",
  "lastCommitAt",
  "nextReviewAt",
  "closeout",
  "mergeable",
  "mergeStateStatus"
];

function withPr80MutableFieldsRedacted(record, fields) {
  const normalized = structuredClone(record ?? {});
  for (const field of fields) normalized[field] = `<pr80-owned:${field}>`;
  return normalized;
}

function normalizedPr80FinalImmutableRegistrySha256(registry) {
  const normalized = structuredClone(registry ?? {});
  normalized.updatedAt = "<pr80-owned>";
  normalized.workItems = (normalized.workItems ?? []).map((entry) =>
    entry?.taskId === PR80_REPAIR_TASK_ID
      ? withPr80MutableFieldsRedacted(
          {
            ...entry,
            pr80FinalReadyTestRepairLifecycle: withPr80MutableFieldsRedacted(
              entry.pr80FinalReadyTestRepairLifecycle,
              PR80_FINAL_MUTABLE_LIFECYCLE_FIELDS
            )
          },
          PR80_FINAL_MUTABLE_WORK_ITEM_FIELDS
        )
      : entry
  );
  normalized.branches = (normalized.branches ?? []).map((entry) =>
    entry?.name === "codex/sena-a01-repo-governance-20260827"
      ? withPr80MutableFieldsRedacted(entry, PR80_FINAL_MUTABLE_BRANCH_FIELDS)
      : entry
  );
  normalized.releaseReceipts = (normalized.releaseReceipts ?? []).filter(
    (entry) => ![PR80_REPAIR_INITIAL_RECEIPT_KIND, PR80_REPAIR_FINAL_RECEIPT_KIND].includes(entry?.receiptKind)
  );
  return sha256Buffer(Buffer.from(JSON.stringify(normalized)));
}

function pr80A01AuthorizationPaths(registry) {
  const workItem = pr80RepairLifecycleWorkItem(registry);
  const branch = (registry?.branches ?? []).find(
    (entry) => entry?.name === "codex/sena-a01-repo-governance-20260827"
  );
  if (!workItem || !branch) throw new Error("rule=pr80-repair-a01-record-missing");
  return pr80RepairLifecycleTrueAuthorizationPaths({ workItem, branch });
}

function expectedPr80FinalA01AuthorizationPaths(sourceRegistry) {
  const initialPath = `workItem.pr80FinalReadyTestRepairLifecycle.${PR80_REPAIR_INITIAL_ACTION}`;
  const finalPath = `workItem.pr80FinalReadyTestRepairLifecycle.${PR80_REPAIR_FINAL_ACTION}`;
  return pr80A01AuthorizationPaths(sourceRegistry)
    .filter((path) => path !== initialPath)
    .concat(finalPath)
    .sort();
}

function expectedPr80InitialA01AuthorizationPaths(sourceRegistry) {
  const initialPath = `workItem.pr80FinalReadyTestRepairLifecycle.${PR80_REPAIR_INITIAL_ACTION}`;
  return pr80A01AuthorizationPaths(sourceRegistry).concat(initialPath).sort();
}

export function pr80RepairLifecycleResolutionFromRegistries(sourceRegistry, candidateRegistry, context = {}) {
  const candidateLifecycle = validatePr80RepairLifecycleSnapshot(candidateRegistry, context);
  if (!candidateLifecycle) throw new Error("rule=pr80-repair-lifecycle-missing");
  const sourceLifecycle = pr80RepairLifecycleWorkItem(sourceRegistry)
    ?.pr80FinalReadyTestRepairLifecycle;
  const sourceReceipts = sourceRegistry?.releaseReceipts ?? [];
  const candidateReceipts = candidateRegistry?.releaseReceipts ?? [];

  if (!sourceLifecycle) {
    if (candidateLifecycle.status !== PR80_REPAIR_INITIAL_STATUS) {
      throw new Error("rule=pr80-repair-transition-source-invalid");
    }
    if (
      sourceReceipts.length !== candidateLifecycle.protectedBaseReceiptPrefix.count ||
      candidateReceipts.length !== sourceReceipts.length + 1 ||
      !sourceReceipts.every((receipt, index) => sameJson(receipt, candidateReceipts[index]))
    ) {
      throw new Error("rule=pr80-repair-initial-receipt-delta-invalid");
    }
    if (
      context.sourceHeadSha !== candidateLifecycle.protectedBaseSha ||
      context.sourceTreeSha !== candidateLifecycle.protectedBaseTreeSha ||
      context.sourceRegistryBlobSha !== candidateLifecycle.protectedBaseRegistryBlobSha
    ) {
      throw new Error("rule=pr80-repair-protected-base-mismatch");
    }
    if (
      !sameStringSet(
        pr80A01AuthorizationPaths(candidateRegistry),
        expectedPr80InitialA01AuthorizationPaths(sourceRegistry)
      )
    ) {
      throw new Error("rule=pr80-repair-initial-a01-authorization-set-invalid");
    }
    return { mode: PR80_REPAIR_INITIAL_STATUS, lifecycle: candidateLifecycle };
  }

  validatePr80RepairLifecycleSnapshot(sourceRegistry);
  if (sourceLifecycle.status === PR80_REPAIR_FINAL_STATUS) {
    throw new Error("rule=pr80-repair-transition-replay");
  }
  if (
    sourceLifecycle.status !== PR80_REPAIR_INITIAL_STATUS ||
    candidateLifecycle.status !== PR80_REPAIR_FINAL_STATUS
  ) {
    throw new Error("rule=pr80-repair-transition-source-invalid");
  }
  validatePr80RepairFinalPrState(
    candidateRegistry,
    candidateLifecycle.initialCandidateCompletionEvidence
  );
  for (const field of [
    "oneShot",
    "pullRequestNumber",
    "protectedBaseSha",
    "protectedBaseTreeSha",
    "protectedBaseRegistryBlobSha",
    "protectedBaseReceiptPrefix",
    "requiredCandidatePaths",
    "repairImplementationPaths",
    "blockedFinalReadyEvidence",
    "requiredExecution",
    "authorizedTransition"
  ]) {
    if (!sameJson(candidateLifecycle[field], sourceLifecycle[field])) {
      throw new Error("rule=pr80-repair-lifecycle-core-drift");
    }
  }
  if (
    candidateReceipts.length !== sourceReceipts.length + 1 ||
    !sourceReceipts.every((receipt, index) => sameJson(receipt, candidateReceipts[index]))
  ) {
    throw new Error("rule=pr80-repair-final-receipt-delta-invalid");
  }
  if (
    !sameStringSet(
      pr80A01AuthorizationPaths(candidateRegistry),
      expectedPr80FinalA01AuthorizationPaths(sourceRegistry)
    )
  ) {
    throw new Error("rule=pr80-repair-final-a01-authorization-set-invalid");
  }
  if (
    normalizedPr80FinalImmutableRegistrySha256(sourceRegistry) !==
    normalizedPr80FinalImmutableRegistrySha256(candidateRegistry)
  ) {
    throw new Error("rule=pr80-repair-final-field-scope-drift");
  }
  validatePr80RepairFinalEvidence(
    candidateLifecycle.initialCandidateCompletionEvidence,
    candidateReceipts.at(-1),
    context
  );
  return { mode: PR80_REPAIR_FINAL_STATUS, lifecycle: candidateLifecycle };
}

function pr80RepairIndexChangedPathsAgainst(commit) {
  return gitText(["diff", "--cached", "--name-only", "-z", "--no-renames", commit])
    .split("\0")
    .filter(Boolean);
}

export function assertPr80RepairLifecycleIndexPaths(lifecycle, paths) {
  const expectedPaths = lifecycle?.status === PR80_REPAIR_INITIAL_STATUS
    ? PR80_REPAIR_INITIAL_SCOPE
    : lifecycle?.status === PR80_REPAIR_FINAL_STATUS
      ? PR80_REPAIR_FINAL_SCOPE
      : null;
  if (!expectedPaths || !sameStringSet(paths, expectedPaths)) {
    throw new Error("rule=pr80-repair-index-path-set-mismatch");
  }
  return true;
}

function commaSeparatedPositiveIntegers(value) {
  if (typeof value !== "string" || value.length === 0) return [];
  return value.split(",").map((entry) => Number(entry));
}

function pr80FinalObservationContextFromEnvironment(sourceContext) {
  return {
    ...sourceContext,
    buildRunId: Number(process.env.SENA_PR80_INITIAL_BUILD_RUN_ID),
    repositorySecurityRunIds: commaSeparatedPositiveIntegers(
      process.env.SENA_PR80_INITIAL_REPOSITORY_SECURITY_RUN_IDS
    ),
    checkJobIds: commaSeparatedPositiveIntegers(
      process.env.SENA_PR80_INITIAL_CHECK_JOB_IDS
    ),
    requiredChecksPassed: process.env.SENA_PR80_INITIAL_REQUIRED_CHECKS_PASSED === "true",
    annotationsEmpty: process.env.SENA_PR80_INITIAL_ANNOTATIONS_EMPTY === "true",
    specReviewApproved: process.env.SENA_PR80_INITIAL_SPEC_REVIEW_APPROVED === "true",
    qualityReviewApproved: process.env.SENA_PR80_INITIAL_QUALITY_REVIEW_APPROVED === "true"
  };
}

const POST_PR82_TOPOLOGY_HEARTBEAT_LIFECYCLE_KEY =
  "postPr82TopologyHeartbeatLifecycle";
const POST_PR82_TOPOLOGY_HEARTBEAT_SOURCE_HEAD_SHA =
  "0f74b59277ce1e4d31a49dac70c52d1c2d0ba9b6";
const POST_PR82_TOPOLOGY_HEARTBEAT_SOURCE_TREE_SHA =
  "377b0fb476bf9a752b2868b1d2683f211ebfbecb";
const POST_PR82_TOPOLOGY_HEARTBEAT_SOURCE_REGISTRY_BLOB_SHA =
  "3619d4bacd79b8a016b629309b6c9328b63ce67f";
const POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_REGISTRY_SHA256 =
  "b73eb29fd3270c8c590aeeea760c31f48ab248747a39a000301c020b0dac1371";
const POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_SOURCE_HEAD_SHA =
  "d279dfe7ba5ce94d889323dc80e9e25228c6c266";
const POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_SOURCE_TREE_SHA =
  "95cb2ff06089b39f8fbec8ff1ed46bfb1eee160c";
const POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_SOURCE_REGISTRY_BLOB_SHA =
  "923a7b89c8eccd786a4be986c1f7a87c171f98b5";
const POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_SOURCE_VERIFIER_BLOB_SHA =
  "bf2d5741e9083707e3e9d668549e0be90bacaa31";
const POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_SOURCE_TEST_BLOB_SHA =
  "cacd4fab3f56e9a1277b9686a0f51ee0fc4ddf04";
const POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_REGISTRY_SHA256 =
  "54d76a30ed6993a8d0e92314dc17bb877cc1bf7da933b5fffae121d3d3a83646";
const POST_PR82_TOPOLOGY_HEARTBEAT_PRE_FINAL_HOOK_SOURCE_HEAD_SHA =
  "7d5121759c984b07fc777a646f7fb3b29e6ebb31";
const POST_PR82_TOPOLOGY_HEARTBEAT_PRE_FINAL_HOOK_SOURCE_TREE_SHA =
  "7e859135ad01ea2c98cf7ec3109108bfd7c56317";
const POST_PR82_TOPOLOGY_HEARTBEAT_PRE_FINAL_HOOK_SOURCE_REGISTRY_BLOB_SHA =
  "e3b0ed983975afba00afda1bcf236d6c608ba9ff";
const POST_PR82_TOPOLOGY_HEARTBEAT_PRE_FINAL_HOOK_SOURCE_VERIFIER_BLOB_SHA =
  "c40434e90ed3336ccc762881defaf1ffc4646c44";
const POST_PR82_TOPOLOGY_HEARTBEAT_PRE_FINAL_HOOK_SOURCE_TEST_BLOB_SHA =
  "59022f85395dbc56c531d5fd3095d306c36ddcb6";
const POST_PR82_TOPOLOGY_HEARTBEAT_PRE_FINAL_HOOK_REGISTRY_SHA256 =
  "615c7501354e8d55269d67f770ced3cff7d5f6f98e679253ba6dfccabe79a899";
const POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_TEST_SOURCE_HEAD_SHA =
  "ed7ee728400adfae02bd524291269ca72c419c47";
const POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_TEST_SOURCE_TREE_SHA =
  "4343dfa69c9e1f7f5b20ea30732348db9994774a";
const POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_TEST_SOURCE_REGISTRY_BLOB_SHA =
  "337496c96f7457fdac22c3ab5bd23d0f0385c34c";
const POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_TEST_SOURCE_VERIFIER_BLOB_SHA =
  "c39f6408268b6c9bfe04f2b63c57101830d6b2ab";
const POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_TEST_SOURCE_TEST_BLOB_SHA =
  "ec7d144bf15a62a657b4bce654fc0981b65b14e1";
const POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_TEST_REGISTRY_SHA256 =
  "6d34f65797fdfc5d0eac992c46b4c8f25a5e84270a09f0142731cee2dd445944";
const POST_PR82_TOPOLOGY_HEARTBEAT_TEST_NETWORK_SOURCE_HEAD_SHA =
  "40e8906b106d8d3d49e1f06b59a81cd77ca2ead3";
const POST_PR82_TOPOLOGY_HEARTBEAT_TEST_NETWORK_SOURCE_TREE_SHA =
  "c3bf02e8d05ac45e8c6bc47925f5859dd3d98441";
const POST_PR82_TOPOLOGY_HEARTBEAT_TEST_NETWORK_SOURCE_REGISTRY_BLOB_SHA =
  "45b0556f1913933a86c5299c3729d32e14add6f5";
const POST_PR82_TOPOLOGY_HEARTBEAT_TEST_NETWORK_SOURCE_VERIFIER_BLOB_SHA =
  "ee7e83a1ebc7e9a40bbdcc45dbfecc293c45dcff";
const POST_PR82_TOPOLOGY_HEARTBEAT_TEST_NETWORK_SOURCE_TEST_BLOB_SHA =
  "b882e485baf8a7a72aee992beb2b21830b09a6f9";
const POST_PR82_TOPOLOGY_HEARTBEAT_TEST_NETWORK_REGISTRY_SHA256 =
  "d9f4d7590f6fabce9829f99cdf865d1c85ecaa832c3ca0fc0860d83e985240e2";
const POST_PR82_TOPOLOGY_HEARTBEAT_NORMALIZED_REGISTRY_SHA256 =
  "8dbb91878a1831a1610028841a90654b68480c8eccc2bb3b945b4f485fc2368c";
const POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_STATUS =
  "three-path-post-pr82-topology-heartbeat-bootstrap-candidate";
const POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS =
  "three-path-post-pr82-topology-heartbeat-bootstrap-correction-candidate";
const POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_STATUS =
  "registry-only-post-pr82-topology-heartbeat-final-candidate";
const POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_SCOPE = [
  REGISTRY_REPO_PATH,
  "scripts/verify-sena-repo-governance.mjs",
  "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
];
const POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_SCOPE = [REGISTRY_REPO_PATH];
const POST_PR82_TOPOLOGY_HEARTBEAT_AUTHORIZATION_BOUNDARY = {
  threePathBootstrapCommitAuthorizedAfterGates: true,
  threePathBootstrapPushAndDraftPrAuthorizedAfterGates: true,
  finalRegistryOnlyHeartbeatAuthorizedAfterBootstrapChecks: true,
  prReadyAuthorizedAfterFinalHeadChecks: true,
  protectedMergeAuthorizedAfterFinalHeadChecks: true,
  forwardFixCommitAuthorizedNow: false,
  prReadyAuthorizedNow: false,
  heartbeatMergeAuthorizedNow: false,
  pr46MutationAuthorized: false,
  casAuthorized: false,
  localRefRetirementAuthorized: false,
  retirementReceiptMintingAuthorized: false,
  branchDeletionAuthorized: false,
  worktreeRemovalAuthorized: false,
  orphanWorktreeMutationAuthorized: false,
  targetRefMutationAuthorized: false,
  targetTagMutationAuthorized: false,
  quarantineMutationAuthorized: false,
  deploymentAuthorized: false,
  providerMutationAuthorized: false,
  resetAuthorized: false,
  rebaseAuthorized: false,
  stashAuthorized: false,
  forceAuthorized: false,
  historyRewriteAuthorized: false
};

function postPr82TopologyHeartbeatLifecycle(registry) {
  return pr80RepairLifecycleWorkItem(registry)?.[
    POST_PR82_TOPOLOGY_HEARTBEAT_LIFECYCLE_KEY
  ];
}

function postPr82TopologyHeartbeatCompletionContextFromEnvironment() {
  return {
    headSha: process.env.SENA_POST_PR82_BOOTSTRAP_HEAD ?? "",
    treeSha: process.env.SENA_POST_PR82_BOOTSTRAP_TREE ?? "",
    registryBlobSha: process.env.SENA_POST_PR82_BOOTSTRAP_REGISTRY_BLOB ?? "",
    verifierBlobSha: process.env.SENA_POST_PR82_BOOTSTRAP_VERIFIER_BLOB ?? "",
    governanceTestBlobSha:
      process.env.SENA_POST_PR82_BOOTSTRAP_GOVERNANCE_TEST_BLOB ?? "",
    buildRunId: Number(process.env.SENA_POST_PR82_BOOTSTRAP_BUILD_RUN_ID),
    repositorySecurityRunIds: commaSeparatedPositiveIntegers(
      process.env.SENA_POST_PR82_BOOTSTRAP_REPOSITORY_SECURITY_RUN_IDS
    ),
    checkJobIds: commaSeparatedPositiveIntegers(
      process.env.SENA_POST_PR82_BOOTSTRAP_CHECK_JOB_IDS
    ),
    requiredChecksPassed:
      process.env.SENA_POST_PR82_BOOTSTRAP_REQUIRED_CHECKS_PASSED === "true",
    annotationsEmpty:
      process.env.SENA_POST_PR82_BOOTSTRAP_ANNOTATIONS_EMPTY === "true",
    governanceTestsPassed: Number(
      process.env.SENA_POST_PR82_BOOTSTRAP_GOVERNANCE_TESTS_PASSED
    ),
    governanceTestsTotal: Number(
      process.env.SENA_POST_PR82_BOOTSTRAP_GOVERNANCE_TESTS_TOTAL
    ),
    registryPassed:
      process.env.SENA_POST_PR82_BOOTSTRAP_REGISTRY_PASSED === "true",
    liveAuditPassed:
      process.env.SENA_POST_PR82_BOOTSTRAP_LIVE_AUDIT_PASSED === "true",
    liveAuditErrors: [],
    liveAuditOwnerBlockers: [],
    unreachableCommitCount: Number(
      process.env.SENA_POST_PR82_BOOTSTRAP_UNREACHABLE_COMMIT_COUNT
    ),
    writePolicyPassed:
      process.env.SENA_POST_PR82_BOOTSTRAP_WRITE_POLICY_PASSED === "true",
    securityPassed:
      process.env.SENA_POST_PR82_BOOTSTRAP_SECURITY_PASSED === "true",
    preCommitPassed:
      process.env.SENA_POST_PR82_BOOTSTRAP_PRE_COMMIT_PASSED === "true",
    syntaxPassed:
      process.env.SENA_POST_PR82_BOOTSTRAP_SYNTAX_PASSED === "true",
    localTypecheckStatus:
      process.env.SENA_POST_PR82_BOOTSTRAP_LOCAL_TYPECHECK_STATUS ?? "",
    ciBuildRequired:
      process.env.SENA_POST_PR82_BOOTSTRAP_CI_BUILD_REQUIRED === "true"
  };
}

function validatePostPr82TopologyHeartbeatCompletionEvidence(
  evidence,
  sourceHeadSha,
  sourceRegistry,
  observedContext = null
) {
  const failGit = () => {
    throw new Error("rule=post-pr82-topology-heartbeat-final-source-git-mismatch");
  };
  if (
    !isPlainRecord(evidence) ||
    !isSha(sourceHeadSha) ||
    evidence.headSha !== sourceHeadSha ||
    !isSha(evidence.treeSha) ||
    !isSha(evidence.registryBlobSha) ||
    !isSha(evidence.verifierBlobSha) ||
    !isSha(evidence.governanceTestBlobSha) ||
    !Number.isInteger(evidence.buildRunId) ||
    evidence.buildRunId <= 0 ||
    !exactDistinctPositiveIntegerArray(evidence.repositorySecurityRunIds, 2) ||
    !exactDistinctPositiveIntegerArray(evidence.checkJobIds, 3) ||
    evidence.requiredChecksPassed !== true ||
    evidence.annotationsEmpty !== true ||
    evidence.governanceTestsPassed !== 98 ||
    evidence.governanceTestsTotal !== 98 ||
    evidence.registryPassed !== true ||
    evidence.liveAuditPassed !== true ||
    !sameJson(evidence.liveAuditErrors, []) ||
    !sameJson(evidence.liveAuditOwnerBlockers, []) ||
    evidence.unreachableCommitCount !== 0 ||
    evidence.writePolicyPassed !== true ||
    evidence.securityPassed !== true ||
    evidence.preCommitPassed !== true ||
    evidence.syntaxPassed !== true ||
    evidence.localTypecheckStatus !== "not-proved-missing-local-dependencies" ||
    evidence.ciBuildRequired !== true
  ) {
    throw new Error("rule=post-pr82-topology-heartbeat-final-evidence-invalid");
  }
  try {
    if (
      !gitObjectExists(`${sourceHeadSha}^{commit}`) ||
      gitText(["rev-parse", `${sourceHeadSha}^{tree}`]).trim() !== evidence.treeSha ||
      gitText(["rev-parse", `${sourceHeadSha}:${REGISTRY_REPO_PATH}`]).trim() !==
        evidence.registryBlobSha ||
      gitText([
        "rev-parse",
        `${sourceHeadSha}:scripts/verify-sena-repo-governance.mjs`
      ]).trim() !== evidence.verifierBlobSha ||
      gitText([
        "rev-parse",
        `${sourceHeadSha}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
      ]).trim() !== evidence.governanceTestBlobSha ||
      !sameJson(loadRegistryFromCommit(sourceHeadSha).parsed, sourceRegistry)
    ) {
      failGit();
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "rule=post-pr82-topology-heartbeat-final-source-git-mismatch"
    ) {
      throw error;
    }
    failGit();
  }
  if (observedContext && !sameJson(evidence, observedContext)) {
    throw new Error("rule=post-pr82-topology-heartbeat-final-evidence-context-mismatch");
  }
  return true;
}

function githubApiJson(path) {
  const result = spawnSync("gh", ["api", "--hostname", "github.com", path], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    env: process.env
  });
  if (result.status !== 0) {
    throw new Error("rule=post-pr82-topology-heartbeat-live-github-readback-failed");
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("rule=post-pr82-topology-heartbeat-live-github-readback-failed");
  }
}

function validatePostPr82TopologyHeartbeatLiveGitHubEvidence(
  evidence,
  pullRequestNumber,
  sourceHeadSha
) {
  const buildRun = githubApiJson(
    `repos/HUDongpin/SENA/actions/runs/${evidence.buildRunId}`
  );
  const securityRuns = evidence.repositorySecurityRunIds.map((runId) =>
    githubApiJson(`repos/HUDongpin/SENA/actions/runs/${runId}`)
  );
  const jobs = evidence.checkJobIds.map((jobId) =>
    githubApiJson(`repos/HUDongpin/SENA/actions/jobs/${jobId}`)
  );
  const annotations = evidence.checkJobIds.map((jobId) =>
    githubApiJson(`repos/HUDongpin/SENA/check-runs/${jobId}/annotations`)
  );
  const pullRequest = githubApiJson(
    `repos/HUDongpin/SENA/pulls/${pullRequestNumber}`
  );
  const remoteRef = githubApiJson(
    "repos/HUDongpin/SENA/git/ref/heads/codex/sena-a01-repo-governance-20260827"
  );
  const runExact = (run, name, event) =>
    isPlainRecord(run) &&
    run.name === name &&
    run.event === event &&
    run.head_sha === sourceHeadSha &&
    run.head_branch === "codex/sena-a01-repo-governance-20260827" &&
    run.head_repository?.full_name === "HUDongpin/SENA" &&
    run.status === "completed" &&
    run.conclusion === "success";
  const jobExact = (job, runId, name) =>
    isPlainRecord(job) &&
    job.run_id === runId &&
    job.name === name &&
    job.status === "completed" &&
    job.conclusion === "success";
  if (
    !runExact(buildRun, "build-gate", "pull_request") ||
    !runExact(securityRuns[0], "repo-security-gate", "push") ||
    !runExact(securityRuns[1], "repo-security-gate", "pull_request") ||
    !jobExact(jobs[0], evidence.buildRunId, "build") ||
    !jobExact(
      jobs[1],
      evidence.repositorySecurityRunIds[0],
      "repository-security"
    ) ||
    !jobExact(
      jobs[2],
      evidence.repositorySecurityRunIds[1],
      "repository-security"
    ) ||
    annotations.some((entry) => !Array.isArray(entry) || entry.length !== 0) ||
    !isPlainRecord(pullRequest) ||
    pullRequest.number !== pullRequestNumber ||
    pullRequest.state !== "open" ||
    pullRequest.draft !== true ||
    pullRequest.head?.sha !== sourceHeadSha ||
    pullRequest.head?.ref !== "codex/sena-a01-repo-governance-20260827" ||
    pullRequest.head?.repo?.full_name !== "HUDongpin/SENA" ||
    pullRequest.base?.ref !== "main" ||
    pullRequest.base?.repo?.full_name !== "HUDongpin/SENA" ||
    !isPlainRecord(remoteRef) ||
    remoteRef.ref !==
      "refs/heads/codex/sena-a01-repo-governance-20260827" ||
    remoteRef.object?.sha !== sourceHeadSha
  ) {
    throw new Error("rule=post-pr82-topology-heartbeat-live-github-readback-invalid");
  }
  return true;
}

function validatePostPr82TopologyHeartbeatLifecycleShape(registry) {
  const lifecycle = postPr82TopologyHeartbeatLifecycle(registry);
  if (
    !isPlainRecord(lifecycle) ||
    ![
      POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_STATUS,
      POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS,
      POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_STATUS
    ].includes(lifecycle.status) ||
    lifecycle.oneShot !== true ||
    !sameJson(lifecycle.protectedSource, {
      mainSha: POST_PR82_TOPOLOGY_HEARTBEAT_SOURCE_HEAD_SHA,
      treeSha: POST_PR82_TOPOLOGY_HEARTBEAT_SOURCE_TREE_SHA,
      registryBlobSha: POST_PR82_TOPOLOGY_HEARTBEAT_SOURCE_REGISTRY_BLOB_SHA,
      releaseReceiptPrefixCount: 48,
      releaseReceiptPrefixSha256:
        "f075a2a3ff47de7e19c437c20e1411d1ef7a48fc6585795adfdc00838caa08c9"
    }) ||
    !sameJson(lifecycle.requiredCandidatePaths, POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_SCOPE) ||
    (lifecycle.status === POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_STATUS &&
      Object.hasOwn(lifecycle, "bootstrapCorrectionSource")) ||
    (lifecycle.status !== POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_STATUS &&
      !sameJson(lifecycle.bootstrapCorrectionSource, {
        headSha: POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_SOURCE_HEAD_SHA,
        treeSha: POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_SOURCE_TREE_SHA,
        registryBlobSha:
          POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_SOURCE_REGISTRY_BLOB_SHA,
        verifierBlobSha:
          POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_SOURCE_VERIFIER_BLOB_SHA,
        governanceTestBlobSha:
          POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_SOURCE_TEST_BLOB_SHA
      })) ||
    !sameJson(
      lifecycle.authorizationBoundary,
      POST_PR82_TOPOLOGY_HEARTBEAT_AUTHORIZATION_BOUNDARY
    ) ||
    (lifecycle.status === POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_STATUS &&
      Object.hasOwn(lifecycle, "bootstrapCompletionEvidence")) ||
    (lifecycle.status === POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_STATUS &&
      !Object.hasOwn(lifecycle, "bootstrapCompletionEvidence"))
  ) {
    throw new Error("rule=post-pr82-topology-heartbeat-lifecycle-invalid");
  }
  return lifecycle;
}

export function validatePostPr82IntegratedCurrentnessSnapshot(registry) {
  const heartbeat = validatePostPr82TopologyHeartbeatLifecycleShape(registry);
  if (heartbeat.status === POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_STATUS) {
    const sourceHeadSha = heartbeat.bootstrapCompletionEvidence?.headSha;
    if (!isSha(sourceHeadSha)) {
      throw new Error("rule=post-pr82-topology-heartbeat-final-evidence-invalid");
    }
    validatePostPr82TopologyHeartbeatCompletionEvidence(
      heartbeat.bootstrapCompletionEvidence,
      sourceHeadSha,
      loadRegistryFromCommit(sourceHeadSha).parsed
    );
  }
  const repairItem = protectedCurrentnessRepairWorkItem(registry);
  const repairBranch = protectedCurrentnessRepairBranch(registry);
  const repairLifecycle = repairItem?.protectedCurrentnessActivationRepairLifecycle;
  const repairReceipt = (registry.releaseReceipts ?? []).find(
    (entry) => entry?.receiptKind === PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
  );
  const rootItem = (registry.workItems ?? []).find(
    (entry) => entry?.taskId === "SENA-A01-ROOT-CONTROL-PLANE-20260828"
  );
  const mainBranch = (registry.branches ?? []).find(
    (entry) => entry?.name === "main"
  );
  const evidenceFlowItem = evidenceFlowCurrentnessWorkItem(registry);
  const retirementItem = (registry.workItems ?? []).find(
    (entry) => entry?.taskId === "SENA-BRANCH-RETIREMENT-20260829"
  );
  const retirementBranch = (registry.branches ?? []).find(
    (entry) => entry?.name === "codex/sena-branch-retirement-20260829"
  );
  const forwardFixItem = (registry.workItems ?? []).find(
    (entry) => entry?.taskId === "SENA-PR82-CLEAN-FINAL-FORWARD-FIX-20260902"
  );
  const forwardFixBranch = (registry.branches ?? []).find(
    (entry) => entry?.name === "codex/sena-pr82-clean-final-forward-fix-20260902"
  );
  const lastMerged = repairItem?.lastMergedPullRequest;
  if (
    !heartbeat ||
    normalizedPostPr82TopologyHeartbeatFinalSha256(registry) !==
      POST_PR82_TOPOLOGY_HEARTBEAT_NORMALIZED_REGISTRY_SHA256 ||
    repairItem?.headSha !== "e16ec80b749ca9130d11d8b3aa9dfe2581653f41" ||
    !sameJson(repairItem?.aheadBehind, { baseRef: "origin/main", ahead: 0, behind: 1 }) ||
    repairItem.prState !== "MERGED" ||
    repairItem.prIsDraft !== false ||
    repairItem.prReadyForReview !== false ||
    repairItem.mergeAuthorized !== false ||
    repairItem.prHeadSha !== repairItem.headSha ||
    repairItem.disposition !== "integrated" ||
    repairLifecycle?.status !== PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS ||
    repairLifecycle.finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks !== false ||
    repairLifecycle.repairReadyAndProtectedMergeAuthorizedAfterFinalChecks !== false ||
    repairBranch?.headSha !== repairItem.headSha ||
    repairBranch.remoteHeadSha !== repairItem.headSha ||
    repairBranch.prHeadSha !== repairItem.headSha ||
    repairBranch.prState !== "MERGED" ||
    repairBranch.prIsDraft !== false ||
    repairBranch.prReadyForReview !== false ||
    repairBranch.mergeAuthorized !== false ||
    repairBranch.disposition !== "integrated" ||
    lastMerged?.number !== 82 ||
    lastMerged.headSha !== repairItem.headSha ||
    lastMerged.mergeCommitSha !== POST_PR82_TOPOLOGY_HEARTBEAT_SOURCE_HEAD_SHA ||
    !sameJson(lastMerged.orderedParentShas, [
      "969a206b798c159e15ae0b6e5c76d0c94cca92ea",
      "e16ec80b749ca9130d11d8b3aa9dfe2581653f41"
    ]) ||
    lastMerged.postMainChecksPassed !== true ||
    lastMerged.annotationsEmpty !== true ||
    lastMerged.commitBoundLiveAuditStatus !== "pass" ||
    !sameJson(lastMerged.commitBoundLiveAuditErrors, []) ||
    !sameJson(lastMerged.commitBoundLiveAuditOwnerBlockers, []) ||
    lastMerged.unreachableCommitCount !== 0 ||
    repairReceipt?.authorizationBoundary
      ?.repairReadyAndProtectedMergeAuthorizedAfterFinalChecks !== false ||
    repairReceipt?.authorizationBoundary?.consumedByProtectedMergeCommitSha !==
      POST_PR82_TOPOLOGY_HEARTBEAT_SOURCE_HEAD_SHA ||
    repairReceipt?.authorizationBoundary?.consumedAt !== "2026-09-02T15:11:17Z" ||
    !sameJson(rootItem?.aheadBehind, { baseRef: "origin/main", ahead: 0, behind: 16 }) ||
    mainBranch?.remoteHeadSha !== POST_PR82_TOPOLOGY_HEARTBEAT_SOURCE_HEAD_SHA ||
    !sameJson(evidenceFlowItem?.aheadBehind, {
      baseRef: "origin/main",
      ahead: 16,
      behind: 95
    }) ||
    !sameJson(retirementItem?.aheadBehind, {
      baseRef: "origin/main",
      ahead: 8,
      behind: 21
    }) ||
    retirementItem.disposition !== "frozen-recovery" ||
    retirementBranch?.disposition !== "frozen-recovery" ||
    forwardFixItem?.headSha !== POST_PR82_TOPOLOGY_HEARTBEAT_SOURCE_HEAD_SHA ||
    forwardFixItem.disposition !== "frozen-recovery" ||
    forwardFixBranch?.headSha !== POST_PR82_TOPOLOGY_HEARTBEAT_SOURCE_HEAD_SHA ||
    forwardFixBranch.disposition !== "frozen-recovery" ||
    forwardFixBranch.remotePresent !== false ||
    forwardFixBranch.pr !== null
  ) {
    throw new Error("rule=post-pr82-topology-heartbeat-integrated-currentness-invalid");
  }
  return true;
}

function normalizedPostPr82TopologyHeartbeatFinalSha256(registry) {
  const copy = structuredClone(registry);
  copy.updatedAt = "<post-pr82-heartbeat-currentness>";
  const item = pr80RepairLifecycleWorkItem(copy);
  const lifecycle = item?.[POST_PR82_TOPOLOGY_HEARTBEAT_LIFECYCLE_KEY];
  if (lifecycle) {
    lifecycle.status = "<post-pr82-heartbeat-lifecycle-status>";
    lifecycle.bootstrapCompletionEvidence =
      "<post-pr82-heartbeat-bootstrap-completion-evidence>";
  }
  const branch = (copy.branches ?? []).find(
    (entry) => entry?.name === "codex/sena-a01-repo-governance-20260827"
  );
  for (const field of [
    "headSha", "aheadBehind", "lastHeartbeatAt", "lastObservedAt", "nextReviewAt",
    "prNumber", "plannedPullRequestNumber", "prState", "prIsDraft",
    "prHeadSha", "noPrReason", "dirtyState", "evidenceState"
  ]) {
    if (item) item[field] = `<post-pr82-heartbeat-item:${field}>`;
  }
  for (const field of [
    "headSha", "remoteHeadSha", "remoteObservedAt", "pr",
    "plannedPullRequestNumber", "prState", "prIsDraft", "prReadyForReview",
    "mergeAuthorized", "prHeadSha", "noPrReason", "lastOwnerHeartbeatAt",
    "lastObservedAt", "lastCommitAt", "nextReviewAt", "closeout", "mergeable",
    "mergeStateStatus"
  ]) {
    if (branch) branch[field] = `<post-pr82-heartbeat-branch:${field}>`;
  }
  return sha256Buffer(Buffer.from(JSON.stringify(copy)));
}

export function validatePostPr82TopologyHeartbeatBootstrapTransition(
  sourceRegistry,
  candidateRegistry
) {
  if (postPr82TopologyHeartbeatLifecycle(sourceRegistry)) {
    throw new Error("rule=post-pr82-topology-heartbeat-bootstrap-replay");
  }
  if (
    !postPr82TopologyHeartbeatLifecycle(candidateRegistry) ||
    sha256Buffer(Buffer.from(JSON.stringify(candidateRegistry))) !==
      POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_REGISTRY_SHA256
  ) {
    throw new Error("rule=post-pr82-topology-heartbeat-bootstrap-invalid");
  }
  return true;
}

export function validatePostPr82TopologyHeartbeatCorrectionTransition(
  sourceRegistry,
  candidateRegistry
) {
  const sourceLifecycle = postPr82TopologyHeartbeatLifecycle(sourceRegistry);
  const candidateLifecycle = validatePostPr82TopologyHeartbeatLifecycleShape(
    candidateRegistry
  );
  if (
    sourceLifecycle?.status !== POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_STATUS ||
    Object.hasOwn(sourceLifecycle, "bootstrapCorrectionSource") ||
    sha256Buffer(Buffer.from(JSON.stringify(sourceRegistry))) !==
      POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_REGISTRY_SHA256 ||
    candidateLifecycle.status !== POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS ||
    sha256Buffer(Buffer.from(JSON.stringify(candidateRegistry))) !==
      POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_REGISTRY_SHA256
  ) {
    throw new Error("rule=post-pr82-topology-heartbeat-correction-invalid");
  }
  return true;
}

export function validatePostPr82TopologyHeartbeatPreFinalHookCorrectionTransition(
  sourceRegistry,
  candidateRegistry
) {
  const sourceLifecycle = validatePostPr82TopologyHeartbeatLifecycleShape(
    sourceRegistry
  );
  const candidateLifecycle = validatePostPr82TopologyHeartbeatLifecycleShape(
    candidateRegistry
  );
  if (
    sourceLifecycle.status !== POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS ||
    candidateLifecycle.status !== POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS ||
    sha256Buffer(Buffer.from(JSON.stringify(sourceRegistry))) !==
      POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_REGISTRY_SHA256 ||
    sha256Buffer(Buffer.from(JSON.stringify(candidateRegistry))) !==
      POST_PR82_TOPOLOGY_HEARTBEAT_PRE_FINAL_HOOK_REGISTRY_SHA256
  ) {
    throw new Error("rule=post-pr82-topology-heartbeat-pre-final-hook-correction-invalid");
  }
  return true;
}

export function validatePostPr82TopologyHeartbeatFinalTestPhaseCorrectionTransition(
  sourceRegistry,
  candidateRegistry
) {
  const sourceLifecycle = validatePostPr82TopologyHeartbeatLifecycleShape(
    sourceRegistry
  );
  const candidateLifecycle = validatePostPr82TopologyHeartbeatLifecycleShape(
    candidateRegistry
  );
  if (
    sourceLifecycle.status !== POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS ||
    candidateLifecycle.status !== POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS ||
    sha256Buffer(Buffer.from(JSON.stringify(sourceRegistry))) !==
      POST_PR82_TOPOLOGY_HEARTBEAT_PRE_FINAL_HOOK_REGISTRY_SHA256 ||
    sha256Buffer(Buffer.from(JSON.stringify(candidateRegistry))) !==
      POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_TEST_REGISTRY_SHA256
  ) {
    throw new Error("rule=post-pr82-topology-heartbeat-final-test-phase-correction-invalid");
  }
  return true;
}

export function validatePostPr82TopologyHeartbeatTestNetworkCorrectionTransition(
  sourceRegistry,
  candidateRegistry
) {
  const sourceLifecycle = validatePostPr82TopologyHeartbeatLifecycleShape(
    sourceRegistry
  );
  const candidateLifecycle = validatePostPr82TopologyHeartbeatLifecycleShape(
    candidateRegistry
  );
  if (
    sourceLifecycle.status !== POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS ||
    candidateLifecycle.status !== POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS ||
    sha256Buffer(Buffer.from(JSON.stringify(sourceRegistry))) !==
      POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_TEST_REGISTRY_SHA256 ||
    sha256Buffer(Buffer.from(JSON.stringify(candidateRegistry))) !==
      POST_PR82_TOPOLOGY_HEARTBEAT_TEST_NETWORK_REGISTRY_SHA256
  ) {
    throw new Error("rule=post-pr82-topology-heartbeat-test-network-correction-invalid");
  }
  return true;
}

export function validatePostPr82TopologyHeartbeatFinalTransition(
  sourceRegistry,
  candidateRegistry,
  sourceHeadSha,
  observedCompletionContext = null
) {
  const sourceLifecycle = validatePostPr82TopologyHeartbeatLifecycleShape(
    sourceRegistry
  );
  const candidateLifecycle = validatePostPr82TopologyHeartbeatLifecycleShape(
    candidateRegistry
  );
  const item = pr80RepairLifecycleWorkItem(candidateRegistry);
  const branch = (candidateRegistry.branches ?? []).find(
    (entry) => entry?.name === "codex/sena-a01-repo-governance-20260827"
  );
  if (
    sourceLifecycle.status !== POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS ||
    !sameJson(candidateLifecycle, {
      ...sourceLifecycle,
      status: POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_STATUS,
      bootstrapCompletionEvidence: candidateLifecycle.bootstrapCompletionEvidence
    }) ||
    normalizedPostPr82TopologyHeartbeatFinalSha256(sourceRegistry) !==
      normalizedPostPr82TopologyHeartbeatFinalSha256(candidateRegistry) ||
    item?.headSha !== sourceHeadSha ||
    !sameJson(item?.aheadBehind, { baseRef: "origin/main", ahead: 5, behind: 0 }) ||
    !Number.isInteger(item?.prNumber) ||
    item.prNumber <= 0 ||
    item.plannedPullRequestNumber !== item.prNumber ||
    item.prState !== "OPEN" ||
    item.prIsDraft !== true ||
    item.prReadyForReview !== false ||
    item.mergeAuthorized !== false ||
    item.prHeadSha !== sourceHeadSha ||
    item.noPrReason !== null ||
    branch?.headSha !== sourceHeadSha ||
    branch.remoteHeadSha !== sourceHeadSha ||
    branch.remotePresent !== true ||
    branch.pr !== item.prNumber ||
    branch.plannedPullRequestNumber !== item.prNumber ||
    branch.prState !== "OPEN" ||
    branch.prIsDraft !== true ||
    branch.prReadyForReview !== false ||
    branch.mergeAuthorized !== false ||
    branch.prHeadSha !== sourceHeadSha ||
    branch.noPrReason !== null ||
    branch.mergeable !== "MERGEABLE" ||
    branch.mergeStateStatus !== "CLEAN"
  ) {
    throw new Error("rule=post-pr82-topology-heartbeat-final-invalid");
  }
  validatePostPr82TopologyHeartbeatCompletionEvidence(
    candidateLifecycle.bootstrapCompletionEvidence,
    sourceHeadSha,
    sourceRegistry,
    observedCompletionContext
  );
  const observedAt = item.lastObservedAt;
  const expectedEvidenceState = {
    local: `post-PR82 bootstrap ${sourceHeadSha} is clean; registry-only final heartbeat staged`,
    ci: `exact bootstrap head ${sourceHeadSha} build/security checks passed with zero annotations`,
    merged: `Draft PR #${item.prNumber} remains OPEN and unmerged`,
    deployed: "not in scope and not authorized",
    live: `protected main remains ${POST_PR82_TOPOLOGY_HEARTBEAT_SOURCE_HEAD_SHA}; no protected merge has occurred`
  };
  const sourceCommitAt = gitText([
    "show",
    "-s",
    "--format=%cI",
    sourceHeadSha
  ]).trim();
  if (
    candidateRegistry.updatedAt !== observedAt ||
    item.lastHeartbeatAt !== observedAt ||
    branch.remoteObservedAt !== observedAt ||
    branch.lastOwnerHeartbeatAt !== observedAt ||
    branch.lastObservedAt !== observedAt ||
    branch.nextReviewAt !== item.nextReviewAt ||
    Date.parse(item.nextReviewAt) <= Date.parse(observedAt) ||
    item.dirtyState !==
      "clean-registry-only-post-pr82-topology-heartbeat-final" ||
    !sameJson(item.evidenceState, expectedEvidenceState) ||
    branch.lastCommitAt !== sourceCommitAt ||
    branch.closeout !==
      "registry-only final heartbeat awaiting exact-head checks; Ready and protected merge remain gated"
  ) {
    throw new Error("rule=post-pr82-topology-heartbeat-final-invalid");
  }
  return true;
}

function validatePostPr82TopologyHeartbeatIndexTransition(
  sourceRegistry,
  candidateRegistry,
  sourceHeadSha
) {
  const sourceLifecycle = postPr82TopologyHeartbeatLifecycle(sourceRegistry);
  const candidateLifecycle = postPr82TopologyHeartbeatLifecycle(candidateRegistry);
  if (!candidateLifecycle) return false;
  if (!sourceLifecycle) {
    if (
      sourceHeadSha !== POST_PR82_TOPOLOGY_HEARTBEAT_SOURCE_HEAD_SHA ||
      gitText(["rev-parse", `${sourceHeadSha}^{tree}`]).trim() !==
        POST_PR82_TOPOLOGY_HEARTBEAT_SOURCE_TREE_SHA ||
      gitText(["rev-parse", `${sourceHeadSha}:${REGISTRY_REPO_PATH}`]).trim() !==
        POST_PR82_TOPOLOGY_HEARTBEAT_SOURCE_REGISTRY_BLOB_SHA ||
      !sameJson(stagedChangedPaths(), POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_SCOPE)
    ) {
      throw new Error("rule=post-pr82-topology-heartbeat-bootstrap-source-invalid");
    }
    validatePostPr82TopologyHeartbeatBootstrapTransition(
      sourceRegistry,
      candidateRegistry
    );
    return true;
  }
  if (
    sourceLifecycle.status === POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_STATUS &&
    candidateLifecycle.status === POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS
  ) {
    if (
      sourceHeadSha !== POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_SOURCE_HEAD_SHA ||
      gitText(["rev-parse", `${sourceHeadSha}^{tree}`]).trim() !==
        POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_SOURCE_TREE_SHA ||
      gitText(["rev-parse", `${sourceHeadSha}:${REGISTRY_REPO_PATH}`]).trim() !==
        POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_SOURCE_REGISTRY_BLOB_SHA ||
      gitText([
        "rev-parse",
        `${sourceHeadSha}:scripts/verify-sena-repo-governance.mjs`
      ]).trim() !== POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_SOURCE_VERIFIER_BLOB_SHA ||
      gitText([
        "rev-parse",
        `${sourceHeadSha}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
      ]).trim() !== POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_SOURCE_TEST_BLOB_SHA ||
      !sameJson(stagedChangedPaths(), POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_SCOPE)
    ) {
      throw new Error("rule=post-pr82-topology-heartbeat-correction-source-invalid");
    }
    validatePostPr82TopologyHeartbeatCorrectionTransition(
      sourceRegistry,
      candidateRegistry
    );
    return true;
  }
  if (
    sourceLifecycle.status === POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS &&
    candidateLifecycle.status === POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS &&
    sourceHeadSha === POST_PR82_TOPOLOGY_HEARTBEAT_TEST_NETWORK_SOURCE_HEAD_SHA
  ) {
    if (
      gitText(["rev-parse", `${sourceHeadSha}^{tree}`]).trim() !==
        POST_PR82_TOPOLOGY_HEARTBEAT_TEST_NETWORK_SOURCE_TREE_SHA ||
      gitText(["rev-parse", `${sourceHeadSha}:${REGISTRY_REPO_PATH}`]).trim() !==
        POST_PR82_TOPOLOGY_HEARTBEAT_TEST_NETWORK_SOURCE_REGISTRY_BLOB_SHA ||
      gitText([
        "rev-parse",
        `${sourceHeadSha}:scripts/verify-sena-repo-governance.mjs`
      ]).trim() !== POST_PR82_TOPOLOGY_HEARTBEAT_TEST_NETWORK_SOURCE_VERIFIER_BLOB_SHA ||
      gitText([
        "rev-parse",
        `${sourceHeadSha}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
      ]).trim() !== POST_PR82_TOPOLOGY_HEARTBEAT_TEST_NETWORK_SOURCE_TEST_BLOB_SHA ||
      !sameJson(stagedChangedPaths(), POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_SCOPE)
    ) {
      throw new Error("rule=post-pr82-topology-heartbeat-test-network-correction-source-invalid");
    }
    validatePostPr82TopologyHeartbeatTestNetworkCorrectionTransition(
      sourceRegistry,
      candidateRegistry
    );
    return true;
  }
  if (
    sourceLifecycle.status === POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS &&
    candidateLifecycle.status === POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS &&
    sourceHeadSha === POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_TEST_SOURCE_HEAD_SHA
  ) {
    if (
      gitText(["rev-parse", `${sourceHeadSha}^{tree}`]).trim() !==
        POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_TEST_SOURCE_TREE_SHA ||
      gitText(["rev-parse", `${sourceHeadSha}:${REGISTRY_REPO_PATH}`]).trim() !==
        POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_TEST_SOURCE_REGISTRY_BLOB_SHA ||
      gitText([
        "rev-parse",
        `${sourceHeadSha}:scripts/verify-sena-repo-governance.mjs`
      ]).trim() !== POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_TEST_SOURCE_VERIFIER_BLOB_SHA ||
      gitText([
        "rev-parse",
        `${sourceHeadSha}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
      ]).trim() !== POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_TEST_SOURCE_TEST_BLOB_SHA ||
      !sameJson(stagedChangedPaths(), POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_SCOPE)
    ) {
      throw new Error("rule=post-pr82-topology-heartbeat-final-test-phase-correction-source-invalid");
    }
    validatePostPr82TopologyHeartbeatFinalTestPhaseCorrectionTransition(
      sourceRegistry,
      candidateRegistry
    );
    return true;
  }
  if (
    sourceLifecycle.status === POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS &&
    candidateLifecycle.status === POST_PR82_TOPOLOGY_HEARTBEAT_CORRECTION_STATUS
  ) {
    if (
      sourceHeadSha !== POST_PR82_TOPOLOGY_HEARTBEAT_PRE_FINAL_HOOK_SOURCE_HEAD_SHA ||
      gitText(["rev-parse", `${sourceHeadSha}^{tree}`]).trim() !==
        POST_PR82_TOPOLOGY_HEARTBEAT_PRE_FINAL_HOOK_SOURCE_TREE_SHA ||
      gitText(["rev-parse", `${sourceHeadSha}:${REGISTRY_REPO_PATH}`]).trim() !==
        POST_PR82_TOPOLOGY_HEARTBEAT_PRE_FINAL_HOOK_SOURCE_REGISTRY_BLOB_SHA ||
      gitText([
        "rev-parse",
        `${sourceHeadSha}:scripts/verify-sena-repo-governance.mjs`
      ]).trim() !== POST_PR82_TOPOLOGY_HEARTBEAT_PRE_FINAL_HOOK_SOURCE_VERIFIER_BLOB_SHA ||
      gitText([
        "rev-parse",
        `${sourceHeadSha}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
      ]).trim() !== POST_PR82_TOPOLOGY_HEARTBEAT_PRE_FINAL_HOOK_SOURCE_TEST_BLOB_SHA ||
      !sameJson(stagedChangedPaths(), POST_PR82_TOPOLOGY_HEARTBEAT_BOOTSTRAP_SCOPE)
    ) {
      throw new Error("rule=post-pr82-topology-heartbeat-pre-final-hook-correction-source-invalid");
    }
    validatePostPr82TopologyHeartbeatPreFinalHookCorrectionTransition(
      sourceRegistry,
      candidateRegistry
    );
    return true;
  }
  if (!sameJson(stagedChangedPaths(), POST_PR82_TOPOLOGY_HEARTBEAT_FINAL_SCOPE)) {
    throw new Error("rule=post-pr82-topology-heartbeat-final-path-set-invalid");
  }
  validatePostPr82TopologyHeartbeatFinalTransition(
    sourceRegistry,
    candidateRegistry,
    sourceHeadSha,
    postPr82TopologyHeartbeatCompletionContextFromEnvironment()
  );
  validatePostPr82TopologyHeartbeatLiveGitHubEvidence(
    candidateLifecycle.bootstrapCompletionEvidence,
    pr80RepairLifecycleWorkItem(candidateRegistry)?.prNumber,
    sourceHeadSha
  );
  return true;
}

export function assertPr80RepairA01ProjectionAdvanced(currentRegistry, candidateRegistry) {
  const currentLifecycle = pr80RepairLifecycleWorkItem(currentRegistry)
    ?.pr80FinalReadyTestRepairLifecycle;
  const candidateLifecycle = pr80RepairLifecycleWorkItem(candidateRegistry)
    ?.pr80FinalReadyTestRepairLifecycle;
  if (
    sameJson(currentLifecycle, candidateLifecycle) &&
    sameJson(
      pr80RepairLifecycleReceipts(currentRegistry),
      pr80RepairLifecycleReceipts(candidateRegistry)
    )
  ) {
    if (candidateLifecycle?.status === PR80_REPAIR_FINAL_STATUS) {
      throw new Error("rule=pr80-repair-final-a01-writer-lane-sealed");
    }
    throw new Error("rule=pr80-repair-unchanged-lifecycle-staged-delta");
  }
  return true;
}

function validatePr80RepairIndexTransition(candidateRegistry) {
  const lifecycle = pr80RepairLifecycleWorkItem(candidateRegistry)
    ?.pr80FinalReadyTestRepairLifecycle;
  if (!lifecycle) return;
  const branchResult = git(["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true });
  if (
    branchResult.status !== 0 ||
    String(branchResult.stdout).trim() !== "codex/sena-a01-repo-governance-20260827"
  ) {
    return;
  }
  if (stagedChangedPaths().length === 0) return;
  const currentHeadSha = gitText(["rev-parse", "HEAD"]).trim();
  const currentHeadRegistry = loadRegistryFromCommit(currentHeadSha).parsed;
  if (
    validatePostPr82TopologyHeartbeatIndexTransition(
      currentHeadRegistry,
      candidateRegistry,
      currentHeadSha
    )
  ) {
    return true;
  }
  assertPr80RepairA01ProjectionAdvanced(currentHeadRegistry, candidateRegistry);
  const sourceHeadSha = lifecycle.status === PR80_REPAIR_INITIAL_STATUS
    ? lifecycle.protectedBaseSha
    : lifecycle.initialCandidateCompletionEvidence?.headSha;
  if (!isSha(sourceHeadSha) || !gitObjectExists(`${sourceHeadSha}^{commit}`)) {
    throw new Error("rule=pr80-repair-transition-source-commit-missing");
  }
  if (lifecycle.status === PR80_REPAIR_FINAL_STATUS && currentHeadSha !== sourceHeadSha) {
    throw new Error("rule=pr80-repair-transition-source-head-mismatch");
  }
  const sourceRegistry = loadRegistryFromCommit(sourceHeadSha).parsed;
  const sourceContext = {
    sourceHeadSha,
    sourceTreeSha: gitText(["rev-parse", `${sourceHeadSha}^{tree}`]).trim(),
    sourceRegistryBlobSha: gitText(["rev-parse", `${sourceHeadSha}:${REGISTRY_REPO_PATH}`]).trim()
  };
  const observationContext = lifecycle.status === PR80_REPAIR_FINAL_STATUS
    ? pr80FinalObservationContextFromEnvironment(sourceContext)
    : sourceContext;
  pr80RepairLifecycleResolutionFromRegistries(
    sourceRegistry,
    candidateRegistry,
    observationContext
  );
  assertPr80RepairLifecycleIndexPaths(
    lifecycle,
    pr80RepairIndexChangedPathsAgainst(sourceHeadSha)
  );
  return true;
}

export const PROTECTED_CURRENTNESS_REPAIR_TASK_ID =
  "SENA-PROTECTED-CURRENTNESS-ACTIVATION-REPAIR-20260901";
export const PROTECTED_CURRENTNESS_REPAIR_BRANCH =
  "codex/sena-protected-currentness-activation-repair-20260901";
export const PROTECTED_CURRENTNESS_REPAIR_OWNER_KEY =
  "Codex-protected-currentness-activation-repair-01a05865";
export const PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS =
  "protected-currentness-activation-repair-candidate-awaiting-initial-checks";
export const PROTECTED_CURRENTNESS_REPAIR_CORRECTION_STATUS =
  "protected-currentness-activation-repair-additive-correction-candidate-awaiting-fresh-initial-checks";
export const PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS =
  "protected-currentness-activation-repair-ready-pending-final-head-checks";
export const PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION =
  "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks";
export const PROTECTED_CURRENTNESS_REPAIR_FINAL_ACTION =
  "repairReadyAndProtectedMergeAuthorizedAfterFinalChecks";
export const PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT =
  "pr82-protected-currentness-activation-repair-candidate";
export const PROTECTED_CURRENTNESS_REPAIR_CORRECTION_RECEIPT =
  "pr82-protected-currentness-activation-repair-additive-correction";
export const PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT =
  "pr82-protected-currentness-activation-repair-final-authorization";
export const PROTECTED_CURRENTNESS_REPAIR_OVERALL_SCOPE = [
  REGISTRY_REPO_PATH,
  "coordination/repo-governance/pr82-protected-currentness-activation-repair-design.md",
  "coordination/repo-governance/pr82-protected-currentness-activation-repair-implementation-plan.md",
  "scripts/verify-sena-repo-governance.mjs",
  "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
];
export const PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE = [
  REGISTRY_REPO_PATH,
  "scripts/verify-sena-repo-governance.mjs",
  "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
];
export const PROTECTED_CURRENTNESS_REPAIR_FINAL_SCOPE = [REGISTRY_REPO_PATH];
export const PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER = 82;
export const PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_HEAD_SHA =
  "922f5a4eabee972c61409439476766fb33f3537d";
export const PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_TREE_SHA =
  "d983467042c336a3031ef91d94140491f7071346";
export const PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_REGISTRY_BLOB_SHA =
  "461b607ca65a83bc9d23dd32a6a1ad4b3c526ad7";
export const PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_RECEIPT_COUNT = 40;
export const PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_RECEIPT_SHA256 =
  "27b1aa53a7daa7e1c8fd1403f9e0e51bcd7811dd3a074eca636f1fa907cae0ef";
export const PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_REGISTRY_SHA256 =
  "0707e433e51614485d4f21dbc51646123578e53647fb684969c74edd6a580ecb";
export const PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_HEAD_SHA =
  "9ba53c3cad87e8368552ffe78be297ae2eae1e30";
export const PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_TREE_SHA =
  "6550a1e5495e0dd7278ec992653811e628ba57e4";
export const PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_REGISTRY_BLOB_SHA =
  "cb34a7b791d37fc1159dc27d707bdc9d0555857c";
export const PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_VERIFIER_BLOB_SHA =
  "86908caf725a1ca46eea59832277700fe9a1f295";
export const PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_TEST_BLOB_SHA =
  "a78372482b7f2b35ee976398d980c82701534559";
export const PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_RECEIPT_COUNT = 41;
export const PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_RECEIPT_SHA256 =
  "76a564be7fa51861f770691d38e4ca255d1fba1d34dd6e9d742edb56666dcea0";
export const PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_REGISTRY_CANONICAL_SHA256 =
  "75f6248f1287103fb701fb2c7f566e52612dc4f50f57d7aae8f6a8d9c39a9466";
export const PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_REGISTRY_FILE_SHA256 =
  "554c7a746e45a3f534eda119187b3dc85e17c38976fe2a8cb10992cd20c4ca60";
export const PROTECTED_CURRENTNESS_REPAIR_ADDITIVE_CORRECTION_AUTHORIZATION_KEYS = [
  "mode",
  "status",
  "exactSentence",
  "exactSentenceSha256",
  "correctionSourceHeadSha",
  "correctionSourceTreeSha",
  "correctionSourceRegistryBlobSha",
  "correctionSourceVerifierBlobSha",
  "correctionSourceGovernanceTestBlobSha",
  "correctionSourceReceiptPrefix",
  "requiredCorrectionPaths",
  "fixtureCorrectionMode",
  "fixtureFrozenHeadSha",
  "candidateHeadBindingMode",
  "finalTransitionScope"
];
export const PROTECTED_CURRENTNESS_REPAIR_ADDITIVE_CORRECTION_AUTHORIZATION =
  Object.freeze({
    mode: "explicit-owner-conversation-authorization",
    status: "consumed-by-exact-additive-correction-candidate",
    exactSentence: "授权 Task7.5 加法式修复生命周期。",
    exactSentenceSha256:
      "f8780281642d5fe5c0e6ce0f6f40e6580b4e1d2a75d5e29b307b5b0d26cab496",
    correctionSourceHeadSha:
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_HEAD_SHA,
    correctionSourceTreeSha:
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_TREE_SHA,
    correctionSourceRegistryBlobSha:
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_REGISTRY_BLOB_SHA,
    correctionSourceVerifierBlobSha:
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_VERIFIER_BLOB_SHA,
    correctionSourceGovernanceTestBlobSha:
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_TEST_BLOB_SHA,
    correctionSourceReceiptPrefix: Object.freeze({
      count: PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_RECEIPT_COUNT,
      sha256: PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_RECEIPT_SHA256
    }),
    requiredCorrectionPaths: Object.freeze([
      ...PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE
    ]),
    fixtureCorrectionMode:
      "isolated-temporary-git-repository-with-exact-frozen-seed-head",
    fixtureFrozenHeadSha: PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_HEAD_SHA,
    candidateHeadBindingMode:
      "post-commit-fresh-gates-then-registry-only-final-evidence",
    finalTransitionScope: Object.freeze([...PROTECTED_CURRENTNESS_REPAIR_FINAL_SCOPE])
  });

const PROTECTED_CURRENTNESS_REPAIR_PROTECTED_BASE = Object.freeze({
  headSha: "969a206b798c159e15ae0b6e5c76d0c94cca92ea",
  treeSha: "c3d3d91ff7868939cb331a8c237349d6abbd9357",
  registryBlobSha: "b0f4bfd1f35d816e22774458a4bc1593c29a745b"
});
export const PROTECTED_CURRENTNESS_REPAIR_LIFECYCLE_KEYS = [
  "status",
  "oneShot",
  "pullRequestNumber",
  "protectedBaseSha",
  "protectedBaseTreeSha",
  "protectedBaseRegistryBlobSha",
  "designPlanSeedHeadSha",
  "designPlanSeedTreeSha",
  "designPlanSeedRegistryBlobSha",
  "designPlanSeedReceiptPrefix",
  "requiredOverallPaths",
  "requiredImplementationPaths",
  "initialCandidateCompletionEvidence",
  PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION,
  PROTECTED_CURRENTNESS_REPAIR_FINAL_ACTION,
  "pr46ReadyAndProtectedMergeAuthorizedNow",
  "localRefRetirementAuthorized",
  "retirementReceiptMintingAuthorized",
  "branchDeletionAuthorized",
  "worktreeRemovalAuthorized",
  "orphanWorktreeMutationAuthorized",
  "targetRefMutationAuthorized",
  "targetTagMutationAuthorized",
  "quarantineMutationAuthorized",
  "deploymentAuthorized",
  "providerMutationAuthorized",
  "resetAuthorized",
  "rebaseAuthorized",
  "stashAuthorized",
  "forceAuthorized",
  "historyRewriteAuthorized"
];
export const PROTECTED_CURRENTNESS_REPAIR_CORRECTED_LIFECYCLE_KEYS = [
  ...PROTECTED_CURRENTNESS_REPAIR_LIFECYCLE_KEYS.slice(0, 12),
  "additiveCorrectionAuthorization",
  ...PROTECTED_CURRENTNESS_REPAIR_LIFECYCLE_KEYS.slice(12)
];
const PROTECTED_CURRENTNESS_REPAIR_EVIDENCE_KEYS = [
  "headSha",
  "treeSha",
  "registryBlobSha",
  "verifierBlobSha",
  "governanceTestBlobSha",
  "buildRunId",
  "repositorySecurityRunIds",
  "checkJobIds",
  "requiredChecksPassed",
  "annotationsEmpty",
  "specReviewApproved",
  "qualityReviewApproved"
];
const PROTECTED_CURRENTNESS_REPAIR_RECEIPT_BASE_KEYS = [
  "schemaVersion",
  "receiptKind",
  "taskId",
  "ownerKey",
  "scope",
  "authorizationBoundary"
];
const PROTECTED_CURRENTNESS_REPAIR_PERMANENTLY_FALSE_ACTIONS = [
  "pr46ReadyAndProtectedMergeAuthorizedNow",
  "localRefRetirementAuthorized",
  "retirementReceiptMintingAuthorized",
  "branchDeletionAuthorized",
  "worktreeRemovalAuthorized",
  "orphanWorktreeMutationAuthorized",
  "targetRefMutationAuthorized",
  "targetTagMutationAuthorized",
  "quarantineMutationAuthorized",
  "deploymentAuthorized",
  "providerMutationAuthorized",
  "resetAuthorized",
  "rebaseAuthorized",
  "stashAuthorized",
  "forceAuthorized",
  "historyRewriteAuthorized"
];
const PROTECTED_CURRENTNESS_REPAIR_EVIDENCE_TRUE_PATHS = [
  "initialCandidateCompletionEvidence.annotationsEmpty",
  "initialCandidateCompletionEvidence.qualityReviewApproved",
  "initialCandidateCompletionEvidence.requiredChecksPassed",
  "initialCandidateCompletionEvidence.specReviewApproved"
];

const PROTECTED_ACTIVATION_COMPLETION_READBACK_KEYS = [
  "pullRequestNumber",
  "finalHeadSha",
  "protectedSourceMainSha",
  "protectedMergeCommitSha",
  "protectedMergeTreeSha",
  "protectedRegistryBlobSha",
  "fetchedOriginMainSha",
  "orderedParentShas",
  "finalHeadTreeSha",
  "finalHeadRegistryBlobSha",
  "postMainBuild",
  "postMainRepositorySecurity",
  "commitBoundLiveAudits"
];
const PROTECTED_ACTIVATION_COMPLETION_EVIDENCE_KEYS = [
  ...PROTECTED_ACTIVATION_COMPLETION_READBACK_KEYS,
  "requiredChecksPassed",
  "annotationsEmpty"
];
const PROTECTED_ACTIVATION_COMPLETION_WORKFLOW_KEYS = [
  "workflowName",
  "event",
  "runId",
  "jobId",
  "headSha",
  "status",
  "conclusion",
  "annotationCount"
];
const PROTECTED_ACTIVATION_COMPLETION_AUDITS_KEYS = [
  "beforeRootFastForward",
  "afterRootFastForward"
];
const PROTECTED_ACTIVATION_COMPLETION_AUDIT_RECORD_KEYS = [
  "schemaVersion",
  "phase",
  "authorizationRegistryCommitSha",
  "auditedRegistryBlobSha",
  "checkoutHeadSha",
  "status",
  "errors",
  "ownerBlockers",
  "unreachableCommitCount"
];
const PROTECTED_ACTIVATION_COMPLETION_CONTRACT_KEYS = [
  "authorizationSourceMainSha",
  "protectedActivationBinding"
];
const PROTECTED_ACTIVATION_COMPLETION_BINDING_KEYS = [
  "mode",
  "requiredReceiptKind",
  "requiredFinalAuthorizationReceiptKind",
  "requiredAuthorizationStatus",
  "requiredActivationLifecycleStatus",
  "requiredActivationPullRequestNumber",
  "mustDescendFromAuthorizationSourceMainSha",
  "mustEqualFetchedOriginMain",
  "postMainBuildRequired",
  "postMainSecurityRequired",
  "postMainAnnotationsMustBeEmpty",
  "commitBoundLiveAuditRequired"
];
const protectedActivationCompletionActuals = new WeakSet();

function protectedActivationCompletionPrototypeHasSerializationHook(value) {
  let prototype = Object.getPrototypeOf(value);
  while (prototype !== null) {
    if (Object.hasOwn(prototype, "toJSON")) return true;
    prototype = Object.getPrototypeOf(prototype);
  }
  return false;
}

function protectedActivationCompletionCanonicalJsonTree(value, seen = new Set()) {
  if (value === null) return true;
  const valueType = typeof value;
  if (valueType === "string" || valueType === "boolean") return true;
  if (valueType === "number") return Number.isFinite(value);
  if (valueType !== "object" || types.isProxy(value)) return false;
  if (seen.has(value)) return false;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (
        Object.getPrototypeOf(value) !== Array.prototype ||
        protectedActivationCompletionPrototypeHasSerializationHook(value)
      ) {
        return false;
      }
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
      if (
        !lengthDescriptor ||
        !Object.hasOwn(lengthDescriptor, "value") ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0 ||
        lengthDescriptor.enumerable !== false ||
        lengthDescriptor.writable !== true ||
        lengthDescriptor.configurable !== false
      ) {
        return false;
      }
      const ownKeys = Reflect.ownKeys(value);
      if (
        ownKeys.some((key) => typeof key === "symbol") ||
        ownKeys.length !== lengthDescriptor.value + 1 ||
        ownKeys.at(-1) !== "length"
      ) {
        return false;
      }
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        if (ownKeys[index] !== String(index)) return false;
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (
          !descriptor ||
          !Object.hasOwn(descriptor, "value") ||
          descriptor.enumerable !== true ||
          descriptor.writable !== true ||
          descriptor.configurable !== true ||
          !protectedActivationCompletionCanonicalJsonTree(descriptor.value, seen)
        ) {
          return false;
        }
      }
      return true;
    }
    if (
      Object.getPrototypeOf(value) !== Object.prototype ||
      protectedActivationCompletionPrototypeHasSerializationHook(value)
    ) {
      return false;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key === "symbol")) return false;
    for (const key of ownKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !Object.hasOwn(descriptor, "value") ||
        descriptor.enumerable !== true ||
        descriptor.writable !== true ||
        descriptor.configurable !== true ||
        !protectedActivationCompletionCanonicalJsonTree(descriptor.value, seen)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function protectedActivationCompletionCanonicalDeepEqual(left, right) {
  return Boolean(
    protectedActivationCompletionCanonicalJsonTree(left) &&
      protectedActivationCompletionCanonicalJsonTree(right) &&
      isDeepStrictEqual(left, right)
  );
}

function protectedActivationCompletionFrozenPlainTree(value, seen = new Set()) {
  if (value === null) return true;
  const valueType = typeof value;
  if (valueType === "string" || valueType === "boolean") return true;
  if (valueType === "number") return Number.isFinite(value);
  if (valueType !== "object" || types.isProxy(value) || !Object.isFrozen(value)) {
    return false;
  }
  if (seen.has(value)) return false;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return false;
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
      if (
        !lengthDescriptor ||
        !Object.hasOwn(lengthDescriptor, "value") ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0 ||
        lengthDescriptor.enumerable !== false ||
        lengthDescriptor.writable !== false ||
        lengthDescriptor.configurable !== false
      ) {
        return false;
      }
      const ownKeys = Reflect.ownKeys(value);
      if (
        ownKeys.some((key) => typeof key === "symbol") ||
        ownKeys.length !== lengthDescriptor.value + 1 ||
        ownKeys.at(-1) !== "length"
      ) {
        return false;
      }
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        if (ownKeys[index] !== String(index)) return false;
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (
          !descriptor ||
          !Object.hasOwn(descriptor, "value") ||
          descriptor.enumerable !== true ||
          descriptor.writable !== false ||
          descriptor.configurable !== false ||
          !protectedActivationCompletionFrozenPlainTree(descriptor.value, seen)
        ) {
          return false;
        }
      }
      return true;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) return false;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key === "symbol")) return false;
    for (const key of ownKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !Object.hasOwn(descriptor, "value") ||
        descriptor.enumerable !== true ||
        descriptor.writable !== false ||
        descriptor.configurable !== false ||
        !protectedActivationCompletionFrozenPlainTree(descriptor.value, seen)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function protectedActivationCompletionEvidenceMatchesFrozenActual(evidence, actual) {
  return Boolean(
    protectedActivationCompletionCanonicalJsonTree(evidence) &&
      protectedActivationCompletionFrozenPlainTree(actual) &&
      isDeepStrictEqual(evidence, actual)
  );
}

function deepFreezeProtectedActivationCompletion(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) {
    deepFreezeProtectedActivationCompletion(entry);
  }
  return Object.freeze(value);
}

function protectedActivationControlledExactClone(source, failureRule) {
  if (
    !protectedActivationCompletionCanonicalJsonTree(source) &&
    !protectedActivationCompletionFrozenPlainTree(source)
  ) {
    throw new Error(failureRule);
  }
  let clone;
  try {
    clone = protectedActivationNativeStructuredClone(source);
  } catch {
    throw new Error(failureRule);
  }
  if (
    clone === source ||
    !protectedActivationCompletionCanonicalJsonTree(clone) ||
    !isDeepStrictEqual(clone, source)
  ) {
    throw new Error(failureRule);
  }
  return clone;
}

function protectedActivationControlledBrandedClone(source, brand, failureRule) {
  const clone = protectedActivationControlledExactClone(source, failureRule);
  deepFreezeProtectedActivationCompletion(clone);
  if (
    !protectedActivationCompletionFrozenPlainTree(clone) ||
    !isDeepStrictEqual(clone, source)
  ) {
    throw new Error(failureRule);
  }
  brand.add(clone);
  return clone;
}

function protectedActivationCompletionWorkflowExact(record, workflowName, headSha) {
  return Boolean(
    exactPlainJsonOwnKeys(record, PROTECTED_ACTIVATION_COMPLETION_WORKFLOW_KEYS) &&
      record.workflowName === workflowName &&
      record.event === "push" &&
      Number.isInteger(record.runId) &&
      record.runId > 0 &&
      Number.isInteger(record.jobId) &&
      record.jobId > 0 &&
      record.headSha === headSha &&
      record.status === "completed" &&
      record.conclusion === "success" &&
      record.annotationCount === 0
  );
}

function protectedActivationCompletionAuditRecordExact(
  audit,
  phase,
  protectedMergeCommitSha,
  protectedRegistryBlobSha,
  checkoutHeadSha
) {
  return Boolean(
    exactPlainJsonOwnKeys(
      audit,
      PROTECTED_ACTIVATION_COMPLETION_AUDIT_RECORD_KEYS
    ) &&
      audit.schemaVersion === "sena-repo-governance-audit/v1" &&
      audit.phase === phase &&
      audit.authorizationRegistryCommitSha === protectedMergeCommitSha &&
      audit.auditedRegistryBlobSha === protectedRegistryBlobSha &&
      audit.checkoutHeadSha === checkoutHeadSha &&
      audit.status === "pass" &&
      Array.isArray(audit.errors) &&
      audit.errors.length === 0 &&
      Array.isArray(audit.ownerBlockers) &&
      audit.ownerBlockers.length === 0 &&
      audit.unreachableCommitCount === 0
  );
}

function protectedActivationCompletionAuditsExact(
  audits,
  protectedMergeCommitSha,
  protectedRegistryBlobSha,
  recordedRootHeadSha
) {
  return Boolean(
    exactPlainJsonOwnKeys(audits, PROTECTED_ACTIVATION_COMPLETION_AUDITS_KEYS) &&
      protectedActivationCompletionAuditRecordExact(
        audits.beforeRootFastForward,
        "before-root-fast-forward",
        protectedMergeCommitSha,
        protectedRegistryBlobSha,
        recordedRootHeadSha
      ) &&
      protectedActivationCompletionAuditRecordExact(
        audits.afterRootFastForward,
        "after-root-fast-forward",
        protectedMergeCommitSha,
        protectedRegistryBlobSha,
        protectedMergeCommitSha
      )
  );
}

function protectedActivationCompletionEvidenceSchemaExact(evidence) {
  if (
    !exactPlainJsonOwnKeys(evidence, PROTECTED_ACTIVATION_COMPLETION_EVIDENCE_KEYS) ||
    evidence.pullRequestNumber !== PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER ||
    ![
      "finalHeadSha",
      "protectedSourceMainSha",
      "protectedMergeCommitSha",
      "protectedMergeTreeSha",
      "protectedRegistryBlobSha",
      "fetchedOriginMainSha",
      "finalHeadTreeSha",
      "finalHeadRegistryBlobSha"
    ].every((field) => isSha(evidence[field])) ||
    !Array.isArray(evidence.orderedParentShas) ||
    evidence.orderedParentShas.length !== 2 ||
    !evidence.orderedParentShas.every(isSha) ||
    !protectedActivationCompletionWorkflowExact(
      evidence.postMainBuild,
      "build-gate",
      evidence.protectedMergeCommitSha
    ) ||
    !protectedActivationCompletionWorkflowExact(
      evidence.postMainRepositorySecurity,
      "repo-security-gate",
      evidence.protectedMergeCommitSha
    ) ||
    new Set([
      evidence.postMainBuild.runId,
      evidence.postMainBuild.jobId,
      evidence.postMainRepositorySecurity.runId,
      evidence.postMainRepositorySecurity.jobId
    ]).size !== 4 ||
    evidence.requiredChecksPassed !== true ||
    evidence.annotationsEmpty !== true
  ) {
    return false;
  }
  return true;
}

// Proof ceiling: the caller supplies independently read GitHub/audit records; this
// resolver performs no network access and independently recomputes every Git identity.
export function resolveProtectedActivationCompletionActual(readback) {
  if (
    !protectedActivationCompletionCanonicalJsonTree(readback) ||
    !exactPlainJsonOwnKeys(readback, PROTECTED_ACTIVATION_COMPLETION_READBACK_KEYS) ||
    readback.pullRequestNumber !== PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER ||
    ![
      "finalHeadSha",
      "protectedSourceMainSha",
      "protectedMergeCommitSha",
      "protectedMergeTreeSha",
      "protectedRegistryBlobSha",
      "fetchedOriginMainSha",
      "finalHeadTreeSha",
      "finalHeadRegistryBlobSha"
    ].every((field) => isSha(readback[field])) ||
    !Array.isArray(readback.orderedParentShas) ||
    readback.orderedParentShas.length !== 2 ||
    !readback.orderedParentShas.every(isSha) ||
    !protectedActivationCompletionWorkflowExact(
      readback.postMainBuild,
      "build-gate",
      readback.protectedMergeCommitSha
    ) ||
    !protectedActivationCompletionWorkflowExact(
      readback.postMainRepositorySecurity,
      "repo-security-gate",
      readback.protectedMergeCommitSha
    ) ||
    new Set([
      readback.postMainBuild.runId,
      readback.postMainBuild.jobId,
      readback.postMainRepositorySecurity.runId,
      readback.postMainRepositorySecurity.jobId
    ]).size !== 4
  ) {
    throw new Error("rule=protected-activation-completion-readback-invalid");
  }
  if (
    !gitObjectExists(`${readback.protectedSourceMainSha}^{commit}`) ||
    !gitObjectExists(`${readback.finalHeadSha}^{commit}`) ||
    !gitObjectExists(`${readback.protectedMergeCommitSha}^{commit}`)
  ) {
    throw new Error("rule=protected-activation-completion-git-object-missing");
  }
  const fetchedOriginMainSha = gitText([
    "rev-parse",
    "refs/remotes/origin/main^{commit}"
  ]).trim();
  const mergeLine = gitText([
    "rev-list",
    "--parents",
    "-n",
    "1",
    readback.protectedMergeCommitSha
  ]).trim().split(/\s+/);
  const orderedParentShas = mergeLine.slice(1);
  const protectedMergeTreeSha = gitText([
    "rev-parse",
    `${readback.protectedMergeCommitSha}^{tree}`
  ]).trim();
  const protectedRegistryBlobSha = gitText([
    "rev-parse",
    `${readback.protectedMergeCommitSha}:${REGISTRY_REPO_PATH}`
  ]).trim();
  const finalHeadTreeSha = gitText([
    "rev-parse",
    `${readback.finalHeadSha}^{tree}`
  ]).trim();
  const finalHeadRegistryBlobSha = gitText([
    "rev-parse",
    `${readback.finalHeadSha}:${REGISTRY_REPO_PATH}`
  ]).trim();
  const finalDescendsFromSource = git([
    "merge-base",
    "--is-ancestor",
    readback.protectedSourceMainSha,
    readback.finalHeadSha
  ], { allowFailure: true }).status === 0;
  let protectedMergeRegistry;
  try {
    protectedMergeRegistry = loadRegistryFromCommit(
      readback.protectedMergeCommitSha
    ).parsed;
  } catch {
    throw new Error("rule=protected-activation-completion-readback-invalid");
  }
  const recordedRootHeadSha = (protectedMergeRegistry.workItems ?? []).find(
    (entry) => entry?.taskId === "SENA-A01-ROOT-CONTROL-PLANE-20260828"
  )?.headSha;
  const recordedRootIsCommit =
    isSha(recordedRootHeadSha) && gitObjectExists(`${recordedRootHeadSha}^{commit}`);
  const recordedRootIsPreMergeAncestor = recordedRootIsCommit &&
    recordedRootHeadSha !== readback.protectedMergeCommitSha &&
    git([
      "merge-base",
      "--is-ancestor",
      recordedRootHeadSha,
      readback.protectedMergeCommitSha
    ], { allowFailure: true }).status === 0;
  if (
    readback.protectedMergeCommitSha !== fetchedOriginMainSha ||
    readback.fetchedOriginMainSha !== fetchedOriginMainSha ||
    !isDeepStrictEqual(orderedParentShas, [
      readback.protectedSourceMainSha,
      readback.finalHeadSha
    ]) ||
    !isDeepStrictEqual(
      readback.orderedParentShas,
      orderedParentShas
    ) ||
    readback.protectedMergeTreeSha !== protectedMergeTreeSha ||
    readback.protectedRegistryBlobSha !== protectedRegistryBlobSha ||
    readback.finalHeadTreeSha !== finalHeadTreeSha ||
    readback.finalHeadRegistryBlobSha !== finalHeadRegistryBlobSha ||
    protectedMergeTreeSha !== finalHeadTreeSha ||
    protectedRegistryBlobSha !== finalHeadRegistryBlobSha ||
    !finalDescendsFromSource ||
    !recordedRootIsPreMergeAncestor ||
    !protectedActivationCompletionAuditsExact(
      readback.commitBoundLiveAudits,
      readback.protectedMergeCommitSha,
      protectedRegistryBlobSha,
      recordedRootHeadSha
    )
  ) {
    throw new Error("rule=protected-activation-completion-readback-invalid");
  }
  const authenticatedActual = {
    pullRequestNumber: readback.pullRequestNumber,
    finalHeadSha: readback.finalHeadSha,
    protectedSourceMainSha: readback.protectedSourceMainSha,
    protectedMergeCommitSha: readback.protectedMergeCommitSha,
    protectedMergeTreeSha,
    protectedRegistryBlobSha,
    fetchedOriginMainSha,
    orderedParentShas,
    finalHeadTreeSha,
    finalHeadRegistryBlobSha,
    postMainBuild: readback.postMainBuild,
    postMainRepositorySecurity: readback.postMainRepositorySecurity,
    commitBoundLiveAudits: readback.commitBoundLiveAudits,
    requiredChecksPassed: true,
    annotationsEmpty: true
  };
  return protectedActivationControlledBrandedClone(
    authenticatedActual,
    protectedActivationCompletionActuals,
    "rule=protected-activation-completion-readback-invalid"
  );
}

export function protectedActivationCompletionEvidenceMatches(binding, evidence, actual) {
  if (
    !protectedActivationCompletionActuals.has(actual) ||
    !protectedActivationCompletionCanonicalJsonTree(binding) ||
    !protectedActivationCompletionCanonicalJsonTree(evidence) ||
    !protectedActivationCompletionFrozenPlainTree(actual)
  ) {
    return false;
  }
  const protectedBinding = binding.protectedActivationBinding;
  return Boolean(
      exactPlainJsonOwnKeys(binding, PROTECTED_ACTIVATION_COMPLETION_CONTRACT_KEYS) &&
      exactPlainJsonOwnKeys(
        protectedBinding,
        PROTECTED_ACTIVATION_COMPLETION_BINDING_KEYS
      ) &&
      binding.authorizationSourceMainSha === actual.protectedSourceMainSha &&
      protectedBinding.mode ===
        "loaded-fetched-origin-main-authorization-registry-commit" &&
      protectedBinding.requiredReceiptKind ===
        PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT &&
      protectedBinding.requiredFinalAuthorizationReceiptKind ===
        PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT &&
      protectedBinding.requiredAuthorizationStatus === "pending-protected-activation" &&
      protectedBinding.requiredActivationLifecycleStatus ===
        PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS &&
      protectedBinding.requiredActivationPullRequestNumber ===
        PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER &&
      protectedBinding.mustDescendFromAuthorizationSourceMainSha === true &&
      protectedBinding.mustEqualFetchedOriginMain === true &&
      protectedBinding.postMainBuildRequired === true &&
      protectedBinding.postMainSecurityRequired === true &&
      protectedBinding.postMainAnnotationsMustBeEmpty === true &&
      protectedBinding.commitBoundLiveAuditRequired === true &&
      protectedActivationCompletionEvidenceSchemaExact(evidence) &&
      protectedActivationCompletionEvidenceMatchesFrozenActual(evidence, actual)
  );
}

function isPlainRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function exactOwnKeys(value, expectedKeys) {
  return isPlainRecord(value) && sameStringSet(Object.keys(value), expectedKeys);
}

function exactPlainJsonOwnKeys(value, expectedKeys) {
  return (
    isPlainRecord(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    exactOwnKeys(value, expectedKeys)
  );
}

const INTEGRATED_MONOTONIC_BEHIND_ALTERNATE_BASE_KEYS = [
  "base",
  "baseRef",
  "baseRefName",
  "targetBaseRef"
];

function hasIntegratedMonotonicBehindAlternateBaseKey(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      INTEGRATED_MONOTONIC_BEHIND_ALTERNATE_BASE_KEYS.some((key) =>
        Object.hasOwn(value, key)
      )
  );
}

function assertProtectedCurrentnessRepairOwnKeys(value, expectedKeys, rule) {
  if (!exactOwnKeys(value, expectedKeys)) throw new Error(rule);
}

function assertProtectedCurrentnessRepairOrderedOwnKeys(value, expectedKeys, rule) {
  if (
    !isPlainRecord(value) ||
    !sameJson(Object.keys(value), expectedKeys)
  ) {
    throw new Error(rule);
  }
}

export function protectedCurrentnessRepairTrueBooleanPaths(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const paths = [];
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (entry === true) paths.push(nextPath.join("."));
    if (entry && typeof entry === "object") {
      paths.push(...protectedCurrentnessRepairTrueBooleanPaths(entry, nextPath));
    }
  }
  return paths.sort();
}

function protectedCurrentnessRepairWorkItem(registry) {
  return (registry?.workItems ?? []).find(
    (entry) => entry?.taskId === PROTECTED_CURRENTNESS_REPAIR_TASK_ID
  );
}

function protectedCurrentnessRepairBranch(registry) {
  return (registry?.branches ?? []).find(
    (entry) => entry?.name === PROTECTED_CURRENTNESS_REPAIR_BRANCH
  );
}

function protectedCurrentnessRepairReceiptPrefixSha256(receipts, count) {
  return sha256Buffer(Buffer.from(JSON.stringify(receipts.slice(0, count))));
}

export function validateProtectedCurrentnessRepairFrozenInitialSource(
  sourceRegistry,
  candidateRegistry,
  context
) {
  const lifecycle = protectedCurrentnessRepairWorkItem(candidateRegistry)
    ?.protectedCurrentnessActivationRepairLifecycle;
  const sourceItem = protectedCurrentnessRepairWorkItem(sourceRegistry);
  const sourceBranch = protectedCurrentnessRepairBranch(sourceRegistry);
  const sourceDesignLifecycle =
    sourceItem?.protectedCurrentnessActivationRepairDesignLifecycle;
  const sourceReceipts = sourceRegistry?.releaseReceipts;
  if (
    !Array.isArray(sourceReceipts) ||
    sourceReceipts.length !== PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_RECEIPT_COUNT ||
    protectedCurrentnessRepairReceiptPrefixSha256(
      sourceReceipts,
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_RECEIPT_COUNT
    ) !== PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_RECEIPT_SHA256
  ) {
    throw new Error(
      "rule=protected-currentness-repair-frozen-source-receipt-prefix-invalid"
    );
  }
  const sourcePrReceipt = sourceReceipts.find(
    (entry) =>
      entry?.receiptKind ===
      "pr82-protected-currentness-activation-repair-post-publication-reconciliation"
  );
  if (
    sourceItem?.prNumber !== PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER ||
    sourceItem?.plannedPullRequestNumber !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER ||
    sourceBranch?.pr !== PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER ||
    sourceBranch?.plannedPullRequestNumber !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER ||
    sourceDesignLifecycle?.seedDraftPullRequestNumber !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER ||
    sourceDesignLifecycle?.postPublicationSeedEvidence?.pullRequest?.number !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER ||
    sourcePrReceipt?.pullRequest?.number !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER
  ) {
    throw new Error("rule=protected-currentness-repair-frozen-pr-identity-invalid");
  }
  if (
    !context ||
    context.pullRequestNumber !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER
  ) {
    throw new Error("rule=protected-currentness-repair-frozen-pr-identity-invalid");
  }
  if (
    context.seedHeadSha !== PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_HEAD_SHA ||
    context.seedTreeSha !== PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_TREE_SHA ||
    context.seedRegistryBlobSha !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_REGISTRY_BLOB_SHA
  ) {
    throw new Error("rule=protected-currentness-repair-frozen-source-context-invalid");
  }
  if (
    !lifecycle ||
    lifecycle.designPlanSeedHeadSha !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_HEAD_SHA ||
    lifecycle.designPlanSeedTreeSha !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_TREE_SHA ||
    lifecycle.designPlanSeedRegistryBlobSha !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_REGISTRY_BLOB_SHA ||
    lifecycle.designPlanSeedReceiptPrefix?.count !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_RECEIPT_COUNT ||
    lifecycle.designPlanSeedReceiptPrefix?.sha256 !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_RECEIPT_SHA256
  ) {
    throw new Error("rule=protected-currentness-repair-frozen-source-lifecycle-invalid");
  }
  if (
    sha256Buffer(Buffer.from(JSON.stringify(sourceRegistry))) !==
    PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_REGISTRY_SHA256
  ) {
    throw new Error(
      "rule=protected-currentness-repair-frozen-source-canonical-registry-invalid"
    );
  }
  if (
    !gitObjectExists(
      `${PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_HEAD_SHA}^{commit}`
    )
  ) {
    throw new Error("rule=protected-currentness-repair-frozen-source-commit-unavailable");
  }
  let frozenTreeSha;
  let frozenRegistryBlobSha;
  let frozenRegistry;
  try {
    frozenTreeSha = gitText([
      "rev-parse",
      `${PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_HEAD_SHA}^{tree}`
    ]).trim();
    frozenRegistryBlobSha = gitText([
      "rev-parse",
      `${PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_HEAD_SHA}:${REGISTRY_REPO_PATH}`
    ]).trim();
    frozenRegistry = loadRegistryFromCommit(
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_HEAD_SHA
    ).parsed;
  } catch {
    throw new Error("rule=protected-currentness-repair-frozen-source-commit-unavailable");
  }
  if (frozenTreeSha !== PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_TREE_SHA) {
    throw new Error("rule=protected-currentness-repair-frozen-source-git-tree-invalid");
  }
  if (
    frozenRegistryBlobSha !==
    PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_REGISTRY_BLOB_SHA
  ) {
    throw new Error(
      "rule=protected-currentness-repair-frozen-source-git-registry-blob-invalid"
    );
  }
  if (!sameJson(frozenRegistry, sourceRegistry)) {
    throw new Error("rule=protected-currentness-repair-frozen-source-git-registry-invalid");
  }
  return true;
}

export function validateProtectedCurrentnessRepairAdditiveCorrectionAuthorization(
  authorization
) {
  assertProtectedCurrentnessRepairOrderedOwnKeys(
    authorization,
    PROTECTED_CURRENTNESS_REPAIR_ADDITIVE_CORRECTION_AUTHORIZATION_KEYS,
    "rule=protected-currentness-repair-additive-correction-authorization-schema-invalid"
  );
  assertProtectedCurrentnessRepairOrderedOwnKeys(
    authorization.correctionSourceReceiptPrefix,
    ["count", "sha256"],
    "rule=protected-currentness-repair-additive-correction-authorization-schema-invalid"
  );
  if (
    !sameJson(
      authorization,
      PROTECTED_CURRENTNESS_REPAIR_ADDITIVE_CORRECTION_AUTHORIZATION
    ) ||
    protectedCurrentnessRepairTrueBooleanPaths(authorization).length !== 0 ||
    sha256Buffer(Buffer.from(authorization.exactSentence)) !==
      authorization.exactSentenceSha256
  ) {
    throw new Error(
      "rule=protected-currentness-repair-additive-correction-authorization-invalid"
    );
  }
  return true;
}

export function validateProtectedCurrentnessRepairCorrectionSource(sourceRegistry) {
  const sourceReceipts = sourceRegistry?.releaseReceipts;
  if (
    !Array.isArray(sourceReceipts) ||
    sourceReceipts.length !==
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_RECEIPT_COUNT ||
    protectedCurrentnessRepairReceiptPrefixSha256(
      sourceReceipts,
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_RECEIPT_COUNT
    ) !== PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_RECEIPT_SHA256 ||
    sha256Buffer(Buffer.from(JSON.stringify(sourceRegistry))) !==
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_REGISTRY_CANONICAL_SHA256 ||
    !gitObjectExists(
      `${PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_HEAD_SHA}^{commit}`
    )
  ) {
    throw new Error(
      "rule=protected-currentness-repair-additive-correction-source-invalid"
    );
  }
  let treeSha;
  let registryBlobSha;
  let verifierBlobSha;
  let governanceTestBlobSha;
  let registryFileSha256;
  let committedRegistry;
  try {
    treeSha = gitText([
      "rev-parse",
      `${PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_HEAD_SHA}^{tree}`
    ]).trim();
    registryBlobSha = gitText([
      "rev-parse",
      `${PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_HEAD_SHA}:${REGISTRY_REPO_PATH}`
    ]).trim();
    verifierBlobSha = gitText([
      "rev-parse",
      `${PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_HEAD_SHA}:scripts/verify-sena-repo-governance.mjs`
    ]).trim();
    governanceTestBlobSha = gitText([
      "rev-parse",
      `${PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_HEAD_SHA}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
    ]).trim();
    registryFileSha256 = sha256Buffer(
      git(
        [
          "show",
          `${PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_HEAD_SHA}:${REGISTRY_REPO_PATH}`
        ],
        { binary: true }
      ).stdout
    );
    committedRegistry = loadRegistryFromCommit(
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_HEAD_SHA
    ).parsed;
  } catch {
    throw new Error(
      "rule=protected-currentness-repair-additive-correction-source-invalid"
    );
  }
  if (
    treeSha !== PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_TREE_SHA ||
    registryBlobSha !==
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_REGISTRY_BLOB_SHA ||
    verifierBlobSha !==
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_VERIFIER_BLOB_SHA ||
    governanceTestBlobSha !==
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_TEST_BLOB_SHA ||
    registryFileSha256 !==
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_REGISTRY_FILE_SHA256 ||
    !sameJson(committedRegistry, sourceRegistry)
  ) {
    throw new Error(
      "rule=protected-currentness-repair-additive-correction-source-invalid"
    );
  }
  return true;
}

function validateProtectedCurrentnessRepairReceipt(
  receipt,
  expectedKind,
  expectedScope,
  expectedAction,
  evidence = null,
  additiveCorrectionAuthorization = null
) {
  const expectedKeys = [
        "schemaVersion",
        "receiptKind",
        "taskId",
        "ownerKey",
        "scope",
        ...(evidence ? PROTECTED_CURRENTNESS_REPAIR_EVIDENCE_KEYS : []),
        ...(additiveCorrectionAuthorization
          ? ["additiveCorrectionAuthorization"]
          : []),
        "authorizationBoundary"
      ];
  assertProtectedCurrentnessRepairOrderedOwnKeys(
    receipt,
    expectedKeys,
    "rule=protected-currentness-repair-receipt-schema-invalid"
  );
  assertProtectedCurrentnessRepairOwnKeys(
    receipt.authorizationBoundary,
    [expectedAction],
    "rule=protected-currentness-repair-authorization-boundary-schema-invalid"
  );
  const allowedTruePaths = evidence
    ? [
        "annotationsEmpty",
        `authorizationBoundary.${expectedAction}`,
        "qualityReviewApproved",
        "requiredChecksPassed",
        "specReviewApproved"
      ]
    : [`authorizationBoundary.${expectedAction}`];
  if (
    receipt.schemaVersion !== "sena-registry-reconciliation-receipt/v1" ||
    receipt.receiptKind !== expectedKind ||
    receipt.taskId !== PROTECTED_CURRENTNESS_REPAIR_TASK_ID ||
    receipt.ownerKey !== PROTECTED_CURRENTNESS_REPAIR_OWNER_KEY ||
    !sameJson(receipt.scope, expectedScope) ||
    !sameJson(protectedCurrentnessRepairTrueBooleanPaths(receipt), allowedTruePaths) ||
    receipt.authorizationBoundary[expectedAction] !== true
  ) {
    throw new Error("rule=protected-currentness-repair-transition-receipt-invalid");
  }
  if (additiveCorrectionAuthorization) {
    validateProtectedCurrentnessRepairAdditiveCorrectionAuthorization(
      receipt.additiveCorrectionAuthorization
    );
    if (
      !sameJson(
        receipt.additiveCorrectionAuthorization,
        additiveCorrectionAuthorization
      )
    ) {
      throw new Error(
        "rule=protected-currentness-repair-additive-correction-authorization-invalid"
      );
    }
  }
  if (
    evidence &&
    !PROTECTED_CURRENTNESS_REPAIR_EVIDENCE_KEYS.every((key) =>
      sameJson(receipt[key], evidence[key])
    )
  ) {
    throw new Error("rule=protected-currentness-repair-final-evidence-invalid");
  }
}

export const PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_STRUCTURAL_ONLY =
  "structural-only";
export const PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_CONTEXT_BOUND =
  "context-bound";

export function validateProtectedCurrentnessRepairInitialEvidenceStructure(evidence) {
  assertProtectedCurrentnessRepairOwnKeys(
    evidence,
    PROTECTED_CURRENTNESS_REPAIR_EVIDENCE_KEYS,
    "rule=protected-currentness-repair-final-evidence-schema-invalid"
  );
  if (
    !["headSha", "treeSha", "registryBlobSha", "verifierBlobSha", "governanceTestBlobSha"]
      .every((field) => isSha(evidence[field])) ||
    !Number.isInteger(evidence.buildRunId) ||
    evidence.buildRunId <= 0 ||
    !exactDistinctPositiveIntegerArray(evidence.repositorySecurityRunIds, 2) ||
    !exactDistinctPositiveIntegerArray(evidence.checkJobIds, 3) ||
    evidence.requiredChecksPassed !== true ||
    evidence.annotationsEmpty !== true ||
    evidence.specReviewApproved !== true ||
    evidence.qualityReviewApproved !== true
  ) {
    throw new Error("rule=protected-currentness-repair-final-evidence-structure-invalid");
  }
  return true;
}

export function validateProtectedCurrentnessRepairInitialEvidenceAgainstContext(
  evidence,
  context
) {
  validateProtectedCurrentnessRepairInitialEvidenceStructure(evidence);
  if (
    !context ||
    context.evidenceContextComplete === false ||
    !isSha(context.headSha) ||
    !isSha(context.treeSha) ||
    !isSha(context.registryBlobSha) ||
    !isSha(context.verifierBlobSha) ||
    !isSha(context.governanceTestBlobSha) ||
    !Number.isInteger(context.buildRunId) ||
    context.buildRunId <= 0 ||
    !exactDistinctPositiveIntegerArray(context.repositorySecurityRunIds, 2) ||
    !exactDistinctPositiveIntegerArray(context.checkJobIds, 3) ||
    typeof context.requiredChecksPassed !== "boolean" ||
    typeof context.annotationsEmpty !== "boolean" ||
    typeof context.specReviewApproved !== "boolean" ||
    typeof context.qualityReviewApproved !== "boolean"
  ) {
    throw new Error("rule=protected-currentness-repair-final-evidence-context-missing");
  }
  if (
    context.headSha !== evidence.headSha ||
    context.treeSha !== evidence.treeSha ||
    context.registryBlobSha !== evidence.registryBlobSha ||
    context.verifierBlobSha !== evidence.verifierBlobSha ||
    context.governanceTestBlobSha !== evidence.governanceTestBlobSha ||
    context.buildRunId !== evidence.buildRunId ||
    !sameJson(context.repositorySecurityRunIds, evidence.repositorySecurityRunIds) ||
    !sameJson(context.checkJobIds, evidence.checkJobIds) ||
    context.requiredChecksPassed !== true ||
    context.annotationsEmpty !== true ||
    context.specReviewApproved !== true ||
    context.qualityReviewApproved !== true
  ) {
    throw new Error("rule=protected-currentness-repair-final-evidence-context-mismatch");
  }
  return true;
}

export function validateProtectedCurrentnessRepairFinalEvidenceAgainstSourceGit(
  sourceRegistry,
  evidence,
  context
) {
  validateProtectedCurrentnessRepairInitialEvidenceAgainstContext(
    evidence,
    context
  );
  const fail = () => {
    throw new Error(
      "rule=protected-currentness-repair-final-evidence-source-git-mismatch"
    );
  };
  let actualHeadSha;
  let actualTreeSha;
  let actualRegistryBlobSha;
  let actualVerifierBlobSha;
  let actualGovernanceTestBlobSha;
  let committedSourceRegistry;
  try {
    actualHeadSha = gitText(["rev-parse", "HEAD"]).trim();
    if (
      context?.seedHeadSha !== evidence.headSha ||
      context?.seedTreeSha !== evidence.treeSha ||
      context?.seedRegistryBlobSha !== evidence.registryBlobSha ||
      actualHeadSha !== evidence.headSha ||
      !gitObjectExists(`${evidence.headSha}^{commit}`) ||
      !gitObjectExists(`${evidence.treeSha}^{tree}`) ||
      !gitObjectExists(`${evidence.registryBlobSha}^{blob}`) ||
      !gitObjectExists(`${evidence.verifierBlobSha}^{blob}`) ||
      !gitObjectExists(`${evidence.governanceTestBlobSha}^{blob}`)
    ) {
      fail();
    }
    actualTreeSha = gitText([
      "rev-parse",
      `${actualHeadSha}^{tree}`
    ]).trim();
    actualRegistryBlobSha = gitText([
      "rev-parse",
      `${actualHeadSha}:${REGISTRY_REPO_PATH}`
    ]).trim();
    actualVerifierBlobSha = gitText([
      "rev-parse",
      `${actualHeadSha}:scripts/verify-sena-repo-governance.mjs`
    ]).trim();
    actualGovernanceTestBlobSha = gitText([
      "rev-parse",
      `${actualHeadSha}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
    ]).trim();
    committedSourceRegistry = loadRegistryFromCommit(actualHeadSha).parsed;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "rule=protected-currentness-repair-final-evidence-source-git-mismatch"
    ) {
      throw error;
    }
    fail();
  }
  if (
    actualTreeSha !== evidence.treeSha ||
    actualRegistryBlobSha !== evidence.registryBlobSha ||
    actualVerifierBlobSha !== evidence.verifierBlobSha ||
    actualGovernanceTestBlobSha !== evidence.governanceTestBlobSha ||
    !sameJson(committedSourceRegistry, sourceRegistry)
  ) {
    fail();
  }
  return true;
}

function validateProtectedCurrentnessRepairPrState(
  item,
  branch,
  lifecycle,
  options = {}
) {
  const expectedHead = lifecycle.status === PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS
    ? lifecycle.designPlanSeedHeadSha
    : lifecycle.status === PROTECTED_CURRENTNESS_REPAIR_CORRECTION_STATUS
      ? lifecycle.additiveCorrectionAuthorization?.correctionSourceHeadSha
      : lifecycle.initialCandidateCompletionEvidence?.headSha;
  const pr82PushCorrection = item?.[
    TASK77_PR82_PUSH_CORRECTION_LIFECYCLE_KEY
  ];
  if (pr82PushCorrection) {
    validateTask77Pr82PushCorrectionLifecycle(pr82PushCorrection);
  }
  const task78Compatibility = item?.[
    TASK78_FINAL_COMPATIBILITY_LIFECYCLE_KEY
  ];
  if (task78Compatibility) {
    validateTask78FinalCompatibilityLifecycle(task78Compatibility);
  }
  const task79Compatibility = item?.[
    TASK79_TEST_PHASE_COMPATIBILITY_LIFECYCLE_KEY
  ];
  if (task79Compatibility) {
    validateTask79TestPhaseCompatibilityLifecycle(task79Compatibility);
  }
  const pr82PushCorrectionActive = Boolean(
    pr82PushCorrection &&
      lifecycle.status === PROTECTED_CURRENTNESS_REPAIR_CORRECTION_STATUS
  );
  const task78CompatibilityActive = Boolean(
    task78Compatibility &&
      lifecycle.status === PROTECTED_CURRENTNESS_REPAIR_CORRECTION_STATUS
  );
  const task79CompatibilityActive = Boolean(
    task79Compatibility &&
      lifecycle.status === PROTECTED_CURRENTNESS_REPAIR_CORRECTION_STATUS
  );
  const expectedLocalHead = task79CompatibilityActive
    ? TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA
    : task78CompatibilityActive
      ? TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA
    : pr82PushCorrectionActive
      ? TASK77_PR82_PUSH_CORRECTION_SOURCE_HEAD_SHA
      : expectedHead;
  const expectedRemoteHead = task79CompatibilityActive
    ? TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA
    : task78CompatibilityActive
      ? TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA
    : pr82PushCorrectionActive
      ? EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA
      : expectedHead;
  if (
    item.noPrReason !== null ||
    branch.upstream !== `origin/${PROTECTED_CURRENTNESS_REPAIR_BRANCH}` ||
    branch.upstreamState !== "live" ||
    branch.upstreamCacheState !== "present" ||
    branch.noPrReason !== null
  ) {
    throw new Error("rule=protected-currentness-repair-custody-identity-invalid");
  }
  if (
    item.ownerKey !== PROTECTED_CURRENTNESS_REPAIR_OWNER_KEY ||
    branch.ownerKey !== PROTECTED_CURRENTNESS_REPAIR_OWNER_KEY ||
    item.branch !== PROTECTED_CURRENTNESS_REPAIR_BRANCH ||
    item.prNumber !== lifecycle.pullRequestNumber ||
    item.plannedPullRequestNumber !== lifecycle.pullRequestNumber ||
    item.prState !== "OPEN" ||
    item.prIsDraft !== true ||
    item.prReadyForReview !== false ||
    item.mergeAuthorized !== false ||
    item.headSha !== expectedLocalHead ||
    (item.prHeadSha !== expectedRemoteHead &&
      !(
        lifecycle.status === PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS &&
        options.allowExactFrozenLegacyInitialPrHead === true
      )) ||
    !sameJson(item.allowedPaths, PROTECTED_CURRENTNESS_REPAIR_OVERALL_SCOPE) ||
    branch.pr !== lifecycle.pullRequestNumber ||
    branch.plannedPullRequestNumber !== lifecycle.pullRequestNumber ||
    branch.prBase !== "main" ||
    branch.prState !== "OPEN" ||
    branch.prStateObservationMode !== "monotonic" ||
    branch.prIsDraft !== true ||
    branch.prReadyForReview !== false ||
    branch.mergeAuthorized !== false ||
    branch.remotePresent !== true ||
    branch.headSha !== expectedLocalHead ||
    branch.remoteHeadSha !== expectedRemoteHead ||
    branch.prHeadSha !== expectedRemoteHead ||
    branch.mergeable !== "MERGEABLE" ||
    branch.mergeStateStatus !== "CLEAN"
  ) {
    throw new Error("rule=protected-currentness-repair-pr-state-invalid");
  }
}

export function validateProtectedCurrentnessRepairLifecycleSnapshot(
  registry,
  mode,
  context = null,
  options = {}
) {
  if (
    mode !== PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_STRUCTURAL_ONLY &&
    mode !== PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_CONTEXT_BOUND
  ) {
    throw new Error("rule=protected-currentness-repair-snapshot-mode-required");
  }
  const item = protectedCurrentnessRepairWorkItem(registry);
  const branch = protectedCurrentnessRepairBranch(registry);
  const lifecycle = item?.protectedCurrentnessActivationRepairLifecycle;
  if (!item || !branch || !lifecycle) {
    throw new Error("rule=protected-currentness-repair-lifecycle-missing");
  }
  if (
    lifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS &&
    lifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_CORRECTION_STATUS &&
    lifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS
  ) {
    throw new Error("rule=protected-currentness-repair-status-invalid");
  }
  assertProtectedCurrentnessRepairOwnKeys(
    lifecycle,
    lifecycle.status === PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS
      ? PROTECTED_CURRENTNESS_REPAIR_LIFECYCLE_KEYS
      : PROTECTED_CURRENTNESS_REPAIR_CORRECTED_LIFECYCLE_KEYS,
    "rule=protected-currentness-repair-lifecycle-schema-invalid"
  );
  assertProtectedCurrentnessRepairOwnKeys(
    lifecycle.designPlanSeedReceiptPrefix,
    ["count", "sha256"],
    "rule=protected-currentness-repair-receipt-prefix-schema-invalid"
  );
  const retirement = (registry.workItems ?? []).find(
    (entry) => entry?.taskId === "SENA-BRANCH-RETIREMENT-20260829"
  );
  const protectedActivationBinding =
    retirement?.finalBaseHandshakeAuthorization?.protectedActivationBinding;
  if (
    lifecycle.pullRequestNumber !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER ||
    item.prNumber !== PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER ||
    item.plannedPullRequestNumber !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER ||
    branch.pr !== PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER ||
    branch.plannedPullRequestNumber !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER ||
    protectedActivationBinding?.requiredActivationPullRequestNumber !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER ||
    (mode === PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_CONTEXT_BOUND &&
      context.pullRequestNumber !==
        PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER)
  ) {
    throw new Error("rule=protected-currentness-repair-frozen-pr-identity-invalid");
  }
  if (
    lifecycle.oneShot !== true ||
    !Number.isInteger(lifecycle.pullRequestNumber) ||
    lifecycle.pullRequestNumber <= 0 ||
    !isSha(lifecycle.protectedBaseSha) ||
    !isSha(lifecycle.protectedBaseTreeSha) ||
    !isSha(lifecycle.protectedBaseRegistryBlobSha) ||
    !isSha(lifecycle.designPlanSeedHeadSha) ||
    !isSha(lifecycle.designPlanSeedTreeSha) ||
    !isSha(lifecycle.designPlanSeedRegistryBlobSha) ||
    lifecycle.designPlanSeedHeadSha !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_HEAD_SHA ||
    lifecycle.designPlanSeedTreeSha !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_TREE_SHA ||
    lifecycle.designPlanSeedRegistryBlobSha !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_REGISTRY_BLOB_SHA ||
    !Number.isInteger(lifecycle.designPlanSeedReceiptPrefix.count) ||
    lifecycle.designPlanSeedReceiptPrefix.count < 0 ||
    !validSha256(lifecycle.designPlanSeedReceiptPrefix.sha256) ||
    lifecycle.designPlanSeedReceiptPrefix.count !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_RECEIPT_COUNT ||
    lifecycle.designPlanSeedReceiptPrefix.sha256 !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_RECEIPT_SHA256 ||
    !sameJson(lifecycle.requiredOverallPaths, PROTECTED_CURRENTNESS_REPAIR_OVERALL_SCOPE) ||
    !sameJson(
      lifecycle.requiredImplementationPaths,
      PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE
    ) ||
    !PROTECTED_CURRENTNESS_REPAIR_PERMANENTLY_FALSE_ACTIONS.every(
      (field) => lifecycle[field] === false
    ) ||
    (mode === PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_CONTEXT_BOUND &&
      context.pullRequestNumber !== lifecycle.pullRequestNumber)
  ) {
    throw new Error("rule=protected-currentness-repair-lifecycle-core-invalid");
  }
  const receipts = registry.releaseReceipts ?? [];
  const prefixCount = lifecycle.designPlanSeedReceiptPrefix.count;
  const suffixReceiptKinds = receipts
    .slice(prefixCount)
    .map((receipt) => receipt?.receiptKind);
  const exactInitialSequence = [PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT];
  const exactCorrectionSequence = [
    PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT,
    PROTECTED_CURRENTNESS_REPAIR_CORRECTION_RECEIPT
  ];
  const exactCorrectionWithEvidenceFlowSequence = [
    ...exactCorrectionSequence,
    EVIDENCE_FLOW_CURRENTNESS_RECEIPT_KIND,
    TASK77_COMBINED_CURRENTNESS_RECEIPT_KIND
  ];
  const exactCorrectionWithTask77Pr82PushSequence = [
    ...exactCorrectionWithEvidenceFlowSequence,
    TASK77_PR82_PUSH_CORRECTION_RECEIPT_KIND
  ];
  const exactCorrectionWithTask78CompatibilitySequence = [
    ...exactCorrectionWithTask77Pr82PushSequence,
    TASK78_FINAL_COMPATIBILITY_RECEIPT_KIND
  ];
  const exactCorrectionWithTask79CompatibilitySequence = [
    ...exactCorrectionWithTask78CompatibilitySequence,
    TASK79_TEST_PHASE_COMPATIBILITY_RECEIPT_KIND
  ];
  const exactFinalSequence = [
    ...exactCorrectionSequence,
    PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
  ];
  const exactFinalAfterEvidenceFlowSequence = [
    ...exactCorrectionSequence,
    EVIDENCE_FLOW_CURRENTNESS_RECEIPT_KIND,
    TASK77_COMBINED_CURRENTNESS_RECEIPT_KIND,
    PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
  ];
  const exactFinalAfterTask77Pr82PushSequence = [
    ...exactCorrectionWithTask77Pr82PushSequence,
    PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
  ];
  const exactFinalAfterTask78CompatibilitySequence = [
    ...exactCorrectionWithTask78CompatibilitySequence,
    PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
  ];
  const exactFinalAfterTask79CompatibilitySequence = [
    ...exactCorrectionWithTask79CompatibilitySequence,
    PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
  ];
  if (
    receipts.length < prefixCount ||
    protectedCurrentnessRepairReceiptPrefixSha256(receipts, prefixCount) !==
      lifecycle.designPlanSeedReceiptPrefix.sha256
  ) {
    throw new Error("rule=protected-currentness-repair-receipt-prefix-invalid");
  }
  const initialReceipt = receipts[prefixCount];
  if (lifecycle.status === PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS) {
    if (!sameJson(suffixReceiptKinds, exactInitialSequence)) {
      throw new Error("rule=protected-currentness-repair-initial-receipt-delta-invalid");
    }
    validateProtectedCurrentnessRepairReceipt(
      initialReceipt,
      PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT,
      PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE,
      PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION
    );
    if (
      lifecycle.initialCandidateCompletionEvidence !== null ||
      lifecycle[PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION] !== true ||
      lifecycle[PROTECTED_CURRENTNESS_REPAIR_FINAL_ACTION] !== false ||
      !sameJson(protectedCurrentnessRepairTrueBooleanPaths(lifecycle), [
        PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION,
        "oneShot"
      ])
    ) {
      throw new Error("rule=protected-currentness-repair-initial-action-set-invalid");
    }
  } else if (lifecycle.status === PROTECTED_CURRENTNESS_REPAIR_CORRECTION_STATUS) {
    validateProtectedCurrentnessRepairAdditiveCorrectionAuthorization(
      lifecycle.additiveCorrectionAuthorization
    );
    const correctionHasEvidenceFlow = sameJson(
      suffixReceiptKinds,
      exactCorrectionWithEvidenceFlowSequence
    );
    const correctionHasTask77Pr82Push = sameJson(
      suffixReceiptKinds,
      exactCorrectionWithTask77Pr82PushSequence
    );
    const correctionHasTask78Compatibility = sameJson(
      suffixReceiptKinds,
      exactCorrectionWithTask78CompatibilitySequence
    );
    const correctionHasTask79Compatibility = sameJson(
      suffixReceiptKinds,
      exactCorrectionWithTask79CompatibilitySequence
    );
    if (
      !sameJson(suffixReceiptKinds, exactCorrectionSequence) &&
      !correctionHasEvidenceFlow &&
      !correctionHasTask77Pr82Push &&
      !correctionHasTask78Compatibility &&
      !correctionHasTask79Compatibility
    ) {
      throw new Error(
        "rule=protected-currentness-repair-correction-receipt-delta-invalid"
      );
    }
    if (
      correctionHasEvidenceFlow ||
      correctionHasTask77Pr82Push ||
      correctionHasTask78Compatibility ||
      correctionHasTask79Compatibility
    ) {
      validateEvidenceFlowCurrentnessLifecycleSnapshot(registry);
    }
    validateProtectedCurrentnessRepairReceipt(
      initialReceipt,
      PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT,
      PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE,
      PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION
    );
    validateProtectedCurrentnessRepairReceipt(
      receipts[prefixCount + 1],
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_RECEIPT,
      PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE,
      PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION,
      null,
      lifecycle.additiveCorrectionAuthorization
    );
    if (
      lifecycle.initialCandidateCompletionEvidence !== null ||
      lifecycle[PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION] !== true ||
      lifecycle[PROTECTED_CURRENTNESS_REPAIR_FINAL_ACTION] !== false ||
      !sameJson(protectedCurrentnessRepairTrueBooleanPaths(lifecycle), [
        PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION,
        "oneShot"
      ])
    ) {
      throw new Error("rule=protected-currentness-repair-correction-action-set-invalid");
    }
  } else {
    validateProtectedCurrentnessRepairAdditiveCorrectionAuthorization(
      lifecycle.additiveCorrectionAuthorization
    );
    assertProtectedCurrentnessRepairOwnKeys(
      lifecycle.initialCandidateCompletionEvidence,
      PROTECTED_CURRENTNESS_REPAIR_EVIDENCE_KEYS,
      "rule=protected-currentness-repair-final-evidence-schema-invalid"
    );
    if (
      lifecycle[PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION] !== false ||
      lifecycle[PROTECTED_CURRENTNESS_REPAIR_FINAL_ACTION] !== true ||
      !sameJson(protectedCurrentnessRepairTrueBooleanPaths(lifecycle), [
        ...PROTECTED_CURRENTNESS_REPAIR_EVIDENCE_TRUE_PATHS,
        "oneShot",
        PROTECTED_CURRENTNESS_REPAIR_FINAL_ACTION
      ])
    ) {
      throw new Error("rule=protected-currentness-repair-final-action-set-invalid");
    }
    const finalHasEvidenceFlow = sameJson(
      suffixReceiptKinds,
      exactFinalAfterEvidenceFlowSequence
    );
    const finalHasTask77Pr82Push = sameJson(
      suffixReceiptKinds,
      exactFinalAfterTask77Pr82PushSequence
    );
    const finalHasTask78Compatibility = sameJson(
      suffixReceiptKinds,
      exactFinalAfterTask78CompatibilitySequence
    );
    const finalHasTask79Compatibility = sameJson(
      suffixReceiptKinds,
      exactFinalAfterTask79CompatibilitySequence
    );
    if (
      !sameJson(suffixReceiptKinds, exactFinalSequence) &&
      !finalHasEvidenceFlow &&
      !finalHasTask77Pr82Push &&
      !finalHasTask78Compatibility &&
      !finalHasTask79Compatibility
    ) {
      throw new Error("rule=protected-currentness-repair-final-receipt-delta-invalid");
    }
    if (
      finalHasEvidenceFlow ||
      finalHasTask77Pr82Push ||
      finalHasTask78Compatibility ||
      finalHasTask79Compatibility
    ) {
      validateEvidenceFlowCurrentnessLifecycleSnapshot(registry);
    }
    validateProtectedCurrentnessRepairReceipt(
      initialReceipt,
      PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT,
      PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE,
      PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION
    );
    validateProtectedCurrentnessRepairReceipt(
      receipts[prefixCount + 1],
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_RECEIPT,
      PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE,
      PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION,
      null,
      lifecycle.additiveCorrectionAuthorization
    );
    validateProtectedCurrentnessRepairReceipt(
      receipts[prefixCount + (
        finalHasTask79Compatibility
          ? 7
          : finalHasTask78Compatibility
            ? 6
          : finalHasTask77Pr82Push
            ? 5
            : finalHasEvidenceFlow
              ? 4
              : 2
      )],
      PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT,
      PROTECTED_CURRENTNESS_REPAIR_FINAL_SCOPE,
      PROTECTED_CURRENTNESS_REPAIR_FINAL_ACTION,
      lifecycle.initialCandidateCompletionEvidence,
      lifecycle.additiveCorrectionAuthorization
    );
    if (mode === PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_CONTEXT_BOUND) {
      validateProtectedCurrentnessRepairInitialEvidenceAgainstContext(
        lifecycle.initialCandidateCompletionEvidence,
        context
      );
    } else {
      validateProtectedCurrentnessRepairInitialEvidenceStructure(
        lifecycle.initialCandidateCompletionEvidence
      );
    }
  }
  validateProtectedCurrentnessRepairPrState(item, branch, lifecycle, options);
  return { item, branch, lifecycle };
}

const REPAIR_INITIAL_MUTABLE_RECORDS = {
  repairWorkItem: [
    "headSha", "aheadBehind", "lastHeartbeatAt", "lastObservedAt", "nextReviewAt",
    "expectedCloseAt", "dirtyState", "evidenceState", "prHeadSha",
    "protectedCurrentnessActivationRepairLifecycle"
  ],
  repairBranch: [
    "headSha", "remoteHeadSha", "remoteObservedAt", "prStateObservationMode",
    "prHeadSha", "lastOwnerHeartbeatAt", "lastObservedAt", "lastCommitAt",
    "nextReviewAt", "expectedCloseAt", "closeout"
  ],
  a01WorkItem: ["aheadBehindObservationMode", "lastObservedAt", "nextReviewAt", "evidenceState"],
  pr81WorkItem: ["aheadBehindObservationMode", "lastObservedAt", "nextReviewAt", "evidenceState"],
  pr81Branch: ["prStateObservationMode", "lastObservedAt", "nextReviewAt", "closeout"],
  branchRetirementWorkItem: [
    "finalBaseHandshakeAuthorization", "lastObservedAt", "nextReviewAt", "evidenceState"
  ],
  branchRetirementBranch: ["prStateObservationMode", "lastObservedAt", "nextReviewAt", "closeout"],
  rootWorkItem: ["lastObservedAt", "nextReviewAt", "evidenceState"],
  rootBranch: ["lastObservedAt", "nextReviewAt", "closeout"]
};

const PROTECTED_CURRENTNESS_REPAIR_INITIAL_MUTABLE_AUTHORIZATION_CONTAINERS = [
  {
    recordType: "workItem",
    identity: PROTECTED_CURRENTNESS_REPAIR_TASK_ID,
    field: "aheadBehind",
    allowedNewTruePaths: []
  },
  {
    recordType: "workItem",
    identity: PROTECTED_CURRENTNESS_REPAIR_TASK_ID,
    field: "evidenceState",
    allowedNewTruePaths: [
      ["unreviewedCurrentness", "checksPassed"],
      ["unreviewedCurrentness", "remotePresent"]
    ]
  },
  {
    recordType: "branch",
    identity: PROTECTED_CURRENTNESS_REPAIR_BRANCH,
    field: "closeout",
    allowedNewTruePaths: []
  },
  {
    recordType: "workItem",
    identity: "SENA-A01-REPO-GOVERNANCE-20260827",
    field: "evidenceState",
    allowedNewTruePaths: []
  },
  {
    recordType: "workItem",
    identity: "SENA-PR80-POST-MAIN-CLOSEOUT-20260901",
    field: "evidenceState",
    allowedNewTruePaths: []
  },
  {
    recordType: "branch",
    identity: "codex/sena-pr80-post-main-closeout-20260901",
    field: "closeout",
    allowedNewTruePaths: []
  },
  {
    recordType: "workItem",
    identity: "SENA-BRANCH-RETIREMENT-20260829",
    field: "evidenceState",
    allowedNewTruePaths: []
  },
  {
    recordType: "branch",
    identity: "codex/sena-branch-retirement-20260829",
    field: "closeout",
    allowedNewTruePaths: []
  },
  {
    recordType: "workItem",
    identity: "SENA-A01-ROOT-CONTROL-PLANE-20260828",
    field: "evidenceState",
    allowedNewTruePaths: []
  },
  {
    recordType: "branch",
    identity: "main",
    field: "closeout",
    allowedNewTruePaths: []
  }
];
const PROTECTED_CURRENTNESS_REPAIR_FINAL_MUTABLE_AUTHORIZATION_CONTAINERS = [
  {
    recordType: "workItem",
    identity: PROTECTED_CURRENTNESS_REPAIR_TASK_ID,
    field: "aheadBehind",
    allowedNewTruePaths: []
  },
  {
    recordType: "workItem",
    identity: PROTECTED_CURRENTNESS_REPAIR_TASK_ID,
    field: "evidenceState",
    allowedNewTruePaths: [
      ["unreviewedCurrentness", "annotationsEmpty"],
      ["unreviewedCurrentness", "requiredChecksPassed"]
    ]
  },
  {
    recordType: "branch",
    identity: PROTECTED_CURRENTNESS_REPAIR_BRANCH,
    field: "closeout",
    allowedNewTruePaths: []
  }
];

function protectedCurrentnessRepairPrimitiveTruePathSegments(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const paths = [];
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (entry === true) {
      paths.push(nextPath);
    }
    if (entry && typeof entry === "object") {
      paths.push(
        ...protectedCurrentnessRepairPrimitiveTruePathSegments(entry, nextPath)
      );
    }
  }
  return paths;
}

function protectedCurrentnessRepairPathIdentity(pathSegments) {
  if (
    !Array.isArray(pathSegments) ||
    pathSegments.length === 0 ||
    !pathSegments.every((segment) => typeof segment === "string")
  ) {
    return undefined;
  }
  return JSON.stringify(pathSegments);
}

function protectedCurrentnessRepairMutableContainer(registry, descriptor) {
  const collection = descriptor.recordType === "workItem"
    ? registry?.workItems
    : registry?.branches;
  const identityKey = descriptor.recordType === "workItem" ? "taskId" : "name";
  return (collection ?? []).find(
    (entry) => entry?.[identityKey] === descriptor.identity
  )?.[descriptor.field];
}

function protectedCurrentnessRepairIntroducesMutableAuthorization(
  sourceRegistry,
  candidateRegistry,
  descriptors
) {
  return descriptors.some((descriptor) => {
    const sourcePaths = new Set(
      protectedCurrentnessRepairPrimitiveTruePathSegments(
        protectedCurrentnessRepairMutableContainer(sourceRegistry, descriptor)
      ).map(protectedCurrentnessRepairPathIdentity)
    );
    const allowedNewTruePaths = new Set(
      descriptor.allowedNewTruePaths.map(
        protectedCurrentnessRepairPathIdentity
      )
    );
    return protectedCurrentnessRepairPrimitiveTruePathSegments(
      protectedCurrentnessRepairMutableContainer(candidateRegistry, descriptor)
    ).some((pathSegments) => {
      const pathIdentity = protectedCurrentnessRepairPathIdentity(pathSegments);
      return (
        pathIdentity === undefined ||
        (!sourcePaths.has(pathIdentity) &&
          !allowedNewTruePaths.has(pathIdentity))
      );
    });
  });
}

function redactProtectedCurrentnessRepairFields(record, fields, label) {
  const copy = protectedActivationControlledExactClone(
    record ?? {},
    "rule=protected-currentness-repair-registry-normalization-invalid"
  );
  for (const field of fields) copy[field] = `<${label}:${field}>`;
  return copy;
}

function normalizedRepairInitialImmutableRegistrySha256(registry) {
  const copy = protectedActivationControlledExactClone(
    registry,
    "rule=protected-currentness-repair-registry-normalization-invalid"
  );
  copy.updatedAt = "<repair-owned>";
  copy.workItems = (copy.workItems ?? []).map((entry) => {
    if (entry.taskId === PROTECTED_CURRENTNESS_REPAIR_TASK_ID) {
      return redactProtectedCurrentnessRepairFields(
        entry,
        REPAIR_INITIAL_MUTABLE_RECORDS.repairWorkItem,
        "repair-item"
      );
    }
    if (entry.taskId === "SENA-A01-REPO-GOVERNANCE-20260827") {
      return redactProtectedCurrentnessRepairFields(
        entry,
        REPAIR_INITIAL_MUTABLE_RECORDS.a01WorkItem,
        "a01-item"
      );
    }
    if (entry.taskId === "SENA-PR80-POST-MAIN-CLOSEOUT-20260901") {
      return redactProtectedCurrentnessRepairFields(
        entry,
        REPAIR_INITIAL_MUTABLE_RECORDS.pr81WorkItem,
        "pr81-item"
      );
    }
    if (entry.taskId === "SENA-BRANCH-RETIREMENT-20260829") {
      return redactProtectedCurrentnessRepairFields(
        entry,
        REPAIR_INITIAL_MUTABLE_RECORDS.branchRetirementWorkItem,
        "pr46-item"
      );
    }
    if (entry.taskId === "SENA-A01-ROOT-CONTROL-PLANE-20260828") {
      return redactProtectedCurrentnessRepairFields(
        entry,
        REPAIR_INITIAL_MUTABLE_RECORDS.rootWorkItem,
        "root-item"
      );
    }
    return entry;
  });
  copy.branches = (copy.branches ?? []).map((entry) => {
    if (entry.name === PROTECTED_CURRENTNESS_REPAIR_BRANCH) {
      return redactProtectedCurrentnessRepairFields(
        entry,
        REPAIR_INITIAL_MUTABLE_RECORDS.repairBranch,
        "repair-branch"
      );
    }
    if (entry.name === "codex/sena-pr80-post-main-closeout-20260901") {
      return redactProtectedCurrentnessRepairFields(
        entry,
        REPAIR_INITIAL_MUTABLE_RECORDS.pr81Branch,
        "pr81-branch"
      );
    }
    if (entry.name === "codex/sena-branch-retirement-20260829") {
      return redactProtectedCurrentnessRepairFields(
        entry,
        REPAIR_INITIAL_MUTABLE_RECORDS.branchRetirementBranch,
        "pr46-branch"
      );
    }
    if (entry.name === "main") {
      return redactProtectedCurrentnessRepairFields(
        entry,
        REPAIR_INITIAL_MUTABLE_RECORDS.rootBranch,
        "root-branch"
      );
    }
    return entry;
  });
  copy.releaseReceipts = (copy.releaseReceipts ?? []).filter(
    (entry) => ![
      PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT,
      PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
    ].includes(entry?.receiptKind)
  );
  return sha256Buffer(Buffer.from(JSON.stringify(copy)));
}

const PROTECTED_PR46_REBINDING_CONFLICT_PATHS = [
  REGISTRY_REPO_PATH,
  "scripts/verify-sena-repo-governance.mjs",
  "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
];
const PROTECTED_PR46_REBINDING_PROTECTED_ONLY_PATHS = [
  "coordination/repo-governance/pr46-final-ready-repair-design.md",
  "coordination/repo-governance/pr46-final-ready-repair-implementation-plan.md",
  "coordination/repo-governance/pr82-protected-currentness-activation-repair-design.md",
  "coordination/repo-governance/pr82-protected-currentness-activation-repair-implementation-plan.md"
];
const PROTECTED_PR46_REBINDING_RED_GREEN_APPEND = [
  "integrated-monotonic-behind-must-never-imply-cleanup-or-deletion-authority",
  "root-protected-advance-chain-must-reject-parent-tree-registry-path-pr-or-receipt-drift",
  "pr46-activation-evidence-must-match-the-protected-repair-pr-number"
];
const PROTECTED_PR46_REBINDING_REQUIRED_EXECUTION = [
  "verify-the-owner-reviewed-repair-design-and-plan-seed-at-exact-protected-source-969a206",
  "push-only-the-named-repair-branch-and-create-one-draft-pr-to-read-back-its-actual-number",
  "write-and-observe-red-tests-before-each-currentness-chain-lifecycle-or-activation-production-change",
  "commit-and-push-the-exact-three-path-initial-repair-candidate-after-full-local-gates-and-immutable-reviews",
  "verify-initial-repair-head-build-both-security-checks-and-zero-annotation-readback",
  "commit-and-push-one-registry-only-final-repair-authorization",
  "verify-final-repair-head-build-both-security-checks-zero-annotations-and-fresh-reviews",
  "mark-the-repair-pr-ready-and-use-an-ordinary-protected-merge-with-exact-head-lease-and-no-admin-bypass",
  "verify-repair-post-main-build-security-zero-annotations-and-commit-bound-live-audit-before-and-after-root-fast-forward",
  "revalidate-pr46-exact-e24c635-head-three-conflicts-empty-candidate-only-and-four-path-protected-only-set",
  "only-after-those-gates-allow-pr46-to-consume-the-protected-binding-without-changing-its-core",
  "stop-before-pr46-mutation-local-ref-retirement-branch-worktree-orphan-remote-target-provider-deployment-or-history-mutation"
];
const PROTECTED_PR46_REBINDING_FALSE_ACTIONS = [
  "implementationAuthorizedNow",
  "localRefRetirementAuthorized",
  "retirementReceiptMintingAuthorized",
  "branchDeletionAuthorized",
  "worktreeRemovalAuthorized",
  "orphanWorktreeMutationAuthorized",
  "targetTagMutationAuthorized",
  "quarantineMutationAuthorized",
  "deploymentAuthorized",
  "providerMutationAuthorized",
  "resetAuthorized",
  "rebaseAuthorized",
  "stashAuthorized",
  "forceAuthorized",
  "historyRewriteAuthorized"
];
const protectedPr46RebindingSources = new WeakSet();

export function resolveProtectedPr46ActivationRebindingSource(sourceRegistry) {
  if (!protectedActivationCompletionCanonicalJsonTree(sourceRegistry)) {
    throw new Error("rule=protected-currentness-repair-frozen-source-registry-invalid");
  }
  if (
    !gitObjectExists(`${PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_HEAD_SHA}^{commit}`)
  ) {
    throw new Error("rule=protected-currentness-repair-frozen-source-git-identity-invalid");
  }
  let frozenTreeSha;
  let frozenRegistryBlobSha;
  let frozenRegistry;
  try {
    frozenTreeSha = gitText([
      "rev-parse",
      `${PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_HEAD_SHA}^{tree}`
    ]).trim();
    frozenRegistryBlobSha = gitText([
      "rev-parse",
      `${PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_HEAD_SHA}:${REGISTRY_REPO_PATH}`
    ]).trim();
    frozenRegistry = loadRegistryFromCommit(
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_HEAD_SHA
    ).parsed;
  } catch {
    throw new Error("rule=protected-currentness-repair-frozen-source-git-identity-invalid");
  }
  if (
    frozenTreeSha !== PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_TREE_SHA ||
    frozenRegistryBlobSha !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_REGISTRY_BLOB_SHA
  ) {
    throw new Error("rule=protected-currentness-repair-frozen-source-git-identity-invalid");
  }
  const sourceReceipts = sourceRegistry.releaseReceipts;
  if (
    !protectedActivationCompletionCanonicalJsonTree(frozenRegistry) ||
    !protectedActivationCompletionCanonicalDeepEqual(sourceRegistry, frozenRegistry) ||
    sha256Buffer(Buffer.from(JSON.stringify(sourceRegistry))) !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_REGISTRY_SHA256 ||
    !Array.isArray(sourceReceipts) ||
    sourceReceipts.length !== PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_RECEIPT_COUNT ||
    protectedCurrentnessRepairReceiptPrefixSha256(
      sourceReceipts,
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_RECEIPT_COUNT
    ) !== PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_RECEIPT_SHA256
  ) {
    throw new Error("rule=protected-currentness-repair-frozen-source-registry-invalid");
  }
  const retirement = (sourceRegistry.workItems ?? []).find(
    (entry) => entry?.taskId === "SENA-BRANCH-RETIREMENT-20260829"
  );
  const authorization = retirement?.finalBaseHandshakeAuthorization;
  if (!protectedActivationCompletionCanonicalJsonTree(authorization)) {
    throw new Error("rule=protected-currentness-repair-frozen-source-registry-invalid");
  }
  return protectedActivationControlledBrandedClone(
    authorization,
    protectedPr46RebindingSources,
    "rule=protected-currentness-repair-frozen-source-registry-invalid"
  );
}

export function expectedProtectedPr46ActivationRebinding(
  sourceAuthorization,
  repairPrNumber
) {
  if (
    repairPrNumber !== PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER ||
    !Number.isInteger(repairPrNumber) ||
    repairPrNumber <= 0
  ) {
    throw new Error("rule=protected-currentness-repair-activation-pr-invalid");
  }
  if (!protectedPr46RebindingSources.has(sourceAuthorization)) {
    throw new Error("rule=protected-currentness-repair-pr46-source-unbranded");
  }
  const pendingSourceKeys = PR46_HANDSHAKE_KEYS.filter(
    (field) => ![
      "protectedReceiptPrefix",
      "remergeCandidateCompletionEvidence"
    ].includes(field)
  );
  if (
    !protectedActivationCompletionFrozenPlainTree(sourceAuthorization) ||
    !exactPlainJsonOwnKeys(sourceAuthorization, pendingSourceKeys) ||
    !exactPlainJsonOwnKeys(sourceAuthorization.authorizedResolverTransition, [
      "implementationPaths",
      "allowedStatuses",
      "allowedTransitions",
      "requiredResolverModes",
      "arbitraryStatusMustFailClosed",
      "unknownTrueAuthorizationMustFailClosedRecursively",
      "candidateProjectionBinding",
      "pendingState",
      "remergeConsumedState",
      "finalReadyState",
      "requiredRedGreenCases"
    ]) ||
    !isPlainRecord(sourceAuthorization.authorizedResolverTransition.pendingState) ||
    !Array.isArray(sourceAuthorization.authorizedResolverTransition.requiredRedGreenCases) ||
    PROTECTED_PR46_REBINDING_RED_GREEN_APPEND.some((entry) =>
      sourceAuthorization.authorizedResolverTransition.requiredRedGreenCases.includes(entry)
    ) ||
    PROTECTED_PR46_REBINDING_FALSE_ACTIONS.some(
      (field) => sourceAuthorization[field] !== false
    )
  ) {
    throw new Error("rule=protected-currentness-repair-pr46-binding-missing");
  }
  const expected = protectedActivationControlledExactClone(
    sourceAuthorization,
    "rule=protected-currentness-repair-pr46-binding-missing"
  );
  expected.status = "pending-protected-activation";
  expected.authorizationSourceMainSha = PROTECTED_CURRENTNESS_REPAIR_PROTECTED_BASE.headSha;
  expected.authorizationSourceMainTreeSha =
    PROTECTED_CURRENTNESS_REPAIR_PROTECTED_BASE.treeSha;
  expected.authorizationSourceRegistryBlobSha =
    PROTECTED_CURRENTNESS_REPAIR_PROTECTED_BASE.registryBlobSha;
  expected.protectedActivationBinding = {
    mode: "loaded-fetched-origin-main-authorization-registry-commit",
    requiredReceiptKind: PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT,
    requiredFinalAuthorizationReceiptKind: PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT,
    requiredAuthorizationStatus: "pending-protected-activation",
    requiredActivationLifecycleStatus: PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS,
    requiredActivationPullRequestNumber: repairPrNumber,
    mustDescendFromAuthorizationSourceMainSha: true,
    mustEqualFetchedOriginMain: true,
    postMainBuildRequired: true,
    postMainSecurityRequired: true,
    postMainAnnotationsMustBeEmpty: true,
    commitBoundLiveAuditRequired: true
  };
  expected.currentProtectedMainSha = PROTECTED_CURRENTNESS_REPAIR_PROTECTED_BASE.headSha;
  expected.currentProtectedMainTreeSha = PROTECTED_CURRENTNESS_REPAIR_PROTECTED_BASE.treeSha;
  expected.currentProtectedRegistryBlobSha =
    PROTECTED_CURRENTNESS_REPAIR_PROTECTED_BASE.registryBlobSha;
  expected.currentConflictPathCount = PROTECTED_PR46_REBINDING_CONFLICT_PATHS.length;
  expected.currentConflictingPaths = [...PROTECTED_PR46_REBINDING_CONFLICT_PATHS];
  expected.currentCandidateOnlyCleanPaths = [];
  expected.authorizedResolverTransition.pendingState = {
    ...expected.authorizedResolverTransition.pendingState,
    conflictingPathsMustEqual: [...PROTECTED_PR46_REBINDING_CONFLICT_PATHS],
    cleanCandidateOnlyPathsMustEqual: [],
    cleanProtectedOnlyPathsMustEqual: [...PROTECTED_PR46_REBINDING_PROTECTED_ONLY_PATHS],
    exactThreeFileResolutionMustPreserveProtectedRepairLifecycle: true
  };
  expected.authorizedResolverTransition.requiredRedGreenCases = [
    ...sourceAuthorization.authorizedResolverTransition.requiredRedGreenCases,
    ...PROTECTED_PR46_REBINDING_RED_GREEN_APPEND
  ];
  expected.requiredExecution = [...PROTECTED_PR46_REBINDING_REQUIRED_EXECUTION];
  expected.finalOrdinaryMergeReconciliationAuthorizedAfterProtectedActivation = true;
  expected.finalResolverAndTestStageAuthorizedAfterProtectedActivation = true;
  expected.finalMergeCommitPushAuthorizedAfterRequiredGates = true;
  expected.finalAuthorizationMetadataCommitAuthorizedAfterInitialExactHeadChecks = false;
  expected.pr46ReadyAndProtectedMergeAuthorizedAfterFinalCandidateChecks = false;
  return expected;
}

export function validateProtectedPr46ActivationRebinding(
  sourceAuthorization,
  candidateAuthorization,
  repairPrNumber
) {
  const expected = expectedProtectedPr46ActivationRebinding(
    sourceAuthorization,
    repairPrNumber
  );
  if (
    !protectedActivationCompletionCanonicalJsonTree(candidateAuthorization) ||
    !protectedActivationCompletionCanonicalDeepEqual(candidateAuthorization, expected)
  ) {
    throw new Error(
      "rule=protected-currentness-repair-pr46-activation-delta-invalid"
    );
  }
  return true;
}

export function validateProtectedCurrentnessRepairInitialDelta(
  sourceRegistry,
  candidateRegistry,
  context
) {
  const candidate = validateProtectedCurrentnessRepairLifecycleSnapshot(
    candidateRegistry,
    PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_STRUCTURAL_ONLY
  );
  const lifecycle = candidate.lifecycle;
  const sourceReceipts = sourceRegistry.releaseReceipts ?? [];
  const candidateReceipts = candidateRegistry.releaseReceipts ?? [];
  const sourceItem = protectedCurrentnessRepairWorkItem(sourceRegistry);
  const sourceBranch = protectedCurrentnessRepairBranch(sourceRegistry);
  const sourceFreezeBinding = (sourceRegistry.policy?.freezeExceptionBindings ?? []).find(
    (entry) => entry?.taskId === PROTECTED_CURRENTNESS_REPAIR_TASK_ID
  );
  const candidateFreezeBinding = (candidateRegistry.policy?.freezeExceptionBindings ?? []).find(
    (entry) => entry?.taskId === PROTECTED_CURRENTNESS_REPAIR_TASK_ID
  );
  const candidateRetirement = (candidateRegistry.workItems ?? []).find(
    (entry) => entry?.taskId === "SENA-BRANCH-RETIREMENT-20260829"
  );
  const protectedPr46ActivationSource =
    resolveProtectedPr46ActivationRebindingSource(sourceRegistry);
  let protectedPr46ActivationRebindingValid = false;
  try {
    protectedPr46ActivationRebindingValid = validateProtectedPr46ActivationRebinding(
      protectedPr46ActivationSource,
      candidateRetirement?.finalBaseHandshakeAuthorization,
      context?.pullRequestNumber
    );
  } catch {
    protectedPr46ActivationRebindingValid = false;
  }
  const sourceNormalizedSha256 =
    normalizedRepairInitialImmutableRegistrySha256(sourceRegistry);
  const candidateNormalizedSha256 =
    normalizedRepairInitialImmutableRegistrySha256(candidateRegistry);
  const introducesMutableAuthorization =
    protectedCurrentnessRepairIntroducesMutableAuthorization(
      sourceRegistry,
      candidateRegistry,
      PROTECTED_CURRENTNESS_REPAIR_INITIAL_MUTABLE_AUTHORIZATION_CONTAINERS
    );
  if (
    !context ||
    context.seedHeadSha !== lifecycle.designPlanSeedHeadSha ||
    context.seedTreeSha !== lifecycle.designPlanSeedTreeSha ||
    context.seedRegistryBlobSha !== lifecycle.designPlanSeedRegistryBlobSha ||
    lifecycle.protectedBaseSha !== PROTECTED_CURRENTNESS_REPAIR_PROTECTED_BASE.headSha ||
    lifecycle.protectedBaseTreeSha !== PROTECTED_CURRENTNESS_REPAIR_PROTECTED_BASE.treeSha ||
    lifecycle.protectedBaseRegistryBlobSha !==
      PROTECTED_CURRENTNESS_REPAIR_PROTECTED_BASE.registryBlobSha ||
    lifecycle.designPlanSeedReceiptPrefix.count !== sourceReceipts.length ||
    candidateReceipts.length !== sourceReceipts.length + 1 ||
    !sourceReceipts.every((receipt, index) => sameJson(receipt, candidateReceipts[index])) ||
    !sameJson(sourceItem?.allowedPaths, PROTECTED_CURRENTNESS_REPAIR_OVERALL_SCOPE) ||
    !sameJson(candidate.item.allowedPaths, sourceItem?.allowedPaths) ||
    sourceItem?.ownerKey !== PROTECTED_CURRENTNESS_REPAIR_OWNER_KEY ||
    candidate.item.ownerKey !== sourceItem.ownerKey ||
    candidate.item.disposition !== sourceItem.disposition ||
    sourceBranch?.ownerKey !== PROTECTED_CURRENTNESS_REPAIR_OWNER_KEY ||
    candidate.branch.ownerKey !== sourceBranch.ownerKey ||
    candidate.branch.disposition !== sourceBranch.disposition ||
    !sameJson(candidateFreezeBinding, sourceFreezeBinding) ||
    !protectedPr46ActivationRebindingValid ||
    sourceNormalizedSha256 !== candidateNormalizedSha256 ||
    introducesMutableAuthorization
  ) {
    if (introducesMutableAuthorization) {
      throw new Error(
        "rule=protected-currentness-repair-mutable-authorization-delta-invalid"
      );
    }
    throw new Error("rule=protected-currentness-repair-initial-delta-invalid");
  }
  return true;
}

const PROTECTED_CURRENTNESS_REPAIR_CORRECTION_MUTABLE_ITEM_FIELDS = [
  "headSha", "aheadBehind", "lastHeartbeatAt", "lastObservedAt", "nextReviewAt",
  "dirtyState", "evidenceState", "prHeadSha"
];
const PROTECTED_CURRENTNESS_REPAIR_FINAL_MUTABLE_ITEM_FIELDS = [
  "headSha", "aheadBehind", "lastHeartbeatAt", "lastObservedAt", "nextReviewAt",
  "dirtyState", "evidenceState", "prHeadSha"
];
const PROTECTED_CURRENTNESS_REPAIR_INITIAL_AHEAD_BEHIND = Object.freeze({
  baseRef: "origin/main",
  ahead: 5,
  behind: 0
});
const PROTECTED_CURRENTNESS_REPAIR_CORRECTION_AHEAD_BEHIND = Object.freeze({
  baseRef: "origin/main",
  ahead: 6,
  behind: 0
});
const PROTECTED_CURRENTNESS_REPAIR_FINAL_AHEAD_BEHIND = Object.freeze({
  baseRef: "origin/main",
  ahead: 7,
  behind: 0
});
const PROTECTED_CURRENTNESS_REPAIR_TASK77_SOURCE_AHEAD_BEHIND = Object.freeze({
  baseRef: "origin/main",
  ahead: 8,
  behind: 0
});
const PROTECTED_CURRENTNESS_REPAIR_TASK77_FINAL_AHEAD_BEHIND = Object.freeze({
  baseRef: "origin/main",
  ahead: 9,
  behind: 0
});
const PROTECTED_CURRENTNESS_REPAIR_TASK78_SOURCE_AHEAD_BEHIND = Object.freeze({
  baseRef: "origin/main",
  ahead: 9,
  behind: 0
});
const PROTECTED_CURRENTNESS_REPAIR_TASK78_FINAL_AHEAD_BEHIND = Object.freeze({
  baseRef: "origin/main",
  ahead: 10,
  behind: 0
});
const PROTECTED_CURRENTNESS_REPAIR_TASK79_SOURCE_AHEAD_BEHIND = Object.freeze({
  baseRef: "origin/main",
  ahead: 10,
  behind: 0
});
const PROTECTED_CURRENTNESS_REPAIR_TASK79_FINAL_AHEAD_BEHIND = Object.freeze({
  baseRef: "origin/main",
  ahead: 11,
  behind: 0
});

export function protectedCurrentnessRepairFinalAheadBehindExpectations(item) {
  if (item?.[TASK79_TEST_PHASE_COMPATIBILITY_LIFECYCLE_KEY]) {
    return {
      source: PROTECTED_CURRENTNESS_REPAIR_TASK79_SOURCE_AHEAD_BEHIND,
      final: PROTECTED_CURRENTNESS_REPAIR_TASK79_FINAL_AHEAD_BEHIND
    };
  }
  if (item?.[TASK78_FINAL_COMPATIBILITY_LIFECYCLE_KEY]) {
    return {
      source: PROTECTED_CURRENTNESS_REPAIR_TASK78_SOURCE_AHEAD_BEHIND,
      final: PROTECTED_CURRENTNESS_REPAIR_TASK78_FINAL_AHEAD_BEHIND
    };
  }
  if (item?.[TASK77_PR82_PUSH_CORRECTION_LIFECYCLE_KEY]) {
    return {
      source: PROTECTED_CURRENTNESS_REPAIR_TASK77_SOURCE_AHEAD_BEHIND,
      final: PROTECTED_CURRENTNESS_REPAIR_TASK77_FINAL_AHEAD_BEHIND
    };
  }
  return {
    source: PROTECTED_CURRENTNESS_REPAIR_CORRECTION_AHEAD_BEHIND,
    final: PROTECTED_CURRENTNESS_REPAIR_FINAL_AHEAD_BEHIND
  };
}

const PROTECTED_CURRENTNESS_REPAIR_FINAL_MUTABLE_LIFECYCLE_FIELDS = [
  "status",
  "initialCandidateCompletionEvidence",
  PROTECTED_CURRENTNESS_REPAIR_INITIAL_ACTION,
  PROTECTED_CURRENTNESS_REPAIR_FINAL_ACTION
];
const PROTECTED_CURRENTNESS_REPAIR_FINAL_MUTABLE_BRANCH_FIELDS = [
  "headSha", "remoteHeadSha", "remoteObservedAt", "prState", "prIsDraft",
  "prReadyForReview", "mergeAuthorized", "prHeadSha", "lastOwnerHeartbeatAt",
  "lastObservedAt", "lastCommitAt", "nextReviewAt", "closeout", "mergeable",
  "mergeStateStatus"
];

const PROTECTED_CURRENTNESS_REPAIR_CORRECTION_MUTABLE_LIFECYCLE_FIELDS = [
  "status",
  "additiveCorrectionAuthorization"
];

function normalizedRepairCorrectionImmutableRegistrySha256(registry) {
  const copy = protectedActivationControlledExactClone(
    registry,
    "rule=protected-currentness-repair-registry-normalization-invalid"
  );
  copy.updatedAt = "<repair-correction-owned>";
  copy.workItems = (copy.workItems ?? []).map((entry) => {
    if (entry.taskId !== PROTECTED_CURRENTNESS_REPAIR_TASK_ID) return entry;
    const redactedLifecycle = redactProtectedCurrentnessRepairFields(
      entry.protectedCurrentnessActivationRepairLifecycle,
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_MUTABLE_LIFECYCLE_FIELDS,
      "repair-correction-lifecycle"
    );
    return redactProtectedCurrentnessRepairFields(
      {
        ...entry,
        protectedCurrentnessActivationRepairLifecycle: Object.fromEntries(
          PROTECTED_CURRENTNESS_REPAIR_CORRECTED_LIFECYCLE_KEYS.map((field) => [
            field,
            redactedLifecycle[field]
          ])
        )
      },
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_MUTABLE_ITEM_FIELDS,
      "repair-correction-item"
    );
  });
  copy.branches = (copy.branches ?? []).map((entry) =>
    entry.name === PROTECTED_CURRENTNESS_REPAIR_BRANCH
      ? redactProtectedCurrentnessRepairFields(
          entry,
          PROTECTED_CURRENTNESS_REPAIR_FINAL_MUTABLE_BRANCH_FIELDS,
          "repair-correction-branch"
        )
      : entry
  );
  copy.releaseReceipts = (copy.releaseReceipts ?? []).filter(
    (entry) => entry?.receiptKind !== PROTECTED_CURRENTNESS_REPAIR_CORRECTION_RECEIPT
  );
  return sha256Buffer(Buffer.from(JSON.stringify(copy)));
}

export function validateProtectedCurrentnessRepairCorrectionDelta(
  sourceRegistry,
  candidateRegistry,
  context
) {
  validateProtectedCurrentnessRepairCorrectionSource(sourceRegistry);
  const source = validateProtectedCurrentnessRepairLifecycleSnapshot(
    sourceRegistry,
    PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_STRUCTURAL_ONLY,
    null,
    { allowExactFrozenLegacyInitialPrHead: true }
  );
  const candidate = validateProtectedCurrentnessRepairLifecycleSnapshot(
    candidateRegistry,
    PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_STRUCTURAL_ONLY
  );
  const correctionAheadBehindValid =
    sameJson(
      source.item.aheadBehind,
      PROTECTED_CURRENTNESS_REPAIR_INITIAL_AHEAD_BEHIND
    ) &&
    sameJson(
      candidate.item.aheadBehind,
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_AHEAD_BEHIND
    ) &&
    source.lifecycle.protectedBaseSha ===
      PROTECTED_CURRENTNESS_REPAIR_PROTECTED_BASE.headSha &&
    candidate.lifecycle.protectedBaseSha ===
      PROTECTED_CURRENTNESS_REPAIR_PROTECTED_BASE.headSha;
  const sourceReceipts = sourceRegistry.releaseReceipts ?? [];
  const candidateReceipts = candidateRegistry.releaseReceipts ?? [];
  const immutableLifecycleFields = PROTECTED_CURRENTNESS_REPAIR_LIFECYCLE_KEYS.filter(
    (field) =>
      !PROTECTED_CURRENTNESS_REPAIR_CORRECTION_MUTABLE_LIFECYCLE_FIELDS.includes(
        field
      )
  );
  const introducesMutableAuthorization =
    protectedCurrentnessRepairIntroducesMutableAuthorization(
      sourceRegistry,
      candidateRegistry,
      PROTECTED_CURRENTNESS_REPAIR_FINAL_MUTABLE_AUTHORIZATION_CONTAINERS
    );
  if (introducesMutableAuthorization) {
    throw new Error(
      "rule=protected-currentness-repair-mutable-authorization-delta-invalid"
    );
  }
  if (!correctionAheadBehindValid) {
    throw new Error(
      "rule=protected-currentness-repair-correction-ahead-behind-invalid"
    );
  }
  if (
    !context ||
    context.pullRequestNumber !==
      PROTECTED_CURRENTNESS_REPAIR_FROZEN_PULL_REQUEST_NUMBER ||
    context.seedHeadSha !==
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_HEAD_SHA ||
    context.seedTreeSha !==
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_TREE_SHA ||
    context.seedRegistryBlobSha !==
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_REGISTRY_BLOB_SHA ||
    source.lifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS ||
    candidate.lifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_CORRECTION_STATUS ||
    !immutableLifecycleFields.every((field) =>
      sameJson(source.lifecycle[field], candidate.lifecycle[field])
    ) ||
    candidateReceipts.length !== sourceReceipts.length + 1 ||
    !sourceReceipts.every((receipt, index) =>
      sameJson(receipt, candidateReceipts[index])
    ) ||
    normalizedRepairCorrectionImmutableRegistrySha256(sourceRegistry) !==
      normalizedRepairCorrectionImmutableRegistrySha256(candidateRegistry)
  ) {
    throw new Error("rule=protected-currentness-repair-correction-delta-invalid");
  }
  return true;
}

function normalizedRepairFinalImmutableRegistrySha256(registry) {
  const copy = protectedActivationControlledExactClone(
    registry,
    "rule=protected-currentness-repair-registry-normalization-invalid"
  );
  copy.updatedAt = "<repair-final-owned>";
  copy.workItems = (copy.workItems ?? []).map((entry) => {
    if (entry.taskId !== PROTECTED_CURRENTNESS_REPAIR_TASK_ID) return entry;
    return redactProtectedCurrentnessRepairFields(
      {
        ...entry,
        protectedCurrentnessActivationRepairLifecycle:
          redactProtectedCurrentnessRepairFields(
            entry.protectedCurrentnessActivationRepairLifecycle,
            PROTECTED_CURRENTNESS_REPAIR_FINAL_MUTABLE_LIFECYCLE_FIELDS,
            "repair-final-lifecycle"
          )
      },
      PROTECTED_CURRENTNESS_REPAIR_FINAL_MUTABLE_ITEM_FIELDS,
      "repair-final-item"
    );
  });
  copy.branches = (copy.branches ?? []).map((entry) =>
    entry.name === PROTECTED_CURRENTNESS_REPAIR_BRANCH
      ? redactProtectedCurrentnessRepairFields(
          entry,
          PROTECTED_CURRENTNESS_REPAIR_FINAL_MUTABLE_BRANCH_FIELDS,
          "repair-final-branch"
        )
      : entry
  );
  copy.releaseReceipts = (copy.releaseReceipts ?? []).filter(
    (entry) => entry?.receiptKind !== PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
  );
  return sha256Buffer(Buffer.from(JSON.stringify(copy)));
}

export function validateProtectedCurrentnessRepairFinalDelta(
  sourceRegistry,
  candidateRegistry,
  context
) {
  const source = validateProtectedCurrentnessRepairLifecycleSnapshot(
    sourceRegistry,
    PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_STRUCTURAL_ONLY
  );
  const candidate = validateProtectedCurrentnessRepairLifecycleSnapshot(
    candidateRegistry,
    PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_CONTEXT_BOUND,
    context
  );
  const expectedAheadBehind =
    protectedCurrentnessRepairFinalAheadBehindExpectations(source.item);
  const finalAheadBehindValid =
    sameJson(
      source.item.aheadBehind,
      expectedAheadBehind.source
    ) &&
    sameJson(
      candidate.item.aheadBehind,
      expectedAheadBehind.final
    ) &&
    source.lifecycle.protectedBaseSha ===
      PROTECTED_CURRENTNESS_REPAIR_PROTECTED_BASE.headSha &&
    candidate.lifecycle.protectedBaseSha ===
      PROTECTED_CURRENTNESS_REPAIR_PROTECTED_BASE.headSha;
  const sourceReceipts = sourceRegistry.releaseReceipts ?? [];
  const candidateReceipts = candidateRegistry.releaseReceipts ?? [];
  const immutableLifecycleFields =
    PROTECTED_CURRENTNESS_REPAIR_CORRECTED_LIFECYCLE_KEYS.filter(
    (field) => !PROTECTED_CURRENTNESS_REPAIR_FINAL_MUTABLE_LIFECYCLE_FIELDS.includes(field)
  );
  const sourceNormalizedSha256 =
    normalizedRepairFinalImmutableRegistrySha256(sourceRegistry);
  const candidateNormalizedSha256 =
    normalizedRepairFinalImmutableRegistrySha256(candidateRegistry);
  const introducesMutableAuthorization =
    protectedCurrentnessRepairIntroducesMutableAuthorization(
      sourceRegistry,
      candidateRegistry,
      PROTECTED_CURRENTNESS_REPAIR_FINAL_MUTABLE_AUTHORIZATION_CONTAINERS
    );
  if (introducesMutableAuthorization) {
    throw new Error(
      "rule=protected-currentness-repair-mutable-authorization-delta-invalid"
    );
  }
  if (!finalAheadBehindValid) {
    throw new Error(
      "rule=protected-currentness-repair-final-ahead-behind-invalid"
    );
  }
  if (
    source.lifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_CORRECTION_STATUS ||
    candidate.lifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS ||
    !immutableLifecycleFields.every((field) =>
      sameJson(source.lifecycle[field], candidate.lifecycle[field])
    ) ||
    candidateReceipts.length !== sourceReceipts.length + 1 ||
    !sourceReceipts.every((receipt, index) => sameJson(receipt, candidateReceipts[index])) ||
    sourceNormalizedSha256 !== candidateNormalizedSha256 ||
    !sameJson(
      source.lifecycle.additiveCorrectionAuthorization,
      candidate.lifecycle.additiveCorrectionAuthorization
    )
  ) {
    throw new Error("rule=protected-currentness-repair-final-delta-invalid");
  }
  validateProtectedCurrentnessRepairFinalEvidenceAgainstSourceGit(
    sourceRegistry,
    candidate.lifecycle.initialCandidateCompletionEvidence,
    context
  );
  return true;
}

export function protectedCurrentnessRepairLifecycleResolutionFromRegistries(
  sourceRegistry,
  candidateRegistry,
  context = {}
) {
  const sourceLifecycle = protectedCurrentnessRepairWorkItem(sourceRegistry)
    ?.protectedCurrentnessActivationRepairLifecycle;
  if (!sourceLifecycle) {
    validateProtectedCurrentnessRepairFrozenInitialSource(
      sourceRegistry,
      candidateRegistry,
      context
    );
    const candidate = validateProtectedCurrentnessRepairLifecycleSnapshot(
      candidateRegistry,
      PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_STRUCTURAL_ONLY
    );
    if (candidate.lifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS) {
      throw new Error("rule=protected-currentness-repair-transition-source-invalid");
    }
    validateProtectedCurrentnessRepairInitialDelta(sourceRegistry, candidateRegistry, context);
    return candidate;
  }
  const candidate = validateProtectedCurrentnessRepairLifecycleSnapshot(
    candidateRegistry,
    PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_STRUCTURAL_ONLY
  );
  if (sourceLifecycle.status === PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS) {
    throw new Error("rule=protected-currentness-repair-transition-replay");
  }
  if (sourceLifecycle.status === PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS) {
    if (
      candidate.lifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_CORRECTION_STATUS
    ) {
      throw new Error("rule=protected-currentness-repair-transition-source-invalid");
    }
    validateProtectedCurrentnessRepairCorrectionDelta(
      sourceRegistry,
      candidateRegistry,
      context
    );
    return candidate;
  }
  if (
    sourceLifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_CORRECTION_STATUS ||
    candidate.lifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS
  ) {
    throw new Error("rule=protected-currentness-repair-transition-source-invalid");
  }
  validateProtectedCurrentnessRepairFinalDelta(sourceRegistry, candidateRegistry, context);
  return candidate;
}

export function protectedCurrentnessRepairObservationContextFromEnvironment(seedHeadSha) {
  const requiredEnvironmentNames = [
    "SENA_REPAIR_INITIAL_HEAD",
    "SENA_REPAIR_INITIAL_TREE",
    "SENA_REPAIR_INITIAL_REGISTRY_BLOB",
    "SENA_REPAIR_INITIAL_VERIFIER_BLOB",
    "SENA_REPAIR_INITIAL_TEST_BLOB",
    "SENA_REPAIR_INITIAL_BUILD_RUN_ID",
    "SENA_REPAIR_INITIAL_REPOSITORY_SECURITY_RUN_IDS",
    "SENA_REPAIR_INITIAL_CHECK_JOB_IDS",
    "SENA_REPAIR_INITIAL_REQUIRED_CHECKS_PASSED",
    "SENA_REPAIR_INITIAL_ANNOTATIONS_EMPTY",
    "SENA_REPAIR_INITIAL_SPEC_REVIEW_APPROVED",
    "SENA_REPAIR_INITIAL_QUALITY_REVIEW_APPROVED"
  ];
  return {
    evidenceContextComplete: requiredEnvironmentNames.every(
      (name) => typeof process.env[name] === "string" && process.env[name].length > 0
    ),
    seedHeadSha,
    seedTreeSha: gitText(["rev-parse", `${seedHeadSha}^{tree}`]).trim(),
    seedRegistryBlobSha: gitText([
      "rev-parse",
      `${seedHeadSha}:${REGISTRY_REPO_PATH}`
    ]).trim(),
    pullRequestNumber: Number(process.env.SENA_REPAIR_PR_NUMBER),
    headSha: process.env.SENA_REPAIR_INITIAL_HEAD,
    treeSha: process.env.SENA_REPAIR_INITIAL_TREE,
    registryBlobSha: process.env.SENA_REPAIR_INITIAL_REGISTRY_BLOB,
    verifierBlobSha: process.env.SENA_REPAIR_INITIAL_VERIFIER_BLOB,
    governanceTestBlobSha: process.env.SENA_REPAIR_INITIAL_TEST_BLOB,
    buildRunId: Number(process.env.SENA_REPAIR_INITIAL_BUILD_RUN_ID),
    repositorySecurityRunIds: commaSeparatedPositiveIntegers(
      process.env.SENA_REPAIR_INITIAL_REPOSITORY_SECURITY_RUN_IDS
    ),
    checkJobIds: commaSeparatedPositiveIntegers(process.env.SENA_REPAIR_INITIAL_CHECK_JOB_IDS),
    requiredChecksPassed:
      process.env.SENA_REPAIR_INITIAL_REQUIRED_CHECKS_PASSED === "true",
    annotationsEmpty: process.env.SENA_REPAIR_INITIAL_ANNOTATIONS_EMPTY === "true",
    specReviewApproved: process.env.SENA_REPAIR_INITIAL_SPEC_REVIEW_APPROVED === "true",
    qualityReviewApproved: process.env.SENA_REPAIR_INITIAL_QUALITY_REVIEW_APPROVED === "true"
  };
}

export function assertProtectedCurrentnessRepairIndexPaths(lifecycle, paths) {
  if (!Array.isArray(paths)) {
    throw new Error("rule=protected-currentness-repair-index-path-set-mismatch");
  }
  if (!lifecycle && paths.length === 0) return true;
  const expected = lifecycle?.status === PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS
    ? PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE
    : lifecycle?.status === PROTECTED_CURRENTNESS_REPAIR_CORRECTION_STATUS
      ? PROTECTED_CURRENTNESS_REPAIR_IMPLEMENTATION_SCOPE
    : lifecycle?.status === PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS
      ? PROTECTED_CURRENTNESS_REPAIR_FINAL_SCOPE
      : null;
  if (!expected || !sameJson(paths, expected)) {
    throw new Error("rule=protected-currentness-repair-index-path-set-mismatch");
  }
  return true;
}

export function validateProtectedCurrentnessRepairIndexTransition(candidateRegistry) {
  const branchResult = git(["symbolic-ref", "--quiet", "--short", "HEAD"], {
    allowFailure: true
  });
  if (
    branchResult.status !== 0 ||
    String(branchResult.stdout).trim() !== PROTECTED_CURRENTNESS_REPAIR_BRANCH
  ) {
    return;
  }
  const staged = stagedChangedPaths();
  if (staged.length === 0) return;
  const lifecycle = protectedCurrentnessRepairWorkItem(candidateRegistry)
    ?.protectedCurrentnessActivationRepairLifecycle;
  assertProtectedCurrentnessRepairIndexPaths(lifecycle, staged);
  const headSha = gitText(["rev-parse", "HEAD"]).trim();
  const sourceRegistry = loadRegistryFromCommit(headSha).parsed;
  const sourceHasEvidenceFlow = Boolean(
    evidenceFlowCurrentnessWorkItem(sourceRegistry)?.[
      EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_KEY
    ]
  );
  const candidateHasEvidenceFlow = Boolean(
    evidenceFlowCurrentnessWorkItem(candidateRegistry)?.[
      EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_KEY
    ]
  );
  if (candidateHasEvidenceFlow) {
    assertEvidenceFlowCurrentnessLifecycleIndexBlobs(candidateRegistry);
  }
  if (candidateHasEvidenceFlow && !sourceHasEvidenceFlow) {
    if (headSha !== EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA) {
      throw new Error("rule=evidenceflow-currentness-index-source-head-mismatch");
    }
    validateEvidenceFlowCurrentnessLifecycleTransition(
      sourceRegistry,
      candidateRegistry
    );
    const sourceRepairLifecycle = protectedCurrentnessRepairWorkItem(sourceRegistry)
      ?.protectedCurrentnessActivationRepairLifecycle;
    if (!sameJson(sourceRepairLifecycle, lifecycle)) {
      throw new Error("rule=protected-currentness-repair-transition-source-invalid");
    }
    return;
  }
  if (sourceHasEvidenceFlow) {
    if (!candidateHasEvidenceFlow) {
      throw new Error("rule=evidenceflow-currentness-snapshot-invalid");
    }
    validateEvidenceFlowCurrentnessLifecycleSnapshot(sourceRegistry);
    validateEvidenceFlowCurrentnessLifecycleSnapshot(candidateRegistry);
    const sourceHasTask77Pr82PushCorrection = Boolean(
      task77Pr82WorkItem(sourceRegistry)?.[
        TASK77_PR82_PUSH_CORRECTION_LIFECYCLE_KEY
      ]
    );
    const candidateHasTask77Pr82PushCorrection = Boolean(
      task77Pr82WorkItem(candidateRegistry)?.[
        TASK77_PR82_PUSH_CORRECTION_LIFECYCLE_KEY
      ]
    );
    if (candidateHasTask77Pr82PushCorrection && !sourceHasTask77Pr82PushCorrection) {
      if (headSha !== TASK77_PR82_PUSH_CORRECTION_SOURCE_HEAD_SHA) {
        throw new Error("rule=task7.7-pr82-push-currentness-source-head-mismatch");
      }
      validateTask77Pr82PushCurrentnessCorrection(
        sourceRegistry,
        candidateRegistry
      );
      return;
    }
    if (sourceHasTask77Pr82PushCorrection && !candidateHasTask77Pr82PushCorrection) {
      throw new Error("rule=task7.7-pr82-push-currentness-snapshot-invalid");
    }
    const sourceHasTask78Compatibility = Boolean(
      task77Pr82WorkItem(sourceRegistry)?.[
        TASK78_FINAL_COMPATIBILITY_LIFECYCLE_KEY
      ]
    );
    const candidateHasTask78Compatibility = Boolean(
      task77Pr82WorkItem(candidateRegistry)?.[
        TASK78_FINAL_COMPATIBILITY_LIFECYCLE_KEY
      ]
    );
    if (candidateHasTask78Compatibility && !sourceHasTask78Compatibility) {
      if (headSha !== TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA) {
        throw new Error("rule=task7.8-final-compatibility-source-head-mismatch");
      }
      validateTask78FinalCompatibilityTransition(
        sourceRegistry,
        candidateRegistry
      );
      return;
    }
    if (sourceHasTask78Compatibility && !candidateHasTask78Compatibility) {
      throw new Error("rule=task7.8-final-compatibility-snapshot-invalid");
    }
    const sourceHasTask79Compatibility = Boolean(
      task77Pr82WorkItem(sourceRegistry)?.[
        TASK79_TEST_PHASE_COMPATIBILITY_LIFECYCLE_KEY
      ]
    );
    const candidateHasTask79Compatibility = Boolean(
      task77Pr82WorkItem(candidateRegistry)?.[
        TASK79_TEST_PHASE_COMPATIBILITY_LIFECYCLE_KEY
      ]
    );
    if (candidateHasTask79Compatibility && !sourceHasTask79Compatibility) {
      if (headSha !== TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA) {
        throw new Error("rule=task7.9-test-phase-compatibility-source-head-mismatch");
      }
      validateTask79TestPhaseCompatibilityTransition(
        sourceRegistry,
        candidateRegistry
      );
      return;
    }
    if (sourceHasTask79Compatibility && !candidateHasTask79Compatibility) {
      throw new Error("rule=task7.9-test-phase-compatibility-snapshot-invalid");
    }
  }
  protectedCurrentnessRepairLifecycleResolutionFromRegistries(
    sourceRegistry,
    candidateRegistry,
    protectedCurrentnessRepairObservationContextFromEnvironment(headSha)
  );
}

const EVIDENCE_FLOW_CURRENTNESS_TASK_ID = "SENA-EVIDENCEFLOW-V1-20260828";
const EVIDENCE_FLOW_CURRENTNESS_BRANCH = "codex/sena-evidenceflow-v1-20260828";
const EVIDENCE_FLOW_CURRENTNESS_OWNER_KEY = "Codex-evidenceflow-01a04273";
const EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_KEY =
  "evidenceFlowAdditiveCurrentnessLifecycle";
const EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_STATUS =
  "evidenceflow-additive-currentness-observation-recorded";
const EVIDENCE_FLOW_CURRENTNESS_RECEIPT_KIND =
  "evidenceflow-additive-currentness-observation";
const TASK77_COMBINED_CURRENTNESS_LIFECYCLE_KEY =
  "task7_7CombinedCurrentnessLifecycle";
const TASK77_COMBINED_CURRENTNESS_STATUS =
  "task7.7-combined-currentness-candidate";
const TASK77_COMBINED_CURRENTNESS_RECEIPT_KIND =
  "task7.7-combined-currentness-candidate";
const TASK77_PR82_PUSH_CORRECTION_LIFECYCLE_KEY =
  "task7_7Pr82PushCurrentnessCorrectionLifecycle";
const TASK77_PR82_PUSH_CORRECTION_STATUS =
  "task7.7-pr82-push-currentness-correction";
const TASK77_PR82_PUSH_CORRECTION_RECEIPT_KIND =
  "task7.7-pr82-push-currentness-correction";
const TASK77_PR82_PUSH_CORRECTION_SOURCE_HEAD_SHA =
  "a647817893abbee246fca31830328f74dcbaf317";
const TASK77_PR82_PUSH_CORRECTION_SOURCE_TREE_SHA =
  "cfa48cb0914111a7eb6246dd315b8576abb76c62";
const TASK77_PR82_PUSH_CORRECTION_SOURCE_REGISTRY_BLOB_SHA =
  "018232d34c2dbb2f7bdd70947076f85e6d2e56b5";
const TASK77_PR82_PUSH_CORRECTION_SOURCE_VERIFIER_BLOB_SHA =
  "e7db44d8e8e906f3a182a03d56210715d46a3a67";
const TASK77_PR82_PUSH_CORRECTION_SOURCE_TEST_BLOB_SHA =
  "7aca5bc094645e71a892b1417476554ea2faf4a3";
const TASK77_PR82_PUSH_CORRECTION_SOURCE_RECEIPT_COUNT = 44;
const TASK77_PR82_PUSH_CORRECTION_SOURCE_RECEIPT_SHA256 =
  "828c968ed0fd6e0d67fb7562ec5cf0cbbc493c8913fa229e1a3adae3b716f980";
const TASK77_PR82_PUSH_CORRECTION_OBSERVED_AT = "2026-09-02T11:40:00Z";
const TASK77_PR82_PUSH_CORRECTION_NEXT_REVIEW_AT = "2026-09-03T11:40:00Z";
const TASK78_FINAL_COMPATIBILITY_LIFECYCLE_KEY =
  "task7_8FinalCompatibilityLifecycle";
const TASK78_FINAL_COMPATIBILITY_STATUS =
  "task7.8-final-compatibility-currentness-candidate";
const TASK78_FINAL_COMPATIBILITY_RECEIPT_KIND =
  "task7.8-final-compatibility-currentness-candidate";
const TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA =
  "1d0bb424879a9db7c9ef23211c046e50f5eb3f6c";
const TASK78_FINAL_COMPATIBILITY_SOURCE_TREE_SHA =
  "4e8043d8f190e24f1c4bf293d0c9eb307f7625dc";
const TASK78_FINAL_COMPATIBILITY_SOURCE_REGISTRY_BLOB_SHA =
  "b3631f678f1011e1377d1bc00b964f36a5d13e1a";
const TASK78_FINAL_COMPATIBILITY_SOURCE_VERIFIER_BLOB_SHA =
  "5de993c3a5b1dff898e16a784e8a11ef3f1ee0ed";
const TASK78_FINAL_COMPATIBILITY_SOURCE_TEST_BLOB_SHA =
  "d7c37298ca875e727c599f3d2da49d52dafa1332";
const TASK78_FINAL_COMPATIBILITY_SOURCE_RECEIPT_COUNT = 45;
const TASK78_FINAL_COMPATIBILITY_SOURCE_RECEIPT_SHA256 =
  "c6d877c35fdff82e7a5627f7af14abac3ce103903238113757fc9750d5fbf27e";
const TASK78_FINAL_COMPATIBILITY_OBSERVED_AT = "2026-09-02T12:36:00Z";
const TASK78_FINAL_COMPATIBILITY_NEXT_REVIEW_AT = "2026-09-03T12:36:00Z";
const TASK79_TEST_PHASE_COMPATIBILITY_LIFECYCLE_KEY =
  "task7_9TestPhaseCompatibilityLifecycle";
const TASK79_TEST_PHASE_COMPATIBILITY_STATUS =
  "task7.9-test-phase-compatibility-currentness-candidate";
const TASK79_TEST_PHASE_COMPATIBILITY_RECEIPT_KIND =
  "task7.9-test-phase-compatibility-currentness-candidate";
const TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA =
  "203dd6d6a3728c741a0e187df971b6a5c22ea428";
const TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_TREE_SHA =
  "91fabc2c5c2bea40b5165a29ea49445686ce50cb";
const TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_REGISTRY_BLOB_SHA =
  "b35d644b29dfd32910bf4f1620a65b1c205bbc03";
const TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_VERIFIER_BLOB_SHA =
  "6780e22ff45138bdcff0335ba69e1b9e44ea3031";
const TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_TEST_BLOB_SHA =
  "4a4dc67e3c97255c69a68fb218db7b106a892417";
const TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_RECEIPT_COUNT = 46;
const TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_RECEIPT_SHA256 =
  "ab2ced81062e8ac4b24fe296398fae62f93473ff783b4df8a926d22d3ccc7a07";
const TASK79_TEST_PHASE_COMPATIBILITY_OBSERVED_AT = "2026-09-02T14:05:03Z";
const TASK79_TEST_PHASE_COMPATIBILITY_NEXT_REVIEW_AT = "2026-09-03T14:05:03Z";
const TASK77_COMBINED_CURRENTNESS_OBSERVED_AT = "2026-09-02T10:42:00Z";
const TASK77_COMBINED_CURRENTNESS_NEXT_REVIEW_AT = "2026-09-03T10:42:00Z";
const EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA =
  "44a814721831bd369be34794eb3e13ad459d4b30";
const EVIDENCE_FLOW_CURRENTNESS_SOURCE_TREE_SHA =
  "998b6342c4e0fb4d527a68cd42610c994bcb29d2";
const EVIDENCE_FLOW_CURRENTNESS_SOURCE_REGISTRY_BLOB_SHA =
  "9dda7977d067378bdb5ba40427039ce77f2d7f19";
const EVIDENCE_FLOW_CURRENTNESS_SOURCE_VERIFIER_BLOB_SHA =
  "5ef613dfff43b36eeeacf323e359a1897ded3f83";
const EVIDENCE_FLOW_CURRENTNESS_SOURCE_GOVERNANCE_TEST_BLOB_SHA =
  "154b283a351726fe3217cf75c50e7637e91bc1a5";
const EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_COUNT = 42;
const EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_PREFIX_SHA256 =
  "276f6581fdf0a8e84f60b39be74160fc7d0358f1ef395f4c375faf39517ed885";
const EVIDENCE_FLOW_CURRENTNESS_AUTHORIZATION_SENTENCE =
  "授权 Task7.6 EvidenceFlow 加法式当前性修复生命周期。";
const EVIDENCE_FLOW_CURRENTNESS_AUTHORIZATION_SHA256 =
  "3d55f9909e6064f9bcf0d4660bde88b3579b900d6cd9cf2aac70e959dea1edb8";
const EVIDENCE_FLOW_CURRENTNESS_OBSERVED_AT = "2026-09-02T08:14:52Z";
const EVIDENCE_FLOW_CURRENTNESS_NEXT_REVIEW_AT = "2026-09-03T08:14:52Z";
const EVIDENCE_FLOW_CURRENTNESS_CANDIDATE_PATHS = [
  REGISTRY_REPO_PATH,
  "scripts/verify-sena-repo-governance.mjs",
  "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
];
const EVIDENCE_FLOW_CURRENTNESS_SOURCE_BINDING_KEYS = [
  "headSha",
  "treeSha",
  "registryBlobSha",
  "verifierBlobSha",
  "governanceTestBlobSha",
  "receiptPrefix"
];
const EVIDENCE_FLOW_CURRENTNESS_AUTHORIZATION_BOUNDARY_KEYS = [
  "candidateCommitAuthorized",
  "candidatePushAuthorized",
  "pr38ReadyAuthorized",
  "pr38MergeAuthorized",
  "pr46MutationAuthorized",
  "pr82MutationAuthorized",
  "cleanupAuthorized",
  "localRefRetirementAuthorized",
  "retirementReceiptMintingAuthorized",
  "branchDeletionAuthorized",
  "worktreeRemovalAuthorized",
  "orphanWorktreeMutationAuthorized",
  "targetRefMutationAuthorized",
  "targetTagMutationAuthorized",
  "quarantineMutationAuthorized",
  "deploymentAuthorized",
  "providerMutationAuthorized",
  "resetAuthorized",
  "rebaseAuthorized",
  "stashAuthorized",
  "forceAuthorized",
  "historyRewriteAuthorized",
  "futureTask8Authorized"
];
const EVIDENCE_FLOW_CURRENTNESS_AUTHORIZATION_KEYS = [
  "mode",
  "status",
  "exactSentence",
  "exactSentenceSha256",
  "requiredCandidatePaths",
  "authorizedWorkItemTaskId",
  "authorizedBranch",
  "observerHeartbeatMode",
  "authorizationBoundary"
];
const EVIDENCE_FLOW_CURRENTNESS_OBSERVATION_KEYS = [
  "observedAt",
  "nextReviewAt",
  "baseRef",
  "localHeadSha",
  "localTreeSha",
  "protectedMainSha",
  "ahead",
  "behind",
  "stagedPathCount",
  "unstagedTrackedPathCount",
  "untrackedPathCount",
  "totalChangedPathCount",
  "allowedPathViolationCount",
  "statusPorcelainV1Sha256",
  "fullDiffSha256",
  "cachedRemoteHeadSha",
  "liveRemoteHeadSha",
  "pullRequestNumber",
  "pullRequestHeadSha",
  "pullRequestState",
  "pullRequestIsDraft",
  "pullRequestReadyForReview",
  "pullRequestMergeable",
  "pullRequestMergeStateStatus",
  "pullRequestMergeAuthorized",
  "lockCount",
  "activeProcessCount",
  "cwdHandleCount"
];
const EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_KEYS = [
  "status",
  "mode",
  "sourceBinding",
  "authorization",
  "observation",
  "authorizationBoundary"
];
const EVIDENCE_FLOW_CURRENTNESS_RECEIPT_KEYS = [
  "schemaVersion",
  "receiptKind",
  "taskId",
  "ownerKey",
  "scope",
  "sourceBinding",
  "authorization",
  "observation",
  "authorizationBoundary"
];
const EVIDENCE_FLOW_CURRENTNESS_RECEIPT_BOUNDARY_KEYS = [
  "evidenceFlowCurrentnessObservationRecorded",
  ...EVIDENCE_FLOW_CURRENTNESS_AUTHORIZATION_BOUNDARY_KEYS
];
const TASK77_COMBINED_CURRENTNESS_AUTHORIZATION_BOUNDARY_KEYS = [
  "candidateCommitAuthorizedAfterGates",
  "candidatePushToDraftPr82AuthorizedAfterGates",
  "pr82ReadyAuthorized",
  "pr82MergeAuthorized",
  "pr46MutationAuthorized",
  "localRefRetirementAuthorized",
  "retirementReceiptMintingAuthorized",
  "branchDeletionAuthorized",
  "worktreeRemovalAuthorized",
  "targetRefMutationAuthorized",
  "targetTagMutationAuthorized",
  "quarantineMutationAuthorized",
  "deploymentAuthorized",
  "providerMutationAuthorized",
  "resetAuthorized",
  "rebaseAuthorized",
  "stashAuthorized",
  "forceAuthorized",
  "historyRewriteAuthorized"
];
const TASK77_COMBINED_CURRENTNESS_AUTHORIZATION_KEYS = [
  "mode",
  "status",
  "sourceThreadId",
  "targetThreadId",
  "requiredCandidatePaths",
  "authorizedWorkItemTaskId",
  "authorizedBranch",
  "ownerHeartbeatMode",
  "authorizationBoundary"
];
const TASK77_COMBINED_CURRENTNESS_OBSERVATION_KEYS = [
  "observedAt",
  "nextReviewAt",
  "baseRef",
  "localHeadSha",
  "remoteHeadSha",
  "protectedMainSha",
  "ahead",
  "behind",
  "stagedPathCount",
  "unstagedPathCount",
  "untrackedPathCount",
  "statusPorcelainV1Sha256",
  "pullRequestNumber",
  "pullRequestHeadSha",
  "pullRequestState",
  "pullRequestIsDraft",
  "pullRequestMergeable",
  "pullRequestMergeStateStatus",
  "remoteSameNameHeadCount",
  "ordinaryArchiveBundleSha256",
  "exactLedgerBundleCount",
  "exactLedgerOwnerOnlyCount",
  "exactLedgerCompleteHistoryVerifiedCount",
  "activeProcessCount",
  "cwdHandleCount"
];
const TASK77_COMBINED_CURRENTNESS_LIFECYCLE_KEYS = [
  "status",
  "mode",
  "authorization",
  "observation",
  "authorizationBoundary"
];
const TASK77_COMBINED_CURRENTNESS_RECEIPT_KEYS = [
  "schemaVersion",
  "receiptKind",
  "taskId",
  "ownerKey",
  "scope",
  "authorization",
  "observation",
  "authorizationBoundary"
];
const TASK77_PR82_PUSH_CORRECTION_SOURCE_BINDING_KEYS = [
  "headSha",
  "treeSha",
  "registryBlobSha",
  "verifierBlobSha",
  "governanceTestBlobSha",
  "receiptPrefix"
];
const TASK77_PR82_PUSH_CORRECTION_OBSERVATION_KEYS = [
  "observedAt",
  "nextReviewAt",
  "protectedMainSha",
  "sourceCandidateHeadSha",
  "observedRemoteHeadSha",
  "pullRequestNumber",
  "pullRequestHeadSha",
  "pullRequestState",
  "pullRequestIsDraft",
  "pullRequestMergeable",
  "pullRequestMergeStateStatus",
  "sourceAhead",
  "sourceBehind",
  "remoteAhead",
  "remoteBehind"
];
const TASK77_PR82_PUSH_CORRECTION_LIFECYCLE_KEYS = [
  "status",
  "mode",
  "sourceBinding",
  "observation",
  "authorizationBoundary"
];
const TASK77_PR82_PUSH_CORRECTION_RECEIPT_KEYS = [
  "schemaVersion",
  "receiptKind",
  "taskId",
  "ownerKey",
  "scope",
  "sourceBinding",
  "observation",
  "authorizationBoundary"
];
const TASK78_FINAL_COMPATIBILITY_AUTHORIZATION_BOUNDARY_KEYS = [
  "candidateCommitAuthorizedAfterGates",
  "candidatePushToDraftPr82AuthorizedAfterGates",
  "pr82ReadyAuthorized",
  "pr82MergeAuthorized",
  "pr46MutationAuthorized",
  "localRefRetirementAuthorized",
  "retirementReceiptMintingAuthorized",
  "branchDeletionAuthorized",
  "worktreeRemovalAuthorized",
  "orphanWorktreeMutationAuthorized",
  "targetRefMutationAuthorized",
  "targetTagMutationAuthorized",
  "quarantineMutationAuthorized",
  "deploymentAuthorized",
  "providerMutationAuthorized",
  "resetAuthorized",
  "rebaseAuthorized",
  "stashAuthorized",
  "forceAuthorized",
  "historyRewriteAuthorized"
];
const EVIDENCE_FLOW_CURRENTNESS_DIRTY_STATE =
  "unstaged-bounded-76-tracked-10-untracked-currentness-observed-against-protected-main-969a206";
const EVIDENCE_FLOW_CURRENTNESS_LOCAL_EVIDENCE =
  "local EvidenceFlow owner head remains exact 434a1aac with tree 66d9867; against protected main 969a206 it is ahead 16/behind 82; staged 0, unstaged tracked 76, untracked 10, total changed 86, allowed-path violations 0; exact git status --porcelain=v1 SHA-256 037d4727 and git diff --binary HEAD -- . SHA-256 e6c725cf; observer currentness does not refresh the owner heartbeat";
const EVIDENCE_FLOW_CURRENTNESS_MERGED_EVIDENCE =
  "EvidenceFlow remains unmerged; Draft PR38 remote and PR head remain exact 40438885 while local owner head remains exact 434a1aac plus 76 tracked and 10 untracked bounded paths; against protected main 969a206 it is ahead 16/behind 82; no candidate commit/push/Ready/merge is authorized";
const EVIDENCE_FLOW_CURRENTNESS_LIVE_EVIDENCE =
  "the 2026-09-02T08:14:52Z observation binds protected main 969a206, local head/tree 434a1aac/66d9867, cached/live remote and Draft PR38 head 40438885, PR38 OPEN/Draft/MERGEABLE/BEHIND, status 037d4727, diff e6c725cf, counts 0 staged/76 unstaged tracked/10 untracked/0 allowlist violations, and zero locks/process/cwd handles; product files and owner heartbeats remain untouched";
const EVIDENCE_FLOW_CURRENTNESS_BRANCH_CLOSEOUT =
  "Draft PR38 cached/live remote and PR head remain exact 40438885; local owner head/tree remain exact 434a1aac/66d9867 against protected main 969a206, ahead 16/behind 82, plus 76 unstaged tracked and 10 untracked bounded paths with full diff e6c725cf and status 037d4727. PR38 remains OPEN/Draft/MERGEABLE/BEHIND and candidate commit/push/Ready/merge remain false; this observer currentness does not refresh the owner heartbeat";
function evidenceFlowCurrentnessWorkItem(registry) {
  return (registry?.workItems ?? []).find(
    (entry) => entry?.taskId === EVIDENCE_FLOW_CURRENTNESS_TASK_ID
  );
}

function evidenceFlowCurrentnessBranch(registry) {
  return (registry?.branches ?? []).find(
    (entry) => entry?.name === EVIDENCE_FLOW_CURRENTNESS_BRANCH
  );
}

function task77BranchRetirementWorkItem(registry) {
  return (registry?.workItems ?? []).find(
    (entry) => entry?.taskId === "SENA-BRANCH-RETIREMENT-20260829"
  );
}

function task77BranchRetirementBranch(registry) {
  return (registry?.branches ?? []).find(
    (entry) => entry?.name === "codex/sena-branch-retirement-20260829"
  );
}

function task77Pr82WorkItem(registry) {
  return (registry?.workItems ?? []).find(
    (entry) => entry?.taskId === PROTECTED_CURRENTNESS_REPAIR_TASK_ID
  );
}

function task77Pr82Branch(registry) {
  return (registry?.branches ?? []).find(
    (entry) => entry?.name === PROTECTED_CURRENTNESS_REPAIR_BRANCH
  );
}

function task77CombinedCurrentnessCarrierItem(registry) {
  return evidenceFlowCurrentnessWorkItem(registry);
}

function evidenceFlowCurrentnessClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function evidenceFlowCurrentnessSourceBinding() {
  return {
    headSha: EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA,
    treeSha: EVIDENCE_FLOW_CURRENTNESS_SOURCE_TREE_SHA,
    registryBlobSha: EVIDENCE_FLOW_CURRENTNESS_SOURCE_REGISTRY_BLOB_SHA,
    verifierBlobSha: EVIDENCE_FLOW_CURRENTNESS_SOURCE_VERIFIER_BLOB_SHA,
    governanceTestBlobSha: EVIDENCE_FLOW_CURRENTNESS_SOURCE_GOVERNANCE_TEST_BLOB_SHA,
    receiptPrefix: {
      count: EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_COUNT,
      sha256: EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_PREFIX_SHA256
    }
  };
}

function evidenceFlowCurrentnessAuthorizationBoundary() {
  return Object.fromEntries(
    EVIDENCE_FLOW_CURRENTNESS_AUTHORIZATION_BOUNDARY_KEYS.map((key) => [key, false])
  );
}

function evidenceFlowCurrentnessAuthorization() {
  return {
    mode: "explicit-owner-conversation-authorization",
    status: "consumed-by-exact-evidenceflow-additive-currentness-candidate",
    exactSentence: EVIDENCE_FLOW_CURRENTNESS_AUTHORIZATION_SENTENCE,
    exactSentenceSha256: EVIDENCE_FLOW_CURRENTNESS_AUTHORIZATION_SHA256,
    requiredCandidatePaths: [...EVIDENCE_FLOW_CURRENTNESS_CANDIDATE_PATHS],
    authorizedWorkItemTaskId: EVIDENCE_FLOW_CURRENTNESS_TASK_ID,
    authorizedBranch: EVIDENCE_FLOW_CURRENTNESS_BRANCH,
    observerHeartbeatMode: "observation-only-owner-heartbeats-byte-identical",
    authorizationBoundary: evidenceFlowCurrentnessAuthorizationBoundary()
  };
}

function evidenceFlowCurrentnessObservation() {
  return {
    observedAt: EVIDENCE_FLOW_CURRENTNESS_OBSERVED_AT,
    nextReviewAt: EVIDENCE_FLOW_CURRENTNESS_NEXT_REVIEW_AT,
    baseRef: "origin/main",
    localHeadSha: "434a1aac542e60e793afef77fb35104cdb470d53",
    localTreeSha: "66d986701619acc9281e61c7d62bbafd924981f1",
    protectedMainSha: "969a206b798c159e15ae0b6e5c76d0c94cca92ea",
    ahead: 16,
    behind: 82,
    stagedPathCount: 0,
    unstagedTrackedPathCount: 76,
    untrackedPathCount: 10,
    totalChangedPathCount: 86,
    allowedPathViolationCount: 0,
    statusPorcelainV1Sha256:
      "037d472704beb72408363f5b81bfe5be132405e5fc74edae9047dfdf265c708b",
    fullDiffSha256:
      "e6c725cfe31c8c30a6e0798de5ca2c4e2d343225085552224887d58b65ffa8c1",
    cachedRemoteHeadSha: "40438885c422fd559ce9edcf2ac01a867e56bdd3",
    liveRemoteHeadSha: "40438885c422fd559ce9edcf2ac01a867e56bdd3",
    pullRequestNumber: 38,
    pullRequestHeadSha: "40438885c422fd559ce9edcf2ac01a867e56bdd3",
    pullRequestState: "OPEN",
    pullRequestIsDraft: true,
    pullRequestReadyForReview: false,
    pullRequestMergeable: "MERGEABLE",
    pullRequestMergeStateStatus: "BEHIND",
    pullRequestMergeAuthorized: false,
    lockCount: 0,
    activeProcessCount: 0,
    cwdHandleCount: 0
  };
}

function evidenceFlowCurrentnessLifecycle() {
  return {
    status: EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_STATUS,
    mode: "strict-additive-observation-only",
    sourceBinding: evidenceFlowCurrentnessSourceBinding(),
    authorization: evidenceFlowCurrentnessAuthorization(),
    observation: evidenceFlowCurrentnessObservation(),
    authorizationBoundary: evidenceFlowCurrentnessAuthorizationBoundary()
  };
}

function evidenceFlowCurrentnessReceipt() {
  return {
    schemaVersion: "sena-registry-reconciliation-receipt/v1",
    receiptKind: EVIDENCE_FLOW_CURRENTNESS_RECEIPT_KIND,
    taskId: EVIDENCE_FLOW_CURRENTNESS_TASK_ID,
    ownerKey: EVIDENCE_FLOW_CURRENTNESS_OWNER_KEY,
    scope: [...EVIDENCE_FLOW_CURRENTNESS_CANDIDATE_PATHS],
    sourceBinding: evidenceFlowCurrentnessSourceBinding(),
    authorization: evidenceFlowCurrentnessAuthorization(),
    observation: evidenceFlowCurrentnessObservation(),
    authorizationBoundary: {
      evidenceFlowCurrentnessObservationRecorded: true,
      ...evidenceFlowCurrentnessAuthorizationBoundary()
    }
  };
}

function task77CombinedCurrentnessAuthorizationBoundary() {
  return Object.fromEntries(
    TASK77_COMBINED_CURRENTNESS_AUTHORIZATION_BOUNDARY_KEYS.map((key) => [
      key,
      key === "candidateCommitAuthorizedAfterGates" ||
        key === "candidatePushToDraftPr82AuthorizedAfterGates"
    ])
  );
}

function task77CombinedCurrentnessAuthorization() {
  return {
    mode: "cross-task-user-continuation-authorization",
    status: "consumed-by-exact-task7.7-combined-currentness-candidate",
    sourceThreadId: "01a0414a-a4a5-7051-ba59-34b7b4d1aee3",
    targetThreadId: "01a04916-4ba7-7c11-8fee-7760f7bb3659",
    requiredCandidatePaths: [...EVIDENCE_FLOW_CURRENTNESS_CANDIDATE_PATHS],
    authorizedWorkItemTaskId: "SENA-BRANCH-RETIREMENT-20260829",
    authorizedBranch: "codex/sena-branch-retirement-20260829",
    ownerHeartbeatMode: "task-owner-currentness-without-ref-mutation",
    authorizationBoundary: task77CombinedCurrentnessAuthorizationBoundary()
  };
}

function task77CombinedCurrentnessObservation() {
  return {
    observedAt: TASK77_COMBINED_CURRENTNESS_OBSERVED_AT,
    nextReviewAt: TASK77_COMBINED_CURRENTNESS_NEXT_REVIEW_AT,
    baseRef: "origin/main",
    localHeadSha: "e24c635d1f53fccb2264c6be002aec2775de127c",
    remoteHeadSha: "e24c635d1f53fccb2264c6be002aec2775de127c",
    protectedMainSha: "969a206b798c159e15ae0b6e5c76d0c94cca92ea",
    ahead: 8,
    behind: 8,
    stagedPathCount: 0,
    unstagedPathCount: 0,
    untrackedPathCount: 0,
    statusPorcelainV1Sha256:
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    pullRequestNumber: 46,
    pullRequestHeadSha: "e24c635d1f53fccb2264c6be002aec2775de127c",
    pullRequestState: "OPEN",
    pullRequestIsDraft: true,
    pullRequestMergeable: "CONFLICTING",
    pullRequestMergeStateStatus: "DIRTY",
    remoteSameNameHeadCount: 0,
    ordinaryArchiveBundleSha256:
      "ada86c0801288d366533422fd887f7afaa502693ea1776ac5b7888e030fb8d51",
    exactLedgerBundleCount: 8,
    exactLedgerOwnerOnlyCount: 8,
    exactLedgerCompleteHistoryVerifiedCount: 8,
    activeProcessCount: 0,
    cwdHandleCount: 0
  };
}

function task77CombinedCurrentnessLifecycle() {
  return {
    status: TASK77_COMBINED_CURRENTNESS_STATUS,
    mode: "branch-retirement-owner-currentness-plus-evidenceflow-observation",
    authorization: task77CombinedCurrentnessAuthorization(),
    observation: task77CombinedCurrentnessObservation(),
    authorizationBoundary: task77CombinedCurrentnessAuthorizationBoundary()
  };
}

function task77CombinedCurrentnessReceipt() {
  return {
    schemaVersion: "sena-registry-reconciliation-receipt/v1",
    receiptKind: TASK77_COMBINED_CURRENTNESS_RECEIPT_KIND,
    taskId: "SENA-BRANCH-RETIREMENT-20260829",
    ownerKey: "Codex-branch-retirement-01a04916",
    scope: [...EVIDENCE_FLOW_CURRENTNESS_CANDIDATE_PATHS],
    authorization: task77CombinedCurrentnessAuthorization(),
    observation: task77CombinedCurrentnessObservation(),
    authorizationBoundary: task77CombinedCurrentnessAuthorizationBoundary()
  };
}

function task77Pr82PushCorrectionSourceBinding() {
  return {
    headSha: TASK77_PR82_PUSH_CORRECTION_SOURCE_HEAD_SHA,
    treeSha: TASK77_PR82_PUSH_CORRECTION_SOURCE_TREE_SHA,
    registryBlobSha: TASK77_PR82_PUSH_CORRECTION_SOURCE_REGISTRY_BLOB_SHA,
    verifierBlobSha: TASK77_PR82_PUSH_CORRECTION_SOURCE_VERIFIER_BLOB_SHA,
    governanceTestBlobSha: TASK77_PR82_PUSH_CORRECTION_SOURCE_TEST_BLOB_SHA,
    receiptPrefix: {
      count: TASK77_PR82_PUSH_CORRECTION_SOURCE_RECEIPT_COUNT,
      sha256: TASK77_PR82_PUSH_CORRECTION_SOURCE_RECEIPT_SHA256
    }
  };
}

function task77Pr82PushCorrectionObservation() {
  return {
    observedAt: TASK77_PR82_PUSH_CORRECTION_OBSERVED_AT,
    nextReviewAt: TASK77_PR82_PUSH_CORRECTION_NEXT_REVIEW_AT,
    protectedMainSha: "969a206b798c159e15ae0b6e5c76d0c94cca92ea",
    sourceCandidateHeadSha: TASK77_PR82_PUSH_CORRECTION_SOURCE_HEAD_SHA,
    observedRemoteHeadSha: EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA,
    pullRequestNumber: 82,
    pullRequestHeadSha: EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA,
    pullRequestState: "OPEN",
    pullRequestIsDraft: true,
    pullRequestMergeable: "MERGEABLE",
    pullRequestMergeStateStatus: "CLEAN",
    sourceAhead: 8,
    sourceBehind: 0,
    remoteAhead: 7,
    remoteBehind: 0
  };
}

function task77Pr82PushCorrectionLifecycle() {
  return {
    status: TASK77_PR82_PUSH_CORRECTION_STATUS,
    mode: "strict-additive-pr82-remote-currentness-reconciliation",
    sourceBinding: task77Pr82PushCorrectionSourceBinding(),
    observation: task77Pr82PushCorrectionObservation(),
    authorizationBoundary: task77CombinedCurrentnessAuthorizationBoundary()
  };
}

function task77Pr82PushCorrectionReceipt() {
  return {
    schemaVersion: "sena-registry-reconciliation-receipt/v1",
    receiptKind: TASK77_PR82_PUSH_CORRECTION_RECEIPT_KIND,
    taskId: PROTECTED_CURRENTNESS_REPAIR_TASK_ID,
    ownerKey: PROTECTED_CURRENTNESS_REPAIR_OWNER_KEY,
    scope: [...EVIDENCE_FLOW_CURRENTNESS_CANDIDATE_PATHS],
    sourceBinding: task77Pr82PushCorrectionSourceBinding(),
    observation: task77Pr82PushCorrectionObservation(),
    authorizationBoundary: task77CombinedCurrentnessAuthorizationBoundary()
  };
}

function validateTask77Pr82PushCorrectionLifecycle(lifecycle) {
  assertEvidenceFlowCurrentnessOrderedKeys(
    lifecycle,
    TASK77_PR82_PUSH_CORRECTION_LIFECYCLE_KEYS,
    "rule=task7.7-pr82-push-currentness-lifecycle-invalid"
  );
  assertEvidenceFlowCurrentnessOrderedKeys(
    lifecycle.sourceBinding,
    TASK77_PR82_PUSH_CORRECTION_SOURCE_BINDING_KEYS,
    "rule=task7.7-pr82-push-currentness-lifecycle-invalid"
  );
  assertEvidenceFlowCurrentnessOrderedKeys(
    lifecycle.sourceBinding?.receiptPrefix,
    ["count", "sha256"],
    "rule=task7.7-pr82-push-currentness-lifecycle-invalid"
  );
  assertEvidenceFlowCurrentnessOrderedKeys(
    lifecycle.observation,
    TASK77_PR82_PUSH_CORRECTION_OBSERVATION_KEYS,
    "rule=task7.7-pr82-push-currentness-lifecycle-invalid"
  );
  assertEvidenceFlowCurrentnessOrderedKeys(
    lifecycle.authorizationBoundary,
    TASK77_COMBINED_CURRENTNESS_AUTHORIZATION_BOUNDARY_KEYS,
    "rule=task7.7-pr82-push-currentness-authorization-invalid"
  );
  if (!sameJson(lifecycle, task77Pr82PushCorrectionLifecycle())) {
    throw new Error("rule=task7.7-pr82-push-currentness-lifecycle-invalid");
  }
  return lifecycle;
}

function validateTask77Pr82PushCorrectionReceipt(receipt) {
  assertEvidenceFlowCurrentnessOrderedKeys(
    receipt,
    TASK77_PR82_PUSH_CORRECTION_RECEIPT_KEYS,
    "rule=task7.7-pr82-push-currentness-receipt-invalid"
  );
  if (!sameJson(receipt, task77Pr82PushCorrectionReceipt())) {
    throw new Error("rule=task7.7-pr82-push-currentness-receipt-invalid");
  }
  return receipt;
}

function task78FinalCompatibilityAuthorizationBoundary() {
  return Object.fromEntries(
    TASK78_FINAL_COMPATIBILITY_AUTHORIZATION_BOUNDARY_KEYS.map((key) => [
      key,
      key === "candidateCommitAuthorizedAfterGates" ||
        key === "candidatePushToDraftPr82AuthorizedAfterGates"
    ])
  );
}

function task78FinalCompatibilitySourceBinding() {
  return {
    headSha: TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA,
    treeSha: TASK78_FINAL_COMPATIBILITY_SOURCE_TREE_SHA,
    registryBlobSha: TASK78_FINAL_COMPATIBILITY_SOURCE_REGISTRY_BLOB_SHA,
    verifierBlobSha: TASK78_FINAL_COMPATIBILITY_SOURCE_VERIFIER_BLOB_SHA,
    governanceTestBlobSha: TASK78_FINAL_COMPATIBILITY_SOURCE_TEST_BLOB_SHA,
    receiptPrefix: {
      count: TASK78_FINAL_COMPATIBILITY_SOURCE_RECEIPT_COUNT,
      sha256: TASK78_FINAL_COMPATIBILITY_SOURCE_RECEIPT_SHA256
    }
  };
}

function task78FinalCompatibilityObservation() {
  return {
    observedAt: TASK78_FINAL_COMPATIBILITY_OBSERVED_AT,
    nextReviewAt: TASK78_FINAL_COMPATIBILITY_NEXT_REVIEW_AT,
    protectedMainSha: "969a206b798c159e15ae0b6e5c76d0c94cca92ea",
    sourceCandidateHeadSha: TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA,
    observedRemoteHeadSha: TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA,
    pullRequestNumber: 82,
    pullRequestHeadSha: TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA,
    pullRequestState: "OPEN",
    pullRequestIsDraft: true,
    pullRequestMergeable: "MERGEABLE",
    pullRequestMergeStateStatus: "CLEAN",
    sourceAhead: 9,
    sourceBehind: 0
  };
}

function task78FinalCompatibilityLifecycle() {
  return {
    status: TASK78_FINAL_COMPATIBILITY_STATUS,
    mode: "strict-additive-task8-final-transition-compatibility",
    sourceBinding: task78FinalCompatibilitySourceBinding(),
    observation: task78FinalCompatibilityObservation(),
    authorizationBoundary: task78FinalCompatibilityAuthorizationBoundary()
  };
}

function task78FinalCompatibilityReceipt() {
  return {
    schemaVersion: "sena-registry-reconciliation-receipt/v1",
    receiptKind: TASK78_FINAL_COMPATIBILITY_RECEIPT_KIND,
    taskId: PROTECTED_CURRENTNESS_REPAIR_TASK_ID,
    ownerKey: PROTECTED_CURRENTNESS_REPAIR_OWNER_KEY,
    scope: [...EVIDENCE_FLOW_CURRENTNESS_CANDIDATE_PATHS],
    sourceBinding: task78FinalCompatibilitySourceBinding(),
    observation: task78FinalCompatibilityObservation(),
    authorizationBoundary: task78FinalCompatibilityAuthorizationBoundary()
  };
}

function validateTask78FinalCompatibilityLifecycle(lifecycle) {
  if (!sameJson(lifecycle, task78FinalCompatibilityLifecycle())) {
    throw new Error("rule=task7.8-final-compatibility-lifecycle-invalid");
  }
  return lifecycle;
}

function validateTask78FinalCompatibilityReceipt(receipt) {
  if (!sameJson(receipt, task78FinalCompatibilityReceipt())) {
    throw new Error("rule=task7.8-final-compatibility-receipt-invalid");
  }
  return receipt;
}

function task79TestPhaseCompatibilityAuthorizationBoundary() {
  return {
    candidateCommitAuthorizedAfterGates: true,
    candidatePushToDraftPr82AuthorizedAfterGates: true,
    pr82ReadyAuthorized: false,
    pr82MergeAuthorized: false,
    pr46MutationAuthorized: false,
    casAuthorized: false,
    localRefRetirementAuthorized: false,
    retirementReceiptMintingAuthorized: false,
    branchDeletionAuthorized: false,
    worktreeRemovalAuthorized: false,
    orphanWorktreeMutationAuthorized: false,
    targetRefMutationAuthorized: false,
    targetTagMutationAuthorized: false,
    quarantineMutationAuthorized: false,
    deploymentAuthorized: false,
    providerMutationAuthorized: false,
    resetAuthorized: false,
    rebaseAuthorized: false,
    stashAuthorized: false,
    forceAuthorized: false,
    historyRewriteAuthorized: false
  };
}

function task79TestPhaseCompatibilitySourceBinding() {
  return {
    headSha: TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA,
    treeSha: TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_TREE_SHA,
    registryBlobSha: TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_REGISTRY_BLOB_SHA,
    verifierBlobSha: TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_VERIFIER_BLOB_SHA,
    governanceTestBlobSha: TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_TEST_BLOB_SHA,
    receiptPrefix: {
      count: TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_RECEIPT_COUNT,
      sha256: TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_RECEIPT_SHA256
    }
  };
}

function task79TestPhaseCompatibilitySourceCompletionEvidence() {
  return {
    governanceTestsPassed: 96,
    governanceTestsTotal: 96,
    typescriptPassed: true,
    registryPassed: true,
    liveIndexAuditStatus: "pass",
    liveIndexAuditErrors: [],
    liveIndexAuditOwnerBlockers: [],
    unreachableCommitCount: 0,
    writePolicyPassed: true,
    securityPassed: true,
    nativePreCommitPassed: true,
    localBuildPassed: true,
    buildRunId: 33637780735,
    repositorySecurityRunIds: [33637780721, 33637771373],
    checkJobIds: [100272878332, 100272878394, 100272849032],
    annotationsEmpty: true,
    specReviewApproved: true,
    qualityReviewApproved: true,
    securityReviewApproved: true
  };
}

function task79TestPhaseCompatibilityObservation() {
  return {
    observedAt: TASK79_TEST_PHASE_COMPATIBILITY_OBSERVED_AT,
    nextReviewAt: TASK79_TEST_PHASE_COMPATIBILITY_NEXT_REVIEW_AT,
    protectedMainSha: "969a206b798c159e15ae0b6e5c76d0c94cca92ea",
    sourceCandidateHeadSha: TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA,
    observedRemoteHeadSha: TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA,
    pullRequestNumber: 82,
    pullRequestHeadSha: TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA,
    pullRequestState: "OPEN",
    pullRequestIsDraft: true,
    pullRequestMergeable: "MERGEABLE",
    pullRequestMergeStateStatus: "CLEAN",
    sourceAhead: 10,
    sourceBehind: 0
  };
}

function task79TestPhaseCompatibilityLifecycle() {
  return {
    status: TASK79_TEST_PHASE_COMPATIBILITY_STATUS,
    mode: "strict-additive-phase-stable-final-transition",
    sourceBinding: task79TestPhaseCompatibilitySourceBinding(),
    sourceCompletionEvidence: task79TestPhaseCompatibilitySourceCompletionEvidence(),
    observation: task79TestPhaseCompatibilityObservation(),
    authorizationBoundary: task79TestPhaseCompatibilityAuthorizationBoundary()
  };
}

function task79TestPhaseCompatibilityReceipt() {
  return {
    schemaVersion: "sena-registry-reconciliation-receipt/v1",
    receiptKind: TASK79_TEST_PHASE_COMPATIBILITY_RECEIPT_KIND,
    taskId: PROTECTED_CURRENTNESS_REPAIR_TASK_ID,
    ownerKey: PROTECTED_CURRENTNESS_REPAIR_OWNER_KEY,
    scope: [...EVIDENCE_FLOW_CURRENTNESS_CANDIDATE_PATHS],
    sourceBinding: task79TestPhaseCompatibilitySourceBinding(),
    sourceCompletionEvidence: task79TestPhaseCompatibilitySourceCompletionEvidence(),
    observation: task79TestPhaseCompatibilityObservation(),
    authorizationBoundary: task79TestPhaseCompatibilityAuthorizationBoundary()
  };
}

function validateTask79TestPhaseCompatibilityLifecycle(lifecycle) {
  if (!sameJson(lifecycle, task79TestPhaseCompatibilityLifecycle())) {
    throw new Error("rule=task7.9-test-phase-compatibility-lifecycle-invalid");
  }
  return lifecycle;
}

function validateTask79TestPhaseCompatibilityReceipt(receipt) {
  if (!sameJson(receipt, task79TestPhaseCompatibilityReceipt())) {
    throw new Error("rule=task7.9-test-phase-compatibility-receipt-invalid");
  }
  return receipt;
}

function validateTask77CombinedCurrentnessLifecycle(lifecycle) {
  assertEvidenceFlowCurrentnessOrderedKeys(
    lifecycle,
    TASK77_COMBINED_CURRENTNESS_LIFECYCLE_KEYS,
    "rule=task7.7-combined-currentness-lifecycle-invalid"
  );
  assertEvidenceFlowCurrentnessOrderedKeys(
    lifecycle.authorization,
    TASK77_COMBINED_CURRENTNESS_AUTHORIZATION_KEYS,
    "rule=task7.7-combined-currentness-authorization-invalid"
  );
  assertEvidenceFlowCurrentnessOrderedKeys(
    lifecycle.authorization.authorizationBoundary,
    TASK77_COMBINED_CURRENTNESS_AUTHORIZATION_BOUNDARY_KEYS,
    "rule=task7.7-combined-currentness-authorization-invalid"
  );
  assertEvidenceFlowCurrentnessOrderedKeys(
    lifecycle.observation,
    TASK77_COMBINED_CURRENTNESS_OBSERVATION_KEYS,
    "rule=task7.7-combined-currentness-observation-invalid"
  );
  assertEvidenceFlowCurrentnessOrderedKeys(
    lifecycle.authorizationBoundary,
    TASK77_COMBINED_CURRENTNESS_AUTHORIZATION_BOUNDARY_KEYS,
    "rule=task7.7-combined-currentness-lifecycle-invalid"
  );
  if (!sameJson(lifecycle, task77CombinedCurrentnessLifecycle())) {
    throw new Error("rule=task7.7-combined-currentness-lifecycle-invalid");
  }
  return lifecycle;
}

function validateTask77CombinedCurrentnessReceipt(receipt) {
  assertEvidenceFlowCurrentnessOrderedKeys(
    receipt,
    TASK77_COMBINED_CURRENTNESS_RECEIPT_KEYS,
    "rule=task7.7-combined-currentness-receipt-invalid"
  );
  if (!sameJson(receipt, task77CombinedCurrentnessReceipt())) {
    throw new Error("rule=task7.7-combined-currentness-receipt-invalid");
  }
  return receipt;
}

function assertEvidenceFlowCurrentnessOrderedKeys(value, expectedKeys, rule) {
  if (
    !isPlainRecord(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    !sameJson(Object.keys(value), expectedKeys)
  ) {
    throw new Error(rule);
  }
}

function validateEvidenceFlowCurrentnessSourceBinding(sourceBinding, rule) {
  assertEvidenceFlowCurrentnessOrderedKeys(
    sourceBinding,
    EVIDENCE_FLOW_CURRENTNESS_SOURCE_BINDING_KEYS,
    rule
  );
  assertEvidenceFlowCurrentnessOrderedKeys(
    sourceBinding.receiptPrefix,
    ["count", "sha256"],
    rule
  );
  if (!sameJson(sourceBinding, evidenceFlowCurrentnessSourceBinding())) {
    throw new Error(rule);
  }
}

function validateEvidenceFlowCurrentnessAuthorization(authorization, rule) {
  assertEvidenceFlowCurrentnessOrderedKeys(
    authorization,
    EVIDENCE_FLOW_CURRENTNESS_AUTHORIZATION_KEYS,
    rule
  );
  assertEvidenceFlowCurrentnessOrderedKeys(
    authorization.authorizationBoundary,
    EVIDENCE_FLOW_CURRENTNESS_AUTHORIZATION_BOUNDARY_KEYS,
    rule
  );
  if (
    !sameJson(authorization, evidenceFlowCurrentnessAuthorization()) ||
    sha256Buffer(Buffer.from(authorization.exactSentence)) !==
      authorization.exactSentenceSha256
  ) {
    throw new Error(rule);
  }
}

function validateEvidenceFlowCurrentnessObservation(observation, rule) {
  assertEvidenceFlowCurrentnessOrderedKeys(
    observation,
    EVIDENCE_FLOW_CURRENTNESS_OBSERVATION_KEYS,
    rule
  );
  if (
    !sameJson(observation, evidenceFlowCurrentnessObservation()) ||
    Date.parse(observation.observedAt) < Date.parse(EVIDENCE_FLOW_CURRENTNESS_OBSERVED_AT) ||
    Date.parse(observation.nextReviewAt) - Date.parse(observation.observedAt) !==
      24 * 60 * 60 * 1000
  ) {
    throw new Error(rule);
  }
}

function validateEvidenceFlowCurrentnessLifecycle(lifecycle) {
  assertEvidenceFlowCurrentnessOrderedKeys(
    lifecycle,
    EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_KEYS,
    "rule=evidenceflow-currentness-lifecycle-schema-invalid"
  );
  validateEvidenceFlowCurrentnessSourceBinding(
    lifecycle.sourceBinding,
    "rule=evidenceflow-currentness-lifecycle-invalid"
  );
  validateEvidenceFlowCurrentnessAuthorization(
    lifecycle.authorization,
    "rule=evidenceflow-currentness-lifecycle-invalid"
  );
  validateEvidenceFlowCurrentnessObservation(
    lifecycle.observation,
    "rule=evidenceflow-currentness-lifecycle-invalid"
  );
  assertEvidenceFlowCurrentnessOrderedKeys(
    lifecycle.authorizationBoundary,
    EVIDENCE_FLOW_CURRENTNESS_AUTHORIZATION_BOUNDARY_KEYS,
    "rule=evidenceflow-currentness-lifecycle-invalid"
  );
  if (!sameJson(lifecycle, evidenceFlowCurrentnessLifecycle())) {
    throw new Error("rule=evidenceflow-currentness-lifecycle-invalid");
  }
  return lifecycle;
}

function validateEvidenceFlowCurrentnessReceipt(receipt) {
  assertEvidenceFlowCurrentnessOrderedKeys(
    receipt,
    EVIDENCE_FLOW_CURRENTNESS_RECEIPT_KEYS,
    "rule=evidenceflow-currentness-receipt-schema-invalid"
  );
  assertEvidenceFlowCurrentnessOrderedKeys(
    receipt.authorizationBoundary,
    EVIDENCE_FLOW_CURRENTNESS_RECEIPT_BOUNDARY_KEYS,
    "rule=evidenceflow-currentness-receipt-schema-invalid"
  );
  validateEvidenceFlowCurrentnessSourceBinding(
    receipt.sourceBinding,
    "rule=evidenceflow-currentness-receipt-schema-invalid"
  );
  validateEvidenceFlowCurrentnessAuthorization(
    receipt.authorization,
    "rule=evidenceflow-currentness-receipt-schema-invalid"
  );
  validateEvidenceFlowCurrentnessObservation(
    receipt.observation,
    "rule=evidenceflow-currentness-receipt-schema-invalid"
  );
  if (
    !sameJson(receipt.scope, EVIDENCE_FLOW_CURRENTNESS_CANDIDATE_PATHS) ||
    !sameJson(receipt, evidenceFlowCurrentnessReceipt())
  ) {
    throw new Error("rule=evidenceflow-currentness-receipt-schema-invalid");
  }
  return receipt;
}

function validateEvidenceFlowCurrentnessFrozenSource(sourceRegistry) {
  if (
    !protectedActivationCompletionCanonicalJsonTree(sourceRegistry) ||
    evidenceFlowCurrentnessWorkItem(sourceRegistry)?.[
      EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_KEY
    ] ||
    (sourceRegistry?.releaseReceipts ?? []).some(
      (entry) => entry?.receiptKind === EVIDENCE_FLOW_CURRENTNESS_RECEIPT_KIND
    )
  ) {
    if (
      evidenceFlowCurrentnessWorkItem(sourceRegistry)?.[
        EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_KEY
      ] ||
      (sourceRegistry?.releaseReceipts ?? []).some(
        (entry) => entry?.receiptKind === EVIDENCE_FLOW_CURRENTNESS_RECEIPT_KIND
      )
    ) {
      throw new Error("rule=evidenceflow-currentness-transition-replay");
    }
    throw new Error("rule=evidenceflow-currentness-source-invalid");
  }
  const sourceReceipts = sourceRegistry?.releaseReceipts;
  if (
    !Array.isArray(sourceReceipts) ||
    sourceReceipts.length !== EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_COUNT ||
    sha256Buffer(Buffer.from(JSON.stringify(sourceReceipts))) !==
      EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_PREFIX_SHA256 ||
    !gitObjectExists(`${EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA}^{commit}`)
  ) {
    throw new Error("rule=evidenceflow-currentness-source-invalid");
  }
  let committedSource;
  let treeSha;
  let registryBlobSha;
  let verifierBlobSha;
  let governanceTestBlobSha;
  try {
    committedSource = loadRegistryFromCommit(
      EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA
    ).parsed;
    treeSha = gitText([
      "rev-parse",
      `${EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA}^{tree}`
    ]).trim();
    registryBlobSha = gitText([
      "rev-parse",
      `${EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA}:${REGISTRY_REPO_PATH}`
    ]).trim();
    verifierBlobSha = gitText([
      "rev-parse",
      `${EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA}:scripts/verify-sena-repo-governance.mjs`
    ]).trim();
    governanceTestBlobSha = gitText([
      "rev-parse",
      `${EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
    ]).trim();
  } catch {
    throw new Error("rule=evidenceflow-currentness-source-invalid");
  }
  if (
    treeSha !== EVIDENCE_FLOW_CURRENTNESS_SOURCE_TREE_SHA ||
    registryBlobSha !== EVIDENCE_FLOW_CURRENTNESS_SOURCE_REGISTRY_BLOB_SHA ||
    verifierBlobSha !== EVIDENCE_FLOW_CURRENTNESS_SOURCE_VERIFIER_BLOB_SHA ||
    governanceTestBlobSha !==
      EVIDENCE_FLOW_CURRENTNESS_SOURCE_GOVERNANCE_TEST_BLOB_SHA ||
    JSON.stringify(committedSource) !== JSON.stringify(sourceRegistry)
  ) {
    throw new Error("rule=evidenceflow-currentness-source-invalid");
  }
  return sourceRegistry;
}

function evidenceFlowCurrentnessNormalizedImmutableRegistrySha256(registry) {
  const normalized = evidenceFlowCurrentnessClone(registry);
  normalized.updatedAt = "<evidenceflow-currentness-owned>";
  normalized.workItems = (normalized.workItems ?? []).map((entry) => {
    if (entry?.taskId === EVIDENCE_FLOW_CURRENTNESS_TASK_ID) {
      entry.aheadBehind = "<evidenceflow-currentness-owned>";
      entry.lastObservedAt = "<evidenceflow-currentness-owned>";
      entry.nextReviewAt = "<evidenceflow-currentness-owned>";
      entry.dirtyState = "<evidenceflow-currentness-owned>";
      entry.evidenceState = "<evidenceflow-currentness-owned>";
      delete entry[EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_KEY];
      delete entry[TASK77_COMBINED_CURRENTNESS_LIFECYCLE_KEY];
    }
    if (entry?.taskId === "SENA-BRANCH-RETIREMENT-20260829") {
      entry.lastObservedAt = "<task7.7-currentness-owned>";
      entry.nextReviewAt = "<task7.7-currentness-owned>";
    }
    return entry;
  });
  normalized.branches = (normalized.branches ?? []).map((entry) => {
    if (entry?.name === EVIDENCE_FLOW_CURRENTNESS_BRANCH) {
      entry.remoteObservedAt = "<evidenceflow-currentness-owned>";
      entry.lastObservedAt = "<evidenceflow-currentness-owned>";
      entry.nextReviewAt = "<evidenceflow-currentness-owned>";
      entry.closeout = "<evidenceflow-currentness-owned>";
    }
    if (entry?.name === "codex/sena-branch-retirement-20260829") {
      entry.remoteObservedAt = "<task7.7-currentness-owned>";
      entry.lastObservedAt = "<task7.7-currentness-owned>";
      entry.nextReviewAt = "<task7.7-currentness-owned>";
    }
    return entry;
  });
  normalized.releaseReceipts = (normalized.releaseReceipts ?? []).filter(
    (entry) =>
      entry?.receiptKind !== EVIDENCE_FLOW_CURRENTNESS_RECEIPT_KIND &&
      entry?.receiptKind !== TASK77_COMBINED_CURRENTNESS_RECEIPT_KIND
  );
  return sha256Buffer(Buffer.from(JSON.stringify(normalized)));
}

function evidenceFlowCurrentnessExpectedCandidate(sourceRegistry) {
  const expected = evidenceFlowCurrentnessClone(sourceRegistry);
  expected.updatedAt = TASK77_COMBINED_CURRENTNESS_OBSERVED_AT;
  const item = evidenceFlowCurrentnessWorkItem(expected);
  const branch = evidenceFlowCurrentnessBranch(expected);
  if (!item || !branch) {
    throw new Error("rule=evidenceflow-currentness-source-invalid");
  }
  item.aheadBehind = { baseRef: "origin/main", ahead: 16, behind: 82 };
  item.lastObservedAt = EVIDENCE_FLOW_CURRENTNESS_OBSERVED_AT;
  item.nextReviewAt = EVIDENCE_FLOW_CURRENTNESS_NEXT_REVIEW_AT;
  item.dirtyState = EVIDENCE_FLOW_CURRENTNESS_DIRTY_STATE;
  item.evidenceState = {
    local: EVIDENCE_FLOW_CURRENTNESS_LOCAL_EVIDENCE,
    ci: item.evidenceState.ci,
    merged: EVIDENCE_FLOW_CURRENTNESS_MERGED_EVIDENCE,
    deployed: item.evidenceState.deployed,
    live: EVIDENCE_FLOW_CURRENTNESS_LIVE_EVIDENCE
  };
  item[EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_KEY] =
    evidenceFlowCurrentnessLifecycle();
  branch.remoteObservedAt = EVIDENCE_FLOW_CURRENTNESS_OBSERVED_AT;
  branch.lastObservedAt = EVIDENCE_FLOW_CURRENTNESS_OBSERVED_AT;
  branch.nextReviewAt = EVIDENCE_FLOW_CURRENTNESS_NEXT_REVIEW_AT;
  branch.closeout = EVIDENCE_FLOW_CURRENTNESS_BRANCH_CLOSEOUT;
  expected.releaseReceipts.push(evidenceFlowCurrentnessReceipt());
  const retirementItem = task77BranchRetirementWorkItem(expected);
  const retirementBranch = task77BranchRetirementBranch(expected);
  if (!retirementItem || !retirementBranch) {
    throw new Error("rule=task7.7-combined-currentness-source-invalid");
  }
  retirementItem.lastObservedAt = TASK77_COMBINED_CURRENTNESS_OBSERVED_AT;
  retirementItem.nextReviewAt = TASK77_COMBINED_CURRENTNESS_NEXT_REVIEW_AT;
  const evidenceFlowItemIndex = expected.workItems.indexOf(item);
  expected.workItems[evidenceFlowItemIndex] = Object.fromEntries(
    Object.entries(item).flatMap(([key, value]) =>
      key === "disposition"
        ? [
            [
              TASK77_COMBINED_CURRENTNESS_LIFECYCLE_KEY,
              task77CombinedCurrentnessLifecycle()
            ],
            [key, value]
          ]
        : [[key, value]]
    )
  );
  retirementBranch.remoteObservedAt = TASK77_COMBINED_CURRENTNESS_OBSERVED_AT;
  retirementBranch.lastObservedAt = TASK77_COMBINED_CURRENTNESS_OBSERVED_AT;
  retirementBranch.nextReviewAt = TASK77_COMBINED_CURRENTNESS_NEXT_REVIEW_AT;
  expected.releaseReceipts.push(task77CombinedCurrentnessReceipt());
  return expected;
}

function task77Pr82PushCorrectionExpectedCandidate(sourceRegistry) {
  const expected = evidenceFlowCurrentnessClone(sourceRegistry);
  expected.updatedAt = TASK77_PR82_PUSH_CORRECTION_OBSERVED_AT;
  const item = task77Pr82WorkItem(expected);
  const branch = task77Pr82Branch(expected);
  if (!item || !branch) {
    throw new Error("rule=task7.7-pr82-push-currentness-source-invalid");
  }
  item.headSha = TASK77_PR82_PUSH_CORRECTION_SOURCE_HEAD_SHA;
  item.aheadBehind = { baseRef: "origin/main", ahead: 8, behind: 0 };
  item.lastObservedAt = TASK77_PR82_PUSH_CORRECTION_OBSERVED_AT;
  item.nextReviewAt = TASK77_PR82_PUSH_CORRECTION_NEXT_REVIEW_AT;
  item.prHeadSha = EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA;
  item.dirtyState =
    "task7.7-pr82-remote-currentness-corrected-awaiting-native-draft-push";
  item.evidenceState = {
    local: "exact local source candidate a647817 is clean and one allowed follow-up commit may advance it after gates; no future commit SHA is predeclared",
    ci: item.evidenceState.ci,
    merged: "PR82 remains OPEN and Draft; cached/live remote and PR head are exact 44a8147; Ready and merge remain unauthorized",
    deployed: item.evidenceState.deployed,
    live: "the 2026-09-02T11:40:00Z currentness correction binds local source a647817, protected main 969a206, cached/live remote and Draft PR82 head 44a8147, exact three-path scope, and no ref deletion or deployment authority"
  };
  item[TASK77_PR82_PUSH_CORRECTION_LIFECYCLE_KEY] =
    task77Pr82PushCorrectionLifecycle();
  branch.headSha = TASK77_PR82_PUSH_CORRECTION_SOURCE_HEAD_SHA;
  branch.remoteHeadSha = EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA;
  branch.remoteObservedAt = TASK77_PR82_PUSH_CORRECTION_OBSERVED_AT;
  branch.prHeadSha = EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA;
  branch.lastObservedAt = TASK77_PR82_PUSH_CORRECTION_OBSERVED_AT;
  branch.lastCommitAt = "2026-09-02T19:30:18+08:00";
  branch.nextReviewAt = TASK77_PR82_PUSH_CORRECTION_NEXT_REVIEW_AT;
  branch.closeout =
    "exact local source a647817 descends from cached/live/PR82 remote head 44a8147 through allowed three-path governance changes; PR82 remains OPEN/Draft/MERGEABLE/CLEAN and only one ordinary follow-up push is authorized after gates; Ready, merge, PR46 mutation, cleanup, deletion, ref/tag/quarantine, provider, deployment, and history mutation remain unauthorized";
  expected.releaseReceipts.push(task77Pr82PushCorrectionReceipt());
  return expected;
}

function validateTask77Pr82PushCorrectionSource(sourceRegistry) {
  const receipts = sourceRegistry?.releaseReceipts;
  if (
    !Array.isArray(receipts) ||
    receipts.length !== TASK77_PR82_PUSH_CORRECTION_SOURCE_RECEIPT_COUNT ||
    sha256Buffer(Buffer.from(JSON.stringify(receipts))) !==
      TASK77_PR82_PUSH_CORRECTION_SOURCE_RECEIPT_SHA256 ||
    !gitObjectExists(`${TASK77_PR82_PUSH_CORRECTION_SOURCE_HEAD_SHA}^{commit}`)
  ) {
    throw new Error("rule=task7.7-pr82-push-currentness-source-invalid");
  }
  let committed;
  try {
    committed = loadRegistryFromCommit(
      TASK77_PR82_PUSH_CORRECTION_SOURCE_HEAD_SHA
    ).parsed;
    if (
      gitText(["rev-parse", `${TASK77_PR82_PUSH_CORRECTION_SOURCE_HEAD_SHA}^{tree}`]).trim() !==
        TASK77_PR82_PUSH_CORRECTION_SOURCE_TREE_SHA ||
      gitText(["rev-parse", `${TASK77_PR82_PUSH_CORRECTION_SOURCE_HEAD_SHA}:${REGISTRY_REPO_PATH}`]).trim() !==
        TASK77_PR82_PUSH_CORRECTION_SOURCE_REGISTRY_BLOB_SHA ||
      gitText(["rev-parse", `${TASK77_PR82_PUSH_CORRECTION_SOURCE_HEAD_SHA}:scripts/verify-sena-repo-governance.mjs`]).trim() !==
        TASK77_PR82_PUSH_CORRECTION_SOURCE_VERIFIER_BLOB_SHA ||
      gitText(["rev-parse", `${TASK77_PR82_PUSH_CORRECTION_SOURCE_HEAD_SHA}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`]).trim() !==
        TASK77_PR82_PUSH_CORRECTION_SOURCE_TEST_BLOB_SHA ||
      !sameJson(committed, sourceRegistry)
    ) {
      throw new Error("source identity mismatch");
    }
  } catch {
    throw new Error("rule=task7.7-pr82-push-currentness-source-invalid");
  }
  return sourceRegistry;
}

export function validateTask77Pr82PushCurrentnessCorrection(
  sourceRegistry,
  candidateRegistry
) {
  validateTask77Pr82PushCorrectionSource(sourceRegistry);
  const sourceReceipts = sourceRegistry.releaseReceipts;
  const candidateReceipts = candidateRegistry?.releaseReceipts;
  if (
    !Array.isArray(candidateReceipts) ||
    candidateReceipts.length !== sourceReceipts.length + 1 ||
    !sourceReceipts.every((receipt, index) =>
      sameJson(receipt, candidateReceipts[index])
    )
  ) {
    throw new Error("rule=task7.7-pr82-push-currentness-receipt-invalid");
  }
  const sourceLifecycle = task77Pr82WorkItem(sourceRegistry)?.[
    TASK77_PR82_PUSH_CORRECTION_LIFECYCLE_KEY
  ];
  if (sourceLifecycle) {
    throw new Error("rule=task7.7-pr82-push-currentness-transition-replay");
  }
  const candidateLifecycle = task77Pr82WorkItem(candidateRegistry)?.[
    TASK77_PR82_PUSH_CORRECTION_LIFECYCLE_KEY
  ];
  validateTask77Pr82PushCorrectionLifecycle(candidateLifecycle);
  validateTask77Pr82PushCorrectionReceipt(
    candidateReceipts.at(-1)
  );
  const expected = task77Pr82PushCorrectionExpectedCandidate(sourceRegistry);
  if (!sameJson(candidateRegistry, expected)) {
    throw new Error("rule=task7.7-pr82-push-currentness-field-scope-drift");
  }
  return candidateLifecycle;
}

function task78FinalCompatibilityExpectedCandidate(sourceRegistry) {
  const expected = evidenceFlowCurrentnessClone(sourceRegistry);
  expected.updatedAt = TASK78_FINAL_COMPATIBILITY_OBSERVED_AT;
  const item = task77Pr82WorkItem(expected);
  const branch = task77Pr82Branch(expected);
  if (!item || !branch) {
    throw new Error("rule=task7.8-final-compatibility-source-invalid");
  }
  item.headSha = TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA;
  item.aheadBehind = { baseRef: "origin/main", ahead: 9, behind: 0 };
  item.lastObservedAt = TASK78_FINAL_COMPATIBILITY_OBSERVED_AT;
  item.nextReviewAt = TASK78_FINAL_COMPATIBILITY_NEXT_REVIEW_AT;
  item.prHeadSha = TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA;
  item.dirtyState =
    "task7.8-final-compatibility-candidate-awaiting-native-draft-push";
  item.evidenceState = {
    local: "exact local source 1d0bb424 is clean and the bounded Task7.8 verifier/test compatibility correction is staged only with its exact registry currentness companion",
    ci: item.evidenceState.ci,
    merged: "PR82 remains OPEN and Draft at exact cached/live remote and PR head 1d0bb424; Ready and merge remain unauthorized",
    deployed: item.evidenceState.deployed,
    live: "the 2026-09-02T12:36:00Z observation binds protected main 969a206, local source/cached/live remote/Draft PR82 head 1d0bb424, ahead 9/behind 0, exact three-path scope, and zero Ready merge deletion or deployment authority"
  };
  item[TASK78_FINAL_COMPATIBILITY_LIFECYCLE_KEY] =
    task78FinalCompatibilityLifecycle();
  branch.headSha = TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA;
  branch.remoteHeadSha = TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA;
  branch.remoteObservedAt = TASK78_FINAL_COMPATIBILITY_OBSERVED_AT;
  branch.prHeadSha = TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA;
  branch.lastObservedAt = TASK78_FINAL_COMPATIBILITY_OBSERVED_AT;
  branch.lastCommitAt = "2026-09-02T20:08:01+08:00";
  branch.nextReviewAt = TASK78_FINAL_COMPATIBILITY_NEXT_REVIEW_AT;
  branch.closeout =
    "exact local/cached/live/PR82 source head 1d0bb424 is ahead 9/behind 0 and remains OPEN/Draft/MERGEABLE/CLEAN; only the bounded three-path Task7.8 correction commit and ordinary Draft push are authorized after gates; Ready, merge, PR46 mutation, cleanup, deletion, worktree/orphan/ref/tag/quarantine, provider, deployment, and history mutation remain unauthorized";
  expected.releaseReceipts.push(task78FinalCompatibilityReceipt());
  return expected;
}

function validateTask78FinalCompatibilitySource(sourceRegistry) {
  const receipts = sourceRegistry?.releaseReceipts;
  if (
    !Array.isArray(receipts) ||
    receipts.length !== TASK78_FINAL_COMPATIBILITY_SOURCE_RECEIPT_COUNT ||
    sha256Buffer(Buffer.from(JSON.stringify(receipts))) !==
      TASK78_FINAL_COMPATIBILITY_SOURCE_RECEIPT_SHA256 ||
    !gitObjectExists(`${TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA}^{commit}`)
  ) {
    throw new Error("rule=task7.8-final-compatibility-source-invalid");
  }
  try {
    const committed = loadRegistryFromCommit(
      TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA
    ).parsed;
    if (
      gitText(["rev-parse", `${TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA}^{tree}`]).trim() !==
        TASK78_FINAL_COMPATIBILITY_SOURCE_TREE_SHA ||
      gitText(["rev-parse", `${TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA}:${REGISTRY_REPO_PATH}`]).trim() !==
        TASK78_FINAL_COMPATIBILITY_SOURCE_REGISTRY_BLOB_SHA ||
      gitText(["rev-parse", `${TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA}:scripts/verify-sena-repo-governance.mjs`]).trim() !==
        TASK78_FINAL_COMPATIBILITY_SOURCE_VERIFIER_BLOB_SHA ||
      gitText(["rev-parse", `${TASK78_FINAL_COMPATIBILITY_SOURCE_HEAD_SHA}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`]).trim() !==
        TASK78_FINAL_COMPATIBILITY_SOURCE_TEST_BLOB_SHA ||
      !sameJson(committed, sourceRegistry)
    ) {
      throw new Error("source identity mismatch");
    }
  } catch {
    throw new Error("rule=task7.8-final-compatibility-source-invalid");
  }
  return sourceRegistry;
}

export function validateTask78FinalCompatibilityTransition(
  sourceRegistry,
  candidateRegistry
) {
  if (
    task77Pr82WorkItem(sourceRegistry)?.[
      TASK78_FINAL_COMPATIBILITY_LIFECYCLE_KEY
    ]
  ) {
    throw new Error("rule=task7.8-final-compatibility-transition-replay");
  }
  validateTask78FinalCompatibilitySource(sourceRegistry);
  const sourceReceipts = sourceRegistry.releaseReceipts;
  const candidateReceipts = candidateRegistry?.releaseReceipts;
  if (
    !Array.isArray(candidateReceipts) ||
    candidateReceipts.length !== sourceReceipts.length + 1 ||
    !sourceReceipts.every((receipt, index) =>
      sameJson(receipt, candidateReceipts[index])
    )
  ) {
    throw new Error("rule=task7.8-final-compatibility-receipt-invalid");
  }
  const lifecycle = task77Pr82WorkItem(candidateRegistry)?.[
    TASK78_FINAL_COMPATIBILITY_LIFECYCLE_KEY
  ];
  validateTask78FinalCompatibilityLifecycle(lifecycle);
  validateTask78FinalCompatibilityReceipt(candidateReceipts.at(-1));
  if (
    !sameJson(
      candidateRegistry,
      task78FinalCompatibilityExpectedCandidate(sourceRegistry)
    )
  ) {
    throw new Error("rule=task7.8-final-compatibility-field-scope-drift");
  }
  return lifecycle;
}

export function task79TestPhaseCompatibilityExpectedCandidate(sourceRegistry) {
  const expected = evidenceFlowCurrentnessClone(sourceRegistry);
  expected.updatedAt = TASK79_TEST_PHASE_COMPATIBILITY_OBSERVED_AT;
  const item = task77Pr82WorkItem(expected);
  const branch = task77Pr82Branch(expected);
  if (!item || !branch) {
    throw new Error("rule=task7.9-test-phase-compatibility-source-invalid");
  }
  item.headSha = TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA;
  item.aheadBehind = { baseRef: "origin/main", ahead: 10, behind: 0 };
  item.lastObservedAt = TASK79_TEST_PHASE_COMPATIBILITY_OBSERVED_AT;
  item.nextReviewAt = TASK79_TEST_PHASE_COMPATIBILITY_NEXT_REVIEW_AT;
  item.prHeadSha = TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA;
  item.dirtyState =
    "task7.9-test-phase-compatibility-candidate-awaiting-native-draft-push";
  item.evidenceState = {
    local: "exact Task7.8 completion head 203dd6d is clean and the bounded Task7.9 verifier/test phase compatibility correction is staged only with its exact registry currentness companion",
    ci: "exact Task7.8 completion head 203dd6d passed build run 33637780735 and both repository-security runs 33637780721 and 33637771373 with zero annotations; the Task7.9 correction and later registry-only final head each require fresh exact-head gates before Ready or merge",
    merged: "PR82 remains OPEN and Draft at exact cached/live remote and PR head 203dd6d; Ready and merge remain unauthorized during the Task7.9 correction",
    deployed: item.evidenceState.deployed,
    live: "the 2026-09-02T14:05:03Z observation binds protected main 969a206, local source/cached/live remote/Draft PR82 head 203dd6d, ahead 10/behind 0, exact three-path scope, and zero Ready merge deletion deployment or PR46 mutation authority"
  };
  item[TASK79_TEST_PHASE_COMPATIBILITY_LIFECYCLE_KEY] =
    task79TestPhaseCompatibilityLifecycle();
  branch.headSha = TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA;
  branch.remoteHeadSha = TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA;
  branch.remoteObservedAt = TASK79_TEST_PHASE_COMPATIBILITY_OBSERVED_AT;
  branch.prHeadSha = TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA;
  branch.lastObservedAt = TASK79_TEST_PHASE_COMPATIBILITY_OBSERVED_AT;
  branch.lastCommitAt = "2026-09-02T21:45:11+08:00";
  branch.nextReviewAt = TASK79_TEST_PHASE_COMPATIBILITY_NEXT_REVIEW_AT;
  branch.closeout =
    "exact local/cached/live/PR82 source head 203dd6d is ahead 10/behind 0 and remains OPEN/Draft/MERGEABLE/CLEAN; only the bounded three-path Task7.9 test-phase correction commit and ordinary Draft push are authorized after gates; Ready, merge, PR46 mutation, cleanup, deletion, worktree/orphan/ref/tag/quarantine, provider, deployment, and history mutation remain unauthorized";
  expected.releaseReceipts.push(task79TestPhaseCompatibilityReceipt());
  return expected;
}

function validateTask79TestPhaseCompatibilitySource(sourceRegistry) {
  const receipts = sourceRegistry?.releaseReceipts;
  if (
    !Array.isArray(receipts) ||
    receipts.length !== TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_RECEIPT_COUNT ||
    sha256Buffer(Buffer.from(JSON.stringify(receipts))) !==
      TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_RECEIPT_SHA256 ||
    !gitObjectExists(`${TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA}^{commit}`)
  ) {
    throw new Error("rule=task7.9-test-phase-compatibility-source-invalid");
  }
  try {
    const committed = loadRegistryFromCommit(
      TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA
    ).parsed;
    if (
      gitText(["rev-parse", `${TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA}^{tree}`]).trim() !==
        TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_TREE_SHA ||
      gitText(["rev-parse", `${TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA}:${REGISTRY_REPO_PATH}`]).trim() !==
        TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_REGISTRY_BLOB_SHA ||
      gitText(["rev-parse", `${TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA}:scripts/verify-sena-repo-governance.mjs`]).trim() !==
        TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_VERIFIER_BLOB_SHA ||
      gitText(["rev-parse", `${TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_HEAD_SHA}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`]).trim() !==
        TASK79_TEST_PHASE_COMPATIBILITY_SOURCE_TEST_BLOB_SHA ||
      !sameJson(committed, sourceRegistry)
    ) {
      throw new Error("source identity mismatch");
    }
  } catch {
    throw new Error("rule=task7.9-test-phase-compatibility-source-invalid");
  }
  return sourceRegistry;
}

export function validateTask79TestPhaseCompatibilityTransition(
  sourceRegistry,
  candidateRegistry
) {
  if (
    task77Pr82WorkItem(sourceRegistry)?.[
      TASK79_TEST_PHASE_COMPATIBILITY_LIFECYCLE_KEY
    ]
  ) {
    throw new Error("rule=task7.9-test-phase-compatibility-transition-replay");
  }
  validateTask79TestPhaseCompatibilitySource(sourceRegistry);
  const sourceReceipts = sourceRegistry.releaseReceipts;
  const candidateReceipts = candidateRegistry?.releaseReceipts;
  if (
    !Array.isArray(candidateReceipts) ||
    candidateReceipts.length !== sourceReceipts.length + 1 ||
    !sourceReceipts.every((receipt, index) =>
      sameJson(receipt, candidateReceipts[index])
    )
  ) {
    throw new Error("rule=task7.9-test-phase-compatibility-receipt-invalid");
  }
  const lifecycle = task77Pr82WorkItem(candidateRegistry)?.[
    TASK79_TEST_PHASE_COMPATIBILITY_LIFECYCLE_KEY
  ];
  validateTask79TestPhaseCompatibilityLifecycle(lifecycle);
  validateTask79TestPhaseCompatibilityReceipt(candidateReceipts.at(-1));
  if (
    !sameJson(
      candidateRegistry,
      task79TestPhaseCompatibilityExpectedCandidate(sourceRegistry)
    )
  ) {
    throw new Error("rule=task7.9-test-phase-compatibility-field-scope-drift");
  }
  return lifecycle;
}

export function validateEvidenceFlowCurrentnessLifecycleTransition(
  sourceRegistry,
  candidateRegistry
) {
  validateEvidenceFlowCurrentnessFrozenSource(sourceRegistry);
  if (!protectedActivationCompletionCanonicalJsonTree(candidateRegistry)) {
    throw new Error("rule=evidenceflow-currentness-candidate-noncanonical");
  }
  const sourceReceipts = sourceRegistry.releaseReceipts;
  const candidateReceipts = candidateRegistry?.releaseReceipts;
  if (
    !Array.isArray(candidateReceipts) ||
    candidateReceipts.length !== EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_COUNT + 2 ||
    !sourceReceipts.every(
      (receipt, index) => JSON.stringify(receipt) === JSON.stringify(candidateReceipts[index])
    )
  ) {
    throw new Error("rule=evidenceflow-currentness-receipt-delta-invalid");
  }
  const lifecycle = evidenceFlowCurrentnessWorkItem(candidateRegistry)?.[
    EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_KEY
  ];
  validateEvidenceFlowCurrentnessLifecycle(lifecycle);
  validateEvidenceFlowCurrentnessReceipt(
    candidateReceipts[EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_COUNT]
  );
  validateTask77CombinedCurrentnessLifecycle(
    task77CombinedCurrentnessCarrierItem(candidateRegistry)?.[
      TASK77_COMBINED_CURRENTNESS_LIFECYCLE_KEY
    ]
  );
  validateTask77CombinedCurrentnessReceipt(candidateReceipts.at(-1));
  if (
    evidenceFlowCurrentnessNormalizedImmutableRegistrySha256(sourceRegistry) !==
    evidenceFlowCurrentnessNormalizedImmutableRegistrySha256(candidateRegistry)
  ) {
    throw new Error("rule=evidenceflow-currentness-immutable-registry-drift");
  }
  const expected = evidenceFlowCurrentnessExpectedCandidate(sourceRegistry);
  if (JSON.stringify(candidateRegistry) !== JSON.stringify(expected)) {
    throw new Error("rule=evidenceflow-currentness-field-scope-drift");
  }
  return lifecycle;
}

export function validateEvidenceFlowCurrentnessLifecycleSnapshot(registry) {
  if (!protectedActivationCompletionCanonicalJsonTree(registry)) {
    throw new Error("rule=evidenceflow-currentness-candidate-noncanonical");
  }
  const item = evidenceFlowCurrentnessWorkItem(registry);
  const branch = evidenceFlowCurrentnessBranch(registry);
  const lifecycle = item?.[EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_KEY];
  const receipts = registry?.releaseReceipts;
  const protectedRepairStatus = protectedCurrentnessRepairWorkItem(registry)
    ?.protectedCurrentnessActivationRepairLifecycle?.status;
  const suffixReceiptKinds = Array.isArray(receipts)
    ? receipts
      .slice(PROTECTED_CURRENTNESS_REPAIR_FROZEN_SEED_RECEIPT_COUNT)
      .map((entry) => entry?.receiptKind)
    : [];
  const exactCorrectionSequence = [
    PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT,
    PROTECTED_CURRENTNESS_REPAIR_CORRECTION_RECEIPT,
    EVIDENCE_FLOW_CURRENTNESS_RECEIPT_KIND,
    TASK77_COMBINED_CURRENTNESS_RECEIPT_KIND
  ];
  const exactTask77Pr82PushCorrectionSequence = [
    ...exactCorrectionSequence,
    TASK77_PR82_PUSH_CORRECTION_RECEIPT_KIND
  ];
  const exactTask78CompatibilitySequence = [
    ...exactTask77Pr82PushCorrectionSequence,
    TASK78_FINAL_COMPATIBILITY_RECEIPT_KIND
  ];
  const exactTask79CompatibilitySequence = [
    ...exactTask78CompatibilitySequence,
    TASK79_TEST_PHASE_COMPATIBILITY_RECEIPT_KIND
  ];
  const exactFinalSequence = [
    PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT,
    PROTECTED_CURRENTNESS_REPAIR_CORRECTION_RECEIPT,
    EVIDENCE_FLOW_CURRENTNESS_RECEIPT_KIND,
    TASK77_COMBINED_CURRENTNESS_RECEIPT_KIND,
    PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
  ];
  const exactFinalAfterTask77Pr82PushSequence = [
    ...exactTask77Pr82PushCorrectionSequence,
    PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
  ];
  const exactFinalAfterTask78CompatibilitySequence = [
    ...exactTask78CompatibilitySequence,
    PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
  ];
  const exactFinalAfterTask79CompatibilitySequence = [
    ...exactTask79CompatibilitySequence,
    PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
  ];
  const pr82PushCorrectionLifecycle = task77Pr82WorkItem(registry)?.[
    TASK77_PR82_PUSH_CORRECTION_LIFECYCLE_KEY
  ];
  const task78CompatibilityLifecycle = task77Pr82WorkItem(registry)?.[
    TASK78_FINAL_COMPATIBILITY_LIFECYCLE_KEY
  ];
  const task79CompatibilityLifecycle = task77Pr82WorkItem(registry)?.[
    TASK79_TEST_PHASE_COMPATIBILITY_LIFECYCLE_KEY
  ];
  const exactSequenceAllowed =
    (protectedRepairStatus === PROTECTED_CURRENTNESS_REPAIR_CORRECTION_STATUS &&
      (sameJson(suffixReceiptKinds, exactCorrectionSequence) ||
        sameJson(suffixReceiptKinds, exactTask77Pr82PushCorrectionSequence) ||
        sameJson(suffixReceiptKinds, exactTask78CompatibilitySequence) ||
        sameJson(suffixReceiptKinds, exactTask79CompatibilitySequence))) ||
    (protectedRepairStatus === PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS &&
      (sameJson(suffixReceiptKinds, exactFinalSequence) ||
        sameJson(suffixReceiptKinds, exactFinalAfterTask77Pr82PushSequence) ||
        sameJson(suffixReceiptKinds, exactFinalAfterTask78CompatibilitySequence) ||
        sameJson(suffixReceiptKinds, exactFinalAfterTask79CompatibilitySequence)));
  if (
    !item ||
    !branch ||
    !Array.isArray(receipts) ||
    !exactSequenceAllowed ||
    sha256Buffer(
      Buffer.from(
        JSON.stringify(
          receipts.slice(0, EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_COUNT)
        )
      )
    ) !== EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_PREFIX_SHA256 ||
    receipts.filter(
      (entry) => entry?.receiptKind === EVIDENCE_FLOW_CURRENTNESS_RECEIPT_KIND
    ).length !== 1 ||
    receipts.filter(
      (entry) => entry?.receiptKind === TASK77_COMBINED_CURRENTNESS_RECEIPT_KIND
    ).length !== 1 ||
    receipts.filter(
      (entry) => entry?.receiptKind === TASK77_PR82_PUSH_CORRECTION_RECEIPT_KIND
    ).length !== (pr82PushCorrectionLifecycle ? 1 : 0) ||
    receipts.filter(
      (entry) => entry?.receiptKind === TASK78_FINAL_COMPATIBILITY_RECEIPT_KIND
    ).length !== (task78CompatibilityLifecycle ? 1 : 0) ||
    receipts.filter(
      (entry) => entry?.receiptKind === TASK79_TEST_PHASE_COMPATIBILITY_RECEIPT_KIND
    ).length !== (task79CompatibilityLifecycle ? 1 : 0) ||
    receipts[EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_COUNT]?.receiptKind !==
      EVIDENCE_FLOW_CURRENTNESS_RECEIPT_KIND ||
    receipts[EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_COUNT + 1]?.receiptKind !==
      TASK77_COMBINED_CURRENTNESS_RECEIPT_KIND
  ) {
    throw new Error("rule=evidenceflow-currentness-snapshot-invalid stage=sequence");
  }
  validateEvidenceFlowCurrentnessLifecycle(lifecycle);
  validateEvidenceFlowCurrentnessReceipt(
    receipts[EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_COUNT]
  );
  validateTask77CombinedCurrentnessLifecycle(
    task77CombinedCurrentnessCarrierItem(registry)?.[
      TASK77_COMBINED_CURRENTNESS_LIFECYCLE_KEY
    ]
  );
  validateTask77CombinedCurrentnessReceipt(
    receipts[EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_COUNT + 1]
  );
  if (pr82PushCorrectionLifecycle) {
    validateTask77Pr82PushCorrectionLifecycle(pr82PushCorrectionLifecycle);
    validateTask77Pr82PushCorrectionReceipt(
      receipts[EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_COUNT + 2]
    );
  }
  if (task78CompatibilityLifecycle) {
    validateTask78FinalCompatibilityLifecycle(task78CompatibilityLifecycle);
    validateTask78FinalCompatibilityReceipt(
      receipts[EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_COUNT + 3]
    );
  }
  if (task79CompatibilityLifecycle) {
    validateTask79TestPhaseCompatibilityLifecycle(task79CompatibilityLifecycle);
    validateTask79TestPhaseCompatibilityReceipt(
      receipts[EVIDENCE_FLOW_CURRENTNESS_SOURCE_RECEIPT_COUNT + 4]
    );
  }
  let expected = evidenceFlowCurrentnessExpectedCandidate(
    evidenceFlowCurrentnessFrozenSourceRegistry()
  );
  if (pr82PushCorrectionLifecycle) {
    expected = task77Pr82PushCorrectionExpectedCandidate(expected);
  }
  if (task78CompatibilityLifecycle) {
    expected = task78FinalCompatibilityExpectedCandidate(expected);
  }
  if (task79CompatibilityLifecycle) {
    expected = task79TestPhaseCompatibilityExpectedCandidate(expected);
  }
  const expectedItem = evidenceFlowCurrentnessWorkItem(expected);
  const expectedBranch = evidenceFlowCurrentnessBranch(expected);
  const expectedRetirementItem = task77BranchRetirementWorkItem(expected);
  const expectedTask77CarrierItem = task77CombinedCurrentnessCarrierItem(expected);
  const expectedRetirementBranch = task77BranchRetirementBranch(expected);
  for (const field of [
    "headSha",
    "aheadBehind",
    "lastHeartbeatAt",
    "lastObservedAt",
    "nextReviewAt",
    "prNumber",
    "prIsDraft",
    "prReadyForReview",
    "mergeAuthorized",
    "dirtyState",
    "evidenceState",
    EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_KEY
  ]) {
    if (!sameJson(item[field], expectedItem[field])) {
      throw new Error(`rule=evidenceflow-currentness-snapshot-invalid stage=item field=${field}`);
    }
  }
  for (const field of [
    "headSha",
    "remoteHeadSha",
    "remoteObservedAt",
    "pr",
    "prState",
    "prIsDraft",
    "prReadyForReview",
    "mergeAuthorized",
    "prHeadSha",
    "lastOwnerHeartbeatAt",
    "lastObservedAt",
    "nextReviewAt",
    "closeout"
  ]) {
    if (!sameJson(branch[field], expectedBranch[field])) {
      throw new Error(`rule=evidenceflow-currentness-snapshot-invalid stage=branch field=${field}`);
    }
  }
  const retirementItem = task77BranchRetirementWorkItem(registry);
  const retirementBranch = task77BranchRetirementBranch(registry);
  for (const field of ["lastObservedAt", "nextReviewAt"]) {
    if (!sameJson(retirementItem?.[field], expectedRetirementItem?.[field])) {
      throw new Error("rule=task7.7-combined-currentness-snapshot-invalid");
    }
  }
  if (
    !sameJson(
      task77CombinedCurrentnessCarrierItem(registry)?.[
        TASK77_COMBINED_CURRENTNESS_LIFECYCLE_KEY
      ],
      expectedTask77CarrierItem?.[TASK77_COMBINED_CURRENTNESS_LIFECYCLE_KEY]
    )
  ) {
    throw new Error("rule=task7.7-combined-currentness-snapshot-invalid");
  }
  for (const field of ["remoteObservedAt", "lastObservedAt", "nextReviewAt"]) {
    if (!sameJson(retirementBranch?.[field], expectedRetirementBranch?.[field])) {
      throw new Error("rule=task7.7-combined-currentness-snapshot-invalid");
    }
  }
  if (
    (pr82PushCorrectionLifecycle || task78CompatibilityLifecycle || task79CompatibilityLifecycle) &&
    protectedRepairStatus === PROTECTED_CURRENTNESS_REPAIR_CORRECTION_STATUS
  ) {
    const repairItem = task77Pr82WorkItem(registry);
    const expectedRepairItem = task77Pr82WorkItem(expected);
    const repairBranch = task77Pr82Branch(registry);
    const expectedRepairBranch = task77Pr82Branch(expected);
    for (const field of [
      "headSha",
      "aheadBehind",
      "lastObservedAt",
      "nextReviewAt",
      "prHeadSha",
      "dirtyState",
      "evidenceState",
      TASK77_PR82_PUSH_CORRECTION_LIFECYCLE_KEY,
      ...(task78CompatibilityLifecycle
        ? [TASK78_FINAL_COMPATIBILITY_LIFECYCLE_KEY]
        : []),
      ...(task79CompatibilityLifecycle
        ? [TASK79_TEST_PHASE_COMPATIBILITY_LIFECYCLE_KEY]
        : [])
    ]) {
      if (!sameJson(repairItem?.[field], expectedRepairItem?.[field])) {
        throw new Error("rule=task7.7-pr82-push-currentness-snapshot-invalid");
      }
    }
    for (const field of [
      "headSha",
      "remoteHeadSha",
      "remoteObservedAt",
      "prHeadSha",
      "lastObservedAt",
      "lastCommitAt",
      "nextReviewAt",
      "closeout"
    ]) {
      if (!sameJson(repairBranch?.[field], expectedRepairBranch?.[field])) {
        throw new Error("rule=task7.7-pr82-push-currentness-snapshot-invalid");
      }
    }
  }
  return lifecycle;
}

export function assertEvidenceFlowCurrentnessLifecycleIndexPaths(paths) {
  if (!sameJson(paths, EVIDENCE_FLOW_CURRENTNESS_CANDIDATE_PATHS)) {
    throw new Error("rule=evidenceflow-currentness-index-path-set-mismatch");
  }
  return true;
}

function assertEvidenceFlowCurrentnessLifecycleIndexBlobs(candidateRegistry) {
  const stagedRegistry = loadRegistryFromIndex().parsed;
  if (JSON.stringify(stagedRegistry) !== JSON.stringify(candidateRegistry)) {
    throw new Error("rule=evidenceflow-currentness-index-blob-mismatch");
  }
  for (const path of EVIDENCE_FLOW_CURRENTNESS_CANDIDATE_PATHS.slice(1)) {
    const stagedBlobSha = gitText(["rev-parse", `:${path}`]).trim();
    const executedBlobSha = gitText([
      "hash-object",
      "--no-filters",
      join(REPO_ROOT, path)
    ]).trim();
    if (!isSha(stagedBlobSha) || stagedBlobSha !== executedBlobSha) {
      throw new Error("rule=evidenceflow-currentness-index-blob-mismatch");
    }
  }
  return true;
}

function evidenceFlowCurrentnessFrozenSourceRegistry() {
  return loadRegistryFromCommit(EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA).parsed;
}

function validateEvidenceFlowCurrentnessIndexTransition(candidateRegistry) {
  const branchResult = git(["symbolic-ref", "--quiet", "--short", "HEAD"], {
    allowFailure: true
  });
  if (
    branchResult.status !== 0 ||
    String(branchResult.stdout).trim() !== PROTECTED_CURRENTNESS_REPAIR_BRANCH
  ) {
    return false;
  }
  const staged = stagedChangedPaths();
  if (staged.length === 0) return false;
  const lifecycle = evidenceFlowCurrentnessWorkItem(candidateRegistry)?.[
    EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_KEY
  ];
  if (!lifecycle) return false;
  const headSha = gitText(["rev-parse", "HEAD"]).trim();
  const sourceRegistry = loadRegistryFromCommit(headSha).parsed;
  if (
    evidenceFlowCurrentnessWorkItem(sourceRegistry)?.[
      EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_KEY
    ]
  ) {
    validateEvidenceFlowCurrentnessLifecycleSnapshot(sourceRegistry);
    validateEvidenceFlowCurrentnessLifecycleSnapshot(candidateRegistry);
    return false;
  }
  if (headSha !== EVIDENCE_FLOW_CURRENTNESS_SOURCE_HEAD_SHA) {
    throw new Error("rule=evidenceflow-currentness-index-source-head-mismatch");
  }
  assertEvidenceFlowCurrentnessLifecycleIndexPaths(staged);
  assertEvidenceFlowCurrentnessLifecycleIndexBlobs(candidateRegistry);
  validateEvidenceFlowCurrentnessLifecycleTransition(
    sourceRegistry,
    candidateRegistry
  );
  return true;
}

export const POST_PR83_CURRENTNESS_TASK_ID =
  "SENA-POST-PR83-CURRENTNESS-CORRECTION-20260903";
export const POST_PR83_CURRENTNESS_BRANCH =
  "codex/sena-post-pr83-currentness-correction-20260903";
export const POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA =
  "c1a7eb3e5a7ee359d49c03d2ce93a879fcce1fd3";
const POST_PR83_CURRENTNESS_SOURCE_TREE_SHA =
  "df9aecbef2332451b050a0525752e6ebfe51c891";
const POST_PR83_CURRENTNESS_SOURCE_PARENTS = [
  "0f74b59277ce1e4d31a49dac70c52d1c2d0ba9b6",
  "1cc64c17a6b1d562fee0bdb8b9737da50e25678a"
];
const POST_PR83_CURRENTNESS_SOURCE_REGISTRY_BLOB_SHA =
  "bf3b09be4e64c50a337b8c7d4a185d7c9d90b6f1";
const POST_PR83_CURRENTNESS_SOURCE_VERIFIER_BLOB_SHA =
  "c751ce564ff42c6f364e6ab711b986bdc061851b";
const POST_PR83_CURRENTNESS_SOURCE_TEST_BLOB_SHA =
  "07e28214f1c7d473ba1938eb03ef65122e5003f6";
const POST_PR83_CURRENTNESS_SOURCE_CANONICAL_REGISTRY_SHA256 =
  "c101919888965669b9078cdee839d95547b04616cb2e8712063ca09f5c5824f7";
const POST_PR83_CURRENTNESS_AUTHORIZATION_SHA256 =
  "6f52439b8b0947c1c7ad81e05f2182ecf9460265b3b2c9c77d75aed823f88279";
const POST_PR83_CURRENTNESS_INITIAL_REGISTRY_FILE_SHA256 =
  "33028441f4bc49d69f5efcf6de9a6e27b148a948490e05080d68d9e0201e4843";
const POST_PR83_CURRENTNESS_INITIAL_REGISTRY_CANONICAL_SHA256 =
  "5cf38051a3c5ef223e87cd941a957c8438f89cae783d34dda90e705d9713ec71";
const POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_HEAD_SHA =
  "22d307e8fa4106f2427f5d5ee178ed5231105a28";
const POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_TREE_SHA =
  "6c84fa32bb5c0b376a62087621c4f493ea55302f";
const POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_REGISTRY_BLOB_SHA =
  "e63010aea2f787aef90e589a121dec3bb12bb30a";
const POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_VERIFIER_BLOB_SHA =
  "a597b406ad6dd64b90dd38ca142e2af5ad9c9c4d";
const POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_TEST_BLOB_SHA =
  "95a7bb64483052a001cbe29639efebc96680a1b4";
const POST_PR83_CURRENTNESS_COMPATIBILITY_REGISTRY_FILE_SHA256 =
  "ff494d7119836aa5d234ca4cfabd8f7caca8a36108b10ce28aedc0b9f6f2148f";
const POST_PR83_CURRENTNESS_COMPATIBILITY_REGISTRY_CANONICAL_SHA256 =
  "0164b45f85557b32db5df540f0377e48e5abf87595803f2dc2de134285e4669f";
const POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_HEAD_SHA =
  "a365244b11c4d6549d9b7050111da9d83fb85f79";
const POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_TREE_SHA =
  "781ab302704fd2289fe5c193cd42320ae57e1f18";
const POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_REGISTRY_BLOB_SHA =
  "01a548f1bec891cd4ed16179461b34c390b64edf";
const POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_VERIFIER_BLOB_SHA =
  "0745f4de46a11e4eaea2033ef45d161771bce8ce";
const POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_TEST_BLOB_SHA =
  "84789ac73d53400fac7b62d5c98340c065af65e4";
const POST_PR83_CURRENTNESS_REVIEW_FIX_REGISTRY_FILE_SHA256 =
  "6155283f4f648f1efedd7d6e61423652781b8618b66207b7f4e7270bb5788e82";
const POST_PR83_CURRENTNESS_REVIEW_FIX_REGISTRY_CANONICAL_SHA256 =
  "69356f9ab07b9657b745c880459ddc9d7661bf45874b722607da2d346dcf8197";
const POST_PR83_CURRENTNESS_INITIAL_STATUS =
  "three-path-post-pr83-currentness-correction-initial-candidate";
const POST_PR83_CURRENTNESS_COMPATIBILITY_STATUS =
  "three-path-post-pr83-currentness-correction-compatibility-fix-candidate";
const POST_PR83_CURRENTNESS_REVIEW_FIX_STATUS =
  "three-path-post-pr83-currentness-correction-cumulative-review-fix-candidate";
const POST_PR83_CURRENTNESS_FINAL_STATUS =
  "registry-only-post-pr83-currentness-correction-final-candidate";
const POST_PR83_CURRENTNESS_LIFECYCLE_KEY =
  "postPr83CurrentnessCorrectionLifecycle";
const POST_PR83_CURRENTNESS_RECEIPT_KIND =
  "post-pr83-currentness-correction-initial-candidate";
const POST_PR83_CURRENTNESS_OBSERVATION_MODE =
  "protected-main-merge-chain";
const POST_PR83_CURRENTNESS_INITIAL_PATHS = [
  REGISTRY_REPO_PATH,
  "scripts/verify-sena-repo-governance.mjs",
  "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
];
const POST_PR83_CURRENTNESS_FINAL_PATHS = [REGISTRY_REPO_PATH];
const POST_PR83_CURRENTNESS_SOURCE_BINDING = {
  headSha: POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA,
  treeSha: POST_PR83_CURRENTNESS_SOURCE_TREE_SHA,
  orderedParentShas: POST_PR83_CURRENTNESS_SOURCE_PARENTS,
  registryBlobSha: POST_PR83_CURRENTNESS_SOURCE_REGISTRY_BLOB_SHA,
  verifierBlobSha: POST_PR83_CURRENTNESS_SOURCE_VERIFIER_BLOB_SHA,
  governanceTestBlobSha: POST_PR83_CURRENTNESS_SOURCE_TEST_BLOB_SHA,
  canonicalParsedRegistrySha256:
    POST_PR83_CURRENTNESS_SOURCE_CANONICAL_REGISTRY_SHA256
};
const POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_BINDING = {
  headSha: POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_HEAD_SHA,
  treeSha: POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_TREE_SHA,
  parentSha: POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA,
  registryBlobSha:
    POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_REGISTRY_BLOB_SHA,
  verifierBlobSha:
    POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_VERIFIER_BLOB_SHA,
  governanceTestBlobSha:
    POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_TEST_BLOB_SHA,
  rawRegistrySha256: POST_PR83_CURRENTNESS_INITIAL_REGISTRY_FILE_SHA256,
  canonicalParsedRegistrySha256:
    POST_PR83_CURRENTNESS_INITIAL_REGISTRY_CANONICAL_SHA256
};
const POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_BINDING = {
  headSha: POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_HEAD_SHA,
  treeSha: POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_TREE_SHA,
  parentSha: POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_HEAD_SHA,
  registryBlobSha: POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_REGISTRY_BLOB_SHA,
  verifierBlobSha: POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_VERIFIER_BLOB_SHA,
  governanceTestBlobSha: POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_TEST_BLOB_SHA,
  rawRegistrySha256: POST_PR83_CURRENTNESS_COMPATIBILITY_REGISTRY_FILE_SHA256,
  canonicalParsedRegistrySha256:
    POST_PR83_CURRENTNESS_COMPATIBILITY_REGISTRY_CANONICAL_SHA256
};
const POST_PR83_CURRENTNESS_APPROVED_INITIAL_CHAIN = [
  POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA,
  POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_HEAD_SHA,
  POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_HEAD_SHA
];
const POST_PR83_CURRENTNESS_COMPATIBILITY_TRANSITION = {
  mode: "one-exact-direct-three-path-child-of-review-rejected-22d307e8",
  requiredParentSha: POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_HEAD_SHA,
  requiredCandidatePaths: POST_PR83_CURRENTNESS_INITIAL_PATHS,
  requiredCumulativePathsFromProtectedMain:
    POST_PR83_CURRENTNESS_INITIAL_PATHS,
  candidateIdentityMustBeBoundByFinalEvidenceAndIndependentReviews: true,
  replayOrOtherDescendantAuthorized: false
};
const POST_PR83_CURRENTNESS_REVIEW_FIX_TRANSITION = {
  mode: "one-exact-direct-three-path-child-of-review-rejected-a365244b",
  requiredParentSha: POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_HEAD_SHA,
  requiredCandidatePaths: POST_PR83_CURRENTNESS_INITIAL_PATHS,
  requiredCumulativePathsFromProtectedMain:
    POST_PR83_CURRENTNESS_INITIAL_PATHS,
  candidateIdentityMustBeBoundByFinalEvidenceAndDetachedIndependentReviewReceipts:
    true,
  replayOrOtherDescendantAuthorized: false
};
const POST_PR83_CURRENTNESS_AUTHORIZATION = {
  mode: "exact-owner-message-sha256",
  authorizationMessageSha256: POST_PR83_CURRENTNESS_AUTHORIZATION_SHA256,
  requiredInitialPaths: POST_PR83_CURRENTNESS_INITIAL_PATHS,
  requiredFinalPaths: POST_PR83_CURRENTNESS_FINAL_PATHS
};
const POST_PR83_CURRENTNESS_PROTECTED_LANES = [
  {
    taskId: "SENA-A01-ROOT-CONTROL-PLANE-20260828",
    branch: "main",
    disposition: "integrated",
    headSha: "a8da14209a9e14a3a53e29e13c86ae8eecbd5928",
    ahead: 0,
    behind: 23
  },
  {
    taskId: "SENA-BRANCH-RETIREMENT-20260829",
    branch: "codex/sena-branch-retirement-20260829",
    disposition: "frozen-recovery",
    headSha: "e24c635d1f53fccb2264c6be002aec2775de127c",
    ahead: 8,
    behind: 28
  },
  {
    taskId: "SENA-PR82-CLEAN-FINAL-FORWARD-FIX-20260902",
    branch: "codex/sena-pr82-clean-final-forward-fix-20260902",
    disposition: "frozen-recovery",
    headSha: "0f74b59277ce1e4d31a49dac70c52d1c2d0ba9b6",
    ahead: 0,
    behind: 7
  }
];
const POST_PR83_CURRENTNESS_AUTHORIZATION_BOUNDARY = {
  initialCandidateCommitAuthorizedAfterGates: false,
  initialCandidatePushAndDraftPrAuthorizedAfterGates: false,
  compatibilityFixCommitAuthorizedAfterGates: false,
  compatibilityFixPushOrDraftPrAuthorizedNow: false,
  cumulativeReviewFixCommitAuthorizedAfterGates: true,
  cumulativeReviewFixPushOrDraftPrAuthorizedNow: false,
  finalRegistryOnlyTransitionAuthorizedAfterInitialChecks: true,
  prReadyMayBeAuthorizedOnlyAfterFinalHeadChecks: true,
  protectedMergeMayBeAuthorizedOnlyAfterFinalHeadChecks: true,
  prReadyAuthorizedNow: false,
  protectedMergeAuthorizedNow: false,
  pr46MutationAuthorized: false,
  evidenceFlowMutationAuthorized: false,
  casAuthorized: false,
  localRefRetirementAuthorized: false,
  retirementReceiptMintingAuthorized: false,
  branchDeletionAuthorized: false,
  worktreeRemovalAuthorized: false,
  orphanWorktreeMutationAuthorized: false,
  targetRefMutationAuthorized: false,
  targetTagMutationAuthorized: false,
  quarantineMutationAuthorized: false,
  deploymentAuthorized: false,
  providerMutationAuthorized: false,
  resetAuthorized: false,
  rebaseAuthorized: false,
  stashAuthorized: false,
  forceAuthorized: false,
  historyRewriteAuthorized: false
};
const POST_PR83_CURRENTNESS_EVIDENCE_KEYS = [
  "headSha",
  "treeSha",
  "registryBlobSha",
  "verifierBlobSha",
  "governanceTestBlobSha",
  "compatibilityDiffSha256",
  "cumulativeDiffSha256",
  "buildRunId",
  "repositorySecurityRunIds",
  "checkJobIds",
  "requiredChecksPassed",
  "annotationsEmpty",
  "specReview",
  "qualitySecurityReview"
];
const POST_PR83_CURRENTNESS_REVIEW_WRAPPER_KEYS = [
  "payload",
  "receiptSha256"
];
const POST_PR83_CURRENTNESS_REVIEW_PAYLOAD_KEYS = [
  "schema",
  "reviewKind",
  "reviewerTaskId",
  "actorId",
  "candidateHeadSha",
  "candidateTreeSha",
  "registryBlobSha",
  "verifierBlobSha",
  "governanceTestBlobSha",
  "compatibilityDiffSha256",
  "cumulativeDiffSha256",
  "findings",
  "verdict",
  "reviewedAt"
];

function postPr83CurrentnessItem(registry) {
  return (registry?.workItems ?? []).find(
    (entry) => entry?.taskId === POST_PR83_CURRENTNESS_TASK_ID
  );
}

function postPr83CurrentnessBranch(registry) {
  return (registry?.branches ?? []).find(
    (entry) => entry?.name === POST_PR83_CURRENTNESS_BRANCH
  );
}

function postPr83CurrentnessLifecycle(registry) {
  return postPr83CurrentnessItem(registry)?.[
    POST_PR83_CURRENTNESS_LIFECYCLE_KEY
  ];
}

function postPr83CurrentnessReceipt(registry) {
  return (registry?.releaseReceipts ?? []).find(
    (entry) => entry?.receiptKind === POST_PR83_CURRENTNESS_RECEIPT_KIND
  );
}

function postPr83RegistryBlobBuffer(commitSha) {
  const entry = entryAtCommit(commitSha, REGISTRY_REPO_PATH);
  if (!entry || entry.type !== "blob") return null;
  return blobBuffer(entry.oid).buffer;
}

function validatePostPr83CurrentnessSourceRegistry(sourceRegistry) {
  try {
    if (
      postPr83CurrentnessLifecycle(sourceRegistry) ||
      postPr83CurrentnessReceipt(sourceRegistry) ||
      sha256Buffer(Buffer.from(JSON.stringify(sourceRegistry))) !==
        POST_PR83_CURRENTNESS_SOURCE_CANONICAL_REGISTRY_SHA256 ||
      !gitObjectExists(`${POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA}^{commit}`) ||
      gitText([
        "rev-parse",
        `${POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA}^{tree}`
      ]).trim() !== POST_PR83_CURRENTNESS_SOURCE_TREE_SHA ||
      !sameJson(
        commitParents(POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA),
        POST_PR83_CURRENTNESS_SOURCE_PARENTS
      ) ||
      gitText([
        "rev-parse",
        `${POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA}:${REGISTRY_REPO_PATH}`
      ]).trim() !== POST_PR83_CURRENTNESS_SOURCE_REGISTRY_BLOB_SHA ||
      gitText([
        "rev-parse",
        `${POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA}:scripts/verify-sena-repo-governance.mjs`
      ]).trim() !== POST_PR83_CURRENTNESS_SOURCE_VERIFIER_BLOB_SHA ||
      gitText([
        "rev-parse",
        `${POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
      ]).trim() !== POST_PR83_CURRENTNESS_SOURCE_TEST_BLOB_SHA ||
      !sameJson(
        loadRegistryFromCommit(POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA).parsed,
        sourceRegistry
      )
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("rule=post-pr83-currentness-source-invalid");
  }
  return sourceRegistry;
}

export function validatePostPr83CurrentnessCorrectionInitialRegistryBytes(
  bytes
) {
  if (
    !Buffer.isBuffer(bytes) ||
    sha256Buffer(bytes) !== POST_PR83_CURRENTNESS_INITIAL_REGISTRY_FILE_SHA256
  ) {
    throw new Error(
      "rule=post-pr83-currentness-initial-registry-bytes-invalid"
    );
  }
  return true;
}

function validatePostPr83CurrentnessLifecycleShape(registry) {
  const lifecycle = postPr83CurrentnessLifecycle(registry);
  const receipt = postPr83CurrentnessReceipt(registry);
  if (
    !isPlainRecord(lifecycle) ||
    !exactPlainJsonOwnKeys(lifecycle, [
      "status",
      "oneShot",
      "sourceBinding",
      "compatibilitySourceBinding",
      "reviewFixSourceBinding",
      "approvedInitialChain",
      "compatibilityTransition",
      "reviewFixTransition",
      "authorization",
      "protectedLaneContracts",
      "authorizationBoundary",
      "initialCandidateCompletionEvidence"
    ]) ||
    ![
      POST_PR83_CURRENTNESS_INITIAL_STATUS,
      POST_PR83_CURRENTNESS_COMPATIBILITY_STATUS,
      POST_PR83_CURRENTNESS_REVIEW_FIX_STATUS,
      POST_PR83_CURRENTNESS_FINAL_STATUS
    ].includes(lifecycle.status) ||
    lifecycle.oneShot !== true ||
    !sameJson(lifecycle.sourceBinding, POST_PR83_CURRENTNESS_SOURCE_BINDING) ||
    !sameJson(
      lifecycle.compatibilitySourceBinding,
      POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_BINDING
    ) ||
    !sameJson(
      lifecycle.reviewFixSourceBinding,
      POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_BINDING
    ) ||
    !sameJson(
      lifecycle.approvedInitialChain,
      POST_PR83_CURRENTNESS_APPROVED_INITIAL_CHAIN
    ) ||
    !sameJson(
      lifecycle.compatibilityTransition,
      POST_PR83_CURRENTNESS_COMPATIBILITY_TRANSITION
    ) ||
    !sameJson(
      lifecycle.reviewFixTransition,
      POST_PR83_CURRENTNESS_REVIEW_FIX_TRANSITION
    ) ||
    !sameJson(lifecycle.authorization, POST_PR83_CURRENTNESS_AUTHORIZATION) ||
    !sameJson(
      lifecycle.protectedLaneContracts,
      POST_PR83_CURRENTNESS_PROTECTED_LANES
    ) ||
    !sameJson(
      lifecycle.authorizationBoundary,
      POST_PR83_CURRENTNESS_AUTHORIZATION_BOUNDARY
    ) ||
    !isPlainRecord(receipt) ||
    receipt.taskId !== POST_PR83_CURRENTNESS_TASK_ID ||
    receipt.ownerKey !== "Codex-post-pr83-currentness-correction-20260903" ||
    !sameJson(receipt.scope, POST_PR83_CURRENTNESS_INITIAL_PATHS) ||
    !sameJson(receipt.sourceBinding, POST_PR83_CURRENTNESS_SOURCE_BINDING) ||
    !sameJson(
      receipt.compatibilitySourceBinding,
      POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_BINDING
    ) ||
    !sameJson(
      receipt.reviewFixSourceBinding,
      POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_BINDING
    ) ||
    !sameJson(
      receipt.approvedInitialChain,
      POST_PR83_CURRENTNESS_APPROVED_INITIAL_CHAIN
    ) ||
    receipt.authorizationMessageSha256 !==
      POST_PR83_CURRENTNESS_AUTHORIZATION_SHA256 ||
    !sameJson(
      receipt.authorizationBoundary,
      POST_PR83_CURRENTNESS_AUTHORIZATION_BOUNDARY
    ) ||
    (registry.releaseReceipts ?? []).filter(
      (entry) => entry?.receiptKind === POST_PR83_CURRENTNESS_RECEIPT_KIND
    ).length !== 1 ||
    ([
      POST_PR83_CURRENTNESS_INITIAL_STATUS,
      POST_PR83_CURRENTNESS_COMPATIBILITY_STATUS,
      POST_PR83_CURRENTNESS_REVIEW_FIX_STATUS
    ].includes(lifecycle.status) &&
      lifecycle.initialCandidateCompletionEvidence !== null) ||
    (lifecycle.status === POST_PR83_CURRENTNESS_FINAL_STATUS &&
      !isPlainRecord(lifecycle.initialCandidateCompletionEvidence))
  ) {
    throw new Error("rule=post-pr83-currentness-lifecycle-invalid");
  }
  return lifecycle;
}

export function validatePostPr83CurrentnessCorrectionInitialTransition(
  sourceRegistry,
  candidateRegistry
) {
  validatePostPr83CurrentnessSourceRegistry(sourceRegistry);
  if (
    sha256Buffer(Buffer.from(JSON.stringify(candidateRegistry))) !==
      POST_PR83_CURRENTNESS_INITIAL_REGISTRY_CANONICAL_SHA256
  ) {
    throw new Error("rule=post-pr83-currentness-initial-transition-invalid");
  }
  if (
    postPr83CurrentnessLifecycle(candidateRegistry)?.status !==
      POST_PR83_CURRENTNESS_INITIAL_STATUS ||
    postPr83CurrentnessReceipt(candidateRegistry)?.receiptKind !==
      POST_PR83_CURRENTNESS_RECEIPT_KIND
  ) {
    throw new Error("rule=post-pr83-currentness-initial-transition-invalid");
  }
  return true;
}

function validatePostPr83CompatibilitySourceRegistry(sourceRegistry) {
  try {
    const rawRegistry = postPr83RegistryBlobBuffer(
      POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_HEAD_SHA
    );
    if (
      !rawRegistry ||
      sha256Buffer(rawRegistry) !==
        POST_PR83_CURRENTNESS_INITIAL_REGISTRY_FILE_SHA256 ||
      sha256Buffer(Buffer.from(JSON.stringify(sourceRegistry))) !==
        POST_PR83_CURRENTNESS_INITIAL_REGISTRY_CANONICAL_SHA256 ||
      gitText([
        "rev-parse",
        `${POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_HEAD_SHA}^{tree}`
      ]).trim() !== POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_TREE_SHA ||
      !sameJson(
        commitParents(POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_HEAD_SHA),
        [POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA]
      ) ||
      gitText([
        "rev-parse",
        `${POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_HEAD_SHA}:${REGISTRY_REPO_PATH}`
      ]).trim() !==
        POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_REGISTRY_BLOB_SHA ||
      gitText([
        "rev-parse",
        `${POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_HEAD_SHA}:scripts/verify-sena-repo-governance.mjs`
      ]).trim() !==
        POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_VERIFIER_BLOB_SHA ||
      gitText([
        "rev-parse",
        `${POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_HEAD_SHA}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
      ]).trim() !== POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_TEST_BLOB_SHA ||
      !sameJson(
        loadRegistryFromCommit(
          POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_HEAD_SHA
        ).parsed,
        sourceRegistry
      ) ||
      postPr83CurrentnessLifecycle(sourceRegistry)?.status !==
        POST_PR83_CURRENTNESS_INITIAL_STATUS
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("rule=post-pr83-currentness-compatibility-source-invalid");
  }
  return sourceRegistry;
}

export function validatePostPr83CurrentnessCorrectionCompatibilityRegistryBytes(
  bytes
) {
  if (
    !Buffer.isBuffer(bytes) ||
    sha256Buffer(bytes) !==
      POST_PR83_CURRENTNESS_COMPATIBILITY_REGISTRY_FILE_SHA256
  ) {
    throw new Error(
      "rule=post-pr83-currentness-compatibility-registry-bytes-invalid"
    );
  }
  return true;
}

export function validatePostPr83CurrentnessCorrectionCompatibilityTransition(
  sourceRegistry,
  candidateRegistry
) {
  if (
    sha256Buffer(Buffer.from(JSON.stringify(sourceRegistry))) ===
      POST_PR83_CURRENTNESS_COMPATIBILITY_REGISTRY_CANONICAL_SHA256
  ) {
    throw new Error("rule=post-pr83-currentness-compatibility-transition-replay");
  }
  validatePostPr83CompatibilitySourceRegistry(sourceRegistry);
  if (
    sha256Buffer(Buffer.from(JSON.stringify(candidateRegistry))) !==
      POST_PR83_CURRENTNESS_COMPATIBILITY_REGISTRY_CANONICAL_SHA256
  ) {
    throw new Error(
      "rule=post-pr83-currentness-compatibility-transition-invalid"
    );
  }
  if (
    postPr83CurrentnessLifecycle(candidateRegistry)?.status !==
      POST_PR83_CURRENTNESS_COMPATIBILITY_STATUS ||
    postPr83CurrentnessReceipt(candidateRegistry)?.receiptKind !==
      POST_PR83_CURRENTNESS_RECEIPT_KIND
  ) {
    throw new Error(
      "rule=post-pr83-currentness-compatibility-transition-invalid"
    );
  }
  return true;
}

function validatePostPr83ReviewFixSourceRegistry(sourceRegistry) {
  try {
    const rawRegistry = postPr83RegistryBlobBuffer(
      POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_HEAD_SHA
    );
    if (
      !rawRegistry ||
      sha256Buffer(rawRegistry) !==
        POST_PR83_CURRENTNESS_COMPATIBILITY_REGISTRY_FILE_SHA256 ||
      sha256Buffer(Buffer.from(JSON.stringify(sourceRegistry))) !==
        POST_PR83_CURRENTNESS_COMPATIBILITY_REGISTRY_CANONICAL_SHA256 ||
      gitText([
        "rev-parse",
        `${POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_HEAD_SHA}^{tree}`
      ]).trim() !== POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_TREE_SHA ||
      !sameJson(
        commitParents(POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_HEAD_SHA),
        [POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_HEAD_SHA]
      ) ||
      gitText([
        "rev-parse",
        `${POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_HEAD_SHA}:${REGISTRY_REPO_PATH}`
      ]).trim() !== POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_REGISTRY_BLOB_SHA ||
      gitText([
        "rev-parse",
        `${POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_HEAD_SHA}:scripts/verify-sena-repo-governance.mjs`
      ]).trim() !== POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_VERIFIER_BLOB_SHA ||
      gitText([
        "rev-parse",
        `${POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_HEAD_SHA}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
      ]).trim() !== POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_TEST_BLOB_SHA ||
      !sameJson(
        loadRegistryFromCommit(
          POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_HEAD_SHA
        ).parsed,
        sourceRegistry
      ) ||
      postPr83CurrentnessLifecycle(sourceRegistry)?.status !==
        POST_PR83_CURRENTNESS_COMPATIBILITY_STATUS
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("rule=post-pr83-currentness-review-fix-source-invalid");
  }
  return sourceRegistry;
}

export function validatePostPr83CurrentnessCorrectionReviewFixRegistryBytes(
  bytes
) {
  if (
    !Buffer.isBuffer(bytes) ||
    sha256Buffer(bytes) !== POST_PR83_CURRENTNESS_REVIEW_FIX_REGISTRY_FILE_SHA256
  ) {
    throw new Error(
      "rule=post-pr83-currentness-review-fix-registry-bytes-invalid"
    );
  }
  return true;
}

export function validatePostPr83CurrentnessCorrectionReviewFixTransition(
  sourceRegistry,
  candidateRegistry
) {
  if (
    sha256Buffer(Buffer.from(JSON.stringify(sourceRegistry))) ===
      POST_PR83_CURRENTNESS_REVIEW_FIX_REGISTRY_CANONICAL_SHA256
  ) {
    throw new Error("rule=post-pr83-currentness-review-fix-transition-replay");
  }
  validatePostPr83ReviewFixSourceRegistry(sourceRegistry);
  if (
    sha256Buffer(Buffer.from(JSON.stringify(candidateRegistry))) !==
      POST_PR83_CURRENTNESS_REVIEW_FIX_REGISTRY_CANONICAL_SHA256
  ) {
    throw new Error("rule=post-pr83-currentness-review-fix-transition-invalid");
  }
  try {
    if (
      validatePostPr83CurrentnessLifecycleShape(candidateRegistry).status !==
      POST_PR83_CURRENTNESS_REVIEW_FIX_STATUS
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("rule=post-pr83-currentness-review-fix-transition-invalid");
  }
  return true;
}

function postPr83CanonicalBinaryDiffSha256(fromSha, toSha) {
  const result = git([
    "diff",
    "--binary",
    "--full-index",
    fromSha,
    toSha,
    "--",
    ...POST_PR83_CURRENTNESS_INITIAL_PATHS
  ], { binary: true, allowFailure: true });
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) return null;
  return sha256Buffer(result.stdout);
}

function validatePostPr83ReviewEvidence(
  review,
  expectedKind,
  evidence
) {
  const expectedReviewer = expectedKind === "specification"
    ? {
        reviewerTaskId: "/root/post_pr83_spec_review",
        actorId: "agent:post_pr83_spec_review"
      }
    : expectedKind === "quality-security"
      ? {
          reviewerTaskId: "/root/post_pr83_quality_security_review",
          actorId: "agent:post_pr83_quality_security_review"
        }
      : null;
  const payload = review?.payload;
  if (
    !expectedReviewer ||
    !isPlainRecord(review) ||
    !sameJson(Object.keys(review), POST_PR83_CURRENTNESS_REVIEW_WRAPPER_KEYS) ||
    !isPlainRecord(payload) ||
    !sameJson(Object.keys(payload), POST_PR83_CURRENTNESS_REVIEW_PAYLOAD_KEYS) ||
    payload.schema !== "sena-post-pr83-independent-review/v1" ||
    payload.reviewKind !== expectedKind ||
    payload.reviewerTaskId !== expectedReviewer.reviewerTaskId ||
    payload.actorId !== expectedReviewer.actorId ||
    payload.candidateHeadSha !== evidence.headSha ||
    payload.candidateTreeSha !== evidence.treeSha ||
    payload.registryBlobSha !== evidence.registryBlobSha ||
    payload.verifierBlobSha !== evidence.verifierBlobSha ||
    payload.governanceTestBlobSha !== evidence.governanceTestBlobSha ||
    payload.compatibilityDiffSha256 !== evidence.compatibilityDiffSha256 ||
    payload.cumulativeDiffSha256 !== evidence.cumulativeDiffSha256 ||
    !isPlainRecord(payload.findings) ||
    !sameJson(Object.keys(payload.findings), ["p0", "p1", "p2", "p3"]) ||
    !sameJson(payload.findings, { p0: 0, p1: 0, p2: 0, p3: 0 }) ||
    payload.verdict !== "approved" ||
    !isIsoTimestamp(payload.reviewedAt) ||
    !validSha256(review.receiptSha256)
  ) {
    return false;
  }
  return (
    sha256Buffer(Buffer.from(JSON.stringify(payload), "utf8")) ===
    review.receiptSha256
  );
}

function validatePostPr83CurrentnessCompletionEvidence(
  evidence,
  sourceHeadSha,
  sourceRegistry,
  options = {}
) {
  try {
    const rawRegistry = postPr83RegistryBlobBuffer(sourceHeadSha);
    if (
      !isPlainRecord(evidence) ||
      !exactPlainJsonOwnKeys(evidence, POST_PR83_CURRENTNESS_EVIDENCE_KEYS) ||
      evidence.headSha !== sourceHeadSha ||
      !isSha(evidence.treeSha) ||
      !isSha(evidence.registryBlobSha) ||
      !isSha(evidence.verifierBlobSha) ||
      !isSha(evidence.governanceTestBlobSha) ||
      !validSha256(evidence.compatibilityDiffSha256) ||
      !validSha256(evidence.cumulativeDiffSha256) ||
      !Number.isInteger(evidence.buildRunId) ||
      evidence.buildRunId <= 0 ||
      !exactDistinctPositiveIntegerArray(evidence.repositorySecurityRunIds, 2) ||
      !exactDistinctPositiveIntegerArray(evidence.checkJobIds, 3) ||
      evidence.requiredChecksPassed !== true ||
      evidence.annotationsEmpty !== true ||
      !rawRegistry ||
      sha256Buffer(rawRegistry) !==
        POST_PR83_CURRENTNESS_REVIEW_FIX_REGISTRY_FILE_SHA256 ||
      !sameJson(sourceRegistry, loadRegistryFromCommit(sourceHeadSha).parsed) ||
      sha256Buffer(Buffer.from(JSON.stringify(sourceRegistry))) !==
        POST_PR83_CURRENTNESS_REVIEW_FIX_REGISTRY_CANONICAL_SHA256 ||
      !sameJson(commitParents(sourceHeadSha), [
        POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_HEAD_SHA
      ]) ||
      !sameStringSet(
        protectedMainAdvanceChangedPaths(
          POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_HEAD_SHA,
          sourceHeadSha
        ) ?? [],
        POST_PR83_CURRENTNESS_INITIAL_PATHS
      ) ||
      !sameStringSet(
        protectedMainAdvanceChangedPaths(
          POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_HEAD_SHA,
          sourceHeadSha
        ) ?? [],
        POST_PR83_CURRENTNESS_INITIAL_PATHS
      ) ||
      !sameStringSet(
        protectedMainAdvanceChangedPaths(
          POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA,
          sourceHeadSha
        ) ?? [],
        POST_PR83_CURRENTNESS_INITIAL_PATHS
      ) ||
      postPr83CanonicalBinaryDiffSha256(
        POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_HEAD_SHA,
        sourceHeadSha
      ) !== evidence.compatibilityDiffSha256 ||
      postPr83CanonicalBinaryDiffSha256(
        POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA,
        sourceHeadSha
      ) !== evidence.cumulativeDiffSha256 ||
      gitText(["rev-parse", `${sourceHeadSha}^{tree}`]).trim() !==
        evidence.treeSha ||
      gitText([
        "rev-parse",
        `${sourceHeadSha}:${REGISTRY_REPO_PATH}`
      ]).trim() !== evidence.registryBlobSha ||
      gitText([
        "rev-parse",
        `${sourceHeadSha}:scripts/verify-sena-repo-governance.mjs`
      ]).trim() !== evidence.verifierBlobSha ||
      gitText([
        "rev-parse",
        `${sourceHeadSha}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
      ]).trim() !== evidence.governanceTestBlobSha ||
      !validatePostPr83ReviewEvidence(
        evidence.specReview,
        "specification",
        evidence
      ) ||
      !validatePostPr83ReviewEvidence(
        evidence.qualitySecurityReview,
        "quality-security",
        evidence
      ) ||
      evidence.specReview.payload.reviewerTaskId ===
        evidence.qualitySecurityReview.payload.reviewerTaskId ||
      evidence.specReview.payload.actorId ===
        evidence.qualitySecurityReview.payload.actorId ||
      (options.requireCheckedOutSource === true &&
        (gitText(["rev-parse", "HEAD"]).trim() !== sourceHeadSha ||
          gitText([
            "symbolic-ref",
            "--quiet",
            "--short",
            "HEAD"
          ]).trim() !== POST_PR83_CURRENTNESS_BRANCH ||
          gitText([
            "rev-parse",
            `refs/heads/${POST_PR83_CURRENTNESS_BRANCH}`
          ]).trim() !== sourceHeadSha))
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("rule=post-pr83-currentness-final-evidence-invalid");
  }
  return true;
}

function normalizedPostPr83FinalRegistrySha256(registry) {
  const copy = JSON.parse(JSON.stringify(registry));
  copy.updatedAt = "<post-pr83-final-owned>";
  const item = postPr83CurrentnessItem(copy);
  const branch = postPr83CurrentnessBranch(copy);
  for (const field of [
    "headSha",
    "aheadBehind",
    "lastHeartbeatAt",
    "lastObservedAt",
    "nextReviewAt",
    "prNumber",
    "noPrReason",
    "prState",
    "prIsDraft",
    "prReadyForReview",
    "mergeAuthorized",
    "prHeadSha",
    "dirtyState",
    "evidenceState"
  ]) {
    if (item) item[field] = `<post-pr83-final-item:${field}>`;
  }
  if (item?.[POST_PR83_CURRENTNESS_LIFECYCLE_KEY]) {
    item[POST_PR83_CURRENTNESS_LIFECYCLE_KEY].status =
      "<post-pr83-final-status>";
    item[
      POST_PR83_CURRENTNESS_LIFECYCLE_KEY
    ].initialCandidateCompletionEvidence = "<post-pr83-final-evidence>";
  }
  for (const field of [
    "headSha",
    "upstream",
    "upstreamState",
    "upstreamCacheState",
    "remotePresent",
    "remoteHeadSha",
    "remoteObservedAt",
    "pr",
    "prState",
    "prIsDraft",
    "prReadyForReview",
    "mergeAuthorized",
    "prHeadSha",
    "prBase",
    "prStateObservationMode",
    "noPrReason",
    "lastOwnerHeartbeatAt",
    "lastObservedAt",
    "lastCommitAt",
    "nextReviewAt",
    "closeout",
    "mergeable",
    "mergeStateStatus"
  ]) {
    if (branch) branch[field] = `<post-pr83-final-branch:${field}>`;
  }
  return sha256Buffer(Buffer.from(JSON.stringify(copy)));
}

function validatePostPr83CurrentnessFinalFields(
  sourceRegistry,
  candidateRegistry,
  sourceHeadSha,
  options = {}
) {
  const sourceLifecycle = validatePostPr83CurrentnessLifecycleShape(
    sourceRegistry
  );
  const candidateLifecycle = validatePostPr83CurrentnessLifecycleShape(
    candidateRegistry
  );
  const item = postPr83CurrentnessItem(candidateRegistry);
  const branch = postPr83CurrentnessBranch(candidateRegistry);
  const evidence = candidateLifecycle.initialCandidateCompletionEvidence;
  const sourceCommitAt = gitText([
    "show",
    "-s",
    "--format=%cI",
    sourceHeadSha
  ]).trim();
  if (
    sourceLifecycle.status !== POST_PR83_CURRENTNESS_REVIEW_FIX_STATUS ||
    candidateLifecycle.status !== POST_PR83_CURRENTNESS_FINAL_STATUS ||
    normalizedPostPr83FinalRegistrySha256(sourceRegistry) !==
      normalizedPostPr83FinalRegistrySha256(candidateRegistry) ||
    item?.headSha !== sourceHeadSha ||
    !sameJson(item?.aheadBehind, {
      baseRef: "origin/main",
      ahead: 3,
      behind: 0
    }) ||
    !Number.isInteger(item.prNumber) ||
    item.prNumber <= 0 ||
    item.noPrReason !== null ||
    item.prState !== "OPEN" ||
    item.prIsDraft !== true ||
    item.prReadyForReview !== false ||
    item.mergeAuthorized !== false ||
    item.prHeadSha !== sourceHeadSha ||
    !String(item.dirtyState ?? "").startsWith(
      "clean-registry-only-post-pr83-currentness-correction-final-candidate"
    ) ||
    branch?.headSha !== sourceHeadSha ||
    branch.upstream !== `origin/${POST_PR83_CURRENTNESS_BRANCH}` ||
    branch.upstreamState !== "live" ||
    branch.upstreamCacheState !== "present" ||
    branch.remotePresent !== true ||
    branch.remoteHeadSha !== sourceHeadSha ||
    branch.pr !== item.prNumber ||
    branch.prState !== "OPEN" ||
    branch.prIsDraft !== true ||
    branch.prReadyForReview !== false ||
    branch.mergeAuthorized !== false ||
    branch.prHeadSha !== sourceHeadSha ||
    branch.prBase !== "main" ||
    branch.prStateObservationMode !== "monotonic" ||
    branch.noPrReason !== null ||
    branch.lastCommitAt !== sourceCommitAt ||
    branch.mergeable !== "MERGEABLE" ||
    branch.mergeStateStatus !== "CLEAN" ||
    candidateRegistry.updatedAt !== item.lastObservedAt ||
    item.lastHeartbeatAt !== item.lastObservedAt ||
    branch.remoteObservedAt !== item.lastObservedAt ||
    branch.lastOwnerHeartbeatAt !== item.lastObservedAt ||
    branch.lastObservedAt !== item.lastObservedAt ||
    branch.nextReviewAt !== item.nextReviewAt ||
    Date.parse(item.nextReviewAt) <= Date.parse(item.lastObservedAt)
  ) {
    throw new Error("rule=post-pr83-currentness-final-transition-invalid");
  }
  validatePostPr83CurrentnessCompletionEvidence(
    evidence,
    sourceHeadSha,
    sourceRegistry,
    options
  );
  return evidence;
}

function postPr83GithubApiJson(path) {
  try {
    return githubApiJson(path);
  } catch {
    throw new Error("rule=post-pr83-currentness-live-github-readback-failed");
  }
}

function validatePostPr83CurrentnessLiveGitHubEvidence(
  evidence,
  pullRequestNumber,
  sourceHeadSha
) {
  const buildRun = postPr83GithubApiJson(
    `repos/HUDongpin/SENA/actions/runs/${evidence.buildRunId}`
  );
  const securityRuns = evidence.repositorySecurityRunIds.map((runId) =>
    postPr83GithubApiJson(`repos/HUDongpin/SENA/actions/runs/${runId}`)
  );
  const jobs = evidence.checkJobIds.map((jobId) =>
    postPr83GithubApiJson(`repos/HUDongpin/SENA/actions/jobs/${jobId}`)
  );
  const annotations = evidence.checkJobIds.map((jobId) =>
    postPr83GithubApiJson(
      `repos/HUDongpin/SENA/check-runs/${jobId}/annotations`
    )
  );
  const pullRequest = postPr83GithubApiJson(
    `repos/HUDongpin/SENA/pulls/${pullRequestNumber}`
  );
  const remoteRef = postPr83GithubApiJson(
    `repos/HUDongpin/SENA/git/ref/heads/${POST_PR83_CURRENTNESS_BRANCH}`
  );
  const runExact = (run, name, event) =>
    isPlainRecord(run) &&
    run.name === name &&
    run.event === event &&
    run.head_sha === sourceHeadSha &&
    run.head_branch === POST_PR83_CURRENTNESS_BRANCH &&
    run.head_repository?.full_name === "HUDongpin/SENA" &&
    run.status === "completed" &&
    run.conclusion === "success";
  const jobExact = (job, runId, name) =>
    isPlainRecord(job) &&
    job.run_id === runId &&
    job.name === name &&
    job.head_sha === sourceHeadSha &&
    job.status === "completed" &&
    job.conclusion === "success";
  if (
    !runExact(buildRun, "build-gate", "pull_request") ||
    !runExact(securityRuns[0], "repo-security-gate", "push") ||
    !runExact(securityRuns[1], "repo-security-gate", "pull_request") ||
    !jobExact(jobs[0], evidence.buildRunId, "build") ||
    !jobExact(
      jobs[1],
      evidence.repositorySecurityRunIds[0],
      "repository-security"
    ) ||
    !jobExact(
      jobs[2],
      evidence.repositorySecurityRunIds[1],
      "repository-security"
    ) ||
    annotations.some((entry) => !Array.isArray(entry) || entry.length !== 0) ||
    !isPlainRecord(pullRequest) ||
    pullRequest.number !== pullRequestNumber ||
    pullRequest.state !== "open" ||
    pullRequest.draft !== true ||
    pullRequest.head?.sha !== sourceHeadSha ||
    pullRequest.head?.ref !== POST_PR83_CURRENTNESS_BRANCH ||
    pullRequest.head?.repo?.full_name !== "HUDongpin/SENA" ||
    pullRequest.base?.ref !== "main" ||
    pullRequest.base?.repo?.full_name !== "HUDongpin/SENA" ||
    !isPlainRecord(remoteRef) ||
    remoteRef.ref !== `refs/heads/${POST_PR83_CURRENTNESS_BRANCH}` ||
    remoteRef.object?.sha !== sourceHeadSha
  ) {
    throw new Error("rule=post-pr83-currentness-live-github-readback-invalid");
  }
  return true;
}

export function validatePostPr83FinalHeadLiveGitHubEvidence(
  descriptor,
  pullRequestNumber
) {
  const finalHeadSha = descriptor?.secondParentSha;
  const mergeCommitSha = descriptor?.mergeCommitSha;
  if (
    !isSha(finalHeadSha) ||
    !isSha(mergeCommitSha) ||
    !Number.isInteger(pullRequestNumber) ||
    pullRequestNumber <= 0
  ) {
    throw new Error("rule=post-pr83-final-head-live-evidence-invalid");
  }
  const runsResponse = postPr83GithubApiJson(
    `repos/HUDongpin/SENA/actions/runs?head_sha=${finalHeadSha}&per_page=100`
  );
  const runs = Array.isArray(runsResponse?.workflow_runs)
    ? runsResponse.workflow_runs
    : [];
  const selectRun = (name, event) =>
    runs.filter(
      (run) =>
        isPlainRecord(run) &&
        run.name === name &&
        run.event === event &&
        run.head_sha === finalHeadSha &&
        run.head_branch === POST_PR83_CURRENTNESS_BRANCH &&
        run.head_repository?.full_name === "HUDongpin/SENA" &&
        run.status === "completed" &&
        run.conclusion === "success" &&
        Number.isInteger(run.id) &&
        run.id > 0
    );
  const buildRuns = selectRun("build-gate", "pull_request");
  const pushSecurityRuns = selectRun("repo-security-gate", "push");
  const prSecurityRuns = selectRun("repo-security-gate", "pull_request");
  if (
    buildRuns.length !== 1 ||
    pushSecurityRuns.length !== 1 ||
    prSecurityRuns.length !== 1 ||
    new Set([
      buildRuns[0].id,
      pushSecurityRuns[0].id,
      prSecurityRuns[0].id
    ]).size !== 3
  ) {
    throw new Error("rule=post-pr83-final-head-live-evidence-invalid");
  }
  const expectedRuns = [
    [buildRuns[0], "build"],
    [pushSecurityRuns[0], "repository-security"],
    [prSecurityRuns[0], "repository-security"]
  ];
  const observedJobIds = [];
  for (const [run, expectedJobName] of expectedRuns) {
    const jobsResponse = postPr83GithubApiJson(
      `repos/HUDongpin/SENA/actions/runs/${run.id}/jobs`
    );
    const matchingJobs = (jobsResponse?.jobs ?? []).filter(
      (job) =>
        isPlainRecord(job) &&
        job.run_id === run.id &&
        job.name === expectedJobName &&
        job.head_sha === finalHeadSha &&
        job.status === "completed" &&
        job.conclusion === "success" &&
        Number.isInteger(job.id) &&
        job.id > 0
    );
    if (matchingJobs.length !== 1) {
      throw new Error("rule=post-pr83-final-head-live-evidence-invalid");
    }
    observedJobIds.push(matchingJobs[0].id);
    const annotations = postPr83GithubApiJson(
      `repos/HUDongpin/SENA/check-runs/${matchingJobs[0].id}/annotations`
    );
    if (!Array.isArray(annotations) || annotations.length !== 0) {
      throw new Error("rule=post-pr83-final-head-live-evidence-invalid");
    }
  }
  if (new Set(observedJobIds).size !== 3) {
    throw new Error("rule=post-pr83-final-head-live-evidence-invalid");
  }
  const pullRequest = postPr83GithubApiJson(
    `repos/HUDongpin/SENA/pulls/${pullRequestNumber}`
  );
  const remoteRef = postPr83GithubApiJson(
    `repos/HUDongpin/SENA/git/ref/heads/${POST_PR83_CURRENTNESS_BRANCH}`
  );
  const suites = postPr83GithubApiJson(
    "repos/HUDongpin/SENA/rulesets/rule-suites?ref=refs/heads/main&time_period=day&per_page=100"
  );
  const matchingSuites = Array.isArray(suites)
    ? suites.filter(
        (suite) =>
          isPlainRecord(suite) &&
          Number.isInteger(suite.id) &&
          suite.id > 0 &&
          suite.actor_name === "HUDongpin" &&
          suite.before_sha === POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA &&
          suite.after_sha === mergeCommitSha &&
          suite.repository_name === "SENA" &&
          suite.result === "pass"
      )
    : [];
  if (
    !isPlainRecord(pullRequest) ||
    pullRequest.number !== pullRequestNumber ||
    pullRequest.state !== "closed" ||
    pullRequest.draft !== false ||
    pullRequest.merged !== true ||
    pullRequest.merge_commit_sha !== mergeCommitSha ||
    pullRequest.head?.sha !== finalHeadSha ||
    pullRequest.head?.ref !== POST_PR83_CURRENTNESS_BRANCH ||
    pullRequest.head?.repo?.full_name !== "HUDongpin/SENA" ||
    pullRequest.base?.ref !== "main" ||
    pullRequest.base?.repo?.full_name !== "HUDongpin/SENA" ||
    !isPlainRecord(remoteRef) ||
    remoteRef.ref !== `refs/heads/${POST_PR83_CURRENTNESS_BRANCH}` ||
    remoteRef.object?.sha !== finalHeadSha ||
    matchingSuites.length !== 1
  ) {
    throw new Error("rule=post-pr83-final-head-live-evidence-invalid");
  }
  const suite = postPr83GithubApiJson(
    `repos/HUDongpin/SENA/rulesets/rule-suites/${matchingSuites[0].id}`
  );
  const evaluations = Array.isArray(suite?.rule_evaluations)
    ? suite.rule_evaluations
    : [];
  if (
    suite?.id !== matchingSuites[0].id ||
    suite.actor_name !== "HUDongpin" ||
    suite.before_sha !== POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA ||
    suite.after_sha !== mergeCommitSha ||
    suite.repository_name !== "SENA" ||
    suite.result !== "pass" ||
    evaluations.length !== 4 ||
    !sameStringSet(
      evaluations.map((entry) => entry?.rule_type),
      ["required_status_checks", "pull_request", "non_fast_forward", "deletion"]
    ) ||
    evaluations.some(
      (entry) =>
        entry?.enforcement !== "active" ||
        entry?.result !== "pass" ||
        entry?.rule_source?.id !== 21232887 ||
        entry?.rule_source?.name !== "main-minimum-safety" ||
        entry?.rule_source?.type !== "ruleset"
    )
  ) {
    throw new Error("rule=post-pr83-final-head-live-evidence-invalid");
  }
  return true;
}

export function validatePostPr83CurrentnessCorrectionFinalTransition(
  sourceRegistry,
  candidateRegistry,
  sourceHeadSha,
  observedCompletionEvidence = null
) {
  const evidence = validatePostPr83CurrentnessFinalFields(
    sourceRegistry,
    candidateRegistry,
    sourceHeadSha,
    { requireCheckedOutSource: true }
  );
  if (
    observedCompletionEvidence &&
    !sameJson(evidence, observedCompletionEvidence)
  ) {
    throw new Error(
      "rule=post-pr83-currentness-final-evidence-context-mismatch"
    );
  }
  validatePostPr83CurrentnessLiveGitHubEvidence(
    evidence,
    postPr83CurrentnessItem(candidateRegistry).prNumber,
    sourceHeadSha
  );
  return true;
}

function postPr83CompletionContextFromEnvironment() {
  const parseReview = (name) => {
    try {
      return JSON.parse(process.env[name] ?? "null");
    } catch {
      return null;
    }
  };
  return {
    headSha: process.env.SENA_POST_PR83_INITIAL_HEAD ?? "",
    treeSha: process.env.SENA_POST_PR83_INITIAL_TREE ?? "",
    registryBlobSha:
      process.env.SENA_POST_PR83_INITIAL_REGISTRY_BLOB ?? "",
    verifierBlobSha:
      process.env.SENA_POST_PR83_INITIAL_VERIFIER_BLOB ?? "",
    governanceTestBlobSha:
      process.env.SENA_POST_PR83_INITIAL_GOVERNANCE_TEST_BLOB ?? "",
    compatibilityDiffSha256:
      process.env.SENA_POST_PR83_INITIAL_COMPATIBILITY_DIFF_SHA256 ?? "",
    cumulativeDiffSha256:
      process.env.SENA_POST_PR83_INITIAL_CUMULATIVE_DIFF_SHA256 ?? "",
    buildRunId: Number(process.env.SENA_POST_PR83_INITIAL_BUILD_RUN_ID),
    repositorySecurityRunIds: commaSeparatedPositiveIntegers(
      process.env.SENA_POST_PR83_INITIAL_REPOSITORY_SECURITY_RUN_IDS
    ),
    checkJobIds: commaSeparatedPositiveIntegers(
      process.env.SENA_POST_PR83_INITIAL_CHECK_JOB_IDS
    ),
    requiredChecksPassed:
      process.env.SENA_POST_PR83_INITIAL_REQUIRED_CHECKS_PASSED === "true",
    annotationsEmpty:
      process.env.SENA_POST_PR83_INITIAL_ANNOTATIONS_EMPTY === "true",
    specReview: parseReview("SENA_POST_PR83_INITIAL_SPEC_REVIEW_JSON"),
    qualitySecurityReview: parseReview(
      "SENA_POST_PR83_INITIAL_QUALITY_SECURITY_REVIEW_JSON"
    )
  };
}

export function validatePostPr83CurrentnessCorrectionSnapshot(registry) {
  const lifecycle = validatePostPr83CurrentnessLifecycleShape(registry);
  if (lifecycle.status === POST_PR83_CURRENTNESS_INITIAL_STATUS) {
    validatePostPr83CurrentnessCorrectionInitialTransition(
      loadRegistryFromCommit(POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA).parsed,
      registry
    );
  } else if (
    lifecycle.status === POST_PR83_CURRENTNESS_COMPATIBILITY_STATUS
  ) {
    validatePostPr83CurrentnessCorrectionCompatibilityTransition(
      loadRegistryFromCommit(
        POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_HEAD_SHA
      ).parsed,
      registry
    );
  } else if (lifecycle.status === POST_PR83_CURRENTNESS_REVIEW_FIX_STATUS) {
    validatePostPr83CurrentnessCorrectionReviewFixTransition(
      loadRegistryFromCommit(
        POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_HEAD_SHA
      ).parsed,
      registry
    );
  } else {
    const sourceHeadSha =
      lifecycle.initialCandidateCompletionEvidence?.headSha;
    if (!isSha(sourceHeadSha)) {
      throw new Error("rule=post-pr83-currentness-final-evidence-invalid");
    }
    validatePostPr83CurrentnessFinalFields(
      loadRegistryFromCommit(sourceHeadSha).parsed,
      registry,
      sourceHeadSha
    );
  }
  return lifecycle;
}

function validatePostPr83CurrentnessIndexTransition(candidateRegistry) {
  const branchResult = git([
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD"
  ], { allowFailure: true });
  if (
    branchResult.status !== 0 ||
    String(branchResult.stdout).trim() !== POST_PR83_CURRENTNESS_BRANCH ||
    stagedChangedPaths().length === 0
  ) {
    return false;
  }
  const currentHeadSha = gitText(["rev-parse", "HEAD"]).trim();
  const sourceRegistry = loadRegistryFromCommit(currentHeadSha).parsed;
  const candidateLifecycle = postPr83CurrentnessLifecycle(candidateRegistry);
  if (currentHeadSha === POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA) {
    if (
      candidateLifecycle?.status !== POST_PR83_CURRENTNESS_INITIAL_STATUS ||
      !sameJson(stagedChangedPaths(), POST_PR83_CURRENTNESS_INITIAL_PATHS)
    ) {
      throw new Error("rule=post-pr83-currentness-initial-index-invalid");
    }
    const indexedRegistry = loadRegistryFromIndex();
    validatePostPr83CurrentnessCorrectionInitialRegistryBytes(
      Buffer.from(git(["show", `:${REGISTRY_REPO_PATH}`], {
        binary: true
      }).stdout)
    );
    if (!sameJson(indexedRegistry.parsed, candidateRegistry)) {
      throw new Error("rule=post-pr83-currentness-initial-index-invalid");
    }
    for (const path of POST_PR83_CURRENTNESS_INITIAL_PATHS.slice(1)) {
      if (
        gitText(["rev-parse", `:${path}`]).trim() !==
        gitText(["hash-object", "--no-filters", join(REPO_ROOT, path)]).trim()
      ) {
        throw new Error("rule=post-pr83-currentness-initial-index-invalid");
      }
    }
    validatePostPr83CurrentnessCorrectionInitialTransition(
      sourceRegistry,
      candidateRegistry
    );
    return true;
  }
  if (
    currentHeadSha ===
    POST_PR83_CURRENTNESS_COMPATIBILITY_SOURCE_HEAD_SHA
  ) {
    if (
      candidateLifecycle?.status !==
        POST_PR83_CURRENTNESS_COMPATIBILITY_STATUS ||
      !sameJson(stagedChangedPaths(), POST_PR83_CURRENTNESS_INITIAL_PATHS)
    ) {
      throw new Error("rule=post-pr83-currentness-compatibility-index-invalid");
    }
    validatePostPr83CurrentnessCorrectionCompatibilityRegistryBytes(
      Buffer.from(git(["show", `:${REGISTRY_REPO_PATH}`], {
        binary: true
      }).stdout)
    );
    for (const path of POST_PR83_CURRENTNESS_INITIAL_PATHS.slice(1)) {
      if (
        gitText(["rev-parse", `:${path}`]).trim() !==
        gitText(["hash-object", "--no-filters", join(REPO_ROOT, path)]).trim()
      ) {
        throw new Error(
          "rule=post-pr83-currentness-compatibility-index-invalid"
        );
      }
    }
    validatePostPr83CurrentnessCorrectionCompatibilityTransition(
      sourceRegistry,
      candidateRegistry
    );
    return true;
  }
  if (currentHeadSha === POST_PR83_CURRENTNESS_REVIEW_FIX_SOURCE_HEAD_SHA) {
    if (
      candidateLifecycle?.status !== POST_PR83_CURRENTNESS_REVIEW_FIX_STATUS ||
      !sameJson(stagedChangedPaths(), POST_PR83_CURRENTNESS_INITIAL_PATHS)
    ) {
      throw new Error("rule=post-pr83-currentness-review-fix-index-invalid");
    }
    validatePostPr83CurrentnessCorrectionReviewFixRegistryBytes(
      Buffer.from(git(["show", `:${REGISTRY_REPO_PATH}`], {
        binary: true
      }).stdout)
    );
    for (const path of POST_PR83_CURRENTNESS_INITIAL_PATHS.slice(1)) {
      if (
        gitText(["rev-parse", `:${path}`]).trim() !==
        gitText(["hash-object", "--no-filters", join(REPO_ROOT, path)]).trim()
      ) {
        throw new Error("rule=post-pr83-currentness-review-fix-index-invalid");
      }
    }
    validatePostPr83CurrentnessCorrectionReviewFixTransition(
      sourceRegistry,
      candidateRegistry
    );
    return true;
  }
  if (
    postPr83CurrentnessLifecycle(sourceRegistry)?.status ===
      POST_PR83_CURRENTNESS_REVIEW_FIX_STATUS
  ) {
    if (
      candidateLifecycle?.status !== POST_PR83_CURRENTNESS_FINAL_STATUS ||
      !sameJson(stagedChangedPaths(), POST_PR83_CURRENTNESS_FINAL_PATHS)
    ) {
      throw new Error("rule=post-pr83-currentness-final-index-invalid");
    }
    validatePostPr83CurrentnessCorrectionFinalTransition(
      sourceRegistry,
      candidateRegistry,
      currentHeadSha,
      postPr83CompletionContextFromEnvironment()
    );
    return true;
  }
  throw new Error("rule=post-pr83-currentness-transition-replay");
}

function evidenceFlowObserverHeartbeatWarningAllowed(item) {
  return Boolean(
    item?.taskId === EVIDENCE_FLOW_CURRENTNESS_TASK_ID &&
      item.ownerKey === EVIDENCE_FLOW_CURRENTNESS_OWNER_KEY &&
      item.branch === EVIDENCE_FLOW_CURRENTNESS_BRANCH &&
      item.disposition === "active" &&
      item[EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_KEY]?.status ===
        EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_STATUS &&
      item[TASK77_COMBINED_CURRENTNESS_LIFECYCLE_KEY]?.status ===
        TASK77_COMBINED_CURRENTNESS_STATUS &&
      isIsoTimestamp(item.lastHeartbeatAt) &&
      isIsoTimestamp(item.lastObservedAt) &&
      Date.parse(item.lastObservedAt) > Date.parse(item.lastHeartbeatAt) &&
      String(item.dirtyState ?? "").includes("currentness-observed")
  );
}

function postPr83ProtectedLaneContract(item, registry) {
  const lifecycle = postPr83CurrentnessLifecycle(registry);
  if (
    ![
      POST_PR83_CURRENTNESS_INITIAL_STATUS,
      POST_PR83_CURRENTNESS_COMPATIBILITY_STATUS,
      POST_PR83_CURRENTNESS_REVIEW_FIX_STATUS,
      POST_PR83_CURRENTNESS_FINAL_STATUS
    ].includes(lifecycle?.status) ||
    !sameJson(
      lifecycle?.protectedLaneContracts,
      POST_PR83_CURRENTNESS_PROTECTED_LANES
    )
  ) {
    return null;
  }
  return POST_PR83_CURRENTNESS_PROTECTED_LANES.find(
    (entry) => entry.taskId === item?.taskId
  ) ?? null;
}

export function postPr83ProtectedLaneShapeAllowed(item, registry) {
  const contract = postPr83ProtectedLaneContract(item, registry);
  return Boolean(
    contract &&
      item.branch === contract.branch &&
      item.disposition === contract.disposition &&
      item.headSha === contract.headSha &&
      item.aheadBehindObservationMode ===
        POST_PR83_CURRENTNESS_OBSERVATION_MODE &&
      item.protectedMainBaselineSha ===
        POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA &&
      exactPlainJsonOwnKeys(item.aheadBehind, [
        "baseRef",
        "ahead",
        "behind"
      ]) &&
      item.aheadBehind.baseRef === "origin/main" &&
      item.aheadBehind.ahead === contract.ahead &&
      item.aheadBehind.behind === contract.behind &&
      !Object.hasOwn(item, "cleanupAuthorization")
  );
}

export function protectedLaneMainAdvanceObservationAllowed(
  item,
  actualHeadSha,
  observed,
  currentObservationRegistry
) {
  if (
    !postPr83ProtectedLaneShapeAllowed(item, currentObservationRegistry) ||
    actualHeadSha !== item.headSha ||
    !exactPlainJsonOwnKeys(observed, ["baseRef", "ahead", "behind"]) ||
    observed.baseRef !== item.aheadBehind.baseRef ||
    observed.ahead !== item.aheadBehind.ahead ||
    observed.behind <= item.aheadBehind.behind ||
    !gitObjectExists(`${actualHeadSha}^{commit}`) ||
    !gitObjectExists("origin/main^{commit}")
  ) {
    return false;
  }
  const liveMainSha = gitText(["rev-parse", "origin/main"]).trim();
  if (
    !isSha(liveMainSha) ||
    !sameJson(actualAheadBehind(actualHeadSha, "origin/main"), observed) ||
    git([
      "merge-base",
      "--is-ancestor",
      item.protectedMainBaselineSha,
      liveMainSha
    ], { allowFailure: true }).status !== 0
  ) {
    return false;
  }
  return protectedMainAdvanceChainResolution(
    currentObservationRegistry,
    item.protectedMainBaselineSha,
    liveMainSha
  ).allowed;
}

function validateRegistry(registry) {
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
      timestampIsInFuture(authorization.authorizedAt) ||
      timestampIsInFuture(authorization.providerReadbackAt) ||
      timestampIsInFuture(authorization.consumedAt) ||
      timestampIsInFuture(authorization.remoteRefAbsenceReadbackAt) ||
      (Number.isFinite(authorizedAtMs) && Number.isFinite(expiresAtMs) && expiresAtMs - authorizedAtMs > 72 * 60 * 60 * 1000)
    ) {
      errors.push(`ref-deletion authorization timestamps exceed policy: ${authorization.id ?? "<unknown>"}`);
    }
    if (authorization.status === "active" && !isIsoTimestamp(authorization.providerReadbackAt)) {
      errors.push(`active ref-deletion authorization lacks provider readback: ${authorization.id ?? "<unknown>"}`);
    }
    if (authorization.status === "active" && (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now())) {
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
      if (timestampIsInFuture(value)) errors.push(`workItem ${item.taskId ?? "<unknown>"} has future ${field}`);
    }
    if (!isExpectedClose(item.expectedCloseAt)) {
      errors.push(`workItem ${item.taskId ?? "<unknown>"} must declare ISO or owner-gated expectedCloseAt`);
    }
    if (!item.aheadBehind || typeof item.aheadBehind !== "object") {
      errors.push(`workItem ${item.taskId ?? "<unknown>"} must declare aheadBehind.baseRef/ahead/behind`);
    } else if (
      !exactPlainJsonOwnKeys(item.aheadBehind, ["baseRef", "ahead", "behind"]) ||
      typeof item.aheadBehind.baseRef !== "string" ||
      !Number.isInteger(item.aheadBehind.ahead) ||
      item.aheadBehind.ahead < 0 ||
      !Number.isInteger(item.aheadBehind.behind) ||
      item.aheadBehind.behind < 0
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
      const heartbeatAge = isIsoTimestamp(item.lastHeartbeatAt) ? ageHours(item.lastHeartbeatAt) : Number.POSITIVE_INFINITY;
      if (heartbeatAge > 72) {
        if (evidenceFlowObserverHeartbeatWarningAllowed(item)) {
          warnings.push(
            `active EvidenceFlow workItem observer heartbeat is older than 72 hours; owner heartbeat remains intentionally untouched`
          );
        } else {
          errors.push(`active workItem ${item.taskId} has no heartbeat for more than 72 hours and must be frozen`);
        }
      } else if (heartbeatAge > 24) {
        warnings.push(`active workItem ${item.taskId} has no heartbeat for more than 24 hours`);
      }
    }
    if (Date.parse(item.nextReviewAt) < Date.now()) {
      if (ACTIVE_WRITE_DISPOSITIONS.has(item.disposition)) {
        errors.push(`active workItem ${item.taskId} has an overdue nextReviewAt`);
      } else {
        warnings.push(`workItem ${item.taskId} requires scheduled preservation review`);
      }
    }
    if (!item.prNumber && !item.noPrReason) {
      errors.push(`workItem ${item.taskId ?? "<unknown>"} requires prNumber or noPrReason`);
    }
    if (item.aheadBehindObservationMode !== undefined) {
      if (
        item.aheadBehindObservationMode === POST_PR83_CURRENTNESS_OBSERVATION_MODE
      ) {
        if (!postPr83ProtectedLaneShapeAllowed(item, registry)) {
          errors.push(
            `workItem ${item.taskId ?? "<unknown>"} has invalid protected-main merge-chain observation contract`
          );
        }
      } else if (item.aheadBehindObservationMode !== "integrated-monotonic-behind") {
        errors.push(
          `workItem ${item.taskId ?? "<unknown>"} aheadBehindObservationMode must be integrated-monotonic-behind when declared`
        );
      } else {
        if (item.disposition !== "integrated") {
          errors.push(
            `workItem ${item.taskId ?? "<unknown>"} integrated-monotonic-behind observation requires integrated disposition`
          );
        }
        if (Object.hasOwn(item, "cleanupAuthorization")) {
          errors.push(
            `workItem ${item.taskId ?? "<unknown>"} integrated-monotonic-behind observation forbids cleanupAuthorization`
          );
        }
        if (
          !exactPlainJsonOwnKeys(item.aheadBehind, ["baseRef", "ahead", "behind"]) ||
          item.aheadBehind?.baseRef !== "origin/main" ||
          item.aheadBehind?.ahead !== 0 ||
          !Number.isInteger(item.aheadBehind?.behind) ||
          item.aheadBehind.behind < 0 ||
          item.lastMergedPullRequest?.headSha !== item.headSha ||
          item.lastMergedPullRequest?.postMainChecksPassed !== true ||
          !isSha(item.lastMergedPullRequest?.mergeCommitSha) ||
          hasIntegratedMonotonicBehindAlternateBaseKey(item.lastMergedPullRequest)
        ) {
          errors.push(
            `workItem ${item.taskId ?? "<unknown>"} has invalid integrated-monotonic-behind observation contract`
          );
        }
      }
    }
    if (item.cleanupAuthorization !== undefined) {
      const cleanup = item.cleanupAuthorization;
      const targetRef = `refs/heads/${item.branch}`;
      const targetBranch = (registry.branches ?? []).find((branch) => branch.name === item.branch);
      const operatorItem = (registry.workItems ?? []).find(
        (candidate) => candidate.taskId === cleanup?.operatorTaskId
      );
      if (
        !isPlainRecord(cleanup) ||
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
        Date.parse(cleanup.expiresAt) <= Date.now() ||
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
    if (timestampIsInFuture(branch.lastObservedAt) || timestampIsInFuture(branch.lastOwnerHeartbeatAt)) {
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
      ageHours(branch.lastCommitAt) > 7 * 24 &&
      !MANUAL_REVIEW_BRANCH_DISPOSITIONS.has(branch.disposition)
    ) {
      errors.push(`branch ${branch.name ?? "<unknown>"} is older than seven days without a PR and must enter manual preservation review`);
    }
    if (Date.parse(branch.nextReviewAt) < Date.now()) {
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
    if (Date.parse(orphan.nextReviewAt) < Date.now()) {
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
  try {
    validatePr80RepairLifecycleSnapshot(registry);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "rule=pr80-repair-lifecycle-invalid");
  }
  const hasProtectedCurrentnessRepairLifecycle = Boolean(
    protectedCurrentnessRepairWorkItem(registry)
      ?.protectedCurrentnessActivationRepairLifecycle
  );
  const hasProtectedCurrentnessRepairReceipt = (registry.releaseReceipts ?? []).some(
    (entry) => [
      PROTECTED_CURRENTNESS_REPAIR_INITIAL_RECEIPT,
      PROTECTED_CURRENTNESS_REPAIR_CORRECTION_RECEIPT,
      PROTECTED_CURRENTNESS_REPAIR_FINAL_RECEIPT
    ].includes(entry?.receiptKind)
  );
  const hasPostPr82TopologyHeartbeat = Boolean(
    postPr82TopologyHeartbeatLifecycle(registry)
  );
  const hasPostPr83CurrentnessCorrection = Boolean(
    postPr83CurrentnessLifecycle(registry) ||
      postPr83CurrentnessReceipt(registry)
  );
  if (hasPostPr83CurrentnessCorrection) {
    try {
      validatePostPr83CurrentnessCorrectionSnapshot(registry);
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : "rule=post-pr83-currentness-lifecycle-invalid"
      );
    }
  }
  if (hasProtectedCurrentnessRepairLifecycle || hasProtectedCurrentnessRepairReceipt) {
    try {
      if (hasPostPr83CurrentnessCorrection) {
        // The post-PR83 lifecycle pins and validates the superseding exact snapshot.
      } else if (hasPostPr82TopologyHeartbeat) {
        validatePostPr82IntegratedCurrentnessSnapshot(registry);
      } else {
        const repairLifecycle = protectedCurrentnessRepairWorkItem(registry)
          ?.protectedCurrentnessActivationRepairLifecycle;
        const allowExactFrozenLegacyInitialPrHead =
          repairLifecycle?.status === PROTECTED_CURRENTNESS_REPAIR_INITIAL_STATUS &&
          sha256Buffer(Buffer.from(JSON.stringify(registry))) ===
            PROTECTED_CURRENTNESS_REPAIR_CORRECTION_SOURCE_REGISTRY_CANONICAL_SHA256;
        validateProtectedCurrentnessRepairLifecycleSnapshot(
          registry,
          PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_STRUCTURAL_ONLY,
          null,
          { allowExactFrozenLegacyInitialPrHead }
        );
      }
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : "rule=protected-currentness-repair-lifecycle-invalid"
      );
    }
  }
  const hasEvidenceFlowCurrentnessLifecycle = Boolean(
    evidenceFlowCurrentnessWorkItem(registry)?.[
      EVIDENCE_FLOW_CURRENTNESS_LIFECYCLE_KEY
    ]
  );
  const hasEvidenceFlowCurrentnessReceipt = (registry.releaseReceipts ?? []).some(
    (entry) => entry?.receiptKind === EVIDENCE_FLOW_CURRENTNESS_RECEIPT_KIND
  );
  if (hasEvidenceFlowCurrentnessLifecycle || hasEvidenceFlowCurrentnessReceipt) {
    try {
      if (!hasPostPr82TopologyHeartbeat) {
        validateEvidenceFlowCurrentnessLifecycleSnapshot(registry);
      }
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : "rule=evidenceflow-currentness-lifecycle-invalid"
      );
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

export function integratedMonotonicBehindShapeAllowed(item, actualHeadSha, observed) {
  const recorded = item?.aheadBehind;
  const merged = item?.lastMergedPullRequest;
  return Boolean(
    item?.aheadBehindObservationMode === "integrated-monotonic-behind" &&
      item.disposition === "integrated" &&
      exactPlainJsonOwnKeys(recorded, ["baseRef", "ahead", "behind"]) &&
      exactPlainJsonOwnKeys(observed, ["baseRef", "ahead", "behind"]) &&
      recorded?.baseRef === "origin/main" &&
      observed?.baseRef === recorded.baseRef &&
      actualHeadSha === item.headSha &&
      Number.isInteger(recorded.ahead) &&
      recorded.ahead === 0 &&
      Number.isInteger(recorded.behind) &&
      recorded.behind >= 0 &&
      Number.isInteger(observed.ahead) &&
      observed.ahead === 0 &&
      Number.isInteger(observed.behind) &&
      observed.behind >= recorded.behind &&
      merged?.headSha === item.headSha &&
      merged.postMainChecksPassed === true &&
      isSha(merged.mergeCommitSha) &&
      !hasIntegratedMonotonicBehindAlternateBaseKey(merged) &&
      !Object.hasOwn(item, "cleanupAuthorization")
  );
}

export function integratedMonotonicBehindObservationAllowed(item, actualHeadSha, observed) {
  if (!integratedMonotonicBehindShapeAllowed(item, actualHeadSha, observed)) return false;
  const baseRef = item.aheadBehind.baseRef;
  const mergeCommitSha = item.lastMergedPullRequest.mergeCommitSha;
  if (
    !gitObjectExists(`${actualHeadSha}^{commit}`) ||
    !gitObjectExists(`${mergeCommitSha}^{commit}`) ||
    !gitObjectExists(`${baseRef}^{commit}`)
  ) {
    return false;
  }
  return (
    git(["merge-base", "--is-ancestor", actualHeadSha, baseRef], {
      allowFailure: true
    }).status === 0 &&
    git(["merge-base", "--is-ancestor", mergeCommitSha, baseRef], {
      allowFailure: true
    }).status === 0
  );
}

const PR81_CLOSEOUT_TASK_ID = "SENA-PR80-POST-MAIN-CLOSEOUT-20260901";
const PR81_CLOSEOUT_BRANCH = "codex/sena-pr80-post-main-closeout-20260901";
const PR81_CLOSEOUT_FINAL_STATUS =
  "pr81-post-main-currentness-closeout-final-ready-pending-head-checks";
const PR81_CLOSEOUT_CANDIDATE_RECEIPT =
  "pr81-post-main-currentness-closeout-authorization-candidate";
const PR81_CLOSEOUT_FINAL_RECEIPT =
  "pr81-post-main-currentness-closeout-final-authorization";
const REAL_PR81_DESCRIPTOR = Object.freeze({
  firstParentSha: "a8da14209a9e14a3a53e29e13c86ae8eecbd5928",
  secondParentSha: "0444b59968f6699f0ace6f4cb6eda4d6f8f44695",
  mergeCommitSha: "969a206b798c159e15ae0b6e5c76d0c94cca92ea"
});
const PR81_LIFECYCLE_KEYS = [
  "status", "oneShot", "pullRequestNumber", "protectedSourceMainSha",
  "protectedSourceTreeSha", "protectedSourceRegistryBlobSha",
  "protectedSourceReceiptPrefix", "requiredCandidatePaths", "blockedAuditEvidence",
  "requiredExecution", "initialCandidateCompletionEvidence",
  "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks",
  "pr81ReadyAndProtectedMergeAuthorizedAfterFinalChecks",
  "pr46RemergeOrMutationAuthorizedNow", "pr46ReadyAndProtectedMergeAuthorizedNow",
  "localRefRetirementAuthorized", "retirementReceiptMintingAuthorized",
  "branchDeletionAuthorized", "worktreeRemovalAuthorized",
  "orphanWorktreeMutationAuthorized", "targetRefMutationAuthorized",
  "targetTagMutationAuthorized", "quarantineMutationAuthorized",
  "deploymentAuthorized", "providerMutationAuthorized", "resetAuthorized",
  "rebaseAuthorized", "stashAuthorized", "forceAuthorized", "historyRewriteAuthorized"
];
const PR81_AUDIT_RECORD_KEYS = ["errors", "ownerBlockers", "unreachableCommitCount"];
const PR81_INITIAL_EVIDENCE_KEYS = [
  "headSha", "treeSha", "registryBlobSha", "buildRunId", "buildJobId",
  "repositorySecurityRunIds", "repositorySecurityJobIds", "checkJobIds",
  "requiredChecksPassed", "annotationsEmpty", "specReviewApproved",
  "qualityReviewApproved", "prState", "prIsDraft", "mergeable", "mergeStateStatus"
];
const PR81_AUTHORIZATION_BOUNDARY_KEYS = [
  "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks",
  "pr81ReadyAndProtectedMergeAuthorizedAfterFinalChecks",
  "pr46RemergeOrMutationAuthorizedNow", "pr46ReadyAndProtectedMergeAuthorizedNow",
  "localRefRetirementAuthorized", "retirementReceiptMintingAuthorized",
  "branchDeletionAuthorized", "worktreeRemovalAuthorized",
  "orphanWorktreeMutationAuthorized", "targetRefMutationAuthorized",
  "targetTagMutationAuthorized", "quarantineMutationAuthorized",
  "deploymentAuthorized", "providerMutationAuthorized", "resetAuthorized",
  "rebaseAuthorized", "stashAuthorized", "forceAuthorized", "historyRewriteAuthorized"
];
const PR81_CANDIDATE_RECEIPT_KEYS = [
  "schemaVersion", "receiptKind", "status", "recordedAt", "taskId", "threadId",
  "ownerKey", "scope", "authorizationBasis", "protectedSource",
  "pr80FinalAndPostMainEvidence", "blockedAuditEvidence", "executionOrder",
  "authorizationBoundary", "evidenceBoundary"
];
const PR81_CANDIDATE_PROTECTED_SOURCE_KEYS = [
  "mainSha", "treeSha", "registryBlobSha", "releaseReceiptPrefixCount",
  "releaseReceiptPrefixSha256"
];
const PR81_CANDIDATE_PR80_EVIDENCE_KEYS = [
  "finalHeadSha", "finalTreeSha", "finalRegistryBlobSha", "finalBuildRunId",
  "finalBuildJobId", "finalRepositorySecurityRunIds", "finalRepositorySecurityJobIds",
  "mergeCommitSha", "mergedAt", "orderedParentShas", "postMainBuildRunId",
  "postMainBuildJobId", "postMainRepositorySecurityRunId",
  "postMainRepositorySecurityJobId", "annotationsEmpty"
];
const PR81_CANDIDATE_BLOCKED_AUDIT_KEYS = [
  "beforeRootFastForwardErrors", "afterRootFastForwardErrors", "ownerBlockers",
  "unreachableCommitCount"
];
const PR81_FINAL_RECEIPT_KEYS = [
  "schemaVersion", "receiptKind", "status", "recordedAt", "taskId", "threadId",
  "ownerKey", "scope", "authorizationBasis", "protectedInitialReceiptPrefix",
  "initialCandidateCompletionEvidence", "authorizationBoundary", "evidenceBoundary"
];
const PR81_FINAL_RECEIPT_EVIDENCE_KEYS = [
  "headSha", "treeSha", "registryBlobSha", "buildRunId", "buildJobId",
  "repositorySecurityRunIds", "repositorySecurityJobIds", "checkJobIds",
  "requiredChecksPassed", "annotationsEmpty", "specReviewApproved",
  "qualityReviewApproved", "pullRequestNumber", "pullRequestState",
  "pullRequestIsDraft", "pullRequestMergeable", "pullRequestMergeStateStatus",
  "pullRequestHeadSha"
];
export const PR81_FINAL_REQUIRED_EXECUTION = [
  "stage-only-active-work-and-pass-index-audit-write-policy-security-native-pre-commit-and-49-of-49-governance-tests",
  "commit-and-push-the-initial-registry-only-pr81-candidate-and-create-draft-pr81",
  "verify-initial-pr81-exact-head-build-and-both-repository-security-checks-with-zero-annotations",
  "obtain-fresh-independent-read-only-spec-and-quality-reviews-of-the-exact-initial-head",
  "commit-and-push-one-registry-only-final-pr81-authorization-metadata-transition",
  "verify-final-pr81-exact-head-build-and-both-repository-security-checks-with-zero-annotations",
  "mark-pr81-ready-and-protected-merge-with-exact-head-lease-without-admin-bypass",
  "verify-pr81-post-main-build-security-zero-annotations-and-exact-main-commit-bound-live-audit",
  "only-after-pr81-protected-activation-and-audit-reenter-the-separately-gated-pr46-lifecycle",
  "stop-before-any-pr46-ready-merge-local-ref-retirement-receipt-minting-branch-worktree-orphan-target-tag-quarantine-deployment-provider-or-history-mutation"
];
const PR81_FINAL_FALSE_ACTION_FIELDS = [
  "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks",
  "pr46RemergeOrMutationAuthorizedNow", "pr46ReadyAndProtectedMergeAuthorizedNow",
  "localRefRetirementAuthorized", "retirementReceiptMintingAuthorized",
  "branchDeletionAuthorized", "worktreeRemovalAuthorized",
  "orphanWorktreeMutationAuthorized", "targetRefMutationAuthorized",
  "targetTagMutationAuthorized", "quarantineMutationAuthorized",
  "deploymentAuthorized", "providerMutationAuthorized", "resetAuthorized",
  "rebaseAuthorized", "stashAuthorized", "forceAuthorized", "historyRewriteAuthorized"
];
const PR81_FINAL_TRUE_ACTION = "pr81ReadyAndProtectedMergeAuthorizedAfterFinalChecks";
const PROTECTED_MAIN_LAST_MERGED_KEYS = [
  "number", "headSha", "headTreeSha", "registryBlobSha", "mergeCommitSha",
  "mergedAt", "orderedParentShas", "prBuildRunId", "prBuildJobId",
  "prRepositorySecurityRunIds", "prRepositorySecurityJobIds", "postMainBuildRunId",
  "postMainBuildJobId", "postMainRepositorySecurityRunId",
  "postMainRepositorySecurityJobId", "postMainChecksPassed", "annotationsEmpty",
  "commitBoundLiveAuditStatus", "commitBoundLiveAuditErrors",
  "commitBoundLiveAuditOwnerBlockers", "unreachableCommitCount"
];

function protectedMainAdvanceGitText(args) {
  const result = git(args, { allowFailure: true });
  if (result.error || result.status !== 0) return null;
  return String(result.stdout ?? "").trim();
}

function protectedMainAdvanceCommitParents(commitSha) {
  const line = protectedMainAdvanceGitText(["rev-list", "--parents", "-n", "1", commitSha]);
  if (!line) return null;
  const fields = line.split(/\s+/);
  if (fields[0] !== commitSha) return null;
  return fields.slice(1);
}

function protectedMainAdvanceObjectSha(specification) {
  const output = protectedMainAdvanceGitText(["rev-parse", "--verify", specification]);
  return isSha(output) ? output : null;
}

function protectedMainAdvanceRegistryFromCommit(commitSha) {
  const result = git(["show", `${commitSha}:${REGISTRY_REPO_PATH}`], {
    allowFailure: true
  });
  if (result.error || result.status !== 0) return null;
  try {
    return JSON.parse(String(result.stdout ?? ""));
  } catch {
    return null;
  }
}

function protectedMainAdvanceChangedPaths(parentSha, commitSha) {
  const result = git(
    ["diff", "--name-only", "-z", "--no-renames", parentSha, commitSha],
    { allowFailure: true }
  );
  if (result.error || result.status !== 0) return null;
  return String(result.stdout ?? "").split("\0").filter(Boolean);
}

function protectedMainAdvanceExactOneRegistryMetadataCommit(initialHeadSha, finalHeadSha) {
  if (!isSha(initialHeadSha) || !isSha(finalHeadSha) || initialHeadSha === finalHeadSha) {
    return false;
  }
  const count = protectedMainAdvanceGitText([
    "rev-list",
    "--count",
    `${initialHeadSha}..${finalHeadSha}`
  ]);
  const parents = protectedMainAdvanceCommitParents(finalHeadSha);
  const paths = protectedMainAdvanceChangedPaths(initialHeadSha, finalHeadSha);
  return Boolean(
    count === "1" &&
      sameJson(parents, [initialHeadSha]) &&
      sameStringSet(paths, [REGISTRY_REPO_PATH])
  );
}

function protectedMainAdvanceReceiptPrefixMatches(receipts, prefix) {
  return Boolean(
    Array.isArray(receipts) &&
      exactPlainJsonOwnKeys(prefix, ["count", "sha256"]) &&
      Number.isInteger(prefix.count) &&
      prefix.count >= 0 &&
      receipts.length >= prefix.count &&
      validSha256(prefix.sha256) &&
      sha256Buffer(Buffer.from(JSON.stringify(receipts.slice(0, prefix.count)))) ===
        prefix.sha256
  );
}

function protectedMainAdvanceReceiptAuthorizationExact(receipt, expectedTrueAction) {
  const boundary = receipt?.authorizationBoundary;
  if (!isPlainRecord(boundary) || boundary[expectedTrueAction] !== true) return false;
  return Object.entries(boundary).every(
    ([key, value]) => key === expectedTrueAction ? value === true : value === false
  );
}

function protectedMainTrueAuthorizationPaths(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const paths = [];
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (entry === true && key.includes("Authorized")) paths.push(nextPath.join("."));
    if (entry && typeof entry === "object") {
      paths.push(...protectedMainTrueAuthorizationPaths(entry, nextPath));
    }
  }
  return paths.sort();
}

function protectedMainAdvanceLastMergedExact(
  currentItem,
  currentBranch,
  {
    pullRequestNumber,
    secondParentSha,
    mergeCommitSha,
    mergeTreeSha,
    registryBlobSha,
    orderedParentShas,
    auditContract
  }
) {
  const itemMerged = currentItem?.lastMergedPullRequest;
  const branchMerged = currentBranch?.lastMergedPullRequest;
  const required = (merged) => {
    const numericIds = [
      merged?.prBuildRunId,
      merged?.prBuildJobId,
      ...(merged?.prRepositorySecurityRunIds ?? []),
      ...(merged?.prRepositorySecurityJobIds ?? []),
      merged?.postMainBuildRunId,
      merged?.postMainBuildJobId,
      merged?.postMainRepositorySecurityRunId,
      merged?.postMainRepositorySecurityJobId
    ];
    return Boolean(
      exactPlainJsonOwnKeys(merged, PROTECTED_MAIN_LAST_MERGED_KEYS) &&
      merged.number === pullRequestNumber &&
      merged.headSha === secondParentSha &&
      merged.headTreeSha === mergeTreeSha &&
      merged.registryBlobSha === registryBlobSha &&
      merged.mergeCommitSha === mergeCommitSha &&
      sameJson(merged.orderedParentShas, orderedParentShas) &&
      merged.postMainChecksPassed === true &&
      merged.annotationsEmpty === true &&
      merged.commitBoundLiveAuditStatus === auditContract.status &&
      sameJson(merged.commitBoundLiveAuditErrors, auditContract.errors) &&
      sameJson(merged.commitBoundLiveAuditOwnerBlockers, auditContract.ownerBlockers) &&
      merged.unreachableCommitCount === auditContract.unreachableCommitCount &&
      typeof merged.mergedAt === "string" &&
      Number.isFinite(Date.parse(merged.mergedAt)) &&
      merged.prRepositorySecurityRunIds.length === 2 &&
      merged.prRepositorySecurityJobIds.length === 2 &&
      numericIds.every((value) => Number.isInteger(value) && value > 0) &&
      new Set(numericIds).size === numericIds.length &&
      !hasIntegratedMonotonicBehindAlternateBaseKey(merged)
    );
  };
  return required(itemMerged) && required(branchMerged) && sameJson(itemMerged, branchMerged);
}

export function validatePr81ProtectedMainMergeDescriptor({
  mergeTimeRegistry,
  currentObservationRegistry,
  mergeCommitSha,
  orderedParentShas,
  secondParentSha,
  mergeTreeSha,
  registryBlobSha
}, options = {}) {
  const item = (mergeTimeRegistry?.workItems ?? []).find(
    (entry) => entry?.taskId === PR81_CLOSEOUT_TASK_ID
  );
  const branch = (mergeTimeRegistry?.branches ?? []).find(
    (entry) => entry?.name === PR81_CLOSEOUT_BRANCH
  );
  const lifecycle = item?.pr81PostMainCurrentnessCloseoutLifecycle;
  if (!item || !branch || !lifecycle) {
    return false;
  }
  const receipts = mergeTimeRegistry.releaseReceipts;
  const prefix = lifecycle.protectedSourceReceiptPrefix;
  const initialEvidence = lifecycle.initialCandidateCompletionEvidence;
  const candidateReceipt = Array.isArray(receipts) && Number.isInteger(prefix?.count)
    ? receipts[prefix.count]
    : null;
  const finalReceipt = Array.isArray(receipts) && Number.isInteger(prefix?.count)
    ? receipts[prefix.count + 1]
    : null;
  if (
    !exactPlainJsonOwnKeys(lifecycle, PR81_LIFECYCLE_KEYS) ||
    !exactPlainJsonOwnKeys(prefix, ["count", "sha256"]) ||
    !exactPlainJsonOwnKeys(lifecycle.blockedAuditEvidence, [
      "beforeRootFastForward", "afterRootFastForward"
    ]) ||
    !exactPlainJsonOwnKeys(
      lifecycle.blockedAuditEvidence.beforeRootFastForward,
      PR81_AUDIT_RECORD_KEYS
    ) ||
    !exactPlainJsonOwnKeys(
      lifecycle.blockedAuditEvidence.afterRootFastForward,
      PR81_AUDIT_RECORD_KEYS
    ) ||
    !exactPlainJsonOwnKeys(initialEvidence, PR81_INITIAL_EVIDENCE_KEYS) ||
    !exactPlainJsonOwnKeys(candidateReceipt, PR81_CANDIDATE_RECEIPT_KEYS) ||
    !exactPlainJsonOwnKeys(
      candidateReceipt.protectedSource,
      PR81_CANDIDATE_PROTECTED_SOURCE_KEYS
    ) ||
    !exactPlainJsonOwnKeys(
      candidateReceipt.pr80FinalAndPostMainEvidence,
      PR81_CANDIDATE_PR80_EVIDENCE_KEYS
    ) ||
    !exactPlainJsonOwnKeys(
      candidateReceipt.blockedAuditEvidence,
      PR81_CANDIDATE_BLOCKED_AUDIT_KEYS
    ) ||
    !exactPlainJsonOwnKeys(
      candidateReceipt.authorizationBoundary,
      PR81_AUTHORIZATION_BOUNDARY_KEYS
    ) ||
    !exactPlainJsonOwnKeys(finalReceipt, PR81_FINAL_RECEIPT_KEYS) ||
    !exactPlainJsonOwnKeys(finalReceipt.protectedInitialReceiptPrefix, ["count", "sha256"]) ||
    !exactPlainJsonOwnKeys(
      finalReceipt.initialCandidateCompletionEvidence,
      PR81_FINAL_RECEIPT_EVIDENCE_KEYS
    ) ||
    !exactPlainJsonOwnKeys(
      finalReceipt.authorizationBoundary,
      PR81_AUTHORIZATION_BOUNDARY_KEYS
    )
  ) {
    return false;
  }
  const isRealDescriptorMember = [
    ...orderedParentShas,
    mergeCommitSha
  ].some((sha) => Object.values(REAL_PR81_DESCRIPTOR).includes(sha));
  if (
    isRealDescriptorMember &&
    !sameJson(
      {
        firstParentSha: orderedParentShas[0],
        secondParentSha,
        mergeCommitSha
      },
      REAL_PR81_DESCRIPTOR
    )
  ) {
    return false;
  }
  if (
    lifecycle.status !== PR81_CLOSEOUT_FINAL_STATUS ||
    lifecycle.oneShot !== true ||
    lifecycle.pullRequestNumber !== 81 ||
    lifecycle.protectedSourceMainSha !== orderedParentShas[0] ||
    lifecycle.protectedSourceTreeSha !==
      protectedMainAdvanceObjectSha(`${orderedParentShas[0]}^{tree}`) ||
    lifecycle.protectedSourceRegistryBlobSha !==
      protectedMainAdvanceObjectSha(`${orderedParentShas[0]}:${REGISTRY_REPO_PATH}`) ||
    !sameJson(lifecycle.requiredCandidatePaths, [REGISTRY_REPO_PATH]) ||
    !sameJson(lifecycle.requiredExecution, PR81_FINAL_REQUIRED_EXECUTION) ||
    PR81_FINAL_FALSE_ACTION_FIELDS.some((field) => lifecycle[field] !== false) ||
    lifecycle[PR81_FINAL_TRUE_ACTION] !== true ||
    !sameJson(protectedMainTrueAuthorizationPaths(lifecycle), [PR81_FINAL_TRUE_ACTION]) ||
    !protectedMainAdvanceReceiptPrefixMatches(receipts, prefix) ||
    receipts.length !== prefix.count + 2 ||
    item.prNumber !== 81 ||
    item.plannedPullRequestNumber !== 81 ||
    item.branch !== PR81_CLOSEOUT_BRANCH ||
    item.ownerKey !== "Codex-pr80-post-main-closeout-01a05865" ||
    item.disposition !== "active" ||
    item.prIsDraft !== true ||
    item.prReadyForReview !== false ||
    item.mergeAuthorized !== false ||
    branch.pr !== 81 ||
    branch.plannedPullRequestNumber !== 81 ||
    branch.prBase !== "main" ||
    branch.prState !== "OPEN" ||
    branch.prIsDraft !== true ||
    branch.prReadyForReview !== false ||
    branch.mergeAuthorized !== false ||
    !isPlainRecord(initialEvidence) ||
    initialEvidence.prState !== "OPEN" ||
    initialEvidence.prIsDraft !== true ||
    initialEvidence.requiredChecksPassed !== true ||
    initialEvidence.annotationsEmpty !== true ||
    initialEvidence.specReviewApproved !== true ||
    initialEvidence.qualityReviewApproved !== true ||
    item.headSha !== initialEvidence.headSha ||
    branch.headSha !== initialEvidence.headSha ||
    branch.remoteHeadSha !== initialEvidence.headSha ||
    branch.prHeadSha !== initialEvidence.headSha ||
    !protectedMainAdvanceExactOneRegistryMetadataCommit(
      initialEvidence.headSha,
      secondParentSha
    ) ||
    lifecycle.finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks !== false ||
    lifecycle.pr81ReadyAndProtectedMergeAuthorizedAfterFinalChecks !== true
  ) {
    return false;
  }
  if (
    candidateReceipt?.schemaVersion !== "sena-registry-reconciliation-receipt/v1" ||
    candidateReceipt?.receiptKind !== PR81_CLOSEOUT_CANDIDATE_RECEIPT ||
    candidateReceipt?.status !== "candidate-awaiting-initial-exact-head-checks" ||
    candidateReceipt?.taskId !== PR81_CLOSEOUT_TASK_ID ||
    candidateReceipt?.ownerKey !== item.ownerKey ||
    !sameJson(candidateReceipt?.scope, [REGISTRY_REPO_PATH]) ||
    candidateReceipt.protectedSource.mainSha !== lifecycle.protectedSourceMainSha ||
    candidateReceipt.protectedSource.treeSha !== lifecycle.protectedSourceTreeSha ||
    candidateReceipt.protectedSource.registryBlobSha !==
      lifecycle.protectedSourceRegistryBlobSha ||
    candidateReceipt.protectedSource.releaseReceiptPrefixCount !== prefix.count ||
    candidateReceipt.protectedSource.releaseReceiptPrefixSha256 !== prefix.sha256 ||
    !sameJson(
      candidateReceipt.blockedAuditEvidence.beforeRootFastForwardErrors,
      lifecycle.blockedAuditEvidence.beforeRootFastForward.errors
    ) ||
    !sameJson(
      candidateReceipt.blockedAuditEvidence.afterRootFastForwardErrors,
      lifecycle.blockedAuditEvidence.afterRootFastForward.errors
    ) ||
    !sameJson(candidateReceipt.blockedAuditEvidence.ownerBlockers, []) ||
    candidateReceipt.blockedAuditEvidence.unreachableCommitCount !== 0 ||
    !Array.isArray(candidateReceipt.executionOrder) ||
    candidateReceipt.executionOrder.length === 0 ||
    !protectedMainAdvanceReceiptAuthorizationExact(
      candidateReceipt,
      "finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks"
    ) ||
    candidateReceipt.authorizationBoundary
      .finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks !== true ||
    candidateReceipt.authorizationBoundary
      .pr81ReadyAndProtectedMergeAuthorizedAfterFinalChecks !== false ||
    finalReceipt?.schemaVersion !== "sena-registry-reconciliation-receipt/v1" ||
    finalReceipt?.receiptKind !== PR81_CLOSEOUT_FINAL_RECEIPT ||
    finalReceipt?.status !==
      "authorized-for-pr81-ready-and-protected-merge-after-final-head-checks" ||
    finalReceipt?.taskId !== PR81_CLOSEOUT_TASK_ID ||
    finalReceipt?.ownerKey !== item.ownerKey ||
    !sameJson(finalReceipt?.scope, [REGISTRY_REPO_PATH]) ||
    finalReceipt.protectedInitialReceiptPrefix.count !== prefix.count + 1 ||
    finalReceipt.protectedInitialReceiptPrefix.sha256 !==
      sha256Buffer(Buffer.from(JSON.stringify(receipts.slice(0, prefix.count + 1)))) ||
    finalReceipt?.initialCandidateCompletionEvidence?.headSha !== initialEvidence.headSha ||
    finalReceipt?.initialCandidateCompletionEvidence?.treeSha !== initialEvidence.treeSha ||
    finalReceipt?.initialCandidateCompletionEvidence?.registryBlobSha !==
      initialEvidence.registryBlobSha ||
    finalReceipt?.initialCandidateCompletionEvidence?.pullRequestNumber !== 81 ||
    finalReceipt?.initialCandidateCompletionEvidence?.pullRequestState !==
      initialEvidence.prState ||
    finalReceipt?.initialCandidateCompletionEvidence?.pullRequestIsDraft !==
      initialEvidence.prIsDraft ||
    finalReceipt?.initialCandidateCompletionEvidence?.pullRequestHeadSha !==
      initialEvidence.headSha ||
    finalReceipt?.initialCandidateCompletionEvidence?.requiredChecksPassed !== true ||
    finalReceipt?.initialCandidateCompletionEvidence?.annotationsEmpty !== true ||
    finalReceipt?.initialCandidateCompletionEvidence?.specReviewApproved !== true ||
    finalReceipt?.initialCandidateCompletionEvidence?.qualityReviewApproved !== true ||
    !protectedMainAdvanceReceiptAuthorizationExact(
      finalReceipt,
      "pr81ReadyAndProtectedMergeAuthorizedAfterFinalChecks"
    ) ||
    finalReceipt.authorizationBoundary
      .finalAuthorizationMetadataCommitAuthorizedAfterInitialChecks !== false ||
    finalReceipt.authorizationBoundary
      .pr81ReadyAndProtectedMergeAuthorizedAfterFinalChecks !==
        lifecycle[PR81_FINAL_TRUE_ACTION] ||
    receipts.filter((receipt) => receipt?.receiptKind === PR81_CLOSEOUT_CANDIDATE_RECEIPT)
      .length !== 1 ||
    receipts.filter((receipt) => receipt?.receiptKind === PR81_CLOSEOUT_FINAL_RECEIPT)
      .length !== 1
  ) {
    return false;
  }
  if (options.mergeTimeOnly === true) return true;
  const currentItem = (currentObservationRegistry?.workItems ?? []).find(
    (entry) => entry?.taskId === PR81_CLOSEOUT_TASK_ID
  );
  const currentBranch = (currentObservationRegistry?.branches ?? []).find(
    (entry) => entry?.name === PR81_CLOSEOUT_BRANCH
  );
  return Boolean(
    currentItem?.headSha === secondParentSha &&
      currentItem.disposition === "integrated" &&
      currentBranch?.headSha === secondParentSha &&
      currentBranch.prHeadSha === secondParentSha &&
      currentBranch.pr === 81 &&
      currentBranch.prBase === "main" &&
      currentBranch.prState === "MERGED" &&
      currentBranch.prStateObservationMode === "monotonic" &&
      currentBranch.disposition === "integrated" &&
      protectedMainAdvanceLastMergedExact(currentItem, currentBranch, {
        pullRequestNumber: 81,
        secondParentSha,
        mergeCommitSha,
        mergeTreeSha,
        registryBlobSha,
        orderedParentShas,
        auditContract: {
          status: "failed-currentness-and-stale-activation-repair-required",
          errors: [
            "workItem ahead/behind differs from registry: SENA-A01-REPO-GOVERNANCE-20260827",
            "registry PR state mismatch: #81"
          ],
          ownerBlockers: [],
          unreachableCommitCount: 0
        }
      })
  );
}

export function protectedMainRepairCandidateGitEvidenceMatches(
  lifecycle,
  protectedMainSha,
  finalSecondParentSha
) {
  try {
    const evidence = lifecycle?.initialCandidateCompletionEvidence;
    const protectedRegistry = protectedMainAdvanceRegistryFromCommit(protectedMainSha);
    const candidateRegistry = protectedMainAdvanceRegistryFromCommit(evidence?.headSha);
    const candidateChangedPaths = protectedMainAdvanceChangedPaths(
      protectedMainSha,
      evidence?.headSha
    );
    return Boolean(
      lifecycle?.protectedBaseSha === protectedMainSha &&
        lifecycle.protectedBaseTreeSha ===
          protectedMainAdvanceObjectSha(`${protectedMainSha}^{tree}`) &&
        lifecycle.protectedBaseRegistryBlobSha === protectedMainAdvanceObjectSha(
          `${protectedMainSha}:${REGISTRY_REPO_PATH}`
        ) &&
        protectedRegistry &&
        protectedMainAdvanceObjectSha(`${evidence?.headSha}^{commit}`) &&
        git(["merge-base", "--is-ancestor", protectedMainSha, evidence.headSha], {
          allowFailure: true
        }).status === 0 &&
        evidence.treeSha ===
          protectedMainAdvanceObjectSha(`${evidence.headSha}^{tree}`) &&
        evidence.registryBlobSha === protectedMainAdvanceObjectSha(
          `${evidence.headSha}:${REGISTRY_REPO_PATH}`
        ) &&
        evidence.verifierBlobSha === protectedMainAdvanceObjectSha(
          `${evidence.headSha}:scripts/verify-sena-repo-governance.mjs`
        ) &&
        evidence.governanceTestBlobSha === protectedMainAdvanceObjectSha(
          `${evidence.headSha}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
        ) &&
        candidateRegistry &&
        sameStringSet(candidateChangedPaths, lifecycle.requiredOverallPaths) &&
        protectedMainAdvanceExactOneRegistryMetadataCommit(
          evidence.headSha,
          finalSecondParentSha
        ) &&
        protectedMainAdvanceObjectSha(
          `${finalSecondParentSha}:scripts/verify-sena-repo-governance.mjs`
        ) === evidence.verifierBlobSha &&
        protectedMainAdvanceObjectSha(
          `${finalSecondParentSha}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
        ) === evidence.governanceTestBlobSha
    );
  } catch {
    return false;
  }
}

export function validateProtectedCurrentnessRepairMergeDescriptor({
  mergeTimeRegistry,
  currentObservationRegistry,
  mergeCommitSha,
  orderedParentShas,
  secondParentSha,
  mergeTreeSha,
  registryBlobSha
}, options = {}) {
  let mergeTime;
  try {
    mergeTime = validateProtectedCurrentnessRepairLifecycleSnapshot(
      mergeTimeRegistry,
      PROTECTED_CURRENTNESS_REPAIR_SNAPSHOT_STRUCTURAL_ONLY
    );
  } catch {
    return false;
  }
  if (
    mergeTime.lifecycle.status !== PROTECTED_CURRENTNESS_REPAIR_FINAL_STATUS ||
    mergeTime.item.branch !== PROTECTED_CURRENTNESS_REPAIR_BRANCH ||
    mergeTime.branch.prBase !== "main" ||
    mergeTime.lifecycle.pullRequestNumber !== 82 ||
    mergeTime.item.headSha !==
      mergeTime.lifecycle.initialCandidateCompletionEvidence?.headSha ||
    mergeTime.branch.headSha !== mergeTime.item.headSha ||
    !protectedMainAdvanceExactOneRegistryMetadataCommit(
      mergeTime.item.headSha,
      secondParentSha
    )
  ) {
    return false;
  }
  if (!protectedMainRepairCandidateGitEvidenceMatches(
    mergeTime.lifecycle,
    orderedParentShas[0],
    secondParentSha
  )) {
    return false;
  }
  if (options.mergeTimeOnly === true) return true;
  const currentItem = protectedCurrentnessRepairWorkItem(currentObservationRegistry);
  const currentBranch = protectedCurrentnessRepairBranch(currentObservationRegistry);
  const hasLastMerged = Boolean(
    currentItem?.lastMergedPullRequest || currentBranch?.lastMergedPullRequest
  );
  if (hasLastMerged) {
    return Boolean(
      currentItem?.headSha === secondParentSha &&
        currentItem.disposition === "integrated" &&
        currentBranch?.headSha === secondParentSha &&
        currentBranch.prState === "MERGED" &&
        currentBranch.prStateObservationMode === "monotonic" &&
        currentBranch.disposition === "integrated" &&
        protectedMainAdvanceLastMergedExact(currentItem, currentBranch, {
          pullRequestNumber: 82,
          secondParentSha,
          mergeCommitSha,
          mergeTreeSha,
          registryBlobSha,
          orderedParentShas,
          auditContract: {
            status: "pass",
            errors: [],
            ownerBlockers: [],
            unreachableCommitCount: 0
          }
        })
    );
  }
  const current = {
    item: currentItem,
    branch: currentBranch,
    lifecycle: currentItem?.protectedCurrentnessActivationRepairLifecycle
  };
  return Boolean(
    current.item &&
      current.branch &&
      current.item.headSha === mergeTime.item.headSha &&
      current.item.ownerKey === mergeTime.item.ownerKey &&
      current.item.branch === mergeTime.item.branch &&
      current.item.disposition === "active" &&
      current.branch.headSha === mergeTime.branch.headSha &&
      current.branch.pr === 82 &&
      current.branch.prBase === "main" &&
      current.branch.prState === "OPEN" &&
      current.branch.prStateObservationMode === "monotonic" &&
      sameJson(current.lifecycle, mergeTime.lifecycle)
  );
}

const PR46_RETIREMENT_TASK_ID = "SENA-BRANCH-RETIREMENT-20260829";
const PR46_RETIREMENT_BRANCH = "codex/sena-branch-retirement-20260829";
const PR46_FINAL_HANDSHAKE_STATUS =
  "final-pr46-ready-authorization-pending-final-head-checks";
const PR46_REMERGE_RECEIPT = "pr46-final-base-handshake-remerge-candidate";
const PR46_FINAL_RECEIPT = "pr46-final-base-handshake-final-authorization";
const PR46_FINAL_READY_ACTION =
  "pr46ReadyAndProtectedMergeAuthorizedAfterFinalCandidateChecks";
const PR46_FINAL_METADATA_ACTION =
  "finalAuthorizationMetadataCommitAuthorizedAfterInitialExactHeadChecks";
const PR46_USED_ACTIONS = [
  "finalOrdinaryMergeReconciliationAuthorizedAfterProtectedActivation",
  "finalResolverAndTestStageAuthorizedAfterProtectedActivation",
  "finalMergeCommitPushAuthorizedAfterRequiredGates",
  PR46_FINAL_METADATA_ACTION
];
const PR46_CLOSED_ACTIONS = [
  "implementationAuthorizedNow", "localRefRetirementAuthorized",
  "retirementReceiptMintingAuthorized", "branchDeletionAuthorized",
  "worktreeRemovalAuthorized", "orphanWorktreeMutationAuthorized",
  "targetTagMutationAuthorized", "quarantineMutationAuthorized",
  "deploymentAuthorized", "providerMutationAuthorized", "resetAuthorized",
  "rebaseAuthorized", "stashAuthorized", "forceAuthorized", "historyRewriteAuthorized"
];
const PR46_RECEIPT_BOUNDARY_KEYS = [
  PR46_FINAL_METADATA_ACTION,
  PR46_FINAL_READY_ACTION,
  ...PR46_CLOSED_ACTIONS
];
const PR46_HANDSHAKE_KEYS = [
  "status", "oneShot", "authorizationSourceMainSha", "authorizationSourceMainTreeSha",
  "authorizationSourceRegistryBlobSha", "protectedActivationBinding", "pullRequestNumber",
  "candidateHeadSha", "candidateTreeSha", "candidateRegistryBlobSha",
  "candidateVerifierBlobSha", "candidateGovernanceTestBlobSha", "candidateParents",
  "mergeBaseSha", "currentProtectedMainSha", "currentProtectedMainTreeSha",
  "currentProtectedRegistryBlobSha", "currentMergeTreeSha", "currentConflictPathCount",
  "currentConflictingPaths", "currentCandidateOnlyCleanPaths",
  "currentBinaryDiffSha256AgainstProtectedMain", "observedResolverRed",
  "authorizedResolverTransition", "candidateVerification", "requiredExecution",
  "finalOrdinaryMergeReconciliationAuthorizedAfterProtectedActivation",
  "finalResolverAndTestStageAuthorizedAfterProtectedActivation",
  "finalMergeCommitPushAuthorizedAfterRequiredGates", PR46_FINAL_METADATA_ACTION,
  PR46_FINAL_READY_ACTION, ...PR46_CLOSED_ACTIONS, "protectedReceiptPrefix",
  "remergeCandidateCompletionEvidence"
];
const PR46_CANDIDATE_RECEIPT_KEYS = [
  "schemaVersion", "receiptKind", "status", "taskId", "ownerKey", "scope",
  "protectedReceiptPrefix", "authorizationBoundary"
];
const PR46_FINAL_RECEIPT_KEYS = [
  "schemaVersion", "receiptKind", "status", "taskId", "ownerKey", "scope",
  "remergeCandidateCompletionEvidence", "authorizationBoundary"
];
const PR46_OVERALL_PATHS = [
  REGISTRY_REPO_PATH,
  "scripts/verify-sena-repo-governance.mjs",
  "sena-hk-template/lib/sena/__tests__/repo-governance.test.ts"
];

export function protectedMainNormalizedNonOwnedRegistrySha256(registry) {
  const normalized = protectedActivationControlledExactClone(
    registry ?? {},
    "rule=protected-activation-completion-registry-normalization-invalid"
  );
  normalized.updatedAt = "<branch-retirement-owned>";
  normalized.workItems = (normalized.workItems ?? []).map((entry) =>
    entry?.taskId === PR46_RETIREMENT_TASK_ID
      ? { taskId: PR46_RETIREMENT_TASK_ID, owned: "<branch-retirement-owned>" }
      : entry
  );
  normalized.branches = (normalized.branches ?? []).map((entry) =>
    entry?.name === PR46_RETIREMENT_BRANCH
      ? { name: PR46_RETIREMENT_BRANCH, owned: "<branch-retirement-owned>" }
      : entry
  );
  normalized.releaseReceipts = (normalized.releaseReceipts ?? []).filter(
    (entry) => entry?.taskId !== PR46_RETIREMENT_TASK_ID
  );
  return sha256Buffer(Buffer.from(JSON.stringify(normalized)));
}

export function protectedMainPr46BinaryDiffSha256(protectedMainSha, candidateHeadSha) {
  const result = git(
    [
      "diff", "--binary", "--no-ext-diff", "--no-renames",
      protectedMainSha, candidateHeadSha, "--", ...PR46_OVERALL_PATHS
    ],
    { allowFailure: true, binary: true }
  );
  if (result.error || result.status !== 0) return null;
  return sha256Buffer(result.stdout ?? Buffer.alloc(0));
}

function protectedMainAdvancePr46EvidenceValid(handshake) {
  const evidence = handshake?.remergeCandidateCompletionEvidence;
  const requiredFields = handshake?.authorizedResolverTransition?.finalReadyState
    ?.requiredRemergeCandidateCompletionEvidenceFields;
  if (!exactPlainJsonOwnKeys(evidence, requiredFields)) return false;
  const shaFields = [
    "candidateHeadSha",
    "candidateTreeSha",
    "candidateRegistryBlobSha",
    "candidateVerifierBlobSha",
    "candidateGovernanceTestBlobSha"
  ];
  const sha256Fields = [
    "binaryDiffSha256AgainstProtectedMain",
    "normalizedRegistrySha256"
  ];
  return Boolean(
    shaFields.every((field) => isSha(evidence[field])) &&
      sha256Fields.every((field) => validSha256(evidence[field])) &&
      Array.isArray(evidence.candidateParentShas) &&
      evidence.candidateParentShas.length === 2 &&
      evidence.candidateParentShas.every(isSha) &&
      Number.isInteger(evidence.fullRepoGovernanceTestsPassed) &&
      evidence.fullRepoGovernanceTestsPassed > 0 &&
      evidence.fullRepoGovernanceTestsPassed === evidence.fullRepoGovernanceTestsTotal &&
      Number.isInteger(evidence.buildRunId) &&
      evidence.buildRunId > 0 &&
      Array.isArray(evidence.repositorySecurityRunIds) &&
      evidence.repositorySecurityRunIds.length === 2 &&
      evidence.repositorySecurityRunIds.every((value) => Number.isInteger(value) && value > 0) &&
      Array.isArray(evidence.checkJobIds) &&
      evidence.checkJobIds.length === 3 &&
      evidence.checkJobIds.every((value) => Number.isInteger(value) && value > 0) &&
      [
        "candidateIndexAuditPassed",
        "writePolicyPassed",
        "securityPassed",
        "exactConflictIntakePassed",
        "specReviewApproved",
        "qualityReviewApproved",
        "requiredChecksPassed",
        "annotationsEmpty"
      ].every((field) => evidence[field] === true) &&
      typeof evidence.conflictIntakeMode === "string"
  );
}

export function protectedMainPr46CandidateGitEvidenceMatches(
  evidence,
  protectedMainSha,
  finalSecondParentSha
) {
  try {
    const candidateParents = protectedMainAdvanceCommitParents(evidence?.candidateHeadSha);
    const candidateRegistry = protectedMainAdvanceRegistryFromCommit(evidence?.candidateHeadSha);
    const protectedMainRegistry = protectedMainAdvanceRegistryFromCommit(protectedMainSha);
    const candidateChangedPaths = protectedMainAdvanceChangedPaths(
      protectedMainSha,
      evidence?.candidateHeadSha
    );
    return Boolean(
      sameJson(candidateParents, evidence?.candidateParentShas) &&
        candidateParents?.length === 2 &&
        candidateParents[1] === protectedMainSha &&
        evidence.candidateTreeSha ===
          protectedMainAdvanceObjectSha(`${evidence.candidateHeadSha}^{tree}`) &&
        evidence.candidateRegistryBlobSha === protectedMainAdvanceObjectSha(
          `${evidence.candidateHeadSha}:${REGISTRY_REPO_PATH}`
        ) &&
        evidence.candidateVerifierBlobSha === protectedMainAdvanceObjectSha(
          `${evidence.candidateHeadSha}:scripts/verify-sena-repo-governance.mjs`
        ) &&
        evidence.candidateGovernanceTestBlobSha === protectedMainAdvanceObjectSha(
          `${evidence.candidateHeadSha}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
        ) &&
        candidateRegistry &&
        protectedMainRegistry &&
        sameStringSet(candidateChangedPaths, PR46_OVERALL_PATHS) &&
        evidence.binaryDiffSha256AgainstProtectedMain ===
          protectedMainPr46BinaryDiffSha256(protectedMainSha, evidence.candidateHeadSha) &&
        evidence.normalizedRegistrySha256 ===
          protectedMainNormalizedNonOwnedRegistrySha256(candidateRegistry) &&
        protectedMainNormalizedNonOwnedRegistrySha256(protectedMainRegistry) ===
          protectedMainNormalizedNonOwnedRegistrySha256(candidateRegistry) &&
        protectedMainAdvanceExactOneRegistryMetadataCommit(
          evidence.candidateHeadSha,
          finalSecondParentSha
        ) &&
        protectedMainAdvanceObjectSha(
          `${finalSecondParentSha}:scripts/verify-sena-repo-governance.mjs`
        ) === evidence.candidateVerifierBlobSha &&
        protectedMainAdvanceObjectSha(
          `${finalSecondParentSha}:sena-hk-template/lib/sena/__tests__/repo-governance.test.ts`
        ) === evidence.candidateGovernanceTestBlobSha
    );
  } catch {
    return false;
  }
}

export function validatePr46ProtectedMainMergeDescriptor({
  mergeTimeRegistry,
  currentObservationRegistry,
  mergeCommitSha,
  orderedParentShas,
  secondParentSha,
  mergeTreeSha,
  registryBlobSha
}, options = {}) {
  const item = (mergeTimeRegistry?.workItems ?? []).find(
    (entry) => entry?.taskId === PR46_RETIREMENT_TASK_ID
  );
  const branch = (mergeTimeRegistry?.branches ?? []).find(
    (entry) => entry?.name === PR46_RETIREMENT_BRANCH
  );
  const handshake = item?.finalBaseHandshakeAuthorization;
  const finalReadyState = handshake?.authorizedResolverTransition?.finalReadyState;
  const evidence = handshake?.remergeCandidateCompletionEvidence;
  const receipts = mergeTimeRegistry?.releaseReceipts;
  const prefix = handshake?.protectedReceiptPrefix;
  const candidateReceipt = Array.isArray(receipts) && Number.isInteger(prefix?.count)
    ? receipts[prefix.count]
    : null;
  const finalReceipt = Array.isArray(receipts) && Number.isInteger(prefix?.count)
    ? receipts[prefix.count + 1]
    : null;
  if (
    !item ||
    !branch ||
    !exactPlainJsonOwnKeys(handshake, PR46_HANDSHAKE_KEYS) ||
    !exactPlainJsonOwnKeys(prefix, ["count", "sha256"]) ||
    !exactPlainJsonOwnKeys(candidateReceipt, PR46_CANDIDATE_RECEIPT_KEYS) ||
    !exactPlainJsonOwnKeys(
      candidateReceipt.protectedReceiptPrefix,
      ["count", "sha256"]
    ) ||
    !exactPlainJsonOwnKeys(
      candidateReceipt.authorizationBoundary,
      PR46_RECEIPT_BOUNDARY_KEYS
    ) ||
    !exactPlainJsonOwnKeys(finalReceipt, PR46_FINAL_RECEIPT_KEYS) ||
    !exactPlainJsonOwnKeys(
      finalReceipt.remergeCandidateCompletionEvidence,
      finalReadyState?.requiredRemergeCandidateCompletionEvidenceFields
    ) ||
    !exactPlainJsonOwnKeys(
      finalReceipt.authorizationBoundary,
      PR46_RECEIPT_BOUNDARY_KEYS
    ) ||
    handshake?.status !== PR46_FINAL_HANDSHAKE_STATUS ||
    !sameJson(finalReadyState?.requiredOverallChangedPathsFromProtectedMain, PR46_OVERALL_PATHS) ||
    !sameJson(finalReadyState?.requiredCurrentCommitChangedPathsFromFirstParent, [REGISTRY_REPO_PATH]) ||
    finalReadyState?.requiredCurrentFirstParentBinding !==
      "remergeCandidateCompletionEvidence.candidateHeadSha" ||
    !protectedMainAdvancePr46EvidenceValid(handshake) ||
    !protectedMainAdvanceReceiptPrefixMatches(receipts, prefix) ||
    receipts.length !== prefix.count + 2 ||
    item.prNumber !== 46 ||
    item.branch !== PR46_RETIREMENT_BRANCH ||
    item.ownerKey !== "Codex-branch-retirement-01a04916" ||
    item.headSha !== evidence.candidateHeadSha ||
    item.disposition !== "active" ||
    item.prIsDraft !== true ||
    item.prReadyForReview !== false ||
    item.mergeAuthorized !== false ||
    branch.pr !== 46 ||
    branch.prBase !== "main" ||
    branch.headSha !== evidence.candidateHeadSha ||
    branch.remoteHeadSha !== evidence.candidateHeadSha ||
    branch.prHeadSha !== evidence.candidateHeadSha ||
    branch.prState !== "OPEN" ||
    branch.prIsDraft !== true ||
    branch.prReadyForReview !== false ||
    branch.mergeAuthorized !== false ||
    PR46_USED_ACTIONS.some((field) => handshake[field] !== false) ||
    PR46_CLOSED_ACTIONS.some((field) => handshake[field] !== false) ||
    handshake[PR46_FINAL_READY_ACTION] !== true ||
    !protectedMainAdvanceExactOneRegistryMetadataCommit(
      evidence.candidateHeadSha,
      secondParentSha
    )
  ) {
    return false;
  }
  if (!protectedMainPr46CandidateGitEvidenceMatches(
    evidence,
    orderedParentShas[0],
    secondParentSha
  )) {
    return false;
  }
  if (
    candidateReceipt?.schemaVersion !== "sena-registry-reconciliation-receipt/v1" ||
    candidateReceipt?.receiptKind !== PR46_REMERGE_RECEIPT ||
    candidateReceipt?.status !== "consumed-by-final-pr46-remerge-candidate-awaiting-ci" ||
    candidateReceipt?.taskId !== PR46_RETIREMENT_TASK_ID ||
    candidateReceipt?.ownerKey !== item.ownerKey ||
    !sameJson(candidateReceipt?.scope, PR46_OVERALL_PATHS) ||
    !sameJson(candidateReceipt?.protectedReceiptPrefix, prefix) ||
    !protectedMainAdvanceReceiptAuthorizationExact(
      candidateReceipt,
      PR46_FINAL_METADATA_ACTION
    ) ||
    finalReceipt?.schemaVersion !== "sena-registry-reconciliation-receipt/v1" ||
    finalReceipt?.receiptKind !== PR46_FINAL_RECEIPT ||
    finalReceipt?.status !== PR46_FINAL_HANDSHAKE_STATUS ||
    finalReceipt?.taskId !== PR46_RETIREMENT_TASK_ID ||
    finalReceipt?.ownerKey !== item.ownerKey ||
    !sameJson(finalReceipt?.scope, [REGISTRY_REPO_PATH]) ||
    !sameJson(finalReceipt?.remergeCandidateCompletionEvidence, evidence) ||
    !protectedMainAdvanceReceiptAuthorizationExact(finalReceipt, PR46_FINAL_READY_ACTION) ||
    receipts.filter((receipt) => receipt?.receiptKind === PR46_REMERGE_RECEIPT).length !== 1 ||
    receipts.filter((receipt) => receipt?.receiptKind === PR46_FINAL_RECEIPT).length !== 1
  ) {
    return false;
  }
  if (options.mergeTimeOnly === true) return true;
  const currentItem = (currentObservationRegistry?.workItems ?? []).find(
    (entry) => entry?.taskId === PR46_RETIREMENT_TASK_ID
  );
  const currentBranch = (currentObservationRegistry?.branches ?? []).find(
    (entry) => entry?.name === PR46_RETIREMENT_BRANCH
  );
  const hasLastMerged = Boolean(
    currentItem?.lastMergedPullRequest || currentBranch?.lastMergedPullRequest
  );
  if (hasLastMerged) {
    return Boolean(
      currentItem?.headSha === secondParentSha &&
        currentItem.disposition === "integrated" &&
        currentBranch?.headSha === secondParentSha &&
        currentBranch.prState === "MERGED" &&
        currentBranch.prStateObservationMode === "monotonic" &&
        currentBranch.disposition === "integrated" &&
        protectedMainAdvanceLastMergedExact(currentItem, currentBranch, {
          pullRequestNumber: 46,
          secondParentSha,
          mergeCommitSha,
          mergeTreeSha,
          registryBlobSha,
          orderedParentShas,
          auditContract: {
            status: "pass",
            errors: [],
            ownerBlockers: [],
            unreachableCommitCount: 0
          }
        })
    );
  }
  return Boolean(
    currentItem?.headSha === evidence.candidateHeadSha &&
      currentItem.ownerKey === item.ownerKey &&
      currentItem.branch === item.branch &&
      currentItem.disposition === "active" &&
      currentBranch?.headSha === evidence.candidateHeadSha &&
      currentBranch.pr === 46 &&
      currentBranch.prBase === "main" &&
      currentBranch.prState === "OPEN" &&
      currentBranch.prStateObservationMode === "monotonic" &&
      sameJson(currentItem.finalBaseHandshakeAuthorization, handshake)
  );
}

function protectedMainPr81MergeTimeCandidate(descriptor) {
  if (!validatePr81ProtectedMainMergeDescriptor(descriptor, { mergeTimeOnly: true })) {
    return null;
  }
  const expectedPaths = (descriptor.mergeTimeRegistry.workItems ?? []).find(
    (entry) => entry?.taskId === PR81_CLOSEOUT_TASK_ID
  ).pr81PostMainCurrentnessCloseoutLifecycle.requiredCandidatePaths;
  return {
    kind: "pr81-registry-closeout",
    expectedPaths,
    currentObservationValidator(currentObservationRegistry) {
      return validatePr81ProtectedMainMergeDescriptor({
        ...descriptor,
        currentObservationRegistry
      });
    }
  };
}

function protectedMainRepairMergeTimeCandidate(descriptor) {
  if (
    !validateProtectedCurrentnessRepairMergeDescriptor(descriptor, {
      mergeTimeOnly: true
    })
  ) {
    return null;
  }
  const expectedPaths = protectedCurrentnessRepairWorkItem(
    descriptor.mergeTimeRegistry
  ).protectedCurrentnessActivationRepairLifecycle.requiredOverallPaths;
  return {
    kind: "protected-currentness-repair",
    expectedPaths,
    currentObservationValidator(currentObservationRegistry) {
      return validateProtectedCurrentnessRepairMergeDescriptor({
        ...descriptor,
        currentObservationRegistry
      });
    }
  };
}

function protectedMainPr46MergeTimeCandidate(descriptor) {
  if (!validatePr46ProtectedMainMergeDescriptor(descriptor, { mergeTimeOnly: true })) {
    return null;
  }
  const expectedPaths = (descriptor.mergeTimeRegistry.workItems ?? []).find(
    (entry) => entry?.taskId === PR46_RETIREMENT_TASK_ID
  ).finalBaseHandshakeAuthorization.authorizedResolverTransition.finalReadyState
    .requiredOverallChangedPathsFromProtectedMain;
  return {
    kind: "pr46-final-base-handshake",
    expectedPaths,
    currentObservationValidator(currentObservationRegistry) {
      return validatePr46ProtectedMainMergeDescriptor({
        ...descriptor,
        currentObservationRegistry
      });
    }
  };
}

function postPr83ProtectedCurrentObservationValid(
  currentObservationRegistry,
  descriptor
) {
  try {
    const lifecycle = validatePostPr83CurrentnessCorrectionSnapshot(
      currentObservationRegistry
    );
    if (lifecycle.status !== POST_PR83_CURRENTNESS_FINAL_STATUS) return false;
    if (!gitObjectExists("origin/main^{commit}")) return false;
    const liveMainSha = gitText(["rev-parse", "origin/main"]).trim();
    if (
      !isSha(liveMainSha) ||
      git([
        "merge-base",
        "--is-ancestor",
        descriptor.mergeCommitSha,
        liveMainSha
      ], { allowFailure: true }).status !== 0
    ) {
      return false;
    }
    validatePostPr83FinalHeadLiveGitHubEvidence(
      descriptor,
      postPr83CurrentnessItem(currentObservationRegistry)?.prNumber
    );
    return POST_PR83_CURRENTNESS_PROTECTED_LANES.every((contract) => {
      const item = (currentObservationRegistry.workItems ?? []).find(
        (entry) => entry?.taskId === contract.taskId
      );
      const observed = actualAheadBehind(item?.headSha, "origin/main");
      return Boolean(
        postPr83ProtectedLaneShapeAllowed(item, currentObservationRegistry) &&
          observed &&
          observed.ahead === item.aheadBehind.ahead &&
          observed.behind > item.aheadBehind.behind
      );
    });
  } catch {
    return false;
  }
}

export function validatePostPr83ProtectedMainMergeDescriptor(
  descriptor,
  options = {}
) {
  try {
    const {
      mergeTimeRegistry,
      currentObservationRegistry,
      mergeCommitSha,
      orderedParentShas,
      secondParentSha,
      mergeTreeSha,
      registryBlobSha
    } = descriptor ?? {};
    const lifecycle = validatePostPr83CurrentnessCorrectionSnapshot(
      mergeTimeRegistry
    );
    const evidence = lifecycle.initialCandidateCompletionEvidence;
    if (
      lifecycle.status !== POST_PR83_CURRENTNESS_FINAL_STATUS ||
      !isSha(mergeCommitSha) ||
      !sameJson(orderedParentShas, [
        POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA,
        secondParentSha
      ]) ||
      !isSha(secondParentSha) ||
      !isSha(mergeTreeSha) ||
      !isSha(registryBlobSha) ||
      protectedMainAdvanceObjectSha(`${secondParentSha}^{tree}`) !==
        mergeTreeSha ||
      protectedMainAdvanceObjectSha(
        `${secondParentSha}:${REGISTRY_REPO_PATH}`
      ) !== registryBlobSha ||
      protectedMainAdvanceObjectSha(`${mergeCommitSha}^{tree}`) !==
        mergeTreeSha ||
      !sameJson(
        protectedMainAdvanceCommitParents(mergeCommitSha),
        orderedParentShas
      ) ||
      !sameJson(commitParents(secondParentSha), [evidence.headSha]) ||
      !sameStringSet(
        protectedMainAdvanceChangedPaths(evidence.headSha, secondParentSha) ??
          [],
        POST_PR83_CURRENTNESS_FINAL_PATHS
      ) ||
      !sameStringSet(
        protectedMainAdvanceChangedPaths(
          POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA,
          evidence.headSha
        ) ?? [],
        POST_PR83_CURRENTNESS_INITIAL_PATHS
      ) ||
      !sameStringSet(
        protectedMainAdvanceChangedPaths(
          POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA,
          secondParentSha
        ) ?? [],
        POST_PR83_CURRENTNESS_INITIAL_PATHS
      ) ||
      !sameJson(
        protectedMainAdvanceRegistryFromCommit(secondParentSha),
        mergeTimeRegistry
      )
    ) {
      return false;
    }
    validatePostPr83CurrentnessCompletionEvidence(
      evidence,
      evidence.headSha,
      loadRegistryFromCommit(evidence.headSha).parsed
    );
    if (options.mergeTimeOnly === true) return true;
    return postPr83ProtectedCurrentObservationValid(
      currentObservationRegistry,
      descriptor
    );
  } catch {
    return false;
  }
}

function protectedMainPostPr83CurrentnessMergeTimeCandidate(descriptor) {
  if (
    !validatePostPr83ProtectedMainMergeDescriptor(descriptor, {
      mergeTimeOnly: true
    })
  ) {
    return null;
  }
  return {
    kind: "post-pr83-currentness-correction",
    expectedPaths: POST_PR83_CURRENTNESS_INITIAL_PATHS,
    currentObservationValidator(currentObservationRegistry) {
      return validatePostPr83ProtectedMainMergeDescriptor({
        ...descriptor,
        currentObservationRegistry
      });
    }
  };
}

export function protectedMainUniqueMergeTimeCandidate(matches) {
  const candidates = matches.filter(Boolean);
  return candidates.length === 1 ? candidates[0] : null;
}

export function protectedMainMergeTimeCandidateResolution(descriptor) {
  return protectedMainUniqueMergeTimeCandidate([
    protectedMainPr81MergeTimeCandidate(descriptor),
    protectedMainRepairMergeTimeCandidate(descriptor),
    protectedMainPr46MergeTimeCandidate(descriptor),
    protectedMainPostPr83CurrentnessMergeTimeCandidate(descriptor)
  ]);
}

export function protectedMainAdvanceChainResolution(
  currentObservationRegistry,
  fromSha,
  toSha
) {
  const validated = [];
  let activeCommitSha = null;
  const rejected = (rule, failedCommitSha = activeCommitSha) => ({
    allowed: false,
    rule,
    mergeCommitShas: [...validated],
    failedCommitSha: isSha(failedCommitSha) ? failedCommitSha : null
  });
  try {
    if (!isSha(fromSha) || !isSha(toSha)) {
      return rejected("protected-advance-sha-invalid", null);
    }
    if (fromSha === toSha) {
      return {
        allowed: true,
        rule: null,
        mergeCommitShas: [],
        failedCommitSha: null
      };
    }
    if (!protectedMainAdvanceObjectSha(`${fromSha}^{commit}`)) {
      return rejected("protected-advance-git-read-failed", fromSha);
    }
    if (!protectedMainAdvanceObjectSha(`${toSha}^{commit}`)) {
      return rejected("protected-advance-git-read-failed", toSha);
    }
    if (git(["merge-base", "--is-ancestor", fromSha, toSha], {
      allowFailure: true
    }).status !== 0) {
      return rejected("protected-advance-first-parent-chain-mismatch", toSha);
    }
    const chainText = protectedMainAdvanceGitText([
      "rev-list",
      "--first-parent",
      "--reverse",
      `${fromSha}..${toSha}`
    ]);
    if (!chainText) return rejected("protected-advance-git-read-failed", toSha);
    const chain = chainText.split("\n").filter(Boolean);
    let previous = fromSha;
    for (const mergeCommitSha of chain) {
      activeCommitSha = mergeCommitSha;
      const orderedParentShas = protectedMainAdvanceCommitParents(mergeCommitSha);
      if (!orderedParentShas) {
        return rejected("protected-advance-git-read-failed");
      }
      if (orderedParentShas.length !== 2) {
        return rejected("protected-advance-parent-count");
      }
      if (orderedParentShas[0] !== previous) {
        return rejected("protected-advance-first-parent-order");
      }
      const secondParentSha = orderedParentShas[1];
      const mergeTreeSha = protectedMainAdvanceObjectSha(`${mergeCommitSha}^{tree}`);
      const secondParentTreeSha = protectedMainAdvanceObjectSha(`${secondParentSha}^{tree}`);
      if (!mergeTreeSha || !secondParentTreeSha) {
        return rejected("protected-advance-git-read-failed");
      }
      if (mergeTreeSha !== secondParentTreeSha) {
        return rejected("protected-advance-tree-mismatch");
      }
      const registryBlobSha = protectedMainAdvanceObjectSha(
        `${mergeCommitSha}:${REGISTRY_REPO_PATH}`
      );
      const secondParentRegistryBlobSha = protectedMainAdvanceObjectSha(
        `${secondParentSha}:${REGISTRY_REPO_PATH}`
      );
      const mergeTimeRegistry = protectedMainAdvanceRegistryFromCommit(secondParentSha);
      if (!registryBlobSha || !secondParentRegistryBlobSha || !mergeTimeRegistry) {
        return rejected("protected-advance-registry-read-failed");
      }
      if (registryBlobSha !== secondParentRegistryBlobSha) {
        return rejected("protected-advance-registry-blob-mismatch");
      }
      const mergeDescriptor = {
        mergeTimeRegistry,
        mergeCommitSha,
        orderedParentShas,
        secondParentSha,
        mergeTreeSha,
        registryBlobSha
      };
      const selectedCandidate = protectedMainMergeTimeCandidateResolution(
        mergeDescriptor
      );
      const changedPaths = protectedMainAdvanceChangedPaths(previous, mergeCommitSha);
      if (!selectedCandidate) {
        return rejected("protected-advance-lifecycle-unrecognized");
      }
      if (!changedPaths) {
        return rejected("protected-advance-git-read-failed");
      }
      if (!sameStringSet(changedPaths, selectedCandidate.expectedPaths)) {
        return rejected("protected-advance-path-set-mismatch");
      }
      if (!selectedCandidate.currentObservationValidator(currentObservationRegistry)) {
        return rejected("protected-advance-current-observation-invalid");
      }
      validated.push(mergeCommitSha);
      previous = mergeCommitSha;
    }
    if (previous !== toSha) {
      return rejected("protected-advance-first-parent-chain-mismatch", toSha);
    }
    return {
      allowed: true,
      rule: null,
      mergeCommitShas: [...validated],
      failedCommitSha: null
    };
  } catch {
    return rejected("protected-advance-git-read-failed");
  }
}

export function integratedReadOnlyRootRegistryAdvanceAllowed(
  item,
  actualHeadSha,
  currentObservationRegistry
) {
  if (
    item?.taskId !== "SENA-A01-ROOT-CONTROL-PLANE-20260828" ||
    item.disposition !== "integrated" ||
    item.laneType !== "read-only" ||
    item.branch !== "main" ||
    item.aheadBehind?.baseRef !== "origin/main" ||
    !String(item.dirtyState ?? "").startsWith("clean") ||
    canonicalExistingPath(item.repo) !== canonicalExistingPath(CONTROL_ROOT) ||
    canonicalExistingPath(item.cwd) !== canonicalExistingPath(CONTROL_ROOT) ||
    canonicalExistingPath(item.worktreePath) !== canonicalExistingPath(CONTROL_ROOT) ||
    !isSha(item.headSha) ||
    !isSha(actualHeadSha) ||
    item.headSha === actualHeadSha ||
    !gitObjectExists(`${item.headSha}^{commit}`) ||
    !gitObjectExists(`${actualHeadSha}^{commit}`) ||
    !gitObjectExists("origin/main^{commit}") ||
    gitText(["rev-parse", "origin/main"]).trim() !== actualHeadSha ||
    git(["merge-base", "--is-ancestor", item.headSha, actualHeadSha], { allowFailure: true }).status !== 0
  ) {
    return false;
  }
  return protectedMainAdvanceChainResolution(
    currentObservationRegistry,
    item.headSha,
    actualHeadSha
  ).allowed;
}

export function integratedReadOnlyRootRemoteRegistryAdvanceAllowed(
  item,
  actualHeadSha,
  observed,
  branchRecord,
  currentObservationRegistry
) {
  const recorded = item?.aheadBehind;
  if (
    item?.taskId !== "SENA-A01-ROOT-CONTROL-PLANE-20260828" ||
    item.disposition !== "integrated" ||
    item.laneType !== "read-only" ||
    item.branch !== "main" ||
    recorded?.baseRef !== "origin/main" ||
    recorded.ahead !== 0 ||
    observed?.ahead !== 0 ||
    observed.behind <= recorded.behind ||
    !String(item.dirtyState ?? "").startsWith("clean") ||
    canonicalExistingPath(item.repo) !== canonicalExistingPath(CONTROL_ROOT) ||
    canonicalExistingPath(item.cwd) !== canonicalExistingPath(CONTROL_ROOT) ||
    canonicalExistingPath(item.worktreePath) !== canonicalExistingPath(CONTROL_ROOT) ||
    actualHeadSha !== item.headSha ||
    branchRecord?.name !== "main" ||
    branchRecord.headSha !== actualHeadSha ||
    branchRecord.remoteObservationMode !== "lower-bound" ||
    !isSha(branchRecord.remoteHeadSha) ||
    !gitObjectExists(`${actualHeadSha}^{commit}`) ||
    !gitObjectExists(`${branchRecord.remoteHeadSha}^{commit}`) ||
    !gitObjectExists("origin/main^{commit}")
  ) {
    return false;
  }
  const remoteMainSha = gitText(["rev-parse", "origin/main"]).trim();
  if (
    !isSha(remoteMainSha) ||
    remoteMainSha === branchRecord.remoteHeadSha ||
    git(["merge-base", "--is-ancestor", actualHeadSha, branchRecord.remoteHeadSha], { allowFailure: true }).status !== 0 ||
    git(["merge-base", "--is-ancestor", branchRecord.remoteHeadSha, remoteMainSha], { allowFailure: true }).status !== 0
  ) {
    return false;
  }
  return protectedMainAdvanceChainResolution(
    currentObservationRegistry,
    item.headSha,
    remoteMainSha
  ).allowed;
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
  const { parsed: registry } = loadRegistryForFlags(flags);
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
  const preCommitStagedPaths = flags.has("pre-commit") ? stagedChangedPaths() : [];
  const preCommitUnstagedPaths = flags.has("pre-commit") ? unstagedChangedPaths() : [];
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
      errors.push(`governed local branch is absent: ${branchRecord.name}`);
      continue;
    }
    const branchItem = (registry.workItems ?? []).find((item) => item.branch === branchRecord.name);
    const activeItem =
      branchItem && ACTIVE_WRITE_DISPOSITIONS.has(branchItem.disposition) ? branchItem : null;
    const integratedRootRegistryAdvance =
      branchItem?.headSha === branchRecord.headSha &&
      integratedReadOnlyRootRegistryAdvanceAllowed(branchItem, actual.headSha, registry);
    if (actual.headSha !== branchRecord.headSha && !activeItem && !integratedRootRegistryAdvance) {
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
      const finalHeartbeatCleanClaimAllowed =
        postPr82FinalHeartbeatPreCommitCleanClaimAllowed({
          taskId: item.taskId,
          dirtyState: item.dirtyState,
          lifecycleStatus:
            item.postPr82TopologyHeartbeatLifecycle?.status,
          preCommit: flags.has("pre-commit"),
          registryFromIndex: flags.has("registry-from-index"),
          dirtyPaths,
          stagedPaths: preCommitStagedPaths,
          unstagedPaths: preCommitUnstagedPaths
        });
      if (
        item.dirtyState.startsWith("clean") &&
        dirtyPaths.length > 0 &&
        !finalHeartbeatCleanClaimAllowed
      ) {
        errors.push(`workItem declared clean but worktree is dirty: ${item.taskId}`);
      }
    }

    const integratedRootRegistryAdvance = integratedReadOnlyRootRegistryAdvanceAllowed(
      item,
      actual.headSha,
      registry
    );
    if (actual.headSha !== item.headSha) {
      const advance = scopedWorkItemAdvance(item, actual.headSha);
      const unexpected = advance.laneChangedPaths.filter((path) => !pathIsAllowed(path, item.allowedPaths));
      if (integratedRootRegistryAdvance) {
        warnings.push(`integrated read-only root absorbed a protected-main registry-only advance: ${item.taskId}`);
      } else if (!isActive || !advance.isForward || unexpected.length > 0) {
        errors.push(`workItem headSha is not a permitted forward-only allowed-path advance: ${item.taskId}`);
      } else if (advance.protectedMainBaseline) {
        warnings.push(`active workItem absorbed a protected-main baseline advance: ${item.taskId}`);
      } else {
        warnings.push(`active workItem HEAD advanced beyond last-heartbeated headSha: ${item.taskId}`);
      }
    }
    const observed = actualAheadBehind(actual.headSha, item.aheadBehind.baseRef);
    const integratedRootRemoteRegistryAdvance = integratedReadOnlyRootRemoteRegistryAdvanceAllowed(
      item,
      actual.headSha,
      observed,
      registryBranches.get(item.branch),
      registry
    );
    if (!observed) {
      errors.push(`ahead/behind base is unavailable: ${item.taskId} base=${item.aheadBehind.baseRef}`);
    } else if (observed.ahead !== item.aheadBehind.ahead || observed.behind !== item.aheadBehind.behind) {
      if (isActive) warnings.push(`active workItem ahead/behind advanced since heartbeat: ${item.taskId}`);
      else if (
        protectedLaneMainAdvanceObservationAllowed(
          item,
          actual.headSha,
          observed,
          registry
        )
      ) {
        warnings.push(
          `protected lane fell farther behind through an accepted protected-main merge chain: ${item.taskId}`
        );
      }
      else if (integratedRootRegistryAdvance) {
        // The exact protected-main advance above is already validated.
      } else if (integratedRootRemoteRegistryAdvance) {
        warnings.push(
          `integrated read-only root observed a protected-main registry-only remote advance without advancing local main: ${item.taskId}`
        );
      } else if (integratedMonotonicBehindObservationAllowed(item, actual.headSha, observed)) {
        warnings.push(
          `integrated lane fell farther behind protected main without changing head: ${item.taskId}`
        );
      } else if (integratedCleanupBehindAdvanceAllowed(item, actual.headSha, observed)) {
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
      const postPr83ProtectedChainRequired = Boolean(
        postPr83CurrentnessLifecycle(registry)
      );
      const isPermittedForwardMainObservation = Boolean(
        registry.incident?.credentialExposure?.liveMainObservationMode === "lower-bound" &&
        isSha(recordedIncidentMainSha) &&
        (postPr83ProtectedChainRequired
          ? protectedMainAdvanceChainResolution(
              registry,
              POST_PR83_CURRENTNESS_SOURCE_HEAD_SHA,
              liveMainSha
            ).allowed
          : git(["merge-base", "--is-ancestor", recordedIncidentMainSha, liveMainSha], { allowFailure: true }).status === 0)
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
          const protectedMainLowerBound = Boolean(
            branchRecord.name === "main" &&
              postPr83CurrentnessLifecycle(registry)
          );
          const isPermittedLowerBoundObservation = Boolean(
            branchRecord.remoteObservationMode === "lower-bound" &&
            (protectedMainLowerBound
              ? protectedMainAdvanceChainResolution(
                  registry,
                  branchRecord.remoteHeadSha,
                  liveHeadSha
                ).allowed
              : git(["merge-base", "--is-ancestor", branchRecord.remoteHeadSha, liveHeadSha], { allowFailure: true }).status === 0)
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
