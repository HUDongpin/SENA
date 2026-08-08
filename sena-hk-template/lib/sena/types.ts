import type { SENA_SCHEMA_VERSIONS } from "./schema-registry";

export type SenaLayer = "social" | "concept" | "bridge";

export type SenaEdgeType = "PP" | "CC" | "PC" | "CP";

export type SenaLayoutMode = "explanatory" | "ena-space" | "joint";

export type SenaNormalization = "max" | "frobenius" | "log1p-max" | "log-max" | "none";

export type SenaBridgeWeightRule = "count" | "confidence";

export type SenaAnalysisDirection = "directed" | "undirected";

export type SenaDegreeConvention = "row-sum";

export type SenaEmbeddingPhi = "classical_mds" | "laplacian_eigenmaps" | "commute_time";

export type SenaEmbeddingDelta =
  | "shortest_path_reciprocal_weight"
  | "combinatorial_laplacian"
  | "commute_time_resistance";

export type SenaAnalysisConfigDeclaration = {
  direction: SenaAnalysisDirection;
  deg_convention: SenaDegreeConvention;
  delta: SenaEmbeddingDelta;
  Phi: SenaEmbeddingPhi;
  d: number;
  seed: number;
};

export type SenaTemporalMode = "stage" | "moving-window" | "turn-window";

export type SenaTemporalOptions = {
  mode: SenaTemporalMode;
  movingWindowSize: number;
  movingWindowStep: number;
  turnWindowRadius: number;
};

export type SenaActorType = "human" | "ai_agent";

export type SenaPerson = {
  id: string;
  label: string;
  role: string;
  group: string;
  initials?: string;
  // ADR-0006 D2: additive actor typing. Absent means "human"; the field is
  // only stored when the source declares it, so untyped rosters, exports, and
  // fingerprints stay byte-identical. No matrix semantics read this field.
  actorType?: SenaActorType;
};

export type SenaUtterance = {
  id: string;
  personId: string;
  unitId: string;
  stanzaId: string;
  stage: string;
  turnIndex: number;
  text: string;
  timestamp?: string;
};

export type SenaInteraction = {
  source: string;
  target: string;
  weight?: number;
  channel: string;
  stage: string;
  turnIndex?: number;
  evidence: string;
};

export type SenaCode = {
  id: string;
  label: string;
  family: string;
  description: string;
  color: string;
};

export type SenaCodedSegment = {
  segmentId: string;
  utteranceId: string;
  personId: string;
  targetPersonIds?: string[];
  unitId: string;
  stanzaId: string;
  stage: string;
  turnIndex: number;
  text: string;
  codes: string[];
  confidence?: number;
};

export type SenaDatasetMetadata = {
  datasetVersion: string;
  consent: {
    instrument: string;
    date: string;
    scope: string;
  };
  retention: {
    policy: string;
    deleteBy?: string;
  };
  pseudonymization: {
    personIdPolicy: "opaque" | "human-readable" | "unknown";
    rosterMapping: "external-encrypted-store" | "not-stored" | "unknown";
  };
  codebook: {
    id: string;
    version: string;
    contentHash: string;
  };
};

export type SenaDataset = {
  metadata?: SenaDatasetMetadata;
  people: SenaPerson[];
  interactions: SenaInteraction[];
  utterances: SenaUtterance[];
  coded_segments: SenaCodedSegment[];
  codebook: SenaCode[];
  warnings?: string[];
};

export type SenaBuildOptions = {
  alpha: number;
  beta: number;
  gamma: number;
  normalization: SenaNormalization;
  bridgeWeightRule: SenaBridgeWeightRule;
  direction?: SenaAnalysisDirection;
  deg_convention?: SenaDegreeConvention;
  delta?: SenaEmbeddingDelta;
  Phi?: SenaEmbeddingPhi;
  d?: number;
  seed?: number;
  undirectedSocial?: boolean;
  temporal?: Partial<SenaTemporalOptions>;
};

export type SenaResolvedBuildOptions = SenaAnalysisConfigDeclaration & {
  alpha: number;
  beta: number;
  gamma: number;
  normalization: SenaNormalization;
  bridgeWeightRule: SenaBridgeWeightRule;
  undirectedSocial: boolean;
  temporal: SenaTemporalOptions;
};

export type SenaEvidenceSnippet = {
  id: string;
  stage: string;
  personId?: string;
  label: string;
  text: string;
  codes?: string[];
  lineage?: {
    table: "interactions" | "coded_segments" | "utterances" | "temporal_window";
    rowId: string;
    related?: {
      utteranceId?: string;
      segmentId?: string;
      interactionId?: string;
      personId?: string;
      codeIds?: string[];
      windowId?: string;
    };
  };
};

export type SenaNode =
  | {
      id: string;
      kind: "person";
      label: string;
      role: string;
      group: string;
      initials: string;
      metrics: SenaPersonMetrics;
    }
  | {
      id: string;
      kind: "concept";
      label: string;
      family: string;
      color: string;
      description: string;
      metrics: SenaConceptMetrics;
    };

export type SenaEdge = {
  id: string;
  layer: SenaLayer;
  edgeType: SenaEdgeType;
  sourceKind: SenaNode["kind"];
  targetKind: SenaNode["kind"];
  source: string;
  target: string;
  weight: number;
  normalizedWeight: number;
  scaledWeight: number;
  label: string;
  evidence: SenaEvidenceSnippet[];
};

export type SenaPersonMetrics = {
  socialStrength: number;
  socialDegree: number;
  socialBetweenness: number;
  socialCloseness: number;
  socialComponent: number;
  socialCommunity: number;
  socialReachable: number;
  epistemicContribution: number;
  bridgeScore: number;
  epistemicDiversity: number;
  alignment: number;
  conceptBrokerage: number;
  topInteractors: Array<{ id: string; label: string; weight: number }>;
  topCodes: Array<{ id: string; label: string; weight: number }>;
  topPairs: Array<{ pair: string; label: string; weight: number }>;
};

export type SenaConceptMetrics = {
  weightedDegree: number;
  totalContribution: number;
  topCooccurring: Array<{ id: string; label: string; weight: number }>;
  topContributors: Array<{ id: string; label: string; weight: number }>;
};

export type SenaTemporalWindow = {
  id: string;
  label: string;
  mode: SenaTemporalMode;
  index: number;
  startTurn: number;
  endTurn: number;
  centerTurn?: number;
  stages: string[];
  utteranceIds: string[];
  segmentIds: string[];
  interactionCount: number;
  segmentCount: number;
  evidence: SenaEvidenceSnippet[];
  rawSocialConnectivity: number;
  rawConceptConnectivity: number;
  rawBridgeIntegration: number;
  socialConnectivity: number;
  conceptConnectivity: number;
  bridgeIntegration: number;
  topCodes: Array<{ id: string; label: string; weight: number }>;
};

export type SenaTemporalSeries = {
  settings: SenaTemporalOptions;
  windows: SenaTemporalWindow[];
};

export type SenaReportHumanReview = {
  status: "draft" | "human-reviewed";
  reviewer: string;
  reviewedAt: string;
  interpretation: string;
  limitations: string;
  nextActions: string;
};

export type SenaCodingReliabilityReview = {
  status: "not-documented" | "documented";
  reviewer: string;
  reviewedAt: string;
  codingScheme: string;
  unitOfCoding: string;
  coderCount: number;
  agreementMetric: string;
  agreementValue: string;
  adjudicationNotes: string;
  limitations: string;
};

export type SenaDataGovernanceMetadata = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.dataGovernanceMetadata;
  status: "complete" | "needs-review";
  irbApprovalId: string;
  consentScope: string;
  retentionPolicy: string;
  usageConstraints: string[];
  dataSteward: string;
  reviewedAt: string;
  requiredEvidence: string[];
  blockers: string[];
  guardrail: string;
};

export type SenaCodingReliabilityGate = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.codingReliabilityGate;
  status: "ready" | "review";
  claimUse: "coding-reliability-documented" | "coding-reliability-needed";
  review: SenaCodingReliabilityReview;
  requiredEvidence: string[];
  evidence: string[];
  blockers: string[];
  guardrail: string;
  notes: string[];
};

export type SenaReportEvidenceSnippet = SenaEvidenceSnippet & {
  source: "social-edge" | "concept-edge" | "bridge-edge" | "pair-contribution" | "temporal-window";
  sourceId: string;
  sourceLabel: string;
};

export type SenaEvidenceSource = SenaReportEvidenceSnippet["source"];

export type SenaManifestRow = Record<string, string | number | boolean | null>;

