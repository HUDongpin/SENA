# SENA Human–Human and Concept–Concept Publication Figures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a reproducible, journal-ready three-figure SENA set showing the overall Human–Human `S` layer, the overall Concept–Concept `W` layer, and paired Plan–Teach–Reflect changes from the bundled synthetic lesson-study sample.

**Architecture:** A single TypeScript generator reads the existing five-table JSON contract, delegates every overall and stage-scoped matrix calculation to `buildSenaModel`, validates the resulting labels and matrix dimensions, then renders deterministic SVG. The same script rasterizes each SVG through the already-installed `sharp` runtime, writes figure data/captions, and closes the provenance chain with a SHA-256 manifest. A black-box Vitest suite invokes the generator in a temporary directory and compares serialized matrices against fresh runtime outputs, so the figure workflow cannot drift into a second S/W implementation.

**Tech Stack:** TypeScript, `vite-node`, current SENA model runtime, Node `fs/path/crypto`, SVG 1.1, `sharp` 0.34.x, Vitest 4.

---

## Ground rules and accepted decisions

- Work from `/Users/dongpinhu/Desktop/SENA`; run application commands from `/Users/dongpinhu/Desktop/SENA/sena-hk-template`.
- Preserve all pre-existing dirty and untracked files. Do not stage or commit unrelated DOCX files, `.superpowers/`, `SNA.js-template/`, or existing `outputs/` research artifacts.
- Do not alter `lib/sena/model.ts`, the five-table contract, the workspace UI, B/G/fusion semantics, or deployment configuration.
- Treat `/Users/dongpinhu/Desktop/SENA/docs/superpowers/specs/2026-07-11-sena-human-concept-publication-figures-design.md` as the controlling design specification.
- Use only `/Users/dongpinhu/Desktop/SENA/sena-hk-template/public/sena-pilot/sample/lesson-study-sena-contract.json` as the default source dataset.
- Keep all SVG helpers private inside the generator. Do not create a reusable drawing abstraction until a second publication workflow actually needs it.
- Register the two new JSON contract identifiers in `lib/sena/schema-registry.ts` and consume them through `SENA_SCHEMA_VERSIONS`; do not scatter schema-version string literals through production code. These standalone manuscript assets are not review-packet artifacts, so do not add them to `artifact-catalog.ts` in this scope.
- Coordinate the output/provenance boundary with SENA-A07 and the schema boundary with SENA-A15. This package is a standalone synthetic method-illustration workflow, not a new review-packet artifact family.
- Use “publication-ready” only for layout/rendering quality. The manifest, figure data, and captions must classify the package as `synthetic-demo-figure`, `layoutReady=true`, and `empiricalClaimReady=false`; it does not bypass or claim to pass the existing publication/model-card, coding-reliability, claim-readiness, or human-review gates.
- Default runtime declaration must be exactly:

```ts
const BUILD_OPTIONS = {
  normalization: "max",
  bridgeWeightRule: "count",
  direction: "directed",
  undirectedSocial: false,
  temporal: { mode: "stage" },
  seed: 0
} as const;
```

- Authoritative SVG dimensions: Figures 1–2 are `1800 × 1200` and target a 6-inch print width; Figure 3 is `2400 × 1440` and targets an 8-inch print width. Both scales equal 300 SVG units per print inch, so a minimum `font-size="34"` is approximately 8.16 pt. PNG dimensions are `3600 × 2400` and `4800 × 2880`, respectively.
- The manifest lists and hashes the other eight payload artifacts. It does not self-hash `figure-manifest.json`, because an exact hash embedded in the file it hashes would be circular.

## Task 0: Capture the worktree baseline and protect shared files

**Files:**

- Verify only: `sena-hk-template/package.json`
- Verify only: `sena-hk-template/package-lock.json`
- Verify only: `sena-hk-template/lib/sena/schema-registry.ts`
- Verify only: `sena-hk-template/lib/sena/__tests__/schema-registry.test.ts`

- [ ] **Step 1: Capture staged, unstaged, and untracked state before any implementation edit**

```bash
git -C /Users/dongpinhu/Desktop/SENA status --porcelain=v1 -z \
  > /tmp/sena-human-concept-baseline-status.z
git -C /Users/dongpinhu/Desktop/SENA diff --binary \
  > /tmp/sena-human-concept-baseline-unstaged.diff
git -C /Users/dongpinhu/Desktop/SENA diff --cached --binary \
  > /tmp/sena-human-concept-baseline-staged.diff
```

- [ ] **Step 2: Confirm the shared files have no pre-existing staged or unstaged edits**

```bash
git -C /Users/dongpinhu/Desktop/SENA diff --quiet -- \
  sena-hk-template/package.json \
  sena-hk-template/package-lock.json \
  sena-hk-template/lib/sena/schema-registry.ts \
  sena-hk-template/lib/sena/__tests__/schema-registry.test.ts
git -C /Users/dongpinhu/Desktop/SENA diff --cached --quiet -- \
  sena-hk-template/package.json \
  sena-hk-template/package-lock.json \
  sena-hk-template/lib/sena/schema-registry.ts \
  sena-hk-template/lib/sena/__tests__/schema-registry.test.ts
```

Expected: both commands exit `0`. If either exits non-zero, inspect the exact overlap and stop before editing or staging that shared file; do not overwrite or stage a user's hunk.

## Task 1: Lock the CLI, source contract, and failure behavior

**Files:**

- Create: `sena-hk-template/lib/sena/__tests__/human-concept-publication-figures.test.ts`
- Create: `sena-hk-template/scripts/generate-sena-human-concept-publication-figures.ts`
- Modify: `sena-hk-template/lib/sena/schema-registry.ts`
- Modify: `sena-hk-template/lib/sena/__tests__/schema-registry.test.ts`
- Modify: `sena-hk-template/package.json`
- Modify: `sena-hk-template/package-lock.json`

- [ ] **Step 1: Add a failing black-box CLI test**

Create the test helper and first two tests. Keep every run in an isolated temporary output directory.

