import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { SENA_LEGACY_SCHEMA_VERSIONS, SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { buildSenaModel } from "./model";
import {
  buildSenaAnalysisConfigHash,
  buildSenaDatasetContentHash,
  buildSenaStableContentHash
} from "./data-contract-audit";
import {
  SENA_GROUP_COMPARISON_MAX_ITERATIONS,
  SENA_GROUP_COMPARISON_MAX_SUITE_COMPARISONS,
  SENA_GROUP_COMPARISON_METRICS,
  SENA_GROUP_COMPARISON_MIN_ITERATIONS,
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

const SENA_GROUP_COMPARISON_CARRIER_MAX_TEXT_BYTES = 4 * 1024;
const SENA_GROUP_COMPARISON_CARRIER_MAX_TOTAL_TEXT_BYTES = 8 * 1024 * 1024;
const SENA_GROUP_COMPARISON_CARRIER_MAX_UNBOUND_METRIC_UNIVERSE = 65_536;
const SENA_GROUP_COMPARISON_CARRIER_MAX_TOTAL_METRIC_UNIVERSE_ROWS = 200_000;

export type SenaGroupComparisonCarrierBudget = {
  textBytes: number;
  workUnits: number;
  metricUniverseRows: number;
};

export function createSenaGroupComparisonCarrierBudget(): SenaGroupComparisonCarrierBudget {
  return {
    textBytes: 0,
    workUnits: 0,
    metricUniverseRows: 0
  };
}

function carrierRuntimeIdentifiesProxy(value: object) {
  try {
    const runtimeProcess = (globalThis as typeof globalThis & {
      process?: {
        getBuiltinModule?: (id: string) => unknown;
      };
    }).process;
    const util = runtimeProcess?.getBuiltinModule?.("node:util") as {
      types?: { isProxy?: (candidate: unknown) => boolean };
    } | undefined;
    return util?.types?.isProxy?.(value) === true;
  } catch {
    return false;
  }
}

function carrierOwnDataDescriptors(value: object, expectedPrototype: object | null) {
  if (carrierRuntimeIdentifiesProxy(value)) return undefined;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== expectedPrototype && prototype !== null) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const descriptor of Object.values(descriptors)) {
      if (!("value" in descriptor)) return undefined;
    }
    return descriptors;
  } catch {
    return undefined;
  }
}

function hasOnlyCarrierKeys(value: unknown, allowedKeys: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const allowed = new Set(allowedKeys);
  const descriptors = carrierOwnDataDescriptors(value, Object.prototype);
  if (!descriptors) return false;
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.length > allowed.size) return false;
  for (const key of ownKeys) {
    if (typeof key !== "string" || !allowed.has(key)) return false;
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return false;
  }
  return true;
}

function hasExactCarrierKeys(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = []
): value is Record<string, unknown> {
  if (!hasOnlyCarrierKeys(value, [...requiredKeys, ...optionalKeys])) return false;
  return requiredKeys.every((key) => Object.hasOwn(value, key));
}

function isBoundedDenseCarrierArray(
  value: unknown,
  minimumEntries: number,
  maximumEntries: number
): value is unknown[] {
  if (!Array.isArray(value)) return false;
  const descriptors = carrierOwnDataDescriptors(value, Array.prototype);
  const lengthDescriptor = descriptors?.length;
  const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : undefined;
  if (!descriptors || !Number.isSafeInteger(length) ||
    (length as number) < minimumEntries || (length as number) > maximumEntries) return false;
  let ownEntryCount = 0;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length") continue;
    if (typeof key !== "string") return false;
    if (!/^(0|[1-9]\d*)$/.test(key)) return false;
    const index = Number(key);
    const descriptor = descriptors[key];
    if (!Number.isSafeInteger(index) || index < 0 || index >= (length as number) || String(index) !== key ||
      !descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      return false;
    }
    ownEntryCount += 1;
    if (ownEntryCount > (length as number)) return false;
  }
  return ownEntryCount === length;
}

function admitCarrierText(
  value: unknown,
  budget: SenaGroupComparisonCarrierBudget,
  options: { nonempty?: boolean } = {}
) {
  if (typeof value !== "string" ||
    value.length > SENA_GROUP_COMPARISON_CARRIER_MAX_TEXT_BYTES ||
    (options.nonempty && value.trim().length === 0)) return false;
  const bytes = new TextEncoder().encode(value).byteLength;
  if (bytes > SENA_GROUP_COMPARISON_CARRIER_MAX_TEXT_BYTES ||
    bytes > SENA_GROUP_COMPARISON_CARRIER_MAX_TOTAL_TEXT_BYTES - budget.textBytes) return false;
  budget.textBytes += bytes;
  return true;
}

function admitCarrierNumberArray(value: unknown, maximumEntries: number) {
  if (!isBoundedDenseCarrierArray(value, 1, maximumEntries)) return false;
  for (const entry of value) {
    if (!isFiniteNumber(entry)) return false;
  }
  return true;
}

function admitCarrierTextArray(
  value: unknown,
  maximumEntries: number,
  budget: SenaGroupComparisonCarrierBudget
) {
  if (!isBoundedDenseCarrierArray(value, 0, maximumEntries)) return false;
  for (const entry of value) {
    if (!admitCarrierText(entry, budget)) return false;
  }
  return true;
}

function admitAnalysisConfigCarrier(value: unknown, budget: SenaGroupComparisonCarrierBudget) {
  if (!hasExactCarrierKeys(value, [
    "alpha", "beta", "gamma", "normalization", "bridgeWeightRule", "direction",
    "deg_convention", "delta", "Phi", "d", "seed", "undirectedSocial", "temporal"
  ]) || !hasExactCarrierKeys(value.temporal, [
    "mode", "movingWindowSize", "movingWindowStep", "turnWindowRadius"
  ])) return false;
  for (const key of ["alpha", "beta", "gamma", "d", "seed"] as const) {
    if (!isFiniteNumber(value[key])) return false;
  }
  if (typeof value.undirectedSocial !== "boolean") return false;
  for (const key of ["normalization", "bridgeWeightRule", "direction", "deg_convention", "delta", "Phi"] as const) {
    if (!admitCarrierText(value[key], budget, { nonempty: true })) return false;
  }
  if (!admitCarrierText(value.temporal.mode, budget, { nonempty: true })) return false;
  for (const key of ["movingWindowSize", "movingWindowStep", "turnWindowRadius"] as const) {
    if (!isFiniteNumber(value.temporal[key])) return false;
  }
  return true;
}

function admitSufficientStatisticsCarrier(value: unknown) {
  if (!hasExactCarrierKeys(value, ["groupA", "groupB"])) return false;
  for (const group of [value.groupA, value.groupB]) {
    if (!hasExactCarrierKeys(group, ["n", "sum", "sumSquares", "mean", "unbiasedVariance"])) return false;
    if (!isPositiveInteger(group.n) || !isFiniteNumber(group.sum) ||
      !isFiniteNumber(group.sumSquares) || !isFiniteNumber(group.mean) ||
      !(group.unbiasedVariance === null || isFiniteNumber(group.unbiasedVariance))) return false;
  }
  return true;
}

