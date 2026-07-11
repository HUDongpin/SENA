import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import type {
  SenaClaimReadinessGate,
  SenaClaimReadinessGateItem,
  SenaCodingReliabilityGate,
  SenaDataContractAudit,
  SenaDataGovernanceMetadata,
  SenaEvidenceLedger,
  SenaFusionMathAudit,
  SenaModel,
  SenaPilotReadinessAudit,
  SenaPilotReadinessItem,
  SenaReportCompletenessAudit,
  SenaReportHumanReview,
  SenaRuntimeConsistencyAudit,
  SenaValidation
} from "./types";

export type SenaPilotReadinessInput = {
  model: SenaModel;
  completenessAudit: SenaReportCompletenessAudit;
  dataContractAudit: SenaDataContractAudit;
  runtimeConsistencyAudit: SenaRuntimeConsistencyAudit;
  fusionMathAudit: SenaFusionMathAudit;
  validation: SenaValidation;
  evidenceLedger: SenaEvidenceLedger;
  humanReview: SenaReportHumanReview;
  codingReliabilityGate: SenaCodingReliabilityGate;
  dataGovernance?: Partial<SenaDataGovernanceMetadata>;
  minEvidenceSnippets?: number;
};

function readinessItem(
  id: SenaPilotReadinessItem["id"],
  label: string,
  category: SenaPilotReadinessItem["category"],
  passed: boolean,
  summary: string,
  evidence: string[],
  nextAction: string
): SenaPilotReadinessItem {
  return {
    id,
    label,
    category,
    status: passed ? "ready" : "review",
    summary,
    evidence,
    nextAction
  };
}

function auditItemPassed(audit: SenaReportCompletenessAudit, id: string) {
  return audit.items.find((item) => item.id === id)?.status === "pass";
}

function humanReviewComplete(humanReview: SenaReportHumanReview) {
  return humanReview.status === "human-reviewed" &&
    Boolean(humanReview.reviewer.trim()) &&
    Boolean(humanReview.interpretation.trim()) &&
    Boolean(humanReview.limitations.trim()) &&
    Boolean(humanReview.nextActions.trim()) &&
    humanReview.interpretation !== "Pending human review." &&
    humanReview.limitations !== "Pending human review." &&
    humanReview.nextActions !== "Pending human review.";
}

type ClaimGateConfig = {
  id: SenaClaimReadinessGateItem["id"];
  label: string;
  sourceItemIds: string[];
  readySummary: string;
  guardrail: string;
};

const claimGateConfigs: ClaimGateConfig[] = [
  {
    id: "data-contract",
    label: "Data contract",
    sourceItemIds: ["data-contract"],
    readySummary: "Five-table source data are valid for local SENA interpretation.",
    guardrail: "Claims need a valid people, interactions, utterances, coded_segments, and codebook contract."
  },
  {
    id: "runtime-alignment",
    label: "Runtime alignment",
    sourceItemIds: ["runtime-consistency", "runtime-artifacts"],
    readySummary: "jENA and jSNA runtime outputs align with the active SENA model.",
    guardrail: "Claims need local JavaScript runtime manifests and consistency checks."
  },
  {
    id: "fusion-math",
    label: "Fusion math",
    sourceItemIds: ["fusion-model", "model-json-export", "fusion-math"],
    readySummary: "S/W/B/B_PC/B_CP/G matrices and A_fusion construction are verified.",
    guardrail: "Claims need verified matrix dimensions, weights, normalization, block placement, and restorable model JSON."
  },
  {
    id: "evidence-ledger",
    label: "Evidence ledger",
    sourceItemIds: ["evidence-ledger"],
    readySummary: "Evidence snippets are available for reviewer trace-back.",
    guardrail: "Claims need linked utterance evidence, not graph structure alone."
  },
  {
    id: "method-validation",
    label: "Method validation",
    sourceItemIds: ["method-validation"],
    readySummary: "Sensitivity, stability, null-model, and metric-provenance checks are present.",
    guardrail: "Claims need method diagnostics and declared interpretation limits."
  },
  {
    id: "data-governance",
    label: "Data governance",
    sourceItemIds: ["data-governance"],
    readySummary: "Ethics approval, consent scope, retention policy, use constraints, and stewardship are documented.",
    guardrail: "Claims need documented data-governance metadata in addition to method and review evidence."
  },
  {
    id: "coding-reliability",
    label: "Coding reliability",
    sourceItemIds: ["coding-reliability"],
    readySummary: "Coding scheme, coder count, agreement evidence, adjudication, and limitations are documented.",
    guardrail: "Claims need coding reliability documentation in addition to graph outputs and human interpretation."
  },
  {
    id: "human-review",
    label: "Human review",
    sourceItemIds: ["report-completeness", "human-review"],
    readySummary: "Human-reviewed interpretation, limitations, and next actions are complete.",
    guardrail: "Exploratory until human review is complete."
  }
];