```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const appRoot = process.cwd();
const generator = path.join(appRoot, "scripts/generate-sena-human-concept-publication-figures.ts");
const viteNode = path.join(appRoot, "node_modules/.bin/vite-node");

function makeOutputDir() {
  const root = mkdtempSync(path.join(tmpdir(), "sena-human-concept-figures-"));
  roots.push(root);
  return root;
}

function runGenerator(args: string[], cwd = appRoot, extraEnv: NodeJS.ProcessEnv = {}) {
  return spawnSync(viteNode, [generator, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      TZ: "UTC",
      SOURCE_DATE_EPOCH: "1783728000",
      ...extraEnv
    }
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("SENA Human–Human and Concept–Concept publication figure generator", () => {
  it("is exposed through the documented package command", () => {
    const pkg = JSON.parse(readFileSync(path.join(appRoot, "package.json"), "utf8"));
    expect(pkg.scripts["sena:figures:human-concept"]).toBe(
      "vite-node scripts/generate-sena-human-concept-publication-figures.ts"
    );
    expect(pkg.devDependencies.sharp).toBe("^0.34.5");
  });

  it("fails closed when the source contract is missing", () => {
    const result = runGenerator([], makeOutputDir());
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("SENA figure generation failed: source contract not found");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the intended red state**

Run:

```bash
npx vitest run lib/sena/__tests__/human-concept-publication-figures.test.ts
```

Expected: failure because the package command and generator do not exist yet.

- [ ] **Step 3: Declare Sharp directly and add the package command**

Do not rely on Next's optional transitive dependency for a first-class generator and test import. From the app root run:

```bash
npm install --save-dev sharp@^0.34.5
```

Insert beside the other SENA scripts in `package.json`:

```json
"sena:figures:human-concept": "vite-node scripts/generate-sena-human-concept-publication-figures.ts",
```

- [ ] **Step 4: Register the two new schema versions**

Add these keys to `SENA_SCHEMA_VERSIONS` in `lib/sena/schema-registry.ts`:

```ts
humanConceptFigureData: "sena-human-concept-figure-data/v1",
humanConceptPublicationFigureManifest: "sena-human-concept-publication-figure-manifest/v1",
```

Add registry assertions to `lib/sena/__tests__/schema-registry.test.ts`:

```ts
expect(SENA_SCHEMA_VERSIONS.humanConceptFigureData)
  .toBe("sena-human-concept-figure-data/v1");
expect(SENA_SCHEMA_VERSIONS.humanConceptPublicationFigureManifest)
  .toBe("sena-human-concept-publication-figure-manifest/v1");
```

- [ ] **Step 5: Implement CLI parsing, default paths, and source validation**

Start the generator with these imports and constants:

```ts
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { buildSenaDataContractAudit } from "../lib/sena/data-contract-audit";
import { buildSenaModel, scopeSenaDatasetToWindow } from "../lib/sena/model";
import { createSenaSchemaPayload, SENA_SCHEMA_VERSIONS } from "../lib/sena/schema-registry";
import type {
  SenaDataContractAudit,
  SenaDataset,
  SenaMatrixBlock,
  SenaModel
} from "../lib/sena/types";

const APP_ROOT = process.cwd();
const DEFAULT_INPUT = path.join(
  APP_ROOT,
  "public/sena-pilot/sample/lesson-study-sena-contract.json"
);
const DEFAULT_OUTPUT_DIR = path.join(
  APP_ROOT,
  "output/sena-publication-figures-human-concept"
);
const REQUIRED_STAGES = ["Plan", "Teach", "Reflect"] as const;
```

Keep the source contract fixed to the approved built-in sample. Implement one testability option, `--output-dir`, and reject unknown flags or missing values.

```ts
function parseArgs(argv: string[]) {
  let outputDir = DEFAULT_OUTPUT_DIR;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--output-dir" && !value) {
      throw new Error(`missing value for ${flag}`);
    }
    if (flag === "--output-dir") outputDir = path.resolve(value);
    else throw new Error(`unknown argument ${flag}`);
    index += 1;
  }
  return { input: DEFAULT_INPUT, outputDir };
}
```

Load raw bytes once, compute the dataset SHA-256 from those exact bytes, parse JSON, and validate all required tables and stage names. Use one error prefix in the top-level catch:

```ts
function loadDataset(input: string) {
  if (!existsSync(input)) throw new Error(`source contract not found: ${input}`);
  const source = readFileSync(input);
  let dataset: SenaDataset;
  try {
    dataset = JSON.parse(source.toString("utf8")) as SenaDataset;
  } catch {
    throw new Error(`source contract is not valid JSON: ${input}`);
  }

  const requiredTables = ["people", "interactions", "utterances", "coded_segments", "codebook"] as const;
  for (const table of requiredTables) {
    if (!Array.isArray(dataset[table]) || dataset[table].length === 0) {
      throw new Error(`source contract requires a non-empty ${table} table`);
    }
  }
  if (!dataset.metadata?.datasetVersion) {
    throw new Error("source contract requires metadata.datasetVersion");
  }
  const stages = new Set([
    ...dataset.utterances.map((row) => row.stage),
    ...dataset.coded_segments.map((row) => row.stage),
    ...dataset.interactions.map((row) => row.stage)
  ]);
  for (const stage of REQUIRED_STAGES) {
    if (!stages.has(stage)) throw new Error(`source contract is missing required stage ${stage}`);
  }
  const dataContractAudit = buildSenaDataContractAudit(dataset);
  if (dataContractAudit.status !== "valid") {
    const failedIds = dataContractAudit.items
      .filter((item) => item.status !== "pass")
      .map((item) => item.id)
      .join(", ");
    throw new Error(`source contract failed SENA data-contract audit: ${failedIds}`);
  }
  for (const code of dataset.codebook) {
    if (!/^#[0-9a-f]{6}$/i.test(code.color)) {
      throw new Error(`source contract has invalid code color for ${code.id}`);
    }
  }
  return {
    dataset,
    source,
    dataContractAudit,
    datasetVersion: dataset.metadata.datasetVersion,
    sha256: createHash("sha256").update(source).digest("hex")
  };
}
```

At this stage `main()` only loads, validates, creates the output directory, and writes nothing. The final catch must be:

```ts
main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`SENA figure generation failed: ${message}`);
  process.exitCode = 1;
});
```

- [ ] **Step 6: Run the registry and focused tests and confirm green**

Run:

```bash
npx vitest run lib/sena/__tests__/schema-registry.test.ts \
  lib/sena/__tests__/human-concept-publication-figures.test.ts
```

Expected: both test files pass.

- [ ] **Step 7: Commit the CLI boundary**

```bash
git -C /Users/dongpinhu/Desktop/SENA add sena-hk-template/package.json \
  sena-hk-template/package-lock.json \
  sena-hk-template/scripts/generate-sena-human-concept-publication-figures.ts \
  sena-hk-template/lib/sena/schema-registry.ts \
  sena-hk-template/lib/sena/__tests__/schema-registry.test.ts \
  sena-hk-template/lib/sena/__tests__/human-concept-publication-figures.test.ts
