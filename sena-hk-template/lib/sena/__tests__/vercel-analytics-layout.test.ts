import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Vercel Analytics layout integration", () => {
  it("declares the analytics dependency and mounts Analytics in the root layout", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const layoutSource = readFileSync("app/layout.tsx", "utf8");

    expect(packageJson.dependencies).toHaveProperty("@vercel/analytics");
    expect(layoutSource).toContain('import { Analytics } from "@vercel/analytics/next";');
    expect(layoutSource).toContain("<Analytics />");
  });
});
