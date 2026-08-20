import { describe, expect, it } from "vitest";
import {
  workedExampleB,
  workedExampleFusedDegrees,
  workedExampleFusion,
  workedExampleLabels,
  workedExampleNormalizedB,
  workedExampleNormalizedS,
  workedExampleNormalizedW,
  workedExampleS,
  workedExampleW
} from "../__fixtures__/worked-example";
import {
  buildSenaFusionAdjacency,
  senaDirectedOutDegreeLaplacianDiagnostics,
  senaEpsilonRegularizedRandomWalkLaplacian,
  findSenaIsolatedVertices,
  normalizeSenaMatrix,
  senaCombinatorialLaplacian,
  senaCommuteTimeEmbeddingDiagnostics,
  senaDegreeVector,
  senaOutDegreeRandomWalkDiagnostics,
  senaSchoenbergMdsDiagnostics,
  senaShortestPathDissimilarity,
  senaSymmetricEigenDecomposition,
  senaSymmetricEigenvalues,
  senaZeroInverseNormalizedLaplacian,
  type SenaFusionAdjacencyInput
} from "../operators";

function expectMatrixClose(actual: number[][], expected: number[][], precision = 12) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((row, rowIndex) => {
    expect(actual[rowIndex]).toHaveLength(row.length);
    row.forEach((expectedValue, columnIndex) => {
      expect(actual[rowIndex][columnIndex]).toBeCloseTo(expectedValue, precision);
    });
  });
}

function buildWorkedExampleFusionWithUnusedC4() {
  return buildSenaFusionAdjacency({
    S: workedExampleNormalizedS,
    W: [
      ...workedExampleNormalizedW.map((row) => [...row, 0]),
      [0, 0, 0, 0]
    ],
    B: workedExampleNormalizedB.map((row) => [...row, 0]),
    alpha: 1,
    beta: 1,
    gamma: 1
  });
}

const directedPlanCounterexample = [
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1],
  [0, 0, 1, 0, 1],
  [1, 1, 0, 1, 0]
];

