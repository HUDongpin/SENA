import { buildSenaEnaReportArtifact, buildSenaMarkdownReport, buildSenaMetricProvenanceArtifact, buildSenaPairContributionReportArtifact, buildSenaSnaReportArtifact } from "./report";
import { buildSenaRuntimeBundle, type SenaRuntimeBundleOptions } from "./runtime-bundle";
import { buildSenaMethodProtocol } from "./method-protocol";
import { buildSenaProjectSnapshot } from "./snapshot";
import { buildSenaVisualGrammarArtifact } from "./visual-grammar";
import pilotPackageManifestJson from "../../public/sena-pilot/sena-pilot-package-manifest.json";
import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import {
  getSenaReviewPacketContentKey,
  listSenaReviewPacketArtifacts,
  listSenaReviewPacketFilenames
} from "./artifact-catalog";
import type { SenaModel, SenaPilotPackageManifest, SenaReviewPacket, SenaReviewPacketAudit, SenaReviewPacketAuditItem, SenaTemporalWindow } from "./types";

export type SenaReviewPacketOptions = SenaRuntimeBundleOptions;

const pilotPackageManifest = pilotPackageManifestJson as SenaPilotPackageManifest;

const artifactManifest = listSenaReviewPacketArtifacts();

type ReviewPacketAuditInput = Pick<SenaReviewPacket, "analysisWindow" | "artifactManifest" | "contents" | "reviewGuardrails" | "schemaVersion" | "summary">;