export type SenaEnaManifest = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enaManifest;
  status: "computed" | "skipped";
  engine: "jena-js";
  engineVersion: string;
  source: {
    rowsFrom: "coded_segments";
    unitColumns: string[];
    conversationColumns: string[];
    codeColumns: string[];
    metadataColumns: string[];
    activeCodeValue: "segment-confidence-or-1";
  };
  options?: {
    model: "EndPoint" | "AccumulatedTrajectory" | "SeparateTrajectory";
    window: "MovingStanzaWindow" | "Conversation";
    weightBy: "binary" | "sum";
    windowSizeBack: number;
    windowSizeForward: number;
    dimensions: number;
    nodePositionMethod: "undirected" | "directed" | "directed-ground-response";
    /**
     * jena-js's rotation method. Absent means SVD, which is both the jena-js
     * default and every manifest emitted before comparison mode existed — so a
     * default run records exactly the options it always recorded, and only a
     * deliberately rotated one says so.
     */
    rotation?: "svd" | "mean";
    /** The metadata column whose two values define a means rotation. */
    groupColumn?: string;
    /** Set when the space was reused from a prior manifest's rotation. */
    projectedIn?: boolean;
  };
  datasetCounts: {
    rows: number;
    units: number;
    conversations: number;
    codes: number;
  };
  outputs?: {
    adjacencyKey: Array<{
      source: string;
      target: string;
      name: string;
      sourceIndex: number;
      targetIndex: number;
    }>;
    dimensions: string[];
    variance: Record<string, number>;
    /**
     * Shares over every rotated dimension — jena-js's `set.variance` verbatim,
     * and the basis webENA titles axes with. `variance` above is the same
     * quantity renormalized over the two displayed dimensions, which is what
     * SENA's published summaries, the rENA parity fixture, and the low-rank
     * rule are defined on; the pilot's second axis reads 28.5% here and 34.6%
     * there. Both are true, so both are carried rather than reconciled.
     * Optional, so a manifest emitted before this field stays readable.
     */
    rotationVariance?: Record<string, number>;
    /**
     * jena-js `enaCorrelations(set)` — per dimension, how well the projected
     * unit positions agree with their network centroids (Pearson and Spearman
     * over all pairwise differences, with a 95% interval on the Pearson). This
     * is the co-registration goodness of fit rENA reports beside an ENA model
     * definition. Serialized here because the correlation needs the live
     * `ENASet`, and the manifest is what survives to the client.
     *
     * Optional twice over: a manifest emitted before this field stays readable,
     * and a run whose correlation pass fails or is not estimable keeps its
     * projection, recording the reason as a warning instead.
     */
    goodnessOfFit?: Array<{
      dimension: string;
      pearson: number;
      spearman: number;
      pearsonLower: number;
      pearsonUpper: number;
    }>;
    /**
     * The rotation itself, in the form jena-js's `projectIn` needs to place a
     * second window in this window's space — the fix the rank audit anticipates
     * for windows whose own SVDs are not comparable.
     *
     * Only the parts not already serialized are stored: the adjacency key and
     * the code list are read back off `outputs.adjacencyKey` and
     * `source.codeColumns` by `senaEnaRotationReference`, and the rotated node
     * positions are `outputs.nodePositions`.
     *
     * Emitted only when a caller asked for a rotation worth sharing (a means
     * rotation, a projected-in space, or an explicit request), so a default run
     * carries exactly the bytes it carried before this field existed.
     */
    rotation?: {
      method: "svd" | "mean";
      /** Names for every column of `matrix` — MR1 first under a means rotation. */
      columns: string[];
      /** The full rotation matrix, not the two displayed columns. */
      matrix: number[][];
      eigenvalues: number[];
      /** The centre `projectIn` re-centres a new window's line weights on. */
      centerVector: number[];
    };
    connectionCounts: SenaManifestRow[];
    lineWeights: SenaManifestRow[];
    pointsForProjection: SenaManifestRow[];
    points: SenaManifestRow[];
    nodePositions: SenaManifestRow[];
    centroids: SenaManifestRow[];
  };
  warnings: string[];
};

export type SenaSnaManifest = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.jsnaManifest;
  status: "computed" | "skipped";
  engine: "sna.js";
  engineAlias: "jSNA";
  engineVersion: string;
  source: {
    rowsFrom: "interactions";
    nodeTable: "people";
    sourceColumn: "source";
    targetColumn: "target";
    weightColumn: "weight";
    stageColumn: "stage";
    evidenceColumn: "evidence";
    graphMode: "graph" | "digraph";
    undirectedSocial: boolean;
  };
  datasetCounts: {
    people: number;
    interactions: number;
    weightedTies: number;
    communities: number;
    components: number;
  };
  outputs?: {
    graph: SenaSocialReport["graph"];
    actorMetrics: SenaSocialActorReport[];
    communities: SenaSocialCommunityReport[];
    socialMatrix: SenaMatrices["S"];
  };
  warnings: string[];
};

export type SenaMetricSource =
  | "jena-js"
  | "sna.js"
  | "sena-derived-from-sna.js"
  | "sena-self-implemented"
  | "sena-composite";

export type SenaMetricProvenance = {
  id: string;
  label: string;
  scope: "social-graph" | "social-actor" | "community" | "bridge" | "concept" | "fusion";
  source: SenaMetricSource;
  implementation: string;
  parityStatus: string;
  interpretationLimit: string;
};

export type SenaFusionLayerTotals = {
  social: number;
  concept: number;
  bridge: number;
  total: number;
};

export type SenaSensitivityVariant = {
  id: string;
  label: string;
  buildOptions: SenaResolvedBuildOptions;
  fusionLayerTotals: SenaFusionLayerTotals;
  fusionTotalDelta: number;
  socialDensity: number;
  communityCount: number;
  strongestScaledEdge?: {
    id: string;
    layer: SenaLayer;
    label: string;
    scaledWeight: number;
  };
};

export type SenaSensitivityCheck = {
  id: "layer-weights" | "normalization";
  label: string;
  baselineVariantId: string;
  variants: SenaSensitivityVariant[];
  notes: string[];
};

export type SenaCommunityStability = {
  method: string;
  deterministicRepeatAgreement: number;
  normalizationAgreement: Array<{
    normalization: SenaNormalization;
    agreement: number;
    communityCount: number;
  }>;
  stableAcrossNormalizations: boolean;
  notes: string[];
};

export type SenaTemporalStabilityVariant = {
  mode: SenaTemporalMode;
  windowCount: number;
  interactionAssignments: number;
  segmentAssignments: number;
  utteranceCoverage: number;
  segmentCoverage: number;
  interactionCoverage: number;
  emptyWindows: number;
  maxSocialConnectivity: number;
  maxConceptConnectivity: number;
  maxBridgeIntegration: number;
};

export type SenaTemporalStability = {
  variants: SenaTemporalStabilityVariant[];
  notes: string[];
};

export type SenaNullModelCheck = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.nullModels;
  seed: number;
  targetConceptPair: {
    id: string;
    codeA: string;
    codeB: string;
    label: string;
    observedWeight: number;
  };
  permutation: {
    method: "global-code-label-shuffle";
    iterations: number;
    pValueGreaterOrEqual: number;
    nullMean: number;
    nullLower: number;
    nullUpper: number;
    samplesPreview: number[];
  };
  bootstrap: {
    method: "stanza-resampling-with-replacement";
    iterations: number;
    confidenceLevel: number;
    mean: number;
    lower: number;
    upper: number;
    samplesPreview: number[];
  };
  notes: string[];
};

export type SenaValidation = {
  metricProvenance: SenaMetricProvenance[];
  sensitivity: {
    layerWeights: SenaSensitivityCheck;
    normalization: SenaSensitivityCheck;
  };
  stability: {
    community: SenaCommunityStability;
    temporal: SenaTemporalStability;
  };
  nullModels: SenaNullModelCheck;
};

export type SenaRuntimeProvenance = {
  parityEvidence: Array<{
    id: string;
    referenceRuntime: string;
    fixturePath: string;
    generatedBy: string;
    status: "covered" | "development-only" | "deferred";
    coverage: string[];
    sample: {
      units?: number;
      codes?: number;
      dimensions?: number;
      lineWeightRows?: number;
      lineWeightColumns?: number;
      connectionCountRows?: number;
      connectionCountColumns?: number;
      graphFamilies?: number;
    };
    interpretation: string;
  }>;
  senaModel: {
    engine: "sena-js";
    implementation: "lib/sena/model.ts";
    matrixFormula: "A_fusion = [alpha*S gamma*B_PC; gamma*B_CP beta*W]";
  };
  enaRuntime: {
    engine: "jena-js";
    version: string;
    packageName: "jena-js";
    dependencySpec: string;
    packagePath: "node_modules/jena-js/package.json";
    runtimeRole: "browser-and-node-javascript-ena-engine";
    apiSurface: string[];
  };
  snaRuntime: {
    engine: "sna.js";
    version: string;
    packageName: "@peterhudongpin/sna.js";
    dependencySpec: string;
    packagePath: "node_modules/sna.js/package.json";
    runtimeRole: "browser-and-node-javascript-sna-engine";
    apiSurface: string[];
  };
  notes: string[];
};