git -C /Users/dongpinhu/Desktop/SENA commit -m "feat: scaffold SENA publication figure generator"
```

## Task 2: Build auditable overall and stage-scoped figure data

**Files:**

- Modify: `sena-hk-template/lib/sena/__tests__/human-concept-publication-figures.test.ts`
- Modify: `sena-hk-template/scripts/generate-sena-human-concept-publication-figures.ts`

- [ ] **Step 1: Add a failing runtime-parity test for `figure-data.json`**

Import `buildSenaModel`, `scopeSenaDatasetToWindow`, `SenaDataset`, and the schema registry in the test:

```ts
import { buildSenaModel, scopeSenaDatasetToWindow } from "../model";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaDataset } from "../types";
```

Before adding more success-path tests, replace the `afterEach` import and hook with `afterAll`, change the suite declaration to `describe("SENA Human–Human and Concept–Concept publication figure generator", { timeout: 120_000 }, () => {`, and cache one successful generator run for the entire suite so six high-resolution rasterizations are not repeated in every test:

```ts

let generatedRun: { outputDir: string; result: ReturnType<typeof runGenerator> } | undefined;

function generateOnce() {
  if (!generatedRun) {
    const outputDir = makeOutputDir();
    generatedRun = {
      outputDir,
      result: runGenerator(["--output-dir", outputDir])
    };
  }
  return generatedRun;
}

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
```

All later success-path tests call `generateOnce()` and reuse its output. The missing-source test remains a separate process run.

Add the following assertions after invoking the generator into a temporary directory:

```ts
const buildOptions = {
  normalization: "max",
  bridgeWeightRule: "count",
  direction: "directed",
  undirectedSocial: false,
  temporal: { mode: "stage" },
  seed: 0
} as const;

it("serializes current-runtime S and W matrices for the overall and stage views", () => {
  const { outputDir, result } = generateOnce();
  expect(result.status, result.stderr).toBe(0);

  const figureData = JSON.parse(readFileSync(path.join(outputDir, "figure-data.json"), "utf8"));
  const dataset = JSON.parse(
    readFileSync(path.join(appRoot, "public/sena-pilot/sample/lesson-study-sena-contract.json"), "utf8")
  ) as SenaDataset;
  const overall = buildSenaModel(dataset, buildOptions);

  expect(figureData.schemaVersion).toBe(SENA_SCHEMA_VERSIONS.humanConceptFigureData);
  expect(figureData.overall.S).toEqual(overall.matrices.S);
  expect(figureData.overall.W).toEqual(overall.matrices.W);
  expect(figureData.stageOrder).toEqual(["Plan", "Teach", "Reflect"]);
  expect(figureData.temporal).toHaveLength(3);
  expect(figureData.temporal.map((entry: { stage: string }) => entry.stage))
    .toEqual(["Plan", "Teach", "Reflect"]);
  expect(figureData.dataContractAudit.status).toBe("valid");
  expect(figureData.publicationUse).toMatchObject({
    classification: "synthetic-demo-figure",
    layoutReady: true,
    empiricalClaimReady: false
  });

  for (const stageData of figureData.temporal) {
    const window = overall.timeline.find((item) => item.label === stageData.stage);
    expect(window).toBeDefined();
    const stageModel = buildSenaModel(scopeSenaDatasetToWindow(dataset, window!), buildOptions);
    expect(stageData.S).toEqual(stageModel.matrices.S);
    expect(stageData.W).toEqual(stageModel.matrices.W);
  }
});
```

- [ ] **Step 2: Run the test and confirm the intended failure**

Expected: failure because `figure-data.json` is absent.

- [ ] **Step 3: Add matrix and stage validation helpers**

Use strict square-matrix validation for both raw and normalized values:

```ts
function assertMatrixBlock(name: "S" | "W", block: SenaMatrixBlock) {
  const size = block.labels.length;
  if (size === 0) throw new Error(`${name} has no labels`);
  for (const [kind, matrix] of [["raw", block.raw], ["normalized", block.normalized]] as const) {
    if (matrix.length !== size || matrix.some((row) => row.length !== size)) {
      throw new Error(`${name}.${kind} dimensions do not match ${size} labels`);
    }
    if (matrix.some((row) => row.some((value) => !Number.isFinite(value)))) {
      throw new Error(`${name}.${kind} contains a non-finite value`);
    }
  }
}

function resolveStageWindows(model: SenaModel) {
  return REQUIRED_STAGES.map((stage) => {
    const window = model.timeline.find(
      (candidate) => candidate.mode === "stage" && candidate.label === stage
    );
    if (!window) throw new Error(`runtime did not resolve required stage ${stage}`);
    return { stage, window };
  });
}
```

- [ ] **Step 4: Construct figure data exclusively from current runtime outputs**

Define the schema contract locally in the generator before constructing the object:

```ts
type StageName = (typeof REQUIRED_STAGES)[number];
type RunIdentity = SenaModel["operatorDiagnostics"]["runIdentity"];

type FigureDataV1 = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.humanConceptFigureData;
  dataset: { source: string; version: string; sha256: string; synthetic: true };
  configuration: SenaModel["options"];
  runIdentity: RunIdentity;
  dataContractAudit: SenaDataContractAudit;
  stageOrder: StageName[];
  publicationUse: {
    classification: "synthetic-demo-figure";
    layoutReady: true;
    empiricalClaimReady: false;
    existingPublicationGate: "not-invoked-by-standalone-figure-generator";
    limitation: string;
  };
  participants: Array<{ id: string; label: string; role: string; initials?: string }>;
  codes: Array<{
    id: string;
    label: string;
    family: string;
    color: string;
    description: string;
  }>;
  overall: { S: SenaMatrixBlock; W: SenaMatrixBlock };
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
    S: { minimumVisible: 1; maximumRaw: number };
    W: { minimumVisible: 1; maximumRaw: number };
  };
  interpretationGuardrails: string[];
};
```

The serialized object must have this stable top-level shape:

```ts
const {
  dataContractAudit,
  dataset,
  datasetVersion,
  sha256: sourceSha256
} = loadDataset(input);
const overallModel = buildSenaModel(dataset, BUILD_OPTIONS);
assertMatrixBlock("S", overallModel.matrices.S);
assertMatrixBlock("W", overallModel.matrices.W);

const temporal = resolveStageWindows(overallModel).map(({ stage, window }) => {
  const scopedDataset = scopeSenaDatasetToWindow(dataset, window);
  const stageModel = buildSenaModel(scopedDataset, BUILD_OPTIONS);
  assertMatrixBlock("S", stageModel.matrices.S);
  assertMatrixBlock("W", stageModel.matrices.W);
  return {
    stage,
    windowId: window.id,
    runIdentity: stageModel.operatorDiagnostics.runIdentity,
    counts: {
      people: scopedDataset.people.length,
      codes: scopedDataset.codebook.length,
      interactions: scopedDataset.interactions.length,
      utterances: scopedDataset.utterances.length,
      codedSegments: scopedDataset.coded_segments.length
    },
    S: stageModel.matrices.S,
    W: stageModel.matrices.W
  };
});

