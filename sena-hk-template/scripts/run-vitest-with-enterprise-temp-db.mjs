import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const providedDbDir = process.env.SENA_ENTERPRISE_DB_DIR;
const enterpriseDbDir = providedDbDir || mkdtempSync(join(tmpdir(), "sena-vitest-enterprise-db-"));

try {
  const result = spawnSync(process.execPath, [
    "node_modules/vitest/vitest.mjs",
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
