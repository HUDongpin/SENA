import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import {
  assertSenaVerifierEnvironmentIsLocal,
  buildSenaVerifierEnvironment
} from "./sena-verifier-environment.mjs";

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
const vitestEnvironment = buildSenaVerifierEnvironment(process.env, {
  SENA_ENTERPRISE_DB_DIR: enterpriseDbDir
});
assertSenaVerifierEnvironmentIsLocal(vitestEnvironment, enterpriseDbDir);

// These end-to-end files pass when run alone, but can exceed their per-test
// timeout when they contend with the default multi-worker full suite. Keep the
// broad suite parallel, then run only these known long files serially. Explicit
// CLI arguments preserve the wrapper's original single-invocation behaviour
// for focused developer runs.
const serialTestFiles = [
  "lib/sena/__tests__/analysis-route.test.ts",
  "lib/sena/__tests__/snapshot-restore-route-round21.test.ts",
  "lib/sena/__tests__/enterprise-go-live.test.ts",
  "lib/sena/__tests__/enterprise.test.ts",
  "lib/sena/__tests__/publication-reliability-evidence-route-round14.test.ts"
];

function runVitest(vitestFile, args) {
  return spawnSync(process.execPath, [vitestFile, "run", ...args], {
    stdio: "inherit",
    env: vitestEnvironment
  }).status ?? 1;
}

try {
  const vitestFile = resolveInstalledPackageFile("vitest", "vitest.mjs");
  const requestedArgs = process.argv.slice(2);
  const phases = requestedArgs.length > 0
    ? [requestedArgs]
    : [
        serialTestFiles.flatMap((testFile) => ["--exclude", testFile]),
        ["--no-file-parallelism", ...serialTestFiles]
      ];

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