export function buildSenaClaimReadinessGate(audit: SenaPilotReadinessAudit): SenaClaimReadinessGate {
  const readiness = new Map(audit.items.map((item) => [item.id, item]));
  const items = claimGateConfigs.map((config): SenaClaimReadinessGateItem => {
    const sourceItems = config.sourceItemIds.map((id) => readiness.get(id)).filter(Boolean);
    const status = sourceItems.length === config.sourceItemIds.length && sourceItems.every((item) => item?.status === "ready")
      ? "ready"
      : "review";
    const reviewItems = sourceItems.filter((item) => item?.status !== "ready");
    const summary = status === "ready"
      ? config.readySummary
      : (
          reviewItems.map((item) => item?.nextAction).filter(Boolean).join(" ") ||
          config.guardrail
        );

    return {
      id: config.id,
      label: config.label,
      status,
      sourceItemIds: config.sourceItemIds,
      summary,
      guardrail: config.guardrail
    };
  });
  const ready = items.filter((item) => item.status === "ready").length;
  const reviewNeeded = items.length - ready;
  const status = reviewNeeded === 0 ? "ready" : "exploratory";

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.claimReadinessGate,
    status,
    claimUse: status === "ready" ? "research-claim-ready" : "exploratory-only",
    ready,
    reviewNeeded,
    blockers: items.filter((item) => item.status === "review").map((item) => item.label),
    items,
    guardrail: "Exploratory until coding reliability, data governance, human review, and all automated data, runtime, math, evidence, and validation gates pass.",
    notes: [
      "Claim readiness summarizes whether SENA output is ready to be used as a research claim in this local pilot package.",
      "A ready gate still does not replace ethics approval, coding reliability checks, domain validation, or publication review."
    ]
  };
}

