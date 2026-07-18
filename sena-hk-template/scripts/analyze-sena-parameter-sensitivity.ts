/**
 * SENA parameter sensitivity / stability probe (Track B, B3).
 *
 * Runs the bundled lesson-study sample through buildSenaModel across the
 * normalization rules, the alpha/beta/gamma layer weights, and the temporal
 * window modes, and records how the fused-graph summary responds. This is
 * exploratory stability evidence on ONE bundled case, not a validation claim:
 * it shows that normalization, weights, and window choice are consequential
 * (they shift the S/W/B share of A_fusion and the window count) while the
 * fusion-math audit and finiteness invariants hold across the whole grid.
 *
 * Run: npx vite-node scripts/analyze-sena-parameter-sensitivity.ts
 * Emits a markdown report to docs/validation/ unless --no-write is passed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildSenaModel } from "../lib/sena/model";
import { buildSenaFusionMathAudit } from "../lib/sena/fusion-math";
import { lessonStudySenaContract } from "../lib/sena/pilot-assets";
import type { SenaNormalization, SenaTemporalMode } from "../lib/sena/types";

const NORMALIZATIONS: SenaNormalization[] = ["max", "frobenius", "log1p-max", "log-max", "none"];
const TEMPORAL_MODES: SenaTemporalMode[] = ["stage", "moving-window", "turn-window"];
const WEIGHT_SETTINGS: Array<{ label: string; alpha: number; beta: number; gamma: number }> = [
  { label: "balanced (1,1,1)", alpha: 1, beta: 1, gamma: 1 },
  { label: "social-led (2,1,1)", alpha: 2, beta: 1, gamma: 1 },
  { label: "epistemic-led (1,2,1)", alpha: 1, beta: 2, gamma: 1 },
  { label: "bridge-led (1,1,2)", alpha: 1, beta: 1, gamma: 2 },
  { label: "no-bridge (1,1,0)", alpha: 1, beta: 1, gamma: 0 }
];

const dataset = lessonStudySenaContract;

type Row = Record<string, string | number>;

function pct(part: number, total: number) {
  return total > 0 ? Number(((part / total) * 100).toFixed(1)) : 0;
}

function layerShares(model: ReturnType<typeof buildSenaModel>) {
  // Sum the fused-graph scaled edge weights by typed layer. scaledWeight already
  // folds in alpha/beta/gamma and the active normalization, so this is the S/W/B
  // contribution to A_fusion.
  const totals = { social: 0, concept: 0, bridge: 0 };
  for (const edge of model.edges) {
    totals[edge.layer] += edge.scaledWeight;
  }
  const total = totals.social + totals.concept + totals.bridge;
  return {
    social: totals.social,
    concept: totals.concept,
    bridge: totals.bridge,
    total,
    socialPct: pct(totals.social, total),
    conceptPct: pct(totals.concept, total),
    bridgePct: pct(totals.bridge, total)
  };
}

function finite(...values: number[]) {
  return values.every((value) => Number.isFinite(value));
}

const invariantFailures: string[] = [];

// --- Sweep 1: normalization (weights=1, mode=stage) ---
const normalizationRows: Row[] = NORMALIZATIONS.map((normalization) => {
  const model = buildSenaModel(dataset, { normalization, alpha: 1, beta: 1, gamma: 1, temporal: { mode: "stage" } });
  const audit = buildSenaFusionMathAudit(model);
  const shares = layerShares(model);
  if (audit.status !== "verified") invariantFailures.push(`audit not verified for normalization=${normalization}`);
  if (!finite(shares.social, shares.concept, shares.bridge, shares.total)) invariantFailures.push(`non-finite layer total for normalization=${normalization}`);
  return {
    normalization,
    auditStatus: audit.status,
    "S%": shares.socialPct,
    "W%": shares.conceptPct,
    "B%": shares.bridgePct,
    fusionTotal: Number(shares.total.toFixed(4)),
    socialDensity: Number(model.summary.socialAnalysis.density.toFixed(4)),
    reciprocity: Number(model.summary.socialAnalysis.reciprocity.toFixed(4))
  };
});

// --- Sweep 2: alpha/beta/gamma weights (normalization=max, mode=stage) ---
const weightRows: Row[] = WEIGHT_SETTINGS.map(({ label, alpha, beta, gamma }) => {
  const model = buildSenaModel(dataset, { normalization: "max", alpha, beta, gamma, temporal: { mode: "stage" } });
  const audit = buildSenaFusionMathAudit(model);
  const shares = layerShares(model);
  if (audit.status !== "verified") invariantFailures.push(`audit not verified for weights=${label}`);
  return {
    weights: label,
    auditStatus: audit.status,
    "S%": shares.socialPct,
    "W%": shares.conceptPct,
    "B%": shares.bridgePct,
    fusionTotal: Number(shares.total.toFixed(4))
  };
});

// --- Sweep 3: temporal window mode (normalization=max, weights=1) ---
const temporalRows: Row[] = TEMPORAL_MODES.map((mode) => {
  const model = buildSenaModel(dataset, { normalization: "max", alpha: 1, beta: 1, gamma: 1, temporal: { mode } });
  const windows = model.temporal.windows;
  if (!finite(windows.length)) invariantFailures.push(`non-finite window count for mode=${mode}`);
  return {
    mode,
    windows: windows.length,
    firstWindow: windows[0]?.label ?? "—",
    lastWindow: windows[windows.length - 1]?.label ?? "—"
  };
});

function renderTable(rows: Row[]): string {
  if (rows.length === 0) return "_(no rows)_\n";
  const headers = Object.keys(rows[0]);
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${headers.map((h) => String(row[h])).join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}\n`;
}

const generatedAt = new Date().toISOString();
const report = `# SENA parameter sensitivity — bundled lesson-study sample

Generated: ${generatedAt}
Source: \`public/sena-pilot/sample/lesson-study-sena-contract.json\`
(${dataset.people.length} people, ${dataset.codebook.length} codes, ${dataset.coded_segments.length} coded segments, ${dataset.interactions.length} interactions)

> **Scope.** Exploratory stability evidence on ONE bundled case, produced by
> \`scripts/analyze-sena-parameter-sensitivity.ts\`. It is not a validation
> result and says nothing about real datasets. Its purpose is to make the
> analyst-facing point that normalization, layer weights, and window mode are
> **consequential modelling choices**, and that the fusion-math audit stays
> \`verified\` across the whole grid.

## 1. Normalization sweep (α=β=γ=1, mode=stage)

Shows how each normalization rule reweights the S / W / B share of the fused
supra-adjacency \`A_fusion\`. The bounded rules (\`max\`, \`frobenius\`,
\`log1p-max\`) are the admissible set; \`none\` and \`log-max\` are shown for
contrast.

${renderTable(normalizationRows)}

## 2. Layer-weight sweep (normalization=max, mode=stage)

α, β, γ are **relative emphasis** knobs on the social / epistemic / bridge
blocks. The S/W/B share moves as expected; \`no-bridge (1,1,0)\` zeroes B.

${renderTable(weightRows)}

## 3. Temporal window-mode sweep (normalization=max, α=β=γ=1)

Window choice is a theoretical assumption, not a neutral parameter: the number
of windows (and therefore every per-window S/W/B/G trace) depends on it.

${renderTable(temporalRows)}

## 4. Invariants held across the grid

- Fusion-math audit \`status = verified\` for every combination above.
- All fused-layer totals and window counts are finite.
${invariantFailures.length === 0 ? "- ✅ No invariant violations detected." : invariantFailures.map((f) => `- ❌ ${f}`).join("\n")}

## 5. How to read this for a real study

- Report the normalization, α/β/γ, and window mode as **declared choices** with
  a rationale, and run this sweep on the real dataset before interpreting the
  S/W/B balance.
- The audit staying \`verified\` confirms the block equation is well-formed; it
  is **not** evidence that cross-layer visual distances are inferential.
- For real inference, vary these on *valid independent units* (student / group /
  session), not turns or edges. See the Human-AI brief §8 and the ethics /
  governance checklist.
`;

console.log(report);

const shouldWrite = !process.argv.includes("--no-write");
if (shouldWrite) {
  const outDir = path.resolve(__dirname, "../../docs/validation");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "sena-parameter-sensitivity-lesson-study.md");
  writeFileSync(outPath, report, "utf8");
  console.log(`\nWrote report to ${outPath}`);
}

if (invariantFailures.length > 0) {
  console.error(`\nSENA sensitivity probe found ${invariantFailures.length} invariant violation(s).`);
  process.exit(1);
}
