import { SENA_LEGACY_SCHEMA_VERSIONS, SENA_SCHEMA_VERSIONS } from "./schema-registry";
import type {
  SenaFusionMathAudit,
  SenaFusionMathAuditArtifact,
  SenaFusionMathAuditItem,
  SenaFusionMathAuditReadModel,
  SenaFusionMathAuditV1,
  SenaMatrixFingerprint,
  SenaModel,
  SenaTemporalWindow
} from "./types";

const defaultTolerance = 1e-9;
const fusionFormula = "A_fusion = [alpha*S gamma*B_PC; gamma*B_CP beta*W]";
const matrixFingerprintAlgorithm = "sena-stable-fnv1a32/v1" as const;
const fusionAuditV1ItemIds = [
  "labels-and-dimensions",
  "finite-values",
  "social-block",
  "bridge-block",
  "bridge-cp-block",
  "concept-block",
  "g-pair-coverage"
] as const;
const fusionAuditV2ItemIds = [
  "labels-and-dimensions",
  "finite-values",
  "nonnegative-values",
  "social-block",
  "bridge-block",
  "bridge-cp-block",
  "concept-block",
  "g-pair-coverage"
] as const;

export type SenaFusionMathAuditArtifactOptions = {
  title?: string;
  generatedAt?: string;
  activeTemporalWindow?: SenaTemporalWindow | null;
  tolerance?: number;
};

export type SenaFusionMathAuditEvidence = Pick<SenaModel, "matrices" | "options" | "pairReport">;

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
  pairDescriptors,
  raw,
  normalized,
  values
}: {
  id: SenaMatrixFingerprint["id"];
  label: string;
  rowLabels: string[];
  columnLabels: string[];
  pairIds?: string[];
  pairDescriptors?: SenaMatrixFingerprint["pairDescriptors"];
  raw?: number[][];
  normalized?: number[][];
  values?: number[][];
}): SenaMatrixFingerprint {
  const payload = {
    id,
    rowLabels,
    columnLabels,
    pairIds,
    pairDescriptors,
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
    pairIds,
    pairDescriptors
  };
}