export type SenaInterpretationGuardrail = {
  id: string;
  label: string;
  statement: string;
};

export type SenaReportCompletenessItem = {
  id: string;
  label: string;
  status: "pass" | "review";
  summary: string;
  evidence: string[];
};

export type SenaReportCompletenessAudit = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.reportCompleteness;
  status: "complete" | "needs-review";
  passed: number;
  reviewNeeded: number;
  items: SenaReportCompletenessItem[];
  notes: string[];
};

export type SenaDataContractAuditItem = {
  id: string;
  label: string;
  status: "pass" | "review";
  expected: string;
  actual: string;
  detail: string[];
};

export type SenaDataContractAudit = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.dataContractAudit;
  status: "valid" | "needs-review";
  passed: number;
  reviewNeeded: number;
  items: SenaDataContractAuditItem[];
  notes: string[];
};

export type SenaDataContractAuditArtifact = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.dataContractAuditArtifact;
  title: string;
  generatedAt: string;
  analysisWindow: SenaTemporalWindow | null;
  parameters: {
    buildOptions: SenaResolvedBuildOptions;
    datasetCounts: {
      people: number;
      interactions: number;
      utterances: number;
      codedSegments: number;
      codes: number;
    };
    warnings: string[];
  };
  dataContractAudit: SenaDataContractAudit;
  notes: string[];
};

export type SenaRuntimeConsistencyItem = {
  id: string;
  label: string;
  status: "pass" | "review";
  expected: string;
  actual: string;
  detail: string[];
  metrics?: Record<string, string | number | boolean | string[] | number[]>;
};

export type SenaRuntimeConsistencyAudit = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.runtimeConsistency;
  status: "consistent" | "needs-review";
  passed: number;
  reviewNeeded: number;
  items: SenaRuntimeConsistencyItem[];
  notes: string[];
};

export type SenaJenaConceptPairHandoffRow = {
  id: string;
  codeA: string;
  codeB: string;
  codeALabel: string;
  codeBLabel: string;
  label: string;
  adjacencyColumn: string | null;
  adjacencyCovered: boolean;
  jenaConnectionTotal: number;
  jenaLineWeightTotal: number;
  senaRawWeight: number;
  senaNormalizedWeight: number;
  overlapStatus: "overlap" | "jena-only" | "sena-w-only" | "inactive";
  connectionRows: number;
  lineWeightRows: number;
  unitPreview: Array<{
    unit: string;
    connectionCount: number;
    lineWeight: number;
  }>;
  guardrail: string;
};

export type SenaJsnaSocialTieHandoffRow = {
  id: string;
  source: string;
  target: string;
  sourceLabel: string;
  targetLabel: string;
  label: string;
  graphMode: "graph" | "digraph";
  undirectedSocial: boolean;
  matrixRow: number;
  matrixColumn: number;
  edgeWeight: number;
  socialMatrixWeight: number;
  manifestMatrixWeight: number;
  normalizedWeight: number;
  matrixAligned: boolean;
  sourceActor: Pick<SenaSocialActorReport, "id" | "label" | "degree" | "strength" | "betweenness" | "closeness" | "reachable" | "component" | "community"> | null;
  targetActor: Pick<SenaSocialActorReport, "id" | "label" | "degree" | "strength" | "betweenness" | "closeness" | "reachable" | "component" | "community"> | null;
  evidencePreview: Array<{
    id: string;
    stage: string;
    label: string;
    text: string;
    rowId: string | null;
  }>;
  guardrail: string;
};

export type SenaFusionMathAuditItem = {
  id: string;
  label: string;
  status: "pass" | "review";
  expected: string;
  actual: string;
  maxDelta?: number;
  tolerance?: number;
  detail: string[];
};

export type SenaMatrixFingerprint = {
  id: "S" | "W" | "B" | "B_PC" | "B_CP" | "G" | "A_fusion";
  label: string;
  shape: string;
  checksumAlgorithm: "sena-stable-fnv1a32/v1";
  checksum: string;
  valueKinds: Array<"raw" | "normalized" | "values">;
  totals: {
    raw?: number;
    normalized?: number;
    values?: number;
  };
  nonZero: {
    raw?: number;
    normalized?: number;
    values?: number;
  };
  rowLabels: string[];
  columnLabels: string[];
  pairIds?: string[];
};

export type SenaFusionMathAudit = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.fusionMathAudit;
  status: "verified" | "needs-review";
  passed: number;
  reviewNeeded: number;
  items: SenaFusionMathAuditItem[];
  matrixFingerprints: SenaMatrixFingerprint[];
  notes: string[];
};

export type SenaFusionMathAuditArtifact = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.fusionMathAuditArtifact;
  title: string;
  generatedAt: string;
  analysisWindow: SenaTemporalWindow | null;
  formula: SenaRuntimeProvenance["senaModel"]["matrixFormula"];
  parameters: {
    buildOptions: SenaResolvedBuildOptions;
    datasetCounts: {
      people: number;
      interactions: number;
      utterances: number;
      codedSegments: number;
      codes: number;
    };
    warnings: string[];
  };
  fusionMathAudit: SenaFusionMathAudit;
  matrices: SenaMatrices;
  notes: string[];
};

export type SenaMethodProtocolLayer = {
  id: "S" | "W" | "B" | "B_PC" | "B_CP" | "G" | "A_fusion";
  label: string;
  source: string;
  construction: string;
  matrixShape: string;
  interpretationRole: string;
  guardrail: string;
};

export type SenaMethodProtocolRuntimeHandoff = {
  id: "jena-concept-matrix" | "jsna-social-matrix" | "fusion-math";
  label: string;
  status: "pass" | "review";
  source: string;
  target: string;
  summary: string;
  evidence: string[];
};

export type SenaVisualGrammarItem = {
  id: "fusion-canvas-a1" | "temporal-fusion-arc" | "ena-space-canonical" | "workspace-shell-c3-collapsed-switcher" | "fusion-plane-orbit";
  label: string;
  visualEncoding: string;
  dataMapping: string;
  interpretationRole: string;
  guardrail: string;
};

export type SenaVisualGrammarReferenceAsset = {
  id: string;
  label: string;
  path: string;
  bytes: number;
  sha256: string;
  role: "adopted-reference" | "alternative-reference";
  relatedGrammarId: SenaVisualGrammarItem["id"];
  note: string;
};

export type SenaVisualGrammarArtifact = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.visualGrammar;
  title: string;
  generatedAt: string;
  workspaceRoute: "/workspace/sena";
  analysisWindow: SenaTemporalWindow | null;
  visualGrammar: SenaVisualGrammarItem[];
  referenceAssets: SenaVisualGrammarReferenceAsset[];
  notes: string[];
};

export type SenaMethodProtocol = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.methodProtocol;
  title: string;
  generatedAt: string;
  analysisWindow: SenaTemporalWindow | null;
  dataContract: {
    requiredTables: Array<"people" | "interactions" | "utterances" | "coded_segments" | "codebook">;
    datasetCounts: {
      people: number;
      interactions: number;
      utterances: number;
      codedSegments: number;
      codes: number;
    };
    unitOfAnalysis: string;
  };
  mathematicalFrame: {
    graphType: "normalized-typed-heterogeneous-adjacency";
    formula: SenaRuntimeProvenance["senaModel"]["matrixFormula"];
    nodeOrder: string;
    layers: SenaMethodProtocolLayer[];
  };
  visualGrammar: SenaVisualGrammarItem[];
  parameters: {
    buildOptions: SenaResolvedBuildOptions;
    temporalWindows: number;
    activeTemporalWindow: SenaTemporalWindow | null;
  };
  runtimeIntegration: {
    sena: SenaRuntimeProvenance["senaModel"];
    jena: SenaRuntimeProvenance["enaRuntime"];
    jsna: SenaRuntimeProvenance["snaRuntime"];
  };
  runtimeParityEvidence: SenaRuntimeProvenance["parityEvidence"];
  auditSummary: {
    fusionMath: Pick<SenaFusionMathAudit, "schemaVersion" | "status" | "passed" | "reviewNeeded">;
    runtimeConsistency: Pick<SenaRuntimeConsistencyAudit, "schemaVersion" | "status" | "passed" | "reviewNeeded">;
  };
  runtimeHandoffs: SenaMethodProtocolRuntimeHandoff[];
  requiredCompanionArtifacts: string[];
  interpretationGuardrails: string[];
  notes: string[];
};

