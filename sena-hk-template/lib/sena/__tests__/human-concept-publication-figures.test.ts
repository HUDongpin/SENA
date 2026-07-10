import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { describe, expect, it } from "vitest";
import { loadDataset } from "../../../scripts/generate-sena-human-concept-publication-figures";

const appRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const packageJsonPath = path.join(appRoot, "package.json");
const viteNodePath = path.join(appRoot, "node_modules", ".bin", "vite-node");
const generatorPath = path.join(appRoot, "scripts", "generate-sena-human-concept-publication-figures.ts");
const fixedSourcePath = path.join(appRoot, "public", "sena-pilot", "sample", "lesson-study-sena-contract.json");

type MutableDatasetFixture = {
  metadata: Record<string, unknown>;
  people: Array<Record<string, unknown>>;
  interactions: Array<Record<string, unknown>>;
  utterances: Array<Record<string, unknown>>;
  coded_segments: Array<Record<string, unknown>>;
  codebook: Array<Record<string, unknown>>;
};

function readMutableDatasetFixture(): MutableDatasetFixture {
  return JSON.parse(readFileSync(fixedSourcePath, "utf8")) as MutableDatasetFixture;
}

function withSourceFixture<T>(source: string | Buffer, assertion: (sourcePath: string) => T): T {
  const temporaryCwd = mkdtempSync(path.join(tmpdir(), "sena-human-concept-source-"));
  const sourcePath = path.join(temporaryCwd, "source.json");
  writeFileSync(sourcePath, source);

  try {
    return assertion(sourcePath);
  } finally {
    rmSync(temporaryCwd, { recursive: true, force: true });
  }
}

function expectValidationError(
  mutate: (dataset: MutableDatasetFixture) => void,
  expectedMessage: string
) {
  const dataset = readMutableDatasetFixture();
  mutate(dataset);
  withSourceFixture(JSON.stringify(dataset), (sourcePath) => {
    expect(() => loadDataset(sourcePath)).toThrow(expectedMessage);
  });
}

