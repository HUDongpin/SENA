import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  averagePathLength,
  betweenness,
  closeness,
  components,
  degree,
  denseGraphToMatrix,
  gden,
  geodist,
  grecip,
  labelPropagation,
  makeDenseGraph,
  nties,
  reachability,
  snaR,
} from "../src";

const rSnapshots = JSON.parse(
  readFileSync(new URL("./fixtures/r-snapshots.json", import.meta.url), "utf8")
) as {
  directedPath3: {
    gden: number;
    degreeOut: number[];
    degreeIn: number[];
    degreeTotal: number[];
    geodist: Array<Array<number | "Inf">>;
    geodistCounts: number[][];
    betweenness: number[];
    closeness: number[];
    reachable: number[];
    averagePathLength: number;
    grecipEdgewise: number;
    grecipDyadic: number;
    grecipDyadicNonnull: number;
    grecipCorrelation: number;
  };
  triangle3: {
    nties: number;
    gden: number;
    degree: number[];
    betweenness: number[];
    closeness: number[];
    reachable: number[];
    averagePathLength: number;
    communityLabels: number[];
    grecipEdgewise: number;
    grecipDyadic: number;
    grecipDyadicNonnull: number;
    grecipCorrelation: number;
  };
};

function hydrateDistances(matrix: Array<Array<number | "Inf">>) {
  return matrix.map((row) => row.map((value) => (value === "Inf" ? Number.POSITIVE_INFINITY : value)));
}

describe("graph normalization", () => {
  it("normalizes a one-based edge list when requested", () => {
    const graph = makeDenseGraph({ order: 3, indexBase: 1, edges: [[1, 2], [2, 3]] }, { mode: "digraph" });
    expect(denseGraphToMatrix(graph)).toEqual([
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, 0],
    ]);
  });

  it("symmetrizes undirected matrix inputs by weak ties", () => {
    const graph = makeDenseGraph(
      [
        [0, 1],
        [0, 0],
      ],
      { mode: "graph" },
    );
    expect(denseGraphToMatrix(graph)).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });
});

describe("density", () => {
  it("counts ties and density for a directed path", () => {
    const graph = [
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, 0],
    ];
    expect(nties(graph, { mode: "digraph" })).toBe(2);
    expect(gden(graph, { mode: "digraph" })).toBeCloseTo(1 / 3);
  });

  it("counts an undirected triangle as density 1", () => {
    const triangle = [
      [0, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
    ];
    expect(nties(triangle, { mode: "graph" })).toBe(3);
    expect(gden(triangle, { mode: "graph" })).toBe(1);
  });
});

describe("degree", () => {
  const path = [
    [0, 1, 0],
    [0, 0, 1],
    [0, 0, 0],
  ];

  it("computes directed outdegree", () => {
    expect(degree(path, { mode: "digraph", cmode: "outdegree" })).toEqual([1, 1, 0]);
  });

  it("computes directed indegree", () => {
    expect(degree(path, { mode: "digraph", cmode: "indegree" })).toEqual([0, 1, 1]);
  });

  it("computes directed total degree", () => {
    expect(degree(path, { mode: "digraph", cmode: "total" })).toEqual([1, 2, 1]);
  });
});

describe("betweenness", () => {
  it("computes unscaled directed betweenness for a path", () => {
    const path = [
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, 0],
    ];

    expect(betweenness(path, { mode: "digraph", cmode: "directed", rescale: false })).toEqual([0, 1, 0]);
  });

  it("computes unscaled and rescaled undirected betweenness for a star", () => {
    const star = [
      [0, 1, 1, 1],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
    ];

    expect(betweenness(star, { mode: "graph", cmode: "undirected", rescale: false })).toEqual([3, 0, 0, 0]);
    expect(betweenness(star, { mode: "graph", cmode: "undirected", rescale: true })).toEqual([1, 0, 0, 0]);
  });
});

describe("closeness", () => {
  it("computes reachable-normalized closeness for a directed path", () => {
    const path = [
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, 0],
    ];

    expect(closeness(path, { mode: "digraph" })).toEqual([2 / 3, 1, 0]);
  });

  it("optionally rescales disconnected closeness by reachable coverage", () => {
    const disconnected = [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ];

    expect(closeness(disconnected, { mode: "graph" })).toEqual([1, 1, 0]);
    expect(closeness(disconnected, { mode: "graph", rescale: true })).toEqual([0.5, 0.5, 0]);
  });
});

