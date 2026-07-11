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
    expect(readdirSync(outputDir)).toEqual([
      "figure-1-human-human-overall.svg",
      "figure-2-concept-concept-overall.svg",
      "figure-3-temporal-paired-small-multiples.svg",
      "figure-data.json"
    ]);
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
