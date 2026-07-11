import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { now } from "./ops-runtime";

export type SenaPerformanceSourceCustodyEnv = {
  SENA_PERFORMANCE_SOURCE_CUSTODY_MODE: "reviewed-clean-release-slice";
  SENA_PERFORMANCE_SOURCE_CUSTODY_MANIFEST_SHA256: string;
  SENA_PERFORMANCE_SOURCE_CUSTODY_TREE_SHA256: string;
  SENA_PERFORMANCE_SOURCE_CUSTODY_FILE_LIST_SHA256: string;
  SENA_PERFORMANCE_SOURCE_CUSTODY_FILE_COUNT: string;
  SENA_PERFORMANCE_SOURCE_CUSTODY_BASE_GIT_COMMIT: string;
  SENA_PERFORMANCE_SOURCE_CUSTODY_ROOT_GIT_STATUS_SHA256: string;
  SENA_PERFORMANCE_SOURCE_CUSTODY_ROOT_GIT_DIRTY_FILE_COUNT: string;
};

export type SenaPerformanceSourceCustodyArtifact = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePerformanceSourceCustody;
  generatedAt: string;
  status: "pass" | "fail";
  mode: "reviewed-clean-release-slice";
  summary: {
    fileCount: number;
    includedSourceFiles: number;
    excludedCandidateFiles: number;
    readErrorCount: number;
    rootGitDirty: boolean | "unknown";
    rootGitDirtyFileCount: number | "unknown";
    reviewedClean: boolean;
  };
  git: {
    baseGitCommit: string | "unavailable";
    rootGitDirty: boolean | "unknown";
    rootGitDirtyFileCount: number | "unknown";
    rootGitStatusSha256: string | "unavailable";
    statusValuesExcluded: true;
  };
  sourceSlice: {
    generator: "sena-performance-source-custody/v1";
    manifestSha256: string;
    sourceTreeSha256: string;
    fileListSha256: string;
    fileCount: number;
    includePrefixes: string[];
    includeRootFiles: string[];
    excludeRules: string[];
    fileHashes: Array<{
      path: string;
      sha256: string;
    }>;
    fileContentsExcluded: true;
  };
  env: SenaPerformanceSourceCustodyEnv;
  evidence: string[];
  nextActions: string[];
  redaction: {
    sourceContentsExcluded: true;
    secretValuesExcluded: true;
    gitStatusValuesExcluded: true;
    localAbsolutePathsExcluded: true;
  };
};

const includePrefixes = [
  "app/",
  "components/",
  "lib/",
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

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function gitOutput(root: string, args: string[]) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return result.status === 0 ? result.stdout : undefined;
}

function normalizePath(value: string) {
  return value.split(path.sep).join("/");
}

function hasEnvOrSecretShape(file: string) {
  const basename = path.basename(file).toLowerCase();
  return basename === ".env" ||
    basename.startsWith(".env.") ||
    /\.(env|secret|secrets|credentials?)$/i.test(basename);
}

function excludedByRule(file: string) {
  if (hasEnvOrSecretShape(file)) return "env-or-secret-file";
  if (excludedPrefixRules.some((prefix) => file.startsWith(prefix))) return "excluded-prefix";
  if (excludedSegmentRules.some((segment) => `/${file}`.includes(segment))) return "excluded-segment";
  if (excludedSuffixRules.some((suffix) => file.endsWith(suffix))) return "excluded-suffix";
  return undefined;
}

function includedByRule(file: string) {
  if (includeRootFiles.includes(file)) return true;
  return includePrefixes.some((prefix) => file.startsWith(prefix));
}

