import type { SenaBuildOptions } from "./types";

export type SenaInputValidationRule =
  | "finite-nonnegative"
  | "finite-probability"
  | "positive-finite"
  | "finite"
  | "supported-value"
  | "object"
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

export function validateSenaAnalyticalInputs(input: {
  dataset?: unknown;
  buildOptions?: Partial<SenaBuildOptions> | unknown;
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
    if (options.d !== undefined && (!isFiniteNumber(options.d) || options.d < 1)) {
      add("buildOptions.d", "positive-finite");
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
      if (temporal.movingWindowSize !== undefined && (!isFiniteNumber(temporal.movingWindowSize) || temporal.movingWindowSize < 1)) {
        add("buildOptions.temporal.movingWindowSize", "positive-finite");
      }
      if (temporal.movingWindowStep !== undefined && (!isFiniteNumber(temporal.movingWindowStep) || temporal.movingWindowStep < 1)) {
        add("buildOptions.temporal.movingWindowStep", "positive-finite");
      }
      if (temporal.turnWindowRadius !== undefined && (!isFiniteNumber(temporal.turnWindowRadius) || temporal.turnWindowRadius < 0)) {
        add("buildOptions.temporal.turnWindowRadius", "finite-nonnegative");
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

  if (issues.length > 0) throw new SenaInputValidationError(issues);
}
