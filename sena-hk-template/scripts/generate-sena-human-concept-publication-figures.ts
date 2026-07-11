import { createHash, randomUUID } from "node:crypto";
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
const STAGING_MARKER_FILENAME = ".sena-publication-staging-owner.json";
const READY_MARKER_FILENAME = ".sena-publication-ready-owner.json";
const COMMITTED_MARKER_FILENAME = ".sena-publication-committed-owner.json";
const QUARANTINE_RECEIPT_FILENAME = ".sena-publication-commit-receipt.json";
const PUBLICATION_LOCK_OWNER_FILENAME = "owner.json";
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
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.publicationBackupOwner;
  outputDirectory: string;
  backupDirectory: string;
  artifacts: FileFingerprint[];
};
type StagingMarker = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.publicationStagingOwner;
  outputDirectory: string;
  backupDirectory: string;
  stagingDirectory: string;
  device: number;
  inode: number;
};
type PublicationPackageMarker = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.publicationPackageOwner;
  outputDirectory: string;
  backupDirectory: string;
  stagingDirectory: string;
  device: number;
  inode: number;
  artifacts: FileFingerprint[];
};
type QuarantineCommitReceipt = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.publicationCommitReceipt;
  outputDirectory: string;
  quarantineDirectory: string;
  outputDevice: number;
  outputInode: number;
  artifacts: FileFingerprint[];
};
type PublicationLockMarker = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.publicationLock;
  outputDirectory: string;
  lockPath: string;
  pid: number;
  token: string;
  createdAt: string;
};
type OwnedPublicationLock = {
  path: string;
  device: number;
  inode: number;
  marker: PublicationLockMarker;
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
    '<defs><marker id="s-arrow" viewBox="0 0 20 20" refX="19" refY="10" markerWidth="36" markerHeight="36" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 1 L 19 10 L 0 19 Z" fill="#2563eb"/></marker></defs>',
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

function quarantinePathFor(outputDir: string) {
  return `${outputDir}.sena-publication-quarantine`;
}

function publicationLockPathFor(outputDir: string) {
  return `${outputDir}.sena-publication.lock`;
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

function canonicalDirectoryPath(directory: string) {
  return path.join(realpathSync.native(path.dirname(directory)), path.basename(directory));
}

function sortedRequiredArtifacts() {
  return [...REQUIRED_ARTIFACTS].sort() as RequiredArtifact[];
}

function isFilesystemIdentity(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function readPublicationLock(lockPath: string, outputDir: string) {
  const stats = lstatIfExists(lockPath);
  const failure = `publication lock is not a recognized real owned directory: ${lockPath}`;
  if (!stats?.isDirectory() || stats.isSymbolicLink()) throw new Error(failure);
  const entries = readdirSync(lockPath).sort();
  if (!sameJson(entries, [PUBLICATION_LOCK_OWNER_FILENAME])) throw new Error(failure);
  const ownerPath = path.join(lockPath, PUBLICATION_LOCK_OWNER_FILENAME);
  const ownerStats = lstatIfExists(ownerPath);
  if (!ownerStats?.isFile() || ownerStats.isSymbolicLink()) throw new Error(failure);

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(ownerPath, "utf8"));
  } catch {
    throw new Error(failure);
  }
  const identity = publicationIdentity(outputDir);
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== SENA_SCHEMA_VERSIONS.publicationLock ||
    parsed.outputDirectory !== identity.outputDirectory ||
    parsed.lockPath !== publicationLockPathFor(identity.outputDirectory) ||
    typeof parsed.pid !== "number" ||
    !Number.isSafeInteger(parsed.pid) ||
    parsed.pid <= 0 ||
    typeof parsed.token !== "string" ||
    !/^[0-9a-f-]{16,}$/.test(parsed.token) ||
    typeof parsed.createdAt !== "string" ||
    Number.isNaN(Date.parse(parsed.createdAt))
  ) {
    throw new Error(failure);
  }
  return { stats, marker: parsed as PublicationLockMarker };
}

function processIsLive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function createPublicationLockMarker(outputDir: string) {
  const identity = publicationIdentity(outputDir);
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.publicationLock,
    outputDirectory: identity.outputDirectory,
    lockPath: publicationLockPathFor(identity.outputDirectory),
    pid: process.pid,
    token: randomUUID(),
    createdAt: new Date().toISOString()
  } satisfies PublicationLockMarker;
}

function publicationLockTransientPaths(
  outputDir: string,
  kind: "candidate" | "release"
) {
  const lockPath = publicationLockPathFor(outputDir);
  const parent = path.dirname(lockPath);
  const prefix = `${path.basename(lockPath)}.${kind}-`;
  return readdirSync(parent)
    .filter((entry) => entry.startsWith(prefix))
    .sort()
    .map((entry) => path.join(parent, entry));
}

function validateUniquePublicationLockDirectory(
  directory: string,
  outputDir: string,
  kind: "candidate" | "release"
) {
  const owned = readPublicationLock(directory, outputDir);
  const expectedName = `${path.basename(publicationLockPathFor(outputDir))}.${kind}-${owned.marker.token}`;
  if (path.basename(directory) !== expectedName) {
    throw new Error(`publication lock ${kind} directory identity is invalid: ${directory}`);
  }
  return owned;
}

function safelyRemoveUniquePublicationLockDirectory(
  directory: string,
  outputDir: string,
  kind: "candidate" | "release"
) {
  const stats = lstatIfExists(directory);
  if (!stats?.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`publication lock ${kind} path is not a real directory: ${directory}`);
  }
  if (readdirSync(directory).length === 0) {
    rmdirSync(directory);
    return;
  }
  validateUniquePublicationLockDirectory(directory, outputDir, kind);
  const ownerPath = path.join(directory, PUBLICATION_LOCK_OWNER_FILENAME);
  unlinkSync(ownerPath);
  if (
    kind === "release" &&
    process.env.NODE_ENV === "test" &&
    process.env.SENA_FIGURE_TEST_CRASH_AFTER_LOCK_RELEASE_OWNER_UNLINK === "1"
  ) {
    process.exit(94);
  }
  if (readdirSync(directory).length !== 0) {
    throw new Error(`publication lock ${kind} directory acquired unknown content: ${directory}`);
  }
  rmdirSync(directory);
}

