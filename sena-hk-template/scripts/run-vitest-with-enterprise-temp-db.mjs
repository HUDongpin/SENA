import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path, { join } from "node:path";

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

try {
  const result = spawnSync(process.execPath, [
    resolveInstalledPackageFile("vitest", "vitest.mjs"),
    "run",
    ...process.argv.slice(2)
  ], {
    stdio: "inherit",
    env: {
      ...process.env,
      SENA_ENTERPRISE_DB_DIR: enterpriseDbDir
    }
  });

  process.exitCode = result.status ?? 1;
} finally {
  if (!providedDbDir) {
    rmSync(enterpriseDbDir, { force: true, recursive: true });
  }
}