function admitSourceEvidenceCarrier(
  value: unknown,
  comparison: Record<string, unknown>,
  budget: SenaGroupComparisonCarrierBudget,
  expectedPeopleCount: number | undefined,
  countReplayWork: boolean
) {
  if (!hasExactCarrierKeys(value, [
    "status", "hashAlgorithm", "datasetContentHash", "analysisConfig", "analysisConfigHash",
    "groupDefinition", "groupDefinitionHash", "metricUniverse", "metricUniverseHash",
    "sufficientStatistics", "evidenceHash"
  ]) || !hasExactCarrierKeys(value.groupDefinition, ["metric", "groupField", "groupA", "groupB"]) ||
    !admitAnalysisConfigCarrier(value.analysisConfig, budget) ||
    !admitSufficientStatisticsCarrier(value.sufficientStatistics)) return false;
  for (const text of [
    value.status,
    value.hashAlgorithm,
    value.datasetContentHash,
    value.analysisConfigHash,
    value.groupDefinitionHash,
    value.metricUniverseHash,
    value.evidenceHash,
    value.groupDefinition.metric,
    value.groupDefinition.groupField,
    value.groupDefinition.groupA,
    value.groupDefinition.groupB
  ]) {
    if (!admitCarrierText(text, budget, { nonempty: true })) return false;
  }
  const maximumUniverse = expectedPeopleCount === undefined
    ? SENA_GROUP_COMPARISON_CARRIER_MAX_UNBOUND_METRIC_UNIVERSE
    : Math.min(expectedPeopleCount, SENA_GROUP_COMPARISON_CARRIER_MAX_UNBOUND_METRIC_UNIVERSE);
  if (!isBoundedDenseCarrierArray(value.metricUniverse, 1, maximumUniverse) ||
    (expectedPeopleCount !== undefined && value.metricUniverse.length !== expectedPeopleCount)) return false;
  if (value.metricUniverse.length >
    SENA_GROUP_COMPARISON_CARRIER_MAX_TOTAL_METRIC_UNIVERSE_ROWS - budget.metricUniverseRows) return false;
  budget.metricUniverseRows += value.metricUniverse.length;
  if ((comparison.groupField !== "group" && comparison.groupField !== "role") ||
    typeof comparison.groupA !== "string" || typeof comparison.groupB !== "string") return false;
  let actualGroupA = 0;
  let actualGroupB = 0;
  for (const entry of value.metricUniverse) {
    if (!hasExactCarrierKeys(entry, ["personId", "group", "role", "value"]) ||
      !admitCarrierText(entry.personId, budget, { nonempty: true }) ||
      !admitCarrierText(entry.group, budget) || !admitCarrierText(entry.role, budget) ||
      !isFiniteNumber(entry.value)) return false;
    const groupValue = entry[comparison.groupField];
    if (groupValue === comparison.groupA) actualGroupA += 1;
    if (groupValue === comparison.groupB) actualGroupB += 1;
  }
  const sufficientStatistics = value.sufficientStatistics as {
    groupA: Record<string, unknown>;
    groupB: Record<string, unknown>;
  };
  if (actualGroupA !== comparison.nA || actualGroupB !== comparison.nB ||
    sufficientStatistics.groupA.n !== actualGroupA ||
    sufficientStatistics.groupB.n !== actualGroupB) return false;

  const permutation = comparison.permutation;
  const bootstrap = comparison.bootstrap;
  if (!isRecord(permutation) || !isRecord(bootstrap) ||
    !Number.isSafeInteger(permutation.iterations) || Number(permutation.iterations) < 0 ||
    !Number.isSafeInteger(bootstrap.iterations) || Number(bootstrap.iterations) < 0) return false;
  if (countReplayWork) {
    const iterationTotal = Number(permutation.iterations) + Number(bootstrap.iterations);
    const comparedPeople = actualGroupA + actualGroupB;
    const workUnits = iterationTotal * comparedPeople;
    if (!Number.isSafeInteger(iterationTotal) || !Number.isSafeInteger(workUnits) || workUnits < 0 ||
      workUnits > SENA_GROUP_COMPARISON_SOURCE_REPLAY_DEFAULT_MAX_WORK_UNITS - budget.workUnits) return false;
    budget.workUnits += workUnits;
  }
  return true;
}

function admitComparisonCarrier(
  value: unknown,
  budget: SenaGroupComparisonCarrierBudget,
  options: {
    suiteEntry: boolean;
    expectedPeopleCount?: number;
    countReplayWork: boolean;
  }
) {
  const baseKeys = [
    "schemaVersion", "sourceSchemaVersion", "metric", "groupField", "groupA", "groupB",
    "nA", "nB", "meanA", "meanB", "observedDifference", "effectSize", "sourceEvidence",
    "permutation", "bootstrap", "diagnostics", "guardrail"
  ];
  const suiteKeys = ["comparisonId", "holmRank", "holmAdjustedP", "significantAtAlpha"];
  if (!hasOnlyCarrierKeys(value, options.suiteEntry ? [...baseKeys, ...suiteKeys] : baseKeys)) return false;
  const currentSchema = value.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparison;
  const legacySchema = value.schemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.groupComparison;
  if (!currentSchema && !legacySchema) return false;
  const currentSource = currentSchema && value.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.groupComparison;
  const normalizedLegacy = currentSchema && value.sourceSchemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.groupComparison;
  const required = [
    "schemaVersion", "metric", "groupField", "groupA", "groupB", "nA", "nB",
    "meanA", "meanB", "observedDifference", "effectSize", "permutation", "bootstrap",
    "diagnostics", "guardrail",
    ...(currentSchema ? ["sourceSchemaVersion"] : []),
    ...(currentSource ? ["sourceEvidence"] : []),
    ...(options.suiteEntry ? suiteKeys : [])
  ];
  const optional = legacySchema ? ["sourceSchemaVersion"] : [];
  if (!hasExactCarrierKeys(value, required, optional) ||
    (legacySchema && value.sourceSchemaVersion !== undefined &&
      value.sourceSchemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.groupComparison) ||
    (!currentSource && !normalizedLegacy && !legacySchema)) return false;

  for (const text of [value.schemaVersion, value.metric, value.groupField, value.groupA, value.groupB, value.guardrail]) {
    if (!admitCarrierText(text, budget, { nonempty: true })) return false;
  }
  if (value.sourceSchemaVersion !== undefined &&
    !admitCarrierText(value.sourceSchemaVersion, budget, { nonempty: true })) return false;
  if (!isPositiveInteger(value.nA) || !isPositiveInteger(value.nB) ||
    !isFiniteNumber(value.meanA) || !isFiniteNumber(value.meanB) ||
    !isFiniteNumber(value.observedDifference)) return false;

  const currentEffect = currentSchema;
  if (!hasExactCarrierKeys(
    value.effectSize,
    currentEffect
      ? ["status", "cohenD", "hedgesG", "pooledStandardDeviation", "reason"]
      : ["cohenD", "hedgesG", "pooledStandardDeviation"]
  )) return false;
  if (currentEffect) {
    if (!admitCarrierText(value.effectSize.status, budget, { nonempty: true }) ||
      !admitCarrierText(value.effectSize.reason, budget, { nonempty: true })) return false;
  }
  for (const key of ["cohenD", "hedgesG", "pooledStandardDeviation"] as const) {
    if (!(value.effectSize[key] === null || isFiniteNumber(value.effectSize[key]))) return false;
  }

  if (!hasExactCarrierKeys(value.permutation, [
    "iterations", "seed", "pTwoSided", "nullLower", "nullUpper", "samplesPreview"
  ]) || !hasExactCarrierKeys(value.bootstrap, [
    "iterations", "seed", "meanDifferenceLower", "meanDifferenceUpper", "samplesPreview"
  ]) || !hasExactCarrierKeys(value.diagnostics, [
    "totalPeople", "comparedPeople", "minGroupSize", "balancedDesign", "smallSample", "metricScale"
  ])) return false;
  if (!Number.isSafeInteger(value.permutation.iterations) || Number(value.permutation.iterations) < 1 ||
    !Number.isSafeInteger(value.permutation.seed) || Number(value.permutation.seed) < 0 ||
    !isFiniteNumber(value.permutation.pTwoSided) || !isFiniteNumber(value.permutation.nullLower) ||
    !isFiniteNumber(value.permutation.nullUpper) ||
    !admitCarrierNumberArray(value.permutation.samplesPreview, 20) ||
    !Number.isSafeInteger(value.bootstrap.iterations) || Number(value.bootstrap.iterations) < 1 ||
    !Number.isSafeInteger(value.bootstrap.seed) || Number(value.bootstrap.seed) < 0 ||
    !isFiniteNumber(value.bootstrap.meanDifferenceLower) ||
    !isFiniteNumber(value.bootstrap.meanDifferenceUpper) ||
    !admitCarrierNumberArray(value.bootstrap.samplesPreview, 20)) return false;
  for (const key of ["totalPeople", "comparedPeople", "minGroupSize"] as const) {
    if (!Number.isSafeInteger(value.diagnostics[key]) || Number(value.diagnostics[key]) < 0) return false;
  }
  if (typeof value.diagnostics.balancedDesign !== "boolean" ||
    typeof value.diagnostics.smallSample !== "boolean" ||
    !admitCarrierText(value.diagnostics.metricScale, budget, { nonempty: true })) return false;

  if (options.suiteEntry && (
    !admitCarrierText(value.comparisonId, budget, { nonempty: true }) ||
    !Number.isSafeInteger(value.holmRank) || Number(value.holmRank) < 1 ||
    !isFiniteNumber(value.holmAdjustedP) || typeof value.significantAtAlpha !== "boolean"
  )) return false;
  if (currentSource && !admitSourceEvidenceCarrier(
    value.sourceEvidence,
    value,
    budget,
    options.expectedPeopleCount,
    options.countReplayWork
  )) return false;
  return true;
}

