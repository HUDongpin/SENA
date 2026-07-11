import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { buildSenaModel, scopeSenaDatasetToWindow } from "../model";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaDataContractAudit, SenaMatrixBlock, SenaModel } from "../types";
import {
  assertMatrixBlock,
  loadDataset
} from "../../../scripts/generate-sena-human-concept-publication-figures";

const appRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const packageJsonPath = path.join(appRoot, "package.json");
const viteNodePath = path.join(appRoot, "node_modules", ".bin", "vite-node");
const generatorPath = path.join(appRoot, "scripts", "generate-sena-human-concept-publication-figures.ts");
const fixedSourcePath = path.join(appRoot, "public", "sena-pilot", "sample", "lesson-study-sena-contract.json");
const fixedSourceRelativePath = "public/sena-pilot/sample/lesson-study-sena-contract.json";
const requiredStages = ["Plan", "Teach", "Reflect"] as const;
type StageName = (typeof requiredStages)[number];
const buildOptions = {
  normalization: "max",
  bridgeWeightRule: "count",
  direction: "directed",
  undirectedSocial: false,
  temporal: { mode: "stage" },
  seed: 0
} as const;

type GeneratedFigureData = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.humanConceptFigureData;
  dataset: {
    source: string;
    version: string;
    sha256: string;
    synthetic: boolean;
  };
  configuration: SenaModel["options"];
  runIdentity: {
    hashAlgorithm: string;
    datasetVersion: string;
    datasetContentHash: string;
    configHash: string;
  };
  dataContractAudit: SenaDataContractAudit;
  stageOrder: StageName[];
  publicationUse: {
    classification: string;
    layoutReady: boolean;
    empiricalClaimReady: boolean;
    existingPublicationGate: string;
    limitation: string;
  };
  participants: Array<{ id: string; label: string; role: string; initials: string }>;
  codes: Array<{ id: string; label: string; family: string; color: string; description: string }>;
  overall: { S: SenaMatrixBlock; W: SenaMatrixBlock };
  temporal: Array<{
    stage: StageName;
    windowId: string;
    runIdentity: GeneratedFigureData["runIdentity"];
    counts: {
      people: number;
      codes: number;
      interactions: number;
      utterances: number;
      codedSegments: number;
    };
    S: SenaMatrixBlock;
    W: SenaMatrixBlock;
  }>;
  scales: {
    S: { minimumVisible: 1; maximumRaw: number };
    W: { minimumVisible: 1; maximumRaw: number };
  };
  interpretationGuardrails: string[];
};

type CachedGeneratorRun = {
  temporaryRoot: string;
  outputDir: string;
  result: SpawnSyncReturns<string>;
  figureDataText: string;
  figureData: GeneratedFigureData;
};

let cachedGeneratorRun: CachedGeneratorRun | undefined;
let cachedGeneratorTemporaryRoot: string | undefined;

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

function getCachedGeneratorRun(): CachedGeneratorRun {
  if (cachedGeneratorRun) return cachedGeneratorRun;

  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "sena-human-concept-output-"));
  cachedGeneratorTemporaryRoot = temporaryRoot;
  const outputDir = path.join(temporaryRoot, "generated");
  const result = runGenerator(["--output-dir", outputDir]);
  if (result.error) {
    throw new Error(`figure generator failed: ${result.error.message}\nstderr: ${result.stderr}`);
  }
  if (result.status !== 0) {
    throw new Error(`figure generator exited with status ${result.status}\nstderr: ${result.stderr}`);
  }
  const figureDataText = readFileSync(path.join(outputDir, "figure-data.json"), "utf8");

  cachedGeneratorRun = {
    temporaryRoot,
    outputDir,
    result,
    figureDataText,
    figureData: JSON.parse(figureDataText) as GeneratedFigureData
  };
  return cachedGeneratorRun;
}