function auditItem(
  id: string,
  label: string,
  passed: boolean,
  expected: string,
  actual: string,
  evidence: string[]
): SenaReviewPacketAuditItem {
  return {
    id,
    label,
    status: passed ? "pass" : "review",
    expected,
    actual,
    evidence
  };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function analysisScopeSummary(window: SenaTemporalWindow | null): SenaReviewPacket["summary"]["analysisScope"] {
  if (!window) {
    return {
      scope: "full-conversation",
      label: "Full conversation",
      windowId: null,
      mode: "full-conversation",
      turns: "All"
    };
  }

  return {
    scope: "temporal-window",
    label: window.label,
    windowId: window.id,
    mode: window.mode,
    turns: `${window.startTurn}-${window.endTurn}`
  };
}

function contentSchemaVersion(input: ReviewPacketAuditInput, filename: string) {
  const key = getSenaReviewPacketContentKey(filename);
  if (key === "self") return input.schemaVersion;
  if (key === "reportMarkdown") {
    return input.contents.reportMarkdown.trim().length > 0 ? "markdown" : "missing";
  }
  const content = key ? input.contents[key] : undefined;
  if (typeof content === "object" && content !== null && "schemaVersion" in content) {
    const schemaVersion = (content as { schemaVersion?: unknown }).schemaVersion;
    return typeof schemaVersion === "string" ? schemaVersion : "missing";
  }
  return "missing";
}

function buildSenaReviewPacketAudit(input: ReviewPacketAuditInput): SenaReviewPacketAudit {
  const manifestFilenames = input.artifactManifest.map((artifact) => artifact.filename);
  const expectedFilenames = listSenaReviewPacketFilenames();
  const missingArtifacts = expectedFilenames.filter((filename) => !manifestFilenames.includes(filename));
  const schemaMismatches = input.artifactManifest.filter((artifact) => contentSchemaVersion(input, artifact.filename) !== artifact.schemaVersion);
  const pilotPackage = input.contents.pilotPackageManifest;
  const packageExportCoverage = manifestFilenames.every((filename) => pilotPackage.exportArtifacts.includes(filename));
  const packageSchemaCoverage = pilotPackage.exportArtifacts.every((filename) => Boolean(pilotPackage.exportArtifactSchemas[filename]));
  const packageHandoffCheckIds = pilotPackage.handoffChecks.map((check) => check.id);
  const modelJsonHandoffCheck = pilotPackage.handoffChecks.find((check) => check.id === "model-json-export");
  const runtimeHandoffCheck = pilotPackage.handoffChecks.find((check) => check.id === "local-runtime-manifests");
  const assetIntegrityHandoffCheck = pilotPackage.handoffChecks.find((check) => check.id === "pilot-asset-integrity");
  const reviewPacketHandoffCheck = pilotPackage.handoffChecks.find((check) => check.id === "review-packet-audit");
  const pilotAssetHrefs = [...pilotPackage.assets.sample, ...pilotPackage.assets.templates];
  const pilotAssetIntegrityHrefs = pilotPackage.assetIntegrity.map((asset) => asset.href);
  const pilotAssetIntegrityCoverage = pilotPackage.assetIntegrity.length === pilotAssetHrefs.length &&
    new Set(pilotAssetIntegrityHrefs).size === pilotAssetIntegrityHrefs.length &&
    pilotAssetHrefs.every((href) => pilotAssetIntegrityHrefs.includes(href)) &&
    pilotPackage.assetIntegrity.every((asset) => {
      const expectedKind = pilotPackage.assets.sample.includes(asset.href) ? "sample" : "template";
      const expectedFormat = asset.href.endsWith(".json") ? "json" : "csv";
      return pilotAssetHrefs.includes(asset.href) &&
        asset.kind === expectedKind &&
        asset.format === expectedFormat &&
        asset.bytes > 0 &&
        /^[a-f0-9]{64}$/.test(asset.sha256);
    });
  const packageHandoffChecksReady = modelJsonHandoffCheck?.artifact === "sena-project-snapshot.json" &&
    modelJsonHandoffCheck.expectedEvidence.includes("S/W/B/G matrices") &&
    modelJsonHandoffCheck.expectedEvidence.includes("temporal trace windows") &&
    runtimeHandoffCheck?.artifact === "sena-runtime-bundle.json" &&
    runtimeHandoffCheck.expectedEvidence.includes("sena-jena-manifest.json") &&
    runtimeHandoffCheck.expectedEvidence.includes("sena-ena-report.json") &&
    runtimeHandoffCheck.expectedEvidence.includes("sena-jsna-manifest.json") &&
    runtimeHandoffCheck.expectedEvidence.includes("sena-runtime-consistency-audit.json") &&
    runtimeHandoffCheck.expectedEvidence.includes("jena-api-surface") &&
    runtimeHandoffCheck.expectedEvidence.includes("jsna-api-surface") &&
    runtimeHandoffCheck.expectedEvidence.includes("jena-rena-parity") &&
    runtimeHandoffCheck.expectedEvidence.includes("jsna-r-sna-parity") &&
    runtimeHandoffCheck.expectedEvidence.includes("matrix-fingerprints") &&
    assetIntegrityHandoffCheck?.artifact === "sena-pilot-package-manifest.json" &&
    assetIntegrityHandoffCheck.expectedEvidence.includes("assetIntegrity") &&
    assetIntegrityHandoffCheck.expectedEvidence.includes("sha256") &&
    reviewPacketHandoffCheck?.artifact === "sena-review-packet.json" &&
    reviewPacketHandoffCheck.expectedEvidence.includes("project-snapshot-handoff");
  const workflowExportArtifacts = uniqueStrings(input.contents.demoWalkthrough.steps.flatMap((step) => step.exportArtifacts));
  const verificationRequiredArtifacts = input.contents.demoVerification.summary.requiredArtifacts;
  const requiredHandoffExports = uniqueStrings([
    ...manifestFilenames,
    ...workflowExportArtifacts,
    ...verificationRequiredArtifacts
  ]);
  const missingPackageExports = requiredHandoffExports.filter((filename) => !pilotPackage.exportArtifacts.includes(filename));
  const pilotPackageReady = pilotPackage.workspaceRoute === "/workspace/sena" &&
    pilotPackage.assets.sample.length >= 6 &&
    pilotPackage.assets.templates.length >= 6 &&
    pilotPackage.assets.sample.includes(pilotPackage.sampleDataset.contract) &&
    pilotAssetIntegrityCoverage &&
    pilotPackage.runtimeRoles.jena.includes("jena-js") &&
    pilotPackage.runtimeRoles.jsna.includes("sna.js") &&
    packageExportCoverage &&
    packageSchemaCoverage &&
    packageHandoffChecksReady;
  const report = input.contents.reportJson;
  const bundle = input.contents.runtimeBundle;
  const expectedAnalysisScope = analysisScopeSummary(input.analysisWindow ?? null);
  const analysisScopeReady = input.summary.analysisScope.scope === expectedAnalysisScope.scope &&
    input.summary.analysisScope.label === expectedAnalysisScope.label &&
    input.summary.analysisScope.windowId === expectedAnalysisScope.windowId &&
    input.summary.analysisScope.mode === expectedAnalysisScope.mode &&
    input.summary.analysisScope.turns === expectedAnalysisScope.turns &&
    (report.analysisWindow?.id ?? null) === expectedAnalysisScope.windowId &&
    (bundle.analysisWindow?.id ?? null) === expectedAnalysisScope.windowId &&
    (bundle.report.analysisWindow?.id ?? null) === expectedAnalysisScope.windowId;
  const reportMatrixFingerprints = report.fusionMathAudit.matrixFingerprints;
  const bundleMatrixFingerprints = bundle.fusionMathAudit.matrixFingerprints;
  const packetMatrixFingerprints = input.contents.fusionMathAudit.matrixFingerprints;
  const fusionMatrixFingerprint = reportMatrixFingerprints.find((fingerprint) => fingerprint.id === "A_fusion");
  const matrixFingerprintsReady = JSON.stringify(reportMatrixFingerprints) === JSON.stringify(bundleMatrixFingerprints) &&
    JSON.stringify(reportMatrixFingerprints) === JSON.stringify(packetMatrixFingerprints) &&
    JSON.stringify(reportMatrixFingerprints.map((fingerprint) => fingerprint.id)) === JSON.stringify(["S", "W", "B", "G", "A_fusion"]) &&
    reportMatrixFingerprints.every((fingerprint) => fingerprint.checksumAlgorithm === "sena-stable-fnv1a32/v1" && /^0x[a-f0-9]{8}$/.test(fingerprint.checksum));
  const reportBundleConsistent = report.schemaVersion === bundle.report.schemaVersion &&
    report.generatedAt === bundle.report.generatedAt &&
    report.title === bundle.report.title &&
    report.claimReadinessGate.schemaVersion === bundle.claimReadinessGate.schemaVersion &&
    report.claimReadinessGate.status === bundle.claimReadinessGate.status &&
    report.codingReliabilityGate.schemaVersion === bundle.codingReliabilityGate.schemaVersion &&
    report.codingReliabilityGate.status === bundle.codingReliabilityGate.status &&
    report.matrices.fusion.labels.length === bundle.runtimes.sena.matrices.fusion.labels.length &&
    matrixFingerprintsReady;
  const projectSnapshot = input.contents.projectSnapshot;
  const projectSnapshotNodes = projectSnapshot.analysis.nodes ?? [];
  const projectSnapshotEdges = projectSnapshot.analysis.edges ?? [];
  const projectSnapshotEdgeLayers = Array.from(new Set(projectSnapshotEdges.map((edge) => edge.layer))).sort();
  const modelJsonReadinessItem = input.contents.pilotReadinessAudit.items.find((item) => item.id === "model-json-export");
  const projectSnapshotMatricesReady = projectSnapshot.analysis.matrices.S.raw.length === report.matrices.S.raw.length &&
    projectSnapshot.analysis.matrices.W.raw.length === report.matrices.W.raw.length &&
    projectSnapshot.analysis.matrices.B.raw.length === report.matrices.B.raw.length &&
    projectSnapshot.analysis.matrices.B.columnLabels.length === report.matrices.B.columnLabels.length &&
    projectSnapshot.analysis.matrices.G.raw.length === report.matrices.G.raw.length &&
    projectSnapshot.analysis.matrices.G.pairs.length === report.matrices.G.pairs.length &&
    projectSnapshot.analysis.matrices.fusion.labels.length === bundle.runtimes.sena.matrices.fusion.labels.length &&
    projectSnapshot.analysis.matrices.fusion.values.length === report.matrices.fusion.values.length;
  const projectSnapshotGraphReady = projectSnapshotNodes.length === report.figures.fusionGraph.nodes.length &&
    projectSnapshotEdges.length === report.figures.fusionGraph.edges.length &&
    projectSnapshotEdgeLayers.includes("social") &&
    projectSnapshotEdgeLayers.includes("concept") &&
    projectSnapshotEdgeLayers.includes("bridge");
  const projectSnapshotTemporalReady = projectSnapshot.analysis.temporalRuntimeTrace?.schemaVersion === input.contents.temporalRuntimeTrace.schemaVersion &&
    projectSnapshot.analysis.temporalRuntimeTrace.windows.length === input.contents.temporalRuntimeTrace.windows.length;
  const projectSnapshotReadinessReady = modelJsonReadinessItem?.status === "ready" &&
    modelJsonReadinessItem.evidence.includes("artifact=sena-project-snapshot.json");
  const projectSnapshotReady = projectSnapshot.reproducibility.formula === report.runtimeProvenance.senaModel.matrixFormula &&
    projectSnapshot.reproducibility.requiredRuntimes.ena.dependencySpec === report.runtimeProvenance.enaRuntime.dependencySpec &&
    projectSnapshot.reproducibility.requiredRuntimes.sna.dependencySpec === report.runtimeProvenance.snaRuntime.dependencySpec &&
    projectSnapshotMatricesReady &&
    projectSnapshotGraphReady &&
    projectSnapshotTemporalReady &&
    projectSnapshotReadinessReady &&
    (projectSnapshot.source.activeTemporalWindow?.id ?? null) === expectedAnalysisScope.windowId;
  const runtimeArtifactEvidence = Array.isArray(bundle.artifactEvidence) ? bundle.artifactEvidence : [];
  const runtimeArtifactEvidenceFilenames = new Set(runtimeArtifactEvidence.map((item) => item.filename));
  const runtimeArtifactEvidenceReady = [
    "sena-jena-manifest.json",
    "sena-ena-report.json",
    "sena-jsna-manifest.json",
    "sena-sna-report.json",
    "sena-metric-provenance.json",
    "sena-person-code-pair-g-report.json",
    "sena-runtime-consistency-audit.json",
    "sena-pilot-package-manifest.json",
    "sena-runtime-bundle.json"
  ].every((filename) => runtimeArtifactEvidenceFilenames.has(filename)) &&
    runtimeArtifactEvidence.some((item) => item.filename === "sena-jena-manifest.json" && item.handoffChecks.includes("jena-api-surface") && item.handoffChecks.includes("jena-rena-parity") && item.status === "ready") &&
    runtimeArtifactEvidence.some((item) => item.filename === "sena-ena-report.json" && item.handoffChecks.includes("jena-concept-matrix") && item.handoffChecks.includes("jena-rena-parity") && item.status === "ready") &&
    runtimeArtifactEvidence.some((item) => item.filename === "sena-jsna-manifest.json" && item.handoffChecks.includes("jsna-api-surface") && item.handoffChecks.includes("jsna-r-sna-parity") && item.status === "ready") &&
    runtimeArtifactEvidence.some((item) => item.filename === "sena-sna-report.json" && item.handoffChecks.includes("jsna-social-matrix") && item.handoffChecks.includes("jsna-r-sna-parity") && item.status === "ready") &&
    runtimeArtifactEvidence.some((item) => item.filename === "sena-pilot-package-manifest.json" && item.handoffChecks.includes("pilot-asset-integrity") && item.status === "ready") &&
    runtimeArtifactEvidence.some((item) => item.filename === "sena-runtime-bundle.json" && item.matrixCoverage.some((entry) => entry.startsWith("A_fusion=")) && item.handoffChecks.includes("matrix-fingerprints") && item.evidenceCoverage.includes("matrixFingerprints=5"));
  const standaloneRuntimeArtifactsReady = input.contents.jenaManifest.schemaVersion === report.enaManifest.schemaVersion &&
    input.contents.jenaManifest.status === report.enaManifest.status &&
    input.contents.enaReportArtifact.schemaVersion === SENA_SCHEMA_VERSIONS.enaReport &&
    input.contents.enaReportArtifact.manifest.schemaVersion === report.enaManifest.schemaVersion &&
    input.contents.enaReportArtifact.manifest.status === report.enaManifest.status &&
    input.contents.enaReportArtifact.conceptMatrix.labels.length === bundle.runtimes.sena.matrices.W.labels.length &&
    input.contents.enaReportArtifact.runtimeConsistencyAudit.status === report.runtimeConsistencyAudit.status &&
    input.contents.jsnaManifest.schemaVersion === report.snaManifest.schemaVersion &&
    input.contents.jsnaManifest.status === report.snaManifest.status &&
    input.contents.snaReportArtifact.manifest.schemaVersion === report.snaManifest.schemaVersion &&
    input.contents.snaReportArtifact.manifest.status === report.snaManifest.status &&
    input.contents.snaReportArtifact.socialReport.graph.tieCount === bundle.runtimes.sna.socialReport.graph.tieCount &&
    input.contents.snaReportArtifact.socialMatrix.labels.length === bundle.runtimes.sna.socialMatrix.labels.length &&
    input.contents.metricProvenanceArtifact.schemaVersion === SENA_SCHEMA_VERSIONS.metricProvenance &&
    input.contents.metricProvenanceArtifact.metricProvenance.length === report.validation.metricProvenance.length &&
    input.contents.metricProvenanceArtifact.socialMetricSnapshot.graph.tieCount === bundle.runtimes.sna.socialReport.graph.tieCount &&
    input.contents.metricProvenanceArtifact.epistemicMetricSnapshot.manifest.status === report.enaManifest.status &&
    input.contents.metricProvenanceArtifact.epistemicMetricSnapshot.conceptMatrix.labels.length === bundle.runtimes.sena.matrices.W.labels.length &&
    input.contents.metricProvenanceArtifact.epistemicMetricSnapshot.runtimeConsistencyAudit.status === report.runtimeConsistencyAudit.status &&
    input.contents.metricProvenanceArtifact.fusionMetricSnapshot.matrices.fusion.labels.length === bundle.runtimes.sena.matrices.fusion.labels.length &&
    input.contents.metricProvenanceArtifact.fusionMetricSnapshot.matrices.G.pairs.length === bundle.runtimes.sena.matrices.G.pairs.length &&
    input.contents.pairContributionReportArtifact.pairReport.length === bundle.runtimes.sena.pairReport.length &&
    input.contents.pairContributionReportArtifact.G.raw.length === bundle.runtimes.sena.matrices.G.raw.length &&
    input.contents.pairContributionReportArtifact.supportingMatrices.W.labels.length === bundle.runtimes.sena.matrices.W.labels.length &&
    input.contents.runtimeConsistencyAudit.schemaVersion === report.runtimeConsistencyAudit.schemaVersion &&
    input.contents.runtimeConsistencyAudit.status === report.runtimeConsistencyAudit.status &&
    input.contents.runtimeConsistencyAudit.items.some((item) => item.id === "jena-api-surface" && item.status === "pass") &&
    input.contents.runtimeConsistencyAudit.items.some((item) => item.id === "jena-rena-parity" && item.status === "pass") &&
    input.contents.runtimeConsistencyAudit.items.some((item) => item.id === "jsna-api-surface" && item.status === "pass") &&
    input.contents.runtimeConsistencyAudit.items.some((item) => item.id === "jsna-r-sna-parity" && item.status === "pass") &&
    input.contents.runtimeConsistencyAudit.items.some((item) => item.id === "jena-concept-matrix" && item.status === "pass") &&
    input.contents.runtimeConsistencyAudit.items.some((item) => item.id === "jsna-social-matrix" && item.status === "pass") &&
    input.contents.fusionMathAudit.schemaVersion === report.fusionMathAudit.schemaVersion &&
    JSON.stringify(input.contents.fusionMathAudit.matrixFingerprints) === JSON.stringify(reportMatrixFingerprints) &&
    runtimeArtifactEvidenceReady;
  const runtimeDependenciesConsistent = input.summary.localRuntimeDependencies.jena === report.runtimeProvenance.enaRuntime.dependencySpec &&
    input.summary.localRuntimeDependencies.jsna === report.runtimeProvenance.snaRuntime.dependencySpec &&
    input.summary.localRuntimeDependencies.jena.startsWith("file:vendor/") &&
    input.summary.localRuntimeDependencies.jsna.startsWith("file:vendor/");
  const evidenceReady = input.contents.evidenceLedger.snippets.length > 0 && report.evidenceSnippets.length > 0;
  const temporalMatrixFingerprintWindows = input.contents.temporalRuntimeTrace.windows.filter((entry) => entry.sena.matrixFingerprints.length === 5).length;
  const temporalFusionChecksumWindows = input.contents.temporalRuntimeTrace.windows.filter((entry) => entry.sena.matrixFingerprints.some((fingerprint) => fingerprint.id === "A_fusion" && /^0x[a-f0-9]{8}$/.test(fingerprint.checksum))).length;
  const bundleTemporalMatrixFingerprintWindows = bundle.temporalRuntimeTrace.windows.filter((entry) => entry.sena.matrixFingerprints.length === 5).length;
  const temporalFingerprintsMatch = input.contents.temporalRuntimeTrace.windows.every((entry, index) => {
    const bundleWindow = bundle.temporalRuntimeTrace.windows[index];
    return Boolean(bundleWindow) &&
      entry.window.id === bundleWindow.window.id &&
      JSON.stringify(entry.sena.matrixFingerprints) === JSON.stringify(bundleWindow.sena.matrixFingerprints);
  });
  const temporalReady = input.contents.temporalRuntimeTrace.schemaVersion === bundle.temporalRuntimeTrace.schemaVersion &&
    input.contents.temporalRuntimeTrace.windows.length === bundle.temporalRuntimeTrace.windows.length &&
    temporalMatrixFingerprintWindows === input.contents.temporalRuntimeTrace.windows.length &&
    bundleTemporalMatrixFingerprintWindows === bundle.temporalRuntimeTrace.windows.length &&
    temporalFusionChecksumWindows === input.contents.temporalRuntimeTrace.windows.length &&
    temporalFingerprintsMatch;
  const demoVerificationCompatibilityReady = input.contents.demoVerificationCompatibilityAudit.status === "compatible" &&
    input.contents.demoVerificationCompatibilityAudit.reviewNeeded === 0 &&
    input.contents.demoVerificationCompatibilityAudit.items.every((item) => item.status === "pass");
  const productionContract = input.contents.productionPageContract;
  const productionContractTextCount = productionContract.sections.reduce((total, section) => total + section.requiredText.length, 0);
  const productionContractReady = productionContract.workspaceRoute === "/workspace/sena" &&
    productionContract.sections.length >= 6 &&
    productionContract.visualChecks.length > 0 &&
    productionContractTextCount > 0 &&
    productionContract.visualChecks.every((check) => check.requiredText.trim().length > 0);
  const methodProtocol = input.contents.methodProtocol;
  const missingMethodCompanionsFromPacket = methodProtocol.requiredCompanionArtifacts.filter((filename) => !manifestFilenames.includes(filename));
  const missingMethodCompanionsFromPilotPackage = methodProtocol.requiredCompanionArtifacts.filter((filename) => !pilotPackage.exportArtifacts.includes(filename));
  const methodProtocolRuntimeHandoffIds = methodProtocol.runtimeHandoffs.map((handoff) => handoff.id);
  const methodProtocolRuntimeHandoffsReady = methodProtocol.auditSummary.runtimeConsistency.status === "consistent" &&
    methodProtocol.auditSummary.fusionMath.status === "verified" &&
    methodProtocolRuntimeHandoffIds.join("|") === "jena-concept-matrix|jsna-social-matrix|fusion-math" &&
    methodProtocol.runtimeHandoffs.every((handoff) => handoff.status === "pass") &&
    Boolean(methodProtocol.runtimeHandoffs.find((handoff) => handoff.id === "jena-concept-matrix")?.summary.includes("overlap=")) &&
    Boolean(methodProtocol.runtimeHandoffs.find((handoff) => handoff.id === "jsna-social-matrix")?.summary.includes("socialTieRows=")) &&
    Boolean(methodProtocol.runtimeHandoffs.find((handoff) => handoff.id === "fusion-math")?.summary.includes("A_fusion="));
  const developmentPlan = input.contents.developmentPlan;
  const developmentRuntimeParityIds = developmentPlan.runtimeParityEvidence.map((evidence) => evidence.id);
  const reportRuntimeParityIds = report.runtimeProvenance.parityEvidence.map((evidence) => evidence.id);
  const methodRuntimeParityIds = methodProtocol.runtimeParityEvidence.map((evidence) => evidence.id);
  const missingDevelopmentArtifactsFromPacket = developmentPlan.requiredArtifacts.filter((filename) => !manifestFilenames.includes(filename));
  const missingDevelopmentArtifactsFromPilotPackage = developmentPlan.requiredArtifacts.filter((filename) => !pilotPackage.exportArtifacts.includes(filename));
  const runtimeFoundationPhase = developmentPlan.phases.find((phase) => phase.id === "runtime-foundation");
  const researchValidationPhase = developmentPlan.phases.find((phase) => phase.id === "research-validation");
  const deliveryCandidate = developmentPlan.deliveryCandidate;
  const nextStage = developmentPlan.nextStage;
  const nextStagePhaseIds = nextStage?.phases.map((phase) => phase.id) ?? [];
  const deliveryCandidateReady = deliveryCandidate?.priority === "pilot-delivery" &&
    deliveryCandidate.horizon === "4-week-local-research-pilot" &&
    deliveryCandidate.verificationCommands.includes("npm run sena:pilot:verify") &&
    deliveryCandidate.handoffPackage.includes("sena-review-packet.json") &&
    deliveryCandidate.handoffPackage.includes("sena-runtime-bundle.json") &&
    deliveryCandidate.demoScript.some((step) => step.anchor === "#workflow-report" && step.exportArtifacts.includes("sena-review-packet.json")) &&
    deliveryCandidate.boundaries.some((boundary) => boundary.includes("local JavaScript jENA and jSNA runtimes only"));
  const nextStageReady = nextStage?.horizon === "post-delivery-candidate" &&
    nextStage.priority === "research-validation-before-platform" &&
    nextStage.baseline.command === "npm run sena:pilot:verify" &&
    nextStage.releaseGate.command === "npm run sena:pilot:verify" &&
    nextStagePhaseIds.join("|") === "pilot-handoff-freeze|researcher-walkthrough|research-validation|platform-decision-gate" &&
    nextStage.phases.find((phase) => phase.id === "pilot-handoff-freeze")?.status === "active" &&
    nextStage.phases.find((phase) => phase.id === "research-validation")?.deliverables.includes("expanded jENA/rENA parity evidence") &&
    nextStage.phases.find((phase) => phase.id === "research-validation")?.deliverables.includes("expanded jSNA/R sna parity evidence") &&
    nextStage.phases.find((phase) => phase.id === "platform-decision-gate")?.acceptanceCriteria.some((criterion) => criterion.includes("accepted bridge, native-ready, or blocked decision evidence")) &&
    nextStage.releaseGate.dataScenarios.some((scenario) => scenario.includes("Chinese and Cantonese")) &&
    nextStage.releaseGate.regressionRules.some((rule) => rule.includes("A1 Inner Solid Mesh")) &&
    nextStage.publicInterfacePolicy.some((policy) => policy.includes("/workspace/sena")) &&
    nextStage.publicInterfacePolicy.some((policy) => policy.includes("sena-project-snapshot/v1")) &&
    nextStage.assumptions.some((assumption) => assumption.includes("exploratory-only"));
  const developmentPlanReady = developmentPlan.schemaVersion === SENA_SCHEMA_VERSIONS.developmentPlan &&
    developmentPlan.workspaceRoute === "/workspace/sena" &&
    developmentPlan.milestone === "local-research-pilot" &&
    developmentPlan.runtimeIntegration.jena.dependencySpec === report.runtimeProvenance.enaRuntime.dependencySpec &&
    developmentPlan.runtimeIntegration.jsna.dependencySpec === report.runtimeProvenance.snaRuntime.dependencySpec &&
    JSON.stringify(developmentRuntimeParityIds) === JSON.stringify(reportRuntimeParityIds) &&
    JSON.stringify(developmentRuntimeParityIds) === JSON.stringify(methodRuntimeParityIds) &&
    developmentPlan.requiredArtifacts.includes("sena-development-plan.json") &&
    developmentPlan.requiredArtifacts.includes("sena-review-packet.json") &&
    developmentPlan.requiredArtifacts.includes("sena-method-protocol.json") &&
    developmentPlan.requiredArtifacts.includes("sena-pilot-package-manifest.json") &&
    developmentPlan.requiredArtifacts.includes("sena-runtime-bundle.json") &&
    missingDevelopmentArtifactsFromPacket.length === 0 &&
    missingDevelopmentArtifactsFromPilotPackage.length === 0 &&
    runtimeFoundationPhase?.status === "complete" &&
    runtimeFoundationPhase.deliverables.includes("jENA/rENA parity evidence") &&
    runtimeFoundationPhase.deliverables.includes("jSNA/R sna + igraph parity evidence") &&
    runtimeFoundationPhase.exitCriteria.some((criterion) => criterion.includes("jSNA/R sna fixture parity")) &&
    researchValidationPhase?.status === "deferred" &&
    deliveryCandidateReady &&
    Boolean(nextStageReady) &&
    developmentPlan.scope.inScope.includes("Institution production cutover acceptance evidence with native adapter certification, platform-owner bridge decisions, release-gate records, go-live rehearsal, and redacted operations handoff for database, object storage, pub/sub, audit/SIEM, backup/restore, alerting, email, IdP, and provisioning.") &&
    !developmentPlan.scope.outOfScope.some((item) =>
      item.includes("Native managed database") && item.includes("signed webhook bridge handoffs")
    );
  const methodProtocolReady = methodProtocol.schemaVersion === SENA_SCHEMA_VERSIONS.methodProtocol &&
    methodProtocol.mathematicalFrame.graphType === "normalized-typed-heterogeneous-adjacency" &&
    methodProtocol.mathematicalFrame.formula === report.runtimeProvenance.senaModel.matrixFormula &&
    methodProtocol.runtimeIntegration.jena.dependencySpec === report.runtimeProvenance.enaRuntime.dependencySpec &&
    methodProtocol.runtimeIntegration.jsna.dependencySpec === report.runtimeProvenance.snaRuntime.dependencySpec &&
    methodProtocol.runtimeIntegration.jena.apiSurface.includes("ena()") &&
    methodProtocol.runtimeIntegration.jsna.apiSurface.includes("geodist()") &&
    methodProtocol.runtimeParityEvidence.some((evidence) => evidence.id === "jena-rena-sample-parity" && evidence.status === "covered") &&
    methodProtocol.runtimeParityEvidence.some((evidence) => evidence.id === "jsna-r-sna-social-parity" && evidence.status === "covered") &&
    methodProtocol.requiredCompanionArtifacts.includes("sena-pilot-package-manifest.json") &&
    methodProtocol.requiredCompanionArtifacts.includes("sena-coding-reliability-gate.json") &&
    methodProtocol.requiredCompanionArtifacts.includes("sena-claim-readiness-gate.json") &&
    methodProtocol.requiredCompanionArtifacts.includes("sena-metric-provenance.json") &&
    methodProtocolRuntimeHandoffsReady &&
    missingMethodCompanionsFromPacket.length === 0 &&
    missingMethodCompanionsFromPilotPackage.length === 0;
  const visualGrammar = input.contents.visualGrammarArtifact;
  const visualGrammarIds = visualGrammar.visualGrammar.map((item) => item.id);
  const methodProtocolGrammarIds = methodProtocol.visualGrammar.map((item) => item.id);
  const reportGrammarIds = report.figures.visualGrammar.map((item) => item.id);
  const visualGrammarReferenceAssets = visualGrammar.referenceAssets ?? [];
  const visualGrammarReferencePaths = visualGrammarReferenceAssets.map((asset) => asset.path);
  const adoptedVisualReferenceIds = visualGrammarReferenceAssets.filter((asset) => asset.role === "adopted-reference").map((asset) => asset.id);
  const visualGrammarReady = visualGrammar.schemaVersion === SENA_SCHEMA_VERSIONS.visualGrammar &&
    visualGrammar.workspaceRoute === "/workspace/sena" &&
    visualGrammar.visualGrammar.length >= 2 &&
    visualGrammarIds.includes("fusion-canvas-a1") &&
    visualGrammarIds.includes("temporal-fusion-arc") &&
    visualGrammarReferenceAssets.length >= 4 &&
    visualGrammarReferenceAssets.every((asset) => asset.bytes > 0 && /^[a-f0-9]{64}$/.test(asset.sha256)) &&
    adoptedVisualReferenceIds.includes("a1-inner-solid-mesh-mockup") &&
    adoptedVisualReferenceIds.includes("temporal-fusion-arc-mockup") &&
    visualGrammarReferencePaths.includes("output/sena-fusion-design-options/sena-fusion-option-a1-inner-solid-mesh.png") &&
    visualGrammarReferencePaths.includes("output/sena-fusion-design-options/sena-fusion-option-c-temporal-arc.png") &&
    JSON.stringify(visualGrammarIds) === JSON.stringify(methodProtocolGrammarIds) &&
    JSON.stringify(visualGrammarIds) === JSON.stringify(reportGrammarIds) &&
    productionContract.visualChecks.some((check) => check.id === "fusion-canvas-ena-solid-link") &&
    productionContract.visualChecks.some((check) => check.id === "fusion-canvas-sna-outer-orbit") &&
    productionContract.visualChecks.some((check) => check.id === "temporal-fusion-arc");
  const analysisWindowText = report.analysisWindow
    ? `Analysis window: ${report.analysisWindow.label}`
    : "Analysis window: Full conversation";
  const markdownChecks = {
    title: input.contents.reportMarkdown.includes(`# ${report.title}`),
    runtime: input.contents.reportMarkdown.includes("## Runtime Provenance"),
    fusionMath: input.contents.reportMarkdown.includes("## Fusion Math Audit"),
    claimReadiness: input.contents.reportMarkdown.includes("## Claim Readiness Gate"),
    codingReliability: input.contents.reportMarkdown.includes("## Coding Reliability Gate"),
    analysisWindow: input.contents.reportMarkdown.includes(analysisWindowText),
    temporalTrace: input.contents.reportMarkdown.includes("## Temporal Trace")
  };
  const markdownReady = Object.values(markdownChecks).every(Boolean);
  const guardrailsReady = input.reviewGuardrails.length === bundle.interpretationGuardrails.length &&
    input.reviewGuardrails.length > 0;

  const items = [
    auditItem(
      "artifact-manifest",
      "Artifact manifest coverage",
      missingArtifacts.length === 0,
      `${expectedFilenames.length} expected artifacts`,
      `${manifestFilenames.length} manifest artifacts; missing=${missingArtifacts.length}`,
      manifestFilenames
    ),
    auditItem(
      "schema-alignment",
      "Artifact schema alignment",
      schemaMismatches.length === 0,
      "Every manifest schemaVersion matches packet content",
      schemaMismatches.length === 0 ? "all manifest schemas match" : `${schemaMismatches.length} schema mismatches`,
      input.artifactManifest.map((artifact) => `${artifact.filename}: expected=${artifact.schemaVersion}, actual=${contentSchemaVersion(input, artifact.filename)}`)
    ),
    auditItem(
      "pilot-package-manifest",
      "Pilot package manifest handoff",
      pilotPackageReady,
      "Pilot package manifest is embedded and covers sample assets, templates, asset-integrity fingerprints, local runtimes, packet artifacts, and export artifact schemas",
      `sampleAssets=${pilotPackage.assets.sample.length}; templateAssets=${pilotPackage.assets.templates.length}; assetIntegrity=${pilotPackage.assetIntegrity.length}; assetIntegrityCoverage=${pilotAssetIntegrityCoverage}; exportCoverage=${packageExportCoverage}; schemaCoverage=${packageSchemaCoverage}; handoffChecks=${pilotPackage.handoffChecks.length}`,
      [
        `package=${pilotPackage.packageName}`,
        `updatedOn=${pilotPackage.updatedOn}`,
        `sampleContract=${pilotPackage.sampleDataset.contract}`,
        `assetIntegrity=${pilotPackage.assetIntegrity.length}`,
        `assetIntegrityHrefs=${pilotAssetIntegrityHrefs.join("|")}`,
        `assetIntegrityArtifact=${assetIntegrityHandoffCheck?.artifact ?? "missing"}`,
        `assetIntegrityEvidence=${assetIntegrityHandoffCheck?.expectedEvidence.join("|") ?? "missing"}`,
        `expectedStages=${pilotPackage.sampleDataset.expectedStages.join(", ")}`,
        `runtimeRoles=${Object.keys(pilotPackage.runtimeRoles).join(", ")}`,
        `handoffChecks=${packageHandoffCheckIds.join(", ")}`,
        `modelJsonArtifact=${modelJsonHandoffCheck?.artifact ?? "missing"}`,
        `modelJsonEvidence=${modelJsonHandoffCheck?.expectedEvidence.join("|") ?? "missing"}`,
        `runtimeArtifact=${runtimeHandoffCheck?.artifact ?? "missing"}`,
        `runtimeEvidence=${runtimeHandoffCheck?.expectedEvidence.join("|") ?? "missing"}`,
        `packetArtifacts=${manifestFilenames.length}`,
        `declaredExports=${pilotPackage.exportArtifacts.length}`,
        `declaredSchemas=${Object.keys(pilotPackage.exportArtifactSchemas).length}`
      ]
    ),
    auditItem(
      "pilot-export-artifact-coverage",
      "Pilot export artifact coverage",
      missingPackageExports.length === 0,
      "Pilot package manifest declares every workflow export, verification required artifact, and review-packet artifact",
      `declaredExports=${pilotPackage.exportArtifacts.length}; requiredHandoffExports=${requiredHandoffExports.length}; missing=${missingPackageExports.length}`,
      [
        `workflowExports=${workflowExportArtifacts.length}`,
        `verificationRequiredArtifacts=${verificationRequiredArtifacts.length}`,
        `packetArtifacts=${manifestFilenames.length}`,
        ...missingPackageExports.map((filename) => `missing=${filename}`)
      ]
    ),
    auditItem(
      "analysis-scope-handoff",
      "Analysis scope handoff",
      analysisScopeReady,
      "Packet summary, report JSON, and runtime bundle carry the same full-conversation or active-window scope",
      `${input.summary.analysisScope.label}; scope=${input.summary.analysisScope.scope}; turns=${input.summary.analysisScope.turns}`,
      [
        `packetWindow=${input.analysisWindow?.id ?? "full-conversation"}`,
        `summaryWindow=${input.summary.analysisScope.windowId ?? "full-conversation"}`,
        `reportWindow=${report.analysisWindow?.id ?? "full-conversation"}`,
        `bundleWindow=${bundle.analysisWindow?.id ?? "full-conversation"}`,
        `bundleReportWindow=${bundle.report.analysisWindow?.id ?? "full-conversation"}`
      ]
    ),
    auditItem(
      "report-bundle-consistency",
      "Report and runtime bundle consistency",
      reportBundleConsistent,
      "Report JSON matches runtime bundle report metadata, claim/reliability gates, fusion dimensions, and matrix fingerprints",
      `report=${report.schemaVersion}; bundleReport=${bundle.report.schemaVersion}; claimGate=${report.claimReadinessGate.status}/${bundle.claimReadinessGate.status}; reliabilityGate=${report.codingReliabilityGate.status}/${bundle.codingReliabilityGate.status}; fusionNodes=${report.matrices.fusion.labels.length}/${bundle.runtimes.sena.matrices.fusion.labels.length}; matrixFingerprints=${reportMatrixFingerprints.length}`,
      [
        `reportTitle=${report.title}`,
        `generatedAt=${report.generatedAt}`,
        `bundleTitle=${bundle.title}`,
        `claimUse=${report.claimReadinessGate.claimUse}`,
        `codingReliability=${report.codingReliabilityGate.claimUse}`,
        `matrixFingerprintIds=${reportMatrixFingerprints.map((fingerprint) => fingerprint.id).join("|")}`,
        `A_fusionChecksum=${fusionMatrixFingerprint?.checksum ?? "missing"}`
      ]
    ),
    auditItem(
      "project-snapshot-handoff",
      "Project snapshot handoff",
      projectSnapshotReady,
      "Embedded project snapshot preserves the active scope, local runtime requirements, graph nodes, typed edges, S/W/B/G matrices, fusion matrix, temporal trace, and restorable workspace state",
      `snapshot=${projectSnapshot.schemaVersion}; window=${projectSnapshot.source.activeTemporalWindow?.id ?? "full-conversation"}; nodes=${projectSnapshotNodes.length}; edges=${projectSnapshotEdges.length}; fusionNodes=${projectSnapshot.analysis.matrices.fusion.labels.length}; modelJsonGate=${modelJsonReadinessItem?.status ?? "missing"}`,
      [
        `sourcePeople=${projectSnapshot.source.sourceDatasetCounts.people}`,
        `sourceUtterances=${projectSnapshot.source.sourceDatasetCounts.utterances}`,
        `nodes=${projectSnapshotNodes.length}`,
        `edges=${projectSnapshotEdges.length}`,
        `edgeLayers=${projectSnapshotEdgeLayers.join("|") || "none"}`,
        `S=${projectSnapshot.analysis.matrices.S.raw.length}x${projectSnapshot.analysis.matrices.S.raw[0]?.length ?? 0}`,
        `W=${projectSnapshot.analysis.matrices.W.raw.length}x${projectSnapshot.analysis.matrices.W.raw[0]?.length ?? 0}`,
        `B=${projectSnapshot.analysis.matrices.B.raw.length}x${projectSnapshot.analysis.matrices.B.raw[0]?.length ?? 0}`,
        `G=${projectSnapshot.analysis.matrices.G.raw.length}x${projectSnapshot.analysis.matrices.G.raw[0]?.length ?? 0}`,
        `A_fusion=${projectSnapshot.analysis.matrices.fusion.values.length}x${projectSnapshot.analysis.matrices.fusion.values[0]?.length ?? 0}`,
        `temporalTraceWindows=${projectSnapshot.analysis.temporalRuntimeTrace?.windows.length ?? 0}`,
        `readiness=model-json-export:${modelJsonReadinessItem?.status ?? "missing"}`,
        `jENA=${projectSnapshot.reproducibility.requiredRuntimes.ena.dependencySpec}`,
        `jSNA=${projectSnapshot.reproducibility.requiredRuntimes.sna.dependencySpec}`,
        `manualReviews=${Object.keys(projectSnapshot.workspaceState?.demoVerificationManualReviews ?? {}).length}`
      ]
    ),
    auditItem(
      "standalone-runtime-artifacts",
      "Standalone runtime artifact handoff",
      standaloneRuntimeArtifactsReady,
      "Standalone jENA manifest, ENA report, jSNA manifest, runtime consistency audit, SNA report, metric provenance, G report, coding-reliability gate, pilot package manifest, and runtime-bundle artifact evidence match the embedded report and runtime bundle",
      `jENA=${input.contents.jenaManifest.status}; enaReport=${input.contents.enaReportArtifact.manifest.status}; jSNA=${input.contents.jsnaManifest.status}; runtimeAudit=${input.contents.runtimeConsistencyAudit.status}; codingReliability=${input.contents.codingReliabilityGate.status}; artifactEvidence=${runtimeArtifactEvidence.length}; metricProvenance=${input.contents.metricProvenanceArtifact.metricProvenance.length}; snaTies=${input.contents.snaReportArtifact.socialReport.graph.tieCount}; gPairs=${input.contents.pairContributionReportArtifact.pairReport.length}`,
      [
        `jenaSchema=${input.contents.jenaManifest.schemaVersion}`,
        `enaReportSchema=${input.contents.enaReportArtifact.schemaVersion}`,
        `enaReportConceptLabels=${input.contents.enaReportArtifact.conceptMatrix.labels.length}`,
        `jsnaSchema=${input.contents.jsnaManifest.schemaVersion}`,
        `artifactEvidence=${Array.from(runtimeArtifactEvidenceFilenames).join("|")}`,
        `runtimeAuditSchema=${input.contents.runtimeConsistencyAudit.schemaVersion}`,
        `runtimeAuditItems=${input.contents.runtimeConsistencyAudit.items.length}`,
        `runtimeApiSurface=${input.contents.runtimeConsistencyAudit.items.filter((item) => item.id === "jena-api-surface" || item.id === "jsna-api-surface").map((item) => `${item.id}:${item.status}`).join("|")}`,
        `runtimeParity=${input.contents.runtimeConsistencyAudit.items.filter((item) => item.id === "jena-rena-parity" || item.id === "jsna-r-sna-parity").map((item) => `${item.id}:${item.status}`).join("|")}`,
        `runtimeArtifactHandoffs=${runtimeArtifactEvidence.map((artifact) => `${artifact.filename}:${artifact.handoffChecks.join(",")}`).join("|")}`,
        ...runtimeArtifactEvidence.map((artifact) => `runtimeArtifactHandoff=${artifact.filename}:${artifact.handoffChecks.join(",")}`),
        `fusionMathFingerprints=${input.contents.fusionMathAudit.matrixFingerprints.map((fingerprint) => `${fingerprint.id}:${fingerprint.checksum}`).join("|")}`,
        `snaSchema=${input.contents.snaReportArtifact.schemaVersion}`,
        `metricProvenanceSchema=${input.contents.metricProvenanceArtifact.schemaVersion}`,
        `metricProvenanceSources=${input.contents.metricProvenanceArtifact.coverage.bySource.map((entry) => `${entry.source}:${entry.count}`).join("|")}`,
        `gSchema=${input.contents.pairContributionReportArtifact.schemaVersion}`,
        `codingReliabilitySchema=${input.contents.codingReliabilityGate.schemaVersion}`,
        `codingReliabilityStatus=${input.contents.codingReliabilityGate.status}`,
        `GPeople=${input.contents.pairContributionReportArtifact.G.rowLabels.length}`,
        `GPairs=${input.contents.pairContributionReportArtifact.G.columnLabels.length}`,
        `WCodes=${input.contents.pairContributionReportArtifact.supportingMatrices.W.labels.length}`
      ]
    ),
    auditItem(
      "runtime-dependency-provenance",
      "Local jENA/jSNA dependency provenance",
      runtimeDependenciesConsistent,
      "Local file dependency specs are preserved in packet summary and report provenance",
      `jENA=${input.summary.localRuntimeDependencies.jena}; jSNA=${input.summary.localRuntimeDependencies.jsna}`,
      [
        `reportJena=${report.runtimeProvenance.enaRuntime.dependencySpec}`,
        `reportJsna=${report.runtimeProvenance.snaRuntime.dependencySpec}`
      ]
    ),
    auditItem(
      "evidence-handoff",
      "Evidence handoff",
      evidenceReady,
      "Evidence ledger and report evidence snippets are present",
      `ledgerSnippets=${input.contents.evidenceLedger.snippets.length}; reportSnippets=${report.evidenceSnippets.length}`,
      Object.entries(input.contents.evidenceLedger.sourceCounts).map(([source, count]) => `${source}=${count}`)
    ),
    auditItem(
      "temporal-handoff",
      "Temporal runtime handoff",
      temporalReady,
      "Temporal runtime trace matches the runtime bundle trace, including per-window S/W/B/G/A_fusion matrix fingerprints",
      `packetWindows=${input.contents.temporalRuntimeTrace.windows.length}; bundleWindows=${bundle.temporalRuntimeTrace.windows.length}; matrixFingerprintWindows=${temporalMatrixFingerprintWindows}/${input.contents.temporalRuntimeTrace.windows.length}; A_fusionChecksums=${temporalFusionChecksumWindows}; fingerprintsMatch=${temporalFingerprintsMatch}`,
      [
        `temporalMode=${input.contents.temporalRuntimeTrace.temporalSettings.mode}`,
        `bundleMatrixFingerprintWindows=${bundleTemporalMatrixFingerprintWindows}/${bundle.temporalRuntimeTrace.windows.length}`,
        `firstWindowFingerprintIds=${input.contents.temporalRuntimeTrace.windows[0]?.sena.matrixFingerprints.map((fingerprint) => fingerprint.id).join("|") ?? "none"}`,
        `firstWindowA_fusionChecksum=${input.contents.temporalRuntimeTrace.windows[0]?.sena.matrixFingerprints.find((fingerprint) => fingerprint.id === "A_fusion")?.checksum ?? "missing"}`
      ]
    ),
    auditItem(
      "demo-verification-compatibility",
      "Demo verification compatibility",
      demoVerificationCompatibilityReady,
      "Demo verification manual-review records are compatible with the active model before reapplication",
      `status=${input.contents.demoVerificationCompatibilityAudit.status}; reviewNeeded=${input.contents.demoVerificationCompatibilityAudit.reviewNeeded}`,
      input.contents.demoVerificationCompatibilityAudit.items.map((item) => `${item.label}: ${item.status}; expected=${item.expected}; actual=${item.actual}`)
    ),
    auditItem(
      "production-page-contract",
      "Production page contract handoff",
      productionContractReady,
      "Contract covers /workspace/sena required text and at least one visual guard",
      `route=${productionContract.workspaceRoute}; sections=${productionContract.sections.length}; requiredText=${productionContractTextCount}; visualChecks=${productionContract.visualChecks.length}`,
      [
        ...productionContract.sections.map((section) => `${section.label}: ${section.requiredText.length} required text item(s)`),
        ...productionContract.visualChecks.map((check) => `${check.label}: ${check.requiredText}`)
      ]
    ),
    auditItem(
      "development-plan-handoff",
      "Development plan handoff",
      developmentPlanReady,
      "Development plan preserves local-pilot scope, runtime parity evidence, required artifacts, and deferred production boundaries across packet and pilot manifest",
      `milestone=${developmentPlan.milestone}; requiredArtifacts=${developmentPlan.requiredArtifacts.length}; missingPacket=${missingDevelopmentArtifactsFromPacket.length}; missingPilot=${missingDevelopmentArtifactsFromPilotPackage.length}`,
      [
        `route=${developmentPlan.workspaceRoute}`,
        `deliveryCandidate=${deliveryCandidate?.status ?? "missing"}`,
        `deliveryHorizon=${deliveryCandidate?.horizon ?? "missing"}`,
        `nextStage=${nextStage?.status ?? "missing"}`,
        `nextStagePriority=${nextStage?.priority ?? "missing"}`,
        `nextStageReleaseGate=${nextStage?.releaseGate.command ?? "missing"}`,
        `runtimeJena=${developmentPlan.runtimeIntegration.jena.dependencySpec}`,
        `runtimeJsna=${developmentPlan.runtimeIntegration.jsna.dependencySpec}`,
        `runtimeParity=${developmentPlan.runtimeParityEvidence.map((evidence) => `${evidence.id}:${evidence.status}`).join("|")}`,
        ...developmentPlan.runtimeParityEvidence.map((evidence) => `runtimeParityEvidence=${evidence.id}:${evidence.status}`),
        ...((deliveryCandidate?.verificationCommands ?? []).map((command) => `verification=${command}`)),
        ...((deliveryCandidate?.handoffPackage ?? []).map((artifact) => `handoff=${artifact}`)),
        ...((nextStage?.phases ?? []).map((phase) => `nextStagePhase=${phase.id}:${phase.status}`)),
        `phase=${runtimeFoundationPhase?.id ?? "runtime-foundation-missing"}:${runtimeFoundationPhase?.status ?? "missing"}`,
        `phase=${researchValidationPhase?.id ?? "research-validation-missing"}:${researchValidationPhase?.status ?? "missing"}`,
        `requiredArtifacts=${developmentPlan.requiredArtifacts.join("|")}`,
        ...missingDevelopmentArtifactsFromPacket.map((filename) => `missingPacket=${filename}`),
        ...missingDevelopmentArtifactsFromPilotPackage.map((filename) => `missingPilot=${filename}`)
      ]
    ),
    auditItem(
      "method-protocol-handoff",
      "Method protocol handoff",
      methodProtocolReady,
      "Method protocol preserves the SENA formula, local runtimes, visual grammar, and declared companion artifacts across packet and pilot manifest",
      `formula=${methodProtocol.mathematicalFrame.formula}; companions=${methodProtocol.requiredCompanionArtifacts.length}; runtimeHandoffs=${methodProtocol.runtimeHandoffs.length}; missingPacket=${missingMethodCompanionsFromPacket.length}; missingPilot=${missingMethodCompanionsFromPilotPackage.length}`,
      [
        `graphType=${methodProtocol.mathematicalFrame.graphType}`,
        `jENA=${methodProtocol.runtimeIntegration.jena.dependencySpec}`,
        `jENAApi=${methodProtocol.runtimeIntegration.jena.apiSurface.join("|")}`,
        `jSNA=${methodProtocol.runtimeIntegration.jsna.dependencySpec}`,
        `jSNAApi=${methodProtocol.runtimeIntegration.jsna.apiSurface.join("|")}`,
        `runtimeConsistency=${methodProtocol.auditSummary.runtimeConsistency.status}`,
        `fusionMath=${methodProtocol.auditSummary.fusionMath.status}`,
        `runtimeHandoffs=${methodProtocolRuntimeHandoffIds.join("|")}`,
        ...methodProtocol.runtimeHandoffs.map((handoff) => `runtimeHandoff=${handoff.id}:${handoff.status}`),
        `runtimeParity=${methodProtocol.runtimeParityEvidence.map((evidence) => `${evidence.id}:${evidence.status}`).join("|")}`,
        ...methodProtocol.runtimeParityEvidence.map((evidence) => `runtimeParityEvidence=${evidence.id}:${evidence.status}`),
        `visualGrammar=${methodProtocolGrammarIds.join(", ")}`,
        ...methodProtocol.requiredCompanionArtifacts.map((filename) => `companion=${filename}`),
        ...missingMethodCompanionsFromPacket.map((filename) => `missingPacket=${filename}`),
        ...missingMethodCompanionsFromPilotPackage.map((filename) => `missingPilot=${filename}`)
      ]
    ),
    auditItem(
      "visual-grammar-handoff",
      "Visual grammar handoff",
      visualGrammarReady,
      "Standalone visual grammar artifact matches report, method protocol, and production visual checks",
      `grammarItems=${visualGrammar.visualGrammar.length}; ids=${visualGrammarIds.join(", ")}`,
      [
        `schema=${visualGrammar.schemaVersion}`,
        `route=${visualGrammar.workspaceRoute}`,
        `referenceAssets=${visualGrammarReferenceAssets.length}`,
        `adoptedReferences=${adoptedVisualReferenceIds.join("|")}`,
        ...visualGrammarReferenceAssets.map((asset) => `referenceAsset=${asset.id}:${asset.role}:${asset.path}`),
        ...visualGrammarReferenceAssets.map((asset) => `referenceAssetIntegrity=${asset.id}:${asset.bytes}:${asset.sha256}`),
        `methodProtocolIds=${methodProtocolGrammarIds.join(", ")}`,
        `reportIds=${reportGrammarIds.join(", ")}`,
        `visualChecks=${productionContract.visualChecks.map((check) => check.id).join(", ")}`,
        ...productionContract.visualChecks.map((check) => `visualCheck=${check.id}`)
      ]
    ),
    auditItem(
      "markdown-handoff",
      "Markdown handoff",
      markdownReady,
      "Markdown report includes title, analysis window, runtime provenance, fusion math audit, and temporal trace sections",
      markdownReady ? "required Markdown sections present" : "required Markdown sections missing",
      [
        `title=${markdownChecks.title}`,
        `analysisWindow=${markdownChecks.analysisWindow}`,
        `runtime=${markdownChecks.runtime}`,
        `fusionMath=${markdownChecks.fusionMath}`,
        `temporalTrace=${markdownChecks.temporalTrace}`
      ]
    ),
    auditItem(
      "guardrail-handoff",
      "Interpretation guardrail handoff",
      guardrailsReady,
      "Packet guardrails mirror runtime bundle guardrails",
      `packetGuardrails=${input.reviewGuardrails.length}; bundleGuardrails=${bundle.interpretationGuardrails.length}`,
      input.reviewGuardrails
    )
  ];
  const passed = items.filter((item) => item.status === "pass").length;

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.reviewPacketAudit,
    status: passed === items.length ? "complete" : "needs-review",
    passed,
    reviewNeeded: items.length - passed,
    items,
    notes: [
      "This audit checks the internal handoff integrity of the single-file review packet.",
      "It verifies packet structure and provenance consistency; it does not certify substantive interpretation."
    ]
  };
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertSchemaRecord(value: unknown, context: string, schemaVersion: string) {
  const record = asRecord(value, context);
  if (record.schemaVersion !== schemaVersion) {
    throw new Error(`${context} must use schemaVersion "${schemaVersion}".`);
  }
  return record;
}

function assertArray(value: unknown, context: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }
}

