import { makeDenseGraph } from "../core/graph";
import type { GraphInput, GraphOptions } from "../core/types";

export type DegreeMode = "indegree" | "outdegree" | "total" | "freeman";

export interface DegreeOptions extends GraphOptions {
  readonly cmode?: DegreeMode;
}

export function degree(input: GraphInput, options: DegreeOptions = {}): number[] {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  const mode = options.cmode ?? "freeman";
  const ignoreEval = options.ignoreEval ?? true;
  const valueAt = (i: number, j: number): number => (ignoreEval ? graph.adjacency[i * n + j] ?? 0 : graph.weights[i * n + j] ?? 0);
  const out = Array.from({ length: n }, () => 0);

  if (!graph.directed) {
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (!graph.loops && i === j) continue;
        out[i]! += valueAt(i, j);
      }
    }
    return out;
  }

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (!graph.loops && i === j) continue;
      const value = valueAt(i, j);
      if (mode === "outdegree" || mode === "freeman" || mode === "total") out[i]! += value;
      if (mode === "indegree" || mode === "total") out[j]! += value;
    }
  }

  return out;
}
