import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const packageJsonPath = path.join(appRoot, "package.json");
const viteNodePath = path.join(appRoot, "node_modules", ".bin", "vite-node");
const generatorPath = path.join(appRoot, "scripts", "generate-sena-human-concept-publication-figures.ts");

function runGenerator(
  args: string[],
  cwd = appRoot,
  extraEnv: Partial<NodeJS.ProcessEnv> = {}
): ReturnType<typeof spawnSync> {
  return spawnSync(viteNodePath, [generatorPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      TZ: "UTC",
      SOURCE_DATE_EPOCH: "1783728000",
      ...extraEnv
    }
  });
}

describe("SENA human-concept publication figure generator", () => {
  it("registers the fixed generator command and direct Sharp dependency", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

    expect(packageJson.scripts["sena:figures:human-concept"]).toBe(
      "vite-node scripts/generate-sena-human-concept-publication-figures.ts"
    );
    expect(packageJson.devDependencies.sharp).toBe("^0.34.5");
  });

  it("fails clearly when the fixed source contract is absent", () => {
    const temporaryCwd = mkdtempSync(path.join(tmpdir(), "sena-human-concept-figures-"));

    try {
      const result = runGenerator([], temporaryCwd);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("SENA figure generation failed: source contract not found");
    } finally {
      rmSync(temporaryCwd, { recursive: true, force: true });
    }
  });
});
