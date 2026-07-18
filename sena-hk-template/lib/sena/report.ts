import type {
  SenaBuildOptions,
  SenaActiveWindowBrief,
  SenaActiveWindowComparison,
  SenaClaimReadinessGate,
  SenaCodingReliabilityGate,
  SenaCodingReliabilityReview,
  SenaDataContractAudit,
  SenaDataGovernanceMetadata,
  SenaDataset,
  SenaEdge,
  SenaEnaManifest,
  SenaEvidenceLedger,
  SenaEnaReportArtifact,
  SenaEvidenceSource,
  SenaFusionLayerTotals,
  SenaFusionMathAudit,
  SenaInterpretationGuardrail,
  SenaLayer,
  SenaMatrixBlock,
  SenaMetricProvenance,
  SenaMetricProvenanceArtifact,
  SenaModel,
  SenaNormalization,
  SenaNullModelCheck,
  SenaPairMatrixBlock,
  SenaPairReport,
  SenaPairContributionReportArtifact,
  SenaPilotReadinessAudit,
  SenaReport,
  SenaReportCompletenessAudit,
  SenaReportCompletenessItem,
  SenaReportEvidenceSnippet,
  SenaReportHumanReview,
  SenaRuntimeConsistencyAudit,
  SenaSensitivityCheck,
  SenaSensitivityVariant,
  SenaSnaReportArtifact,
  SenaSnaManifest,
  SenaTemporalMode,
  SenaTemporalRuntimeNarrativeWindow,
  SenaTemporalRuntimeTrace,
  SenaTemporalWindow,
  SenaTemporalStabilityVariant,
  SenaValidation
} from "./types";
import { buildSenaModel } from "./model";
import { buildSenaEnaManifest } from "./ena-manifest";
import { buildSenaSnaManifest } from "./sna-manifest";
import { buildSenaRuntimeConsistencyAudit } from "./runtime-consistency";
import { buildSenaClaimReadinessGate, buildSenaPilotReadinessAudit } from "./pilot-readiness";
import { buildSenaFusionMathAudit } from "./fusion-math";
import { buildSenaDataContractAudit } from "./data-contract-audit";
import { buildSenaTemporalRuntimeTrace } from "./temporal-runtime";
import { buildSenaModelCard } from "./model-card";
import { buildSenaAttributionWordingCopy } from "./attribution-wording";
import { buildSenaJenaConceptPairHandoffRows } from "./jena-handoff";
import { buildSenaJsnaSocialTieHandoffRows } from "./jsna-handoff";
import { senaRuntimeProvenance } from "./runtime-constants";
import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { senaVisualGrammar } from "./visual-grammar";
import { SENA_ADMISSIBLE_NORMALIZATIONS } from "./operators";

export type SenaReportOptions = {
  title?: string;
  generatedAt?: string;
  activeTemporalWindow?: SenaEvidenceLedger["analysisWindow"];
  sourceDataset?: SenaDataset;
  evidenceLimit?: number;
  nullModelIterations?: number;
  humanReview?: Partial<SenaReportHumanReview>;
  codingReliability?: Partial<SenaCodingReliabilityReview>;
  dataGovernance?: Partial<Omit<SenaDataGovernanceMetadata, "schemaVersion" | "status" | "requiredEvidence" | "blockers" | "guardrail">> & Partial<Pick<SenaDataGovernanceMetadata, "usageConstraints">>;
};

export type SenaEvidenceLedgerOptions = SenaReportOptions;

export type SenaSnaReportArtifactOptions = {
  title?: string;
  generatedAt?: string;
  activeTemporalWindow?: SenaTemporalWindow | null;
};

export type SenaEnaReportArtifactOptions = SenaSnaReportArtifactOptions;

export type SenaPairContributionReportArtifactOptions = SenaSnaReportArtifactOptions;

export type SenaMetricProvenanceArtifactOptions = SenaSnaReportArtifactOptions;

const pendingReviewText = "Pending human review.";
const pendingReliabilityText = "Pending coding reliability documentation.";
const defaultNullModelIterations = 12;
const nullModelSeed = 20260608;
const runtimeProvenance = senaRuntimeProvenance;

const interpretationGuardrails: SenaInterpretationGuardrail[] = [
  {
    id: "typed-graph-not-causality",
    label: "Observed structure, not causality",
    statement: "A_fusion is a normalized typed adjacency model for observed social-epistemic relations; it is not a causal model or inferential test by itself."
  },
  {
    id: "layout-distance-boundary",
    label: "Layout distance boundary",
    statement: "Explanatory and ENA-space layouts use position for readability; cross-layer distances should not be interpreted as strict statistical distances."
  },
  {
    id: "joint-embedding-boundary",
    label: "Joint embedding boundary",
    statement: "Joint mode uses declared A_fusion embedding operators: Laplacian eigenmaps, MDS + Schoenberg, or commute-time; cross-type distance claims must carry operator, delta, dimension, seed, metric exactness, and stress."
  },
  {
    id: "human-review-required",
    label: "Human review required",
    statement: "Interpretations should be reviewed against original utterance evidence, coding reliability, and the study context before publication or instructional action."
  }
];

const metricProvenance: SenaMetricProvenance[] = [
  {
    id: "social-density",
    label: "Density",
    scope: "social-graph",
    source: "sna.js",
    implementation: "sna.js gden() over the S block with diag=false.",
    parityStatus: "Covered by R sna parity fixtures.",
    interpretationLimit: "Density is a social-layer quantity only; it does not measure epistemic quality."
  },
  {
    id: "social-tie-count",
    label: "Tie count",
    scope: "social-graph",
    source: "sna.js",
    implementation: "sna.js nties() over the S block with diag=false.",
    parityStatus: "Covered by R sna parity fixtures.",
    interpretationLimit: "Undirected mode counts collapsed person-person ties after SENA symmetrization."
  },
  {
    id: "social-degree",
    label: "Degree",
    scope: "social-actor",
    source: "sna.js",
    implementation: "sna.js degree(ignoreEval=true) over the S block.",
    parityStatus: "Covered by R sna parity fixtures.",
    interpretationLimit: "Degree counts social neighbors, not code contribution."
  },
  {
    id: "social-strength",
    label: "Weighted social strength",
    scope: "social-actor",
    source: "sna.js",
    implementation: "sna.js degree(ignoreEval=false) over the weighted S block.",
    parityStatus: "Covered by R sna parity fixtures.",
    interpretationLimit: "Strength is sensitive to the interaction-weight convention used to build S."
  },
  {
    id: "components",
    label: "Weak components and connectivity",
    scope: "social-graph",
    source: "sna.js",
    implementation: "sna.js components() and isConnected() over the S block.",
    parityStatus: "Covered by R sna parity fixtures.",
    interpretationLimit: "Components are computed on the social layer, not on the full typed fusion graph."
  },
  {
    id: "path-closeness",
    label: "Average path, closeness, and reachable actors",
    scope: "social-actor",
    source: "sna.js",
    implementation: "sna.js geodist() component-scoped closeness, reachability(), and averagePathLength() over the S block.",
    parityStatus: "Covered by R sna geodist-derived parity fixtures.",
    interpretationLimit: "Disconnected nodes use reachable-only closeness; compare only under the same convention."
  },
  {
    id: "betweenness",
    label: "Betweenness",
    scope: "social-actor",
    source: "sna.js",
    implementation: "sna.js betweenness(cmode=\"undirected\", rescale=false) over the S block.",
    parityStatus: "Covered by R sna::betweenness fixtures for selected graph families.",
    interpretationLimit: "Current betweenness ignores edge weights as distances; weighted brokerage needs a declared distance transform."
  },
  {
    id: "reciprocity",
    label: "Reciprocity",
    scope: "social-graph",
    source: "sna.js",
    implementation: "sna.js grecip(measure=\"edgewise\") over the directed interaction matrix.",
    parityStatus: "Covered by R sna::grecip(edgewise) fixtures.",
    interpretationLimit: "Reciprocity uses directed raw interactions even when the displayed S block is undirected."
  },
  {
    id: "community",
    label: "Community detection",
    scope: "community",
    source: "sna.js",
    implementation: "sna.js labelPropagation() deterministic weighted label propagation over the social layer.",
    parityStatus: "Checked against an igraph label-propagation fixture and repeat-stability checks.",
    interpretationLimit: "Community labels are exploratory partitions, not inferential group claims."
  },
  {
    id: "jena-connection-counts",
    label: "jENA connection counts and ENA-space positions",
    scope: "concept",
    source: "jena-js",
    implementation: "jena-js ena() computes adjacency keys, connection counts, line weights, unit points, and code node positions from coded_segments.",
    parityStatus: "Covered by bundled rENA fixture parity for line weights, connection counts, variance, unit points, and node positions; runtime consistency also checks jENA concept-pair signal handoff to the SENA W matrix.",
    interpretationLimit: "jENA positions and line weights describe coded discourse structure under the manifest settings; they are not causal or reliability evidence."
  },
  {
    id: "bridge-score",
    label: "Bridge score",
    scope: "bridge",
    source: "sena-composite",
    implementation: "Exploratory SENA composite: 0.5*z(S social strength) + 0.3*z(B person-code total) + 0.2*z(concept brokerage).",
    parityStatus: "SENA-specific composite; no R sna parity target.",
    interpretationLimit: "Bridge score is an exploratory ranking helper and must not be interpreted as an established SNA or ENA measure."
  },
  {
    id: "concept-brokerage",
    label: "Concept brokerage",
    scope: "bridge",
    source: "sena-composite",
    implementation: "Exploratory person-code-pair score: sum G_i(pair)/(W_ab + damping constant 0.5), where W_ab is the raw concept co-occurrence count.",
    parityStatus: "SENA-specific exploratory composite; no R sna parity target.",
    interpretationLimit: "Concept brokerage is exploratory and sensitive to the declared damping constant and raw W co-occurrence scale."
  },
  {
    id: "alignment",
    label: "Alignment",
    scope: "bridge",
    source: "sena-composite",
    implementation: "Cosine similarity between a person's B row and their social-neighbor exposure vector (S x B).",
    parityStatus: "SENA-specific exploratory composite; no R sna parity target.",
    interpretationLimit: "Alignment is a descriptive exposure helper, not peer influence, causal uptake, or coding-reliability evidence."
  },
  {
    id: "g-person-code-pair",
    label: "Person-code-pair contribution G",
    scope: "bridge",
    source: "sena-self-implemented",
    implementation: "SENA person-code-pair attribution uses G_i = X^T diag(Y_i) X over unit/stanza participation windows; G-hat divides each row by the person's Y participation total with 0/0 -> 0.",
    parityStatus: "SENA-specific attribution layer; validated through participation-matrix, evidence-link, and matrix tests.",
    interpretationLimit: "G indicates association with code-pair windows unless person-specific code-pair evidence is available."
  },
  {
    id: "fusion-matrix",
    label: "Fusion matrix",
    scope: "fusion",
    source: "sena-self-implemented",
    implementation: "SENA normalized block matrix [alpha*S gamma*B_PC; gamma*B_CP beta*W].",
    parityStatus: "Covered by S/W/B/B_PC/B_CP/G/fusion matrix tests and sensitivity checks.",
    interpretationLimit: "Fusion adjacency is not a kernel, causal model, or inferential test by itself."
  }
];

function formatReportNumber(value: number, digits = 3) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
}

function countBy<T extends string>(values: T[]) {
  const counts = new Map<T, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return Array.from(counts.entries()).map(([value, count]) => ({ value, count }));
}

function resolveDataGovernanceMetadata(options: SenaReportOptions, generatedAt: string): SenaDataGovernanceMetadata {
  const governance = options.dataGovernance ?? {};
  const usageConstraints = Array.isArray(governance.usageConstraints)
    ? governance.usageConstraints.map((constraint) => String(constraint).trim()).filter(Boolean)
    : [];
  const irbApprovalId = governance.irbApprovalId?.trim() ?? "";
  const consentScope = governance.consentScope?.trim() ?? "";
  const retentionPolicy = governance.retentionPolicy?.trim() ?? "";
  const dataSteward = governance.dataSteward?.trim() ?? "";
  const blockers = [
    irbApprovalId ? null : "IRB/ethics approval ID",
    consentScope ? null : "Consent scope",
    retentionPolicy ? null : "Data retention policy",
    usageConstraints.length > 0 ? null : "Usage constraints",
    dataSteward ? null : "Data steward"
  ].filter((item): item is string => Boolean(item));

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.dataGovernanceMetadata,
    status: blockers.length === 0 ? "complete" : "needs-review",
    irbApprovalId,
    consentScope,
    retentionPolicy,
    usageConstraints,
    dataSteward,
    reviewedAt: governance.reviewedAt?.trim() || generatedAt,
    requiredEvidence: [
      "IRB/ethics approval ID",
      "Consent scope",
      "Data retention policy",
      "Usage constraints",
      "Data steward"
    ],
    blockers,
    guardrail: "SENA data-governance metadata documents approval, consent, retention, and use constraints; it does not replace institutional ethics review."
  };
}

function datasetCounts(dataset: SenaDataset) {
  return {
    people: dataset.people.length,
    interactions: dataset.interactions.length,
    utterances: dataset.utterances.length,
    codedSegments: dataset.coded_segments.length,
    codes: dataset.codebook.length
  };
}

function matrixValueTotal(values: number[][]) {
  return values.reduce((total, row) => total + row.reduce((rowTotal, value) => rowTotal + (Number.isFinite(value) ? value : 0), 0), 0);
}

function shareOf(current: number, baseline: number) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || Math.abs(baseline) < 1e-9) return null;
  return current / baseline;
}