export type SenaPilotReadinessItem = {
  id: string;
  label: string;
  category: "data" | "model" | "math" | "runtime" | "method" | "evidence" | "review";
  status: "ready" | "review";
  summary: string;
  evidence: string[];
  nextAction: string;
};

export type SenaPilotReadinessAudit = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.pilotReadiness;
  status: "ready" | "needs-review";
  passed: number;
  reviewNeeded: number;
  items: SenaPilotReadinessItem[];
  notes: string[];
};

export type SenaClaimReadinessGateItem = {
  id: "data-contract" | "runtime-alignment" | "fusion-math" | "evidence-ledger" | "method-validation" | "data-governance" | "coding-reliability" | "human-review";
  label: string;
  status: "ready" | "review";
  sourceItemIds: string[];
  summary: string;
  guardrail: string;
};

export type SenaClaimReadinessGate = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.claimReadinessGate;
  status: "ready" | "exploratory";
  claimUse: "research-claim-ready" | "exploratory-only";
  ready: number;
  reviewNeeded: number;
  blockers: string[];
  items: SenaClaimReadinessGateItem[];
  guardrail: string;
  notes: string[];
};

export type SenaDemoWalkthroughStep = {
  id: string;
  label: string;
  status: "ready" | "review";
  anchor: string;
  userAction: string;
  readinessItemIds: string[];
  evidence: string[];
  exportArtifacts: string[];
};

export type SenaDemoWalkthrough = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.demoWalkthrough;
  title: string;
  generatedAt: string;
  workspaceRoute: "/workspace/sena";
  analysisWindow: SenaTemporalWindow | null;
  parameters: {
    buildOptions: SenaResolvedBuildOptions;
    datasetCounts: {
      people: number;
      interactions: number;
      utterances: number;
      codedSegments: number;
      codes: number;
    };
    warnings: string[];
  };
  summary: {
    totalSteps: number;
    readySteps: number;
    reviewSteps: number;
    pilotReadinessStatus: SenaPilotReadinessAudit["status"];
  };
  steps: SenaDemoWalkthroughStep[];
  notes: string[];
};

export type SenaDemoVerificationCheck = {
  id: string;
  label: string;
  anchor: string;
  status: "pass" | "review";
  manualAction: string;
  expectedOutcome: string;
  observedEvidence: string[];
  requiredArtifacts: string[];
  manualReview: {
    status: "pending" | "passed" | "failed";
    reviewer: string;
    verifiedAt: string;
    notes: string;
  };
};

export type SenaDemoVerification = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.demoVerification;
  title: string;
  generatedAt: string;
  workspaceRoute: "/workspace/sena";
  analysisWindow: SenaTemporalWindow | null;
  parameters: {
    buildOptions: SenaResolvedBuildOptions;
    datasetCounts: {
      people: number;
      interactions: number;
      utterances: number;
      codedSegments: number;
      codes: number;
    };
    warnings: string[];
  };
  summary: {
    totalChecks: number;
    automatedPass: number;
    automatedReview: number;
    manualPending: number;
    manualPassed: number;
    manualFailed: number;
    requiredArtifacts: string[];
    pilotReadinessStatus: SenaPilotReadinessAudit["status"];
  };
  checks: SenaDemoVerificationCheck[];
  notes: string[];
};

export type SenaDemoVerificationCompatibilityItem = {
  id: string;
  label: string;
  status: "pass" | "review";
  expected: string;
  actual: string;
};

export type SenaDemoVerificationCompatibilityAudit = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.demoVerificationCompatibility;
  status: "compatible" | "mismatch";
  passed: number;
  reviewNeeded: number;
  items: SenaDemoVerificationCompatibilityItem[];
  notes: string[];
};

export type SenaProductionPageContractSection = {
  id: string;
  label: string;
  requiredText: string[];
};

export type SenaProductionPageContractVisualCheck = {
  id: string;
  label: string;
  requiredText: string;
  expectedOutcome: string;
};

export type SenaProductionPageContract = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.productionPageContract;
  title: string;
  workspaceRoute: "/workspace/sena";
  description: string;
  sections: SenaProductionPageContractSection[];
  visualChecks: SenaProductionPageContractVisualCheck[];
  notes: string[];
};

export type SenaDevelopmentPlanPhase = {
  id: string;
  label: string;
  status: "complete" | "active" | "deferred";
  scope: string;
  deliverables: string[];
  evidence: string[];
  exitCriteria: string[];
};

export type SenaDeliveryCandidatePlan = {
  status: "delivery-candidate" | "pre-candidate";
  horizon: "4-week-local-research-pilot";
  priority: "pilot-delivery";
  successCriteria: string[];
  weeklyPlan: Array<{
    week: 1 | 2 | 3 | 4;
    label: string;
    focus: string;
    deliverables: string[];
    exitCriteria: string[];
  }>;
  verificationCommands: string[];
  browserAcceptanceScenarios: string[];
  handoffPackage: string[];
  demoScript: Array<{
    step: number;
    label: string;
    zh: string;
    en: string;
    anchor: string;
    exportArtifacts: string[];
  }>;
  boundaries: string[];
};

export type SenaNextStageDevelopmentPlan = {
  status: "baseline-verified" | "verification-required";
  horizon: "post-delivery-candidate";
  priority: "research-validation-before-platform";
  baseline: {
    command: "npm run sena:pilot:verify";
    expectedResult: string;
    recordedAt: string;
    evidence: string[];
  };
  phases: Array<{
    id: "pilot-handoff-freeze" | "researcher-walkthrough" | "research-validation" | "platform-decision-gate";
    label: string;
    status: "active" | "next" | "deferred" | "gate";
    goal: string;
    deliverables: string[];
    acceptanceCriteria: string[];
    blockedUntil?: string[];
  }>;
  releaseGate: {
    command: "npm run sena:pilot:verify";
    browserAcceptanceScenarios: string[];
    dataScenarios: string[];
    regressionRules: string[];
  };
  publicInterfacePolicy: string[];
  assumptions: string[];
};

export type SenaDevelopmentPlan = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.developmentPlan;
  title: string;
  generatedAt: string;
  workspaceRoute: "/workspace/sena";
  milestone: "local-research-pilot";
  audience: string[];
  analysisWindow: SenaTemporalWindow | null;
  runtimeIntegration: {
    sena: SenaRuntimeProvenance["senaModel"];
    jena: SenaRuntimeProvenance["enaRuntime"];
    jsna: SenaRuntimeProvenance["snaRuntime"];
  };
  runtimeParityEvidence: SenaRuntimeProvenance["parityEvidence"];
  scope: {
    inScope: string[];
    outOfScope: string[];
  };
  workflowAnchors: Array<{
    id: string;
    label: string;
    anchor: string;
    status: SenaDemoWalkthroughStep["status"];
    exportArtifacts: string[];
  }>;
  currentGate: {
    pilotReadinessStatus: SenaPilotReadinessAudit["status"];
    automatedVerification: {
      totalChecks: number;
      passed: number;
      review: number;
      manualPending: number;
      manualPassed: number;
      manualFailed: number;
    };
    readyItems: string[];
    reviewItems: string[];
  };
  phases: SenaDevelopmentPlanPhase[];
  deliveryCandidate: SenaDeliveryCandidatePlan;
  nextStage: SenaNextStageDevelopmentPlan;
  requiredArtifacts: string[];
  nextDecisions: string[];
  notes: string[];
};