export function buildSenaPilotReadinessAudit({
  model,
  completenessAudit,
  dataContractAudit,
  runtimeConsistencyAudit,
  fusionMathAudit,
  validation,
  evidenceLedger,
  humanReview,
  codingReliabilityGate,
  dataGovernance,
  minEvidenceSnippets = 8
}: SenaPilotReadinessInput): SenaPilotReadinessAudit {
  const counts = {
    people: model.dataset.people.length,
    interactions: model.dataset.interactions.length,
    utterances: model.dataset.utterances.length,
    codedSegments: model.dataset.coded_segments.length,
    codes: model.dataset.codebook.length
  };
  const warningCount = model.summary.warnings.length + (model.dataset.warnings?.length ?? 0);
  const sourceTypesWithEvidence = Object.values(evidenceLedger.sourceCounts).filter((count) => count > 0).length;
  const hasFusionGraph = model.nodes.length > 0 && model.edges.length > 0 && model.matrices.fusion.values.length === model.nodes.length;
  const edgeLayers = Array.from(new Set(model.edges.map((edge) => edge.layer))).sort();
  const hasRestorableModelJson = hasFusionGraph &&
    edgeLayers.includes("social") &&
    edgeLayers.includes("concept") &&
    edgeLayers.includes("bridge") &&
    model.matrices.S.raw.length === model.people.length &&
    model.matrices.W.raw.length === model.codes.length &&
    model.matrices.B.raw.length === model.people.length &&
    model.matrices.B.columnLabels.length === model.codes.length &&
    model.matrices.G.raw.length === model.people.length &&
    model.matrices.G.pairs.length === model.matrices.G.columnLabels.length &&
    model.matrices.fusion.labels.length === model.nodes.length &&
    model.temporal.windows.length > 0;
  const hasMethodValidation = validation.metricProvenance.length > 0 &&
    validation.sensitivity.layerWeights.variants.length >= 3 &&
    validation.sensitivity.normalization.variants.length >= 3 &&
    validation.stability.temporal.variants.length >= 3 &&
    validation.nullModels.permutation.iterations > 0 &&
    validation.nullModels.bootstrap.iterations > 0;
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
    readinessItem(
      "data-contract",
      "Five-table data contract",
      "data",
      dataContractAudit.status === "valid",
      `${dataContractAudit.passed} contract checks passed; ${dataContractAudit.reviewNeeded} need review`,
      [
        `${counts.people} people, ${counts.interactions} interactions, ${counts.utterances} utterances, ${counts.codedSegments} coded segments, ${counts.codes} codes`,
        `audit=${dataContractAudit.status}`,
        `warnings=${warningCount}`,
        `temporalWindows=${model.temporal.windows.length}`
      ],
      "Resolve missing tables, reference issues, derived placeholders, or import warnings before a pilot walkthrough."
    ),
    readinessItem(
      "fusion-model",
      "S/W/B/B_PC/B_CP/G fusion model",
      "model",
      hasFusionGraph && auditItemPassed(completenessAudit, "matrices"),
      `${model.nodes.length} nodes, ${model.edges.length} typed edges, ${model.matrices.G.pairs.length} G pairs`,
      [
        `socialEdges=${model.summary.socialEdges}`,
        `conceptEdges=${model.summary.conceptEdges}`,
        `bridgeEdges=${model.summary.bridgeEdges}`,
        `fusionMatrix=${model.matrices.fusion.values.length}x${model.matrices.fusion.values[0]?.length ?? 0}`
      ],
      "Check S, W, B, G, and fusion dimensions if the graph is sparse or empty."
    ),
    readinessItem(
      "model-json-export",
      "Restorable model JSON export",
      "model",
      hasRestorableModelJson,
      `sena-project-snapshot.json can carry ${model.nodes.length} nodes, ${model.edges.length} typed edges, ${model.matrices.G.pairs.length} G pairs, and ${model.temporal.windows.length} temporal windows`,
      [
        "artifact=sena-project-snapshot.json",
        `nodes=${model.nodes.length}`,
        `edges=${model.edges.length}`,
        `edgeLayers=${edgeLayers.join("|") || "none"}`,
        `S=${model.matrices.S.raw.length}x${model.matrices.S.raw[0]?.length ?? 0}`,
        `W=${model.matrices.W.raw.length}x${model.matrices.W.raw[0]?.length ?? 0}`,
        `B=${model.matrices.B.raw.length}x${model.matrices.B.raw[0]?.length ?? 0}`,
        `G=${model.matrices.G.raw.length}x${model.matrices.G.raw[0]?.length ?? 0}`,
        `A_fusion=${model.matrices.fusion.values.length}x${model.matrices.fusion.values[0]?.length ?? 0}`,
        `temporalWindows=${model.temporal.windows.length}`
      ],
      "Export and re-upload sena-project-snapshot.json before a handoff to confirm nodes, edges, S/W/B/B_PC/B_CP/G, fusion, and temporal trace are restorable."
    ),
    readinessItem(
      "fusion-math",
      "Fusion equation audit",
      "math",
      fusionMathAudit.status === "verified",
      `${fusionMathAudit.passed} formula checks passed; ${fusionMathAudit.reviewNeeded} need review`,
      fusionMathAudit.items.map((entry) => `${entry.label}: ${entry.status}`),
      "Resolve formula block mismatches before using weighted fusion results in a pilot report."
    ),
    readinessItem(
      "runtime-consistency",
      "jENA/jSNA runtime consistency",
      "runtime",
      runtimeConsistencyAudit.status === "consistent",
      `${runtimeConsistencyAudit.passed} runtime checks passed; ${runtimeConsistencyAudit.reviewNeeded} need review`,
      runtimeConsistencyAudit.items.map((item) => `${item.label}: ${item.status}`),
      "Review jENA and jSNA manifests against the active SENA model before exporting claims."
    ),
    readinessItem(
      "runtime-artifacts",
      "Runtime artifacts",
      "runtime",
      auditItemPassed(completenessAudit, "jena-manifest") && auditItemPassed(completenessAudit, "jsna-manifest"),
      `jENA and jSNA manifest completeness from ${completenessAudit.schemaVersion}`,
      [
        `jENA=${auditItemPassed(completenessAudit, "jena-manifest") ? "pass" : "review"}`,
        `jSNA=${auditItemPassed(completenessAudit, "jsna-manifest") ? "pass" : "review"}`
      ],
      "Export the runtime bundle only after both local JavaScript runtimes are computed or explicitly explained."
    ),
    readinessItem(
      "method-validation",
      "Method validation package",
      "method",
      hasMethodValidation,
      `${validation.metricProvenance.length} metric provenance entries, ${validation.sensitivity.layerWeights.variants.length} weight variants, ${validation.sensitivity.normalization.variants.length} normalization variants`,
      [
        `temporalVariants=${validation.stability.temporal.variants.length}`,
        `permutationIterations=${validation.nullModels.permutation.iterations}`,
        `bootstrapIterations=${validation.nullModels.bootstrap.iterations}`
      ],
      "Run sensitivity, temporal, and null-model checks before using the pilot for research interpretation."
    ),
    readinessItem(
      "evidence-ledger",
      "Evidence ledger",
      "evidence",
      evidenceLedger.snippets.length >= minEvidenceSnippets,
      `${evidenceLedger.snippets.length} snippets across ${sourceTypesWithEvidence} evidence source types`,
      Object.entries(evidenceLedger.sourceCounts).map(([source, count]) => `${source}=${count}`),
      "Increase the evidence limit or inspect the evidence ledger if a pilot claim needs broader source coverage."
    ),
    readinessItem(
      "coding-reliability",
      "Coding reliability gate",
      "review",
      codingReliabilityGate.status === "ready",
      codingReliabilityGate.status === "ready"
        ? `Coding reliability documented by ${codingReliabilityGate.review.reviewer}`
        : `${codingReliabilityGate.blockers.length} coding-reliability blocker${codingReliabilityGate.blockers.length === 1 ? "" : "s"}`,
      [
        codingReliabilityGate.schemaVersion,
        ...codingReliabilityGate.evidence
      ],
      "Document the coding scheme, coding unit, coder count, agreement metric/value, adjudication notes, and limitations before treating SENA patterns as research claims."
    ),
    readinessItem(
      "data-governance",
      "Data governance metadata",
      "review",
      dataGovernanceBlockers.length === 0,
      dataGovernanceBlockers.length === 0
        ? `Data governance documented by ${dataGovernance?.dataSteward || "assigned steward"}`
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
      ],
      "Document IRB/ethics approval, consent scope, retention policy, usage constraints, and data steward before treating SENA patterns as research claims."
    ),
    readinessItem(
      "report-completeness",
      "Report completeness",
      "review",
      completenessAudit.status === "complete",
      `${completenessAudit.passed} report checks passed; ${completenessAudit.reviewNeeded} need review`,
      completenessAudit.items.map((item) => `${item.label}: ${item.status}`),
      "Complete every report section before sharing a pilot export."
    ),
    readinessItem(
      "human-review",
      "Human review fields",
      "review",
      humanReviewComplete(humanReview),
      humanReview.status === "human-reviewed" ? `Reviewed by ${humanReview.reviewer || "unassigned"}` : "Draft interpretation",
      [
        `reviewer=${humanReview.reviewer || "unassigned"}`,
        `interpretation=${humanReview.interpretation.trim() ? "present" : "missing"}`,
        `limitations=${humanReview.limitations.trim() ? "present" : "missing"}`,
        `nextActions=${humanReview.nextActions.trim() ? "present" : "missing"}`
      ],
      "Mark as human-reviewed only after interpretation, limitations, and next actions are filled."
    )
  ];

  const passed = items.filter((item) => item.status === "ready").length;
  const reviewNeeded = items.length - passed;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.pilotReadiness,
    status: reviewNeeded === 0 ? "ready" : "needs-review",
    passed,
    reviewNeeded,
    items,
    notes: [
      "Pilot readiness is a local demo gate for research use; it does not replace ethics approval, full reliability analysis, or domain validation.",
      "Items marked review should be resolved or explicitly documented before using SENA outputs for publication, assessment, or instructional decisions."
    ]
  };
}
