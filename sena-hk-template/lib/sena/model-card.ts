import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { SENA_GRAPH_OPERATOR_CONVENTIONS } from "./operators";
import type {
  SenaCodingReliabilityGate,
  SenaDataGovernanceMetadata,
  SenaModel,
  SenaModelCard,
  SenaModelCardSection,
  SenaModelCardSectionId,
  SenaValidation
} from "./types";

export type SenaModelCardOptions = {
  generatedAt?: string;
  codingReliabilityGate?: SenaCodingReliabilityGate;
  dataGovernance?: SenaDataGovernanceMetadata;
  validation?: SenaValidation;
};

const modelCardSections: Array<{ id: SenaModelCardSectionId; label: string }> = [
  { id: "data-contract", label: "Data contract" },
  { id: "exact-formulas", label: "Exact formulas" },
  { id: "normalization", label: "Normalization" },
  { id: "layer-weights", label: "Layer weights and sensitivity" },
  { id: "embedding-geometry", label: "Embedding / geometry" },
  { id: "coding-reliability", label: "Coding reliability" },
  { id: "attribution-wording", label: "Attribution wording gate" },
  { id: "validation", label: "Validation" },
  { id: "isolated-zero-degree", label: "Isolated vertices and zero-degree convention" },
  { id: "directed-graph", label: "Directed-graph convention" }
];

function metadataComplete(model: SenaModel, dataGovernance?: SenaDataGovernanceMetadata) {
  return Boolean(model.dataset.metadata) && dataGovernance?.status !== "needs-review";
}

function isValidationComplete(validation?: SenaValidation) {
  return Boolean(validation?.nullModels?.seed && validation.nullModels.permutation.iterations > 0);
}

function buildSections(input: {
  model: SenaModel;
  codingReliabilityGate?: SenaCodingReliabilityGate;
  dataGovernance?: SenaDataGovernanceMetadata;
  validation?: SenaValidation;
}): SenaModelCardSection[] {
  const { model, codingReliabilityGate, dataGovernance, validation } = input;
  const diagnostics = model.operatorDiagnostics;
  const normalizations = Object.values(diagnostics.normalization);
  const sectionStatus: Record<SenaModelCardSectionId, SenaModelCardSection["status"]> = {
    "data-contract": metadataComplete(model, dataGovernance) ? "complete" : "needs-review",
    "exact-formulas": "complete",
    normalization: normalizations.every((normalization) => normalization.admissible) ? "complete" : "needs-review",
    "layer-weights": Number.isFinite(model.options.alpha) && Number.isFinite(model.options.beta) && Number.isFinite(model.options.gamma)
      ? "complete"
      : "needs-review",
    "embedding-geometry": "complete",
    "coding-reliability": codingReliabilityGate?.status === "ready" ? "complete" : "needs-review",
    "attribution-wording": "complete",
    validation: isValidationComplete(validation) ? "complete" : "needs-review",
    "isolated-zero-degree": "complete",
    "directed-graph": "complete"
  };

  const evidence: Record<SenaModelCardSectionId, string[]> = {
    "data-contract": [
      `datasetVersion=${diagnostics.runIdentity.datasetVersion}`,
      `datasetContentHash=${diagnostics.runIdentity.datasetContentHash}`,
      `codebook=${model.dataset.metadata?.codebook.id ?? "missing"}@${model.dataset.metadata?.codebook.version ?? "missing"}`
    ],
    "exact-formulas": [
      model.options.undirectedSocial ? "S = R + R^T" : "S = R",
      "W_ab = sum_t X_ta X_tb, a != b, W_aa = 0",
      `B weight rule=${diagnostics.bridgeWeighting.rule}`
    ],
    normalization: [
      `rule=${model.options.normalization}`,
      `S=${diagnostics.normalization.S.divisor}`,
      `W=${diagnostics.normalization.W.divisor}`,
      `B=${diagnostics.normalization.B.divisor}`,
      `G=${diagnostics.normalization.G.divisor}`
    ],
    "layer-weights": [
      `alpha=${model.options.alpha}`,
      `beta=${model.options.beta}`,
      `gamma=${model.options.gamma}`,
      `configHash=${diagnostics.runIdentity.configHash}`
    ],
    "embedding-geometry": [
      `layout=${diagnostics.embedding.exploratoryLayout.operator}`,
      `mdsAvailable=${diagnostics.embedding.mds.available}`,
      `metricExact=${diagnostics.embedding.mds.metricExact}`
    ],
    "coding-reliability": [
      `status=${codingReliabilityGate?.status ?? "missing"}`,
      ...(codingReliabilityGate?.evidence ?? [])
    ],
    "attribution-wording": [
      diagnostics.attribution.defaultWording,
      `contributionWordingAllowed=${diagnostics.attribution.contributionWordingAllowed}`,
      `Y=${diagnostics.attribution.participation.rowCount}x${diagnostics.attribution.participation.columnCount}`,
      `Y source=${diagnostics.attribution.participation.sourceTable}`,
      `G identities=${diagnostics.attribution.identities.rawSlicesPsd && diagnostics.attribution.identities.rawSumMatchesParticipantWeightedCooccurrence}`,
      `G_hat bounds=${diagnostics.attribution.gHat.boundsWithinWindowProducts}`
    ],
    validation: [
      `seed=${validation?.nullModels.seed ?? "missing"}`,
      `iterations=${validation?.nullModels.permutation.iterations ?? "missing"}`
    ],
    "isolated-zero-degree": [
      `degreeConvention=${diagnostics.degreeConvention}`,
      `selfLoopConvention=${SENA_GRAPH_OPERATOR_CONVENTIONS.self_loops}`,
      `zeroDegreeConvention=${SENA_GRAPH_OPERATOR_CONVENTIONS.zero_degree}`,
      `I0=${diagnostics.isolatedVertices.map((vertex) => vertex.label).join(",") || "empty"}`
    ],
    "directed-graph": [
      `mode=${diagnostics.direction.socialMode}`,
      `bridgeMode=${diagnostics.direction.bridgeMode}`,
      `independentBridgeMatrices=${diagnostics.direction.independentBridgeMatrices}`,
      `spectralInput=${diagnostics.embedding.input.symmetrization}`,
      diagnostics.direction.badge
    ]
  };

  return modelCardSections.map((section) => ({
    ...section,
    status: sectionStatus[section.id],
    evidence: evidence[section.id]
  }));
}

