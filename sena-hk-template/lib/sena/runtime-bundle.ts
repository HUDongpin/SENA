import { buildSenaEvidenceLedger, buildSenaReport, type SenaEvidenceLedgerOptions } from "./report";
import { buildSenaDemoWalkthrough } from "./demo-walkthrough";
import { buildSenaDemoVerification, buildSenaDemoVerificationCompatibilityAudit } from "./demo-verification";
import { buildSenaDevelopmentPlan } from "./development-plan";
import { buildSenaProductionPageContract } from "./production-page-contract";
import { buildSenaTemporalRuntimeTrace } from "./temporal-runtime";
import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import pilotPackageManifestJson from "../../public/sena-pilot/sena-pilot-package-manifest.json";
import type { SenaDataset, SenaDemoVerificationCheck, SenaEvidenceLedger, SenaModel, SenaPilotPackageManifest, SenaReport, SenaRuntimeArtifactEvidenceItem, SenaRuntimeBundle, SenaTemporalRuntimeTrace } from "./types";

export type SenaRuntimeBundleOptions = SenaEvidenceLedgerOptions & {
  sourceDataset?: SenaDataset;
  temporalRuntimeTrace?: SenaTemporalRuntimeTrace;
  demoVerificationManualReviews?: Record<string, Partial<SenaDemoVerificationCheck["manualReview"]>>;
};

const pilotPackageManifest = pilotPackageManifestJson as SenaPilotPackageManifest;

export const SENA_RUNTIME_ARTIFACT_FILENAME = Object.freeze({
  jenaManifest: "sena-jena-manifest.json",
  enaReport: "sena-ena-report.json",
  jsnaManifest: "sena-jsna-manifest.json",
  snaReport: "sena-sna-report.json",
  metricProvenance: "sena-metric-provenance.json",
  personCodePairGReport: "sena-person-code-pair-g-report.json",
  runtimeConsistencyAudit: "sena-runtime-consistency-audit.json",
  pilotPackageManifest: "sena-pilot-package-manifest.json",
  codingReliabilityGate: "sena-coding-reliability-gate.json",
  runtimeBundle: "sena-runtime-bundle.json"
} as const);

export const SENA_RUNTIME_ARTIFACT_FILENAMES = Object.freeze(
  Object.values(SENA_RUNTIME_ARTIFACT_FILENAME)
);

export function buildSenaCodingReliabilityRuntimeArtifactEvidence(
  report: Pick<SenaReport, "codingReliabilityGate" | "runtimeProvenance">
): SenaRuntimeArtifactEvidenceItem {
  const gate = report.codingReliabilityGate;
  return {
    filename: SENA_RUNTIME_ARTIFACT_FILENAME.codingReliabilityGate,
    schemaVersion: gate.schemaVersion,
    runtimeRole: "review-handoff",
    sourceRuntime: report.runtimeProvenance.senaModel.engine,
    downloadControl: "Export reliability gate",
    status: gate.status === "ready" ? "ready" : "review",
    matrixCoverage: [
      `claimUse=${gate.claimUse}`,
      `coderCount=${gate.review.coderCount}`,
      `blockers=${gate.blockers.length}`
    ],
    evidenceCoverage: [...gate.evidence],
    handoffChecks: [
      "coding-reliability-gate",
      "coding-scheme",
      "agreement-evidence",
      "adjudication-notes"
    ]
  };
}