describe("SENA worked-example golden operators", () => {
  it("T1 builds the exact A_fusion block adjacency from normalized S, W, and B", () => {
    const fusion = buildSenaFusionAdjacency({
      S: workedExampleNormalizedS,
      W: workedExampleNormalizedW,
      B: workedExampleNormalizedB,
      alpha: 1,
      beta: 1,
      gamma: 1
    });

    expectMatrixClose(fusion, workedExampleFusion);
  });

  it("T1b supports an explicit directed B_CP block instead of silently reusing B_PC transpose", () => {
    const fusion = buildSenaFusionAdjacency({
      S: [[0]],
      W: [[0, 0], [0, 0]],
      B: [[0.25, 0.5]],
      Bcp: [[0.75], [1]],
      alpha: 1,
      beta: 1,
      gamma: 2
    });

    expectMatrixClose(fusion, [
      [0, 0.5, 1],
      [1.5, 0, 0],
      [2, 0, 0]
    ]);
  });

  it.each([
    ["S", { S: [[0, 1]], W: [[0]], B: [[1]], alpha: 1, beta: 1, gamma: 1 }],
    ["W", { S: [[0]], W: [[0, 1]], B: [[1]], alpha: 1, beta: 1, gamma: 1 }],
    ["B rows", { S: [[0]], W: [[0]], B: [], alpha: 1, beta: 1, gamma: 1 }],
    ["B columns", { S: [[0]], W: [[0]], B: [[1, 2]], alpha: 1, beta: 1, gamma: 1 }],
    ["B_CP rows", { S: [[0]], W: [[0]], B: [[1]], Bcp: [], alpha: 1, beta: 1, gamma: 1 }],
    ["B_CP columns", { S: [[0]], W: [[0]], B: [[1]], Bcp: [[1, 2]], alpha: 1, beta: 1, gamma: 1 }]
  ] satisfies Array<[string, SenaFusionAdjacencyInput]>) (
    "rejects malformed %s dimensions instead of silently filling missing cells",
    (_, input) => {
      expect(() => buildSenaFusionAdjacency(input)).toThrow(/SENA fusion adjacency requires/);
    }
  );

  it.each([
    ["negative S", { S: [[-1]], W: [[0]], B: [[0]], alpha: 1, beta: 1, gamma: 1 }],
    ["NaN W", { S: [[0]], W: [[Number.NaN]], B: [[0]], alpha: 1, beta: 1, gamma: 1 }],
    ["negative B_PC", { S: [[0]], W: [[0]], B: [[-1]], alpha: 1, beta: 1, gamma: 1 }],
    ["NaN B_CP", { S: [[0]], W: [[0]], B: [[0]], Bcp: [[Number.NaN]], alpha: 1, beta: 1, gamma: 1 }],
    ["negative alpha", { S: [[0]], W: [[0]], B: [[0]], alpha: -1, beta: 1, gamma: 1 }],
    ["infinite gamma", { S: [[0]], W: [[0]], B: [[0]], alpha: 1, beta: 1, gamma: Number.POSITIVE_INFINITY }]
  ] satisfies Array<[string, SenaFusionAdjacencyInput]>) (
    "rejects %s at the exported fusion kernel boundary",
    (_, input) => {
      expect(() => buildSenaFusionAdjacency(input)).toThrow(/finite and nonnegative/);
    }
  );

  it("T2 computes the worked-example typed fused degree vector", () => {
    senaDegreeVector(workedExampleFusion).forEach((degree, index) => {
      expect(degree).toBeCloseTo(workedExampleFusedDegrees[index], 12);
    });
  });

  it("T4 retains P3 as non-isolated in the fused graph", () => {
    const isolated = findSenaIsolatedVertices(workedExampleFusion, [...workedExampleLabels]);

    expect(workedExampleS[2].reduce((total, value) => total + value, 0)).toBe(1);
    expect(senaDegreeVector(workedExampleFusion)[2]).toBeCloseTo(1.25, 12);
    expect(isolated.map((node) => node.label)).not.toContain("P3");
  });

  it("T3 computes the worked-example combinatorial Laplacian spectrum", () => {
    const eigenvalues = senaSymmetricEigenvalues(senaCombinatorialLaplacian(workedExampleFusion));

    expect(eigenvalues.map((value) => Number(value.toFixed(2)))).toEqual([0, 0.88, 1.88, 2.61, 3.31, 3.81]);
    expect(eigenvalues.filter((value) => Math.abs(value) <= 1e-9)).toHaveLength(1);
    expect(Math.min(...eigenvalues)).toBeGreaterThanOrEqual(-1e-9);
  });

  it("T5 retains an unused c4 code as an isolated vertex with a second zero eigenvalue", () => {
    const fusionWithC4 = buildWorkedExampleFusionWithUnusedC4();
    const labels = [...workedExampleLabels, "c4"];
    const eigenvalues = senaSymmetricEigenvalues(senaCombinatorialLaplacian(fusionWithC4));

    expect(senaDegreeVector(fusionWithC4)[6]).toBe(0);
    expect(findSenaIsolatedVertices(fusionWithC4, labels)).toEqual([{ index: 6, label: "c4", degree: 0 }]);
    expect(eigenvalues.filter((value) => Math.abs(value) <= 1e-9)).toHaveLength(2);
    expect(Math.min(...eigenvalues)).toBeGreaterThanOrEqual(-1e-9);
  });

  it("T6 keeps zero-inverse normalized Laplacian eigenvalues inside [0, 2] on the c4 fixture", () => {
    const fusionWithC4 = buildWorkedExampleFusionWithUnusedC4();
    const normalizedLaplacian = senaZeroInverseNormalizedLaplacian(fusionWithC4);
    const eigenvalues = senaSymmetricEigenvalues(normalizedLaplacian);

    expect(normalizedLaplacian[6][6]).toBe(1);
    normalizedLaplacian[6].forEach((value, columnIndex) => {
      expect(value).toBe(columnIndex === 6 ? 1 : 0);
    });
    eigenvalues.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(-1e-9);
      expect(value).toBeLessThanOrEqual(2 + 1e-9);
    });
  });

  it("T7 makes the epsilon random-walk Laplacian row at c4 tend to the identity row", () => {
    const fusionWithC4 = buildWorkedExampleFusionWithUnusedC4();

    [1e-1, 1e-6, 1e-12].forEach((epsilon) => {
      const laplacian = senaEpsilonRegularizedRandomWalkLaplacian(fusionWithC4, epsilon);

      laplacian[6].forEach((value, columnIndex) => {
        expect(value).toBe(columnIndex === 6 ? 1 : 0);
      });
    });
  });

  it("T8 exposes the directed counterexample where sym(D_out - A_dir) has a negative eigenvalue", () => {
    const diagnostics = senaDirectedOutDegreeLaplacianDiagnostics(directedPlanCounterexample);

    expect(diagnostics.direction).toBe("directed");
    expect(diagnostics.minSymmetrizedEigenvalue).toBeCloseTo(-0.218, 3);
    expect(diagnostics.minSymmetrizedEigenvalue).toBeLessThan(0);
    expect(diagnostics.undirectedSpectralTheoremsApply).toBe(false);
    expect(diagnostics.warnings.join(" ")).toContain("undirected Laplacian PSD theorems do not apply");
  });

  it("T9 keeps P = D_out^-1 A row-stochastic on V+ with max eigenvalue modulus bounded by 1", () => {
    const diagnostics = senaOutDegreeRandomWalkDiagnostics(directedPlanCounterexample);

    expect(diagnostics.positiveRows).toEqual([2, 3, 4]);
    expect(diagnostics.zeroOutDegreeRows).toEqual([0, 1]);
    diagnostics.positiveRows.forEach((rowIndex) => {
      expect(diagnostics.rowSums[rowIndex]).toBeCloseTo(1, 12);
    });
    diagnostics.zeroOutDegreeRows.forEach((rowIndex) => {
      expect(diagnostics.rowSums[rowIndex]).toBe(0);
    });
    expect(diagnostics.rowStochasticOnPositiveRows).toBe(true);
    expect(diagnostics.eigenvalueModulusUpperBound).toBeLessThanOrEqual(1 + 1e-12);
    expect(diagnostics.maxEigenvalueModulusBounded).toBe(true);
  });

  it("T14 records admissible max and frobenius normalization divisors", () => {
    const max = normalizeSenaMatrix(workedExampleS, "max");
    const frobenius = normalizeSenaMatrix(workedExampleS, "frobenius");

    expect(max.divisor).toBe(4);
    expect(max.values[1][2]).toBe(0.25);
    expect(max.admissible).toBe(true);
    expect(frobenius.divisor).toBeCloseTo(Math.sqrt(34), 12);
    expect(frobenius.admissible).toBe(true);
  });

  it("T15 preserves A_raw under max scale compensation and flags log1p scaling as non-invariant", () => {
    const scaledS = workedExampleS.map((row) => row.map((value) => value * 5));
    const normalizedScaledS = normalizeSenaMatrix(scaledS, "max");
    const log1p = normalizeSenaMatrix(scaledS, "log1p-max");
    const fusion = buildSenaFusionAdjacency({
      S: normalizedScaledS.values,
      W: workedExampleNormalizedW,
      B: workedExampleNormalizedB,
      alpha: 1,
      beta: 1,
      gamma: 1
    });

    expectMatrixClose(fusion, workedExampleFusion);
    expect(normalizedScaledS.scaleInvariant).toBe(true);
    expect(log1p.scaleInvariant).toBe(false);
  });

  it("T10 flags the worked-example shortest-path dissimilarities as non-Euclidean for rank-2 MDS", () => {
    const delta = senaShortestPathDissimilarity(workedExampleFusion);
    const diagnostics = senaSchoenbergMdsDiagnostics(delta, { dimensions: 2 });

    expect(delta[0][3]).toBeCloseTo(1.5, 12);
    expect(delta[1][2]).toBeCloseTo(4, 12);
    expect(delta[0][2]).toBeCloseTo(5, 12);
    expect(diagnostics.delta).toBe("shortest-path-reciprocal-weight");
    expect(diagnostics.metricExact).toBe(false);
    expect(diagnostics.minCenteredGramEigenvalue).toBeCloseTo(-1.6368, 3);
    expect(diagnostics.rank).toBe(2);
    expect(diagnostics.maxDistortion).toBeCloseTo(0.7181, 3);
    expect(diagnostics.stress).toBeCloseTo(0.1038, 3);
  });

  it("marks a dimension-truncated Euclidean embedding approximate", () => {
    const euclideanTriangle = [
      [0, 1, Math.SQRT2],
      [1, 0, 1],
      [Math.SQRT2, 1, 0]
    ];
    const oneDimension = senaSchoenbergMdsDiagnostics(euclideanTriangle, { dimensions: 1 });
    const twoDimensions = senaSchoenbergMdsDiagnostics(euclideanTriangle, { dimensions: 2 });

    expect(oneDimension.minCenteredGramEigenvalue).toBeGreaterThanOrEqual(-1e-9);
    expect(oneDimension.maxDistortion).toBeGreaterThan(1e-3);
    expect(oneDimension.metricExact).toBe(false);
    expect(oneDimension.warnings.join(" ")).toContain("dimensions");
    expect(twoDimensions.metricExact).toBe(true);
    expect(twoDimensions.maxDistortion).toBeLessThan(1e-9);
  });

  it("T11 computes commute-time coordinates whose pairwise squared distances match commute times for u != v", () => {
    const diagnostics = senaCommuteTimeEmbeddingDiagnostics(workedExampleFusion);

    expect(diagnostics.operator).toBe("commute-time");
    expect(diagnostics.volume).toBeCloseTo(12.5, 12);
    expect(diagnostics.maxPairwiseError).toBeLessThan(1e-9);
    expect(diagnostics.checkedPairs).toBe(15);
    expect(diagnostics.excludedSelfPairs).toBe(6);
    expect(diagnostics.metricExact).toBe(true);
  });
});