export function buildSenaModelCard(model: SenaModel, options: SenaModelCardOptions = {}): SenaModelCard {
  const diagnostics = model.operatorDiagnostics;
  const metadata = model.dataset.metadata;
  const sections = buildSections({
    model,
    codingReliabilityGate: options.codingReliabilityGate,
    dataGovernance: options.dataGovernance,
    validation: options.validation
  });
  const missingSectionIds = sections
    .filter((section) => section.status !== "complete")
    .map((section) => section.id);
  const normalizations = Object.values(diagnostics.normalization);
  const normalizationWarnings = normalizations.flatMap((normalization) => normalization.warnings);
  const xItaPresent = model.dataset.coded_segments.length > 0 &&
    model.dataset.coded_segments.every((segment) => model.people.some((person) => person.id === segment.personId));
  const mds = diagnostics.embedding.mds;
  const codingReliabilityReady = options.codingReliabilityGate?.status === "ready";
  const validationComplete = isValidationComplete(options.validation);
  const directionCollapsed = model.options.undirectedSocial;
  const directionDiagnostics = diagnostics.direction;
  const isolatedCount = diagnostics.isolatedVertices.length;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.modelCard,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    sections,
    dataset: {
      id: metadata?.codebook.id ?? null,
      version: {
        declared: diagnostics.runIdentity.datasetVersion,
        contentHash: diagnostics.runIdentity.datasetContentHash
      },
      counts: {
        people: model.dataset.people.length,
        interactions: model.dataset.interactions.length,
        utterances: model.dataset.utterances.length,
        codedSegments: model.dataset.coded_segments.length,
        codes: model.dataset.codebook.length
      },
      codebook: {
        id: metadata?.codebook.id ?? null,
        version: metadata?.codebook.version ?? null,
        contentHash: metadata?.codebook.contentHash ?? null
      },
      pseudonymized: metadata?.pseudonymization.personIdPolicy === "opaque",
      consentRecord: metadata?.consent.instrument ?? null,
      xItaPresent
    },
    formulas: {
      social: {
        formula: directionCollapsed ? "S = R + R^T" : "S = R",
        direction: directionCollapsed ? "undirected" : "directed",
        directedInputPreserved: !directionCollapsed
      },
      concept: {
        formula: "W_ab = sum_t X_ta X_tb, a != b, W_aa = 0",
        codeFrequenciesAsNodeAttributes: true
      },
      bridge: {
        // B accumulates each person's own segment-code weights; it is not the
        // participation co-presence product Y*X, which also counts codes used
        // by other people inside shared windows.
        formula: "B_ic = sum_{s: person(s)=i} w_s * 1[c in codes_s]",
        weightRule: diagnostics.bridgeWeighting.rule === "confidence" ? "confidence-weighted" : "segment-count",
        activeCodeValue: diagnostics.bridgeWeighting.activeCodeValue
      },
      attribution: {
        variant: "G_hat",
        estimator: diagnostics.attribution.estimator
      }
    },
    normalization: {
      rule: model.options.normalization,
      divisors: {
        S: diagnostics.normalization.S.divisor,
        W: diagnostics.normalization.W.divisor,
        B: diagnostics.normalization.B.divisor,
        G: diagnostics.normalization.G.divisor
      },
      scaleInvariant: normalizations.every((normalization) => normalization.scaleInvariant),
      warnings: normalizationWarnings
    },
    weights: {
      alpha: model.options.alpha,
      beta: model.options.beta,
      gamma: model.options.gamma,
      configHash: diagnostics.runIdentity.configHash,
      interpretation: "Layer weights are interpretable only under the declared normalization rule and divisors."
    },
    embedding: {
      operator: mds.available ? "classical-mds" : "layout-only",
      delta: mds.available ? mds.delta : "none",
      dimensions: mds.available ? mds.dimensions : null,
      seed: model.options.seed,
      metricExact: mds.available ? mds.metricExact : false,
      stress: mds.stress,
      maxDistortion: mds.maxDistortion,
      layoutBadge: "Exploratory layout — distances are not metric.",
      exactnessBadge: mds.available && mds.metricExact
        ? "Exact metric embedding (Schoenberg criterion satisfied)."
        : `Approximate embedding; stress = ${mds.stress ?? "NA"}, max distortion = ${mds.maxDistortion ?? "NA"}.`
    },
    reliability: {
      status: codingReliabilityReady ? "complete" : "needs-review",
      summary: codingReliabilityReady
        ? options.codingReliabilityGate?.guardrail ?? "Coding reliability gate is ready."
        : "Coding reliability evidence is incomplete; keep claims exploratory.",
      evidence: options.codingReliabilityGate?.evidence ?? []
    },
    attribution: {
      wording: diagnostics.attribution.contributionWordingAllowed ? "contribution-supported" : "association-exposure-only",
      variant: "G_hat",
      contributionWordingAllowed: diagnostics.attribution.contributionWordingAllowed,
      badge: diagnostics.attribution.contributionWordingAllowed
        ? "Contribution supported by person-specific coding evidence."
        : "Association/exposure only; contribution requires person-specific evidence."
    },
    validation: {
      status: validationComplete ? "complete" : "needs-review",
      claims: validationComplete ? ["descriptive null-model check attached"] : ["descriptive/exploratory only"],
      seed: options.validation?.nullModels.seed ?? null,
      pValue: options.validation?.nullModels.permutation.pValueGreaterOrEqual ?? null,
      badge: validationComplete
        ? `Descriptive validation attached; seed = ${options.validation?.nullModels.seed}.`
        : "Descriptive only — no significance test attached."
    },
    isolated: {
      I0: diagnostics.isolatedVertices,
      degreeConvention: diagnostics.degreeConvention,
      selfLoopConvention: SENA_GRAPH_OPERATOR_CONVENTIONS.self_loops,
      zeroDegreeConvention: SENA_GRAPH_OPERATOR_CONVENTIONS.zero_degree,
      badge: `${isolatedCount} isolated node(s) retained (I0) — convention: ${diagnostics.degreeConvention}; ${SENA_GRAPH_OPERATOR_CONVENTIONS.zero_degree}.`
    },
    direction: {
      mode: directionDiagnostics.socialMode,
      operator: directionCollapsed ? "symmetrized" : "declared-spectral-symmetrization",
      collapsed: directionDiagnostics.socialSymmetrized,
      bridgesIndependent: directionDiagnostics.independentBridgeMatrices,
      badge: directionDiagnostics.badge
    },
    renderGate: {
      status: missingSectionIds.length === 0 ? "ready" : "blocked",
      missingSectionIds,
      message: missingSectionIds.length === 0
        ? "Model card complete - rendering permitted."
        : `Model card incomplete - rendering blocked: ${missingSectionIds.join(", ")}.`
    }
  };
}
