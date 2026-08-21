import type { SenaReport, SenaRuntimeBundle } from "./types";

type JsonRecord = Record<string, unknown>;

const REPORT_FIELDS: { [K in keyof SenaReport]-?: true } = {
  schemaVersion: true,
  title: true,
  generatedAt: true,
  analysisWindow: true,
  parameters: true,
  runtimeProvenance: true,
  interpretationGuardrails: true,
  operatorDiagnostics: true,
  enaManifest: true,
  snaManifest: true,
  summary: true,
  matrices: true,
  figures: true,
  socialReport: true,
  pairReport: true,
  validation: true,
  modelCard: true,
  codingReliabilityGate: true,
  completenessAudit: true,
  dataContractAudit: true,
  runtimeConsistencyAudit: true,
  fusionMathAudit: true,
  pilotReadinessAudit: true,
  claimReadinessGate: true,
  dataGovernance: true,
  evidenceSnippets: true,
  humanReview: true
};

const RUNTIME_BUNDLE_FIELDS: { [K in keyof SenaRuntimeBundle]-?: true } = {
  schemaVersion: true,
  title: true,
  generatedAt: true,
  analysisWindow: true,
  parameters: true,
  runtimeProvenance: true,
  interpretationGuardrails: true,
  summary: true,
  runtimes: true,
  validation: true,
  modelCard: true,
  codingReliabilityGate: true,
  dataContractAudit: true,
  fusionMathAudit: true,
  pilotReadinessAudit: true,
  claimReadinessGate: true,
  developmentPlan: true,
  demoWalkthrough: true,
  demoVerification: true,
  demoVerificationCompatibilityAudit: true,
  productionPageContract: true,
  temporalRuntimeTrace: true,
  evidenceLedger: true,
  artifactEvidence: true,
  report: true
};

function record(value: unknown, context: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }
  return value as JsonRecord;
}

function requiredFields(value: JsonRecord, context: string, fields: readonly string[]) {
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(value, field) || value[field] === undefined) {
      throw new Error(`${context}.${field} is required.`);
    }
  }
}

function recordField(value: JsonRecord, field: string, context: string, fields: readonly string[] = []) {
  const result = record(value[field], `${context}.${field}`);
  requiredFields(result, `${context}.${field}`, fields);
  return result;
}

function stringField(value: JsonRecord, field: string, context: string) {
  if (typeof value[field] !== "string") throw new Error(`${context}.${field} must be a string.`);
}

function numberField(value: JsonRecord, field: string, context: string) {
  if (typeof value[field] !== "number" || !Number.isFinite(value[field])) {
    throw new Error(`${context}.${field} must be a finite number.`);
  }
}

function booleanField(value: JsonRecord, field: string, context: string) {
  if (typeof value[field] !== "boolean") throw new Error(`${context}.${field} must be a boolean.`);
}

function arrayField(value: JsonRecord, field: string, context: string) {
  if (!Array.isArray(value[field])) throw new Error(`${context}.${field} must be an array.`);
  return value[field] as unknown[];
}

function stringArrayField(value: JsonRecord, field: string, context: string) {
  const result = arrayField(value, field, context);
  if (result.some((entry) => typeof entry !== "string")) {
    throw new Error(`${context}.${field} must contain only strings.`);
  }
  return result as string[];
}

function recordArrayField(
  value: JsonRecord,
  field: string,
  context: string,
  required: readonly string[] = []
) {
  return arrayField(value, field, context).map((entry, index) => {
    const result = record(entry, `${context}.${field}[${index}]`);
    requiredFields(result, `${context}.${field}[${index}]`, required);
    return result;
  });
}

function nullableRecordField(value: JsonRecord, field: string, context: string) {
  if (value[field] !== null) record(value[field], `${context}.${field}`);
}

function assertStringFields(value: JsonRecord, context: string, fields: readonly string[]) {
  fields.forEach((field) => stringField(value, field, context));
}

function assertNumberFields(value: JsonRecord, context: string, fields: readonly string[]) {
  fields.forEach((field) => numberField(value, field, context));
}

function assertStringArrayEntries(value: JsonRecord, context: string, fields: readonly string[]) {
  fields.forEach((field) => stringArrayField(value, field, context));
}

function assertAnalysisWindow(value: JsonRecord, context: string) {
  nullableRecordField(value, "analysisWindow", context);
}