function admitSuiteCarrier(
  value: Record<string, unknown>,
  budget: SenaGroupComparisonCarrierBudget,
  expectedPeopleCount: number | undefined
) {
  const currentSchema = value.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite;
  const legacySchema = value.schemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite;
  if (!currentSchema && !legacySchema) return false;
  const required = [
    "schemaVersion", "alpha", "correction", "comparisonCount", "significantHolmCount",
    "primary", "comparisons", "diagnostics", "guardrail",
    ...(currentSchema ? ["sourceSchemaVersion"] : [])
  ];
  const optional = legacySchema ? ["sourceSchemaVersion"] : [];
  if (!hasExactCarrierKeys(value, required, optional) ||
    (legacySchema && value.sourceSchemaVersion !== undefined &&
      value.sourceSchemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite) ||
    !isFiniteNumber(value.alpha) || !Number.isSafeInteger(value.comparisonCount) ||
    !Number.isSafeInteger(value.significantHolmCount) ||
    !admitCarrierText(value.schemaVersion, budget, { nonempty: true }) ||
    !admitCarrierText(value.correction, budget, { nonempty: true }) ||
    !admitCarrierText(value.guardrail, budget, { nonempty: true }) ||
    (value.sourceSchemaVersion !== undefined &&
      !admitCarrierText(value.sourceSchemaVersion, budget, { nonempty: true })) ||
    !isBoundedDenseCarrierArray(
      value.comparisons,
      1,
      SENA_GROUP_COMPARISON_MAX_SUITE_COMPARISONS
    ) || !hasExactCarrierKeys(value.diagnostics, [
      "metrics", "groupPairs", "minGroupSize", "smallSampleComparisons", "preregistrationEvidence"
    ]) || !admitCarrierTextArray(value.diagnostics.metrics, SENA_GROUP_COMPARISON_METRICS.length, budget) ||
    !isBoundedDenseCarrierArray(value.diagnostics.groupPairs, 0, value.comparisons.length) ||
    !Number.isSafeInteger(value.diagnostics.minGroupSize) || Number(value.diagnostics.minGroupSize) < 0 ||
    !Number.isSafeInteger(value.diagnostics.smallSampleComparisons) ||
    Number(value.diagnostics.smallSampleComparisons) < 0 ||
    !admitCarrierText(value.diagnostics.preregistrationEvidence, budget, { nonempty: true })) return false;
  for (const pair of value.diagnostics.groupPairs) {
    if (!hasExactCarrierKeys(pair, ["groupField", "groupA", "groupB"]) ||
      !admitCarrierText(pair.groupField, budget, { nonempty: true }) ||
      !admitCarrierText(pair.groupA, budget, { nonempty: true }) ||
      !admitCarrierText(pair.groupB, budget, { nonempty: true })) return false;
  }
  for (const comparison of value.comparisons) {
    if (!admitComparisonCarrier(comparison, budget, {
      suiteEntry: true,
      expectedPeopleCount,
      countReplayWork: true
    })) return false;
  }
  return admitComparisonCarrier(value.primary, budget, {
    suiteEntry: true,
    expectedPeopleCount,
    countReplayWork: false
  });
}

function assertSenaGroupComparisonValidationCarrier(
  value: unknown,
  expectedPeopleCount?: number,
  sharedBudget?: SenaGroupComparisonCarrierBudget
) {
  const topLevelAllowed = [
    "schemaVersion", "sourceSchemaVersion", "metric", "groupField", "groupA", "groupB",
    "nA", "nB", "meanA", "meanB", "observedDifference", "effectSize", "sourceEvidence",
    "permutation", "bootstrap", "diagnostics", "guardrail", "alpha", "correction",
    "comparisonCount", "significantHolmCount", "primary", "comparisons"
  ];
  let admitted = false;
  try {
    if (!hasOnlyCarrierKeys(value, topLevelAllowed)) throw new Error("shape");
    const budget = sharedBudget ?? createSenaGroupComparisonCarrierBudget();
    admitted = value.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparison ||
      value.schemaVersion === SENA_LEGACY_SCHEMA_VERSIONS.groupComparison
      ? admitComparisonCarrier(value, budget, {
          suiteEntry: false,
          expectedPeopleCount,
          countReplayWork: true
        })
      : admitSuiteCarrier(value, budget, expectedPeopleCount);
  } catch {
    admitted = false;
  }
  if (!admitted) {
    throw new Error("SENA group-comparison validation carrier exceeds its bounded suite structure or exact carrier shape.");
  }
}

export function isSenaGroupComparisonValidationCarrierAdmitted(
  value: unknown,
  sharedBudget?: SenaGroupComparisonCarrierBudget
) {
  try {
    assertSenaGroupComparisonValidationCarrier(value, undefined, sharedBudget);
    return true;
  } catch {
    return false;
  }
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
  if (!isRecord(value) || !isPositiveInteger(value.iterations) ||
    value.iterations < SENA_GROUP_COMPARISON_MIN_ITERATIONS ||
    (!legacy && value.iterations > SENA_GROUP_COMPARISON_MAX_ITERATIONS)) return false;
  return isCanonicalUint32(value.seed) &&
    isFiniteNumber(value.pTwoSided) && value.pTwoSided >= 0 && value.pTwoSided <= 1 &&
    isFiniteNumber(value.nullLower) && isFiniteNumber(value.nullUpper) && value.nullLower <= value.nullUpper &&
    isFinitePreview(value.samplesPreview, value.iterations, legacy);
}

function isCanonicalBootstrap(value: unknown, legacy: boolean) {
  if (!isRecord(value) || !isPositiveInteger(value.iterations) ||
    value.iterations < SENA_GROUP_COMPARISON_MIN_ITERATIONS ||
    (!legacy && value.iterations > SENA_GROUP_COMPARISON_MAX_ITERATIONS)) return false;
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

type BoundedSuiteCarrier = Record<string, unknown> & {
  comparisons: unknown[];
  primary: Record<string, unknown>;
  diagnostics: Record<string, unknown> & {
    metrics: unknown[];
    groupPairs: unknown[];
  };
};

function hasBoundedSuiteCarrier(value: Record<string, unknown>): value is BoundedSuiteCarrier {
  if (!Array.isArray(value.comparisons) ||
    value.comparisons.length === 0 ||
    value.comparisons.length > SENA_GROUP_COMPARISON_MAX_SUITE_COMPARISONS ||
    !isRecord(value.primary) ||
    !isRecord(value.diagnostics) ||
    !Array.isArray(value.diagnostics.metrics) ||
    value.diagnostics.metrics.length > SENA_GROUP_COMPARISON_METRICS.length ||
    !Array.isArray(value.diagnostics.groupPairs) ||
    value.diagnostics.groupPairs.length > value.comparisons.length) return false;
  return true;
}

function isCurrentSuite(value: unknown): value is SenaGroupComparisonSuiteResult {
  if (!isRecord(value) || !hasBoundedSuiteCarrier(value) ||
    value.schemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite ||
    value.sourceSchemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite ||
    !isFiniteNumber(value.alpha) || value.alpha <= 0 || value.alpha > 1 || value.correction !== "holm" ||
    value.guardrail !== groupComparisonSuiteGuardrail ||
    !value.comparisons.every(isCurrentSenaGroupComparisonResult)) return false;
  return isCanonicalSuiteStructure(
    value,
    value.comparisons as SenaGroupComparisonSuiteEntry[],
    value.alpha
  );
}

function isNormalizedLegacySuite(value: unknown): value is SenaGroupComparisonSuiteResult {
  if (!isRecord(value) || !hasBoundedSuiteCarrier(value) ||
    value.schemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite ||
    value.sourceSchemaVersion !== SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite ||
    !isFiniteNumber(value.alpha) || value.alpha <= 0 || value.alpha > 1 || value.correction !== "holm" ||
    typeof value.guardrail !== "string" || value.guardrail.trim().length === 0 ||
    !value.comparisons.every(isNormalizedLegacyComparison)) return false;
  return isCanonicalSuiteStructure(
    value,
    value.comparisons as SenaGroupComparisonSuiteEntry[],
    value.alpha
  );
}

export function assertSenaGroupComparisonValidationResultMatchesSource(
  value: SenaGroupComparisonValidationResult,
  source: SenaGroupComparisonSourceContext,
  verificationCache = new SenaGroupComparisonSourceVerificationCache()
) {
  verificationCache.assertMatches(value, source);
}

type SenaGroupComparisonCachedSource = {
  model: SenaModel;
  evidenceByComparison: Map<string, SenaGroupComparisonSourceEvidence>;
  verifiedResultsByKey: Map<string, SenaGroupComparisonValidationResult>;
};

export const SENA_GROUP_COMPARISON_SOURCE_REPLAY_DEFAULT_MAX_WORK_UNITS = 50_000_000;
export const SENA_GROUP_COMPARISON_SOURCE_REPLAY_DEFAULT_MAX_UNIQUE_RESULTS = 1_000;
export const SENA_GROUP_COMPARISON_SOURCE_REPLAY_DEFAULT_MAX_UNIQUE_SOURCES = 1_000;
export const SENA_GROUP_COMPARISON_SOURCE_MODEL_DEFAULT_MAX_WORK_UNITS = 50_000_000;
export const SENA_GROUP_COMPARISON_SOURCE_DIGEST_DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
export const SENA_GROUP_COMPARISON_SOURCE_DIGEST_DEFAULT_MAX_WORK_UNITS = 5_000_000;
const SENA_GROUP_COMPARISON_SOURCE_MODEL_MAX_COLLECTION_ENTRIES = 65_536;
const SENA_GROUP_COMPARISON_SOURCE_MODEL_MAX_TEXT_BYTES = 16 * 1024 * 1024;

type SenaGroupComparisonVerificationLeaf = {
  key: string;
  workUnits: number;
};

function safeAdmissionWorkProduct(...factors: number[]) {
  let product = 1;
  for (const factor of factors) {
    if (!Number.isSafeInteger(factor) || factor < 0 ||
      (product !== 0 && factor > Math.floor(Number.MAX_SAFE_INTEGER / product))) return undefined;
    product *= factor;
  }
  return product;
}

function safeAdmissionWorkSum(values: number[]) {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - total) return undefined;
    total += value;
  }
  return total;
}

