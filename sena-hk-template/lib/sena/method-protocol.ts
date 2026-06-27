import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { buildSenaFusionMathAudit } from "./fusion-math";
import { buildSenaEnaManifest } from "./ena-manifest";
import { buildSenaRuntimeConsistencyAudit } from "./runtime-consistency";
import { buildSenaSnaManifest } from "./sna-manifest";
import { senaRuntimeProvenance } from "./runtime-constants";
import { senaVisualGrammar } from "./visual-grammar";
import type { SenaFusionMathAudit, SenaMethodProtocol, SenaMethodProtocolLayer, SenaMethodProtocolRuntimeHandoff, SenaModel, SenaRuntimeConsistencyAudit, SenaTemporalWindow } from "./types";

export type SenaMethodProtocolOptions = {
  title?: string;
  generatedAt?: string;
  activeTemporalWindow?: SenaTemporalWindow | null;
};

function datasetCounts(model: SenaModel) {
  return {
    people: model.dataset.people.length,
    interactions: model.dataset.interactions.length,
    utterances: model.dataset.utterances.length,
    codedSegments: model.dataset.coded_segments.length,
    codes: model.dataset.codebook.length
  };
}

function matrixShape(rows: number, columns: number) {
  return `${rows}x${columns}`;
}

function layers(model: SenaModel): SenaMethodProtocolLayer[] {
  const people = model.people.length;
  const codes = model.codes.length;
  const fusion = people + codes;

  return [
    {
      id: "S",
      label: "Social layer",
      source: "interactions",
      construction: "Weighted person-person ties are aggregated from interaction records and normalized according to the selected build option.",
      matrixShape: matrixShape(model.matrices.S.labels.length, model.matrices.S.labels.length),
      interpretationRole: "Represents observed collaboration/social contact structure through local jSNA social-network metrics.",
      guardrail: "SNA centrality and density describe observed ties; they do not establish epistemic quality or causal influence."
    },
    {
      id: "W",
      label: "Epistemic layer",
      source: "coded_segments",
      construction: "Code-code co-occurrence is counted within stanza/window coded segments and aligned with local jENA manifest outputs.",
      matrixShape: matrixShape(model.matrices.W.labels.length, model.matrices.W.labels.length),
      interpretationRole: "Represents epistemic-network links among discourse codes.",
      guardrail: "Code proximity should be interpreted with coding reliability, context, and jENA manifest settings."
    },
    {
      id: "B",
      label: "Bridge layer",
      source: "coded_segments + people",
      construction: "Person-code contribution weights connect actors to epistemic moves they produced in coded evidence.",
      matrixShape: matrixShape(model.matrices.B.rowLabels.length, model.matrices.B.columnLabels.length),
      interpretationRole: "Connects social actors and epistemic codes in the typed heterogeneous graph.",
      guardrail: "Bridge weights are contribution indicators, not measures of individual learning or causal impact."
    },
    {
      id: "G",
      label: "Person-code-pair explanation layer",
      source: "coded_segments",
      construction: "Person by unordered code-pair contributions explain who supports ENA-style code-code links.",
      matrixShape: matrixShape(model.matrices.G.rowLabels.length, model.matrices.G.columnLabels.length),
      interpretationRole: "Provides evidence-linked explanation for W edges and pair reports; it is not a direct A_fusion block.",
      guardrail: "G should be reported as interpretive evidence for pair contributions, not as an additional adjacency block inside A_fusion."
    },
    {
      id: "A_fusion",
      label: "Weighted SENA fusion matrix",
      source: "S, W, B",
      construction: "A_fusion = [alpha*S gamma*B; gamma*B' beta*W], using normalized S, W, and B blocks.",
      matrixShape: matrixShape(fusion, fusion),
      interpretationRole: "Combines social, epistemic, and bridge layers for exploratory typed graph inspection and export.",
      guardrail: "A_fusion is a normalized typed adjacency model; it is not a causal model or inferential test by itself."
    }
  ];
}

function runtimeAuditItem(audit: SenaRuntimeConsistencyAudit, id: string) {
  return audit.items.find((item) => item.id === id);
}