function assertParameters(value: unknown, context: string) {
  const parameters = record(value, context);
  requiredFields(parameters, context, ["buildOptions", "datasetCounts", "warnings"]);
  const options = recordField(parameters, "buildOptions", context, [
    "direction", "deg_convention", "delta", "Phi", "d", "seed", "alpha", "beta", "gamma",
    "normalization", "bridgeWeightRule", "undirectedSocial", "temporal"
  ]);
  assertStringFields(options, `${context}.buildOptions`, [
    "direction", "deg_convention", "delta", "Phi", "normalization", "bridgeWeightRule"
  ]);
  assertNumberFields(options, `${context}.buildOptions`, ["d", "seed", "alpha", "beta", "gamma"]);
  booleanField(options, "undirectedSocial", `${context}.buildOptions`);
  const temporal = recordField(options, "temporal", `${context}.buildOptions`, [
    "mode", "movingWindowSize", "movingWindowStep", "turnWindowRadius"
  ]);
  stringField(temporal, "mode", `${context}.buildOptions.temporal`);
  assertNumberFields(temporal, `${context}.buildOptions.temporal`, [
    "movingWindowSize", "movingWindowStep", "turnWindowRadius"
  ]);
  const counts = recordField(parameters, "datasetCounts", context, [
    "people", "interactions", "utterances", "codedSegments", "codes"
  ]);
  assertNumberFields(counts, `${context}.datasetCounts`, [
    "people", "interactions", "utterances", "codedSegments", "codes"
  ]);
  stringArrayField(parameters, "warnings", context);
}

const RUNTIME_DESCRIPTOR_FIELDS = [
  "engine", "version", "packageName", "dependencySpec", "packagePath", "runtimeRole", "apiSurface"
] as const;

function assertRuntimeProvenance(value: unknown, context: string) {
  const provenance = record(value, context);
  requiredFields(provenance, context, ["parityEvidence", "senaModel", "enaRuntime", "snaRuntime", "notes"]);
  recordArrayField(provenance, "parityEvidence", context, [
    "id", "referenceRuntime", "fixturePath", "generatedBy", "status", "coverage", "sample", "interpretation"
  ]).forEach((entry, index) => {
    assertStringFields(entry, `${context}.parityEvidence[${index}]`, [
      "id", "referenceRuntime", "fixturePath", "generatedBy", "status", "interpretation"
    ]);
    stringArrayField(entry, "coverage", `${context}.parityEvidence[${index}]`);
    recordField(entry, "sample", `${context}.parityEvidence[${index}]`);
  });
  const sena = recordField(provenance, "senaModel", context, ["engine", "implementation", "matrixFormula"]);
  assertStringFields(sena, `${context}.senaModel`, ["engine", "implementation", "matrixFormula"]);
  for (const runtimeName of ["enaRuntime", "snaRuntime"] as const) {
    const runtime = recordField(provenance, runtimeName, context, RUNTIME_DESCRIPTOR_FIELDS);
    assertStringFields(runtime, `${context}.${runtimeName}`, RUNTIME_DESCRIPTOR_FIELDS.slice(0, 6));
    stringArrayField(runtime, "apiSurface", `${context}.${runtimeName}`);
  }
  stringArrayField(provenance, "notes", context);
}

function assertInterpretationGuardrails(value: JsonRecord, context: string) {
  recordArrayField(value, "interpretationGuardrails", context, ["id", "label", "statement"])
    .forEach((entry, index) => assertStringFields(
      entry,
      `${context}.interpretationGuardrails[${index}]`,
      ["id", "label", "statement"]
    ));
}

function assertSummary(value: unknown, context: string) {
  const summary = record(value, context);
  requiredFields(summary, context, [
    "people", "concepts", "socialEdges", "conceptEdges", "bridgeEdges", "socialDensity", "socialAnalysis", "warnings"
  ]);
  assertNumberFields(summary, context, [
    "people", "concepts", "socialEdges", "conceptEdges", "bridgeEdges", "socialDensity"
  ]);
  const social = recordField(summary, "socialAnalysis", context, [
    "engine", "density", "tieCount", "reciprocity", "connected", "componentCount", "largestComponentSize",
    "averagePathLength", "communityCount"
  ]);
  stringField(social, "engine", `${context}.socialAnalysis`);
  assertNumberFields(social, `${context}.socialAnalysis`, [
    "density", "tieCount", "reciprocity", "componentCount", "largestComponentSize", "averagePathLength", "communityCount"
  ]);
  booleanField(social, "connected", `${context}.socialAnalysis`);
  stringArrayField(summary, "warnings", context);
}

function assertNumberMatrix(value: unknown, context: string) {
  if (!Array.isArray(value)) throw new Error(`${context} must be an array.`);
  value.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || row.some((cell) => typeof cell !== "number" || !Number.isFinite(cell))) {
      throw new Error(`${context}[${rowIndex}] must contain only finite numbers.`);
    }
  });
}