function cleanAbandonedPublicationLockTransients(outputDir: string) {
  for (const kind of ["candidate", "release"] as const) {
    for (const directory of publicationLockTransientPaths(outputDir, kind)) {
      const stats = lstatIfExists(directory);
      if (!stats?.isDirectory() || stats.isSymbolicLink()) {
        throw new Error(`publication lock ${kind} path is not a real directory: ${directory}`);
      }
      if (readdirSync(directory).length === 0) {
        rmdirSync(directory);
        continue;
      }
      const owned = validateUniquePublicationLockDirectory(directory, outputDir, kind);
      if (processIsLive(owned.marker.pid)) {
        throw new Error(
          `publication lock ${kind} is held by live process ${owned.marker.pid}: ${directory}`
        );
      }
      safelyRemoveUniquePublicationLockDirectory(directory, outputDir, kind);
    }
  }
}

function preparePublicationLockCandidate(outputDir: string) {
  const marker = createPublicationLockMarker(outputDir);
  const lockPath = publicationLockPathFor(outputDir);
  const candidatePath = `${lockPath}.candidate-${marker.token}`;
  mkdirSync(candidatePath);
  if (
    process.env.NODE_ENV === "test" &&
    process.env.SENA_FIGURE_TEST_CRASH_AFTER_LOCK_CANDIDATE_MKDIR === "1"
  ) {
    process.exit(93);
  }
  writeFileSync(
    path.join(candidatePath, PUBLICATION_LOCK_OWNER_FILENAME),
    `${JSON.stringify(marker, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" }
  );
  const owned = validateUniquePublicationLockDirectory(candidatePath, outputDir, "candidate");
  if (owned.marker.token !== marker.token || owned.marker.pid !== process.pid) {
    throw new Error(`publication lock candidate ownership changed: ${candidatePath}`);
  }
  if (
    process.env.NODE_ENV === "test" &&
    process.env.SENA_FIGURE_TEST_CRASH_WITH_PUBLICATION_LOCK_GUARD === "1"
  ) {
    process.exit(92);
  }
  return { path: candidatePath, marker, stats: owned.stats };
}

function injectStaleLockReplacement(lockPath: string, outputDir: string) {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.SENA_FIGURE_TEST_REPLACE_STALE_LOCK_BEFORE_RECLAIM !== "1"
  ) return;
  const identity = publicationIdentity(outputDir);
  const replacement: PublicationLockMarker = {
    schemaVersion: SENA_SCHEMA_VERSIONS.publicationLock,
    outputDirectory: identity.outputDirectory,
    lockPath: publicationLockPathFor(identity.outputDirectory),
    pid: process.ppid,
    token: randomUUID(),
    createdAt: new Date().toISOString()
  };
  writeFileSync(
    path.join(lockPath, PUBLICATION_LOCK_OWNER_FILENAME),
    `${JSON.stringify(replacement, null, 2)}\n`,
    "utf8"
  );
}

function acquirePublicationLock(outputDir: string) {
  const parent = path.dirname(outputDir);
  mkdirSync(parent, { recursive: true });
  const lockPath = publicationLockPathFor(outputDir);
  cleanAbandonedPublicationLockTransients(outputDir);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidate = preparePublicationLockCandidate(outputDir);
    try {
      renameSync(candidate.path, lockPath);
      const installed = readPublicationLock(lockPath, outputDir);
      if (
        installed.stats.dev !== candidate.stats.dev ||
        installed.stats.ino !== candidate.stats.ino ||
        installed.marker.token !== candidate.marker.token ||
        installed.marker.pid !== process.pid
      ) {
        throw new Error(`publication lock changed during candidate installation: ${lockPath}`);
      }
      return {
        path: lockPath,
        device: installed.stats.dev,
        inode: installed.stats.ino,
        marker: candidate.marker
      } satisfies OwnedPublicationLock;
    } catch (error) {
      if (lstatIfExists(candidate.path)) {
        safelyRemoveUniquePublicationLockDirectory(candidate.path, outputDir, "candidate");
      }
      if (!lstatIfExists(lockPath)) throw error;
      const existing = readPublicationLock(lockPath, outputDir);
      if (processIsLive(existing.marker.pid)) {
        throw new Error(`publication lock is held by live process ${existing.marker.pid}: ${lockPath}`);
      }
      injectStaleLockReplacement(lockPath, outputDir);
      const revalidated = readPublicationLock(lockPath, outputDir);
      if (
        revalidated.stats.dev !== existing.stats.dev ||
        revalidated.stats.ino !== existing.stats.ino ||
        revalidated.marker.token !== existing.marker.token ||
        revalidated.marker.pid !== existing.marker.pid
      ) {
        throw new Error(
          `stale publication lock changed during guarded recovery and was preserved: ${lockPath}`
        );
      }
      // This non-empty fence is an intentional durable ABA-prevention tombstone. It contains
      // coordination metadata only, is not transient output residue, and is created only by
      // stale-lock recovery. Never auto-delete it; maintenance may remove it only after confirming
      // in a controlled window that no figure-generator process is running.
      const fencePath = `${lockPath}.fence-${existing.marker.token}`;
      if (lstatIfExists(fencePath)) {
        throw new Error(`stale publication lock fence already exists and was preserved: ${fencePath}`);
      }
      try {
        renameSync(lockPath, fencePath);
      } catch (fencingError) {
        throw new Error(
          `stale publication lock fencing lost a race and all paths were preserved: ${
            fencingError instanceof Error ? fencingError.message : String(fencingError)
          }`
        );
      }
      const fenced = readPublicationLock(fencePath, outputDir);
      if (
        fenced.stats.dev !== existing.stats.dev ||
        fenced.stats.ino !== existing.stats.ino ||
        fenced.marker.token !== existing.marker.token ||
        fenced.marker.pid !== existing.marker.pid
      ) {
        throw new Error(`fenced stale publication lock changed and was preserved: ${fencePath}`);
      }
      console.error(
        `SENA publication recovery: recovered stale publication lock into durable ABA-prevention fence: ${fencePath}. ` +
          "It contains coordination metadata only; it is intentionally not auto-deleted or treated as transient " +
          "output residue, is created only by stale-lock recovery, and may be removed only in a controlled " +
          "maintenance window after confirming no figure-generator process is running."
      );
      continue;
    }
  }
  throw new Error(`could not acquire publication lock after stale fencing: ${lockPath}`);
}

function releasePublicationLock(lock: OwnedPublicationLock, outputDir: string) {
  const current = readPublicationLock(lock.path, outputDir);
  if (
    current.stats.dev !== lock.device ||
    current.stats.ino !== lock.inode ||
    current.marker.token !== lock.marker.token ||
    current.marker.pid !== process.pid
  ) {
    throw new Error(`publication lock ownership changed before release: ${lock.path}`);
  }
  const releasePath = `${lock.path}.release-${lock.marker.token}`;
  if (lstatIfExists(releasePath)) {
    throw new Error(`publication lock release path already exists and was preserved: ${releasePath}`);
  }
  renameSync(lock.path, releasePath);
  const released = validateUniquePublicationLockDirectory(releasePath, outputDir, "release");
  if (
    released.stats.dev !== lock.device ||
    released.stats.ino !== lock.inode ||
    released.marker.token !== lock.marker.token
  ) {
    throw new Error(`publication lock changed during guarded release: ${releasePath}`);
  }
  safelyRemoveUniquePublicationLockDirectory(releasePath, outputDir, "release");
}

function assertRealDirectory(
  directory: string,
  label: "output" | "backup" | "quarantine" | "staging"
) {
  const stats = lstatIfExists(directory);
  if (!stats) return undefined;
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} path must be a real directory: ${directory}`);
  }
  return stats;
}

