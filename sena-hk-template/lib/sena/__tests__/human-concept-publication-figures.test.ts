import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync, type SpawnSyncReturns } from "node:child_process";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { resolveInstalledPackageFile } from "../../../scripts/resolve-installed-package-file";
import { buildSenaModel, scopeSenaDatasetToWindow } from "../model";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaDataContractAudit, SenaMatrixBlock, SenaModel } from "../types";
import {
  assertMatrixBlock,
  loadDataset
} from "../../../scripts/generate-sena-human-concept-publication-figures";

const appRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const packageJsonPath = path.join(appRoot, "package.json");
// Not appRoot/node_modules/.bin: a git worktree has no install of its own, so the
// binary is located through Node's module search path instead — see
// scripts/resolve-installed-package-file.ts. The package's own entry is spawned
// with process.execPath rather than the .bin shim, which is a symlink that only
// exists next to a real install.
const viteNodePath = resolveInstalledPackageFile("vite-node", "vite-node.mjs", import.meta.url);
const generatorPath = path.join(appRoot, "scripts", "generate-sena-human-concept-publication-figures.ts");
const fixedSourcePath = path.join(appRoot, "public", "sena-pilot", "sample", "lesson-study-sena-contract.json");
const fixedSourceRelativePath = "public/sena-pilot/sample/lesson-study-sena-contract.json";
const requiredStages = ["Plan", "Teach", "Reflect"] as const;
const requiredArtifacts = [
  "figure-1-human-human-overall.svg",
  "figure-1-human-human-overall.png",
  "figure-2-concept-concept-overall.svg",
  "figure-2-concept-concept-overall.png",
  "figure-3-temporal-paired-small-multiples.svg",
  "figure-3-temporal-paired-small-multiples.png",
  "figure-data.json",
  "figure-manifest.json",
  "captions.md"
] as const;
const payloadArtifacts = requiredArtifacts.filter((filename) => filename !== "figure-manifest.json");
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

type GeneratedArtifactRecord = {
  filename: string;
  role: "figure-vector" | "figure-raster" | "figure-data" | "captions";
  mediaType: "image/svg+xml" | "image/png" | "application/json" | "text/markdown";
  dimensions: { width: number; height: number } | null;
  bytes: number;
  sha256: string;
};

type GeneratedFigureManifest = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.humanConceptPublicationFigureManifest;
  generatedAt: string;
  generationClock: "wall-clock" | "source-date-epoch";
  dataset: GeneratedFigureData["dataset"];
  publicationUse: GeneratedFigureData["publicationUse"];
  dataContractAudit: GeneratedFigureData["dataContractAudit"];
  configuration: GeneratedFigureData["configuration"];
  stageOrder: StageName[];
  runtime: {
    overall: GeneratedFigureData["runIdentity"];
    stages: Array<{
      stage: StageName;
      windowId: string;
      runIdentity: GeneratedFigureData["runIdentity"];
    }>;
    environment: {
      node: string;
      sharp: string;
      libvips: string;
      platform: string;
      arch: string;
      fontFallback: string[];
    };
  };
  matrices: {
    overall: GeneratedFigureData["overall"];
    temporal: Array<Pick<GeneratedFigureData["temporal"][number], "stage" | "windowId" | "S" | "W">>;
  };
  artifactCount: number;
  artifacts: GeneratedArtifactRecord[];
  interpretationGuardrails: string[];
  selfHashPolicy: string;
};