function markdownCell(value: string | number) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function collectEvidenceSnippets(model: SenaModel, limit: number): SenaReportEvidenceSnippet[] {
  const snippets: SenaReportEvidenceSnippet[] = [];
  const seen = new Set<string>();
  const edgeSource: Record<SenaLayer, SenaReportEvidenceSnippet["source"]> = {
    social: "social-edge",
    concept: "concept-edge",
    bridge: "bridge-edge"
  };

  const addSnippets = ({
    source,
    sourceId,
    sourceLabel,
    evidence
  }: {
    source: SenaReportEvidenceSnippet["source"];
    sourceId: string;
    sourceLabel: string;
    evidence: SenaReportEvidenceSnippet[];
  }) => {
    for (const snippet of evidence) {
      const key = `${source}:${sourceId}:${snippet.id}:${snippet.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      snippets.push({
        ...snippet,
        source,
        sourceId,
        sourceLabel
      });
      if (snippets.length >= limit) return;
    }
  };

  const rankedEdges = [...model.edges].sort((a, b) => b.scaledWeight - a.scaledWeight || a.label.localeCompare(b.label));
  for (const edge of rankedEdges) {
    addSnippets({
      source: edgeSource[edge.layer],
      sourceId: edge.id,
      sourceLabel: edge.label,
      evidence: edge.evidence.map((snippet) => ({
        ...snippet,
        source: edgeSource[edge.layer],
        sourceId: edge.id,
        sourceLabel: edge.label
      }))
    });
    if (snippets.length >= limit) return snippets;
  }

  const activePairs = [...model.pairReport]
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label));
  for (const pair of activePairs) {
    addSnippets({
      source: "pair-contribution",
      sourceId: pair.id,
      sourceLabel: pair.label,
      evidence: pair.evidence.map((snippet) => ({
        ...snippet,
        source: "pair-contribution",
        sourceId: pair.id,
        sourceLabel: pair.label
      }))
    });
    if (snippets.length >= limit) return snippets;
  }

  for (const window of model.temporal.windows) {
    addSnippets({
      source: "temporal-window",
      sourceId: window.id,
      sourceLabel: window.label,
      evidence: window.evidence.map((snippet) => ({
        ...snippet,
        source: "temporal-window",
        sourceId: window.id,
        sourceLabel: window.label
      }))
    });
    if (snippets.length >= limit) return snippets;
  }

  return snippets;
}

function edgeHighlight(edge?: SenaEdge): SenaActiveWindowComparison["topSignals"]["currentTopConceptTie"] {
  if (!edge) return undefined;
  return {
    id: edge.id,
    layer: edge.layer,
    label: edge.label,
    source: edge.source,
    target: edge.target,
    weight: edge.weight,
    normalizedWeight: edge.normalizedWeight,
    scaledWeight: edge.scaledWeight
  };
}

function pairHighlight(pair?: SenaPairReport): SenaActiveWindowComparison["topSignals"]["currentTopGPair"] {
  if (!pair || pair.totalContribution <= 0) return undefined;
  return {
    id: pair.id,
    label: pair.label,
    codeA: pair.codeA,
    codeB: pair.codeB,
    totalContribution: pair.totalContribution,
    topContributors: pair.topContributors
      .filter((contributor) => contributor.weight > 0)
      .slice(0, 3)
      .map((contributor) => ({
        id: contributor.id,
        label: contributor.label,
        weight: contributor.weight,
        directWeight: contributor.directWeight,
        supportingWeight: contributor.supportingWeight
      }))
  };
}

function topGPair(model: SenaModel) {
  return [...model.pairReport]
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label))[0];
}

function rankedEdges(model: SenaModel, layer: SenaLayer) {
  return [...model.edges]
    .filter((edge) => edge.layer === layer && edge.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
}

function rankedGPairs(model: SenaModel) {
  return [...model.pairReport]
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label));
}

function rankingShare(weight: number, items: Array<{ weight: number }>) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  return shareOf(weight, total);
}

function edgeRankingContext({
  id,
  label,
  layer,
  currentEdge,
  baselineEdges,
  interpretation
}: {
  id: SenaActiveWindowComparison["rankingContext"][number]["id"];
  label: string;
  layer: SenaActiveWindowComparison["rankingContext"][number]["layer"];
  currentEdge?: SenaEdge;
  baselineEdges: SenaEdge[];
  interpretation: string;
}): SenaActiveWindowComparison["rankingContext"][number] {
  const baselineIndex = currentEdge ? baselineEdges.findIndex((edge) => edge.id === currentEdge.id) : -1;
  const baselineEdge = baselineIndex >= 0 ? baselineEdges[baselineIndex] : undefined;
  return {
    id,
    label,
    layer,
    signalLabel: currentEdge?.label ?? "NA",
    currentWeight: currentEdge?.weight ?? 0,
    baselineWeight: baselineEdge?.weight ?? 0,
    baselineRank: baselineIndex >= 0 ? baselineIndex + 1 : null,
    baselineItemCount: baselineEdges.length,
    baselineShare: baselineEdge ? rankingShare(baselineEdge.weight, baselineEdges) : null,
    interpretation
  };
}

function gPairRankingContext({
  currentPair,
  baselinePairs
}: {
  currentPair?: SenaPairReport;
  baselinePairs: SenaPairReport[];
}): SenaActiveWindowComparison["rankingContext"][number] {
  const baselineIndex = currentPair ? baselinePairs.findIndex((pair) => pair.id === currentPair.id) : -1;
  const baselinePair = baselineIndex >= 0 ? baselinePairs[baselineIndex] : undefined;
  const baselineItems = baselinePairs.map((pair) => ({ weight: pair.totalContribution }));
  return {
    id: "top-g-pair",
    label: "Top current-window G pair",
    layer: "G",
    signalLabel: currentPair?.label ?? "NA",
    currentWeight: currentPair?.totalContribution ?? 0,
    baselineWeight: baselinePair?.totalContribution ?? 0,
    baselineRank: baselineIndex >= 0 ? baselineIndex + 1 : null,
    baselineItemCount: baselinePairs.length,
    baselineShare: baselinePair ? rankingShare(baselinePair.totalContribution, baselineItems) : null,
    interpretation: "Ranks the active person-code-pair contribution against all full-conversation G pairs."
  };
}

function buildActiveWindowComparison(
  model: SenaModel,
  sourceDataset: SenaDataset | undefined,
  activeWindow: SenaTemporalWindow | null | undefined
): SenaActiveWindowComparison | null {
  if (!activeWindow || !sourceDataset) return null;

  const baselineModel = buildSenaModel(sourceDataset, model.options);
  const currentGTotal = model.pairReport.reduce((total, pair) => total + pair.totalContribution, 0);
  const baselineGTotal = baselineModel.pairReport.reduce((total, pair) => total + pair.totalContribution, 0);
  const currentFusionTotal = matrixValueTotal(model.matrices.fusion.values);
  const baselineFusionTotal = matrixValueTotal(baselineModel.matrices.fusion.values);
  const currentTopGPair = topGPair(model);
  const baselineTopGPair = topGPair(baselineModel);
  const baselineSocialEdges = rankedEdges(baselineModel, "social");
  const baselineConceptEdges = rankedEdges(baselineModel, "concept");
  const baselineBridgeEdges = rankedEdges(baselineModel, "bridge");
  const baselineGPairs = rankedGPairs(baselineModel);
  const metricInputs: Array<Omit<SenaActiveWindowComparison["metrics"][number], "delta" | "share">> = [
    {
      id: "sna-density",
      label: "SNA density",
      current: model.socialReport.graph.density,
      baseline: baselineModel.socialReport.graph.density
    },
    {
      id: "social-ties",
      label: "S ties",
      current: model.summary.socialEdges,
      baseline: baselineModel.summary.socialEdges
    },
    {
      id: "ena-links",
      label: "W ENA links",
      current: model.summary.conceptEdges,
      baseline: baselineModel.summary.conceptEdges
    },
    {
      id: "bridge-links",
      label: "B bridges",
      current: model.summary.bridgeEdges,
      baseline: baselineModel.summary.bridgeEdges
    },
    {
      id: "g-total",
      label: "G total",
      current: currentGTotal,
      baseline: baselineGTotal
    },
    {
      id: "fusion-total",
      label: "A_fusion",
      current: currentFusionTotal,
      baseline: baselineFusionTotal
    }
  ];

  return {
    currentWindow: activeWindow,
    baselineScope: "full-conversation",
    sourceDatasetCounts: datasetCounts(sourceDataset),
    analysisDatasetCounts: datasetCounts(model.dataset),
    metrics: metricInputs.map((metric) => ({
      ...metric,
      delta: metric.current - metric.baseline,
      share: shareOf(metric.current, metric.baseline)
    })),
    topSignals: {
      currentTopConceptTie: edgeHighlight(model.summary.strongestConceptTie),
      baselineTopConceptTie: edgeHighlight(baselineModel.summary.strongestConceptTie),
      currentTopGPair: pairHighlight(currentTopGPair),
      baselineTopGPair: pairHighlight(baselineTopGPair)
    },
    rankingContext: [
      edgeRankingContext({
        id: "top-social-tie",
        label: "Top current-window S tie",
        layer: "S",
        currentEdge: model.summary.strongestSocialTie,
        baselineEdges: baselineSocialEdges,
        interpretation: "Ranks the active social tie against all full-conversation S ties."
      }),
      edgeRankingContext({
        id: "top-concept-tie",
        label: "Top current-window W tie",
        layer: "W",
        currentEdge: model.summary.strongestConceptTie,
        baselineEdges: baselineConceptEdges,
        interpretation: "Ranks the active ENA concept co-occurrence against all full-conversation W links."
      }),
      edgeRankingContext({
        id: "top-bridge-tie",
        label: "Top current-window B bridge",
        layer: "B",
        currentEdge: model.summary.strongestBridgeTie,
        baselineEdges: baselineBridgeEdges,
        interpretation: "Ranks the active person-code bridge against all full-conversation B bridges."
      }),
      gPairRankingContext({
        currentPair: currentTopGPair,
        baselinePairs: baselineGPairs
      })
    ],
    interpretationGuardrail: "Active-window comparison is descriptive: it compares the scoped analysis window with the full source dataset under the same alpha/beta/gamma and normalization settings; it is not an inferential or causal test."
  };
}

function briefShareText(value: number | null) {
  return value === null ? "NA" : `${formatReportNumber(value * 100, 1)}%`;
}

function briefRankText(rank: number | null, count: number) {
  return rank === null ? "NA" : `${rank}/${count}`;
}

export function buildSenaActiveWindowBrief(
  model: SenaModel,
  options: {
    activeTemporalWindow?: SenaTemporalWindow | null;
    sourceDataset?: SenaDataset;
    activeWindowComparison?: SenaActiveWindowComparison | null;
    evidenceSnippets?: SenaReportEvidenceSnippet[];
    humanReview?: SenaReportHumanReview;
    codingReliabilityGate?: SenaCodingReliabilityGate;
  } = {}
): SenaActiveWindowBrief | null {
  const activeWindow = options.activeTemporalWindow ?? null;
  if (!activeWindow) return null;

  const comparison = options.activeWindowComparison ?? buildActiveWindowComparison(model, options.sourceDataset, activeWindow);
  if (!comparison) return null;

  const dominantSignals = comparison.rankingContext.map((entry) => ({
    layer: entry.layer,
    label: entry.signalLabel,
    currentWeight: entry.currentWeight,
    fullConversationRank: entry.baselineRank,
    fullConversationShare: entry.baselineShare
  }));
  const topW = dominantSignals.find((signal) => signal.layer === "W");
  const topG = dominantSignals.find((signal) => signal.layer === "G");
  const evidenceSnippets = (options.evidenceSnippets ?? collectEvidenceSnippets(model, 6)).slice(0, 6);
  const codingReliabilityReady = options.codingReliabilityGate?.status === "ready";
  const humanReviewed = options.humanReview?.status === "human-reviewed";
  const headlineParts = [
    `Window ${activeWindow.label} is scoped to turns ${activeWindow.startTurn}-${activeWindow.endTurn}`,
    topW?.label && topW.label !== "NA" ? `top W signal ${topW.label}` : "no active W signal",
    topG?.label && topG.label !== "NA" ? `top G signal ${topG.label}` : "no active G signal"
  ];

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.activeWindowBrief,
    window: {
      id: activeWindow.id,
      label: activeWindow.label,
      mode: activeWindow.mode,
      turns: `${activeWindow.startTurn}-${activeWindow.endTurn}`,
      stages: activeWindow.stages,
      utterances: activeWindow.utteranceIds.length,
      interactions: activeWindow.interactionCount,
      segments: activeWindow.segmentCount,
      evidenceRefs: activeWindow.evidence.length
    },
    headline: `${headlineParts.join("; ")}. Treat this as an inspection brief, not a claim.`,
    dominantSignals,
    globalContext: comparison.rankingContext.map((entry) => (
      `${entry.layer}: ${entry.signalLabel} ranks ${briefRankText(entry.baselineRank, entry.baselineItemCount)} in the full conversation with ${briefShareText(entry.baselineShare)} of that layer's baseline signal.`
    )),
    evidenceCues: evidenceSnippets.map((snippet) => ({
      source: snippet.source,
      sourceId: snippet.sourceId,
      sourceLabel: snippet.sourceLabel,
      text: snippet.text
    })),
    reviewChecklist: [
      {
        id: "active-window-baseline",
        label: "Active-window baseline",
        status: comparison.rankingContext.length >= 4 ? "present" : "needed",
        detail: "Current S/W/B/G signals are ranked against the full-conversation baseline under the same build options."
      },
      {
        id: "evidence-ledger",
        label: "Evidence ledger",
        status: evidenceSnippets.length > 0 ? "present" : "needed",
        detail: `${evidenceSnippets.length} evidence cue${evidenceSnippets.length === 1 ? "" : "s"} are attached for human inspection.`
      },
      {
        id: "coding-reliability",
        label: "Coding reliability",
        status: codingReliabilityReady ? "present" : "needed",
        detail: codingReliabilityReady ? "Coding reliability gate is documented." : "Coding reliability gate remains required before research claims."
      },
      {
        id: "human-review",
        label: "Human review",
        status: humanReviewed ? "present" : "needed",
        detail: humanReviewed ? "Human review is marked complete." : "Human interpretation fields remain draft or incomplete."
      }
    ],
    guardrails: [
      comparison.interpretationGuardrail,
      "The brief summarizes observed active-window signals and full-conversation ranks; it does not infer causality, learning quality, or participant ability.",
      "Use the original evidence snippets, coding-reliability gate, and human-review fields before writing substantive interpretations."
    ]
  };
}

function evidenceSourceCounts(snippets: SenaReportEvidenceSnippet[]): Record<SenaEvidenceSource, number> {
  const counts: Record<SenaEvidenceSource, number> = {
    "social-edge": 0,
    "concept-edge": 0,
    "bridge-edge": 0,
    "pair-contribution": 0,
    "temporal-window": 0
  };

  for (const snippet of snippets) counts[snippet.source] += 1;
  return counts;
}

function completenessItem(
  id: string,
  label: string,
  passed: boolean,
  summary: string,
  evidence: string[]
): SenaReportCompletenessItem {
  return {
    id,
    label,
    status: passed ? "pass" : "review",
    summary,
    evidence
  };
}

function matrixDimensionsAreComplete(model: SenaModel) {
  const people = model.dataset.people.length;
  const codes = model.dataset.codebook.length;
  const codePairs = (codes * Math.max(0, codes - 1)) / 2;
  const square = (values: number[][], size: number) => values.length === size && values.every((row) => row.length === size);
  const rectangular = (values: number[][], rows: number, columns: number) => values.length === rows && values.every((row) => row.length === columns);

  return square(model.matrices.S.raw, people) &&
    square(model.matrices.W.raw, codes) &&
    rectangular(model.matrices.B.raw, people, codes) &&
    rectangular(model.matrices.B_PC.raw, people, codes) &&
    rectangular(model.matrices.B_CP.raw, codes, people) &&
    rectangular(model.matrices.Y.raw, people, model.matrices.Y.windowIds.length) &&
    rectangular(model.matrices.G.raw, people, codePairs) &&
    square(model.matrices.fusion.values, people + codes);
}

