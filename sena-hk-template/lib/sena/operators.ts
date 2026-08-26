import type { SenaNormalization } from "./types";
import { validateSenaFusionAdjacencyInputs } from "./analytical-input-validation";

export type SenaAdmissibleNormalization = Extract<SenaNormalization, "max" | "frobenius" | "log1p-max">;

export type SenaNormalizationResult = {
  rule: SenaNormalization;
  values: number[][];
  divisor: number;
  admissible: boolean;
  scaleInvariant: boolean;
  warnings: string[];
};

export type SenaFusionAdjacencyInput = {
  S: number[][];
  W: number[][];
  B: number[][];
  Bcp?: number[][];
  alpha: number;
  beta: number;
  gamma: number;
};

export type SenaIsolatedVertex = {
  index: number;
  label: string;
  degree: number;
};

export type SenaSymmetricEigenDecomposition = {
  values: number[];
  vectors: number[][];
};

export type SenaSchoenbergMdsOptions = {
  dimensions: number;
  tolerance?: number;
};

export type SenaSchoenbergMdsDiagnostics = {
  delta: "shortest-path-reciprocal-weight";
  dimensions: number;
  rank: number;
  metricExact: boolean;
  minCenteredGramEigenvalue: number;
  eigenvalues: number[];
  coordinates: number[][];
  stress: number;
  maxDistortion: number;
  warnings: string[];
};

export type SenaLaplacianEigenmapDiagnostics = {
  operator: "laplacian-eigenmaps";
  laplacian: "combinatorial";
  dimensions: number;
  coordinates: number[][];
  eigenvalues: number[];
  zeroEigenvalueCount: number;
  metricExact: false;
  warnings: string[];
};

export type SenaCommuteTimeEmbeddingDiagnostics = {
  operator: "commute-time";
  volume: number;
  coordinates: number[][];
  commuteTimes: number[][];
  squaredDistances: number[][];
  eigenvalues: number[];
  metricExact: boolean;
  maxPairwiseError: number;
  checkedPairs: number;
  excludedSelfPairs: number;
};

export type SenaDirectedOutDegreeLaplacianDiagnostics = {
  operator: "directed-out-degree-laplacian";
  direction: "directed";
  laplacian: number[][];
  symmetrized: number[][];
  eigenvaluesOfSymmetrized: number[];
  minSymmetrizedEigenvalue: number;
  asymmetry: number;
  undirectedSpectralTheoremsApply: boolean;
  warnings: string[];
};

export type SenaOutDegreeRandomWalkDiagnostics = {
  operator: "out-degree-random-walk";
  convention: "restrict_v_plus";
  transition: number[][];
  outDegrees: number[];
  positiveRows: number[];
  zeroOutDegreeRows: number[];
  rowSums: number[];
  rowStochasticOnPositiveRows: boolean;
  eigenvalueModulusUpperBound: number;
  maxEigenvalueModulusBounded: boolean;
  warnings: string[];
};

export type SenaAttributionOperatorDiagnostics = {
  estimator: "x-transpose-diag-y-x";
  codeCooccurrence: number[][];
  participantWeightedCooccurrence: number[][];
  rawSlices: number[][][];
  rawSum: number[][];
  windowNormalizedSlices: number[][][];
  windowNormalizedSum: number[][];
  personNormalizedSlices: number[][][];
  participationCountsByWindow: number[];
  participationTotalsByPerson: number[];
  zeroParticipationRows: number[];
  sliceMinEigenvalues: number[];
  rawSlicesPsd: boolean;
  rawSumMatchesParticipantWeightedCooccurrence: boolean;
  windowNormalizedOffDiagonalMatchesCodeCooccurrence: boolean;
  personNormalizedWithinBounds: boolean;
  minPersonNormalizedValue: number;
  maxPersonNormalizedValue: number;
};

export const SENA_ADMISSIBLE_NORMALIZATIONS: readonly SenaAdmissibleNormalization[] = [
  "max",
  "frobenius",
  "log1p-max"
] as const;

export const SENA_GRAPH_OPERATOR_CONVENTIONS = {
  self_loops: "diagonal-zero-no-self-loops",
  zero_degree: "retain-I0; restrict_v_plus, zero_inverse, epsilon_regularized documented",
  directed: "directed row-sum with out-degree random-walk diagnostics unless symmetrization is declared"
} as const;

