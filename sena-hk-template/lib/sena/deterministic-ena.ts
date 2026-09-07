import { accumulateData, enaCorrelations, extractMakeSetOptions, makeSet, type ENAOptions, type ENASet } from "jena-js";
import { centerData, covarianceLike, meanColumns, multiplyMatrices, normalizeVector, sphereNorm, subtractOuterProjection, subtractVectors } from "jena-js/core";
import { senaSymmetricEigenDecomposition } from "./operators";
import { senaDeterministicAtanh, senaDeterministicTanh } from "./deterministic-numerics";

type MeanGroups = [string[], string[]];
type Rotation = Pick<ENASet["rotation"], "rotationMatrix" | "rotationColumns" | "eigenvalues">;

/**
 * Numerical profile for pinned jena-js 0.6.2: algebraic cyclic Jacobi on a
 * max-absolute-scaled Gram matrix. The solver's relative stopping floor is
 * Number.EPSILON * width. Pass tolerance 0 to retain tiny positive eigenvalues;
 * keep every eigenvector (including null-space axes) for full-basis variance.
 * SVD signs follow the SENA solver's largest-component-positive convention.
 */
function deterministicSvd(points: number[][]): Rotation {
  const gram = covarianceLike(points);
  const scale = gram.reduce((maximum, row) => row.reduce((max, value) => Math.max(max, Math.abs(value)), maximum), 0);
  const normalized = gram.map((row) => row.map((value) => scale === 0 ? 0 : value / scale));
  const eigen = senaSymmetricEigenDecomposition(normalized, 0);
  // Stable sorting preserves solver order for equal eigenvalues.
  const order = eigen.values.map((_value, index) => index).sort((left, right) => eigen.values[right] - eigen.values[left]);
  return {
    rotationMatrix: eigen.vectors.map((row) => order.map((index) => row[index])),
    rotationColumns: order.map((_index, i) => `SVD${i + 1}`),
    eigenvalues: order.map((index) => Math.max(0, eigen.values[index]) * scale / Math.max(1, points.length - 1)),
  };
}

function resolveMeanGroups(options: ENAOptions, meanGroups?: MeanGroups): MeanGroups | undefined {
  if (options.rotationSet !== undefined) {
    throw new Error("Use public jena-js projectIn for a borrowed rotationSet; this adapter estimates a new basis.");
  }
  const rotation = options.rotation;
  if (rotation !== undefined && rotation.method !== "svd" && rotation.method !== "mean") {
    throw new Error(`Unsupported deterministic ENA rotation: ${String(rotation.method)}.`);
  }
  if (meanGroups !== undefined && rotation !== undefined) {
    throw new Error("Conflicting rotation requests: provide either meanGroups or options.rotation, not both.");
  }
  const groups = meanGroups ?? (rotation?.method === "mean" ? rotation.params?.groups : undefined);
  if (groups === undefined && rotation?.method !== "mean") return undefined;
  if (!Array.isArray(groups) || groups.length !== 2 || !groups.every(Array.isArray)) {
    throw new Error("Deterministic mean rotation requires exactly one string-ID group pair.");
  }
  if (!groups.every((group) => group.every((id) => typeof id === "string"))) {
    throw new Error("Deterministic mean rotation requires exactly one pair of string-ID groups.");
  }
  return groups as MeanGroups;
}

