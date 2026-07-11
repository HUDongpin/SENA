import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSenaDataContractAudit } from "../lib/sena/data-contract-audit";
import { buildSenaModel, scopeSenaDatasetToWindow } from "../lib/sena/model";
import { createSenaSchemaPayload, SENA_SCHEMA_VERSIONS } from "../lib/sena/schema-registry";
import type { SenaDataContractAudit, SenaDataset, SenaMatrixBlock, SenaModel } from "../lib/sena/types";

const APP_ROOT = process.cwd();
const SOURCE_RELATIVE_PATH = "public/sena-pilot/sample/lesson-study-sena-contract.json" as const;
const DEFAULT_INPUT = path.join(APP_ROOT, SOURCE_RELATIVE_PATH);
const DEFAULT_OUTPUT_DIR = path.join(APP_ROOT, "output", "sena-publication-figures-human-concept");
const REQUIRED_STAGES = ["Plan", "Teach", "Reflect"] as const;
const REQUIRED_TABLES = ["people", "interactions", "utterances", "coded_segments", "codebook"] as const;
const BUILD_OPTIONS = {
  normalization: "max",
  bridgeWeightRule: "count",
  direction: "directed",
  undirectedSocial: false,
  temporal: { mode: "stage" },
  seed: 0
} as const;

type RequiredTable = (typeof REQUIRED_TABLES)[number];
type StageName = (typeof REQUIRED_STAGES)[number];
type RunIdentity = SenaModel["operatorDiagnostics"]["runIdentity"];
type Point = {
  x: number;
  y: number;
};
type FigureDataV1 = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.humanConceptFigureData;
  dataset: {
    source: typeof SOURCE_RELATIVE_PATH;
    version: string;
    sha256: string;
    synthetic: true;
  };
  configuration: SenaModel["options"];
  runIdentity: RunIdentity;
  dataContractAudit: SenaDataContractAudit;
  stageOrder: StageName[];
  publicationUse: {
    classification: "synthetic-demo-figure";
    layoutReady: true;
    empiricalClaimReady: false;
    existingPublicationGate: "not-invoked-by-standalone-figure-generator";
    limitation: "Method-illustration figures only; not cleared as empirical evidence.";
  };
  participants: Array<{
    id: string;
    label: string;
    role: string;
    initials: string;
  }>;
  codes: Array<{
    id: string;
    label: string;
    family: string;
    color: string;
    description: string;
  }>;
  overall: {
    S: SenaMatrixBlock;
    W: SenaMatrixBlock;
  };
  temporal: Array<{
    stage: StageName;
    windowId: string;
    runIdentity: RunIdentity;
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
    S: {
      minimumVisible: 1;
      maximumRaw: number;
    };
    W: {
      minimumVisible: 1;
      maximumRaw: number;
    };
  };
  interpretationGuardrails: string[];
};

