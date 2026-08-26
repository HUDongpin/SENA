import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import vitestConfig from "../../../vitest.config";

describe("Vitest gate custody", () => {
  it("excludes ignored temporary artifacts from every test invocation", () => {
    const exclude = (vitestConfig as {
      test?: { exclude?: string[] };
    }).test?.exclude ?? [];

    expect(exclude).toContain("**/.tmp/**");
  });

  it("caps the broad full-suite phase without weakening the serial or focused phases", () => {
    const wrapperSource = readFileSync(
      new URL("../../../scripts/run-vitest-with-enterprise-temp-db.mjs", import.meta.url),
      "utf8"
    );

    expect(wrapperSource).toContain(
      "const parallelTestWorkers = Math.max(1, Math.min(4, availableParallelism()));"
    );
    expect(wrapperSource).toContain(
      '["--maxWorkers", String(parallelTestWorkers), ...serialTestFiles.flatMap((testFile) => ["--exclude", testFile])],'
    );
    expect(wrapperSource).toContain('["--no-file-parallelism", ...serialTestFiles]');
    expect(wrapperSource).toContain("requestedArgs.length > 0");
    expect(wrapperSource).toContain("? [requestedArgs]");
  });
});
