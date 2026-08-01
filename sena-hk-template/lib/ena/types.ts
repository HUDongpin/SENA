import type {
  ENAOptions,
  ENASet,
  ModelType,
  NodePositionMethod,
  Scalar,
  WindowType
} from "jena-js";
import type { ENAPlotModel } from "jena-js/plot";

export type EnaRuntime = "worker" | "api";
export type EnaWeightBy = "binary" | "sum";
export type EnaScalar = Scalar;
export type EnaRow = Record<string, EnaScalar>;

export type EnaMapping = {
  units: string[];
  conversation: string[];
  codes: string[];
  metadata?: string[];
};

export type EnaRunOptions = {
  model?: ModelType;
  window?: WindowType;
  weightBy?: EnaWeightBy;
  windowSizeBack?: number;
  windowSizeForward?: number;
  dimensions?: number;
  nodePositionMethod?: NodePositionMethod;
};

/**
 * How the plot model is composed from a computed set. Purely presentational —
 * it selects which jena-js plot traces to add and never changes the ENA model.
 */
export type EnaPlotComposition = {
  /**
   * Metadata column whose distinct values become group-mean traces, and which
   * colours per-unit trajectories. Typically a condition or cohort column.
   */
  groupBy?: string;
  /**
   * Minimum |mean connection weight| an edge needs to be drawn, passed straight
   * to jena-js's `addNetwork({ minWeight })`. webENA exposes this as "minimum
   * edge weight" and SENA's workspace has always had a threshold slider; this
   * is the same control on the ENA route. Undefined keeps the default floor.
   */
  minWeight?: number;
};

export type EnaRunRequest = {
  rows: EnaRow[];
  mapping: EnaMapping;
  options?: EnaRunOptions;
  composition?: EnaPlotComposition;
};

export type EnaRunSummary = {
  rows: number;
  units: number;
  codes: number;
  dimensions: string[];
  variance: Record<string, number>;
  elapsedMs: number;
  runtime: EnaRuntime;
};

export type EnaRunResult = {
  set: ENASet;
  plotModel: ENAPlotModel;
  summary: EnaRunSummary;
  warnings: string[];
};

// SENA restricts weightBy to the structured-clone-safe string forms so one
// prepared options object is valid both for the in-page ena() run and for
// the jena-js worker boundary (which cannot transfer weightBy functions).
export type EnaPreparedOptions = ENAOptions & { weightBy?: EnaWeightBy };

export type EnaPreparedRun = {
  options: EnaPreparedOptions;
  warnings: string[];
};

export class EnaInputError extends Error {
  issues: string[];

  constructor(issues: string[] | string) {
    const normalized = Array.isArray(issues) ? issues : [issues];
    super(normalized.join(" "));
    this.name = "EnaInputError";
    this.issues = normalized;
  }
}
