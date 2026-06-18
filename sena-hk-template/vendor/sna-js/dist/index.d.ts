type GraphMode = "digraph" | "graph";
type MatrixCell = number | boolean | null | undefined;
type MatrixLike = ReadonlyArray<ReadonlyArray<MatrixCell>>;
type EdgeTuple = readonly [number, number] | readonly [number, number, number];
interface EdgeListInput {
    readonly edges: ReadonlyArray<EdgeTuple>;
    readonly order?: number;
    readonly indexBase?: 0 | 1;
    readonly directed?: boolean;
}
interface GraphOptions {
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
interface DenseGraph {
    readonly kind: "dense";
    readonly order: number;
    readonly directed: boolean;
    readonly loops: boolean;
    readonly weights: Float64Array;
    readonly adjacency: Uint8Array;
}
type GraphInput = MatrixLike | EdgeListInput | DenseGraph;
interface GeodistResult {
    readonly distances: number[][];
    readonly counts: number[][];
    readonly predecessors?: number[][][];
}
interface ComponentResult {
    readonly type: "strong" | "weak";
    readonly labels: number[];
    readonly sizes: number[];
    readonly count: number;
}

declare function createNumberMatrix(rows: number, cols: number, fill?: number): number[][];
declare function toNestedMatrix(values: ArrayLike<number>, rows: number, cols: number): number[][];

declare function isDenseGraph(input: GraphInput): input is DenseGraph;
declare function isEdgeListInput(input: GraphInput): input is EdgeListInput;
declare function makeDenseGraph(input: GraphInput, options?: GraphOptions): DenseGraph;
declare function denseGraphToMatrix(graph: DenseGraph, weighted?: boolean): number[][];
declare function neighbors(graph: DenseGraph, vertex: number): number[];
declare function hasTie(graph: DenseGraph, tail: number, head: number): boolean;
declare function tieWeight(graph: DenseGraph, tail: number, head: number): number;

type BetweennessMode = "directed" | "undirected";
interface BetweennessOptions extends GraphOptions {
    readonly cmode?: BetweennessMode;
    readonly rescale?: boolean;
}
declare function betweenness(input: GraphInput, options?: BetweennessOptions): number[];

interface ClosenessOptions extends GraphOptions {
    readonly rescale?: boolean;
}
declare function closeness(input: GraphInput, options?: ClosenessOptions): number[];

interface LabelPropagationOptions extends GraphOptions {
    readonly maxIterations?: number;
}
interface CommunityResult {
    readonly method: "label-propagation";
    readonly labels: number[];
    readonly sizes: number[];
    readonly count: number;
}
declare function labelPropagation(input: GraphInput, options?: LabelPropagationOptions): CommunityResult;

interface ComponentsOptions extends GraphOptions {
    readonly connected?: "strong" | "weak";
}
declare function components(input: GraphInput, options?: ComponentsOptions): ComponentResult;
declare function isConnected(input: GraphInput, options?: ComponentsOptions): boolean;

type DegreeMode = "indegree" | "outdegree" | "total" | "freeman";
interface DegreeOptions extends GraphOptions {
    readonly cmode?: DegreeMode;
}
declare function degree(input: GraphInput, options?: DegreeOptions): number[];

declare function nties(input: GraphInput, options?: GraphOptions): number;
declare function gden(input: GraphInput, options?: GraphOptions): number;

interface GeodistOptions extends GraphOptions {
    readonly infReplace?: number;
    readonly countPaths?: boolean;
    readonly predecessors?: boolean;
}
declare function geodist(input: GraphInput, options?: GeodistOptions): GeodistResult;

type GrecipMeasure = "dyadic" | "dyadic.nonnull" | "edgewise" | "edgewise.lrr" | "correlation";
interface GrecipOptions extends GraphOptions {
    readonly measure?: GrecipMeasure;
}
declare function grecip(input: GraphInput, options?: GrecipOptions): number;

interface ReachabilityResult {
    readonly matrix: number[][];
    readonly counts: number[];
}
declare function reachability(input: GraphInput, options?: GraphOptions): ReachabilityResult;
declare function averagePathLength(input: GraphInput, options?: GraphOptions): number;

declare const snaR: {
    readonly betweenness: typeof betweenness;
    readonly closeness: typeof closeness;
    readonly labelPropagation: typeof labelPropagation;
    readonly components: typeof components;
    readonly degree: typeof degree;
    readonly gden: typeof gden;
    readonly geodist: typeof geodist;
    readonly grecip: typeof grecip;
    readonly reachability: typeof reachability;
    readonly averagePathLength: typeof averagePathLength;
    readonly nties: typeof nties;
    readonly "is.connected": typeof isConnected;
};

export { type BetweennessMode, type BetweennessOptions, type ClosenessOptions, type CommunityResult, type ComponentResult, type ComponentsOptions, type DegreeMode, type DegreeOptions, type DenseGraph, type EdgeListInput, type EdgeTuple, type GeodistOptions, type GeodistResult, type GraphInput, type GraphMode, type GraphOptions, type GrecipMeasure, type GrecipOptions, type LabelPropagationOptions, type MatrixLike, type ReachabilityResult, averagePathLength, betweenness, closeness, components, createNumberMatrix, degree, denseGraphToMatrix, gden, geodist, grecip, hasTie, isConnected, isDenseGraph, isEdgeListInput, labelPropagation, makeDenseGraph, neighbors, nties, reachability, snaR, tieWeight, toNestedMatrix };
