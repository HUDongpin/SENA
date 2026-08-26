import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSenaPerformanceSourceCustody,
  performanceSourceCustodyEnvText
} from "../enterprise/performance-source-custody";
import { buildEnterpriseProductionPerformanceBudgetArtifact } from "../enterprise/performance-budget-artifact";
import {
  collectSenaBuildInputIdentity,
  generateSenaNextBuildId
} from "../enterprise/performance-build-identity.mjs";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";

function runGit(root: string, args: string[]) {
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

function writeFile(root: string, file: string, value: string) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, value);
}

function writeProductionBuildFixture(root: string) {
  writeFile(root, ".next/server/app/workspace/sena.html", "<main>SENA</main>");
  writeFile(root, ".next/static/chunks/app/workspace/sena/page-test.js", "export const page = 'sena';");
  writeFile(root, ".next/static/chunks/framework.js", "export const framework = true;");
  writeFile(root, ".next/BUILD_ID", generateSenaNextBuildId(root));
}

function withTempRepo(callback: (root: string) => void) {
  const root = mkdtempSync(path.join(tmpdir(), "sena-source-custody-"));
  try {
    runGit(root, ["init"]);
    runGit(root, ["config", "user.email", "sena@example.test"]);
    runGit(root, ["config", "user.name", "SENA Test"]);
    writeFile(root, ".gitignore", ".env*\noutput/\n.next/\n");
    writeFile(root, "package.json", "{\"scripts\":{}}\n");
    writeFile(root, "package-lock.json", "{\"lockfileVersion\":3}\n");
    writeFile(root, "app/page.tsx", "export default function Page() { return null; }\n");
    writeFile(root, "lib/sena/runtime.ts", "export const runtime = true;\n");
    writeFile(root, "lib/sena/__tests__/runtime.test.ts", "export const testOnly = true;\n");
    writeFile(root, ".env.local", "SECRET_VALUE=do-not-read\n");
    writeFile(root, "output/production-evidence/old.json", "{}\n");
    runGit(root, ["add", ".gitignore", "package.json", "package-lock.json", "app/page.tsx", "lib/sena/runtime.ts", "lib/sena/__tests__/runtime.test.ts"]);
    runGit(root, ["commit", "-m", "fixture"]);
    writeFile(root, "app/page.tsx", "export default function Page() { return 'changed'; }\n");
    writeFile(root, "components/sena/NewPanel.tsx", "export function NewPanel() { return null; }\n");
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function withFakeGitHead<T>(gitCommit: string, callback: () => T) {
  const binDir = mkdtempSync(path.join(tmpdir(), "sena-source-custody-git-bin-"));
  const gitPath = (process.env.PATH ?? "")
    .split(path.delimiter)
    .map((entry) => path.join(entry, "git"))
    .find((entry) => existsSync(entry));
  if (!gitPath) throw new Error("git executable not found");

  const fakeGitPath = path.join(binDir, "git");
  writeFileSync(fakeGitPath, `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
if (args[0] === "-C" && args[2] === "rev-parse" && args[3] === "HEAD") {
  process.stdout.write(${JSON.stringify(gitCommit)} + "\\n");
  process.exit(0);
}
const result = spawnSync(${JSON.stringify(gitPath)}, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
`);
  chmodSync(fakeGitPath, 0o755);

  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ""}`;
  try {
    return callback();
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    rmSync(binDir, { recursive: true, force: true });
  }
}

function envFromText(text: string) {
  return Object.fromEntries(text
    .split(/\n/)
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }));
}

describe("SENA performance source custody", () => {
  it.each([40, 64])("accepts a full %i-character Git object identifier", (length) => {
    withTempRepo((root) => {
      const gitCommit = "a".repeat(length);
      const artifact = withFakeGitHead(gitCommit, () => buildSenaPerformanceSourceCustody({ root }));

      expect(artifact.git.baseGitCommit).toBe(gitCommit);
    });
  });

  it.each([39, 41, 63, 65])("rejects a non-full %i-character Git object identifier", (length) => {
    withTempRepo((root) => {
      const artifact = withFakeGitHead(
        "a".repeat(length),
        () => buildSenaPerformanceSourceCustody({ root })
      );

      expect(artifact.git.baseGitCommit).toBe("unavailable");
    });
  });

  it("hashes a reviewed deployable release slice without reading env, output, or test files", () => {
    withTempRepo((root) => {
      const artifact = buildSenaPerformanceSourceCustody({
        root,
        generatedAt: "2026-07-02T00:00:00.000Z"
      });
      const files = artifact.sourceSlice.fileHashes.map((entry) => entry.path);

      expect(artifact.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterprisePerformanceSourceCustody);
      expect(artifact.status).toBe("fail");
      expect(artifact.summary.reviewedClean).toBe(false);
      expect(artifact.git.rootGitDirty).toBe(true);
      expect(artifact.git.rootGitDirtyFileCount).toBe(2);
      expect(files).toEqual(expect.arrayContaining([
        "app/page.tsx",
        "components/sena/NewPanel.tsx",
        "lib/sena/runtime.ts",
        "package-lock.json",
        "package.json"
      ]));
      expect(files).not.toContain(".env.local");
      expect(files).not.toContain("output/production-evidence/old.json");
      expect(files).not.toContain("lib/sena/__tests__/runtime.test.ts");
      expect(JSON.stringify(artifact)).not.toContain("SECRET_VALUE");
      expect(JSON.stringify(artifact)).not.toContain(root);
      expect(artifact.env.SENA_PERFORMANCE_SOURCE_CUSTODY_MODE).toBe("reviewed-clean-release-slice");
      expect(artifact.env.SENA_PERFORMANCE_SOURCE_CUSTODY_ROOT_GIT_STATUS_SHA256).toBe(artifact.git.rootGitStatusSha256);
      expect(artifact.env.SENA_PERFORMANCE_SOURCE_CUSTODY_FILE_COUNT).toBe(String(artifact.sourceSlice.fileCount));

      const buildInputIdentity = collectSenaBuildInputIdentity(root);
      expect(buildInputIdentity.sourceTreeSha256).toBe(artifact.sourceSlice.sourceTreeSha256);
      expect(buildInputIdentity.sourceFileListSha256).toBe(artifact.sourceSlice.fileListSha256);
      expect(buildInputIdentity.sourceFileCount).toBe(artifact.sourceSlice.fileCount);
      expect(buildInputIdentity.sourceReadErrorCount).toBe(0);
    });
  });

  it("orders Unicode source paths by deterministic code units for both custody and BUILD_ID identity", () => {
    withTempRepo((root) => {
      for (const filename of ["a.ts", "z.ts", "Å.ts", "ä.ts"]) {
        writeFile(root, `app/${filename}`, `export const value = ${JSON.stringify(filename)};\n`);
      }

      const custody = buildSenaPerformanceSourceCustody({ root });
      const identity = collectSenaBuildInputIdentity(root);
      const unicodePaths = custody.sourceSlice.fileHashes
        .map((entry) => entry.path)
        .filter((file) => ["app/a.ts", "app/z.ts", "app/Å.ts", "app/ä.ts"].includes(file));

      expect(unicodePaths).toEqual(["app/a.ts", "app/z.ts", "app/Å.ts", "app/ä.ts"]);
      expect(identity.sourceFileListSha256).toBe(custody.sourceSlice.fileListSha256);
      expect(identity.sourceTreeSha256).toBe(custody.sourceSlice.sourceTreeSha256);
    });
  });

  it.each(["external", "internal", "broken"] as const)(
    "rejects a clean tracked %s source symlink without reading its target",
    (kind) => {
      const externalRoot = mkdtempSync(path.join(tmpdir(), "sena-source-custody-symlink-target-"));
      try {
        withTempRepo((root) => {
          runGit(root, ["add", "-A"]);
          runGit(root, ["commit", "-m", "clean fixture changes"]);

          const linkPath = path.join(root, "app", `${kind}-link.ts`);
          if (kind === "external") {
            const target = path.join(externalRoot, "external-secret.ts");
            writeFileSync(target, "EXTERNAL_SECRET_VALUE=must-not-be-read\n");
            symlinkSync(target, linkPath);
          } else if (kind === "internal") {
            writeFile(root, "lib/sena/symlink-target.ts", "export const internalTarget = true;\n");
            symlinkSync("../lib/sena/symlink-target.ts", linkPath);
          } else {
            symlinkSync("../missing-symlink-target.ts", linkPath);
          }
          runGit(root, ["add", "-A"]);
          runGit(root, ["commit", "-m", `track ${kind} source symlink`]);

          const custody = buildSenaPerformanceSourceCustody({ root });
          const identity = collectSenaBuildInputIdentity(root);
          const serialized = JSON.stringify({ custody, identity });

          expect(custody.git.rootGitDirty).toBe(false);
          expect(custody.status).toBe("fail");
          expect(custody.summary.readErrorCount).toBe(1);
          expect(identity.gitDirty).toBe(false);
          expect(identity.sourceReadErrorCount).toBe(1);
          expect(serialized).not.toContain("EXTERNAL_SECRET_VALUE");
          expect(custody.sourceSlice.fileHashes.map((entry) => entry.path)).not.toContain(`app/${kind}-link.ts`);
        });
      } finally {
        rmSync(externalRoot, { recursive: true, force: true });
      }
    }
  );

  it.each([
    "tailwind.config.ts",
    "packages/sena-kernel/index.ts"
  ])("changes canonical build and custody hashes when %s changes under the same porcelain status", (candidate) => {
    withTempRepo((root) => {
      writeFile(root, candidate, "export const buildInput = 0;\n");
      runGit(root, ["add", "."]);
      runGit(root, ["commit", "-m", "add build input"]);

      writeFile(root, candidate, "export const buildInput = 1;\n");
      const firstIdentity = collectSenaBuildInputIdentity(root);
      const firstCustody = buildSenaPerformanceSourceCustody({ root });

      writeFile(root, candidate, "export const buildInput = 2;\n");
      const secondIdentity = collectSenaBuildInputIdentity(root);
      const secondCustody = buildSenaPerformanceSourceCustody({ root });

      expect(secondIdentity.gitStatusSha256).toBe(firstIdentity.gitStatusSha256);
      expect(secondIdentity.gitDirtyFileCount).toBe(firstIdentity.gitDirtyFileCount);
      expect(secondIdentity.sourceTreeSha256).not.toBe(firstIdentity.sourceTreeSha256);
      expect(secondIdentity.buildInputSha256).not.toBe(firstIdentity.buildInputSha256);
      expect(secondCustody.sourceSlice.sourceTreeSha256).not.toBe(firstCustody.sourceSlice.sourceTreeSha256);
      expect(secondCustody.sourceSlice.fileHashes.map((entry) => entry.path)).toContain(candidate);
      expect(secondCustody.sourceSlice.sourceTreeSha256).toBe(secondIdentity.sourceTreeSha256);
      expect(secondCustody.sourceSlice.fileListSha256).toBe(secondIdentity.sourceFileListSha256);
    });
  });

  it("preserves exact Git path bytes for source files that differ only by trailing space", () => {
    withTempRepo((root) => {
      writeFile(root, "public/x", "plain\n");
      writeFile(root, "public/x ", "trailing-0\n");
      runGit(root, ["add", "."]);
      runGit(root, ["commit", "-m", "add exact-path fixtures"]);

      writeFile(root, "public/x ", "trailing-1\n");
      const firstIdentity = collectSenaBuildInputIdentity(root);
      const firstCustody = buildSenaPerformanceSourceCustody({ root });
      writeFile(root, "public/x ", "trailing-2\n");
      const secondIdentity = collectSenaBuildInputIdentity(root);
      const secondCustody = buildSenaPerformanceSourceCustody({ root });

      expect(firstCustody.sourceSlice.fileHashes.map((entry) => entry.path))
        .toEqual(expect.arrayContaining(["public/x", "public/x "]));
      expect(secondIdentity.gitStatusSha256).toBe(firstIdentity.gitStatusSha256);
      expect(secondIdentity.sourceFileListSha256).toBe(firstIdentity.sourceFileListSha256);
      expect(secondIdentity.sourceTreeSha256).not.toBe(firstIdentity.sourceTreeSha256);
      expect(secondIdentity.buildInputSha256).not.toBe(firstIdentity.buildInputSha256);
      expect(secondCustody.sourceSlice.sourceTreeSha256).toBe(secondIdentity.sourceTreeSha256);
    });
  });

  it("keeps strict performance evidence non-bindable for an automatically captured dirty slice", () => {
    withTempRepo((root) => {
      writeProductionBuildFixture(root);
      const custody = buildSenaPerformanceSourceCustody({ root });
      const env = {
        ...envFromText(performanceSourceCustodyEnvText(custody.env)),
        SENA_PERFORMANCE_BUDGET_BINDABLE_REQUIRED: "1",
        SENA_PERF_WORKSPACE_HTML_BR_BUDGET_BYTES: "10000",
        SENA_PERF_WORKSPACE_ROUTE_JS_BR_BUDGET_BYTES: "10000",
        SENA_PERF_TOTAL_STATIC_JS_BR_BUDGET_BYTES: "10000"
      };

      const artifact = buildEnterpriseProductionPerformanceBudgetArtifact({
        root,
        env
      });

      expect(custody.status).toBe("fail");
      expect(custody.summary.reviewedClean).toBe(false);
      expect(artifact.status).toBe("fail");
      expect(artifact.buildIdentity.gitDirty).toBe(true);
      expect(artifact.sourceCustody).toEqual(expect.objectContaining({
        mode: "reviewed-clean-release-slice",
        reviewedClean: false,
        manifestSha256: custody.sourceSlice.manifestSha256,
        sourceTreeSha256: custody.sourceSlice.sourceTreeSha256,
        fileListSha256: custody.sourceSlice.fileListSha256,
        fileCount: custody.sourceSlice.fileCount,
        baseGitCommit: custody.git.baseGitCommit,
        rootGitStatusSha256: custody.git.rootGitStatusSha256,
        generator: "sena-performance-source-custody/v1"
      }));
      expect(artifact.checks.find((check) => check.id === "production-build-identity")?.evidence)
        .toEqual(expect.arrayContaining([
          "strictProductionEvidenceRequired=true",
          "bindableBuildIdentity=false",
          "sourceCustodyMode=reviewed-clean-release-slice",
          "sourceCustodyReviewedClean=false"
        ]));
    });
  });

  it("writes a redacted diagnostic CLI artifact without printing production authorization env", () => {
    withTempRepo((root) => {
      runGit(root, ["add", "."]);
      runGit(root, ["commit", "-m", "freeze clean custody fixture"]);
      const outputPath = path.join(root, "custody.json");
      const result = spawnSync("./node_modules/.bin/vite-node", [
        "scripts/prepare-sena-performance-source-custody.ts",
        "--root",
        root,
        "--output",
        outputPath
      ], {
        cwd: process.cwd(),
        encoding: "utf8"
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`performanceSourceCustodyArtifactPath=${outputPath}`);
      expect(result.stdout).not.toContain("SENA_PERFORMANCE_SOURCE_CUSTODY_MODE=");
      const artifactText = readFileSync(outputPath, "utf8");
      const artifact = JSON.parse(artifactText) as { schemaVersion?: string };
      const artifactSha256 = createHash("sha256").update(artifactText).digest("hex");
      expect(artifact.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterprisePerformanceSourceCustody);
      expect(readFileSync(`${outputPath}.sha256`, "utf8").trim()).toBe(`${artifactSha256}  custody.json`);
      expect(artifactText).not.toContain("SECRET_VALUE");
      expect(artifactText).not.toContain(root);
    });
  });

  it("refuses to emit a sourceable env file from diagnostic source custody", () => {
    withTempRepo((root) => {
      runGit(root, ["add", "."]);
      runGit(root, ["commit", "-m", "freeze clean custody fixture"]);
      const envPath = path.join(root, "custody.env");
      const result = spawnSync("./node_modules/.bin/vite-node", [
        "scripts/prepare-sena-performance-source-custody.ts",
        "--root",
        root,
        "--env-output",
        envPath
      ], {
        cwd: process.cwd(),
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toContain("diagnostic-only");
      expect(existsSync(envPath)).toBe(false);
    });
  });
});