export type SenaReport = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.report;
  title: string;
  generatedAt: string;
  analysisWindow: SenaTemporalWindow | null;
  parameters: {
    buildOptions: SenaResolvedBuildOptions;
    datasetCounts: {
      people: number;
      interactions: number;
      utterances: number;
      codedSegments: number;
      codes: number;
    };
    warnings: string[];
  };
  runtimeProvenance: SenaRuntimeProvenance;
  interpretationGuardrails: SenaInterpretationGuardrail[];
  operatorDiagnostics: SenaOperatorDiagnostics;
  enaManifest: SenaEnaManifest;
  snaManifest: SenaSnaManifest;
  summary: SenaSummary;
  matrices: SenaMatrices;
  figures: {
    fusionGraph: {
      nodes: Array<{
        id: string;
        label: string;
        kind: SenaNode["kind"];
      }>;
      edges: Array<{
        id: string;
        layer: SenaLayer;
        edgeType: SenaEdgeType;
        sourceKind: SenaNode["kind"];
        targetKind: SenaNode["kind"];
        source: string;
        target: string;
        label: string;
        weight: number;
        normalizedWeight: number;
        scaledWeight: number;
      }>;
    };
    activeWindowComparison: SenaActiveWindowComparison | null;
    activeWindowBrief: SenaActiveWindowBrief | null;
    temporalTrace: SenaTemporalSeries;
    temporalRuntimeNarrative: SenaTemporalRuntimeNarrativeWindow[];
    temporalRuntimeTransitions: SenaTemporalRuntimeTransition[];
    socialCommunities: SenaSocialCommunityReport[];
    visualGrammar: SenaVisualGrammarItem[];
  };
  socialReport: SenaSocialReport;
  pairReport: SenaPairReport[];
  validation: SenaValidation;
  modelCard: SenaModelCard;
  codingReliabilityGate: SenaCodingReliabilityGate;
  completenessAudit: SenaReportCompletenessAudit;
  dataContractAudit: SenaDataContractAudit;
  runtimeConsistencyAudit: SenaRuntimeConsistencyAudit;
  fusionMathAudit: SenaFusionMathAudit;
  pilotReadinessAudit: SenaPilotReadinessAudit;
  claimReadinessGate: SenaClaimReadinessGate;
  dataGovernance: SenaDataGovernanceMetadata;
  evidenceSnippets: SenaReportEvidenceSnippet[];
  humanReview: SenaReportHumanReview;
};

export type SenaEvidenceLedger = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.evidenceLedger;
  title: string;
  generatedAt: string;
  analysisWindow: SenaTemporalWindow | null;
  parameters: {
    buildOptions: SenaResolvedBuildOptions;
    datasetCounts: {
      people: number;
      interactions: number;
      utterances: number;
      codedSegments: number;
      codes: number;
    };
    warnings: string[];
  };
  runtimeProvenance: SenaRuntimeProvenance;
  interpretationGuardrails: SenaInterpretationGuardrail[];
  sourceCounts: Record<SenaEvidenceSource, number>;
  snippets: SenaReportEvidenceSnippet[];
  humanReview: SenaReportHumanReview;
};

export type SenaRuntimeArtifactEvidenceItem = {
  filename: string;
  schemaVersion: string;
  runtimeRole: "sena-model" | "jena-epistemic" | "jsna-social" | "sena-fusion" | "review-handoff";
  sourceRuntime: string;
  downloadControl: string;
  status: "ready" | "review";
  matrixCoverage: string[];
  evidenceCoverage: string[];
  handoffChecks: string[];
};

export type SenaRuntimeBundle = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.runtimeBundle;
  title: string;
  generatedAt: string;
  analysisWindow: SenaTemporalWindow | null;
  parameters: SenaReport["parameters"];
  runtimeProvenance: SenaRuntimeProvenance;
  interpretationGuardrails: SenaInterpretationGuardrail[];
  summary: SenaSummary;
  runtimes: {
    sena: SenaRuntimeProvenance["senaModel"] & {
      matrices: SenaMatrices;
      temporal: SenaTemporalSeries;
      pairReport: SenaPairReport[];
      operatorDiagnostics: SenaOperatorDiagnostics;
    };
    ena: SenaRuntimeProvenance["enaRuntime"] & {
      manifest: SenaEnaManifest;
    };
    sna: SenaRuntimeProvenance["snaRuntime"] & {
      manifest: SenaSnaManifest;
      socialReport: SenaSocialReport;
      socialMatrix: SenaMatrices["S"];
    };
  };
  validation: SenaValidation;
  modelCard: SenaModelCard;
  codingReliabilityGate: SenaCodingReliabilityGate;
  dataContractAudit: SenaDataContractAudit;
  fusionMathAudit: SenaFusionMathAudit;
  pilotReadinessAudit: SenaPilotReadinessAudit;
  claimReadinessGate: SenaClaimReadinessGate;
  developmentPlan: SenaDevelopmentPlan;
  demoWalkthrough: SenaDemoWalkthrough;
  demoVerification: SenaDemoVerification;
  demoVerificationCompatibilityAudit: SenaDemoVerificationCompatibilityAudit;
  productionPageContract: SenaProductionPageContract;
  temporalRuntimeTrace: SenaTemporalRuntimeTrace;
  evidenceLedger: SenaEvidenceLedger;
  artifactEvidence: SenaRuntimeArtifactEvidenceItem[];
  report: SenaReport;
};

export type SenaSnaReportArtifact = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.snaReport;
  title: string;
  generatedAt: string;
  workspaceRoute: "/workspace/sena";
  analysisWindow: SenaTemporalWindow | null;
  parameters: Pick<SenaResolvedBuildOptions, "normalization" | "undirectedSocial">;
  runtimeProvenance: SenaRuntimeProvenance["snaRuntime"];
  metricProvenance: SenaMetricProvenance[];
  manifest: SenaSnaManifest;
  socialReport: SenaSocialReport;
  socialMatrix: SenaMatrices["S"];
  socialTieHandoff: SenaJsnaSocialTieHandoffRow[];
  interpretationGuardrails: SenaInterpretationGuardrail[];
  notes: string[];
};

export type SenaMetricProvenanceArtifact = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.metricProvenance;
  title: string;
  generatedAt: string;
  workspaceRoute: "/workspace/sena";
  analysisWindow: SenaTemporalWindow | null;
  runtimeProvenance: SenaRuntimeProvenance;
  metricProvenance: SenaMetricProvenance[];
  coverage: {
    totalMetrics: number;
    bySource: Array<{ source: SenaMetricSource; count: number }>;
    byScope: Array<{ scope: SenaMetricProvenance["scope"]; count: number }>;
    parityCovered: number;
    interpretationLimits: number;
  };
  socialMetricSnapshot: {
    graph: SenaSocialReport["graph"];
    actorMetrics: SenaSocialActorReport[];
    socialMatrix: SenaMatrices["S"];
    socialTieHandoff: SenaJsnaSocialTieHandoffRow[];
  };
  epistemicMetricSnapshot: {
    manifest: SenaEnaManifest;
    conceptMatrix: SenaMatrices["W"];
    conceptPairHandoff: SenaJenaConceptPairHandoffRow[];
    runtimeConsistencyAudit: SenaRuntimeConsistencyAudit;
    enaSpace: {
      dimensions: string[];
      variance: Record<string, number>;
      nodePositions: SenaManifestRow[];
      points: SenaManifestRow[];
      connectionCounts: SenaManifestRow[];
      lineWeights: SenaManifestRow[];
    };
  };
  fusionMetricSnapshot: {
    parameters: Pick<SenaResolvedBuildOptions, "alpha" | "beta" | "gamma" | "normalization">;
    layerTotals: SenaFusionLayerTotals;
    matrices: {
      S: SenaMatrices["S"];
      W: SenaMatrices["W"];
      B: SenaMatrices["B"];
      G: SenaMatrices["G"];
      fusion: SenaMatrices["fusion"];
    };
  };
  interpretationGuardrails: SenaInterpretationGuardrail[];
  notes: string[];
};

export type SenaEnaReportArtifact = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enaReport;
  title: string;
  generatedAt: string;
  workspaceRoute: "/workspace/sena";
  analysisWindow: SenaTemporalWindow | null;
  parameters: Pick<SenaResolvedBuildOptions, "normalization"> & {
    manifestOptions: SenaEnaManifest["options"] | null;
  };
  runtimeProvenance: SenaRuntimeProvenance["enaRuntime"];
  metricProvenance: SenaMetricProvenance[];
  manifest: SenaEnaManifest;
  conceptMatrix: SenaMatrices["W"];
  conceptPairHandoff: SenaJenaConceptPairHandoffRow[];
  runtimeConsistencyAudit: SenaRuntimeConsistencyAudit;
  enaSpace: {
    dimensions: string[];
    variance: Record<string, number>;
    nodePositions: SenaManifestRow[];
    points: SenaManifestRow[];
    connectionCounts: SenaManifestRow[];
    lineWeights: SenaManifestRow[];
  };
  interpretationGuardrails: SenaInterpretationGuardrail[];
  notes: string[];
};

export type SenaPairContributionReportArtifact = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.personCodePairGReport;
  title: string;
  generatedAt: string;
  workspaceRoute: "/workspace/sena";
  analysisWindow: SenaTemporalWindow | null;
  parameters: Pick<SenaResolvedBuildOptions, "alpha" | "beta" | "gamma" | "normalization">;
  runtimeProvenance: SenaRuntimeProvenance;
  metricProvenance: SenaMetricProvenance[];
  pairReport: SenaPairReport[];
  G: SenaPairMatrixBlock;
  supportingMatrices: {
    S: SenaMatrices["S"];
    W: SenaMatrices["W"];
    B: SenaMatrices["B"];
  };
  interpretationGuardrails: SenaInterpretationGuardrail[];
  notes: string[];
};