function isDenseBoundedSourceModelArray(value: unknown, maximum: number): value is unknown[] {
  return isBoundedDenseCarrierArray(value, 0, maximum);
}

type SenaGroupComparisonSourceDigestMeasurement = {
  textBytes: number;
  digestBytes: number;
  workUnits: number;
};

function safeSourceDigestAdd(current: number, increment: number) {
  if (!Number.isSafeInteger(increment) || increment < 0 ||
    current > Number.MAX_SAFE_INTEGER - increment) {
    throw new Error("SENA group-comparison source digest scan budget is not safely representable.");
  }
  return current + increment;
}

function assertWellFormedSourceDigestString(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error("SENA group-comparison source strings must use well-formed UTF-16.");
      }
      index += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error("SENA group-comparison source strings must use well-formed UTF-16.");
    }
  }
}

function sourceDigestUtf8ByteLength(value: string) {
  assertWellFormedSourceDigestString(value);
  return Buffer.byteLength(value, "utf8");
}

function sourceDigestScalarToken(value: unknown) {
  if (value === undefined) return "u";
  if (value === null) return "z";
  if (typeof value === "boolean") return value ? "b1" : "b0";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "nNaN";
    if (value === Number.POSITIVE_INFINITY) return "nInfinity";
    if (value === Number.NEGATIVE_INFINITY) return "n-Infinity";
    if (Object.is(value, -0)) return "n-0";
    return `n${String(value)}`;
  }
  if (typeof value === "bigint") return `i${value.toString()}`;
  return undefined;
}

/**
 * Measures every source string and every byte/work unit that the streaming
 * identity digest will consume. This phase never constructs a full canonical
 * string and completes before createHash() is called.
 */
function measureSenaGroupComparisonSourceDigest(
  source: SenaGroupComparisonSourceContext,
  maximumTextBytes: number,
  maximumDigestBytes: number,
  maximumWorkUnits: number,
  onWorkUnitAttempt: () => void
): SenaGroupComparisonSourceDigestMeasurement {
  const measurement: SenaGroupComparisonSourceDigestMeasurement = {
    textBytes: 0,
    digestBytes: 0,
    workUnits: 0
  };
  const ancestors = new WeakSet<object>();
  const reserveDigestText = (value: string, countsAsSourceText: boolean) => {
    onWorkUnitAttempt();
    if (measurement.workUnits >= maximumWorkUnits) {
      throw new Error("SENA group-comparison source digest scan budget exceeded.");
    }
    if (countsAsSourceText && value.length > maximumTextBytes) {
      throw new Error("SENA group-comparison source model text budget exceeded.");
    }
    if (value.length > maximumDigestBytes - measurement.digestBytes) {
      throw new Error("SENA group-comparison source digest scan budget exceeded.");
    }
    const bytes = sourceDigestUtf8ByteLength(value);
    if (countsAsSourceText) {
      if (bytes > maximumTextBytes - measurement.textBytes) {
        throw new Error("SENA group-comparison source model text budget exceeded.");
      }
      measurement.textBytes += bytes;
    }
    if (bytes > maximumDigestBytes - measurement.digestBytes) {
      throw new Error("SENA group-comparison source digest scan budget exceeded.");
    }
    measurement.digestBytes = safeSourceDigestAdd(measurement.digestBytes, bytes);
    measurement.workUnits = safeSourceDigestAdd(measurement.workUnits, 1);
    return bytes;
  };
  const reserveToken = (value: string) => {
    reserveDigestText(value, false);
  };
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      const bytes = reserveDigestText(value, true);
      reserveToken(`s${bytes}:`);
      return;
    }
    const scalar = sourceDigestScalarToken(value);
    if (scalar !== undefined) {
      reserveToken(scalar);
      return;
    }
    if (!value || typeof value !== "object" || ancestors.has(value)) {
      invalidSourceDatasetCarrier();
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        const descriptors = carrierOwnDataDescriptors(value, Array.prototype);
        const lengthDescriptor = descriptors?.length;
        const length = lengthDescriptor && "value" in lengthDescriptor
          ? lengthDescriptor.value
          : undefined;
        if (!descriptors || !Number.isSafeInteger(length) || (length as number) < 0 ||
          (length as number) > SENA_GROUP_COMPARISON_SOURCE_MODEL_MAX_COLLECTION_ENTRIES ||
          !isDenseBoundedSourceModelArray(
            value,
            SENA_GROUP_COMPARISON_SOURCE_MODEL_MAX_COLLECTION_ENTRIES
          )) invalidSourceDatasetCarrier();
        reserveToken(`a${String(length)}[`);
        for (let index = 0; index < (length as number); index += 1) {
          visit(descriptors[String(index)].value);
        }
        reserveToken("]");
        return;
      }
      const descriptors = carrierOwnDataDescriptors(value, Object.prototype);
      if (!descriptors) invalidSourceDatasetCarrier();
      const keys = Reflect.ownKeys(descriptors);
      if (keys.some((key) => typeof key !== "string")) invalidSourceDatasetCarrier();
      const orderedKeys = (keys as string[]).sort();
      reserveToken(`o${orderedKeys.length}{`);
      for (const key of orderedKeys) {
        const descriptor = descriptors[key];
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          invalidSourceDatasetCarrier();
        }
        const keyBytes = reserveDigestText(key, false);
        reserveToken(`k${keyBytes}:`);
        visit(descriptor.value);
      }
      reserveToken("}");
    } finally {
      ancestors.delete(value);
    }
  };
  visit(source);
  return measurement;
}

function senaGroupComparisonSourceDigest(source: SenaGroupComparisonSourceContext) {
  const hash = createHash("sha256");
  const ancestors = new WeakSet<object>();
  const update = (value: string) => {
    hash.update(value, "utf8");
  };
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      const bytes = sourceDigestUtf8ByteLength(value);
      update(`s${bytes}:`);
      update(value);
      return;
    }
    const scalar = sourceDigestScalarToken(value);
    if (scalar !== undefined) {
      update(scalar);
      return;
    }
    if (!value || typeof value !== "object" || ancestors.has(value)) {
      invalidSourceDatasetCarrier();
    }
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        const descriptors = carrierOwnDataDescriptors(value, Array.prototype);
        const length = descriptors?.length && "value" in descriptors.length
          ? descriptors.length.value
          : undefined;
        if (!descriptors || !Number.isSafeInteger(length)) invalidSourceDatasetCarrier();
        update(`a${String(length)}[`);
        for (let index = 0; index < (length as number); index += 1) {
          visit(descriptors[String(index)].value);
        }
        update("]");
        return;
      }
      const descriptors = carrierOwnDataDescriptors(value, Object.prototype);
      if (!descriptors) invalidSourceDatasetCarrier();
      const orderedKeys = Reflect.ownKeys(descriptors).map(String).sort();
      update(`o${orderedKeys.length}{`);
      for (const key of orderedKeys) {
        const descriptor = descriptors[key];
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          invalidSourceDatasetCarrier();
        }
        const keyBytes = sourceDigestUtf8ByteLength(key);
        update(`k${keyBytes}:`);
        update(key);
        visit(descriptor.value);
      }
      update("}");
    } finally {
      ancestors.delete(value);
    }
  };
  visit(source);
  return hash.digest("hex");
}

const sourceBuildOptionKeys = [
  "alpha",
  "beta",
  "gamma",
  "normalization",
  "bridgeWeightRule",
  "direction",
  "deg_convention",
  "delta",
  "Phi",
  "d",
  "seed",
  "undirectedSocial",
  "temporal"
] as const;

function invalidSourceDatasetCarrier(): never {
  throw new Error(
    "SENA group-comparison source model work budget exceeded because the holder dataset carrier is invalid."
  );
}

function assertSourceMetadataCarrier(value: unknown) {
  if (value === undefined) return;
  if (!hasExactCarrierKeys(value, [
    "datasetVersion",
    "consent",
    "retention",
    "pseudonymization",
    "codebook"
  ])) invalidSourceDatasetCarrier();
  if (!hasExactCarrierKeys(value.consent, ["instrument", "date", "scope"]) ||
    !hasExactCarrierKeys(value.retention, ["policy"], ["deleteBy"]) ||
    !hasExactCarrierKeys(value.pseudonymization, ["personIdPolicy", "rosterMapping"]) ||
    !hasExactCarrierKeys(value.codebook, ["id", "version", "contentHash"])) {
    invalidSourceDatasetCarrier();
  }
}

