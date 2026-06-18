// src/core/matrix.ts
function createNumberMatrix(rows, cols, fill = 0) {
  if (!Number.isInteger(rows) || rows < 0) throw new RangeError("rows must be a non-negative integer");
  if (!Number.isInteger(cols) || cols < 0) throw new RangeError("cols must be a non-negative integer");
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}
function toNestedMatrix(values, rows, cols) {
  if (values.length !== rows * cols) {
    throw new RangeError(`expected ${rows * cols} values, received ${values.length}`);
  }
  const out = createNumberMatrix(rows, cols);
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      out[i][j] = values[i * cols + j] ?? 0;
    }
  }
  return out;
}
function assertSquareMatrix(matrix) {
  const n = matrix.length;
  for (let i = 0; i < n; i += 1) {
    const row = matrix[i];
    if (!row || row.length !== n) {
      throw new TypeError("graph matrix inputs must be square");
    }
  }
  return n;
}

// src/core/graph.ts
function isDenseGraph(input) {
  return typeof input === "object" && input !== null && "kind" in input && input.kind === "dense";
}
function isEdgeListInput(input) {
  return typeof input === "object" && input !== null && !Array.isArray(input) && "edges" in input;
}
function cellToNumber(value) {
  if (value === true) return 1;
  if (value === false || value == null) return 0;
  if (!Number.isFinite(value)) return 0;
  return value;
}
function resolveDirected(options, edgeInput) {
  if (typeof options.directed === "boolean") return options.directed;
  if (typeof edgeInput?.directed === "boolean") return edgeInput.directed;
  return options.mode !== "graph";
}
function tieFromWeight(weight, threshold) {
  return Math.abs(weight) > threshold ? 1 : 0;
}
function makeDenseGraph(input, options = {}) {
  if (isDenseGraph(input)) return input;
  const directed = resolveDirected(options, isEdgeListInput(input) ? input : void 0);
  const loops = options.diag ?? false;
  const threshold = options.threshold ?? 0;
  const symmetrize = options.symmetrize ?? "weak";
  if (isEdgeListInput(input)) {
    return denseFromEdgeList(input, { directed, loops, threshold, indexBase: options.indexBase ?? input.indexBase ?? 0 });
  }
  return denseFromMatrix(input, { directed, loops, threshold, symmetrize });
}
function denseFromMatrix(matrix, options) {
  const n = assertSquareMatrix(matrix);
  const weights = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    const row = matrix[i];
    for (let j = 0; j < n; j += 1) {
      if (!options.loops && i === j) continue;
      weights[i * n + j] = cellToNumber(row[j]);
    }
  }
  if (!options.directed && options.symmetrize !== false) {
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const a = weights[i * n + j];
        const b = weights[j * n + i];
        let value;
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
function denseFromEdgeList(input, options) {
  let order = input.order ?? 0;
  const normalizedEdges = input.edges.map((edge) => {
    const tail = edge[0] - options.indexBase;
    const head = edge[1] - options.indexBase;
    if (!Number.isInteger(tail) || !Number.isInteger(head) || tail < 0 || head < 0) {
      throw new RangeError("edge-list vertices must be non-negative integers after index-base conversion");
    }
    order = Math.max(order, tail + 1, head + 1);
    return [tail, head, edge[2] ?? 1];
  });
  const weights = new Float64Array(order * order);
  for (const [tail, head, weight] of normalizedEdges) {
    if (!options.loops && tail === head) continue;
    weights[tail * order + head] = weight;
    if (!options.directed) weights[head * order + tail] = weight;
  }
  return finalizeDenseGraph(order, options.directed, options.loops, weights, options.threshold);
}
function finalizeDenseGraph(n, directed, loops, weights, threshold) {
  const adjacency = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i += 1) {
    adjacency[i] = tieFromWeight(weights[i] ?? 0, threshold);
  }
  return { kind: "dense", order: n, directed, loops, weights, adjacency };
}
function denseGraphToMatrix(graph, weighted = false) {
  return toNestedMatrix(weighted ? graph.weights : graph.adjacency, graph.order, graph.order);
}
function neighbors(graph, vertex) {
  if (!Number.isInteger(vertex) || vertex < 0 || vertex >= graph.order) {
    throw new RangeError("vertex is outside graph order");
  }
  const out = [];
  for (let j = 0; j < graph.order; j += 1) {
    if (graph.adjacency[vertex * graph.order + j]) out.push(j);
  }
  return out;
}
function hasTie(graph, tail, head) {
  return graph.adjacency[tail * graph.order + head] === 1;
}
function tieWeight(graph, tail, head) {
  return graph.weights[tail * graph.order + head] ?? 0;
}