function parseArgs(args: string[]) {
  let outputDir = DEFAULT_OUTPUT_DIR;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument !== "--output-dir") {
      throw new Error(`unknown argument: ${argument}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("--output-dir requires a value");
    }

    outputDir = path.resolve(APP_ROOT, value);
    index += 1;
  }

  return {
    inputPath: DEFAULT_INPUT,
    outputDir
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireTableRows(root: Record<string, unknown>, table: RequiredTable): Array<Record<string, unknown>> {
  const value = root[table];
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`source contract requires a non-empty ${table} array`);
  }

  return value.map((row, rowIndex) => {
    if (!isRecord(row)) {
      throw new Error(`source contract ${table}[${rowIndex}] must be a record`);
    }
    return row;
  });
}

function requireNonEmptyString(
  row: Record<string, unknown>,
  table: RequiredTable,
  rowIndex: number,
  field: string
): string {
  const value = row[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`source contract ${table}[${rowIndex}].${field} must be a non-empty string`);
  }
  return value;
}

function requireOptionalNonEmptyString(
  row: Record<string, unknown>,
  table: RequiredTable,
  rowIndex: number,
  field: string
): string | undefined {
  const value = row[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`source contract ${table}[${rowIndex}].${field} must be a non-empty string when provided`);
  }
  return value;
}

function requireFiniteNumber(
  row: Record<string, unknown>,
  table: RequiredTable,
  rowIndex: number,
  field: string
): number {
  const value = row[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`source contract ${table}[${rowIndex}].${field} must be a finite number`);
  }
  return value;
}

function requireOptionalFiniteNumber(
  row: Record<string, unknown>,
  table: RequiredTable,
  rowIndex: number,
  field: string,
  nonnegative = false
): number | undefined {
  const value = row[field];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || (nonnegative && value < 0)) {
    const constraint = nonnegative ? "finite nonnegative number" : "finite number";
    throw new Error(`source contract ${table}[${rowIndex}].${field} must be a ${constraint} when provided`);
  }
  return value;
}

function requireStage(row: Record<string, unknown>, table: "interactions" | "utterances" | "coded_segments", rowIndex: number) {
  const stage = row.stage;
  if (typeof stage !== "string" || !REQUIRED_STAGES.includes(stage as (typeof REQUIRED_STAGES)[number])) {
    throw new Error(`source contract ${table}[${rowIndex}].stage must be one of: ${REQUIRED_STAGES.join(", ")}`);
  }
  return stage;
}

export function loadDataset(sourcePath: string) {
  if (!existsSync(sourcePath)) {
    throw new Error(`source contract not found: ${sourcePath}`);
  }

  const sourceBytes = readFileSync(sourcePath);
  let parsed: unknown;

  try {
    parsed = JSON.parse(sourceBytes.toString("utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`source contract contains invalid JSON: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error("source contract must be a JSON object");
  }

  const root = parsed;
  const metadata = root.metadata;
  if (!isRecord(metadata)) {
    throw new Error("source contract metadata must be a record");
  }
  const datasetVersion = metadata.datasetVersion;
  if (typeof datasetVersion !== "string" || datasetVersion.trim().length === 0) {
    throw new Error("source contract metadata.datasetVersion must be a non-empty string");
  }

  const peopleRows = requireTableRows(root, "people");
  const interactionRows = requireTableRows(root, "interactions");
  const utteranceRows = requireTableRows(root, "utterances");
  const codedSegmentRows = requireTableRows(root, "coded_segments");
  const codebookRows = requireTableRows(root, "codebook");

  const people: SenaDataset["people"] = peopleRows.map((row, rowIndex) => {
    const initials = requireOptionalNonEmptyString(row, "people", rowIndex, "initials");
    return {
      id: requireNonEmptyString(row, "people", rowIndex, "id"),
      label: requireNonEmptyString(row, "people", rowIndex, "label"),
      role: requireNonEmptyString(row, "people", rowIndex, "role"),
      group: requireNonEmptyString(row, "people", rowIndex, "group"),
      ...(initials === undefined ? {} : { initials })
    };
  });

  const interactions: SenaDataset["interactions"] = interactionRows.map((row, rowIndex) => ({
    source: requireNonEmptyString(row, "interactions", rowIndex, "source"),
    target: requireNonEmptyString(row, "interactions", rowIndex, "target"),
    channel: requireNonEmptyString(row, "interactions", rowIndex, "channel"),
    stage: requireStage(row, "interactions", rowIndex),
    evidence: requireNonEmptyString(row, "interactions", rowIndex, "evidence"),
    weight: requireOptionalFiniteNumber(row, "interactions", rowIndex, "weight", true),
    turnIndex: requireOptionalFiniteNumber(row, "interactions", rowIndex, "turnIndex")
  }));

  const utterances: SenaDataset["utterances"] = utteranceRows.map((row, rowIndex) => ({
    id: requireNonEmptyString(row, "utterances", rowIndex, "id"),
    personId: requireNonEmptyString(row, "utterances", rowIndex, "personId"),
    unitId: requireNonEmptyString(row, "utterances", rowIndex, "unitId"),
    stanzaId: requireNonEmptyString(row, "utterances", rowIndex, "stanzaId"),
    stage: requireStage(row, "utterances", rowIndex),
    turnIndex: requireFiniteNumber(row, "utterances", rowIndex, "turnIndex"),
    text: requireNonEmptyString(row, "utterances", rowIndex, "text"),
    timestamp: requireNonEmptyString(row, "utterances", rowIndex, "timestamp")
  }));

  const codedSegments: SenaDataset["coded_segments"] = codedSegmentRows.map((row, rowIndex) => {
    const codes = row.codes;
    if (!Array.isArray(codes) || codes.length === 0 || !codes.every((code) => typeof code === "string" && code.trim().length > 0)) {
      throw new Error(`source contract coded_segments[${rowIndex}].codes must be a non-empty array of non-empty strings`);
    }

    const targetPersonIds = row.targetPersonIds;
    let validatedTargetPersonIds: string[] | undefined;
    if (targetPersonIds !== undefined) {
      if (!Array.isArray(targetPersonIds) || !targetPersonIds.every((personId) => typeof personId === "string" && personId.trim().length > 0)) {
        throw new Error(`source contract coded_segments[${rowIndex}].targetPersonIds must be an array of non-empty strings when provided`);
      }
      validatedTargetPersonIds = [...targetPersonIds] as string[];
    }

    return {
      segmentId: requireNonEmptyString(row, "coded_segments", rowIndex, "segmentId"),
      utteranceId: requireNonEmptyString(row, "coded_segments", rowIndex, "utteranceId"),
      personId: requireNonEmptyString(row, "coded_segments", rowIndex, "personId"),
      unitId: requireNonEmptyString(row, "coded_segments", rowIndex, "unitId"),
      stanzaId: requireNonEmptyString(row, "coded_segments", rowIndex, "stanzaId"),
      stage: requireStage(row, "coded_segments", rowIndex),
      turnIndex: requireFiniteNumber(row, "coded_segments", rowIndex, "turnIndex"),
      text: requireNonEmptyString(row, "coded_segments", rowIndex, "text"),
      codes: [...codes] as string[],
      confidence: requireOptionalFiniteNumber(row, "coded_segments", rowIndex, "confidence"),
      ...(validatedTargetPersonIds === undefined ? {} : { targetPersonIds: validatedTargetPersonIds })
    };
  });

  const codebook: SenaDataset["codebook"] = codebookRows.map((row, rowIndex) => {
    const color = requireNonEmptyString(row, "codebook", rowIndex, "color");
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      throw new Error(`source contract codebook[${rowIndex}].color must be a six-digit hexadecimal color (#RRGGBB)`);
    }

    return {
      id: requireNonEmptyString(row, "codebook", rowIndex, "id"),
      label: requireNonEmptyString(row, "codebook", rowIndex, "label"),
      family: requireNonEmptyString(row, "codebook", rowIndex, "family"),
      description: requireNonEmptyString(row, "codebook", rowIndex, "description"),
      color
    };
  });

  const stageBearingTables = [
    { table: "interactions", stages: interactions.map((row) => row.stage) },
    { table: "utterances", stages: utterances.map((row) => row.stage) },
    { table: "coded_segments", stages: codedSegments.map((row) => row.stage) }
  ] as const;
  for (const { table, stages } of stageBearingTables) {
    const stageSet = new Set(stages);
    for (const requiredStage of REQUIRED_STAGES) {
      if (!stageSet.has(requiredStage)) {
        throw new Error(`source contract ${table} is missing required stage ${requiredStage}`);
      }
    }
  }

  let warnings: string[] | undefined;
  if (root.warnings !== undefined) {
    if (!Array.isArray(root.warnings)) {
      throw new Error("source contract warnings must be an array of non-empty strings when provided");
    }
    warnings = root.warnings.map((warning, warningIndex) => {
      if (typeof warning !== "string" || warning.trim().length === 0) {
        throw new Error(`source contract warnings[${warningIndex}] must be a non-empty string`);
      }
      return warning;
    });
  }

  const dataset: SenaDataset = {
    // The audit below owns validation of consent, retention, pseudonymization, and codebook governance metadata.
    metadata: metadata as SenaDataset["metadata"],
    people,
    interactions,
    utterances,
    coded_segments: codedSegments,
    codebook,
    warnings
  };
  const dataContractAudit = buildSenaDataContractAudit(dataset);
  if (dataContractAudit.status !== "valid") {
    const failedItemIds = dataContractAudit.items
      .filter((item) => item.status !== "pass")
      .map((item) => item.id);
    throw new Error(`source contract data audit failed: ${failedItemIds.join(", ")}`);
  }

  return {
    dataset,
    sourceBytes,
    dataContractAudit,
    datasetVersion,
    sourceSha256: createHash("sha256").update(sourceBytes).digest("hex")
  };
}