describe("reachability and path summary", () => {
  it("computes reachable actor counts for a disconnected graph", () => {
    const disconnected = [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ];

    expect(reachability(disconnected, { mode: "graph" })).toEqual({
      matrix: [
        [0, 1, 0],
        [1, 0, 0],
        [0, 0, 0],
      ],
      counts: [1, 1, 0],
    });
  });

  it("computes mean finite non-loop path length", () => {
    const path = [
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, 0],
    ];

    expect(averagePathLength(path, { mode: "digraph" })).toBeCloseTo(4 / 3, 12);
    expect(snaR.averagePathLength(path, { mode: "digraph" })).toBeCloseTo(4 / 3, 12);
  });
});

describe("community detection", () => {
  it("finds deterministic label-propagation communities", () => {
    const twoCliques = [
      [0, 2, 2, 0, 0, 0],
      [2, 0, 2, 0, 0, 0],
      [2, 2, 0, 0, 0, 0],
      [0, 0, 0, 0, 2, 2],
      [0, 0, 0, 2, 0, 2],
      [0, 0, 0, 2, 2, 0],
    ];

    const result = labelPropagation(twoCliques, { mode: "graph" });
    expect(result.count).toBe(2);
    expect(result.labels).toEqual([0, 0, 0, 1, 1, 1]);
    expect(result.sizes).toEqual([3, 3]);
  });

  it("keeps isolates as singleton communities", () => {
    const isolatesAndDyad = [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 0],
    ];

    expect(labelPropagation(isolatesAndDyad, { mode: "graph" })).toMatchObject({
      labels: [0, 0, 1],
      sizes: [2, 1],
      count: 2,
    });
  });

  it("uses weighted social ties by default", () => {
    const weightedBridge = [
      [0, 5, 1],
      [5, 0, 1],
      [1, 1, 0],
    ];

    expect(labelPropagation(weightedBridge, { mode: "graph" }).labels).toEqual([0, 0, 0]);
    expect(snaR.labelPropagation(weightedBridge, { mode: "graph" }).count).toBe(1);
  });
});

describe("geodist", () => {
  it("computes directed shortest-path distances and path counts", () => {
    const result = geodist(
      [
        [0, 1, 0],
        [0, 0, 1],
        [0, 0, 0],
      ],
      { mode: "digraph" },
    );

    expect(result.distances).toEqual([
      [0, 1, 2],
      [Number.POSITIVE_INFINITY, 0, 1],
      [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 0],
    ]);
    expect(result.counts).toEqual([
      [1, 1, 1],
      [0, 1, 1],
      [0, 0, 1],
    ]);
  });
});

describe("reciprocity", () => {
  it("computes R sna-compatible edgewise and dyadic reciprocity", () => {
    const path = [
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, 0],
    ];
    const reciprocalPair = [
      [0, 1, 0],
      [1, 0, 1],
      [0, 0, 0],
    ];

    expect(grecip(path, { measure: "edgewise" })).toBe(0);
    expect(grecip(path, { measure: "dyadic" })).toBeCloseTo(1 / 3, 12);
    expect(grecip(path, { measure: "dyadic.nonnull" })).toBe(0);
    expect(grecip(reciprocalPair, { measure: "edgewise" })).toBeCloseTo(2 / 3, 12);
    expect(grecip(reciprocalPair, { measure: "dyadic.nonnull" })).toBeCloseTo(1 / 2, 12);
  });

  it("computes correlation reciprocity over non-loop directed weights", () => {
    const path = [
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, 0],
    ];
    const asymmetricWeights = [
      [0, 2],
      [3, 0],
    ];

    expect(grecip(path, { measure: "correlation" })).toBeCloseTo(-0.5, 12);
    expect(grecip(asymmetricWeights, { measure: "correlation" })).toBe(1);
    expect(grecip(asymmetricWeights, { measure: "correlation", ignoreEval: false })).toBe(0);
  });

  it("exposes grecip through the R-compatible helper map", () => {
    expect(snaR.grecip([[0, 1], [1, 0]], { measure: "edgewise" })).toBe(1);
    expect(snaR.betweenness([[0, 1], [1, 0]], { mode: "graph", cmode: "undirected" })).toEqual([0, 0]);
    expect(snaR.closeness([[0, 1], [1, 0]], { mode: "graph" })).toEqual([1, 1]);
    expect(snaR.reachability([[0, 1], [1, 0]], { mode: "graph" }).counts).toEqual([1, 1]);
  });
});

