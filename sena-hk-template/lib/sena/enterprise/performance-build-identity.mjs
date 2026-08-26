import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { compareSenaCanonicalText } from "../canonical-order.mjs";

export const SENA_NEXT_BUILD_ID_GENERATOR = "sena-next-build-input/v2";
export const SENA_PERFORMANCE_SOURCE_CUSTODY_GENERATOR = "sena-performance-source-custody/v1";

const includePrefixes = [
  "app/",
  "components/",
  "lib/",
  "packages/",
  "public/",
  "scripts/"
];

const includeRootFiles = [
  ".gitignore",
  ".vercelignore",
  "README.md",
  "next-env.d.ts",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "postcss.config.js",
  "postcss.config.mjs",
  "proxy.ts",
  "tailwind.config.js",
  "tailwind.config.mjs",
  "tailwind.config.ts",
  "tsconfig.json",
  "vercel.json"
];

const excludedPrefixRules = [
  ".git/",
  ".next/",
  ".sena-enterprise/",
  ".turbo/",
  ".vercel/",
  "coverage/",
  "dist/",
  "node_modules/",
  "output/"
];

const excludedSegmentRules = [
  "/__tests__/",
  "/.next/",
  "/node_modules/"
];

const excludedSuffixRules = [
  ".docx",
  ".key",
  ".p12",
  ".pem",
  ".pfx",
  ".spec.ts",
  ".spec.tsx",
  ".test.ts",
  ".test.tsx"
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function isSenaFullGitObjectId(value) {
  return typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
}

function gitOutput(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return result.status === 0 ? result.stdout : undefined;
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function hasEnvOrSecretShape(file) {
  const basename = path.basename(file).toLowerCase();
  return basename === ".env" ||
    basename.startsWith(".env.") ||
    /\.(env|secret|secrets|credentials?)$/i.test(basename);
}

function excludedByRule(file) {
  if (hasEnvOrSecretShape(file)) return true;
  if (excludedPrefixRules.some((prefix) => file.startsWith(prefix))) return true;
  if (excludedSegmentRules.some((segment) => `/${file}`.includes(segment))) return true;
  return excludedSuffixRules.some((suffix) => file.endsWith(suffix));
}

function includedByRule(file) {
  if (includeRootFiles.includes(file)) return true;
  return includePrefixes.some((prefix) => file.startsWith(prefix));
}

function candidateFiles(root) {
  const output = gitOutput(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  if (output === undefined) return [];
  return output
    .split("\0")
    .filter((entry) => entry.length > 0)
    .map((entry) => normalizePath(entry))
    .sort(compareSenaCanonicalText);
}

function filesystemErrorReason(error) {
  const name = error instanceof Error ? error.name : typeof error;
  const code = error && typeof error === "object" && typeof error.code === "string"
    ? error.code
    : "unknown";
  return `filesystem-error:${name}:${code}`;
}

export function senaCanonicalSourceFileHash(root, file) {
  const absolutePath = path.join(root, file);
  try {
    const stats = lstatSync(absolutePath);
    if (stats.isSymbolicLink()) {
      return { ok: false, errorHash: sha256(`${file}:symbolic-link-rejected`) };
    }
    if (!stats.isFile()) {
      return { ok: false, errorHash: sha256(`${file}:non-regular-file-rejected`) };
    }
    return { ok: true, sha256: sha256(readFileSync(absolutePath)) };
  } catch (error) {
    return { ok: false, errorHash: sha256(`${file}:${filesystemErrorReason(error)}`) };
  }
}

function gitIdentity(root) {
  const commit = gitOutput(root, ["rev-parse", "HEAD"])?.trim() || "unavailable";
  const statusText = gitOutput(root, ["status", "--porcelain=v1", "-z"]);
  const dirtyEntries = statusText === undefined
    ? []
    : statusText.split("\0").filter((entry) => entry.length > 0);
  return {
    gitCommit: isSenaFullGitObjectId(commit) ? commit : "unavailable",
    gitDirty: statusText !== undefined ? dirtyEntries.length > 0 : "unknown",
    gitDirtyFileCount: statusText !== undefined ? dirtyEntries.length : "unknown",
    gitStatusSha256: statusText !== undefined ? sha256(statusText) : "unavailable"
  };
}

function packageLockSha256(root) {
  const file = path.join(root, "package-lock.json");
  try {
    return existsSync(file) ? sha256(readFileSync(file)) : "missing";
  } catch {
    return "missing";
  }
}

export function senaSourceFileListSha256(entries) {
  return sha256(JSON.stringify(entries.map((entry) => entry.path)));
}

export function senaSourceTreeSha256(entries) {
  return sha256(JSON.stringify(entries.map((entry) => ({
    path: entry.path,
    sha256: entry.sha256
  }))));
}

function sourceIdentity(root) {
  const selected = [];
  const readErrorHashes = [];
  for (const file of candidateFiles(root)) {
    if (excludedByRule(file) || !includedByRule(file)) continue;
    const result = senaCanonicalSourceFileHash(root, file);
    if (!result.ok) {
      readErrorHashes.push(result.errorHash);
      continue;
    }
    selected.push({ path: file, sha256: result.sha256 });
  }

  selected.sort((a, b) => compareSenaCanonicalText(a.path, b.path));
  const fileListSha256 = senaSourceFileListSha256(selected);
  const sourceTreeSha256 = senaSourceTreeSha256(selected);
  return {
    sourceTreeSha256,
    sourceFileListSha256: fileListSha256,
    sourceFileCount: selected.length,
    sourceReadErrorCount: readErrorHashes.length,
    sourceReadErrorSha256: sha256(readErrorHashes.join("\n"))
  };
}

export function senaNextBuildIdFromInputSha256(buildInputSha256) {
  // Next's fallback BUILD_ID generator rejects the substring "ad" because
  // some ad blockers can treat matching `_next/data/<build-id>` paths as ads.
  // A custom generateBuildId result bypasses that fallback filter. Preserve
  // the complete 256-bit digest with a reversible base-16 alphabet that has no
  // `d`: canonical hex `d` maps to the otherwise-unused URL-safe `x` symbol.
  return `sena-v2-${buildInputSha256.replaceAll("d", "x")}`;
}

export function parseSenaNextBuildId(value) {
  const match = /^sena-v2-([0-9a-ce-fx]{64})$/.exec(value);
  return match
    ? {
        generator: SENA_NEXT_BUILD_ID_GENERATOR,
        buildInputSha256: match[1].replaceAll("x", "d")
      }
    : {
        generator: "unknown",
        buildInputSha256: "unavailable"
      };
}

export function senaBuildInputSha256(input) {
  return sha256(JSON.stringify({
    generator: SENA_NEXT_BUILD_ID_GENERATOR,
    gitCommit: input.gitCommit,
    gitDirty: input.gitDirty,
    gitStatusSha256: input.gitStatusSha256,
    gitDirtyFileCount: input.gitDirtyFileCount,
    packageLockSha256: input.packageLockSha256,
    sourceTreeSha256: input.sourceTreeSha256,
    sourceFileListSha256: input.sourceFileListSha256,
    sourceFileCount: input.sourceFileCount,
    sourceReadErrorCount: input.sourceReadErrorCount,
    sourceReadErrorSha256: input.sourceReadErrorSha256
  }));
}

export function senaNextBuildIdSha256FromInputSha256(buildInputSha256) {
  return sha256(senaNextBuildIdFromInputSha256(buildInputSha256));
}

export function senaPerformanceSourceCustodyManifestSha256(input) {
  return sha256(JSON.stringify({
    schemaVersion: SENA_PERFORMANCE_SOURCE_CUSTODY_GENERATOR,
    generator: SENA_PERFORMANCE_SOURCE_CUSTODY_GENERATOR,
    mode: "reviewed-clean-release-slice",
    baseGitCommit: input.baseGitCommit,
    rootGitStatusSha256: input.rootGitStatusSha256,
    rootGitDirtyFileCount: input.rootGitDirtyFileCount,
    fileListSha256: input.fileListSha256,
    sourceTreeSha256: input.sourceTreeSha256,
    fileCount: input.fileCount
  }));
}

export function collectSenaBuildInputIdentity(root = process.cwd()) {
  const git = gitIdentity(root);
  const source = sourceIdentity(root);
  const lockSha256 = packageLockSha256(root);
  const buildInputSha256 = senaBuildInputSha256({
    ...git,
    ...source,
    packageLockSha256: lockSha256
  });
  return {
    ...git,
    ...source,
    packageLockSha256: lockSha256,
    buildInputSha256,
    buildId: senaNextBuildIdFromInputSha256(buildInputSha256)
  };
}

export function generateSenaNextBuildId(root = process.cwd()) {
  return collectSenaBuildInputIdentity(root).buildId;
}