export function assertMatrixBlock(name: string, block: SenaMatrixBlock, expectedLabels: string[]) {
  if (
    block.labels.length !== expectedLabels.length ||
    block.labels.some((label, index) => label !== expectedLabels[index])
  ) {
    throw new Error(
      `${name} matrix labels must exactly match expected labels; expected ${JSON.stringify(expectedLabels)}, received ${JSON.stringify(block.labels)}`
    );
  }

  const size = block.labels.length;
  if (size === 0) {
    throw new Error(`${name} matrix requires non-empty labels`);
  }

  for (const [matrixName, matrix] of [
    ["raw", block.raw],
    ["normalized", block.normalized]
  ] as const) {
    if (matrix.length !== size || matrix.some((row) => row.length !== size)) {
      throw new Error(`${name}.${matrixName} matrix dimensions must match ${size} labels`);
    }
    if (matrix.some((row) => row.some((value) => !Number.isFinite(value)))) {
      throw new Error(`${name}.${matrixName} matrix values must be finite`);
    }
  }
}

function resolveStageWindows(model: SenaModel) {
  if (model.temporal.settings.mode !== "stage") {
    throw new Error(`expected stage temporal mode, received ${model.temporal.settings.mode}`);
  }

  return REQUIRED_STAGES.map((stage) => {
    const window = model.temporal.windows.find(
      (candidate) => candidate.mode === "stage" && candidate.label === stage
    );
    if (!window) {
      throw new Error(`missing exact stage temporal window: ${stage}`);
    }
    return { stage, window };
  });
}

function maxNonZero(matrix: number[][], layer: string) {
  const maximum = matrix.reduce(
    (currentMaximum, row) => row.reduce((rowMaximum, value) => Math.max(rowMaximum, value), currentMaximum),
    Number.NEGATIVE_INFINITY
  );
  if (maximum <= 0) {
    throw new Error(`${layer} matrix requires at least one positive value`);
  }
  return maximum;
}

function buildFigureData({
  dataset,
  dataContractAudit,
  datasetVersion,
  sourceSha256
}: ReturnType<typeof loadDataset>): FigureDataV1 {
  const overallModel = buildSenaModel(dataset, BUILD_OPTIONS);
  assertMatrixBlock("overall.S", overallModel.matrices.S, dataset.people.map(({ label }) => label));
  assertMatrixBlock("overall.W", overallModel.matrices.W, dataset.codebook.map(({ label }) => label));

  const temporal = resolveStageWindows(overallModel).map(({ stage, window }) => {
    const scopedDataset = scopeSenaDatasetToWindow(dataset, window);
    const scopedModel = buildSenaModel(scopedDataset, BUILD_OPTIONS);
    assertMatrixBlock(`${stage}.S`, scopedModel.matrices.S, scopedDataset.people.map(({ label }) => label));
    assertMatrixBlock(`${stage}.W`, scopedModel.matrices.W, scopedDataset.codebook.map(({ label }) => label));

    return {
      stage,
      windowId: window.id,
      runIdentity: scopedModel.operatorDiagnostics.runIdentity,
      counts: {
        people: scopedDataset.people.length,
        codes: scopedDataset.codebook.length,
        interactions: scopedDataset.interactions.length,
        utterances: scopedDataset.utterances.length,
        codedSegments: scopedDataset.coded_segments.length
      },
      S: scopedModel.matrices.S,
      W: scopedModel.matrices.W
    };
  });

  return createSenaSchemaPayload("humanConceptFigureData", {
    dataset: {
      source: SOURCE_RELATIVE_PATH,
      version: datasetVersion,
      sha256: sourceSha256,
      synthetic: true as const
    },
    configuration: overallModel.options,
    runIdentity: overallModel.operatorDiagnostics.runIdentity,
    dataContractAudit,
    stageOrder: [...REQUIRED_STAGES],
    publicationUse: {
      classification: "synthetic-demo-figure" as const,
      layoutReady: true as const,
      empiricalClaimReady: false as const,
      existingPublicationGate: "not-invoked-by-standalone-figure-generator" as const,
      limitation: "Method-illustration figures only; not cleared as empirical evidence." as const
    },
    participants: dataset.people.map((person) => ({
      id: person.id,
      label: person.label,
      role: person.role,
      initials: person.initials ?? person.label.slice(0, 2).toUpperCase()
    })),
    codes: dataset.codebook.map((code) => ({
      id: code.id,
      label: code.label,
      family: code.family,
      color: code.color,
      description: code.description
    })),
    overall: {
      S: overallModel.matrices.S,
      W: overallModel.matrices.W
    },
    temporal,
    scales: {
      S: {
        minimumVisible: 1 as const,
        maximumRaw: maxNonZero(overallModel.matrices.S.raw, "S")
      },
      W: {
        minimumVisible: 1 as const,
        maximumRaw: maxNonZero(overallModel.matrices.W.raw, "W")
      }
    },
    interpretationGuardrails: [
      "S encodes observed directed interaction weights; it is not a causal influence model.",
      "W encodes code co-occurrence within unit-scoped stanzas; it is not semantic or causal direction.",
      "The bundled lesson-study dataset is synthetic and supports demonstration, not population inference."
    ]
  }) satisfies FigureDataV1;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error(`SVG numeric value must be finite, received ${value}`);
  }
  const rounded = Number(value.toFixed(3));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function widthFor(weight: number, maximumWeight: number, maximumWidth: number) {
  if (!Number.isFinite(weight) || weight < 0) {
    throw new Error(`edge weight must be a finite nonnegative number, received ${weight}`);
  }
  if (!Number.isFinite(maximumWeight) || maximumWeight <= 0) {
    throw new Error(`maximum edge weight must be positive, received ${maximumWeight}`);
  }
  if (!Number.isFinite(maximumWidth) || maximumWidth <= 0) {
    throw new Error(`maximum edge width must be positive, received ${maximumWidth}`);
  }
  return maximumWidth * (weight / maximumWeight);
}

