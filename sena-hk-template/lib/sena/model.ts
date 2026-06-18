import {
  averagePathLength as snaAveragePathLength,
  betweenness,
  closeness as snaCloseness,
  components,
  degree,
  gden,
  grecip,
  isConnected,
  labelPropagation,
  nties,
  reachability,
  type GraphMode
} from "sna.js";
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
  SenaNormalization,
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
  alpha: 0.72,
  beta: 0.64,
  gamma: 0.86,
  normalization: "max",
  undirectedSocial: true,
  temporal: {
    mode: "stage",
    movingWindowSize: 3,
    movingWindowStep: 1,
    turnWindowRadius: 1
  }
};

function makeMatrix(rows: number, columns = rows) {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => 0));
}

function cloneMatrix(matrix: number[][]) {
  return matrix.map((row) => [...row]);
}

function matrixMax(matrix: number[][]) {
  return matrix.reduce((max, row) => Math.max(max, ...row.map((value) => Math.abs(value))), 0);
}

function normalizeMatrix(matrix: number[][], normalization: SenaNormalization) {
  if (normalization === "none") return cloneMatrix(matrix);

  const transformed = normalization === "log-max"
    ? matrix.map((row) => row.map((value) => Math.log1p(value)))
    : cloneMatrix(matrix);
  const max = matrixMax(transformed);
  if (max === 0) return transformed;
  return transformed.map((row) => row.map((value) => value / max));
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
  const closeness = snaCloseness(S, graphOptions);
  const reachable = reachability(S, graphOptions).counts;
  const communityResult = labelPropagation(S, graphOptions);
  const reciprocity = grecip(directedS, { mode: "digraph", diag: false, measure: "edgewise" });

  return {
    engine: "sna.js",
    density: S.length <= 1 ? 0 : gden(S, graphOptions),
    tieCount: nties(S, graphOptions),
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
  const stanzas = groupBy(dataset.coded_segments, (segment) => segment.stanzaId);

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

function buildBridgeMatrix(dataset: SenaDataset, personIndex: Map<string, number>, codeIndex: Map<string, number>) {
  const B = makeMatrix(dataset.people.length, dataset.codebook.length);
  const warnings: string[] = [];

  for (const segment of dataset.coded_segments) {
    const person = personIndex.get(segment.personId);
    if (person === undefined) {
      warnings.push(`Segment ${segment.segmentId} references unknown person "${segment.personId}".`);
      continue;
    }
    for (const code of segment.codes) {
      const codePosition = codeIndex.get(code);
      if (codePosition === undefined) {
        warnings.push(`Segment ${segment.segmentId} references unknown code "${code}".`);
        continue;
      }
      B[person][codePosition] += segment.confidence ?? 1;
    }
  }

  return { B, warnings };
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
  const stanzas = groupBy(dataset.coded_segments, (segment) => segment.stanzaId);

  const addContribution = ({
    personId,
    personPosition,
    pair,
    segmentId,
    weight,
    direct
  }: {
    personId: string;
    personPosition: number;
    pair: string;
    segmentId: string;
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
    detail.segmentIds.add(segmentId);
    detailMap.set(pair, detail);
    personPairDetails.set(personId, detailMap);
  };

  for (const segments of stanzas.values()) {
    const allCodes = unique(segments.flatMap((segment) => segment.codes)).filter((code) => codeIndex.has(code));
    const activePairIds = combinations(allCodes).map(([a, b]) => sortedPair(a, b));
    for (const segment of segments) {
      const personPosition = personIndex.get(segment.personId);
      if (personPosition === undefined) continue;

      const contributedCodes = unique(segment.codes).filter((code) => codeIndex.has(code));
      const contributed = new Set(contributedCodes);
      const directPairIds = new Set(combinations(contributedCodes).map(([a, b]) => sortedPair(a, b)));
      for (const pair of activePairIds) {
        const [a, b] = pair.split("|");
        if (!a || !b) continue;
        if (!contributed.has(a) && !contributed.has(b)) continue;

        const direct = directPairIds.has(pair);
        const weight = (segment.confidence ?? 1) * (direct ? 1 : 0.5);
        addContribution({
          personId: segment.personId,
          personPosition,
          pair,
          segmentId: segment.segmentId,
          weight,
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

function conceptEdgeEvidence(dataset: SenaDataset, codeA: string, codeB: string, peopleById: Map<string, SenaPerson>) {
  return dataset.coded_segments
    .filter((segment) => segment.codes.includes(codeA) || segment.codes.includes(codeB))
    .filter((segment) => {
      const stanzaSegments = dataset.coded_segments.filter((candidate) => candidate.stanzaId === segment.stanzaId);
      const stanzaCodes = new Set(stanzaSegments.flatMap((candidate) => candidate.codes));
      return stanzaCodes.has(codeA) && stanzaCodes.has(codeB);
    })
    .slice(0, 6)
    .map((segment) => segmentEvidence(segment, peopleById));
}

function bridgeEvidence(dataset: SenaDataset, personId: string, codeId: string, peopleById: Map<string, SenaPerson>) {
  return dataset.coded_segments
    .filter((segment) => segment.personId === personId && segment.codes.includes(codeId))
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
      score += weight / (0.5 + W[ai][bi]);
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
      bridgeScore: 0.5 * zSocial[personPosition] + 0.3 * zContribution[personPosition] + 0.2 * zBrokerage[personPosition],
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
  normalizedS,
  normalizedW,
  normalizedB,
  options
}: {
  dataset: SenaDataset;
  S: number[][];
  W: number[][];
  B: number[][];
  normalizedS: number[][];
  normalizedW: number[][];
  normalizedB: number[][];
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

  return edges;
}

function buildFusionMatrix(S: number[][], W: number[][], B: number[][], options: Required<SenaBuildOptions>) {
  const peopleCount = S.length;
  const codeCount = W.length;
  const fusion = makeMatrix(peopleCount + codeCount);

  for (let i = 0; i < peopleCount; i += 1) {
    for (let j = 0; j < peopleCount; j += 1) {
      fusion[i][j] = options.alpha * S[i][j];
    }
  }

  for (let i = 0; i < peopleCount; i += 1) {
    for (let a = 0; a < codeCount; a += 1) {
      fusion[i][peopleCount + a] = options.gamma * B[i][a];
      fusion[peopleCount + a][i] = options.gamma * B[i][a];
    }
  }

  for (let a = 0; a < codeCount; a += 1) {
    for (let b = 0; b < codeCount; b += 1) {
      fusion[peopleCount + a][peopleCount + b] = options.beta * W[a][b];
    }
  }

  return fusion;
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
  const stanzas = groupBy(segments, (segment) => segment.stanzaId);
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
    const size = Math.max(1, Math.round(settings.movingWindowSize));
    const step = Math.max(1, Math.round(settings.movingWindowStep));
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

  const radius = Math.max(0, Math.round(settings.turnWindowRadius));
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
    coded_segments: codedSegments.map((segment) => ({ ...segment, codes: [...segment.codes] })),
    interactions: dataset.interactions
      .filter((interaction) => interactionInTurnWindow(interaction, window.startTurn, window.endTurn, stages))
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
  return {
    ...defaultOptions,
    ...buildOptions,
    undirectedSocial: buildOptions.undirectedSocial ?? defaultOptions.undirectedSocial,
    temporal: {
      ...defaultOptions.temporal,
      ...(buildOptions.temporal ?? {})
    }
  };
}

export function buildSenaModel(dataset: SenaDataset, buildOptions: Partial<SenaBuildOptions> = {}): SenaModel {
  const options = resolveBuildOptions(buildOptions);
  const personIndex = idIndex(dataset.people, "person");
  const codeIndex = idIndex(dataset.codebook, "code");
  const codePairs = buildCodePairs(dataset);

  const social = buildSocialMatrix(dataset, personIndex, options.undirectedSocial);
  const concept = buildConceptMatrix(dataset, codeIndex);
  const bridge = buildBridgeMatrix(dataset, personIndex, codeIndex);
  const pairContribution = buildPairContribution(dataset, personIndex, codeIndex, codePairs);
  const socialAnalysis = buildSocialAnalysis(social.S, social.directedS, options.undirectedSocial);

  const normalizedS = normalizeMatrix(social.S, options.normalization);
  const normalizedW = normalizeMatrix(concept.W, options.normalization);
  const normalizedB = normalizeMatrix(bridge.B, options.normalization);
  const normalizedG = normalizeMatrix(pairContribution.G, options.normalization);
  const fusion = buildFusionMatrix(normalizedS, normalizedW, normalizedB, options);
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
    normalizedS,
    normalizedW,
    normalizedB,
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
      G: {
        rowLabels: dataset.people.map((person) => person.label),
        columnLabels: codePairs.map((pair) => pair.label),
        pairIds: codePairs.map((pair) => pair.id),
        pairs: codePairs,
        raw: pairContribution.G,
        normalized: normalizedG
      },
      fusion: {
        labels: [...dataset.people.map((person) => person.label), ...dataset.codebook.map((code) => code.label)],
        values: fusion
      }
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