export function buildSenaReportCompletenessAudit({
  model,
  analysisWindow,
  enaManifest,
  snaManifest,
  runtimeConsistencyAudit,
  dataContractAudit,
  fusionMathAudit,
  evidenceSnippets,
  humanReview,
  codingReliabilityGate,
  dataGovernance
}: {
  model: SenaModel;
  analysisWindow?: SenaReport["analysisWindow"];
  enaManifest: SenaEnaManifest;
  snaManifest: SenaSnaManifest;
  runtimeConsistencyAudit: SenaRuntimeConsistencyAudit;
  dataContractAudit: SenaDataContractAudit;
  fusionMathAudit: SenaFusionMathAudit;
  evidenceSnippets: SenaReportEvidenceSnippet[];
  humanReview: SenaReportHumanReview;
  codingReliabilityGate: SenaCodingReliabilityGate;
  dataGovernance?: Partial<SenaDataGovernanceMetadata>;
}): SenaReportCompletenessAudit {
  const options = model.options;
  const hasFiniteWeights = [options.alpha, options.beta, options.gamma].every(Number.isFinite);
  const evidenceCounts = evidenceSourceCounts(evidenceSnippets);
  const scopeWindow = analysisWindow ?? null;
  const hasExplicitScope = !scopeWindow || (
    Boolean(scopeWindow.id) &&
    Boolean(scopeWindow.label) &&
    Boolean(scopeWindow.mode) &&
    Number.isFinite(scopeWindow.startTurn) &&
    Number.isFinite(scopeWindow.endTurn) &&
    scopeWindow.startTurn <= scopeWindow.endTurn
  );
  const matrixFingerprintIds = fusionMathAudit.matrixFingerprints.map((fingerprint) => fingerprint.id);
  const matrixFingerprintsComplete = JSON.stringify(matrixFingerprintIds) === JSON.stringify(["S", "W", "B", "B_PC", "B_CP", "G", "A_fusion"]) &&
    fusionMathAudit.matrixFingerprints.every((fingerprint) => (
      fingerprint.checksumAlgorithm === "sena-stable-fnv1a32/v1" &&
      /^0x[a-f0-9]{8}$/.test(fingerprint.checksum) &&
      fingerprint.shape.includes("x")
    ));
  const fusionMatrixFingerprint = fusionMathAudit.matrixFingerprints.find((fingerprint) => fingerprint.id === "A_fusion");
  const humanReviewComplete = humanReview.status === "human-reviewed" &&
    Boolean(humanReview.reviewer.trim()) &&
    Boolean(humanReview.interpretation.trim()) &&
    Boolean(humanReview.limitations.trim()) &&
    Boolean(humanReview.nextActions.trim()) &&
    humanReview.interpretation !== pendingReviewText &&
    humanReview.limitations !== pendingReviewText &&
    humanReview.nextActions !== pendingReviewText;
  const dataGovernanceUsageConstraints = Array.isArray(dataGovernance?.usageConstraints)
    ? dataGovernance.usageConstraints.map((constraint) => String(constraint).trim()).filter(Boolean)
    : [];
  const dataGovernanceBlockers = [
    dataGovernance?.irbApprovalId?.trim() ? null : "IRB/ethics approval ID",
    dataGovernance?.consentScope?.trim() ? null : "Consent scope",
    dataGovernance?.retentionPolicy?.trim() ? null : "Data retention policy",
    dataGovernanceUsageConstraints.length > 0 ? null : "Usage constraints",
    dataGovernance?.dataSteward?.trim() ? null : "Data steward"
  ].filter((item): item is string => Boolean(item));

  const items = [
    completenessItem(
      "parameters",
      "Build parameters",
      hasFiniteWeights && Boolean(options.normalization) && Boolean(options.temporal.mode),
      `alpha=${formatReportNumber(options.alpha)}, beta=${formatReportNumber(options.beta)}, gamma=${formatReportNumber(options.gamma)}, normalization=${options.normalization}, temporal=${options.temporal.mode}`,
      [
        `undirectedSocial=${options.undirectedSocial}`,
        `movingWindowSize=${options.temporal.movingWindowSize}`,
        `movingWindowStep=${options.temporal.movingWindowStep}`,
        `turnWindowRadius=${options.temporal.turnWindowRadius}`
      ]
    ),
    completenessItem(
      "analysis-scope",
      "Analysis scope",
      hasExplicitScope,
      scopeWindow
        ? `${scopeWindow.label} window (${scopeWindow.mode}; turns ${scopeWindow.startTurn}-${scopeWindow.endTurn})`
        : "Full conversation analysis",
      scopeWindow ? [
        `windowId=${scopeWindow.id}`,
        `stages=${scopeWindow.stages.join(", ") || "All"}`,
        `utterances=${scopeWindow.utteranceIds.length}`,
        `interactions=${scopeWindow.interactionCount}`,
        `segments=${scopeWindow.segmentCount}`,
        `reportDataset=${model.dataset.people.length} people/${model.dataset.utterances.length} utterances/${model.dataset.coded_segments.length} segments`
      ] : [
        "scope=full-conversation",
        `temporalMode=${model.temporal.settings.mode}`,
        `windows=${model.temporal.windows.length}`,
        `reportDataset=${model.dataset.people.length} people/${model.dataset.utterances.length} utterances/${model.dataset.coded_segments.length} segments`
      ]
    ),
    completenessItem(
      "data-contract-audit",
      "Data contract audit",
      dataContractAudit.status === "valid",
      `${dataContractAudit.passed} data-contract checks passed; ${dataContractAudit.reviewNeeded} need review`,
      dataContractAudit.items.map((auditItem) => `${auditItem.label}: ${auditItem.status}`)
    ),
    completenessItem(
      "matrices",
      "S/W/B/B_PC/B_CP/Y/G/fusion matrices",
      matrixDimensionsAreComplete(model) && matrixFingerprintsComplete,
      `${model.matrices.S.labels.length} S labels, ${model.matrices.W.labels.length} W labels, ${model.matrices.Y.windowIds.length} Y windows, ${model.matrices.G.pairs.length} G pairs, ${model.matrices.fusion.labels.length} fusion labels`,
      [
        `S=${model.matrices.S.raw.length}x${model.matrices.S.raw[0]?.length ?? 0}`,
        `W=${model.matrices.W.raw.length}x${model.matrices.W.raw[0]?.length ?? 0}`,
        `B=${model.matrices.B.raw.length}x${model.matrices.B.raw[0]?.length ?? 0}`,
        `B_PC=${model.matrices.B_PC.raw.length}x${model.matrices.B_PC.raw[0]?.length ?? 0}`,
        `B_CP=${model.matrices.B_CP.raw.length}x${model.matrices.B_CP.raw[0]?.length ?? 0}`,
        `Y=${model.matrices.Y.raw.length}x${model.matrices.Y.raw[0]?.length ?? 0}`,
        `G=${model.matrices.G.raw.length}x${model.matrices.G.raw[0]?.length ?? 0}`,
        `fusion=${model.matrices.fusion.values.length}x${model.matrices.fusion.values[0]?.length ?? 0}`,
        `matrixFingerprints=${fusionMathAudit.matrixFingerprints.length}`,
        `A_fusionChecksum=${fusionMatrixFingerprint?.checksum ?? "missing"}`
      ]
    ),
    completenessItem(
      "fusion-math-audit",
      "Fusion equation audit",
      fusionMathAudit.status === "verified",
      `${fusionMathAudit.passed} formula checks passed; ${fusionMathAudit.reviewNeeded} need review`,
      fusionMathAudit.items.map((item) => `${item.label}: ${item.status}`)
    ),
    completenessItem(
      "jena-manifest",
      "jENA manifest",
      enaManifest.status === "computed",
      `${enaManifest.engine} ${enaManifest.engineVersion}; status=${enaManifest.status}`,
      [
        `rows=${enaManifest.datasetCounts.rows}`,
        `units=${enaManifest.datasetCounts.units}`,
        `codes=${enaManifest.datasetCounts.codes}`,
        `dimensions=${enaManifest.outputs?.dimensions.join(", ") || "NA"}`
      ]
    ),
    completenessItem(
      "jsna-manifest",
      "jSNA manifest",
      snaManifest.status === "computed",
      `${snaManifest.engineAlias}/${snaManifest.engine} ${snaManifest.engineVersion}; status=${snaManifest.status}`,
      [
        `people=${snaManifest.datasetCounts.people}`,
        `interactions=${snaManifest.datasetCounts.interactions}`,
        `weightedTies=${snaManifest.datasetCounts.weightedTies}`,
        `communities=${snaManifest.datasetCounts.communities}`,
        `components=${snaManifest.datasetCounts.components}`
      ]
    ),
    completenessItem(
      "runtime-api-surface",
      "jENA/jSNA API surface audit",
      runtimeConsistencyAudit.items.some((auditItem) => auditItem.id === "jena-api-surface" && auditItem.status === "pass") &&
        runtimeConsistencyAudit.items.some((auditItem) => auditItem.id === "jsna-api-surface" && auditItem.status === "pass"),
      "Concrete local JavaScript API surface is recorded and audited for jENA and jSNA.",
      [
        `jENA=${runtimeProvenance.enaRuntime.apiSurface.join(", ") || "none"}`,
        `jSNA=${runtimeProvenance.snaRuntime.apiSurface.join(", ") || "none"}`,
        ...runtimeConsistencyAudit.items
          .filter((auditItem) => auditItem.id === "jena-api-surface" || auditItem.id === "jsna-api-surface")
          .map((auditItem) => `${auditItem.id}:${auditItem.status}`)
      ]
    ),
    completenessItem(
      "temporal-trace",
      "Temporal trace",
      model.temporal.windows.length > 0,
      `${model.temporal.windows.length} ${model.temporal.settings.mode} windows`,
      model.temporal.windows.slice(0, 5).map((window) => `${window.label}: turns ${window.startTurn}-${window.endTurn}`)
    ),
    completenessItem(
      "evidence",
      "Evidence snippets",
      evidenceSnippets.length > 0,
      `${evidenceSnippets.length} traceable evidence snippets`,
      Object.entries(evidenceCounts).map(([source, count]) => `${source}=${count}`)
    ),
    completenessItem(
      "validation",
      "Method validation",
      model.summary.people > 0 && model.summary.concepts > 0 && metricProvenance.length > 0,
      `${metricProvenance.length} metric provenance entries; null target ${model.matrices.G.pairs[0]?.label ?? "NA"}`,
      [
        "layer-weight sensitivity",
        "normalization sensitivity",
        "community stability",
        "temporal stability",
        "permutation/bootstrap null models"
      ]
    ),
    completenessItem(
      "guardrails",
      "Interpretation guardrails",
      interpretationGuardrails.length >= 3,
      `${interpretationGuardrails.length} guardrails included`,
      interpretationGuardrails.map((guardrail) => guardrail.label)
    ),
    completenessItem(
      "coding-reliability",
      "Coding reliability gate",
      codingReliabilityGate.status === "ready",
      codingReliabilityGate.status === "ready"
        ? `Coding reliability documented by ${codingReliabilityGate.review.reviewer}`
        : "Coding reliability evidence is incomplete",
      [
        `status=${codingReliabilityGate.review.status}`,
        `reviewer=${codingReliabilityGate.review.reviewer || "unassigned"}`,
        `codingScheme=${codingReliabilityGate.review.codingScheme && codingReliabilityGate.review.codingScheme !== pendingReliabilityText ? "present" : "missing"}`,
        `unitOfCoding=${codingReliabilityGate.review.unitOfCoding && codingReliabilityGate.review.unitOfCoding !== pendingReliabilityText ? "present" : "missing"}`,
        `coderCount=${codingReliabilityGate.review.coderCount}`,
        `agreementMetric=${codingReliabilityGate.review.agreementMetric && codingReliabilityGate.review.agreementMetric !== pendingReliabilityText ? "present" : "missing"}`,
        `agreementValue=${codingReliabilityGate.review.agreementValue && codingReliabilityGate.review.agreementValue !== pendingReliabilityText ? "present" : "missing"}`,
        `adjudication=${codingReliabilityGate.review.adjudicationNotes && codingReliabilityGate.review.adjudicationNotes !== pendingReliabilityText ? "present" : "missing"}`
      ]
    ),
    completenessItem(
      "data-governance",
      "Data governance metadata",
      dataGovernanceBlockers.length === 0,
      dataGovernanceBlockers.length === 0
        ? `Data governance reviewed by ${dataGovernance?.dataSteward || "assigned steward"}`
        : `${dataGovernanceBlockers.length} data-governance blocker${dataGovernanceBlockers.length === 1 ? "" : "s"}`,
      [
        dataGovernance?.schemaVersion ?? SENA_SCHEMA_VERSIONS.dataGovernanceMetadata,
        `status=${dataGovernance?.status ?? (dataGovernanceBlockers.length === 0 ? "complete" : "needs-review")}`,
        `irb=${dataGovernance?.irbApprovalId?.trim() ? "present" : "missing"}`,
        `consent=${dataGovernance?.consentScope?.trim() ? "present" : "missing"}`,
        `retention=${dataGovernance?.retentionPolicy?.trim() ? "present" : "missing"}`,
        `usageConstraints=${dataGovernanceUsageConstraints.length}`,
        `dataSteward=${dataGovernance?.dataSteward?.trim() ? "present" : "missing"}`,
        ...dataGovernanceBlockers.map((blocker) => `missing=${blocker}`)
      ]
    ),
    completenessItem(
      "human-review",
      "Human review fields",
      humanReviewComplete,
      humanReviewComplete ? `Reviewed by ${humanReview.reviewer}` : "Draft or incomplete human-review fields",
      [
        `status=${humanReview.status}`,
        `reviewer=${humanReview.reviewer || "unassigned"}`,
        `interpretation=${humanReview.interpretation && humanReview.interpretation !== pendingReviewText ? "present" : "missing"}`,
        `limitations=${humanReview.limitations && humanReview.limitations !== pendingReviewText ? "present" : "missing"}`,
        `nextActions=${humanReview.nextActions && humanReview.nextActions !== pendingReviewText ? "present" : "missing"}`
      ]
    ),
    completenessItem(
      "warnings",
      "Model warnings",
      model.summary.warnings.length === 0 && enaManifest.warnings.length === 0 && snaManifest.warnings.length === 0,
      `${model.summary.warnings.length + enaManifest.warnings.length + snaManifest.warnings.length} warnings across SENA/jENA/jSNA`,
      [...model.summary.warnings, ...enaManifest.warnings, ...snaManifest.warnings].slice(0, 8)
    )
  ];
  const passed = items.filter((item) => item.status === "pass").length;
  const reviewNeeded = items.length - passed;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.reportCompleteness,
    status: reviewNeeded === 0 ? "complete" : "needs-review",
    passed,
    reviewNeeded,
    items,
    notes: [
      "Completeness checks confirm that required research-pilot artifacts are present; they do not certify substantive interpretation.",
      "Items marked review should be resolved or explicitly discussed before publication, assessment, or instructional decisions."
    ]
  };
}