function opacityFor(weight: number, maximumWeight: number) {
  if (weight === 0) return 0;
  const ratio = Math.min(weight / maximumWeight, 1);
  return 0.45 + ratio * 0.5;
}

function circularLayout(count: number, center: Point, radius: number, startAngle = -Math.PI / 2) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`circular layout requires a positive integer count, received ${count}`);
  }
  return Array.from({ length: count }, (_, index) => {
    const angle = startAngle + (index * Math.PI * 2) / count;
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    };
  });
}

function svgShell({
  figureId,
  width,
  height,
  title,
  description,
  body
}: {
  figureId: string;
  width: number;
  height: number;
  title: string;
  description: string;
  body: string;
}) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" data-figure-id="${escapeXml(figureId)}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" font-family="Arial, Helvetica, sans-serif">`,
    `<title>${escapeXml(title)}</title>`,
    `<desc>${escapeXml(description)}</desc>`,
    `<rect data-background="opaque-white" x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`,
    body,
    "</svg>",
    ""
  ].join("\n");
}

function assertSvgContent(figureId: string, svg: string, requiredText: string[]) {
  if (!svg.startsWith("<svg ") || !svg.endsWith("</svg>\n")) {
    throw new Error(`${figureId} must be a complete newline-terminated SVG document`);
  }
  if (!svg.includes(`data-figure-id="${escapeXml(figureId)}"`)) {
    throw new Error(`${figureId} SVG root is missing its figure identifier`);
  }
  if (!svg.includes('data-background="opaque-white"')) {
    throw new Error(`${figureId} SVG requires an opaque white background`);
  }
  if (!svg.includes('data-legend="')) {
    throw new Error(`${figureId} SVG requires a semantic legend`);
  }

  for (const text of requiredText) {
    const escapedText = escapeXml(text);
    if (!svg.includes(text) && !svg.includes(escapedText)) {
      throw new Error(`${figureId} SVG is missing required content: ${text}`);
    }
  }
}

function clipToRectangleBoundary(center: Point, toward: Point, halfWidth: number, halfHeight: number) {
  const deltaX = toward.x - center.x;
  const deltaY = toward.y - center.y;
  if (deltaX === 0 && deltaY === 0) return center;

  const horizontalScale = deltaX === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(deltaX);
  const verticalScale = deltaY === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(deltaY);
  const scale = Math.min(horizontalScale, verticalScale);
  return {
    x: center.x + deltaX * scale,
    y: center.y + deltaY * scale
  };
}

function quadraticControlPoint(source: Point, target: Point, offset: number) {
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0) {
    throw new Error("directed SVG edge requires distinct source and target positions");
  }
  return {
    x: (source.x + target.x) / 2 + (-deltaY / distance) * offset,
    y: (source.y + target.y) / 2 + (deltaX / distance) * offset
  };
}

function pointOnQuadratic(start: Point, control: Point, end: Point, progress: number) {
  const remainder = 1 - progress;
  return {
    x: remainder * remainder * start.x + 2 * remainder * progress * control.x + progress * progress * end.x,
    y: remainder * remainder * start.y + 2 * remainder * progress * control.y + progress * progress * end.y
  };
}

function renderOverallHumanHumanFigure(figureData: FigureDataV1) {
  const figureId = "figure-1-human-human-overall";
  const title = "Figure 1. Overall Human–Human Network";
  const subtitle = "Directed Human–Human interaction network (S), full lesson-study cycle";
  const width = 1800;
  const height = 1200;
  const center = { x: 900, y: 620 };
  const positions = circularLayout(figureData.participants.length, center, 410);
  const nodeWidth = 420;
  const nodeHeight = 132;
  const edgeElements: string[] = [];

  for (let sourceIndex = 0; sourceIndex < figureData.overall.S.raw.length; sourceIndex += 1) {
    for (let targetIndex = 0; targetIndex < figureData.overall.S.raw[sourceIndex].length; targetIndex += 1) {
      const weight = figureData.overall.S.raw[sourceIndex][targetIndex];
      if (weight === 0) continue;

      const source = positions[sourceIndex];
      const target = positions[targetIndex];
      const reciprocal = figureData.overall.S.raw[targetIndex]?.[sourceIndex] !== 0;
      const curveOffset = reciprocal ? 104 : (sourceIndex * figureData.participants.length + targetIndex) % 2 === 0 ? 52 : -52;
      const control = quadraticControlPoint(source, target, curveOffset);
      const start = clipToRectangleBoundary(source, control, nodeWidth / 2, nodeHeight / 2);
      const end = clipToRectangleBoundary(target, control, nodeWidth / 2, nodeHeight / 2);
      const labelPoint = pointOnQuadratic(start, control, end, 0.5);
      const strokeWidth = formatNumber(widthFor(weight, 7, 18));
      const sourceId = figureData.participants[sourceIndex].id;
      const targetId = figureData.participants[targetIndex].id;

      edgeElements.push(
        `<path data-layer="S" data-edge-id="S-${escapeXml(sourceId)}-${escapeXml(targetId)}" data-weight="${formatNumber(weight)}" data-stroke-width="${strokeWidth}" d="M ${formatNumber(start.x)} ${formatNumber(start.y)} Q ${formatNumber(control.x)} ${formatNumber(control.y)} ${formatNumber(end.x)} ${formatNumber(end.y)}" fill="none" stroke="#2563eb" stroke-width="${strokeWidth}" stroke-opacity="${formatNumber(opacityFor(weight, 7))}" stroke-linecap="round" marker-end="url(#s-arrow)"/>`,
        `<text x="${formatNumber(labelPoint.x)}" y="${formatNumber(labelPoint.y + 12)}" text-anchor="middle" font-size="34" font-weight="700" fill="#1e3a8a" stroke="#ffffff" stroke-width="8" paint-order="stroke" stroke-linejoin="round">${formatNumber(weight)}</text>`
      );
    }
  }

  const nodeElements = figureData.participants.flatMap((participant, index) => {
    const position = positions[index];
    return [
      `<rect data-node-kind="human" data-node-id="${escapeXml(participant.id)}" x="${formatNumber(position.x - nodeWidth / 2)}" y="${formatNumber(position.y - nodeHeight / 2)}" width="${nodeWidth}" height="${nodeHeight}" rx="28" fill="#eff6ff" stroke="#0f3f83" stroke-width="6"/>`,
      `<text x="${formatNumber(position.x)}" y="${formatNumber(position.y - 10)}" text-anchor="middle" font-size="40" font-weight="700" fill="#0f172a">${escapeXml(participant.label)}</text>`,
      `<text x="${formatNumber(position.x)}" y="${formatNumber(position.y + 40)}" text-anchor="middle" font-size="34" fill="#334155">${escapeXml(participant.role)}</text>`
    ];
  });

  const body = [
    '<defs><marker id="s-arrow" viewBox="0 0 12 12" refX="10.5" refY="6" markerWidth="24" markerHeight="24" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 1 L 11 6 L 0 11 Z" fill="#2563eb"/></marker></defs>',
    '<text x="900" y="62" text-anchor="middle" font-size="48" font-weight="700" fill="#0f172a">Figure 1. Overall Human–Human Network</text>',
    `<text x="900" y="112" text-anchor="middle" font-size="36" fill="#334155">${escapeXml(subtitle)}</text>`,
    '<g data-edge-set="S-overall">',
    ...edgeElements,
    "</g>",
    '<g data-node-set="human-overall">',
    ...nodeElements,
    "</g>",
    '<g data-legend="S-encoding">',
    '<rect x="38" y="900" width="620" height="270" rx="24" fill="#ffffff" stroke="#94a3b8" stroke-width="4"/>',
    '<text x="72" y="948" font-size="36" font-weight="700" fill="#0f172a">S encoding</text>',
    '<text x="72" y="990" font-size="34" fill="#334155">arrow = observed direction</text>',
    '<path data-scale-sample="S-1" stroke-width="2.571" d="M 82 1025 L 250 1025" fill="none" stroke="#2563eb" marker-end="url(#s-arrow)"/>',
    '<text x="286" y="1037" font-size="34" fill="#0f172a">raw weight 1</text>',
    '<path data-scale-sample="S-4" stroke-width="10.286" d="M 82 1080 L 250 1080" fill="none" stroke="#2563eb" marker-end="url(#s-arrow)"/>',
    '<text x="286" y="1092" font-size="34" fill="#0f172a">raw weight 4</text>',
    '<path data-scale-sample="S-7" stroke-width="18" d="M 82 1135 L 250 1135" fill="none" stroke="#2563eb" marker-end="url(#s-arrow)"/>',
    '<text x="286" y="1147" font-size="34" fill="#0f172a">raw weight 7</text>',
    "</g>"
  ].join("\n");
  const svg = svgShell({
    figureId,
    width,
    height,
    title,
    description: "Overall directed human-to-human interaction weights. Arrowheads show observed source-to-target direction; edge labels show raw weights.",
    body
  });
  assertSvgContent(figureId, svg, [
    title,
    subtitle,
    ...figureData.participants.flatMap(({ label, role }) => [label, role])
  ]);
  return svg;
}