function assertMatrixBlock(value: unknown, context: string) {
  const block = record(value, context);
  requiredFields(block, context, ["labels", "raw", "normalized"]);
  stringArrayField(block, "labels", context);
  assertNumberMatrix(block.raw, `${context}.raw`);
  assertNumberMatrix(block.normalized, `${context}.normalized`);
}

function assertRectangularMatrixBlock(value: unknown, context: string) {
  const block = record(value, context);
  requiredFields(block, context, ["rowLabels", "columnLabels", "raw", "normalized"]);
  stringArrayField(block, "rowLabels", context);
  stringArrayField(block, "columnLabels", context);
  assertNumberMatrix(block.raw, `${context}.raw`);
  assertNumberMatrix(block.normalized, `${context}.normalized`);
}

function assertMatrices(value: unknown, context: string) {
  const matrices = record(value, context);
  requiredFields(matrices, context, ["S", "W", "B", "B_PC", "B_CP", "Y", "G", "fusion"]);
  assertMatrixBlock(matrices.S, `${context}.S`);
  assertMatrixBlock(matrices.W, `${context}.W`);
  assertRectangularMatrixBlock(matrices.B, `${context}.B`);
  assertRectangularMatrixBlock(matrices.B_PC, `${context}.B_PC`);
  assertRectangularMatrixBlock(matrices.B_CP, `${context}.B_CP`);
  const y = record(matrices.Y, `${context}.Y`);
  requiredFields(y, `${context}.Y`, ["rowLabels", "columnLabels", "windowIds", "raw"]);
  assertStringArrayEntries(y, `${context}.Y`, ["rowLabels", "columnLabels", "windowIds"]);
  assertNumberMatrix(y.raw, `${context}.Y.raw`);
  const g = record(matrices.G, `${context}.G`);
  requiredFields(g, `${context}.G`, ["rowLabels", "columnLabels", "pairIds", "pairs", "raw", "normalized"]);
  assertStringArrayEntries(g, `${context}.G`, ["rowLabels", "columnLabels", "pairIds"]);
  recordArrayField(g, "pairs", `${context}.G`, ["id", "codeA", "codeB", "label"]);
  assertNumberMatrix(g.raw, `${context}.G.raw`);
  assertNumberMatrix(g.normalized, `${context}.G.normalized`);
  const fusion = record(matrices.fusion, `${context}.fusion`);
  requiredFields(fusion, `${context}.fusion`, ["labels", "values"]);
  stringArrayField(fusion, "labels", `${context}.fusion`);
  assertNumberMatrix(fusion.values, `${context}.fusion.values`);
}

function assertTemporalSeries(value: unknown, context: string) {
  const temporal = record(value, context);
  requiredFields(temporal, context, ["settings", "windows"]);
  const settings = recordField(temporal, "settings", context, [
    "mode", "movingWindowSize", "movingWindowStep", "turnWindowRadius"
  ]);
  stringField(settings, "mode", `${context}.settings`);
  assertNumberFields(settings, `${context}.settings`, ["movingWindowSize", "movingWindowStep", "turnWindowRadius"]);
  recordArrayField(temporal, "windows", context, [
    "id", "label", "mode", "index", "startTurn", "endTurn", "stages", "utteranceIds", "segmentIds",
    "interactionCount", "segmentCount", "evidence", "rawSocialConnectivity", "rawConceptConnectivity",
    "rawBridgeIntegration", "socialConnectivity", "conceptConnectivity", "bridgeIntegration", "topCodes"
  ]);
}

