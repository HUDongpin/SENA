import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type sharpFactory from "sharp";
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
const REQUIRED_ARTIFACTS = [
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
const BACKUP_MARKER_FILENAME = ".sena-publication-backup-owner.json";
const BACKUP_MARKER_SCHEMA = "sena-publication-backup-owner/v1" as const;
const STAGING_MARKER_FILENAME = ".sena-publication-staging-owner.json";
const STAGING_MARKER_SCHEMA = "sena-publication-staging-owner/v1" as const;
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
type RequiredArtifact = (typeof REQUIRED_ARTIFACTS)[number];
type PayloadArtifact = Exclude<RequiredArtifact, "figure-manifest.json">;
type SharpRuntime = typeof sharpFactory;
type FileFingerprint = {
  filename: RequiredArtifact;
  bytes: number;
  sha256: string;
};
type BackupMarker = {
  schemaVersion: typeof BACKUP_MARKER_SCHEMA;
  outputDirectory: string;
  backupDirectory: string;
  artifacts: FileFingerprint[];
};
type StagingMarker = {
  schemaVersion: typeof STAGING_MARKER_SCHEMA;
  outputDirectory: string;
  stagingDirectory: string;
};
type OwnedStagingDirectory = {
  path: string;
  device: number;
  inode: number;
};
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

type ArtifactRecord = {
  filename: string;
  role: "figure-vector" | "figure-raster" | "figure-data" | "captions";
  mediaType: "image/svg+xml" | "image/png" | "application/json" | "text/markdown";
  dimensions: { width: number; height: number } | null;
  bytes: number;
  sha256: string;
};

type FigureManifestV1 = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.humanConceptPublicationFigureManifest;
  generatedAt: string;
  generationClock: "wall-clock" | "source-date-epoch";
  dataset: FigureDataV1["dataset"];
  publicationUse: FigureDataV1["publicationUse"];
  dataContractAudit: SenaDataContractAudit;
  configuration: SenaModel["options"];
  stageOrder: StageName[];
  runtime: {
    overall: RunIdentity;
    stages: Array<{ stage: StageName; windowId: string; runIdentity: RunIdentity }>;
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
    overall: FigureDataV1["overall"];
    temporal: Array<Pick<FigureDataV1["temporal"][number], "stage" | "windowId" | "S" | "W">>;
  };
  artifactCount: number;
  artifacts: ArtifactRecord[];
  interpretationGuardrails: string[];
  selfHashPolicy: string;
};

type ArtifactSpec = Pick<ArtifactRecord, "role" | "mediaType" | "dimensions"> & {
  filename: PayloadArtifact;
};

const PAYLOAD_ARTIFACT_SPECS: ArtifactSpec[] = [
  {
    filename: "figure-1-human-human-overall.svg",
    role: "figure-vector",
    mediaType: "image/svg+xml",
    dimensions: { width: 1800, height: 1200 }
  },
  {
    filename: "figure-1-human-human-overall.png",
    role: "figure-raster",
    mediaType: "image/png",
    dimensions: { width: 3600, height: 2400 }
  },
  {
    filename: "figure-2-concept-concept-overall.svg",
    role: "figure-vector",
    mediaType: "image/svg+xml",
    dimensions: { width: 1800, height: 1200 }
  },
  {
    filename: "figure-2-concept-concept-overall.png",
    role: "figure-raster",
    mediaType: "image/png",
    dimensions: { width: 3600, height: 2400 }
  },
  {
    filename: "figure-3-temporal-paired-small-multiples.svg",
    role: "figure-vector",
    mediaType: "image/svg+xml",
    dimensions: { width: 2400, height: 1440 }
  },
  {
    filename: "figure-3-temporal-paired-small-multiples.png",
    role: "figure-raster",
    mediaType: "image/png",
    dimensions: { width: 4800, height: 2880 }
  },
  {
    filename: "figure-data.json",
    role: "figure-data",
    mediaType: "application/json",
    dimensions: null
  },
  {
    filename: "captions.md",
    role: "captions",
    mediaType: "text/markdown",
    dimensions: null
  }
];

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
    '<defs><marker id="s-arrow-temporal" viewBox="0 0 20 20" refX="19" refY="10" markerWidth="36" markerHeight="36" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 1 L 19 10 L 0 19 Z" fill="#2563eb"/></marker></defs>',
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