function renderOverallConceptConceptFigure(figureData: FigureDataV1) {
  const figureId = "figure-2-concept-concept-overall";
  const title = "Figure 2. Overall Concept–Concept Network";
  const subtitle = "Concept–Concept co-occurrence network (W), full lesson-study cycle";
  const width = 1800;
  const height = 1200;
  const center = { x: 900, y: 620 };
  const startAngle = -Math.PI / 2 + Math.PI / 7;
  const positions = circularLayout(figureData.codes.length, center, 390, startAngle);
  const leaderStarts = circularLayout(figureData.codes.length, center, 448, startAngle);
  const leaderEnds = circularLayout(figureData.codes.length, center, 476, startAngle);
  const labelPositions = circularLayout(figureData.codes.length, center, 500, startAngle);
  const edgeElements: string[] = [];

  for (let leftIndex = 0; leftIndex < figureData.overall.W.raw.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < figureData.overall.W.raw[leftIndex].length; rightIndex += 1) {
      const weight = figureData.overall.W.raw[leftIndex][rightIndex];
      if (weight === 0) continue;

      const leftCodeId = figureData.codes[leftIndex].id;
      const rightCodeId = figureData.codes[rightIndex].id;
      const strokeWidth = formatNumber(widthFor(weight, 3, 15));
      edgeElements.push(
        `<path data-layer="W" data-edge-id="W-${escapeXml(leftCodeId)}-${escapeXml(rightCodeId)}" data-weight="${formatNumber(weight)}" data-stroke-width="${strokeWidth}" d="M ${formatNumber(positions[leftIndex].x)} ${formatNumber(positions[leftIndex].y)} L ${formatNumber(positions[rightIndex].x)} ${formatNumber(positions[rightIndex].y)}" fill="none" stroke="#7e22ce" stroke-width="${strokeWidth}" stroke-opacity="${formatNumber(opacityFor(weight, 3))}" stroke-dasharray="none" stroke-linecap="round"/>`
      );
    }
  }

  const nodeElements = figureData.codes.flatMap((code, index) => {
    const position = positions[index];
    const labelPosition = labelPositions[index];
    const radialDirection = labelPosition.x - center.x;
    const textAnchor = Math.abs(radialDirection) < 50 ? "middle" : radialDirection > 0 ? "start" : "end";
    return [
      `<line data-leader-for="${escapeXml(code.id)}" x1="${formatNumber(leaderStarts[index].x)}" y1="${formatNumber(leaderStarts[index].y)}" x2="${formatNumber(leaderEnds[index].x)}" y2="${formatNumber(leaderEnds[index].y)}" stroke="#64748b" stroke-width="3"/>`,
      `<circle data-node-decoration="concept-keyline" cx="${formatNumber(position.x)}" cy="${formatNumber(position.y)}" r="58" fill="${escapeXml(code.color)}" stroke="#0f172a" stroke-width="6"/>`,
      `<circle data-node-kind="concept" data-node-id="${escapeXml(code.id)}" cx="${formatNumber(position.x)}" cy="${formatNumber(position.y)}" r="52" fill="${escapeXml(code.color)}" stroke="#ffffff" stroke-width="6"/>`,
      `<text x="${formatNumber(labelPosition.x)}" y="${formatNumber(labelPosition.y + 12)}" text-anchor="${textAnchor}" font-size="36" font-weight="700" fill="#0f172a">${escapeXml(code.label)}</text>`
    ];
  });

  const body = [
    '<text x="900" y="62" text-anchor="middle" font-size="48" font-weight="700" fill="#0f172a">Figure 2. Overall Concept–Concept Network</text>',
    `<text x="900" y="112" text-anchor="middle" font-size="36" fill="#334155">${escapeXml(subtitle)}</text>`,
    '<g data-edge-set="W-overall">',
    ...edgeElements,
    "</g>",
    '<g data-node-set="concept-overall">',
    ...nodeElements,
    "</g>",
    '<g data-legend="W-encoding">',
    '<desc>W encoding defines unit-scoped stanza co-occurrence; undirected; no causal direction.</desc>',
    '<rect x="20" y="735" width="340" height="425" rx="24" fill="#ffffff" stroke="#94a3b8" stroke-width="4"/>',
    '<text x="48" y="775" font-size="36" font-weight="700" fill="#0f172a">W encoding</text>',
    '<text x="48" y="817" font-size="34" fill="#334155">unit-scoped stanza</text>',
    '<text x="48" y="857" font-size="34" fill="#334155">co-occurrence</text>',
    '<text x="48" y="897" font-size="34" fill="#334155">undirected; no</text>',
    '<text x="48" y="937" font-size="34" fill="#334155">causal direction</text>',
    '<path data-scale-sample="W-1" stroke-width="5" d="M 54 980 L 166 980" fill="none" stroke="#7e22ce" stroke-opacity="0.617" stroke-dasharray="none"/>',
    '<text x="194" y="992" font-size="34" fill="#0f172a">raw 1</text>',
    '<path data-scale-sample="W-2" stroke-width="10" d="M 54 1040 L 166 1040" fill="none" stroke="#7e22ce" stroke-opacity="0.783" stroke-dasharray="none"/>',
    '<text x="194" y="1052" font-size="34" fill="#0f172a">raw 2</text>',
    '<path data-scale-sample="W-3" stroke-width="15" d="M 54 1100 L 166 1100" fill="none" stroke="#7e22ce" stroke-opacity="0.95" stroke-dasharray="none"/>',
    '<text x="194" y="1112" font-size="34" fill="#0f172a">raw 3</text>',
    "</g>"
  ].join("\n");
  const svg = svgShell({
    figureId,
    width,
    height,
    title,
    description: "Overall undirected code co-occurrence within unit-scoped stanzas. W records association, not causal or semantic direction.",
    body
  });
  assertSvgContent(figureId, svg, [title, subtitle, ...figureData.codes.map(({ label }) => label)]);
  return svg;
}