function assertTopLevelRegularFile(
  filePath: string,
  filename: string,
  label: "output" | "backup" | "quarantine" | "staging"
) {
  const stats = lstatIfExists(filePath);
  if (!stats?.isFile() || stats.isSymbolicLink()) {
    const prefix = `${label} directory entry`;
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

function fingerprintFile(
  directory: string,
  filename: RequiredArtifact,
  label: "output" | "backup" | "quarantine" | "staging"
) {
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

function readBackupMarker(
  containerDir: string,
  outputDir: string,
  label: "output" | "backup" | "quarantine"
) {
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
    parsed.schemaVersion !== SENA_SCHEMA_VERSIONS.publicationBackupOwner ||
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
  label: "output" | "backup" | "quarantine",
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
    schemaVersion: SENA_SCHEMA_VERSIONS.publicationBackupOwner,
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
  const directoryStats = assertRealDirectory(stagingDir, "staging");
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== SENA_SCHEMA_VERSIONS.publicationStagingOwner ||
    parsed.outputDirectory !== identity.outputDirectory ||
    parsed.backupDirectory !== identity.backupDirectory ||
    parsed.stagingDirectory !== canonicalDirectoryPath(stagingDir) ||
    !isFilesystemIdentity(parsed.device) ||
    !isFilesystemIdentity(parsed.inode) ||
    !directoryStats ||
    parsed.device !== directoryStats.dev ||
    parsed.inode !== directoryStats.ino
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
    schemaVersion: SENA_SCHEMA_VERSIONS.publicationStagingOwner,
    ...publicationIdentity(outputDir),
    stagingDirectory: canonicalDirectoryPath(stagingDir),
    device: stats.dev,
    inode: stats.ino
  };
  writeFileSync(
    path.join(stagingDir, STAGING_MARKER_FILENAME),
    `${JSON.stringify(marker, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" }
  );
  return { path: stagingDir, device: stats.dev, inode: stats.ino } satisfies OwnedStagingDirectory;
}

function publicationMarkerError(
  containerDir: string,
  markerFilename: typeof READY_MARKER_FILENAME | typeof COMMITTED_MARKER_FILENAME,
  label: "output" | "staging"
) {
  if (label === "output" && markerFilename === COMMITTED_MARKER_FILENAME) {
    return "output directory has no recognized committed marker";
  }
  if (label === "output") return "output directory has no recognized ready marker";
  return `unrecognized READY staging directory preserved: ${containerDir}`;
}

function readPublicationPackageMarker(
  containerDir: string,
  outputDir: string,
  markerFilename: typeof READY_MARKER_FILENAME | typeof COMMITTED_MARKER_FILENAME,
  label: "output" | "staging"
) {
  const errorMessage = publicationMarkerError(containerDir, markerFilename, label);
  const markerPath = path.join(containerDir, markerFilename);
  const markerStats = lstatIfExists(markerPath);
  if (!markerStats?.isFile() || markerStats.isSymbolicLink()) {
    throw new Error(errorMessage);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(markerPath, "utf8"));
  } catch {
    throw new Error(errorMessage);
  }

  const identity = publicationIdentity(outputDir);
  const containerStats = assertRealDirectory(containerDir, label);
  const expectedArtifactNames = sortedRequiredArtifacts();
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== SENA_SCHEMA_VERSIONS.publicationPackageOwner ||
    parsed.outputDirectory !== identity.outputDirectory ||
    parsed.backupDirectory !== identity.backupDirectory ||
    typeof parsed.stagingDirectory !== "string" ||
    path.dirname(parsed.stagingDirectory) !== path.dirname(identity.outputDirectory) ||
    !path.basename(parsed.stagingDirectory).startsWith(stagingPrefixFor(identity.outputDirectory)) ||
    !isFilesystemIdentity(parsed.device) ||
    !isFilesystemIdentity(parsed.inode) ||
    !containerStats ||
    parsed.device !== containerStats.dev ||
    parsed.inode !== containerStats.ino ||
    !Array.isArray(parsed.artifacts) ||
    !parsed.artifacts.every(isFileFingerprint)
  ) {
    throw new Error(errorMessage);
  }

  const marker = parsed as PublicationPackageMarker;
  if (label === "staging" && marker.stagingDirectory !== canonicalDirectoryPath(containerDir)) {
    throw new Error(errorMessage);
  }
  const artifactNames = marker.artifacts.map(({ filename }) => filename);
  if (!sameJson(artifactNames, expectedArtifactNames)) {
    throw new Error(errorMessage);
  }
  return marker;
}

function validateManifestPayloadRecords(directory: string, label: "output" | "staging") {
  const failure = `${label} publication package manifest does not validate its eight payload artifacts`;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path.join(directory, "figure-manifest.json"), "utf8"));
  } catch {
    throw new Error(failure);
  }
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== SENA_SCHEMA_VERSIONS.humanConceptPublicationFigureManifest ||
    parsed.artifactCount !== PAYLOAD_ARTIFACT_SPECS.length ||
    !Array.isArray(parsed.artifacts) ||
    parsed.artifacts.length !== PAYLOAD_ARTIFACT_SPECS.length
  ) {
    throw new Error(failure);
  }

  for (const [index, spec] of PAYLOAD_ARTIFACT_SPECS.entries()) {
    const record = parsed.artifacts[index];
    if (
      !isRecord(record) ||
      record.filename !== spec.filename ||
      record.role !== spec.role ||
      record.mediaType !== spec.mediaType ||
      !sameJson(record.dimensions, spec.dimensions) ||
      typeof record.bytes !== "number" ||
      !Number.isSafeInteger(record.bytes) ||
      record.bytes < 0 ||
      typeof record.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(record.sha256)
    ) {
      throw new Error(failure);
    }
    const actual = fingerprintFile(directory, spec.filename, label);
    if (actual.bytes !== record.bytes || actual.sha256 !== record.sha256) {
      throw new Error(failure);
    }
  }
}

function validateCompletePublicationPackage(
  containerDir: string,
  outputDir: string,
  markerFilename: typeof READY_MARKER_FILENAME | typeof COMMITTED_MARKER_FILENAME,
  label: "output" | "staging",
  allowBuildingMarker = false
) {
  const marker = readPublicationPackageMarker(containerDir, outputDir, markerFilename, label);
  const actualEntries = readdirSync(containerDir).sort();
  const allowed = new Set<string>([...REQUIRED_ARTIFACTS, markerFilename]);
  if (allowBuildingMarker && actualEntries.includes(STAGING_MARKER_FILENAME)) {
    readStagingMarker(containerDir, outputDir);
    allowed.add(STAGING_MARKER_FILENAME);
  }
  const unknown = actualEntries.filter((entry) => !allowed.has(entry));
  if (unknown.length > 0) {
    throw new Error(`${label} directory contains unknown files: ${unknown.join(", ")}`);
  }
  const expected = [...allowed].sort();
  if (!sameJson(actualEntries, expected)) {
    throw new Error(`${label} directory contents do not match its publication marker`);
  }

  for (const expectedFingerprint of marker.artifacts) {
    const actual = fingerprintFile(containerDir, expectedFingerprint.filename, label);
    if (actual.bytes !== expectedFingerprint.bytes || actual.sha256 !== expectedFingerprint.sha256) {
      throw new Error(`${label} directory contents do not match its publication marker`);
    }
  }
  validateManifestPayloadRecords(containerDir, label);
  return marker;
}

function transitionStagingToReady(staging: OwnedStagingDirectory, outputDir: string) {
  assertOwnedStagingDirectory(staging, outputDir);
  const expectedBefore = [...REQUIRED_ARTIFACTS, STAGING_MARKER_FILENAME].sort();
  if (!sameJson(readdirSync(staging.path).sort(), expectedBefore)) {
    throw new Error("staging package changed before READY transition");
  }
  const marker: PublicationPackageMarker = {
    schemaVersion: SENA_SCHEMA_VERSIONS.publicationPackageOwner,
    ...publicationIdentity(outputDir),
    stagingDirectory: canonicalDirectoryPath(staging.path),
    device: staging.device,
    inode: staging.inode,
    artifacts: sortedRequiredArtifacts().map((filename) =>
      fingerprintFile(staging.path, filename, "staging")
    )
  };
  writeFileSync(
    path.join(staging.path, READY_MARKER_FILENAME),
    `${JSON.stringify(marker, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" }
  );
  validateCompletePublicationPackage(staging.path, outputDir, READY_MARKER_FILENAME, "staging", true);
  assertOwnedStagingDirectory(staging, outputDir);
  unlinkSync(path.join(staging.path, STAGING_MARKER_FILENAME));
  validateCompletePublicationPackage(staging.path, outputDir, READY_MARKER_FILENAME, "staging");
}

function validateBuildingStagingForCleanup(staging: OwnedStagingDirectory, outputDir: string) {
  assertOwnedStagingDirectory(staging, outputDir);
  const actualEntries = readdirSync(staging.path).sort();
  const allowed = new Set<string>([...REQUIRED_ARTIFACTS, STAGING_MARKER_FILENAME]);
  const unknown = actualEntries.filter((entry) => !allowed.has(entry));
  if (unknown.length > 0) {
    throw new Error(`staging directory contains unknown files: ${unknown.join(", ")}`);
  }
  const presentArtifacts = sortedRequiredArtifacts().filter((filename) => actualEntries.includes(filename));
  for (const filename of presentArtifacts) {
    assertTopLevelRegularFile(path.join(staging.path, filename), filename, "staging");
  }
  return presentArtifacts;
}

function validateReadyStagingForCleanup(staging: OwnedStagingDirectory, outputDir: string) {
  const marker = readPublicationPackageMarker(staging.path, outputDir, READY_MARKER_FILENAME, "staging");
  const actualEntries = readdirSync(staging.path).sort();
  const allowed = new Set<string>([...REQUIRED_ARTIFACTS, READY_MARKER_FILENAME, STAGING_MARKER_FILENAME]);
  const unknown = actualEntries.filter((entry) => !allowed.has(entry));
  if (unknown.length > 0) {
    throw new Error(`staging directory contains unknown files: ${unknown.join(", ")}`);
  }
  const hasBuildingMarker = actualEntries.includes(STAGING_MARKER_FILENAME);
  if (hasBuildingMarker) readStagingMarker(staging.path, outputDir);
  const markerByFilename = new Map(marker.artifacts.map((artifact) => [artifact.filename, artifact]));
  const presentArtifacts = sortedRequiredArtifacts().filter((filename) => actualEntries.includes(filename));
  for (const filename of presentArtifacts) {
    const expected = markerByFilename.get(filename);
    const actual = fingerprintFile(staging.path, filename, "staging");
    if (!expected || actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
      throw new Error("staging directory contents do not match its READY marker");
    }
  }
  if (presentArtifacts.length === REQUIRED_ARTIFACTS.length) {
    validateManifestPayloadRecords(staging.path, "staging");
  }
  return { presentArtifacts, hasBuildingMarker };
}

function revalidateStagingIdentity(staging: OwnedStagingDirectory) {
  const stats = assertRealDirectory(staging.path, "staging");
  if (!stats || stats.dev !== staging.device || stats.ino !== staging.inode) {
    throw new Error(`owned staging directory identity changed: ${staging.path}`);
  }
}

function removeOwnedStagingDirectory(staging: OwnedStagingDirectory, outputDir: string) {
  const stats = lstatIfExists(staging.path);
  if (!stats) return;
  revalidateStagingIdentity(staging);
  const initialEntries = readdirSync(staging.path).sort();
  if (initialEntries.length === 0) {
    rmdirSync(staging.path);
    return;
  }

  if (initialEntries.includes(READY_MARKER_FILENAME)) {
    while (true) {
      revalidateStagingIdentity(staging);
      const { presentArtifacts, hasBuildingMarker } = validateReadyStagingForCleanup(staging, outputDir);
      if (presentArtifacts.length > 0) {
        const next = presentArtifacts[0];
        assertTopLevelRegularFile(path.join(staging.path, next), next, "staging");
        unlinkSync(path.join(staging.path, next));
        continue;
      }
      if (hasBuildingMarker) {
        assertTopLevelRegularFile(
          path.join(staging.path, STAGING_MARKER_FILENAME),
          STAGING_MARKER_FILENAME,
          "staging"
        );
        unlinkSync(path.join(staging.path, STAGING_MARKER_FILENAME));
        continue;
      }
      assertTopLevelRegularFile(
        path.join(staging.path, READY_MARKER_FILENAME),
        READY_MARKER_FILENAME,
        "staging"
      );
      unlinkSync(path.join(staging.path, READY_MARKER_FILENAME));
      break;
    }
  } else if (initialEntries.includes(STAGING_MARKER_FILENAME)) {
    while (true) {
      revalidateStagingIdentity(staging);
      const presentArtifacts = validateBuildingStagingForCleanup(staging, outputDir);
      if (presentArtifacts.length > 0) {
        const next = presentArtifacts[0];
        assertTopLevelRegularFile(path.join(staging.path, next), next, "staging");
        unlinkSync(path.join(staging.path, next));
        continue;
      }
      assertTopLevelRegularFile(
        path.join(staging.path, STAGING_MARKER_FILENAME),
        STAGING_MARKER_FILENAME,
        "staging"
      );
      unlinkSync(path.join(staging.path, STAGING_MARKER_FILENAME));
      break;
    }
  } else {
    throw new Error(`unrecognized staging directory preserved: ${staging.path}`);
  }

  revalidateStagingIdentity(staging);
  if (readdirSync(staging.path).length !== 0) {
    throw new Error(`staging directory acquired unknown content during safe cleanup; preserved: ${staging.path}`);
  }
  rmdirSync(staging.path);
}

function recoverOwnedStagingDirectories(outputDir: string) {
  const parent = path.dirname(outputDir);
  const parentStats = lstatIfExists(parent);
  if (!parentStats) return;
  if (parentStats.isSymbolicLink() || !parentStats.isDirectory()) {
    throw new Error(`output parent must be a real directory: ${parent}`);
  }
  const prefix = stagingPrefixFor(outputDir);
  const stagingDirectories = readdirSync(parent)
    .filter((name) => name.startsWith(prefix))
    .sort()
    .map((entry) => {
      const stagingDir = path.join(parent, entry);
      const stats = assertRealDirectory(stagingDir, "staging");
      if (!stats) throw new Error(`staging directory disappeared during recovery: ${stagingDir}`);
      return { path: stagingDir, device: stats.dev, inode: stats.ino } satisfies OwnedStagingDirectory;
    });

  for (const staging of stagingDirectories) {
    const entries = readdirSync(staging.path).sort();
    if (entries.length === 0) continue;
    if (entries.includes(READY_MARKER_FILENAME)) {
      validateReadyStagingForCleanup(staging, outputDir);
    } else if (entries.includes(STAGING_MARKER_FILENAME)) {
      validateBuildingStagingForCleanup(staging, outputDir);
    } else {
      throw new Error(`unrecognized staging directory preserved: ${staging.path}`);
    }
  }
  for (const staging of stagingDirectories) {
    removeOwnedStagingDirectory(staging, outputDir);
  }
}

function ensureCommittedOutput(outputDir: string) {
  assertRealDirectory(outputDir, "output");
  const entries = readdirSync(outputDir).sort();
  if (entries.includes(READY_MARKER_FILENAME)) {
    validateCompletePublicationPackage(outputDir, outputDir, READY_MARKER_FILENAME, "output");
    if (entries.includes(COMMITTED_MARKER_FILENAME)) {
      throw new Error("output directory contains conflicting READY and COMMITTED markers");
    }
    renameSync(
      path.join(outputDir, READY_MARKER_FILENAME),
      path.join(outputDir, COMMITTED_MARKER_FILENAME)
    );
  }
  return validateCompletePublicationPackage(
    outputDir,
    outputDir,
    COMMITTED_MARKER_FILENAME,
    "output"
  );
}

function readQuarantineCommitReceiptStructure(quarantineDir: string, outputDir: string) {
  const failure = `quarantine has no recognized commit receipt: ${quarantineDir}`;
  assertRealDirectory(quarantineDir, "quarantine");
  const receiptPath = path.join(quarantineDir, QUARANTINE_RECEIPT_FILENAME);
  const receiptStats = lstatIfExists(receiptPath);
  if (!receiptStats?.isFile() || receiptStats.isSymbolicLink()) throw new Error(failure);

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(receiptPath, "utf8"));
  } catch {
    throw new Error(failure);
  }
  const identity = publicationIdentity(outputDir);
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== SENA_SCHEMA_VERSIONS.publicationCommitReceipt ||
    parsed.outputDirectory !== identity.outputDirectory ||
    parsed.quarantineDirectory !== quarantinePathFor(identity.outputDirectory) ||
    !isFilesystemIdentity(parsed.outputDevice) ||
    !isFilesystemIdentity(parsed.outputInode) ||
    !Array.isArray(parsed.artifacts) ||
    !parsed.artifacts.every(isFileFingerprint)
  ) {
    throw new Error(failure);
  }
  const receipt = parsed as QuarantineCommitReceipt;
  if (!sameJson(receipt.artifacts.map(({ filename }) => filename), sortedRequiredArtifacts())) {
    throw new Error(failure);
  }
  return receipt;
}

function readQuarantineCommitReceipt(quarantineDir: string, outputDir: string) {
  const receipt = readQuarantineCommitReceiptStructure(quarantineDir, outputDir);
  const outputStats = assertRealDirectory(outputDir, "output");
  if (
    !outputStats ||
    receipt.outputDevice !== outputStats.dev ||
    receipt.outputInode !== outputStats.ino
  ) {
    throw new Error(`quarantine commit receipt does not match the current output: ${quarantineDir}`);
  }
  return receipt;
}

function writeQuarantineCommitReceipt(
  quarantineDir: string,
  outputDir: string,
  committed: PublicationPackageMarker
) {
  const outputStats = assertRealDirectory(outputDir, "output");
  if (!outputStats || outputStats.dev !== committed.device || outputStats.ino !== committed.inode) {
    throw new Error("committed output identity changed before quarantine receipt creation");
  }
  const identity = publicationIdentity(outputDir);
  const receipt: QuarantineCommitReceipt = {
    schemaVersion: SENA_SCHEMA_VERSIONS.publicationCommitReceipt,
    outputDirectory: identity.outputDirectory,
    quarantineDirectory: quarantinePathFor(identity.outputDirectory),
    outputDevice: outputStats.dev,
    outputInode: outputStats.ino,
    artifacts: committed.artifacts
  };
  writeFileSync(
    path.join(quarantineDir, QUARANTINE_RECEIPT_FILENAME),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" }
  );
  const stored = readQuarantineCommitReceipt(quarantineDir, outputDir);
  if (!sameJson(stored.artifacts, committed.artifacts)) {
    throw new Error("quarantine commit receipt does not match committed output fingerprints");
  }
  return stored;
}

function validateMarkerlessOutputAgainstFingerprints(
  outputDir: string,
  expectedArtifacts: FileFingerprint[]
) {
  try {
    const entries = assertOutputDirectoryReplaceable(outputDir, new Set<string>(REQUIRED_ARTIFACTS));
    if (!sameJson(entries, sortedRequiredArtifacts())) {
      throw new Error("output is not the exact nine-file package");
    }
    for (const expected of expectedArtifacts) {
      const actual = fingerprintFile(outputDir, expected.filename, "output");
      if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
        throw new Error(`output fingerprint mismatch: ${expected.filename}`);
      }
    }
    validateManifestPayloadRecords(outputDir, "output");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`final steady-state output changed before validation: ${message}`);
  }
}

