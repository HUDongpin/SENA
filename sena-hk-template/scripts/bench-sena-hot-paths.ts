import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { buildSenaEnaManifest } from "../lib/sena/ena-manifest";
import { buildSenaEnaNetwork } from "../lib/sena/ena-network";
import { buildSenaEnaPlotComposition } from "../lib/sena/ena-plot-model";
import { buildSenaFusionMathAudit } from "../lib/sena/fusion-math";
import { importSenaJsonContract } from "../lib/sena/import";
import { buildSenaModel } from "../lib/sena/model";

/**
 * Wall-clock benchmark of SENA's compute hot paths, used by the performance
 * campaign ledger (20260802_SENA_Perf Report.md). Run with:
 *
 *   npx vite-node scripts/bench-sena-hot-paths.ts
 *
 * Two datasets: the bundled lesson-study sample (1x) and a deterministic
 * synthetic scale-up (25x rows, same 7-code codebook) that exposes
 * superlinear behaviour the tiny sample cannot. Timings are median of
 * MEASURED_RUNS after WARMUP_RUNS, in milliseconds.
 */

const WARMUP_RUNS = 2;
const MEASURED_RUNS = 7;
const SCALE = 25;

const STAGES = ["Plan", "Enact", "Reflect"] as const;

type Contract = {
  metadata: unknown;
  people: Record<string, unknown>[];
  interactions: Record<string, unknown>[];
  utterances: Record<string, unknown>[];
  coded_segments: Record<string, unknown>[];
  codebook: Record<string, unknown>[];
};

function loadSampleContractText(): string {
  return readFileSync(
    new URL("../public/sena-pilot/sample/lesson-study-sena-contract.json", import.meta.url),
    "utf8"
  );
}

function buildScaledContractText(sampleText: string): string {
  const sample = JSON.parse(sampleText) as Contract;
  const codeIds = sample.codebook.map((code) => String(code.id));
  const peopleCount = sample.people.length * 5;
  const unitCount = 5;

  const people = Array.from({ length: peopleCount }, (_, i) => ({
    id: `SP${i + 1}`,
    label: `Synthetic person ${i + 1}`,
    role: i % 2 === 0 ? "Lead teacher" : "Observer",
    group: `Synthetic group ${(i % 4) + 1}`,
    initials: `S${i + 1}`
  }));

  const utteranceCount = sample.utterances.length * SCALE;
  const utterances: Record<string, unknown>[] = [];
  const codedSegments: Record<string, unknown>[] = [];
  for (let i = 0; i < utteranceCount; i += 1) {
    const stage = STAGES[i % STAGES.length];
    const personId = people[i % peopleCount].id;
    const unitId = `synthetic-cycle-${(i % unitCount) + 1}`;
    const stanzaId = `${stage.toLowerCase()}-${Math.floor(i / STAGES.length) + 1}`;
    const base = {
      personId,
      unitId,
      stanzaId,
      stage,
      turnIndex: i + 1,
      text: `Synthetic utterance ${i + 1} discussing pattern explanation and evidence use.`
    };
    utterances.push({
      id: `su${i + 1}`,
      ...base,
      timestamp: new Date(Date.UTC(2026, 5, 8, 9, 0, i)).toISOString()
    });
    const codes = [codeIds[i % codeIds.length]];
    if (i % 2 === 0) codes.push(codeIds[(i + 3) % codeIds.length]);
    if (i % 5 === 0) codes.push(codeIds[(i + 5) % codeIds.length]);
    codedSegments.push({
      segmentId: `ss${i + 1}`,
      utteranceId: `su${i + 1}`,
      ...base,
      codes: [...new Set(codes)],
      confidence: 1
    });
  }

  const interactionCount = sample.interactions.length * SCALE;
  const interactions = Array.from({ length: interactionCount }, (_, i) => ({
    source: people[i % peopleCount].id,
    target: people[(i + 1 + (i % 7)) % peopleCount].id,
    weight: (i % 9) + 1,
    channel: "reply",
    stage: STAGES[i % STAGES.length],
    turnIndex: i + 1,
    evidence: `Synthetic interaction ${i + 1}.`
  }));

  return JSON.stringify({
    metadata: sample.metadata,
    people,
    interactions,
    utterances,
    coded_segments: codedSegments,
    codebook: sample.codebook
  });
}

type StageTimings = Record<string, number[]>;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function runPipelineOnce(contractText: string, timings: StageTimings | null): void {
  const record = (stage: string, start: number) => {
    if (timings) (timings[stage] ??= []).push(performance.now() - start);
  };

  let start = performance.now();
  const imported = importSenaJsonContract(contractText);
  record("importSenaJsonContract", start);

  start = performance.now();
  const model = buildSenaModel(imported.dataset);
  record("buildSenaModel", start);

  start = performance.now();
  const manifest = buildSenaEnaManifest(imported.dataset);
  record("buildSenaEnaManifest", start);

  if (manifest.status !== "computed") {
    throw new Error(`ENA manifest not computed (status=${manifest.status}); timings would measure a skip path.`);
  }

  start = performance.now();
  buildSenaEnaNetwork(manifest);
  record("buildSenaEnaNetwork", start);

  start = performance.now();
  buildSenaEnaPlotComposition(manifest, model.people, model.codes);
  record("buildSenaEnaPlotComposition", start);

  start = performance.now();
  buildSenaFusionMathAudit(model);
  record("buildSenaFusionMathAudit", start);
}

function benchDataset(name: string, contractText: string): void {
  const imported = importSenaJsonContract(contractText);
  const { dataset } = imported;
  console.log(
    `\n${name}: people=${dataset.people.length} interactions=${dataset.interactions.length} ` +
      `utterances=${dataset.utterances.length} segments=${dataset.coded_segments.length} codes=${dataset.codebook.length}`
  );
  if (imported.warnings.length > 0) {
    console.log(`  import warnings (${imported.warnings.length}): ${imported.warnings.slice(0, 3).join(" | ")}`);
  }

  for (let i = 0; i < WARMUP_RUNS; i += 1) runPipelineOnce(contractText, null);
  const timings: StageTimings = {};
  for (let i = 0; i < MEASURED_RUNS; i += 1) runPipelineOnce(contractText, timings);

  console.log(`  ${"stage".padEnd(30)}${"median_ms".padStart(12)}${"min_ms".padStart(12)}`);
  let total = 0;
  for (const [stage, samples] of Object.entries(timings)) {
    const med = median(samples);
    total += med;
    console.log(`  ${stage.padEnd(30)}${med.toFixed(3).padStart(12)}${Math.min(...samples).toFixed(3).padStart(12)}`);
  }
  console.log(`  ${"TOTAL (sum of medians)".padEnd(30)}${total.toFixed(3).padStart(12)}`);
}

const sampleText = loadSampleContractText();
benchDataset("lesson-study sample (1x)", sampleText);
benchDataset(`synthetic scale-up (${SCALE}x)`, buildScaledContractText(sampleText));
console.log(`\nProtocol: ${WARMUP_RUNS} warmup + ${MEASURED_RUNS} measured runs per dataset; medians reported.`);
