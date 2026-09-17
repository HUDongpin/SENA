import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Tsconfig = {
  include?: string[];
  exclude?: string[];
};

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

  it("types partial env bags and writable NODE_ENV without casts", () => {
    const empty: NodeJS.ProcessEnv = {};
    const writable: SenaTestProcessEnv = {};
    writable.NODE_ENV = "test";
    writable.NODE_ENV = "production";
    writable.NODE_ENV = undefined;
    delete writable.NODE_ENV;
    const merged: SenaTestProcessEnv = { ...empty, NODE_ENV: "test" };

    expect(empty).toEqual({});
    expect(merged.NODE_ENV).toBe("test");
  });
});