export function buildSenaCodingReliabilityGate(
  options: SenaReportOptions = {},
  generatedAt = options.generatedAt ?? new Date().toISOString()
): SenaCodingReliabilityGate {
  const review: SenaCodingReliabilityReview = {
    status: options.codingReliability?.status ?? "not-documented",
    reviewer: options.codingReliability?.reviewer?.trim() ?? "",
    reviewedAt: options.codingReliability?.reviewedAt || generatedAt,
    codingScheme: options.codingReliability?.codingScheme?.trim() || pendingReliabilityText,
    unitOfCoding: options.codingReliability?.unitOfCoding?.trim() || pendingReliabilityText,
    coderCount: Math.max(0, Math.round(options.codingReliability?.coderCount ?? 0)),
    agreementMetric: options.codingReliability?.agreementMetric?.trim() || pendingReliabilityText,
    agreementValue: options.codingReliability?.agreementValue?.trim() || pendingReliabilityText,
    adjudicationNotes: options.codingReliability?.adjudicationNotes?.trim() || pendingReliabilityText,
    limitations: options.codingReliability?.limitations?.trim() || pendingReliabilityText
  };
  const requiredEvidence = [
    "documented status",
    "named reliability reviewer",
    "coding scheme version or source",
    "unit of coding",
    "at least two coders or a documented consensus procedure",
    "agreement metric",
    "agreement value",
    "adjudication notes",
    "coding reliability limitations"
  ];
  const blockers = [
    review.status === "documented" ? null : "Reliability status is not documented.",
    review.reviewer ? null : "Reliability reviewer is missing.",
    review.codingScheme !== pendingReliabilityText ? null : "Coding scheme source/version is missing.",
    review.unitOfCoding !== pendingReliabilityText ? null : "Unit of coding is missing.",
    review.coderCount >= 2 ? null : "At least two coders or an explicit consensus reliability procedure is needed.",
    review.agreementMetric !== pendingReliabilityText ? null : "Agreement metric is missing.",
    review.agreementValue !== pendingReliabilityText ? null : "Agreement value is missing.",
    review.adjudicationNotes !== pendingReliabilityText ? null : "Adjudication notes are missing.",
    review.limitations !== pendingReliabilityText ? null : "Reliability limitations are missing."
  ].filter((blocker): blocker is string => Boolean(blocker));
  const status = blockers.length === 0 ? "ready" : "review";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.codingReliabilityGate,
    status,
    claimUse: status === "ready" ? "coding-reliability-documented" : "coding-reliability-needed",
    review,
    requiredEvidence,
    evidence: [
      `status=${review.status}`,
      `reviewer=${review.reviewer || "unassigned"}`,
      `codingScheme=${review.codingScheme !== pendingReliabilityText ? review.codingScheme : "missing"}`,
      `unitOfCoding=${review.unitOfCoding !== pendingReliabilityText ? review.unitOfCoding : "missing"}`,
      `coderCount=${review.coderCount}`,
      `agreementMetric=${review.agreementMetric !== pendingReliabilityText ? review.agreementMetric : "missing"}`,
      `agreementValue=${review.agreementValue !== pendingReliabilityText ? review.agreementValue : "missing"}`,
      `adjudication=${review.adjudicationNotes !== pendingReliabilityText ? "present" : "missing"}`,
      `limitations=${review.limitations !== pendingReliabilityText ? "present" : "missing"}`
    ],
    blockers,
    guardrail: "SENA graph patterns remain exploratory until coding reliability evidence is documented and reviewed with the study context.",
    notes: [
      "This standalone report gate records the reviewed reliability evidence attached to the current export.",
      "Use the enterprise reliability workflow for raw multi-coder files, Cohen kappa, Krippendorff alpha, code-level diagnostics, adjudication history, and reviewer sign-off before publication-facing claims."
    ]
  };
}

function resolveHumanReview(options: SenaReportOptions, generatedAt: string): SenaReportHumanReview {
  return {
    status: options.humanReview?.status ?? "draft",
    reviewer: options.humanReview?.reviewer?.trim() ?? "",
    reviewedAt: options.humanReview?.reviewedAt || generatedAt,
    interpretation: options.humanReview?.interpretation?.trim() || pendingReviewText,
    limitations: options.humanReview?.limitations?.trim() || pendingReviewText,
    nextActions: options.humanReview?.nextActions?.trim() || pendingReviewText
  };
}

function mergeBuildOptions(model: SenaModel, overrides: Partial<SenaBuildOptions> = {}): SenaBuildOptions {
  return {
    alpha: overrides.alpha ?? model.options.alpha,
    beta: overrides.beta ?? model.options.beta,
    gamma: overrides.gamma ?? model.options.gamma,
    normalization: overrides.normalization ?? model.options.normalization,
    bridgeWeightRule: overrides.bridgeWeightRule ?? model.options.bridgeWeightRule,
    direction: overrides.direction ?? model.options.direction,
    deg_convention: overrides.deg_convention ?? model.options.deg_convention,
    delta: overrides.delta ?? model.options.delta,
    Phi: overrides.Phi ?? model.options.Phi,
    d: overrides.d ?? model.options.d,
    seed: overrides.seed ?? model.options.seed,
    undirectedSocial: overrides.undirectedSocial ?? model.options.undirectedSocial,
    temporal: {
      ...model.options.temporal,
      ...(overrides.temporal ?? {})
    }
  };
}

function buildVariantModel(model: SenaModel, overrides: Partial<SenaBuildOptions> = {}) {
  return buildSenaModel(model.dataset, mergeBuildOptions(model, overrides));
}

function fusionLayerTotals(model: SenaModel): SenaFusionLayerTotals {
  const peopleCount = model.people.length;
  const codeCount = model.codes.length;
  const values = model.matrices.fusion.values;
  let social = 0;
  let concept = 0;
  let bridge = 0;

  for (let i = 0; i < peopleCount; i += 1) {
    for (let j = i + 1; j < peopleCount; j += 1) {
      social += values[i]?.[j] ?? 0;
    }
  }

  for (let a = 0; a < codeCount; a += 1) {
    for (let b = a + 1; b < codeCount; b += 1) {
      concept += values[peopleCount + a]?.[peopleCount + b] ?? 0;
    }
  }

  for (let i = 0; i < peopleCount; i += 1) {
    for (let a = 0; a < codeCount; a += 1) {
      bridge += values[i]?.[peopleCount + a] ?? 0;
    }
  }

  return { social, concept, bridge, total: social + concept + bridge };
}

function strongestScaledEdge(model: SenaModel): SenaSensitivityVariant["strongestScaledEdge"] {
  const strongest = [...model.edges].sort((a, b) => b.scaledWeight - a.scaledWeight || a.label.localeCompare(b.label))[0];
  if (!strongest) return undefined;
  return {
    id: strongest.id,
    layer: strongest.layer,
    label: strongest.label,
    scaledWeight: strongest.scaledWeight
  };
}

function sensitivityVariant(model: SenaModel, id: string, label: string, baselineFusionTotal: number): SenaSensitivityVariant {
  const totals = fusionLayerTotals(model);
  return {
    id,
    label,
    buildOptions: model.options,
    fusionLayerTotals: totals,
    fusionTotalDelta: totals.total - baselineFusionTotal,
    socialDensity: model.summary.socialAnalysis.density,
    communityCount: model.summary.socialAnalysis.communityCount,
    strongestScaledEdge: strongestScaledEdge(model)
  };
}

function buildLayerWeightSensitivity(model: SenaModel): SenaSensitivityCheck {
  const baselineTotals = fusionLayerTotals(model);
  const scenarios: Array<{ id: string; label: string; overrides: Partial<SenaBuildOptions> }> = [
    { id: "baseline", label: "Baseline", overrides: {} },
    { id: "alpha-half", label: "Alpha 0.5x", overrides: { alpha: model.options.alpha * 0.5 } },
    { id: "alpha-one-half", label: "Alpha 1.5x", overrides: { alpha: model.options.alpha * 1.5 } },
    { id: "beta-half", label: "Beta 0.5x", overrides: { beta: model.options.beta * 0.5 } },
    { id: "beta-one-half", label: "Beta 1.5x", overrides: { beta: model.options.beta * 1.5 } },
    { id: "gamma-half", label: "Gamma 0.5x", overrides: { gamma: model.options.gamma * 0.5 } },
    { id: "gamma-one-half", label: "Gamma 1.5x", overrides: { gamma: model.options.gamma * 1.5 } }
  ];

  return {
    id: "layer-weights",
    label: "Alpha/beta/gamma sensitivity",
    baselineVariantId: "baseline",
    variants: scenarios.map((scenario) => {
      const variant = scenario.id === "baseline" ? model : buildVariantModel(model, scenario.overrides);
      return sensitivityVariant(variant, scenario.id, scenario.label, baselineTotals.total);
    }),
    notes: [
      "Layer-weight variants change the scaled fusion matrix and displayed edge emphasis.",
      "The social-layer SNA metrics are expected to remain unchanged because they are computed before alpha/beta/gamma scaling."
    ]
  };
}

function buildNormalizationSensitivity(model: SenaModel): SenaSensitivityCheck {
  const baselineTotals = fusionLayerTotals(model);
  const normalizations: SenaNormalization[] = [...SENA_ADMISSIBLE_NORMALIZATIONS];

  return {
    id: "normalization",
    label: "Normalization sensitivity",
    baselineVariantId: `normalization-${model.options.normalization}`,
    variants: normalizations.map((normalization) => {
      const variant = normalization === model.options.normalization ? model : buildVariantModel(model, { normalization });
      return sensitivityVariant(variant, `normalization-${normalization}`, normalization, baselineTotals.total);
    }),
    notes: [
      "Normalization variants change layer comparability, centrality-on-fusion interpretations, and layout emphasis.",
      "Within-type social metrics are reported from the raw S block, so they should be read separately from fusion scaling."
    ]
  };
}

function partitionAgreement(a: number[], b: number[]) {
  if (a.length !== b.length) return 0;
  if (a.length < 2) return 1;
  let matches = 0;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    for (let j = i + 1; j < a.length; j += 1) {
      total += 1;
      if ((a[i] === a[j]) === (b[i] === b[j])) matches += 1;
    }
  }
  return total === 0 ? 1 : matches / total;
}

function communityLabels(model: SenaModel) {
  return model.socialReport.actors.map((actor) => actor.community);
}

function buildCommunityStability(model: SenaModel): SenaValidation["stability"]["community"] {
  const baselineLabels = communityLabels(model);
  const repeat = buildVariantModel(model);
  const normalizations: SenaNormalization[] = [...SENA_ADMISSIBLE_NORMALIZATIONS];
  const normalizationAgreement = normalizations.map((normalization) => {
    const variant = normalization === model.options.normalization ? model : buildVariantModel(model, { normalization });
    return {
      normalization,
      agreement: partitionAgreement(baselineLabels, communityLabels(variant)),
      communityCount: variant.summary.socialAnalysis.communityCount
    };
  });

  return {
    method: model.socialReport.graph.communityDetection,
    deterministicRepeatAgreement: partitionAgreement(baselineLabels, communityLabels(repeat)),
    normalizationAgreement,
    stableAcrossNormalizations: normalizationAgreement.every((entry) => entry.agreement === 1),
    notes: [
      "sna.js labelPropagation() currently runs on the raw social S block, so alpha/beta/gamma and fusion normalization should not change community labels.",
      "Agreement is pairwise partition agreement; it is label-invariant and treats relabeled communities as equivalent."
    ]
  };
}

function coverageRatio(total: number, ids: Set<string>) {
  return total === 0 ? 1 : ids.size / total;
}

function temporalVariant(model: SenaModel, mode: SenaTemporalMode): SenaTemporalStabilityVariant {
  const variant = mode === model.options.temporal.mode ? model : buildVariantModel(model, { temporal: { mode } });
  const utteranceIds = new Set<string>();
  const segmentIds = new Set<string>();
  const interactionKeys = new Set<string>();

  for (const window of variant.temporal.windows) {
    window.utteranceIds.forEach((id) => utteranceIds.add(id));
    window.segmentIds.forEach((id) => segmentIds.add(id));
  }
  variant.dataset.interactions.forEach((interaction, index) => {
    if (variant.temporal.windows.some((window) => window.stages.includes(interaction.stage) || (
      typeof interaction.turnIndex === "number" &&
      interaction.turnIndex >= window.startTurn &&
      interaction.turnIndex <= window.endTurn
    ))) {
      interactionKeys.add(`${index}:${interaction.source}:${interaction.target}:${interaction.stage}:${interaction.turnIndex ?? ""}`);
    }
  });

  return {
    mode,
    windowCount: variant.temporal.windows.length,
    interactionAssignments: variant.temporal.windows.reduce((total, window) => total + window.interactionCount, 0),
    segmentAssignments: variant.temporal.windows.reduce((total, window) => total + window.segmentCount, 0),
    utteranceCoverage: coverageRatio(variant.dataset.utterances.length, utteranceIds),
    segmentCoverage: coverageRatio(variant.dataset.coded_segments.length, segmentIds),
    interactionCoverage: coverageRatio(variant.dataset.interactions.length, interactionKeys),
    emptyWindows: variant.temporal.windows.filter((window) => window.interactionCount === 0 && window.segmentCount === 0).length,
    maxSocialConnectivity: Math.max(0, ...variant.temporal.windows.map((window) => window.socialConnectivity)),
    maxConceptConnectivity: Math.max(0, ...variant.temporal.windows.map((window) => window.conceptConnectivity)),
    maxBridgeIntegration: Math.max(0, ...variant.temporal.windows.map((window) => window.bridgeIntegration))
  };
}

function buildTemporalStability(model: SenaModel): SenaValidation["stability"]["temporal"] {
  return {
    variants: (["stage", "moving-window", "turn-window"] as SenaTemporalMode[]).map((mode) => temporalVariant(model, mode)),
    notes: [
      "Stage windows should cover every staged record once; moving and turn windows can intentionally overlap.",
      "Temporal comparisons require a declared normalization policy because within-window normalization can hide absolute intensity changes."
    ]
  };
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffle<T>(values: T[], random: () => number) {
  const out = [...values];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = out[index];
    out[index] = out[swapIndex] as T;
    out[swapIndex] = current as T;
  }
  return out;
}

function quantile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[index] ?? 0;
}

