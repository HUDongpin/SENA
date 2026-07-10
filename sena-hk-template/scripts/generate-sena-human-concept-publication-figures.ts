import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildSenaDataContractAudit } from "../lib/sena/data-contract-audit";
import type { SenaDataset } from "../lib/sena/types";

const APP_ROOT = process.cwd();
const DEFAULT_INPUT = path.join(APP_ROOT, "public", "sena-pilot", "sample", "lesson-study-sena-contract.json");
const DEFAULT_OUTPUT_DIR = path.join(APP_ROOT, "output", "sena-publication-figures-human-concept");
const REQUIRED_STAGES = ["Plan", "Teach", "Reflect"] as const;

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

function loadDataset(sourcePath: string) {
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

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("source contract must be a JSON object");
  }

  const root = parsed as Record<string, unknown>;
  const requiredTables = ["people", "interactions", "utterances", "coded_segments", "codebook"] as const;
  for (const table of requiredTables) {
    if (!Array.isArray(root[table]) || root[table].length === 0) {
      throw new Error(`source contract requires a non-empty ${table} array`);
    }
  }

  const metadata = root.metadata;
  const datasetVersion =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).datasetVersion
      : undefined;
  if (typeof datasetVersion !== "string" || datasetVersion.trim().length === 0) {
    throw new Error("source contract requires metadata.datasetVersion");
  }

  for (const table of ["utterances", "coded_segments", "interactions"] as const) {
    const stages = new Set(
      (root[table] as unknown[]).flatMap((entry) =>
        entry && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as Record<string, unknown>).stage === "string"
          ? [(entry as Record<string, unknown>).stage as string]
          : []
      )
    );
    const missingStages = REQUIRED_STAGES.filter((stage) => !stages.has(stage));
    if (missingStages.length > 0) {
      throw new Error(`source contract ${table} missing required stages: ${missingStages.join(", ")}`);
    }
  }

  const dataset = parsed as SenaDataset;
  const dataContractAudit = buildSenaDataContractAudit(dataset);
  if (dataContractAudit.status !== "valid") {
    const failedItemIds = dataContractAudit.items
      .filter((item) => item.status !== "pass")
      .map((item) => item.id);
    throw new Error(`source contract data audit failed: ${failedItemIds.join(", ")}`);
  }

  const invalidColorCodeIds = dataset.codebook
    .filter((code) => typeof code.color !== "string" || !/^#[0-9a-f]{6}$/i.test(code.color))
    .map((code) => code.id);
  if (invalidColorCodeIds.length > 0) {
    throw new Error(`source contract contains invalid code colors: ${invalidColorCodeIds.join(", ")}`);
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

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`SENA figure generation failed: ${message}`);
  process.exitCode = 1;
}