function assertOperatorDiagnostics(value: unknown, context: string) {
  const diagnostics = record(value, context);
  requiredFields(diagnostics, context, [
    "runIdentity", "analysisConfig", "degreeConvention", "degreeVector", "isolatedVertices", "normalization",
    "bridgeWeighting", "direction", "embedding", "attribution", "typedCentrality"
  ]);
  const runIdentity = recordField(diagnostics, "runIdentity", context, [
    "hashAlgorithm", "datasetVersion", "datasetContentHash", "configHash"
  ]);
  assertStringFields(runIdentity, `${context}.runIdentity`, [
    "hashAlgorithm", "datasetVersion", "datasetContentHash", "configHash"
  ]);
  recordField(diagnostics, "analysisConfig", context, ["direction", "deg_convention", "delta", "Phi", "d", "seed"]);
  stringField(diagnostics, "degreeConvention", context);
  arrayField(diagnostics, "degreeVector", context);
  recordArrayField(diagnostics, "isolatedVertices", context, ["index", "label", "degree"]);
  const normalization = recordField(diagnostics, "normalization", context, ["S", "W", "B", "B_CP", "G"]);
  ["S", "W", "B", "B_CP", "G"].forEach((field) => recordField(
    normalization,
    field,
    `${context}.normalization`,
    ["rule", "divisor", "admissible", "scaleInvariant", "warnings"]
  ));
  recordField(diagnostics, "bridgeWeighting", context, [
    "rule", "activeCodeValue", "confidenceValuesPresent", "missingConfidenceCount", "warnings"
  ]);
  recordField(diagnostics, "direction", context, [
    "socialMode", "fusionMode", "socialSymmetrized", "directedInputPreserved", "bridgeMode", "pcEdgeType",
    "cpEdgeType", "pcEdgeCount", "cpEdgeCount", "independentBridgeMatrices", "badge", "warnings"
  ]);
  const embedding = recordField(diagnostics, "embedding", context, [
    "input", "exploratoryLayout", "mds", "laplacianEigenmaps", "commuteTime"
  ]);
  recordField(embedding, "input", `${context}.embedding`, [
    "matrix", "asymmetry", "symmetrized", "symmetrization", "warning"
  ]);
  recordField(embedding, "exploratoryLayout", `${context}.embedding`, ["operator", "metricExact", "warning"]);
  recordField(embedding, "mds", `${context}.embedding`, [
    "operator", "delta", "dimensions", "available", "metricExact", "coordinates", "stress", "maxDistortion",
    "minCenteredGramEigenvalue", "warnings"
  ]);
  recordField(embedding, "laplacianEigenmaps", `${context}.embedding`, [
    "operator", "laplacian", "dimensions", "available", "metricExact", "coordinates", "eigenvalues",
    "zeroEigenvalueCount", "warnings"
  ]);
  recordField(embedding, "commuteTime", `${context}.embedding`, [
    "operator", "available", "metricExact", "coordinates", "maxPairwiseError", "checkedPairs",
    "excludedSelfPairs", "warnings"
  ]);
  recordField(diagnostics, "attribution", context, [
    "estimator", "defaultWording", "contributionWordingAllowed", "contributionWordingReason", "participation",
    "gHat", "identities", "guardrail"
  ]);
  const typed = recordField(diagnostics, "typedCentrality", context, ["mixedRankingRenderable", "guardrail", "families"]);
  recordField(typed, "families", `${context}.typedCentrality`, ["personsOnS", "codesOnW", "bridgesOnB", "typedGraph"]);
}

function assertEnaManifest(value: unknown, context: string) {
  const manifest = record(value, context);
  requiredFields(manifest, context, [
    "schemaVersion", "status", "engine", "engineVersion", "source", "datasetCounts", "warnings"
  ]);
  assertStringFields(manifest, context, ["schemaVersion", "status", "engine", "engineVersion"]);
  recordField(manifest, "source", context, [
    "rowsFrom", "unitColumns", "conversationColumns", "codeColumns", "metadataColumns", "activeCodeValue"
  ]);
  recordField(manifest, "datasetCounts", context, ["rows", "units", "conversations", "codes"]);
  stringArrayField(manifest, "warnings", context);
}

function assertSnaManifest(value: unknown, context: string) {
  const manifest = record(value, context);
  requiredFields(manifest, context, [
    "schemaVersion", "status", "engine", "engineAlias", "engineVersion", "source", "datasetCounts", "warnings"
  ]);
  assertStringFields(manifest, context, ["schemaVersion", "status", "engine", "engineAlias", "engineVersion"]);
  recordField(manifest, "source", context, [
    "rowsFrom", "nodeTable", "sourceColumn", "targetColumn", "weightColumn", "stageColumn", "evidenceColumn",
    "graphMode", "undirectedSocial"
  ]);
  recordField(manifest, "datasetCounts", context, [
    "people", "interactions", "weightedTies", "communities", "components"
  ]);
  stringArrayField(manifest, "warnings", context);
}

function assertSocialReport(value: unknown, context: string) {
  const report = record(value, context);
  requiredFields(report, context, ["graph", "actors", "communities"]);
  recordField(report, "graph", context, [
    "engine", "density", "tieCount", "reciprocity", "connected", "componentCount", "largestComponentSize",
    "averagePathLength", "communityCount", "mode", "communityDetection"
  ]);
  recordArrayField(report, "actors", context, [
    "id", "label", "role", "group", "degree", "strength", "betweenness", "closeness", "reachable",
    "component", "community", "topInteractors"
  ]);
  recordArrayField(report, "communities", context, [
    "id", "label", "size", "memberIds", "members", "internalWeight", "externalWeight"
  ]);
}

