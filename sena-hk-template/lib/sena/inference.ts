import { SENA_LEGACY_SCHEMA_VERSIONS, SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { buildSenaModel } from "./model";
import {
  buildSenaAnalysisConfigHash,
  buildSenaDatasetContentHash,
  buildSenaStableContentHash
} from "./data-contract-audit";
import {
  SENA_GROUP_COMPARISON_METRICS,
  validateSenaAnalyticalInputs,
  type SenaValidatedGroupComparisonMetric
} from "./analytical-input-validation";
import type {
  SenaBuildOptions,
  SenaDataset,
  SenaModel,
  SenaPersonMetrics,
  SenaResolvedBuildOptions
} from "./types";

export type SenaGroupComparisonMetric = SenaValidatedGroupComparisonMetric;

export type SenaEffectSizeStatus =
  | "estimable"
  | "insufficient-sample"
  | "zero-variance-equal"
  | "zero-variance-separated"
  | "legacy-ambiguous";

export type SenaGroupComparisonEffectSize = {
  status: SenaEffectSizeStatus;
  cohenD: number | null;
  hedgesG: number | null;
  pooledStandardDeviation: number | null;
  reason: string;
};

export type SenaGroupComparisonSufficientStatistics = {
  n: number;
  sum: number;
  sumSquares: number;
  mean: number;
  unbiasedVariance: number | null;
};

export type SenaGroupComparisonSourceEvidence = {
  status: "bound-current-source";
  hashAlgorithm: "sena-stable-fnv1a32/v1";
  datasetContentHash: string;
  analysisConfig: SenaResolvedBuildOptions;
  analysisConfigHash: string;
  groupDefinition: {
    metric: SenaGroupComparisonMetric;
    groupField: "group" | "role";
    groupA: string;
    groupB: string;
  };
  groupDefinitionHash: string;
  metricUniverse: Array<{
    personId: string;
    group: string;
    role: string;
    value: number;
  }>;
  metricUniverseHash: string;
  sufficientStatistics: {
    groupA: SenaGroupComparisonSufficientStatistics;
    groupB: SenaGroupComparisonSufficientStatistics;
  };
  evidenceHash: string;
};

export type SenaGroupComparisonResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.groupComparison;
  sourceSchemaVersion: typeof SENA_SCHEMA_VERSIONS.groupComparison | typeof SENA_LEGACY_SCHEMA_VERSIONS.groupComparison;
  metric: SenaGroupComparisonMetric;
  groupField: "group" | "role";
  groupA: string;
  groupB: string;
  nA: number;
  nB: number;
  meanA: number;
  meanB: number;
  observedDifference: number;
  effectSize: SenaGroupComparisonEffectSize;
  sourceEvidence?: SenaGroupComparisonSourceEvidence;
  permutation: {
    iterations: number;
    seed: number;
    pTwoSided: number;
    nullLower: number;
    nullUpper: number;
    samplesPreview: number[];
  };
  bootstrap: {
    iterations: number;
    seed: number;
    meanDifferenceLower: number;
    meanDifferenceUpper: number;
    samplesPreview: number[];
  };
  diagnostics: {
    totalPeople: number;
    comparedPeople: number;
    minGroupSize: number;
    balancedDesign: boolean;
    smallSample: boolean;
    metricScale: "person-metric";
  };
  guardrail: string;
};

export type SenaGroupComparisonSuiteEntry = SenaGroupComparisonResult & {
  comparisonId: string;
  holmRank: number;
  holmAdjustedP: number;
  significantAtAlpha: boolean;
};

export type SenaGroupComparisonSuiteResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.groupComparisonSuite;
  sourceSchemaVersion: typeof SENA_SCHEMA_VERSIONS.groupComparisonSuite | typeof SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite;
  alpha: number;
  correction: "holm";
  comparisonCount: number;
  significantHolmCount: number;
  primary: SenaGroupComparisonSuiteEntry;
  comparisons: SenaGroupComparisonSuiteEntry[];
  diagnostics: {
    metrics: SenaGroupComparisonMetric[];
    groupPairs: Array<{
      groupField: "group" | "role";
      groupA: string;
      groupB: string;
    }>;
    minGroupSize: number;
    smallSampleComparisons: number;
    preregistrationEvidence: "required-before-claim";
  };
  guardrail: string;
};

export type SenaGroupComparisonValidationResult = SenaGroupComparisonResult | SenaGroupComparisonSuiteResult;

export type SenaGroupComparisonEffectSizeV1 = {
  cohenD: number;
  hedgesG: number;
  pooledStandardDeviation: number;
};

export type SenaGroupComparisonResultV1 = {
  schemaVersion: typeof SENA_LEGACY_SCHEMA_VERSIONS.groupComparison;
  metric: SenaGroupComparisonMetric;
  groupField: "group" | "role";
  groupA: string;
  groupB: string;
  nA: number;
  nB: number;
  meanA: number;
  meanB: number;
  observedDifference: number;
  effectSize: SenaGroupComparisonEffectSizeV1;
  permutation: SenaGroupComparisonResult["permutation"];
  bootstrap: SenaGroupComparisonResult["bootstrap"];
  diagnostics: SenaGroupComparisonResult["diagnostics"];
  guardrail: string;
};