function cloneMatrix(matrix: number[][]) {
  return matrix.map((row) => [...row]);
}

function matrixMax(matrix: number[][]) {
  return matrix.reduce((max, row) => Math.max(max, ...row.map((value) => Math.abs(value))), 0);
}

function matrixFrobenius(matrix: number[][]) {
  return Math.sqrt(matrix.reduce((total, row) => (
    total + row.reduce((rowTotal, value) => rowTotal + value * value, 0)
  ), 0));
}

function zeroLike(matrix: number[][]) {
  return matrix.map((row) => row.map(() => 0));
}

function zeroSquareMatrix(size: number) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
}

function sumMatrices(matrices: number[][][]) {
  const size = matrices[0]?.length ?? 0;
  const total = zeroSquareMatrix(size);
  matrices.forEach((matrix) => {
    matrix.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        total[rowIndex][columnIndex] += value;
      });
    });
  });
  return total;
}

function addWeightedOuterProduct(target: number[][], vector: number[], weight: number) {
  if (weight === 0) return;
  vector.forEach((left, rowIndex) => {
    vector.forEach((right, columnIndex) => {
      target[rowIndex][columnIndex] += weight * left * right;
    });
  });
}

function maxAbsMatrixDifference(left: number[][], right: number[][], diagonal: "include" | "exclude" = "include") {
  let maxDifference = 0;
  left.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (diagonal === "exclude" && rowIndex === columnIndex) return;
      maxDifference = Math.max(maxDifference, Math.abs(value - (right[rowIndex]?.[columnIndex] ?? 0)));
    });
  });
  return maxDifference;
}

function attributionSlicesFromWeights(codeActivityByWindow: number[][], participationWeights: number[][]) {
  const codeCount = codeActivityByWindow[0]?.length ?? 0;
  return participationWeights.map((personWeights) => {
    const slice = zeroSquareMatrix(codeCount);
    codeActivityByWindow.forEach((codeActivity, windowIndex) => {
      addWeightedOuterProduct(slice, codeActivity, personWeights[windowIndex] ?? 0);
    });
    return slice;
  });
}

function weightedCodeCooccurrence(codeActivityByWindow: number[][], weightsByWindow: number[]) {
  const codeCount = codeActivityByWindow[0]?.length ?? 0;
  const matrix = zeroSquareMatrix(codeCount);
  codeActivityByWindow.forEach((codeActivity, windowIndex) => {
    addWeightedOuterProduct(matrix, codeActivity, weightsByWindow[windowIndex] ?? 0);
  });
  return matrix;
}

function normalizeParticipationByWindow(participation: number[][], totalsByWindow: number[], tolerance: number) {
  return participation.map((row) => row.map((value, windowIndex) => {
    const total = totalsByWindow[windowIndex] ?? 0;
    return total > tolerance ? value / total : 0;
  }));
}

function normalizeParticipationByPerson(participation: number[][], totalsByPerson: number[], tolerance: number) {
  return participation.map((row, rowIndex) => {
    const total = totalsByPerson[rowIndex] ?? 0;
    return total > tolerance ? row.map((value) => value / total) : row.map(() => 0);
  });
}

function maxWindowProducts(codeActivityByWindow: number[][]) {
  const codeCount = codeActivityByWindow[0]?.length ?? 0;
  const bounds = zeroSquareMatrix(codeCount);
  codeActivityByWindow.forEach((codeActivity) => {
    codeActivity.forEach((left, rowIndex) => {
      codeActivity.forEach((right, columnIndex) => {
        bounds[rowIndex][columnIndex] = Math.max(bounds[rowIndex][columnIndex], left * right);
      });
    });
  });
  return bounds;
}

export function normalizeSenaMatrix(matrix: number[][], rule: SenaNormalization): SenaNormalizationResult {
  if (rule === "none") {
    return {
      rule,
      values: cloneMatrix(matrix),
      divisor: 1,
      admissible: false,
      scaleInvariant: false,
      warnings: ["Raw-weight normalization is exploratory and is not an admissible SENA normalization rule."]
    };
  }

  const canonicalRule = rule === "log-max" ? "log1p-max" : rule;
  const transformed = canonicalRule === "log1p-max"
    ? matrix.map((row) => row.map((value) => Math.log1p(value)))
    : cloneMatrix(matrix);
  const divisor = canonicalRule === "frobenius" ? matrixFrobenius(transformed) : matrixMax(transformed);
  const values = divisor === 0 ? zeroLike(transformed) : transformed.map((row) => row.map((value) => value / divisor));

  return {
    rule,
    values,
    divisor,
    admissible: true,
    scaleInvariant: canonicalRule !== "log1p-max",
    warnings: canonicalRule === "log1p-max"
      ? ["log1p-max is admissible for bounded display scaling but is not scale invariant."]
      : []
  };
}