function gitCandidateFiles(root: string) {
  const output = gitOutput(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  if (output === undefined) return [];
  return output
    .split("\0")
    .map((entry) => normalizePath(entry.trim()))
    .filter(Boolean)
    .sort();
}

function gitIdentity(root: string) {
  const commit = gitOutput(root, ["rev-parse", "HEAD"])?.trim() || "unavailable";
  const statusText = gitOutput(root, ["status", "--porcelain"])?.trim();
  const dirtyLines = statusText ? statusText.split(/\r?\n/).filter(Boolean) : [];
  return {
    baseGitCommit: /^[a-f0-9]{40,64}$/.test(commit) ? commit : "unavailable" as const,
    rootGitDirty: statusText !== undefined ? dirtyLines.length > 0 : "unknown" as const,
    rootGitDirtyFileCount: statusText !== undefined ? dirtyLines.length : "unknown" as const,
    rootGitStatusSha256: statusText !== undefined ? sha256(statusText) : "unavailable" as const
  };
}

function manifestHashBasis(input: {
  baseGitCommit: string | "unavailable";
  rootGitStatusSha256: string | "unavailable";
  rootGitDirtyFileCount: number | "unknown";
  fileListSha256: string;
  sourceTreeSha256: string;
  fileCount: number;
}) {
  return JSON.stringify({
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePerformanceSourceCustody,
    generator: "sena-performance-source-custody/v1",
    mode: "reviewed-clean-release-slice",
    baseGitCommit: input.baseGitCommit,
    rootGitStatusSha256: input.rootGitStatusSha256,
    rootGitDirtyFileCount: input.rootGitDirtyFileCount,
    fileListSha256: input.fileListSha256,
    sourceTreeSha256: input.sourceTreeSha256,
    fileCount: input.fileCount
  });
}

export function buildSenaPerformanceSourceCustody(input: {
  root?: string;
  generatedAt?: string;
} = {}): SenaPerformanceSourceCustodyArtifact {
  const root = input.root ?? process.cwd();
  const generatedAt = input.generatedAt ?? now();
  const identity = gitIdentity(root);
  const candidates = gitCandidateFiles(root);
  const selected: Array<{ path: string; sha256: string }> = [];
  let excludedCandidateFiles = 0;
  const readErrors: string[] = [];

  for (const file of candidates) {
    const excludeReason = excludedByRule(file);
    if (excludeReason || !includedByRule(file)) {
      excludedCandidateFiles += 1;
      continue;
    }
    const absolutePath = path.join(root, file);
    try {
      if (!existsSync(absolutePath)) {
        readErrors.push(sha256(`missing:${file}`));
        continue;
      }
      selected.push({
        path: file,
        sha256: sha256(readFileSync(absolutePath))
      });
    } catch (error) {
      const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
      readErrors.push(sha256(`${file}:${message}`));
    }
  }

  selected.sort((a, b) => a.path.localeCompare(b.path));
  const fileListText = selected.map((entry) => entry.path).join("\n");
  const sourceTreeText = selected.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n");
  const fileListSha256 = sha256(fileListText);
  const sourceTreeSha256 = sha256(sourceTreeText);
  const manifestSha256 = sha256(manifestHashBasis({
    baseGitCommit: identity.baseGitCommit,
    rootGitStatusSha256: identity.rootGitStatusSha256,
    rootGitDirtyFileCount: identity.rootGitDirtyFileCount,
    fileListSha256,
    sourceTreeSha256,
    fileCount: selected.length
  }));
  const reviewedClean = identity.baseGitCommit !== "unavailable" &&
    identity.rootGitStatusSha256 !== "unavailable" &&
    typeof identity.rootGitDirtyFileCount === "number" &&
    selected.length > 0 &&
    readErrors.length === 0;
  const env: SenaPerformanceSourceCustodyEnv = {
    SENA_PERFORMANCE_SOURCE_CUSTODY_MODE: "reviewed-clean-release-slice",
    SENA_PERFORMANCE_SOURCE_CUSTODY_MANIFEST_SHA256: manifestSha256,
    SENA_PERFORMANCE_SOURCE_CUSTODY_TREE_SHA256: sourceTreeSha256,
    SENA_PERFORMANCE_SOURCE_CUSTODY_FILE_LIST_SHA256: fileListSha256,
    SENA_PERFORMANCE_SOURCE_CUSTODY_FILE_COUNT: String(selected.length),
    SENA_PERFORMANCE_SOURCE_CUSTODY_BASE_GIT_COMMIT: identity.baseGitCommit,
    SENA_PERFORMANCE_SOURCE_CUSTODY_ROOT_GIT_STATUS_SHA256: identity.rootGitStatusSha256,
    SENA_PERFORMANCE_SOURCE_CUSTODY_ROOT_GIT_DIRTY_FILE_COUNT: String(identity.rootGitDirtyFileCount)
  };

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePerformanceSourceCustody,
    generatedAt,
    status: reviewedClean ? "pass" : "fail",
    mode: "reviewed-clean-release-slice",
    summary: {
      fileCount: selected.length,
      includedSourceFiles: selected.length,
      excludedCandidateFiles,
      readErrorCount: readErrors.length,
      rootGitDirty: identity.rootGitDirty,
      rootGitDirtyFileCount: identity.rootGitDirtyFileCount,
      reviewedClean
    },
    git: {
      ...identity,
      statusValuesExcluded: true
    },
    sourceSlice: {
      generator: "sena-performance-source-custody/v1",
      manifestSha256,
      sourceTreeSha256,
      fileListSha256,
      fileCount: selected.length,
      includePrefixes,
      includeRootFiles,
      excludeRules: [
        ...excludedPrefixRules,
        ...excludedSegmentRules,
        ...excludedSuffixRules,
        "env-or-secret-file",
        "outside-deployable-runtime-source"
      ],
      fileHashes: selected,
      fileContentsExcluded: true
    },
    env,
    evidence: [
      `status=${reviewedClean ? "pass" : "fail"}`,
      "mode=reviewed-clean-release-slice",
      `baseGitCommit=${identity.baseGitCommit === "unavailable" ? "unavailable" : "present"}`,
      `rootGitDirty=${identity.rootGitDirty}`,
      `rootGitDirtyFileCount=${identity.rootGitDirtyFileCount}`,
      `rootGitStatusSha256=${identity.rootGitStatusSha256 === "unavailable" ? "unavailable" : "present"}`,
      `fileCount=${selected.length}`,
      `excludedCandidateFiles=${excludedCandidateFiles}`,
      `readErrorCount=${readErrors.length}`,
      `manifestSha256=${manifestSha256}`,
      `sourceTreeSha256=${sourceTreeSha256}`,
      `fileListSha256=${fileListSha256}`,
      "sourceContents=excluded",
      "secretValues=excluded",
      "gitStatusValues=excluded"
    ],
    nextActions: reviewedClean ? [] : [
      "Run from a git worktree with a valid base commit and readable deployable runtime source slice."
    ],
    redaction: {
      sourceContentsExcluded: true,
      secretValuesExcluded: true,
      gitStatusValuesExcluded: true,
      localAbsolutePathsExcluded: true
    }
  };
}

export function performanceSourceCustodyEnvText(env: SenaPerformanceSourceCustodyEnv) {
  return `${Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;
}