export function buildSenaRuntimeArtifactEvidence(
  model: Pick<SenaModel, "matrices" | "pairReport" | "socialReport">,
  report: SenaReport,
  evidenceLedger: SenaEvidenceLedger,
  temporalRuntimeTrace: SenaTemporalRuntimeTrace
): SenaRuntimeArtifactEvidenceItem[] {
  const jenaConceptAudit = report.runtimeConsistencyAudit.items.find((item) => item.id === "jena-concept-matrix");
  const jenaRenaParityAudit = report.runtimeConsistencyAudit.items.find((item) => item.id === "jena-rena-parity");
  const jsnaSocialAudit = report.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-social-matrix");
  const jsnaRParityAudit = report.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-r-sna-parity");
  const runtimeAuditReady = report.runtimeConsistencyAudit.status === "consistent";
  const evidenceReady = evidenceLedger.snippets.length > 0;
  const temporalReady = temporalRuntimeTrace.windows.some((window) => window.ena.status === "computed" && window.sna.status === "computed");
  const fusionMatrixFingerprint = report.fusionMathAudit.matrixFingerprints.find((fingerprint) => fingerprint.id === "A_fusion");
  const pilotAssetHrefs = [...pilotPackageManifest.assets.sample, ...pilotPackageManifest.assets.templates];
  const pilotAssetIntegrityReady = pilotPackageManifest.assetIntegrity.length === pilotAssetHrefs.length &&
    pilotAssetHrefs.every((href) => pilotPackageManifest.assetIntegrity.some((asset) => asset.href === href)) &&
    pilotPackageManifest.assetIntegrity.every((asset) => /^[a-f0-9]{64}$/.test(asset.sha256) && asset.bytes > 0);

  return [
    {
      filename: SENA_RUNTIME_ARTIFACT_FILENAME.jenaManifest,
      schemaVersion: report.enaManifest.schemaVersion,
      runtimeRole: "jena-epistemic",
      sourceRuntime: report.runtimeProvenance.enaRuntime.engine,
      downloadControl: "Export jENA manifest",
      status: report.enaManifest.status === "computed" ? "ready" : "review",
      matrixCoverage: [
        `codes=${report.enaManifest.datasetCounts.codes}`,
        `connectionCounts=${report.enaManifest.outputs?.connectionCounts.length ?? 0}`,
        `lineWeights=${report.enaManifest.outputs?.lineWeights.length ?? 0}`
      ],
      evidenceCoverage: [
        `rows=${report.enaManifest.datasetCounts.rows}`,
        `units=${report.enaManifest.datasetCounts.units}`,
        `dimensions=${report.enaManifest.outputs?.dimensions.join("|") || "NA"}`
      ],
      handoffChecks: [
        "jena-api-surface",
        "jena-local-dependency",
        "jena-rena-parity",
        "jena-manifest-status"
      ]
    },
    {
      filename: SENA_RUNTIME_ARTIFACT_FILENAME.enaReport,
      schemaVersion: SENA_SCHEMA_VERSIONS.enaReport,
      runtimeRole: "jena-epistemic",
      sourceRuntime: report.runtimeProvenance.enaRuntime.engine,
      downloadControl: "Export ENA report",
      status: report.enaManifest.status === "computed" && jenaConceptAudit?.status === "pass" && jenaRenaParityAudit?.status === "pass" ? "ready" : "review",
      matrixCoverage: [
        `W=${model.matrices.W.raw.length}x${model.matrices.W.raw[0]?.length ?? 0}`,
        `conceptLabels=${model.matrices.W.labels.length}`,
        `conceptPairAudit=${jenaConceptAudit?.status ?? "missing"}`,
        `rENAParity=${jenaRenaParityAudit?.status ?? "missing"}`
      ],
      evidenceCoverage: [
        `connectionCounts=${report.enaManifest.outputs?.connectionCounts.length ?? 0}`,
        `nodePositions=${report.enaManifest.outputs?.nodePositions.length ?? 0}`,
        `lineWeights=${report.enaManifest.outputs?.lineWeights.length ?? 0}`
      ],
      handoffChecks: [
        "jena-rena-parity",
        "jena-concept-matrix",
        "sena-ena-report/v1"
      ]
    },
    {
      filename: SENA_RUNTIME_ARTIFACT_FILENAME.jsnaManifest,
      schemaVersion: report.snaManifest.schemaVersion,
      runtimeRole: "jsna-social",
      sourceRuntime: report.runtimeProvenance.snaRuntime.engine,
      downloadControl: "Export jSNA manifest",
      status: report.snaManifest.status === "computed" ? "ready" : "review",
      matrixCoverage: [
        `people=${report.snaManifest.datasetCounts.people}`,
        `weightedTies=${report.snaManifest.datasetCounts.weightedTies}`,
        `components=${report.snaManifest.datasetCounts.components}`
      ],
      evidenceCoverage: [
        `actorMetrics=${report.snaManifest.outputs?.actorMetrics.length ?? 0}`,
        `communities=${report.snaManifest.datasetCounts.communities}`,
        `density=${report.snaManifest.outputs?.graph.density ?? 0}`
      ],
      handoffChecks: [
        "jsna-api-surface",
        "jsna-local-dependency",
        "jsna-r-sna-parity",
        "jsna-manifest-status"
      ]
    },
    {
      filename: SENA_RUNTIME_ARTIFACT_FILENAME.snaReport,
      schemaVersion: SENA_SCHEMA_VERSIONS.snaReport,
      runtimeRole: "jsna-social",
      sourceRuntime: report.runtimeProvenance.snaRuntime.engine,
      downloadControl: "Export SNA report",
      status: report.snaManifest.status === "computed" && jsnaSocialAudit?.status === "pass" && jsnaRParityAudit?.status === "pass" ? "ready" : "review",
      matrixCoverage: [
        `S=${model.matrices.S.raw.length}x${model.matrices.S.raw[0]?.length ?? 0}`,
        `socialLabels=${model.matrices.S.labels.length}`,
        `socialMatrixAudit=${jsnaSocialAudit?.status ?? "missing"}`,
        `RSnaParity=${jsnaRParityAudit?.status ?? "missing"}`
      ],
      evidenceCoverage: [
        `tieCount=${model.socialReport.graph.tieCount}`,
        `actorMetrics=${model.socialReport.actors.length}`,
        `communities=${model.socialReport.communities.length}`
      ],
      handoffChecks: [
        "jsna-r-sna-parity",
        "jsna-social-matrix",
        "sena-sna-report/v1"
      ]
    },
    {
      filename: SENA_RUNTIME_ARTIFACT_FILENAME.metricProvenance,
      schemaVersion: SENA_SCHEMA_VERSIONS.metricProvenance,
      runtimeRole: "review-handoff",
      sourceRuntime: "sna.js+sena-js+jena-js",
      downloadControl: "Export metric provenance",
      status: report.validation.metricProvenance.length > 0 ? "ready" : "review",
      matrixCoverage: [
        `metrics=${report.validation.metricProvenance.length}`,
        `sources=${new Set(report.validation.metricProvenance.map((metric) => metric.source)).size}`,
        `scopes=${new Set(report.validation.metricProvenance.map((metric) => metric.scope)).size}`,
        "snapshots=social|epistemic|fusion"
      ],
      evidenceCoverage: report.validation.metricProvenance.map((metric) => `${metric.id}:${metric.source}`),
      handoffChecks: [
        "metric-provenance",
        "metric-parity-status",
        "interpretation-limits",
        "jsna-social-matrix",
        "jena-concept-matrix",
        "fusion-matrix-snapshot"
      ]
    },
    {
      filename: SENA_RUNTIME_ARTIFACT_FILENAME.personCodePairGReport,
      schemaVersion: SENA_SCHEMA_VERSIONS.personCodePairGReport,
      runtimeRole: "sena-fusion",
      sourceRuntime: report.runtimeProvenance.senaModel.engine,
      downloadControl: "Export G report",
      status: model.matrices.G.pairs.length > 0 && evidenceReady ? "ready" : "review",
      matrixCoverage: [
        `G=${model.matrices.G.raw.length}x${model.matrices.G.raw[0]?.length ?? 0}`,
        `pairs=${model.matrices.G.pairs.length}`,
        `supporting=S|W|B`
      ],
      evidenceCoverage: [
        `pairReport=${model.pairReport.length}`,
        `evidenceSnippets=${evidenceLedger.snippets.length}`,
        `topPair=${model.pairReport[0]?.label ?? "NA"}`
      ],
      handoffChecks: [
        "g-pair-coverage",
        "sena-person-code-pair-g-report/v1"
      ]
    },
    {
      filename: SENA_RUNTIME_ARTIFACT_FILENAME.runtimeConsistencyAudit,
      schemaVersion: report.runtimeConsistencyAudit.schemaVersion,
      runtimeRole: "review-handoff",
      sourceRuntime: "jena-js+sna.js+sena-js",
      downloadControl: "Export runtime audit",
      status: runtimeAuditReady ? "ready" : "review",
      matrixCoverage: [
        `auditStatus=${report.runtimeConsistencyAudit.status}`,
        `passed=${report.runtimeConsistencyAudit.passed}`,
        `review=${report.runtimeConsistencyAudit.reviewNeeded}`
      ],
      evidenceCoverage: report.runtimeConsistencyAudit.items.map((item) => `${item.id}:${item.status}`),
      handoffChecks: [
        "jena-api-surface",
        "jsna-api-surface",
        "jena-rena-parity",
        "jsna-r-sna-parity",
        "jena-concept-matrix",
        "jsna-social-matrix",
        "runtime-consistency"
      ]
    },
    {
      filename: SENA_RUNTIME_ARTIFACT_FILENAME.pilotPackageManifest,
      schemaVersion: pilotPackageManifest.schemaVersion,
      runtimeRole: "review-handoff",
      sourceRuntime: "sena-pilot-package",
      downloadControl: "Package manifest",
      status: pilotAssetIntegrityReady ? "ready" : "review",
      matrixCoverage: [
        `sampleAssets=${pilotPackageManifest.assets.sample.length}`,
        `templateAssets=${pilotPackageManifest.assets.templates.length}`,
        `assetIntegrity=${pilotPackageManifest.assetIntegrity.length}`
      ],
      evidenceCoverage: [
        `sha256=${pilotPackageManifest.assetIntegrity.filter((asset) => /^[a-f0-9]{64}$/.test(asset.sha256)).length}`,
        `bytes=${pilotPackageManifest.assetIntegrity.filter((asset) => asset.bytes > 0).length}`,
        `handoffChecks=${pilotPackageManifest.handoffChecks.length}`
      ],
      handoffChecks: [
        "pilot-asset-integrity",
        "assetIntegrity",
        "sha256"
      ]
    },
    buildSenaCodingReliabilityRuntimeArtifactEvidence(report),
    {
      filename: SENA_RUNTIME_ARTIFACT_FILENAME.runtimeBundle,
      schemaVersion: SENA_SCHEMA_VERSIONS.runtimeBundle,
      runtimeRole: "sena-model",
      sourceRuntime: report.runtimeProvenance.senaModel.engine,
      downloadControl: "Export runtime bundle",
      status: runtimeAuditReady && temporalReady ? "ready" : "review",
      matrixCoverage: [
        `S=${model.matrices.S.labels.length}`,
        `W=${model.matrices.W.labels.length}`,
        `B=${model.matrices.B.rowLabels.length}x${model.matrices.B.columnLabels.length}`,
        `B_PC=${model.matrices.B_PC.rowLabels.length}x${model.matrices.B_PC.columnLabels.length}`,
        `B_CP=${model.matrices.B_CP.rowLabels.length}x${model.matrices.B_CP.columnLabels.length}`,
        `G=${model.matrices.G.pairs.length}`,
        `A_fusion=${model.matrices.fusion.labels.length}`
      ],
      evidenceCoverage: [
        `temporalWindows=${temporalRuntimeTrace.windows.length}`,
        `evidenceSnippets=${evidenceLedger.snippets.length}`,
        `reportCompleteness=${report.completenessAudit.status}`,
        `matrixFingerprints=${report.fusionMathAudit.matrixFingerprints.length}`,
        `A_fusionChecksum=${fusionMatrixFingerprint?.checksum ?? "missing"}`
      ],
      handoffChecks: [
        "sena-runtime-bundle/v1",
        "sena-report/v1",
        "temporal-runtime-trace",
        "matrix-fingerprints"
      ]
    }
  ];
}