function assertPairReport(value: JsonRecord, field: string, context: string) {
  recordArrayField(value, field, context, [
    "id", "codeA", "codeB", "label", "totalContribution", "evidence", "topContributors"
  ]);
}

function assertValidation(value: unknown, context: string) {
  const validation = record(value, context);
  requiredFields(validation, context, ["metricProvenance", "sensitivity", "stability", "nullModels"]);
  recordArrayField(validation, "metricProvenance", context, [
    "id", "label", "scope", "source", "implementation", "parityStatus", "interpretationLimit"
  ]);
  const sensitivity = recordField(validation, "sensitivity", context, ["layerWeights", "normalization"]);
  ["layerWeights", "normalization"].forEach((field) => recordField(
    sensitivity,
    field,
    `${context}.sensitivity`,
    ["id", "label", "baselineVariantId", "variants", "notes"]
  ));
  const stability = recordField(validation, "stability", context, ["community", "temporal"]);
  recordField(stability, "community", `${context}.stability`, [
    "method", "deterministicRepeatAgreement", "normalizationAgreement", "stableAcrossNormalizations", "notes"
  ]);
  recordField(stability, "temporal", `${context}.stability`, ["variants", "notes"]);
  const nullModels = recordField(validation, "nullModels", context, [
    "schemaVersion", "seed", "targetConceptPair", "permutation", "bootstrap", "notes"
  ]);
  recordField(nullModels, "targetConceptPair", `${context}.nullModels`, [
    "id", "codeA", "codeB", "label", "observedWeight"
  ]);
  recordField(nullModels, "permutation", `${context}.nullModels`, [
    "method", "iterations", "pValueGreaterOrEqual", "nullMean", "nullLower", "nullUpper", "samplesPreview"
  ]);
  recordField(nullModels, "bootstrap", `${context}.nullModels`, [
    "method", "iterations", "confidenceLevel", "mean", "lower", "upper", "samplesPreview"
  ]);
}

function assertAudit(value: unknown, context: string) {
  const audit = record(value, context);
  requiredFields(audit, context, ["schemaVersion", "status", "passed", "reviewNeeded", "items", "notes"]);
  assertStringFields(audit, context, ["schemaVersion", "status"]);
  assertNumberFields(audit, context, ["passed", "reviewNeeded"]);
  arrayField(audit, "items", context);
  stringArrayField(audit, "notes", context);
}

function assertModelCard(value: unknown, context: string) {
  const card = record(value, context);
  requiredFields(card, context, [
    "schemaVersion", "generatedAt", "sections", "dataset", "formulas", "normalization", "weights", "embedding",
    "reliability", "attribution", "validation", "isolated", "direction", "renderGate"
  ]);
  assertStringFields(card, context, ["schemaVersion", "generatedAt"]);
  recordArrayField(card, "sections", context, ["id", "label", "status", "evidence"]);
  recordField(card, "dataset", context, ["id", "version", "counts", "codebook", "pseudonymized", "consentRecord", "xItaPresent"]);
  recordField(card, "formulas", context, ["social", "concept", "bridge", "attribution"]);
  recordField(card, "normalization", context, ["rule", "divisors", "scaleInvariant", "warnings"]);
  recordField(card, "weights", context, ["alpha", "beta", "gamma", "configHash", "interpretation"]);
  recordField(card, "embedding", context, [
    "operator", "delta", "dimensions", "seed", "metricExact", "stress", "maxDistortion", "layoutBadge", "exactnessBadge"
  ]);
  recordField(card, "reliability", context, ["status", "summary", "evidence"]);
  recordField(card, "attribution", context, [
    "wording", "variant", "contributionWordingAllowed", "badge"
  ]);
  recordField(card, "validation", context, ["status", "claims", "seed", "pValue", "badge"]);
  recordField(card, "isolated", context, [
    "I0", "degreeConvention", "selfLoopConvention", "zeroDegreeConvention", "badge"
  ]);
  recordField(card, "direction", context, ["mode", "operator", "collapsed", "bridgesIndependent", "badge"]);
  recordField(card, "renderGate", context, ["status", "missingSectionIds", "message"]);
}

function assertHumanReview(value: unknown, context: string) {
  const review = record(value, context);
  requiredFields(review, context, ["status", "reviewer", "reviewedAt", "interpretation", "limitations", "nextActions"]);
  assertStringFields(review, context, ["status", "reviewer", "reviewedAt", "interpretation", "limitations", "nextActions"]);
}

