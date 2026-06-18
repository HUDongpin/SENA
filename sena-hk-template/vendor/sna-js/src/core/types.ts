export type GraphMode = "digraph" | "graph";

export type MatrixCell = number | boolean | null | undefined;
export type MatrixLike = ReadonlyArray<ReadonlyArray<MatrixCell>>;

export type EdgeTuple = readonly [number, number] | readonly [number, number, number];

export interface EdgeListInput {
  readonly edges: ReadonlyArray<EdgeTuple>;
  readonly order?: number;
  readonly indexBase?: 0 | 1;
  readonly directed?: boolean;
}

export interface GraphOptions {
  /** R-compatible mode name. `digraph` is directed; `graph` is undirected. */
  readonly mode?: GraphMode;
  /** Overrides `mode` when supplied. */
  readonly directed?: boolean;
  /** Preserve diagonal/self-loops. Defaults to false for R-like SNA behavior. */
  readonly diag?: boolean;
  /** Absolute tie threshold used when deriving binary adjacency from values. */
  readonly threshold?: number;
  /** Whether valued ties should be treated as binary. Defaults to true in most algorithms. */
  readonly ignoreEval?: boolean;
  /** Index base for edge-list inputs. Defaults to the input's indexBase or 0. */
  readonly indexBase?: 0 | 1;
  /** Symmetrization mode for undirected graph inputs. */
  readonly symmetrize?: "weak" | "strong" | "upper" | "lower" | false;
}

export interface DenseGraph {
  readonly kind: "dense";
  readonly order: number;
  readonly directed: boolean;
  readonly loops: boolean;
  readonly weights: Float64Array;
  readonly adjacency: Uint8Array;
}

export type GraphInput = MatrixLike | EdgeListInput | DenseGraph;

export interface GeodistResult {
  readonly distances: number[][];
  readonly counts: number[][];
  readonly predecessors?: number[][][];
}

export interface ComponentResult {
  readonly type: "strong" | "weak";
  readonly labels: number[];
  readonly sizes: number[];
  readonly count: number;
}
