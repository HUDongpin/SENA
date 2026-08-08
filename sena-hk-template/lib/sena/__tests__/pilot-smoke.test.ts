import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSenaDataContractAudit,
  buildSenaDemoVerification,
  buildSenaFusionMathAudit,
  buildSenaMarkdownReport,
  buildSenaModel,
  buildSenaReport,
  buildSenaReviewPacket,
  buildSenaRuntimeBundle,
  buildSenaTemporalRuntimeTrace,
  importSenaJsonContract,
  importSenaProjectSnapshotFromHandoff,
  importSenaReviewPacket,
  lessonStudySampleUrl
} from "../index";

function readPublicHref(href: string) {
  if (!href.startsWith("/sena-pilot/")) throw new Error(`Unexpected pilot href: ${href}`);
  return readFileSync(new URL(`../../../public${href}`, import.meta.url), "utf8");
}

const documentedCodingReliability = {
  status: "documented" as const,
  reviewer: "Pilot smoke reliability",
  codingScheme: "SENA lesson-study codebook v1",
  unitOfCoding: "coded_segments",
  coderCount: 2,
  agreementMetric: "Cohen kappa",
  agreementValue: "0.82",
  adjudicationNotes: "Pilot smoke assumes adjudicated sample coding for export-chain verification.",
  limitations: "Smoke-test reliability evidence is deterministic fixture metadata."
};

const documentedDataGovernance = {
  irbApprovalId: "EDUHK-SENA-PILOT-SMOKE",
  consentScope: "Bundled de-identified lesson-study sample for local pilot verification.",
  retentionPolicy: "Retain smoke-test artifacts only for local verification and reproducibility review.",
  usageConstraints: ["no student performance ranking", "no substantive claims from smoke-test artifacts"],
  dataSteward: "Pilot smoke steward"
};

