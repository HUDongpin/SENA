import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import {
  SenaInputValidationError,
  validateSenaAnalyticalInputs
} from "./analytical-input-validation";
import {
  normalizeSenaFusionMathAudit,
  type SenaFusionMathAuditEvidence
} from "./fusion-math";
import { assertSenaReliabilityProjectBindingMatchesSnapshot } from "./reliability";
import { buildSenaReport, type SenaReportOptions } from "./report";
import { buildSenaTemporalRuntimeTrace } from "./temporal-runtime";
import { normalizeSenaReportStatisticalLeaves } from "./statistical-leaf-read";
import type {
  SenaDataset,
  SenaDemoVerificationCheck,
  SenaEmbeddingDelta,
  SenaEmbeddingPhi,
  SenaDegreeConvention,
  SenaAnalysisDirection,
  SenaModel,
  SenaNormalization,
  SenaProjectSnapshot,
  SenaTemporalMode,
  SenaTemporalRuntimeTrace,
  SenaTemporalWindow
} from "./types";

export type SenaProjectSnapshotOptions = SenaReportOptions & {
  activeTemporalWindow?: SenaTemporalWindow | null;
  sourceDataset?: SenaDataset;
  temporalRuntimeTrace?: SenaTemporalRuntimeTrace;
  demoVerificationManualReviews?: Record<string, SenaDemoVerificationCheck["manualReview"]>;
};

function datasetCounts(dataset: SenaDataset) {
  return {
    people: dataset.people.length,
    interactions: dataset.interactions.length,
    utterances: dataset.utterances.length,
    codedSegments: dataset.coded_segments.length,
    codes: dataset.codebook.length
  };
}

export function buildSenaProjectSnapshot(model: SenaModel, options: SenaProjectSnapshotOptions = {}): SenaProjectSnapshot {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const sourceDataset = options.sourceDataset ?? model.dataset;
  const report = buildSenaReport(model, {
    ...options,
    generatedAt
  });
  const temporalRuntimeTrace = options.temporalRuntimeTrace ?? buildSenaTemporalRuntimeTrace(
    sourceDataset,
    model.options,
    { generatedAt }
  );

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.projectSnapshot,
    title: report.title,
    generatedAt,
    source: {
      milestone: "local-research-pilot",
      activeTemporalWindow: options.activeTemporalWindow ?? null,
      sourceDatasetCounts: datasetCounts(sourceDataset),
      sourceDataset
    },
    reproducibility: {
      requiredRuntimes: {
        sena: report.runtimeProvenance.senaModel,
        ena: report.runtimeProvenance.enaRuntime,
        sna: report.runtimeProvenance.snaRuntime
      },
      formula: report.runtimeProvenance.senaModel.matrixFormula,
      buildOptions: model.options,
      interpretationGuardrails: report.interpretationGuardrails
    },
    dataset: model.dataset,
    analysis: {
      nodes: model.nodes,
      edges: model.edges,
      summary: model.summary,
      matrices: model.matrices,
      socialReport: model.socialReport,
      pairReport: model.pairReport,
      temporal: model.temporal,
      temporalRuntimeTrace
    },
    workspaceState: {
      demoVerificationManualReviews: options.demoVerificationManualReviews ?? {}
    },
    dataGovernance: report.dataGovernance,
    report
  };
}

const normalizationValues = new Set<SenaNormalization>(["max", "frobenius", "log1p-max", "log-max", "none"]);
const temporalModeValues = new Set<SenaTemporalMode>(["stage", "moving-window", "turn-window"]);
const directionValues = new Set<SenaAnalysisDirection>(["directed", "undirected"]);
const degreeConventionValues = new Set<SenaDegreeConvention>(["row-sum"]);
const phiValues = new Set<SenaEmbeddingPhi>(["classical_mds", "laplacian_eigenmaps", "commute_time"]);
const deltaValues = new Set<SenaEmbeddingDelta>(["shortest_path_reciprocal_weight", "combinatorial_laplacian", "commute_time_resistance"]);

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertArrayField(root: Record<string, unknown>, field: string, context: string) {
  if (!Array.isArray(root[field])) {
    throw new Error(`${context}.${field} must be an array.`);
  }
}

function assertDataset(value: unknown, context: string): asserts value is SenaDataset {
  const root = asRecord(value, context);
  assertArrayField(root, "people", context);
  assertArrayField(root, "interactions", context);
  assertArrayField(root, "utterances", context);
  assertArrayField(root, "coded_segments", context);
  assertArrayField(root, "codebook", context);
}