function validateMarkerlessOutputPackage(outputDir: string) {
  const entries = assertOutputDirectoryReplaceable(outputDir, new Set<string>(REQUIRED_ARTIFACTS));
  if (!sameJson(entries, sortedRequiredArtifacts())) {
    throw new Error("markerless output is not the exact nine-file package");
  }
  validateManifestPayloadRecords(outputDir, "output");
}

function removeCommittedMarkerForFinalValidation(
  outputDir: string,
  expected: PublicationPackageMarker | QuarantineCommitReceipt
) {
  const committed = ensureCommittedOutput(outputDir);
  if (
    committed.device !== ("device" in expected ? expected.device : expected.outputDevice) ||
    committed.inode !== ("inode" in expected ? expected.inode : expected.outputInode) ||
    !sameJson(committed.artifacts, expected.artifacts)
  ) {
    throw new Error("committed output does not match the final-validation receipt");
  }
  const markerPath = path.join(outputDir, COMMITTED_MARKER_FILENAME);
  assertTopLevelRegularFile(markerPath, COMMITTED_MARKER_FILENAME, "output");
  unlinkSync(markerPath);
  const entries = assertOutputDirectoryReplaceable(outputDir, new Set<string>(REQUIRED_ARTIFACTS));
  if (!sameJson(entries, sortedRequiredArtifacts())) {
    throw new Error("committed output did not resolve to the exact nine-file package");
  }
}