function mean(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function conceptPairId(codeA: string, codeB: string) {
  return codeA < codeB ? `${codeA}|${codeB}` : `${codeB}|${codeA}`;
}

function targetConceptPair(model: SenaModel): SenaNullModelCheck["targetConceptPair"] {
  const strongest = model.summary.strongestConceptTie;
  const fallbackA = model.codes[0]?.id ?? "";
  const fallbackB = model.codes[1]?.id ?? fallbackA;
  const codeA = strongest?.source ?? fallbackA;
  const codeB = strongest?.target ?? fallbackB;
  const codeMap = new Map(model.codes.map((code) => [code.id, code]));
  return {
    id: conceptPairId(codeA, codeB),
    codeA,
    codeB,
    label: `${codeMap.get(codeA)?.label ?? codeA} + ${codeMap.get(codeB)?.label ?? codeB}`,
    observedWeight: conceptPairWeight(model, codeA, codeB)
  };
}

function conceptPairWeight(model: SenaModel, codeA: string, codeB: string) {
  const index = new Map(model.codes.map((code, position) => [code.id, position]));
  const a = index.get(codeA);
  const b = index.get(codeB);
  if (a === undefined || b === undefined) return 0;
  return model.matrices.W.raw[a]?.[b] ?? 0;
}

function permuteCodeLabels(dataset: SenaDataset, random: () => number): SenaDataset {
  const codeIds = dataset.codebook.map((code) => code.id);
  const shuffled = shuffle(codeIds, random);
  const map = new Map(codeIds.map((code, index) => [code, shuffled[index] ?? code]));

  return {
    ...dataset,
    people: dataset.people.map((person) => ({ ...person })),
    interactions: dataset.interactions.map((interaction) => ({ ...interaction })),
    utterances: dataset.utterances.map((utterance) => ({ ...utterance })),
    codebook: dataset.codebook.map((code) => ({ ...code })),
    coded_segments: dataset.coded_segments.map((segment) => ({
      ...segment,
      codes: Array.from(new Set(segment.codes.map((code) => map.get(code) ?? code)))
    })),
    warnings: dataset.warnings ? [...dataset.warnings] : undefined
  };
}

function groupByStanza<T extends { stanzaId: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(item.stanzaId, [...(groups.get(item.stanzaId) ?? []), item]);
  return groups;
}

function bootstrapStanzas(dataset: SenaDataset, random: () => number): SenaDataset {
  const segmentGroups = groupByStanza(dataset.coded_segments);
  const utteranceGroups = groupByStanza(dataset.utterances);
  const stanzas = Array.from(segmentGroups.keys());
  const coded_segments: SenaDataset["coded_segments"] = [];
  const utterances: SenaDataset["utterances"] = [];

  if (stanzas.length === 0) return { ...dataset, coded_segments, utterances };

  for (let draw = 0; draw < stanzas.length; draw += 1) {
    const stanzaId = stanzas[Math.floor(random() * stanzas.length)] ?? stanzas[0] ?? "";
    const suffix = `boot-${draw + 1}`;
    for (const utterance of utteranceGroups.get(stanzaId) ?? []) {
      utterances.push({
        ...utterance,
        id: `${utterance.id}:${suffix}`,
        stanzaId: `${utterance.stanzaId}:${suffix}`
      });
    }
    for (const segment of segmentGroups.get(stanzaId) ?? []) {
      coded_segments.push({
        ...segment,
        segmentId: `${segment.segmentId}:${suffix}`,
        utteranceId: `${segment.utteranceId}:${suffix}`,
        stanzaId: `${segment.stanzaId}:${suffix}`,
        codes: [...segment.codes]
      });
    }
  }

  return {
    ...dataset,
    people: dataset.people.map((person) => ({ ...person })),
    interactions: dataset.interactions.map((interaction) => ({ ...interaction })),
    utterances,
    codebook: dataset.codebook.map((code) => ({ ...code })),
    coded_segments,
    warnings: dataset.warnings ? [...dataset.warnings] : undefined
  };
}

function buildNullModelChecks(model: SenaModel, iterations = defaultNullModelIterations): SenaNullModelCheck {
  const target = targetConceptPair(model);
  const random = seededRandom(nullModelSeed);
  const sampleCount = Math.max(1, Math.round(iterations));
  const permutationSamples = Array.from({ length: sampleCount }, () => {
    const variant = buildSenaModel(permuteCodeLabels(model.dataset, random), model.options);
    return conceptPairWeight(variant, target.codeA, target.codeB);
  });
  const bootstrapSamples = Array.from({ length: sampleCount }, () => {
    const variant = buildSenaModel(bootstrapStanzas(model.dataset, random), model.options);
    return conceptPairWeight(variant, target.codeA, target.codeB);
  });

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.nullModels,
    seed: nullModelSeed,
    targetConceptPair: target,
    permutation: {
      method: "global-code-label-shuffle",
      iterations: permutationSamples.length,
      pValueGreaterOrEqual: (permutationSamples.filter((value) => value >= target.observedWeight).length + 1) / (permutationSamples.length + 1),
      nullMean: mean(permutationSamples),
      nullLower: quantile(permutationSamples, 0.025),
      nullUpper: quantile(permutationSamples, 0.975),
      samplesPreview: permutationSamples.slice(0, 12)
    },
    bootstrap: {
      method: "stanza-resampling-with-replacement",
      iterations: bootstrapSamples.length,
      confidenceLevel: 0.95,
      mean: mean(bootstrapSamples),
      lower: quantile(bootstrapSamples, 0.025),
      upper: quantile(bootstrapSamples, 0.975),
      samplesPreview: bootstrapSamples.slice(0, 12)
    },
    notes: [
      "Permutation shuffles code labels globally and tests whether the target code-pair weight is unusually large under relabeling.",
      "Bootstrap resamples stanzas with replacement and estimates uncertainty for the target code-pair weight.",
      "These checks are lightweight report-gate diagnostics, not a substitute for a study-specific preregistered inferential model."
    ]
  };
}

export function buildSenaValidation(model: SenaModel, options: SenaReportOptions = {}): SenaValidation {
  return {
    metricProvenance,
    sensitivity: {
      layerWeights: buildLayerWeightSensitivity(model),
      normalization: buildNormalizationSensitivity(model)
    },
    stability: {
      community: buildCommunityStability(model),
      temporal: buildTemporalStability(model)
    },
    nullModels: buildNullModelChecks(model, options.nullModelIterations)
  };
}

export function buildSenaEvidenceLedger(model: SenaModel, options: SenaEvidenceLedgerOptions = {}): SenaEvidenceLedger {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const evidenceLimit = Math.max(1, Math.round(options.evidenceLimit ?? 80));
  const snippets = collectEvidenceSnippets(model, evidenceLimit);

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.evidenceLedger,
    title: options.title?.trim() || "SENA Evidence Ledger",
    generatedAt,
    analysisWindow: options.activeTemporalWindow ?? null,
    parameters: {
      buildOptions: model.options,
      datasetCounts: {
        people: model.dataset.people.length,
        interactions: model.dataset.interactions.length,
        utterances: model.dataset.utterances.length,
        codedSegments: model.dataset.coded_segments.length,
        codes: model.dataset.codebook.length
      },
      warnings: model.summary.warnings
    },
    runtimeProvenance,
    interpretationGuardrails,
    sourceCounts: evidenceSourceCounts(snippets),
    snippets,
    humanReview: resolveHumanReview(options, generatedAt)
  };
}

export function buildSenaReport(model: SenaModel, options: SenaReportOptions = {}): SenaReport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const evidenceLimit = Math.max(1, Math.round(options.evidenceLimit ?? 40));
  const enaManifest = buildSenaEnaManifest(model.dataset);
  const snaManifest = buildSenaSnaManifest(model);
  const dataContractAudit = buildSenaDataContractAudit(model.dataset, { modelWarnings: model.summary.warnings });
  const runtimeConsistencyAudit = buildSenaRuntimeConsistencyAudit({ model, enaManifest, snaManifest });
  const fusionMathAudit = buildSenaFusionMathAudit(model);
  const evidenceLedger = buildSenaEvidenceLedger(model, {
    ...options,
    generatedAt,
    evidenceLimit
  });
  const humanReview = resolveHumanReview(options, generatedAt);
  const dataGovernance = resolveDataGovernanceMetadata(options, generatedAt);
  const codingReliabilityGate = buildSenaCodingReliabilityGate(options, generatedAt);
  const completenessAudit = buildSenaReportCompletenessAudit({
    model,
    analysisWindow: options.activeTemporalWindow ?? null,
    enaManifest,
    snaManifest,
    runtimeConsistencyAudit,
    dataContractAudit,
    fusionMathAudit,
    evidenceSnippets: evidenceLedger.snippets,
    humanReview,
    codingReliabilityGate,
    dataGovernance
  });
  const validation = buildSenaValidation(model, options);
  const modelCard = buildSenaModelCard(model, {
    generatedAt,
    codingReliabilityGate,
    dataGovernance,
    validation
  });
  // The temporal runtime trace (and its adjacent-window transitions) describes the
  // full conversation timeline, so it must be computed from the full source dataset
  // when one is provided — not from `model.dataset`, which the workspace scopes to the
  // active window (a single window would yield zero adjacent-window transitions). When
  // no sourceDataset is supplied (library/tests), model.dataset is already the full
  // timeline, so behaviour is unchanged. Mirrors the sourceDataset baseline at
  // buildActiveWindowComparison.
  const timelineDataset = options.sourceDataset ?? model.dataset;
  const timelineModel = options.sourceDataset ? buildSenaModel(options.sourceDataset, model.options) : model;
  const temporalRuntimeTrace = buildSenaTemporalRuntimeTrace(timelineDataset, model.options, { timelineModel });
  const temporalRuntimeNarrative = buildTemporalRuntimeNarrative(timelineModel, temporalRuntimeTrace);
  const activeWindowComparison = buildActiveWindowComparison(model, options.sourceDataset, options.activeTemporalWindow ?? null);
  const pilotReadinessAudit = buildSenaPilotReadinessAudit({
    model,
    completenessAudit,
    dataContractAudit,
    runtimeConsistencyAudit,
    fusionMathAudit,
    validation,
    codingReliabilityGate,
    evidenceLedger,
    humanReview,
    dataGovernance
  });
  const claimReadinessGate = buildSenaClaimReadinessGate(pilotReadinessAudit);
  const activeWindowBrief = buildSenaActiveWindowBrief(model, {
    activeTemporalWindow: options.activeTemporalWindow ?? null,
    sourceDataset: options.sourceDataset,
    activeWindowComparison,
    evidenceSnippets: evidenceLedger.snippets,
    humanReview,
    codingReliabilityGate
  });

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.report,
    title: options.title?.trim() || "SENA Analysis Report",
    generatedAt,
    analysisWindow: options.activeTemporalWindow ?? null,
    parameters: {
      buildOptions: model.options,
      datasetCounts: {
        people: model.dataset.people.length,
        interactions: model.dataset.interactions.length,
        utterances: model.dataset.utterances.length,
        codedSegments: model.dataset.coded_segments.length,
        codes: model.dataset.codebook.length
      },
      warnings: model.summary.warnings
    },
    runtimeProvenance,
    interpretationGuardrails,
    operatorDiagnostics: model.operatorDiagnostics,
    enaManifest,
    snaManifest,
    summary: model.summary,
    matrices: model.matrices,
    figures: {
      fusionGraph: {
        nodes: model.nodes.map((node) => ({
          id: node.id,
          label: node.label,
          kind: node.kind
        })),
        edges: model.edges.map((edge) => ({
          id: edge.id,
          layer: edge.layer,
          edgeType: edge.edgeType,
          sourceKind: edge.sourceKind,
          targetKind: edge.targetKind,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          weight: edge.weight,
          normalizedWeight: edge.normalizedWeight,
          scaledWeight: edge.scaledWeight
        }))
      },
      activeWindowComparison,
      activeWindowBrief,
      temporalTrace: model.temporal,
      temporalRuntimeNarrative,
      temporalRuntimeTransitions: temporalRuntimeTrace.transitions,
      socialCommunities: model.socialReport.communities,
      visualGrammar: senaVisualGrammar
    },
    socialReport: model.socialReport,
    pairReport: model.pairReport,
    validation,
    modelCard,
    codingReliabilityGate,
    completenessAudit,
    dataContractAudit,
    runtimeConsistencyAudit,
    fusionMathAudit,
    pilotReadinessAudit,
    claimReadinessGate,
    dataGovernance,
    evidenceSnippets: evidenceLedger.snippets,
    humanReview
  };
}

function dataGovernanceToMarkdown(metadata: SenaDataGovernanceMetadata) {
  return [
    `- Schema: ${metadata.schemaVersion}`,
    `- Status: ${metadata.status}`,
    `- IRB/ethics approval ID: ${metadata.irbApprovalId || "Needs review"}`,
    `- Consent scope: ${metadata.consentScope || "Needs review"}`,
    `- Retention policy: ${metadata.retentionPolicy || "Needs review"}`,
    `- Usage constraints: ${metadata.usageConstraints.length > 0 ? metadata.usageConstraints.join("; ") : "Needs review"}`,
    `- Data steward: ${metadata.dataSteward || "Needs review"}`,
    `- Reviewed at: ${metadata.reviewedAt}`,
    ...(metadata.blockers.length > 0 ? metadata.blockers.map((blocker) => `- Missing: ${blocker}`) : []),
    `- Guardrail: ${metadata.guardrail}`
  ].join("\n");
}

function embeddingDiagnosticsToMarkdown(report: SenaReport) {
  const { mds, commuteTime, exploratoryLayout } = report.operatorDiagnostics.embedding;
  return [
    `- Exploratory layout: ${exploratoryLayout.operator}; metric_exact=${exploratoryLayout.metricExact}; ${exploratoryLayout.warning}`,
    `- MDS delta: ${mds.delta}; d=${mds.dimensions}; available=${mds.available}; metric_exact=${mds.metricExact}; stress=${mds.stress === null ? "NA" : formatReportNumber(mds.stress)}; max distortion=${mds.maxDistortion === null ? "NA" : formatReportNumber(mds.maxDistortion)}; min eig(K)=${mds.minCenteredGramEigenvalue === null ? "NA" : formatReportNumber(mds.minCenteredGramEigenvalue)}`,
    `- Commute-time: available=${commuteTime.available}; metric_exact=${commuteTime.metricExact}; max pairwise error=${commuteTime.maxPairwiseError === null ? "NA" : formatReportNumber(commuteTime.maxPairwiseError)}; checked pairs=${commuteTime.checkedPairs ?? "NA"}; excluded self pairs=${commuteTime.excludedSelfPairs ?? "NA"}`,
    ...mds.warnings.map((warning) => `- MDS warning: ${warning}`),
    ...commuteTime.warnings.map((warning) => `- Commute-time warning: ${warning}`)
  ].join("\n");
}

function bridgeWeightingToMarkdown(report: SenaReport) {
  const bridgeWeighting = report.operatorDiagnostics.bridgeWeighting;
  return [
    `- Rule: ${bridgeWeighting.rule}`,
    `- Active code value: ${bridgeWeighting.activeCodeValue}`,
    `- Confidence values present: ${bridgeWeighting.confidenceValuesPresent ? "yes" : "no"}`,
    `- Missing confidence count: ${bridgeWeighting.missingConfidenceCount}`,
    ...bridgeWeighting.warnings.map((warning) => `- Warning: ${warning}`)
  ].join("\n");
}

function attributionDiagnosticsToMarkdown(report: SenaReport) {
  const attribution = report.operatorDiagnostics.attribution;
  return [
    `- Estimator: ${attribution.estimator}`,
    `- Default wording: ${attribution.defaultWording}`,
    `- Contribution wording allowed: ${attribution.contributionWordingAllowed ? "yes" : "no"}`,
    `- Reason: ${attribution.contributionWordingReason}`,
    `- Participation matrix Y: ${attribution.participation.rowCount}x${attribution.participation.columnCount} from ${attribution.participation.sourceTable}; active cells=${attribution.participation.activeCells}`,
    `- G-hat normalization: ${attribution.gHat.normalization}; active rows=${attribution.gHat.rowSums.filter((value) => value > 0).length}`,
    `- Guardrail: ${attribution.guardrail}`
  ].join("\n");
}

function typedCentralityDiagnosticsToMarkdown(report: SenaReport) {
  const typedCentrality = report.operatorDiagnostics.typedCentrality;
  const { families } = typedCentrality;
  return [
    `- Mixed-type centrality ranking renderable: ${typedCentrality.mixedRankingRenderable ? "yes" : "no"}`,
    `- Persons on S: ${families.personsOnS.length}`,
    `- Codes on W: ${families.codesOnW.length}`,
    `- Bridges on B: ${families.bridgesOnB.length}`,
    `- Whole-graph typed degrees: ${families.typedGraph.length}`,
    `- Guardrail: ${typedCentrality.guardrail}`
  ].join("\n");
}

function modelCardToMarkdown(report: SenaReport) {
  const card = report.modelCard;
  const completeCount = card.sections.filter((section) => section.status === "complete").length;
  return [
    `- Schema: ${card.schemaVersion}`,
    `- Render gate: ${card.renderGate.status}`,
    `- ${card.renderGate.message}`,
    `- Sections complete: ${completeCount}/${card.sections.length}`,
    ...(card.renderGate.missingSectionIds.length > 0
      ? [`- Missing sections: ${card.renderGate.missingSectionIds.join(", ")}`]
      : []),
    `- Dataset: ${card.dataset.version.declared} (${card.dataset.version.contentHash})`,
    `- Formula S: ${card.formulas.social.formula}; direction=${card.formulas.social.direction}`,
    `- Formula B: ${card.formulas.bridge.formula}; weightRule=${card.formulas.bridge.weightRule}`,
    `- Normalization: ${card.normalization.rule}; divisors S/W/B/G=${card.normalization.divisors.S}/${card.normalization.divisors.W}/${card.normalization.divisors.B}/${card.normalization.divisors.G}`,
    `- Weights: alpha=${formatReportNumber(card.weights.alpha)}, beta=${formatReportNumber(card.weights.beta)}, gamma=${formatReportNumber(card.weights.gamma)}; configHash=${card.weights.configHash}`,
    `- Embedding badge: ${card.embedding.layoutBadge}`,
    `- Attribution badge: ${card.attribution.badge}`,
    `- Direction badge: ${card.direction.badge ?? "not applicable"}`
  ].join("\n");
}