function assertFiniteNumber(value: unknown, context: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context} must be a finite number.`);
  }
}

function assertManualReview(value: unknown, context: string) {
  const review = asRecord(value, context);
  if (review.status !== "pending" && review.status !== "passed" && review.status !== "failed") {
    throw new Error(`${context}.status is not supported.`);
  }
  for (const field of ["reviewer", "verifiedAt", "notes"]) {
    if (typeof review[field] !== "string") {
      throw new Error(`${context}.${field} must be a string.`);
    }
  }
}

function assertWorkspaceState(value: unknown) {
  const state = asRecord(value, "project snapshot.workspaceState");
  const manualReviews = asRecord(state.demoVerificationManualReviews, "project snapshot.workspaceState.demoVerificationManualReviews");
  for (const [checkId, review] of Object.entries(manualReviews)) {
    assertManualReview(review, `project snapshot.workspaceState.demoVerificationManualReviews.${checkId}`);
  }
}

function assertDataGovernance(value: unknown, context: string) {
  const governance = asRecord(value, context);
  if (governance.schemaVersion !== SENA_SCHEMA_VERSIONS.dataGovernanceMetadata) {
    throw new Error(`${context}.schemaVersion is not supported.`);
  }
  if (governance.status !== "complete" && governance.status !== "needs-review") {
    throw new Error(`${context}.status is not supported.`);
  }
  for (const field of ["irbApprovalId", "consentScope", "retentionPolicy", "dataSteward", "reviewedAt", "guardrail"]) {
    if (typeof governance[field] !== "string") {
      throw new Error(`${context}.${field} must be a string.`);
    }
  }
  if (!Array.isArray(governance.usageConstraints) || !Array.isArray(governance.requiredEvidence) || !Array.isArray(governance.blockers)) {
    throw new Error(`${context} usageConstraints, requiredEvidence, and blockers must be arrays.`);
  }
}

function assertBuildOptions(value: unknown) {
  const options = asRecord(value, "project snapshot reproducibility.buildOptions");
  assertFiniteNumber(options.alpha, "project snapshot buildOptions.alpha");
  assertFiniteNumber(options.beta, "project snapshot buildOptions.beta");
  assertFiniteNumber(options.gamma, "project snapshot buildOptions.gamma");

  if (!normalizationValues.has(options.normalization as SenaNormalization)) {
    throw new Error("project snapshot buildOptions.normalization is not supported.");
  }

  if (options.undirectedSocial !== undefined && typeof options.undirectedSocial !== "boolean") {
    throw new Error("project snapshot buildOptions.undirectedSocial must be a boolean when present.");
  }
  // Analysis-config declarations were added after the first sena-project-snapshot/v1
  // exports shipped; legacy snapshots omit them and resolveBuildOptions supplies the
  // declared defaults on rebuild, so they are validated only when present.
  if (options.direction !== undefined && !directionValues.has(options.direction as SenaAnalysisDirection)) {
    throw new Error("project snapshot buildOptions.direction is not supported.");
  }
  if (options.deg_convention !== undefined && !degreeConventionValues.has(options.deg_convention as SenaDegreeConvention)) {
    throw new Error("project snapshot buildOptions.deg_convention is not supported.");
  }
  if (options.Phi !== undefined && !phiValues.has(options.Phi as SenaEmbeddingPhi)) {
    throw new Error("project snapshot buildOptions.Phi is not supported.");
  }
  if (options.delta !== undefined && !deltaValues.has(options.delta as SenaEmbeddingDelta)) {
    throw new Error("project snapshot buildOptions.delta is not supported.");
  }
  if (options.d !== undefined) {
    assertFiniteNumber(options.d, "project snapshot buildOptions.d");
  }
  if (options.seed !== undefined) {
    assertFiniteNumber(options.seed, "project snapshot buildOptions.seed");
  }

  const temporal = asRecord(options.temporal, "project snapshot buildOptions.temporal");
  if (!temporalModeValues.has(temporal.mode as SenaTemporalMode)) {
    throw new Error("project snapshot buildOptions.temporal.mode is not supported.");
  }
  assertFiniteNumber(temporal.movingWindowSize, "project snapshot buildOptions.temporal.movingWindowSize");
  assertFiniteNumber(temporal.movingWindowStep, "project snapshot buildOptions.temporal.movingWindowStep");
  assertFiniteNumber(temporal.turnWindowRadius, "project snapshot buildOptions.temporal.turnWindowRadius");
}

function assertSenaProjectSnapshot(value: unknown): void {
  const root = asRecord(value, "project snapshot");
  if (root.schemaVersion !== SENA_SCHEMA_VERSIONS.projectSnapshot) {
    throw new Error("JSON is not a SENA project snapshot.");
  }

  assertDataset(root.dataset, "project snapshot.dataset");

  const source = asRecord(root.source, "project snapshot.source");
  if (source.milestone !== "local-research-pilot") {
    throw new Error("project snapshot source.milestone is not supported.");
  }
  if (source.sourceDataset !== undefined) {
    assertDataset(source.sourceDataset, "project snapshot.source.sourceDataset");
  }

  const reproducibility = asRecord(root.reproducibility, "project snapshot.reproducibility");
  assertBuildOptions(reproducibility.buildOptions);

  const analysis = asRecord(root.analysis, "project snapshot.analysis");
  if (analysis.nodes !== undefined && !Array.isArray(analysis.nodes)) {
    throw new Error("project snapshot.analysis.nodes must be an array.");
  }
  if (analysis.edges !== undefined && !Array.isArray(analysis.edges)) {
    throw new Error("project snapshot.analysis.edges must be an array.");
  }
  asRecord(analysis.summary, "project snapshot.analysis.summary");
  asRecord(analysis.matrices, "project snapshot.analysis.matrices");
  asRecord(analysis.socialReport, "project snapshot.analysis.socialReport");
  if (!Array.isArray(analysis.pairReport)) {
    throw new Error("project snapshot.analysis.pairReport must be an array.");
  }
  asRecord(analysis.temporal, "project snapshot.analysis.temporal");

  if (root.workspaceState !== undefined) {
    assertWorkspaceState(root.workspaceState);
  }
  if (root.dataGovernance !== undefined) {
    assertDataGovernance(root.dataGovernance, "project snapshot.dataGovernance");
  }

  const report = asRecord(root.report, "project snapshot.report");
  if (report.schemaVersion !== SENA_SCHEMA_VERSIONS.report) {
    throw new Error("project snapshot.report must be a SENA report.");
  }
  if (report.dataGovernance !== undefined) {
    assertDataGovernance(report.dataGovernance, "project snapshot.report.dataGovernance");
  }
}

export function importSenaProjectSnapshot(source: string | unknown): SenaProjectSnapshot {
  const value = typeof source === "string" ? JSON.parse(source) : source;
  assertSenaProjectSnapshot(value);
  const validated = value as SenaProjectSnapshot;
  validateSenaAnalyticalInputs({
    dataset: validated.dataset,
    buildOptions: validated.reproducibility.buildOptions
  });
  if (validated.source.sourceDataset !== undefined) {
    try {
      validateSenaAnalyticalInputs({
        dataset: validated.source.sourceDataset,
        buildOptions: validated.reproducibility.buildOptions
      });
    } catch (error) {
      if (!(error instanceof SenaInputValidationError)) throw error;
      throw new SenaInputValidationError(error.issues.map((issue) => ({
        ...issue,
        path: issue.path.startsWith("dataset")
          ? `source.sourceDataset${issue.path.slice("dataset".length)}`
          : issue.path
      })));
    }
  }
  const normalized = structuredClone(value) as Record<string, unknown>;
  const normalizedReport = normalizeSenaReportStatisticalLeaves(
    normalized.report,
    "project snapshot.report"
  ).report;
  const analysis = asRecord(normalized.analysis, "project snapshot.analysis");
  const reproducibility = asRecord(normalized.reproducibility, "project snapshot.reproducibility");
  normalizeSenaFusionMathAudit(normalizedReport.fusionMathAudit, {
    matrices: analysis.matrices as SenaFusionMathAuditEvidence["matrices"],
    options: reproducibility.buildOptions as SenaFusionMathAuditEvidence["options"],
    pairReport: analysis.pairReport as SenaFusionMathAuditEvidence["pairReport"]
  });
  const projectBinding = normalizedReport.codingReliabilityGate.review.machineEvidence?.projectBinding;
  if (projectBinding) {
    assertSenaReliabilityProjectBindingMatchesSnapshot(
      projectBinding,
      normalized as unknown as SenaProjectSnapshot
    );
  }
  normalized.report = normalizedReport;
  return normalized as SenaProjectSnapshot;
}

export function isSenaProjectSnapshot(value: unknown): value is SenaProjectSnapshot {
  try {
    assertSenaProjectSnapshot(value);
    const root = asRecord(value, "project snapshot");
    const reproducibility = asRecord(root.reproducibility, "project snapshot.reproducibility");
    validateSenaAnalyticalInputs({
      dataset: root.dataset,
      buildOptions: reproducibility.buildOptions
    });
    const source = asRecord(root.source, "project snapshot.source");
    if (source.sourceDataset !== undefined) {
      validateSenaAnalyticalInputs({
        dataset: source.sourceDataset,
        buildOptions: reproducibility.buildOptions
      });
    }
    const report = asRecord(root.report, "project snapshot.report");
    const fusionMathAudit = asRecord(report.fusionMathAudit, "project snapshot.report.fusionMathAudit");
    const codingReliabilityGate = asRecord(report.codingReliabilityGate, "project snapshot.report.codingReliabilityGate");
    if (fusionMathAudit.schemaVersion !== SENA_SCHEMA_VERSIONS.fusionMathAudit ||
      codingReliabilityGate.schemaVersion !== SENA_SCHEMA_VERSIONS.codingReliabilityGate) return false;
    const normalizedReport = normalizeSenaReportStatisticalLeaves(report, "project snapshot.report").report;
    const analysis = asRecord(root.analysis, "project snapshot.analysis");
    normalizeSenaFusionMathAudit(normalizedReport.fusionMathAudit, {
      matrices: analysis.matrices as SenaFusionMathAuditEvidence["matrices"],
      options: reproducibility.buildOptions as SenaFusionMathAuditEvidence["options"],
      pairReport: analysis.pairReport as SenaFusionMathAuditEvidence["pairReport"]
    });
    const projectBinding = normalizedReport.codingReliabilityGate.review.machineEvidence?.projectBinding;
    if (projectBinding) {
      assertSenaReliabilityProjectBindingMatchesSnapshot(projectBinding, value as SenaProjectSnapshot);
    }
    return true;
  } catch {
    return false;
  }
}