export function buildSenaFusionAdjacency({ S, W, B, Bcp, alpha, beta, gamma }: SenaFusionAdjacencyInput) {
  validateSenaFusionAdjacencyInputs({ S, W, B, Bcp, alpha, beta, gamma });
  const peopleCount = S.length;
  const codeCount = W.length;
  const fusion = Array.from({ length: peopleCount + codeCount }, () => (
    Array.from({ length: peopleCount + codeCount }, () => 0)
  ));

  for (let i = 0; i < peopleCount; i += 1) {
    for (let j = 0; j < peopleCount; j += 1) {
      fusion[i][j] = alpha * (S[i]?.[j] ?? 0);
    }
  }

  for (let i = 0; i < peopleCount; i += 1) {
    for (let a = 0; a < codeCount; a += 1) {
      fusion[i][peopleCount + a] = gamma * (B[i]?.[a] ?? 0);
      fusion[peopleCount + a][i] = gamma * (Bcp?.[a]?.[i] ?? B[i]?.[a] ?? 0);
    }
  }

  for (let a = 0; a < codeCount; a += 1) {
    for (let b = 0; b < codeCount; b += 1) {
      fusion[peopleCount + a][peopleCount + b] = beta * (W[a]?.[b] ?? 0);
    }
  }

  return fusion;
}

export function senaDegreeVector(matrix: number[][]) {
  return matrix.map((row) => row.reduce((total, value) => total + value, 0));
}

export function findSenaIsolatedVertices(matrix: number[][], labels: string[], tolerance = 1e-12): SenaIsolatedVertex[] {
  return senaDegreeVector(matrix)
    .map((degree, index) => ({ index, label: labels[index] ?? String(index), degree }))
    .filter((node) => Math.abs(node.degree) <= tolerance);
}

export function senaCombinatorialLaplacian(matrix: number[][]) {
  const degrees = senaDegreeVector(matrix);
  return matrix.map((row, rowIndex) => row.map((value, columnIndex) => (
    rowIndex === columnIndex ? degrees[rowIndex] - value : -value
  )));
}

export function senaZeroInverseNormalizedLaplacian(matrix: number[][]) {
  const degrees = senaDegreeVector(matrix);
  const inverseSqrtDegrees = degrees.map((degree) => (degree > 0 ? 1 / Math.sqrt(degree) : 0));

  return matrix.map((row, rowIndex) => row.map((value, columnIndex) => (
    (rowIndex === columnIndex ? 1 : 0)
    - inverseSqrtDegrees[rowIndex] * value * inverseSqrtDegrees[columnIndex]
  )));
}

export function senaEpsilonRegularizedRandomWalkLaplacian(matrix: number[][], epsilon: number) {
  if (!Number.isFinite(epsilon) || epsilon <= 0) {
    throw new Error("SENA epsilon-regularized random-walk Laplacian requires epsilon > 0.");
  }

  const outDegrees = senaDegreeVector(matrix);
  return matrix.map((row, rowIndex) => row.map((value, columnIndex) => (
    (rowIndex === columnIndex ? 1 : 0) - value / (outDegrees[rowIndex] + epsilon)
  )));
}

export function senaOutDegreeLaplacian(matrix: number[][]) {
  const outDegrees = senaDegreeVector(matrix);
  return matrix.map((row, rowIndex) => row.map((value, columnIndex) => (
    rowIndex === columnIndex ? outDegrees[rowIndex] - value : -value
  )));
}

export function senaSymmetrizeMatrix(matrix: number[][]) {
  return matrix.map((row, rowIndex) => row.map((value, columnIndex) => (
    (value + (matrix[columnIndex]?.[rowIndex] ?? 0)) / 2
  )));
}

function maxMatrixAsymmetry(matrix: number[][]) {
  return matrix.reduce((max, row, rowIndex) => (
    Math.max(max, ...row.map((value, columnIndex) => Math.abs(value - (matrix[columnIndex]?.[rowIndex] ?? 0))))
  ), 0);
}