export type SenaGroupComparisonSuiteEntryV1 = SenaGroupComparisonResultV1 & {
  comparisonId: string;
  holmRank: number;
  holmAdjustedP: number;
  significantAtAlpha: boolean;
};

export type SenaGroupComparisonSuiteResultV1 = {
  schemaVersion: typeof SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite;
  alpha: number;
  correction: "holm";
  comparisonCount: number;
  significantHolmCount: number;
  primary: SenaGroupComparisonSuiteEntryV1;
  comparisons: SenaGroupComparisonSuiteEntryV1[];
  diagnostics: SenaGroupComparisonSuiteResult["diagnostics"];
  guardrail: string;
};

export type SenaGroupComparisonValidationReadModel =
  | SenaGroupComparisonValidationResult
  | SenaGroupComparisonResultV1
  | SenaGroupComparisonSuiteResultV1;

export type SenaGroupComparisonSourceContext = {
  dataset: SenaDataset;
  buildOptions?: Partial<SenaBuildOptions>;
};

export type SenaGroupComparisonSpec = {
  groupField?: "group" | "role";
  groupA: string;
  groupB: string;
  metric?: SenaGroupComparisonMetric;
};

const groupComparisonGuardrail = "Permutation and bootstrap group comparison is descriptive SENA validation support. Use a study-specific preregistered inferential model before making publication or assessment claims.";
const groupComparisonSuiteGuardrail = "Suite-level group comparison controls family-wise error with Holm adjustment, but it remains descriptive validation support until paired with preregistration, domain review, and a study-specific inferential model.";

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function addCanonicalUint32(seed: number, increment: number) {
  return (seed + increment) >>> 0;
}

function mean(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleVariance(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (values.length - 1);
}

function assertFiniteEffectSizeObservations(values: number[], group: "A" | "B") {
  const invalidIndex = values.findIndex((value) => !Number.isFinite(value));
  if (invalidIndex >= 0) {
    throw new Error(`Group ${group} effect-size observation at index ${invalidIndex} must be finite.`);
  }
}

export function buildSenaGroupComparisonEffectSize(
  valuesA: number[],
  valuesB: number[]
): SenaGroupComparisonEffectSize {
  assertFiniteEffectSizeObservations(valuesA, "A");
  assertFiniteEffectSizeObservations(valuesB, "B");
  if (valuesA.length < 2 || valuesB.length < 2) {
    return {
      status: "insufficient-sample",
      cohenD: null,
      hedgesG: null,
      pooledStandardDeviation: null,
      reason: "At least two observations per group are required for a standardized effect size."
    };
  }

  const observedDifference = mean(valuesA) - mean(valuesB);
  const varianceA = sampleVariance(valuesA);
  const varianceB = sampleVariance(valuesB);
  const pooledVarianceDenominator = valuesA.length + valuesB.length - 2;
  const pooledVariance = (
    ((valuesA.length - 1) * varianceA) + ((valuesB.length - 1) * varianceB)
  ) / pooledVarianceDenominator;
  const pooledStandardDeviation = Math.sqrt(pooledVariance);
  if (!Number.isFinite(observedDifference) || !Number.isFinite(pooledStandardDeviation)) {
    throw new Error("SENA group-comparison effect-size calculation must remain finite.");
  }
  if (pooledStandardDeviation === 0) {
    return observedDifference === 0
      ? {
        status: "zero-variance-equal",
        cohenD: null,
        hedgesG: null,
        pooledStandardDeviation: 0,
        reason: "Both groups are constant with equal means; a standardized effect size is undefined."
      }
      : {
        status: "zero-variance-separated",
        cohenD: null,
        hedgesG: null,
        pooledStandardDeviation: 0,
        reason: "Both groups are constant with different means; separation is complete but a standardized effect size is undefined."
      };
  }

  const cohenD = observedDifference / pooledStandardDeviation;
  const hedgesCorrection = 1 - (3 / ((4 * (valuesA.length + valuesB.length)) - 9));
  const hedgesG = cohenD * hedgesCorrection;
  if (![cohenD, hedgesG].every(Number.isFinite)) {
    throw new Error("SENA group-comparison standardized effect sizes must remain finite.");
  }
  return {
    status: "estimable",
    cohenD: round(cohenD),
    hedgesG: round(hedgesG),
    pooledStandardDeviation,
    reason: "Cohen d and Hedges g are estimable from two groups with at least two observations and positive pooled standard deviation."
  };
}

function quantile(values: number[], q: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * q)));
  return sorted[index];
}

function round(value: number, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function resampleMean(values: number[], random: () => number) {
  if (values.length === 0) return 0;
  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    total += values[Math.floor(random() * values.length)];
  }
  return total / values.length;
}

function metricValue(metrics: SenaPersonMetrics, metric: SenaGroupComparisonMetric) {
  return metrics[metric];
}

function canonicalMetricUniverse(model: SenaModel, metric: SenaGroupComparisonMetric) {
  return model.nodes
    .filter((node) => node.kind === "person")
    .map((node) => ({
      personId: node.id,
      group: node.group,
      role: node.role,
      value: metricValue(node.metrics, metric)
    }))
    .sort((left, right) => left.personId.localeCompare(right.personId));
}