export type SenaReviewPacketArtifact = {
  filename: string;
  schemaVersion: string;
  description: string;
};

export type SenaPilotAssetIntegrity = {
  href: string;
  kind: "sample" | "template";
  format: "json" | "csv";
  bytes: number;
  sha256: string;
};

export type SenaPilotPackageManifest = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.pilotPackageManifest;
  packageName: string;
  updatedOn: string;
  workspaceRoute: "/workspace/sena";
  runtimeRoles: {
    sena: string;
    jena: string;
    jsna: string;
  };
  sampleDataset: {
    name: string;
    contract: string;
    expectedCounts: {
      people: number;
      interactions: number;
      utterances: number;
      codedSegments: number;
      codes: number;
    };
    expectedStages: string[];
    expectedRuntime: {
      jena: SenaEnaManifest["status"];
      jsna: SenaSnaManifest["status"];
      dataContractAudit: SenaDataContractAudit["status"];
      fusionMathAudit: SenaFusionMathAudit["status"];
      pilotReadinessBeforeHumanReview: SenaPilotReadinessAudit["status"];
    };
  };
  exportArtifacts: string[];
  exportArtifactSchemas: Record<string, string>;
  assets: {
    sample: string[];
    templates: string[];
  };
  assetIntegrity: SenaPilotAssetIntegrity[];
  handoffChecks: Array<{
    id: string;
    label: string;
    artifact: string;
    expectedEvidence: string[];
  }>;
  reviewGuardrails: string[];
};

export type SenaReviewPacketAuditItem = {
  id: string;
  label: string;
  status: "pass" | "review";
  expected: string;
  actual: string;
  evidence: string[];
};

export type SenaReviewPacketAudit = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.reviewPacketAudit;
  status: "complete" | "needs-review";
  passed: number;
  reviewNeeded: number;
  items: SenaReviewPacketAuditItem[];
  notes: string[];
};

export type SenaReviewPacket = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.reviewPacket;
  title: string;
  generatedAt: string;
  workspaceRoute: "/workspace/sena";
  analysisWindow: SenaTemporalWindow | null;
  summary: {
    analysisScope: {
      scope: "full-conversation" | "temporal-window";
      label: string;
      windowId: string | null;
      mode: SenaTemporalMode | "full-conversation";
      turns: string;
    };
    pilotReadinessStatus: SenaPilotReadinessAudit["status"];
    reportCompletenessStatus: SenaReportCompletenessAudit["status"];
    runtimeConsistencyStatus: SenaRuntimeConsistencyAudit["status"];
    dataContractStatus: SenaDataContractAudit["status"];
    fusionMathStatus: SenaFusionMathAudit["status"];
    claimReadinessStatus: SenaClaimReadinessGate["status"];
    codingReliabilityStatus: SenaCodingReliabilityGate["status"];
    jenaStatus: SenaEnaManifest["status"];
    jsnaStatus: SenaSnaManifest["status"];
    humanReviewStatus: SenaReportHumanReview["status"];
    demoVerificationCompatibilityStatus: SenaDemoVerificationCompatibilityAudit["status"];
    localRuntimeDependencies: {
      jena: string;
      jsna: string;
    };
  };
  reviewPacketAudit: SenaReviewPacketAudit;
  artifactManifest: SenaReviewPacketArtifact[];
  contents: {
    reportJson: SenaReport;
    reportMarkdown: string;
    projectSnapshot: SenaProjectSnapshot;
    runtimeBundle: SenaRuntimeBundle;
    jenaManifest: SenaEnaManifest;
    enaReportArtifact: SenaEnaReportArtifact;
    jsnaManifest: SenaSnaManifest;
    snaReportArtifact: SenaSnaReportArtifact;
    metricProvenanceArtifact: SenaMetricProvenanceArtifact;
    pairContributionReportArtifact: SenaPairContributionReportArtifact;
    pilotPackageManifest: SenaPilotPackageManifest;
    evidenceLedger: SenaEvidenceLedger;
    temporalRuntimeTrace: SenaTemporalRuntimeTrace;
    dataContractAudit: SenaDataContractAudit;
    runtimeConsistencyAudit: SenaRuntimeConsistencyAudit;
    fusionMathAudit: SenaFusionMathAudit;
    methodProtocol: SenaMethodProtocol;
    visualGrammarArtifact: SenaVisualGrammarArtifact;
    developmentPlan: SenaDevelopmentPlan;
    pilotReadinessAudit: SenaPilotReadinessAudit;
    codingReliabilityGate: SenaCodingReliabilityGate;
    claimReadinessGate: SenaClaimReadinessGate;
    demoWalkthrough: SenaDemoWalkthrough;
    demoVerification: SenaDemoVerification;
    demoVerificationCompatibilityAudit: SenaDemoVerificationCompatibilityAudit;
    productionPageContract: SenaProductionPageContract;
  };
  reviewGuardrails: string[];
  notes: string[];
};

export type SenaTemporalRuntimeDatasetCounts = {
  people: number;
  interactions: number;
  utterances: number;
  codedSegments: number;
  codes: number;
};

export type SenaTemporalRuntimeEdgeHighlight = {
  id: string;
  layer: SenaLayer;
  label: string;
  source: string;
  target: string;
  weight: number;
  normalizedWeight: number;
  scaledWeight: number;
};

export type SenaTemporalRuntimeGPairHighlight = {
  id: string;
  label: string;
  codeA: string;
  codeB: string;
  totalContribution: number;
  topContributors: Array<{
    id: string;
    label: string;
    weight: number;
    directWeight: number;
    supportingWeight: number;
  }>;
};

export type SenaTemporalRuntimeMatrixTotals = {
  S: number;
  W: number;
  B: number;
  B_PC: number;
  B_CP: number;
  G: number;
  fusion: number;
};

export type SenaTemporalRuntimeSenaSummary = {
  people: number;
  concepts: number;
  socialEdges: number;
  conceptEdges: number;
  bridgeEdges: number;
  socialDensity: number;
  activeGPairs: number;
  fusionNodeCount: number;
  matrixTotals: SenaTemporalRuntimeMatrixTotals;
  matrixFingerprints: SenaMatrixFingerprint[];
  strongestSocialTie?: SenaTemporalRuntimeEdgeHighlight;
  strongestConceptTie?: SenaTemporalRuntimeEdgeHighlight;
  strongestBridgeTie?: SenaTemporalRuntimeEdgeHighlight;
  strongestGPair?: SenaTemporalRuntimeGPairHighlight;
  warnings: string[];
};

export type SenaTemporalRuntimeWindow = {
  window: SenaTemporalWindow;
  datasetCounts: SenaTemporalRuntimeDatasetCounts;
  sena: SenaTemporalRuntimeSenaSummary;
  ena: {
    status: SenaEnaManifest["status"];
    datasetCounts: SenaEnaManifest["datasetCounts"];
    dimensions: string[];
    variance: Record<string, number>;
    pointCount: number;
    nodePositionCount: number;
    warnings: string[];
  };
  sna: {
    status: SenaSnaManifest["status"];
    datasetCounts: SenaSnaManifest["datasetCounts"];
    graph?: SenaSocialReport["graph"];
    warnings: string[];
  };
  warnings: string[];
};

export type SenaTemporalRuntimeTransition = {
  id: string;
  fromWindowId: string;
  toWindowId: string;
  fromLabel: string;
  toLabel: string;
  turnSpan: string;
  delta: SenaTemporalRuntimeMatrixTotals & {
    activeGPairs: number;
  };
  direction: "increase" | "decrease" | "stable";
  jenaStatus: {
    from: SenaEnaManifest["status"];
    to: SenaEnaManifest["status"];
  };
  jsnaStatus: {
    from: SenaSnaManifest["status"];
    to: SenaSnaManifest["status"];
  };
  strongestGPair: {
    from?: SenaTemporalRuntimeGPairHighlight;
    to?: SenaTemporalRuntimeGPairHighlight;
    changed: boolean;
  };
  interpretationGuardrail: string;
};

export type SenaTemporalRuntimeTrace = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.temporalRuntimeTrace;
  generatedAt: string;
  sourceDatasetCounts: SenaTemporalRuntimeDatasetCounts;
  buildOptions: SenaResolvedBuildOptions;
  temporalSettings: SenaTemporalOptions;
  runtimeProvenance: SenaRuntimeProvenance;
  windows: SenaTemporalRuntimeWindow[];
  transitions: SenaTemporalRuntimeTransition[];
  warnings: string[];
};