describe("SENA research pilot smoke", () => {
  it("runs the lesson-study sample through the local pilot export chain", () => {
    const imported = importSenaJsonContract(readPublicHref(lessonStudySampleUrl));
    const timelineModel = buildSenaModel(imported.dataset);
    const activeWindow = timelineModel.temporal.windows.find((window) => window.label === "Reflect") ?? timelineModel.temporal.windows[0];
    expect(activeWindow).toBeTruthy();

    const model = buildSenaModel(imported.dataset);
    const trace = buildSenaTemporalRuntimeTrace(imported.dataset, {}, {
      generatedAt: "2026-06-08T08:00:00.000Z",
      timelineModel
    });
    const report = buildSenaReport(model, {
      title: "SENA Pilot Smoke Report",
      generatedAt: "2026-06-08T08:00:00.000Z",
      evidenceLimit: 80,
      humanReview: {
        status: "human-reviewed",
        reviewer: "Pilot smoke",
        interpretation: "Smoke test confirms the local sample can generate SENA pilot artifacts.",
        limitations: "This is a deterministic demo check, not substantive validation.",
        nextActions: "Run the browser walkthrough with the research team."
      },
      codingReliability: documentedCodingReliability,
      dataGovernance: documentedDataGovernance
    });
    const bundle = buildSenaRuntimeBundle(model, {
      title: "SENA Pilot Smoke Bundle",
      generatedAt: "2026-06-08T08:00:00.000Z",
      activeTemporalWindow: activeWindow,
      sourceDataset: imported.dataset,
      temporalRuntimeTrace: trace,
      evidenceLimit: 80,
      humanReview: report.humanReview,
      codingReliability: documentedCodingReliability,
      dataGovernance: documentedDataGovernance
    });
    const verification = buildSenaDemoVerification(model, {
      title: "SENA Pilot Smoke Verification",
      generatedAt: "2026-06-08T08:00:00.000Z",
      activeTemporalWindow: activeWindow,
      pilotReadinessAudit: report.pilotReadinessAudit,
      temporalRuntimeTrace: trace
    });
    const packet = buildSenaReviewPacket(model, {
      title: "SENA Pilot Smoke Report",
      generatedAt: "2026-06-08T08:00:00.000Z",
      activeTemporalWindow: activeWindow,
      sourceDataset: imported.dataset,
      temporalRuntimeTrace: trace,
      evidenceLimit: 80,
      humanReview: report.humanReview,
      codingReliability: documentedCodingReliability,
      dataGovernance: documentedDataGovernance
    });
    const markdown = buildSenaMarkdownReport(report);

    expect(imported.warnings).toHaveLength(0);
    expect(model.summary.people).toBe(4);
    expect(trace.windows.every((entry) => entry.sena.matrixFingerprints.length === 7)).toBe(true);
    expect(trace.windows.every((entry) => entry.sena.matrixFingerprints.some((fingerprint) => fingerprint.id === "A_fusion" && /^0x[a-f0-9]{8}$/.test(fingerprint.checksum)))).toBe(true);
    expect(model.summary.concepts).toBe(7);
    expect(model.temporal.windows.map((window) => window.label)).toEqual(["Plan", "Teach", "Reflect"]);
    expect(buildSenaDataContractAudit(model.dataset, { modelWarnings: model.summary.warnings }).status).toBe("valid");
    expect(buildSenaFusionMathAudit(model).status).toBe("verified");
    expect(report.enaManifest.status).toBe("computed");
    expect(report.snaManifest.status).toBe("computed");
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jena-rena-parity")?.status).toBe("pass");
    expect(report.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-r-sna-parity")?.status).toBe("pass");
    expect(report.pilotReadinessAudit.status).toBe("ready");
    expect(report.completenessAudit.status).toBe("complete");
    expect(trace.windows).toHaveLength(model.temporal.windows.length);
    expect(trace.transitions).toHaveLength(Math.max(0, trace.windows.length - 1));
    expect(trace.transitions[0]?.delta).toHaveProperty("G");
    expect(trace.windows.every((entry) => entry.ena.status === "computed")).toBe(true);
    expect(trace.windows.every((entry) => entry.sna.status === "computed")).toBe(true);
    expect(bundle.schemaVersion).toBe("sena-runtime-bundle/v1");
    expect(bundle.artifactEvidence.map((artifact) => artifact.filename)).toContain("sena-ena-report.json");
    expect(bundle.artifactEvidence.map((artifact) => artifact.filename)).toContain("sena-sna-report.json");
    expect(bundle.artifactEvidence.map((artifact) => artifact.filename)).toContain("sena-metric-provenance.json");
    expect(bundle.artifactEvidence.map((artifact) => artifact.filename)).toContain("sena-coding-reliability-gate.json");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-ena-report.json")?.handoffChecks).toContain("jena-concept-matrix");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-ena-report.json")?.handoffChecks).toContain("jena-rena-parity");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-sna-report.json")?.handoffChecks).toContain("jsna-social-matrix");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-sna-report.json")?.handoffChecks).toContain("jsna-r-sna-parity");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-metric-provenance.json")?.handoffChecks).toContain("metric-provenance");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-metric-provenance.json")?.handoffChecks).toContain("jena-concept-matrix");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-metric-provenance.json")?.handoffChecks).toContain("fusion-matrix-snapshot");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-metric-provenance.json")?.matrixCoverage).toContain("snapshots=social|epistemic|fusion");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-coding-reliability-gate.json")?.handoffChecks).toContain("coding-reliability-gate");
    expect(bundle.artifactEvidence.find((artifact) => artifact.filename === "sena-runtime-bundle.json")?.matrixCoverage.some((entry) => entry.startsWith("A_fusion="))).toBe(true);
    expect(bundle.artifactEvidence.every((artifact) => artifact.status === "ready")).toBe(true);
    expect(bundle.codingReliabilityGate.schemaVersion).toBe("sena-coding-reliability-gate/v1");
    expect(bundle.codingReliabilityGate.status).toBe("ready");
    expect(bundle.claimReadinessGate.schemaVersion).toBe("sena-claim-readiness-gate/v1");
    expect(bundle.claimReadinessGate.status).toBe("ready");
    expect(bundle.developmentPlan.schemaVersion).toBe("sena-development-plan/v1");
    expect(bundle.developmentPlan.runtimeParityEvidence.map((evidence) => evidence.id)).toEqual(["jena-rena-sample-parity", "jsna-r-sna-social-parity"]);
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-pilot-package-manifest.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-jena-manifest.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-ena-report.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-jsna-manifest.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-runtime-consistency-audit.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-development-plan.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-production-page-contract.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-metric-provenance.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-visual-grammar.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-coding-reliability-gate.json");
    expect(bundle.developmentPlan.requiredArtifacts).toContain("sena-claim-readiness-gate.json");
    expect(bundle.demoVerification.schemaVersion).toBe("sena-demo-verification/v1");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-pilot-package-manifest.json");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-sna-report.json");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-metric-provenance.json");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-person-code-pair-g-report.json");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-demo-verification.json");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-demo-verification-compatibility-audit.json");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-production-page-contract.json");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-visual-grammar.json");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-coding-reliability-gate.json");
    expect(bundle.demoVerification.summary.requiredArtifacts).toContain("sena-claim-readiness-gate.json");
    expect(bundle.demoVerification.checks.find((check) => check.id === "sample-import")?.observedEvidence).toContain("assetIntegrity=13");
    expect(bundle.demoVerification.checks.find((check) => check.id === "sample-import")?.observedEvidence).toContain("handoff=pilot-asset-integrity");
    expect(bundle.demoVerification.checks.find((check) => check.id === "temporal-runtime")?.observedEvidence).toContain(`matrixFingerprintWindows=${trace.windows.length}/${trace.windows.length}`);
    expect(bundle.demoVerification.checks.find((check) => check.id === "temporal-runtime")?.observedEvidence).toContain(`A_fusionChecksums=${trace.windows.length}`);
    expect(bundle.demoVerificationCompatibilityAudit.status).toBe("compatible");
    expect(bundle.productionPageContract.schemaVersion).toBe("sena-production-page-contract/v1");
    expect(bundle.temporalRuntimeTrace.windows.every((entry) => entry.sena.matrixFingerprints.length === 7)).toBe(true);
    expect(packet.schemaVersion).toBe("sena-review-packet/v1");
    expect(packet.reviewPacketAudit.status).toBe("complete");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "temporal-handoff")?.actual).toContain("fingerprintsMatch=true");
    expect(packet.reviewPacketAudit.items.map((item) => item.id)).toContain("schema-alignment");
    expect(packet.reviewPacketAudit.items.map((item) => item.id)).toContain("pilot-package-manifest");
    expect(packet.reviewPacketAudit.items.map((item) => item.id)).toContain("pilot-export-artifact-coverage");
    expect(packet.reviewPacketAudit.items.map((item) => item.id)).toContain("analysis-scope-handoff");
    expect(packet.reviewPacketAudit.items.map((item) => item.id)).toContain("production-page-contract");
    expect(packet.reviewPacketAudit.items.map((item) => item.id)).toContain("method-protocol-handoff");
    expect(packet.reviewPacketAudit.items.map((item) => item.id)).toContain("visual-grammar-handoff");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.evidence).toContain("companion=sena-claim-readiness-gate.json");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.evidence).toContain("companion=sena-coding-reliability-gate.json");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "method-protocol-handoff")?.evidence).toContain("companion=sena-metric-provenance.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-review-packet.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-pilot-package-manifest.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-runtime-consistency-audit.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-ena-report.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-metric-provenance.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-method-protocol.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-development-plan.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-production-page-contract.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-visual-grammar.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-coding-reliability-gate.json");
    expect(packet.artifactManifest.map((artifact) => artifact.filename)).toContain("sena-claim-readiness-gate.json");
    expect(packet.contents.methodProtocol.schemaVersion).toBe("sena-method-protocol/v1");
    expect(packet.contents.runtimeConsistencyAudit.schemaVersion).toBe("sena-runtime-consistency/v1");
    expect(packet.contents.runtimeConsistencyAudit.status).toBe("consistent");
    expect(packet.contents.runtimeConsistencyAudit.items.find((item) => item.id === "jena-rena-parity")?.status).toBe("pass");
    expect(packet.contents.runtimeConsistencyAudit.items.find((item) => item.id === "jsna-r-sna-parity")?.status).toBe("pass");
    expect(packet.contents.enaReportArtifact.schemaVersion).toBe("sena-ena-report/v1");
    expect(packet.contents.enaReportArtifact.manifest.status).toBe("computed");
    expect(packet.contents.metricProvenanceArtifact.schemaVersion).toBe("sena-metric-provenance/v1");
    expect(packet.contents.metricProvenanceArtifact.metricProvenance).toEqual(report.validation.metricProvenance);
    expect(packet.contents.metricProvenanceArtifact.epistemicMetricSnapshot.manifest.status).toBe("computed");
    expect(packet.contents.metricProvenanceArtifact.fusionMetricSnapshot.matrices.fusion.labels.length).toBe(model.matrices.fusion.labels.length);
    expect(packet.contents.methodProtocol.requiredCompanionArtifacts).toContain("sena-claim-readiness-gate.json");
    expect(packet.contents.methodProtocol.requiredCompanionArtifacts).toContain("sena-coding-reliability-gate.json");
    expect(packet.contents.methodProtocol.requiredCompanionArtifacts).toContain("sena-metric-provenance.json");
    expect(packet.contents.methodProtocol.runtimeParityEvidence.map((evidence) => evidence.id)).toEqual(["jena-rena-sample-parity", "jsna-r-sna-social-parity"]);
    expect(packet.contents.visualGrammarArtifact.schemaVersion).toBe("sena-visual-grammar/v1");
    expect(packet.contents.visualGrammarArtifact.visualGrammar.map((item) => item.id)).toEqual(["fusion-canvas-a1", "temporal-fusion-arc", "ena-space-canonical", "workspace-shell-c3-collapsed-switcher", "fusion-plane-orbit"]);
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "a1-inner-solid-mesh-mockup")?.role).toBe("alternative-reference");
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "a1-inner-solid-mesh-mockup")?.sha256).toBe("fa123f9d29c4df8a62d02acf85045761749a3170a554b054ff5006498f1bb399");
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "temporal-fusion-arc-mockup")?.path).toBe("output/sena-fusion-design-options/sena-fusion-option-c-temporal-arc.png");
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "temporal-fusion-arc-mockup")?.bytes).toBe(675378);
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "workspace-shell-c3-collapsed-switcher-mockup")?.path).toBe("output/sena-workspace-layout-options/sena-workspace-layout-option-c2-temporal-studio-collapsed-switcher.png");
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "workspace-shell-c3-collapsed-switcher-mockup")?.bytes).toBe(145251);
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "workspace-shell-c3-collapsed-switcher-mockup")?.sha256).toBe("bc7c350686c6f3e3af9f0ed3acd3fcaee10bc423cd8be95a36bf88010392d7aa");
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "fusion-plane-orbit-mockup")?.role).toBe("adopted-reference");
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "fusion-plane-orbit-mockup")?.path).toBe("output/sena-fusion-redesign-options/sena-fusion-plane-orbit.png");
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "fusion-plane-orbit-mockup")?.bytes).toBe(176753);
    expect(packet.contents.visualGrammarArtifact.referenceAssets.find((asset) => asset.id === "fusion-plane-orbit-mockup")?.sha256).toBe("c32d860917f28f9bca822e7b2e9b9215ded6c675d89320c79642cde8a86166e6");
    expect(packet.contents.pilotPackageManifest.schemaVersion).toBe("sena-pilot-package-manifest/v1");
    expect(packet.contents.pilotPackageManifest.assets.templates).toContain("/sena-pilot/templates/coded_segments.csv");
    expect(packet.contents.developmentPlan.schemaVersion).toBe("sena-development-plan/v1");
    expect(packet.contents.developmentPlan.runtimeParityEvidence.map((evidence) => evidence.id)).toEqual(["jena-rena-sample-parity", "jsna-r-sna-social-parity"]);
    expect(packet.contents.codingReliabilityGate).toEqual(bundle.codingReliabilityGate);
    expect(packet.contents.claimReadinessGate).toEqual(bundle.claimReadinessGate);
    expect(packet.contents.productionPageContract).toEqual(bundle.productionPageContract);
    expect(packet.contents.temporalRuntimeTrace.windows.every((entry) => entry.sena.matrixFingerprints.some((fingerprint) => fingerprint.id === "A_fusion" && /^0x[a-f0-9]{8}$/.test(fingerprint.checksum)))).toBe(true);
    expect(packet.summary.localRuntimeDependencies.jena).toBe("0.6.2");
    expect(packet.summary.localRuntimeDependencies.jsna).toBe("npm:@peterhudongpin/sna.js@0.4.0");
    expect(packet.summary.analysisScope.label).toBe("Reflect");
    expect(packet.summary.analysisScope.scope).toBe("temporal-window");
    expect(packet.summary.analysisScope.windowId).toBe(activeWindow?.id);
    expect(packet.contents.reportMarkdown).toContain("## Runtime Provenance");
    expect(packet.contents.reportMarkdown).toContain("Analysis window: Reflect");
    expect(packet.contents.reportMarkdown).toContain("## Temporal Trace");
    expect(packet.reviewPacketAudit.items.find((item) => item.id === "markdown-handoff")?.evidence).toContain("temporalTrace=true");
    expect(importSenaReviewPacket(JSON.stringify(packet)).schemaVersion).toBe("sena-review-packet/v1");
    expect(importSenaProjectSnapshotFromHandoff(packet).schemaVersion).toBe("sena-project-snapshot/v1");
    expect(importSenaProjectSnapshotFromHandoff({ reviewPacket: packet }).source.activeTemporalWindow?.label).toBe("Reflect");
    expect(verification.summary.totalChecks).toBe(6);
    expect(verification.summary.automatedPass).toBe(6);
    expect(verification.summary.manualPending).toBe(6);
    expect(verification.summary.manualPassed).toBe(0);
    expect(verification.summary.manualFailed).toBe(0);
    expect(markdown).toContain("# SENA Pilot Smoke Report");
    expect(markdown).toContain("## Data Contract Audit");
    expect(markdown).toContain("## Runtime Provenance");
    expect(markdown).toContain("0.6.2");
    expect(markdown).toContain("npm:@peterhudongpin/sna.js@0.4.0");
    expect(markdown).toContain("## Fusion Math Audit");
    expect(markdown).toContain("## Temporal Trace");
    expect(markdown).toContain("Reflect");
    expect(markdown).toContain("## Human-Reviewed Interpretation");
  });
});