afterAll(() => {
  if (cachedGeneratorTemporaryRoot) {
    rmSync(cachedGeneratorTemporaryRoot, { recursive: true, force: true });
  }
});

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

  it("writes auditable overall and stage-scoped runtime figure data", () => {
    const { dataset, datasetVersion, sourceSha256 } = loadDataset(fixedSourcePath);
    const overallModel = buildSenaModel(dataset, buildOptions);
    const { result, outputDir, figureData, figureDataText } = getCachedGeneratorRun();

    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(outputDir)).toBe(true);
    expect(readdirSync(outputDir)).toEqual(["figure-data.json"]);
    expect(figureDataText.length).toBeGreaterThan(0);
    expect(figureDataText.endsWith("\n")).toBe(true);

    expect(figureData.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.humanConceptFigureData);
    expect(figureData.dataset).toEqual({
      source: fixedSourceRelativePath,
      version: datasetVersion,
      sha256: sourceSha256,
      synthetic: true
    });
    expect(figureData.configuration).toEqual(overallModel.options);
    expect(figureData.runIdentity).toEqual(overallModel.operatorDiagnostics.runIdentity);
    expect(figureData.dataContractAudit.status).toBe("valid");
    expect(figureData.stageOrder).toEqual(requiredStages);
    expect(figureData.publicationUse).toEqual({
      classification: "synthetic-demo-figure",
      layoutReady: true,
      empiricalClaimReady: false,
      existingPublicationGate: "not-invoked-by-standalone-figure-generator",
      limitation: "Method-illustration figures only; not cleared as empirical evidence."
    });
    expect(figureData.participants).toEqual(
      dataset.people.map(({ id, label, role, initials }) => ({ id, label, role, initials }))
    );
    expect(figureData.codes).toEqual(
      dataset.codebook.map(({ id, label, family, color, description }) => ({ id, label, family, color, description }))
    );
    const participantLabels = figureData.participants.map(({ label }) => label);
    const codeLabels = figureData.codes.map(({ label }) => label);
    expect(figureData.overall.S).toEqual(overallModel.matrices.S);
    expect(figureData.overall.W).toEqual(overallModel.matrices.W);
    expect(figureData.overall.S.labels).toEqual(participantLabels);
    expect(figureData.overall.W.labels).toEqual(codeLabels);
    expect(figureData.overall.S.raw).toEqual([
      [0, 7, 0, 3],
      [0, 0, 3, 6],
      [4, 6, 0, 0],
      [2, 0, 2, 0]
    ]);
    expect(figureData.overall.W.raw[2][3]).toBe(3);
    expect(figureData.overall.W.raw[2][4]).toBe(3);
    expect(figureData.overall.W.raw[3][4]).toBe(3);

    expect(figureData.temporal).toHaveLength(3);
    expect(figureData.temporal.map(({ stage }) => stage)).toEqual(requiredStages);
    for (const temporalFigureData of figureData.temporal) {
      const matchingWindow = overallModel.temporal.windows.find(
        (window) => window.mode === "stage" && window.label === temporalFigureData.stage
      );
      expect(matchingWindow).toBeDefined();
      if (!matchingWindow) throw new Error(`Missing expected ${temporalFigureData.stage} stage window`);

      const scopedDataset = scopeSenaDatasetToWindow(dataset, matchingWindow);
      const scopedModel = buildSenaModel(scopedDataset, buildOptions);
      expect(temporalFigureData.windowId).toBe(matchingWindow.id);
      expect(temporalFigureData.runIdentity).toEqual(scopedModel.operatorDiagnostics.runIdentity);
      expect(temporalFigureData.counts).toEqual({
        people: scopedDataset.people.length,
        codes: scopedDataset.codebook.length,
        interactions: scopedDataset.interactions.length,
        utterances: scopedDataset.utterances.length,
        codedSegments: scopedDataset.coded_segments.length
      });
      expect(temporalFigureData.S).toEqual(scopedModel.matrices.S);
      expect(temporalFigureData.W).toEqual(scopedModel.matrices.W);
      expect(temporalFigureData.S.labels).toEqual(participantLabels);
      expect(temporalFigureData.W.labels).toEqual(codeLabels);
    }

    expect(figureData.scales).toEqual({
      S: { minimumVisible: 1, maximumRaw: 7 },
      W: { minimumVisible: 1, maximumRaw: 3 }
    });
    expect(figureData.scales.S).not.toHaveProperty("maxRaw");
    expect(figureData.scales.W).not.toHaveProperty("maxRaw");
    expect(figureData.interpretationGuardrails).toEqual([
      "S encodes observed directed interaction weights; it is not a causal influence model.",
      "W encodes code co-occurrence within unit-scoped stanzas; it is not semantic or causal direction.",
      "The bundled lesson-study dataset is synthetic and supports demonstration, not population inference."
    ]);
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

  it("is import-safe and exposes the dataset loader and matrix validator", () => {
    const temporaryCwd = mkdtempSync(path.join(tmpdir(), "sena-human-concept-import-"));
    const probePath = path.join(temporaryCwd, "import-generator.ts");
    writeFileSync(
      probePath,
      `import { assertMatrixBlock, loadDataset } from ${JSON.stringify(pathToFileURL(generatorPath).href)};\n` +
        `if (typeof loadDataset !== "function") throw new Error("loadDataset export missing");\n` +
        `if (typeof assertMatrixBlock !== "function") throw new Error("assertMatrixBlock export missing");\n`
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

  it("accepts matrix labels in the exact renderer order", () => {
    const block: SenaMatrixBlock = {
      labels: ["Facilitator", "Teacher"],
      raw: [
        [0, 2],
        [1, 0]
      ],
      normalized: [
        [0, 1],
        [0.5, 0]
      ]
    };

    expect(() => assertMatrixBlock("overall.S", block, ["Facilitator", "Teacher"])).not.toThrow();
  });

  it("rejects matrix labels that do not match the renderer order", () => {
    const block: SenaMatrixBlock = {
      labels: ["Teacher", "Facilitator"],
      raw: [
        [0, 2],
        [1, 0]
      ],
      normalized: [
        [0, 1],
        [0.5, 0]
      ]
    };

    expect(() => assertMatrixBlock("overall.S", block, ["Facilitator", "Teacher"])).toThrow(
      'overall.S matrix labels must exactly match expected labels; expected ["Facilitator","Teacher"], received ["Teacher","Facilitator"]'
    );
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
