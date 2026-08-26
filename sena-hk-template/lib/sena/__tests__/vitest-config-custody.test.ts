import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import vitestConfig from "../../../vitest.config";
import {
  buildSenaVitestPhaseArgs,
  SENA_VITEST_SERIAL_TEST_FILES
} from "../../../scripts/sena-vitest-phase-plan.mjs";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));

function listTrackedVitestFiles() {
  return execFileSync("git", ["ls-files"], {
    cwd: projectRoot,
    encoding: "utf8"
  })
    .split("\n")
    .filter((file) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
    .sort();
}

describe("Vitest gate custody", () => {
  it("excludes ignored temporary artifacts from every test invocation", () => {
    const exclude = (vitestConfig as {
      test?: { exclude?: string[] };
    }).test?.exclude ?? [];

    expect(exclude).toContain("**/.tmp/**");
  });

  it("caps the broad phase and gives every serial test exactly one phase", () => {
    const expectedSerialFiles = [
      "lib/sena/__tests__/analysis-route.test.ts",
      "lib/sena/__tests__/snapshot-restore-route-round21.test.ts",
      "lib/sena/__tests__/enterprise-go-live.test.ts",
      "lib/sena/__tests__/enterprise.test.ts",
      "lib/sena/__tests__/publication-reliability-evidence-route-round14.test.ts"
    ];

    expect(SENA_VITEST_SERIAL_TEST_FILES).toEqual(expectedSerialFiles);
    expect(new Set(SENA_VITEST_SERIAL_TEST_FILES).size).toBe(expectedSerialFiles.length);

    for (const [availableCpus, expectedWorkers] of [
      [1, "1"],
      [4, "4"],
      [12, "4"]
    ] as const) {
      const phases = buildSenaVitestPhaseArgs([], availableCpus);
      expect(phases).toHaveLength(2);
      expect(phases[0]).toEqual([
        "--maxWorkers",
        expectedWorkers,
        ...expectedSerialFiles.flatMap((testFile) => ["--exclude", testFile])
      ]);
      expect(phases[1]).toEqual(["--no-file-parallelism", ...expectedSerialFiles]);
    }

    const trackedVitestFiles = listTrackedVitestFiles();
    const phases = buildSenaVitestPhaseArgs([], 8);
    const broadExclusions = phases[0]
      .slice(2)
      .filter((argument, index) => index % 2 === 1);
    const serialFiles = phases[1].slice(1);
    const broadFiles = trackedVitestFiles.filter((file) => !broadExclusions.includes(file));
    const trackedFilesHiddenByGlobalExcludes = trackedVitestFiles.filter((file) => {
      const rootedPath = `/${file}/`;
      return [
        "/node_modules/",
        "/dist/",
        "/.claude/worktrees/",
        "/.worktrees/",
        "/.tmp/"
      ].some((excludedPath) => rootedPath.includes(excludedPath));
    });

    expect(phases[0].slice(2).filter((_, index) => index % 2 === 0)).toEqual(
      expectedSerialFiles.map(() => "--exclude")
    );
    expect(broadExclusions).toEqual(expectedSerialFiles);
    expect(serialFiles).toEqual(expectedSerialFiles);
    expect(trackedFilesHiddenByGlobalExcludes).toEqual([]);
    expect(serialFiles.every((file) => trackedVitestFiles.includes(file))).toBe(true);
    expect(broadFiles.filter((file) => serialFiles.includes(file))).toEqual([]);
    expect([...broadFiles, ...serialFiles].sort()).toEqual(trackedVitestFiles);
  });

  it("preserves an explicit focused invocation as the only phase", () => {
    const requestedArgs = [
      "lib/sena/__tests__/reliability.test.ts",
      "--testNamePattern",
      "rejects stale approvals"
    ];

    expect(buildSenaVitestPhaseArgs(requestedArgs, 12)).toEqual([requestedArgs]);
    expect(requestedArgs).toEqual([
      "lib/sena/__tests__/reliability.test.ts",
      "--testNamePattern",
      "rejects stale approvals"
    ]);
  });

  it("fails closed for an invalid available CPU count", () => {
    expect(() => buildSenaVitestPhaseArgs([], 0)).toThrow(/positive integer/i);
    expect(() => buildSenaVitestPhaseArgs([], Number.NaN)).toThrow(/positive integer/i);
  });
});
