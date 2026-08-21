import { describe, expect, it } from "vitest";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildSenaReviewPacket } from "../review-packet";
import type { SenaReviewPacket } from "../types";
import {
  assertSenaReportHolderStructure,
  assertSenaRuntimeBundleHolderStructure
} from "../statistical-holder-structure";
import {
  importSenaReport,
  importSenaRuntimeBundle,
  isSenaReport,
  isSenaRuntimeBundle,
  normalizeSenaReportStatisticalLeaves,
  normalizeSenaRuntimeBundleStatisticalLeaves
} from "../statistical-leaf-read";
import { loadSena14bb306ReviewPacketFixture } from "./fixtures/sena-14bb306-fixture";

function currentHolders() {
  const packet = buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: lessonStudySenaContract
  });
  return {
    report: packet.contents.reportJson,
    runtime: packet.contents.runtimeBundle
  };
}

type MutableRecord = Record<string, any>;

const reportCases: Array<{
  label: string;
  mutate: (report: MutableRecord) => void;
  message: string;
}> = [
  {
    label: "nested scalar",
    mutate: (report) => { report.figures.fusionGraph.nodes[0].label = 42; },
    message: "SENA report.figures.fusionGraph.nodes[0].label must be a string."
  },
  {
    label: "nested enum",
    mutate: (report) => { report.figures.fusionGraph.edges[0].layer = "causal"; },
    message: "SENA report.figures.fusionGraph.edges[0].layer must be one of social, concept, bridge."
  },
  {
    label: "nested array member",
    mutate: (report) => { report.pairReport[0].topContributors[0] = null; },
    message: "SENA report.pairReport[0].topContributors[0] must be an object."
  },
  {
    label: "nullable object shape",
    mutate: (report) => { report.figures.activeWindowComparison = {}; },
    message: "SENA report.figures.activeWindowComparison.currentWindow is required."
  },
  {
    label: "build-option enum",
    mutate: (report) => { report.parameters.buildOptions.direction = "sideways"; },
    message: "SENA report.parameters.buildOptions.direction must be one of directed, undirected."
  },
  {
    label: "runtime provenance sample scalar",
    mutate: (report) => { report.runtimeProvenance.parityEvidence[0].sample.units = "many"; },
    message: "SENA report.runtimeProvenance.parityEvidence[0].sample.units must be a finite number."
  },
  {
    label: "operator config scalar",
    mutate: (report) => { report.operatorDiagnostics.analysisConfig.d = "two"; },
    message: "SENA report.operatorDiagnostics.analysisConfig.d must be a finite number."
  },
  {
    label: "operator normalization scalar",
    mutate: (report) => { report.operatorDiagnostics.normalization.S.divisor = "max"; },
    message: "SENA report.operatorDiagnostics.normalization.S.divisor must be a finite number."
  },
  {
    label: "ENA manifest array member",
    mutate: (report) => { report.enaManifest.source.unitColumns = [42]; },
    message: "SENA report.enaManifest.source.unitColumns must contain only strings."
  },
  {
    label: "SNA manifest boolean",
    mutate: (report) => { report.snaManifest.source.undirectedSocial = "yes"; },
    message: "SENA report.snaManifest.source.undirectedSocial must be a boolean."
  },
  {
    label: "social graph enum",
    mutate: (report) => { report.socialReport.graph.mode = "network"; },
    message: "SENA report.socialReport.graph.mode must be one of graph, digraph."
  },
  {
    label: "social actor scalar",
    mutate: (report) => { report.socialReport.actors[0].degree = "high"; },
    message: "SENA report.socialReport.actors[0].degree must be a finite number."
  },
  {
    label: "validation enum",
    mutate: (report) => { report.validation.metricProvenance[0].scope = "unknown"; },
    message: "SENA report.validation.metricProvenance[0].scope must be one of social-graph, social-actor, community, bridge, concept, fusion."
  },
  {
    label: "validation preview member",
    mutate: (report) => { report.validation.nullModels.permutation.samplesPreview = ["x"]; },
    message: "SENA report.validation.nullModels.permutation.samplesPreview must contain only finite numbers."
  },
  {
    label: "model-card section enum",
    mutate: (report) => { report.modelCard.sections[0].status = "verified"; },
    message: "SENA report.modelCard.sections[0].status must be one of complete, needs-review."
  },
  {
    label: "model-card count scalar",
    mutate: (report) => { report.modelCard.dataset.counts.people = "many"; },
    message: "SENA report.modelCard.dataset.counts.people must be a finite number."
  },
  {
    label: "audit item enum",
    mutate: (report) => { report.completenessAudit.items[0].status = "ok"; },
    message: "SENA report.completenessAudit.items[0].status must be one of pass, review."
  },
  {
    label: "claim item enum",
    mutate: (report) => { report.claimReadinessGate.items[0].status = "pass"; },
    message: "SENA report.claimReadinessGate.items[0].status must be one of ready, review."
  },
  {
    label: "governance enum",
    mutate: (report) => { report.dataGovernance.status = "verified"; },
    message: "SENA report.dataGovernance.status must be one of complete, needs-review."
  },
  {
    label: "evidence source enum",
    mutate: (report) => { report.evidenceSnippets[0].source = "causal"; },
    message: "SENA report.evidenceSnippets[0].source must be one of social-edge, concept-edge, bridge-edge, pair-contribution, temporal-window."
  },
  {
    label: "human-review enum",
    mutate: (report) => { report.humanReview.status = "approved"; },
    message: "SENA report.humanReview.status must be one of draft, human-reviewed."
  },
  {
    label: "optional strongest-edge union",
    mutate: (report) => { report.summary.strongestSocialTie = 7; },
    message: "SENA report.summary.strongestSocialTie must be an object."
  },
  {
    label: "temporal narrative scalar",
    mutate: (report) => { report.figures.temporalRuntimeNarrative[0].windowId = 42; },
    message: "SENA report.figures.temporalRuntimeNarrative[0].windowId must be a string."
  },
  {
    label: "visual-grammar enum",
    mutate: (report) => { report.figures.visualGrammar[0].id = "invented"; },
    message: "SENA report.figures.visualGrammar[0].id must be one of fusion-canvas-a1, temporal-fusion-arc, ena-space-canonical, workspace-shell-c3-collapsed-switcher, fusion-plane-orbit."
  }
];