export type SenaTemporalRuntimeNarrativeWindow = {
  windowId: string;
  label: string;
  turns: string;
  jenaStatus: SenaEnaManifest["status"];
  jsnaStatus: SenaSnaManifest["status"];
  matrixTotals: SenaTemporalRuntimeMatrixTotals;
  matrixFingerprints: SenaMatrixFingerprint[];
  activeGPairs: number;
  strongestSocialTie?: SenaTemporalRuntimeEdgeHighlight;
  strongestConceptTie?: SenaTemporalRuntimeEdgeHighlight;
  strongestBridgeTie?: SenaTemporalRuntimeEdgeHighlight;
  strongestGPair?: SenaTemporalRuntimeGPairHighlight;
};

export type SenaActiveWindowComparisonMetric = {
  id: "sna-density" | "social-ties" | "ena-links" | "bridge-links" | "g-total" | "fusion-total";
  label: string;
  current: number;
  baseline: number;
  delta: number;
  share: number | null;
};

export type SenaActiveWindowRankingContext = {
  id: "top-social-tie" | "top-concept-tie" | "top-bridge-tie" | "top-g-pair";
  label: string;
  layer: "S" | "W" | "B" | "G";
  signalLabel: string;
  currentWeight: number;
  baselineWeight: number;
  baselineRank: number | null;
  baselineItemCount: number;
  baselineShare: number | null;
  interpretation: string;
};

export type SenaActiveWindowBriefSignal = {
  layer: "S" | "W" | "B" | "G";
  label: string;
  currentWeight: number;
  fullConversationRank: number | null;
  fullConversationShare: number | null;
};

export type SenaActiveWindowBrief = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.activeWindowBrief;
  window: {
    id: string;
    label: string;
    mode: SenaTemporalMode;
    turns: string;
    stages: string[];
    utterances: number;
    interactions: number;
    segments: number;
    evidenceRefs: number;
  };
  headline: string;
  dominantSignals: SenaActiveWindowBriefSignal[];
  globalContext: string[];
  evidenceCues: Array<{
    source: SenaEvidenceSource;
    sourceId: string;
    sourceLabel: string;
    text: string;
  }>;
  reviewChecklist: Array<{
    id: "active-window-baseline" | "evidence-ledger" | "coding-reliability" | "human-review";
    label: string;
    status: "present" | "needed";
    detail: string;
  }>;
  guardrails: string[];
};

export type SenaActiveWindowComparison = {
  currentWindow: SenaTemporalWindow;
  baselineScope: "full-conversation";
  sourceDatasetCounts: {
    people: number;
    interactions: number;
    utterances: number;
    codedSegments: number;
    codes: number;
  };
  analysisDatasetCounts: {
    people: number;
    interactions: number;
    utterances: number;
    codedSegments: number;
    codes: number;
  };
  metrics: SenaActiveWindowComparisonMetric[];
  topSignals: {
    currentTopConceptTie?: SenaTemporalRuntimeEdgeHighlight;
    baselineTopConceptTie?: SenaTemporalRuntimeEdgeHighlight;
    currentTopGPair?: SenaTemporalRuntimeGPairHighlight;
    baselineTopGPair?: SenaTemporalRuntimeGPairHighlight;
  };
  rankingContext: SenaActiveWindowRankingContext[];
  interpretationGuardrail: string;
};

export type SenaProjectSnapshot = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.projectSnapshot;
  title: string;
  generatedAt: string;
  source: {
    milestone: "local-research-pilot";
    activeTemporalWindow: SenaTemporalWindow | null;
    sourceDatasetCounts: {
      people: number;
      interactions: number;
      utterances: number;
      codedSegments: number;
      codes: number;
    };
    sourceDataset?: SenaDataset;
  };
  reproducibility: {
    requiredRuntimes: {
      sena: SenaRuntimeProvenance["senaModel"];
      ena: SenaRuntimeProvenance["enaRuntime"];
      sna: SenaRuntimeProvenance["snaRuntime"];
    };
    formula: SenaRuntimeProvenance["senaModel"]["matrixFormula"];
    buildOptions: SenaResolvedBuildOptions;
    interpretationGuardrails: SenaInterpretationGuardrail[];
  };
  dataset: SenaDataset;
  analysis: {
    nodes?: SenaNode[];
    edges?: SenaEdge[];
    summary: SenaSummary;
    matrices: SenaMatrices;
    socialReport: SenaSocialReport;
    pairReport: SenaPairReport[];
    temporal: SenaTemporalSeries;
    temporalRuntimeTrace?: SenaTemporalRuntimeTrace;
  };
  workspaceState?: {
    demoVerificationManualReviews: Record<string, SenaDemoVerificationCheck["manualReview"]>;
  };
  dataGovernance?: SenaDataGovernanceMetadata;
  report: SenaReport;
};

export type SenaMatrixBlock = {
  labels: string[];
  raw: number[][];
  normalized: number[][];
};

export type SenaCodePair = {
  id: string;
  codeA: string;
  codeB: string;
  label: string;
};

export type SenaPairMatrixBlock = {
  rowLabels: string[];
  columnLabels: string[];
  pairIds: string[];
  pairs: SenaCodePair[];
  raw: number[][];
  normalized: number[][];
};

export type SenaPairReport = SenaCodePair & {
  totalContribution: number;
  evidence: SenaEvidenceSnippet[];
  topContributors: SenaPairContributor[];
};

export type SenaPairContributor = {
  id: string;
  label: string;
  weight: number;
  directWeight: number;
  supportingWeight: number;
  evidence: SenaEvidenceSnippet[];
};

export type SenaSocialAnalysis = {
  engine: "sna.js";
  density: number;
  tieCount: number;
  reciprocity: number;
  connected: boolean;
  componentCount: number;
  largestComponentSize: number;
  averagePathLength: number;
  communityCount: number;
};

export type SenaSocialActorReport = {
  id: string;
  label: string;
  role: string;
  group: string;
  degree: number;
  strength: number;
  betweenness: number;
  closeness: number;
  reachable: number;
  component: number;
  community: number;
  topInteractors: Array<{ id: string; label: string; weight: number }>;
};

export type SenaSocialCommunityReport = {
  id: number;
  label: string;
  size: number;
  memberIds: string[];
  members: string[];
  internalWeight: number;
  externalWeight: number;
};

export type SenaSocialReport = {
  graph: SenaSocialAnalysis & {
    mode: "graph" | "digraph";
    communityDetection: string;
  };
  actors: SenaSocialActorReport[];
  communities: SenaSocialCommunityReport[];
};

export type SenaMatrices = {
  S: SenaMatrixBlock;
  W: SenaMatrixBlock;
  B: {
    rowLabels: string[];
    columnLabels: string[];
    raw: number[][];
    normalized: number[][];
  };
  B_PC: {
    rowLabels: string[];
    columnLabels: string[];
    raw: number[][];
    normalized: number[][];
  };
  B_CP: {
    rowLabels: string[];
    columnLabels: string[];
    raw: number[][];
    normalized: number[][];
  };
  Y: {
    rowLabels: string[];
    columnLabels: string[];
    windowIds: string[];
    raw: number[][];
  };
  G: SenaPairMatrixBlock;
  fusion: {
    labels: string[];
    values: number[][];
  };
};

export type SenaNormalizationDiagnostic = {
  rule: SenaNormalization;
  divisor: number;
  admissible: boolean;
  scaleInvariant: boolean;
  warnings: string[];
};

