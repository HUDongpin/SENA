import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { importSenaJsonContract } from "../import";
import { buildSenaModel } from "../model";

/**
 * P7 tripwire (perf campaign, 20260802_SENA_Perf Report.md): buildSenaModel was
 * O(pairs * segments^2) via conceptEdgeEvidence rebuilding stanza code-sets per
 * segment; fixed 2026-08-03 with a per-dataset stanza-code-set cache. This test
 * asserts the growth RATIO between two deterministic synthetic datasets (10x the
 * rows), which is machine-independent: linear growth costs ~10x, the pre-fix
 * quadratic measured ~44x. The 30x bound leaves ~7x headroom over the current
 * ~4x ratio while failing decisively if quadratic behaviour returns.
 */

const STAGES = ["Plan", "Enact", "Reflect"] as const;

type Contract = {
  metadata: unknown;
  people: Record<string, unknown>[];
  interactions: Record<string, unknown>[];
  utterances: Record<string, unknown>[];
  coded_segments: Record<string, unknown>[];
  codebook: Record<string, unknown>[];
};

const sampleText = readFileSync(
  new URL("../../../public/sena-pilot/sample/lesson-study-sena-contract.json", import.meta.url),
  "utf8"
);

// Deterministic scale-up mirroring scripts/bench-sena-hot-paths.ts: utterances,
// segments, and interactions scale by `scale`; people stay at 5x sample and
// cycle units at 5 so the ratio isolates row growth.
function buildScaledContractText(scale: number): string {
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

  const utteranceCount = sample.utterances.length * scale;
  const utterances: Record<string, unknown>[] = [];
  const codedSegments: Record<string, unknown>[] = [];
  for (let i = 0; i < utteranceCount; i += 1) {
    const stage = STAGES[i % STAGES.length];
    const personId = people[i % peopleCount].id as string;
    const base = {
      personId,
      unitId: `synthetic-cycle-${(i % unitCount) + 1}`,
      stanzaId: `${stage.toLowerCase()}-${Math.floor(i / STAGES.length) + 1}`,
      stage,
      turnIndex: i + 1,
      text: `Synthetic utterance ${i + 1} discussing pattern explanation and evidence use.`
    };
    utterances.push({ id: `su${i + 1}`, ...base, timestamp: new Date(Date.UTC(2026, 5, 8, 9, 0, i)).toISOString() });
    const codes = [codeIds[i % codeIds.length]];
    if (i % 2 === 0) codes.push(codeIds[(i + 3) % codeIds.length]);
    if (i % 5 === 0) codes.push(codeIds[(i + 5) % codeIds.length]);
    codedSegments.push({ segmentId: `ss${i + 1}`, utteranceId: `su${i + 1}`, ...base, codes: [...new Set(codes)], confidence: 1 });
  }

  const interactionCount = sample.interactions.length * scale;
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

describe("buildSenaModel scaling", () => {
  it("keeps evidence collection out of quadratic growth (P7 tripwire)", () => {
    const small = importSenaJsonContract(buildScaledContractText(25)).dataset;
    const large = importSenaJsonContract(buildScaledContractText(250)).dataset;

    // Warm up both paths (JIT, caches), then take min-of-3 — the most
    // GC-pause-robust statistic for a ratio bound.
    buildSenaModel(small);
    buildSenaModel(large);
    const timeOnce = (dataset: typeof small) => {
      const start = performance.now();
      buildSenaModel(dataset);
      return performance.now() - start;
    };
    const timeSmall = Math.min(timeOnce(small), timeOnce(small), timeOnce(small));
    const timeLarge = Math.min(timeOnce(large), timeOnce(large), timeOnce(large));

    // Floor the denominator so a freak sub-ms small run cannot inflate the ratio.
    const ratio = timeLarge / Math.max(timeSmall, 1);
    expect(ratio).toBeLessThan(30);
  });
});