const runtimeCases: Array<{
  label: string;
  mutate: (runtime: MutableRecord) => void;
  message: string;
}> = [
  {
    label: "nested scalar",
    mutate: (runtime) => { runtime.artifactEvidence[0].filename = 42; },
    message: "SENA runtime bundle.artifactEvidence[0].filename must be a string."
  },
  {
    label: "nested enum",
    mutate: (runtime) => { runtime.developmentPlan.currentGate.pilotReadinessStatus = "verified"; },
    message: "SENA runtime bundle.developmentPlan.currentGate.pilotReadinessStatus must be one of ready, needs-review."
  },
  {
    label: "nested array member",
    mutate: (runtime) => { runtime.demoWalkthrough.steps[0].readinessItemIds = [42]; },
    message: "SENA runtime bundle.demoWalkthrough.steps[0].readinessItemIds must contain only strings."
  },
  {
    label: "nullable object shape",
    mutate: (runtime) => { runtime.demoVerification.analysisWindow = {}; },
    message: "SENA runtime bundle.demoVerification.analysisWindow.id is required."
  },
  {
    label: "runtime engine scalar",
    mutate: (runtime) => { runtime.runtimes.sena.engine = 42; },
    message: "SENA runtime bundle.runtimes.sena.engine must be a string."
  },
  {
    label: "runtime API array member",
    mutate: (runtime) => { runtime.runtimes.ena.apiSurface = [42]; },
    message: "SENA runtime bundle.runtimes.ena.apiSurface must contain only strings."
  },
  {
    label: "plan anchor enum",
    mutate: (runtime) => { runtime.developmentPlan.workflowAnchors[0].status = "done"; },
    message: "SENA runtime bundle.developmentPlan.workflowAnchors[0].status must be one of ready, review."
  },
  {
    label: "delivery-plan array member",
    mutate: (runtime) => { runtime.developmentPlan.deliveryCandidate.successCriteria = [42]; },
    message: "SENA runtime bundle.developmentPlan.deliveryCandidate.successCriteria must contain only strings."
  },
  {
    label: "walkthrough summary scalar",
    mutate: (runtime) => { runtime.demoWalkthrough.summary.totalSteps = "many"; },
    message: "SENA runtime bundle.demoWalkthrough.summary.totalSteps must be a finite number."
  },
  {
    label: "verification manual-review enum",
    mutate: (runtime) => { runtime.demoVerification.checks[0].manualReview.status = "done"; },
    message: "SENA runtime bundle.demoVerification.checks[0].manualReview.status must be one of pending, passed, failed."
  },
  {
    label: "compatibility item enum",
    mutate: (runtime) => { runtime.demoVerificationCompatibilityAudit.items[0].status = "ready"; },
    message: "SENA runtime bundle.demoVerificationCompatibilityAudit.items[0].status must be one of pass, review."
  },
  {
    label: "page-contract array member",
    mutate: (runtime) => { runtime.productionPageContract.sections[0].requiredText = [42]; },
    message: "SENA runtime bundle.productionPageContract.sections[0].requiredText must contain only strings."
  },
  {
    label: "temporal-trace count scalar",
    mutate: (runtime) => { runtime.temporalRuntimeTrace.sourceDatasetCounts.people = "many"; },
    message: "SENA runtime bundle.temporalRuntimeTrace.sourceDatasetCounts.people must be a finite number."
  },
  {
    label: "temporal-trace window scalar",
    mutate: (runtime) => { runtime.temporalRuntimeTrace.windows[0].sena.people = "many"; },
    message: "SENA runtime bundle.temporalRuntimeTrace.windows[0].sena.people must be a finite number."
  },
  {
    label: "ledger count scalar",
    mutate: (runtime) => { runtime.evidenceLedger.sourceCounts["social-edge"] = "many"; },
    message: "SENA runtime bundle.evidenceLedger.sourceCounts.social-edge must be a finite number."
  },
  {
    label: "ledger snippet enum",
    mutate: (runtime) => { runtime.evidenceLedger.snippets[0].source = "causal"; },
    message: "SENA runtime bundle.evidenceLedger.snippets[0].source must be one of social-edge, concept-edge, bridge-edge, pair-contribution, temporal-window."
  }
];