export function buildSenaMatrixFingerprints(model: Pick<SenaModel, "matrices">): SenaMatrixFingerprint[] {
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
      pairDescriptors: model.matrices.G.pairs,
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

function auditRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function validFusionAuditItems(value: unknown) {
  return Array.isArray(value) && value.every((candidate) => {
    const item = auditRecord(candidate);
    return Boolean(item) &&
      typeof item?.id === "string" &&
      typeof item?.label === "string" &&
      (item?.status === "pass" || item?.status === "review") &&
      typeof item?.expected === "string" &&
      typeof item?.actual === "string" &&
      Array.isArray(item?.detail) &&
      item.detail.every((entry) => typeof entry === "string");
  });
}

const fingerprintIds = ["S", "W", "B", "B_PC", "B_CP", "G", "A_fusion"] as const;
const fingerprintLabels: Record<(typeof fingerprintIds)[number], string> = {
  S: "Social S matrix",
  W: "Epistemic W matrix",
  B: "Bridge B matrix",
  B_PC: "Person-to-code bridge B_PC matrix",
  B_CP: "Code-to-person bridge B_CP matrix",
  G: "Person-code-pair G matrix",
  A_fusion: "Weighted fusion adjacency matrix"
};

function validFingerprintMetricRecord(
  value: unknown,
  valueKinds: string[],
  cells: number,
  integer: boolean
) {
  const record = auditRecord(value);
  if (!record || Object.keys(record).some((key) => !["raw", "normalized", "values"].includes(key))) return false;
  return (["raw", "normalized", "values"] as const).every((kind) => {
    const metric = record[kind];
    if (!valueKinds.includes(kind)) return metric === undefined;
    return typeof metric === "number" && Number.isFinite(metric) && metric >= 0 &&
      (!integer || (Number.isInteger(metric) && metric <= cells));
  });
}

function fingerprintRecord(value: unknown) {
  return auditRecord(value) as Record<string, unknown>;
}

function validFusionFingerprints(value: unknown, requirePairDescriptors: boolean) {
  if (!Array.isArray(value) || value.length !== 7) return false;
  const individuallyValid = value.every((candidate, index) => {
    const fingerprint = auditRecord(candidate);
    if (!fingerprint || fingerprint.id !== fingerprintIds[index]) return false;
    const rowLabels = fingerprint.rowLabels;
    const columnLabels = fingerprint.columnLabels;
    const expectedKinds = fingerprint.id === "A_fusion" ? ["values"] : ["raw", "normalized"];
    if (
      fingerprint.label !== fingerprintLabels[fingerprint.id as (typeof fingerprintIds)[number]] ||
      fingerprint.checksumAlgorithm !== matrixFingerprintAlgorithm ||
      typeof fingerprint.checksum !== "string" ||
      !/^0x[a-f0-9]{8}$/.test(fingerprint.checksum) ||
      !Array.isArray(rowLabels) || !rowLabels.every((entry) => typeof entry === "string" && entry.length > 0) ||
      !Array.isArray(columnLabels) || !columnLabels.every((entry) => typeof entry === "string" && entry.length > 0) ||
      fingerprint.shape !== `${rowLabels.length}x${columnLabels.length}` ||
      !Array.isArray(fingerprint.valueKinds) ||
      !sameStrings(fingerprint.valueKinds as string[], expectedKinds) ||
      !validFingerprintMetricRecord(fingerprint.totals, expectedKinds, rowLabels.length * columnLabels.length, false) ||
      !validFingerprintMetricRecord(fingerprint.nonZero, expectedKinds, rowLabels.length * columnLabels.length, true)
    ) return false;
    if (fingerprint.id !== "G") {
      return fingerprint.pairIds === undefined && fingerprint.pairDescriptors === undefined;
    }
    if (!Array.isArray(fingerprint.pairIds) || !fingerprint.pairIds.every((entry) => typeof entry === "string")) return false;
    if (fingerprint.pairIds.length !== (fingerprint.columnLabels as string[]).length) return false;
    if (!requirePairDescriptors) return fingerprint.pairDescriptors === undefined;
    if (!Array.isArray(fingerprint.pairDescriptors) || fingerprint.pairDescriptors.length !== fingerprint.pairIds.length) return false;
    return new Set(fingerprint.pairDescriptors.map((candidatePair) => auditRecord(candidatePair)?.id)).size === fingerprint.pairDescriptors.length &&
      fingerprint.pairDescriptors.every((candidatePair, pairIndex) => {
      const pair = auditRecord(candidatePair);
      return Boolean(pair) &&
        [pair?.id, pair?.codeA, pair?.codeB, pair?.label].every((entry) => typeof entry === "string") &&
        pair?.id === (fingerprint.pairIds as string[])[pairIndex] &&
        pair?.label === (fingerprint.columnLabels as string[])[pairIndex];
      });
  });
  if (!individuallyValid) return false;

  const [social, concept, bridge, bridgePc, bridgeCp, pairs, fusion] = value.map(fingerprintRecord);
  const socialRows = social.rowLabels as string[];
  const conceptRows = concept.rowLabels as string[];
  const pairColumns = pairs.columnLabels as string[];
  const expectedPairCount = (conceptRows.length * Math.max(0, conceptRows.length - 1)) / 2;
  return socialRows.length > 0 && conceptRows.length > 0 &&
    sameStrings(socialRows, social.columnLabels as string[]) &&
    sameStrings(conceptRows, concept.columnLabels as string[]) &&
    sameStrings(socialRows, bridge.rowLabels as string[]) &&
    sameStrings(conceptRows, bridge.columnLabels as string[]) &&
    sameStrings(socialRows, bridgePc.rowLabels as string[]) &&
    sameStrings(conceptRows, bridgePc.columnLabels as string[]) &&
    sameStrings(conceptRows, bridgeCp.rowLabels as string[]) &&
    sameStrings(socialRows, bridgeCp.columnLabels as string[]) &&
    sameStrings(socialRows, pairs.rowLabels as string[]) &&
    pairColumns.length === expectedPairCount &&
    sameStrings([...(pairs.pairIds as string[])], [...new Set(pairs.pairIds as string[])]) &&
    sameStrings([...socialRows, ...conceptRows], fusion.rowLabels as string[]) &&
    sameStrings(fusion.rowLabels as string[], fusion.columnLabels as string[]);
}

const fusionAuditLabels: Record<(typeof fusionAuditV2ItemIds)[number], string> = {
  "labels-and-dimensions": "Fusion labels and dimensions",
  "finite-values": "Finite weights and matrix values",
  "nonnegative-values": "Nonnegative weights and matrix values",
  "social-block": "alpha*S social block",
  "bridge-block": "gamma*B bridge block",
  "bridge-cp-block": "gamma*B_CP code-to-person block",
  "concept-block": "beta*W concept block",
  "g-pair-coverage": "G person-code-pair coverage"
};

function validCurrentFusionAuditItems(items: SenaFusionMathAuditItem[], fingerprints: SenaMatrixFingerprint[]) {
  const byId = new Map(items.map((entry) => [entry.id, entry]));
  if (items.some((entry) => entry.label !== fusionAuditLabels[entry.id as keyof typeof fusionAuditLabels])) return false;
  const social = fingerprints[0];
  const concept = fingerprints[1];
  const pairs = fingerprints[5];
  const peopleCount = social.rowLabels.length;
  const codeCount = concept.rowLabels.length;
  const fusionSize = peopleCount + codeCount;
  const pairCount = pairs.columnLabels.length;
  const dimensions = byId.get("labels-and-dimensions");
  const finite = byId.get("finite-values");
  const nonnegative = byId.get("nonnegative-values");
  const gCoverage = byId.get("g-pair-coverage");
  if (!dimensions || !finite || !nonnegative || !gCoverage) return false;
  if (
    dimensions.status !== "pass" ||
    dimensions.expected !== `${peopleCount} S labels + ${codeCount} W labels => ${fusionSize}x${fusionSize} A_fusion` ||
    dimensions.actual !== `${fusionSize} fusion labels; ${fusionSize}x${fusionSize}` ||
    dimensions.maxDelta !== undefined || dimensions.tolerance !== undefined ||
    dimensions.detail.length !== 5 || dimensions.detail.some((entry) => !entry.endsWith(": true"))
  ) return false;

  const weightMatch = /^alpha=(.+), beta=(.+), gamma=(.+)$/.exec(finite.actual);
  if (!weightMatch) return false;
  const weights = weightMatch.slice(1).map(Number);
  const finiteExpected = "alpha, beta, gamma and every S/W/B/B_PC/B_CP/G/A_fusion value are finite numbers";
  const nonnegativeExpected = "alpha, beta, gamma and every raw/normalized S/W/B/B_PC/B_CP/G and A_fusion value are finite and nonnegative";
  const matrixRowDetails = [
    `S.raw=${peopleCount} rows`, `S.normalized=${peopleCount} rows`,
    `W.raw=${codeCount} rows`, `W.normalized=${codeCount} rows`,
    `B.raw=${peopleCount} rows`, `B.normalized=${peopleCount} rows`,
    `B_PC.raw=${peopleCount} rows`, `B_PC.normalized=${peopleCount} rows`,
    `B_CP.raw=${codeCount} rows`, `B_CP.normalized=${codeCount} rows`,
    `G.raw=${peopleCount} rows`, `G.normalized=${peopleCount} rows`,
    `A_fusion.values=${fusionSize} rows`
  ];
  if (
    finite.status !== "pass" || finite.expected !== finiteExpected ||
    finite.maxDelta !== undefined || finite.tolerance !== undefined ||
    weights.some((entry) => !Number.isFinite(entry)) ||
    !sameStrings(finite.detail, matrixRowDetails)
  ) return false;
  const nonnegativePrefixes = matrixRowDetails.map((entry) => entry.replace(/=\d+ rows$/, "="));
  const nonnegativeEvidence = nonnegative.detail.map((entry, index) => (
    entry === `${nonnegativePrefixes[index]}nonnegative`
  ));
  const expectedNonnegativeStatus = weights.every((entry) => entry >= 0) && nonnegativeEvidence.every(Boolean)
    ? "pass"
    : "review";
  if (
    nonnegative.expected !== nonnegativeExpected || nonnegative.actual !== finite.actual ||
    nonnegative.maxDelta !== undefined || nonnegative.tolerance !== undefined ||
    nonnegative.detail.length !== matrixRowDetails.length ||
    nonnegative.detail.some((entry, index) => (
      entry !== `${nonnegativePrefixes[index]}nonnegative` &&
      entry !== `${nonnegativePrefixes[index]}contains invalid or negative values`
    )) ||
    nonnegative.status !== expectedNonnegativeStatus
  ) return false;

  const blockRules = [
    ["social-block", "top-left A_fusion block equals alpha multiplied by normalized S", `alpha=${weights[0]}`, `${peopleCount}x${peopleCount}`],
    ["bridge-block", "top-right A_fusion block equals gamma multiplied by normalized B", `gamma=${weights[2]}`, `${peopleCount}x${codeCount}`],
    ["bridge-cp-block", "bottom-left A_fusion block equals gamma multiplied by normalized B_CP", `gamma=${weights[2]}`, `${codeCount}x${peopleCount}`],
    ["concept-block", "bottom-right A_fusion block equals beta multiplied by normalized W", `beta=${weights[1]}`, `${codeCount}x${codeCount}`]
  ] as const;
  for (const [id, expected, weightDetail, blockShape] of blockRules) {
    const block = byId.get(id);
    if (!block || typeof block.maxDelta !== "number" || !Number.isFinite(block.maxDelta) || block.maxDelta < 0 ||
      block.tolerance !== defaultTolerance ||
      block.expected !== expected || block.actual !== `max delta ${block.maxDelta}` ||
      !sameStrings(block.detail, [weightDetail, `block=${blockShape}`]) ||
      block.status !== (block.maxDelta <= block.tolerance ? "pass" : "review")) return false;
  }

  return gCoverage.status === "pass" &&
    gCoverage.expected === `${peopleCount} people by ${pairCount} unordered code pairs` &&
    gCoverage.actual === `${peopleCount} rows, ${pairCount} columns, ${pairCount} pair reports` &&
    gCoverage.maxDelta === undefined && gCoverage.tolerance === undefined &&
    sameStrings(gCoverage.detail, [
      "G is not a block inside A_fusion; it explains who was associated with windows containing ENA-style code-pair links.",
      `pairIds=${pairCount}`,
      `pairs=${pairCount}`,
      "pairDescriptorsAligned=true"
    ]);
}

function validFusionAuditBase(record: Record<string, unknown>) {
  if (!validFusionAuditItems(record.items)) return false;
  const items = record.items as SenaFusionMathAuditItem[];
  const passed = items.filter((entry) => entry.status === "pass").length;
  const reviewNeeded = items.length - passed;
  return (record.status === "verified" || record.status === "needs-review") &&
    Number.isInteger(record.passed) && (record.passed as number) >= 0 &&
    Number.isInteger(record.reviewNeeded) && (record.reviewNeeded as number) >= 0 &&
    record.passed === passed &&
    record.reviewNeeded === reviewNeeded &&
    record.status === (reviewNeeded === 0 ? "verified" : "needs-review") &&
    Array.isArray(record.notes) && record.notes.every((entry) => typeof entry === "string");
}

function isGenuineSenaFusionMathAuditV1(value: unknown): value is SenaFusionMathAuditV1 {
  const record = auditRecord(value);
  if (!record || record.schemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.fusionMathAudit || !validFusionAuditBase(record)) return false;
  const itemIds = (record.items as SenaFusionMathAuditItem[]).map((entry) => entry.id);
  return itemIds.length === fusionAuditV1ItemIds.length &&
    itemIds.every((id, index) => id === fusionAuditV1ItemIds[index]) &&
    validFusionFingerprints(record.matrixFingerprints, false);
}

function isSenaFusionMathAuditV2ReadModel(value: unknown): value is SenaFusionMathAudit {
  const record = auditRecord(value);
  if (!record || record.schemaVersion !== SENA_SCHEMA_VERSIONS.fusionMathAudit || !validFusionAuditBase(record)) return false;
  if (
    record.sourceSchemaVersion !== SENA_SCHEMA_VERSIONS.fusionMathAudit &&
    record.sourceSchemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.fusionMathAudit
  ) return false;
  const items = record.items as SenaFusionMathAuditItem[];
  const itemIds = items.map((entry) => entry.id).sort();
  if (!sameStrings(itemIds, [...fusionAuditV2ItemIds].sort())) return false;
  if (record.sourceSchemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.fusionMathAudit) {
    const nonnegative = items.find((entry) => entry.id === "nonnegative-values");
    if (record.status !== "needs-review" ||
      (record.reviewNeeded as number) < 1 ||
      nonnegative?.status !== "review" ||
      !nonnegative.detail.includes("current-v2-fusion-nonnegative-evidence-required")) return false;
  }
  const validFingerprints = validFusionFingerprints(
    record.matrixFingerprints,
    record.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.fusionMathAudit
  );
  return validFingerprints && (
    record.sourceSchemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.fusionMathAudit ||
    validCurrentFusionAuditItems(items, record.matrixFingerprints as SenaMatrixFingerprint[])
  );
}

export function isCurrentSenaFusionMathAudit(value: unknown): value is SenaFusionMathAudit {
  return isSenaFusionMathAuditV2ReadModel(value) &&
    value.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.fusionMathAudit;
}

export function normalizeSenaFusionMathAudit(
  value: SenaFusionMathAuditReadModel | unknown,
  evidence?: SenaFusionMathAuditEvidence
): SenaFusionMathAudit {
  if (isSenaFusionMathAuditV2ReadModel(value)) {
    if (value.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.fusionMathAudit) {
      if (!evidence) {
        throw new Error("SENA fusion math audit current-v2 verification requires the canonical matrices, weights, and G pair reports.");
      }
      let expected: SenaFusionMathAudit;
      try {
        expected = buildSenaFusionMathAudit(evidence);
      } catch {
        throw new Error("SENA fusion math audit evidence could not be recomputed from the canonical matrices.");
      }
      if (JSON.stringify(expected) !== JSON.stringify(value)) {
        throw new Error("SENA fusion math audit does not match the canonical matrix semantics and fingerprints.");
      }
    }
    return structuredClone(value);
  }
  if (!isGenuineSenaFusionMathAuditV1(value)) {
    throw new Error("SENA fusion math audit must be a complete v2 contract or the genuine seven-item v1 contract.");
  }
  const nonnegativeReview: SenaFusionMathAuditItem = {
    id: "nonnegative-values",
    label: "Nonnegative weights and matrix values",
    status: "review",
    expected: "Current v2 evidence that all fusion weights and raw/normalized/fused values are finite and nonnegative",
    actual: "Historical v1 did not audit the nonnegative value domain.",
    detail: ["current-v2-fusion-nonnegative-evidence-required"]
  };
  const finiteIndex = value.items.findIndex((entry) => entry.id === "finite-values");
  const items = value.items.map((entry) => structuredClone(entry));
  items.splice(finiteIndex + 1, 0, nonnegativeReview);
  const passed = items.filter((entry) => entry.status === "pass").length;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.fusionMathAudit,
    sourceSchemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.fusionMathAudit,
    status: "needs-review",
    passed,
    reviewNeeded: items.length - passed,
    items,
    matrixFingerprints: structuredClone(value.matrixFingerprints),
    notes: [
      ...value.notes,
      "Normalized in memory from fusion-math-audit/v1; nonnegative-value evidence remains unproven and cannot be treated as current v2 verification."
    ]
  };
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

export function buildSenaFusionMathAudit(model: SenaFusionMathAuditEvidence, tolerance = defaultTolerance): SenaFusionMathAudit {
  if (tolerance !== defaultTolerance) {
    throw new Error("SENA current-v2 fusion math audits require the canonical 1e-9 tolerance.");
  }
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

  const pairDescriptorsPass = Array.isArray(model.matrices.G.pairs) &&
    model.matrices.G.pairs.length === codePairCount &&
    new Set(model.matrices.G.pairs.map((pair) => pair.id)).size === codePairCount &&
    model.matrices.G.pairs.every((pair, index) => {
      const report = model.pairReport[index];
      return Boolean(report) &&
        pair.id === model.matrices.G.pairIds[index] &&
        pair.label === model.matrices.G.columnLabels[index] &&
        pair.id === report.id &&
        pair.codeA === report.codeA &&
        pair.codeB === report.codeB &&
        pair.label === report.label;
    });
  const gPass = model.matrices.G.rowLabels.length === peopleCount &&
    model.matrices.G.columnLabels.length === codePairCount &&
    model.matrices.G.pairIds.length === codePairCount &&
    pairDescriptorsPass &&
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
        `pairs=${model.matrices.G.pairs.length}`,
        `pairDescriptorsAligned=${pairDescriptorsPass}`
      ]
    )
  ];

  const passed = items.filter((entry) => entry.status === "pass").length;
  const reviewNeeded = items.length - passed;
  const matrixFingerprints = buildSenaMatrixFingerprints(model);

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.fusionMathAudit,
    sourceSchemaVersion: SENA_SCHEMA_VERSIONS.fusionMathAudit,
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
