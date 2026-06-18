import type { DenseGraph, EdgeListInput, GraphInput, GraphOptions, MatrixCell, MatrixLike } from "./types";
import { assertSquareMatrix, toNestedMatrix } from "./matrix";

export function isDenseGraph(input: GraphInput): input is DenseGraph {
  return typeof input === "object" && input !== null && "kind" in input && input.kind === "dense";
}

export function isEdgeListInput(input: GraphInput): input is EdgeListInput {
  return typeof input === "object" && input !== null && !Array.isArray(input) && "edges" in input;
}

function cellToNumber(value: MatrixCell): number {
  if (value === true) return 1;
  if (value === false || value == null) return 0;
  if (!Number.isFinite(value)) return 0;
  return value;
}

function resolveDirected(options: GraphOptions, edgeInput?: EdgeListInput): boolean {
  if (typeof options.directed === "boolean") return options.directed;
  if (typeof edgeInput?.directed === "boolean") return edgeInput.directed;
  return options.mode !== "graph";
}

function tieFromWeight(weight: number, threshold: number): 0 | 1 {
  return Math.abs(weight) > threshold ? 1 : 0;
}

export function makeDenseGraph(input: GraphInput, options: GraphOptions = {}): DenseGraph {
  if (isDenseGraph(input)) return input;

  const directed = resolveDirected(options, isEdgeListInput(input) ? input : undefined);
  const loops = options.diag ?? false;
  const threshold = options.threshold ?? 0;
  const symmetrize = options.symmetrize ?? "weak";

  if (isEdgeListInput(input)) {
    return denseFromEdgeList(input, { directed, loops, threshold, indexBase: options.indexBase ?? input.indexBase ?? 0 });
  }

  return denseFromMatrix(input, { directed, loops, threshold, symmetrize });
}

function denseFromMatrix(
  matrix: MatrixLike,
  options: { directed: boolean; loops: boolean; threshold: number; symmetrize: GraphOptions["symmetrize"] },
): DenseGraph {
  const n = assertSquareMatrix(matrix);
  const weights = new Float64Array(n * n);

  for (let i = 0; i < n; i += 1) {
    const row = matrix[i]!;
    for (let j = 0; j < n; j += 1) {
      if (!options.loops && i === j) continue;
      weights[i * n + j] = cellToNumber(row[j]);
    }
  }

  if (!options.directed && options.symmetrize !== false) {
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const a = weights[i * n + j]!;
        const b = weights[j * n + i]!;
        let value: number;
        switch (options.symmetrize) {
          case "strong":
            value = tieFromWeight(a, options.threshold) && tieFromWeight(b, options.threshold) ? Math.max(Math.abs(a), Math.abs(b)) : 0;
            break;
          case "upper":
            value = a;
            break;
          case "lower":
            value = b;
            break;
          case "weak":
          default:
            value = Math.abs(a) >= Math.abs(b) ? a : b;
            break;
        }
        weights[i * n + j] = value;
        weights[j * n + i] = value;
      }
    }
  }

  return finalizeDenseGraph(n, options.directed, options.loops, weights, options.threshold);
}

function denseFromEdgeList(
  input: EdgeListInput,
  options: { directed: boolean; loops: boolean; threshold: number; indexBase: 0 | 1 },
): DenseGraph {
  let order = input.order ?? 0;
  const normalizedEdges = input.edges.map((edge) => {
    const tail = edge[0] - options.indexBase;
    const head = edge[1] - options.indexBase;
    if (!Number.isInteger(tail) || !Number.isInteger(head) || tail < 0 || head < 0) {
      throw new RangeError("edge-list vertices must be non-negative integers after index-base conversion");
    }
    order = Math.max(order, tail + 1, head + 1);
    return [tail, head, edge[2] ?? 1] as const;
  });

  const weights = new Float64Array(order * order);
  for (const [tail, head, weight] of normalizedEdges) {
    if (!options.loops && tail === head) continue;
    weights[tail * order + head] = weight;
    if (!options.directed) weights[head * order + tail] = weight;
  }

  return finalizeDenseGraph(order, options.directed, options.loops, weights, options.threshold);
}

function finalizeDenseGraph(n: number, directed: boolean, loops: boolean, weights: Float64Array, threshold: number): DenseGraph {
  const adjacency = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i += 1) {
    adjacency[i] = tieFromWeight(weights[i] ?? 0, threshold);
  }
  return { kind: "dense", order: n, directed, loops, weights, adjacency };
}

export function denseGraphToMatrix(graph: DenseGraph, weighted = false): number[][] {
  return toNestedMatrix(weighted ? graph.weights : graph.adjacency, graph.order, graph.order);
}

export function neighbors(graph: DenseGraph, vertex: number): number[] {
  if (!Number.isInteger(vertex) || vertex < 0 || vertex >= graph.order) {
    throw new RangeError("vertex is outside graph order");
  }
  const out: number[] = [];
  for (let j = 0; j < graph.order; j += 1) {
    if (graph.adjacency[vertex * graph.order + j]) out.push(j);
  }
  return out;
}

export function hasTie(graph: DenseGraph, tail: number, head: number): boolean {
  return graph.adjacency[tail * graph.order + head] === 1;
}

export function tieWeight(graph: DenseGraph, tail: number, head: number): number {
  return graph.weights[tail * graph.order + head] ?? 0;
}