function runtimeHandoffs(
  runtimeConsistencyAudit: SenaRuntimeConsistencyAudit,
  fusionMathAudit: SenaFusionMathAudit
): SenaMethodProtocolRuntimeHandoff[] {
  const jenaConceptMatrix = runtimeAuditItem(runtimeConsistencyAudit, "jena-concept-matrix");
  const jsnaSocialMatrix = runtimeAuditItem(runtimeConsistencyAudit, "jsna-social-matrix");
  const fusionMatrix = fusionMathAudit.matrixFingerprints.find((fingerprint) => fingerprint.id === "A_fusion");

  return [
    {
      id: "jena-concept-matrix",
      label: "jENA concept handoff to W",
      status: jenaConceptMatrix?.status ?? "review",
      source: "jENA adjacencyKey + connectionCounts",
      target: "SENA W concept matrix",
      summary: jenaConceptMatrix?.actual ?? "missing jENA concept-pair runtime audit",
      evidence: [
        jenaConceptMatrix?.expected ?? "jENA concept-pair audit missing",
        ...((jenaConceptMatrix?.detail ?? []).slice(0, 5))
      ]
    },
    {
      id: "jsna-social-matrix",
      label: "jSNA social handoff to S",
      status: jsnaSocialMatrix?.status ?? "review",
      source: "jSNA socialMatrix + actor metrics",
      target: "SENA S social matrix",
      summary: jsnaSocialMatrix?.actual ?? "missing jSNA social matrix runtime audit",
      evidence: [
        jsnaSocialMatrix?.expected ?? "jSNA social-matrix audit missing",
        ...((jsnaSocialMatrix?.detail ?? []).slice(0, 5))
      ]
    },
    {
      id: "fusion-math",
      label: "S/W/B to A_fusion math audit",
      status: fusionMathAudit.status === "verified" ? "pass" : "review",
      source: "S, W, B normalized blocks",
      target: "A_fusion weighted block matrix",
      summary: `${fusionMathAudit.passed} formula checks passed; ${fusionMathAudit.reviewNeeded} need review; A_fusion=${fusionMatrix?.checksum ?? "missing"}`,
      evidence: [
        `schema=${fusionMathAudit.schemaVersion}`,
        `fingerprints=${fusionMathAudit.matrixFingerprints.map((fingerprint) => fingerprint.id).join("|")}`,
        `A_fusionChecksum=${fusionMatrix?.checksum ?? "missing"}`
      ]
    }
  ];
}

export function buildSenaMethodProtocol(model: SenaModel, options: SenaMethodProtocolOptions = {}): SenaMethodProtocol {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const activeTemporalWindow = options.activeTemporalWindow ?? null;
  const fusionMathAudit = buildSenaFusionMathAudit(model);
  const enaManifest = buildSenaEnaManifest(model.dataset);
  const snaManifest = buildSenaSnaManifest(model);
  const runtimeConsistencyAudit = buildSenaRuntimeConsistencyAudit({
    model,
    enaManifest,
    snaManifest
  });

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.methodProtocol,
    title: options.title?.trim() || "SENA Method Protocol",
    generatedAt,
    analysisWindow: activeTemporalWindow,
    dataContract: {
      requiredTables: ["people", "interactions", "utterances", "coded_segments", "codebook"],
      datasetCounts: datasetCounts(model),
      unitOfAnalysis: "Coded utterance segments nested in unit/stanza/stage windows, linked to people and interaction evidence."
    },
    mathematicalFrame: {
      graphType: "normalized-typed-heterogeneous-adjacency",
      formula: senaRuntimeProvenance.senaModel.matrixFormula,
      nodeOrder: "A_fusion orders people first, followed by code nodes.",
      layers: layers(model)
    },
    visualGrammar: senaVisualGrammar,
    parameters: {
      buildOptions: model.options,
      temporalWindows: model.temporal.windows.length,
      activeTemporalWindow
    },
    runtimeIntegration: {
      sena: senaRuntimeProvenance.senaModel,
      jena: senaRuntimeProvenance.enaRuntime,
      jsna: senaRuntimeProvenance.snaRuntime
    },
    runtimeParityEvidence: senaRuntimeProvenance.parityEvidence,
    auditSummary: {
      fusionMath: {
        schemaVersion: fusionMathAudit.schemaVersion,
        status: fusionMathAudit.status,
        passed: fusionMathAudit.passed,
        reviewNeeded: fusionMathAudit.reviewNeeded
      },
      runtimeConsistency: {
        schemaVersion: runtimeConsistencyAudit.schemaVersion,
        status: runtimeConsistencyAudit.status,
        passed: runtimeConsistencyAudit.passed,
        reviewNeeded: runtimeConsistencyAudit.reviewNeeded
      }
    },
    runtimeHandoffs: runtimeHandoffs(runtimeConsistencyAudit, fusionMathAudit),
    requiredCompanionArtifacts: [
      "sena-pilot-package-manifest.json",
      "sena-data-contract-audit.json",
      "sena-fusion-math-audit.json",
      "sena-metric-provenance.json",
      "sena-coding-reliability-gate.json",
      "sena-claim-readiness-gate.json",
      "sena-runtime-bundle.json",
      "sena-evidence-ledger.json",
      "sena-visual-grammar.json",
      "sena-production-page-contract.json",
      "sena-review-packet.json"
    ],
    interpretationGuardrails: [
      "Report S, W, B, G, and A_fusion with weights, normalization, temporal mode, and runtime provenance.",
      "Treat Fusion Canvas and Temporal Fusion Arc encodings as explanatory visual grammars; cite their visual roles alongside matrix and evidence exports.",
      "Treat SENA outputs as observed association patterns in coded collaboration data, not causal or assessment claims.",
      "Inspect original evidence snippets and human-review fields before making substantive interpretations.",
      "Use the standalone metric provenance artifact to separate direct jSNA outputs from SENA-implemented and composite metrics before interpreting centrality, bridge, or fusion evidence.",
      "Use the pilot package manifest assetIntegrity fingerprints to verify bundled sample/template files during local handoff.",
      "Use jENA/jSNA local dependency specs as part of the reproducibility record."
    ],
    notes: [
      "This method protocol is generated from the active SENA model and local JavaScript runtimes.",
      "It is intended to accompany reports, review packets, and pilot walkthroughs for method transparency."
    ]
  };
}