function assertDataGovernance(value: unknown, context: string) {
  const governance = record(value, context);
  requiredFields(governance, context, [
    "schemaVersion", "status", "irbApprovalId", "consentScope", "retentionPolicy", "usageConstraints",
    "dataSteward", "reviewedAt", "requiredEvidence", "blockers", "guardrail"
  ]);
  assertStringFields(governance, context, [
    "schemaVersion", "status", "irbApprovalId", "consentScope", "retentionPolicy", "dataSteward", "reviewedAt", "guardrail"
  ]);
  assertStringArrayEntries(governance, context, ["usageConstraints", "requiredEvidence", "blockers"]);
}

function assertFigures(value: unknown, context: string) {
  const figures = record(value, context);
  requiredFields(figures, context, [
    "fusionGraph", "activeWindowComparison", "activeWindowBrief", "temporalTrace", "temporalRuntimeNarrative",
    "temporalRuntimeTransitions", "socialCommunities", "visualGrammar"
  ]);
  const graph = recordField(figures, "fusionGraph", context, ["nodes", "edges"]);
  recordArrayField(graph, "nodes", `${context}.fusionGraph`, ["id", "label", "kind"]);
  recordArrayField(graph, "edges", `${context}.fusionGraph`, [
    "id", "layer", "edgeType", "sourceKind", "targetKind", "source", "target", "label", "weight",
    "normalizedWeight", "scaledWeight"
  ]);
  nullableRecordField(figures, "activeWindowComparison", context);
  nullableRecordField(figures, "activeWindowBrief", context);
  assertTemporalSeries(figures.temporalTrace, `${context}.temporalTrace`);
  recordArrayField(figures, "temporalRuntimeNarrative", context);
  recordArrayField(figures, "temporalRuntimeTransitions", context);
  recordArrayField(figures, "socialCommunities", context);
  recordArrayField(figures, "visualGrammar", context, [
    "id", "label", "visualEncoding", "dataMapping", "interpretationRole", "guardrail"
  ]);
}

function assertCommonReportArtifacts(report: JsonRecord, context: string) {
  assertAudit(report.completenessAudit, `${context}.completenessAudit`);
  assertAudit(report.dataContractAudit, `${context}.dataContractAudit`);
  assertAudit(report.runtimeConsistencyAudit, `${context}.runtimeConsistencyAudit`);
  assertAudit(report.fusionMathAudit, `${context}.fusionMathAudit`);
  assertAudit(report.pilotReadinessAudit, `${context}.pilotReadinessAudit`);
  const claim = record(report.claimReadinessGate, `${context}.claimReadinessGate`);
  requiredFields(claim, `${context}.claimReadinessGate`, [
    "schemaVersion", "status", "claimUse", "ready", "reviewNeeded", "blockers", "items", "guardrail", "notes"
  ]);
}

export function assertSenaReportHolderStructure(value: unknown, context = "SENA report") {
  const report = record(value, context);
  requiredFields(report, context, Object.keys(REPORT_FIELDS));
  assertStringFields(report, context, ["schemaVersion", "title", "generatedAt"]);
  assertAnalysisWindow(report, context);
  assertParameters(report.parameters, `${context}.parameters`);
  assertRuntimeProvenance(report.runtimeProvenance, `${context}.runtimeProvenance`);
  assertInterpretationGuardrails(report, context);
  assertOperatorDiagnostics(report.operatorDiagnostics, `${context}.operatorDiagnostics`);
  assertEnaManifest(report.enaManifest, `${context}.enaManifest`);
  assertSnaManifest(report.snaManifest, `${context}.snaManifest`);
  assertSummary(report.summary, `${context}.summary`);
  assertMatrices(report.matrices, `${context}.matrices`);
  assertFigures(report.figures, `${context}.figures`);
  assertSocialReport(report.socialReport, `${context}.socialReport`);
  assertPairReport(report, "pairReport", context);
  assertValidation(report.validation, `${context}.validation`);
  assertModelCard(report.modelCard, `${context}.modelCard`);
  assertCommonReportArtifacts(report, context);
  assertDataGovernance(report.dataGovernance, `${context}.dataGovernance`);
  recordArrayField(report, "evidenceSnippets", context, [
    "id", "stage", "label", "text", "source", "sourceId", "sourceLabel"
  ]);
  assertHumanReview(report.humanReview, `${context}.humanReview`);
  return report;
}