describe("components", () => {
  it("finds weak connectivity in a directed path", () => {
    const result = components(
      [
        [0, 1, 0],
        [0, 0, 1],
        [0, 0, 0],
      ],
      { mode: "digraph", connected: "weak" },
    );
    expect(result.count).toBe(1);
    expect(result.sizes).toEqual([3]);
  });

  it("finds strong components in a directed path", () => {
    const result = components(
      [
        [0, 1, 0],
        [0, 0, 1],
        [0, 0, 0],
      ],
      { mode: "digraph", connected: "strong" },
    );
    expect(result.count).toBe(3);
    expect([...result.sizes].sort()).toEqual([1, 1, 1]);
  });
});

describe("R parity fixtures", () => {
  const path = [
    [0, 1, 0],
    [0, 0, 1],
    [0, 0, 0],
  ];
  const triangle = [
    [0, 1, 1],
    [1, 0, 1],
    [1, 1, 0],
  ];

  it("matches sna::gden, sna::degree, and sna::geodist on the directed path fixture", () => {
    expect(gden(path, { mode: "digraph" })).toBeCloseTo(rSnapshots.directedPath3.gden, 12);
    expect(degree(path, { mode: "digraph", cmode: "outdegree" })).toEqual(rSnapshots.directedPath3.degreeOut);
    expect(degree(path, { mode: "digraph", cmode: "indegree" })).toEqual(rSnapshots.directedPath3.degreeIn);
    expect(degree(path, { mode: "digraph", cmode: "total" })).toEqual(rSnapshots.directedPath3.degreeTotal);

    const result = geodist(path, { mode: "digraph" });
    expect(result.distances).toEqual(hydrateDistances(rSnapshots.directedPath3.geodist));
    expect(result.counts).toEqual(rSnapshots.directedPath3.geodistCounts);
    expect(betweenness(path, { mode: "digraph", cmode: "directed", rescale: false })).toEqual(rSnapshots.directedPath3.betweenness);
    expect(closeness(path, { mode: "digraph" })).toEqual(rSnapshots.directedPath3.closeness);
    expect(reachability(path, { mode: "digraph" }).counts).toEqual(rSnapshots.directedPath3.reachable);
    expect(averagePathLength(path, { mode: "digraph" })).toBeCloseTo(rSnapshots.directedPath3.averagePathLength, 12);

    expect(grecip(path, { measure: "edgewise" })).toBeCloseTo(rSnapshots.directedPath3.grecipEdgewise, 12);
    expect(grecip(path, { measure: "dyadic" })).toBeCloseTo(rSnapshots.directedPath3.grecipDyadic, 12);
    expect(grecip(path, { measure: "dyadic.nonnull" })).toBeCloseTo(rSnapshots.directedPath3.grecipDyadicNonnull, 12);
    expect(grecip(path, { measure: "correlation" })).toBeCloseTo(rSnapshots.directedPath3.grecipCorrelation, 12);
  });

  it("matches sna graph-mode density and degree on the undirected triangle fixture", () => {
    expect(nties(triangle, { mode: "graph" })).toBe(rSnapshots.triangle3.nties);
    expect(gden(triangle, { mode: "graph" })).toBeCloseTo(rSnapshots.triangle3.gden, 12);
    expect(degree(triangle, { mode: "graph", cmode: "total" })).toEqual(rSnapshots.triangle3.degree);
    expect(betweenness(triangle, { mode: "graph", cmode: "undirected", rescale: false })).toEqual(rSnapshots.triangle3.betweenness);
    expect(closeness(triangle, { mode: "graph" })).toEqual(rSnapshots.triangle3.closeness);
    expect(reachability(triangle, { mode: "graph" }).counts).toEqual(rSnapshots.triangle3.reachable);
    expect(averagePathLength(triangle, { mode: "graph" })).toBeCloseTo(rSnapshots.triangle3.averagePathLength, 12);
    expect(labelPropagation(triangle, { mode: "graph" }).labels).toEqual(rSnapshots.triangle3.communityLabels);
    expect(grecip(triangle, { measure: "edgewise" })).toBeCloseTo(rSnapshots.triangle3.grecipEdgewise, 12);
    expect(grecip(triangle, { measure: "dyadic" })).toBeCloseTo(rSnapshots.triangle3.grecipDyadic, 12);
    expect(grecip(triangle, { measure: "dyadic.nonnull" })).toBeCloseTo(rSnapshots.triangle3.grecipDyadicNonnull, 12);
    expect(grecip(triangle, { measure: "correlation" })).toBeCloseTo(rSnapshots.triangle3.grecipCorrelation, 12);
  });
});
