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
type FigureDataV1 = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.humanConceptFigureData;
  dataset: {
    source: typeof SOURCE_RELATIVE_PATH;
    version: string;
    sha256: string;
    synthetic: true;
  };
  configuration: typeof BUILD_OPTIONS;
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
      maxRaw: number;
    };
    W: {
      minimumVisible: 1;
      maxRaw: number;
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

function assertMatrixBlock(name: string, block: SenaMatrixBlock) {
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
  assertMatrixBlock("overall.S", overallModel.matrices.S);
  assertMatrixBlock("overall.W", overallModel.matrices.W);

  const temporal = resolveStageWindows(overallModel).map(({ stage, window }) => {
    const scopedDataset = scopeSenaDatasetToWindow(dataset, window);
    const scopedModel = buildSenaModel(scopedDataset, BUILD_OPTIONS);
    assertMatrixBlock(`${stage}.S`, scopedModel.matrices.S);
    assertMatrixBlock(`${stage}.W`, scopedModel.matrices.W);

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
    configuration: BUILD_OPTIONS,
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
        maxRaw: maxNonZero(overallModel.matrices.S.raw, "S")
      },
      W: {
        minimumVisible: 1 as const,
        maxRaw: maxNonZero(overallModel.matrices.W.raw, "W")
      }
    },
    interpretationGuardrails: [
      "S encodes observed directed interaction weights; it is not a causal influence model.",
      "W encodes code co-occurrence within unit-scoped stanzas; it is not semantic or causal direction.",
      "The bundled lesson-study dataset is synthetic and supports demonstration, not population inference."
    ]
  }) satisfies FigureDataV1;
}

function main() {
  const { inputPath, outputDir } = parseArgs(process.argv.slice(2));
  const loadedDataset = loadDataset(inputPath);
  const figureData = buildFigureData(loadedDataset);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(path.join(outputDir, "figure-data.json"), `${JSON.stringify(figureData, null, 2)}\n`, "utf8");
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