function deterministicMean(points: number[][], labels: string[], groups: MeanGroups): Rotation {
  // rENA/jENA mean rotation centers once more before estimating its direction.
  const centered = centerData(points);
  const [left, right] = groups.map((group) => {
    const selected = new Set(group);
    return centered.filter((_row, index) => selected.has(labels[index]));
  });
  if (left.length === 0 || right.length === 0) {
    throw new Error("Mean rotation groups must both contain at least one row.");
  }
  const direction = normalizeVector(subtractVectors(meanColumns(left), meanColumns(right)));
  if (direction.every((value) => value === 0)) throw new Error("Mean rotation groups have identical means.");
  const width = points[0].length;
  const deflated = subtractOuterProjection(centered, direction);
  // Householder completion avoids subtracting nearly parallel coordinate
  // vectors in single-pass Gram-Schmidt. Choose the sign so v[0] adds
  // magnitudes, never cancels. H = I - 2vv' supplies the orthogonal complement;
  // retain the ordered mean direction itself as column 0 (not H's ±direction).
  const reflector = [...direction];
  reflector[0] += direction[0] < 0 ? -1 : 1;
  const unitReflector = normalizeVector(reflector);
  const leading = direction.map((value) => [value]);
  let rotationMatrix = leading;
  if (width > 1) {
    const rest = unitReflector.map((value, i) => Array.from({ length: width - 1 }, (_, offset) => {
      const j = offset + 1;
      return Number(i === j) - 2 * value * unitReflector[j];
    }));
    const residualRotation = deterministicSvd(multiplyMatrices(deflated, rest));
    const residual = multiplyMatrices(rest, residualRotation.rotationMatrix);
    rotationMatrix = leading.map((row, i) => [...row, ...residual[i]]);
  }
  // Never canonicalize the mean axis sign: left-minus-right is its meaning.
  return { rotationMatrix, rotationColumns: Array.from({ length: width }, (_, i) => i === 0 ? "MR1" : `SVD${i + 1}`), eigenvalues: [] };
}

/**
 * Build a new SVD or single-pair mean ENA space with a deterministic basis.
 * Accumulation, validation, full-axis variance, least-squares nodes, centroids,
 * metadata and output shape remain the public jena-js pipeline's responsibility.
 * Supplying meanGroups selects mean rotation; omit options.rotation in that form.
 */
export function buildSenaDeterministicEnaSet(options: ENAOptions, meanGroups?: MeanGroups): ENASet {
  const groups = resolveMeanGroups(options, meanGroups);
  const data = accumulateData(options);
  const lineWeights = sphereNorm(data.connectionMatrix);
  const hasSignal = (row: number[]) => row.reduce((sum, value) => sum + value, 0) !== 0;
  const align = options.centerAlignToOrigin ?? true;
  const rowsToCenter = align ? lineWeights.filter(hasSignal) : lineWeights;
  if (align && rowsToCenter.length === 0) {
    throw new Error("There were no co-occurrences of codes for any of the units within the model as defined.");
  }
  const centerVector = meanColumns(rowsToCenter);
  const points = lineWeights.map((row) => align && !hasSignal(row) ? row.map(() => 0) : row.map((value, i) => value - centerVector[i]));
  const rotation = groups
    ? deterministicMean(points, data.connectionCounts.map((row) => String(row.ENA_UNIT)), groups)
    : deterministicSvd(points);
  return makeSet(data, {
    ...extractMakeSetOptions(options),
    rotationSet: { codes: data.codes, adjacencyKey: data.adjacencyKey, ...rotation, centerVector },
  });
}

// Exact binary64 result of public jena-js 0.6.2 inverseNormal((1 + 0.95) / 2),
// its Acklam central rational branch. The test binds this value to the pin.
// This is deliberately not a replacement textbook or higher-precision quantile.
const JENA_DEFAULT_95_QUANTILE = 1.9599639861189817;

/** Default 95% intervals only; retain jENA's Pearson/Spearman and pair count. */
export function senaDeterministicEnaCorrelations(set: ENASet): ReturnType<typeof enaCorrelations> {
  const pairCount = set.points.length * (set.points.length - 1) / 2;
  // Discard both native interval fields before any filtering or serialization.
  return enaCorrelations(set).map(({ dimension, pearson, spearman }) => {
    let pearsonLower = Number.NaN;
    let pearsonUpper = Number.NaN;
    if (Number.isFinite(pearson) && pairCount > 3) {
      const z = senaDeterministicAtanh(Math.max(-0.999999999999, Math.min(0.999999999999, pearson)));
      const margin = 1 / Math.sqrt(pairCount - 3) * JENA_DEFAULT_95_QUANTILE;
      pearsonLower = senaDeterministicTanh(z - margin);
      pearsonUpper = senaDeterministicTanh(z + margin);
    }
    return { dimension, pearson, spearman, pearsonLower, pearsonUpper };
  });
}
