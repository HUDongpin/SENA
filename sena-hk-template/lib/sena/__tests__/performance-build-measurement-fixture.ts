import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  collectSenaBuildInputIdentity,
  SENA_NEXT_BUILD_ID_GENERATOR
} from "../enterprise/performance-build-identity.mjs";
import { measureSenaPerformanceBuildOutput } from "../enterprise/performance-build-measurement.mjs";

function runGit(root: string, args: string[]) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
}

export function buildSenaPerformanceLocalEvidenceFixture(
  root: string,
  options: { objectFormat?: "sha1" | "sha256" } = {}
) {
  mkdirSync(path.join(root, "lib"), { recursive: true });
  mkdirSync(path.join(root, ".next", "static", "chunks", "app", "workspace", "sena"), { recursive: true });
  mkdirSync(path.join(root, ".next", "server", "app", "workspace"), { recursive: true });
  writeFileSync(path.join(root, ".gitignore"), ".next/\n");
  writeFileSync(path.join(root, "package.json"), `${JSON.stringify({ name: "sena-performance-fixture", private: true })}\n`);
  writeFileSync(path.join(root, "package-lock.json"), `${JSON.stringify({ name: "sena-performance-fixture", lockfileVersion: 3 })}\n`);
  writeFileSync(path.join(root, "lib", "runtime.ts"), "export const fixtureRuntime = true;\n");
  writeFileSync(path.join(root, ".next", "static", "chunks", "shared.js"), "console.log('measured shared chunk');\n".repeat(50));
  writeFileSync(
    path.join(root, ".next", "static", "chunks", "app", "workspace", "sena", "page-fixture.js"),
    "console.log('measured route chunk');\n".repeat(25)
  );
  writeFileSync(
    path.join(root, ".next", "server", "app", "workspace", "sena.html"),
    "<main>measured workspace html</main>\n".repeat(10)
  );

  runGit(root, ["init", "-q", `--object-format=${options.objectFormat ?? "sha1"}`]);
  runGit(root, ["config", "user.email", "sena-performance-fixture@example.invalid"]);
  runGit(root, ["config", "user.name", "SENA performance fixture"]);
  runGit(root, ["add", ".gitignore", "package.json", "package-lock.json", "lib/runtime.ts"]);
  runGit(root, ["commit", "-q", "-m", "performance fixture"]);

  const identity = collectSenaBuildInputIdentity(root);
  writeFileSync(path.join(root, ".next", "BUILD_ID"), identity.buildId);
  const measurement = measureSenaPerformanceBuildOutput(root);
  if (!measurement.productionBuildPresent || !measurement.observationStable) {
    throw new Error("SENA performance fixture did not produce a stable local build measurement.");
  }

  return {
    root,
    buildIdentity: {
      nextBuildIdSha256: createHash("sha256").update(identity.buildId).digest("hex"),
      nextBuildIdGenerator: SENA_NEXT_BUILD_ID_GENERATOR,
      nextBuildMatchesCurrentSource: true,
      buildInputSha256: identity.buildInputSha256,
      currentExpectedBuildInputSha256: identity.buildInputSha256,
      buildInputEnvironmentScope: "not-bound-use-measured-artifact-set-sha256" as const,
      buildObservationStable: true,
      measuredArtifactSetStable: true,
      measuredArtifactSetSha256: measurement.measuredArtifactSetSha256,
      measuredArtifactFileCount: measurement.measuredArtifactFileCount,
      gitCommit: identity.gitCommit,
      gitDirty: identity.gitDirty,
      gitDirtyFileCount: identity.gitDirtyFileCount,
      gitStatusSha256: identity.gitStatusSha256,
      packageLockSha256: identity.packageLockSha256,
      sourceTreeSha256: identity.sourceTreeSha256,
      sourceFileListSha256: identity.sourceFileListSha256,
      sourceFileCount: identity.sourceFileCount,
      sourceReadErrorCount: identity.sourceReadErrorCount,
      sourceReadErrorSha256: identity.sourceReadErrorSha256,
      values: "hashes-and-commit-only" as const
    },
    sourceCustody: {
      mode: "git-clean-worktree" as const,
      reviewedClean: true,
      baseGitCommit: identity.gitCommit,
      rootGitDirty: false,
      rootGitDirtyFileCount: 0,
      rootGitStatusSha256: identity.gitStatusSha256,
      values: "hashes-and-counts-only" as const
    },
    summary: {
      totalStaticJsFiles: measurement.totalStaticJsFiles,
      workspaceRouteJsFiles: measurement.workspaceRouteJsFiles
    },
    actualBrotliBytes: {
      workspaceHtml: measurement.metrics.workspaceHtml.actualBrotliBytes as number,
      workspaceRouteJs: measurement.metrics.workspaceRouteJs.actualBrotliBytes as number,
      totalStaticJs: measurement.metrics.totalStaticJs.actualBrotliBytes as number
    }
  };
}