export function senaMatrixAsymmetry(matrix: number[][]) {
  return maxMatrixAsymmetry(matrix);
}

export type SenaDeclaredSpectralSymmetrization = {
  asymmetry: number;
  symmetrized: boolean;
  symmetrization: "none" | "declared-sym(A)=(A+At)/2";
  values: number[][];
};

export function senaDeclaredSpectralSymmetrization(
  matrix: number[][],
  tolerance = 1e-12
): SenaDeclaredSpectralSymmetrization {
  const asymmetry = maxMatrixAsymmetry(matrix);
  const symmetrized = asymmetry > Math.max(tolerance, 1e-9 * Math.max(1, matrixMax(matrix)));

  return {
    asymmetry,
    symmetrized,
    symmetrization: symmetrized ? "declared-sym(A)=(A+At)/2" : "none",
    values: symmetrized ? senaSymmetrizeMatrix(matrix) : matrix
  };
}

export function senaDirectedOutDegreeLaplacianDiagnostics(
  matrix: number[][],
  tolerance = 1e-9
): SenaDirectedOutDegreeLaplacianDiagnostics {
  const laplacian = senaOutDegreeLaplacian(matrix);
  const symmetrized = senaSymmetrizeMatrix(laplacian);
  const eigenvaluesOfSymmetrized = senaSymmetricEigenvalues(symmetrized);
  const minSymmetrizedEigenvalue = Math.min(...eigenvaluesOfSymmetrized);
  const asymmetry = maxMatrixAsymmetry(matrix);
  const undirectedSpectralTheoremsApply = asymmetry <= tolerance;

  return {
    operator: "directed-out-degree-laplacian",
    direction: "directed",
    laplacian,
    symmetrized,
    eigenvaluesOfSymmetrized,
    minSymmetrizedEigenvalue,
    asymmetry,
    undirectedSpectralTheoremsApply,
    warnings: undirectedSpectralTheoremsApply
      ? []
      : ["Directed adjacency is asymmetric; undirected Laplacian PSD theorems do not apply to sym(D_out - A)."]
  };
}

export function senaOutDegreeRandomWalkDiagnostics(
  matrix: number[][],
  tolerance = 1e-12
): SenaOutDegreeRandomWalkDiagnostics {
  const outDegrees = senaDegreeVector(matrix);
  const positiveRows = outDegrees
    .map((degree, index) => ({ degree, index }))
    .filter((row) => row.degree > tolerance)
    .map((row) => row.index);
  const zeroOutDegreeRows = outDegrees
    .map((degree, index) => ({ degree, index }))
    .filter((row) => row.degree <= tolerance)
    .map((row) => row.index);
  const transition = matrix.map((row, rowIndex) => (
    outDegrees[rowIndex] <= tolerance ? row.map(() => 0) : row.map((value) => value / outDegrees[rowIndex])
  ));
  const rowSums = transition.map((row) => row.reduce((total, value) => total + value, 0));
  const rowStochasticOnPositiveRows = positiveRows.every((rowIndex) => (
    Math.abs(rowSums[rowIndex] - 1) <= tolerance
    && transition[rowIndex].every((value) => Number.isFinite(value) && value >= -tolerance)
  ));
  const eigenvalueModulusUpperBound = transition.reduce((max, row) => (
    Math.max(max, row.reduce((total, value) => total + Math.abs(value), 0))
  ), 0);

  return {
    operator: "out-degree-random-walk",
    convention: "restrict_v_plus",
    transition,
    outDegrees,
    positiveRows,
    zeroOutDegreeRows,
    rowSums,
    rowStochasticOnPositiveRows,
    eigenvalueModulusUpperBound,
    maxEigenvalueModulusBounded: eigenvalueModulusUpperBound <= 1 + tolerance,
    warnings: zeroOutDegreeRows.length === 0
      ? []
      : ["Zero-out-degree rows are excluded from the row-stochastic V+ check and retained as zero rows."]
  };
}