describe("SENA eigensolver convergence invariants", () => {
  function mulberry32(seed: number) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomSymmetricMatrix(n: number, seed: number) {
    const random = mulberry32(seed);
    const matrix = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
    for (let i = 0; i < n; i += 1) {
      for (let j = i; j < n; j += 1) {
        const value = random() * 4 - 2;
        matrix[i][j] = value;
        matrix[j][i] = value;
      }
    }
    return matrix;
  }

  function randomConnectedAdjacency(n: number, seed: number) {
    const random = mulberry32(seed);
    const matrix = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const weight = 0.5 + random();
      matrix[i][j] += weight;
      matrix[j][i] += weight;
    }
    for (let extra = 0; extra < n * 2; extra += 1) {
      const i = Math.floor(random() * n);
      const j = Math.floor(random() * n);
      if (i === j) continue;
      const weight = random();
      matrix[i][j] += weight;
      matrix[j][i] += weight;
    }
    return matrix;
  }

  it.each([30, 60])("resolves eigenpairs of a dense symmetric n=%i matrix to residual precision", (n) => {
    const matrix = randomSymmetricMatrix(n, 20260709 + n);
    const decomposition = senaSymmetricEigenDecomposition(matrix);

    const trace = matrix.reduce((total, row, index) => total + row[index], 0);
    const eigenSum = decomposition.values.reduce((total, value) => total + value, 0);
    expect(eigenSum).toBeCloseTo(trace, 8);

    for (const column of [0, Math.floor(n / 2), n - 1]) {
      const vector = decomposition.vectors.map((row) => row[column]);
      const lambda = decomposition.values[column];
      for (let i = 0; i < n; i += 1) {
        const av = matrix[i].reduce((total, value, j) => total + value * vector[j], 0);
        expect(Math.abs(av - lambda * vector[i])).toBeLessThan(1e-8);
      }
    }
  });

  it.each([30, 60])("recovers exactly one zero Laplacian eigenvalue for a connected n=%i graph", (n) => {
    const adjacency = randomConnectedAdjacency(n, 8_675_309 + n);
    const laplacian = senaCombinatorialLaplacian(adjacency);
    const eigenvalues = senaSymmetricEigenvalues(laplacian);
    const zeroCount = eigenvalues.filter((value) => Math.abs(value) <= 1e-9).length;

    expect(zeroCount).toBe(1);
    expect(Math.min(...eigenvalues)).toBeGreaterThanOrEqual(-1e-9);
  });

  it("rejects asymmetric input instead of silently symmetrizing", () => {
    const asymmetric = [
      [0, 2, 0],
      [0, 0, 1],
      [1, 0, 0]
    ];
    expect(() => senaSymmetricEigenDecomposition(asymmetric)).toThrow(/requires a symmetric matrix/);
  });
});