function assertSourceBuildOptionsCarrier(value: unknown) {
  if (value === undefined) return;
  if (!hasOnlyCarrierKeys(value, sourceBuildOptionKeys)) invalidSourceDatasetCarrier();
  if (Object.hasOwn(value, "temporal") && value.temporal !== undefined &&
    !hasOnlyCarrierKeys(value.temporal, [
      "mode",
      "movingWindowSize",
      "movingWindowStep",
      "turnWindowRadius"
    ])) invalidSourceDatasetCarrier();
}

function assertSourceDatasetRows(
  rows: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
  inspect?: (row: Record<string, unknown>) => void
) {
  if (!isDenseBoundedSourceModelArray(rows, SENA_GROUP_COMPARISON_SOURCE_MODEL_MAX_COLLECTION_ENTRIES)) {
    invalidSourceDatasetCarrier();
  }
  for (const row of rows) {
    if (!hasExactCarrierKeys(row, requiredKeys, optionalKeys)) invalidSourceDatasetCarrier();
    inspect?.(row);
  }
}

function assertSenaGroupComparisonSourceContextCarrier(source: SenaGroupComparisonSourceContext) {
  if (!hasExactCarrierKeys(source, ["dataset"], ["buildOptions"])) invalidSourceDatasetCarrier();
  const buildOptions = Object.hasOwn(source, "buildOptions") ? source.buildOptions : undefined;
  assertSourceBuildOptionsCarrier(buildOptions);
  const dataset = source.dataset;
  if (!hasExactCarrierKeys(dataset, [
    "people",
    "interactions",
    "utterances",
    "coded_segments",
    "codebook"
  ], ["metadata", "warnings"])) invalidSourceDatasetCarrier();
  if (Object.hasOwn(dataset, "metadata")) assertSourceMetadataCarrier(dataset.metadata);
  assertSourceDatasetRows(dataset.people, ["id", "label", "role", "group"], ["initials", "actorType"]);
  assertSourceDatasetRows(dataset.interactions, [
    "source",
    "target",
    "channel",
    "stage",
    "evidence"
  ], ["weight", "turnIndex"]);
  assertSourceDatasetRows(dataset.utterances, [
    "id",
    "personId",
    "unitId",
    "stanzaId",
    "stage",
    "turnIndex",
    "text"
  ], ["timestamp"]);
  assertSourceDatasetRows(dataset.coded_segments, [
    "segmentId",
    "utteranceId",
    "personId",
    "unitId",
    "stanzaId",
    "stage",
    "turnIndex",
    "text",
    "codes"
  ], ["targetPersonIds", "confidence"], (row) => {
    if (!isDenseBoundedSourceModelArray(
      row.codes,
      SENA_GROUP_COMPARISON_SOURCE_MODEL_MAX_COLLECTION_ENTRIES
    )) invalidSourceDatasetCarrier();
    if (Object.hasOwn(row, "targetPersonIds") && row.targetPersonIds !== undefined &&
      !isDenseBoundedSourceModelArray(
        row.targetPersonIds,
        SENA_GROUP_COMPARISON_SOURCE_MODEL_MAX_COLLECTION_ENTRIES
      )) invalidSourceDatasetCarrier();
  });
  assertSourceDatasetRows(dataset.codebook, ["id", "label", "family", "description", "color"]);
  if (Object.hasOwn(dataset, "warnings") && dataset.warnings !== undefined &&
    !isDenseBoundedSourceModelArray(
      dataset.warnings,
      SENA_GROUP_COMPARISON_SOURCE_MODEL_MAX_COLLECTION_ENTRIES
    )) invalidSourceDatasetCarrier();
  return dataset.people.length;
}

export function estimateSenaGroupComparisonSourceModelWorkUnits(
  source: SenaGroupComparisonSourceContext,
  maximumWorkUnits = Number.MAX_SAFE_INTEGER
) {
  assertSenaGroupComparisonSourceContextCarrier(source);
  const dataset = source.dataset;
  const collections = [
    dataset.people,
    dataset.codebook,
    dataset.interactions,
    dataset.utterances,
    dataset.coded_segments
  ];
  if (collections.some((value) => !Array.isArray(value))) {
    throw new Error("SENA group-comparison holder dataset collections are invalid.");
  }
  if (!Number.isSafeInteger(maximumWorkUnits) || maximumWorkUnits < 0) {
    throw new Error("SENA group-comparison source model work budget is invalid.");
  }
  const people = dataset.people.length;
  const codes = dataset.codebook.length;
  const interactions = dataset.interactions.length;
  const utterances = dataset.utterances.length;
  const codedSegments = dataset.coded_segments.length;
  if (collections.some((value) => value.length > SENA_GROUP_COMPARISON_SOURCE_MODEL_MAX_COLLECTION_ENTRIES)) {
    throw new Error("SENA group-comparison source model work budget exceeded.");
  }
  const nodes = safeAdmissionWorkSum([people, codes]);
  if (nodes === undefined) throw new Error("SENA group-comparison holder model work is not safely representable.");
  const rows = safeAdmissionWorkSum([interactions, utterances, codedSegments]);
  const minimumWork = rows === undefined
    ? undefined
    : safeAdmissionWorkSum([
        safeAdmissionWorkProduct(64, people + codes + rows) ?? Number.MAX_SAFE_INTEGER,
        safeAdmissionWorkProduct(16, people, people, people) ?? Number.MAX_SAFE_INTEGER,
        safeAdmissionWorkProduct(16, nodes, nodes) ?? Number.MAX_SAFE_INTEGER
      ]);
  if (minimumWork === undefined || minimumWork > maximumWorkUnits) {
    throw new Error("SENA group-comparison source model work budget exceeded.");
  }
  if (!collections.every((value) => isDenseBoundedSourceModelArray(
    value,
    SENA_GROUP_COMPARISON_SOURCE_MODEL_MAX_COLLECTION_ENTRIES
  ))) {
    throw new Error("SENA group-comparison holder dataset collections are invalid.");
  }
  const pairProduct = codes < 2 ? 0 : safeAdmissionWorkProduct(codes, codes - 1);
  const pairCount = pairProduct === undefined ? undefined : pairProduct / 2;
  if (pairCount === undefined || !Number.isSafeInteger(pairCount)) {
    throw new Error("SENA group-comparison holder model work is not safely representable.");
  }
  let segmentCodeReferences = 0;
  let cumulativeSegmentWork = 0;
  let sourceTextBytes = 0;
  const reserveSourceText = (value: unknown) => {
    if (typeof value !== "string" || value.length > SENA_GROUP_COMPARISON_SOURCE_MODEL_MAX_TEXT_BYTES) {
      throw new Error("SENA group-comparison source model text budget exceeded.");
    }
    const bytes = new TextEncoder().encode(value).byteLength;
    if (bytes > SENA_GROUP_COMPARISON_SOURCE_MODEL_MAX_TEXT_BYTES - sourceTextBytes) {
      throw new Error("SENA group-comparison source model text budget exceeded.");
    }
    sourceTextBytes += bytes;
  };
  const referencedCodes = new Set<string>();
  const participationWindows = new Set<string>();
  for (const segment of dataset.coded_segments) {
    const codeReferences = Array.isArray(segment.codes) ? segment.codes : [];
    const targets = Array.isArray(segment.targetPersonIds) ? segment.targetPersonIds : [];
    if (!isDenseBoundedSourceModelArray(
      codeReferences,
      SENA_GROUP_COMPARISON_SOURCE_MODEL_MAX_COLLECTION_ENTRIES
    ) || !isDenseBoundedSourceModelArray(
      targets,
      SENA_GROUP_COMPARISON_SOURCE_MODEL_MAX_COLLECTION_ENTRIES
    )) {
      throw new Error("SENA group-comparison source model work budget exceeded.");
    }
    const segmentLowerBound = safeAdmissionWorkSum([
      safeAdmissionWorkProduct(codeReferences.length, codeReferences.length) ?? Number.MAX_SAFE_INTEGER,
      safeAdmissionWorkProduct(targets.length, 16) ?? Number.MAX_SAFE_INTEGER,
      codeReferences.length,
      targets.length
    ]);
    const nextSegmentWork = segmentLowerBound === undefined
      ? undefined
      : safeAdmissionWorkSum([cumulativeSegmentWork, segmentLowerBound]);
    const nextReferences = safeAdmissionWorkSum([segmentCodeReferences, codeReferences.length]);
    const nextFanout = nextReferences === undefined
      ? undefined
      : safeAdmissionWorkSum([codedSegments, nextReferences]);
    const cumulativeLowerBound = nextSegmentWork === undefined || nextFanout === undefined
      ? undefined
      : safeAdmissionWorkSum([
          minimumWork,
          nextSegmentWork,
          safeAdmissionWorkProduct(4, people, codes, nextFanout) ?? Number.MAX_SAFE_INTEGER,
          safeAdmissionWorkProduct(6, pairCount, nextFanout) ?? Number.MAX_SAFE_INTEGER
        ]);
    if (segmentLowerBound === undefined || nextSegmentWork === undefined ||
      nextReferences === undefined || cumulativeLowerBound === undefined ||
      cumulativeLowerBound > maximumWorkUnits) {
      throw new Error("SENA group-comparison source model work budget exceeded.");
    }
    cumulativeSegmentWork = nextSegmentWork;
    segmentCodeReferences = nextReferences;
    for (const code of codeReferences) {
      reserveSourceText(code);
      referencedCodes.add(code);
    }
    for (const target of targets) reserveSourceText(target);
    if (typeof segment.unitId === "string" && typeof segment.stanzaId === "string") {
      reserveSourceText(segment.unitId);
      reserveSourceText(segment.stanzaId);
      participationWindows.add(`${segment.unitId}::${segment.stanzaId}`);
    }
  }
  const activeCodes = Math.min(codes, referencedCodes.size);
  if (rows === undefined) throw new Error("SENA group-comparison holder model work is not safely representable.");
  const temporalTurns = new Set<number>();
  for (const rowsWithTurns of [dataset.utterances, dataset.coded_segments]) {
    for (const row of rowsWithTurns) {
      if (typeof row.turnIndex === "number" && Number.isFinite(row.turnIndex)) temporalTurns.add(row.turnIndex);
    }
  }
  let temporalWindowUpperBound = temporalTurns.size;
  if (source.buildOptions?.temporal?.mode === "stage") {
    const stages = new Set<string>();
    for (const rowsWithStage of [dataset.utterances, dataset.coded_segments, dataset.interactions]) {
      for (const row of rowsWithStage) {
        if (typeof row.stage === "string") {
          reserveSourceText(row.stage);
          stages.add(row.stage);
        }
      }
    }
    temporalWindowUpperBound = stages.size;
  }
  const segmentFanout = safeAdmissionWorkSum([dataset.coded_segments.length, segmentCodeReferences]);
  const rowFanout = safeAdmissionWorkSum([rows, segmentCodeReferences]);
  if (segmentFanout === undefined || rowFanout === undefined) {
    throw new Error("SENA group-comparison holder model work is not safely representable.");
  }
  // Keep this aligned with the single-full-model terms in snapshot.ts. These
  // terms bound the actual social cubic kernels, fusion/embedding passes,
  // evidence fan-out, attribution work, and temporal scans before a holder
  // model is constructed.
  const workTerms = [
    safeAdmissionWorkProduct(64, people + codes + rows),
    cumulativeSegmentWork,
    safeAdmissionWorkProduct(16, people, people, people),
    safeAdmissionWorkProduct(16, nodes, nodes),
    safeAdmissionWorkProduct(2, pairCount, codes),
    safeAdmissionWorkProduct(2, people, pairCount),
    safeAdmissionWorkProduct(6, pairCount, segmentFanout),
    safeAdmissionWorkProduct(2, dataset.coded_segments.length, dataset.coded_segments.length),
    safeAdmissionWorkProduct(4, people, participationWindows.size, codes, codes),
    safeAdmissionWorkProduct(110, people, codes, codes),
    safeAdmissionWorkProduct(110, people, activeCodes, activeCodes, codes),
    safeAdmissionWorkProduct(4, people, codes, segmentFanout),
    safeAdmissionWorkProduct(2, people, people, dataset.interactions.length),
    safeAdmissionWorkProduct(temporalWindowUpperBound, rowFanout),
    ...(activeCodes === codes ? [safeAdmissionWorkProduct(320, nodes, nodes, nodes)] : [])
  ];
  const total = workTerms.some((term) => term === undefined)
    ? undefined
    : safeAdmissionWorkSum(workTerms as number[]);
  if (total === undefined) {
    throw new Error("SENA group-comparison holder model work is not safely representable.");
  }
  if (total > maximumWorkUnits) {
    throw new Error("SENA group-comparison source model work budget exceeded.");
  }
  return Math.max(1, total);
}