function lstatIfExists(filePath: string) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function backupPathFor(outputDir: string) {
  return `${outputDir}.sena-publication-backup`;
}

function stagingPrefixFor(outputDir: string) {
  return `.${path.basename(outputDir)}.staging-`;
}

function publicationIdentity(outputDir: string) {
  const canonicalParent = realpathSync.native(path.dirname(outputDir));
  const outputDirectory = path.join(canonicalParent, path.basename(outputDir));
  return {
    outputDirectory,
    backupDirectory: backupPathFor(outputDirectory)
  };
}

function assertRealDirectory(directory: string, label: "output" | "backup" | "staging") {
  const stats = lstatIfExists(directory);
  if (!stats) return undefined;
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} path must be a real directory: ${directory}`);
  }
  return stats;
}

function assertTopLevelRegularFile(filePath: string, filename: string, label: "output" | "backup") {
  const stats = lstatIfExists(filePath);
  if (!stats?.isFile() || stats.isSymbolicLink()) {
    const prefix = label === "output" ? "output directory entry" : "backup directory entry";
    throw new Error(`${prefix} must be a top-level regular file: ${filename}`);
  }
  return stats;
}

function assertOutputDirectoryReplaceable(outputDir: string, allowed: Set<string>) {
  if (!assertRealDirectory(outputDir, "output")) return [];
  const entries = readdirSync(outputDir).sort();
  const unknown = entries.filter((entry) => !allowed.has(entry));
  if (unknown.length > 0) {
    throw new Error(`output directory contains unknown files: ${unknown.join(", ")}`);
  }
  for (const entry of entries) {
    assertTopLevelRegularFile(path.join(outputDir, entry), entry, "output");
  }
  return entries;
}

function assertCompleteOutputDirectory(outputDir: string) {
  const entries = assertOutputDirectoryReplaceable(outputDir, new Set<string>(REQUIRED_ARTIFACTS));
  const expected = [...REQUIRED_ARTIFACTS].sort();
  if (!sameJson(entries, expected)) {
    throw new Error("output directory must be a complete nine-file package while an owned backup exists");
  }
}

function fingerprintFile(directory: string, filename: RequiredArtifact, label: "output" | "backup") {
  assertTopLevelRegularFile(path.join(directory, filename), filename, label);
  const bytes = readFileSync(path.join(directory, filename));
  return {
    filename,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex")
  } satisfies FileFingerprint;
}

function isFileFingerprint(value: unknown): value is FileFingerprint {
  if (!isRecord(value)) return false;
  return (
    typeof value.filename === "string" &&
    (REQUIRED_ARTIFACTS as readonly string[]).includes(value.filename) &&
    typeof value.bytes === "number" &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes >= 0 &&
    typeof value.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(value.sha256)
  );
}

function readBackupMarker(containerDir: string, outputDir: string, label: "output" | "backup") {
  const markerPath = path.join(containerDir, BACKUP_MARKER_FILENAME);
  const markerStats = lstatIfExists(markerPath);
  if (!markerStats?.isFile() || markerStats.isSymbolicLink()) {
    throw new Error(`${label} directory has no recognized owned marker`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(markerPath, "utf8"));
  } catch {
    throw new Error(`${label} directory has no recognized owned marker`);
  }
  const identity = publicationIdentity(outputDir);
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== BACKUP_MARKER_SCHEMA ||
    parsed.outputDirectory !== identity.outputDirectory ||
    parsed.backupDirectory !== identity.backupDirectory ||
    !Array.isArray(parsed.artifacts) ||
    !parsed.artifacts.every(isFileFingerprint)
  ) {
    throw new Error(`${label} directory has no recognized owned marker`);
  }

  const marker = parsed as BackupMarker;
  const filenames = marker.artifacts.map(({ filename }) => filename);
  if (new Set(filenames).size !== filenames.length || !sameJson([...filenames].sort(), filenames)) {
    throw new Error(`${label} directory has no recognized owned marker`);
  }
  return marker;
}

function validateOwnedBackupContainer(
  containerDir: string,
  outputDir: string,
  label: "output" | "backup",
  expectedArtifacts?: FileFingerprint[]
) {
  assertRealDirectory(containerDir, label);
  const marker = readBackupMarker(containerDir, outputDir, label);
  const artifacts = expectedArtifacts ?? marker.artifacts;
  const expectedEntries = [...artifacts.map(({ filename }) => filename), BACKUP_MARKER_FILENAME].sort();
  const actualEntries = readdirSync(containerDir).sort();
  if (!sameJson(actualEntries, expectedEntries)) {
    throw new Error(`${label} directory contents do not match its owned marker`);
  }

  for (const expected of artifacts) {
    let actual: FileFingerprint;
    try {
      actual = fingerprintFile(containerDir, expected.filename, label);
    } catch {
      throw new Error(`${label} directory contents do not match its owned marker`);
    }
    if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
      throw new Error(`${label} directory contents do not match its owned marker`);
    }
  }
  return marker;
}

function writeBackupMarker(outputDir: string) {
  const entries = assertOutputDirectoryReplaceable(outputDir, new Set<string>(REQUIRED_ARTIFACTS));
  const identity = publicationIdentity(outputDir);
  const artifacts = entries.map((entry) => fingerprintFile(outputDir, entry as RequiredArtifact, "output"));
  const marker: BackupMarker = {
    schemaVersion: BACKUP_MARKER_SCHEMA,
    outputDirectory: identity.outputDirectory,
    backupDirectory: identity.backupDirectory,
    artifacts
  };
  writeFileSync(
    path.join(outputDir, BACKUP_MARKER_FILENAME),
    `${JSON.stringify(marker, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" }
  );
  validateOwnedBackupContainer(outputDir, outputDir, "output");
  return marker;
}