function sufficientStatistics(values: number[]): SenaGroupComparisonSufficientStatistics {
  return {
    n: values.length,
    sum: values.reduce((total, value) => total + value, 0),
    sumSquares: values.reduce((total, value) => total + (value ** 2), 0),
    mean: mean(values),
    unbiasedVariance: values.length < 2 ? null : sampleVariance(values)
  };
}

function buildSenaGroupComparisonSourceEvidence(input: {
  dataset: SenaDataset;
  model: SenaModel;
  metric: SenaGroupComparisonMetric;
  groupField: "group" | "role";
  groupA: string;
  groupB: string;
}): SenaGroupComparisonSourceEvidence {
  const groupDefinition = {
    metric: input.metric,
    groupField: input.groupField,
    groupA: input.groupA,
    groupB: input.groupB
  };
  const metricUniverse = canonicalMetricUniverse(input.model, input.metric);
  const valuesA = metricUniverse
    .filter((entry) => entry[input.groupField] === input.groupA)
    .map((entry) => entry.value);
  const valuesB = metricUniverse
    .filter((entry) => entry[input.groupField] === input.groupB)
    .map((entry) => entry.value);
  const evidenceBody = {
    status: "bound-current-source" as const,
    hashAlgorithm: "sena-stable-fnv1a32/v1" as const,
    datasetContentHash: buildSenaDatasetContentHash(input.dataset),
    analysisConfig: structuredClone(input.model.options),
    analysisConfigHash: buildSenaAnalysisConfigHash(input.model.options),
    groupDefinition,
    groupDefinitionHash: buildSenaStableContentHash(groupDefinition),
    metricUniverse,
    metricUniverseHash: buildSenaStableContentHash(metricUniverse),
    sufficientStatistics: {
      groupA: sufficientStatistics(valuesA),
      groupB: sufficientStatistics(valuesB)
    }
  };
  return {
    ...evidenceBody,
    evidenceHash: buildSenaStableContentHash(evidenceBody)
  };
}

function computeSenaGroupComparisonDeterministicFields(input: {
  metricUniverse: SenaGroupComparisonSourceEvidence["metricUniverse"];
  groupField: "group" | "role";
  groupA: string;
  groupB: string;
  permutationIterations: number;
  permutationSeed: number;
  bootstrapIterations: number;
}) {
  const a = input.metricUniverse
    .filter((row) => row[input.groupField] === input.groupA)
    .map((row) => row.value);
  const b = input.metricUniverse
    .filter((row) => row[input.groupField] === input.groupB)
    .map((row) => row.value);
  if (a.length === 0 || b.length === 0) {
    throw new Error(`Both groups must contain at least one person for ${input.groupField} comparison.`);
  }

  const observedDifference = mean(a) - mean(b);
  const effectSize = buildSenaGroupComparisonEffectSize(a, b);
  const combined = [...a, ...b];
  const random = seededRandom(input.permutationSeed);
  const permutationSamples = Array.from({ length: input.permutationIterations }, () => {
    const shuffled = [...combined];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
    }
    return mean(shuffled.slice(0, a.length)) - mean(shuffled.slice(a.length));
  });
  const pTwoSided = (
    permutationSamples.filter((sample) => Math.abs(sample) >= Math.abs(observedDifference)).length + 1
  ) / (permutationSamples.length + 1);
  const bootstrapSeed = addCanonicalUint32(input.permutationSeed, 7919);
  const bootstrapRandom = seededRandom(bootstrapSeed);
  const bootstrapSamples = Array.from({ length: input.bootstrapIterations }, () => (
    resampleMean(a, bootstrapRandom) - resampleMean(b, bootstrapRandom)
  ));

  return {
    nA: a.length,
    nB: b.length,
    meanA: mean(a),
    meanB: mean(b),
    observedDifference,
    effectSize,
    permutation: {
      iterations: input.permutationIterations,
      seed: input.permutationSeed,
      pTwoSided: round(pTwoSided),
      nullLower: round(quantile(permutationSamples, 0.025)),
      nullUpper: round(quantile(permutationSamples, 0.975)),
      samplesPreview: permutationSamples.slice(0, 20).map((sample) => round(sample))
    },
    bootstrap: {
      iterations: input.bootstrapIterations,
      seed: bootstrapSeed,
      meanDifferenceLower: round(quantile(bootstrapSamples, 0.025)),
      meanDifferenceUpper: round(quantile(bootstrapSamples, 0.975)),
      samplesPreview: bootstrapSamples.slice(0, 20).map((sample) => round(sample))
    },
    diagnostics: {
      totalPeople: input.metricUniverse.length,
      comparedPeople: a.length + b.length,
      minGroupSize: Math.min(a.length, b.length),
      balancedDesign: a.length === b.length,
      smallSample: Math.min(a.length, b.length) < 5,
      metricScale: "person-metric" as const
    }
  };
}