function matrixBlockToMarkdown(title: string, block: SenaMatrixBlock, maxRows = 8, maxColumns = 8) {
  return rectangularMatrixToMarkdown(title, block.labels, block.labels, block.raw, maxRows, maxColumns);
}

function pairMatrixBlockToMarkdown(title: string, block: SenaPairMatrixBlock, maxRows = 8, maxColumns = 8) {
  return rectangularMatrixToMarkdown(title, block.rowLabels, block.columnLabels, block.raw, maxRows, maxColumns);
}

function rectangularMatrixToMarkdown(title: string, rowLabels: string[], columnLabels: string[], values: number[][], maxRows = 8, maxColumns = 8) {
  const visibleRows = rowLabels.slice(0, maxRows);
  const visibleColumns = columnLabels.slice(0, maxColumns);
  const omittedRows = Math.max(0, rowLabels.length - visibleRows.length);
  const omittedColumns = Math.max(0, columnLabels.length - visibleColumns.length);
  const lines = [`### ${title}`, ""];

  if (rowLabels.length === 0 || columnLabels.length === 0) {
    lines.push("_Empty matrix._");
    return lines.join("\n");
  }

  lines.push(`| Layer | ${visibleColumns.map(markdownCell).join(" | ")} |`);
  lines.push(`| --- | ${visibleColumns.map(() => "---").join(" | ")} |`);
  visibleRows.forEach((rowLabel, rowIndex) => {
    const row = visibleColumns.map((_, columnIndex) => formatReportNumber(values[rowIndex]?.[columnIndex] ?? 0));
    lines.push(`| ${markdownCell(rowLabel)} | ${row.map(markdownCell).join(" | ")} |`);
  });

  if (omittedRows > 0 || omittedColumns > 0) {
    lines.push("");
    lines.push(`_Preview only: ${omittedRows} rows and ${omittedColumns} columns omitted from this Markdown view; the JSON report contains the full matrix._`);
  }

  return lines.join("\n");
}

function pairDriversToMarkdown(report: SenaReport) {
  const activePairs = [...report.pairReport]
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label))
    .slice(0, 8);

  if (activePairs.length === 0) return "_No active person-code-pair drivers._";

  return activePairs.map((pair) => {
    const contributors = pair.topContributors
      .map((contributor) => (
        `${contributor.label}: G ${formatReportNumber(contributor.weight)} ` +
        `(direct ${formatReportNumber(contributor.directWeight)}, support ${formatReportNumber(contributor.supportingWeight)})`
      ))
      .join("; ");
    return `- ${pair.label}: total G ${formatReportNumber(pair.totalContribution)}. ${contributors}`;
  }).join("\n");
}

function buildTemporalRuntimeNarrative(
  model: SenaModel,
  trace = buildSenaTemporalRuntimeTrace(model.dataset, model.options, { timelineModel: model })
): SenaTemporalRuntimeNarrativeWindow[] {
  return trace.windows.map((entry) => ({
    windowId: entry.window.id,
    label: entry.window.label,
    turns: `${entry.window.startTurn}-${entry.window.endTurn}`,
    jenaStatus: entry.ena.status,
    jsnaStatus: entry.sna.status,
    matrixTotals: entry.sena.matrixTotals,
    matrixFingerprints: entry.sena.matrixFingerprints,
    activeGPairs: entry.sena.activeGPairs,
    strongestSocialTie: entry.sena.strongestSocialTie,
    strongestConceptTie: entry.sena.strongestConceptTie,
    strongestBridgeTie: entry.sena.strongestBridgeTie,
    strongestGPair: entry.sena.strongestGPair
  }));
}

function temporalTraceToMarkdown(report: SenaReport, maxRows = 12) {
  const windows = report.figures.temporalTrace.windows;
  if (windows.length === 0) return "_No temporal windows available._";

  const narrativeByWindowId = new Map(report.figures.temporalRuntimeNarrative.map((entry) => [entry.windowId, entry]));
  const visibleWindows = windows.slice(0, maxRows);
  const omittedWindows = Math.max(0, windows.length - visibleWindows.length);
  const rows = [
    `- Mode: ${report.figures.temporalTrace.settings.mode}`,
    `- Windows: ${windows.length}`,
    "",
    "| Window | Turns | Stages | Utterances | Interactions | Segments | Social | Concept | Bridge | G total | A_fusion checksum | Top S tie | Top W tie | Top B tie | Active G pairs | Top G pair | Lead contributor | Evidence | Top codes |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | ---: | --- | --- | ---: | --- |",
    ...visibleWindows.map((window) => {
      const narrative = narrativeByWindowId.get(window.id);
      const topCodes = window.topCodes.length > 0
        ? window.topCodes.slice(0, 3).map((code) => `${code.label} ${formatReportNumber(code.weight)}`).join("; ")
        : "NA";
      const topPair = narrative?.strongestGPair;
      const leadContributor = topPair?.topContributors[0];
      const fusionChecksum = narrative?.matrixFingerprints.find((fingerprint) => fingerprint.id === "A_fusion")?.checksum ?? "NA";
      return `| ${markdownCell(window.label)} | ${window.startTurn}-${window.endTurn} | ` +
        `${markdownCell(window.stages.join(", ") || "All")} | ${window.utteranceIds.length} | ` +
        `${window.interactionCount} | ${window.segmentCount} | ${formatReportNumber(window.socialConnectivity)} | ` +
        `${formatReportNumber(window.conceptConnectivity)} | ${formatReportNumber(window.bridgeIntegration)} | ` +
        `${formatReportNumber(narrative?.matrixTotals.G ?? 0)} | ${markdownCell(fusionChecksum)} | ` +
        `${markdownCell(narrative?.strongestSocialTie?.label ?? "NA")} | ${markdownCell(narrative?.strongestConceptTie?.label ?? "NA")} | ` +
        `${markdownCell(narrative?.strongestBridgeTie?.label ?? "NA")} | ${narrative?.activeGPairs ?? 0} | ` +
        `${markdownCell(topPair?.label ?? "NA")} | ${markdownCell(leadContributor?.label ?? "NA")} | ` +
        `${window.evidence.length} | ${markdownCell(topCodes)} |`;
    })
  ];

  if (omittedWindows > 0) {
    rows.push("");
    rows.push(`_Preview only: ${omittedWindows} temporal windows omitted from this Markdown view; the JSON report contains the full temporal trace._`);
  }

  if (report.figures.temporalRuntimeTransitions.length > 0) {
    rows.push("");
    rows.push("### Temporal Transitions");
    rows.push("");
    rows.push("| Transition | Turns | Direction | Delta S | Delta W | Delta B | Delta G | Delta A_fusion | Delta active G pairs | Top G pair change | Runtime status |");
    rows.push("| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |");
    for (const transition of report.figures.temporalRuntimeTransitions.slice(0, maxRows)) {
      const fromPair = transition.strongestGPair.from?.label ?? "NA";
      const toPair = transition.strongestGPair.to?.label ?? "NA";
      rows.push(`| ${markdownCell(`${transition.fromLabel} -> ${transition.toLabel}`)} | ${markdownCell(transition.turnSpan)} | ` +
        `${transition.direction} | ${formatReportNumber(transition.delta.S)} | ${formatReportNumber(transition.delta.W)} | ` +
        `${formatReportNumber(transition.delta.B)} | ${formatReportNumber(transition.delta.G)} | ` +
        `${formatReportNumber(transition.delta.fusion)} | ${transition.delta.activeGPairs} | ` +
        `${markdownCell(`${fromPair} -> ${toPair}${transition.strongestGPair.changed ? " (changed)" : ""}`)} | ` +
        `${markdownCell(`jENA ${transition.jenaStatus.from}->${transition.jenaStatus.to}; jSNA ${transition.jsnaStatus.from}->${transition.jsnaStatus.to}`)} |`);
    }
    rows.push("");
    rows.push(`_Guardrail: ${report.figures.temporalRuntimeTransitions[0].interpretationGuardrail}_`);
  }

  return rows.join("\n");
}

function activeWindowComparisonToMarkdown(report: SenaReport) {
  const comparison = report.figures.activeWindowComparison;
  if (!comparison) return "";

  const rows = [
    `- Window: ${comparison.currentWindow.label} (turns ${comparison.currentWindow.startTurn}-${comparison.currentWindow.endTurn})`,
    `- Baseline: ${comparison.baselineScope}`,
    `- Source dataset: ${comparison.sourceDatasetCounts.utterances} utterances, ${comparison.sourceDatasetCounts.codedSegments} segments`,
    `- Analysis dataset: ${comparison.analysisDatasetCounts.utterances} utterances, ${comparison.analysisDatasetCounts.codedSegments} segments`,
    "",
    "| Metric | Window | Full conversation | Delta | Share |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...comparison.metrics.map((metric) => (
      `| ${markdownCell(metric.label)} | ${formatReportNumber(metric.current)} | ${formatReportNumber(metric.baseline)} | ${formatReportNumber(metric.delta)} | ${metric.share === null ? "NA" : `${formatReportNumber(metric.share * 100, 1)}%`} |`
    )),
    "",
    "| Signal | Current window | Full conversation |",
    "| --- | --- | --- |",
    `| Top ENA W link | ${markdownCell(comparison.topSignals.currentTopConceptTie?.label ?? "NA")} | ${markdownCell(comparison.topSignals.baselineTopConceptTie?.label ?? "NA")} |`,
    `| Top G pair | ${markdownCell(comparison.topSignals.currentTopGPair?.label ?? "NA")} | ${markdownCell(comparison.topSignals.baselineTopGPair?.label ?? "NA")} |`,
    "",
    "| Ranking context | Layer | Current-window top signal | Window weight | Full-conversation weight | Full rank | Full share |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: |",
    ...comparison.rankingContext.map((entry) => (
      `| ${markdownCell(entry.label)} | ${entry.layer} | ${markdownCell(entry.signalLabel)} | ` +
      `${formatReportNumber(entry.currentWeight)} | ${formatReportNumber(entry.baselineWeight)} | ` +
      `${entry.baselineRank === null ? "NA" : `${entry.baselineRank}/${entry.baselineItemCount}`} | ` +
      `${entry.baselineShare === null ? "NA" : `${formatReportNumber(entry.baselineShare * 100, 1)}%`} |`
    )),
    "",
    `_Guardrail: ${comparison.interpretationGuardrail}_`
  ];

  return rows.join("\n");
}

function activeWindowBriefToMarkdown(report: SenaReport) {
  const brief = report.figures.activeWindowBrief;
  if (!brief) return "";

  const rows = [
    `- Schema: ${brief.schemaVersion}`,
    `- Window: ${brief.window.label} (turns ${brief.window.turns}; ${brief.window.mode})`,
    `- Headline: ${brief.headline}`,
    "",
    "| Layer | Current-window signal | Window weight | Full rank | Full share |",
    "| --- | --- | ---: | ---: | ---: |",
    ...brief.dominantSignals.map((signal) => (
      `| ${signal.layer} | ${markdownCell(signal.label)} | ${formatReportNumber(signal.currentWeight)} | ` +
      `${signal.fullConversationRank === null ? "NA" : signal.fullConversationRank} | ` +
      `${signal.fullConversationShare === null ? "NA" : `${formatReportNumber(signal.fullConversationShare * 100, 1)}%`} |`
    )),
    "",
    "### Brief Evidence Cues",
    "",
    ...(brief.evidenceCues.length > 0
      ? brief.evidenceCues.map((cue, index) => `${index + 1}. ${markdownCell(cue.sourceLabel)} (${cue.source}): ${markdownCell(cue.text)}`)
      : ["_No evidence cues available._"]),
    "",
    "### Brief Review Checklist",
    "",
    "| Check | Status | Detail |",
    "| --- | --- | --- |",
    ...brief.reviewChecklist.map((item) => (
      `| ${markdownCell(item.label)} | ${item.status} | ${markdownCell(item.detail)} |`
    )),
    "",
    ...brief.guardrails.map((guardrail) => `- Guardrail: ${guardrail}`)
  ];

  return rows.join("\n");
}

function metricProvenanceToMarkdown(report: SenaReport) {
  const rows = [
    "| Metric | Scope | Source | Implementation | Parity status | Interpretation limit |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.validation.metricProvenance.map((metric) => (
      `| ${markdownCell(metric.label)} | ${markdownCell(metric.scope)} | ${markdownCell(metric.source)} | ` +
      `${markdownCell(metric.implementation)} | ${markdownCell(metric.parityStatus)} | ${markdownCell(metric.interpretationLimit)} |`
    ))
  ];
  return rows.join("\n");
}

function sensitivityCheckToMarkdown(check: SenaSensitivityCheck) {
  const rows = [
    `### ${check.label}`,
    "",
    ...check.notes.map((note) => `- ${note}`),
    "",
    "| Variant | Alpha | Beta | Gamma | Normalization | Social | Concept | Bridge | Total delta | Community count | Strongest scaled edge |",
    "| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ...check.variants.map((variant) => (
      `| ${markdownCell(variant.label)} | ${formatReportNumber(variant.buildOptions.alpha)} | ` +
      `${formatReportNumber(variant.buildOptions.beta)} | ${formatReportNumber(variant.buildOptions.gamma)} | ` +
      `${markdownCell(variant.buildOptions.normalization)} | ${formatReportNumber(variant.fusionLayerTotals.social)} | ` +
      `${formatReportNumber(variant.fusionLayerTotals.concept)} | ${formatReportNumber(variant.fusionLayerTotals.bridge)} | ` +
      `${formatReportNumber(variant.fusionTotalDelta)} | ${variant.communityCount} | ` +
      `${markdownCell(variant.strongestScaledEdge?.label ?? "NA")} |`
    ))
  ];
  return rows.join("\n");
}

function communityStabilityToMarkdown(report: SenaReport) {
  const stability = report.validation.stability.community;
  const rows = [
    `Method: ${stability.method}`,
    `Deterministic repeat agreement: ${formatReportNumber(stability.deterministicRepeatAgreement)}`,
    `Stable across normalizations: ${stability.stableAcrossNormalizations ? "yes" : "no"}`,
    "",
    ...stability.notes.map((note) => `- ${note}`),
    "",
    "| Normalization | Agreement | Community count |",
    "| --- | ---: | ---: |",
    ...stability.normalizationAgreement.map((entry) => (
      `| ${markdownCell(entry.normalization)} | ${formatReportNumber(entry.agreement)} | ${entry.communityCount} |`
    ))
  ];
  return rows.join("\n");
}