export function senaAttributionOperatorDiagnostics(
  codeActivityByWindow: number[][],
  participationByPersonWindow: number[][],
  tolerance = 1e-9
): SenaAttributionOperatorDiagnostics {
  const windowCount = codeActivityByWindow.length;
  const codeCount = codeActivityByWindow[0]?.length ?? 0;
  if (participationByPersonWindow.some((row) => row.length !== windowCount)) {
    throw new Error("SENA attribution diagnostics require every Y row to match the X window count.");
  }
  if (codeActivityByWindow.some((row) => row.length !== codeCount)) {
    throw new Error("SENA attribution diagnostics require a rectangular X code-activity matrix.");
  }

  const participationCountsByWindow = Array.from({ length: windowCount }, (_, windowIndex) => (
    participationByPersonWindow.reduce((total, row) => total + (row[windowIndex] ?? 0), 0)
  ));
  const participationTotalsByPerson = participationByPersonWindow.map((row) => row.reduce((total, value) => total + value, 0));
  const zeroParticipationRows = participationTotalsByPerson
    .map((total, index) => ({ total, index }))
    .filter((row) => row.total <= tolerance)
    .map((row) => row.index);
  const rawSlices = attributionSlicesFromWeights(codeActivityByWindow, participationByPersonWindow);
  const rawSum = sumMatrices(rawSlices);
  const codeCooccurrence = weightedCodeCooccurrence(codeActivityByWindow, Array.from({ length: windowCount }, () => 1));
  const participantWeightedCooccurrence = weightedCodeCooccurrence(codeActivityByWindow, participationCountsByWindow);
  const windowNormalizedSlices = attributionSlicesFromWeights(
    codeActivityByWindow,
    normalizeParticipationByWindow(participationByPersonWindow, participationCountsByWindow, tolerance)
  );
  const windowNormalizedSum = sumMatrices(windowNormalizedSlices);
  const personNormalizedSlices = attributionSlicesFromWeights(
    codeActivityByWindow,
    normalizeParticipationByPerson(participationByPersonWindow, participationTotalsByPerson, tolerance)
  );
  const sliceMinEigenvalues = rawSlices.map((slice) => Math.min(...senaSymmetricEigenvalues(slice)));
  const bounds = maxWindowProducts(codeActivityByWindow);
  const flattenedPersonNormalizedValues = personNormalizedSlices.flatMap((slice) => slice.flat());
  const minPersonNormalizedValue = flattenedPersonNormalizedValues.length === 0
    ? 0
    : Math.min(...flattenedPersonNormalizedValues);
  const maxPersonNormalizedValue = flattenedPersonNormalizedValues.length === 0
    ? 0
    : Math.max(...flattenedPersonNormalizedValues);
  const personNormalizedWithinBounds = personNormalizedSlices.every((slice) => (
    slice.every((row, rowIndex) => row.every((value, columnIndex) => (
      value >= -tolerance && value <= (bounds[rowIndex]?.[columnIndex] ?? 0) + tolerance
    )))
  ));

  return {
    estimator: "x-transpose-diag-y-x",
    codeCooccurrence,
    participantWeightedCooccurrence,
    rawSlices,
    rawSum,
    windowNormalizedSlices,
    windowNormalizedSum,
    personNormalizedSlices,
    participationCountsByWindow,
    participationTotalsByPerson,
    zeroParticipationRows,
    sliceMinEigenvalues,
    rawSlicesPsd: sliceMinEigenvalues.every((value) => value >= -tolerance),
    rawSumMatchesParticipantWeightedCooccurrence: maxAbsMatrixDifference(rawSum, participantWeightedCooccurrence) <= tolerance,
    windowNormalizedOffDiagonalMatchesCodeCooccurrence: (
      maxAbsMatrixDifference(windowNormalizedSum, codeCooccurrence, "exclude") <= tolerance
    ),
    personNormalizedWithinBounds,
    minPersonNormalizedValue,
    maxPersonNormalizedValue
  };
}

function identityMatrix(size: number): number[][] {
  return Array.from({ length: size }, (_, rowIndex) => (
    Array.from({ length: size }, (_, columnIndex) => (rowIndex === columnIndex ? 1 : 0))
  ));
}

function normalizeVector(vector: number[], tolerance: number) {
  const norm = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
  const normalized = norm <= tolerance ? vector.map(() => 0) : vector.map((value) => value / norm);
  let anchor = 0;
  let anchorMagnitude = 0;

  normalized.forEach((value, index) => {
    const magnitude = Math.abs(value);
    if (magnitude > anchorMagnitude) {
      anchor = index;
      anchorMagnitude = magnitude;
    }
  });

  return normalized[anchor] < 0 ? normalized.map((value) => -value) : normalized;
}

