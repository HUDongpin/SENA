import { makeDenseGraph } from "../core/graph";
import { createNumberMatrix } from "../core/matrix";
import type { GeodistResult, GraphInput, GraphOptions } from "../core/types";

export interface GeodistOptions extends GraphOptions {
  readonly infReplace?: number;
  readonly countPaths?: boolean;
  readonly predecessors?: boolean;
}

export function geodist(input: GraphInput, options: GeodistOptions = {}): GeodistResult {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  const distances = createNumberMatrix(n, n, Number.POSITIVE_INFINITY);
  const counts = createNumberMatrix(n, n, 0);
  const predecessorData = options.predecessors ? Array.from({ length: n }, () => Array.from({ length: n }, () => [] as number[])) : undefined;
  const adjacency = buildAdjacencyLists(graph.adjacency, n);

  for (let source = 0; source < n; source += 1) {
    const dist = distances[source]!;
    const count = counts[source]!;
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;

    dist[source] = 0;
    count[source] = 1;
    queue[tail++] = source;

    while (head < tail) {
      const vertex = queue[head++]!;
      const nextDistance = (dist[vertex] ?? 0) + 1;
      for (const next of adjacency[vertex]!) {
        if (dist[next] === Number.POSITIVE_INFINITY) {
          dist[next] = nextDistance;
          queue[tail++] = next;
        }
        if (dist[next] === nextDistance) {
          count[next] = (count[next] ?? 0) + (count[vertex] ?? 0);
          if (predecessorData) predecessorData[source]![next]!.push(vertex);
        }
      }
    }
  }

  if (typeof options.infReplace === "number") {
    for (const row of distances) {
      for (let j = 0; j < row.length; j += 1) {
        if (row[j] === Number.POSITIVE_INFINITY) row[j] = options.infReplace;
      }
    }
  }

  return predecessorData ? { distances, counts, predecessors: predecessorData } : { distances, counts };
}

function buildAdjacencyLists(adjacency: Uint8Array, n: number): number[][] {
  const out: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (adjacency[i * n + j]) out[i]!.push(j);
    }
  }
  return out;
}
