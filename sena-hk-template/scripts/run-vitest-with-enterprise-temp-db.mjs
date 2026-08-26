import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { availableParallelism, tmpdir } from "node:os";
import path, { join } from "node:path";
import {
  assertSenaVerifierEnvironmentFilesUnchanged,
  assertSenaVerifierEnvironmentIsLocal,
  buildSenaVerifierEnvironment
} from "./sena-verifier-environment.mjs";
import { buildSenaVitestPhaseArgs } from "./sena-vitest-phase-plan.mjs";

// Deliberately duplicated from scripts/resolve-installed-package-file.ts: plain
// `node` runs this wrapper, so it cannot import the TypeScript helper, and
// tsconfig sets "allowJs": false so the helper cannot live in .mjs either. See
// that file for why require.resolve() will not do the job here.
function resolveInstalledPackageFile(packageName, relativePath) {
  const requireFrom = createRequire(import.meta.url);
  for (const root of requireFrom.resolve.paths(packageName) ?? []) {
    const candidate = path.join(root, packageName, relativePath);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Cannot find ${packageName}/${relativePath} from any node_modules above ${import.meta.url}. ` +
      `Run "npm ci" in sena-hk-template (or in the clone this worktree hangs from).`
  );
}

const providedDbDir = process.env.SENA_ENTERPRISE_DB_DIR;
const enterpriseDbDir = providedDbDir || mkdtempSync(join(tmpdir(), "sena-vitest-enterprise-db-"));
let vitestEnvironment;

function runVitest(vitestFile, args) {
  assertSenaVerifierEnvironmentFilesUnchanged(vitestEnvironment, process.cwd());
  let result;
  try {
    result = spawnSync(process.execPath, [vitestFile, "run", ...args], {
      stdio: "inherit",
      env: vitestEnvironment
    });
  } finally {
    assertSenaVerifierEnvironmentFilesUnchanged(vitestEnvironment, process.cwd());
  }
  return result.status ?? 1;
}

try {
  vitestEnvironment = buildSenaVerifierEnvironment(process.env, {
    SENA_ENTERPRISE_DB_DIR: enterpriseDbDir
  });
  assertSenaVerifierEnvironmentIsLocal(vitestEnvironment, enterpriseDbDir);
  const vitestFile = resolveInstalledPackageFile("vitest", "vitest.mjs");
  const phases = buildSenaVitestPhaseArgs(process.argv.slice(2), availableParallelism());

  process.exitCode = 0;
  for (const phaseArgs of phases) {
    const status = runVitest(vitestFile, phaseArgs);
    if (status !== 0) {
      process.exitCode = status;
      break;
    }
  }
} finally {
  if (!providedDbDir) {
    rmSync(enterpriseDbDir, { force: true, recursive: true });
  }
}