export function senaSymmetricEigenDecomposition(
  matrix: number[][],
  tolerance = 1e-12,
  maxSweeps = 100
): SenaSymmetricEigenDecomposition {
  const n = matrix.length;
  if (n === 0) return { values: [], vectors: [] };

  const scale = matrixMax(matrix);
  const asymmetry = maxMatrixAsymmetry(matrix);
  if (asymmetry > Math.max(tolerance, 1e-9 * Math.max(1, scale))) {
    throw new Error(
      "SENA symmetric eigendecomposition requires a symmetric matrix; declare an explicit symmetrization such as sym(A)=(A+A^T)/2 before requesting spectral diagnostics for directed input."
    );
  }

  const a = matrix.map((row) => row.map((value) => value));
  const vectors = identityMatrix(n);
  // maxSweeps counts full cyclic Jacobi sweeps (each sweep visits every i<j pair),
  // not single rotations; convergence is checked against the residual off-diagonal mass.
  const offDiagonalThreshold = Math.max(tolerance, Number.EPSILON * Math.max(1, scale) * n);
  const maxOffDiagonal = () => {
    let max = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        max = Math.max(max, Math.abs(a[i][j]));
      }
    }
    return max;
  };

  let converged = n === 1 || maxOffDiagonal() <= offDiagonalThreshold;

  for (let sweep = 0; sweep < maxSweeps && !converged; sweep += 1) {
    for (let p = 0; p < n; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        const apq = a[p][q];
        if (Math.abs(apq) <= offDiagonalThreshold) continue;

        const app = a[p][p];
        const aqq = a[q][q];
        const tau = (aqq - app) / (2 * apq);
        const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;

        for (let k = 0; k < n; k += 1) {
          if (k === p || k === q) continue;
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[p][k] = a[k][p];
          a[k][q] = s * akp + c * akq;
          a[q][k] = a[k][q];
        }

        for (let k = 0; k < n; k += 1) {
          const vkp = vectors[k][p];
          const vkq = vectors[k][q];
          vectors[k][p] = c * vkp - s * vkq;
          vectors[k][q] = s * vkp + c * vkq;
        }

        a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
        a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
        a[p][q] = 0;
        a[q][p] = 0;
      }
    }
    converged = maxOffDiagonal() <= offDiagonalThreshold;
  }

  if (!converged) {
    throw new Error(
      `SENA symmetric eigendecomposition did not converge within ${maxSweeps} cyclic Jacobi sweeps; residual off-diagonal magnitude ${maxOffDiagonal()}.`
    );
  }

  const pairs = a.map((row, index) => {
    const value = row[index];
    const vector = vectors.map((vectorRow) => vectorRow[index]);
    return {
      value: Math.abs(value) <= tolerance ? 0 : value,
      vector: normalizeVector(vector, tolerance)
    };
  }).sort((left, right) => left.value - right.value);

  return {
    values: pairs.map((pair) => pair.value),
    vectors: Array.from({ length: n }, (_, rowIndex) => pairs.map((pair) => pair.vector[rowIndex]))
  };
}

export function senaSymmetricEigenvalues(matrix: number[][], tolerance = 1e-12, maxSweeps = 100) {
  return senaSymmetricEigenDecomposition(matrix, tolerance, maxSweeps).values;
}

export function senaShortestPathDissimilarity(matrix: number[][]) {
  const n = matrix.length;
  const distances = Array.from({ length: n }, (_, rowIndex) => (
    Array.from({ length: n }, (_, columnIndex) => {
      if (rowIndex === columnIndex) return 0;
      const weight = matrix[rowIndex]?.[columnIndex] ?? 0;
      return weight > 0 ? 1 / weight : Number.POSITIVE_INFINITY;
    })
  ));

  for (let k = 0; k < n; k += 1) {
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const viaK = distances[i][k] + distances[k][j];
        if (viaK < distances[i][j]) {
          distances[i][j] = viaK;
        }
      }
    }
  }

  return distances;
}

function centeredGramFromDissimilarity(delta: number[][]) {
  const n = delta.length;
  const squared = delta.map((row) => row.map((value) => {
    if (!Number.isFinite(value)) {
      throw new Error("SENA MDS diagnostics require finite dissimilarities; check isolated components first.");
    }
    return value * value;
  }));
  const rowMeans = squared.map((row) => row.reduce((total, value) => total + value, 0) / n);
  const columnMeans = Array.from({ length: n }, (_, columnIndex) => (
    squared.reduce((total, row) => total + row[columnIndex], 0) / n
  ));
  const grandMean = rowMeans.reduce((total, value) => total + value, 0) / n;

  return squared.map((row, rowIndex) => row.map((value, columnIndex) => (
    -0.5 * (value - rowMeans[rowIndex] - columnMeans[columnIndex] + grandMean)
  )));
}