function validateQuarantineForCleanup(
  quarantineDir: string,
  outputDir: string,
  requireCurrentOutput = true
) {
  const receipt = requireCurrentOutput
    ? readQuarantineCommitReceipt(quarantineDir, outputDir)
    : readQuarantineCommitReceiptStructure(quarantineDir, outputDir);
  const entries = readdirSync(quarantineDir).sort();
  const hasBackupMarker = entries.includes(BACKUP_MARKER_FILENAME);
  if (!hasBackupMarker) {
    const unknown = entries.filter((entry) => entry !== QUARANTINE_RECEIPT_FILENAME);
    if (unknown.length > 0) {
      throw new Error(`quarantine contains unknown content without its old-version marker: ${unknown.join(", ")}`);
    }
    return { receipt, marker: undefined, remaining: [] as FileFingerprint[] };
  }

  const marker = readBackupMarker(quarantineDir, outputDir, "quarantine");
  const markerByFilename = new Map(marker.artifacts.map((artifact) => [artifact.filename, artifact]));
  const allowed = new Set<string>([
    ...markerByFilename.keys(),
    BACKUP_MARKER_FILENAME,
    QUARANTINE_RECEIPT_FILENAME
  ]);
  const unknown = entries.filter((entry) => !allowed.has(entry));
  if (unknown.length > 0) {
    throw new Error(`quarantine directory contains unknown files: ${unknown.join(", ")}`);
  }
  const presentArtifacts = entries.filter((entry) => markerByFilename.has(entry as RequiredArtifact));
  const remaining = marker.artifacts.filter(({ filename }) => presentArtifacts.includes(filename));
  for (const expected of remaining) {
    const actual = fingerprintFile(quarantineDir, expected.filename, "quarantine");
    if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
      throw new Error("quarantine directory contents do not match its old-version marker");
    }
  }
  return { receipt, marker, remaining };
}

