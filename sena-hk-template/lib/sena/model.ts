import {
  averagePathLength as snaAveragePathLength,
  betweenness,
  components,
  degree,
  gden,
  geodist,
  grecip,
  isConnected,
  labelPropagation,
  nties,
  reachability,
  type GraphMode
} from "sna.js";
import {
  buildSenaAnalysisConfigHash,
  buildSenaDatasetContentHash
} from "./data-contract-audit";
import { validateSenaAnalyticalInputs } from "./analytical-input-validation";
import {
  buildSenaFusionAdjacency,
  findSenaIsolatedVertices,
  normalizeSenaMatrix,
  senaAttributionOperatorDiagnostics,
  senaCommuteTimeEmbeddingDiagnostics,
  senaDeclaredSpectralSymmetrization,
  senaDegreeVector,
  senaLaplacianEigenmapDiagnostics,
  senaSchoenbergMdsDiagnostics,
  senaShortestPathDissimilarity
} from "./operators";
import type {
  SenaBuildOptions,
  SenaCode,
  SenaCodePair,
  SenaCodedSegment,
  SenaDataset,
  SenaEdge,
  SenaEvidenceSnippet,
  SenaMatrixBlock,
  SenaModel,
  SenaNode,
  SenaOperatorDiagnostics,
  SenaPairReport,
  SenaPerson,
  SenaPersonMetrics,
  SenaResolvedBuildOptions,
  SenaSocialReport,
  SenaSummary,
  SenaTemporalMode,
  SenaTemporalOptions,
  SenaTemporalWindow,
  SenaUtterance
} from "./types";

const defaultOptions: SenaResolvedBuildOptions = {
  alpha: 1,
  beta: 1,
  gamma: 1,
  normalization: "max",
  bridgeWeightRule: "count",
  direction: "directed",
  deg_convention: "row-sum",
  delta: "shortest_path_reciprocal_weight",
  Phi: "classical_mds",
  d: 2,
  seed: 0,
  undirectedSocial: false,
  temporal: {
    mode: "stage",
    movingWindowSize: 3,
    movingWindowStep: 1,
    turnWindowRadius: 1
  }
};

const conceptBrokerageDamping = 0.5;

const exploratoryBridgeScoreWeights = {
  socialStrength: 0.5,
  epistemicContribution: 0.3,
  conceptBrokerage: 0.2
} as const;

function makeMatrix(rows: number, columns = rows) {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => 0));
}

function normalizationDiagnostic(result: ReturnType<typeof normalizeSenaMatrix>) {
  return {
    rule: result.rule,
    divisor: result.divisor,
    admissible: result.admissible,
    scaleInvariant: result.scaleInvariant,
    warnings: result.warnings
  };
}

