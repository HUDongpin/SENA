import type {
  SenaEnaManifest,
  SenaModel,
  SenaRuntimeConsistencyAudit,
  SenaRuntimeConsistencyItem,
  SenaSnaManifest
} from "./types";
import { buildSenaJsnaSocialTieHandoffRows } from "./jsna-handoff";
import { jenaRuntimeDependencySpec, senaRuntimeProvenance, snaRuntimeDependencySpec } from "./runtime-constants";

function uniqueCount(values: string[]) {
  return new Set(values).size;
}

function sameStrings(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameNumbers(left: number[][], right: number[][], epsilon = 1e-12) {
  return left.length === right.length &&
    left.every((row, rowIndex) => (
      row.length === (right[rowIndex]?.length ?? -1) &&
      row.every((value, columnIndex) => Math.abs(value - (right[rowIndex]?.[columnIndex] ?? Number.NaN)) <= epsilon)
    ));
}

function pairKey(left: string, right: string) {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function setEquals(left: Set<string>, right: Set<string>) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function numericRowValue(row: Record<string, string | number | boolean | null>, column: string) {
  const value = row[column];
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value === "string") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : Number.NaN;
  }
  return Number.NaN;
}

function positiveConceptPairs(model: SenaModel) {
  const pairs = new Set<string>();
  const codes = model.dataset.codebook.map((code) => code.id);
  for (let row = 0; row < model.matrices.W.raw.length; row += 1) {
    for (let column = row + 1; column < (model.matrices.W.raw[row]?.length ?? 0); column += 1) {
      if ((model.matrices.W.raw[row]?.[column] ?? 0) > 0) {
        pairs.add(pairKey(codes[row] ?? String(row), codes[column] ?? String(column)));
      }
    }
  }
  return pairs;
}