function safelyRemoveValidatedQuarantine(quarantineDir: string, outputDir: string) {
  let removedArtifacts = 0;
  while (true) {
    const state = validateQuarantineForCleanup(quarantineDir, outputDir);
    validateMarkerlessOutputAgainstFingerprints(outputDir, state.receipt.artifacts);
    if (state.remaining.length > 0) {
      const next = state.remaining[0];
      assertTopLevelRegularFile(path.join(quarantineDir, next.filename), next.filename, "quarantine");
      unlinkSync(path.join(quarantineDir, next.filename));
      removedArtifacts += 1;
      if (
        removedArtifacts === 1 &&
        process.env.NODE_ENV === "test" &&
        process.env.SENA_FIGURE_TEST_CRASH_DURING_BACKUP_CLEANUP === "1"
      ) {
        process.exit(88);
      }
      continue;
    }
    if (state.marker) {
      assertTopLevelRegularFile(
        path.join(quarantineDir, BACKUP_MARKER_FILENAME),
        BACKUP_MARKER_FILENAME,
        "quarantine"
      );
      unlinkSync(path.join(quarantineDir, BACKUP_MARKER_FILENAME));
      continue;
    }
    assertTopLevelRegularFile(
      path.join(quarantineDir, QUARANTINE_RECEIPT_FILENAME),
      QUARANTINE_RECEIPT_FILENAME,
      "quarantine"
    );
    unlinkSync(path.join(quarantineDir, QUARANTINE_RECEIPT_FILENAME));
    if (
      process.env.NODE_ENV === "test" &&
      process.env.SENA_FIGURE_TEST_CRASH_AFTER_BACKUP_MARKER_UNLINK === "1"
    ) {
      process.exit(90);
    }
    if (readdirSync(quarantineDir).length !== 0) {
      throw new Error("quarantine acquired unknown content during safe cleanup; preserved");
    }
    rmdirSync(quarantineDir);
    return;
  }
}