function assertDevelopmentPlan(value: unknown, context: string) {
  const plan = record(value, context);
  requiredFields(plan, context, [
    "schemaVersion", "title", "generatedAt", "workspaceRoute", "milestone", "audience", "analysisWindow",
    "runtimeIntegration", "runtimeParityEvidence", "scope", "workflowAnchors", "currentGate", "phases",
    "deliveryCandidate", "nextStage", "requiredArtifacts", "nextDecisions", "notes"
  ]);
  assertStringFields(plan, context, ["schemaVersion", "title", "generatedAt", "workspaceRoute", "milestone"]);
  const gate = recordField(plan, "currentGate", context, [
    "pilotReadinessStatus", "automatedVerification", "readyItems", "reviewItems"
  ]);
  recordField(gate, "automatedVerification", `${context}.currentGate`, [
    "totalChecks", "passed", "review", "manualPending", "manualPassed", "manualFailed"
  ]);
  stringArrayField(gate, "readyItems", `${context}.currentGate`);
  stringArrayField(gate, "reviewItems", `${context}.currentGate`);
  recordArrayField(plan, "workflowAnchors", context, ["id", "label", "anchor", "status", "exportArtifacts"]);
  recordArrayField(plan, "phases", context, ["id", "label", "status", "scope", "deliverables", "evidence", "exitCriteria"]);
  recordField(plan, "deliveryCandidate", context, [
    "status", "horizon", "priority", "successCriteria", "weeklyPlan", "verificationCommands",
    "browserAcceptanceScenarios", "handoffPackage", "demoScript", "boundaries"
  ]);
  recordField(plan, "nextStage", context, [
    "status", "horizon", "priority", "baseline", "phases", "releaseGate", "publicInterfacePolicy", "assumptions"
  ]);
  assertStringArrayEntries(plan, context, ["audience", "requiredArtifacts", "nextDecisions", "notes"]);
}

function assertDemoWalkthrough(value: unknown, context: string) {
  const walkthrough = record(value, context);
  requiredFields(walkthrough, context, [
    "schemaVersion", "title", "generatedAt", "workspaceRoute", "analysisWindow", "parameters", "summary", "steps", "notes"
  ]);
  assertParameters(walkthrough.parameters, `${context}.parameters`);
  recordField(walkthrough, "summary", context, ["totalSteps", "readySteps", "reviewSteps", "pilotReadinessStatus"]);
  recordArrayField(walkthrough, "steps", context, [
    "id", "label", "status", "anchor", "userAction", "readinessItemIds", "evidence", "exportArtifacts"
  ]);
}

function assertDemoVerification(value: unknown, context: string) {
  const verification = record(value, context);
  requiredFields(verification, context, [
    "schemaVersion", "title", "generatedAt", "workspaceRoute", "analysisWindow", "parameters", "summary", "checks", "notes"
  ]);
  assertParameters(verification.parameters, `${context}.parameters`);
  recordField(verification, "summary", context, [
    "totalChecks", "automatedPass", "automatedReview", "manualPending", "manualPassed", "manualFailed",
    "requiredArtifacts", "pilotReadinessStatus"
  ]);
  recordArrayField(verification, "checks", context, [
    "id", "label", "anchor", "status", "manualAction", "expectedOutcome", "observedEvidence", "requiredArtifacts", "manualReview"
  ]);
}

function assertEvidenceLedger(value: unknown, context: string) {
  const ledger = record(value, context);
  requiredFields(ledger, context, [
    "schemaVersion", "title", "generatedAt", "analysisWindow", "parameters", "runtimeProvenance",
    "interpretationGuardrails", "sourceCounts", "snippets", "humanReview"
  ]);
  assertParameters(ledger.parameters, `${context}.parameters`);
  assertRuntimeProvenance(ledger.runtimeProvenance, `${context}.runtimeProvenance`);
  record(ledger.sourceCounts, `${context}.sourceCounts`);
  recordArrayField(ledger, "snippets", context, ["id", "stage", "label", "text", "source", "sourceId", "sourceLabel"]);
  assertHumanReview(ledger.humanReview, `${context}.humanReview`);
}

function assertTemporalRuntimeTrace(value: unknown, context: string) {
  const trace = record(value, context);
  requiredFields(trace, context, [
    "schemaVersion", "generatedAt", "sourceDatasetCounts", "buildOptions", "temporalSettings", "runtimeProvenance",
    "windows", "transitions", "warnings"
  ]);
  recordField(trace, "sourceDatasetCounts", context, ["people", "interactions", "utterances", "codedSegments", "codes"]);
  recordField(trace, "buildOptions", context, [
    "direction", "deg_convention", "delta", "Phi", "d", "seed", "alpha", "beta", "gamma", "normalization",
    "bridgeWeightRule", "undirectedSocial", "temporal"
  ]);
  recordField(trace, "temporalSettings", context, ["mode", "movingWindowSize", "movingWindowStep", "turnWindowRadius"]);
  assertRuntimeProvenance(trace.runtimeProvenance, `${context}.runtimeProvenance`);
  recordArrayField(trace, "windows", context, ["window", "datasetCounts", "sena", "ena", "sna"]);
  recordArrayField(trace, "transitions", context, [
    "id", "fromWindowId", "toWindowId", "fromLabel", "toLabel", "turnSpan", "delta", "direction", "jenaStatus",
    "jsnaStatus", "strongestGPair", "interpretationGuardrail"
  ]);
}