function sameBoundedJsonShape(value: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(value) && value.length === expected.length &&
      expected.every((entry, index) => sameBoundedJsonShape(value[index], entry));
  }
  if (isRecord(expected)) {
    if (!isRecord(value)) return false;
    const expectedKeys = Object.keys(expected);
    const valueKeys = Object.keys(value);
    return valueKeys.length === expectedKeys.length &&
      expectedKeys.every((key) => Object.hasOwn(value, key) && sameBoundedJsonShape(value[key], expected[key]));
  }
  return !Array.isArray(value) && !isRecord(value);
}

function currentComparisonVerificationKeyBody(
  comparison: Record<string, unknown>,
  sourceEvidenceHash: string
) {
  const effectSize = comparison.effectSize as Record<string, unknown>;
  const permutation = comparison.permutation as Record<string, unknown>;
  const bootstrap = comparison.bootstrap as Record<string, unknown>;
  const diagnostics = comparison.diagnostics as Record<string, unknown>;
  return {
    schemaVersion: comparison.schemaVersion,
    sourceSchemaVersion: comparison.sourceSchemaVersion,
    metric: comparison.metric,
    groupField: comparison.groupField,
    groupA: comparison.groupA,
    groupB: comparison.groupB,
    nA: comparison.nA,
    nB: comparison.nB,
    meanA: comparison.meanA,
    meanB: comparison.meanB,
    observedDifference: comparison.observedDifference,
    effectSize: {
      status: effectSize.status,
      cohenD: effectSize.cohenD,
      hedgesG: effectSize.hedgesG,
      pooledStandardDeviation: effectSize.pooledStandardDeviation,
      reason: effectSize.reason
    },
    sourceEvidenceHash,
    permutation: {
      iterations: permutation.iterations,
      seed: permutation.seed,
      pTwoSided: permutation.pTwoSided,
      nullLower: permutation.nullLower,
      nullUpper: permutation.nullUpper,
      samplesPreview: permutation.samplesPreview
    },
    bootstrap: {
      iterations: bootstrap.iterations,
      seed: bootstrap.seed,
      meanDifferenceLower: bootstrap.meanDifferenceLower,
      meanDifferenceUpper: bootstrap.meanDifferenceUpper,
      samplesPreview: bootstrap.samplesPreview
    },
    diagnostics: {
      totalPeople: diagnostics.totalPeople,
      comparedPeople: diagnostics.comparedPeople,
      minGroupSize: diagnostics.minGroupSize,
      balancedDesign: diagnostics.balancedDesign,
      smallSample: diagnostics.smallSample,
      metricScale: diagnostics.metricScale
    },
    guardrail: comparison.guardrail,
    ...(Object.hasOwn(comparison, "comparisonId") ? {
      comparisonId: comparison.comparisonId,
      holmRank: comparison.holmRank,
      holmAdjustedP: comparison.holmAdjustedP,
      significantAtAlpha: comparison.significantAtAlpha
    } : {})
  };
}

/**
 * Turn-scoped verifier for immutable holder datasets and build options.
 *
 * The cache owns model construction and never accepts a caller-provided model
 * or source-evidence object. Product callers create one cache per synchronous
 * read/create/review turn, while holder snapshots and their build options are
 * immutable for that turn. This keeps repeated sealed-run verification bounded
 * without creating an evidence-injection surface.
 */
export class SenaGroupComparisonSourceVerificationCache {
  private readonly sources = new Map<string, SenaGroupComparisonCachedSource>();
  private readonly sourceKeys = new WeakMap<object, {
    withoutBuildOptions?: string;
    byBuildOptions: WeakMap<object, string>;
  }>();
  private readonly sourcePeopleCounts = new Map<string, number>();
  private readonly sourceModelWorkUnitsByKey = new Map<string, number>();
  private readonly reservedResultKeys = new Set<string>();
  private readonly maximumWorkUnits: number;
  private readonly maximumUniqueResults: number;
  private readonly maximumUniqueSources: number;
  private readonly maximumSourceModelWorkUnits: number;
  private readonly maximumSourceTextBytes: number;
  private readonly maximumSourceDigestBytes: number;
  private readonly maximumSourceDigestWorkUnits: number;
  private reservedWorkUnits = 0;
  private reservedSourceCount = 0;
  private reservedSourceModelWorkUnits = 0;
  private reservedSourceDigestBytes = 0;
  private reservedSourceDigestWorkUnits = 0;
  private sourceDigestScans = 0;
  private sourceDigestMeasurementAttempts = 0;
  private lastMeasuredSourceTextBytes = 0;
  private modelBuilds = 0;
  private evidenceBuilds = 0;
  private resultReplays = 0;