function injectFinalValidationMutation(outputDir: string) {
  if (
    process.env.NODE_ENV === "test" &&
    process.env.SENA_FIGURE_TEST_MUTATE_OUTPUT_BEFORE_FINAL_VALIDATION === "1"
  ) {
    const captionsPath = path.join(outputDir, "captions.md");
    writeFileSync(
      captionsPath,
      `${readFileSync(captionsPath, "utf8")}tampered before final steady-state validation\n`,
      "utf8"
    );
  }
}

function finalizeCommittedOutputWithoutQuarantine(outputDir: string) {
  const committed = ensureCommittedOutput(outputDir);
  removeCommittedMarkerForFinalValidation(outputDir, committed);
  injectFinalValidationMutation(outputDir);
  validateMarkerlessOutputAgainstFingerprints(outputDir, committed.artifacts);
}

function finalizeOutputWithQuarantine(outputDir: string, quarantineDir: string) {
  const entries = readdirSync(outputDir).sort();
  const hasTransactionMarker =
    entries.includes(READY_MARKER_FILENAME) || entries.includes(COMMITTED_MARKER_FILENAME);
  let receipt: QuarantineCommitReceipt;
  if (hasTransactionMarker) {
    const committed = ensureCommittedOutput(outputDir);
    if (readdirSync(quarantineDir).includes(QUARANTINE_RECEIPT_FILENAME)) {
      receipt = readQuarantineCommitReceipt(quarantineDir, outputDir);
      if (!sameJson(receipt.artifacts, committed.artifacts)) {
        throw new Error("quarantine receipt does not match the committed output marker");
      }
    } else {
      validateOwnedBackupContainer(quarantineDir, outputDir, "quarantine");
      receipt = writeQuarantineCommitReceipt(quarantineDir, outputDir, committed);
    }
    removeCommittedMarkerForFinalValidation(outputDir, receipt);
  } else {
    receipt = readQuarantineCommitReceipt(quarantineDir, outputDir);
  }

  injectFinalValidationMutation(outputDir);
  validateMarkerlessOutputAgainstFingerprints(outputDir, receipt.artifacts);
  if (
    process.env.NODE_ENV === "test" &&
    process.env.SENA_FIGURE_TEST_CRASH_AFTER_BACKUP_REMOVED === "1"
  ) {
    process.exit(91);
  }
  safelyRemoveValidatedQuarantine(quarantineDir, outputDir);
}

function restoreOwnedQuarantine(quarantineDir: string, outputDir: string) {
  if (readdirSync(quarantineDir).includes(QUARANTINE_RECEIPT_FILENAME)) {
    const state = validateQuarantineForCleanup(quarantineDir, outputDir, false);
    if (!state.marker || state.remaining.length !== state.marker.artifacts.length) {
      throw new Error("quarantined old version is incomplete and cannot be restored");
    }
    unlinkSync(path.join(quarantineDir, QUARANTINE_RECEIPT_FILENAME));
  }
  validateOwnedBackupContainer(quarantineDir, outputDir, "quarantine");
  renameSync(quarantineDir, outputDir);
  validateOwnedBackupContainer(outputDir, outputDir, "output");
  removeOwnedMarkerFromOutput(outputDir);
}