// src/algorithms/betweenness.ts
function buildAdjacencyLists(adjacency, n) {
  const out = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (adjacency[i * n + j]) out[i].push(j);
    }
  }
  return out;
}
function rescaleBetweenness(scores, undirected) {
  const n = scores.length;
  if (n <= 2) return scores.map(() => 0);
  const denominator = undirected ? (n - 1) * (n - 2) / 2 : (n - 1) * (n - 2);
  if (denominator === 0) return scores.map(() => 0);
  return scores.map((score) => score / denominator);
}
function betweenness(input, options = {}) {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  const adjacency = buildAdjacencyLists(graph.adjacency, n);
  const scores = Array.from({ length: n }, () => 0);
  const undirected = options.cmode === "undirected" || !graph.directed && options.cmode !== "directed";
  for (let source = 0; source < n; source += 1) {
    const stack = [];
    const predecessors = Array.from({ length: n }, () => []);
    const sigma = Array.from({ length: n }, () => 0);
    const distance = Array.from({ length: n }, () => -1);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    sigma[source] = 1;
    distance[source] = 0;
    queue[tail++] = source;
    while (head < tail) {
      const vertex = queue[head++];
      const currentDistance = distance[vertex] ?? 0;
      const currentSigma = sigma[vertex] ?? 0;
      stack.push(vertex);
      for (const next of adjacency[vertex]) {
        if ((distance[next] ?? -1) < 0) {
          distance[next] = currentDistance + 1;
          queue[tail++] = next;
        }
        if (distance[next] === currentDistance + 1) {
          sigma[next] = (sigma[next] ?? 0) + currentSigma;
          predecessors[next].push(vertex);
        }
      }
    }
    const dependency = Array.from({ length: n }, () => 0);
    while (stack.length > 0) {
      const vertex = stack.pop();
      if (vertex === void 0) continue;
      const vertexSigma = sigma[vertex] ?? 0;
      const vertexDependency = dependency[vertex] ?? 0;
      for (const predecessor of predecessors[vertex]) {
        if (vertexSigma === 0) continue;
        dependency[predecessor] = (dependency[predecessor] ?? 0) + (sigma[predecessor] ?? 0) / vertexSigma * (1 + vertexDependency);
      }
      if (vertex !== source) scores[vertex] = (scores[vertex] ?? 0) + vertexDependency;
    }
  }
  const unscaled = undirected ? scores.map((score) => score / 2) : scores;
  return options.rescale ? rescaleBetweenness(unscaled, undirected) : unscaled;
}