function temporalStabilityToMarkdown(report: SenaReport) {
  const stability = report.validation.stability.temporal;
  const rows = [
    ...stability.notes.map((note) => `- ${note}`),
    "",
    "| Mode | Windows | Interaction assignments | Segment assignments | Utterance coverage | Segment coverage | Interaction coverage | Empty windows | Max social | Max concept | Max bridge |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...stability.variants.map((variant) => (
      `| ${markdownCell(variant.mode)} | ${variant.windowCount} | ${variant.interactionAssignments} | ` +
      `${variant.segmentAssignments} | ${formatReportNumber(variant.utteranceCoverage)} | ` +
      `${formatReportNumber(variant.segmentCoverage)} | ${formatReportNumber(variant.interactionCoverage)} | ` +
      `${variant.emptyWindows} | ${formatReportNumber(variant.maxSocialConnectivity)} | ` +
      `${formatReportNumber(variant.maxConceptConnectivity)} | ${formatReportNumber(variant.maxBridgeIntegration)} |`
    ))
  ];
  return rows.join("\n");
}

function nullModelsToMarkdown(report: SenaReport) {
  const nullModels = report.validation.nullModels;
  const rows = [
    `Target pair: ${nullModels.targetConceptPair.label} (${nullModels.targetConceptPair.id})`,
    `Observed W: ${formatReportNumber(nullModels.targetConceptPair.observedWeight)}`,
    "",
    ...nullModels.notes.map((note) => `- ${note}`),
    "",
    "| Check | Method | Iterations | Mean | Lower | Upper | p>=observed |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    `| Permutation | ${markdownCell(nullModels.permutation.method)} | ${nullModels.permutation.iterations} | ` +
      `${formatReportNumber(nullModels.permutation.nullMean)} | ${formatReportNumber(nullModels.permutation.nullLower)} | ` +
      `${formatReportNumber(nullModels.permutation.nullUpper)} | ${formatReportNumber(nullModels.permutation.pValueGreaterOrEqual)} |`,
    `| Bootstrap | ${markdownCell(nullModels.bootstrap.method)} | ${nullModels.bootstrap.iterations} | ` +
      `${formatReportNumber(nullModels.bootstrap.mean)} | ${formatReportNumber(nullModels.bootstrap.lower)} | ` +
      `${formatReportNumber(nullModels.bootstrap.upper)} | NA |`
  ];
  return rows.join("\n");
}

function completenessAuditToMarkdown(report: SenaReport) {
  const rows = [
    `- Overall status: ${report.completenessAudit.status}`,
    `- Passed/review-needed: ${report.completenessAudit.passed}/${report.completenessAudit.reviewNeeded}`,
    "",
    "| Item | Status | Summary | Evidence |",
    "| --- | --- | --- | --- |",
    ...report.completenessAudit.items.map((item) => (
      `| ${markdownCell(item.label)} | ${item.status} | ${markdownCell(item.summary)} | ${markdownCell(item.evidence.slice(0, 4).join("; ") || "NA")} |`
    )),
    "",
    ...report.completenessAudit.notes.map((note) => `- ${note}`)
  ];
  return rows.join("\n");
}

function runtimeConsistencyAuditToMarkdown(report: SenaReport) {
  const rows = [
    `- Schema: ${report.runtimeConsistencyAudit.schemaVersion}`,
    `- Overall status: ${report.runtimeConsistencyAudit.status}`,
    `- Passed/review-needed: ${report.runtimeConsistencyAudit.passed}/${report.runtimeConsistencyAudit.reviewNeeded}`,
    "",
    "| Item | Status | Expected | Actual | Detail |",
    "| --- | --- | --- | --- | --- |",
    ...report.runtimeConsistencyAudit.items.map((item) => (
      `| ${markdownCell(item.label)} | ${item.status} | ${markdownCell(item.expected)} | ${markdownCell(item.actual)} | ${markdownCell(item.detail.slice(0, 4).join("; ") || "NA")} |`
    )),
    "",
    ...report.runtimeConsistencyAudit.notes.map((note) => `- ${note}`)
  ];
  return rows.join("\n");
}

function dataContractAuditToMarkdown(report: SenaReport) {
  const rows = [
    `- Schema: ${report.dataContractAudit.schemaVersion}`,
    `- Overall status: ${report.dataContractAudit.status}`,
    `- Passed/review-needed: ${report.dataContractAudit.passed}/${report.dataContractAudit.reviewNeeded}`,
    "",
    "| Check | Status | Expected | Actual | Detail |",
    "| --- | --- | --- | --- | --- |",
    ...report.dataContractAudit.items.map((item) => (
      `| ${markdownCell(item.label)} | ${item.status} | ${markdownCell(item.expected)} | ${markdownCell(item.actual)} | ${markdownCell(item.detail.slice(0, 4).join("; ") || "NA")} |`
    )),
    "",
    ...report.dataContractAudit.notes.map((note) => `- ${note}`)
  ];
  return rows.join("\n");
}

function fusionMathAuditToMarkdown(report: SenaReport) {
  const matrixTotal = (value?: number) => (typeof value === "number" ? formatReportNumber(value) : "NA");
  const rows = [
    `- Schema: ${report.fusionMathAudit.schemaVersion}`,
    `- Overall status: ${report.fusionMathAudit.status}`,
    `- Passed/review-needed: ${report.fusionMathAudit.passed}/${report.fusionMathAudit.reviewNeeded}`,
    "",
    "| Check | Status | Expected | Actual | Max delta |",
    "| --- | --- | --- | --- | ---: |",
    ...report.fusionMathAudit.items.map((item) => (
      `| ${markdownCell(item.label)} | ${item.status} | ${markdownCell(item.expected)} | ${markdownCell(item.actual)} | ${typeof item.maxDelta === "number" ? formatReportNumber(item.maxDelta) : "NA"} |`
    )),
    "",
    "### Matrix Fingerprints",
    "",
    "- Matrix checksum algorithm: sena-stable-fnv1a32/v1",
    "",
    "| Matrix | Shape | Checksum | Value kinds | Totals | Non-zero |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.fusionMathAudit.matrixFingerprints.map((fingerprint) => (
      `| ${fingerprint.id} | ${fingerprint.shape} | ${fingerprint.checksum} | ${fingerprint.valueKinds.join(", ")} | raw=${matrixTotal(fingerprint.totals.raw)}; normalized=${matrixTotal(fingerprint.totals.normalized)}; values=${matrixTotal(fingerprint.totals.values)} | raw=${fingerprint.nonZero.raw ?? "NA"}; normalized=${fingerprint.nonZero.normalized ?? "NA"}; values=${fingerprint.nonZero.values ?? "NA"} |`
    )),
    "",
    ...report.fusionMathAudit.notes.map((note) => `- ${note}`)
  ];
  return rows.join("\n");
}

function pilotReadinessAuditToMarkdown(audit: SenaPilotReadinessAudit) {
  const rows = [
    `- Schema: ${audit.schemaVersion}`,
    `- Overall status: ${audit.status}`,
    `- Ready/review-needed: ${audit.passed}/${audit.reviewNeeded}`,
    "",
    "| Item | Category | Status | Summary | Next action |",
    "| --- | --- | --- | --- | --- |",
    ...audit.items.map((item) => (
      `| ${markdownCell(item.label)} | ${item.category} | ${item.status} | ${markdownCell(item.summary)} | ${markdownCell(item.nextAction)} |`
    )),
    "",
    ...audit.notes.map((note) => `- ${note}`)
  ];
  return rows.join("\n");
}

function claimReadinessGateToMarkdown(gate: SenaClaimReadinessGate) {
  const rows = [
    `- Schema: ${gate.schemaVersion}`,
    `- Overall status: ${gate.status}`,
    `- Claim use: ${gate.claimUse}`,
    `- Ready/review-needed: ${gate.ready}/${gate.reviewNeeded}`,
    `- Guardrail: ${gate.guardrail}`,
    gate.blockers.length > 0 ? `- Review blockers: ${gate.blockers.join(", ")}` : "- Review blockers: None",
    "",
    "| Gate | Status | Summary | Guardrail |",
    "| --- | --- | --- | --- |",
    ...gate.items.map((item) => (
      `| ${markdownCell(item.label)} | ${item.status} | ${markdownCell(item.summary)} | ${markdownCell(item.guardrail)} |`
    )),
    "",
    ...gate.notes.map((note) => `- ${note}`)
  ];
  return rows.join("\n");
}

