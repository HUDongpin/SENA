import { SENA_LEGACY_SCHEMA_VERSIONS, SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { buildSenaModel } from "./model";
import {
  validateSenaAnalyticalInputs,
  type SenaValidatedGroupComparisonMetric
} from "./analytical-input-validation";
import type { SenaBuildOptions, SenaDataset, SenaModel, SenaPersonMetrics } from "./types";

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

export type SenaGroupComparisonSpec = {
  groupField?: "group" | "role";
  groupA: string;
  groupB: string;
  metric?: SenaGroupComparisonMetric;
};

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
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

function actorRows(model: SenaModel, groupField: "group" | "role", metric: SenaGroupComparisonMetric) {
  return model.nodes
    .filter((node) => node.kind === "person")
    .map((node) => ({
      id: node.id,
      group: node[groupField],
      value: metricValue(node.metrics, metric)
    }));
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
  const rows = actorRows(model, groupField, metric);
  const a = rows.filter((row) => row.group === input.groupA).map((row) => row.value);
  const b = rows.filter((row) => row.group === input.groupB).map((row) => row.value);
  if (a.length === 0 || b.length === 0) {
    throw new Error(`Both groups must contain at least one person for ${groupField} comparison.`);
  }

  const observedDifference = mean(a) - mean(b);
  const effectSize = buildSenaGroupComparisonEffectSize(a, b);
  const combined = [...a, ...b];
  const nA = a.length;
  const iterations = input.iterations ?? 1000;
  const seed = input.seed ?? 20260611;
  const random = seededRandom(seed);
  const samples = Array.from({ length: iterations }, () => {
    const shuffled = [...combined];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
    }
    return mean(shuffled.slice(0, nA)) - mean(shuffled.slice(nA));
  });
  const pTwoSided = (samples.filter((sample) => Math.abs(sample) >= Math.abs(observedDifference)).length + 1) / (samples.length + 1);
  const bootstrapIterations = input.bootstrapIterations ?? iterations;
  const bootstrapSeed = seed + 7919;
  const bootstrapRandom = seededRandom(bootstrapSeed);
  const bootstrapSamples = Array.from({ length: bootstrapIterations }, () => (
    resampleMean(a, bootstrapRandom) - resampleMean(b, bootstrapRandom)
  ));

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.groupComparison,
    sourceSchemaVersion: SENA_SCHEMA_VERSIONS.groupComparison,
    metric,
    groupField,
    groupA: input.groupA,
    groupB: input.groupB,
    nA: a.length,
    nB: b.length,
    meanA: round(mean(a)),
    meanB: round(mean(b)),
    observedDifference: round(observedDifference),
    effectSize,
    permutation: {
      iterations,
      seed,
      pTwoSided: round(pTwoSided),
      nullLower: round(quantile(samples, 0.025)),
      nullUpper: round(quantile(samples, 0.975)),
      samplesPreview: samples.slice(0, 20).map((sample) => round(sample))
    },
    bootstrap: {
      iterations: bootstrapIterations,
      seed: bootstrapSeed,
      meanDifferenceLower: round(quantile(bootstrapSamples, 0.025)),
      meanDifferenceUpper: round(quantile(bootstrapSamples, 0.975)),
      samplesPreview: bootstrapSamples.slice(0, 20).map((sample) => round(sample))
    },
    diagnostics: {
      totalPeople: rows.length,
      comparedPeople: a.length + b.length,
      minGroupSize: Math.min(a.length, b.length),
      balancedDesign: a.length === b.length,
      smallSample: Math.min(a.length, b.length) < 5,
      metricScale: "person-metric"
    },
    guardrail: "Permutation and bootstrap group comparison is descriptive SENA validation support. Use a study-specific preregistered inferential model before making publication or assessment claims."
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
    seed: (input.seed ?? 20260611) + (index * 101),
    bootstrapIterations: input.bootstrapIterations
  }));
  const entries = comparisons.map<SenaGroupComparisonSuiteEntry>((comparison) => ({
    ...comparison,
    comparisonId: comparisonId(comparison),
    holmRank: 0,
    holmAdjustedP: 1,
    significantAtAlpha: false
  }));
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
    guardrail: "Suite-level group comparison controls family-wise error with Holm adjustment, but it remains descriptive validation support until paired with preregistration, domain review, and a study-specific inferential model."
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

