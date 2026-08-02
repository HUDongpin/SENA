import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { buildSenaModel, scopeSenaDatasetToWindow } from "./model";
import { SENA_GRAPH_OPERATOR_CONVENTIONS } from "./operators";
import { buildSenaRuntimeBundle } from "./runtime-bundle";
import { buildSenaProjectSnapshot, importSenaProjectSnapshot } from "./snapshot";
import { importSenaJsonContract } from "./import";
import type { SenaReportOptions } from "./report";
import type {
  SenaAnalysisProvenanceEnvelope,
  SenaBuildOptions,
  SenaDataset,
  SenaModel,
  SenaModelCard,
  SenaTemporalWindow
} from "./types";

export type SenaAnalysisRunSourceKind = "project" | "snapshot" | "dataset" | "contract";

export type SenaAnalysisRunInput = {
  sourceKind?: SenaAnalysisRunSourceKind;
  snapshot?: unknown;
  dataset?: unknown;
  buildOptions?: Partial<SenaBuildOptions>;
  title?: string;
  generatedAt?: string;
  activeTemporalWindowId?: string;
  includeRuntimeBundle?: boolean;
  humanReview?: SenaReportOptions["humanReview"];
  codingReliability?: SenaReportOptions["codingReliability"];
  dataGovernance?: SenaReportOptions["dataGovernance"];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDatasetLike(value: unknown): value is SenaDataset {
  return isRecord(value) &&
    Array.isArray(value.people) &&
    Array.isArray(value.interactions) &&
    Array.isArray(value.utterances) &&
    Array.isArray(value.coded_segments) &&
    Array.isArray(value.codebook);
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

function resolveDatasetSource(input: SenaAnalysisRunInput) {
  if (input.snapshot) {
    const snapshot = importSenaProjectSnapshot(input.snapshot);
    return {
      kind: input.sourceKind ?? "snapshot" as SenaAnalysisRunSourceKind,
      dataset: snapshot.source.sourceDataset ?? snapshot.dataset,
      buildOptions: input.buildOptions ?? snapshot.reproducibility.buildOptions,
      title: input.title ?? snapshot.title,
      snapshot
    };
  }

  if (!input.dataset) throw new Error("SENA analysis requires a projectId, snapshot, dataset, or SENA JSON contract.");

  if (isDatasetLike(input.dataset)) {
    return {
      kind: input.sourceKind ?? "dataset" as SenaAnalysisRunSourceKind,
      dataset: input.dataset,
      buildOptions: input.buildOptions,
      title: input.title
    };
  }

  const imported = importSenaJsonContract(input.dataset);
  return {
    kind: input.sourceKind ?? "contract" as SenaAnalysisRunSourceKind,
    dataset: imported.dataset,
    buildOptions: input.buildOptions,
    title: input.title
  };
}

function resolveActiveWindow(sourceDataset: SenaDataset, buildOptions: Partial<SenaBuildOptions> | undefined, activeTemporalWindowId: string | undefined) {
  if (!activeTemporalWindowId) return null;
  const timelineModel = buildSenaModel(sourceDataset, buildOptions);
  return timelineModel.temporal.windows.find((window) => window.id === activeTemporalWindowId) ?? null;
}

export function buildSenaAnalysisProvenanceEnvelope(
  model: SenaModel,
  modelCard: SenaModelCard = buildSenaProjectSnapshot(model).report.modelCard
): SenaAnalysisProvenanceEnvelope {
  const diagnostics = model.operatorDiagnostics;
  const mds = diagnostics.embedding.mds;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.analysisProvenanceEnvelope,
    norm_rule: model.options.normalization,
    divisors: {
      S: diagnostics.normalization.S.divisor,
      W: diagnostics.normalization.W.divisor,
      B: diagnostics.normalization.B.divisor,
      B_CP: diagnostics.normalization.B_CP.divisor,
      G: diagnostics.normalization.G.divisor
    },
    alpha: model.options.alpha,
    beta: model.options.beta,
    gamma: model.options.gamma,
    direction: diagnostics.direction.fusionMode,
    deg_convention: diagnostics.degreeConvention,
    operator_conventions: SENA_GRAPH_OPERATOR_CONVENTIONS,
    Phi: mds.available ? model.options.Phi : "layout_only",
    delta: mds.available ? model.options.delta : "none",
    d: mds.available ? model.options.d : null,
    seed: model.options.seed,
    metric_exact: mds.available ? mds.metricExact : false,
    stress: mds.stress,
    isolated: diagnostics.isolatedVertices,
    bridge_direction: diagnostics.direction.bridgeMode,
    bridge_pc_cp_independent: diagnostics.direction.independentBridgeMatrices,
    direction_badge: diagnostics.direction.badge,
    dataset_version: diagnostics.runIdentity.datasetVersion,
    dataset_content_hash: diagnostics.runIdentity.datasetContentHash,
    codebook_version: model.dataset.metadata?.codebook.version ?? "unversioned",
    model_card: {
      schemaVersion: modelCard.schemaVersion,
      renderGateStatus: modelCard.renderGate.status,
      missingSectionIds: modelCard.renderGate.missingSectionIds
    }
  };
}

export function buildSenaAnalysisRun(input: SenaAnalysisRunInput) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const source = resolveDatasetSource(input);
  const activeTemporalWindow = resolveActiveWindow(source.dataset, source.buildOptions, input.activeTemporalWindowId);
  const analysisDataset = activeTemporalWindow
    ? scopeSenaDatasetToWindow(source.dataset, activeTemporalWindow)
    : source.snapshot?.dataset ?? source.dataset;
  const model = buildSenaModel(analysisDataset, source.buildOptions);
  const title = source.title?.trim() || "SENA Analysis Run";
  const projectSnapshot = buildSenaProjectSnapshot(model, {
    title,
    generatedAt,
    sourceDataset: source.dataset,
    activeTemporalWindow: activeTemporalWindow as SenaTemporalWindow | null,
    humanReview: input.humanReview,
    codingReliability: input.codingReliability,
    dataGovernance: input.dataGovernance
  });
  const runtimeBundle = input.includeRuntimeBundle
    ? buildSenaRuntimeBundle(model, {
      title: `${title} Runtime Bundle`,
      generatedAt,
      sourceDataset: source.dataset,
      activeTemporalWindow
    })
    : undefined;
  const provenanceEnvelope = buildSenaAnalysisProvenanceEnvelope(model, projectSnapshot.report.modelCard);

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.analysisRun,
    generatedAt,
    provenanceEnvelope,
    source: {
      kind: source.kind,
      datasetCounts: datasetCounts(source.dataset),
      analysisDatasetCounts: datasetCounts(analysisDataset),
      activeTemporalWindow: activeTemporalWindow ? {
        id: activeTemporalWindow.id,
        label: activeTemporalWindow.label,
        stages: activeTemporalWindow.stages,
        startTurn: activeTemporalWindow.startTurn,
        endTurn: activeTemporalWindow.endTurn
      } : null
    },
    summary: {
      title,
      people: model.summary.people,
      concepts: model.summary.concepts,
      socialEdges: model.summary.socialEdges,
      conceptEdges: model.summary.conceptEdges,
      bridgeEdges: model.summary.bridgeEdges,
      activeGPairs: model.pairReport.filter((pair) => pair.totalContribution > 0).length,
      claimUse: projectSnapshot.report.claimReadinessGate.claimUse,
      claimStatus: projectSnapshot.report.claimReadinessGate.status,
      completenessStatus: projectSnapshot.report.completenessAudit.status
    },
    analysis: {
      nodes: model.nodes,
      edges: model.edges,
      matrices: model.matrices,
      socialReport: model.socialReport,
      pairReport: model.pairReport,
      temporal: model.temporal
    },
    report: projectSnapshot.report,
    projectSnapshot,
    runtimeBundle
  };
}

export type SenaAnalysisRunArtifact = ReturnType<typeof buildSenaAnalysisRun>;
