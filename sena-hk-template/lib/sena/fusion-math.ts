import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import type { SenaFusionMathAudit, SenaFusionMathAuditArtifact, SenaFusionMathAuditItem, SenaMatrixFingerprint, SenaModel, SenaTemporalWindow } from "./types";

const defaultTolerance = 1e-9;
const fusionFormula = "A_fusion = [alpha*S gamma*B_PC; gamma*B_CP beta*W]";
const matrixFingerprintAlgorithm = "sena-stable-fnv1a32/v1" as const;

export type SenaFusionMathAuditArtifactOptions = {
  title?: string;
  generatedAt?: string;
  activeTemporalWindow?: SenaTemporalWindow | null;
  tolerance?: number;
};

function sameStrings(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function finiteMatrix(values: number[][]) {
  return Array.isArray(values) && values.every((row) => (
    Array.isArray(row) && row.every((value) => typeof value === "number" && Number.isFinite(value))
  ));
}

function nonnegativeMatrix(values: number[][]) {
  return Array.isArray(values) && values.every((row) => (
    Array.isArray(row) && row.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)
  ));
}

function exactMatrixShape(values: number[][], rows: number, columns: number) {
  return Array.isArray(values) && values.length === rows && values.every((row) => (
    Array.isArray(row) && row.length === columns
  ));
}

function stableNumber(value: number) {
  if (!Number.isFinite(value)) return String(value);
  return Number((Object.is(value, -0) ? 0 : value).toPrecision(15));
}

function stableMatrix(values: number[][]) {
  return values.map((row) => Array.isArray(row) ? row.map(stableNumber) : []);
}

function matrixTotal(values: number[][]) {
  const total = values.reduce((sum, row) => (
    sum + (Array.isArray(row) ? row.reduce((rowSum, value) => rowSum + (Number.isFinite(value) ? value : 0), 0) : 0)
  ), 0);
  return stableNumber(total) as number;
}

function matrixNonZero(values: number[][]) {
  return values.reduce((count, row) => (
    count + (Array.isArray(row) ? row.filter((value) => Number.isFinite(value) && Math.abs(value) > 0).length : 0)
  ), 0);
}

