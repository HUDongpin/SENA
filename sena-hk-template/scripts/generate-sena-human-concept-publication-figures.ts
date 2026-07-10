import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSenaDataContractAudit } from "../lib/sena/data-contract-audit";
import type { SenaDataset } from "../lib/sena/types";

const APP_ROOT = process.cwd();
const DEFAULT_INPUT = path.join(APP_ROOT, "public", "sena-pilot", "sample", "lesson-study-sena-contract.json");
const DEFAULT_OUTPUT_DIR = path.join(APP_ROOT, "output", "sena-publication-figures-human-concept");
const REQUIRED_STAGES = ["Plan", "Teach", "Reflect"] as const;
const REQUIRED_TABLES = ["people", "interactions", "utterances", "coded_segments", "codebook"] as const;

type RequiredTable = (typeof REQUIRED_TABLES)[number];

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

  const stages = new Set([
    ...interactions.map((row) => row.stage),
    ...utterances.map((row) => row.stage),
    ...codedSegments.map((row) => row.stage)
  ]);
  const missingStages = REQUIRED_STAGES.filter((stage) => !stages.has(stage));
  if (missingStages.length > 0) {
    throw new Error(`source contract stage coverage missing required stages: ${missingStages.join(", ")}`);
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

function main() {
  const { inputPath, outputDir } = parseArgs(process.argv.slice(2));
  loadDataset(inputPath);
  mkdirSync(outputDir, { recursive: true });
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
