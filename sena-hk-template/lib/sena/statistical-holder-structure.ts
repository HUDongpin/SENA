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

function enumField(value: JsonRecord, field: string, context: string, allowed: readonly string[]) {
  if (typeof value[field] !== "string" || !allowed.includes(value[field] as string)) {
    throw new Error(`${context}.${field} must be one of ${allowed.join(", ")}.`);
  }
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

function numberArrayField(value: JsonRecord, field: string, context: string) {
  const result = arrayField(value, field, context);
  if (result.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
    throw new Error(`${context}.${field} must contain only finite numbers.`);
  }
  return result as number[];
}

function nullableNumberField(value: JsonRecord, field: string, context: string) {
  if (value[field] !== null) numberField(value, field, context);
}

function nullableStringField(value: JsonRecord, field: string, context: string) {
  if (value[field] !== null) stringField(value, field, context);
}

function nullableBooleanField(value: JsonRecord, field: string, context: string) {
  if (value[field] !== null) booleanField(value, field, context);
}

function finiteNumberRecord(value: unknown, context: string) {
  const result = record(value, context);
  for (const [key, entry] of Object.entries(result)) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new Error(`${context}.${key} must be a finite number.`);
    }
  }
  return result;
}

function optionalFiniteNumberRecord(value: unknown, context: string) {
  const result = record(value, context);
  for (const [key, entry] of Object.entries(result)) {
    if (entry !== undefined && (typeof entry !== "number" || !Number.isFinite(entry))) {
      throw new Error(`${context}.${key} must be a finite number when present.`);
    }
  }
  return result;
}