function pairwiseEuclideanDistances(coordinates: number[][]) {
  const n = coordinates.length;
  return Array.from({ length: n }, (_, rowIndex) => (
    Array.from({ length: n }, (_, columnIndex) => {
      if (rowIndex === columnIndex) return 0;
      const squaredDistance = coordinates[rowIndex].reduce((total, value, dimensionIndex) => {
        const difference = value - (coordinates[columnIndex][dimensionIndex] ?? 0);
        return total + difference * difference;
      }, 0);
      return Math.sqrt(Math.max(0, squaredDistance));
    })
  ));
}

function pairwiseSquaredEuclideanDistances(coordinates: number[][]) {
  const n = coordinates.length;
  return Array.from({ length: n }, (_, rowIndex) => (
    Array.from({ length: n }, (_, columnIndex) => {
      if (rowIndex === columnIndex) return 0;
      return coordinates[rowIndex].reduce((total, value, dimensionIndex) => {
        const difference = value - (coordinates[columnIndex][dimensionIndex] ?? 0);
        return total + difference * difference;
      }, 0);
    })
  ));
}

export function senaSchoenbergMdsDiagnostics(
  delta: number[][],
  options: SenaSchoenbergMdsOptions
): SenaSchoenbergMdsDiagnostics {
  const tolerance = options.tolerance ?? 1e-9;
  const dimensions = Math.max(1, Math.floor(options.dimensions));
  if (delta.length === 0) {
    throw new Error("Classical MDS is unavailable because the fusion graph has zero vertices.");
  }
  const centeredGram = centeredGramFromDissimilarity(delta);
  const decomposition = senaSymmetricEigenDecomposition(centeredGram);
  const descendingPairs = decomposition.values
    .map((value, index) => ({
      value,
      vector: decomposition.vectors.map((row) => row[index])
    }))
    .sort((left, right) => right.value - left.value);
  const positivePairs = descendingPairs.filter((pair) => pair.value > tolerance).slice(0, dimensions);
  const coordinates = delta.map((_, rowIndex) => (
    Array.from({ length: dimensions }, (_, dimensionIndex) => {
      const pair = positivePairs[dimensionIndex];
      return pair ? Math.sqrt(pair.value) * pair.vector[rowIndex] : 0;
    })
  ));
  const fittedDistances = pairwiseEuclideanDistances(coordinates);
  let squaredResidualTotal = 0;
  let squaredDeltaTotal = 0;
  let maxDistortion = 0;

  for (let i = 0; i < delta.length; i += 1) {
    for (let j = i + 1; j < delta.length; j += 1) {
      const residual = fittedDistances[i][j] - delta[i][j];
      squaredResidualTotal += residual * residual;
      squaredDeltaTotal += delta[i][j] * delta[i][j];
      maxDistortion = Math.max(maxDistortion, Math.abs(residual));
    }
  }

  const minCenteredGramEigenvalue = Math.min(...decomposition.values);
  const euclidean = minCenteredGramEigenvalue >= -tolerance;
  const metricExact = euclidean && maxDistortion <= tolerance;

  return {
    delta: "shortest-path-reciprocal-weight",
    dimensions,
    rank: positivePairs.length,
    metricExact,
    minCenteredGramEigenvalue,
    eigenvalues: decomposition.values,
    coordinates,
    stress: squaredDeltaTotal === 0 ? 0 : Math.sqrt(squaredResidualTotal / squaredDeltaTotal),
    maxDistortion,
    warnings: !euclidean
      ? ["Shortest-path dissimilarities fail the Schoenberg Euclidean criterion; rank-limited coordinates are approximate."]
      : metricExact
        ? []
        : ["Requested embedding dimensions truncate an otherwise Euclidean dissimilarity geometry; coordinates are approximate."]
  };
}