function recoverInterruptedPublication(outputDir: string) {
  const parent = path.dirname(outputDir);
  mkdirSync(parent, { recursive: true });
  const backupDir = backupPathFor(outputDir);
  const quarantineDir = quarantinePathFor(outputDir);
  const backupStats = lstatIfExists(backupDir);
  const quarantineStats = lstatIfExists(quarantineDir);

  if (backupStats && quarantineStats) {
    throw new Error("backup and quarantine paths both exist; both were preserved");
  }

  if (backupStats) {
    assertRealDirectory(backupDir, "backup");
    const outputStats = lstatIfExists(outputDir);
    if (!outputStats) {
      validateOwnedBackupContainer(backupDir, outputDir, "backup");
      renameSync(backupDir, outputDir);
      validateOwnedBackupContainer(outputDir, outputDir, "output");
      removeOwnedMarkerFromOutput(outputDir);
    } else {
      ensureCommittedOutput(outputDir);
      if (readdirSync(backupDir).length === 0) {
        finalizeCommittedOutputWithoutQuarantine(outputDir);
        rmdirSync(backupDir);
      } else {
        validateOwnedBackupContainer(backupDir, outputDir, "backup");
        renameSync(backupDir, quarantineDir);
        finalizeOutputWithQuarantine(outputDir, quarantineDir);
      }
    }
  }

  const recoveredQuarantineStats = lstatIfExists(quarantineDir);
  if (recoveredQuarantineStats) {
    assertRealDirectory(quarantineDir, "quarantine");
    const outputStats = lstatIfExists(outputDir);
    if (!outputStats) {
      restoreOwnedQuarantine(quarantineDir, outputDir);
    } else if (readdirSync(quarantineDir).length === 0) {
      validateMarkerlessOutputPackage(outputDir);
      rmdirSync(quarantineDir);
    } else {
      finalizeOutputWithQuarantine(outputDir, quarantineDir);
    }
  }

  const outputStats = lstatIfExists(outputDir);
  if (outputStats) {
    assertRealDirectory(outputDir, "output");
    const entries = readdirSync(outputDir).sort();
    if (entries.includes(BACKUP_MARKER_FILENAME)) {
      validateOwnedBackupContainer(outputDir, outputDir, "output");
      removeOwnedMarkerFromOutput(outputDir);
    } else if (
      entries.includes(READY_MARKER_FILENAME) ||
      entries.includes(COMMITTED_MARKER_FILENAME)
    ) {
      finalizeCommittedOutputWithoutQuarantine(outputDir);
    } else {
      assertOutputDirectoryReplaceable(outputDir, new Set<string>(REQUIRED_ARTIFACTS));
    }
  }
  recoverOwnedStagingDirectories(outputDir);
  assertOutputDirectoryReplaceable(outputDir, new Set<string>(REQUIRED_ARTIFACTS));
}

function publishStagingDirectory(staging: OwnedStagingDirectory, outputDir: string) {
  const backupDir = backupPathFor(outputDir);
  const quarantineDir = quarantinePathFor(outputDir);
  validateCompletePublicationPackage(staging.path, outputDir, READY_MARKER_FILENAME, "staging");
  assertOutputDirectoryReplaceable(outputDir, new Set<string>(REQUIRED_ARTIFACTS));
  if (lstatIfExists(backupDir)) {
    throw new Error(`backup path appeared after recovery and was preserved: ${backupDir}`);
  }
  if (lstatIfExists(quarantineDir)) {
    throw new Error(`quarantine path appeared after recovery and was preserved: ${quarantineDir}`);
  }

  let previousLocation: "none" | "backup" | "quarantine" = "none";
  try {
    if (lstatIfExists(outputDir)) {
      writeBackupMarker(outputDir);
      if (process.env.NODE_ENV === "test" && process.env.SENA_FIGURE_TEST_CRASH_AFTER_OUTPUT_MARKER === "1") {
        process.exit(87);
      }
      validateOwnedBackupContainer(outputDir, outputDir, "output");
      renameSync(outputDir, backupDir);
      previousLocation = "backup";

      if (process.env.NODE_ENV === "test" && process.env.SENA_FIGURE_TEST_LATE_BACKUP_UNKNOWN === "1") {
        writeFileSync(path.join(backupDir, "researcher-late-backup-note.txt"), "late backup note\n", "utf8");
      }
      validateOwnedBackupContainer(backupDir, outputDir, "backup");
      if (process.env.NODE_ENV === "test" && process.env.SENA_FIGURE_TEST_CRASH_AFTER_BACKUP === "1") {
        process.exit(86);
      }
    }

    if (
      process.env.NODE_ENV === "test" &&
      process.env.SENA_FIGURE_TEST_CRASH_AFTER_READY_BEFORE_RENAME === "1"
    ) {
      process.exit(89);
    }

    if (previousLocation === "backup") {
      renameSync(backupDir, quarantineDir);
      previousLocation = "quarantine";
      validateOwnedBackupContainer(quarantineDir, outputDir, "quarantine");
    }

    renameSync(staging.path, outputDir);
    validateCompletePublicationPackage(outputDir, outputDir, READY_MARKER_FILENAME, "output");
    renameSync(
      path.join(outputDir, READY_MARKER_FILENAME),
      path.join(outputDir, COMMITTED_MARKER_FILENAME)
    );
    ensureCommittedOutput(outputDir);
  } catch (error) {
    if (!lstatIfExists(outputDir) && previousLocation !== "none") {
      try {
        if (previousLocation === "quarantine" && lstatIfExists(quarantineDir)) {
          restoreOwnedQuarantine(quarantineDir, outputDir);
        } else if (lstatIfExists(backupDir)) {
          validateOwnedBackupContainer(backupDir, outputDir, "backup");
          renameSync(backupDir, outputDir);
          validateOwnedBackupContainer(outputDir, outputDir, "output");
          removeOwnedMarkerFromOutput(outputDir);
        }
      } catch (recoveryError) {
        const recoveryMessage = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
        const originalMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`publish failed and owned backup recovery was unsafe: ${recoveryMessage}; original: ${originalMessage}`);
      }
    }
    throw error;
  }

  if (previousLocation === "quarantine") {
    finalizeOutputWithQuarantine(outputDir, quarantineDir);
  } else {
    finalizeCommittedOutputWithoutQuarantine(outputDir);
  }
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
  const publicationLock = acquirePublicationLock(outputDir);
  try {
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
      transitionStagingToReady(staging, outputDir);
      if (process.env.NODE_ENV === "test" && process.env.SENA_FIGURE_TEST_LATE_UNKNOWN_FILE === "1") {
        if (!lstatIfExists(outputDir)) throw new Error("late unknown output seam requires existing output");
        writeFileSync(path.join(outputDir, "researcher-late-note.txt"), "late researcher note\n", "utf8");
      }
      publishStagingDirectory(staging, outputDir);
    } finally {
      removeOwnedStagingDirectory(staging, outputDir);
    }
  } finally {
    releasePublicationLock(publicationLock, outputDir);
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