describe("Round12 complete report/runtime runtime type guards", () => {
  it("accepts complete current holders", () => {
    const { report, runtime } = currentHolders();
    expect(() => assertSenaReportHolderStructure(report)).not.toThrow();
    expect(() => assertSenaRuntimeBundleHolderStructure(runtime)).not.toThrow();
    expect(isSenaReport(report)).toBe(true);
    expect(isSenaRuntimeBundle(runtime)).toBe(true);
  });

  it.each(reportCases)("rejects a report with wrong $label at the exact path", ({ mutate, message }) => {
    const report = structuredClone(currentHolders().report) as unknown as MutableRecord;
    mutate(report);

    expect(isSenaReport(report)).toBe(false);
    expect(() => assertSenaReportHolderStructure(report)).toThrow(message);
    expect(() => normalizeSenaReportStatisticalLeaves(report)).toThrow(message);
  });

  it.each(runtimeCases)("rejects a runtime bundle with wrong $label at the exact path", ({ mutate, message }) => {
    const runtime = structuredClone(currentHolders().runtime) as unknown as MutableRecord;
    mutate(runtime);

    expect(isSenaRuntimeBundle(runtime)).toBe(false);
    expect(() => assertSenaRuntimeBundleHolderStructure(runtime)).toThrow(message);
    expect(() => normalizeSenaRuntimeBundleStatisticalLeaves(runtime)).toThrow(message);
  });

  it("keeps genuine 14bb306 v1 statistical holders structurally readable", () => {
    const packet = loadSena14bb306ReviewPacketFixture() as SenaReviewPacket;
    expect(() => assertSenaReportHolderStructure(packet.contents.reportJson)).not.toThrow();
    expect(() => assertSenaRuntimeBundleHolderStructure(packet.contents.runtimeBundle)).not.toThrow();
    expect(importSenaReport(packet.contents.reportJson).title).toBe(packet.contents.reportJson.title);
    expect(importSenaRuntimeBundle(packet.contents.runtimeBundle).title).toBe(packet.contents.runtimeBundle.title);
  });
});
