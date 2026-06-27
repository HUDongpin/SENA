import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = join(__dirname, "..", "..", "..");

function readProjectFile(path: string) {
  return readFileSync(join(projectRoot, path), "utf8");
}

function readPackageJson() {
  return JSON.parse(readProjectFile("package.json")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    overrides?: Record<string, string | Record<string, string>>;
  };
}

function overrideValue(value: string | Record<string, string> | undefined, nestedKey?: string) {
  if (typeof value === "string") return value;
  return nestedKey ? value?.[nestedKey] : undefined;
}

describe("runtime security dependency guardrails", () => {
  it("keeps the vulnerable SheetJS xlsx package out of production import and export paths", () => {
    const pkg = readPackageJson();
    expect(pkg.dependencies).not.toHaveProperty("xlsx");
    expect(pkg.dependencies).toHaveProperty("exceljs");

    [
      "app/api/sena/reliability/route.ts",
      "lib/sena/import-adapters.ts",
      "lib/sena/reliability-adapters.ts",
      "lib/sena/publication-export.ts"
    ].forEach((path) => {
      const source = readProjectFile(path);
      expect(source).not.toContain("from \"xlsx\"");
      expect(source).not.toContain("XLSX.");
    });
  });

  it("pins the runtime Next stack to the audit-remediated major line", () => {
    const pkg = readPackageJson();
    expect(pkg.dependencies?.next).toMatch(/^(?:\^|~)?16\./);
    expect(pkg.devDependencies?.["eslint-config-next"]).toMatch(/^(?:\^|~)?16\./);
  });

  it("keeps npm audit clean after safe transitive overrides", () => {
    const pkg = readPackageJson();
    expect(pkg.overrides?.postcss).toMatch(/^(?:\^|~)?8\.(?:[5-9]|\d{2,})\./);
    expect(pkg.overrides?.uuid).toMatch(/^(?:\^|~)?(?:1[1-9]|\d{2,})\./);
    expect(overrideValue(pkg.overrides?.vite, "esbuild")).toMatch(/^0\.28\./);
    expect(overrideValue(pkg.overrides?.["vite-node"], "vite")).toMatch(/^(?:\^|~)?8\./);
    expect(overrideValue(pkg.overrides?.tsup, "esbuild")).toMatch(/^0\.28\./);
    expect(pkg.overrides?.esbuild).toMatch(/^0\.28\./);
  });

  it("uses the Next 16 proxy convention and stable production builder", () => {
    const pkg = readPackageJson();
    expect(existsSync(join(projectRoot, "middleware.ts"))).toBe(false);
    expect(readProjectFile("proxy.ts")).toContain("export function proxy");
    expect(pkg.scripts?.build).toContain("next build --webpack");
  });
});
