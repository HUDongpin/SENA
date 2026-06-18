import { hasTie, makeDenseGraph } from "../core/graph";
import type { ComponentResult, GraphInput, GraphOptions } from "../core/types";

export interface ComponentsOptions extends GraphOptions {
  readonly connected?: "strong" | "weak";
}

export function components(input: GraphInput, options: ComponentsOptions = {}): ComponentResult {
  const graph = makeDenseGraph(input, options);
  const type = options.connected ?? (graph.directed ? "strong" : "weak");
  return type === "weak" ? weakComponents(graph) : strongComponents(graph);
}

export function isConnected(input: GraphInput, options: ComponentsOptions = {}): boolean {
  return components(input, options).count <= 1;
}

type GraphLike = ReturnType<typeof makeDenseGraph>;

function weakComponents(graph: GraphLike): ComponentResult {
  const n = graph.order;
  const labels = Array.from({ length: n }, () => -1);
  const sizes: number[] = [];
  let current = 0;

  for (let start = 0; start < n; start += 1) {
    if (labels[start] !== -1) continue;
    const queue = [start];
    labels[start] = current;
    let size = 0;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const vertex = queue[cursor]!;
      size += 1;
      for (let other = 0; other < n; other += 1) {
        if (labels[other] !== -1) continue;
        if (hasTie(graph, vertex, other) || hasTie(graph, other, vertex)) {
          labels[other] = current;
          queue.push(other);
        }
      }
    }

    sizes.push(size);
    current += 1;
  }

  return { type: "weak", labels, sizes, count: sizes.length };
}

function strongComponents(graph: GraphLike): ComponentResult {
  const n = graph.order;
  const indices = Array.from({ length: n }, () => -1);
  const lowlink = Array.from({ length: n }, () => 0);
  const stack: number[] = [];
  const onStack = Array.from({ length: n }, () => false);
  const labels = Array.from({ length: n }, () => -1);
  const sizes: number[] = [];
  let index = 0;

  function visit(vertex: number): void {
    indices[vertex] = index;
    lowlink[vertex] = index;
    index += 1;
    stack.push(vertex);
    onStack[vertex] = true;

    for (let next = 0; next < n; next += 1) {
      if (!hasTie(graph, vertex, next)) continue;
      if (indices[next] === -1) {
        visit(next);
        lowlink[vertex] = Math.min(lowlink[vertex]!, lowlink[next]!);
      } else if (onStack[next]) {
        lowlink[vertex] = Math.min(lowlink[vertex]!, indices[next]!);
      }
    }

    if (lowlink[vertex] === indices[vertex]) {
      const componentIndex = sizes.length;
      let size = 0;
      while (true) {
        const member = stack.pop();
        if (member === undefined) throw new Error("internal Tarjan stack underflow");
        onStack[member] = false;
        labels[member] = componentIndex;
        size += 1;
        if (member === vertex) break;
      }
      sizes.push(size);
    }
  }

  for (let vertex = 0; vertex < n; vertex += 1) {
    if (indices[vertex] === -1) visit(vertex);
  }

  return { type: "strong", labels, sizes, count: sizes.length };
}