const figureData = createSenaSchemaPayload("humanConceptFigureData", {
  dataset: {
    source: "public/sena-pilot/sample/lesson-study-sena-contract.json",
    version: datasetVersion,
    sha256: sourceSha256,
    synthetic: true
  },
  configuration: overallModel.options,
  runIdentity: overallModel.operatorDiagnostics.runIdentity,
  dataContractAudit,
  stageOrder: [...REQUIRED_STAGES],
  publicationUse: {
    classification: "synthetic-demo-figure",
    layoutReady: true,
    empiricalClaimReady: false,
    existingPublicationGate: "not-invoked-by-standalone-figure-generator",
    limitation: "Method-illustration figures only; not cleared as empirical evidence."
  },
  participants: dataset.people.map(({ id, label, role, initials }) => ({ id, label, role, initials })),
  codes: dataset.codebook.map(({ id, label, family, color, description }) => ({
    id, label, family, color, description
  })),
  overall: { S: overallModel.matrices.S, W: overallModel.matrices.W },
  temporal,
  scales: {
    S: { minimumVisible: 1, maximumRaw: maxNonZero(overallModel.matrices.S.raw, "S") },
    W: { minimumVisible: 1, maximumRaw: maxNonZero(overallModel.matrices.W.raw, "W") }
  },
  interpretationGuardrails: [
    "S encodes observed directed interaction weights; it is not a causal influence model.",
    "W encodes code co-occurrence within unit-scoped stanzas; it is not semantic or causal direction.",
    "The bundled lesson-study dataset is synthetic and supports demonstration, not population inference."
  ]
}) satisfies FigureDataV1;
```

Define the global maximum helper explicitly and fail if a layer has no visible edge:

```ts
function maxNonZero(matrix: number[][], layer: "S" | "W") {
  const maximum = Math.max(0, ...matrix.flat());
  if (maximum <= 0) throw new Error(`${layer} has no non-zero edge to render`);
  return maximum;
}
```

Write JSON with two-space indentation and a terminal newline:

```ts
writeFileSync(
  path.join(outputDir, "figure-data.json"),
  `${JSON.stringify(figureData, null, 2)}\n`,
  "utf8"
);
```

- [ ] **Step 5: Assert the known sample matrix anchors without reimplementing the algorithm**

Add focused regression anchors to the test after the fresh-runtime equality checks:

```ts
expect(figureData.overall.S.raw).toEqual([
  [0, 7, 0, 3],
  [0, 0, 3, 6],
  [4, 6, 0, 0],
  [2, 0, 2, 0]
]);
expect(figureData.overall.W.raw[2][3]).toBe(3); // Evidence–Explanation
expect(figureData.overall.W.raw[2][4]).toBe(3); // Evidence–Critique
expect(figureData.overall.W.raw[3][4]).toBe(3); // Explanation–Critique
```

- [ ] **Step 6: Run focused tests and commit runtime extraction**

```bash
npx vitest run lib/sena/__tests__/human-concept-publication-figures.test.ts
git -C /Users/dongpinhu/Desktop/SENA add sena-hk-template/scripts/generate-sena-human-concept-publication-figures.ts \
  sena-hk-template/lib/sena/__tests__/human-concept-publication-figures.test.ts
git -C /Users/dongpinhu/Desktop/SENA commit -m "feat: derive SENA publication figure data"
```

## Task 3: Render Figure 1 and Figure 2 as deterministic SVG

**Files:**

- Modify: `sena-hk-template/lib/sena/__tests__/human-concept-publication-figures.test.ts`
- Modify: `sena-hk-template/scripts/generate-sena-human-concept-publication-figures.ts`

- [ ] **Step 1: Add failing SVG semantic tests**

Add helpers `readArtifact(outputDir, filename)`, `expectAllText(svg, labels)`, and this font-size guard:

```ts
function expectMinimumFontSize(svg: string, minimum: number) {
  const textCount = (svg.match(/<text\b/g) ?? []).length;
  const sizes = [...svg.matchAll(/<text\b[^>]*font-size="([0-9.]+)"/g)]
    .map((match) => Number(match[1]));
  expect(sizes.length).toBe(textCount);
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(minimum);
}
```

Also add pure test helpers that derive all expected edge IDs from a serialized matrix rather than hard-coding only counts:

```ts
function expectedDirectedEdgeIds(block: { labels: string[]; raw: number[][] }, ids: string[]) {
  return block.raw.flatMap((row, sourceIndex) => row.flatMap((weight, targetIndex) =>
    weight > 0
      ? [`S-${ids[sourceIndex]}-${ids[targetIndex]}`]
      : []
  )).sort();
}

function expectedUndirectedEdgeIds(block: { labels: string[]; raw: number[][] }, ids: string[]) {
  return block.raw.flatMap((row, leftIndex) => row.flatMap((weight, rightIndex) =>
    rightIndex > leftIndex && weight > 0
      ? [`W-${ids[leftIndex]}-${ids[rightIndex]}`]
      : []
  )).sort();
}

