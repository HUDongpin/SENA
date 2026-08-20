import type { SenaBuildOptions } from "./types";

export type SenaInputValidationRule =
  | "finite-nonnegative"
  | "finite-probability"
  | "positive-finite"
  | "finite"
  | "finite-range"
  | "integer-range"
  | "supported-value"
  | "object"
  | "array"
  | "nonempty-array"
  | "array-range"
  | "nonempty-string"
  | "distinct-values"
  | "boolean"
  | "consistent-direction";

export type SenaInputValidationIssue = {
  path: string;
  rule: SenaInputValidationRule;
};

export class SenaInputValidationError extends Error {
  readonly issues: SenaInputValidationIssue[];

  constructor(issues: SenaInputValidationIssue[]) {
    super(`Invalid SENA analytical inputs: ${issues.map((issue) => `${issue.path} (${issue.rule})`).join(", ")}.`);
    this.name = "SenaInputValidationError";
    this.issues = issues.map((issue) => ({ ...issue }));
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOneOf(value: unknown, values: readonly unknown[]) {
  return values.includes(value);
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const SENA_GROUP_COMPARISON_METRICS = [
  "bridgeScore",
  "epistemicContribution",
  "epistemicDiversity",
  "socialStrength",
  "socialDegree",
  "conceptBrokerage",
  "alignment"
] as const;

export type SenaValidatedGroupComparisonMetric = typeof SENA_GROUP_COMPARISON_METRICS[number];

function validateGroupComparisonControls(
  value: unknown,
  add: (path: string, rule: SenaInputValidationRule) => void
) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    add("groupComparison", "object");
    return;
  }
  const controls = value as Record<string, unknown>;
  const validateGroupField = (candidate: unknown, path: string) => {
    if (candidate !== undefined && !isOneOf(candidate, ["group", "role"])) add(path, "supported-value");
  };
  const validateMetric = (candidate: unknown, path: string) => {
    if (candidate !== undefined && !isOneOf(candidate, SENA_GROUP_COMPARISON_METRICS)) add(path, "supported-value");
  };
  const validateGroupPair = (record: Record<string, unknown>, prefix: string, required: boolean) => {
    if ((required || record.groupA !== undefined) && !isNonemptyString(record.groupA)) {
      add(`${prefix}groupA`, "nonempty-string");
    }
    if ((required || record.groupB !== undefined) && !isNonemptyString(record.groupB)) {
      add(`${prefix}groupB`, "nonempty-string");
    }
    if (
      isNonemptyString(record.groupA) &&
      isNonemptyString(record.groupB) &&
      record.groupA.trim() === record.groupB.trim()
    ) {
      add(`${prefix}groupB`, "distinct-values");
    }
  };
  const validateIntegerRange = (candidate: unknown, path: string, minimum: number, maximum: number) => {
    if (
      candidate !== undefined &&
      (!Number.isSafeInteger(candidate) || (candidate as number) < minimum || (candidate as number) > maximum)
    ) {
      add(path, "integer-range");
    }
  };

  validateGroupField(controls.groupField, "groupField");
  validateGroupField(controls.defaultGroupField, "defaultGroupField");
  validateMetric(controls.metric, "metric");
  validateMetric(controls.defaultMetric, "defaultMetric");
  if (controls.suite !== undefined && typeof controls.suite !== "boolean") add("suite", "boolean");

  if (controls.metrics !== undefined) {
    if (!Array.isArray(controls.metrics)) {
      add("metrics", "array");
    } else {
      if (controls.metrics.length === 0) add("metrics", "nonempty-array");
      controls.metrics.forEach((metric, index) => validateMetric(metric, `metrics[${index}]`));
    }
  }

  if (controls.comparisons === undefined) {
    validateGroupPair(controls, "", true);
  } else if (!Array.isArray(controls.comparisons)) {
    add("comparisons", "array");
  } else {
    if (controls.comparisons.length === 0) add("comparisons", "nonempty-array");
    if (controls.comparisons.length > 40) add("comparisons", "array-range");
    controls.comparisons.forEach((comparison, index) => {
      const path = `comparisons[${index}]`;
      if (typeof comparison !== "object" || comparison === null || Array.isArray(comparison)) {
        add(path, "object");
        return;
      }
      const record = comparison as Record<string, unknown>;
      validateGroupPair(record, `${path}.`, true);
      validateGroupField(record.groupField, `${path}.groupField`);
      validateMetric(record.metric, `${path}.metric`);
    });
  }

  validateIntegerRange(controls.iterations, "iterations", 100, 10_000);
  validateIntegerRange(controls.bootstrapIterations, "bootstrapIterations", 100, 10_000);
  validateIntegerRange(controls.seed, "seed", 0, Number.MAX_SAFE_INTEGER);
  if (
    controls.alpha !== undefined &&
    (!isFiniteNumber(controls.alpha) || controls.alpha < 0.001 || controls.alpha > 0.5)
  ) {
    add("alpha", "finite-range");
  }
}

export function validateSenaAnalyticalInputs(input: {
  dataset?: unknown;
  buildOptions?: Partial<SenaBuildOptions> | unknown;
  groupComparison?: unknown;
}): void {
  const issues: SenaInputValidationIssue[] = [];
  const add = (path: string, rule: SenaInputValidationRule) => issues.push({ path, rule });
  const options = typeof input.buildOptions === "object" && input.buildOptions !== null && !Array.isArray(input.buildOptions)
    ? input.buildOptions as Partial<SenaBuildOptions>
    : undefined;

  if (input.buildOptions !== undefined && options === undefined) {
    add("buildOptions", "object");
  }

  if (options) {
    for (const field of ["alpha", "beta", "gamma"] as const) {
      const value = options[field];
      if (value !== undefined && (!isFiniteNumber(value) || value < 0)) {
        add(`buildOptions.${field}`, "finite-nonnegative");
      }
    }

    if (options.normalization !== undefined && !isOneOf(options.normalization, ["max", "frobenius", "log1p-max", "log-max", "none"])) {
      add("buildOptions.normalization", "supported-value");
    }
    if (options.bridgeWeightRule !== undefined && !isOneOf(options.bridgeWeightRule, ["count", "confidence"])) {
      add("buildOptions.bridgeWeightRule", "supported-value");
    }
    if (options.direction !== undefined && !isOneOf(options.direction, ["directed", "undirected"])) {
      add("buildOptions.direction", "supported-value");
    }
    if (options.deg_convention !== undefined && options.deg_convention !== "row-sum") {
      add("buildOptions.deg_convention", "supported-value");
    }
    if (options.Phi !== undefined && options.Phi !== "classical_mds") {
      add("buildOptions.Phi", "supported-value");
    }
    if (options.delta !== undefined && options.delta !== "shortest_path_reciprocal_weight") {
      add("buildOptions.delta", "supported-value");
    }
    if (options.d !== undefined && (!Number.isSafeInteger(options.d) || options.d < 1)) {
      add("buildOptions.d", "integer-range");
    }
    if (options.seed !== undefined && !isFiniteNumber(options.seed)) {
      add("buildOptions.seed", "finite");
    }
    if (options.undirectedSocial !== undefined && typeof options.undirectedSocial !== "boolean") {
      add("buildOptions.undirectedSocial", "boolean");
    }
    if (
      typeof options.undirectedSocial === "boolean" &&
      isOneOf(options.direction, ["directed", "undirected"]) &&
      (options.undirectedSocial ? "undirected" : "directed") !== options.direction
    ) {
      add("buildOptions.direction", "consistent-direction");
    }

    const temporalValue = (options as Record<string, unknown>).temporal;
    const temporal = typeof temporalValue === "object" && temporalValue !== null && !Array.isArray(temporalValue)
      ? temporalValue as Partial<NonNullable<SenaBuildOptions["temporal"]>>
      : undefined;
    if (temporalValue !== undefined && temporal === undefined) {
      add("buildOptions.temporal", "object");
    }
    if (temporal) {
      if (temporal.mode !== undefined && !isOneOf(temporal.mode, ["stage", "moving-window", "turn-window"])) {
        add("buildOptions.temporal.mode", "supported-value");
      }
      if (temporal.movingWindowSize !== undefined && (!Number.isSafeInteger(temporal.movingWindowSize) || temporal.movingWindowSize < 1)) {
        add("buildOptions.temporal.movingWindowSize", "integer-range");
      }
      if (temporal.movingWindowStep !== undefined && (!Number.isSafeInteger(temporal.movingWindowStep) || temporal.movingWindowStep < 1)) {
        add("buildOptions.temporal.movingWindowStep", "integer-range");
      }
      if (temporal.turnWindowRadius !== undefined && (!Number.isSafeInteger(temporal.turnWindowRadius) || temporal.turnWindowRadius < 0)) {
        add("buildOptions.temporal.turnWindowRadius", "integer-range");
      }
    }
  }

  const dataset = typeof input.dataset === "object" && input.dataset !== null && !Array.isArray(input.dataset)
    ? input.dataset as Record<string, unknown>
    : undefined;
  const interactions = Array.isArray(dataset?.interactions) ? dataset.interactions : [];
  interactions.forEach((interaction, index) => {
    if (typeof interaction !== "object" || interaction === null || Array.isArray(interaction)) return;
    const weight = (interaction as Record<string, unknown>).weight;
    if (weight !== undefined && (!isFiniteNumber(weight) || weight < 0)) {
      add(`dataset.interactions[${index}].weight`, "finite-nonnegative");
    }
  });
  const codedSegments = Array.isArray(dataset?.coded_segments) ? dataset.coded_segments : [];
  codedSegments.forEach((segment, index) => {
    if (typeof segment !== "object" || segment === null || Array.isArray(segment)) return;
    const confidence = (segment as Record<string, unknown>).confidence;
    if (
      confidence !== undefined &&
      (!isFiniteNumber(confidence) || confidence < 0 || confidence > 1)
    ) {
      add(`dataset.coded_segments[${index}].confidence`, "finite-probability");
    }
  });

  if (input.groupComparison !== undefined) {
    validateGroupComparisonControls(input.groupComparison, add);
  }

  if (issues.length > 0) throw new SenaInputValidationError(issues);
}