function buildJenaConceptPairAudit(model: SenaModel, enaManifest: SenaEnaManifest) {
  const codeIds = model.dataset.codebook.map((code) => code.id);
  const expectedPairs = new Set<string>();
  for (let row = 0; row < codeIds.length; row += 1) {
    for (let column = row + 1; column < codeIds.length; column += 1) {
      expectedPairs.add(pairKey(codeIds[row] ?? String(row), codeIds[column] ?? String(column)));
    }
  }

  const adjacencyEntries = enaManifest.outputs?.adjacencyKey ?? [];
  const connectionCounts = enaManifest.outputs?.connectionCounts ?? [];
  const adjacencyPairs = new Set(adjacencyEntries.map((entry) => pairKey(entry.source, entry.target)));
  const finiteColumns = adjacencyEntries.every((entry) => connectionCounts.every((row) => Number.isFinite(numericRowValue(row, entry.name))));
  const positiveJenaPairs = new Set<string>();

  for (const entry of adjacencyEntries) {
    const total = connectionCounts.reduce((sum, row) => {
      const value = numericRowValue(row, entry.name);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
    if (total > 0) positiveJenaPairs.add(pairKey(entry.source, entry.target));
  }

  const positiveSenaPairs = positiveConceptPairs(model);
  const overlap = [...positiveJenaPairs].filter((key) => positiveSenaPairs.has(key));
  const missingPositiveJenaPairs = [...positiveJenaPairs].filter((key) => !positiveSenaPairs.has(key));
  const senaOnlyPositivePairs = [...positiveSenaPairs].filter((key) => !positiveJenaPairs.has(key));
  const allPositiveJenaPairsMapToSenaW = [...positiveJenaPairs].every((key) => positiveSenaPairs.has(key));
  const hasRequiredSignalOverlap = positiveSenaPairs.size === 0 || overlap.length > 0;
  const computed = enaManifest.status === "computed" && Boolean(enaManifest.outputs);

  return {
    passed: computed &&
      setEquals(adjacencyPairs, expectedPairs) &&
      finiteColumns &&
      allPositiveJenaPairsMapToSenaW &&
      hasRequiredSignalOverlap,
    expected: `jENA adjacencyKey covers ${expectedPairs.size} code pairs; positive jENA connectionCounts map into SENA W concept pairs`,
    actual: computed
      ? `adjacencyPairs=${adjacencyPairs.size}, positiveJenaPairs=${positiveJenaPairs.size}, positiveSenaWPairs=${positiveSenaPairs.size}, overlap=${overlap.length}`
      : `jENA status=${enaManifest.status}; outputs=missing`,
    detail: [
      "source=jENA adjacencyKey + connectionCounts",
      "target=SENA W raw concept co-occurrence matrix",
      "semanticNote=jENA uses moving-window ENA connection weights, so the audit checks coverage and signal overlap rather than forcing W-weight equality.",
      `finiteColumns=${finiteColumns}`,
      `allPositiveJenaPairsMapToSenaW=${allPositiveJenaPairsMapToSenaW}`,
      `signalOverlap=${overlap.slice(0, 5).join(", ") || "none"}`,
      `missingPositiveJenaPairs=${missingPositiveJenaPairs.slice(0, 5).join(", ") || "none"}`,
      `senaOnlyWPositivePairs=${senaOnlyPositivePairs.slice(0, 5).join(", ") || "none"}`
    ],
    metrics: {
      expectedPairs: expectedPairs.size,
      adjacencyPairs: adjacencyPairs.size,
      positiveJenaPairs: positiveJenaPairs.size,
      positiveSenaWPairs: positiveSenaPairs.size,
      overlapPairs: overlap.length,
      finiteColumns,
      allPositiveJenaPairsMapToSenaW,
      signalOverlap: hasRequiredSignalOverlap,
      overlapPreview: overlap.slice(0, 8),
      missingPositiveJenaPairPreview: missingPositiveJenaPairs.slice(0, 8),
      senaOnlyWPairPreview: senaOnlyPositivePairs.slice(0, 8)
    }
  };
}

function item(
  id: string,
  label: string,
  passed: boolean,
  expected: string,
  actual: string,
  detail: string[],
  metrics?: SenaRuntimeConsistencyItem["metrics"]
): SenaRuntimeConsistencyItem {
  return {
    id,
    label,
    status: passed ? "pass" : "review",
    expected,
    actual,
    detail,
    ...(metrics ? { metrics } : {})
  };
}

export function buildSenaRuntimeConsistencyAudit({
  model,
  enaManifest,
  snaManifest
}: {
  model: SenaModel;
  enaManifest: SenaEnaManifest;
  snaManifest: SenaSnaManifest;
}): SenaRuntimeConsistencyAudit {
  const codedSegments = model.dataset.coded_segments;
  const expectedEnaUnits = uniqueCount(codedSegments.map((segment) => segment.personId));
  const expectedEnaConversations = uniqueCount(codedSegments.map((segment) => `${segment.unitId}::${segment.stanzaId}`));
  const expectedCodeColumns = model.dataset.codebook.map((code) => code.id);
  const jenaComputedIfPossible = model.dataset.codebook.length >= 2 && codedSegments.length > 0;
  const jenaConceptPairAudit = buildJenaConceptPairAudit(model, enaManifest);
  const jenaRenaParity = senaRuntimeProvenance.parityEvidence.find((evidence) => evidence.id === "jena-rena-sample-parity");
  const jsnaRSnaParity = senaRuntimeProvenance.parityEvidence.find((evidence) => evidence.id === "jsna-r-sna-social-parity");
  const snaGraph = snaManifest.outputs?.graph;
  const snaMatrix = snaManifest.outputs?.socialMatrix;
  const jsnaSocialTieHandoffRows = buildSenaJsnaSocialTieHandoffRows(model, snaManifest);
  const jsnaSocialTieRows = jsnaSocialTieHandoffRows.length;
  const jsnaAlignedTieRows = jsnaSocialTieHandoffRows.filter((row) => row.matrixAligned).length;
  const jsnaPositiveTieRows = jsnaSocialTieHandoffRows.filter((row) => row.edgeWeight > 0).length;
  const jsnaEvidenceTieRows = jsnaSocialTieHandoffRows.filter((row) => row.evidencePreview.length > 0).length;
  const jsnaSocialTiePreview = jsnaSocialTieHandoffRows.slice(0, 8).map((row) => row.id);
  const jsnaLabelsAligned = Boolean(snaMatrix) && sameStrings(snaMatrix?.labels ?? [], model.matrices.S.labels);
  const jsnaRawAligned = Boolean(snaMatrix) && sameNumbers(snaMatrix?.raw ?? [], model.matrices.S.raw);
  const jsnaNormalizedAligned = Boolean(snaMatrix) && sameNumbers(snaMatrix?.normalized ?? [], model.matrices.S.normalized);
  const jsnaSocialTieHandoffAligned = jsnaSocialTieRows === jsnaAlignedTieRows;

  const items = [
    item(
      "jena-engine",
      "jENA engine identity",
      enaManifest.engine === "jena-js" && enaManifest.schemaVersion === "sena-ena-manifest/v1",
      "sena-ena-manifest/v1 from jena-js",
      `${enaManifest.schemaVersion} from ${enaManifest.engine}`,
      [`status=${enaManifest.status}`, `version=${enaManifest.engineVersion}`]
    ),
    item(
      "jena-local-dependency",
      "jENA local dependency provenance",
      jenaRuntimeDependencySpec === "file:vendor/jena-js" &&
        senaRuntimeProvenance.enaRuntime.dependencySpec === jenaRuntimeDependencySpec &&
        enaManifest.engineVersion === senaRuntimeProvenance.enaRuntime.version,
      `file:vendor/jena-js at ${senaRuntimeProvenance.enaRuntime.packagePath}`,
      `${jenaRuntimeDependencySpec}; manifestVersion=${enaManifest.engineVersion}; runtimeVersion=${senaRuntimeProvenance.enaRuntime.version}`,
      [
        `packageName=${senaRuntimeProvenance.enaRuntime.packageName}`,
        `runtimeRole=${senaRuntimeProvenance.enaRuntime.runtimeRole}`
      ]
    ),
    item(
      "jena-api-surface",
      "jENA JavaScript API surface",
      sameStrings(senaRuntimeProvenance.enaRuntime.apiSurface, ["ena()"]),
      "jena-js ena() is the ENA runtime API recorded for report manifests",
      senaRuntimeProvenance.enaRuntime.apiSurface.join(", ") || "none",
      [
        "import=ena from jena-js",
        "source=lib/sena/ena-manifest.ts",
        `runtimeRole=${senaRuntimeProvenance.enaRuntime.runtimeRole}`
      ]
    ),
    item(
      "jena-rena-parity",
      "jENA rENA fixture parity",
      Boolean(jenaRenaParity) &&
        jenaRenaParity?.referenceRuntime === "rENA" &&
        jenaRenaParity?.status === "covered" &&
        jenaRenaParity.coverage.includes("lineWeights") &&
        jenaRenaParity.coverage.includes("connectionCounts") &&
        jenaRenaParity.coverage.includes("unitPoints") &&
        jenaRenaParity.coverage.includes("nodePositions") &&
        (jenaRenaParity.sample.units ?? 0) > 0 &&
        (jenaRenaParity.sample.codes ?? 0) > 0,
      "Bundled rENA fixture parity covers line weights, connection counts, variance, unit points, and node positions for jENA development-time validation",
      jenaRenaParity
        ? `fixture=${jenaRenaParity.fixturePath}; units=${jenaRenaParity.sample.units ?? "NA"}; codes=${jenaRenaParity.sample.codes ?? "NA"}; coverage=${jenaRenaParity.coverage.join("|")}`
        : "missing jENA rENA parity fixture evidence",
      jenaRenaParity
        ? [
          `generatedBy=${jenaRenaParity.generatedBy}`,
          `referenceRuntime=${jenaRenaParity.referenceRuntime}`,
          `lineWeightRows=${jenaRenaParity.sample.lineWeightRows ?? "NA"}`,
          `connectionCountRows=${jenaRenaParity.sample.connectionCountRows ?? "NA"}`,
          jenaRenaParity.interpretation
        ]
        : []
    ),
    item(
      "jena-dataset-counts",
      "jENA dataset counts",
      enaManifest.datasetCounts.rows === codedSegments.length &&
        enaManifest.datasetCounts.units === expectedEnaUnits &&
        enaManifest.datasetCounts.conversations === expectedEnaConversations &&
        enaManifest.datasetCounts.codes === model.dataset.codebook.length,
      `rows=${codedSegments.length}, units=${expectedEnaUnits}, conversations=${expectedEnaConversations}, codes=${model.dataset.codebook.length}`,
      `rows=${enaManifest.datasetCounts.rows}, units=${enaManifest.datasetCounts.units}, conversations=${enaManifest.datasetCounts.conversations}, codes=${enaManifest.datasetCounts.codes}`,
      ["source=coded_segments", `computedIfPossible=${jenaComputedIfPossible}`]
    ),
    item(
      "jena-code-columns",
      "jENA code columns",
      sameStrings(enaManifest.source.codeColumns, expectedCodeColumns),
      expectedCodeColumns.join(", ") || "none",
      enaManifest.source.codeColumns.join(", ") || "none",
      [`activeCodeValue=${enaManifest.source.activeCodeValue}`]
    ),
    item(
      "jena-status",
      "jENA status",
      jenaComputedIfPossible ? enaManifest.status === "computed" : enaManifest.status === "skipped",
      jenaComputedIfPossible ? "computed" : "skipped",
      enaManifest.status,
      enaManifest.warnings.slice(0, 4)
    ),
    item(
      "jena-concept-matrix",
      "jENA concept-pair handoff to SENA W",
      jenaConceptPairAudit.passed,
      jenaConceptPairAudit.expected,
      jenaConceptPairAudit.actual,
      jenaConceptPairAudit.detail,
      jenaConceptPairAudit.metrics
    ),
    item(
      "jsna-engine",
      "jSNA engine identity",
      snaManifest.engine === "sna.js" &&
        snaManifest.engineAlias === "jSNA" &&
        snaManifest.schemaVersion === "sena-jsna-manifest/v1",
      "sena-jsna-manifest/v1 from jSNA/sna.js",
      `${snaManifest.schemaVersion} from ${snaManifest.engineAlias}/${snaManifest.engine}`,
      [`status=${snaManifest.status}`, `version=${snaManifest.engineVersion}`]
    ),
    item(
      "jsna-local-dependency",
      "jSNA local dependency provenance",
      snaRuntimeDependencySpec === "file:vendor/sna-js" &&
        senaRuntimeProvenance.snaRuntime.dependencySpec === snaRuntimeDependencySpec &&
        snaManifest.engineVersion === senaRuntimeProvenance.snaRuntime.version,
      `file:vendor/sna-js at ${senaRuntimeProvenance.snaRuntime.packagePath}`,
      `${snaRuntimeDependencySpec}; manifestVersion=${snaManifest.engineVersion}; runtimeVersion=${senaRuntimeProvenance.snaRuntime.version}`,
      [
        `packageName=${senaRuntimeProvenance.snaRuntime.packageName}`,
        `runtimeRole=${senaRuntimeProvenance.snaRuntime.runtimeRole}`
      ]
    ),
    item(
      "jsna-api-surface",
      "jSNA JavaScript API surface",
      sameStrings(senaRuntimeProvenance.snaRuntime.apiSurface, [
        "gden()",
        "nties()",
        "degree()",
        "betweenness()",
        "closeness()",
        "reachability()",
        "averagePathLength()",
        "labelPropagation()",
        "components()",
        "isConnected()",
        "geodist()",
        "grecip()"
      ]),
      "sna.js graph metric APIs are recorded for the social runtime layer",
      senaRuntimeProvenance.snaRuntime.apiSurface.join(", ") || "none",
      [
        "runtimeAPIs=averagePathLength|betweenness|closeness|components|degree|gden|geodist|grecip|isConnected|labelPropagation|nties|reachability from sna.js",
        "source=lib/sena/model.ts",
        `runtimeRole=${senaRuntimeProvenance.snaRuntime.runtimeRole}`
      ]
    ),
    item(
      "jsna-r-sna-parity",
      "jSNA R sna fixture parity",
      Boolean(jsnaRSnaParity) &&
        jsnaRSnaParity?.referenceRuntime === "R sna + igraph" &&
        jsnaRSnaParity?.status === "covered" &&
        jsnaRSnaParity.coverage.includes("degree") &&
        jsnaRSnaParity.coverage.includes("betweenness") &&
        jsnaRSnaParity.coverage.includes("reciprocity") &&
        jsnaRSnaParity.coverage.includes("averagePathLength") &&
        jsnaRSnaParity.coverage.includes("communities") &&
        (jsnaRSnaParity.sample.graphFamilies ?? 0) > 0,
      "Bundled R sna and igraph fixtures cover social degree, path, betweenness, reciprocity, component, and community metrics for jSNA development-time validation",
      jsnaRSnaParity
        ? `fixture=${jsnaRSnaParity.fixturePath}; graphFamilies=${jsnaRSnaParity.sample.graphFamilies ?? "NA"}; coverage=${jsnaRSnaParity.coverage.join("|")}`
        : "missing jSNA R sna parity fixture evidence",
      jsnaRSnaParity
        ? [
          `generatedBy=${jsnaRSnaParity.generatedBy}`,
          `referenceRuntime=${jsnaRSnaParity.referenceRuntime}`,
          jsnaRSnaParity.interpretation
        ]
        : []
    ),
    item(
      "jsna-dataset-counts",
      "jSNA dataset counts",
      snaManifest.datasetCounts.people === model.dataset.people.length &&
        snaManifest.datasetCounts.interactions === model.dataset.interactions.length &&
        snaManifest.datasetCounts.weightedTies === model.socialReport.graph.tieCount &&
        snaManifest.datasetCounts.communities === model.socialReport.graph.communityCount &&
        snaManifest.datasetCounts.components === model.socialReport.graph.componentCount,
      `people=${model.dataset.people.length}, interactions=${model.dataset.interactions.length}, ties=${model.socialReport.graph.tieCount}, communities=${model.socialReport.graph.communityCount}, components=${model.socialReport.graph.componentCount}`,
      `people=${snaManifest.datasetCounts.people}, interactions=${snaManifest.datasetCounts.interactions}, ties=${snaManifest.datasetCounts.weightedTies}, communities=${snaManifest.datasetCounts.communities}, components=${snaManifest.datasetCounts.components}`,
      [`graphMode=${snaManifest.source.graphMode}`, `undirectedSocial=${snaManifest.source.undirectedSocial}`]
    ),
    item(
      "jsna-graph",
      "jSNA graph metrics",
      Boolean(snaGraph) &&
        snaGraph?.density === model.socialReport.graph.density &&
        snaGraph?.tieCount === model.socialReport.graph.tieCount &&
        snaGraph?.averagePathLength === model.socialReport.graph.averagePathLength &&
        snaGraph?.communityCount === model.socialReport.graph.communityCount,
      `density=${model.socialReport.graph.density}, ties=${model.socialReport.graph.tieCount}, avgPath=${model.socialReport.graph.averagePathLength}, communities=${model.socialReport.graph.communityCount}`,
      snaGraph
        ? `density=${snaGraph.density}, ties=${snaGraph.tieCount}, avgPath=${snaGraph.averagePathLength}, communities=${snaGraph.communityCount}`
        : "missing jSNA graph outputs",
      [`socialReport.engine=${model.socialReport.graph.engine}`]
    ),
    item(
      "jsna-social-matrix",
      "jSNA social matrix",
      Boolean(snaMatrix) &&
        jsnaLabelsAligned &&
        jsnaRawAligned &&
        jsnaNormalizedAligned &&
        jsnaSocialTieHandoffAligned,
      `${model.matrices.S.labels.length} labels, ${model.matrices.S.raw.length}x${model.matrices.S.raw[0]?.length ?? 0} S matrix, and social-tie handoff rows aligned to S`,
      snaMatrix
        ? `${snaMatrix.labels.length} labels, ${snaMatrix.raw.length}x${snaMatrix.raw[0]?.length ?? 0} S matrix, socialTieRows=${jsnaSocialTieRows}, alignedTieRows=${jsnaAlignedTieRows}, evidenceTieRows=${jsnaEvidenceTieRows}`
        : "missing jSNA social matrix",
      [
        `normalization=${model.options.normalization}`,
        `labelsAligned=${jsnaLabelsAligned}`,
        `rawAligned=${jsnaRawAligned}`,
        `normalizedAligned=${jsnaNormalizedAligned}`,
        `socialTieHandoffAligned=${jsnaSocialTieHandoffAligned}`,
        `socialTiePreview=${jsnaSocialTiePreview.join(", ") || "none"}`
      ],
      {
        labels: model.matrices.S.labels.length,
        rows: model.matrices.S.raw.length,
        columns: model.matrices.S.raw[0]?.length ?? 0,
        socialTieRows: jsnaSocialTieRows,
        alignedTieRows: jsnaAlignedTieRows,
        positiveTieRows: jsnaPositiveTieRows,
        evidenceTieRows: jsnaEvidenceTieRows,
        labelsAligned: jsnaLabelsAligned,
        rawAligned: jsnaRawAligned,
        normalizedAligned: jsnaNormalizedAligned,
        socialTieHandoffAligned: jsnaSocialTieHandoffAligned,
        socialTiePreview: jsnaSocialTiePreview
      }
    )
  ];
  const passed = items.filter((candidate) => candidate.status === "pass").length;
  const reviewNeeded = items.length - passed;

  return {
    schemaVersion: "sena-runtime-consistency/v1",
    status: reviewNeeded === 0 ? "consistent" : "needs-review",
    passed,
    reviewNeeded,
    items,
    notes: [
      "Runtime consistency checks compare local jENA/jSNA artifacts with the SENA model built for the same analysis dataset.",
      "A passing audit confirms artifact alignment, not substantive validity or causal interpretation."
    ]
  };
}