function renderTemporalPairedFigure(figureData: FigureDataV1) {
  const figureId = "figure-3-temporal-paired-small-multiples";
  const title = "Figure 3. Plan–Teach–Reflect S and W Networks";
  const subtitle = "Stage-scoped Human–Human and Concept–Concept networks with fixed positions and shared global scales";
  const width = 2400;
  const height = 1440;
  const outerMargin = 90;
  const titleBand = 150;
  const footerBand = 150;
  const horizontalGap = 36;
  const verticalGap = 44;
  const panelWidth = (width - outerMargin * 2 - horizontalGap * 2) / 3;
  const panelHeight =
    (height - outerMargin * 2 - titleBand - footerBand - verticalGap) / 2;
  const panelTop = outerMargin + titleBand;
  const footerTop = height - outerMargin - footerBand;
  const participantLayout = circularLayout(figureData.participants.length, { x: 0.5, y: 0.62 }, 0.27).map(
    ({ x, y }) => ({ x: Number(formatNumber(x)), y: Number(formatNumber(y)) })
  );
  const conceptLayout = circularLayout(
    figureData.codes.length,
    { x: 0.5, y: 0.55 },
    0.18,
    -Math.PI / 2 + Math.PI / figureData.codes.length
  ).map(({ x, y }) => ({ x: Number(formatNumber(x)), y: Number(formatNumber(y)) }));
  const conceptLabelSlots = [
    { name: "right-top", x: 0.98, y: 0.37, textAnchor: "end", leaderX: 0.73, leaderY: 0.37 },
    { name: "right-middle", x: 0.98, y: 0.55, textAnchor: "end", leaderX: 0.73, leaderY: 0.55 },
    { name: "right-bottom", x: 0.98, y: 0.73, textAnchor: "end", leaderX: 0.73, leaderY: 0.73 },
    { name: "bottom-center", x: 0.5, y: 0.91, textAnchor: "middle", leaderX: 0.5, leaderY: 0.82 },
    { name: "left-bottom", x: 0.02, y: 0.73, textAnchor: "start", leaderX: 0.27, leaderY: 0.73 },
    { name: "left-middle", x: 0.02, y: 0.55, textAnchor: "start", leaderX: 0.27, leaderY: 0.55 },
    { name: "left-top", x: 0.02, y: 0.37, textAnchor: "start", leaderX: 0.27, leaderY: 0.37 }
  ] as const;

  const panelX = (stageIndex: number) => outerMargin + stageIndex * (panelWidth + horizontalGap);
  const panelPoint = (panelLeft: number, panelY: number, point: Point) => ({
    x: panelLeft + point.x * panelWidth,
    y: panelY + point.y * panelHeight
  });
  const stageCounts = (stageData: FigureDataV1["temporal"][number]) =>
    `Interactions ${stageData.counts.interactions} · Utterances ${stageData.counts.utterances} · Coded ${stageData.counts.codedSegments}`;

  const renderSPanel = (stageData: FigureDataV1["temporal"][number], stageIndex: number) => {
    const left = panelX(stageIndex);
    const top = panelTop;
    const positions = participantLayout.map((point) => panelPoint(left, top, point));
    const activeIndices = new Set<number>();
    const edgeElements: string[] = [];
    const nodeWidth = 208;
    const nodeHeight = 66;

    for (let sourceIndex = 0; sourceIndex < stageData.S.raw.length; sourceIndex += 1) {
      for (let targetIndex = 0; targetIndex < stageData.S.raw[sourceIndex].length; targetIndex += 1) {
        const weight = stageData.S.raw[sourceIndex][targetIndex];
        if (weight === 0) continue;

        activeIndices.add(sourceIndex);
        activeIndices.add(targetIndex);
        const source = positions[sourceIndex];
        const target = positions[targetIndex];
        const reciprocal = stageData.S.raw[targetIndex]?.[sourceIndex] !== 0;
        const curveOffset = reciprocal
          ? 38
          : (sourceIndex * figureData.participants.length + targetIndex) % 2 === 0
            ? 20
            : -20;
        const control = quadraticControlPoint(source, target, curveOffset);
        const start = clipToRectangleBoundary(source, control, nodeWidth / 2, nodeHeight / 2);
        const end = clipToRectangleBoundary(target, control, nodeWidth / 2, nodeHeight / 2);
        const strokeWidth = formatNumber(widthFor(weight, figureData.scales.S.maximumRaw, 18));
        const sourceId = figureData.participants[sourceIndex].id;
        const targetId = figureData.participants[targetIndex].id;
        const temporalEdgeId = `${stageData.stage}:S:${sourceId}:${targetId}`;

        edgeElements.push(
          `<path data-layer="S" data-temporal-edge-id="${escapeXml(temporalEdgeId)}" data-weight="${formatNumber(weight)}" data-stroke-width="${strokeWidth}" d="M ${formatNumber(start.x)} ${formatNumber(start.y)} Q ${formatNumber(control.x)} ${formatNumber(control.y)} ${formatNumber(end.x)} ${formatNumber(end.y)}" fill="none" stroke="#2563eb" stroke-width="${strokeWidth}" stroke-opacity="${formatNumber(opacityFor(weight, figureData.scales.S.maximumRaw))}" stroke-linecap="round" marker-end="url(#s-arrow-temporal)"/>`
        );
      }
    }

    const nodeElements = figureData.participants.flatMap((participant, participantIndex) => {
      const position = positions[participantIndex];
      const normalizedPosition = participantLayout[participantIndex];
      const active = activeIndices.has(participantIndex);
      const opacity = active ? "1" : "0.28";
      const layoutCoordinate = `human:${participant.id}:${formatNumber(normalizedPosition.x)}:${formatNumber(normalizedPosition.y)}`;
      return [
        `<rect data-node-kind="human" data-node-id="${escapeXml(participant.id)}" data-layout-coordinate="${escapeXml(layoutCoordinate)}" data-active="${active}" opacity="${opacity}" x="${formatNumber(position.x - nodeWidth / 2)}" y="${formatNumber(position.y - nodeHeight / 2)}" width="${nodeWidth}" height="${nodeHeight}" rx="18" fill="#eff6ff" stroke="#0f3f83" stroke-width="4"/>`,
        `<text x="${formatNumber(position.x)}" y="${formatNumber(position.y + 12)}" text-anchor="middle" font-size="34" font-weight="700" fill="#0f172a" opacity="${opacity}">${escapeXml(participant.label)}</text>`
      ];
    });

    return [
      `<g data-panel-id="${escapeXml(stageData.stage)}-S">`,
      `<rect x="${formatNumber(left)}" y="${formatNumber(top)}" width="${formatNumber(panelWidth)}" height="${formatNumber(panelHeight)}" rx="18" fill="#ffffff" stroke="#cbd5e1" stroke-width="4"/>`,
      `<text x="${formatNumber(left + panelWidth / 2)}" y="${formatNumber(top + 42)}" text-anchor="middle" font-size="38" font-weight="700" fill="#0f172a">${escapeXml(stageData.stage)} · Human–Human S</text>`,
      `<text x="${formatNumber(left + panelWidth / 2)}" y="${formatNumber(top + 82)}" text-anchor="middle" font-size="34" fill="#475569">${escapeXml(stageCounts(stageData))}</text>`,
      '<g data-temporal-edge-set="S">',
      ...edgeElements,
      "</g>",
      '<g data-temporal-node-set="human">',
      ...nodeElements,
      "</g>",
      "</g>"
    ].join("\n");
  };

  const renderWPanel = (stageData: FigureDataV1["temporal"][number], stageIndex: number) => {
    const left = panelX(stageIndex);
    const top = panelTop + panelHeight + verticalGap;
    const positions = conceptLayout.map((point) => panelPoint(left, top, point));
    const labelPositions = conceptLabelSlots.map((slot) => panelPoint(left, top, slot));
    const leaderPositions = conceptLabelSlots.map((slot) =>
      panelPoint(left, top, { x: slot.leaderX, y: slot.leaderY })
    );
    const activeIndices = new Set<number>();
    const edgeElements: string[] = [];

    for (let leftIndex = 0; leftIndex < stageData.W.raw.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < stageData.W.raw[leftIndex].length; rightIndex += 1) {
        const weight = stageData.W.raw[leftIndex][rightIndex];
        if (weight === 0) continue;

        activeIndices.add(leftIndex);
        activeIndices.add(rightIndex);
        const leftCodeId = figureData.codes[leftIndex].id;
        const rightCodeId = figureData.codes[rightIndex].id;
        const strokeWidth = formatNumber(widthFor(weight, figureData.scales.W.maximumRaw, 15));
        const temporalEdgeId = `${stageData.stage}:W:${leftCodeId}:${rightCodeId}`;
        edgeElements.push(
          `<path data-layer="W" data-temporal-edge-id="${escapeXml(temporalEdgeId)}" data-weight="${formatNumber(weight)}" data-stroke-width="${strokeWidth}" d="M ${formatNumber(positions[leftIndex].x)} ${formatNumber(positions[leftIndex].y)} L ${formatNumber(positions[rightIndex].x)} ${formatNumber(positions[rightIndex].y)}" fill="none" stroke="#7e22ce" stroke-width="${strokeWidth}" stroke-opacity="${formatNumber(opacityFor(weight, figureData.scales.W.maximumRaw))}" stroke-dasharray="none" stroke-linecap="round"/>`
        );
      }
    }

    const leaderElements = figureData.codes.map((code, codeIndex) => {
      const position = positions[codeIndex];
      const leaderPosition = leaderPositions[codeIndex];
      const active = activeIndices.has(codeIndex);
      return `<line data-leader-for="${escapeXml(code.id)}" x1="${formatNumber(position.x)}" y1="${formatNumber(position.y)}" x2="${formatNumber(leaderPosition.x)}" y2="${formatNumber(leaderPosition.y)}" stroke="#94a3b8" stroke-width="3" opacity="${active ? "1" : "0.28"}"/>`;
    });

    const nodeElements = figureData.codes.flatMap((code, codeIndex) => {
      const position = positions[codeIndex];
      const labelPosition = labelPositions[codeIndex];
      const labelSlot = conceptLabelSlots[codeIndex];
      const normalizedPosition = conceptLayout[codeIndex];
      const active = activeIndices.has(codeIndex);
      const opacity = active ? "1" : "0.28";
      const layoutCoordinate = `concept:${code.id}:${formatNumber(normalizedPosition.x)}:${formatNumber(normalizedPosition.y)}`;
      return [
        `<circle data-node-kind="concept" data-node-id="${escapeXml(code.id)}" data-layout-coordinate="${escapeXml(layoutCoordinate)}" data-active="${active}" opacity="${opacity}" cx="${formatNumber(position.x)}" cy="${formatNumber(position.y)}" r="24" fill="${escapeXml(code.color)}" stroke="#0f172a" stroke-width="4"/>`,
        `<text data-concept-label-slot="${escapeXml(`${code.id}:${labelSlot.name}`)}" x="${formatNumber(labelPosition.x)}" y="${formatNumber(labelPosition.y + 12)}" text-anchor="${labelSlot.textAnchor}" font-size="34" font-weight="700" fill="#0f172a" stroke="#ffffff" stroke-width="6" paint-order="stroke" stroke-linejoin="round" opacity="${opacity}">${escapeXml(code.label)}</text>`
      ];
    });

    return [
      `<g data-panel-id="${escapeXml(stageData.stage)}-W">`,
      `<rect x="${formatNumber(left)}" y="${formatNumber(top)}" width="${formatNumber(panelWidth)}" height="${formatNumber(panelHeight)}" rx="18" fill="#ffffff" stroke="#cbd5e1" stroke-width="4"/>`,
      `<text x="${formatNumber(left + panelWidth / 2)}" y="${formatNumber(top + 42)}" text-anchor="middle" font-size="38" font-weight="700" fill="#0f172a">${escapeXml(stageData.stage)} · Concept–Concept W</text>`,
      `<text x="${formatNumber(left + panelWidth / 2)}" y="${formatNumber(top + 82)}" text-anchor="middle" font-size="34" fill="#475569">${escapeXml(stageCounts(stageData))}</text>`,
      '<g data-temporal-edge-set="W">',
      ...edgeElements,
      "</g>",
      '<g data-concept-label-leaders="stable-rails">',
      ...leaderElements,
      "</g>",
      '<g data-temporal-node-set="concept">',
      ...nodeElements,
      "</g>",
      "</g>"
    ].join("\n");
  };

  const body = [
    '<defs><marker id="s-arrow-temporal" viewBox="0 0 12 12" refX="10.5" refY="6" markerWidth="20" markerHeight="20" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 1 L 11 6 L 0 11 Z" fill="#2563eb"/></marker></defs>',
    `<text x="${width / 2}" y="132" text-anchor="middle" font-size="52" font-weight="700" fill="#0f172a">${escapeXml(title)}</text>`,
    `<text x="${width / 2}" y="184" text-anchor="middle" font-size="36" fill="#334155">${escapeXml(subtitle)}</text>`,
    ...figureData.temporal.map(renderSPanel),
    ...figureData.temporal.map(renderWPanel),
    '<g data-legend="shared-temporal-encoding">',
    `<text x="${outerMargin}" y="${formatNumber(footerTop + 42)}" font-size="36" font-weight="700" fill="#0f172a">Shared temporal encoding</text>`,
    `<g data-scale="shared-S-1-7" aria-label="Shared S raw-weight scale" transform="translate(${outerMargin} ${formatNumber(footerTop + 82)})">`,
    '<line x1="0" y1="0" x2="110" y2="0" stroke="#2563eb" stroke-width="18" stroke-linecap="round" marker-end="url(#s-arrow-temporal)"/>',
    '<text x="140" y="12" font-size="34" fill="#0f172a">S raw weight 1–7</text>',
    "</g>",
    `<g data-scale="shared-W-1-3" aria-label="Shared W raw-weight scale" transform="translate(720 ${formatNumber(footerTop + 82)})">`,
    '<line x1="0" y1="0" x2="110" y2="0" stroke="#7e22ce" stroke-width="15" stroke-dasharray="none" stroke-linecap="round"/>',
    '<text x="140" y="12" font-size="34" fill="#0f172a">W raw co-occurrence 1–3</text>',
    "</g>",
    `<text x="${outerMargin}" y="${formatNumber(footerTop + 136)}" font-size="34" fill="#334155">Fixed node positions across stages; widths use global raw-weight scales; muted nodes are inactive in that stage.</text>`,
    "</g>"
  ].join("\n");
  const svg = svgShell({
    figureId,
    width,
    height,
    title,
    description:
      "Paired Plan, Teach, and Reflect small multiples compare directed Human–Human S networks with undirected Concept–Concept W networks using fixed layouts and global raw-weight scales.",
    body
  });
  assertSvgContent(figureId, svg, [
    title,
    subtitle,
    ...figureData.participants.map(({ label }) => label),
    ...figureData.codes.map(({ label }) => label),
    "shared-temporal-encoding",
    ...REQUIRED_STAGES
  ]);
  return svg;
}

function main() {
  const { inputPath, outputDir } = parseArgs(process.argv.slice(2));
  const loadedDataset = loadDataset(inputPath);
  const figureData = buildFigureData(loadedDataset);
  const figure1 = renderOverallHumanHumanFigure(figureData);
  const figure2 = renderOverallConceptConceptFigure(figureData);
  const figure3 = renderTemporalPairedFigure(figureData);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, "figure-data.json"), `${JSON.stringify(figureData, null, 2)}\n`, "utf8");
  writeFileSync(path.join(outputDir, "figure-1-human-human-overall.svg"), figure1, "utf8");
  writeFileSync(path.join(outputDir, "figure-2-concept-concept-overall.svg"), figure2, "utf8");
  writeFileSync(path.join(outputDir, "figure-3-temporal-paired-small-multiples.svg"), figure3, "utf8");
}

const isMainModule =
  (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) ||
  process.env.npm_lifecycle_event === "sena:figures:human-concept";

if (isMainModule) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`SENA figure generation failed: ${message}`);
    process.exitCode = 1;
  }
}