let cachedGeneratorRun: CachedGeneratorRun | undefined;
let cachedGeneratorTemporaryRoot: string | undefined;
const temporaryOutputDirectories = new Set<string>();

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
  return spawnSync(process.execPath, [viteNodePath, "--script", generatorPath, ...args], {
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

async function waitForPath(targetPath: string, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(targetPath)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for path: ${targetPath}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
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

function makeOutputDir() {
  const outputDir = mkdtempSync(path.join(tmpdir(), "sena-human-concept-package-"));
  temporaryOutputDirectories.add(outputDir);
  return outputDir;
}

function makeOutputPath() {
  const parent = mkdtempSync(path.join(tmpdir(), "sena-human-concept-parent-"));
  temporaryOutputDirectories.add(parent);
  return path.join(parent, "generated");
}

function backupPathFor(outputDir: string) {
  return `${outputDir}.sena-publication-backup`;
}

function quarantinePathFor(outputDir: string) {
  return `${outputDir}.sena-publication-quarantine`;
}

function lockPathFor(outputDir: string) {
  return `${outputDir}.sena-publication.lock`;
}

function lockOwnerPathFor(lockDir: string) {
  return path.join(lockDir, "owner.json");
}

function lockTransientPathsFor(outputDir: string, kind: "candidate" | "release") {
  const lockPath = lockPathFor(outputDir);
  const prefix = `${path.basename(lockPath)}.${kind}-`;
  return readdirSync(path.dirname(lockPath))
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => path.join(path.dirname(lockPath), entry))
    .sort();
}

function lockCandidatePathsFor(outputDir: string) {
  return lockTransientPathsFor(outputDir, "candidate");
}

function lockReleasePathsFor(outputDir: string) {
  return lockTransientPathsFor(outputDir, "release");
}

function stagingPathsFor(outputDir: string) {
  const parent = path.dirname(outputDir);
  const prefix = `.${path.basename(outputDir)}.staging-`;
  return readdirSync(parent)
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => path.join(parent, entry))
    .sort();
}

async function imageDimensions(artifactPath: string) {
  const metadata = await sharp(artifactPath).metadata();
  return { width: metadata.width, height: metadata.height };
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requiredArtifactBytes(outputDir: string) {
  return new Map(
    requiredArtifacts.map((artifactName) => [
      artifactName,
      readFileSync(path.join(outputDir, artifactName))
    ])
  );
}

function expectRequiredArtifactBytes(outputDir: string, expected: Map<string, Buffer>) {
  expect(readdirSync(outputDir).sort()).toEqual([...requiredArtifacts].sort());
  for (const artifactName of requiredArtifacts) {
    expect(readFileSync(path.join(outputDir, artifactName))).toEqual(expected.get(artifactName));
  }
}

function readArtifact(outputDir: string, artifactName: string) {
  const artifactPath = path.join(outputDir, artifactName);
  expect(existsSync(artifactPath), `missing generated artifact: ${artifactName}`).toBe(true);
  return readFileSync(artifactPath, "utf8");
}

function expectAllText(svg: string, expectedText: string[]) {
  for (const text of expectedText) {
    expect(svg).toContain(text);
  }
}

function expectMinimumFontSize(svg: string, minimumFontSize: number) {
  const textElements = [...svg.matchAll(/<text\b[^>]*>/g)].map(([element]) => element);
  expect(textElements.length).toBeGreaterThan(0);

  for (const textElement of textElements) {
    const fontSize = textElement.match(/\bfont-size="([^"]+)"/);
    expect(fontSize, `visible SVG text requires an explicit font-size: ${textElement}`).not.toBeNull();
    expect(Number(fontSize?.[1]), `SVG text font-size is too small: ${textElement}`).toBeGreaterThanOrEqual(
      minimumFontSize
    );
  }
}

function expectedDirectedEdgeIds(block: SenaMatrixBlock, participantIds: string[]) {
  return block.raw
    .flatMap((row, sourceIndex) =>
      row.flatMap((weight, targetIndex) =>
        weight === 0 ? [] : [`S-${participantIds[sourceIndex]}-${participantIds[targetIndex]}`]
      )
    )
    .sort();
}

function expectedUndirectedEdgeIds(block: SenaMatrixBlock, codeIds: string[]) {
  return block.raw
    .flatMap((row, leftIndex) =>
      row.flatMap((weight, rightIndex) =>
        rightIndex <= leftIndex || weight === 0 ? [] : [`W-${codeIds[leftIndex]}-${codeIds[rightIndex]}`]
      )
    )
    .sort();
}

function svgEdgeIds(svg: string) {
  return [...svg.matchAll(/\bdata-edge-id="([^"]+)"/g)].map((match) => match[1]).sort();
}

function temporalEdgeElements(svg: string) {
  return [...svg.matchAll(/<(?:path|line)\b[^>]*\bdata-temporal-edge-id="[^"]+"[^>]*\/?\s*>/g)].map(
    ([element]) => element
  );
}

function svgAttribute(element: string, attribute: string) {
  return element.match(new RegExp(`\\b${attribute}="([^"]*)"`))?.[1];
}

afterAll(() => {
  if (cachedGeneratorTemporaryRoot) {
    rmSync(cachedGeneratorTemporaryRoot, { recursive: true, force: true });
  }
  for (const outputDir of temporaryOutputDirectories) {
    rmSync(outputDir, { recursive: true, force: true });
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
    expect(readdirSync(outputDir).sort()).toEqual([...requiredArtifacts].sort());
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

  it("renders deterministic overall Human–Human S and Concept–Concept W SVG semantics", () => {
    const { outputDir, figureData } = getCachedGeneratorRun();
    const figure1 = readArtifact(outputDir, "figure-1-human-human-overall.svg");
    const figure2 = readArtifact(outputDir, "figure-2-concept-concept-overall.svg");

    expect(figure1.length).toBeGreaterThan(0);
    expect(figure1.endsWith("\n")).toBe(true);
    expect(figure1).toContain('data-figure-id="figure-1-human-human-overall"');
    expect(figure1).toContain("<title>Figure 1. Overall Human–Human Network</title>");
    expect(figure1).toContain('data-background="opaque-white"');
    expect(figure1).toContain('data-legend="S-encoding"');
    expect(figure1).toContain('<rect data-node-kind="human"');
    expect(figure1).toContain('<marker id="s-arrow"');
    expect(figure1).toContain('marker-end="url(#s-arrow)"');
    expectAllText(figure1, [
      "Directed Human–Human interaction network (S), full lesson-study cycle",
      ...figureData.participants.flatMap(({ label, role }) => [label, role])
    ]);
    const expectedSEdgeIds = expectedDirectedEdgeIds(
      figureData.overall.S,
      figureData.participants.map(({ id }) => id)
    );
    expect(expectedSEdgeIds).toHaveLength(8);
    expect(svgEdgeIds(figure1)).toEqual(expectedSEdgeIds);
    expect(figure1).toContain('data-scale-sample="S-1" stroke-width="2.571"');
    expect(figure1).toContain('data-scale-sample="S-4" stroke-width="10.286"');
    expect(figure1).toContain('data-scale-sample="S-7" stroke-width="18"');
    expectMinimumFontSize(figure1, 34);

    expect(figure2.length).toBeGreaterThan(0);
    expect(figure2.endsWith("\n")).toBe(true);
    expect(figure2).toContain('data-figure-id="figure-2-concept-concept-overall"');
    expect(figure2).toContain("<title>Figure 2. Overall Concept–Concept Network</title>");
    expect(figure2).toContain('data-background="opaque-white"');
    expect(figure2).toContain('data-legend="W-encoding"');
    expect(figure2).toContain('<circle data-node-kind="concept"');
    expect(figure2).toContain('data-layer="W"');
    expect(figure2).toContain('stroke-dasharray="none"');
    expect(figure2).not.toContain("marker-end");
    expectAllText(figure2, [
      "Concept–Concept co-occurrence network (W), full lesson-study cycle",
      ...figureData.codes.map(({ label }) => label),
      "undirected; no causal direction"
    ]);
    const expectedWEdgeIds = expectedUndirectedEdgeIds(
      figureData.overall.W,
      figureData.codes.map(({ id }) => id)
    );
    expect(expectedWEdgeIds).toHaveLength(20);
    expect(svgEdgeIds(figure2)).toEqual(expectedWEdgeIds);
    expect(figure2).toContain('data-scale-sample="W-1" stroke-width="5"');
    expect(figure2).toContain('data-scale-sample="W-2" stroke-width="10"');
    expect(figure2).toContain('data-scale-sample="W-3" stroke-width="15"');
    expect(figure2).toContain(">unit-scoped stanza</text>");
    expect(figure2).toContain(">co-occurrence</text>");
    expect(figure2).toContain(">undirected; no</text>");
    expect(figure2).toContain(">causal direction</text>");
    expect(figure2).not.toContain("textLength=");
    expectMinimumFontSize(figure2, 34);

    for (const svg of [figure1, figure2]) {
      expect(svg).not.toMatch(/<(?:filter|linearGradient|radialGradient)\b/);
      expect(svg).not.toMatch(/data-layer="(?:B|G|fusion)"/);
    }
  });

  it("renders paired Plan–Teach–Reflect S/W panels with shared scales and stable labels", () => {
    const { outputDir, figureData } = getCachedGeneratorRun();
    const svg = readArtifact(outputDir, "figure-3-temporal-paired-small-multiples.svg");

    expect(svg.length).toBeGreaterThan(0);
    expect(svg.endsWith("\n")).toBe(true);
    expect(svg).toContain('data-figure-id="figure-3-temporal-paired-small-multiples"');
    expect(svg).toContain('width="2400" height="1440" viewBox="0 0 2400 1440"');
    expect(svg).toContain("<title>Figure 3. Plan–Teach–Reflect S and W Networks</title>");
    expect(svg).toContain('data-background="opaque-white"');
    expect(svg).toContain('data-legend="shared-temporal-encoding"');

    const panelIds = [...svg.matchAll(/\bdata-panel-id="([^"]+)"/g)].map((match) => match[1]);
    expect(panelIds).toEqual(["Plan-S", "Teach-S", "Reflect-S", "Plan-W", "Teach-W", "Reflect-W"]);
    expect(panelIds).toHaveLength(6);
    expect((svg.match(/\bdata-node-kind="human"/g) ?? [])).toHaveLength(12);
    expect((svg.match(/\bdata-node-kind="concept"/g) ?? [])).toHaveLength(21);
    expect(svg).toContain('data-active="false"');

    expect((svg.match(/\bdata-scale="shared-S-1-7"/g) ?? [])).toHaveLength(1);
    expect((svg.match(/\bdata-scale="shared-W-1-3"/g) ?? [])).toHaveLength(1);
    expect(svg).not.toContain("data-edge-label=");
    expect(svg).not.toMatch(/data-layer="(?:B|G|fusion)"/);
    expect(svg).not.toMatch(/<(?:filter|linearGradient|radialGradient)\b/);
    expectAllText(svg, figureData.participants.map(({ label }) => label));
    expectAllText(svg, figureData.codes.map(({ label }) => label));
    expectMinimumFontSize(svg, 34);

    const participantIds = figureData.participants.map(({ id }) => id);
    const codeIds = figureData.codes.map(({ id }) => id);
    const expectedTemporalEdgeIds = figureData.temporal
      .flatMap(({ stage, S, W }) => [
        ...S.raw.flatMap((row, sourceIndex) =>
          row.flatMap((weight, targetIndex) =>
            weight === 0 ? [] : [`${stage}:S:${participantIds[sourceIndex]}:${participantIds[targetIndex]}`]
          )
        ),
        ...W.raw.flatMap((row, leftIndex) =>
          row.flatMap((weight, rightIndex) =>
            rightIndex <= leftIndex || weight === 0
              ? []
              : [`${stage}:W:${codeIds[leftIndex]}:${codeIds[rightIndex]}`]
          )
        )
      ])
      .sort();
    const edgeElements = temporalEdgeElements(svg);
    const actualTemporalEdgeIds = edgeElements
      .map((element) => svgAttribute(element, "data-temporal-edge-id"))
      .filter((edgeId): edgeId is string => edgeId !== undefined)
      .sort();
    expect(actualTemporalEdgeIds).toEqual(expectedTemporalEdgeIds);

    for (const edgeElement of edgeElements) {
      const temporalEdgeId = svgAttribute(edgeElement, "data-temporal-edge-id");
      expect(temporalEdgeId).toBeDefined();
      if (temporalEdgeId?.includes(":S:")) {
        expect(svgAttribute(edgeElement, "data-layer")).toBe("S");
        expect(svgAttribute(edgeElement, "marker-end")).toBe("url(#s-arrow-temporal)");
      } else {
        expect(temporalEdgeId).toContain(":W:");
        expect(svgAttribute(edgeElement, "data-layer")).toBe("W");
        expect(svgAttribute(edgeElement, "stroke-dasharray")).toBe("none");
        expect(svgAttribute(edgeElement, "marker-end")).toBeUndefined();
      }
    }

    const layoutCoordinates = [...svg.matchAll(/\bdata-layout-coordinate="([^"]+)"/g)].map(
      (match) => match[1]
    );
    expect(layoutCoordinates).toHaveLength(33);
    const coordinateCounts = new Map<string, number>();
    for (const coordinate of layoutCoordinates) {
      coordinateCounts.set(coordinate, (coordinateCounts.get(coordinate) ?? 0) + 1);
      const match = coordinate.match(/^(human|concept):([^:]+):(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)$/);
      expect(match, `invalid normalized layout coordinate: ${coordinate}`).not.toBeNull();
      expect(Number(match?.[3])).toBeGreaterThanOrEqual(0);
      expect(Number(match?.[3])).toBeLessThanOrEqual(1);
      expect(Number(match?.[4])).toBeGreaterThanOrEqual(0);
      expect(Number(match?.[4])).toBeLessThanOrEqual(1);
    }
    expect(coordinateCounts.size).toBe(11);
    expect([...coordinateCounts.values()]).toEqual(Array.from({ length: 11 }, () => 3));
    expect([...coordinateCounts.keys()].map((coordinate) => coordinate.split(":").slice(0, 2).join(":"))).toEqual([
      ...participantIds.map((id) => `human:${id}`),
      ...codeIds.map((id) => `concept:${id}`)
    ]);

    const conceptLabelSlots = [...svg.matchAll(/\bdata-concept-label-slot="([^"]+)"/g)].map(
      (match) => match[1]
    );
    const expectedConceptLabelSlots = [
      "question:right-top",
      "hypothesis:right-middle",
      "evidence:right-bottom",
      "explanation:bottom-center",
      "critique:left-bottom",
      "reflection:left-middle",
      "coordination:left-top"
    ];
    expect(conceptLabelSlots).toHaveLength(21);
    const conceptLabelSlotCounts = new Map<string, number>();
    for (const conceptLabelSlot of conceptLabelSlots) {
      conceptLabelSlotCounts.set(conceptLabelSlot, (conceptLabelSlotCounts.get(conceptLabelSlot) ?? 0) + 1);
    }
    expect([...conceptLabelSlotCounts.keys()]).toEqual(expectedConceptLabelSlots);
    expect([...conceptLabelSlotCounts.values()]).toEqual(Array.from({ length: 7 }, () => 3));
  });

  it("keeps the temporal S arrowhead visibly larger than the strongest edge", () => {
    const { outputDir } = getCachedGeneratorRun();
    const svg = readArtifact(outputDir, "figure-3-temporal-paired-small-multiples.svg");
    const marker = svg.match(
      /<marker\b(?=[^>]*\bid="s-arrow-temporal")[^>]*>[\s\S]*?<\/marker>/
    )?.[0];

    expect(marker).toBeDefined();
    if (!marker) throw new Error("Missing temporal S arrow marker");
    expect(svgAttribute(marker, "markerUnits")).toBe("userSpaceOnUse");

    const markerWidth = Number(svgAttribute(marker, "markerWidth"));
    const markerHeight = Number(svgAttribute(marker, "markerHeight"));
    expect(markerWidth).toBeGreaterThanOrEqual(32);
    expect(markerHeight).toBeGreaterThanOrEqual(32);

    const viewBox = svgAttribute(marker, "viewBox")?.split(/\s+/).map(Number);
    expect(viewBox).toEqual([0, 0, 20, 20]);
    const trianglePath = marker.match(/<path\b[^>]*\bd="([^"]+)"[^>]*\/?\s*>/)?.[1];
    expect(trianglePath).toBe("M 0 1 L 19 10 L 0 19 Z");

    const renderedTriangleWidth = markerWidth * (19 / 20);
    const renderedTriangleHeight = markerHeight * (18 / 20);
    expect(renderedTriangleWidth).toBeGreaterThan(27);
    expect(renderedTriangleHeight).toBeGreaterThan(27);
  });

  it("keeps the overall S arrowhead visibly larger than the strongest edge", () => {
    const { outputDir } = getCachedGeneratorRun();
    const svg = readArtifact(outputDir, "figure-1-human-human-overall.svg");
    const marker = svg.match(
      /<marker\b(?=[^>]*\bid="s-arrow")[^>]*>[\s\S]*?<\/marker>/
    )?.[0];

    expect(marker).toBeDefined();
    if (!marker) throw new Error("Missing overall S arrow marker");
    expect(svgAttribute(marker, "markerUnits")).toBe("userSpaceOnUse");

    const markerWidth = Number(svgAttribute(marker, "markerWidth"));
    const markerHeight = Number(svgAttribute(marker, "markerHeight"));
    expect(markerWidth).toBeGreaterThanOrEqual(32);
    expect(markerHeight).toBeGreaterThanOrEqual(32);

    const viewBox = svgAttribute(marker, "viewBox")?.split(/\s+/).map(Number);
    expect(viewBox).toEqual([0, 0, 20, 20]);
    const trianglePath = marker.match(/<path\b[^>]*\bd="([^"]+)"[^>]*\/?\s*>/)?.[1];
    expect(trianglePath).toBe("M 0 1 L 19 10 L 0 19 Z");

    const overallEdgeStrokeWidths = [...svg.matchAll(/<path\b[^>]*\bdata-edge-id="S-[^"]+"[^>]*\/?\s*>/g)].map(
      ([edge]) => Number(svgAttribute(edge, "data-stroke-width"))
    );
    const maximumOverallStroke = Math.max(...overallEdgeStrokeWidths);
    expect(maximumOverallStroke).toBe(18);
    expect(markerWidth * (19 / 20)).toBeGreaterThan(maximumOverallStroke * 1.5);
    expect(markerHeight * (18 / 20)).toBeGreaterThan(maximumOverallStroke * 1.5);
  });

  it("publishes exactly nine non-empty artifacts", () => {
    const { outputDir } = getCachedGeneratorRun();

    expect(readdirSync(outputDir).sort()).toEqual([...requiredArtifacts].sort());
    for (const artifactName of requiredArtifacts) {
      expect(readFileSync(path.join(outputDir, artifactName)).byteLength, artifactName).toBeGreaterThan(0);
    }
  });

  it("keeps SVG authoritative and writes exact two-times lossless PNG dimensions", async () => {
    const { outputDir } = getCachedGeneratorRun();

    expect(await imageDimensions(path.join(outputDir, "figure-1-human-human-overall.svg"))).toEqual({
      width: 1800,
      height: 1200
    });
    expect(await imageDimensions(path.join(outputDir, "figure-1-human-human-overall.png"))).toEqual({
      width: 3600,
      height: 2400
    });
    expect(await imageDimensions(path.join(outputDir, "figure-2-concept-concept-overall.svg"))).toEqual({
      width: 1800,
      height: 1200
    });
    expect(await imageDimensions(path.join(outputDir, "figure-2-concept-concept-overall.png"))).toEqual({
      width: 3600,
      height: 2400
    });
    expect(await imageDimensions(path.join(outputDir, "figure-3-temporal-paired-small-multiples.svg"))).toEqual({
      width: 2400,
      height: 1440
    });
    expect(await imageDimensions(path.join(outputDir, "figure-3-temporal-paired-small-multiples.png"))).toEqual({
      width: 4800,
      height: 2880
    });
  });

  it("records eight disk-derived payload hashes and complete runtime and matrix provenance", () => {
    const { outputDir, figureData } = getCachedGeneratorRun();
    const manifestText = readArtifact(outputDir, "figure-manifest.json");
    const manifest = JSON.parse(manifestText) as GeneratedFigureManifest;

    expect(manifestText.endsWith("\n")).toBe(true);
    expect(manifest.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.humanConceptPublicationFigureManifest);
    expect(manifest.generatedAt).toBe(new Date(1783728000 * 1000).toISOString());
    expect(manifest.generationClock).toBe("source-date-epoch");
    expect(manifest.dataset).toEqual(figureData.dataset);
    expect(manifest.publicationUse).toEqual(figureData.publicationUse);
    expect(manifest.dataContractAudit).toEqual(figureData.dataContractAudit);
    expect(manifest.configuration).toEqual(figureData.configuration);
    expect(manifest.stageOrder).toEqual(figureData.stageOrder);
    expect(manifest.runtime.overall).toEqual(figureData.runIdentity);
    expect(manifest.runtime.stages).toEqual(
      figureData.temporal.map(({ stage, windowId, runIdentity }) => ({ stage, windowId, runIdentity }))
    );
    expect(manifest.runtime.environment).toEqual({
      node: process.version,
      sharp: sharp.versions.sharp,
      libvips: sharp.versions.vips,
      platform: process.platform,
      arch: process.arch,
      fontFallback: ["Arial", "Helvetica", "sans-serif"]
    });
    expect(manifest.matrices.overall).toEqual(figureData.overall);
    expect(manifest.matrices.temporal).toEqual(
      figureData.temporal.map(({ stage, windowId, S, W }) => ({ stage, windowId, S, W }))
    );
    expect(manifest.artifactCount).toBe(8);
    expect(manifest.artifacts).toHaveLength(8);
    expect(manifest.artifacts.map(({ filename }) => filename)).toEqual(payloadArtifacts);
    expect(manifest.artifacts.some(({ filename }) => filename === "figure-manifest.json")).toBe(false);
    expect(manifest.interpretationGuardrails).toEqual(figureData.interpretationGuardrails);
    expect(manifest.selfHashPolicy).toBe(
      "The manifest hashes eight payload artifacts and does not self-hash."
    );

    const expectedArtifactMetadata: Record<
      (typeof payloadArtifacts)[number],
      Pick<GeneratedArtifactRecord, "role" | "mediaType" | "dimensions">
    > = {
      "figure-1-human-human-overall.svg": {
        role: "figure-vector",
        mediaType: "image/svg+xml",
        dimensions: { width: 1800, height: 1200 }
      },
      "figure-1-human-human-overall.png": {
        role: "figure-raster",
        mediaType: "image/png",
        dimensions: { width: 3600, height: 2400 }
      },
      "figure-2-concept-concept-overall.svg": {
        role: "figure-vector",
        mediaType: "image/svg+xml",
        dimensions: { width: 1800, height: 1200 }
      },
      "figure-2-concept-concept-overall.png": {
        role: "figure-raster",
        mediaType: "image/png",
        dimensions: { width: 3600, height: 2400 }
      },
      "figure-3-temporal-paired-small-multiples.svg": {
        role: "figure-vector",
        mediaType: "image/svg+xml",
        dimensions: { width: 2400, height: 1440 }
      },
      "figure-3-temporal-paired-small-multiples.png": {
        role: "figure-raster",
        mediaType: "image/png",
        dimensions: { width: 4800, height: 2880 }
      },
      "figure-data.json": { role: "figure-data", mediaType: "application/json", dimensions: null },
      "captions.md": { role: "captions", mediaType: "text/markdown", dimensions: null }
    };

    for (const artifact of manifest.artifacts) {
      const bytes = readFileSync(path.join(outputDir, artifact.filename));
      expect(artifact).toMatchObject(expectedArtifactMetadata[artifact.filename as (typeof payloadArtifacts)[number]]);
      expect(artifact.bytes, artifact.filename).toBe(bytes.byteLength);
      expect(artifact.sha256, artifact.filename).toBe(sha256(bytes));
    }
  });

  it("writes complete manuscript captions and the exact claim boundary", () => {
    const { outputDir, figureData } = getCachedGeneratorRun();
    const captions = readArtifact(outputDir, "captions.md");

    expectAllText(captions, [
      "## Figure 1. Overall Human–Human Network",
      "directed observed interaction weight",
      "Arrowheads encode observed source-to-target direction",
      "line width encodes raw weight",
      "synthetic",
      "does not imply causal influence",
      "## Figure 2. Overall Concept–Concept Network",
      "undirected code co-occurrence within `unitId × stanzaId`",
      "line width encodes raw co-occurrence",
      "neither semantic nor causal direction",
      "## Figure 3. Plan–Teach–Reflect S and W Networks",
      "stage-scoped",
      "fixed node positions",
      "shared global raw-weight scales",
      "inactive nodes are muted",
      "descriptive and non-causal",
      "These figures intentionally isolate the S (Human–Human) and W (Concept–Concept) layers for interpretability; B and G remain part of SENA but are not visualized here.",
      "## Data and software note",
      `Source contract: \`${figureData.dataset.source}\``,
      `Dataset version: \`${figureData.dataset.version}\``,
      `Source SHA-256: \`${figureData.dataset.sha256}\``,
      `Runtime configuration: \`${JSON.stringify(figureData.configuration)}\``,
      `Overall runtime dataset hash: \`${figureData.runIdentity.datasetContentHash}\``,
      `Overall runtime configuration hash: \`${figureData.runIdentity.configHash}\``
    ]);
    expect(captions.endsWith(
      "These synthetic demonstration figures are layout-ready but are not cleared for empirical claims or population inference.\n"
    )).toBe(true);
  });

  // Rasterization competes with other workers in full-suite runs, so inherit
  // the loaded-machine timeout floor from vitest.config.ts.
  it("replays all nine artifacts byte-for-byte with the same SOURCE_DATE_EPOCH", () => {
    const cachedRun = getCachedGeneratorRun();
    const replayOutputDir = makeOutputDir();
    const replayResult = runGenerator(["--output-dir", replayOutputDir]);

    expect(replayResult.error).toBeUndefined();
    expect(replayResult.status, replayResult.stderr).toBe(0);
    expect(readdirSync(replayOutputDir).sort()).toEqual([...requiredArtifacts].sort());
    for (const artifactName of requiredArtifacts) {
      expect(readFileSync(path.join(replayOutputDir, artifactName)), artifactName).toEqual(
        readFileSync(path.join(cachedRun.outputDir, artifactName))
      );
    }
  });

  it("leaves the previous output untouched when rasterization fails", () => {
    const outputDir = makeOutputDir();
    const previousManifest = path.join(outputDir, "figure-manifest.json");
    writeFileSync(previousManifest, "previous-manifest\n", "utf8");

    const result = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_FAIL_PNG: "1" }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("injected PNG rendering failure");
    expect(readFileSync(previousManifest, "utf8")).toBe("previous-manifest\n");
    expect(readdirSync(outputDir)).toEqual(["figure-manifest.json"]);
  });

  it("fails closed rather than deleting unknown output-directory content", () => {
    const outputDir = makeOutputDir();
    const sentinel = path.join(outputDir, "researcher-notes.txt");
    writeFileSync(sentinel, "keep me\n", "utf8");
    const result = runGenerator(["--output-dir", outputDir]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("output directory contains unknown files");
    expect(readFileSync(sentinel, "utf8")).toBe("keep me\n");
    expect(readdirSync(outputDir)).toEqual(["researcher-notes.txt"]);
  });

  it("fails closed when the output path is a file", () => {
    const outputPath = makeOutputPath();
    writeFileSync(outputPath, "researcher-owned output path\n", "utf8");

    const result = runGenerator(["--output-dir", outputPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("output path must be a real directory");
    expect(readFileSync(outputPath, "utf8")).toBe("researcher-owned output path\n");
    expect(lstatSync(outputPath).isFile()).toBe(true);
  });

  it("fails closed when the output path is a symlink", () => {
    const externalDirectory = makeOutputDir();
    const externalManifest = path.join(externalDirectory, "figure-manifest.json");
    writeFileSync(externalManifest, "external manifest\n", "utf8");
    const outputPath = makeOutputPath();
    symlinkSync(externalDirectory, outputPath, "dir");

    const result = runGenerator(["--output-dir", outputPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("output path must be a real directory");
    expect(lstatSync(outputPath).isSymbolicLink()).toBe(true);
    expect(readlinkSync(outputPath)).toBe(externalDirectory);
    expect(readFileSync(externalManifest, "utf8")).toBe("external manifest\n");
  });

  it("preserves an allowed-name directory and its nested researcher note", () => {
    const outputDir = makeOutputDir();
    const captionsDirectory = path.join(outputDir, "captions.md");
    const nestedNote = path.join(captionsDirectory, "researcher-note.txt");
    mkdirSync(captionsDirectory);
    writeFileSync(nestedNote, "nested note must survive\n", "utf8");

    const result = runGenerator(["--output-dir", outputDir]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("output directory entry must be a top-level regular file: captions.md");
    expect(lstatSync(captionsDirectory).isDirectory()).toBe(true);
    expect(readFileSync(nestedNote, "utf8")).toBe("nested note must survive\n");
  });

  it("preserves an allowed-name symlink and its external sentinel", () => {
    const externalDirectory = makeOutputDir();
    const externalSentinel = path.join(externalDirectory, "external-sentinel.txt");
    writeFileSync(externalSentinel, "external sentinel must survive\n", "utf8");
    const outputDir = makeOutputDir();
    const captionsLink = path.join(outputDir, "captions.md");
    symlinkSync(externalSentinel, captionsLink);

    const result = runGenerator(["--output-dir", outputDir]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("output directory entry must be a top-level regular file: captions.md");
    expect(lstatSync(captionsLink).isSymbolicLink()).toBe(true);
    expect(readlinkSync(captionsLink)).toBe(externalSentinel);
    expect(readFileSync(externalSentinel, "utf8")).toBe("external sentinel must survive\n");
  });

  it("revalidates at publish time and preserves a late unknown file", () => {
    const outputDir = makeOutputDir();
    const previousManifest = path.join(outputDir, "figure-manifest.json");
    const lateNote = path.join(outputDir, "researcher-late-note.txt");
    writeFileSync(previousManifest, "previous-manifest\n", "utf8");

    const result = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_LATE_UNKNOWN_FILE: "1" }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("output directory contains unknown files: researcher-late-note.txt");
    expect(readFileSync(previousManifest, "utf8")).toBe("previous-manifest\n");
    expect(readFileSync(lateNote, "utf8")).toBe("late researcher note\n");
    expect(existsSync(backupPathFor(outputDir))).toBe(false);
    expect(stagingPathsFor(outputDir)).toEqual([]);
  });

  it("recovers the exact previous output after a hard exit between renames", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    const previousManifest = path.join(outputDir, "figure-manifest.json");
    writeFileSync(previousManifest, "previous-manifest\n", "utf8");

    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_CRASH_AFTER_BACKUP: "1" }
    );

    expect(interrupted.status).toBe(86);
    expect(existsSync(outputDir)).toBe(false);
    expect(lstatSync(backupPathFor(outputDir)).isDirectory()).toBe(true);
    expect(readFileSync(path.join(backupPathFor(outputDir), "figure-manifest.json"), "utf8")).toBe(
      "previous-manifest\n"
    );
    expect(stagingPathsFor(outputDir)).toHaveLength(1);

    const recovered = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_FAIL_PNG: "1" }
    );

    expect(recovered.status).toBe(1);
    expect(recovered.stderr).toContain("injected PNG rendering failure");
    expect(readFileSync(previousManifest, "utf8")).toBe("previous-manifest\n");
    expect(readdirSync(outputDir)).toEqual(["figure-manifest.json"]);
    expect(existsSync(backupPathFor(outputDir))).toBe(false);
    expect(stagingPathsFor(outputDir)).toEqual([]);
  });

  it("recovery state: keeps a READY owner marker through the old-output rename", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    const previousManifest = path.join(outputDir, "figure-manifest.json");
    writeFileSync(previousManifest, "previous-manifest\n", "utf8");

    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_CRASH_AFTER_READY_BEFORE_RENAME: "1" }
    );

    expect(interrupted.status).toBe(89);
    expect(existsSync(outputDir)).toBe(false);
    expect(lstatSync(backupPathFor(outputDir)).isDirectory()).toBe(true);
    expect(stagingPathsFor(outputDir)).toHaveLength(1);
    const [readyStaging] = stagingPathsFor(outputDir);
    const readyEntries = readdirSync(readyStaging);
    expect(readyEntries).toHaveLength(requiredArtifacts.length + 1);
    const readyMarkerName = readyEntries.find(
      (entry) => !(requiredArtifacts as readonly string[]).includes(entry)
    );
    expect(readyMarkerName).toBeDefined();
    const readyMarker = JSON.parse(
      readFileSync(path.join(readyStaging, readyMarkerName as string), "utf8")
    ) as {
      outputDirectory: string;
      backupDirectory: string;
      stagingDirectory: string;
      artifacts: Array<{ filename: string; bytes: number; sha256: string }>;
    };
    const canonicalOutput = path.join(realpathSync.native(path.dirname(outputDir)), path.basename(outputDir));
    const canonicalStaging = path.join(
      realpathSync.native(path.dirname(readyStaging)),
      path.basename(readyStaging)
    );
    expect(readyMarker.outputDirectory).toBe(canonicalOutput);
    expect(readyMarker.backupDirectory).toBe(backupPathFor(canonicalOutput));
    expect(readyMarker.stagingDirectory).toBe(canonicalStaging);
    expect(readyMarker.artifacts.map(({ filename }) => filename)).toEqual([...requiredArtifacts].sort());
    for (const artifact of readyMarker.artifacts) {
      expect(artifact.bytes).toBeGreaterThan(0);
      expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
    }

    const recovered = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_FAIL_PNG: "1" }
    );

    expect(recovered.status).toBe(1);
    expect(recovered.stderr).toContain("injected PNG rendering failure");
    expect(readFileSync(previousManifest, "utf8")).toBe("previous-manifest\n");
    expect(readdirSync(outputDir)).toEqual(["figure-manifest.json"]);
    expect(existsSync(backupPathFor(outputDir))).toBe(false);
    expect(stagingPathsFor(outputDir)).toEqual([]);
  }, 15_000);

  it("recovery state: preserves a fingerprinted backup beside nine uncommitted junk files", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    writeFileSync(path.join(outputDir, "figure-manifest.json"), "previous-manifest\n", "utf8");

    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_CRASH_AFTER_BACKUP: "1" }
    );
    expect(interrupted.status).toBe(86);

    mkdirSync(outputDir);
    for (const artifactName of requiredArtifacts) {
      writeFileSync(path.join(outputDir, artifactName), `junk:${artifactName}\n`, "utf8");
    }
    const junkBytes = requiredArtifactBytes(outputDir);

    const recovery = runGenerator(["--output-dir", outputDir]);

    expect(recovery.status).toBe(1);
    expect(recovery.stderr).toContain("output directory has no recognized committed marker");
    expectRequiredArtifactBytes(outputDir, junkBytes);
    expect(lstatSync(backupPathFor(outputDir)).isDirectory()).toBe(true);
    expect(readFileSync(path.join(backupPathFor(outputDir), "figure-manifest.json"), "utf8")).toBe(
      "previous-manifest\n"
    );
    expect(stagingPathsFor(outputDir)).toHaveLength(1);
  }, 15_000);

  it("recovery state: validates manifest payload records before resuming backup cleanup", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    writeFileSync(path.join(outputDir, "figure-manifest.json"), "previous-manifest\n", "utf8");

    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_CRASH_DURING_BACKUP_CLEANUP: "1" }
    );
    expect(interrupted.status).toBe(88);

    const quarantineDir = quarantinePathFor(outputDir);
    const receiptName = readdirSync(quarantineDir).find((entry) => entry.includes("commit-receipt"));
    expect(receiptName).toBeDefined();
    const receiptPath = path.join(quarantineDir, receiptName as string);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as {
      artifacts: Array<{ filename: string; bytes: number; sha256: string }>;
    };
    const captionsPath = path.join(outputDir, "captions.md");
    writeFileSync(captionsPath, `${readFileSync(captionsPath, "utf8")}tampered after commit\n`, "utf8");
    const captionsBytes = readFileSync(captionsPath);
    const captionsFingerprint = receipt.artifacts.find(({ filename }) => filename === "captions.md");
    expect(captionsFingerprint).toBeDefined();
    captionsFingerprint!.bytes = captionsBytes.byteLength;
    captionsFingerprint!.sha256 = sha256(captionsBytes);
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

    const recovery = runGenerator(["--output-dir", outputDir]);

    expect(recovery.status).toBe(1);
    expect(recovery.stderr).toContain(
      "output publication package manifest does not validate its eight payload artifacts"
    );
    expect(lstatSync(quarantineDir).isDirectory()).toBe(true);
    expect(readFileSync(captionsPath, "utf8")).toContain("tampered after commit");
    expect(existsSync(receiptPath)).toBe(true);

    const manifestPath = path.join(outputDir, "figure-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      artifacts: Array<{
        filename: string;
        role: string;
        bytes: number;
        sha256: string;
      }>;
    };
    const captionsRecord = manifest.artifacts.find(({ filename }) => filename === "captions.md");
    expect(captionsRecord).toBeDefined();
    captionsRecord!.role = "invalid-research-role";
    captionsRecord!.bytes = captionsBytes.byteLength;
    captionsRecord!.sha256 = sha256(captionsBytes);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const manifestBytes = readFileSync(manifestPath);
    const manifestFingerprint = receipt.artifacts.find(
      ({ filename }) => filename === "figure-manifest.json"
    );
    expect(manifestFingerprint).toBeDefined();
    manifestFingerprint!.bytes = manifestBytes.byteLength;
    manifestFingerprint!.sha256 = sha256(manifestBytes);
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

    const structuralRecovery = runGenerator(["--output-dir", outputDir]);

    expect(structuralRecovery.status).toBe(1);
    expect(structuralRecovery.stderr).toContain(
      "output publication package manifest does not validate its eight payload artifacts"
    );
    expect(lstatSync(quarantineDir).isDirectory()).toBe(true);
    expect(existsSync(receiptPath)).toBe(true);
  }, 15_000);

  it("finalization state: retains the complete old version when markerless output mutates", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    const previousArtifacts = new Map<string, Buffer>([
      ["captions.md", Buffer.from("previous captions\n")],
      ["figure-data.json", Buffer.from('{"previous":true}\n')],
      ["figure-manifest.json", Buffer.from("previous manifest\n")]
    ]);
    for (const [filename, bytes] of previousArtifacts) {
      writeFileSync(path.join(outputDir, filename), bytes);
    }
    const previousHashes = new Map(
      [...previousArtifacts].map(([filename, bytes]) => [filename, sha256(bytes)])
    );

    const result = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_MUTATE_OUTPUT_BEFORE_FINAL_VALIDATION: "1" }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("final steady-state output changed before validation");
    const quarantineDir = quarantinePathFor(outputDir);
    expect(lstatSync(quarantineDir).isDirectory()).toBe(true);
    for (const [filename, bytes] of previousArtifacts) {
      const quarantined = readFileSync(path.join(quarantineDir, filename));
      expect(quarantined).toEqual(bytes);
      expect(sha256(quarantined)).toBe(previousHashes.get(filename));
    }
    const quarantineEntries = readdirSync(quarantineDir);
    const oldVersionMarkerName = quarantineEntries.find((entry) => entry.includes("backup-owner"));
    const receiptName = quarantineEntries.find((entry) => entry.includes("commit-receipt"));
    expect(oldVersionMarkerName).toBeDefined();
    expect(receiptName).toBeDefined();
    const oldVersionMarker = JSON.parse(
      readFileSync(path.join(quarantineDir, oldVersionMarkerName as string), "utf8")
    ) as { artifacts: Array<{ filename: string; sha256: string }> };
    expect(oldVersionMarker.artifacts.map(({ filename }) => filename)).toEqual(
      [...previousArtifacts.keys()].sort()
    );
    for (const artifact of oldVersionMarker.artifacts) {
      expect(artifact.sha256).toBe(previousHashes.get(artifact.filename));
    }
    expect(existsSync(backupPathFor(outputDir))).toBe(false);
    expect(existsSync(lockPathFor(outputDir))).toBe(false);
    expect(readdirSync(outputDir).sort()).toEqual([...requiredArtifacts].sort());
    expect(readFileSync(path.join(outputDir, "captions.md"), "utf8")).toContain(
      "tampered before final steady-state validation"
    );
  }, 15_000);

  it("lock state: recovers the owned stale lock left by a hard exit", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    const previousManifest = path.join(outputDir, "figure-manifest.json");
    writeFileSync(previousManifest, "previous-manifest\n", "utf8");

    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_CRASH_AFTER_READY_BEFORE_RENAME: "1" }
    );

    expect(interrupted.status).toBe(89);
    const lockPath = lockPathFor(outputDir);
    expect(lstatSync(lockPath).isDirectory()).toBe(true);
    const lockMarker = JSON.parse(readFileSync(lockOwnerPathFor(lockPath), "utf8")) as {
      outputDirectory: string;
      pid: number;
      token: string;
    };
    expect(lockMarker.outputDirectory).toBe(
      path.join(realpathSync.native(path.dirname(outputDir)), path.basename(outputDir))
    );
    expect(lockMarker.pid).toBeGreaterThan(0);
    expect(lockMarker.token).toMatch(/^[0-9a-f-]{16,}$/);

    const recovered = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_FAIL_PNG: "1" }
    );

    expect(recovered.status).toBe(1);
    expect(recovered.stderr).toContain("injected PNG rendering failure");
    const fencePath = `${lockPath}.fence-${lockMarker.token}`;
    expect(recovered.stderr).toContain(
      `recovered stale publication lock into durable ABA-prevention fence: ${fencePath}`
    );
    expect(recovered.stderr).toContain(
      "coordination metadata only; it is intentionally not auto-deleted"
    );
    expect(recovered.stderr).toContain(
      "controlled maintenance window after confirming no figure-generator process is running"
    );
    expect(lstatSync(fencePath).isDirectory()).toBe(true);
    expect(JSON.parse(readFileSync(lockOwnerPathFor(fencePath), "utf8"))).toEqual(lockMarker);
    expect(readFileSync(previousManifest, "utf8")).toBe("previous-manifest\n");
    expect(existsSync(lockPath)).toBe(false);
    expect(existsSync(backupPathFor(outputDir))).toBe(false);
    expect(existsSync(quarantinePathFor(outputDir))).toBe(false);
    expect(stagingPathsFor(outputDir)).toEqual([]);
  }, 15_000);

  it("lock state: rejects a concurrent generator without moving the live directory lock", async () => {
    const outputDir = makeOutputPath();
    const first = spawn(process.execPath, [viteNodePath, "--script", generatorPath, "--output-dir", outputDir], {
      cwd: appRoot,
      env: {
        ...process.env,
        TZ: "UTC",
        SOURCE_DATE_EPOCH: "1783728000",
        NODE_ENV: "test"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let firstStdout = "";
    let firstStderr = "";
    first.stdout.setEncoding("utf8");
    first.stderr.setEncoding("utf8");
    first.stdout.on("data", (chunk: string) => {
      firstStdout += chunk;
    });
    first.stderr.on("data", (chunk: string) => {
      firstStderr += chunk;
    });
    const firstCompletion = new Promise<{ status: number | null; signal: NodeJS.Signals | null }>(
      (resolve, reject) => {
        first.once("error", reject);
        first.once("close", (status, signal) => resolve({ status, signal }));
      }
    );

    const lockPath = lockPathFor(outputDir);
    await waitForPath(lockPath);
    const liveOwner = JSON.parse(readFileSync(lockOwnerPathFor(lockPath), "utf8")) as {
      pid: number;
      token: string;
    };
    const blocked = runGenerator(["--output-dir", outputDir]);

    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain(`publication lock is held by live process ${liveOwner.pid}`);
    expect(lstatSync(lockPath).isDirectory()).toBe(true);
    const preservedOwner = JSON.parse(readFileSync(lockOwnerPathFor(lockPath), "utf8")) as {
      pid: number;
      token: string;
    };
    expect(preservedOwner).toEqual(liveOwner);

    const firstResult = await firstCompletion;
    expect(firstResult.signal).toBeNull();
    expect(firstResult.status, `${firstStdout}\n${firstStderr}`).toBe(0);
    expect(readdirSync(outputDir).sort()).toEqual([...requiredArtifacts].sort());
    expect(existsSync(lockPath)).toBe(false);
    expect(lockCandidatePathsFor(outputDir)).toEqual([]);
    expect(existsSync(backupPathFor(outputDir))).toBe(false);
    expect(existsSync(quarantinePathFor(outputDir))).toBe(false);
  }, 15_000);

  it("lock state: preserves a replacement lock at the stale-reclaim boundary", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    writeFileSync(path.join(outputDir, "figure-manifest.json"), "previous-manifest\n", "utf8");

    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_CRASH_AFTER_READY_BEFORE_RENAME: "1" }
    );
    expect(interrupted.status).toBe(89);
    const lockPath = lockPathFor(outputDir);
    const staleMarker = JSON.parse(readFileSync(lockOwnerPathFor(lockPath), "utf8")) as {
      token: string;
    };

    const recovery = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      {
        NODE_ENV: "test",
        SENA_FIGURE_TEST_FAIL_PNG: "1",
        SENA_FIGURE_TEST_REPLACE_STALE_LOCK_BEFORE_RECLAIM: "1"
      }
    );

    expect(recovery.status).toBe(1);
    expect(recovery.stderr).toContain("stale publication lock changed during guarded recovery");
    const replacementMarker = JSON.parse(readFileSync(lockOwnerPathFor(lockPath), "utf8")) as {
      pid: number;
      token: string;
    };
    expect(replacementMarker.pid).toBeGreaterThan(0);
    expect(replacementMarker.token).not.toBe(staleMarker.token);
    expect(existsSync(backupPathFor(outputDir))).toBe(true);
  }, 15_000);

  it("lock state: recovers a prepared candidate left by a hard exit", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    const previousManifest = path.join(outputDir, "figure-manifest.json");
    writeFileSync(previousManifest, "previous-manifest\n", "utf8");

    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_CRASH_WITH_PUBLICATION_LOCK_GUARD: "1" }
    );

    expect(interrupted.status).toBe(92);
    const candidatePaths = lockCandidatePathsFor(outputDir);
    expect(candidatePaths).toHaveLength(1);
    const [candidatePath] = candidatePaths;
    expect(lstatSync(candidatePath).isDirectory()).toBe(true);
    expect(lstatSync(lockOwnerPathFor(candidatePath)).isFile()).toBe(true);
    expect(existsSync(lockPathFor(outputDir))).toBe(false);

    const recovered = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_FAIL_PNG: "1" }
    );

    expect(recovered.status).toBe(1);
    expect(recovered.stderr).toContain("injected PNG rendering failure");
    expect(readFileSync(previousManifest, "utf8")).toBe("previous-manifest\n");
    expect(existsSync(lockPathFor(outputDir))).toBe(false);
    expect(lockCandidatePathsFor(outputDir)).toEqual([]);
  }, 15_000);

  it("lock state: recovers an empty candidate mkdir gap", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    const previousManifest = path.join(outputDir, "figure-manifest.json");
    writeFileSync(previousManifest, "previous-manifest\n", "utf8");

    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_CRASH_AFTER_LOCK_CANDIDATE_MKDIR: "1" }
    );

    expect(interrupted.status).toBe(93);
    const candidatePaths = lockCandidatePathsFor(outputDir);
    expect(candidatePaths).toHaveLength(1);
    expect(readdirSync(candidatePaths[0])).toEqual([]);

    const recovered = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_FAIL_PNG: "1" }
    );

    expect(recovered.status).toBe(1);
    expect(recovered.stderr).toContain("injected PNG rendering failure");
    expect(readFileSync(previousManifest, "utf8")).toBe("previous-manifest\n");
    expect(lockCandidatePathsFor(outputDir)).toEqual([]);
    expect(existsSync(lockPathFor(outputDir))).toBe(false);
  }, 15_000);

  it("lock state: recovers an empty release marker gap", () => {
    const outputDir = makeOutputPath();
    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_CRASH_AFTER_LOCK_RELEASE_OWNER_UNLINK: "1" }
    );

    expect(interrupted.status).toBe(94);
    expect(readdirSync(outputDir).sort()).toEqual([...requiredArtifacts].sort());
    const releasePaths = lockReleasePathsFor(outputDir);
    expect(releasePaths).toHaveLength(1);
    expect(readdirSync(releasePaths[0])).toEqual([]);
    expect(existsSync(lockPathFor(outputDir))).toBe(false);

    const committedBytes = requiredArtifactBytes(outputDir);
    const recovered = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_FAIL_PNG: "1" }
    );

    expect(recovered.status).toBe(1);
    expect(recovered.stderr).toContain("injected PNG rendering failure");
    expectRequiredArtifactBytes(outputDir, committedBytes);
    expect(lockReleasePathsFor(outputDir)).toEqual([]);
    expect(existsSync(lockPathFor(outputDir))).toBe(false);
  }, 15_000);

  it("recovery state: restores a complete receipt-bearing quarantine when output is absent", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    const previousArtifacts = new Map<string, Buffer>([
      ["captions.md", Buffer.from("previous captions\n")],
      ["figure-manifest.json", Buffer.from("previous manifest\n")]
    ]);
    for (const [filename, bytes] of previousArtifacts) {
      writeFileSync(path.join(outputDir, filename), bytes);
    }

    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_MUTATE_OUTPUT_BEFORE_FINAL_VALIDATION: "1" }
    );
    expect(interrupted.status).toBe(1);
    expect(lstatSync(quarantinePathFor(outputDir)).isDirectory()).toBe(true);
    const lostNewOutput = `${outputDir}.lost-new-output`;
    renameSync(outputDir, lostNewOutput);

    const recovered = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_FAIL_PNG: "1" }
    );

    expect(recovered.status).toBe(1);
    expect(recovered.stderr).toContain("injected PNG rendering failure");
    expect(readdirSync(outputDir).sort()).toEqual([...previousArtifacts.keys()].sort());
    for (const [filename, bytes] of previousArtifacts) {
      expect(readFileSync(path.join(outputDir, filename))).toEqual(bytes);
    }
    expect(existsSync(quarantinePathFor(outputDir))).toBe(false);
    expect(existsSync(lockPathFor(outputDir))).toBe(false);
    expect(lstatSync(lostNewOutput).isDirectory()).toBe(true);
  }, 15_000);

  it("recovery state: restores the backup before preserving suspicious marked staging", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    const previousManifest = path.join(outputDir, "figure-manifest.json");
    writeFileSync(previousManifest, "previous-manifest\n", "utf8");

    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_CRASH_AFTER_BACKUP: "1" }
    );
    expect(interrupted.status).toBe(86);

    const [stagingDir] = stagingPathsFor(outputDir);
    const researcherNote = path.join(stagingDir, "researcher-note.txt");
    writeFileSync(researcherNote, "preserve this staging note\n", "utf8");

    const recovery = runGenerator(["--output-dir", outputDir]);

    expect(recovery.status).toBe(1);
    expect(recovery.stderr).toContain("staging directory contains unknown files: researcher-note.txt");
    expect(readFileSync(previousManifest, "utf8")).toBe("previous-manifest\n");
    expect(readdirSync(outputDir)).toEqual(["figure-manifest.json"]);
    expect(existsSync(backupPathFor(outputDir))).toBe(false);
    expect(lstatSync(stagingDir).isDirectory()).toBe(true);
    expect(readFileSync(researcherNote, "utf8")).toBe("preserve this staging note\n");
  }, 15_000);

  it("recovery state: resumes after the backup marker was unlinked before rmdir", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    writeFileSync(path.join(outputDir, "figure-manifest.json"), "previous-manifest\n", "utf8");

    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_CRASH_AFTER_BACKUP_MARKER_UNLINK: "1" }
    );

    expect(interrupted.status).toBe(90);
    const committedBytes = requiredArtifactBytes(outputDir);
    expect(readdirSync(outputDir).sort()).toEqual([...requiredArtifacts].sort());
    expect(existsSync(backupPathFor(outputDir))).toBe(false);
    expect(lstatSync(quarantinePathFor(outputDir)).isDirectory()).toBe(true);
    expect(readdirSync(quarantinePathFor(outputDir))).toEqual([]);

    const recovered = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_FAIL_PNG: "1" }
    );

    expect(recovered.status).toBe(1);
    expect(recovered.stderr).toContain("injected PNG rendering failure");
    expectRequiredArtifactBytes(outputDir, committedBytes);
    expect(existsSync(backupPathFor(outputDir))).toBe(false);
    expect(existsSync(quarantinePathFor(outputDir))).toBe(false);
    expect(existsSync(lockPathFor(outputDir))).toBe(false);
    expect(stagingPathsFor(outputDir)).toEqual([]);
  }, 15_000);

  it("recovery state: recognizes markerless output with a retained quarantine receipt", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    writeFileSync(path.join(outputDir, "figure-manifest.json"), "previous-manifest\n", "utf8");

    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_CRASH_AFTER_BACKUP_REMOVED: "1" }
    );

    expect(interrupted.status).toBe(91);
    const committedBytes = requiredArtifactBytes(outputDir);
    expect(readdirSync(outputDir).sort()).toEqual([...requiredArtifacts].sort());
    expect(existsSync(backupPathFor(outputDir))).toBe(false);
    expect(lstatSync(quarantinePathFor(outputDir)).isDirectory()).toBe(true);
    expect(readdirSync(quarantinePathFor(outputDir))).toContain(
      ".sena-publication-commit-receipt.json"
    );

    const recovered = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_FAIL_PNG: "1" }
    );

    expect(recovered.status).toBe(1);
    expect(recovered.stderr).toContain("injected PNG rendering failure");
    expectRequiredArtifactBytes(outputDir, committedBytes);
    expect(existsSync(backupPathFor(outputDir))).toBe(false);
    expect(existsSync(quarantinePathFor(outputDir))).toBe(false);
    expect(existsSync(lockPathFor(outputDir))).toBe(false);
    expect(stagingPathsFor(outputDir)).toEqual([]);
  }, 15_000);

  it("recovery state: removes an empty unmarked generated staging directory non-recursively", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    const previousManifest = path.join(outputDir, "figure-manifest.json");
    writeFileSync(previousManifest, "previous-manifest\n", "utf8");
    const emptyStaging = path.join(
      path.dirname(outputDir),
      `.${path.basename(outputDir)}.staging-marker-gap`
    );
    mkdirSync(emptyStaging);

    const recovery = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_FAIL_PNG: "1" }
    );

    expect(recovery.status).toBe(1);
    expect(recovery.stderr).toContain("injected PNG rendering failure");
    expect(readFileSync(previousManifest, "utf8")).toBe("previous-manifest\n");
    expect(existsSync(emptyStaging)).toBe(false);
  });

  it("recovers an owned marker left in output before the first rename", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    const previousManifest = path.join(outputDir, "figure-manifest.json");
    writeFileSync(previousManifest, "previous-manifest\n", "utf8");

    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_CRASH_AFTER_OUTPUT_MARKER: "1" }
    );

    expect(interrupted.status).toBe(87);
    expect(existsSync(backupPathFor(outputDir))).toBe(false);
    expect(readdirSync(outputDir)).toHaveLength(2);
    expect(readFileSync(previousManifest, "utf8")).toBe("previous-manifest\n");

    const recovered = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_FAIL_PNG: "1" }
    );

    expect(recovered.status).toBe(1);
    expect(recovered.stderr).toContain("injected PNG rendering failure");
    expect(readdirSync(outputDir)).toEqual(["figure-manifest.json"]);
    expect(readFileSync(previousManifest, "utf8")).toBe("previous-manifest\n");
    expect(stagingPathsFor(outputDir)).toEqual([]);
  });

  it("preserves an unsafe orphan backup rather than recursively deleting it", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    writeFileSync(path.join(outputDir, "figure-manifest.json"), "previous-manifest\n", "utf8");
    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_CRASH_AFTER_BACKUP: "1" }
    );
    expect(interrupted.status).toBe(86);

    const backupDir = backupPathFor(outputDir);
    const researcherNote = path.join(backupDir, "researcher-note.txt");
    writeFileSync(researcherNote, "do not delete this backup note\n", "utf8");
    const recovery = runGenerator(["--output-dir", outputDir]);

    expect(recovery.status).toBe(1);
    expect(recovery.stderr).toContain("backup directory contents do not match its owned marker");
    expect(existsSync(outputDir)).toBe(false);
    expect(lstatSync(backupDir).isDirectory()).toBe(true);
    expect(readFileSync(path.join(backupDir, "figure-manifest.json"), "utf8")).toBe("previous-manifest\n");
    expect(readFileSync(researcherNote, "utf8")).toBe("do not delete this backup note\n");
  });

  it("safely cleans a recognized orphan backup when a valid output is present", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    writeFileSync(path.join(outputDir, "figure-manifest.json"), "old-manifest\n", "utf8");
    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_CRASH_AFTER_BACKUP: "1" }
    );
    expect(interrupted.status).toBe(86);

    const [readyStaging] = stagingPathsFor(outputDir);
    renameSync(readyStaging, outputDir);
    const currentArtifactBytes = requiredArtifactBytes(outputDir);
    const recovery = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_FAIL_PNG: "1" }
    );

    expect(recovery.status).toBe(1);
    expect(recovery.stderr).toContain("injected PNG rendering failure");
    expectRequiredArtifactBytes(outputDir, currentArtifactBytes);
    expect(existsSync(backupPathFor(outputDir))).toBe(false);
    expect(stagingPathsFor(outputDir)).toEqual([]);
  }, 15_000);

  it("resumes safe cleanup of a partially unlinked owned backup", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    writeFileSync(path.join(outputDir, "captions.md"), "old captions\n", "utf8");
    writeFileSync(path.join(outputDir, "figure-data.json"), '{"old":true}\n', "utf8");
    writeFileSync(path.join(outputDir, "figure-manifest.json"), "old-manifest\n", "utf8");

    const interrupted = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_CRASH_DURING_BACKUP_CLEANUP: "1" }
    );

    expect(interrupted.status).toBe(88);
    const interruptedEntries = readdirSync(outputDir).sort();
    expect(interruptedEntries.filter((entry) => (requiredArtifacts as readonly string[]).includes(entry))).toEqual(
      [...requiredArtifacts].sort()
    );
    expect(interruptedEntries).toHaveLength(requiredArtifacts.length);
    expect(existsSync(backupPathFor(outputDir))).toBe(false);
    expect(lstatSync(quarantinePathFor(outputDir)).isDirectory()).toBe(true);
    expect(readdirSync(quarantinePathFor(outputDir))).toContain(
      ".sena-publication-commit-receipt.json"
    );
    expect(readFileSync(path.join(quarantinePathFor(outputDir), "figure-data.json"), "utf8")).toBe(
      '{"old":true}\n'
    );
    expect(readFileSync(path.join(quarantinePathFor(outputDir), "figure-manifest.json"), "utf8")).toBe(
      "old-manifest\n"
    );

    const recovered = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_FAIL_PNG: "1" }
    );

    expect(recovered.status).toBe(1);
    expect(recovered.stderr).toContain("injected PNG rendering failure");
    expect(readdirSync(outputDir).sort()).toEqual([...requiredArtifacts].sort());
    expect(existsSync(backupPathFor(outputDir))).toBe(false);
    expect(existsSync(quarantinePathFor(outputDir))).toBe(false);
    expect(existsSync(lockPathFor(outputDir))).toBe(false);
    expect(stagingPathsFor(outputDir)).toEqual([]);
  });

  it("revalidates the moved backup before replacement and preserves unsafe content", () => {
    const outputDir = makeOutputPath();
    mkdirSync(outputDir);
    writeFileSync(path.join(outputDir, "figure-manifest.json"), "previous-manifest\n", "utf8");

    const result = runGenerator(
      ["--output-dir", outputDir],
      appRoot,
      { NODE_ENV: "test", SENA_FIGURE_TEST_LATE_BACKUP_UNKNOWN: "1" }
    );

    const backupDir = backupPathFor(outputDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("backup directory contents do not match its owned marker");
    expect(existsSync(outputDir)).toBe(false);
    expect(lstatSync(backupDir).isDirectory()).toBe(true);
    expect(readFileSync(path.join(backupDir, "figure-manifest.json"), "utf8")).toBe("previous-manifest\n");
    expect(readFileSync(path.join(backupDir, "researcher-late-backup-note.txt"), "utf8")).toBe(
      "late backup note\n"
    );
    expect(stagingPathsFor(outputDir)).toEqual([]);
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
      const result = spawnSync(process.execPath, [viteNodePath, probePath], {
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