  constructor(options: {
    maxDeterministicWorkUnits?: number;
    maxUniqueResults?: number;
    maxUniqueSources?: number;
    maxSourceModelWorkUnits?: number;
    maxSourceTextBytes?: number;
    maxSourceDigestBytes?: number;
    maxSourceDigestWorkUnits?: number;
  } = {}) {
    this.maximumWorkUnits = options.maxDeterministicWorkUnits ??
      SENA_GROUP_COMPARISON_SOURCE_REPLAY_DEFAULT_MAX_WORK_UNITS;
    this.maximumUniqueResults = options.maxUniqueResults ??
      SENA_GROUP_COMPARISON_SOURCE_REPLAY_DEFAULT_MAX_UNIQUE_RESULTS;
    this.maximumUniqueSources = options.maxUniqueSources ??
      SENA_GROUP_COMPARISON_SOURCE_REPLAY_DEFAULT_MAX_UNIQUE_SOURCES;
    this.maximumSourceModelWorkUnits = options.maxSourceModelWorkUnits ??
      SENA_GROUP_COMPARISON_SOURCE_MODEL_DEFAULT_MAX_WORK_UNITS;
    this.maximumSourceTextBytes = options.maxSourceTextBytes ??
      SENA_GROUP_COMPARISON_SOURCE_MODEL_MAX_TEXT_BYTES;
    this.maximumSourceDigestBytes = options.maxSourceDigestBytes ??
      SENA_GROUP_COMPARISON_SOURCE_DIGEST_DEFAULT_MAX_BYTES;
    this.maximumSourceDigestWorkUnits = options.maxSourceDigestWorkUnits ??
      SENA_GROUP_COMPARISON_SOURCE_DIGEST_DEFAULT_MAX_WORK_UNITS;
    if (!Number.isSafeInteger(this.maximumWorkUnits) || this.maximumWorkUnits < 1 ||
      !Number.isSafeInteger(this.maximumUniqueResults) || this.maximumUniqueResults < 1 ||
      !Number.isSafeInteger(this.maximumUniqueSources) || this.maximumUniqueSources < 1 ||
      !Number.isSafeInteger(this.maximumSourceModelWorkUnits) || this.maximumSourceModelWorkUnits < 1 ||
      !Number.isSafeInteger(this.maximumSourceTextBytes) || this.maximumSourceTextBytes < 1 ||
      !Number.isSafeInteger(this.maximumSourceDigestBytes) || this.maximumSourceDigestBytes < 1 ||
      !Number.isSafeInteger(this.maximumSourceDigestWorkUnits) ||
      this.maximumSourceDigestWorkUnits < 1) {
      throw new Error("SENA group-comparison source replay budget must use positive safe integers.");
    }
  }

  get modelBuildCount() {
    return this.modelBuilds;
  }

  get sourceEvidenceBuildCount() {
    return this.evidenceBuilds;
  }

  get canonicalResultReplayCount() {
    return this.resultReplays;
  }

  get deterministicWorkUnitsReserved() {
    return this.reservedWorkUnits;
  }

  get uniqueResultReservationCount() {
    return this.reservedResultKeys.size;
  }

  get uniqueSourceReservationCount() {
    return this.reservedSourceCount;
  }

  get sourceModelWorkUnitsReserved() {
    return this.reservedSourceModelWorkUnits;
  }

  get sourceDigestBytesReserved() {
    return this.reservedSourceDigestBytes;
  }

  get sourceDigestWorkUnitsReserved() {
    return this.reservedSourceDigestWorkUnits;
  }

  get sourceDigestScanCount() {
    return this.sourceDigestScans;
  }

  get sourceDigestMeasurementWorkUnitsAttempted() {
    return this.sourceDigestMeasurementAttempts;
  }

  get lastSourceTextBytesMeasured() {
    return this.lastMeasuredSourceTextBytes;
  }

  private reserveResultReplay(resultKey: string, leaves: SenaGroupComparisonVerificationLeaf[]) {
    if (this.reservedResultKeys.has(resultKey)) return;
    let workUnits = 0;
    for (const leaf of leaves) {
      if (!Number.isSafeInteger(leaf.workUnits) || leaf.workUnits < 0 ||
        workUnits > Number.MAX_SAFE_INTEGER - leaf.workUnits) {
        throw new Error("SENA group-comparison source verification replay budget is not safely representable.");
      }
      workUnits += leaf.workUnits;
    }
    if (this.reservedResultKeys.size >= this.maximumUniqueResults ||
      workUnits > this.maximumWorkUnits - this.reservedWorkUnits) {
      throw new Error("SENA group-comparison source verification replay budget exceeded.");
    }
    this.reservedResultKeys.add(resultKey);
    this.reservedWorkUnits += workUnits;
  }

  private sourceIdentityObjects(source: SenaGroupComparisonSourceContext) {
    if (!hasExactCarrierKeys(source, ["dataset"], ["buildOptions"])) return undefined;
    const dataset = source.dataset;
    const buildOptions = Object.hasOwn(source, "buildOptions") ? source.buildOptions : undefined;
    if (!dataset || typeof dataset !== "object" || Array.isArray(dataset) ||
      (buildOptions !== undefined && (
        !buildOptions || typeof buildOptions !== "object" || Array.isArray(buildOptions)
      ))) return undefined;
    return {
      datasetObject: dataset as object,
      buildOptions,
      buildOptionsObject: buildOptions as object | undefined
    };
  }

  private admitSourceContext(source: SenaGroupComparisonSourceContext) {
    const initialIdentity = this.sourceIdentityObjects(source);
    const initialKeys = initialIdentity
      ? this.sourceKeys.get(initialIdentity.datasetObject)
      : undefined;
    const initialSourceKey = initialIdentity?.buildOptionsObject
      ? initialKeys?.byBuildOptions.get(initialIdentity.buildOptionsObject)
      : initialKeys?.withoutBuildOptions;
    if (initialSourceKey && this.sourcePeopleCounts.has(initialSourceKey)) {
      return {
        sourceKey: initialSourceKey,
        peopleCount: this.sourcePeopleCounts.get(initialSourceKey)!,
        buildOptions: initialIdentity?.buildOptions
      };
    }

    const remainingDigestBytes = this.maximumSourceDigestBytes - this.reservedSourceDigestBytes;
    const remainingDigestWorkUnits = this.maximumSourceDigestWorkUnits - this.reservedSourceDigestWorkUnits;
    const measurement = measureSenaGroupComparisonSourceDigest(
      source,
      this.maximumSourceTextBytes,
      remainingDigestBytes,
      remainingDigestWorkUnits,
      () => {
        this.sourceDigestMeasurementAttempts += 1;
      }
    );
    this.lastMeasuredSourceTextBytes = measurement.textBytes;
    const peopleCount = assertSenaGroupComparisonSourceContextCarrier(source);
    const sourceModelWorkUnits = estimateSenaGroupComparisonSourceModelWorkUnits(
      source,
      this.maximumSourceModelWorkUnits
    );
    const identity = this.sourceIdentityObjects(source);
    if (!identity) invalidSourceDatasetCarrier();

    // Reserve the complete successful measurement before the first hash.update.
    // Content-equivalent clones still consume request-wide traversal budget.
    this.reservedSourceDigestBytes += measurement.digestBytes;
    this.reservedSourceDigestWorkUnits += measurement.workUnits;
    const sourceKey = senaGroupComparisonSourceDigest(source);
    this.sourceDigestScans += 1;
    let sourceIdentityKeys = this.sourceKeys.get(identity.datasetObject);
    if (!sourceIdentityKeys) {
      sourceIdentityKeys = { byBuildOptions: new WeakMap() };
      this.sourceKeys.set(identity.datasetObject, sourceIdentityKeys);
    }
    if (identity.buildOptionsObject) sourceIdentityKeys.byBuildOptions.set(identity.buildOptionsObject, sourceKey);
    else sourceIdentityKeys.withoutBuildOptions = sourceKey;
    if (!this.sourcePeopleCounts.has(sourceKey)) this.sourcePeopleCounts.set(sourceKey, peopleCount);
    if (!this.sourceModelWorkUnitsByKey.has(sourceKey)) {
      this.sourceModelWorkUnitsByKey.set(sourceKey, sourceModelWorkUnits);
    }
    return { sourceKey, peopleCount, buildOptions: identity.buildOptions };
  }

  sourcePeopleCount(source: SenaGroupComparisonSourceContext) {
    return this.admitSourceContext(source).peopleCount;
  }

  private sourceEntry(source: SenaGroupComparisonSourceContext) {
    const admission = this.admitSourceContext(source);
    const { sourceKey, buildOptions } = admission;
    let entry = this.sources.get(sourceKey);
    if (!entry) {
      if (this.reservedSourceCount >= this.maximumUniqueSources) {
        throw new Error("SENA group-comparison source verification unique-source budget exceeded.");
      }
      const sourceModelWorkUnits = this.sourceModelWorkUnitsByKey.get(sourceKey) ??
        estimateSenaGroupComparisonSourceModelWorkUnits(source, this.maximumSourceModelWorkUnits);
      if (sourceModelWorkUnits >
        this.maximumSourceModelWorkUnits - this.reservedSourceModelWorkUnits) {
        throw new Error("SENA group-comparison source model work budget exceeded.");
      }
      this.reservedSourceCount += 1;
      this.reservedSourceModelWorkUnits += sourceModelWorkUnits;
      entry = {
        model: buildSenaModel(source.dataset, buildOptions ?? {}),
        evidenceByComparison: new Map(),
        verifiedResultsByKey: new Map()
      };
      this.modelBuilds += 1;
      this.sources.set(sourceKey, entry);
    }
    return entry;
  }