function manifestRow(value: unknown, context: string) {
  const result = record(value, context);
  for (const [key, entry] of Object.entries(result)) {
    if (
      entry !== null
      && typeof entry !== "string"
      && typeof entry !== "boolean"
      && (typeof entry !== "number" || !Number.isFinite(entry))
    ) {
      throw new Error(`${context}.${key} must be a JSON scalar.`);
    }
  }
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

function assertEvidenceSnippet(value: unknown, context: string) {
  const evidence = record(value, context);
  requiredFields(evidence, context, ["id", "stage", "label", "text"]);
  assertStringFields(evidence, context, ["id", "stage", "label", "text"]);
  if (evidence.personId !== undefined) stringField(evidence, "personId", context);
  if (evidence.codes !== undefined) stringArrayField(evidence, "codes", context);
  if (evidence.lineage !== undefined) {
    const lineage = recordField(evidence, "lineage", context, ["table", "rowId"]);
    enumField(lineage, "table", `${context}.lineage`, ["interactions", "coded_segments", "utterances", "temporal_window"]);
    stringField(lineage, "rowId", `${context}.lineage`);
    if (lineage.related !== undefined) {
      const related = record(lineage.related, `${context}.lineage.related`);
      for (const field of ["utteranceId", "segmentId", "interactionId", "personId", "windowId"]) {
        if (related[field] !== undefined) stringField(related, field, `${context}.lineage.related`);
      }
      if (related.codeIds !== undefined) stringArrayField(related, "codeIds", `${context}.lineage.related`);
    }
  }
}

function assertSenaEdge(value: unknown, context: string) {
  const edge = record(value, context);
  requiredFields(edge, context, [
    "id", "layer", "edgeType", "sourceKind", "targetKind", "source", "target", "weight",
    "normalizedWeight", "scaledWeight", "label", "evidence"
  ]);
  assertFusionGraphEdge(edge, context);
  arrayField(edge, "evidence", context)
    .forEach((entry, index) => assertEvidenceSnippet(entry, `${context}.evidence[${index}]`));
}

function assertTemporalWindow(value: unknown, context: string) {
  const window = record(value, context);
  requiredFields(window, context, [
    "id", "label", "mode", "index", "startTurn", "endTurn", "stages", "utteranceIds", "segmentIds",
    "interactionCount", "segmentCount", "evidence", "rawSocialConnectivity", "rawConceptConnectivity",
    "rawBridgeIntegration", "socialConnectivity", "conceptConnectivity", "bridgeIntegration", "topCodes"
  ]);
  assertStringFields(window, context, ["id", "label"]);
  enumField(window, "mode", context, ["stage", "moving-window", "turn-window"]);
  assertNumberFields(window, context, [
    "index", "startTurn", "endTurn", "interactionCount", "segmentCount", "rawSocialConnectivity",
    "rawConceptConnectivity", "rawBridgeIntegration", "socialConnectivity", "conceptConnectivity", "bridgeIntegration"
  ]);
  if (window.centerTurn !== undefined) numberField(window, "centerTurn", context);
  assertStringArrayEntries(window, context, ["stages", "utteranceIds", "segmentIds"]);
  arrayField(window, "evidence", context).forEach((entry, index) => assertEvidenceSnippet(entry, `${context}.evidence[${index}]`));
  recordArrayField(window, "topCodes", context, ["id", "label", "weight"]).forEach((entry, index) => {
    assertStringFields(entry, `${context}.topCodes[${index}]`, ["id", "label"]);
    numberField(entry, "weight", `${context}.topCodes[${index}]`);
  });
}

function assertAnalysisWindow(value: JsonRecord, context: string) {
  if (value.analysisWindow !== null) assertTemporalWindow(value.analysisWindow, `${context}.analysisWindow`);
}

function assertBuildOptions(value: unknown, context: string) {
  const options = record(value, context);
  requiredFields(options, context, [
    "direction", "deg_convention", "delta", "Phi", "d", "seed", "alpha", "beta", "gamma",
    "normalization", "bridgeWeightRule", "undirectedSocial", "temporal"
  ]);
  enumField(options, "direction", context, ["directed", "undirected"]);
  enumField(options, "deg_convention", context, ["row-sum"]);
  enumField(options, "delta", context, [
    "shortest_path_reciprocal_weight", "combinatorial_laplacian", "commute_time_resistance"
  ]);
  enumField(options, "Phi", context, ["classical_mds", "laplacian_eigenmaps", "commute_time"]);
  enumField(options, "normalization", context, ["max", "frobenius", "log1p-max", "log-max", "none"]);
  enumField(options, "bridgeWeightRule", context, ["count", "confidence"]);
  assertNumberFields(options, context, ["d", "seed", "alpha", "beta", "gamma"]);
  booleanField(options, "undirectedSocial", context);
  const temporal = recordField(options, "temporal", context, [
    "mode", "movingWindowSize", "movingWindowStep", "turnWindowRadius"
  ]);
  enumField(temporal, "mode", `${context}.temporal`, ["stage", "moving-window", "turn-window"]);
  assertNumberFields(temporal, `${context}.temporal`, [
    "movingWindowSize", "movingWindowStep", "turnWindowRadius"
  ]);
}

function assertParameters(value: unknown, context: string) {
  const parameters = record(value, context);
  requiredFields(parameters, context, ["buildOptions", "datasetCounts", "warnings"]);
  assertBuildOptions(parameters.buildOptions, `${context}.buildOptions`);
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
    const entryContext = `${context}.parityEvidence[${index}]`;
    assertStringFields(entry, entryContext, ["id", "referenceRuntime", "fixturePath", "generatedBy", "interpretation"]);
    enumField(entry, "status", entryContext, ["covered", "development-only", "deferred"]);
    stringArrayField(entry, "coverage", entryContext);
    const sample = recordField(entry, "sample", entryContext);
    for (const field of [
      "units", "codes", "dimensions", "lineWeightRows", "lineWeightColumns", "connectionCountRows",
      "connectionCountColumns", "graphFamilies"
    ]) {
      if (sample[field] !== undefined) numberField(sample, field, `${entryContext}.sample`);
    }
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
  for (const field of ["strongestSocialTie", "strongestConceptTie", "strongestBridgeTie"]) {
    if (summary[field] !== undefined) assertSenaEdge(summary[field], `${context}.${field}`);
  }
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

function assertNullableNumberMatrix(value: unknown, context: string) {
  if (value !== null) assertNumberMatrix(value, context);
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
  recordArrayField(g, "pairs", `${context}.G`, ["id", "codeA", "codeB", "label"])
    .forEach((entry, index) => assertStringFields(
      entry,
      `${context}.G.pairs[${index}]`,
      ["id", "codeA", "codeB", "label"]
    ));
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
  enumField(settings, "mode", `${context}.settings`, ["stage", "moving-window", "turn-window"]);
  assertNumberFields(settings, `${context}.settings`, ["movingWindowSize", "movingWindowStep", "turnWindowRadius"]);
  arrayField(temporal, "windows", context)
    .forEach((entry, index) => assertTemporalWindow(entry, `${context}.windows[${index}]`));
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
  const analysisConfig = recordField(diagnostics, "analysisConfig", context, [
    "direction", "deg_convention", "delta", "Phi", "d", "seed"
  ]);
  const analysisConfigContext = `${context}.analysisConfig`;
  enumField(analysisConfig, "direction", analysisConfigContext, ["directed", "undirected"]);
  enumField(analysisConfig, "deg_convention", analysisConfigContext, ["row-sum"]);
  enumField(analysisConfig, "delta", analysisConfigContext, [
    "shortest_path_reciprocal_weight", "combinatorial_laplacian", "commute_time_resistance"
  ]);
  enumField(analysisConfig, "Phi", analysisConfigContext, [
    "classical_mds", "laplacian_eigenmaps", "commute_time"
  ]);
  assertNumberFields(analysisConfig, analysisConfigContext, ["d", "seed"]);
  enumField(diagnostics, "degreeConvention", context, ["row-sum"]);
  numberArrayField(diagnostics, "degreeVector", context);
  recordArrayField(diagnostics, "isolatedVertices", context, ["index", "label", "degree"])
    .forEach((entry, index) => {
      const entryContext = `${context}.isolatedVertices[${index}]`;
      assertNumberFields(entry, entryContext, ["index", "degree"]);
      stringField(entry, "label", entryContext);
    });
  const normalization = recordField(diagnostics, "normalization", context, ["S", "W", "B", "B_CP", "G"]);
  ["S", "W", "B", "B_CP", "G"].forEach((field) => {
    const item = recordField(
      normalization,
      field,
      `${context}.normalization`,
      ["rule", "divisor", "admissible", "scaleInvariant", "warnings"]
    );
    const itemContext = `${context}.normalization.${field}`;
    enumField(item, "rule", itemContext, ["max", "frobenius", "log1p-max", "log-max", "none"]);
    numberField(item, "divisor", itemContext);
    booleanField(item, "admissible", itemContext);
    booleanField(item, "scaleInvariant", itemContext);
    stringArrayField(item, "warnings", itemContext);
  });
  const bridgeWeighting = recordField(diagnostics, "bridgeWeighting", context, [
    "rule", "activeCodeValue", "confidenceValuesPresent", "missingConfidenceCount", "warnings"
  ]);
  const bridgeContext = `${context}.bridgeWeighting`;
  enumField(bridgeWeighting, "rule", bridgeContext, ["count", "confidence"]);
  enumField(bridgeWeighting, "activeCodeValue", bridgeContext, [
    "segment-code-count", "segment-confidence-or-1"
  ]);
  booleanField(bridgeWeighting, "confidenceValuesPresent", bridgeContext);
  numberField(bridgeWeighting, "missingConfidenceCount", bridgeContext);
  stringArrayField(bridgeWeighting, "warnings", bridgeContext);
  const direction = recordField(diagnostics, "direction", context, [
    "socialMode", "fusionMode", "socialSymmetrized", "directedInputPreserved", "bridgeMode", "pcEdgeType",
    "cpEdgeType", "pcEdgeCount", "cpEdgeCount", "independentBridgeMatrices", "badge", "warnings"
  ]);
  const directionContext = `${context}.direction`;
  enumField(direction, "socialMode", directionContext, ["directed", "undirected"]);
  enumField(direction, "fusionMode", directionContext, ["directed", "undirected"]);
  enumField(direction, "bridgeMode", directionContext, ["pc-transpose-fallback", "pc-cp-independent"]);
  enumField(direction, "pcEdgeType", directionContext, ["PC"]);
  enumField(direction, "cpEdgeType", directionContext, ["CP"]);
  assertNumberFields(direction, directionContext, ["pcEdgeCount", "cpEdgeCount"]);
  ["socialSymmetrized", "directedInputPreserved", "independentBridgeMatrices"].forEach((field) => {
    booleanField(direction, field, directionContext);
  });
  stringField(direction, "badge", directionContext);
  stringArrayField(direction, "warnings", directionContext);
  const embedding = recordField(diagnostics, "embedding", context, [
    "input", "exploratoryLayout", "mds", "laplacianEigenmaps", "commuteTime"
  ]);
  const input = recordField(embedding, "input", `${context}.embedding`, [
    "matrix", "asymmetry", "symmetrized", "symmetrization", "warning"
  ]);
  const inputContext = `${context}.embedding.input`;
  enumField(input, "matrix", inputContext, ["fusion"]);
  numberField(input, "asymmetry", inputContext);
  booleanField(input, "symmetrized", inputContext);
  enumField(input, "symmetrization", inputContext, ["none", "declared-sym(A)=(A+At)/2"]);
  nullableStringField(input, "warning", inputContext);
  const layout = recordField(embedding, "exploratoryLayout", `${context}.embedding`, [
    "operator", "metricExact", "warning"
  ]);
  const layoutContext = `${context}.embedding.exploratoryLayout`;
  enumField(layout, "operator", layoutContext, ["deterministic-force-layout"]);
  booleanField(layout, "metricExact", layoutContext);
  stringField(layout, "warning", layoutContext);
  const mds = recordField(embedding, "mds", `${context}.embedding`, [
    "operator", "delta", "dimensions", "available", "metricExact", "coordinates", "stress", "maxDistortion",
    "minCenteredGramEigenvalue", "warnings"
  ]);
  const mdsContext = `${context}.embedding.mds`;
  enumField(mds, "operator", mdsContext, ["classical-mds"]);
  enumField(mds, "delta", mdsContext, ["shortest-path-reciprocal-weight"]);
  numberField(mds, "dimensions", mdsContext);
  booleanField(mds, "available", mdsContext);
  booleanField(mds, "metricExact", mdsContext);
  assertNullableNumberMatrix(mds.coordinates, `${mdsContext}.coordinates`);
  ["stress", "maxDistortion", "minCenteredGramEigenvalue"].forEach((field) => {
    nullableNumberField(mds, field, mdsContext);
  });
  stringArrayField(mds, "warnings", mdsContext);
  const laplacian = recordField(embedding, "laplacianEigenmaps", `${context}.embedding`, [
    "operator", "laplacian", "dimensions", "available", "metricExact", "coordinates", "eigenvalues",
    "zeroEigenvalueCount", "warnings"
  ]);
  const laplacianContext = `${context}.embedding.laplacianEigenmaps`;
  enumField(laplacian, "operator", laplacianContext, ["laplacian-eigenmaps"]);
  enumField(laplacian, "laplacian", laplacianContext, ["combinatorial"]);
  numberField(laplacian, "dimensions", laplacianContext);
  booleanField(laplacian, "available", laplacianContext);
  booleanField(laplacian, "metricExact", laplacianContext);
  assertNullableNumberMatrix(laplacian.coordinates, `${laplacianContext}.coordinates`);
  if (laplacian.eigenvalues !== null) numberArrayField(laplacian, "eigenvalues", laplacianContext);
  nullableNumberField(laplacian, "zeroEigenvalueCount", laplacianContext);
  stringArrayField(laplacian, "warnings", laplacianContext);
  const commute = recordField(embedding, "commuteTime", `${context}.embedding`, [
    "operator", "available", "metricExact", "coordinates", "maxPairwiseError", "checkedPairs",
    "excludedSelfPairs", "warnings"
  ]);
  const commuteContext = `${context}.embedding.commuteTime`;
  enumField(commute, "operator", commuteContext, ["commute-time"]);
  booleanField(commute, "available", commuteContext);
  booleanField(commute, "metricExact", commuteContext);
  assertNullableNumberMatrix(commute.coordinates, `${commuteContext}.coordinates`);
  ["maxPairwiseError", "checkedPairs", "excludedSelfPairs"].forEach((field) => {
    nullableNumberField(commute, field, commuteContext);
  });
  stringArrayField(commute, "warnings", commuteContext);
  const attribution = recordField(diagnostics, "attribution", context, [
    "estimator", "defaultWording", "contributionWordingAllowed", "contributionWordingReason", "participation",
    "gHat", "identities", "guardrail"
  ]);
  const attributionContext = `${context}.attribution`;
  enumField(attribution, "estimator", attributionContext, ["x-transpose-diag-y-x"]);
  enumField(attribution, "defaultWording", attributionContext, ["associated with windows containing the pair"]);
  booleanField(attribution, "contributionWordingAllowed", attributionContext);
  assertStringFields(attribution, attributionContext, ["contributionWordingReason", "guardrail"]);
  const participation = recordField(attribution, "participation", attributionContext, [
    "symbol", "sourceTable", "rowCount", "columnCount", "activeCells", "firstClass", "warnings"
  ]);
  const participationContext = `${attributionContext}.participation`;
  enumField(participation, "symbol", participationContext, ["Y"]);
  enumField(participation, "sourceTable", participationContext, ["coded_segments"]);
  assertNumberFields(participation, participationContext, ["rowCount", "columnCount", "activeCells"]);
  booleanField(participation, "firstClass", participationContext);
  stringArrayField(participation, "warnings", participationContext);
  const gHat = recordField(attribution, "gHat", attributionContext, [
    "normalization", "values", "rowSums", "boundsWithinWindowProducts", "minValue", "maxValue",
    "zeroParticipationRows"
  ]);
  const gHatContext = `${attributionContext}.gHat`;
  enumField(gHat, "normalization", gHatContext, ["participation-window-share"]);
  assertNumberMatrix(gHat.values, `${gHatContext}.values`);
  numberArrayField(gHat, "rowSums", gHatContext);
  booleanField(gHat, "boundsWithinWindowProducts", gHatContext);
  assertNumberFields(gHat, gHatContext, ["minValue", "maxValue"]);
  numberArrayField(gHat, "zeroParticipationRows", gHatContext);
  const identities = recordField(attribution, "identities", attributionContext, [
    "rawSlicesPsd", "rawSumMatchesParticipantWeightedCooccurrence", "windowNormalizedOffDiagonalMatchesCodeCooccurrence"
  ]);
  const identitiesContext = `${attributionContext}.identities`;
  [
    "rawSlicesPsd", "rawSumMatchesParticipantWeightedCooccurrence",
    "windowNormalizedOffDiagonalMatchesCodeCooccurrence"
  ].forEach((field) => booleanField(identities, field, identitiesContext));
  const typed = recordField(diagnostics, "typedCentrality", context, ["mixedRankingRenderable", "guardrail", "families"]);
  const typedContext = `${context}.typedCentrality`;
  booleanField(typed, "mixedRankingRenderable", typedContext);
  stringField(typed, "guardrail", typedContext);
  const families = recordField(typed, "families", typedContext, [
    "personsOnS", "codesOnW", "bridgesOnB", "typedGraph"
  ]);
  for (const family of ["personsOnS", "codesOnW"] as const) {
    recordArrayField(families, family, `${typedContext}.families`, ["id", "label", "metric", "value"])
      .forEach((entry, index) => {
        const entryContext = `${typedContext}.families.${family}[${index}]`;
        assertStringFields(entry, entryContext, ["id", "label"]);
        enumField(entry, "metric", entryContext, [
          family === "personsOnS" ? "social-strength" : "concept-weighted-degree"
        ]);
        numberField(entry, "value", entryContext);
      });
  }
  recordArrayField(families, "bridgesOnB", `${typedContext}.families`, [
    "id", "personId", "personLabel", "codeId", "codeLabel", "metric", "value"
  ]).forEach((entry, index) => {
    const entryContext = `${typedContext}.families.bridgesOnB[${index}]`;
    assertStringFields(entry, entryContext, ["id", "personId", "personLabel", "codeId", "codeLabel"]);
    enumField(entry, "metric", entryContext, ["bridge-weight"]);
    numberField(entry, "value", entryContext);
  });
  recordArrayField(families, "typedGraph", `${typedContext}.families`, [
    "id", "label", "nodeType", "metric", "value"
  ]).forEach((entry, index) => {
    const entryContext = `${typedContext}.families.typedGraph[${index}]`;
    assertStringFields(entry, entryContext, ["id", "label"]);
    enumField(entry, "nodeType", entryContext, ["person", "code"]);
    enumField(entry, "metric", entryContext, ["typed-fused-degree"]);
    numberField(entry, "value", entryContext);
  });
}

function assertEnaManifest(value: unknown, context: string) {
  const manifest = record(value, context);
  requiredFields(manifest, context, [
    "schemaVersion", "status", "engine", "engineVersion", "source", "datasetCounts", "warnings"
  ]);
  assertStringFields(manifest, context, ["schemaVersion", "engineVersion"]);
  enumField(manifest, "status", context, ["computed", "skipped"]);
  enumField(manifest, "engine", context, ["jena-js"]);
  const source = recordField(manifest, "source", context, [
    "rowsFrom", "unitColumns", "conversationColumns", "codeColumns", "metadataColumns", "activeCodeValue"
  ]);
  const sourceContext = `${context}.source`;
  enumField(source, "rowsFrom", sourceContext, ["coded_segments"]);
  assertStringArrayEntries(source, sourceContext, [
    "unitColumns", "conversationColumns", "codeColumns", "metadataColumns"
  ]);
  enumField(source, "activeCodeValue", sourceContext, ["segment-confidence-or-1"]);
  const counts = recordField(manifest, "datasetCounts", context, ["rows", "units", "conversations", "codes"]);
  assertNumberFields(counts, `${context}.datasetCounts`, ["rows", "units", "conversations", "codes"]);
  if (manifest.options !== undefined) {
    const options = record(manifest.options, `${context}.options`);
    requiredFields(options, `${context}.options`, [
      "model", "window", "weightBy", "windowSizeBack", "windowSizeForward", "dimensions", "nodePositionMethod"
    ]);
    const optionsContext = `${context}.options`;
    enumField(options, "model", optionsContext, ["EndPoint", "AccumulatedTrajectory", "SeparateTrajectory"]);
    enumField(options, "window", optionsContext, ["MovingStanzaWindow", "Conversation"]);
    enumField(options, "weightBy", optionsContext, ["binary", "sum"]);
    enumField(options, "nodePositionMethod", optionsContext, [
      "undirected", "directed", "directed-ground-response"
    ]);
    assertNumberFields(options, optionsContext, ["windowSizeBack", "windowSizeForward", "dimensions"]);
    if (options.rotation !== undefined) enumField(options, "rotation", optionsContext, ["svd", "mean"]);
    if (options.groupColumn !== undefined) stringField(options, "groupColumn", optionsContext);
    if (options.projectedIn !== undefined) booleanField(options, "projectedIn", optionsContext);
  }
  if (manifest.outputs !== undefined) {
    const outputs = record(manifest.outputs, `${context}.outputs`);
    requiredFields(outputs, `${context}.outputs`, [
      "adjacencyKey", "dimensions", "variance", "connectionCounts", "lineWeights", "pointsForProjection",
      "points", "nodePositions", "centroids"
    ]);
    recordArrayField(outputs, "adjacencyKey", `${context}.outputs`, [
      "source", "target", "name", "sourceIndex", "targetIndex"
    ]).forEach((entry, index) => {
      const entryContext = `${context}.outputs.adjacencyKey[${index}]`;
      assertStringFields(entry, entryContext, ["source", "target", "name"]);
      assertNumberFields(entry, entryContext, ["sourceIndex", "targetIndex"]);
    });
    stringArrayField(outputs, "dimensions", `${context}.outputs`);
    finiteNumberRecord(outputs.variance, `${context}.outputs.variance`);
    if (outputs.rotationVariance !== undefined) {
      finiteNumberRecord(outputs.rotationVariance, `${context}.outputs.rotationVariance`);
    }
    if (outputs.goodnessOfFit !== undefined) {
      recordArrayField(outputs, "goodnessOfFit", `${context}.outputs`, [
        "dimension", "pearson", "spearman", "pearsonLower", "pearsonUpper"
      ]).forEach((entry, index) => {
        const entryContext = `${context}.outputs.goodnessOfFit[${index}]`;
        stringField(entry, "dimension", entryContext);
        assertNumberFields(entry, entryContext, ["pearson", "spearman", "pearsonLower", "pearsonUpper"]);
      });
    }
    if (outputs.rotation !== undefined) {
      const rotation = record(outputs.rotation, `${context}.outputs.rotation`);
      requiredFields(rotation, `${context}.outputs.rotation`, [
        "method", "columns", "matrix", "eigenvalues", "centerVector"
      ]);
      enumField(rotation, "method", `${context}.outputs.rotation`, ["svd", "mean"]);
      stringArrayField(rotation, "columns", `${context}.outputs.rotation`);
      assertNumberMatrix(rotation.matrix, `${context}.outputs.rotation.matrix`);
      numberArrayField(rotation, "eigenvalues", `${context}.outputs.rotation`);
      numberArrayField(rotation, "centerVector", `${context}.outputs.rotation`);
    }
    for (const field of [
      "connectionCounts", "lineWeights", "pointsForProjection", "points", "nodePositions", "centroids"
    ]) {
      arrayField(outputs, field, `${context}.outputs`).forEach((entry, index) => {
        manifestRow(entry, `${context}.outputs.${field}[${index}]`);
      });
    }
  }
  stringArrayField(manifest, "warnings", context);
}

function assertSnaManifest(value: unknown, context: string) {
  const manifest = record(value, context);
  requiredFields(manifest, context, [
    "schemaVersion", "status", "engine", "engineAlias", "engineVersion", "source", "datasetCounts", "warnings"
  ]);
  assertStringFields(manifest, context, ["schemaVersion", "engineVersion"]);
  enumField(manifest, "status", context, ["computed", "skipped"]);
  enumField(manifest, "engine", context, ["sna.js"]);
  enumField(manifest, "engineAlias", context, ["jSNA"]);
  const source = recordField(manifest, "source", context, [
    "rowsFrom", "nodeTable", "sourceColumn", "targetColumn", "weightColumn", "stageColumn", "evidenceColumn",
    "graphMode", "undirectedSocial"
  ]);
  const sourceContext = `${context}.source`;
  for (const [field, allowed] of [
    ["rowsFrom", ["interactions"]], ["nodeTable", ["people"]], ["sourceColumn", ["source"]],
    ["targetColumn", ["target"]], ["weightColumn", ["weight"]], ["stageColumn", ["stage"]],
    ["evidenceColumn", ["evidence"]], ["graphMode", ["graph", "digraph"]]
  ] as const) {
    enumField(source, field, sourceContext, allowed);
  }
  booleanField(source, "undirectedSocial", sourceContext);
  const counts = recordField(manifest, "datasetCounts", context, [
    "people", "interactions", "weightedTies", "communities", "components"
  ]);
  assertNumberFields(counts, `${context}.datasetCounts`, [
    "people", "interactions", "weightedTies", "communities", "components"
  ]);
  if (manifest.outputs !== undefined) {
    const outputs = record(manifest.outputs, `${context}.outputs`);
    requiredFields(outputs, `${context}.outputs`, ["graph", "actorMetrics", "communities", "socialMatrix"]);
    assertSocialGraph(outputs.graph, `${context}.outputs.graph`);
    assertSocialActors(outputs, "actorMetrics", `${context}.outputs`);
    assertSocialCommunities(outputs, "communities", `${context}.outputs`);
    assertMatrixBlock(outputs.socialMatrix, `${context}.outputs.socialMatrix`);
  }
  stringArrayField(manifest, "warnings", context);
}

function assertSocialGraph(value: unknown, context: string) {
  const graph = record(value, context);
  requiredFields(graph, context, [
    "engine", "density", "tieCount", "reciprocity", "connected", "componentCount", "largestComponentSize",
    "averagePathLength", "communityCount", "mode", "communityDetection"
  ]);
  enumField(graph, "engine", context, ["sna.js"]);
  assertNumberFields(graph, context, [
    "density", "tieCount", "reciprocity", "componentCount", "largestComponentSize", "averagePathLength",
    "communityCount"
  ]);
  booleanField(graph, "connected", context);
  enumField(graph, "mode", context, ["graph", "digraph"]);
  stringField(graph, "communityDetection", context);
}

function assertSocialActors(value: JsonRecord, field: string, context: string) {
  recordArrayField(value, field, context, [
    "id", "label", "role", "group", "degree", "strength", "betweenness", "closeness", "reachable",
    "component", "community", "topInteractors"
  ]).forEach((actor, index) => {
    const actorContext = `${context}.${field}[${index}]`;
    assertStringFields(actor, actorContext, ["id", "label", "role", "group"]);
    assertNumberFields(actor, actorContext, [
      "degree", "strength", "betweenness", "closeness", "reachable", "component", "community"
    ]);
    recordArrayField(actor, "topInteractors", actorContext, ["id", "label", "weight"])
      .forEach((entry, topIndex) => {
        const entryContext = `${actorContext}.topInteractors[${topIndex}]`;
        assertStringFields(entry, entryContext, ["id", "label"]);
        numberField(entry, "weight", entryContext);
      });
  });
}

function assertSocialCommunities(value: JsonRecord, field: string, context: string) {
  recordArrayField(value, field, context, [
    "id", "label", "size", "memberIds", "members", "internalWeight", "externalWeight"
  ]).forEach((community, index) => {
    const communityContext = `${context}.${field}[${index}]`;
    assertNumberFields(community, communityContext, ["id", "size", "internalWeight", "externalWeight"]);
    stringField(community, "label", communityContext);
    assertStringArrayEntries(community, communityContext, ["memberIds", "members"]);
  });
}

function assertSocialReport(value: unknown, context: string) {
  const report = record(value, context);
  requiredFields(report, context, ["graph", "actors", "communities"]);
  assertSocialGraph(report.graph, `${context}.graph`);
  assertSocialActors(report, "actors", context);
  assertSocialCommunities(report, "communities", context);
}

function assertPairReport(value: JsonRecord, field: string, context: string) {
  recordArrayField(value, field, context, [
    "id", "codeA", "codeB", "label", "totalContribution", "evidence", "topContributors"
  ]).forEach((pair, pairIndex) => {
    const pairContext = `${context}.${field}[${pairIndex}]`;
    assertStringFields(pair, pairContext, ["id", "codeA", "codeB", "label"]);
    numberField(pair, "totalContribution", pairContext);
    arrayField(pair, "evidence", pairContext)
      .forEach((entry, index) => assertEvidenceSnippet(entry, `${pairContext}.evidence[${index}]`));
    recordArrayField(pair, "topContributors", pairContext, [
      "id", "label", "weight", "directWeight", "supportingWeight", "evidence"
    ]).forEach((contributor, index) => {
      const contributorContext = `${pairContext}.topContributors[${index}]`;
      assertStringFields(contributor, contributorContext, ["id", "label"]);
      assertNumberFields(contributor, contributorContext, ["weight", "directWeight", "supportingWeight"]);
      arrayField(contributor, "evidence", contributorContext)
        .forEach((entry, evidenceIndex) => assertEvidenceSnippet(
          entry,
          `${contributorContext}.evidence[${evidenceIndex}]`
        ));
    });
  });
}

function assertValidation(value: unknown, context: string) {
  const validation = record(value, context);
  requiredFields(validation, context, ["metricProvenance", "sensitivity", "stability", "nullModels"]);
  recordArrayField(validation, "metricProvenance", context, [
    "id", "label", "scope", "source", "implementation", "parityStatus", "interpretationLimit"
  ]).forEach((entry, index) => {
    const entryContext = `${context}.metricProvenance[${index}]`;
    assertStringFields(entry, entryContext, ["id", "label", "implementation", "parityStatus", "interpretationLimit"]);
    enumField(entry, "scope", entryContext, [
      "social-graph", "social-actor", "community", "bridge", "concept", "fusion"
    ]);
    enumField(entry, "source", entryContext, [
      "jena-js", "sna.js", "sena-derived-from-sna.js", "sena-self-implemented", "sena-composite"
    ]);
  });
  const sensitivity = recordField(validation, "sensitivity", context, ["layerWeights", "normalization"]);
  ["layerWeights", "normalization"].forEach((field) => {
    const check = recordField(
      sensitivity,
      field,
      `${context}.sensitivity`,
      ["id", "label", "baselineVariantId", "variants", "notes"]
    );
    const checkContext = `${context}.sensitivity.${field}`;
    enumField(check, "id", checkContext, [field === "layerWeights" ? "layer-weights" : "normalization"]);
    assertStringFields(check, checkContext, ["label", "baselineVariantId"]);
    recordArrayField(check, "variants", checkContext, [
      "id", "label", "buildOptions", "fusionLayerTotals", "fusionTotalDelta", "socialDensity", "communityCount"
    ]).forEach((variant, index) => {
      const variantContext = `${checkContext}.variants[${index}]`;
      assertStringFields(variant, variantContext, ["id", "label"]);
      assertBuildOptions(variant.buildOptions, `${variantContext}.buildOptions`);
      const totals = recordField(variant, "fusionLayerTotals", variantContext, [
        "social", "concept", "bridge", "total"
      ]);
      assertNumberFields(totals, `${variantContext}.fusionLayerTotals`, ["social", "concept", "bridge", "total"]);
      assertNumberFields(variant, variantContext, ["fusionTotalDelta", "socialDensity", "communityCount"]);
      if (variant.strongestScaledEdge !== undefined) {
        const strongest = record(variant.strongestScaledEdge, `${variantContext}.strongestScaledEdge`);
        requiredFields(strongest, `${variantContext}.strongestScaledEdge`, ["id", "layer", "label", "scaledWeight"]);
        assertStringFields(strongest, `${variantContext}.strongestScaledEdge`, ["id", "label"]);
        enumField(strongest, "layer", `${variantContext}.strongestScaledEdge`, ["social", "concept", "bridge"]);
        numberField(strongest, "scaledWeight", `${variantContext}.strongestScaledEdge`);
      }
    });
    stringArrayField(check, "notes", checkContext);
  });
  const stability = recordField(validation, "stability", context, ["community", "temporal"]);
  const community = recordField(stability, "community", `${context}.stability`, [
    "method", "deterministicRepeatAgreement", "normalizationAgreement", "stableAcrossNormalizations", "notes"
  ]);
  const communityContext = `${context}.stability.community`;
  stringField(community, "method", communityContext);
  numberField(community, "deterministicRepeatAgreement", communityContext);
  recordArrayField(community, "normalizationAgreement", communityContext, [
    "normalization", "agreement", "communityCount"
  ]).forEach((entry, index) => {
    const entryContext = `${communityContext}.normalizationAgreement[${index}]`;
    enumField(entry, "normalization", entryContext, ["max", "frobenius", "log1p-max", "log-max", "none"]);
    assertNumberFields(entry, entryContext, ["agreement", "communityCount"]);
  });
  booleanField(community, "stableAcrossNormalizations", communityContext);
  stringArrayField(community, "notes", communityContext);
  const temporal = recordField(stability, "temporal", `${context}.stability`, ["variants", "notes"]);
  const temporalContext = `${context}.stability.temporal`;
  recordArrayField(temporal, "variants", temporalContext, [
    "mode", "windowCount", "interactionAssignments", "segmentAssignments", "utteranceCoverage", "segmentCoverage",
    "interactionCoverage", "emptyWindows", "maxSocialConnectivity", "maxConceptConnectivity", "maxBridgeIntegration"
  ]).forEach((variant, index) => {
    const variantContext = `${temporalContext}.variants[${index}]`;
    enumField(variant, "mode", variantContext, ["stage", "moving-window", "turn-window"]);
    assertNumberFields(variant, variantContext, [
      "windowCount", "interactionAssignments", "segmentAssignments", "utteranceCoverage", "segmentCoverage",
      "interactionCoverage", "emptyWindows", "maxSocialConnectivity", "maxConceptConnectivity", "maxBridgeIntegration"
    ]);
  });
  stringArrayField(temporal, "notes", temporalContext);
  const nullModels = recordField(validation, "nullModels", context, [
    "schemaVersion", "seed", "targetConceptPair", "permutation", "bootstrap", "notes"
  ]);
  const nullContext = `${context}.nullModels`;
  stringField(nullModels, "schemaVersion", nullContext);
  numberField(nullModels, "seed", nullContext);
  const target = recordField(nullModels, "targetConceptPair", nullContext, [
    "id", "codeA", "codeB", "label", "observedWeight"
  ]);
  assertStringFields(target, `${nullContext}.targetConceptPair`, ["id", "codeA", "codeB", "label"]);
  numberField(target, "observedWeight", `${nullContext}.targetConceptPair`);
  const permutation = recordField(nullModels, "permutation", nullContext, [
    "method", "iterations", "pValueGreaterOrEqual", "nullMean", "nullLower", "nullUpper", "samplesPreview"
  ]);
  const permutationContext = `${nullContext}.permutation`;
  enumField(permutation, "method", permutationContext, ["global-code-label-shuffle"]);
  assertNumberFields(permutation, permutationContext, [
    "iterations", "pValueGreaterOrEqual", "nullMean", "nullLower", "nullUpper"
  ]);
  numberArrayField(permutation, "samplesPreview", permutationContext);
  const bootstrap = recordField(nullModels, "bootstrap", nullContext, [
    "method", "iterations", "confidenceLevel", "mean", "lower", "upper", "samplesPreview"
  ]);
  const bootstrapContext = `${nullContext}.bootstrap`;
  enumField(bootstrap, "method", bootstrapContext, ["stanza-resampling-with-replacement"]);
  assertNumberFields(bootstrap, bootstrapContext, ["iterations", "confidenceLevel", "mean", "lower", "upper"]);
  numberArrayField(bootstrap, "samplesPreview", bootstrapContext);
  stringArrayField(nullModels, "notes", nullContext);
}

function assertAudit(value: unknown, context: string) {
  const audit = record(value, context);
  requiredFields(audit, context, ["schemaVersion", "status", "passed", "reviewNeeded", "items", "notes"]);
  stringField(audit, "schemaVersion", context);
  const statusValues = context.endsWith(".dataContractAudit")
    ? ["valid", "needs-review"]
    : context.endsWith(".runtimeConsistencyAudit")
      ? ["consistent", "needs-review"]
      : context.endsWith(".fusionMathAudit")
        ? ["verified", "needs-review"]
        : context.endsWith(".demoVerificationCompatibilityAudit")
          ? ["compatible", "mismatch"]
          : ["complete", "ready", "needs-review"];
  enumField(audit, "status", context, statusValues);
  assertNumberFields(audit, context, ["passed", "reviewNeeded"]);
  recordArrayField(audit, "items", context, ["id", "label", "status"])
    .forEach((item, index) => {
      const itemContext = `${context}.items[${index}]`;
      assertStringFields(item, itemContext, ["id", "label"]);
      enumField(item, "status", itemContext, context.endsWith(".pilotReadinessAudit")
        ? ["ready", "review"]
        : ["pass", "review"]);
      for (const field of ["summary", "expected", "actual", "nextAction"]) {
        if (item[field] !== undefined) stringField(item, field, itemContext);
      }
      for (const field of ["evidence", "detail"]) {
        if (item[field] !== undefined) stringArrayField(item, field, itemContext);
      }
      if (item.category !== undefined) {
        enumField(item, "category", itemContext, ["data", "model", "math", "runtime", "method", "evidence", "review"]);
      }
      for (const field of ["maxDelta", "tolerance"]) {
        if (item[field] !== undefined) numberField(item, field, itemContext);
      }
      if (item.metrics !== undefined) {
        const metrics = record(item.metrics, `${itemContext}.metrics`);
        for (const [key, metric] of Object.entries(metrics)) {
          if (
            typeof metric !== "string"
            && typeof metric !== "boolean"
            && (typeof metric !== "number" || !Number.isFinite(metric))
            && !(Array.isArray(metric) && metric.every((entry) => (
              typeof entry === "string" || (typeof entry === "number" && Number.isFinite(entry))
            )))
          ) {
            throw new Error(`${itemContext}.metrics.${key} must be a supported scalar or scalar array.`);
          }
        }
      }
    });
  stringArrayField(audit, "notes", context);
}

function assertModelCard(value: unknown, context: string) {
  const card = record(value, context);
  requiredFields(card, context, [
    "schemaVersion", "generatedAt", "sections", "dataset", "formulas", "normalization", "weights", "embedding",
    "reliability", "attribution", "validation", "isolated", "direction", "renderGate"
  ]);
  assertStringFields(card, context, ["schemaVersion", "generatedAt"]);
  recordArrayField(card, "sections", context, ["id", "label", "status", "evidence"])
    .forEach((section, index) => {
      const sectionContext = `${context}.sections[${index}]`;
      enumField(section, "id", sectionContext, [
        "data-contract", "exact-formulas", "normalization", "layer-weights", "embedding-geometry",
        "coding-reliability", "attribution-wording", "validation", "isolated-zero-degree", "directed-graph"
      ]);
      stringField(section, "label", sectionContext);
      enumField(section, "status", sectionContext, ["complete", "needs-review"]);
      stringArrayField(section, "evidence", sectionContext);
    });
  const dataset = recordField(card, "dataset", context, [
    "id", "version", "counts", "codebook", "pseudonymized", "consentRecord", "xItaPresent"
  ]);
  const datasetContext = `${context}.dataset`;
  nullableStringField(dataset, "id", datasetContext);
  const version = recordField(dataset, "version", datasetContext, ["declared", "contentHash"]);
  assertStringFields(version, `${datasetContext}.version`, ["declared", "contentHash"]);
  assertDatasetCounts(dataset.counts, `${datasetContext}.counts`);
  const codebook = recordField(dataset, "codebook", datasetContext, ["id", "version", "contentHash"]);
  ["id", "version", "contentHash"].forEach((field) => nullableStringField(codebook, field, `${datasetContext}.codebook`));
  booleanField(dataset, "pseudonymized", datasetContext);
  nullableStringField(dataset, "consentRecord", datasetContext);
  booleanField(dataset, "xItaPresent", datasetContext);
  const formulas = recordField(card, "formulas", context, ["social", "concept", "bridge", "attribution"]);
  const social = recordField(formulas, "social", `${context}.formulas`, [
    "formula", "direction", "directedInputPreserved"
  ]);
  enumField(social, "formula", `${context}.formulas.social`, ["S = R", "S = R + R^T"]);
  enumField(social, "direction", `${context}.formulas.social`, ["directed", "undirected"]);
  booleanField(social, "directedInputPreserved", `${context}.formulas.social`);
  const concept = recordField(formulas, "concept", `${context}.formulas`, [
    "formula", "codeFrequenciesAsNodeAttributes"
  ]);
  enumField(concept, "formula", `${context}.formulas.concept`, ["W_ab = sum_t X_ta X_tb, a != b, W_aa = 0"]);
  booleanField(concept, "codeFrequenciesAsNodeAttributes", `${context}.formulas.concept`);
  const bridge = recordField(formulas, "bridge", `${context}.formulas`, [
    "formula", "weightRule", "activeCodeValue"
  ]);
  enumField(bridge, "formula", `${context}.formulas.bridge`, ["B_ic = sum_{s: person(s)=i} w_s * 1[c in codes_s]"]);
  enumField(bridge, "weightRule", `${context}.formulas.bridge`, ["segment-count", "confidence-weighted"]);
  enumField(bridge, "activeCodeValue", `${context}.formulas.bridge`, [
    "segment-code-count", "segment-confidence-or-1"
  ]);
  const attributionFormula = recordField(formulas, "attribution", `${context}.formulas`, ["variant", "estimator"]);
  enumField(attributionFormula, "variant", `${context}.formulas.attribution`, ["G_hat"]);
  enumField(attributionFormula, "estimator", `${context}.formulas.attribution`, ["x-transpose-diag-y-x"]);
  const normalization = recordField(card, "normalization", context, ["rule", "divisors", "scaleInvariant", "warnings"]);
  const normalizationContext = `${context}.normalization`;
  enumField(normalization, "rule", normalizationContext, ["max", "frobenius", "log1p-max", "log-max", "none"]);
  const divisors = recordField(normalization, "divisors", normalizationContext, ["S", "W", "B", "B_CP", "G"]);
  assertNumberFields(divisors, `${normalizationContext}.divisors`, ["S", "W", "B", "B_CP", "G"]);
  booleanField(normalization, "scaleInvariant", normalizationContext);
  stringArrayField(normalization, "warnings", normalizationContext);
  const weights = recordField(card, "weights", context, ["alpha", "beta", "gamma", "configHash", "interpretation"]);
  assertNumberFields(weights, `${context}.weights`, ["alpha", "beta", "gamma"]);
  assertStringFields(weights, `${context}.weights`, ["configHash", "interpretation"]);
  const embedding = recordField(card, "embedding", context, [
    "operator", "delta", "dimensions", "seed", "metricExact", "stress", "maxDistortion", "layoutBadge", "exactnessBadge"
  ]);
  const embeddingContext = `${context}.embedding`;
  enumField(embedding, "operator", embeddingContext, ["layout-only", "classical-mds"]);
  enumField(embedding, "delta", embeddingContext, ["none", "shortest-path-reciprocal-weight"]);
  ["dimensions", "seed", "stress", "maxDistortion"].forEach((field) => nullableNumberField(embedding, field, embeddingContext));
  booleanField(embedding, "metricExact", embeddingContext);
  assertStringFields(embedding, embeddingContext, ["layoutBadge", "exactnessBadge"]);
  const reliability = recordField(card, "reliability", context, ["status", "summary", "evidence"]);
  enumField(reliability, "status", `${context}.reliability`, ["complete", "needs-review"]);
  stringField(reliability, "summary", `${context}.reliability`);
  stringArrayField(reliability, "evidence", `${context}.reliability`);
  const attribution = recordField(card, "attribution", context, [
    "wording", "variant", "contributionWordingAllowed", "badge"
  ]);
  const attributionContext = `${context}.attribution`;
  enumField(attribution, "wording", attributionContext, ["contribution-supported", "association-exposure-only"]);
  enumField(attribution, "variant", attributionContext, ["G_hat"]);
  booleanField(attribution, "contributionWordingAllowed", attributionContext);
  stringField(attribution, "badge", attributionContext);
  const validation = recordField(card, "validation", context, ["status", "claims", "seed", "pValue", "badge"]);
  enumField(validation, "status", `${context}.validation`, ["complete", "needs-review"]);
  stringArrayField(validation, "claims", `${context}.validation`);
  nullableNumberField(validation, "seed", `${context}.validation`);
  nullableNumberField(validation, "pValue", `${context}.validation`);
  stringField(validation, "badge", `${context}.validation`);
  const isolated = recordField(card, "isolated", context, [
    "I0", "degreeConvention", "selfLoopConvention", "zeroDegreeConvention", "badge"
  ]);
  recordArrayField(isolated, "I0", `${context}.isolated`, ["index", "label", "degree"])
    .forEach((entry, index) => {
      const entryContext = `${context}.isolated.I0[${index}]`;
      assertNumberFields(entry, entryContext, ["index", "degree"]);
      stringField(entry, "label", entryContext);
    });
  enumField(isolated, "degreeConvention", `${context}.isolated`, ["row-sum"]);
  assertStringFields(isolated, `${context}.isolated`, ["selfLoopConvention", "zeroDegreeConvention", "badge"]);
  const direction = recordField(card, "direction", context, ["mode", "operator", "collapsed", "bridgesIndependent", "badge"]);
  const directionContext = `${context}.direction`;
  enumField(direction, "mode", directionContext, ["directed", "undirected"]);
  enumField(direction, "operator", directionContext, ["declared-spectral-symmetrization", "symmetrized"]);
  booleanField(direction, "collapsed", directionContext);
  nullableBooleanField(direction, "bridgesIndependent", directionContext);
  nullableStringField(direction, "badge", directionContext);
  const renderGate = recordField(card, "renderGate", context, ["status", "missingSectionIds", "message"]);
  enumField(renderGate, "status", `${context}.renderGate`, ["ready", "blocked"]);
  stringArrayField(renderGate, "missingSectionIds", `${context}.renderGate`);
  stringField(renderGate, "message", `${context}.renderGate`);
}

function assertHumanReview(value: unknown, context: string) {
  const review = record(value, context);
  requiredFields(review, context, ["status", "reviewer", "reviewedAt", "interpretation", "limitations", "nextActions"]);
  enumField(review, "status", context, ["draft", "human-reviewed"]);
  assertStringFields(review, context, ["reviewer", "reviewedAt", "interpretation", "limitations", "nextActions"]);
}

function assertDataGovernance(value: unknown, context: string) {
  const governance = record(value, context);
  requiredFields(governance, context, [
    "schemaVersion", "status", "irbApprovalId", "consentScope", "retentionPolicy", "usageConstraints",
    "dataSteward", "reviewedAt", "requiredEvidence", "blockers", "guardrail"
  ]);
  assertStringFields(governance, context, [
    "schemaVersion", "irbApprovalId", "consentScope", "retentionPolicy", "dataSteward", "reviewedAt", "guardrail"
  ]);
  enumField(governance, "status", context, ["complete", "needs-review"]);
  assertStringArrayEntries(governance, context, ["usageConstraints", "requiredEvidence", "blockers"]);
}

function assertFusionGraphNode(value: unknown, context: string) {
  const node = record(value, context);
  requiredFields(node, context, ["id", "label", "kind"]);
  assertStringFields(node, context, ["id", "label"]);
  enumField(node, "kind", context, ["person", "concept"]);
}

function assertFusionGraphEdge(value: unknown, context: string) {
  const edge = record(value, context);
  requiredFields(edge, context, [
    "id", "layer", "edgeType", "sourceKind", "targetKind", "source", "target", "label", "weight",
    "normalizedWeight", "scaledWeight"
  ]);
  assertStringFields(edge, context, ["id", "source", "target", "label"]);
  enumField(edge, "layer", context, ["social", "concept", "bridge"]);
  enumField(edge, "edgeType", context, ["PP", "CC", "PC", "CP"]);
  enumField(edge, "sourceKind", context, ["person", "concept"]);
  enumField(edge, "targetKind", context, ["person", "concept"]);
  assertNumberFields(edge, context, ["weight", "normalizedWeight", "scaledWeight"]);
}

function assertTemporalRuntimeEdgeHighlight(value: unknown, context: string) {
  const edge = record(value, context);
  requiredFields(edge, context, [
    "id", "layer", "label", "source", "target", "weight", "normalizedWeight", "scaledWeight"
  ]);
  assertStringFields(edge, context, ["id", "label", "source", "target"]);
  enumField(edge, "layer", context, ["social", "concept", "bridge"]);
  assertNumberFields(edge, context, ["weight", "normalizedWeight", "scaledWeight"]);
}

function assertTemporalRuntimeGPairHighlight(value: unknown, context: string) {
  const pair = record(value, context);
  requiredFields(pair, context, ["id", "label", "codeA", "codeB", "totalContribution", "topContributors"]);
  assertStringFields(pair, context, ["id", "label", "codeA", "codeB"]);
  numberField(pair, "totalContribution", context);
  recordArrayField(pair, "topContributors", context, [
    "id", "label", "weight", "directWeight", "supportingWeight"
  ]).forEach((entry, index) => {
    const entryContext = `${context}.topContributors[${index}]`;
    assertStringFields(entry, entryContext, ["id", "label"]);
    assertNumberFields(entry, entryContext, ["weight", "directWeight", "supportingWeight"]);
  });
}

function assertMatrixFingerprint(value: unknown, context: string) {
  const fingerprint = record(value, context);
  requiredFields(fingerprint, context, [
    "id", "label", "shape", "checksumAlgorithm", "checksum", "valueKinds", "totals", "nonZero",
    "rowLabels", "columnLabels"
  ]);
  enumField(fingerprint, "id", context, ["S", "W", "B", "B_PC", "B_CP", "G", "A_fusion"]);
  assertStringFields(fingerprint, context, ["label", "shape", "checksum"]);
  enumField(fingerprint, "checksumAlgorithm", context, ["sena-stable-fnv1a32/v1"]);
  const kinds = arrayField(fingerprint, "valueKinds", context);
  if (kinds.some((entry) => !["raw", "normalized", "values"].includes(entry as string))) {
    throw new Error(`${context}.valueKinds must contain only raw, normalized, or values.`);
  }
  optionalFiniteNumberRecord(fingerprint.totals, `${context}.totals`);
  optionalFiniteNumberRecord(fingerprint.nonZero, `${context}.nonZero`);
  assertStringArrayEntries(fingerprint, context, ["rowLabels", "columnLabels"]);
  if (fingerprint.pairIds !== undefined) stringArrayField(fingerprint, "pairIds", context);
  if (fingerprint.pairDescriptors !== undefined) {
    recordArrayField(fingerprint, "pairDescriptors", context, ["id", "codeA", "codeB", "label"])
      .forEach((entry, index) => assertStringFields(
        entry,
        `${context}.pairDescriptors[${index}]`,
        ["id", "codeA", "codeB", "label"]
      ));
  }
}

function assertMatrixTotals(value: unknown, context: string, includeActivePairs = false) {
  const totals = record(value, context);
  const fields = ["S", "W", "B", "B_PC", "B_CP", "G", "fusion"];
  if (includeActivePairs) fields.push("activeGPairs");
  requiredFields(totals, context, fields);
  assertNumberFields(totals, context, fields);
}

function assertDatasetCounts(value: unknown, context: string) {
  const counts = record(value, context);
  requiredFields(counts, context, ["people", "interactions", "utterances", "codedSegments", "codes"]);
  assertNumberFields(counts, context, ["people", "interactions", "utterances", "codedSegments", "codes"]);
}

function assertActiveWindowComparison(value: unknown, context: string) {
  const comparison = record(value, context);
  requiredFields(comparison, context, [
    "currentWindow", "baselineScope", "sourceDatasetCounts", "analysisDatasetCounts", "metrics", "topSignals",
    "rankingContext", "interpretationGuardrail"
  ]);
  assertTemporalWindow(comparison.currentWindow, `${context}.currentWindow`);
  enumField(comparison, "baselineScope", context, ["full-conversation"]);
  assertDatasetCounts(comparison.sourceDatasetCounts, `${context}.sourceDatasetCounts`);
  assertDatasetCounts(comparison.analysisDatasetCounts, `${context}.analysisDatasetCounts`);
  recordArrayField(comparison, "metrics", context, ["id", "label", "current", "baseline", "delta", "share"])
    .forEach((metric, index) => {
      const metricContext = `${context}.metrics[${index}]`;
      enumField(metric, "id", metricContext, ["sna-density", "social-ties", "ena-links", "bridge-links", "g-total", "fusion-total"]);
      stringField(metric, "label", metricContext);
      assertNumberFields(metric, metricContext, ["current", "baseline", "delta"]);
      if (metric.share !== null) numberField(metric, "share", metricContext);
    });
  const topSignals = recordField(comparison, "topSignals", context);
  for (const field of ["currentTopConceptTie", "baselineTopConceptTie"]) {
    if (topSignals[field] !== undefined) {
      assertTemporalRuntimeEdgeHighlight(topSignals[field], `${context}.topSignals.${field}`);
    }
  }
  for (const field of ["currentTopGPair", "baselineTopGPair"]) {
    if (topSignals[field] !== undefined) {
      assertTemporalRuntimeGPairHighlight(topSignals[field], `${context}.topSignals.${field}`);
    }
  }
  recordArrayField(comparison, "rankingContext", context, [
    "id", "label", "layer", "signalLabel", "currentWeight", "baselineWeight", "baselineRank", "baselineItemCount",
    "baselineShare", "interpretation"
  ]).forEach((entry, index) => {
    const entryContext = `${context}.rankingContext[${index}]`;
    enumField(entry, "id", entryContext, ["top-social-tie", "top-concept-tie", "top-bridge-tie", "top-g-pair"]);
    enumField(entry, "layer", entryContext, ["S", "W", "B", "G"]);
    assertStringFields(entry, entryContext, ["label", "signalLabel", "interpretation"]);
    assertNumberFields(entry, entryContext, ["currentWeight", "baselineWeight", "baselineItemCount"]);
    nullableNumberField(entry, "baselineRank", entryContext);
    nullableNumberField(entry, "baselineShare", entryContext);
  });
  stringField(comparison, "interpretationGuardrail", context);
}

function assertActiveWindowBrief(value: unknown, context: string) {
  const brief = record(value, context);
  requiredFields(brief, context, [
    "schemaVersion", "window", "headline", "dominantSignals", "globalContext", "evidenceCues", "reviewChecklist", "guardrails"
  ]);
  assertStringFields(brief, context, ["schemaVersion", "headline"]);
  const window = recordField(brief, "window", context, [
    "id", "label", "mode", "turns", "stages", "utterances", "interactions", "segments", "evidenceRefs"
  ]);
  const windowContext = `${context}.window`;
  assertStringFields(window, windowContext, ["id", "label", "turns"]);
  enumField(window, "mode", windowContext, ["stage", "moving-window", "turn-window"]);
  stringArrayField(window, "stages", windowContext);
  assertNumberFields(window, windowContext, ["utterances", "interactions", "segments", "evidenceRefs"]);
  recordArrayField(brief, "dominantSignals", context, [
    "layer", "label", "currentWeight", "fullConversationRank", "fullConversationShare"
  ]).forEach((entry, index) => {
    const entryContext = `${context}.dominantSignals[${index}]`;
    enumField(entry, "layer", entryContext, ["S", "W", "B", "G"]);
    stringField(entry, "label", entryContext);
    numberField(entry, "currentWeight", entryContext);
    nullableNumberField(entry, "fullConversationRank", entryContext);
    nullableNumberField(entry, "fullConversationShare", entryContext);
  });
  stringArrayField(brief, "globalContext", context);
  recordArrayField(brief, "evidenceCues", context, ["source", "sourceId", "sourceLabel", "text"])
    .forEach((entry, index) => {
      const entryContext = `${context}.evidenceCues[${index}]`;
      enumField(entry, "source", entryContext, [
        "social-edge", "concept-edge", "bridge-edge", "pair-contribution", "temporal-window"
      ]);
      assertStringFields(entry, entryContext, ["sourceId", "sourceLabel", "text"]);
    });
  recordArrayField(brief, "reviewChecklist", context, ["id", "label", "status", "detail"])
    .forEach((entry, index) => {
      const entryContext = `${context}.reviewChecklist[${index}]`;
      enumField(entry, "id", entryContext, [
        "active-window-baseline", "evidence-ledger", "coding-reliability", "human-review"
      ]);
      stringField(entry, "label", entryContext);
      enumField(entry, "status", entryContext, ["present", "needed"]);
      stringField(entry, "detail", entryContext);
    });
  stringArrayField(brief, "guardrails", context);
}

function assertTemporalTransitions(value: JsonRecord, field: string, context: string) {
  recordArrayField(value, field, context, [
    "id", "fromWindowId", "toWindowId", "fromLabel", "toLabel", "turnSpan", "delta", "direction",
    "jenaStatus", "jsnaStatus", "strongestGPair", "interpretationGuardrail"
  ]).forEach((entry, index) => {
    const entryContext = `${context}.${field}[${index}]`;
    assertStringFields(entry, entryContext, [
      "id", "fromWindowId", "toWindowId", "fromLabel", "toLabel", "turnSpan", "interpretationGuardrail"
    ]);
    assertMatrixTotals(entry.delta, `${entryContext}.delta`, true);
    enumField(entry, "direction", entryContext, ["increase", "decrease", "stable"]);
    for (const statusField of ["jenaStatus", "jsnaStatus"]) {
      const status = recordField(entry, statusField, entryContext, ["from", "to"]);
      enumField(status, "from", `${entryContext}.${statusField}`, ["computed", "skipped"]);
      enumField(status, "to", `${entryContext}.${statusField}`, ["computed", "skipped"]);
    }
    const strongest = recordField(entry, "strongestGPair", entryContext, ["changed"]);
    booleanField(strongest, "changed", `${entryContext}.strongestGPair`);
    if (strongest.from !== undefined) {
      assertTemporalRuntimeGPairHighlight(strongest.from, `${entryContext}.strongestGPair.from`);
    }
    if (strongest.to !== undefined) {
      assertTemporalRuntimeGPairHighlight(strongest.to, `${entryContext}.strongestGPair.to`);
    }
  });
}

function assertFigures(value: unknown, context: string) {
  const figures = record(value, context);
  requiredFields(figures, context, [
    "fusionGraph", "activeWindowComparison", "activeWindowBrief", "temporalTrace", "temporalRuntimeNarrative",
    "temporalRuntimeTransitions", "socialCommunities", "visualGrammar"
  ]);
  const graph = recordField(figures, "fusionGraph", context, ["nodes", "edges"]);
  arrayField(graph, "nodes", `${context}.fusionGraph`)
    .forEach((entry, index) => assertFusionGraphNode(entry, `${context}.fusionGraph.nodes[${index}]`));
  arrayField(graph, "edges", `${context}.fusionGraph`)
    .forEach((entry, index) => assertFusionGraphEdge(entry, `${context}.fusionGraph.edges[${index}]`));
  if (figures.activeWindowComparison !== null) {
    assertActiveWindowComparison(figures.activeWindowComparison, `${context}.activeWindowComparison`);
  }
  if (figures.activeWindowBrief !== null) {
    assertActiveWindowBrief(figures.activeWindowBrief, `${context}.activeWindowBrief`);
  }
  assertTemporalSeries(figures.temporalTrace, `${context}.temporalTrace`);
  recordArrayField(figures, "temporalRuntimeNarrative", context, [
    "windowId", "label", "turns", "jenaStatus", "jsnaStatus", "matrixTotals", "matrixFingerprints", "activeGPairs"
  ]).forEach((entry, index) => {
    const entryContext = `${context}.temporalRuntimeNarrative[${index}]`;
    assertStringFields(entry, entryContext, ["windowId", "label", "turns"]);
    enumField(entry, "jenaStatus", entryContext, ["computed", "skipped"]);
    enumField(entry, "jsnaStatus", entryContext, ["computed", "skipped"]);
    assertMatrixTotals(entry.matrixTotals, `${entryContext}.matrixTotals`);
    arrayField(entry, "matrixFingerprints", entryContext)
      .forEach((fingerprint, fingerprintIndex) => assertMatrixFingerprint(
        fingerprint,
        `${entryContext}.matrixFingerprints[${fingerprintIndex}]`
      ));
    numberField(entry, "activeGPairs", entryContext);
    for (const field of ["strongestSocialTie", "strongestConceptTie", "strongestBridgeTie"]) {
      if (entry[field] !== undefined) assertTemporalRuntimeEdgeHighlight(entry[field], `${entryContext}.${field}`);
    }
    if (entry.strongestGPair !== undefined) {
      assertTemporalRuntimeGPairHighlight(entry.strongestGPair, `${entryContext}.strongestGPair`);
    }
  });
  assertTemporalTransitions(figures, "temporalRuntimeTransitions", context);
  assertSocialCommunities(figures, "socialCommunities", context);
  recordArrayField(figures, "visualGrammar", context, [
    "id", "label", "visualEncoding", "dataMapping", "interpretationRole", "guardrail"
  ]).forEach((entry, index) => {
    const entryContext = `${context}.visualGrammar[${index}]`;
    enumField(entry, "id", entryContext, [
      "fusion-canvas-a1", "temporal-fusion-arc", "ena-space-canonical",
      "workspace-shell-c3-collapsed-switcher", "fusion-plane-orbit"
    ]);
    assertStringFields(entry, entryContext, ["label", "visualEncoding", "dataMapping", "interpretationRole", "guardrail"]);
  });
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
  const claimContext = `${context}.claimReadinessGate`;
  stringField(claim, "schemaVersion", claimContext);
  enumField(claim, "status", claimContext, ["ready", "exploratory"]);
  enumField(claim, "claimUse", claimContext, ["research-claim-ready", "exploratory-only"]);
  assertNumberFields(claim, claimContext, ["ready", "reviewNeeded"]);
  assertStringArrayEntries(claim, claimContext, ["blockers", "notes"]);
  stringField(claim, "guardrail", claimContext);
  recordArrayField(claim, "items", claimContext, [
    "id", "label", "status", "sourceItemIds", "summary", "guardrail"
  ]).forEach((item, index) => {
    const itemContext = `${claimContext}.items[${index}]`;
    enumField(item, "id", itemContext, [
      "data-contract", "runtime-alignment", "fusion-math", "evidence-ledger", "method-validation",
      "data-governance", "coding-reliability", "human-review"
    ]);
    assertStringFields(item, itemContext, ["label", "summary", "guardrail"]);
    enumField(item, "status", itemContext, ["ready", "review"]);
    stringArrayField(item, "sourceItemIds", itemContext);
  });
}

function assertReportEvidenceSnippet(value: unknown, context: string) {
  const snippet = record(value, context);
  requiredFields(snippet, context, ["id", "stage", "label", "text", "source", "sourceId", "sourceLabel"]);
  assertEvidenceSnippet(snippet, context);
  enumField(snippet, "source", context, [
    "social-edge", "concept-edge", "bridge-edge", "pair-contribution", "temporal-window"
  ]);
  assertStringFields(snippet, context, ["sourceId", "sourceLabel"]);
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
  assertSocialReport(report.socialReport, `${context}.socialReport`);
  assertEnaManifest(report.enaManifest, `${context}.enaManifest`);
  assertSnaManifest(report.snaManifest, `${context}.snaManifest`);
  assertSummary(report.summary, `${context}.summary`);
  assertMatrices(report.matrices, `${context}.matrices`);
  assertFigures(report.figures, `${context}.figures`);
  assertPairReport(report, "pairReport", context);
  assertValidation(report.validation, `${context}.validation`);
  assertModelCard(report.modelCard, `${context}.modelCard`);
  assertCommonReportArtifacts(report, context);
  assertDataGovernance(report.dataGovernance, `${context}.dataGovernance`);
  arrayField(report, "evidenceSnippets", context)
    .forEach((entry, index) => assertReportEvidenceSnippet(entry, `${context}.evidenceSnippets[${index}]`));
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
  assertStringFields(plan, context, ["schemaVersion", "title", "generatedAt"]);
  enumField(plan, "workspaceRoute", context, ["/workspace/sena"]);
  enumField(plan, "milestone", context, ["local-research-pilot"]);
  assertAnalysisWindow(plan, context);
  const runtimeIntegration = recordField(plan, "runtimeIntegration", context, ["sena", "jena", "jsna"]);
  const planSena = recordField(runtimeIntegration, "sena", `${context}.runtimeIntegration`, [
    "engine", "implementation", "matrixFormula"
  ]);
  assertStringFields(planSena, `${context}.runtimeIntegration.sena`, ["engine", "implementation", "matrixFormula"]);
  for (const field of ["jena", "jsna"]) {
    const runtime = recordField(runtimeIntegration, field, `${context}.runtimeIntegration`, RUNTIME_DESCRIPTOR_FIELDS);
    assertStringFields(runtime, `${context}.runtimeIntegration.${field}`, RUNTIME_DESCRIPTOR_FIELDS.slice(0, 6));
    stringArrayField(runtime, "apiSurface", `${context}.runtimeIntegration.${field}`);
  }
  recordArrayField(plan, "runtimeParityEvidence", context, [
    "id", "referenceRuntime", "fixturePath", "generatedBy", "status", "coverage", "sample", "interpretation"
  ]).forEach((entry, index) => {
    const entryContext = `${context}.runtimeParityEvidence[${index}]`;
    assertStringFields(entry, entryContext, ["id", "referenceRuntime", "fixturePath", "generatedBy", "interpretation"]);
    enumField(entry, "status", entryContext, ["covered", "development-only", "deferred"]);
    stringArrayField(entry, "coverage", entryContext);
    const sample = recordField(entry, "sample", entryContext);
    for (const [key, sampleValue] of Object.entries(sample)) {
      if (typeof sampleValue !== "number" || !Number.isFinite(sampleValue)) {
        throw new Error(`${entryContext}.sample.${key} must be a finite number.`);
      }
    }
  });
  const scope = recordField(plan, "scope", context, ["inScope", "outOfScope"]);
  assertStringArrayEntries(scope, `${context}.scope`, ["inScope", "outOfScope"]);
  const gate = recordField(plan, "currentGate", context, [
    "pilotReadinessStatus", "automatedVerification", "readyItems", "reviewItems"
  ]);
  enumField(gate, "pilotReadinessStatus", `${context}.currentGate`, ["ready", "needs-review"]);
  const automated = recordField(gate, "automatedVerification", `${context}.currentGate`, [
    "totalChecks", "passed", "review", "manualPending", "manualPassed", "manualFailed"
  ]);
  assertNumberFields(automated, `${context}.currentGate.automatedVerification`, [
    "totalChecks", "passed", "review", "manualPending", "manualPassed", "manualFailed"
  ]);
  stringArrayField(gate, "readyItems", `${context}.currentGate`);
  stringArrayField(gate, "reviewItems", `${context}.currentGate`);
  recordArrayField(plan, "workflowAnchors", context, ["id", "label", "anchor", "status", "exportArtifacts"])
    .forEach((entry, index) => {
      const entryContext = `${context}.workflowAnchors[${index}]`;
      assertStringFields(entry, entryContext, ["id", "label", "anchor"]);
      enumField(entry, "status", entryContext, ["ready", "review"]);
      stringArrayField(entry, "exportArtifacts", entryContext);
    });
  recordArrayField(plan, "phases", context, ["id", "label", "status", "scope", "deliverables", "evidence", "exitCriteria"])
    .forEach((entry, index) => {
      const entryContext = `${context}.phases[${index}]`;
      assertStringFields(entry, entryContext, ["id", "label", "scope"]);
      enumField(entry, "status", entryContext, ["complete", "active", "deferred"]);
      assertStringArrayEntries(entry, entryContext, ["deliverables", "evidence", "exitCriteria"]);
    });
  const candidate = recordField(plan, "deliveryCandidate", context, [
    "status", "horizon", "priority", "successCriteria", "weeklyPlan", "verificationCommands",
    "browserAcceptanceScenarios", "handoffPackage", "demoScript", "boundaries"
  ]);
  const candidateContext = `${context}.deliveryCandidate`;
  enumField(candidate, "status", candidateContext, ["delivery-candidate", "pre-candidate"]);
  enumField(candidate, "horizon", candidateContext, ["4-week-local-research-pilot"]);
  enumField(candidate, "priority", candidateContext, ["pilot-delivery"]);
  assertStringArrayEntries(candidate, candidateContext, [
    "successCriteria", "verificationCommands", "browserAcceptanceScenarios", "handoffPackage", "boundaries"
  ]);
  recordArrayField(candidate, "weeklyPlan", candidateContext, [
    "week", "label", "focus", "deliverables", "exitCriteria"
  ]).forEach((entry, index) => {
    const entryContext = `${candidateContext}.weeklyPlan[${index}]`;
    numberField(entry, "week", entryContext);
    assertStringFields(entry, entryContext, ["label", "focus"]);
    assertStringArrayEntries(entry, entryContext, ["deliverables", "exitCriteria"]);
  });
  recordArrayField(candidate, "demoScript", candidateContext, [
    "step", "label", "zh", "en", "anchor", "exportArtifacts"
  ]).forEach((entry, index) => {
    const entryContext = `${candidateContext}.demoScript[${index}]`;
    numberField(entry, "step", entryContext);
    assertStringFields(entry, entryContext, ["label", "zh", "en", "anchor"]);
    stringArrayField(entry, "exportArtifacts", entryContext);
  });
  const nextStage = recordField(plan, "nextStage", context, [
    "status", "horizon", "priority", "baseline", "phases", "releaseGate", "publicInterfacePolicy", "assumptions"
  ]);
  const nextContext = `${context}.nextStage`;
  enumField(nextStage, "status", nextContext, ["baseline-verified", "verification-required"]);
  enumField(nextStage, "horizon", nextContext, ["post-delivery-candidate"]);
  enumField(nextStage, "priority", nextContext, ["research-validation-before-platform"]);
  const baseline = recordField(nextStage, "baseline", nextContext, ["command", "expectedResult", "recordedAt", "evidence"]);
  enumField(baseline, "command", `${nextContext}.baseline`, ["npm run sena:pilot:verify"]);
  assertStringFields(baseline, `${nextContext}.baseline`, ["expectedResult", "recordedAt"]);
  stringArrayField(baseline, "evidence", `${nextContext}.baseline`);
  recordArrayField(nextStage, "phases", nextContext, [
    "id", "label", "status", "goal", "deliverables", "acceptanceCriteria"
  ]).forEach((entry, index) => {
    const entryContext = `${nextContext}.phases[${index}]`;
    enumField(entry, "id", entryContext, [
      "pilot-handoff-freeze", "researcher-walkthrough", "research-validation", "platform-decision-gate"
    ]);
    assertStringFields(entry, entryContext, ["label", "goal"]);
    enumField(entry, "status", entryContext, ["active", "next", "deferred", "gate"]);
    assertStringArrayEntries(entry, entryContext, ["deliverables", "acceptanceCriteria"]);
    if (entry.blockedUntil !== undefined) stringArrayField(entry, "blockedUntil", entryContext);
  });
  const releaseGate = recordField(nextStage, "releaseGate", nextContext, [
    "command", "browserAcceptanceScenarios", "dataScenarios", "regressionRules"
  ]);
  enumField(releaseGate, "command", `${nextContext}.releaseGate`, ["npm run sena:pilot:verify"]);
  assertStringArrayEntries(releaseGate, `${nextContext}.releaseGate`, [
    "browserAcceptanceScenarios", "dataScenarios", "regressionRules"
  ]);
  assertStringArrayEntries(nextStage, nextContext, ["publicInterfacePolicy", "assumptions"]);
  assertStringArrayEntries(plan, context, ["audience", "requiredArtifacts", "nextDecisions", "notes"]);
}

function assertDemoWalkthrough(value: unknown, context: string) {
  const walkthrough = record(value, context);
  requiredFields(walkthrough, context, [
    "schemaVersion", "title", "generatedAt", "workspaceRoute", "analysisWindow", "parameters", "summary", "steps", "notes"
  ]);
  assertStringFields(walkthrough, context, ["schemaVersion", "title", "generatedAt", "workspaceRoute"]);
  assertAnalysisWindow(walkthrough, context);
  assertParameters(walkthrough.parameters, `${context}.parameters`);
  const summary = recordField(walkthrough, "summary", context, [
    "totalSteps", "readySteps", "reviewSteps", "pilotReadinessStatus"
  ]);
  assertNumberFields(summary, `${context}.summary`, ["totalSteps", "readySteps", "reviewSteps"]);
  enumField(summary, "pilotReadinessStatus", `${context}.summary`, ["ready", "needs-review"]);
  recordArrayField(walkthrough, "steps", context, [
    "id", "label", "status", "anchor", "userAction", "readinessItemIds", "evidence", "exportArtifacts"
  ]).forEach((step, index) => {
    const stepContext = `${context}.steps[${index}]`;
    assertStringFields(step, stepContext, ["id", "label", "anchor", "userAction"]);
    enumField(step, "status", stepContext, ["ready", "review"]);
    assertStringArrayEntries(step, stepContext, ["readinessItemIds", "evidence", "exportArtifacts"]);
  });
  stringArrayField(walkthrough, "notes", context);
}

function assertDemoVerification(value: unknown, context: string) {
  const verification = record(value, context);
  requiredFields(verification, context, [
    "schemaVersion", "title", "generatedAt", "workspaceRoute", "analysisWindow", "parameters", "summary", "checks", "notes"
  ]);
  assertStringFields(verification, context, ["schemaVersion", "title", "generatedAt", "workspaceRoute"]);
  assertAnalysisWindow(verification, context);
  assertParameters(verification.parameters, `${context}.parameters`);
  const summary = recordField(verification, "summary", context, [
    "totalChecks", "automatedPass", "automatedReview", "manualPending", "manualPassed", "manualFailed",
    "requiredArtifacts", "pilotReadinessStatus"
  ]);
  assertNumberFields(summary, `${context}.summary`, [
    "totalChecks", "automatedPass", "automatedReview", "manualPending", "manualPassed", "manualFailed"
  ]);
  stringArrayField(summary, "requiredArtifacts", `${context}.summary`);
  enumField(summary, "pilotReadinessStatus", `${context}.summary`, ["ready", "needs-review"]);
  recordArrayField(verification, "checks", context, [
    "id", "label", "anchor", "status", "manualAction", "expectedOutcome", "observedEvidence", "requiredArtifacts", "manualReview"
  ]).forEach((check, index) => {
    const checkContext = `${context}.checks[${index}]`;
    assertStringFields(check, checkContext, ["id", "label", "anchor", "manualAction", "expectedOutcome"]);
    enumField(check, "status", checkContext, ["pass", "review"]);
    assertStringArrayEntries(check, checkContext, ["observedEvidence", "requiredArtifacts"]);
    const manual = recordField(check, "manualReview", checkContext, ["status", "reviewer", "verifiedAt", "notes"]);
    const manualContext = `${checkContext}.manualReview`;
    enumField(manual, "status", manualContext, ["pending", "passed", "failed"]);
    assertStringFields(manual, manualContext, ["reviewer", "verifiedAt", "notes"]);
  });
  stringArrayField(verification, "notes", context);
}

function assertEvidenceLedger(value: unknown, context: string) {
  const ledger = record(value, context);
  requiredFields(ledger, context, [
    "schemaVersion", "title", "generatedAt", "analysisWindow", "parameters", "runtimeProvenance",
    "interpretationGuardrails", "sourceCounts", "snippets", "humanReview"
  ]);
  assertStringFields(ledger, context, ["schemaVersion", "title", "generatedAt"]);
  assertAnalysisWindow(ledger, context);
  assertParameters(ledger.parameters, `${context}.parameters`);
  assertRuntimeProvenance(ledger.runtimeProvenance, `${context}.runtimeProvenance`);
  assertInterpretationGuardrails(ledger, context);
  const counts = record(ledger.sourceCounts, `${context}.sourceCounts`);
  requiredFields(counts, `${context}.sourceCounts`, [
    "social-edge", "concept-edge", "bridge-edge", "pair-contribution", "temporal-window"
  ]);
  assertNumberFields(counts, `${context}.sourceCounts`, [
    "social-edge", "concept-edge", "bridge-edge", "pair-contribution", "temporal-window"
  ]);
  arrayField(ledger, "snippets", context)
    .forEach((entry, index) => assertReportEvidenceSnippet(entry, `${context}.snippets[${index}]`));
  assertHumanReview(ledger.humanReview, `${context}.humanReview`);
}

function assertTemporalRuntimeTrace(value: unknown, context: string) {
  const trace = record(value, context);
  requiredFields(trace, context, [
    "schemaVersion", "generatedAt", "sourceDatasetCounts", "buildOptions", "temporalSettings", "runtimeProvenance",
    "windows", "transitions", "warnings"
  ]);
  assertStringFields(trace, context, ["schemaVersion", "generatedAt"]);
  assertDatasetCounts(trace.sourceDatasetCounts, `${context}.sourceDatasetCounts`);
  assertBuildOptions(trace.buildOptions, `${context}.buildOptions`);
  const settings = recordField(trace, "temporalSettings", context, [
    "mode", "movingWindowSize", "movingWindowStep", "turnWindowRadius"
  ]);
  enumField(settings, "mode", `${context}.temporalSettings`, ["stage", "moving-window", "turn-window"]);
  assertNumberFields(settings, `${context}.temporalSettings`, [
    "movingWindowSize", "movingWindowStep", "turnWindowRadius"
  ]);
  assertRuntimeProvenance(trace.runtimeProvenance, `${context}.runtimeProvenance`);
  recordArrayField(trace, "windows", context, ["window", "datasetCounts", "sena", "ena", "sna"])
    .forEach((entry, index) => {
      const entryContext = `${context}.windows[${index}]`;
      assertTemporalWindow(entry.window, `${entryContext}.window`);
      assertDatasetCounts(entry.datasetCounts, `${entryContext}.datasetCounts`);
      const sena = recordField(entry, "sena", entryContext, [
        "people", "concepts", "socialEdges", "conceptEdges", "bridgeEdges", "socialDensity", "activeGPairs",
        "fusionNodeCount", "matrixTotals", "matrixFingerprints", "warnings"
      ]);
      const senaContext = `${entryContext}.sena`;
      assertNumberFields(sena, senaContext, [
        "people", "concepts", "socialEdges", "conceptEdges", "bridgeEdges", "socialDensity", "activeGPairs",
        "fusionNodeCount"
      ]);
      assertMatrixTotals(sena.matrixTotals, `${senaContext}.matrixTotals`);
      arrayField(sena, "matrixFingerprints", senaContext)
        .forEach((fingerprint, fingerprintIndex) => assertMatrixFingerprint(
          fingerprint,
          `${senaContext}.matrixFingerprints[${fingerprintIndex}]`
        ));
      for (const field of ["strongestSocialTie", "strongestConceptTie", "strongestBridgeTie"]) {
        if (sena[field] !== undefined) assertTemporalRuntimeEdgeHighlight(sena[field], `${senaContext}.${field}`);
      }
      if (sena.strongestGPair !== undefined) {
        assertTemporalRuntimeGPairHighlight(sena.strongestGPair, `${senaContext}.strongestGPair`);
      }
      stringArrayField(sena, "warnings", senaContext);
      const ena = recordField(entry, "ena", entryContext, [
        "status", "datasetCounts", "dimensions", "variance", "pointCount", "nodePositionCount", "warnings"
      ]);
      const enaContext = `${entryContext}.ena`;
      enumField(ena, "status", enaContext, ["computed", "skipped"]);
      const enaCounts = recordField(ena, "datasetCounts", enaContext, ["rows", "units", "conversations", "codes"]);
      assertNumberFields(enaCounts, `${enaContext}.datasetCounts`, ["rows", "units", "conversations", "codes"]);
      stringArrayField(ena, "dimensions", enaContext);
      finiteNumberRecord(ena.variance, `${enaContext}.variance`);
      assertNumberFields(ena, enaContext, ["pointCount", "nodePositionCount"]);
      stringArrayField(ena, "warnings", enaContext);
      const sna = recordField(entry, "sna", entryContext, ["status", "datasetCounts", "warnings"]);
      const snaContext = `${entryContext}.sna`;
      enumField(sna, "status", snaContext, ["computed", "skipped"]);
      const snaCounts = recordField(sna, "datasetCounts", snaContext, [
        "people", "interactions", "weightedTies", "communities", "components"
      ]);
      assertNumberFields(snaCounts, `${snaContext}.datasetCounts`, [
        "people", "interactions", "weightedTies", "communities", "components"
      ]);
      if (sna.graph !== undefined) assertSocialGraph(sna.graph, `${snaContext}.graph`);
      stringArrayField(sna, "warnings", snaContext);
      if (entry.warnings !== undefined) stringArrayField(entry, "warnings", entryContext);
    });
  assertTemporalTransitions(trace, "transitions", context);
  stringArrayField(trace, "warnings", context);
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
  assertStringFields(sena, `${context}.runtimes.sena`, ["engine", "implementation", "matrixFormula"]);
  assertMatrices(sena.matrices, `${context}.runtimes.sena.matrices`);
  assertTemporalSeries(sena.temporal, `${context}.runtimes.sena.temporal`);
  assertPairReport(sena, "pairReport", `${context}.runtimes.sena`);
  assertOperatorDiagnostics(sena.operatorDiagnostics, `${context}.runtimes.sena.operatorDiagnostics`);
  const ena = recordField(runtimes, "ena", `${context}.runtimes`, [...RUNTIME_DESCRIPTOR_FIELDS, "manifest"]);
  assertStringFields(ena, `${context}.runtimes.ena`, RUNTIME_DESCRIPTOR_FIELDS.slice(0, 6));
  stringArrayField(ena, "apiSurface", `${context}.runtimes.ena`);
  assertEnaManifest(ena.manifest, `${context}.runtimes.ena.manifest`);
  const sna = recordField(runtimes, "sna", `${context}.runtimes`, [
    ...RUNTIME_DESCRIPTOR_FIELDS, "manifest", "socialReport", "socialMatrix"
  ]);
  assertStringFields(sna, `${context}.runtimes.sna`, RUNTIME_DESCRIPTOR_FIELDS.slice(0, 6));
  stringArrayField(sna, "apiSurface", `${context}.runtimes.sna`);
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
  const pageContext = `${context}.productionPageContract`;
  assertStringFields(page, pageContext, ["schemaVersion", "title", "description"]);
  enumField(page, "workspaceRoute", pageContext, ["/workspace/sena"]);
  recordArrayField(page, "sections", pageContext, ["id", "label", "requiredText"])
    .forEach((section, index) => {
      const sectionContext = `${pageContext}.sections[${index}]`;
      assertStringFields(section, sectionContext, ["id", "label"]);
      stringArrayField(section, "requiredText", sectionContext);
    });
  recordArrayField(page, "visualChecks", pageContext, ["id", "label", "requiredText", "expectedOutcome"])
    .forEach((check, index) => assertStringFields(
      check,
      `${pageContext}.visualChecks[${index}]`,
      ["id", "label", "requiredText", "expectedOutcome"]
    ));
  stringArrayField(page, "notes", pageContext);
  assertTemporalRuntimeTrace(runtimeBundle.temporalRuntimeTrace, `${context}.temporalRuntimeTrace`);
  assertEvidenceLedger(runtimeBundle.evidenceLedger, `${context}.evidenceLedger`);
  recordArrayField(runtimeBundle, "artifactEvidence", context, [
    "filename", "schemaVersion", "runtimeRole", "sourceRuntime", "downloadControl", "status", "matrixCoverage",
    "evidenceCoverage", "handoffChecks"
  ]).forEach((artifact, index) => {
    const artifactContext = `${context}.artifactEvidence[${index}]`;
    assertStringFields(artifact, artifactContext, [
      "filename", "schemaVersion", "sourceRuntime", "downloadControl"
    ]);
    enumField(artifact, "runtimeRole", artifactContext, [
      "sena-model", "jena-epistemic", "jsna-social", "sena-fusion", "review-handoff"
    ]);
    enumField(artifact, "status", artifactContext, ["ready", "review"]);
    assertStringArrayEntries(artifact, artifactContext, ["matrixCoverage", "evidenceCoverage", "handoffChecks"]);
  });
  assertSenaReportHolderStructure(runtimeBundle.report, `${context}.report`);
  return runtimeBundle;
}
