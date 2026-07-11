import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import type {
  SenaDemoWalkthrough,
  SenaDemoWalkthroughStep,
  SenaModel,
  SenaPilotReadinessAudit,
  SenaTemporalRuntimeTrace,
  SenaTemporalWindow
} from "./types";

export type SenaDemoWalkthroughOptions = {
  title?: string;
  generatedAt?: string;
  activeTemporalWindow?: SenaTemporalWindow | null;
  pilotReadinessAudit: SenaPilotReadinessAudit;
  temporalRuntimeTrace: SenaTemporalRuntimeTrace;
};

const demoWorkflowDefinitions = [
  {
    id: "data-import",
    label: "Data Import",
    anchor: "#workflow-data",
    readinessItemIds: ["data-contract", "model-json-export"],
    userAction: "Load the lesson-study sample or upload the five SENA contract tables.",
    exportArtifacts: ["sena-pilot-package-manifest.json", "sena-project-snapshot.json"]
  },
  {
    id: "model-builder",
    label: "Model Builder",
    anchor: "#workflow-model",
    readinessItemIds: ["fusion-model", "model-json-export", "fusion-math"],
    userAction: "Adjust alpha, beta, gamma, normalization, edge threshold, and layer visibility, then confirm the archived formula audit and restorable model JSON export remain consistent.",
    exportArtifacts: [
      "sena-jena-manifest.json",
      "sena-ena-report.json",
      "sena-jsna-manifest.json",
      "sena-sna-report.json",
      "sena-runtime-consistency-audit.json",
      "sena-runtime-bundle.json"
    ]
  },
  {
    id: "fusion-canvas",
    label: "Fusion Canvas",
    anchor: "#workflow-canvas",
    readinessItemIds: ["fusion-model", "model-json-export"],
    userAction: "Switch Explanatory, ENA Space, and Joint layouts, then inspect a node or edge and export the model JSON snapshot.",
    exportArtifacts: ["sena-project-snapshot.json", "sena-visual-grammar.json", "sena-analysis-report.json"]
  },
  {
    id: "evidence",
    label: "Evidence",
    anchor: "#workflow-evidence",
    readinessItemIds: ["evidence-ledger"],
    userAction: "Inspect node, edge, pair, and temporal evidence before turning patterns into claims.",
    exportArtifacts: ["sena-evidence-ledger.json", "sena-person-code-pair-g-report.json"]
  },
  {
    id: "temporal-trace",
    label: "Temporal Trace",
    anchor: "#workflow-temporal",
    readinessItemIds: ["method-validation"],
    userAction: "Change temporal mode and review per-window jENA/jSNA/SENA runtime status.",
    exportArtifacts: ["sena-temporal-runtime-trace.json", "sena-runtime-bundle.json"]
  },
  {
    id: "report",
    label: "Report",
    anchor: "#workflow-report",
    readinessItemIds: ["report-completeness", "coding-reliability", "data-governance", "human-review"],
    userAction: "Fill human-review, coding-reliability, and data-governance fields, then export verification, readiness, metric provenance, coding-reliability gate, claim-readiness gate, review packet, JSON report, and Markdown report.",
    exportArtifacts: [
      "sena-demo-verification.json",
      "sena-demo-verification-compatibility-audit.json",
      "sena-production-page-contract.json",
      "sena-development-plan.json",
      "sena-pilot-readiness-audit.json",
      "sena-metric-provenance.json",
      "sena-coding-reliability-gate.json",
      "sena-claim-readiness-gate.json",
      "sena-method-protocol.json",
      "sena-fusion-math-audit.json",
      "sena-visual-grammar.json",
      "sena-review-packet.json",
      "sena-analysis-report.json",
      "sena-analysis-report.md"
    ]
  }
];

function statusForStep(
  readiness: Map<string, SenaPilotReadinessAudit["items"][number]["status"]>,
  definition: (typeof demoWorkflowDefinitions)[number],
  temporalRuntimeTrace: SenaTemporalRuntimeTrace,
  model: SenaModel
): SenaDemoWalkthroughStep["status"] {
  if (definition.id === "temporal-trace") {
    return model.temporal.windows.length > 0 && temporalRuntimeTrace.windows.length > 0 ? "ready" : "review";
  }
  return definition.readinessItemIds.every((id) => readiness.get(id) === "ready") ? "ready" : "review";
}

function evidenceForStep(
  audit: SenaPilotReadinessAudit,
  definition: (typeof demoWorkflowDefinitions)[number],
  model: SenaModel,
  temporalRuntimeTrace: SenaTemporalRuntimeTrace
) {
  const readinessEvidence = definition.readinessItemIds.flatMap((id) => (
    audit.items.find((item) => item.id === id)?.evidence ?? []
  ));

  if (definition.id === "temporal-trace") {
    return [
      `temporalWindows=${model.temporal.windows.length}`,
      `runtimeWindows=${temporalRuntimeTrace.windows.length}`,
      ...readinessEvidence
    ];
  }

  return readinessEvidence;
}

export function buildSenaDemoWalkthrough(model: SenaModel, options: SenaDemoWalkthroughOptions): SenaDemoWalkthrough {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const readiness = new Map(options.pilotReadinessAudit.items.map((item) => [item.id, item.status]));
  const steps = demoWorkflowDefinitions.map((definition) => {
    const status = statusForStep(readiness, definition, options.temporalRuntimeTrace, model);
    return {
      ...definition,
      status,
      evidence: evidenceForStep(options.pilotReadinessAudit, definition, model, options.temporalRuntimeTrace)
    };
  });
  const readySteps = steps.filter((step) => step.status === "ready").length;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.demoWalkthrough,
    title: options.title?.trim() || "SENA Local Demo Walkthrough",
    generatedAt,
    workspaceRoute: "/workspace/sena",
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
    summary: {
      totalSteps: steps.length,
      readySteps,
      reviewSteps: steps.length - readySteps,
      pilotReadinessStatus: options.pilotReadinessAudit.status
    },
    steps,
    notes: [
      "This walkthrough records the local demo path for researchers and education pilot users.",
      "Ready/review labels reuse the same pilot-readiness evidence that gates exported research artifacts.",
      "Human review remains required before publication, assessment, or instructional decisions."
    ]
  };
}