export function buildSenaRuntimeBundle(model: SenaModel, options: SenaRuntimeBundleOptions = {}): SenaRuntimeBundle {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const title = options.title?.trim() || "SENA Runtime Bundle";
  const report = buildSenaReport(model, {
    ...options,
    title,
    generatedAt
  });
  const evidenceLedger = buildSenaEvidenceLedger(model, {
    ...options,
    title: `${title} Evidence Ledger`,
    generatedAt,
    evidenceLimit: options.evidenceLimit ?? 500
  });
  const temporalRuntimeTrace = options.temporalRuntimeTrace ?? buildSenaTemporalRuntimeTrace(
    options.sourceDataset ?? model.dataset,
    model.options,
    { generatedAt }
  );
  const demoWalkthrough = buildSenaDemoWalkthrough(model, {
    title: `${title} Demo Walkthrough`,
    generatedAt,
    activeTemporalWindow: options.activeTemporalWindow ?? null,
    pilotReadinessAudit: report.pilotReadinessAudit,
    temporalRuntimeTrace
  });
  const demoVerification = buildSenaDemoVerification(model, {
    title: `${title} Demo Verification`,
    generatedAt,
    activeTemporalWindow: options.activeTemporalWindow ?? null,
    pilotReadinessAudit: report.pilotReadinessAudit,
    temporalRuntimeTrace,
    manualReviews: options.demoVerificationManualReviews
  });
  const demoVerificationCompatibilityAudit = buildSenaDemoVerificationCompatibilityAudit(model, demoVerification);
  const developmentPlan = buildSenaDevelopmentPlan(model, {
    title: `${title} Development Plan`,
    generatedAt,
    activeTemporalWindow: options.activeTemporalWindow ?? null,
    pilotReadinessAudit: report.pilotReadinessAudit,
    demoWalkthrough,
    demoVerification
  });
  const artifactEvidence = buildSenaRuntimeArtifactEvidence(model, report, evidenceLedger, temporalRuntimeTrace);

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.runtimeBundle,
    title,
    generatedAt,
    analysisWindow: options.activeTemporalWindow ?? null,
    parameters: report.parameters,
    runtimeProvenance: report.runtimeProvenance,
    interpretationGuardrails: report.interpretationGuardrails,
    summary: report.summary,
    runtimes: {
      sena: {
        ...report.runtimeProvenance.senaModel,
        matrices: model.matrices,
        temporal: model.temporal,
        pairReport: model.pairReport,
        operatorDiagnostics: model.operatorDiagnostics
      },
      ena: {
        ...report.runtimeProvenance.enaRuntime,
        manifest: report.enaManifest
      },
      sna: {
        ...report.runtimeProvenance.snaRuntime,
        manifest: report.snaManifest,
        socialReport: model.socialReport,
        socialMatrix: model.matrices.S
      }
    },
    validation: report.validation,
    modelCard: report.modelCard,
    codingReliabilityGate: report.codingReliabilityGate,
    dataContractAudit: report.dataContractAudit,
    fusionMathAudit: report.fusionMathAudit,
    pilotReadinessAudit: report.pilotReadinessAudit,
    claimReadinessGate: report.claimReadinessGate,
    developmentPlan,
    demoWalkthrough,
    demoVerification,
    demoVerificationCompatibilityAudit,
    productionPageContract: buildSenaProductionPageContract(),
    temporalRuntimeTrace,
    evidenceLedger,
    artifactEvidence,
    report
  };
}