function normalizeSenaGroupComparisonResult(value: unknown): SenaGroupComparisonResult {
  if (!isRecord(value)) throw new Error("SENA group comparison must be an object.");
  if (value.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparison) {
    return {
      ...(value as unknown as SenaGroupComparisonResult),
      sourceSchemaVersion: value.sourceSchemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.groupComparison
        ? SENA_LEGACY_SCHEMA_VERSIONS.groupComparison
        : SENA_SCHEMA_VERSIONS.groupComparison
    };
  }
  if (value.schemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.groupComparison) {
    throw new Error("SENA group comparison uses an unsupported schemaVersion.");
  }
  const legacy = value as unknown as SenaGroupComparisonResultV1;
  return {
    ...legacy,
    schemaVersion: SENA_SCHEMA_VERSIONS.groupComparison,
    sourceSchemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.groupComparison,
    effectSize: normalizeLegacyEffectSize(value.effectSize)
  };
}

function isCurrentEffectSize(value: unknown): value is SenaGroupComparisonEffectSize {
  if (!isRecord(value) || typeof value.reason !== "string") return false;
  if (value.status === "estimable") {
    return typeof value.cohenD === "number" && Number.isFinite(value.cohenD) &&
      typeof value.hedgesG === "number" && Number.isFinite(value.hedgesG) &&
      typeof value.pooledStandardDeviation === "number" && Number.isFinite(value.pooledStandardDeviation) &&
      value.pooledStandardDeviation > 0;
  }
  if (value.status === "insufficient-sample") {
    return value.cohenD === null && value.hedgesG === null && value.pooledStandardDeviation === null;
  }
  if (value.status === "zero-variance-equal" || value.status === "zero-variance-separated") {
    return value.cohenD === null && value.hedgesG === null && value.pooledStandardDeviation === 0;
  }
  return false;
}

function isCurrentSenaGroupComparisonResult(value: unknown): value is SenaGroupComparisonResult {
  return isRecord(value) &&
    value.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparison &&
    value.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.groupComparison &&
    isCurrentEffectSize(value.effectSize);
}

export function normalizeSenaGroupComparisonValidationResult(
  value: SenaGroupComparisonValidationReadModel
): SenaGroupComparisonValidationResult {
  if (!isRecord(value)) throw new Error("SENA group-comparison validation result must be an object.");
  if (
    value.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparison ||
    value.schemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.groupComparison
  ) {
    return normalizeSenaGroupComparisonResult(value);
  }
  if (
    value.schemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite &&
    value.schemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite
  ) {
    throw new Error("SENA group-comparison validation result uses an unsupported schemaVersion.");
  }

  const sourceSchemaVersion = value.schemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite ||
    value.sourceSchemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite
    ? SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite
    : SENA_SCHEMA_VERSIONS.groupComparisonSuite;
  const comparisons = Array.isArray(value.comparisons)
    ? value.comparisons.map((comparison) => normalizeSenaGroupComparisonResult(comparison) as SenaGroupComparisonSuiteEntry)
    : [];
  const primary = normalizeSenaGroupComparisonResult(value.primary) as SenaGroupComparisonSuiteEntry;
  return {
    ...(value as unknown as SenaGroupComparisonSuiteResult),
    schemaVersion: SENA_SCHEMA_VERSIONS.groupComparisonSuite,
    sourceSchemaVersion,
    primary,
    comparisons
  };
}

export function isCurrentSenaGroupComparisonValidationResult(
  value: unknown
): value is SenaGroupComparisonValidationResult {
  if (isCurrentSenaGroupComparisonResult(value)) {
    return true;
  }
  return isRecord(value) &&
    value.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite &&
    value.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite &&
    isCurrentSenaGroupComparisonResult(value.primary) &&
    Array.isArray(value.comparisons) &&
    value.comparisons.every(isCurrentSenaGroupComparisonResult);
}