function codingReliabilityGateToMarkdown(gate: SenaCodingReliabilityGate) {
  const rows = [
    `- Schema: ${gate.schemaVersion}`,
    `- Overall status: ${gate.status}`,
    `- Claim use: ${gate.claimUse}`,
    `- Guardrail: ${gate.guardrail}`,
    gate.blockers.length > 0 ? `- Blockers: ${gate.blockers.join(" ")}` : "- Blockers: None",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Documentation status | ${markdownCell(gate.review.status)} |`,
    `| Reviewer | ${markdownCell(gate.review.reviewer || "Unassigned")} |`,
    `| Coding scheme | ${markdownCell(gate.review.codingScheme)} |`,
    `| Unit of coding | ${markdownCell(gate.review.unitOfCoding)} |`,
    `| Coder count | ${gate.review.coderCount} |`,
    `| Agreement metric | ${markdownCell(gate.review.agreementMetric)} |`,
    `| Agreement value | ${markdownCell(gate.review.agreementValue)} |`,
    `| Adjudication notes | ${markdownCell(gate.review.adjudicationNotes)} |`,
    `| Limitations | ${markdownCell(gate.review.limitations)} |`,
    "",
    ...gate.notes.map((note) => `- ${note}`)
  ];
  return rows.join("\n");
}

export function buildSenaSnaReportArtifact(model: SenaModel, options: SenaSnaReportArtifactOptions = {}): SenaSnaReportArtifact {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const title = options.title?.trim() || "SENA jSNA Social Report";
  const manifest = buildSenaSnaManifest(model);
  const socialTieHandoff = buildSenaJsnaSocialTieHandoffRows(model, manifest);

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.snaReport,
    title,
    generatedAt,
    workspaceRoute: "/workspace/sena",
    analysisWindow: options.activeTemporalWindow ?? null,
    parameters: {
      undirectedSocial: model.options.undirectedSocial,
      normalization: model.options.normalization
    },
    runtimeProvenance: runtimeProvenance.snaRuntime,
    metricProvenance: metricProvenance.filter((metric) => metric.scope === "social-graph" || metric.scope === "social-actor" || metric.scope === "community"),
    manifest,
    socialReport: model.socialReport,
    socialMatrix: model.matrices.S,
    socialTieHandoff,
    interpretationGuardrails,
    notes: [
      "This artifact isolates the jSNA/sna.js social layer for reviewer inspection.",
      "Interpret social centrality and community metrics separately from epistemic contribution quality."
    ]
  };
}

export function buildSenaMetricProvenanceArtifact(
  model: SenaModel,
  options: SenaMetricProvenanceArtifactOptions = {}
): SenaMetricProvenanceArtifact {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const title = options.title?.trim() || "SENA Metric Provenance";
  const enaManifest = buildSenaEnaManifest(model.dataset);
  const snaManifest = buildSenaSnaManifest(model);
  const runtimeConsistencyAudit = buildSenaRuntimeConsistencyAudit({
    model,
    enaManifest,
    snaManifest
  });
  const enaOutputs = enaManifest.outputs;
  const conceptPairHandoff = buildSenaJenaConceptPairHandoffRows(model, enaManifest);
  const socialTieHandoff = buildSenaJsnaSocialTieHandoffRows(model, snaManifest);
  const bySource = countBy(metricProvenance.map((metric) => metric.source))
    .map(({ value, count }) => ({ source: value, count }));
  const byScope = countBy(metricProvenance.map((metric) => metric.scope))
    .map(({ value, count }) => ({ scope: value, count }));
  const layerTotals = fusionLayerTotals(model);

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.metricProvenance,
    title,
    generatedAt,
    workspaceRoute: "/workspace/sena",
    analysisWindow: options.activeTemporalWindow ?? null,
    runtimeProvenance,
    metricProvenance,
    coverage: {
      totalMetrics: metricProvenance.length,
      bySource,
      byScope,
      parityCovered: metricProvenance.filter((metric) => !/no .*parity|deferred/i.test(metric.parityStatus)).length,
      interpretationLimits: metricProvenance.filter((metric) => metric.interpretationLimit.trim().length > 0).length
    },
    socialMetricSnapshot: {
      graph: model.socialReport.graph,
      actorMetrics: model.socialReport.actors,
      socialMatrix: model.matrices.S,
      socialTieHandoff
    },
    epistemicMetricSnapshot: {
      manifest: enaManifest,
      conceptMatrix: model.matrices.W,
      conceptPairHandoff,
      runtimeConsistencyAudit,
      enaSpace: {
        dimensions: enaOutputs?.dimensions ?? [],
        variance: enaOutputs?.variance ?? {},
        nodePositions: enaOutputs?.nodePositions ?? [],
        points: enaOutputs?.points ?? [],
        connectionCounts: enaOutputs?.connectionCounts ?? [],
        lineWeights: enaOutputs?.lineWeights ?? []
      }
    },
    fusionMetricSnapshot: {
      parameters: {
        alpha: model.options.alpha,
        beta: model.options.beta,
        gamma: model.options.gamma,
        normalization: model.options.normalization
      },
      layerTotals,
      matrices: {
        S: model.matrices.S,
        W: model.matrices.W,
        B: model.matrices.B,
        G: model.matrices.G,
        fusion: model.matrices.fusion
      }
    },
    interpretationGuardrails,
    notes: [
      "This artifact isolates metric source, parity, and interpretation-limit provenance for local SENA research review.",
      "Direct jSNA/sna.js metrics, jENA metrics, SENA-implemented metrics, and SENA composite metrics are intentionally separated and paired with social, epistemic, and fusion snapshots.",
      "Metric provenance is not coding reliability or claim-readiness evidence by itself."
    ]
  };
}

export function buildSenaEnaReportArtifact(model: SenaModel, options: SenaEnaReportArtifactOptions = {}): SenaEnaReportArtifact {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const title = options.title?.trim() || "SENA jENA Epistemic Report";
  const manifest = buildSenaEnaManifest(model.dataset);
  const snaManifest = buildSenaSnaManifest(model);
  const runtimeConsistencyAudit = buildSenaRuntimeConsistencyAudit({
    model,
    enaManifest: manifest,
    snaManifest
  });
  const outputs = manifest.outputs;
  const conceptPairHandoff = buildSenaJenaConceptPairHandoffRows(model, manifest);

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enaReport,
    title,
    generatedAt,
    workspaceRoute: "/workspace/sena",
    analysisWindow: options.activeTemporalWindow ?? null,
    parameters: {
      normalization: model.options.normalization,
      manifestOptions: manifest.options ?? null
    },
    runtimeProvenance: runtimeProvenance.enaRuntime,
    metricProvenance: metricProvenance.filter((metric) => metric.scope === "concept" || metric.source === "jena-js"),
    manifest,
    conceptMatrix: model.matrices.W,
    conceptPairHandoff,
    runtimeConsistencyAudit,
    enaSpace: {
      dimensions: outputs?.dimensions ?? [],
      variance: outputs?.variance ?? {},
      nodePositions: outputs?.nodePositions ?? [],
      points: outputs?.points ?? [],
      connectionCounts: outputs?.connectionCounts ?? [],
      lineWeights: outputs?.lineWeights ?? []
    },
    interpretationGuardrails,
    notes: [
      "This artifact isolates the local jENA epistemic layer for reviewer inspection.",
      "Use the runtime consistency audit to confirm jENA concept-pair signal handoff to SENA W before interpreting ENA-space positions.",
      "Report jENA manifest settings, coding reliability, and human review before turning code-network patterns into research claims."
    ]
  };
}

export function buildSenaPairContributionReportArtifact(model: SenaModel, options: SenaPairContributionReportArtifactOptions = {}): SenaPairContributionReportArtifact {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const title = options.title?.trim() || "SENA Person-Code-Pair G Report";
  const attributionCopy = buildSenaAttributionWordingCopy(model.operatorDiagnostics.attribution.contributionWordingAllowed);

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.personCodePairGReport,
    title,
    generatedAt,
    workspaceRoute: "/workspace/sena",
    analysisWindow: options.activeTemporalWindow ?? null,
    parameters: {
      alpha: model.options.alpha,
      beta: model.options.beta,
      gamma: model.options.gamma,
      normalization: model.options.normalization
    },
    runtimeProvenance,
    metricProvenance: metricProvenance.filter((metric) => metric.scope === "bridge" || metric.scope === "concept" || metric.scope === "fusion"),
    pairReport: model.pairReport,
    G: model.matrices.G,
    supportingMatrices: {
      S: model.matrices.S,
      W: model.matrices.W,
      B: model.matrices.B
    },
    interpretationGuardrails,
    notes: attributionCopy.reportNotes
  };
}

export function buildSenaMarkdownReport(report: SenaReport) {
  const lines = [
    `# ${report.title}`,
    "",
    `Generated: ${report.generatedAt}`,
    `Review status: ${report.humanReview.status}`,
    report.humanReview.reviewer ? `Reviewer: ${report.humanReview.reviewer}` : "Reviewer: Unassigned",
    `Analysis window: ${report.analysisWindow ? `${report.analysisWindow.label} (turns ${report.analysisWindow.startTurn}-${report.analysisWindow.endTurn}; ${report.analysisWindow.mode})` : "Full conversation"}`,
    "",
    "## Parameters",
    "",
    `- Analysis window: ${report.analysisWindow ? report.analysisWindow.label : "Full conversation"}`,
    ...(report.analysisWindow ? [
      `- Window mode: ${report.analysisWindow.mode}`,
      `- Window turns: ${report.analysisWindow.startTurn}-${report.analysisWindow.endTurn}`,
      `- Window utterances/interactions/segments: ${report.analysisWindow.utteranceIds.length}/${report.analysisWindow.interactionCount}/${report.analysisWindow.segmentCount}`,
      `- Window evidence snippets: ${report.analysisWindow.evidence.length}`
    ] : []),
    `- Alpha (SNA): ${formatReportNumber(report.parameters.buildOptions.alpha)}`,
    `- Beta (ENA): ${formatReportNumber(report.parameters.buildOptions.beta)}`,
    `- Gamma (Bridge): ${formatReportNumber(report.parameters.buildOptions.gamma)}`,
    `- Normalization: ${report.parameters.buildOptions.normalization}`,
    `- Bridge weight rule: ${report.parameters.buildOptions.bridgeWeightRule}`,
    `- Direction: ${report.parameters.buildOptions.direction}`,
    `- Degree convention: ${report.parameters.buildOptions.deg_convention}`,
    `- Phi: ${report.parameters.buildOptions.Phi}`,
    `- Delta: ${report.parameters.buildOptions.delta}`,
    `- d: ${report.parameters.buildOptions.d}`,
    `- Seed: ${report.parameters.buildOptions.seed}`,
    `- Dataset version: ${report.operatorDiagnostics.runIdentity.datasetVersion}`,
    `- Dataset content hash: ${report.operatorDiagnostics.runIdentity.datasetContentHash}`,
    `- Analysis config hash: ${report.operatorDiagnostics.runIdentity.configHash}`,
    `- Undirected social layer: ${report.parameters.buildOptions.undirectedSocial ? "yes" : "no"}`,
    `- Temporal mode: ${report.parameters.buildOptions.temporal.mode}`,
    "",
    "## Model Card",
    "",
    modelCardToMarkdown(report),
    "",
    "## Runtime Provenance",
    "",
    `- SENA model: ${report.runtimeProvenance.senaModel.engine} (${report.runtimeProvenance.senaModel.implementation})`,
    `- Fusion formula: ${report.runtimeProvenance.senaModel.matrixFormula}`,
    `- ENA runtime: ${report.runtimeProvenance.enaRuntime.engine} ${report.runtimeProvenance.enaRuntime.version}`,
    `- ENA dependency: ${report.runtimeProvenance.enaRuntime.dependencySpec} (${report.runtimeProvenance.enaRuntime.packagePath})`,
    `- ENA API surface: ${report.runtimeProvenance.enaRuntime.apiSurface.join(", ")}`,
    `- SNA runtime: ${report.runtimeProvenance.snaRuntime.engine} ${report.runtimeProvenance.snaRuntime.version}`,
    `- SNA dependency: ${report.runtimeProvenance.snaRuntime.dependencySpec} (${report.runtimeProvenance.snaRuntime.packagePath})`,
    `- SNA API surface: ${report.runtimeProvenance.snaRuntime.apiSurface.join(", ")}`,
    ...report.runtimeProvenance.notes.map((note) => `- ${note}`),
    "",
    "### Runtime Parity Evidence",
    "",
    ...report.runtimeProvenance.parityEvidence.map((evidence) => (
      `- ${evidence.id}: ${evidence.referenceRuntime}; ${evidence.status}; fixture=${evidence.fixturePath}; coverage=${evidence.coverage.join(", ")}; units=${evidence.sample.units ?? "NA"}; codes=${evidence.sample.codes ?? "NA"}`
    )),
    "",
    "## Interpretation Guardrails",
    "",
    ...report.interpretationGuardrails.map((guardrail) => `- ${guardrail.label}: ${guardrail.statement}`),
    "",
    "## Embedding Diagnostics",
    "",
    embeddingDiagnosticsToMarkdown(report),
    "",
    "## Bridge Weight Rule",
    "",
    bridgeWeightingToMarkdown(report),
    "",
    "## Attribution Wording Gate",
    "",
    attributionDiagnosticsToMarkdown(report),
    "",
    "## Typed Centrality Families",
    "",
    typedCentralityDiagnosticsToMarkdown(report),
    "",
    "## Data Governance",
    "",
    dataGovernanceToMarkdown(report.dataGovernance),
    "",
    "## Data Contract Audit",
    "",
    dataContractAuditToMarkdown(report),
    "",
    "## jENA Manifest",
    "",
    `- Status: ${report.enaManifest.status}`,
    `- Engine: ${report.enaManifest.engine} ${report.enaManifest.engineVersion}`,
    `- Rows/units/conversations/codes: ${report.enaManifest.datasetCounts.rows}/${report.enaManifest.datasetCounts.units}/${report.enaManifest.datasetCounts.conversations}/${report.enaManifest.datasetCounts.codes}`,
    `- Dimensions: ${report.enaManifest.outputs?.dimensions.join(", ") || "NA"}`,
    `- Variance: ${report.enaManifest.outputs ? Object.entries(report.enaManifest.outputs.variance).map(([dimension, value]) => `${dimension} ${formatReportNumber(value)}`).join("; ") : "NA"}`,
    "",
    "## jSNA Manifest",
    "",
    `- Status: ${report.snaManifest.status}`,
    `- Engine: ${report.snaManifest.engine} ${report.snaManifest.engineVersion}`,
    `- Alias: ${report.snaManifest.engineAlias}`,
    `- Graph mode: ${report.snaManifest.source.graphMode}`,
    `- Undirected social layer: ${report.snaManifest.source.undirectedSocial ? "yes" : "no"}`,
    `- People/interactions/weighted ties: ${report.snaManifest.datasetCounts.people}/${report.snaManifest.datasetCounts.interactions}/${report.snaManifest.datasetCounts.weightedTies}`,
    `- Communities/components: ${report.snaManifest.datasetCounts.communities}/${report.snaManifest.datasetCounts.components}`,
    `- Density: ${report.snaManifest.outputs ? formatReportNumber(report.snaManifest.outputs.graph.density) : "NA"}`,
    "",
    "## Runtime Consistency Audit",
    "",
    runtimeConsistencyAuditToMarkdown(report),
    "",
    "## Fusion Math Audit",
    "",
    fusionMathAuditToMarkdown(report),
    "",
    "## Pilot Readiness Audit",
    "",
    pilotReadinessAuditToMarkdown(report.pilotReadinessAudit),
    "",
    "## Claim Readiness Gate",
    "",
    claimReadinessGateToMarkdown(report.claimReadinessGate),
    "",
    "## Coding Reliability Gate",
    "",
    codingReliabilityGateToMarkdown(report.codingReliabilityGate),
    "",
    "## Report Completeness Audit",
    "",
    completenessAuditToMarkdown(report),
    "",
    "## Validation",
    "",
    `- Sensitivity checks: ${report.validation.sensitivity.layerWeights.variants.length} layer-weight variants; ${report.validation.sensitivity.normalization.variants.length} normalization variants`,
    `- Null model target: ${report.validation.nullModels.targetConceptPair.label} (observed W ${formatReportNumber(report.validation.nullModels.targetConceptPair.observedWeight)})`,
    `- Permutation p>=observed: ${formatReportNumber(report.validation.nullModels.permutation.pValueGreaterOrEqual)}`,
    `- Bootstrap 95% interval: ${formatReportNumber(report.validation.nullModels.bootstrap.lower)} to ${formatReportNumber(report.validation.nullModels.bootstrap.upper)}`,
    "",
    "## Dataset",
    "",
    `- People: ${report.parameters.datasetCounts.people}`,
    `- Interactions: ${report.parameters.datasetCounts.interactions}`,
    `- Utterances: ${report.parameters.datasetCounts.utterances}`,
    `- Coded segments: ${report.parameters.datasetCounts.codedSegments}`,
    `- Codes: ${report.parameters.datasetCounts.codes}`,
    "",
    "## Summary",
    "",
    `- Social ties: ${report.summary.socialEdges}`,
    `- Concept edges: ${report.summary.conceptEdges}`,
    `- Bridge edges: ${report.summary.bridgeEdges}`,
    `- Density: ${formatReportNumber(report.summary.socialAnalysis.density)}`,
    `- Reciprocity: ${formatReportNumber(report.summary.socialAnalysis.reciprocity)}`,
    `- Communities: ${report.summary.socialAnalysis.communityCount}`,
    "",
    "## Figures",
    "",
    `- Fusion graph: ${report.figures.fusionGraph.nodes.length} nodes, ${report.figures.fusionGraph.edges.length} edges`,
    `- Temporal trace: ${report.figures.temporalTrace.windows.length} windows`,
    `- Social communities: ${report.figures.socialCommunities.length}`,
    `- Visual grammar: ${report.figures.visualGrammar.map((item) => item.label).join("; ")}`,
    "",
    "### Visual Grammar",
    "",
    ...report.figures.visualGrammar.flatMap((item) => [
      `- ${item.label}`,
      `  - Encoding: ${item.visualEncoding}`,
      `  - Data mapping: ${item.dataMapping}`,
      `  - Interpretation role: ${item.interpretationRole}`,
      `  - Guardrail: ${item.guardrail}`
    ]),
    "",
    ...(report.figures.activeWindowComparison ? [
      "## Active Window Comparison",
      "",
      activeWindowComparisonToMarkdown(report),
      ""
    ] : []),
    ...(report.figures.activeWindowBrief ? [
      "## Active Window Brief",
      "",
      activeWindowBriefToMarkdown(report),
      ""
    ] : []),
    "## Temporal Trace",
    "",
    temporalTraceToMarkdown(report),
    "",
    "## Matrices",
    "",
    matrixBlockToMarkdown("S: social layer", report.matrices.S),
    "",
    matrixBlockToMarkdown("W: concept layer", report.matrices.W),
    "",
    rectangularMatrixToMarkdown("B: bridge layer", report.matrices.B.rowLabels, report.matrices.B.columnLabels, report.matrices.B.raw),
    "",
    rectangularMatrixToMarkdown("B_PC: person-to-code bridge layer", report.matrices.B_PC.rowLabels, report.matrices.B_PC.columnLabels, report.matrices.B_PC.raw),
    "",
    rectangularMatrixToMarkdown("B_CP: code-to-person bridge layer", report.matrices.B_CP.rowLabels, report.matrices.B_CP.columnLabels, report.matrices.B_CP.raw),
    "",
    rectangularMatrixToMarkdown("Y: participation matrix", report.matrices.Y.rowLabels, report.matrices.Y.columnLabels, report.matrices.Y.raw),
    "",
    pairMatrixBlockToMarkdown("G: person-code-pair layer", report.matrices.G),
    "",
    rectangularMatrixToMarkdown("Fusion matrix", report.matrices.fusion.labels, report.matrices.fusion.labels, report.matrices.fusion.values),
    "",
    "## Person-Code-Pair Drivers",
    "",
    pairDriversToMarkdown(report),
    "",
    "## Method Validation",
    "",
    "### Metric Provenance",
    "",
    metricProvenanceToMarkdown(report),
    "",
    sensitivityCheckToMarkdown(report.validation.sensitivity.layerWeights),
    "",
    sensitivityCheckToMarkdown(report.validation.sensitivity.normalization),
    "",
    "### Community Stability",
    "",
    communityStabilityToMarkdown(report),
    "",
    "### Temporal Stability",
    "",
    temporalStabilityToMarkdown(report),
    "",
    "### Permutation and Bootstrap Null Models",
    "",
    nullModelsToMarkdown(report),
    "",
    "## Evidence Snippets",
    ""
  ];

  if (report.evidenceSnippets.length === 0) {
    lines.push("_No evidence snippets available._");
  } else {
    report.evidenceSnippets.forEach((snippet, index) => {
      lines.push(`${index + 1}. ${snippet.sourceLabel} (${snippet.source}, ${snippet.label}, ${snippet.stage})`);
      lines.push(`   - Codes: ${snippet.codes?.join(", ") || "NA"}`);
      if (snippet.lineage) {
        const related = snippet.lineage.related;
        const relatedBits = [
          related?.utteranceId ? `utterance=${related.utteranceId}` : null,
          related?.segmentId ? `segment=${related.segmentId}` : null,
          related?.interactionId ? `interaction=${related.interactionId}` : null,
          related?.personId ? `person=${related.personId}` : null,
          related?.windowId ? `window=${related.windowId}` : null,
          related?.codeIds?.length ? `codes=${related.codeIds.join("|")}` : null
        ].filter(Boolean);
        lines.push(`   - Lineage: table=${snippet.lineage.table}; row=${snippet.lineage.rowId}${relatedBits.length ? `; ${relatedBits.join("; ")}` : ""}`);
      }
      lines.push(`   - Text: ${snippet.text}`);
    });
  }

  lines.push(
    "",
    "## Human-Reviewed Interpretation",
    "",
    "### Interpretation",
    "",
    report.humanReview.interpretation,
    "",
    "### Limitations",
    "",
    report.humanReview.limitations,
    "",
    "### Next Actions",
    "",
    report.humanReview.nextActions
  );

  if (report.parameters.warnings.length > 0) {
    lines.push("", "## Validation Warnings", "");
    report.parameters.warnings.forEach((warning) => lines.push(`- ${warning}`));
  }

  return `${lines.join("\n")}\n`;
}