  private currentComparisonReplayDescriptor(
    value: unknown
  ): SenaGroupComparisonVerificationLeaf {
    if (!isRecord(value) ||
      value.schemaVersion !== SENA_SCHEMA_VERSIONS.groupComparison ||
      value.sourceSchemaVersion !== SENA_SCHEMA_VERSIONS.groupComparison ||
      !isCanonicalCommonComparison(value, false) ||
      !isCurrentEffectSize(
        value.effectSize,
        value.nA as number,
        value.nB as number,
        value.observedDifference as number
      )) {
      throw new Error("SENA group-comparison v2 evidence is structurally invalid before source replay.");
    }
    if (!isRecord(value.sourceEvidence) || typeof value.sourceEvidence.evidenceHash !== "string" ||
      !isRecord(value.diagnostics)) {
      throw new Error("SENA group-comparison v2 source evidence is structurally invalid before source replay.");
    }
    const permutationIterations = (value.permutation as Record<string, unknown>).iterations as number;
    const bootstrapIterations = (value.bootstrap as Record<string, unknown>).iterations as number;
    const comparedPeople = value.diagnostics.comparedPeople as number;
    const workUnits = (permutationIterations + bootstrapIterations) * comparedPeople;
    if (!Number.isSafeInteger(workUnits) || workUnits < 0) {
      throw new Error("SENA group-comparison source verification replay budget is not safely representable.");
    }
    return {
      key: stableJson(currentComparisonVerificationKeyBody(value, value.sourceEvidence.evidenceHash)),
      workUnits
    };
  }

  private verifyCurrentComparisonSource(
    value: unknown,
    source: SenaGroupComparisonSourceContext
  ) {
    if (!isRecord(value) || !isRecord(value.sourceEvidence) ||
      !Array.isArray(value.sourceEvidence.metricUniverse) ||
      value.sourceEvidence.metricUniverse.length !== source.dataset.people.length) {
      throw new Error("SENA group-comparison metric universe does not match the holder people cardinality.");
    }
    const comparison = value as unknown as SenaGroupComparisonResult;
    const expected = this.expectedEvidence(source, comparison);
    if (!sameBoundedJsonShape(value.sourceEvidence, expected) ||
      stableJson(value.sourceEvidence) !== stableJson(expected)) {
      throw new Error("SENA group-comparison source evidence does not match the holder dataset, model configuration, and group definition.");
    }
  }

  private currentResultVerificationKey(
    value: SenaGroupComparisonValidationReadModel,
    source: SenaGroupComparisonSourceContext
  ) {
    if (!isRecord(value)) return undefined;
    if (
      value.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparison &&
      value.sourceSchemaVersion === SENA_SCHEMA_VERSIONS.groupComparison
    ) {
      const leaf = this.currentComparisonReplayDescriptor(value);
      const resultKey = `single:${leaf.key}`;
      this.reserveResultReplay(resultKey, [leaf]);
      this.verifyCurrentComparisonSource(value, source);
      return resultKey;
    }
    if (
      value.schemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite ||
      value.sourceSchemaVersion !== SENA_SCHEMA_VERSIONS.groupComparisonSuite
    ) {
      return undefined;
    }
    if (!Array.isArray(value.comparisons) || value.comparisons.length === 0 ||
      value.comparisons.length > SENA_GROUP_COMPARISON_MAX_SUITE_COMPARISONS ||
      !isRecord(value.primary) || !isRecord(value.diagnostics) ||
      !Array.isArray(value.diagnostics.metrics) ||
      value.diagnostics.metrics.length > SENA_GROUP_COMPARISON_METRICS.length ||
      !Array.isArray(value.diagnostics.groupPairs) ||
      value.diagnostics.groupPairs.length > value.comparisons.length) {
      throw new Error("SENA group-comparison suite exceeds its bounded current-v2 structure.");
    }
    const comparisonLeaves = value.comparisons.map((comparison) => (
      this.currentComparisonReplayDescriptor(comparison)
    ));
    const primaryLeaf = this.currentComparisonReplayDescriptor(value.primary);
    const groupPairs = value.diagnostics.groupPairs as Array<Record<string, unknown>>;
    const resultKey = stableJson({
      schemaVersion: value.schemaVersion,
      sourceSchemaVersion: value.sourceSchemaVersion,
      alpha: value.alpha,
      correction: value.correction,
      comparisonCount: value.comparisonCount,
      significantHolmCount: value.significantHolmCount,
      primaryKey: primaryLeaf.key,
      comparisonKeys: comparisonLeaves.map((leaf) => leaf.key),
      diagnostics: {
        metrics: value.diagnostics.metrics,
        groupPairs: groupPairs.map((pair) => ({
          groupField: pair.groupField,
          groupA: pair.groupA,
          groupB: pair.groupB
        })),
        minGroupSize: value.diagnostics.minGroupSize,
        smallSampleComparisons: value.diagnostics.smallSampleComparisons,
        preregistrationEvidence: value.diagnostics.preregistrationEvidence
      },
      guardrail: value.guardrail
    });
    this.reserveResultReplay(resultKey, comparisonLeaves);
    for (const comparison of value.comparisons) {
      this.verifyCurrentComparisonSource(comparison, source);
    }
    this.verifyCurrentComparisonSource(value.primary, source);
    return resultKey;
  }

  normalizeBoundResult(
    value: SenaGroupComparisonValidationReadModel,
    source: SenaGroupComparisonSourceContext,
    normalizeUnbound: () => SenaGroupComparisonValidationResult
  ) {
    this.admitSourceContext(source);
    const verificationKey = this.currentResultVerificationKey(value, source);
    const entry = verificationKey ? this.sourceEntry(source) : undefined;
    const cached = verificationKey ? entry?.verifiedResultsByKey.get(verificationKey) : undefined;
    if (cached) {
      return structuredClone(cached);
    }
    const normalized = normalizeUnbound();
    this.resultReplays += 1;
    this.assertMatches(normalized, source);
    if (verificationKey) entry?.verifiedResultsByKey.set(verificationKey, structuredClone(normalized));
    return normalized;
  }

  private expectedEvidence(
    source: SenaGroupComparisonSourceContext,
    comparison: SenaGroupComparisonResult
  ) {
    const entry = this.sourceEntry(source);
    const comparisonKey = stableJson({
      metric: comparison.metric,
      groupField: comparison.groupField,
      groupA: comparison.groupA,
      groupB: comparison.groupB
    });
    let evidence = entry.evidenceByComparison.get(comparisonKey);
    if (!evidence) {
      evidence = buildSenaGroupComparisonSourceEvidence({
        dataset: source.dataset,
        model: entry.model,
        metric: comparison.metric,
        groupField: comparison.groupField,
        groupA: comparison.groupA,
        groupB: comparison.groupB
      });
      this.evidenceBuilds += 1;
      entry.evidenceByComparison.set(comparisonKey, evidence);
    }
    return evidence;
  }

  assertMatches(
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
    for (const comparison of currentComparisons) {
      const expected = this.expectedEvidence(source, comparison);
      if (!sameBoundedJsonShape(comparison.sourceEvidence, expected) ||
        stableJson(comparison.sourceEvidence) !== stableJson(expected)) {
        throw new Error("SENA group-comparison source evidence does not match the holder dataset, model configuration, and group definition.");
      }
    }
  }
}

function normalizeSenaGroupComparisonValidationResultUnbound(
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
  if (!hasBoundedSuiteCarrier(value)) {
    throw new Error("SENA group-comparison suite exceeds its bounded suite structure.");
  }
  if (value.schemaVersion === SENA_SCHEMA_VERSIONS.groupComparisonSuite) {
    if (isCurrentSuite(value) || isNormalizedLegacySuite(value)) {
      return value as unknown as SenaGroupComparisonSuiteResult;
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
  return normalized;
}

export function normalizeSenaGroupComparisonValidationResult(
  value: SenaGroupComparisonValidationReadModel,
  source?: SenaGroupComparisonSourceContext,
  sourceVerificationCache?: SenaGroupComparisonSourceVerificationCache
): SenaGroupComparisonValidationResult {
  const verificationCache = source
    ? sourceVerificationCache ?? new SenaGroupComparisonSourceVerificationCache()
    : undefined;
  const expectedPeopleCount = source
    ? verificationCache!.sourcePeopleCount(source)
    : undefined;
  assertSenaGroupComparisonValidationCarrier(value, expectedPeopleCount);
  if (!source) return normalizeSenaGroupComparisonValidationResultUnbound(value);
  return verificationCache!.normalizeBoundResult(
    value,
    source,
    () => normalizeSenaGroupComparisonValidationResultUnbound(value)
  );
}

export function isCurrentSenaGroupComparisonValidationResult(
  value: unknown
): value is SenaGroupComparisonValidationResult {
  try {
    assertSenaGroupComparisonValidationCarrier(value);
  } catch {
    return false;
  }
  if (isCurrentSenaGroupComparisonResult(value)) {
    return true;
  }
  return isCurrentSuite(value);
}