export function buildSenaGroupComparison(input: {
  dataset: SenaDataset;
  buildOptions?: Partial<SenaBuildOptions>;
  groupField?: "group" | "role";
  groupA: string;
  groupB: string;
  metric?: SenaGroupComparisonMetric;
  iterations?: number;
  seed?: number;
  bootstrapIterations?: number;
}): SenaGroupComparisonResult {
  validateSenaAnalyticalInputs({
    dataset: input.dataset,
    buildOptions: input.buildOptions,
    groupComparison: input
  });
  const model = buildSenaModel(input.dataset, input.buildOptions ?? {});
  const metric = input.metric ?? "socialStrength";
  const groupField = input.groupField ?? "group";
  const sourceEvidence = buildSenaGroupComparisonSourceEvidence({
    dataset: input.dataset,
    model,
    metric,
    groupField,
    groupA: input.groupA,
    groupB: input.groupB
  });
  const iterations = input.iterations ?? 1000;
  const seed = input.seed ?? 20260611;
  const bootstrapIterations = input.bootstrapIterations ?? iterations;
  const deterministic = computeSenaGroupComparisonDeterministicFields({
    metricUniverse: sourceEvidence.metricUniverse,
    groupField,
    groupA: input.groupA,
    groupB: input.groupB,
    permutationIterations: iterations,
    permutationSeed: seed,
    bootstrapIterations
  });

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.groupComparison,
    sourceSchemaVersion: SENA_SCHEMA_VERSIONS.groupComparison,
    metric,
    groupField,
    groupA: input.groupA,
    groupB: input.groupB,
    nA: deterministic.nA,
    nB: deterministic.nB,
    meanA: deterministic.meanA,
    meanB: deterministic.meanB,
    observedDifference: deterministic.observedDifference,
    effectSize: deterministic.effectSize,
    sourceEvidence,
    permutation: deterministic.permutation,
    bootstrap: deterministic.bootstrap,
    diagnostics: deterministic.diagnostics,
    guardrail: groupComparisonGuardrail
  };
}

function comparisonId(result: SenaGroupComparisonResult) {
  return [
    result.groupField,
    result.groupA.replace(/\s+/g, "-").toLowerCase(),
    "vs",
    result.groupB.replace(/\s+/g, "-").toLowerCase(),
    result.metric
  ].join(":");
}