function fnv1a32(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `0x${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function matrixFingerprint({
  id,
  label,
  rowLabels,
  columnLabels,
  pairIds,
  raw,
  normalized,
  values
}: {
  id: SenaMatrixFingerprint["id"];
  label: string;
  rowLabels: string[];
  columnLabels: string[];
  pairIds?: string[];
  raw?: number[][];
  normalized?: number[][];
  values?: number[][];
}): SenaMatrixFingerprint {
  const payload = {
    id,
    rowLabels,
    columnLabels,
    pairIds,
    raw: raw ? stableMatrix(raw) : undefined,
    normalized: normalized ? stableMatrix(normalized) : undefined,
    values: values ? stableMatrix(values) : undefined
  };
  return {
    id,
    label,
    shape: `${rowLabels.length}x${columnLabels.length}`,
    checksumAlgorithm: matrixFingerprintAlgorithm,
    checksum: fnv1a32(JSON.stringify(payload)),
    valueKinds: [
      ...(raw ? ["raw" as const] : []),
      ...(normalized ? ["normalized" as const] : []),
      ...(values ? ["values" as const] : [])
    ],
    totals: {
      raw: raw ? matrixTotal(raw) : undefined,
      normalized: normalized ? matrixTotal(normalized) : undefined,
      values: values ? matrixTotal(values) : undefined
    },
    nonZero: {
      raw: raw ? matrixNonZero(raw) : undefined,
      normalized: normalized ? matrixNonZero(normalized) : undefined,
      values: values ? matrixNonZero(values) : undefined
    },
    rowLabels,
    columnLabels,
    pairIds
  };
}

export function buildSenaMatrixFingerprints(model: SenaModel): SenaMatrixFingerprint[] {
  return [
    matrixFingerprint({
      id: "S",
      label: "Social S matrix",
      rowLabels: model.matrices.S.labels,
      columnLabels: model.matrices.S.labels,
      raw: model.matrices.S.raw,
      normalized: model.matrices.S.normalized
    }),
    matrixFingerprint({
      id: "W",
      label: "Epistemic W matrix",
      rowLabels: model.matrices.W.labels,
      columnLabels: model.matrices.W.labels,
      raw: model.matrices.W.raw,
      normalized: model.matrices.W.normalized
    }),
    matrixFingerprint({
      id: "B",
      label: "Bridge B matrix",
      rowLabels: model.matrices.B.rowLabels,
      columnLabels: model.matrices.B.columnLabels,
      raw: model.matrices.B.raw,
      normalized: model.matrices.B.normalized
    }),
    matrixFingerprint({
      id: "B_PC",
      label: "Person-to-code bridge B_PC matrix",
      rowLabels: model.matrices.B_PC.rowLabels,
      columnLabels: model.matrices.B_PC.columnLabels,
      raw: model.matrices.B_PC.raw,
      normalized: model.matrices.B_PC.normalized
    }),
    matrixFingerprint({
      id: "B_CP",
      label: "Code-to-person bridge B_CP matrix",
      rowLabels: model.matrices.B_CP.rowLabels,
      columnLabels: model.matrices.B_CP.columnLabels,
      raw: model.matrices.B_CP.raw,
      normalized: model.matrices.B_CP.normalized
    }),
    matrixFingerprint({
      id: "G",
      label: "Person-code-pair G matrix",
      rowLabels: model.matrices.G.rowLabels,
      columnLabels: model.matrices.G.columnLabels,
      pairIds: model.matrices.G.pairIds,
      raw: model.matrices.G.raw,
      normalized: model.matrices.G.normalized
    }),
    matrixFingerprint({
      id: "A_fusion",
      label: "Weighted fusion adjacency matrix",
      rowLabels: model.matrices.fusion.labels,
      columnLabels: model.matrices.fusion.labels,
      values: model.matrices.fusion.values
    })
  ];
}

function maxDeltaForBlock({
  rows,
  columns,
  expectedAt,
  actualAt
}: {
  rows: number;
  columns: number;
  expectedAt: (row: number, column: number) => number;
  actualAt: (row: number, column: number) => number;
}) {
  let maxDelta = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const expected = expectedAt(row, column);
      const actual = actualAt(row, column);
      const delta = Math.abs((Number.isFinite(actual) ? actual : Number.NaN) - expected);
      maxDelta = Number.isFinite(delta) ? Math.max(maxDelta, delta) : Number.POSITIVE_INFINITY;
    }
  }
  return maxDelta;
}

function item(
  id: string,
  label: string,
  passed: boolean,
  expected: string,
  actual: string,
  detail: string[],
  maxDelta?: number,
  tolerance = defaultTolerance
): SenaFusionMathAuditItem {
  return {
    id,
    label,
    status: passed ? "pass" : "review",
    expected,
    actual,
    maxDelta,
    tolerance: maxDelta === undefined ? undefined : tolerance,
    detail
  };
}

export function buildSenaFusionMathAudit(model: SenaModel, tolerance = defaultTolerance): SenaFusionMathAudit {
  const peopleCount = model.matrices.S.labels.length;
  const codeCount = model.matrices.W.labels.length;
  const fusion = model.matrices.fusion.values;
  const options = model.options;
  const expectedLabels = [...model.matrices.S.labels, ...model.matrices.W.labels];
  const codePairCount = (codeCount * Math.max(0, codeCount - 1)) / 2;
  const fusionSize = peopleCount + codeCount;

  const matrixShapesPass = exactMatrixShape(model.matrices.S.raw, peopleCount, peopleCount) &&
    exactMatrixShape(model.matrices.S.normalized, peopleCount, peopleCount) &&
    exactMatrixShape(model.matrices.W.raw, codeCount, codeCount) &&
    exactMatrixShape(model.matrices.W.normalized, codeCount, codeCount) &&
    exactMatrixShape(model.matrices.B.raw, peopleCount, codeCount) &&
    exactMatrixShape(model.matrices.B.normalized, peopleCount, codeCount) &&
    exactMatrixShape(model.matrices.B_PC.raw, peopleCount, codeCount) &&
    exactMatrixShape(model.matrices.B_PC.normalized, peopleCount, codeCount) &&
    exactMatrixShape(model.matrices.B_CP.raw, codeCount, peopleCount) &&
    exactMatrixShape(model.matrices.B_CP.normalized, codeCount, peopleCount) &&
    exactMatrixShape(model.matrices.G.raw, peopleCount, codePairCount) &&
    exactMatrixShape(model.matrices.G.normalized, peopleCount, codePairCount) &&
    exactMatrixShape(fusion, fusionSize, fusionSize);
  const dimensionsPass = peopleCount > 0 && codeCount > 0 &&
    sameStrings(model.matrices.S.labels, model.matrices.B.rowLabels) &&
    sameStrings(model.matrices.W.labels, model.matrices.B.columnLabels) &&
    sameStrings(model.matrices.B.rowLabels, model.matrices.B_PC.rowLabels) &&
    sameStrings(model.matrices.B.columnLabels, model.matrices.B_PC.columnLabels) &&
    sameStrings(model.matrices.W.labels, model.matrices.B_CP.rowLabels) &&
    sameStrings(model.matrices.S.labels, model.matrices.B_CP.columnLabels) &&
    sameStrings(expectedLabels, model.matrices.fusion.labels) &&
    matrixShapesPass;

  const auditedMatrices = [
    ["S.raw", model.matrices.S.raw],
    ["S.normalized", model.matrices.S.normalized],
    ["W.raw", model.matrices.W.raw],
    ["W.normalized", model.matrices.W.normalized],
    ["B.raw", model.matrices.B.raw],
    ["B.normalized", model.matrices.B.normalized],
    ["B_PC.raw", model.matrices.B_PC.raw],
    ["B_PC.normalized", model.matrices.B_PC.normalized],
    ["B_CP.raw", model.matrices.B_CP.raw],
    ["B_CP.normalized", model.matrices.B_CP.normalized],
    ["G.raw", model.matrices.G.raw],
    ["G.normalized", model.matrices.G.normalized],
    ["A_fusion.values", fusion]
  ] as const;
  const allFinite = dimensionsPass && auditedMatrices.every(([, values]) => finiteMatrix(values)) &&
    [options.alpha, options.beta, options.gamma].every(Number.isFinite);
  const allNonnegative = dimensionsPass && auditedMatrices.every(([, values]) => nonnegativeMatrix(values)) &&
    [options.alpha, options.beta, options.gamma].every((value) => Number.isFinite(value) && value >= 0);

  const socialDelta = maxDeltaForBlock({
    rows: peopleCount,
    columns: peopleCount,
    expectedAt: (row, column) => options.alpha * (model.matrices.S.normalized[row]?.[column] ?? 0),
    actualAt: (row, column) => fusion[row]?.[column] ?? Number.NaN
  });

  const bridgeDelta = maxDeltaForBlock({
    rows: peopleCount,
    columns: codeCount,
    expectedAt: (row, column) => options.gamma * (model.matrices.B.normalized[row]?.[column] ?? 0),
    actualAt: (row, column) => fusion[row]?.[peopleCount + column] ?? Number.NaN
  });

  const bridgeTransposeDelta = maxDeltaForBlock({
    rows: codeCount,
    columns: peopleCount,
    expectedAt: (row, column) => options.gamma * (model.matrices.B_CP.normalized[row]?.[column] ?? 0),
    actualAt: (row, column) => fusion[peopleCount + row]?.[column] ?? Number.NaN
  });

  const conceptDelta = maxDeltaForBlock({
    rows: codeCount,
    columns: codeCount,
    expectedAt: (row, column) => options.beta * (model.matrices.W.normalized[row]?.[column] ?? 0),
    actualAt: (row, column) => fusion[peopleCount + row]?.[peopleCount + column] ?? Number.NaN
  });

  const gPass = model.matrices.G.rowLabels.length === peopleCount &&
    model.matrices.G.columnLabels.length === codePairCount &&
    model.matrices.G.pairIds.length === codePairCount &&
    model.matrices.G.raw.length === peopleCount &&
    model.matrices.G.raw.every((row) => row.length === codePairCount) &&
    model.pairReport.length === codePairCount;

  const items = [
    item(
      "labels-and-dimensions",
      "Fusion labels and dimensions",
      dimensionsPass,
      `${peopleCount} S labels + ${codeCount} W labels => ${fusionSize}x${fusionSize} A_fusion`,
      `${model.matrices.fusion.labels.length} fusion labels; ${fusion.length}x${fusion[0]?.length ?? 0}`,
      [
        `S labels match B rows: ${sameStrings(model.matrices.S.labels, model.matrices.B.rowLabels)}`,
        `W labels match B columns: ${sameStrings(model.matrices.W.labels, model.matrices.B.columnLabels)}`,
        `B_PC labels match B: ${sameStrings(model.matrices.B.rowLabels, model.matrices.B_PC.rowLabels) && sameStrings(model.matrices.B.columnLabels, model.matrices.B_PC.columnLabels)}`,
        `B_CP labels match W x S: ${sameStrings(model.matrices.W.labels, model.matrices.B_CP.rowLabels) && sameStrings(model.matrices.S.labels, model.matrices.B_CP.columnLabels)}`,
        `Fusion labels match [people, codes]: ${sameStrings(expectedLabels, model.matrices.fusion.labels)}`
      ]
    ),
    item(
      "finite-values",
      "Finite weights and matrix values",
      allFinite,
      "alpha, beta, gamma and every S/W/B/B_PC/B_CP/G/A_fusion value are finite numbers",
      `alpha=${options.alpha}, beta=${options.beta}, gamma=${options.gamma}`,
      auditedMatrices.map(([label, values]) => `${label}=${values.length} rows`)
    ),
    item(
      "nonnegative-values",
      "Nonnegative weights and matrix values",
      allNonnegative,
      "alpha, beta, gamma and every raw/normalized S/W/B/B_PC/B_CP/G and A_fusion value are finite and nonnegative",
      `alpha=${options.alpha}, beta=${options.beta}, gamma=${options.gamma}`,
      auditedMatrices.map(([label, values]) => (
        `${label}=${nonnegativeMatrix(values) ? "nonnegative" : "contains invalid or negative values"}`
      ))
    ),
    item(
      "social-block",
      "alpha*S social block",
      socialDelta <= tolerance,
      "top-left A_fusion block equals alpha multiplied by normalized S",
      `max delta ${socialDelta}`,
      [`alpha=${options.alpha}`, `block=${peopleCount}x${peopleCount}`],
      socialDelta,
      tolerance
    ),
    item(
      "bridge-block",
      "gamma*B bridge block",
      bridgeDelta <= tolerance,
      "top-right A_fusion block equals gamma multiplied by normalized B",
      `max delta ${bridgeDelta}`,
      [`gamma=${options.gamma}`, `block=${peopleCount}x${codeCount}`],
      bridgeDelta,
      tolerance
    ),
    item(
      "bridge-cp-block",
      "gamma*B_CP code-to-person block",
      bridgeTransposeDelta <= tolerance,
      "bottom-left A_fusion block equals gamma multiplied by normalized B_CP",
      `max delta ${bridgeTransposeDelta}`,
      [`gamma=${options.gamma}`, `block=${codeCount}x${peopleCount}`],
      bridgeTransposeDelta,
      tolerance
    ),
    item(
      "concept-block",
      "beta*W concept block",
      conceptDelta <= tolerance,
      "bottom-right A_fusion block equals beta multiplied by normalized W",
      `max delta ${conceptDelta}`,
      [`beta=${options.beta}`, `block=${codeCount}x${codeCount}`],
      conceptDelta,
      tolerance
    ),
    item(
      "g-pair-coverage",
      "G person-code-pair coverage",
      gPass,
      `${peopleCount} people by ${codePairCount} unordered code pairs`,
      `${model.matrices.G.rowLabels.length} rows, ${model.matrices.G.columnLabels.length} columns, ${model.pairReport.length} pair reports`,
      [
        "G is not a block inside A_fusion; it explains who was associated with windows containing ENA-style code-pair links.",
        `pairIds=${model.matrices.G.pairIds.length}`,
        `pairs=${model.matrices.G.pairs.length}`
      ]
    )
  ];

  const passed = items.filter((entry) => entry.status === "pass").length;
  const reviewNeeded = items.length - passed;
  const matrixFingerprints = buildSenaMatrixFingerprints(model);

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.fusionMathAudit,
    status: reviewNeeded === 0 ? "verified" : "needs-review",
    passed,
    reviewNeeded,
    items,
    matrixFingerprints,
    notes: [
      "Fusion math audit checks the local SENA block equation against the current normalized matrices and weights.",
      "G is audited as an explanatory person-code-pair layer rather than as a direct A_fusion block.",
      "Matrix fingerprints provide stable handoff checksums for S/W/B/B_PC/B_CP/G/A_fusion reproducibility review; they are not statistical evidence."
    ]
  };
}

export function buildSenaFusionMathAuditArtifact(
  model: SenaModel,
  options: SenaFusionMathAuditArtifactOptions = {}
): SenaFusionMathAuditArtifact {
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.fusionMathAuditArtifact,
    title: options.title?.trim() || "SENA Fusion Math Audit",
    generatedAt,
    analysisWindow: options.activeTemporalWindow ?? null,
    formula: fusionFormula,
    parameters: {
      buildOptions: model.options,
      datasetCounts: {
        people: model.dataset.people.length,
        interactions: model.dataset.interactions.length,
        utterances: model.dataset.utterances.length,
        codedSegments: model.dataset.coded_segments.length,
        codes: model.dataset.codebook.length
      },
      warnings: model.summary.warnings
    },
    fusionMathAudit: buildSenaFusionMathAudit(model, options.tolerance ?? defaultTolerance),
    matrices: model.matrices,
    notes: [
      "Standalone artifact for checking the current S/W/B/B_PC/B_CP/G matrices against the weighted SENA fusion equation.",
      "Use this artifact with the runtime bundle, evidence ledger, and human-reviewed report before making substantive claims."
    ]
  };
}