export type SenaOperatorDiagnostics = {
  runIdentity: {
    hashAlgorithm: "sena-stable-fnv1a32/v1";
    datasetVersion: string;
    datasetContentHash: string;
    configHash: string;
  };
  analysisConfig: SenaAnalysisConfigDeclaration;
  degreeConvention: SenaDegreeConvention;
  degreeVector: number[];
  isolatedVertices: Array<{
    index: number;
    label: string;
    degree: number;
  }>;
  normalization: {
    S: SenaNormalizationDiagnostic;
    W: SenaNormalizationDiagnostic;
    B: SenaNormalizationDiagnostic;
    // B_CP is normalized independently of B (= B_PC); ADR-0005 requires each
    // bridge block's divisor/admissibility to be disclosed, not just B's.
    B_CP: SenaNormalizationDiagnostic;
    G: SenaNormalizationDiagnostic;
  };
  bridgeWeighting: {
    rule: SenaBridgeWeightRule;
    activeCodeValue: "segment-code-count" | "segment-confidence-or-1";
    confidenceValuesPresent: boolean;
    missingConfidenceCount: number;
    warnings: string[];
  };
  direction: {
    socialMode: "directed" | "undirected";
    fusionMode: "directed" | "undirected";
    socialSymmetrized: boolean;
    directedInputPreserved: boolean;
    bridgeMode: "pc-transpose-fallback" | "pc-cp-independent";
    pcEdgeType: "PC";
    cpEdgeType: "CP";
    pcEdgeCount: number;
    cpEdgeCount: number;
    independentBridgeMatrices: boolean;
    badge: string;
    warnings: string[];
  };
  embedding: {
    input: {
      matrix: "fusion";
      asymmetry: number;
      symmetrized: boolean;
      symmetrization: "none" | "declared-sym(A)=(A+At)/2";
      warning: string | null;
    };
    exploratoryLayout: {
      operator: "deterministic-force-layout";
      metricExact: false;
      warning: string;
    };
    mds: {
      operator: "classical-mds";
      delta: "shortest-path-reciprocal-weight";
      dimensions: number;
      available: boolean;
      metricExact: boolean;
      coordinates: number[][] | null;
      stress: number | null;
      maxDistortion: number | null;
      minCenteredGramEigenvalue: number | null;
      warnings: string[];
    };
    laplacianEigenmaps: {
      operator: "laplacian-eigenmaps";
      laplacian: "combinatorial";
      dimensions: number;
      available: boolean;
      metricExact: false;
      coordinates: number[][] | null;
      eigenvalues: number[] | null;
      zeroEigenvalueCount: number | null;
      warnings: string[];
    };
    commuteTime: {
      operator: "commute-time";
      available: boolean;
      metricExact: boolean;
      coordinates: number[][] | null;
      maxPairwiseError: number | null;
      checkedPairs: number | null;
      excludedSelfPairs: number | null;
      warnings: string[];
    };
  };
  attribution: {
    estimator: "x-transpose-diag-y-x";
    defaultWording: "associated with windows containing the pair";
    contributionWordingAllowed: boolean;
    contributionWordingReason: string;
    participation: {
      symbol: "Y";
      sourceTable: "coded_segments";
      rowCount: number;
      columnCount: number;
      activeCells: number;
      firstClass: true;
      warnings: string[];
    };
    gHat: {
      normalization: "participation-window-share";
      values: number[][];
      rowSums: number[];
      boundsWithinWindowProducts: boolean;
      minValue: number;
      maxValue: number;
      zeroParticipationRows: number[];
    };
    identities: {
      rawSlicesPsd: boolean;
      rawSumMatchesParticipantWeightedCooccurrence: boolean;
      windowNormalizedOffDiagonalMatchesCodeCooccurrence: boolean;
    };
    guardrail: string;
  };
  typedCentrality: {
    mixedRankingRenderable: false;
    guardrail: string;
    families: {
      personsOnS: Array<{
        id: string;
        label: string;
        metric: "social-strength";
        value: number;
      }>;
      codesOnW: Array<{
        id: string;
        label: string;
        metric: "concept-weighted-degree";
        value: number;
      }>;
      bridgesOnB: Array<{
        id: string;
        personId: string;
        personLabel: string;
        codeId: string;
        codeLabel: string;
        metric: "bridge-weight";
        value: number;
      }>;
      typedGraph: Array<{
        id: string;
        label: string;
        nodeType: "person" | "code";
        metric: "typed-fused-degree";
        value: number;
      }>;
    };
  };
};

export type SenaModelCardSectionId =
  | "data-contract"
  | "exact-formulas"
  | "normalization"
  | "layer-weights"
  | "embedding-geometry"
  | "coding-reliability"
  | "attribution-wording"
  | "validation"
  | "isolated-zero-degree"
  | "directed-graph";

export type SenaModelCardSection = {
  id: SenaModelCardSectionId;
  label: string;
  status: "complete" | "needs-review";
  evidence: string[];
};

export type SenaModelCard = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.modelCard;
  generatedAt: string;
  sections: SenaModelCardSection[];
  dataset: {
    id: string | null;
    version: {
      declared: string;
      contentHash: string;
    };
    counts: {
      people: number;
      interactions: number;
      utterances: number;
      codedSegments: number;
      codes: number;
    };
    codebook: {
      id: string | null;
      version: string | null;
      contentHash: string | null;
    };
    pseudonymized: boolean;
    consentRecord: string | null;
    xItaPresent: boolean;
  };
  formulas: {
    social: {
      formula: "S = R" | "S = R + R^T";
      direction: "directed" | "undirected";
      directedInputPreserved: boolean;
    };
    concept: {
      formula: "W_ab = sum_t X_ta X_tb, a != b, W_aa = 0";
      codeFrequenciesAsNodeAttributes: boolean;
    };
    bridge: {
      formula: "B_ic = sum_{s: person(s)=i} w_s * 1[c in codes_s]";
      weightRule: "segment-count" | "confidence-weighted";
      activeCodeValue: SenaOperatorDiagnostics["bridgeWeighting"]["activeCodeValue"];
    };
    attribution: {
      variant: "G_hat";
      estimator: SenaOperatorDiagnostics["attribution"]["estimator"];
    };
  };
  normalization: {
    rule: SenaNormalization;
    divisors: {
      S: number;
      W: number;
      B: number;
      B_CP: number;
      G: number;
    };
    scaleInvariant: boolean;
    warnings: string[];
  };
  weights: {
    alpha: number;
    beta: number;
    gamma: number;
    configHash: string;
    interpretation: string;
  };
  embedding: {
    operator: "layout-only" | "classical-mds";
    delta: "none" | "shortest-path-reciprocal-weight";
    dimensions: number | null;
    seed: number | null;
    metricExact: boolean;
    stress: number | null;
    maxDistortion: number | null;
    layoutBadge: "Exploratory layout — distances are not metric.";
    exactnessBadge: string;
  };
  reliability: {
    status: "complete" | "needs-review";
    summary: string;
    evidence: string[];
  };
  attribution: {
    wording: "contribution-supported" | "association-exposure-only";
    variant: "G_hat";
    contributionWordingAllowed: boolean;
    badge: string;
  };
  validation: {
    status: "complete" | "needs-review";
    claims: string[];
    seed: number | null;
    pValue: number | null;
    badge: string;
  };
  isolated: {
    I0: SenaOperatorDiagnostics["isolatedVertices"];
    degreeConvention: SenaOperatorDiagnostics["degreeConvention"];
    selfLoopConvention: string;
    zeroDegreeConvention: string;
    badge: string;
  };
  direction: {
    mode: "directed" | "undirected";
    operator: "declared-spectral-symmetrization" | "symmetrized";
    collapsed: boolean;
    bridgesIndependent: boolean | null;
    badge: string | null;
  };
  renderGate: {
    status: "ready" | "blocked";
    missingSectionIds: SenaModelCardSectionId[];
    message: string;
  };
};

export type SenaAnalysisProvenanceEnvelope = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.analysisProvenanceEnvelope;
  norm_rule: SenaNormalization;
  divisors: {
    S: number;
    W: number;
    B: number;
    B_CP: number;
    G: number;
  };
  alpha: number;
  beta: number;
  gamma: number;
  direction: "directed" | "undirected";
  deg_convention: SenaOperatorDiagnostics["degreeConvention"];
  operator_conventions: {
    self_loops: string;
    zero_degree: string;
    directed: string;
  };
  Phi: SenaEmbeddingPhi | "layout_only";
  delta: SenaEmbeddingDelta | "none";
  d: number | null;
  seed: number | null;
  metric_exact: boolean;
  stress: number | null;
  isolated: SenaOperatorDiagnostics["isolatedVertices"];
  bridge_direction: SenaOperatorDiagnostics["direction"]["bridgeMode"];
  bridge_pc_cp_independent: boolean;
  direction_badge: string;
  dataset_version: string;
  dataset_content_hash: string;
  codebook_version: string;
  model_card: {
    schemaVersion: typeof SENA_SCHEMA_VERSIONS.modelCard;
    renderGateStatus: SenaModelCard["renderGate"]["status"];
    missingSectionIds: SenaModelCardSectionId[];
  };
};

export type SenaSummary = {
  people: number;
  concepts: number;
  socialEdges: number;
  conceptEdges: number;
  bridgeEdges: number;
  socialDensity: number;
  socialAnalysis: SenaSocialAnalysis;
  strongestSocialTie?: SenaEdge;
  strongestConceptTie?: SenaEdge;
  strongestBridgeTie?: SenaEdge;
  warnings: string[];
};

export type SenaModel = {
  dataset: SenaDataset;
  options: SenaResolvedBuildOptions;
  nodes: SenaNode[];
  edges: SenaEdge[];
  matrices: SenaMatrices;
  operatorDiagnostics: SenaOperatorDiagnostics;
  people: SenaPerson[];
  codes: SenaCode[];
  utterances: SenaUtterance[];
  timeline: SenaTemporalWindow[];
  temporal: SenaTemporalSeries;
  socialReport: SenaSocialReport;
  pairReport: SenaPairReport[];
  summary: SenaSummary;
};