export function buildSenaGroupComparisonSuite(input: {
  dataset: SenaDataset;
  buildOptions?: Partial<SenaBuildOptions>;
  comparisons: SenaGroupComparisonSpec[];
  defaultGroupField?: "group" | "role";
  defaultMetric?: SenaGroupComparisonMetric;
  iterations?: number;
  seed?: number;
  bootstrapIterations?: number;
  alpha?: number;
}): SenaGroupComparisonSuiteResult {
  validateSenaAnalyticalInputs({
    dataset: input.dataset,
    buildOptions: input.buildOptions,
    groupComparison: input
  });
  const alpha = input.alpha ?? 0.05;
  const comparisons = input.comparisons.map((comparison, index) => buildSenaGroupComparison({
    dataset: input.dataset,
    buildOptions: input.buildOptions,
    groupField: comparison.groupField ?? input.defaultGroupField ?? "group",
    groupA: comparison.groupA,
    groupB: comparison.groupB,
    metric: comparison.metric ?? input.defaultMetric ?? "socialStrength",
    iterations: input.iterations,
    seed: addCanonicalUint32(input.seed ?? 20260611, index * 101),
    bootstrapIterations: input.bootstrapIterations
  }));
  const entries = comparisons.map<SenaGroupComparisonSuiteEntry>((comparison) => ({
    ...comparison,
    comparisonId: comparisonId(comparison),
    holmRank: 0,
    holmAdjustedP: 1,
    significantAtAlpha: false
  }));
  if (new Set(entries.map((entry) => entry.comparisonId)).size !== entries.length) {
    throw new Error("SENA group-comparison suite specifications must define a unique comparison universe.");
  }
  const sorted = [...entries].sort((a, b) => a.permutation.pTwoSided - b.permutation.pTwoSided);
  let previousAdjusted = 0;
  sorted.forEach((entry, index) => {
    const adjusted = Math.max(previousAdjusted, Math.min(1, entry.permutation.pTwoSided * (sorted.length - index)));
    entry.holmRank = index + 1;
    entry.holmAdjustedP = round(adjusted);
    entry.significantAtAlpha = adjusted <= alpha;
    previousAdjusted = adjusted;
  });
  const metrics = Array.from(new Set(entries.map((entry) => entry.metric))).sort();
  const groupPairs = Array.from(new Map(entries.map((entry) => [
    `${entry.groupField}:${entry.groupA}:${entry.groupB}`,
    {
      groupField: entry.groupField,
      groupA: entry.groupA,
      groupB: entry.groupB
    }
  ])).values());
  const primary = sorted[0];
  if (!primary) throw new Error("At least one group-comparison specification is required.");

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.groupComparisonSuite,
    sourceSchemaVersion: SENA_SCHEMA_VERSIONS.groupComparisonSuite,
    alpha,
    correction: "holm",
    comparisonCount: entries.length,
    significantHolmCount: entries.filter((entry) => entry.significantAtAlpha).length,
    primary,
    comparisons: entries.sort((a, b) => a.holmRank - b.holmRank),
    diagnostics: {
      metrics,
      groupPairs,
      minGroupSize: Math.min(...entries.map((entry) => entry.diagnostics.minGroupSize)),
      smallSampleComparisons: entries.filter((entry) => entry.diagnostics.smallSample).length,
      preregistrationEvidence: "required-before-claim"
    },
    guardrail: groupComparisonSuiteGuardrail
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeLegacyEffectSize(value: unknown): SenaGroupComparisonEffectSize {
  const effectSize = isRecord(value) ? value : {};
  return {
    status: "legacy-ambiguous",
    cohenD: finiteOrNull(effectSize.cohenD),
    hedgesG: finiteOrNull(effectSize.hedgesG),
    pooledStandardDeviation: finiteOrNull(effectSize.pooledStandardDeviation),
    reason: "Legacy v1 effect-size values used ambiguous insufficient-sample and zero-variance conventions; the original finite values are preserved but are not current estimable evidence."
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}

function isCanonicalUint32(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0 && value <= 0xffffffff;
}

function approximatelyEqual(left: number, right: number, tolerance = 1e-12) {
  return Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
}

function isFinitePreview(value: unknown, iterations: number, legacy: boolean) {
  return Array.isArray(value) &&
    value.length > 0 &&
    (legacy ? value.length <= Math.min(20, iterations) : value.length === Math.min(20, iterations)) &&
    value.every(isFiniteNumber);
}

function isCanonicalPermutation(value: unknown, legacy: boolean) {
  if (!isRecord(value) || !isPositiveInteger(value.iterations) || value.iterations < 100) return false;
  return isCanonicalUint32(value.seed) &&
    isFiniteNumber(value.pTwoSided) && value.pTwoSided >= 0 && value.pTwoSided <= 1 &&
    isFiniteNumber(value.nullLower) && isFiniteNumber(value.nullUpper) && value.nullLower <= value.nullUpper &&
    isFinitePreview(value.samplesPreview, value.iterations, legacy);
}

function isCanonicalBootstrap(value: unknown, legacy: boolean) {
  if (!isRecord(value) || !isPositiveInteger(value.iterations) || value.iterations < 100) return false;
  return isCanonicalUint32(value.seed) &&
    isFiniteNumber(value.meanDifferenceLower) && isFiniteNumber(value.meanDifferenceUpper) &&
    value.meanDifferenceLower <= value.meanDifferenceUpper &&
    isFinitePreview(value.samplesPreview, value.iterations, legacy);
}

function isCanonicalCommonComparison(value: Record<string, unknown>, legacy: boolean) {
  if (!SENA_GROUP_COMPARISON_METRICS.includes(value.metric as SenaGroupComparisonMetric)) return false;
  if (value.groupField !== "group" && value.groupField !== "role") return false;
  if (typeof value.groupA !== "string" || value.groupA.trim().length === 0) return false;
  if (typeof value.groupB !== "string" || value.groupB.trim().length === 0 || value.groupA === value.groupB) return false;
  if (!isPositiveInteger(value.nA) || !isPositiveInteger(value.nB)) return false;
  if (!isFiniteNumber(value.meanA) || !isFiniteNumber(value.meanB) || !isFiniteNumber(value.observedDifference)) return false;
  const differenceTolerance = legacy ? 0.00011 : 1e-12;
  if (!approximatelyEqual(value.observedDifference, value.meanA - value.meanB, differenceTolerance)) return false;
  if (!isCanonicalPermutation(value.permutation, legacy) || !isCanonicalBootstrap(value.bootstrap, legacy)) return false;
  if (!isRecord(value.diagnostics)) return false;
  const comparedPeople = value.nA + value.nB;
  const minGroupSize = Math.min(value.nA, value.nB);
  if (!Number.isSafeInteger(value.diagnostics.totalPeople) || (value.diagnostics.totalPeople as number) < comparedPeople) return false;
  if (value.diagnostics.comparedPeople !== comparedPeople || value.diagnostics.minGroupSize !== minGroupSize) return false;
  if (value.diagnostics.balancedDesign !== (value.nA === value.nB)) return false;
  if (value.diagnostics.smallSample !== (minGroupSize < 5) || value.diagnostics.metricScale !== "person-metric") return false;
  return typeof value.guardrail === "string" && value.guardrail.trim().length > 0;
}

function isCurrentEffectSize(
  value: unknown,
  nA: number,
  nB: number,
  observedDifference: number
): value is SenaGroupComparisonEffectSize {
  if (!isRecord(value) || typeof value.reason !== "string" || value.reason.trim().length === 0) return false;
  const insufficient = nA < 2 || nB < 2;
  if (value.status === "insufficient-sample") {
    return insufficient && value.cohenD === null && value.hedgesG === null && value.pooledStandardDeviation === null;
  }
  if (insufficient) return false;
  if (value.status === "zero-variance-equal" || value.status === "zero-variance-separated") {
    const equalMeans = observedDifference === 0;
    return value.cohenD === null && value.hedgesG === null && value.pooledStandardDeviation === 0 &&
      (value.status === "zero-variance-equal" ? equalMeans : !equalMeans);
  }
  if (value.status !== "estimable" || !isFiniteNumber(value.cohenD) || !isFiniteNumber(value.hedgesG) ||
    !isFiniteNumber(value.pooledStandardDeviation) || value.pooledStandardDeviation <= 0) return false;
  const unroundedD = observedDifference / value.pooledStandardDeviation;
  const hedgesCorrection = 1 - (3 / ((4 * (nA + nB)) - 9));
  return value.cohenD === round(unroundedD) && value.hedgesG === round(unroundedD * hedgesCorrection);
}

function isCanonicalAnalysisConfig(value: unknown): value is SenaResolvedBuildOptions {
  if (!isRecord(value) || !isRecord(value.temporal)) return false;
  const requiredKeys = [
    "alpha", "beta", "gamma", "normalization", "bridgeWeightRule", "direction",
    "deg_convention", "delta", "Phi", "d", "seed", "undirectedSocial", "temporal"
  ];
  if (!requiredKeys.every((key) => Object.hasOwn(value, key))) return false;
  try {
    validateSenaAnalyticalInputs({
      dataset: { people: [], interactions: [], utterances: [], coded_segments: [], codebook: [] },
      buildOptions: value as unknown as Partial<SenaBuildOptions>
    });
    return Number.isInteger(value.temporal.movingWindowSize) && Number(value.temporal.movingWindowSize) > 0 &&
      Number.isInteger(value.temporal.movingWindowStep) && Number(value.temporal.movingWindowStep) > 0 &&
      Number.isInteger(value.temporal.turnWindowRadius) && Number(value.temporal.turnWindowRadius) >= 0;
  } catch {
    return false;
  }
}

function sameStatisticNumber(left: unknown, right: number | null) {
  if (right === null) return left === null;
  return isFiniteNumber(left) && approximatelyEqual(left, right);
}

function isCanonicalSufficientStatistics(
  value: unknown,
  expected: SenaGroupComparisonSufficientStatistics
) {
  return isRecord(value) &&
    value.n === expected.n &&
    sameStatisticNumber(value.sum, expected.sum) &&
    sameStatisticNumber(value.sumSquares, expected.sumSquares) &&
    sameStatisticNumber(value.mean, expected.mean) &&
    sameStatisticNumber(value.unbiasedVariance, expected.unbiasedVariance);
}

function isCanonicalGroupComparisonSourceEvidence(
  value: unknown,
  comparison: Record<string, unknown>
): value is SenaGroupComparisonSourceEvidence {
  if (!isRecord(value) || value.status !== "bound-current-source" ||
    value.hashAlgorithm !== "sena-stable-fnv1a32/v1" ||
    typeof value.datasetContentHash !== "string" || !/^0x[a-f0-9]{8}$/.test(value.datasetContentHash) ||
    !isCanonicalAnalysisConfig(value.analysisConfig) ||
    value.analysisConfigHash !== buildSenaAnalysisConfigHash(value.analysisConfig) ||
    !isRecord(value.groupDefinition) ||
    value.groupDefinition.metric !== comparison.metric ||
    value.groupDefinition.groupField !== comparison.groupField ||
    value.groupDefinition.groupA !== comparison.groupA ||
    value.groupDefinition.groupB !== comparison.groupB ||
    value.groupDefinitionHash !== buildSenaStableContentHash(value.groupDefinition) ||
    !Array.isArray(value.metricUniverse) || value.metricUniverse.length === 0 ||
    !isRecord(value.sufficientStatistics) ||
    typeof value.evidenceHash !== "string") return false;

  const metricUniverse = value.metricUniverse;
  if (!metricUniverse.every((entry) => isRecord(entry) &&
    typeof entry.personId === "string" && entry.personId.length > 0 &&
    typeof entry.group === "string" && typeof entry.role === "string" &&
    isFiniteNumber(entry.value))) return false;
  const personIds = metricUniverse.map((entry) => (entry as { personId: string }).personId);
  if (new Set(personIds).size !== personIds.length ||
    JSON.stringify(personIds) !== JSON.stringify([...personIds].sort()) ||
    value.metricUniverseHash !== buildSenaStableContentHash(metricUniverse)) return false;

  const groupField = comparison.groupField as "group" | "role";
  const valuesA = metricUniverse
    .filter((entry) => (entry as Record<string, unknown>)[groupField] === comparison.groupA)
    .map((entry) => (entry as { value: number }).value);
  const valuesB = metricUniverse
    .filter((entry) => (entry as Record<string, unknown>)[groupField] === comparison.groupB)
    .map((entry) => (entry as { value: number }).value);
  if (valuesA.length === 0 || valuesB.length === 0 ||
    !isCanonicalSufficientStatistics(value.sufficientStatistics.groupA, sufficientStatistics(valuesA)) ||
    !isCanonicalSufficientStatistics(value.sufficientStatistics.groupB, sufficientStatistics(valuesB))) return false;

  const { evidenceHash: _evidenceHash, ...evidenceBody } = value;
  if (value.evidenceHash !== buildSenaStableContentHash(evidenceBody)) return false;

  const permutation = comparison.permutation as SenaGroupComparisonResult["permutation"];
  const bootstrap = comparison.bootstrap as SenaGroupComparisonResult["bootstrap"];
  let expected;
  try {
    expected = computeSenaGroupComparisonDeterministicFields({
      metricUniverse: metricUniverse as SenaGroupComparisonSourceEvidence["metricUniverse"],
      groupField,
      groupA: comparison.groupA as string,
      groupB: comparison.groupB as string,
      permutationIterations: permutation.iterations,
      permutationSeed: permutation.seed,
      bootstrapIterations: bootstrap.iterations
    });
  } catch {
    return false;
  }
  const submitted = {
    nA: comparison.nA,
    nB: comparison.nB,
    meanA: comparison.meanA,
    meanB: comparison.meanB,
    observedDifference: comparison.observedDifference,
    effectSize: comparison.effectSize,
    permutation,
    bootstrap,
    diagnostics: comparison.diagnostics
  };
  return comparison.guardrail === groupComparisonGuardrail &&
    stableJson(submitted) === stableJson(expected);
}

function isCurrentSenaGroupComparisonResult(value: unknown): value is SenaGroupComparisonResult {
  return isRecord(value) &&
    value.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparison &&
    value.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.groupComparison &&
    isCanonicalCommonComparison(value, false) &&
    isCurrentEffectSize(value.effectSize, value.nA as number, value.nB as number, value.observedDifference as number) &&
    isCanonicalGroupComparisonSourceEvidence(value.sourceEvidence, value);
}

function isLegacyV1EffectSize(value: unknown) {
  return isRecord(value) &&
    isFiniteNumber(value.cohenD) &&
    isFiniteNumber(value.hedgesG) &&
    isFiniteNumber(value.pooledStandardDeviation);
}

function isNormalizedLegacyComparison(value: unknown): value is SenaGroupComparisonResult {
  return isRecord(value) &&
    value.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparison &&
    value.sourceSchemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.groupComparison &&
    isCanonicalCommonComparison(value, true) &&
    isRecord(value.effectSize) && value.effectSize.status === "legacy-ambiguous" &&
    isFiniteNumber(value.effectSize.cohenD) && isFiniteNumber(value.effectSize.hedgesG) &&
    isFiniteNumber(value.effectSize.pooledStandardDeviation) &&
    typeof value.effectSize.reason === "string" && value.effectSize.reason.length > 0;
}

function normalizeSenaGroupComparisonResult(value: unknown): SenaGroupComparisonResult {
  if (!isRecord(value)) throw new Error("SENA group comparison must be an object.");
  if (value.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparison) {
    if (isCurrentSenaGroupComparisonResult(value) || isNormalizedLegacyComparison(value)) {
      return value as unknown as SenaGroupComparisonResult;
    }
    throw new Error("SENA group-comparison v2 deterministic permutation/bootstrap evidence is internally inconsistent.");
  }
  if (value.schemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.groupComparison) {
    throw new Error("SENA group comparison uses an unsupported schemaVersion.");
  }
  if (
    (value.sourceSchemaVersion !== undefined && value.sourceSchemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.groupComparison) ||
    !isCanonicalCommonComparison(value, true) ||
    !isLegacyV1EffectSize(value.effectSize)
  ) {
    throw new Error("SENA group comparison legacy v1 evidence is internally inconsistent.");
  }
  const legacy = value as unknown as SenaGroupComparisonResultV1;
  return {
    ...legacy,
    schemaVersion: SENA_SCHEMA_VERSIONS.groupComparison,
    sourceSchemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.groupComparison,
    effectSize: normalizeLegacyEffectSize(value.effectSize)
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameStringSet(value: unknown, expected: string[]) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return false;
  return stableJson([...new Set(value)].sort()) === stableJson([...new Set(expected)].sort()) && value.length === expected.length;
}

function isCanonicalSuiteStructure(
  value: Record<string, unknown>,
  comparisons: SenaGroupComparisonSuiteEntry[],
  alpha: number
) {
  if (comparisons.length === 0 || value.comparisonCount !== comparisons.length) return false;
  const ids = comparisons.map((entry) => entry.comparisonId);
  if (new Set(ids).size !== comparisons.length || comparisons.some((entry) => entry.comparisonId !== comparisonId(entry))) return false;
  const ranked = [...comparisons].sort((left, right) => left.holmRank - right.holmRank);
  if (ranked.some((entry, index) => entry.holmRank !== index + 1)) return false;
  if (ranked.some((entry, index) => index > 0 && entry.permutation.pTwoSided < ranked[index - 1].permutation.pTwoSided)) return false;
  let previousAdjusted = 0;
  for (let index = 0; index < ranked.length; index += 1) {
    const entry = ranked[index];
    const adjusted = Math.max(previousAdjusted, Math.min(1, entry.permutation.pTwoSided * (ranked.length - index)));
    if (entry.holmAdjustedP !== round(adjusted) || entry.significantAtAlpha !== (adjusted <= alpha)) return false;
    previousAdjusted = adjusted;
  }
  if (value.significantHolmCount !== ranked.filter((entry) => entry.significantAtAlpha).length) return false;
  if (!isRecord(value.primary) || stableJson(value.primary) !== stableJson(ranked[0])) return false;
  if (!isRecord(value.diagnostics)) return false;
  const expectedMetrics = Array.from(new Set(comparisons.map((entry) => entry.metric))).sort();
  if (!sameStringSet(value.diagnostics.metrics, expectedMetrics)) return false;
  if (!Array.isArray(value.diagnostics.groupPairs)) return false;
  const expectedPairs = Array.from(new Set(comparisons.map((entry) => `${entry.groupField}:${entry.groupA}:${entry.groupB}`))).sort();
  const actualPairs = value.diagnostics.groupPairs.map((pair) => isRecord(pair) &&
    (pair.groupField === "group" || pair.groupField === "role") &&
    typeof pair.groupA === "string" && typeof pair.groupB === "string"
    ? `${pair.groupField}:${pair.groupA}:${pair.groupB}`
    : "");
  if (actualPairs.includes("") || !sameStringSet(actualPairs, expectedPairs)) return false;
  if (value.diagnostics.minGroupSize !== Math.min(...comparisons.map((entry) => entry.diagnostics.minGroupSize))) return false;
  if (value.diagnostics.smallSampleComparisons !== comparisons.filter((entry) => entry.diagnostics.smallSample).length) return false;
  return value.diagnostics.preregistrationEvidence === "required-before-claim";
}

function isCurrentSuite(value: unknown): value is SenaGroupComparisonSuiteResult {
  if (!isRecord(value) || value.schemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite ||
    value.sourceSchemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite ||
    !isFiniteNumber(value.alpha) || value.alpha <= 0 || value.alpha > 1 || value.correction !== "holm" ||
    value.guardrail !== groupComparisonSuiteGuardrail || !Array.isArray(value.comparisons) ||
    !value.comparisons.every(isCurrentSenaGroupComparisonResult)) return false;
  return isCanonicalSuiteStructure(
    value,
    value.comparisons as SenaGroupComparisonSuiteEntry[],
    value.alpha
  );
}

function isNormalizedLegacySuite(value: unknown): value is SenaGroupComparisonSuiteResult {
  if (!isRecord(value) || value.schemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite ||
    value.sourceSchemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite ||
    !isFiniteNumber(value.alpha) || value.alpha <= 0 || value.alpha > 1 || value.correction !== "holm" ||
    typeof value.guardrail !== "string" || value.guardrail.trim().length === 0 || !Array.isArray(value.comparisons) ||
    !value.comparisons.every(isNormalizedLegacyComparison)) return false;
  return isCanonicalSuiteStructure(
    value,
    value.comparisons as SenaGroupComparisonSuiteEntry[],
    value.alpha
  );
}

export function assertSenaGroupComparisonValidationResultMatchesSource(
  value: SenaGroupComparisonValidationResult,
  source: SenaGroupComparisonSourceContext
) {
  const comparisons = value.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite
    ? value.comparisons
    : [value];
  const currentComparisons = comparisons.filter((comparison) =>
    comparison.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.groupComparison
  );
  if (currentComparisons.length === 0) return;
  const model = buildSenaModel(source.dataset, source.buildOptions ?? {});
  for (const comparison of currentComparisons) {
    const expected = buildSenaGroupComparisonSourceEvidence({
      dataset: source.dataset,
      model,
      metric: comparison.metric,
      groupField: comparison.groupField,
      groupA: comparison.groupA,
      groupB: comparison.groupB
    });
    if (stableJson(comparison.sourceEvidence) !== stableJson(expected)) {
      throw new Error("SENA group-comparison source evidence does not match the holder dataset, model configuration, and group definition.");
    }
  }
}

export function normalizeSenaGroupComparisonValidationResult(
  value: SenaGroupComparisonValidationReadModel,
  source?: SenaGroupComparisonSourceContext
): SenaGroupComparisonValidationResult {
  const bindSource = (normalized: SenaGroupComparisonValidationResult) => {
    if (source) assertSenaGroupComparisonValidationResultMatchesSource(normalized, source);
    return normalized;
  };
  if (!isRecord(value)) throw new Error("SENA group-comparison validation result must be an object.");
  if (
    value.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparison ||
    value.schemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.groupComparison
  ) {
    return bindSource(normalizeSenaGroupComparisonResult(value));
  }
  if (
    value.schemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite &&
    value.schemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite
  ) {
    throw new Error("SENA group-comparison validation result uses an unsupported schemaVersion.");
  }
  if (value.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite) {
    if (isCurrentSuite(value) || isNormalizedLegacySuite(value)) {
      return bindSource(value as unknown as SenaGroupComparisonSuiteResult);
    }
    throw new Error("SENA group-comparison suite v2 deterministic leaf or Holm evidence is internally inconsistent.");
  }
  if (
    (value as unknown as Record<string, unknown>).sourceSchemaVersion !== undefined &&
    (value as unknown as Record<string, unknown>).sourceSchemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite
  ) {
    throw new Error("SENA group-comparison suite legacy source is contradictory.");
  }
  const comparisons = Array.isArray(value.comparisons)
    ? value.comparisons.map((comparison) => normalizeSenaGroupComparisonResult(comparison) as SenaGroupComparisonSuiteEntry)
    : [];
  const primary = normalizeSenaGroupComparisonResult(value.primary) as SenaGroupComparisonSuiteEntry;
  const normalized = {
    ...(value as unknown as SenaGroupComparisonSuiteResult),
    schemaVersion: SENA_SCHEMA_VERSIONS.groupComparisonSuite,
    sourceSchemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite,
    primary,
    comparisons
  };
  if (!isNormalizedLegacySuite(normalized)) {
    throw new Error("SENA group-comparison suite legacy evidence is internally inconsistent.");
  }
  return bindSource(normalized);
}

export function isCurrentSenaGroupComparisonValidationResult(
  value: unknown
): value is SenaGroupComparisonValidationResult {
  if (isCurrentSenaGroupComparisonResult(value)) {
    return true;
  }
  return isCurrentSuite(value);
}