function removeOwnedMarkerFromOutput(outputDir: string) {
  validateOwnedBackupContainer(outputDir, outputDir, "output");
  const markerPath = path.join(outputDir, BACKUP_MARKER_FILENAME);
  const stats = lstatIfExists(markerPath);
  if (!stats?.isFile() || stats.isSymbolicLink()) {
    throw new Error("output directory has no recognized owned marker");
  }
  unlinkSync(markerPath);
  assertOutputDirectoryReplaceable(outputDir, new Set<string>(REQUIRED_ARTIFACTS));
}

function readStagingMarker(stagingDir: string, outputDir: string) {
  const markerPath = path.join(stagingDir, STAGING_MARKER_FILENAME);
  const stats = lstatIfExists(markerPath);
  if (!stats?.isFile() || stats.isSymbolicLink()) {
    throw new Error(`unrecognized staging directory preserved: ${stagingDir}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(markerPath, "utf8"));
  } catch {
    throw new Error(`unrecognized staging directory preserved: ${stagingDir}`);
  }
  const identity = publicationIdentity(outputDir);
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== STAGING_MARKER_SCHEMA ||
    parsed.outputDirectory !== identity.outputDirectory ||
    parsed.stagingDirectory !== path.resolve(stagingDir)
  ) {
    throw new Error(`unrecognized staging directory preserved: ${stagingDir}`);
  }
  return parsed as StagingMarker;
}

function assertOwnedStagingDirectory(staging: OwnedStagingDirectory, outputDir: string) {
  const stats = assertRealDirectory(staging.path, "staging");
  if (!stats || stats.dev !== staging.device || stats.ino !== staging.inode) {
    throw new Error(`owned staging directory identity changed: ${staging.path}`);
  }
  readStagingMarker(staging.path, outputDir);
}

function createStagingDirectory(outputDir: string) {
  const parent = path.dirname(outputDir);
  mkdirSync(parent, { recursive: true });
  const stagingDir = mkdtempSync(path.join(parent, stagingPrefixFor(outputDir)));
  const stats = lstatSync(stagingDir);
  const marker: StagingMarker = {
    schemaVersion: STAGING_MARKER_SCHEMA,
    outputDirectory: publicationIdentity(outputDir).outputDirectory,
    stagingDirectory: path.resolve(stagingDir)
  };
  writeFileSync(
    path.join(stagingDir, STAGING_MARKER_FILENAME),
    `${JSON.stringify(marker, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" }
  );
  return { path: stagingDir, device: stats.dev, inode: stats.ino } satisfies OwnedStagingDirectory;
}

function removeOwnedStagingDirectory(staging: OwnedStagingDirectory) {
  const stats = lstatIfExists(staging.path);
  if (!stats) return;
  if (stats.isSymbolicLink() || !stats.isDirectory() || stats.dev !== staging.device || stats.ino !== staging.inode) {
    throw new Error(`owned staging directory identity changed: ${staging.path}`);
  }
  rmSync(staging.path, { recursive: true, force: false });
}

function recoverOwnedStagingDirectories(outputDir: string) {
  const parent = path.dirname(outputDir);
  const parentStats = lstatIfExists(parent);
  if (!parentStats) return;
  if (parentStats.isSymbolicLink() || !parentStats.isDirectory()) {
    throw new Error(`output parent must be a real directory: ${parent}`);
  }
  const prefix = stagingPrefixFor(outputDir);
  for (const entry of readdirSync(parent).filter((name) => name.startsWith(prefix)).sort()) {
    const stagingDir = path.join(parent, entry);
    const stats = assertRealDirectory(stagingDir, "staging");
    if (!stats) continue;
    readStagingMarker(stagingDir, outputDir);
    removeOwnedStagingDirectory({ path: stagingDir, device: stats.dev, inode: stats.ino });
  }
}

function validateOwnedBackupForCleanup(backupDir: string, outputDir: string) {
  assertRealDirectory(backupDir, "backup");
  const marker = readBackupMarker(backupDir, outputDir, "backup");
  const actualEntries = readdirSync(backupDir).sort();
  if (!actualEntries.includes(BACKUP_MARKER_FILENAME)) {
    throw new Error("backup directory contents do not match its owned marker");
  }
  const presentArtifacts = actualEntries.filter((entry) => entry !== BACKUP_MARKER_FILENAME);
  const markerByFilename = new Map(marker.artifacts.map((artifact) => [artifact.filename, artifact]));
  if (presentArtifacts.some((filename) => !markerByFilename.has(filename as RequiredArtifact))) {
    throw new Error("backup directory contents do not match its owned marker");
  }
  const remaining = marker.artifacts.filter(({ filename }) => presentArtifacts.includes(filename));
  validateOwnedBackupContainer(backupDir, outputDir, "backup", remaining);
  return { marker, remaining };
}

function safelyRemoveOwnedBackup(backupDir: string, outputDir: string) {
  const { remaining: validatedRemaining } = validateOwnedBackupForCleanup(backupDir, outputDir);
  const remaining = [...validatedRemaining];
  let removedArtifacts = 0;
  while (remaining.length > 0) {
    validateOwnedBackupContainer(backupDir, outputDir, "backup", remaining);
    const next = remaining[0];
    assertTopLevelRegularFile(path.join(backupDir, next.filename), next.filename, "backup");
    unlinkSync(path.join(backupDir, next.filename));
    remaining.shift();
    removedArtifacts += 1;
    if (
      removedArtifacts === 1 &&
      process.env.NODE_ENV === "test" &&
      process.env.SENA_FIGURE_TEST_CRASH_DURING_BACKUP_CLEANUP === "1"
    ) {
      process.exit(88);
    }
  }
  validateOwnedBackupContainer(backupDir, outputDir, "backup", []);
  const markerPath = path.join(backupDir, BACKUP_MARKER_FILENAME);
  assertTopLevelRegularFile(markerPath, BACKUP_MARKER_FILENAME, "backup");
  unlinkSync(markerPath);
  if (readdirSync(backupDir).length !== 0) {
    throw new Error("backup directory acquired unknown content during safe cleanup; preserved");
  }
  rmdirSync(backupDir);
}

function recoverInterruptedPublication(outputDir: string) {
  const parent = path.dirname(outputDir);
  mkdirSync(parent, { recursive: true });
  recoverOwnedStagingDirectories(outputDir);
  const backupDir = backupPathFor(outputDir);
  const backupStats = lstatIfExists(backupDir);

  if (backupStats) {
    const outputStats = lstatIfExists(outputDir);
    if (!outputStats) {
      validateOwnedBackupContainer(backupDir, outputDir, "backup");
      renameSync(backupDir, outputDir);
      validateOwnedBackupContainer(outputDir, outputDir, "output");
      removeOwnedMarkerFromOutput(outputDir);
    } else {
      assertCompleteOutputDirectory(outputDir);
      safelyRemoveOwnedBackup(backupDir, outputDir);
    }
  }

  const outputStats = lstatIfExists(outputDir);
  if (outputStats) {
    assertRealDirectory(outputDir, "output");
    if (readdirSync(outputDir).includes(BACKUP_MARKER_FILENAME)) {
      validateOwnedBackupContainer(outputDir, outputDir, "output");
      removeOwnedMarkerFromOutput(outputDir);
    }
  }
  assertOutputDirectoryReplaceable(outputDir, new Set<string>(REQUIRED_ARTIFACTS));
}

function removeStagingMarkerForPublish(staging: OwnedStagingDirectory, outputDir: string) {
  assertOwnedStagingDirectory(staging, outputDir);
  const markerPath = path.join(staging.path, STAGING_MARKER_FILENAME);
  unlinkSync(markerPath);
  const entries = readdirSync(staging.path).sort();
  const expected = [...REQUIRED_ARTIFACTS].sort();
  if (!sameJson(entries, expected)) {
    throw new Error("staging package changed after validation");
  }
}

function publishStagingDirectory(staging: OwnedStagingDirectory, outputDir: string) {
  const backupDir = backupPathFor(outputDir);
  assertOwnedStagingDirectory(staging, outputDir);
  assertOutputDirectoryReplaceable(outputDir, new Set<string>(REQUIRED_ARTIFACTS));
  if (lstatIfExists(backupDir)) {
    throw new Error(`backup path appeared after recovery and was preserved: ${backupDir}`);
  }

  let previousMoved = false;
  try {
    if (lstatIfExists(outputDir)) {
      writeBackupMarker(outputDir);
      if (process.env.NODE_ENV === "test" && process.env.SENA_FIGURE_TEST_CRASH_AFTER_OUTPUT_MARKER === "1") {
        process.exit(87);
      }
      validateOwnedBackupContainer(outputDir, outputDir, "output");
      renameSync(outputDir, backupDir);
      previousMoved = true;

      if (process.env.NODE_ENV === "test" && process.env.SENA_FIGURE_TEST_LATE_BACKUP_UNKNOWN === "1") {
        writeFileSync(path.join(backupDir, "researcher-late-backup-note.txt"), "late backup note\n", "utf8");
      }
      validateOwnedBackupContainer(backupDir, outputDir, "backup");
      if (process.env.NODE_ENV === "test" && process.env.SENA_FIGURE_TEST_CRASH_AFTER_BACKUP === "1") {
        process.exit(86);
      }
    }

    removeStagingMarkerForPublish(staging, outputDir);
    renameSync(staging.path, outputDir);
  } catch (error) {
    if (!lstatIfExists(outputDir) && previousMoved && lstatIfExists(backupDir)) {
      try {
        validateOwnedBackupContainer(backupDir, outputDir, "backup");
        renameSync(backupDir, outputDir);
        validateOwnedBackupContainer(outputDir, outputDir, "output");
        removeOwnedMarkerFromOutput(outputDir);
      } catch (recoveryError) {
        const recoveryMessage = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
        const originalMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`publish failed and owned backup recovery was unsafe: ${recoveryMessage}; original: ${originalMessage}`);
      }
    }
    throw error;
  }

  if (previousMoved) safelyRemoveOwnedBackup(backupDir, outputDir);
}

function resolveGenerationClock() {
  const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
  if (sourceDateEpoch === undefined) {
    return { generatedAt: new Date().toISOString(), generationClock: "wall-clock" as const };
  }
  const seconds = Number(sourceDateEpoch);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error("SOURCE_DATE_EPOCH must be a nonnegative number of seconds");
  }
  return {
    generatedAt: new Date(seconds * 1000).toISOString(),
    generationClock: "source-date-epoch" as const
  };
}

function buildCaptions(figureData: FigureDataV1, sharpRuntime: SharpRuntime) {
  return [
    "## Figure 1. Overall Human–Human Network",
    "",
    "`S` is directed observed interaction weight across the full lesson-study cycle. Arrowheads encode observed source-to-target direction, and line width encodes raw weight. The bundled source dataset is synthetic, and this descriptive network does not imply causal influence.",
    "",
    "## Figure 2. Overall Concept–Concept Network",
    "",
    "`W` is undirected code co-occurrence within `unitId × stanzaId` across the full lesson-study cycle, and line width encodes raw co-occurrence. The association has neither semantic nor causal direction.",
    "",
    "## Figure 3. Plan–Teach–Reflect S and W Networks",
    "",
    "Each column is stage-scoped to Plan, Teach, or Reflect. Human and concept nodes retain fixed node positions, edge widths use shared global raw-weight scales, and inactive nodes are muted. These comparisons are descriptive and non-causal.",
    "",
    "These figures intentionally isolate the S (Human–Human) and W (Concept–Concept) layers for interpretability; B and G remain part of SENA but are not visualized here.",
    "",
    "## Data and software note",
    "",
    `Source contract: \`${figureData.dataset.source}\``,
    `Dataset version: \`${figureData.dataset.version}\``,
    `Source SHA-256: \`${figureData.dataset.sha256}\``,
    `Runtime configuration: \`${JSON.stringify(figureData.configuration)}\``,
    `Overall runtime dataset hash: \`${figureData.runIdentity.datasetContentHash}\``,
    `Overall runtime configuration hash: \`${figureData.runIdentity.configHash}\``,
    `Software: Node \`${process.version}\`, Sharp \`${sharpRuntime.versions.sharp}\`, libvips \`${sharpRuntime.versions.vips}\`. SVG uses the declared font fallback \`Arial, Helvetica, sans-serif\`.`,
    "",
    "These synthetic demonstration figures are layout-ready but are not cleared for empirical claims or population inference.",
    ""
  ].join("\n");
}

async function writePng(
  sharpRuntime: SharpRuntime,
  svg: string,
  outputPath: string,
  width: number,
  height: number
) {
  await sharpRuntime(Buffer.from(svg), { density: 144 })
    .resize(width, height, { fit: "fill" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
}

function buildArtifactRecords(stagingDir: string) {
  return PAYLOAD_ARTIFACT_SPECS.map((spec) => {
    const bytes = readFileSync(path.join(stagingDir, spec.filename));
    return {
      ...spec,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex")
    };
  }) satisfies ArtifactRecord[];
}

function buildManifest(
  figureData: FigureDataV1,
  artifactRecords: ArtifactRecord[],
  generatedAt: string,
  generationClock: "wall-clock" | "source-date-epoch",
  sharpRuntime: SharpRuntime
) {
  return createSenaSchemaPayload("humanConceptPublicationFigureManifest", {
    generatedAt,
    generationClock,
    dataset: figureData.dataset,
    publicationUse: figureData.publicationUse,
    dataContractAudit: figureData.dataContractAudit,
    configuration: figureData.configuration,
    stageOrder: figureData.stageOrder,
    runtime: {
      overall: figureData.runIdentity,
      stages: figureData.temporal.map(({ stage, windowId, runIdentity }) => ({
        stage,
        windowId,
        runIdentity
      })),
      environment: {
        node: process.version,
        sharp: sharpRuntime.versions.sharp,
        libvips: sharpRuntime.versions.vips,
        platform: process.platform,
        arch: process.arch,
        fontFallback: ["Arial", "Helvetica", "sans-serif"]
      }
    },
    matrices: {
      overall: figureData.overall,
      temporal: figureData.temporal.map(({ stage, windowId, S, W }) => ({
        stage,
        windowId,
        S,
        W
      }))
    },
    artifactCount: artifactRecords.length,
    artifacts: artifactRecords,
    interpretationGuardrails: figureData.interpretationGuardrails,
    selfHashPolicy: "The manifest hashes eight payload artifacts and does not self-hash."
  }) satisfies FigureManifestV1;
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function validatePublicationPackage(
  staging: OwnedStagingDirectory,
  outputDir: string,
  figureData: FigureDataV1,
  sharpRuntime: SharpRuntime
) {
  assertOwnedStagingDirectory(staging, outputDir);
  const stagingDir = staging.path;
  const expectedEntries = [...REQUIRED_ARTIFACTS, STAGING_MARKER_FILENAME].sort();
  const actualEntries = readdirSync(stagingDir).sort();
  if (!sameJson(actualEntries, expectedEntries)) {
    throw new Error(
      `publication package files must exactly match ${JSON.stringify(expectedEntries)}, received ${JSON.stringify(actualEntries)}`
    );
  }

  for (const filename of REQUIRED_ARTIFACTS) {
    if (readFileSync(path.join(stagingDir, filename)).byteLength === 0) {
      throw new Error(`publication artifact must be non-empty: ${filename}`);
    }
  }

  for (const spec of PAYLOAD_ARTIFACT_SPECS) {
    if (!spec.dimensions) continue;
    const metadata = await sharpRuntime(path.join(stagingDir, spec.filename)).metadata();
    if (metadata.width !== spec.dimensions.width || metadata.height !== spec.dimensions.height) {
      throw new Error(
        `${spec.filename} dimensions must be ${spec.dimensions.width}x${spec.dimensions.height}, received ${metadata.width}x${metadata.height}`
      );
    }
    const expectedFormat = spec.mediaType === "image/png" ? "png" : "svg";
    if (metadata.format !== expectedFormat) {
      throw new Error(`${spec.filename} must parse as ${expectedFormat}, received ${metadata.format}`);
    }
  }

  const storedFigureData = JSON.parse(readFileSync(path.join(stagingDir, "figure-data.json"), "utf8"));
  if (!sameJson(storedFigureData, figureData)) {
    throw new Error("stored figure-data.json does not match the validated runtime payload");
  }

  const captions = readFileSync(path.join(stagingDir, "captions.md"), "utf8");
  const claimBoundary =
    "These synthetic demonstration figures are layout-ready but are not cleared for empirical claims or population inference.\n";
  if (!captions.endsWith(claimBoundary)) {
    throw new Error("captions.md is missing the required final claim boundary");
  }

  const manifest = JSON.parse(
    readFileSync(path.join(stagingDir, "figure-manifest.json"), "utf8")
  ) as FigureManifestV1;
  if (manifest.schemaVersion !== SENA_SCHEMA_VERSIONS.humanConceptPublicationFigureManifest) {
    throw new Error(`unexpected figure manifest schema version: ${manifest.schemaVersion}`);
  }
  if (manifest.artifactCount !== PAYLOAD_ARTIFACT_SPECS.length || manifest.artifacts.length !== 8) {
    throw new Error("figure manifest must list exactly eight payload artifacts");
  }
  if (!sameJson(manifest.matrices.overall, figureData.overall)) {
    throw new Error("figure manifest overall matrices do not match figure-data.json");
  }
  const expectedTemporalMatrices = figureData.temporal.map(({ stage, windowId, S, W }) => ({
    stage,
    windowId,
    S,
    W
  }));
  if (!sameJson(manifest.matrices.temporal, expectedTemporalMatrices)) {
    throw new Error("figure manifest temporal matrices do not match figure-data.json");
  }
  if (manifest.artifacts.some(({ filename }) => filename === "figure-manifest.json")) {
    throw new Error("figure manifest must not self-hash");
  }

  for (const [index, spec] of PAYLOAD_ARTIFACT_SPECS.entries()) {
    const record = manifest.artifacts[index];
    if (
      !record ||
      record.filename !== spec.filename ||
      record.role !== spec.role ||
      record.mediaType !== spec.mediaType ||
      !sameJson(record.dimensions, spec.dimensions)
    ) {
      throw new Error(`figure manifest artifact record mismatch at index ${index}`);
    }
    const bytes = readFileSync(path.join(stagingDir, record.filename));
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (record.bytes !== bytes.byteLength || record.sha256 !== digest) {
      throw new Error(`figure manifest bytes or SHA-256 mismatch: ${record.filename}`);
    }
  }
}

async function main() {
  const { inputPath, outputDir } = parseArgs(process.argv.slice(2));
  recoverInterruptedPublication(outputDir);
  const { generatedAt, generationClock } = resolveGenerationClock();
  const loadedDataset = loadDataset(inputPath);
  const sharpModule = (await import("sharp")) as unknown as { default: SharpRuntime };
  const sharpRuntime = sharpModule.default;
  const figureData = buildFigureData(loadedDataset);
  const figure1 = renderOverallHumanHumanFigure(figureData);
  const figure2 = renderOverallConceptConceptFigure(figureData);
  const figure3 = renderTemporalPairedFigure(figureData);
  const captions = buildCaptions(figureData, sharpRuntime);
  const staging = createStagingDirectory(outputDir);
  const stagingDir = staging.path;

  try {
    writeFileSync(path.join(stagingDir, "figure-data.json"), `${JSON.stringify(figureData, null, 2)}\n`, "utf8");
    writeFileSync(path.join(stagingDir, "figure-1-human-human-overall.svg"), figure1, "utf8");
    writeFileSync(path.join(stagingDir, "figure-2-concept-concept-overall.svg"), figure2, "utf8");
    writeFileSync(path.join(stagingDir, "figure-3-temporal-paired-small-multiples.svg"), figure3, "utf8");
    writeFileSync(path.join(stagingDir, "captions.md"), captions, "utf8");

    if (process.env.NODE_ENV === "test" && process.env.SENA_FIGURE_TEST_FAIL_PNG === "1") {
      throw new Error("injected PNG rendering failure");
    }

    await writePng(
      sharpRuntime,
      figure1,
      path.join(stagingDir, "figure-1-human-human-overall.png"),
      3600,
      2400
    );
    await writePng(
      sharpRuntime,
      figure2,
      path.join(stagingDir, "figure-2-concept-concept-overall.png"),
      3600,
      2400
    );
    await writePng(
      sharpRuntime,
      figure3,
      path.join(stagingDir, "figure-3-temporal-paired-small-multiples.png"),
      4800,
      2880
    );

    const artifactRecords = buildArtifactRecords(stagingDir);
    const manifest = buildManifest(
      figureData,
      artifactRecords,
      generatedAt,
      generationClock,
      sharpRuntime
    );
    writeFileSync(
      path.join(stagingDir, "figure-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    await validatePublicationPackage(staging, outputDir, figureData, sharpRuntime);
    if (process.env.NODE_ENV === "test" && process.env.SENA_FIGURE_TEST_LATE_UNKNOWN_FILE === "1") {
      if (!lstatIfExists(outputDir)) throw new Error("late unknown output seam requires existing output");
      writeFileSync(path.join(outputDir, "researcher-late-note.txt"), "late researcher note\n", "utf8");
    }
    publishStagingDirectory(staging, outputDir);
  } finally {
    removeOwnedStagingDirectory(staging);
  }
}

const isMainModule =
  (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) ||
  process.env.npm_lifecycle_event === "sena:figures:human-concept";

if (isMainModule) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`SENA figure generation failed: ${message}`);
    process.exitCode = 1;
  }
}
