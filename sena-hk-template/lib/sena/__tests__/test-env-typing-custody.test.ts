import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { senaTestProcessEnv } from "./sena-test-env";

type Tsconfig = {
  include?: string[];
  exclude?: string[];
};

const projectRoot = fileURLToPath(new URL("../../..", import.meta.url));
const gitRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function gitGrep(pattern: string) {
  try {
    const result = execFileSync(
      "git",
      ["grep", "-n", "-E", pattern, "--", "sena-hk-template/lib/sena/__tests__"],
      { cwd: gitRoot, encoding: "utf8" }
    ).trim();
    return result ? result.split("\n") : [];
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 1) {
      return [];
    }
    throw error;
  }
}

describe("test ProcessEnv typing custody", () => {
  it("keeps test files and vitest-env.d.ts inside tsc --noEmit", () => {
    const tsconfig = JSON.parse(
      readFileSync(path.join(process.cwd(), "tsconfig.json"), "utf8")
    ) as Tsconfig;

    expect(tsconfig.include).toEqual(expect.arrayContaining([
      "next-env.d.ts",
      "vitest-env.d.ts",
      "**/*.ts",
      "**/*.tsx"
    ]));
    expect(tsconfig.exclude).toEqual(["node_modules"]);
    expect(tsconfig.exclude?.some((entry) => /test|spec/i.test(entry))).toBe(false);
  });

  it("types partial env bags, invalid NODE_ENV spellings, and writable assignment", () => {
    const empty: NodeJS.ProcessEnv = {};
    const writable: SenaTestProcessEnv = {};
    writable.NODE_ENV = "test";
    writable.NODE_ENV = "production";
    writable.NODE_ENV = undefined;
    delete writable.NODE_ENV;
    const merged: SenaTestProcessEnv = { ...empty, NODE_ENV: "test" };
    const processEnv = senaTestProcessEnv();
    const previous = processEnv.NODE_ENV;
    processEnv.NODE_ENV = "test";
    expect(processEnv.NODE_ENV).toBe("test");
    if (previous === undefined) delete processEnv.NODE_ENV;
    else processEnv.NODE_ENV = previous;

    expect(empty).toEqual({});
    expect(merged.NODE_ENV).toBe("test");
  });

  it("keeps NODE_ENV mutations behind the shared test-env helper", () => {
    const helper = readFileSync(
      path.join(projectRoot, "lib/sena/__tests__/sena-test-env.ts"),
      "utf8"
    );

    expect(helper).toContain("return process.env as SenaTestProcessEnv;");
    expect(gitGrep("process\\.env as Record")).toEqual([]);
    expect(gitGrep("process\\.env\\.NODE_ENV\\s*=")).toEqual([]);
  });
});