export function assertSenaRuntimeBundleHolderStructure(value: unknown, context = "SENA runtime bundle") {
  const runtimeBundle = record(value, context);
  requiredFields(runtimeBundle, context, Object.keys(RUNTIME_BUNDLE_FIELDS));
  assertStringFields(runtimeBundle, context, ["schemaVersion", "title", "generatedAt"]);
  assertAnalysisWindow(runtimeBundle, context);
  assertParameters(runtimeBundle.parameters, `${context}.parameters`);
  assertRuntimeProvenance(runtimeBundle.runtimeProvenance, `${context}.runtimeProvenance`);
  assertInterpretationGuardrails(runtimeBundle, context);
  assertSummary(runtimeBundle.summary, `${context}.summary`);
  const runtimes = recordField(runtimeBundle, "runtimes", context, ["sena", "ena", "sna"]);
  const sena = recordField(runtimes, "sena", `${context}.runtimes`, [
    "engine", "implementation", "matrixFormula", "matrices", "temporal", "pairReport", "operatorDiagnostics"
  ]);
  assertMatrices(sena.matrices, `${context}.runtimes.sena.matrices`);
  assertTemporalSeries(sena.temporal, `${context}.runtimes.sena.temporal`);
  assertPairReport(sena, "pairReport", `${context}.runtimes.sena`);
  assertOperatorDiagnostics(sena.operatorDiagnostics, `${context}.runtimes.sena.operatorDiagnostics`);
  const ena = recordField(runtimes, "ena", `${context}.runtimes`, [...RUNTIME_DESCRIPTOR_FIELDS, "manifest"]);
  assertEnaManifest(ena.manifest, `${context}.runtimes.ena.manifest`);
  const sna = recordField(runtimes, "sna", `${context}.runtimes`, [
    ...RUNTIME_DESCRIPTOR_FIELDS, "manifest", "socialReport", "socialMatrix"
  ]);
  assertSnaManifest(sna.manifest, `${context}.runtimes.sna.manifest`);
  assertSocialReport(sna.socialReport, `${context}.runtimes.sna.socialReport`);
  assertMatrixBlock(sna.socialMatrix, `${context}.runtimes.sna.socialMatrix`);
  assertValidation(runtimeBundle.validation, `${context}.validation`);
  assertModelCard(runtimeBundle.modelCard, `${context}.modelCard`);
  assertAudit(runtimeBundle.dataContractAudit, `${context}.dataContractAudit`);
  assertAudit(runtimeBundle.fusionMathAudit, `${context}.fusionMathAudit`);
  assertAudit(runtimeBundle.pilotReadinessAudit, `${context}.pilotReadinessAudit`);
  assertDevelopmentPlan(runtimeBundle.developmentPlan, `${context}.developmentPlan`);
  assertDemoWalkthrough(runtimeBundle.demoWalkthrough, `${context}.demoWalkthrough`);
  assertDemoVerification(runtimeBundle.demoVerification, `${context}.demoVerification`);
  assertAudit(runtimeBundle.demoVerificationCompatibilityAudit, `${context}.demoVerificationCompatibilityAudit`);
  const page = record(runtimeBundle.productionPageContract, `${context}.productionPageContract`);
  requiredFields(page, `${context}.productionPageContract`, [
    "schemaVersion", "title", "workspaceRoute", "description", "sections", "visualChecks", "notes"
  ]);
  assertTemporalRuntimeTrace(runtimeBundle.temporalRuntimeTrace, `${context}.temporalRuntimeTrace`);
  assertEvidenceLedger(runtimeBundle.evidenceLedger, `${context}.evidenceLedger`);
  recordArrayField(runtimeBundle, "artifactEvidence", context, [
    "filename", "schemaVersion", "runtimeRole", "sourceRuntime", "downloadControl", "status", "matrixCoverage",
    "evidenceCoverage", "handoffChecks"
  ]);
  assertSenaReportHolderStructure(runtimeBundle.report, `${context}.report`);
  return runtimeBundle;
}
