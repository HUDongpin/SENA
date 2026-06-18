import { makeDenseGraph } from "../core/graph";
import type { GraphInput, GraphOptions } from "../core/types";

export type BetweennessMode = "directed" | "undirected";

export interface BetweennessOptions extends GraphOptions {
  readonly cmode?: BetweennessMode;
  readonly rescale?: boolean;
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

function rescaleBetweenness(scores: number[], undirected: boolean): number[] {
  const n = scores.length;
  if (n <= 2) return scores.map(() => 0);

  const denominator = undirected ? ((n - 1) * (n - 2)) / 2 : (n - 1) * (n - 2);
  if (denominator === 0) return scores.map(() => 0);
  return scores.map((score) => score / denominator);
}

export function betweenness(input: GraphInput, options: BetweennessOptions = {}): number[] {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  const adjacency = buildAdjacencyLists(graph.adjacency, n);
  const scores = Array.from({ length: n }, () => 0);
  const undirected = options.cmode === "undirected" || (!graph.directed && options.cmode !== "directed");

  for (let source = 0; source < n; source += 1) {
    const stack: number[] = [];
    const predecessors = Array.from({ length: n }, () => [] as number[]);
    const sigma = Array.from({ length: n }, () => 0);
    const distance = Array.from({ length: n }, () => -1);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;

    sigma[source] = 1;
    distance[source] = 0;
    queue[tail++] = source;

    while (head < tail) {
      const vertex = queue[head++]!;
      const currentDistance = distance[vertex] ?? 0;
      const currentSigma = sigma[vertex] ?? 0;
      stack.push(vertex);
      for (const next of adjacency[vertex]!) {
        if ((distance[next] ?? -1) < 0) {
          distance[next] = currentDistance + 1;
          queue[tail++] = next;
        }
        if (distance[next] === currentDistance + 1) {
          sigma[next] = (sigma[next] ?? 0) + currentSigma;
          predecessors[next]!.push(vertex);
        }
      }
    }

    const dependency = Array.from({ length: n }, () => 0);
    while (stack.length > 0) {
      const vertex = stack.pop();
      if (vertex === undefined) continue;
      const vertexSigma = sigma[vertex] ?? 0;
      const vertexDependency = dependency[vertex] ?? 0;
      for (const predecessor of predecessors[vertex]!) {
        if (vertexSigma === 0) continue;
        dependency[predecessor] = (dependency[predecessor] ?? 0) + ((sigma[predecessor] ?? 0) / vertexSigma) * (1 + vertexDependency);
      }
      if (vertex !== source) scores[vertex] = (scores[vertex] ?? 0) + vertexDependency;
    }
  }

  const unscaled = undirected ? scores.map((score) => score / 2) : scores;
  return options.rescale ? rescaleBetweenness(unscaled, undirected) : unscaled;
}
