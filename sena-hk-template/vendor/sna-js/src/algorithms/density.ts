import { makeDenseGraph } from "../core/graph";
import type { GraphInput, GraphOptions } from "../core/types";

export function nties(input: GraphInput, options: GraphOptions = {}): number {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  let count = 0;

  if (graph.directed) {
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (!graph.loops && i === j) continue;
        count += graph.adjacency[i * n + j] ?? 0;
      }
    }
    return count;
  }

  for (let i = 0; i < n; i += 1) {
    const start = graph.loops ? i : i + 1;
    for (let j = start; j < n; j += 1) {
      count += graph.adjacency[i * n + j] ?? 0;
    }
  }
  return count;
}

export function gden(input: GraphInput, options: GraphOptions = {}): number {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  const denominator = graph.directed
    ? n * (n - (graph.loops ? 0 : 1))
    : graph.loops
      ? (n * (n + 1)) / 2
      : (n * (n - 1)) / 2;

  return denominator === 0 ? Number.NaN : nties(graph) / denominator;
}