export function senaLaplacianEigenmapDiagnostics(
  matrix: number[][],
  options: SenaSchoenbergMdsOptions
): SenaLaplacianEigenmapDiagnostics {
  const tolerance = options.tolerance ?? 1e-9;
  const dimensions = Math.max(1, Math.floor(options.dimensions));
  const laplacian = senaCombinatorialLaplacian(matrix);
  const decomposition = senaSymmetricEigenDecomposition(laplacian);
  const zeroEigenvalueCount = decomposition.values.filter((value) => Math.abs(value) <= tolerance).length;
  const nonZeroPairs = decomposition.values
    .map((value, index) => ({
      value,
      vector: decomposition.vectors.map((row) => row[index])
    }))
    .filter((pair) => pair.value > tolerance)
    .slice(0, dimensions);
  const coordinates = matrix.map((_, rowIndex) => (
    Array.from({ length: dimensions }, (_, dimensionIndex) => nonZeroPairs[dimensionIndex]?.vector[rowIndex] ?? 0)
  ));

  return {
    operator: "laplacian-eigenmaps",
    laplacian: "combinatorial",
    dimensions,
    coordinates,
    eigenvalues: decomposition.values,
    zeroEigenvalueCount,
    metricExact: false,
    warnings: zeroEigenvalueCount === 1
      ? ["Laplacian eigenmaps are spectral coordinates, not exact metric distances."]
      : zeroEigenvalueCount === 0
        ? ["Laplacian eigenmaps found no numerically zero eigenvalue; check solver convergence and input symmetry before interpreting the spectrum."]
        : ["Laplacian eigenmaps found multiple zero eigenvalues; inspect isolated or disconnected components."]
  };
}

function matrixFromEigenExpansion(values: number[], vectors: number[][], coefficient: (value: number) => number) {
  const n = vectors.length;
  return Array.from({ length: n }, (_, rowIndex) => (
    Array.from({ length: n }, (_, columnIndex) => (
      values.reduce((total, value, eigenIndex) => (
        total + coefficient(value) * vectors[rowIndex][eigenIndex] * vectors[columnIndex][eigenIndex]
      ), 0)
    ))
  ));
}

export function senaCommuteTimeEmbeddingDiagnostics(
  matrix: number[][],
  tolerance = 1e-9
): SenaCommuteTimeEmbeddingDiagnostics {
  const volume = senaDegreeVector(matrix).reduce((total, degree) => total + degree, 0);
  const laplacian = senaCombinatorialLaplacian(matrix);
  const decomposition = senaSymmetricEigenDecomposition(laplacian);
  const zeroEigenvalueCount = decomposition.values.filter((value) => Math.abs(value) <= tolerance).length;
  if (volume <= tolerance || zeroEigenvalueCount !== 1) {
    throw new Error("SENA commute-time diagnostics require one connected fusion component.");
  }
  const positivePairs = decomposition.values
    .map((value, index) => ({
      value,
      vector: decomposition.vectors.map((row) => row[index])
    }))
    .filter((pair) => pair.value > tolerance);
  const coordinates = matrix.map((_, rowIndex) => (
    positivePairs.map((pair) => Math.sqrt(volume / pair.value) * pair.vector[rowIndex])
  ));
  const squaredDistances = pairwiseSquaredEuclideanDistances(coordinates);
  const pseudoInverse = matrixFromEigenExpansion(
    decomposition.values,
    decomposition.vectors,
    (value) => (value > tolerance ? 1 / value : 0)
  );
  const commuteTimes = matrix.map((_, rowIndex) => (
    matrix.map((__, columnIndex) => {
      if (rowIndex === columnIndex) return 0;
      return volume * (
        pseudoInverse[rowIndex][rowIndex]
        + pseudoInverse[columnIndex][columnIndex]
        - 2 * pseudoInverse[rowIndex][columnIndex]
      );
    })
  ));
  let maxPairwiseError = 0;
  let checkedPairs = 0;

  for (let i = 0; i < matrix.length; i += 1) {
    for (let j = i + 1; j < matrix.length; j += 1) {
      checkedPairs += 1;
      maxPairwiseError = Math.max(maxPairwiseError, Math.abs(squaredDistances[i][j] - commuteTimes[i][j]));
    }
  }

  return {
    operator: "commute-time",
    volume,
    coordinates,
    commuteTimes,
    squaredDistances,
    eigenvalues: decomposition.values,
    metricExact: maxPairwiseError <= tolerance,
    maxPairwiseError,
    checkedPairs,
    excludedSelfPairs: matrix.length,
  };
}
