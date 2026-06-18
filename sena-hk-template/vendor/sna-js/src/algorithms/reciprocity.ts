import { makeDenseGraph } from "../core/graph";
import type { DenseGraph, GraphInput, GraphOptions } from "../core/types";

export type GrecipMeasure = "dyadic" | "dyadic.nonnull" | "edgewise" | "edgewise.lrr" | "correlation";

export interface GrecipOptions extends GraphOptions {
  readonly measure?: GrecipMeasure;
}

interface DyadCensus {
  readonly mutual: number;
  readonly asymmetric: number;
  readonly nullDyads: number;
}

function dyadCensus(graph: DenseGraph): DyadCensus {
  let mutual = 0;
  let asymmetric = 0;
  let nullDyads = 0;

  for (let i = 0; i < graph.order; i += 1) {
    for (let j = i + 1; j < graph.order; j += 1) {
      const forward = graph.adjacency[i * graph.order + j] === 1;
      const reverse = graph.adjacency[j * graph.order + i] === 1;
      if (forward && reverse) {
        mutual += 1;
      } else if (forward || reverse) {
        asymmetric += 1;
      } else {
        nullDyads += 1;
      }
    }
  }

  return { mutual, asymmetric, nullDyads };
}

function reciprocalValue(graph: DenseGraph, tail: number, head: number, ignoreEval: boolean): number {
  const index = tail * graph.order + head;
  return ignoreEval ? (graph.adjacency[index] ?? 0) : (graph.weights[index] ?? 0);
}

function correlationReciprocity(graph: DenseGraph, ignoreEval: boolean): number {
  if (graph.order < 2) return Number.NaN;

  if (graph.order === 2) {
    const forward = reciprocalValue(graph, 0, 1, ignoreEval);
    const reverse = reciprocalValue(graph, 1, 0, ignoreEval);
    if (forward === 0 && reverse === 0) return 1;
    if (forward === 0 || reverse === 0) return 0;
    return forward === reverse ? 1 : 0;
  }

  const directedDyads = graph.order * (graph.order - 1);
  let total = 0;
  for (let i = 0; i < graph.order; i += 1) {
    for (let j = 0; j < graph.order; j += 1) {
      if (i === j) continue;
      total += reciprocalValue(graph, i, j, ignoreEval);
    }
  }

  const mean = total / directedDyads;
  let sumSquares = 0;
  for (let i = 0; i < graph.order; i += 1) {
    for (let j = 0; j < graph.order; j += 1) {
      if (i === j) continue;
      const centered = reciprocalValue(graph, i, j, ignoreEval) - mean;
      sumSquares += centered * centered;
    }
  }

  if (sumSquares === 0) return 1;

  let dyadProductSum = 0;
  for (let i = 0; i < graph.order; i += 1) {
    for (let j = i + 1; j < graph.order; j += 1) {
      const forward = reciprocalValue(graph, i, j, ignoreEval) - mean;
      const reverse = reciprocalValue(graph, j, i, ignoreEval) - mean;
      dyadProductSum += forward * reverse;
    }
  }

  return (2 * dyadProductSum) / sumSquares;
}

export function grecip(input: GraphInput, options: GrecipOptions = {}): number {
  const measure = options.measure ?? "dyadic";
  const graph = makeDenseGraph(input, { ...options, mode: "digraph", directed: true });
  const { mutual, asymmetric, nullDyads } = dyadCensus(graph);

  if (measure === "correlation") return correlationReciprocity(graph, options.ignoreEval !== false);

  const nonNullDyads = mutual + asymmetric;
  const totalDyads = nonNullDyads + nullDyads;

  switch (measure) {
    case "dyadic":
      return totalDyads === 0 ? Number.NaN : (mutual + nullDyads) / totalDyads;
    case "dyadic.nonnull":
      return nonNullDyads === 0 ? Number.NaN : mutual / nonNullDyads;
    case "edgewise": {
      const directedTies = 2 * mutual + asymmetric;
      return directedTies === 0 ? Number.NaN : (2 * mutual) / directedTies;
    }
    case "edgewise.lrr":
      return Math.log((mutual * totalDyads) / (mutual + asymmetric / 2) ** 2);
    default: {
      const exhaustiveCheck: never = measure;
      throw new Error(`Unsupported grecip measure: ${exhaustiveCheck}`);
    }
  }
}