function runGenerator(
  args: string[],
  cwd = appRoot,
  extraEnv: Partial<NodeJS.ProcessEnv> = {}
): SpawnSyncReturns<string> {
  return spawnSync(viteNodePath, ["--script", generatorPath, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
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

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("SENA figure generation failed: source contract not found");
    } finally {
      rmSync(temporaryCwd, { recursive: true, force: true });
    }
  });

  it("creates the requested output directory without writing artifacts", () => {
    const temporaryCwd = mkdtempSync(path.join(tmpdir(), "sena-human-concept-output-"));
    const outputDir = path.join(temporaryCwd, "generated");

    try {
      const result = runGenerator(["--output-dir", outputDir]);

      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(outputDir)).toBe(true);
      expect(readdirSync(outputDir)).toEqual([]);
    } finally {
      rmSync(temporaryCwd, { recursive: true, force: true });
    }
  });

  it("rejects --output-dir without a value", () => {
    const result = runGenerator(["--output-dir"]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("SENA figure generation failed: --output-dir requires a value\n");
  });

  it("rejects unknown flags including arbitrary --input", () => {
    const result = runGenerator(["--input", "arbitrary.json"]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("SENA figure generation failed: unknown argument: --input\n");
  });

  it("is import-safe and exposes the dataset loader", () => {
    const temporaryCwd = mkdtempSync(path.join(tmpdir(), "sena-human-concept-import-"));
    const probePath = path.join(temporaryCwd, "import-generator.ts");
    writeFileSync(
      probePath,
      `import { loadDataset } from ${JSON.stringify(pathToFileURL(generatorPath).href)};\n` +
        `if (typeof loadDataset !== "function") throw new Error("loadDataset export missing");\n`
    );

    try {
      const result = spawnSync(viteNodePath, [probePath], {
        cwd: temporaryCwd,
        encoding: "utf8",
        timeout: 30_000,
        env: {
          ...process.env,
          TZ: "UTC",
          SOURCE_DATE_EPOCH: "1783728000"
        }
      });

      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).toBe("");
    } finally {
      rmSync(temporaryCwd, { recursive: true, force: true });
    }
  });

  it("returns the exact SHA-256 of the source bytes", () => {
    const sourceBytes = readFileSync(fixedSourcePath);
    const expectedSha256 = createHash("sha256").update(sourceBytes).digest("hex");

    withSourceFixture(sourceBytes, (sourcePath) => {
      const result = loadDataset(sourcePath);

      expect(result.sourceBytes).toEqual(sourceBytes);
      expect(result.sourceSha256).toBe(expectedSha256);
      expect(result.datasetVersion).toBe("lesson-study-public-synthetic-v1");
      expect(result.dataContractAudit.status).toBe("valid");
    });
  });

  it("rejects invalid JSON with a clear source-contract error", () => {
    withSourceFixture("{ not valid JSON", (sourcePath) => {
      expect(() => loadDataset(sourcePath)).toThrow("source contract contains invalid JSON:");
    });
  });

  it.each([
    {
      label: "people optional initials",
      mutate: (dataset: MutableDatasetFixture) => {
        dataset.people[0].initials = "";
      },
      expected: "source contract people[0].initials must be a non-empty string when provided"
    },
    {
      label: "people required role",
      mutate: (dataset: MutableDatasetFixture) => {
        dataset.people[0].role = 42;
      },
      expected: "source contract people[0].role must be a non-empty string"
    },
    {
      label: "interaction weight",
      mutate: (dataset: MutableDatasetFixture) => {
        dataset.interactions[0].weight = -1;
      },
      expected: "source contract interactions[0].weight must be a finite nonnegative number when provided"
    },
    {
      label: "interaction turn index",
      mutate: (dataset: MutableDatasetFixture) => {
        dataset.interactions[0].turnIndex = "first";
      },
      expected: "source contract interactions[0].turnIndex must be a finite number when provided"
    },
    {
      label: "utterance timestamp",
      mutate: (dataset: MutableDatasetFixture) => {
        dataset.utterances[0].timestamp = " ";
      },
      expected: "source contract utterances[0].timestamp must be a non-empty string"
    },
    {
      label: "utterance turn index",
      mutate: (dataset: MutableDatasetFixture) => {
        dataset.utterances[0].turnIndex = null;
      },
      expected: "source contract utterances[0].turnIndex must be a finite number"
    },
    {
      label: "coded-segment codes",
      mutate: (dataset: MutableDatasetFixture) => {
        dataset.coded_segments[0].codes = ["question", ""];
      },
      expected: "source contract coded_segments[0].codes must be a non-empty array of non-empty strings"
    },
    {
      label: "coded-segment confidence",
      mutate: (dataset: MutableDatasetFixture) => {
        dataset.coded_segments[0].confidence = "high";
      },
      expected: "source contract coded_segments[0].confidence must be a finite number when provided"
    },
    {
      label: "coded-segment targets",
      mutate: (dataset: MutableDatasetFixture) => {
        dataset.coded_segments[0].targetPersonIds = [""];
      },
      expected: "source contract coded_segments[0].targetPersonIds must be an array of non-empty strings when provided"
    },
    {
      label: "codebook description",
      mutate: (dataset: MutableDatasetFixture) => {
        dataset.codebook[0].description = "";
      },
      expected: "source contract codebook[0].description must be a non-empty string"
    }
  ])("rejects a malformed consumed field: $label", ({ mutate, expected }) => {
    expectValidationError(mutate, expected);
  });

  it("rejects an unexpected stage with row and field context", () => {
    expectValidationError(
      (dataset) => {
        dataset.interactions[0].stage = "Observe";
      },
      "source contract interactions[0].stage must be one of: Plan, Teach, Reflect"
    );
  });

  it.each([
    { table: "interactions" as const },
    { table: "utterances" as const },
    { table: "coded_segments" as const }
  ])("requires Reflect coverage in $table", ({ table }) => {
    expectValidationError(
      (dataset) => {
        for (const row of dataset[table]) {
          if (row.stage === "Reflect") row.stage = "Teach";
        }
      },
      `source contract ${table} is missing required stage Reflect`
    );
  });

  it("reports failed audit item ids for cross-reference errors", () => {
    expectValidationError(
      (dataset) => {
        dataset.interactions[0].source = "missing-person";
      },
      "source contract data audit failed: interactions-table"
    );
  });

  it("rejects invalid code colors with row and field context", () => {
    expectValidationError(
      (dataset) => {
        dataset.codebook[0].color = "purple";
      },
      "source contract codebook[0].color must be a six-digit hexadecimal color (#RRGGBB)"
    );
  });
});
