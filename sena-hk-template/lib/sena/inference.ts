import { buildSenaModel } from "./model";
import type { SenaBuildOptions, SenaDataset, SenaModel, SenaPersonMetrics } from "./types";

export type SenaGroupComparisonMetric =
  | "bridgeScore"
  | "epistemicContribution"
  | "epistemicDiversity"
  | "socialStrength"
  | "socialDegree"
  | "conceptBrokerage"
  | "alignment";

export type SenaGroupComparisonResult = {
  schemaVersion: "sena-group-comparison/v1";
  metric: SenaGroupComparisonMetric;
  groupField: "group" | "role";
  groupA: string;
  groupB: string;
  nA: number;
  nB: number;
  meanA: number;
  meanB: number;
  observedDifference: number;
  effectSize: {
    cohenD: number;
    hedgesG: number;
    pooledStandardDeviation: number;
  };
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
  schemaVersion: "sena-group-comparison-suite/v1";
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
  const model = buildSenaModel(input.dataset, input.buildOptions ?? {});
  const metric = input.metric ?? "bridgeScore";
  const groupField = input.groupField ?? "group";
  const rows = actorRows(model, groupField, metric);
  const a = rows.filter((row) => row.group === input.groupA).map((row) => row.value);
  const b = rows.filter((row) => row.group === input.groupB).map((row) => row.value);
  if (a.length === 0 || b.length === 0) {
    throw new Error(`Both groups must contain at least one person for ${groupField} comparison.`);
  }

  const observedDifference = mean(a) - mean(b);
  const varianceA = sampleVariance(a);
  const varianceB = sampleVariance(b);
  const pooledVarianceDenominator = a.length + b.length - 2;
  const pooledStandardDeviation = pooledVarianceDenominator > 0
    ? Math.sqrt((((a.length - 1) * varianceA) + ((b.length - 1) * varianceB)) / pooledVarianceDenominator)
    : 0;
  const cohenD = pooledStandardDeviation === 0 ? 0 : observedDifference / pooledStandardDeviation;
  const hedgesCorrectionDenominator = (4 * (a.length + b.length)) - 9;
  const hedgesCorrection = hedgesCorrectionDenominator > 0 ? 1 - (3 / hedgesCorrectionDenominator) : 1;
  const combined = [...a, ...b];
  const nA = a.length;
  const iterations = Math.max(100, Math.min(10000, Math.round(input.iterations ?? 1000)));
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
  const bootstrapIterations = Math.max(100, Math.min(10000, Math.round(input.bootstrapIterations ?? iterations)));
  const bootstrapSeed = seed + 7919;
  const bootstrapRandom = seededRandom(bootstrapSeed);
  const bootstrapSamples = Array.from({ length: bootstrapIterations }, () => (
    resampleMean(a, bootstrapRandom) - resampleMean(b, bootstrapRandom)
  ));

  return {
    schemaVersion: "sena-group-comparison/v1",
    metric,
    groupField,
    groupA: input.groupA,
    groupB: input.groupB,
    nA: a.length,
    nB: b.length,
    meanA: round(mean(a)),
    meanB: round(mean(b)),
    observedDifference: round(observedDifference),
    effectSize: {
      cohenD: round(cohenD),
      hedgesG: round(cohenD * hedgesCorrection),
      pooledStandardDeviation: round(pooledStandardDeviation)
    },
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

function normalizeAlpha(value: number | undefined) {
  if (!Number.isFinite(value)) return 0.05;
  return Math.max(0.001, Math.min(0.5, Number(value)));
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
  if (input.comparisons.length === 0) {
    throw new Error("At least one group-comparison specification is required.");
  }
  const alpha = normalizeAlpha(input.alpha);
  const comparisons = input.comparisons.map((comparison, index) => buildSenaGroupComparison({
    dataset: input.dataset,
    buildOptions: input.buildOptions,
    groupField: comparison.groupField ?? input.defaultGroupField ?? "group",
    groupA: comparison.groupA,
    groupB: comparison.groupB,
    metric: comparison.metric ?? input.defaultMetric ?? "bridgeScore",
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
    schemaVersion: "sena-group-comparison-suite/v1",
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