function assertString(value: unknown, context: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${context} must be a string.`);
  }
}

function assertStringOneOf(value: unknown, context: string, allowed: string[]) {
  assertString(value, context);
  if (!allowed.includes(value)) {
    throw new Error(`${context} must be one of: ${allowed.join(", ")}.`);
  }
}

function assertNonNegativeInteger(value: unknown, context: string) {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${context} must be a non-negative integer.`);
  }
}

function assertStringArray(value: unknown, context: string, minLength = 0): asserts value is string[] {
  assertArray(value, context);
  if (value.length < minLength) {
    throw new Error(`${context} must contain at least ${minLength} item(s).`);
  }
  value.forEach((item, index) => assertString(item, `${context}.${index}`));
}

function assertReviewPacketArtifactManifest(value: unknown) {
  assertArray(value, "review packet.artifactManifest");
  value.forEach((item, index) => {
    const artifact = asRecord(item, `review packet.artifactManifest.${index}`);
    assertString(artifact.filename, `review packet.artifactManifest.${index}.filename`);
    assertString(artifact.schemaVersion, `review packet.artifactManifest.${index}.schemaVersion`);
    assertString(artifact.description, `review packet.artifactManifest.${index}.description`);
  });
}

function assertSenaPilotPackageManifest(value: unknown, context: string): asserts value is SenaPilotPackageManifest {
  const root = assertSchemaRecord(value, context, "sena-pilot-package-manifest/v1");
  assertString(root.packageName, `${context}.packageName`);
  assertString(root.updatedOn, `${context}.updatedOn`);
  if (root.workspaceRoute !== "/workspace/sena") {
    throw new Error(`${context}.workspaceRoute must be "/workspace/sena".`);
  }

  const runtimeRoles = asRecord(root.runtimeRoles, `${context}.runtimeRoles`);
  assertString(runtimeRoles.sena, `${context}.runtimeRoles.sena`);
  assertString(runtimeRoles.jena, `${context}.runtimeRoles.jena`);
  assertString(runtimeRoles.jsna, `${context}.runtimeRoles.jsna`);

  const sampleDataset = asRecord(root.sampleDataset, `${context}.sampleDataset`);
  assertString(sampleDataset.name, `${context}.sampleDataset.name`);
  assertString(sampleDataset.contract, `${context}.sampleDataset.contract`);
  const expectedCounts = asRecord(sampleDataset.expectedCounts, `${context}.sampleDataset.expectedCounts`);
  for (const field of ["people", "interactions", "utterances", "codedSegments", "codes"]) {
    assertNonNegativeInteger(expectedCounts[field], `${context}.sampleDataset.expectedCounts.${field}`);
  }
  assertStringArray(sampleDataset.expectedStages, `${context}.sampleDataset.expectedStages`, 1);
  const expectedRuntime = asRecord(sampleDataset.expectedRuntime, `${context}.sampleDataset.expectedRuntime`);
  assertStringOneOf(expectedRuntime.jena, `${context}.sampleDataset.expectedRuntime.jena`, ["computed", "skipped"]);
  assertStringOneOf(expectedRuntime.jsna, `${context}.sampleDataset.expectedRuntime.jsna`, ["computed", "skipped"]);
  assertStringOneOf(expectedRuntime.dataContractAudit, `${context}.sampleDataset.expectedRuntime.dataContractAudit`, ["valid", "needs-review"]);
  assertStringOneOf(expectedRuntime.fusionMathAudit, `${context}.sampleDataset.expectedRuntime.fusionMathAudit`, ["verified", "needs-review"]);
  assertStringOneOf(expectedRuntime.pilotReadinessBeforeHumanReview, `${context}.sampleDataset.expectedRuntime.pilotReadinessBeforeHumanReview`, ["ready", "needs-review"]);

  const exportArtifacts = root.exportArtifacts;
  assertStringArray(exportArtifacts, `${context}.exportArtifacts`, 1);
  const exportArtifactSchemas = asRecord(root.exportArtifactSchemas, `${context}.exportArtifactSchemas`);
  for (const filename of exportArtifacts) {
    assertString(exportArtifactSchemas[filename], `${context}.exportArtifactSchemas.${filename}`);
  }
  const unknownSchemaKeys = Object.keys(exportArtifactSchemas).filter((filename) => !exportArtifacts.includes(filename));
  if (unknownSchemaKeys.length > 0) {
    throw new Error(`${context}.exportArtifactSchemas contains unknown export artifact(s): ${unknownSchemaKeys.join(", ")}.`);
  }
  const assets = asRecord(root.assets, `${context}.assets`);
  assertStringArray(assets.sample, `${context}.assets.sample`, 1);
  assertStringArray(assets.templates, `${context}.assets.templates`, 1);
  const assetHrefs = [...assets.sample, ...assets.templates];
  const assetIntegrity = root.assetIntegrity;
  assertArray(assetIntegrity, `${context}.assetIntegrity`);
  if (assetIntegrity.length !== assetHrefs.length) {
    throw new Error(`${context}.assetIntegrity must cover every sample and template asset.`);
  }
  const assetIntegrityHrefs = new Set<string>();
  assetIntegrity.forEach((item, index) => {
    const integrity = asRecord(item, `${context}.assetIntegrity.${index}`);
    assertString(integrity.href, `${context}.assetIntegrity.${index}.href`);
    assertStringOneOf(integrity.kind, `${context}.assetIntegrity.${index}.kind`, ["sample", "template"]);
    assertStringOneOf(integrity.format, `${context}.assetIntegrity.${index}.format`, ["json", "csv"]);
    assertNonNegativeInteger(integrity.bytes, `${context}.assetIntegrity.${index}.bytes`);
    if (integrity.bytes === 0) {
      throw new Error(`${context}.assetIntegrity.${index}.bytes must be greater than 0.`);
    }
    assertString(integrity.sha256, `${context}.assetIntegrity.${index}.sha256`);
    if (!/^[a-f0-9]{64}$/.test(integrity.sha256 as string)) {
      throw new Error(`${context}.assetIntegrity.${index}.sha256 must be a lowercase SHA-256 hex digest.`);
    }
    const href = integrity.href as string;
    if (!assetHrefs.includes(href)) {
      throw new Error(`${context}.assetIntegrity.${index}.href must be declared in assets.sample or assets.templates.`);
    }
    if (assetIntegrityHrefs.has(href)) {
      throw new Error(`${context}.assetIntegrity.${index}.href duplicates another assetIntegrity entry.`);
    }
    assetIntegrityHrefs.add(href);
    const expectedKind = (assets.sample as string[]).includes(href) ? "sample" : "template";
    const expectedFormat = href.endsWith(".json") ? "json" : "csv";
    if (integrity.kind !== expectedKind) {
      throw new Error(`${context}.assetIntegrity.${index}.kind must match the declared asset group.`);
    }
    if (integrity.format !== expectedFormat) {
      throw new Error(`${context}.assetIntegrity.${index}.format must match the asset extension.`);
    }
  });
  const handoffChecks = root.handoffChecks;
  assertArray(handoffChecks, `${context}.handoffChecks`);
  if (handoffChecks.length === 0) {
    throw new Error(`${context}.handoffChecks must contain at least one item.`);
  }
  handoffChecks.forEach((item, index) => {
    const check = asRecord(item, `${context}.handoffChecks.${index}`);
    assertString(check.id, `${context}.handoffChecks.${index}.id`);
    assertString(check.label, `${context}.handoffChecks.${index}.label`);
    assertString(check.artifact, `${context}.handoffChecks.${index}.artifact`);
    if (!exportArtifacts.includes(check.artifact as string)) {
      throw new Error(`${context}.handoffChecks.${index}.artifact must be declared in exportArtifacts.`);
    }
    assertStringArray(check.expectedEvidence, `${context}.handoffChecks.${index}.expectedEvidence`, 1);
  });
  assertStringArray(root.reviewGuardrails, `${context}.reviewGuardrails`, 1);
}