function svgEdgeIds(svg: string, prefix: "S" | "W") {
  return [...svg.matchAll(new RegExp(`data-edge-id="(${prefix}-[^"]+)"`, "g"))]
    .map((match) => match[1])
    .sort();
}
```

Then assert:

```ts
it("renders separate publication SVGs for S and W with the approved semantics", () => {
  const { outputDir, result } = generateOnce();
  expect(result.status, result.stderr).toBe(0);

  const humanSvg = readArtifact(outputDir, "figure-1-human-human-overall.svg");
  const conceptSvg = readArtifact(outputDir, "figure-2-concept-concept-overall.svg");
  const figureData = JSON.parse(readArtifact(outputDir, "figure-data.json"));

  expect(humanSvg).toContain('data-figure-id="figure-1-human-human-overall"');
  expect(humanSvg).toContain("<title>Figure 1. Overall Human–Human Network</title>");
  expect(humanSvg).toContain('data-legend="S-encoding"');
  expect(humanSvg).toContain('<rect data-node-kind="human"');
  expect(humanSvg).toContain('<marker id="s-arrow"');
  expect(humanSvg).toContain('marker-end="url(#s-arrow)"');
  expectAllText(humanSvg, ["Ms Lee", "Mr Chan", "Dr Wong", "Ms Ho"]);
  expectAllText(humanSvg, ["Lead teacher", "Curriculum designer", "Research mentor", "Peer observer"]);
  expect((humanSvg.match(/data-edge-id="S-/g) ?? []).length).toBe(8);
  expect(svgEdgeIds(humanSvg, "S")).toEqual(expectedDirectedEdgeIds(
    figureData.overall.S,
    figureData.participants.map((participant: { id: string }) => participant.id)
  ));
  expect(humanSvg).toContain('data-scale-sample="S-1" stroke-width="2.571"');
  expect(humanSvg).toContain('data-scale-sample="S-4" stroke-width="10.286"');
  expect(humanSvg).toContain('data-scale-sample="S-7" stroke-width="18"');
  expectMinimumFontSize(humanSvg, 34);

  expect(conceptSvg).toContain('data-figure-id="figure-2-concept-concept-overall"');
  expect(conceptSvg).toContain("<title>Figure 2. Overall Concept–Concept Network</title>");
  expect(conceptSvg).toContain('data-legend="W-encoding"');
  expect(conceptSvg).toContain('<circle data-node-kind="concept"');
  expect(conceptSvg).toContain('data-layer="W"');
  expect(conceptSvg).toContain('stroke-dasharray="none"');
  expect(conceptSvg).not.toContain("marker-end=");
  expect((conceptSvg.match(/data-edge-id="W-/g) ?? []).length).toBe(20);
  expect(svgEdgeIds(conceptSvg, "W")).toEqual(expectedUndirectedEdgeIds(
    figureData.overall.W,
    figureData.codes.map((code: { id: string }) => code.id)
  ));
  expect(conceptSvg).toContain('data-scale-sample="W-1" stroke-width="5"');
  expect(conceptSvg).toContain('data-scale-sample="W-2" stroke-width="10"');
  expect(conceptSvg).toContain('data-scale-sample="W-3" stroke-width="15"');
  expectMinimumFontSize(conceptSvg, 34);
  expectAllText(conceptSvg, [
    "Question", "Hypothesis", "Evidence", "Explanation", "Critique", "Reflection", "Coordination"
  ]);
  for (const svg of [humanSvg, conceptSvg]) {
    expect(svg).toContain('data-background="opaque-white"');
    expect(svg).not.toMatch(/<(?:filter|linearGradient|radialGradient)\b/);
    expect(svg).not.toMatch(/data-layer="(?:B|G|fusion)"/);
  }
});
```

- [ ] **Step 2: Run the test and confirm both SVG files are missing**

- [ ] **Step 3: Implement shared private SVG primitives**

Implement:

```ts
type Point = { x: number; y: number };

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function widthFor(weight: number, maximum: number, maxWidth: number) {
  if (weight <= 0 || maximum <= 0) return 0;
  return maxWidth * (weight / maximum);
}

function formatNumber(value: number) {
  return Number(value.toFixed(3)).toString();
}

function opacityFor(weight: number, maximum: number) {
  return 0.28 + 0.64 * (weight / maximum);
}

function circularLayout<T extends { id: string }>(
  items: T[], center: Point, radius: number, startAngle = -Math.PI / 2
) {
  return new Map(items.map((item, index) => {
    const angle = startAngle + (index * Math.PI * 2) / items.length;
    return [item.id, { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) }];
  }));
}
```

The SVG shell must set an opaque white background rectangle marked `data-background="opaque-white"`, system font stack, `viewBox`, title, desc, and root `data-figure-id`. Use no CSS classes whose meaning depends on browser styling; write presentation attributes directly so `sharp` renders the same result.

Validate required semantics before writing an SVG:

```ts
function assertSvgContent(figureId: string, svg: string, requiredText: string[]) {
  if (!svg.startsWith("<svg") || !svg.endsWith("</svg>")) {
    throw new Error(`${figureId} is not a complete SVG document`);
  }
  for (const value of requiredText) {
    if (!svg.includes(escapeXml(value)) && !svg.includes(value)) {
      throw new Error(`${figureId} is missing required SVG content: ${value}`);
    }
  }
  if (!svg.includes("data-legend=")) {
    throw new Error(`${figureId} is missing its encoding legend`);
  }
}
```

Call it with the figure title, every required node label, and the legend marker before `writeFileSync`.

- [ ] **Step 4: Implement Figure 1**

Use the participant order from `dataset.people`, centered at `(900, 620)` with radius `410`, and render `420 × 132` rounded rectangles marked `data-node-kind="human"`. Clip edge endpoints to node boundaries. For each non-zero directed `S[i][j]`:

- use `stroke="#2563eb"`, `fill="none"`, and `marker-end="url(#s-arrow)"`;
- map raw weight `1…7` proportionally from the zero anchor to a maximum `18 px` with `widthFor(weight, 7, 18)`;
- apply opposite quadratic offsets to reciprocal pairs so `T1→T4` and `T4→T1` do not overlap;
- place raw numeric weight at the quadratic midpoint with `paint-order="stroke"`, white `stroke-width="8"` halo;
- draw edges before nodes so arrow paths never obscure labels;
- include a three-sample width legend labeled `1`, `4`, and `7` and a direction arrow;
- include subtitle `Directed Human–Human interaction network (S), full lesson-study cycle`.

Use deterministic `data-edge-id="S-${sourceId}-${targetId}"`, `data-weight`, and `data-stroke-width` attributes. Give legend strokes `data-scale-sample="S-1"`, `S-4`, and `S-7`; their formatted widths must be `2.571`, `10.286`, and `18`. Put the stable participant ID in `data-node-id`, not in visible text; render full name on the first visible line and role on the second.
Set every visible `<text>` element in Figures 1 and 2 to an explicit `font-size` of at least `34` SVG user units; do not rely on inherited font size.

- [ ] **Step 5: Implement Figure 2**

Use codebook order around center `(900, 620)` with radius `390` and fixed node radius `52`, marking each circle `data-node-kind="concept"`. For each upper-triangle non-zero `W[i][j]`:

- use solid `stroke="#7e22ce"`, `stroke-dasharray="none"`, `fill="none"`;
- do not add arrowheads;
- map raw weight `1…3` proportionally from the zero anchor to a maximum `15 px` with `widthFor(weight, 3, 15)`;
- lower opacity for weight 1 while retaining every non-zero edge;
- draw links before nodes;
- fill each node with its codebook color, add a white inner stroke and dark outer keyline;
- place labels outside the circle at radius `500`, with a short leader line to the node;
- include a legend defining W as unit-scoped stanza co-occurrence and stating `undirected; no causal direction`.

Use deterministic `data-edge-id="W-${leftCodeId}-${rightCodeId}"` in upper-triangle matrix order, plus `data-weight` and `data-stroke-width` attributes. The matrix labels remain visible labels, while edge IDs map by the same index into `figureData.codes`. Give legend strokes `data-scale-sample="W-1"`, `W-2`, and `W-3`; their widths must be `5`, `10`, and `15`. Include subtitle `Concept–Concept co-occurrence network (W), full lesson-study cycle`.

- [ ] **Step 6: Run focused tests and inspect SVG structure**

```bash
npx vitest run lib/sena/__tests__/human-concept-publication-figures.test.ts
npm run sena:figures:human-concept
rg -n "marker-end|stroke-dasharray|data-layer|Ms Lee|Evidence" \
  output/sena-publication-figures-human-concept/*.svg
```

Expected: Figure 1 has marker ends; Figure 2 has solid W links and no marker ends.

- [ ] **Step 7: Commit the overall SVG figures**

```bash
git -C /Users/dongpinhu/Desktop/SENA add sena-hk-template/scripts/generate-sena-human-concept-publication-figures.ts \
  sena-hk-template/lib/sena/__tests__/human-concept-publication-figures.test.ts
git -C /Users/dongpinhu/Desktop/SENA commit -m "feat: render overall SENA S and W figures"
```

## Task 4: Render Figure 3 paired temporal small multiples

**Files:**

- Modify: `sena-hk-template/lib/sena/__tests__/human-concept-publication-figures.test.ts`
- Modify: `sena-hk-template/scripts/generate-sena-human-concept-publication-figures.ts`

- [ ] **Step 1: Add a failing six-panel temporal SVG test**

```ts
it("renders paired Plan–Teach–Reflect S/W panels with shared scales and stable labels", () => {
  const { outputDir, result } = generateOnce();
  expect(result.status, result.stderr).toBe(0);
  const svg = readArtifact(outputDir, "figure-3-temporal-paired-small-multiples.svg");

  expect(svg).toContain('data-figure-id="figure-3-temporal-paired-small-multiples"');
  expect(svg).toContain("<title>Figure 3. Plan–Teach–Reflect S and W Networks</title>");
  expect(svg).toContain('data-legend="shared-temporal-encoding"');
  for (const stage of ["Plan", "Teach", "Reflect"]) {
    expect(svg).toContain(`data-panel-id="${stage}-S"`);
    expect(svg).toContain(`data-panel-id="${stage}-W"`);
  }
  expect((svg.match(/data-panel-id=/g) ?? []).length).toBe(6);
  expect((svg.match(/data-node-kind="human"/g) ?? []).length).toBe(12);
  expect((svg.match(/data-node-kind="concept"/g) ?? []).length).toBe(21);
  expect(svg).toContain('data-active="false"');
  expect(svg).toContain('data-scale="shared-S-1-7"');
  expect(svg).toContain('data-scale="shared-W-1-3"');
  expect((svg.match(/data-scale="shared-S-1-7"/g) ?? []).length).toBe(1);
  expect((svg.match(/data-scale="shared-W-1-3"/g) ?? []).length).toBe(1);
  expect(svg).not.toContain("data-edge-label=");
  expect(svg).not.toMatch(/data-layer="(?:B|G|fusion)"/);
  expectAllText(svg, ["Ms Lee", "Mr Chan", "Dr Wong", "Ms Ho"]);
  expectAllText(svg, [
    "Question", "Hypothesis", "Evidence", "Explanation", "Critique", "Reflection", "Coordination"
  ]);
  expectMinimumFontSize(svg, 34);
});
```

Extend that test by loading `figure-data.json` and deriving the exact expected temporal edge IDs from all three stage matrices, mapping matrix indices through `figureData.participants[index].id` and `figureData.codes[index].id` rather than using display labels. Use XML-safe IDs `data-temporal-edge-id="Plan:S:T1:T2"` for directed S and `data-temporal-edge-id="Plan:W:question:hypothesis"` for upper-triangle W. Compare the sorted expected and actual ID sets exactly. For every element carrying an S temporal edge ID, require `marker-end="url(#s-arrow-temporal)"`; for every W temporal edge, require `stroke-dasharray="none"` and no `marker-end`.

Each node instance must expose the normalized coordinates actually used by the renderer as `data-layout-coordinate="human:T1:x:y"` or `concept:question:x:y`. Extract these values and require exactly 11 unique layout-coordinate strings, each repeated exactly three times—once per stage. This makes positional stability an automated invariant rather than visual intent only.

- [ ] **Step 2: Run the test and confirm Figure 3 is missing**

- [ ] **Step 3: Implement the 2 × 3 plate with shared geometry**

Use canvas `2400 × 1440`, outer margins `90`, title band `150`, legend band `150`, horizontal gap `36`, and vertical gap `44`. The three panel columns are equal width. Each panel carries:

- `data-panel-id="${stage}-S"` or `data-panel-id="${stage}-W"`;
- stage header with counts from the scoped dataset;
- top-row label `Human–Human S` and bottom-row label `Concept–Concept W`;
- a light gray panel keyline and white fill.

Set every visible Figure 3 `<text>` element to an explicit `font-size` of at least `34` SVG user units.

Compute the participant mini-layout once in normalized panel coordinates and reuse it in all top panels. Compute the concept mini-layout once and reuse it in all bottom panels. Do not call force layout.

- [ ] **Step 4: Apply global width scales and inactive-node treatment**

Use the overall maximum `S=7` for all top-row widths and overall maximum `W=3` for all bottom-row widths. Do not rescale within a stage. An inactive node has no incident non-zero edge in that stage and must remain present with:

```xml
opacity="0.28" data-active="false"
```

Active nodes use `opacity="1" data-active="true"`. Mark every mini-node with `data-node-kind="human"` or `data-node-kind="concept"` and the exact `data-layout-coordinate` described in the test, so the plate contains exactly 12 participant instances and 21 concept instances. Give every temporal edge its exact `data-temporal-edge-id`. Stage S edges retain arrowheads; stage W links remain solid and undirected. Omit numeric edge labels and the `data-edge-label` attribute inside panels.

- [ ] **Step 5: Add the one shared legend**

The footer legend must include exactly one S scale and one W scale, not six repeated legends. Mark them:

```xml
<g data-scale="shared-S-1-7" aria-label="Shared S raw-weight scale">
  <line x1="0" y1="0" x2="90" y2="0" stroke="#2563eb" stroke-width="18" />
  <text x="108" y="7">S raw weight 1–7</text>
</g>
<g data-scale="shared-W-1-3" aria-label="Shared W raw-weight scale">
  <line x1="0" y1="0" x2="90" y2="0" stroke="#7e22ce" stroke-width="15" stroke-dasharray="none" />
  <text x="108" y="7">W raw co-occurrence 1–3</text>
</g>
```

State: `Fixed node positions across stages; widths use global raw-weight scales; muted nodes are inactive in that stage.`

- [ ] **Step 6: Run focused tests and commit the temporal plate**

```bash
npx vitest run lib/sena/__tests__/human-concept-publication-figures.test.ts
git -C /Users/dongpinhu/Desktop/SENA add sena-hk-template/scripts/generate-sena-human-concept-publication-figures.ts \
  sena-hk-template/lib/sena/__tests__/human-concept-publication-figures.test.ts
git -C /Users/dongpinhu/Desktop/SENA commit -m "feat: render temporal SENA paired panels"
```

## Task 5: Rasterize PNGs and close the publication provenance chain

**Files:**

- Modify: `sena-hk-template/lib/sena/__tests__/human-concept-publication-figures.test.ts`
- Modify: `sena-hk-template/scripts/generate-sena-human-concept-publication-figures.ts`

- [ ] **Step 1: Add a failing nine-artifact, dimensions, captions, and hash test**

Define the exact required filenames:

```ts
const requiredArtifacts = [
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
```

The test must assert all files are non-empty, use `await sharp(path).metadata()` to parse each SVG and inspect each PNG, and check:

```ts
expect(await imageDimensions(fig1Svg)).toEqual({ width: 1800, height: 1200 });
expect(await imageDimensions(fig1Png)).toEqual({ width: 3600, height: 2400 });
expect(await imageDimensions(fig2Svg)).toEqual({ width: 1800, height: 1200 });
expect(await imageDimensions(fig2Png)).toEqual({ width: 3600, height: 2400 });
expect(await imageDimensions(fig3Svg)).toEqual({ width: 2400, height: 1440 });
expect(await imageDimensions(fig3Png)).toEqual({ width: 4800, height: 2880 });
```

For every entry in `manifest.artifacts`, recompute bytes and SHA-256 from the actual file and require equality. Assert that the manifest lists exactly eight payload files and intentionally excludes itself.
Also assert `manifest.matrices.overall` equals `figureData.overall`, and each `manifest.matrices.temporal` S/W block equals the corresponding stage entry in `figure-data.json`.

Import `writeFileSync` and `readdirSync` into the test and add two atomic-publication cases:

```ts
it("leaves the previous output untouched when rasterization fails", () => {
  const outputDir = makeOutputDir();
  const previousManifest = path.join(outputDir, "figure-manifest.json");
  writeFileSync(previousManifest, "previous-manifest\n", "utf8");

  const result = runGenerator(
    ["--output-dir", outputDir],
    appRoot,
    { NODE_ENV: "test", SENA_FIGURE_TEST_FAIL_PNG: "1" }
  );

  expect(result.status).toBe(1);
  expect(readFileSync(previousManifest, "utf8")).toBe("previous-manifest\n");
  expect(readdirSync(outputDir)).toEqual(["figure-manifest.json"]);
});

it("fails closed rather than deleting unknown output-directory content", () => {
  const outputDir = makeOutputDir();
  const sentinel = path.join(outputDir, "researcher-notes.txt");
  writeFileSync(sentinel, "keep me\n", "utf8");
  const result = runGenerator(["--output-dir", outputDir]);

  expect(result.status).toBe(1);
  expect(result.stderr).toContain("output directory contains unknown files");
  expect(readFileSync(sentinel, "utf8")).toBe("keep me\n");
});
```

Add a deterministic replay test that generates into a second empty temporary directory with the same `SOURCE_DATE_EPOCH` and compares all nine files byte-for-byte with the cached successful run.

- [ ] **Step 2: Run the focused test and confirm PNG/manifest/caption failures**

- [ ] **Step 3: Generate into a sibling staging directory and publish atomically**

Use the exact required filename allow-list from the test. Before any rendering, fail if an existing final directory contains any other entry. Create the staging directory beside the final output so `renameSync` stays on the same filesystem:

```ts
function assertOutputDirectoryReplaceable(outputDir: string, allowed: Set<string>) {
  if (!existsSync(outputDir)) return;
  const unknown = readdirSync(outputDir).filter((entry) => !allowed.has(entry));
  if (unknown.length > 0) {
    throw new Error(`output directory contains unknown files: ${unknown.join(", ")}`);
  }
}

function createStagingDirectory(outputDir: string) {
  const parent = path.dirname(outputDir);
  mkdirSync(parent, { recursive: true });
  return mkdtempSync(path.join(parent, `.${path.basename(outputDir)}.staging-`));
}

function publishStagingDirectory(stagingDir: string, outputDir: string) {
  const backupDir = `${outputDir}.previous-${process.pid}-${Date.now()}`;
  let previousMoved = false;
  try {
    if (existsSync(outputDir)) {
      if (existsSync(backupDir)) throw new Error(`backup path already exists: ${backupDir}`);
      renameSync(outputDir, backupDir);
      previousMoved = true;
    }
    renameSync(stagingDir, outputDir);
  } catch (error) {
    if (!existsSync(outputDir) && previousMoved && existsSync(backupDir)) {
      renameSync(backupDir, outputDir);
    }
    throw error;
  }
  if (previousMoved) rmSync(backupDir, { recursive: true, force: true });
}
```

Write and validate all nine files in `stagingDir`. Only call `publishStagingDirectory` after SVG checks, PNG checks, artifact counts, and hashes pass. In a `finally` block, remove only a still-existing generator-owned staging directory. Never remove an unknown final-directory entry.

- [ ] **Step 4: Render PNG from the authoritative SVG strings**

Use lossless PNG output and exact dimensions:

```ts
async function writePng(svg: string, outputPath: string, width: number, height: number) {
  await sharp(Buffer.from(svg), { density: 144 })
    .resize(width, height, { fit: "fill" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);
}
```

At Sharp's 72-DPI SVG baseline, density `144` rasterizes directly at approximately 2× before the exact-dimension resize; do not use `600`, which would create an unnecessary `20000 × 12000` intermediate for Figure 3. Do not redraw in Canvas or a second plotting library. SVG remains the single rendering source.

Immediately before the first raster call, include this guarded test seam so the atomic-failure test can prove rollback behavior without affecting normal execution:

```ts
if (process.env.NODE_ENV === "test" && process.env.SENA_FIGURE_TEST_FAIL_PNG === "1") {
  throw new Error("injected PNG rendering failure");
}
```

- [ ] **Step 5: Write complete manuscript captions**

`captions.md` must contain three headings and these meanings:

- Figure 1 defines `S` as directed observed interaction weight, identifies arrow and width encodings, says the dataset is synthetic, and disclaims causal influence.
- Figure 2 defines `W` as undirected code co-occurrence within `unitId × stanzaId`, identifies raw-width encoding, and disclaims semantic or causal direction.
- Figure 3 explains stage scoping, fixed positions, shared global raw-weight scales, inactive-node muting, and the descriptive/non-causal interpretation.

End with a `Data and software note` naming the source contract, dataset version, source SHA-256, runtime configuration, and the overall runtime dataset/config hashes.
Add a final sentence verbatim: `These synthetic demonstration figures are layout-ready but are not cleared for empirical claims or population inference.`

- [ ] **Step 6: Build and write the manifest after all other payloads exist**

Resolve the generation clock reproducibly when `SOURCE_DATE_EPOCH` is present:

```ts
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
```

Destructure `generatedAt` and `generationClock` once and use those values below.

Use this shape:

```ts
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

const manifest = createSenaSchemaPayload("humanConceptPublicationFigureManifest", {
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
      stage, windowId, runIdentity
    })),
    environment: {
      node: process.version,
      sharp: sharp.versions.sharp,
      libvips: sharp.versions.vips,
      platform: process.platform,
      arch: process.arch,
      fontFallback: ["Arial", "Helvetica", "sans-serif"]
    }
  },
  matrices: {
    overall: figureData.overall,
    temporal: figureData.temporal.map(({ stage, windowId, S, W }) => ({
      stage, windowId, S, W
    }))
  },
  artifactCount: artifactRecords.length,
  artifacts: artifactRecords,
  interpretationGuardrails: figureData.interpretationGuardrails,
  selfHashPolicy: "The manifest hashes eight payload artifacts and does not self-hash."
}) satisfies FigureManifestV1;
```

Build records from file bytes, not from in-memory source strings. Write the manifest last.

- [ ] **Step 7: Run the complete focused suite and package command**

```bash
npx vitest run lib/sena/__tests__/human-concept-publication-figures.test.ts
npm run sena:figures:human-concept
find output/sena-publication-figures-human-concept -maxdepth 1 -type f -print | sort
```

Expected: focused tests pass and exactly nine output files are listed.

- [ ] **Step 8: Commit the completed generator and its tests**

```bash
git -C /Users/dongpinhu/Desktop/SENA add sena-hk-template/scripts/generate-sena-human-concept-publication-figures.ts \
  sena-hk-template/lib/sena/__tests__/human-concept-publication-figures.test.ts
git -C /Users/dongpinhu/Desktop/SENA commit -m "feat: export SENA publication figure package"
```

## Task 6: Generate, visually inspect, and refine the approved synthetic figure artifacts

**Files:**

- Create: `sena-hk-template/output/sena-publication-figures-human-concept/figure-1-human-human-overall.svg`
- Create: `sena-hk-template/output/sena-publication-figures-human-concept/figure-1-human-human-overall.png`
- Create: `sena-hk-template/output/sena-publication-figures-human-concept/figure-2-concept-concept-overall.svg`
- Create: `sena-hk-template/output/sena-publication-figures-human-concept/figure-2-concept-concept-overall.png`
- Create: `sena-hk-template/output/sena-publication-figures-human-concept/figure-3-temporal-paired-small-multiples.svg`
- Create: `sena-hk-template/output/sena-publication-figures-human-concept/figure-3-temporal-paired-small-multiples.png`
- Create: `sena-hk-template/output/sena-publication-figures-human-concept/figure-data.json`
- Create: `sena-hk-template/output/sena-publication-figures-human-concept/figure-manifest.json`
- Create: `sena-hk-template/output/sena-publication-figures-human-concept/captions.md`
- Modify if QA requires: `sena-hk-template/scripts/generate-sena-human-concept-publication-figures.ts`

- [ ] **Step 1: Snapshot the dirty worktree before approved artifact generation**

```bash
git -C /Users/dongpinhu/Desktop/SENA status --porcelain=v1 -z \
  > /tmp/sena-figure-pre-generation-status.z
```

Do not clean, stash, reset, or delete any existing user file.

- [ ] **Step 2: Generate the approved nine-artifact package**

```bash
cd /Users/dongpinhu/Desktop/SENA/sena-hk-template
npm run sena:figures:human-concept
```

- [ ] **Step 3: Inspect all three PNGs at full resolution**

Use the local image viewer on:

```text
/Users/dongpinhu/Desktop/SENA/sena-hk-template/output/sena-publication-figures-human-concept/figure-1-human-human-overall.png
/Users/dongpinhu/Desktop/SENA/sena-hk-template/output/sena-publication-figures-human-concept/figure-2-concept-concept-overall.png
/Users/dongpinhu/Desktop/SENA/sena-hk-template/output/sena-publication-figures-human-concept/figure-3-temporal-paired-small-multiples.png
```

Check at original detail:

- titles, subtitles, names, roles, external concept labels, legends, and panels are not clipped;
- no label overlap makes text unreadable;
- Figure 1 reciprocal arcs are visually separable;
- Figure 2 weight-3 triangle remains dominant without hiding weight-1 links;
- Figure 3 preserves identical node coordinates across Plan, Teach, and Reflect;
- muted inactive nodes remain identifiable;
- all colors remain legible against white and the figures work without the SENA UI.

- [ ] **Step 4: Make only generator-level visual refinements**

If QA finds a defect, change deterministic coordinates, label anchors, margins, edge curvature, line-width bounds, or font sizes in the generator; never hand-edit generated SVG/PNG. Re-run the focused test and regenerate all artifacts after each change.

- [ ] **Step 5: Verify artifact hashes and worktree containment**

```bash
cd /Users/dongpinhu/Desktop/SENA/sena-hk-template
npx vitest run lib/sena/__tests__/human-concept-publication-figures.test.ts
git -C /Users/dongpinhu/Desktop/SENA status --short --untracked-files=all
```

Review the complete status listing. The only new paths at this point must be the nine files under `sena-hk-template/output/sena-publication-figures-human-concept/`; pre-existing user changes must still be present and untouched.

- [ ] **Step 6: Commit the approved synthetic figure artifacts**

```bash
cd /Users/dongpinhu/Desktop/SENA
git -C /Users/dongpinhu/Desktop/SENA add \
  sena-hk-template/output/sena-publication-figures-human-concept
git -C /Users/dongpinhu/Desktop/SENA commit -m "docs: add SENA human and concept figures"
```

## Task 7: Run regression gates and perform final specification audit

**Files:**

- Verify: `docs/superpowers/specs/2026-07-11-sena-human-concept-publication-figures-design.md`
- Verify: `sena-hk-template/scripts/generate-sena-human-concept-publication-figures.ts`
- Verify: `sena-hk-template/lib/sena/__tests__/human-concept-publication-figures.test.ts`
- Verify: `sena-hk-template/output/sena-publication-figures-human-concept/*`

- [ ] **Step 1: Run the focused contract suite**

```bash
cd /Users/dongpinhu/Desktop/SENA/sena-hk-template
npx vitest run lib/sena/__tests__/human-concept-publication-figures.test.ts
```

Expected: all publication-figure tests pass.

- [ ] **Step 2: Run repository lint, build, and the full unit/integration suite**

```bash
npm run lint
npm run build
npm test
```

Expected: all three exit `0`. A browser pilot gate is unnecessary because no workspace route or UI code changes. If a failure is pre-existing or unrelated, capture its exact command and error; do not weaken or delete the failing check.

- [ ] **Step 3: Scan for incomplete implementation markers**

```bash
rg -n "TODO|FIXME|placeholder|coming soon|throw new Error\(\"not implemented" \
  scripts/generate-sena-human-concept-publication-figures.ts \
  lib/sena/__tests__/human-concept-publication-figures.test.ts \
  output/sena-publication-figures-human-concept
```

Expected: no matches.

- [ ] **Step 4: Audit all twelve verification requirements from the design spec**

Record evidence that:

1. the generator exits `0`;
2. all nine artifacts are non-empty;
3. overall S/W exactly equal fresh runtime outputs;
4. temporal order is Plan–Teach–Reflect;
5. four participant labels appear in Figures 1 and 3;
6. seven concept labels appear in Figures 2 and 3;
7. Figure 1 uses directed arrow markers;
8. Figure 2 uses solid W links without arrow markers;
9. Figure 3 contains six panels and two shared scales;
10. `sharp` parses all SVG/PNG assets and dimensions match;
11. all eight manifest payload hashes match disk bytes; and
12. generation changed no unrelated tracked or user-owned files.

- [ ] **Step 5: Review the final diff and commit any test/QA correction**

```bash
cd /Users/dongpinhu/Desktop/SENA
git -C /Users/dongpinhu/Desktop/SENA diff --check
git -C /Users/dongpinhu/Desktop/SENA status --short
git -C /Users/dongpinhu/Desktop/SENA log --oneline -6
```

If QA required code corrections after the artifact commit, stage only the generator, focused test, and regenerated nine-artifact directory, then commit:

```bash
git -C /Users/dongpinhu/Desktop/SENA add sena-hk-template/scripts/generate-sena-human-concept-publication-figures.ts \
  sena-hk-template/lib/sena/__tests__/human-concept-publication-figures.test.ts \
  sena-hk-template/output/sena-publication-figures-human-concept
git -C /Users/dongpinhu/Desktop/SENA commit -m "fix: refine SENA publication figure readability"
```

- [ ] **Step 6: Hand off with clickable artifact paths and verification evidence**

After all implementation/QA commits, prove the residual dirty state matches the Task 0 baseline byte-for-byte:

```bash
git -C /Users/dongpinhu/Desktop/SENA status --porcelain=v1 -z \
  > /tmp/sena-human-concept-final-status.z
cmp /tmp/sena-human-concept-baseline-status.z \
  /tmp/sena-human-concept-final-status.z
```

Expected: `cmp` exits `0`. If it does not, inspect exact NUL-delimited entries and resolve only changes owned by this plan; never remove a pre-existing user file to force equality.

Report the three PNGs first, followed by SVG/data/manifest/captions, exact passing commands, and any remaining limitation. State explicitly that this figure set covers Human–Human and Concept–Concept relations only; Human–AI modeling remains a separate data-contract/runtime extension.

## Completion definition

The work is complete only when the nine artifacts exist at the approved output path, all matrices are current-runtime-derived, all semantic and visual checks pass, the three original-resolution PNGs have been visually inspected, regression gates are green (or exact unrelated failures are disclosed), and the worktree contains no unintended changes.
