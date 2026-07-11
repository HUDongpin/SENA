import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSenaPerformanceSourceCustody,
  performanceSourceCustodyEnvText
} from "../enterprise/performance-source-custody";
import { buildEnterpriseProductionPerformanceBudgetArtifact } from "../enterprise/performance-budget-artifact";
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
  writeFile(root, ".next/BUILD_ID", "build-id");
  writeFile(root, ".next/server/app/workspace/sena.html", "<main>SENA</main>");
  writeFile(root, ".next/static/chunks/app/workspace/sena/page-test.js", "export const page = 'sena';");
  writeFile(root, ".next/static/chunks/framework.js", "export const framework = true;");
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
  it("hashes a reviewed deployable release slice without reading env, output, or test files", () => {
    withTempRepo((root) => {
      const artifact = buildSenaPerformanceSourceCustody({
        root,
        generatedAt: "2026-07-02T00:00:00.000Z"
      });
      const files = artifact.sourceSlice.fileHashes.map((entry) => entry.path);

      expect(artifact.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterprisePerformanceSourceCustody);
      expect(artifact.status).toBe("pass");
      expect(artifact.summary.reviewedClean).toBe(true);
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
    });
  });

  it("makes strict performance budget evidence bindable for a dirty but reviewed release slice", () => {
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

      expect(artifact.status).toBe("pass");
      expect(artifact.buildIdentity.gitDirty).toBe(true);
      expect(artifact.sourceCustody).toEqual(expect.objectContaining({
        mode: "reviewed-clean-release-slice",
        reviewedClean: true,
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
          "bindableBuildIdentity=true",
          "sourceCustodyMode=reviewed-clean-release-slice",
          "sourceCustodyReviewedClean=true"
        ]));
    });
  });

  it("writes a redacted CLI artifact and env file", () => {
    withTempRepo((root) => {
      const outputPath = path.join(root, "custody.json");
      const envPath = path.join(root, "custody.env");
      const result = spawnSync("./node_modules/.bin/vite-node", [
        "scripts/prepare-sena-performance-source-custody.ts",
        "--root",
        root,
        "--output",
        outputPath,
        "--env-output",
        envPath
      ], {
        cwd: process.cwd(),
        encoding: "utf8"
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`performanceSourceCustodyArtifactPath=${outputPath}`);
      expect(result.stdout).toContain(`performanceSourceCustodyEnvPath=${envPath}`);
      const artifactText = readFileSync(outputPath, "utf8");
      const artifact = JSON.parse(artifactText) as { schemaVersion?: string };
      const artifactSha256 = createHash("sha256").update(artifactText).digest("hex");
      expect(artifact.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.enterprisePerformanceSourceCustody);
      expect(readFileSync(`${outputPath}.sha256`, "utf8").trim()).toBe(`${artifactSha256}  custody.json`);
      expect(readFileSync(envPath, "utf8")).toContain("SENA_PERFORMANCE_SOURCE_CUSTODY_MODE=reviewed-clean-release-slice");
      expect(artifactText).not.toContain("SECRET_VALUE");
      expect(artifactText).not.toContain(root);
    });
  });
});