function assertSenaReviewPacket(value: unknown): asserts value is SenaReviewPacket {
  const root = assertSchemaRecord(value, "review packet", "sena-review-packet/v1");
  assertString(root.title, "review packet.title");
  assertString(root.generatedAt, "review packet.generatedAt");
  assertSchemaRecord(root.reviewPacketAudit, "review packet.reviewPacketAudit", "sena-review-packet-audit/v1");
  assertReviewPacketArtifactManifest(root.artifactManifest);
  assertArray(root.reviewGuardrails, "review packet.reviewGuardrails");
  assertArray(root.notes, "review packet.notes");

  const summary = asRecord(root.summary, "review packet.summary");
  const analysisScope = asRecord(summary.analysisScope, "review packet.summary.analysisScope");
  assertStringOneOf(analysisScope.scope, "review packet.summary.analysisScope.scope", ["full-conversation", "temporal-window"]);
  assertString(analysisScope.label, "review packet.summary.analysisScope.label");
  if (analysisScope.windowId !== null) assertString(analysisScope.windowId, "review packet.summary.analysisScope.windowId");
  assertStringOneOf(analysisScope.mode, "review packet.summary.analysisScope.mode", ["full-conversation", "stage", "moving-window", "turn-window"]);
  assertString(analysisScope.turns, "review packet.summary.analysisScope.turns");
  asRecord(summary.localRuntimeDependencies, "review packet.summary.localRuntimeDependencies");

  const contents = asRecord(root.contents, "review packet.contents");
  assertSchemaRecord(contents.reportJson, "review packet.contents.reportJson", "sena-report/v1");
  assertString(contents.reportMarkdown, "review packet.contents.reportMarkdown");
  assertSchemaRecord(contents.projectSnapshot, "review packet.contents.projectSnapshot", "sena-project-snapshot/v1");
  const runtimeBundle = assertSchemaRecord(contents.runtimeBundle, "review packet.contents.runtimeBundle", "sena-runtime-bundle/v1");
  assertArray(runtimeBundle.artifactEvidence, "review packet.contents.runtimeBundle.artifactEvidence");
  assertSchemaRecord(contents.jenaManifest, "review packet.contents.jenaManifest", "sena-ena-manifest/v1");
  assertSchemaRecord(contents.enaReportArtifact, "review packet.contents.enaReportArtifact", "sena-ena-report/v1");
  assertSchemaRecord(contents.jsnaManifest, "review packet.contents.jsnaManifest", "sena-jsna-manifest/v1");
  assertSchemaRecord(contents.snaReportArtifact, "review packet.contents.snaReportArtifact", "sena-sna-report/v1");
  assertSchemaRecord(contents.metricProvenanceArtifact, "review packet.contents.metricProvenanceArtifact", "sena-metric-provenance/v1");
  assertSchemaRecord(contents.pairContributionReportArtifact, "review packet.contents.pairContributionReportArtifact", "sena-person-code-pair-g-report/v1");
  assertSenaPilotPackageManifest(contents.pilotPackageManifest, "review packet.contents.pilotPackageManifest");
  assertSchemaRecord(contents.evidenceLedger, "review packet.contents.evidenceLedger", "sena-evidence-ledger/v1");
  assertSchemaRecord(contents.temporalRuntimeTrace, "review packet.contents.temporalRuntimeTrace", "sena-temporal-runtime-trace/v1");
  assertSchemaRecord(contents.dataContractAudit, "review packet.contents.dataContractAudit", "sena-data-contract-audit/v1");
  assertSchemaRecord(contents.runtimeConsistencyAudit, "review packet.contents.runtimeConsistencyAudit", "sena-runtime-consistency/v1");
  const fusionMathAudit = assertSchemaRecord(contents.fusionMathAudit, "review packet.contents.fusionMathAudit", "sena-fusion-math-audit/v1");
  assertArray(fusionMathAudit.matrixFingerprints, "review packet.contents.fusionMathAudit.matrixFingerprints");
  fusionMathAudit.matrixFingerprints.forEach((item, index) => {
    const fingerprint = asRecord(item, `review packet.contents.fusionMathAudit.matrixFingerprints.${index}`);
    assertString(fingerprint.id, `review packet.contents.fusionMathAudit.matrixFingerprints.${index}.id`);
    assertString(fingerprint.shape, `review packet.contents.fusionMathAudit.matrixFingerprints.${index}.shape`);
    assertString(fingerprint.checksumAlgorithm, `review packet.contents.fusionMathAudit.matrixFingerprints.${index}.checksumAlgorithm`);
    assertString(fingerprint.checksum, `review packet.contents.fusionMathAudit.matrixFingerprints.${index}.checksum`);
    if (fingerprint.checksumAlgorithm !== "sena-stable-fnv1a32/v1" || !/^0x[a-f0-9]{8}$/.test(fingerprint.checksum as string)) {
      throw new Error(`review packet.contents.fusionMathAudit.matrixFingerprints.${index}.checksum must use the SENA stable checksum format.`);
    }
  });
  const methodProtocol = assertSchemaRecord(contents.methodProtocol, "review packet.contents.methodProtocol", "sena-method-protocol/v1");
  assertArray(methodProtocol.runtimeParityEvidence, "review packet.contents.methodProtocol.runtimeParityEvidence");
  const visualGrammarArtifact = assertSchemaRecord(contents.visualGrammarArtifact, "review packet.contents.visualGrammarArtifact", "sena-visual-grammar/v1");
  assertArray(visualGrammarArtifact.referenceAssets, "review packet.contents.visualGrammarArtifact.referenceAssets");
  const developmentPlan = assertSchemaRecord(contents.developmentPlan, "review packet.contents.developmentPlan", "sena-development-plan/v1");
  assertArray(developmentPlan.runtimeParityEvidence, "review packet.contents.developmentPlan.runtimeParityEvidence");
  assertSchemaRecord(contents.pilotReadinessAudit, "review packet.contents.pilotReadinessAudit", "sena-pilot-readiness/v1");
  assertSchemaRecord(contents.codingReliabilityGate, "review packet.contents.codingReliabilityGate", "sena-coding-reliability-gate/v1");
  assertSchemaRecord(contents.claimReadinessGate, "review packet.contents.claimReadinessGate", "sena-claim-readiness-gate/v1");
  assertSchemaRecord(contents.demoWalkthrough, "review packet.contents.demoWalkthrough", "sena-demo-walkthrough/v1");
  assertSchemaRecord(contents.demoVerification, "review packet.contents.demoVerification", "sena-demo-verification/v1");
  assertSchemaRecord(contents.demoVerificationCompatibilityAudit, "review packet.contents.demoVerificationCompatibilityAudit", "sena-demo-verification-compatibility/v1");
  assertSchemaRecord(contents.productionPageContract, "review packet.contents.productionPageContract", "sena-production-page-contract/v1");
}

