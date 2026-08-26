import { describe, expect, it } from "vitest";
import vitestConfig from "../../../vitest.config";

describe("Vitest gate custody", () => {
  it("excludes ignored temporary artifacts from every test invocation", () => {
    const exclude = (vitestConfig as {
      test?: { exclude?: string[] };
    }).test?.exclude ?? [];

    expect(exclude).toContain("**/.tmp/**");
  });
});