// src/algorithms/geodist.ts
function geodist(input, options = {}) {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  const distances = createNumberMatrix(n, n, Number.POSITIVE_INFINITY);
  const counts = createNumberMatrix(n, n, 0);
  const predecessorData = options.predecessors ? Array.from({ length: n }, () => Array.from({ length: n }, () => [])) : void 0;
  const adjacency = buildAdjacencyLists2(graph.adjacency, n);
  for (let source = 0; source < n; source += 1) {
    const dist = distances[source];
    const count = counts[source];
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;
    dist[source] = 0;
    count[source] = 1;
    queue[tail++] = source;
    while (head < tail) {
      const vertex = queue[head++];
      const nextDistance = (dist[vertex] ?? 0) + 1;
      for (const next of adjacency[vertex]) {
        if (dist[next] === Number.POSITIVE_INFINITY) {
          dist[next] = nextDistance;
          queue[tail++] = next;
        }
        if (dist[next] === nextDistance) {
          count[next] = (count[next] ?? 0) + (count[vertex] ?? 0);
          if (predecessorData) predecessorData[source][next].push(vertex);
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
function buildAdjacencyLists2(adjacency, n) {
  const out = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (adjacency[i * n + j]) out[i].push(j);
    }
  }
  return out;
}

// src/algorithms/closeness.ts
function closeness(input, options = {}) {
  const distances = geodist(input, options).distances;
  const raw = distances.map((row, rowIndex) => {
    let reachable = 0;
    let totalDistance = 0;
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const distance = row[columnIndex] ?? Number.POSITIVE_INFINITY;
      if (columnIndex === rowIndex || !Number.isFinite(distance) || distance <= 0) continue;
      reachable += 1;
      totalDistance += distance;
    }
    return totalDistance > 0 ? reachable / totalDistance : 0;
  });
  if (!options.rescale) return raw;
  const n = distances.length;
  if (n <= 1) return raw.map(() => 0);
  return raw.map((value, index) => {
    const reachable = distances[index]?.filter((distance, columnIndex) => {
      return columnIndex !== index && Number.isFinite(distance) && distance > 0;
    }).length ?? 0;
    return value * (reachable / (n - 1));
  });
}

// src/algorithms/community.ts
function tieValue(graph, i, j, weighted) {
  const index = i * graph.order + j;
  return weighted ? graph.weights[index] ?? 0 : graph.adjacency[index] ?? 0;
}
function remapLabels(labels) {
  const remap = /* @__PURE__ */ new Map();
  const normalized = labels.map((label) => {
    if (!remap.has(label)) remap.set(label, remap.size);
    return remap.get(label) ?? 0;
  });
  const sizes = Array.from({ length: remap.size }, () => 0);
  for (const label of normalized) sizes[label] = (sizes[label] ?? 0) + 1;
  return { method: "label-propagation", labels: normalized, sizes, count: sizes.length };
}
function labelPropagation(input, options = {}) {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  const labels = Array.from({ length: n }, (_, index) => index);
  const maxIterations = options.maxIterations ?? 50;
  const weighted = options.ignoreEval !== true;
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let changed = false;
    for (let node = 0; node < n; node += 1) {
      const weights = /* @__PURE__ */ new Map();
      for (let other = 0; other < n; other += 1) {
        if (node === other) continue;
        const weight = Math.max(tieValue(graph, node, other, weighted), tieValue(graph, other, node, weighted));
        if (weight <= 0) continue;
        const label = labels[other] ?? other;
        weights.set(label, (weights.get(label) ?? 0) + weight);
      }
      if (weights.size === 0) continue;
      const currentLabel = labels[node] ?? node;
      const best = Array.from(weights.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? currentLabel;
      if (best !== currentLabel) {
        labels[node] = best;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return remapLabels(labels);
}

// src/algorithms/components.ts
function components(input, options = {}) {
  const graph = makeDenseGraph(input, options);
  const type = options.connected ?? (graph.directed ? "strong" : "weak");
  return type === "weak" ? weakComponents(graph) : strongComponents(graph);
}
function isConnected(input, options = {}) {
  return components(input, options).count <= 1;
}
function weakComponents(graph) {
  const n = graph.order;
  const labels = Array.from({ length: n }, () => -1);
  const sizes = [];
  let current = 0;
  for (let start = 0; start < n; start += 1) {
    if (labels[start] !== -1) continue;
    const queue = [start];
    labels[start] = current;
    let size = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const vertex = queue[cursor];
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
function strongComponents(graph) {
  const n = graph.order;
  const indices = Array.from({ length: n }, () => -1);
  const lowlink = Array.from({ length: n }, () => 0);
  const stack = [];
  const onStack = Array.from({ length: n }, () => false);
  const labels = Array.from({ length: n }, () => -1);
  const sizes = [];
  let index = 0;
  function visit(vertex) {
    indices[vertex] = index;
    lowlink[vertex] = index;
    index += 1;
    stack.push(vertex);
    onStack[vertex] = true;
    for (let next = 0; next < n; next += 1) {
      if (!hasTie(graph, vertex, next)) continue;
      if (indices[next] === -1) {
        visit(next);
        lowlink[vertex] = Math.min(lowlink[vertex], lowlink[next]);
      } else if (onStack[next]) {
        lowlink[vertex] = Math.min(lowlink[vertex], indices[next]);
      }
    }
    if (lowlink[vertex] === indices[vertex]) {
      const componentIndex = sizes.length;
      let size = 0;
      while (true) {
        const member = stack.pop();
        if (member === void 0) throw new Error("internal Tarjan stack underflow");
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

// src/algorithms/degree.ts
function degree(input, options = {}) {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  const mode = options.cmode ?? "freeman";
  const ignoreEval = options.ignoreEval ?? true;
  const valueAt = (i, j) => ignoreEval ? graph.adjacency[i * n + j] ?? 0 : graph.weights[i * n + j] ?? 0;
  const out = Array.from({ length: n }, () => 0);
  if (!graph.directed) {
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (!graph.loops && i === j) continue;
        out[i] += valueAt(i, j);
      }
    }
    return out;
  }
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (!graph.loops && i === j) continue;
      const value = valueAt(i, j);
      if (mode === "outdegree" || mode === "freeman" || mode === "total") out[i] += value;
      if (mode === "indegree" || mode === "total") out[j] += value;
    }
  }
  return out;
}

// src/algorithms/density.ts
function nties(input, options = {}) {
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
function gden(input, options = {}) {
  const graph = makeDenseGraph(input, options);
  const n = graph.order;
  const denominator = graph.directed ? n * (n - (graph.loops ? 0 : 1)) : graph.loops ? n * (n + 1) / 2 : n * (n - 1) / 2;
  return denominator === 0 ? Number.NaN : nties(graph) / denominator;
}

// src/algorithms/reciprocity.ts
function dyadCensus(graph) {
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
function reciprocalValue(graph, tail, head, ignoreEval) {
  const index = tail * graph.order + head;
  return ignoreEval ? graph.adjacency[index] ?? 0 : graph.weights[index] ?? 0;
}
function correlationReciprocity(graph, ignoreEval) {
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
  return 2 * dyadProductSum / sumSquares;
}
function grecip(input, options = {}) {
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
      return directedTies === 0 ? Number.NaN : 2 * mutual / directedTies;
    }
    case "edgewise.lrr":
      return Math.log(mutual * totalDyads / (mutual + asymmetric / 2) ** 2);
    default: {
      const exhaustiveCheck = measure;
      throw new Error(`Unsupported grecip measure: ${exhaustiveCheck}`);
    }
  }
}

// src/algorithms/reachability.ts
function reachability(input, options = {}) {
  const distances = geodist(input, options).distances;
  const matrix = distances.map((row, rowIndex) => {
    return row.map((distance, columnIndex) => {
      return columnIndex !== rowIndex && Number.isFinite(distance) && distance > 0 ? 1 : 0;
    });
  });
  const counts = matrix.map((row) => row.reduce((total, value) => total + value, 0));
  return { matrix, counts };
}
function averagePathLength(input, options = {}) {
  const distances = geodist(input, options).distances;
  let totalDistance = 0;
  let pathCount = 0;
  for (let rowIndex = 0; rowIndex < distances.length; rowIndex += 1) {
    const row = distances[rowIndex];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const distance = row[columnIndex] ?? Number.POSITIVE_INFINITY;
      if (columnIndex === rowIndex || !Number.isFinite(distance) || distance <= 0) continue;
      totalDistance += distance;
      pathCount += 1;
    }
  }
  return pathCount > 0 ? totalDistance / pathCount : 0;
}

// src/compat/rNames.ts
var snaR = {
  betweenness,
  closeness,
  labelPropagation,
  components,
  degree,
  gden,
  geodist,
  grecip,
  reachability,
  averagePathLength,
  nties,
  "is.connected": isConnected
};
export {
  averagePathLength,
  betweenness,
  closeness,
  components,
  createNumberMatrix,
  degree,
  denseGraphToMatrix,
  gden,
  geodist,
  grecip,
  hasTie,
  isConnected,
  isDenseGraph,
  isEdgeListInput,
  labelPropagation,
  makeDenseGraph,
  neighbors,
  nties,
  reachability,
  snaR,
  tieWeight,
  toNestedMatrix
};
//# sourceMappingURL=index.js.map