function buildEmbeddingDiagnostics(
  fusion: number[][],
  isolatedVertices: SenaOperatorDiagnostics["isolatedVertices"],
  options: SenaResolvedBuildOptions
): SenaOperatorDiagnostics["embedding"] {
  const dimensions = options.d;
  const exploratoryLayout = {
    operator: "deterministic-force-layout" as const,
    metricExact: false as const,
    warning: "Exploratory layout coordinates are not formal metric distances; use declared embedding diagnostics for proximity claims."
  };
  // Spectral operators require symmetric input; directed A_fusion is embedded
  // through an explicitly declared symmetrization instead of silent mirroring.
  const spectralInput = senaDeclaredSpectralSymmetrization(fusion);
  const symmetrizationWarning = spectralInput.symmetrized
    ? "Directed A_fusion is asymmetric; spectral embedding diagnostics use the declared symmetrization sym(A)=(A+A^T)/2, so cross-type distance claims describe the symmetrized graph."
    : null;
  const embeddingInput: SenaOperatorDiagnostics["embedding"]["input"] = {
    matrix: "fusion",
    asymmetry: spectralInput.asymmetry,
    symmetrized: spectralInput.symmetrized,
    symmetrization: spectralInput.symmetrization,
    warning: symmetrizationWarning
  };
  const spectralFusion = spectralInput.values;
  const withSymmetrizationWarning = (warnings: string[]) => (
    symmetrizationWarning ? [symmetrizationWarning, ...warnings] : warnings
  );
  const isolatedWarning = isolatedVertices.length > 0
    ? `Formal embedding diagnostics unavailable because ${isolatedVertices.length} isolated vertex/vertices are retained in I0.`
    : null;

  if (isolatedWarning) {
    return {
      input: embeddingInput,
      exploratoryLayout,
      mds: {
        operator: "classical-mds",
        delta: "shortest-path-reciprocal-weight",
        dimensions,
        available: false,
        metricExact: false,
        coordinates: null,
        stress: null,
        maxDistortion: null,
        minCenteredGramEigenvalue: null,
        warnings: withSymmetrizationWarning([isolatedWarning])
      },
      laplacianEigenmaps: {
        operator: "laplacian-eigenmaps",
        laplacian: "combinatorial",
        dimensions,
        available: false,
        metricExact: false,
        coordinates: null,
        eigenvalues: null,
        zeroEigenvalueCount: null,
        warnings: withSymmetrizationWarning([isolatedWarning])
      },
      commuteTime: {
        operator: "commute-time",
        available: false,
        metricExact: false,
        coordinates: null,
        maxPairwiseError: null,
        checkedPairs: null,
        excludedSelfPairs: null,
        warnings: withSymmetrizationWarning(["Commute-time diagnostics require one connected fusion component."])
      }
    };
  }

  const mds = (() => {
    try {
      const diagnostics = senaSchoenbergMdsDiagnostics(senaShortestPathDissimilarity(spectralFusion), { dimensions });
      return {
        operator: "classical-mds" as const,
        delta: diagnostics.delta,
        dimensions: diagnostics.dimensions,
        available: true,
        metricExact: diagnostics.metricExact,
        coordinates: diagnostics.coordinates,
        stress: diagnostics.stress,
        maxDistortion: diagnostics.maxDistortion,
        minCenteredGramEigenvalue: diagnostics.minCenteredGramEigenvalue,
        warnings: withSymmetrizationWarning(diagnostics.warnings)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown MDS diagnostic failure.";
      return {
        operator: "classical-mds" as const,
        delta: "shortest-path-reciprocal-weight" as const,
        dimensions,
        available: false,
        metricExact: false,
        coordinates: null,
        stress: null,
        maxDistortion: null,
        minCenteredGramEigenvalue: null,
        warnings: withSymmetrizationWarning([message])
      };
    }
  })();

  const laplacianEigenmaps = (() => {
    try {
      const diagnostics = senaLaplacianEigenmapDiagnostics(spectralFusion, { dimensions });
      return {
        operator: diagnostics.operator,
        laplacian: diagnostics.laplacian,
        dimensions: diagnostics.dimensions,
        available: true,
        metricExact: diagnostics.metricExact,
        coordinates: diagnostics.coordinates,
        eigenvalues: diagnostics.eigenvalues,
        zeroEigenvalueCount: diagnostics.zeroEigenvalueCount,
        warnings: withSymmetrizationWarning(diagnostics.warnings)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Laplacian eigenmap diagnostic failure.";
      return {
        operator: "laplacian-eigenmaps" as const,
        laplacian: "combinatorial" as const,
        dimensions,
        available: false,
        metricExact: false as const,
        coordinates: null,
        eigenvalues: null,
        zeroEigenvalueCount: null,
        warnings: withSymmetrizationWarning([message])
      };
    }
  })();

  const commuteTime = (() => {
    try {
      const diagnostics = senaCommuteTimeEmbeddingDiagnostics(spectralFusion);
      return {
        operator: diagnostics.operator,
        available: true,
        metricExact: diagnostics.metricExact,
        coordinates: diagnostics.coordinates,
        maxPairwiseError: diagnostics.maxPairwiseError,
        checkedPairs: diagnostics.checkedPairs,
        excludedSelfPairs: diagnostics.excludedSelfPairs,
        warnings: withSymmetrizationWarning([])
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown commute-time diagnostic failure.";
      return {
        operator: "commute-time" as const,
        available: false,
        metricExact: false,
        coordinates: null,
        maxPairwiseError: null,
        checkedPairs: null,
        excludedSelfPairs: null,
        warnings: withSymmetrizationWarning([message])
      };
    }
  })();

  return {
    input: embeddingInput,
    exploratoryLayout,
    mds,
    laplacianEigenmaps,
    commuteTime
  };
}

function buildAttributionDiagnostics(
  dataset: SenaDataset,
  G: number[][],
  personIndex: Map<string, number>,
  codeIndex: Map<string, number>,
  participation: ReturnType<typeof buildParticipationMatrix>
): SenaOperatorDiagnostics["attribution"] {
  const participationTotals = participation.Y.map((row) => sum(row));
  const gHatValues = G.map((row, rowIndex) => {
    const denominator = participationTotals[rowIndex] ?? 0;
    return denominator > 0 ? row.map((value) => value / denominator) : row.map(() => 0);
  });
  const contributionWordingAllowed = dataset.coded_segments.length > 0 &&
    dataset.coded_segments.every((segment) => personIndex.has(segment.personId)) &&
    participation.warnings.length === 0;
  const activeCells = participation.Y.reduce((total, row) => (
    total + row.filter((value) => value > 0).length
  ), 0);
  const windowIndex = new Map(participation.windowIds.map((id, index) => [id, index]));
  const codeActivityByWindow = participation.windowIds.map(() => Array.from({ length: dataset.codebook.length }, () => 0));
  dataset.coded_segments.forEach((segment) => {
    const windowPosition = windowIndex.get(`${segment.unitId}::${segment.stanzaId}`);
    if (windowPosition === undefined) return;
    segment.codes.forEach((codeId) => {
      const codePosition = codeIndex.get(codeId);
      if (codePosition !== undefined) codeActivityByWindow[windowPosition][codePosition] = 1;
    });
  });
  const attributionOperator = senaAttributionOperatorDiagnostics(codeActivityByWindow, participation.Y);

  return {
    estimator: "x-transpose-diag-y-x",
    defaultWording: "associated with windows containing the pair",
    contributionWordingAllowed,
    contributionWordingReason: contributionWordingAllowed
      ? "Contribution wording is allowed only because all coded segments carry person-specific evidence."
      : "Use association/exposure wording because person-specific evidence is incomplete or absent.",
    participation: {
      symbol: "Y",
      sourceTable: "coded_segments",
      rowCount: participation.Y.length,
      columnCount: participation.windowIds.length,
      activeCells,
      firstClass: true,
      warnings: participation.warnings
    },
    gHat: {
      normalization: "participation-window-share",
      values: gHatValues,
      rowSums: gHatValues.map((row) => sum(row)),
      boundsWithinWindowProducts: attributionOperator.personNormalizedWithinBounds,
      minValue: attributionOperator.minPersonNormalizedValue,
      maxValue: attributionOperator.maxPersonNormalizedValue,
      zeroParticipationRows: attributionOperator.zeroParticipationRows
    },
    identities: {
      rawSlicesPsd: attributionOperator.rawSlicesPsd,
      rawSumMatchesParticipantWeightedCooccurrence: attributionOperator.rawSumMatchesParticipantWeightedCooccurrence,
      windowNormalizedOffDiagonalMatchesCodeCooccurrence: (
        attributionOperator.windowNormalizedOffDiagonalMatchesCodeCooccurrence
      )
    },
    guardrail: "Default attribution wording is association/exposure; contribution wording requires person-specific coded evidence and human review."
  };
}

function buildTypedCentralityDiagnostics(
  dataset: SenaDataset,
  S: number[][],
  W: number[][],
  B: number[][],
  fusionDegreeVector: number[]
): SenaOperatorDiagnostics["typedCentrality"] {
  const peopleCount = dataset.people.length;
  return {
    mixedRankingRenderable: false,
    guardrail: "Do not render one mixed-type centrality ranking; compare persons on S, codes on W, bridges on B, and whole-graph typed degrees separately.",
    families: {
      personsOnS: dataset.people.map((person, index) => ({
        id: person.id,
        label: person.label,
        metric: "social-strength",
        value: sum(S[index] ?? [])
      })),
      codesOnW: dataset.codebook.map((code, index) => ({
        id: code.id,
        label: code.label,
        metric: "concept-weighted-degree",
        value: sum(W[index] ?? [])
      })),
      bridgesOnB: dataset.people.flatMap((person, personIndexValue) => (
        dataset.codebook.flatMap((code, codeIndexValue) => {
          const value = B[personIndexValue]?.[codeIndexValue] ?? 0;
          if (value <= 0) return [];
          return [{
            id: `${person.id}->${code.id}`,
            personId: person.id,
            personLabel: person.label,
            codeId: code.id,
            codeLabel: code.label,
            metric: "bridge-weight" as const,
            value
          }];
        })
      )),
      typedGraph: [
        ...dataset.people.map((person, index) => ({
          id: person.id,
          label: person.label,
          nodeType: "person" as const,
          metric: "typed-fused-degree" as const,
          value: fusionDegreeVector[index] ?? 0
        })),
        ...dataset.codebook.map((code, index) => ({
          id: code.id,
          label: code.label,
          nodeType: "code" as const,
          metric: "typed-fused-degree" as const,
          value: fusionDegreeVector[peopleCount + index] ?? 0
        }))
      ]
    }
  };
}

function buildBridgeWeightingDiagnostics(
  dataset: SenaDataset,
  rule: SenaResolvedBuildOptions["bridgeWeightRule"]
): SenaOperatorDiagnostics["bridgeWeighting"] {
  const confidenceValuesPresent = dataset.coded_segments.some((segment) => segment.confidence !== undefined);
  const missingConfidenceCount = dataset.coded_segments.filter((segment) => segment.confidence === undefined).length;
  const warnings = rule === "count"
    ? [
      ...(confidenceValuesPresent
        ? ["Segment confidence values are present but ignored by default; bridge B uses declared segment-code counts unless bridgeWeightRule=confidence is explicit."]
        : [])
    ]
    : [
      "Confidence-weighted bridge B is declared; segment.confidence values are treated as bridge weights and missing confidence defaults to 1."
    ];

  return {
    rule,
    activeCodeValue: rule === "confidence" ? "segment-confidence-or-1" : "segment-code-count",
    confidenceValuesPresent,
    missingConfidenceCount,
    warnings
  };
}

function positiveMatrixEntries(matrix: number[][]) {
  return matrix.reduce((total, row) => total + row.filter((value) => value > 0).length, 0);
}

function transposeRectangularMatrix(matrix: number[][], columnCount: number) {
  return Array.from({ length: columnCount }, (_, columnIndex) => (
    matrix.map((row) => row[columnIndex] ?? 0)
  ));
}

function buildDirectionDiagnostics(
  options: SenaResolvedBuildOptions,
  Bpc: number[][],
  Bcp: number[][],
  independentBridgeMatrices: boolean
): SenaOperatorDiagnostics["direction"] {
  const socialSymmetrized = options.undirectedSocial;
  const fusionMode = socialSymmetrized && !independentBridgeMatrices ? "undirected" : "directed";
  const pcEdgeCount = positiveMatrixEntries(Bpc);
  const cpEdgeCount = positiveMatrixEntries(Bcp);
  const bridgeMode = independentBridgeMatrices ? "pc-cp-independent" : "pc-transpose-fallback";
  const independentBridgeBadge = "Independent B^PC/B^CP evidence is active and keeps A_fusion directed.";
  const bridgePendingWarning = "B^CP uses transpose-compatible weights from B^PC; independent B^PC/B^CP evidence is still pending.";

  return {
    socialMode: socialSymmetrized ? "undirected" : "directed",
    fusionMode,
    socialSymmetrized,
    directedInputPreserved: !socialSymmetrized,
    bridgeMode,
    pcEdgeType: "PC",
    cpEdgeType: "CP",
    pcEdgeCount,
    cpEdgeCount,
    independentBridgeMatrices,
    badge: socialSymmetrized
      ? `Social direction collapsed by symmetrization. ${independentBridgeMatrices ? independentBridgeBadge : bridgePendingWarning}`
      : `Directed input preserved. ${independentBridgeMatrices ? independentBridgeBadge : bridgePendingWarning}`,
    warnings: [
      ...(socialSymmetrized ? ["Social direction collapsed by symmetrization."] : []),
      ...(independentBridgeMatrices ? [] : [bridgePendingWarning])
    ]
  };
}

function idIndex<T extends { id: string }>(items: T[], label: string) {
  const map = new Map<string, number>();
  for (const [index, item] of items.entries()) {
    if (map.has(item.id)) throw new Error(`Duplicate ${label} id "${item.id}".`);
    map.set(item.id, index);
  }
  return map;
}

function sortedPair(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function combinations(values: string[]) {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      pairs.push([values[i], values[j]]);
    }
  }
  return pairs;
}

function groupBy<T>(values: T[], key: (value: T) => string) {
  const map = new Map<string, T[]>();
  for (const value of values) {
    const bucket = key(value);
    map.set(bucket, [...(map.get(bucket) ?? []), value]);
  }
  return map;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function zScores(values: number[]) {
  const mean = values.length > 0 ? sum(values) / values.length : 0;
  const variance = values.length > 0 ? sum(values.map((value) => (value - mean) ** 2)) / values.length : 0;
  const sd = Math.sqrt(variance);
  if (sd === 0) return values.map(() => 0);
  return values.map((value) => (value - mean) / sd);
}

function entropy(values: number[]) {
  const total = sum(values);
  if (total === 0) return 0;
  return values.reduce((score, value) => {
    if (value <= 0) return score;
    const p = value / total;
    return score - p * Math.log(p);
  }, 0);
}

function cosine(a: number[], b: number[]) {
  const dot = a.reduce((total, value, index) => total + value * (b[index] ?? 0), 0);
  const magA = Math.sqrt(a.reduce((total, value) => total + value * value, 0));
  const magB = Math.sqrt(b.reduce((total, value) => total + value * value, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

function topN<T>(items: T[], score: (item: T) => number, n = 3) {
  return [...items].sort((a, b) => score(b) - score(a)).slice(0, n);
}

function socialGraphMode(undirected: boolean): GraphMode {
  return undirected ? "graph" : "digraph";
}

function buildSocialAnalysis(S: number[][], directedS: number[][], undirected: boolean): SenaSummary["socialAnalysis"] & {
  degree: number[];
  weightedDegree: number[];
  betweenness: number[];
  closeness: number[];
  reachable: number[];
  componentLabels: number[];
  communityLabels: number[];
} {
  const mode = socialGraphMode(undirected);
  const graphOptions = { mode, diag: false } as const;
  const degreeMode = undirected ? "freeman" : "total";
  const componentResult = components(S, { ...graphOptions, connected: "weak" });
  const connected = S.length <= 1 ? true : isConnected(S, { ...graphOptions, connected: "weak" });
  // SENA's actor closeness is component-scoped (reachable count over summed
  // finite geodesic distance, 0 for isolates) so sparse classroom networks
  // stay comparable; the committed R parity fixtures encode this same
  // definition from sna::geodist distances. R-faithful closeness() would
  // instead report 0 for every vertex of a disconnected graph.
  const geodesics = geodist(S, graphOptions);
  const closeness = geodesics.distances.map((row, vertex) => {
    let reachableCount = 0;
    let totalDistance = 0;
    row.forEach((distance, column) => {
      if (column === vertex || !Number.isFinite(distance) || distance <= 0) return;
      reachableCount += 1;
      totalDistance += distance;
    });
    return totalDistance > 0 ? reachableCount / totalDistance : 0;
  });
  // sna.js >= 0.3 returns the R-faithful reflexive reachability matrix
  // (diagonal 1); SENA reports how many OTHER vertices each vertex reaches,
  // so the diagonal is excluded to keep the pre-0.3 numbers.
  const reachabilityMatrix = reachability(S, graphOptions);
  const reachable = reachabilityMatrix.map((row, vertex) =>
    row.reduce((total, value, column) => (column === vertex ? total : total + value), 0)
  );
  const communityResult = labelPropagation(S, graphOptions);
  const reciprocity = grecip(directedS, { mode: "digraph", diag: false, measure: "edgewise" });

  // sna.js >= 0.3 follows R sna semantics: nties() is the number of POSSIBLE
  // dyads and gden() defaults to valued density. SENA reports binary density
  // and the count of realized ties, so density uses ignoreEval and the tie
  // count is recovered as density * possible dyads.
  const possibleTies = nties(S, graphOptions);
  const binaryDensity = S.length <= 1 ? 0 : gden(S, { ...graphOptions, ignoreEval: true });

  return {
    engine: "sna.js",
    density: binaryDensity,
    tieCount: Math.round(binaryDensity * possibleTies),
    reciprocity: Number.isFinite(reciprocity) ? reciprocity : 0,
    connected,
    componentCount: componentResult.count,
    largestComponentSize: Math.max(0, ...componentResult.sizes),
    averagePathLength: snaAveragePathLength(S, graphOptions),
    communityCount: communityResult.count,
    degree: degree(S, { ...graphOptions, cmode: degreeMode, ignoreEval: true }),
    weightedDegree: degree(S, { ...graphOptions, cmode: degreeMode, ignoreEval: false }),
    betweenness: betweenness(S, { ...graphOptions, cmode: undirected ? "undirected" : "directed", rescale: false }),
    closeness,
    reachable,
    componentLabels: componentResult.labels,
    communityLabels: communityResult.labels
  };
}

function codeLabel(codeMap: Map<string, SenaCode>, codeId: string) {
  return codeMap.get(codeId)?.label ?? codeId;
}

function buildSocialMatrix(dataset: SenaDataset, personIndex: Map<string, number>, undirected: boolean) {
  const S = makeMatrix(dataset.people.length);
  const directedS = makeMatrix(dataset.people.length);
  const warnings: string[] = [];

  for (const interaction of dataset.interactions) {
    const source = personIndex.get(interaction.source);
    const target = personIndex.get(interaction.target);
    if (source === undefined || target === undefined) {
      warnings.push(`Interaction ${interaction.source}->${interaction.target} references an unknown person.`);
      continue;
    }
    const weight = interaction.weight ?? 1;
    directedS[source][target] += weight;
    S[source][target] += weight;
    if (undirected) S[target][source] += weight;
  }

  return { S, directedS, warnings };
}

function buildConceptMatrix(dataset: SenaDataset, codeIndex: Map<string, number>) {
  const W = makeMatrix(dataset.codebook.length);
  const warnings: string[] = [];
  // W windows are unit-scoped stanzas so the epistemic layer, G/Y attribution,
  // and the jENA conversation grouping (["unitId","stanzaId"]) share one window definition.
  const stanzas = groupBy(dataset.coded_segments, (segment) => `${segment.unitId}::${segment.stanzaId}`);

  for (const segments of stanzas.values()) {
    const activeCodes = unique(segments.flatMap((segment) => segment.codes));
    for (const code of activeCodes) {
      if (!codeIndex.has(code)) warnings.push(`Coded segment references unknown code "${code}".`);
    }
    const validCodes = activeCodes.filter((code) => codeIndex.has(code));
    for (const [a, b] of combinations(validCodes)) {
      const ai = codeIndex.get(a);
      const bi = codeIndex.get(b);
      if (ai === undefined || bi === undefined) continue;
      W[ai][bi] += 1;
      W[bi][ai] += 1;
    }
  }

  return { W, warnings };
}

function bridgeSegmentWeight(segment: SenaCodedSegment, rule: SenaResolvedBuildOptions["bridgeWeightRule"]) {
  return rule === "confidence" ? segment.confidence ?? 1 : 1;
}

function buildBridgeMatrix(
  dataset: SenaDataset,
  personIndex: Map<string, number>,
  codeIndex: Map<string, number>,
  bridgeWeightRule: SenaResolvedBuildOptions["bridgeWeightRule"]
) {
  const B = makeMatrix(dataset.people.length, dataset.codebook.length);
  const Bcp = makeMatrix(dataset.codebook.length, dataset.people.length);
  const warnings: string[] = [];
  let hasIndependentCpEvidence = false;

  for (const segment of dataset.coded_segments) {
    const person = personIndex.get(segment.personId);
    if (person === undefined) {
      warnings.push(`Segment ${segment.segmentId} references unknown person "${segment.personId}".`);
      continue;
    }
    const targetPeople = unique(segment.targetPersonIds ?? []);
    const validTargets = targetPeople.flatMap((targetPersonId) => {
      const target = personIndex.get(targetPersonId);
      if (target === undefined) {
        warnings.push(`Segment ${segment.segmentId} references unknown target person "${targetPersonId}".`);
        return [];
      }
      return [target];
    });

    for (const code of segment.codes) {
      const codePosition = codeIndex.get(code);
      if (codePosition === undefined) {
        warnings.push(`Segment ${segment.segmentId} references unknown code "${code}".`);
        continue;
      }
      const weight = bridgeSegmentWeight(segment, bridgeWeightRule);
      B[person][codePosition] += weight;
      for (const target of validTargets) {
        Bcp[codePosition][target] += weight;
        hasIndependentCpEvidence = true;
      }
    }
  }

  return {
    B,
    Bcp: hasIndependentCpEvidence ? Bcp : transposeRectangularMatrix(B, dataset.codebook.length),
    hasIndependentCpEvidence,
    warnings
  };
}

function buildParticipationMatrix(dataset: SenaDataset, personIndex: Map<string, number>) {
  const windowIds = Array.from(new Set(
    dataset.coded_segments.map((segment) => `${segment.unitId}::${segment.stanzaId}`)
  ));
  const windowIndex = new Map(windowIds.map((id, index) => [id, index]));
  const Y = makeMatrix(dataset.people.length, windowIds.length);
  const warnings: string[] = [];

  dataset.coded_segments.forEach((segment) => {
    const personPosition = personIndex.get(segment.personId);
    if (personPosition === undefined) {
      warnings.push(`Segment ${segment.segmentId} references unknown person "${segment.personId}".`);
      return;
    }
    const windowId = `${segment.unitId}::${segment.stanzaId}`;
    const windowPosition = windowIndex.get(windowId);
    if (windowPosition === undefined) return;
    Y[personPosition][windowPosition] = 1;
  });

  return { Y, windowIds, warnings };
}

function buildCodePairs(dataset: SenaDataset): SenaCodePair[] {
  return combinations(dataset.codebook.map((code) => code.id)).map(([codeA, codeB]) => ({
    id: sortedPair(codeA, codeB),
    codeA,
    codeB,
    label: `${dataset.codebook.find((code) => code.id === codeA)?.label ?? codeA} + ${dataset.codebook.find((code) => code.id === codeB)?.label ?? codeB}`
  }));
}

type PairContributionDetail = {
  weight: number;
  directWeight: number;
  supportingWeight: number;
  segmentIds: Set<string>;
};

function buildPairContribution(
  dataset: SenaDataset,
  personIndex: Map<string, number>,
  codeIndex: Map<string, number>,
  codePairs: SenaCodePair[]
) {
  const G = makeMatrix(dataset.people.length, codePairs.length);
  const personPairContribution = new Map<string, Map<string, number>>();
  const personPairDetails = new Map<string, Map<string, PairContributionDetail>>();
  const pairIndex = new Map(codePairs.map((pair, index) => [pair.id, index]));
  const stanzas = groupBy(dataset.coded_segments, (segment) => `${segment.unitId}::${segment.stanzaId}`);

  const addContribution = ({
    personId,
    personPosition,
    pair,
    segmentIds,
    weight,
    direct
  }: {
    personId: string;
    personPosition: number;
    pair: string;
    segmentIds: string[];
    weight: number;
    direct: boolean;
  }) => {
    const columnPosition = pairIndex.get(pair);
    if (columnPosition === undefined || weight <= 0) return;

    G[personPosition][columnPosition] += weight;

    const personMap = personPairContribution.get(personId) ?? new Map<string, number>();
    personMap.set(pair, (personMap.get(pair) ?? 0) + weight);
    personPairContribution.set(personId, personMap);

    const detailMap = personPairDetails.get(personId) ?? new Map<string, PairContributionDetail>();
    const detail = detailMap.get(pair) ?? {
      weight: 0,
      directWeight: 0,
      supportingWeight: 0,
      segmentIds: new Set<string>()
    };
    detail.weight += weight;
    if (direct) detail.directWeight += weight;
    else detail.supportingWeight += weight;
    segmentIds.forEach((segmentId) => detail.segmentIds.add(segmentId));
    detailMap.set(pair, detail);
    personPairDetails.set(personId, detailMap);
  };

  for (const segments of stanzas.values()) {
    const allCodes = unique(segments.flatMap((segment) => segment.codes)).filter((code) => codeIndex.has(code));
    const activePairIds = combinations(allCodes).map(([a, b]) => sortedPair(a, b));
    const personIds = unique(segments.map((segment) => segment.personId)).filter((personId) => personIndex.has(personId));
    for (const personId of personIds) {
      const personPosition = personIndex.get(personId);
      if (personPosition === undefined) continue;

      const personSegments = segments.filter((segment) => segment.personId === personId);
      const contributedCodes = unique(personSegments.flatMap((segment) => segment.codes)).filter((code) => codeIndex.has(code));
      const contributed = new Set(contributedCodes);
      const directPairIds = new Set(combinations(contributedCodes).map(([a, b]) => sortedPair(a, b)));
      for (const pair of activePairIds) {
        const direct = directPairIds.has(pair);
        addContribution({
          personId,
          personPosition,
          pair,
          segmentIds: personSegments.map((segment) => segment.segmentId),
          weight: 1,
          direct
        });
      }
    }
  }

  return { G, personPairContribution, personPairDetails };
}

function segmentEvidence(segment: SenaCodedSegment, peopleById: Map<string, SenaPerson>): SenaEvidenceSnippet {
  return {
    id: segment.segmentId,
    stage: segment.stage,
    personId: segment.personId,
    label: `${peopleById.get(segment.personId)?.label ?? segment.personId} - turn ${segment.turnIndex}`,
    text: segment.text,
    codes: segment.codes,
    lineage: {
      table: "coded_segments",
      rowId: segment.segmentId,
      related: {
        utteranceId: segment.utteranceId,
        segmentId: segment.segmentId,
        personId: segment.personId,
        codeIds: [...segment.codes]
      }
    }
  };
}

function socialEdgeEvidence(dataset: SenaDataset, source: string, target: string, undirected: boolean): SenaEvidenceSnippet[] {
  return dataset.interactions
    .filter((interaction) => {
      if (interaction.source === source && interaction.target === target) return true;
      return undirected && interaction.source === target && interaction.target === source;
    })
    .map((interaction, index) => ({
      id: `${source}-${target}-${index}`,
      stage: interaction.stage,
      label: `${interaction.channel} - weight ${interaction.weight ?? 1}`,
      text: interaction.evidence,
      lineage: {
        table: "interactions" as const,
        rowId: `${interaction.source}->${interaction.target}:${interaction.stage}:${interaction.turnIndex ?? index}`,
        related: {
          interactionId: `${interaction.source}->${interaction.target}:${interaction.stage}:${interaction.turnIndex ?? index}`,
          personId: interaction.source
        }
      }
    }));
}

// Cache stanza -> code-set per coded_segments array: conceptEdgeEvidence runs once
// per code pair, and rebuilding the stanza sets inside it made evidence collection
// O(pairs * segments^2) (P7). Keyed on the array identity so every dataset
// (including per-window scoped copies) gets its own entry.
const stanzaCodeSetsCache = new WeakMap<object, Map<string, Set<string>>>();

function stanzaCodeSets(dataset: SenaDataset): Map<string, Set<string>> {
  let byStanza = stanzaCodeSetsCache.get(dataset.coded_segments);
  if (!byStanza) {
    byStanza = new Map();
    for (const segment of dataset.coded_segments) {
      const key = `${segment.unitId}::${segment.stanzaId}`;
      let codes = byStanza.get(key);
      if (!codes) {
        codes = new Set<string>();
        byStanza.set(key, codes);
      }
      for (const code of segment.codes) codes.add(code);
    }
    stanzaCodeSetsCache.set(dataset.coded_segments, byStanza);
  }
  return byStanza;
}

function conceptEdgeEvidence(dataset: SenaDataset, codeA: string, codeB: string, peopleById: Map<string, SenaPerson>) {
  // Identical selection to the original filter/filter/slice(0,6)/map chain:
  // same segment order, same predicates, same cap — only the stanza code-set
  // lookup is precomputed instead of rescanned per segment.
  const byStanza = stanzaCodeSets(dataset);
  const evidence: ReturnType<typeof segmentEvidence>[] = [];
  for (const segment of dataset.coded_segments) {
    if (!segment.codes.includes(codeA) && !segment.codes.includes(codeB)) continue;
    const stanzaCodes = byStanza.get(`${segment.unitId}::${segment.stanzaId}`);
    if (!stanzaCodes?.has(codeA) || !stanzaCodes.has(codeB)) continue;
    evidence.push(segmentEvidence(segment, peopleById));
    if (evidence.length === 6) break;
  }
  return evidence;
}

function bridgeEvidence(dataset: SenaDataset, personId: string, codeId: string, peopleById: Map<string, SenaPerson>) {
  return dataset.coded_segments
    .filter((segment) => segment.personId === personId && segment.codes.includes(codeId))
    .slice(0, 6)
    .map((segment) => segmentEvidence(segment, peopleById));
}

function bridgeCpEvidence(dataset: SenaDataset, personId: string, codeId: string, peopleById: Map<string, SenaPerson>) {
  return dataset.coded_segments
    .filter((segment) => (segment.targetPersonIds ?? []).includes(personId) && segment.codes.includes(codeId))
    .slice(0, 6)
    .map((segment) => segmentEvidence(segment, peopleById));
}

function buildMetrics({
  dataset,
  S,
  W,
  B,
  socialAnalysis,
  personPairContribution
}: {
  dataset: SenaDataset;
  S: number[][];
  W: number[][];
  B: number[][];
  socialAnalysis: ReturnType<typeof buildSocialAnalysis>;
  personPairContribution: Map<string, Map<string, number>>;
}) {
  const codeIndex = idIndex(dataset.codebook, "code");
  const codeMap = new Map(dataset.codebook.map((code) => [code.id, code]));
  const socialStrengths = socialAnalysis.weightedDegree;
  const contributions = B.map((row) => sum(row));

  const conceptBrokerage = dataset.people.map((person) => {
    const pairs = personPairContribution.get(person.id);
    if (!pairs) return 0;
    let score = 0;
    for (const [pair, weight] of pairs.entries()) {
      const [a, b] = pair.split("|");
      const ai = codeIndex.get(a);
      const bi = codeIndex.get(b);
      if (ai === undefined || bi === undefined) continue;
      score += weight / (conceptBrokerageDamping + W[ai][bi]);
    }
    return score;
  });

  const zSocial = zScores(socialStrengths);
  const zContribution = zScores(contributions);
  const zBrokerage = zScores(conceptBrokerage);

  const personMetrics = dataset.people.map<SenaPersonMetrics>((person, personPosition) => {
    const neighborContribution = dataset.codebook.map((_, codePosition) => {
      return dataset.people.reduce((total, _peer, peerPosition) => {
        return total + S[personPosition][peerPosition] * B[peerPosition][codePosition];
      }, 0);
    });

    const pairMap = personPairContribution.get(person.id) ?? new Map<string, number>();

    return {
      socialStrength: socialStrengths[personPosition],
      socialDegree: socialAnalysis.degree[personPosition] ?? 0,
      socialBetweenness: socialAnalysis.betweenness[personPosition] ?? 0,
      socialCloseness: socialAnalysis.closeness[personPosition] ?? 0,
      socialComponent: socialAnalysis.componentLabels[personPosition] ?? -1,
      socialCommunity: socialAnalysis.communityLabels[personPosition] ?? -1,
      socialReachable: socialAnalysis.reachable[personPosition] ?? 0,
      epistemicContribution: contributions[personPosition],
      bridgeScore: (
        exploratoryBridgeScoreWeights.socialStrength * zSocial[personPosition] +
        exploratoryBridgeScoreWeights.epistemicContribution * zContribution[personPosition] +
        exploratoryBridgeScoreWeights.conceptBrokerage * zBrokerage[personPosition]
      ),
      epistemicDiversity: entropy(B[personPosition]),
      alignment: cosine(B[personPosition], neighborContribution),
      conceptBrokerage: conceptBrokerage[personPosition],
      topInteractors: topN(
        dataset.people
          .map((peer, peerPosition) => ({ id: peer.id, label: peer.label, weight: S[personPosition][peerPosition] }))
          .filter((peer) => peer.id !== person.id && peer.weight > 0),
        (peer) => peer.weight
      ),
      topCodes: topN(
        dataset.codebook
          .map((code, codePosition) => ({ id: code.id, label: code.label, weight: B[personPosition][codePosition] }))
          .filter((code) => code.weight > 0),
        (code) => code.weight
      ),
      topPairs: topN(
        Array.from(pairMap.entries()).map(([pair, weight]) => {
          const [a, b] = pair.split("|");
          return { pair, label: `${codeLabel(codeMap, a)} + ${codeLabel(codeMap, b)}`, weight };
        }),
        (pair) => pair.weight
      )
    };
  });

  const conceptMetrics = dataset.codebook.map((code, codePosition) => ({
    weightedDegree: sum(W[codePosition]),
    totalContribution: B.reduce((total, row) => total + row[codePosition], 0),
    topCooccurring: topN(
      dataset.codebook
        .map((other, otherPosition) => ({ id: other.id, label: other.label, weight: W[codePosition][otherPosition] }))
        .filter((other) => other.id !== code.id && other.weight > 0),
      (other) => other.weight
    ),
    topContributors: topN(
      dataset.people
        .map((person, personPosition) => ({ id: person.id, label: person.label, weight: B[personPosition][codePosition] }))
        .filter((person) => person.weight > 0),
      (person) => person.weight
    )
  }));

  return { personMetrics, conceptMetrics };
}

function buildEdges({
  dataset,
  S,
  W,
  B,
  Bcp,
  normalizedS,
  normalizedW,
  normalizedB,
  normalizedBcp,
  independentBridgeMatrices,
  options
}: {
  dataset: SenaDataset;
  S: number[][];
  W: number[][];
  B: number[][];
  Bcp: number[][];
  normalizedS: number[][];
  normalizedW: number[][];
  normalizedB: number[][];
  normalizedBcp: number[][];
  independentBridgeMatrices: boolean;
  options: Required<SenaBuildOptions>;
}) {
  const peopleById = new Map(dataset.people.map((person) => [person.id, person]));
  const edges: SenaEdge[] = [];

  for (let i = 0; i < dataset.people.length; i += 1) {
    for (let j = options.undirectedSocial ? i + 1 : 0; j < dataset.people.length; j += 1) {
      if (i === j || S[i][j] <= 0) continue;
      const source = dataset.people[i];
      const target = dataset.people[j];
      edges.push({
        id: `social:${source.id}:${target.id}`,
        layer: "social",
        edgeType: "PP",
        sourceKind: "person",
        targetKind: "person",
        source: source.id,
        target: target.id,
        weight: S[i][j],
        normalizedWeight: normalizedS[i][j],
        scaledWeight: options.alpha * normalizedS[i][j],
        label: options.undirectedSocial ? `${source.label} <-> ${target.label}` : `${source.label} -> ${target.label}`,
        evidence: socialEdgeEvidence(dataset, source.id, target.id, options.undirectedSocial)
      });
    }
  }

  for (let i = 0; i < dataset.codebook.length; i += 1) {
    for (let j = i + 1; j < dataset.codebook.length; j += 1) {
      if (W[i][j] <= 0) continue;
      const source = dataset.codebook[i];
      const target = dataset.codebook[j];
      edges.push({
        id: `concept:${source.id}:${target.id}`,
        layer: "concept",
        edgeType: "CC",
        sourceKind: "concept",
        targetKind: "concept",
        source: source.id,
        target: target.id,
        weight: W[i][j],
        normalizedWeight: normalizedW[i][j],
        scaledWeight: options.beta * normalizedW[i][j],
        label: `${source.label} + ${target.label}`,
        evidence: conceptEdgeEvidence(dataset, source.id, target.id, peopleById)
      });
    }
  }

  for (let personPosition = 0; personPosition < dataset.people.length; personPosition += 1) {
    for (let codePosition = 0; codePosition < dataset.codebook.length; codePosition += 1) {
      if (B[personPosition][codePosition] <= 0) continue;
      const person = dataset.people[personPosition];
      const code = dataset.codebook[codePosition];
      edges.push({
        id: `bridge:${person.id}:${code.id}`,
        layer: "bridge",
        edgeType: "PC",
        sourceKind: "person",
        targetKind: "concept",
        source: person.id,
        target: code.id,
        weight: B[personPosition][codePosition],
        normalizedWeight: normalizedB[personPosition][codePosition],
        scaledWeight: options.gamma * normalizedB[personPosition][codePosition],
        label: `${person.label} -> ${code.label}`,
        evidence: bridgeEvidence(dataset, person.id, code.id, peopleById)
      });
    }
  }

  if (independentBridgeMatrices) {
    for (let codePosition = 0; codePosition < dataset.codebook.length; codePosition += 1) {
      for (let personPosition = 0; personPosition < dataset.people.length; personPosition += 1) {
        if (Bcp[codePosition][personPosition] <= 0) continue;
        const code = dataset.codebook[codePosition];
        const person = dataset.people[personPosition];
        edges.push({
          id: `bridge:cp:${code.id}:${person.id}`,
          layer: "bridge",
          edgeType: "CP",
          sourceKind: "concept",
          targetKind: "person",
          source: code.id,
          target: person.id,
          weight: Bcp[codePosition][personPosition],
          normalizedWeight: normalizedBcp[codePosition][personPosition],
          scaledWeight: options.gamma * normalizedBcp[codePosition][personPosition],
          label: `${code.label} -> ${person.label}`,
          evidence: bridgeCpEvidence(dataset, person.id, code.id, peopleById)
        });
      }
    }
  }

  return edges;
}

function buildFusionMatrix(S: number[][], W: number[][], B: number[][], Bcp: number[][], options: Required<SenaBuildOptions>) {
  return buildSenaFusionAdjacency({
    S,
    W,
    B,
    Bcp,
    alpha: options.alpha,
    beta: options.beta,
    gamma: options.gamma
  });
}

function orderedTurns(dataset: SenaDataset) {
  return Array.from(new Set([
    ...dataset.utterances.map((utterance) => utterance.turnIndex),
    ...dataset.coded_segments.map((segment) => segment.turnIndex)
  ])).filter((turn) => Number.isFinite(turn)).sort((a, b) => a - b);
}

function orderedStages(dataset: SenaDataset) {
  const stageTurns = new Map<string, number>();
  for (const item of [...dataset.utterances, ...dataset.coded_segments]) {
    const current = stageTurns.get(item.stage);
    stageTurns.set(item.stage, current === undefined ? item.turnIndex : Math.min(current, item.turnIndex));
  }
  for (const interaction of dataset.interactions) {
    if (!stageTurns.has(interaction.stage)) stageTurns.set(interaction.stage, Number.MAX_SAFE_INTEGER);
  }
  return Array.from(stageTurns.entries()).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([stage]) => stage);
}

function interactionInTurnWindow(
  interaction: SenaDataset["interactions"][number],
  startTurn: number,
  endTurn: number,
  fallbackStages: Set<string>
) {
  if (typeof interaction.turnIndex === "number" && Number.isFinite(interaction.turnIndex)) {
    return interaction.turnIndex >= startTurn && interaction.turnIndex <= endTurn;
  }
  return fallbackStages.has(interaction.stage);
}

function buildTemporalWindow({
  dataset,
  mode,
  index,
  label,
  utterances,
  segments,
  interactions,
  startTurn,
  endTurn,
  centerTurn
}: {
  dataset: SenaDataset;
  mode: SenaTemporalMode;
  index: number;
  label: string;
  utterances: SenaUtterance[];
  segments: SenaCodedSegment[];
  interactions: SenaDataset["interactions"];
  startTurn: number;
  endTurn: number;
  centerTurn?: number;
}): SenaTemporalWindow {
  const codeMap = new Map(dataset.codebook.map((code) => [code.id, code]));
  const stages = unique([
    ...utterances.map((utterance) => utterance.stage),
    ...segments.map((segment) => segment.stage),
    ...interactions.map((interaction) => interaction.stage)
  ]).filter(Boolean);
  const stanzas = groupBy(segments, (segment) => `${segment.unitId}::${segment.stanzaId}`);
  const rawConceptConnectivity = Array.from(stanzas.values()).reduce((total, stanzaSegments) => {
    const activeCodes = unique(stanzaSegments.flatMap((segment) => segment.codes));
    return total + combinations(activeCodes).length;
  }, 0);
  const codeWeights = new Map<string, number>();
  for (const segment of segments) {
    for (const code of segment.codes) {
      codeWeights.set(code, (codeWeights.get(code) ?? 0) + (segment.confidence ?? 1));
    }
  }

  return {
    id: `${mode}:${index}:${startTurn}-${endTurn}`,
    label,
    mode,
    index,
    startTurn,
    endTurn,
    centerTurn,
    stages,
    utteranceIds: utterances.map((utterance) => utterance.id),
    segmentIds: segments.map((segment) => segment.segmentId),
    interactionCount: interactions.length,
    segmentCount: segments.length,
    evidence: segments.slice(0, 5).map((segment) => ({
      id: segment.segmentId,
      stage: segment.stage,
      personId: segment.personId,
      label: `Turn ${segment.turnIndex}`,
      text: segment.text,
      codes: segment.codes,
      lineage: {
        table: "temporal_window" as const,
        rowId: `${mode}:${index}:${startTurn}-${endTurn}`,
        related: {
          windowId: `${mode}:${index}:${startTurn}-${endTurn}`,
          utteranceId: segment.utteranceId,
          segmentId: segment.segmentId,
          personId: segment.personId,
          codeIds: [...segment.codes]
        }
      }
    })),
    rawSocialConnectivity: sum(interactions.map((interaction) => interaction.weight ?? 1)),
    rawConceptConnectivity,
    rawBridgeIntegration: sum(segments.map((segment) => segment.codes.length)),
    socialConnectivity: 0,
    conceptConnectivity: 0,
    bridgeIntegration: 0,
    topCodes: topN(
      Array.from(codeWeights.entries()).map(([id, weight]) => ({
        id,
        label: codeMap.get(id)?.label ?? id,
        weight
      })),
      (code) => code.weight,
      4
    )
  };
}

function normalizeTemporalWindows(windows: SenaTemporalWindow[]) {
  const maxOrOne = (values: number[]) => Math.max(1, ...values);
  const maxSocial = maxOrOne(windows.map((window) => window.rawSocialConnectivity));
  const maxConcept = maxOrOne(windows.map((window) => window.rawConceptConnectivity));
  const maxBridge = maxOrOne(windows.map((window) => window.rawBridgeIntegration));

  return windows.map((window) => ({
    ...window,
    socialConnectivity: window.rawSocialConnectivity / maxSocial,
    conceptConnectivity: window.rawConceptConnectivity / maxConcept,
    bridgeIntegration: window.rawBridgeIntegration / maxBridge
  }));
}

function buildTemporalWindows(dataset: SenaDataset, settings: SenaTemporalOptions) {
  const turns = orderedTurns(dataset);
  const byTurn = (turnStart: number, turnEnd: number) => {
    const utterances = dataset.utterances.filter((utterance) => utterance.turnIndex >= turnStart && utterance.turnIndex <= turnEnd);
    const segments = dataset.coded_segments.filter((segment) => segment.turnIndex >= turnStart && segment.turnIndex <= turnEnd);
    const stages = new Set([...utterances.map((utterance) => utterance.stage), ...segments.map((segment) => segment.stage)]);
    const interactions = dataset.interactions.filter((interaction) => interactionInTurnWindow(interaction, turnStart, turnEnd, stages));
    return { utterances, segments, interactions };
  };

  if (settings.mode === "stage") {
    const windows = orderedStages(dataset).map((stage, index) => {
      const utterances = dataset.utterances.filter((utterance) => utterance.stage === stage);
      const segments = dataset.coded_segments.filter((segment) => segment.stage === stage);
      const interactions = dataset.interactions.filter((interaction) => interaction.stage === stage);
      const stageTurns = [...utterances.map((utterance) => utterance.turnIndex), ...segments.map((segment) => segment.turnIndex)];
      const startTurn = Math.min(...stageTurns, index + 1);
      const endTurn = Math.max(...stageTurns, startTurn);
      return buildTemporalWindow({
        dataset,
        mode: "stage",
        index,
        label: stage,
        utterances,
        segments,
        interactions,
        startTurn,
        endTurn
      });
    });
    return normalizeTemporalWindows(windows);
  }

  if (settings.mode === "moving-window") {
    const size = settings.movingWindowSize;
    const step = settings.movingWindowStep;
    const windows: SenaTemporalWindow[] = [];
    for (let startIndex = 0; startIndex < turns.length; startIndex += step) {
      const selectedTurns = turns.slice(startIndex, startIndex + size);
      if (selectedTurns.length === 0) continue;
      const startTurn = selectedTurns[0];
      const endTurn = selectedTurns[selectedTurns.length - 1];
      const scoped = byTurn(startTurn, endTurn);
      windows.push(buildTemporalWindow({
        dataset,
        mode: "moving-window",
        index: windows.length,
        label: `Turns ${startTurn}-${endTurn}`,
        ...scoped,
        startTurn,
        endTurn
      }));
      if (startIndex + size >= turns.length) break;
    }
    return normalizeTemporalWindows(windows);
  }

  const radius = settings.turnWindowRadius;
  const windows = turns.map((turn, index) => {
    const startTurn = turn - radius;
    const endTurn = turn + radius;
    const scoped = byTurn(startTurn, endTurn);
    return buildTemporalWindow({
      dataset,
      mode: "turn-window",
      index,
      label: `Turn ${turn}`,
      ...scoped,
      startTurn,
      endTurn,
      centerTurn: turn
    });
  });
  return normalizeTemporalWindows(windows);
}

export function scopeSenaDatasetToWindow(dataset: SenaDataset, window: SenaTemporalWindow): SenaDataset {
  const utteranceIds = new Set(window.utteranceIds);
  const segmentIds = new Set(window.segmentIds);
  const stages = new Set(window.stages);
  const codedSegments = dataset.coded_segments.filter((segment) => segmentIds.has(segment.segmentId));
  const codedUtteranceIds = new Set(codedSegments.map((segment) => segment.utteranceId));

  return {
    ...dataset,
    people: dataset.people.map((person) => ({ ...person })),
    codebook: dataset.codebook.map((code) => ({ ...code })),
    utterances: dataset.utterances
      .filter((utterance) => utteranceIds.has(utterance.id) || codedUtteranceIds.has(utterance.id))
      .map((utterance) => ({ ...utterance })),
    coded_segments: codedSegments.map((segment) => ({
      ...segment,
      codes: [...segment.codes],
      targetPersonIds: segment.targetPersonIds ? [...segment.targetPersonIds] : undefined
    })),
    interactions: dataset.interactions
      // Stage windows are defined by stage membership in buildTemporalWindows, so
      // scope their interactions the same way. Using the turn range here (as the
      // turn/moving-window modes require) would disagree with the window's own
      // interactionCount/rawSocialConnectivity whenever interactions carry a
      // turnIndex outside their stage's utterance turn span, and would drop the
      // interactions of a stage that has no utterances/segments (start==end).
      .filter((interaction) => (
        window.mode === "stage"
          ? stages.has(interaction.stage)
          : interactionInTurnWindow(interaction, window.startTurn, window.endTurn, stages)
      ))
      .map((interaction) => ({ ...interaction })),
    warnings: dataset.warnings ? [...dataset.warnings] : undefined
  };
}

function strongest(edges: SenaEdge[], layer: SenaEdge["layer"]) {
  return topN(edges.filter((edge) => edge.layer === layer), (edge) => edge.weight, 1)[0];
}

function buildMatrixBlock(labels: string[], raw: number[][], normalized: number[][]): SenaMatrixBlock {
  return { labels, raw, normalized };
}

function buildSocialReport({
  dataset,
  S,
  socialAnalysis,
  personMetrics,
  undirected
}: {
  dataset: SenaDataset;
  S: number[][];
  socialAnalysis: ReturnType<typeof buildSocialAnalysis>;
  personMetrics: SenaPersonMetrics[];
  undirected: boolean;
}): SenaSocialReport {
  const actors = dataset.people.map((person, index) => {
    const metrics = personMetrics[index];
    return {
      id: person.id,
      label: person.label,
      role: person.role,
      group: person.group,
      degree: metrics.socialDegree,
      strength: metrics.socialStrength,
      betweenness: metrics.socialBetweenness,
      closeness: metrics.socialCloseness,
      reachable: metrics.socialReachable,
      component: metrics.socialComponent,
      community: metrics.socialCommunity,
      topInteractors: metrics.topInteractors
    };
  });

  const communitiesById = new Map<number, number[]>();
  actors.forEach((actor, index) => {
    if (actor.community < 0) return;
    communitiesById.set(actor.community, [...(communitiesById.get(actor.community) ?? []), index]);
  });

  const communities = Array.from(communitiesById.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([community, memberIndexes]) => {
      const memberSet = new Set(memberIndexes);
      let internalWeight = 0;
      let externalWeight = 0;

      for (let i = 0; i < S.length; i += 1) {
        for (let j = 0; j < S.length; j += 1) {
          const weight = S[i]?.[j] ?? 0;
          if (weight <= 0) continue;

          const sourceInside = memberSet.has(i);
          const targetInside = memberSet.has(j);
          if (sourceInside && targetInside) internalWeight += weight;
          else if (sourceInside || targetInside) externalWeight += weight;
        }
      }

      const divisor = undirected ? 2 : 1;
      const members = memberIndexes.map((index) => dataset.people[index]);
      return {
        id: community,
        label: `Community ${community + 1}`,
        size: members.length,
        memberIds: members.map((person) => person.id),
        members: members.map((person) => person.label),
        internalWeight: internalWeight / divisor,
        externalWeight: externalWeight / divisor
      };
    });

  return {
    graph: {
      engine: socialAnalysis.engine,
      mode: socialGraphMode(undirected),
      density: socialAnalysis.density,
      tieCount: socialAnalysis.tieCount,
      reciprocity: socialAnalysis.reciprocity,
      connected: socialAnalysis.connected,
      componentCount: socialAnalysis.componentCount,
      largestComponentSize: socialAnalysis.largestComponentSize,
      averagePathLength: socialAnalysis.averagePathLength,
      communityCount: socialAnalysis.communityCount,
      communityDetection: "sna.js labelPropagation() deterministic weighted label propagation over the social layer"
    },
    actors,
    communities
  };
}

function buildPairReport(
  dataset: SenaDataset,
  codePairs: SenaCodePair[],
  G: number[][],
  personPairDetails: Map<string, Map<string, PairContributionDetail>>
): SenaPairReport[] {
  const peopleById = new Map(dataset.people.map((person) => [person.id, person]));
  const segmentById = new Map(dataset.coded_segments.map((segment) => [segment.segmentId, segment]));

  return codePairs.map((pair, pairPosition) => ({
    ...pair,
    totalContribution: sum(G.map((row) => row[pairPosition] ?? 0)),
    evidence: conceptEdgeEvidence(dataset, pair.codeA, pair.codeB, peopleById),
    topContributors: topN(
      dataset.people
        .map((person, personPosition) => {
          const detail = personPairDetails.get(person.id)?.get(pair.id);
          return {
            id: person.id,
            label: person.label,
            weight: G[personPosition]?.[pairPosition] ?? 0,
            directWeight: detail?.directWeight ?? 0,
            supportingWeight: detail?.supportingWeight ?? 0,
            evidence: Array.from(detail?.segmentIds ?? [])
              .map((segmentId) => segmentById.get(segmentId))
              .filter((segment): segment is SenaCodedSegment => Boolean(segment))
              .slice(0, 4)
              .map((segment) => segmentEvidence(segment, peopleById))
          };
        })
        .filter((person) => person.weight > 0),
      (person) => person.weight,
      5
    )
  }));
}

function resolveBuildOptions(buildOptions: Partial<SenaBuildOptions>): SenaResolvedBuildOptions {
  const direction = buildOptions.direction ?? (
    buildOptions.undirectedSocial === true ? "undirected" : defaultOptions.direction
  );

  return {
    ...defaultOptions,
    ...buildOptions,
    bridgeWeightRule: buildOptions.bridgeWeightRule ?? defaultOptions.bridgeWeightRule,
    direction,
    deg_convention: buildOptions.deg_convention ?? defaultOptions.deg_convention,
    delta: buildOptions.delta ?? defaultOptions.delta,
    Phi: buildOptions.Phi ?? defaultOptions.Phi,
    d: buildOptions.d ?? defaultOptions.d,
    seed: buildOptions.seed ?? defaultOptions.seed,
    undirectedSocial: buildOptions.undirectedSocial ?? direction === "undirected",
    temporal: {
      ...defaultOptions.temporal,
      ...(buildOptions.temporal ?? {})
    }
  };
}

export function buildSenaModel(dataset: SenaDataset, buildOptions: Partial<SenaBuildOptions> = {}): SenaModel {
  validateSenaAnalyticalInputs({ dataset, buildOptions });
  const options = resolveBuildOptions(buildOptions);
  const personIndex = idIndex(dataset.people, "person");
  const codeIndex = idIndex(dataset.codebook, "code");
  const codePairs = buildCodePairs(dataset);

  const social = buildSocialMatrix(dataset, personIndex, options.undirectedSocial);
  const concept = buildConceptMatrix(dataset, codeIndex);
  const bridge = buildBridgeMatrix(dataset, personIndex, codeIndex, options.bridgeWeightRule);
  const participation = buildParticipationMatrix(dataset, personIndex);
  const pairContribution = buildPairContribution(dataset, personIndex, codeIndex, codePairs);
  const socialAnalysis = buildSocialAnalysis(social.S, social.directedS, options.undirectedSocial);

  const normalizedSResult = normalizeSenaMatrix(social.S, options.normalization);
  const normalizedWResult = normalizeSenaMatrix(concept.W, options.normalization);
  const normalizedBResult = normalizeSenaMatrix(bridge.B, options.normalization);
  const normalizedBcpResult = normalizeSenaMatrix(bridge.Bcp, options.normalization);
  const normalizedGResult = normalizeSenaMatrix(pairContribution.G, options.normalization);
  const normalizedS = normalizedSResult.values;
  const normalizedW = normalizedWResult.values;
  const normalizedB = normalizedBResult.values;
  const normalizedBcp = normalizedBcpResult.values;
  const normalizedG = normalizedGResult.values;
  const fusion = buildFusionMatrix(normalizedS, normalizedW, normalizedB, normalizedBcp, options);
  const { personMetrics, conceptMetrics } = buildMetrics({
    dataset,
    S: social.S,
    W: concept.W,
    B: bridge.B,
    socialAnalysis,
    personPairContribution: pairContribution.personPairContribution
  });

  const personNodes: SenaNode[] = dataset.people.map((person, index) => ({
    id: person.id,
    kind: "person",
    label: person.label,
    role: person.role,
    group: person.group,
    initials: person.initials ?? person.label.slice(0, 2).toUpperCase(),
    metrics: personMetrics[index]
  }));

  const conceptNodes: SenaNode[] = dataset.codebook.map((code, index) => ({
    id: code.id,
    kind: "concept",
    label: code.label,
    family: code.family,
    color: code.color,
    description: code.description,
    metrics: conceptMetrics[index]
  }));

  const edges = buildEdges({
    dataset,
    S: social.S,
    W: concept.W,
    B: bridge.B,
    Bcp: bridge.Bcp,
    normalizedS,
    normalizedW,
    normalizedB,
    normalizedBcp,
    independentBridgeMatrices: bridge.hasIndependentCpEvidence,
    options
  });

  const socialEdges = edges.filter((edge) => edge.layer === "social");
  const conceptEdges = edges.filter((edge) => edge.layer === "concept");
  const bridgeEdges = edges.filter((edge) => edge.layer === "bridge");
  const socialReport = buildSocialReport({
    dataset,
    S: social.S,
    socialAnalysis,
    personMetrics,
    undirected: options.undirectedSocial
  });
  const pairReport = buildPairReport(dataset, codePairs, pairContribution.G, pairContribution.personPairDetails);
  const temporalWindows = buildTemporalWindows(dataset, options.temporal);

  const fusionLabels = [...dataset.people.map((person) => person.label), ...dataset.codebook.map((code) => code.label)];
  const runIdentity = {
    hashAlgorithm: "sena-stable-fnv1a32/v1" as const,
    datasetVersion: dataset.metadata?.datasetVersion ?? "unversioned",
    datasetContentHash: buildSenaDatasetContentHash(dataset),
    configHash: buildSenaAnalysisConfigHash(options)
  };
  const degreeVector = senaDegreeVector(fusion);
  const isolatedVertices = findSenaIsolatedVertices(fusion, fusionLabels);
  const embeddingDiagnostics = buildEmbeddingDiagnostics(fusion, isolatedVertices, options);
  const bridgeWeightingDiagnostics = buildBridgeWeightingDiagnostics(dataset, options.bridgeWeightRule);
  const directionDiagnostics = buildDirectionDiagnostics(options, bridge.B, bridge.Bcp, bridge.hasIndependentCpEvidence);
  const attributionDiagnostics = buildAttributionDiagnostics(dataset, pairContribution.G, personIndex, codeIndex, participation);
  const typedCentralityDiagnostics = buildTypedCentralityDiagnostics(dataset, social.S, concept.W, bridge.B, degreeVector);

  return {
    dataset,
    options,
    nodes: [...personNodes, ...conceptNodes],
    edges,
    matrices: {
      S: buildMatrixBlock(dataset.people.map((person) => person.label), social.S, normalizedS),
      W: buildMatrixBlock(dataset.codebook.map((code) => code.label), concept.W, normalizedW),
      B: {
        rowLabels: dataset.people.map((person) => person.label),
        columnLabels: dataset.codebook.map((code) => code.label),
        raw: bridge.B,
        normalized: normalizedB
      },
      B_PC: {
        rowLabels: dataset.people.map((person) => person.label),
        columnLabels: dataset.codebook.map((code) => code.label),
        raw: bridge.B,
        normalized: normalizedB
      },
      B_CP: {
        rowLabels: dataset.codebook.map((code) => code.label),
        columnLabels: dataset.people.map((person) => person.label),
        raw: bridge.Bcp,
        normalized: normalizedBcp
      },
      Y: {
        rowLabels: dataset.people.map((person) => person.label),
        columnLabels: participation.windowIds,
        windowIds: participation.windowIds,
        raw: participation.Y
      },
      G: {
        rowLabels: dataset.people.map((person) => person.label),
        columnLabels: codePairs.map((pair) => pair.label),
        pairIds: codePairs.map((pair) => pair.id),
        pairs: codePairs,
        raw: pairContribution.G,
        normalized: normalizedG
      },
      fusion: {
        labels: fusionLabels,
        values: fusion
      }
    },
    operatorDiagnostics: {
      runIdentity,
      analysisConfig: {
        direction: options.direction,
        deg_convention: options.deg_convention,
        delta: options.delta,
        Phi: options.Phi,
        d: options.d,
        seed: options.seed
      },
      degreeConvention: options.deg_convention,
      degreeVector,
      isolatedVertices,
      normalization: {
        S: normalizationDiagnostic(normalizedSResult),
        W: normalizationDiagnostic(normalizedWResult),
        B: normalizationDiagnostic(normalizedBResult),
        B_CP: normalizationDiagnostic(normalizedBcpResult),
        G: normalizationDiagnostic(normalizedGResult)
      },
      bridgeWeighting: bridgeWeightingDiagnostics,
      direction: directionDiagnostics,
      embedding: embeddingDiagnostics,
      attribution: attributionDiagnostics,
      typedCentrality: typedCentralityDiagnostics
    },
    people: dataset.people,
    codes: dataset.codebook,
    utterances: dataset.utterances,
    timeline: temporalWindows,
    temporal: {
      settings: options.temporal,
      windows: temporalWindows
    },
    socialReport,
    pairReport,
    summary: {
      people: dataset.people.length,
      concepts: dataset.codebook.length,
      socialEdges: socialEdges.length,
      conceptEdges: conceptEdges.length,
      bridgeEdges: bridgeEdges.length,
      socialDensity: socialAnalysis.density,
      socialAnalysis: {
        engine: socialAnalysis.engine,
        density: socialAnalysis.density,
        tieCount: socialAnalysis.tieCount,
        reciprocity: socialAnalysis.reciprocity,
        connected: socialAnalysis.connected,
        componentCount: socialAnalysis.componentCount,
        largestComponentSize: socialAnalysis.largestComponentSize,
        averagePathLength: socialAnalysis.averagePathLength,
        communityCount: socialAnalysis.communityCount
      },
      strongestSocialTie: strongest(edges, "social"),
      strongestConceptTie: strongest(edges, "concept"),
      strongestBridgeTie: strongest(edges, "bridge"),
      warnings: [...(dataset.warnings ?? []), ...social.warnings, ...concept.warnings, ...bridge.warnings]
    }
  };
}