export function importSenaReviewPacket(source: string | unknown): SenaReviewPacket {
  const value = typeof source === "string" ? JSON.parse(source) : source;
  assertSenaReviewPacket(value);
  return value;
}

export function isSenaReviewPacket(value: unknown): value is SenaReviewPacket {
  try {
    assertSenaReviewPacket(value);
    return true;
  } catch {
    return false;
  }
}

export function buildSenaReviewPacket(model: SenaModel, options: SenaReviewPacketOptions = {}): SenaReviewPacket {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const baseTitle = options.title?.trim() || "SENA Review Packet";
  const runtimeBundle = buildSenaRuntimeBundle(model, {
    ...options,
    title: baseTitle,
    generatedAt,
    evidenceLimit: options.evidenceLimit ?? 500
  });
  const reportMarkdown = buildSenaMarkdownReport(runtimeBundle.report);
  const summary: SenaReviewPacket["summary"] = {
    analysisScope: analysisScopeSummary(options.activeTemporalWindow ?? null),
    pilotReadinessStatus: runtimeBundle.pilotReadinessAudit.status,
    reportCompletenessStatus: runtimeBundle.report.completenessAudit.status,
    runtimeConsistencyStatus: runtimeBundle.report.runtimeConsistencyAudit.status,
    dataContractStatus: runtimeBundle.dataContractAudit.status,
    fusionMathStatus: runtimeBundle.fusionMathAudit.status,
    claimReadinessStatus: runtimeBundle.claimReadinessGate.status,
    codingReliabilityStatus: runtimeBundle.codingReliabilityGate.status,
    jenaStatus: runtimeBundle.report.enaManifest.status,
    jsnaStatus: runtimeBundle.report.snaManifest.status,
    humanReviewStatus: runtimeBundle.report.humanReview.status,
    demoVerificationCompatibilityStatus: runtimeBundle.demoVerificationCompatibilityAudit.status,
    localRuntimeDependencies: {
      jena: runtimeBundle.runtimeProvenance.enaRuntime.dependencySpec,
      jsna: runtimeBundle.runtimeProvenance.snaRuntime.dependencySpec
    }
  };
  const methodProtocol = buildSenaMethodProtocol(model, {
    title: `${baseTitle} Method Protocol`,
    generatedAt,
    activeTemporalWindow: options.activeTemporalWindow ?? null
  });
  const visualGrammarArtifact = buildSenaVisualGrammarArtifact({
    title: `${baseTitle} Visual Grammar`,
    generatedAt,
    activeTemporalWindow: options.activeTemporalWindow ?? null
  });
  const demoVerificationManualReviews = Object.fromEntries(
    runtimeBundle.demoVerification.checks.map((check) => [check.id, check.manualReview])
  );
  const projectSnapshot = buildSenaProjectSnapshot(model, {
    ...options,
    title: `${baseTitle} Project Snapshot`,
    generatedAt,
    activeTemporalWindow: options.activeTemporalWindow ?? null,
    temporalRuntimeTrace: runtimeBundle.temporalRuntimeTrace,
    demoVerificationManualReviews
  });
  const snaReportArtifact = buildSenaSnaReportArtifact(model, {
    title: `${baseTitle} SNA Report`,
    generatedAt,
    activeTemporalWindow: options.activeTemporalWindow ?? null
  });
  const metricProvenanceArtifact = buildSenaMetricProvenanceArtifact(model, {
    title: `${baseTitle} Metric Provenance`,
    generatedAt,
    activeTemporalWindow: options.activeTemporalWindow ?? null
  });
  const pairContributionReportArtifact = buildSenaPairContributionReportArtifact(model, {
    title: `${baseTitle} Person-Code-Pair G Report`,
    generatedAt,
    activeTemporalWindow: options.activeTemporalWindow ?? null
  });
  const enaReportArtifact = buildSenaEnaReportArtifact(model, {
    title: `${baseTitle} jENA Epistemic Report`,
    generatedAt,
    activeTemporalWindow: options.activeTemporalWindow ?? null
  });
  const contents: SenaReviewPacket["contents"] = {
    reportJson: runtimeBundle.report,
    reportMarkdown,
    projectSnapshot,
    runtimeBundle,
    jenaManifest: runtimeBundle.runtimes.ena.manifest,
    enaReportArtifact,
    jsnaManifest: runtimeBundle.runtimes.sna.manifest,
    snaReportArtifact,
    metricProvenanceArtifact,
    pairContributionReportArtifact,
    pilotPackageManifest,
    evidenceLedger: runtimeBundle.evidenceLedger,
    temporalRuntimeTrace: runtimeBundle.temporalRuntimeTrace,
    dataContractAudit: runtimeBundle.dataContractAudit,
    runtimeConsistencyAudit: runtimeBundle.report.runtimeConsistencyAudit,
    fusionMathAudit: runtimeBundle.fusionMathAudit,
    methodProtocol,
    visualGrammarArtifact,
    developmentPlan: runtimeBundle.developmentPlan,
    pilotReadinessAudit: runtimeBundle.pilotReadinessAudit,
    codingReliabilityGate: runtimeBundle.codingReliabilityGate,
    claimReadinessGate: runtimeBundle.claimReadinessGate,
    demoWalkthrough: runtimeBundle.demoWalkthrough,
    demoVerification: runtimeBundle.demoVerification,
    demoVerificationCompatibilityAudit: runtimeBundle.demoVerificationCompatibilityAudit,
    productionPageContract: runtimeBundle.productionPageContract
  };
  const reviewGuardrails = runtimeBundle.interpretationGuardrails.map((guardrail) => `${guardrail.label}: ${guardrail.statement}`);
  const reviewPacketAudit = buildSenaReviewPacketAudit({
    schemaVersion: SENA_SCHEMA_VERSIONS.reviewPacket,
    analysisWindow: options.activeTemporalWindow ?? null,
    artifactManifest,
    contents,
    reviewGuardrails,
    summary
  });

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.reviewPacket,
    title: `${baseTitle} Review Packet`,
    generatedAt,
    workspaceRoute: "/workspace/sena",
    analysisWindow: options.activeTemporalWindow ?? null,
    summary,
    reviewPacketAudit,
    artifactManifest,
    contents,
    reviewGuardrails,
    notes: [
      "This packet is a single-file local research-pilot handoff for reviewers.",
      "The Markdown and JSON report are generated from the same SENA report object.",
      "Runtime bundle contents preserve local jENA/jSNA dependency provenance and S/W/B/G fusion evidence.",
      "Metric-provenance contents preserve source, parity, and interpretation-limit evidence for each reported metric.",
      "Coding-reliability contents preserve whether coding scheme, coder count, agreement evidence, adjudication, and limitations are documented.",
      "Claim-readiness contents preserve whether the current report is research-claim-ready or exploratory-only.",
      "Demo verification compatibility audit records the dataset-count and build-option gate used before reapplying manual-review records.",
      "Development plan contents preserve the local-pilot scope and deferred production boundaries.",
      "Visual grammar contents preserve adopted Fusion Canvas A1 and Temporal Fusion Arc encodings for reviewer handoff.",
      "Human review remains required before publication, assessment, or instructional decisions."
    ]
  };
}
