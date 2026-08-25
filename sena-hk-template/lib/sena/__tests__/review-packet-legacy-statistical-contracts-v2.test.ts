import { describe, expect, it } from "vitest";
import * as fusionMath from "../fusion-math";
import * as reportRuntime from "../report";
import { buildSenaModel, scopeSenaDatasetToWindow } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildSenaReviewPacket, importSenaReviewPacket, isSenaReviewPacket } from "../review-packet";
import { buildSenaReliabilityDashboard, reliabilityDashboardToReview } from "../reliability";
import { importSenaProjectSnapshot, isSenaProjectSnapshot } from "../snapshot";
import {
  importSenaReport,
  importSenaRuntimeBundle,
  isSenaReport,
  isSenaRuntimeBundle
} from "../statistical-leaf-read";
import { loadSena14bb306ReviewPacketFixture } from "./fixtures/sena-14bb306-fixture";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown) {
  return value as JsonRecord;
}

function packetWithGenuine14bb306StatisticalLeaves() {
  const packet = loadSena14bb306ReviewPacketFixture() as ReturnType<typeof buildSenaReviewPacket>;
  const auditV1 = asRecord(packet.contents.fusionMathAudit);
  const gateV1 = asRecord(packet.contents.codingReliabilityGate);
  return { packet, auditV1, gateV1 };
}

function statisticalLeaves(packet: ReturnType<typeof buildSenaReviewPacket>) {
  return [
    packet.contents,
    packet.contents.reportJson,
    packet.contents.runtimeBundle,
    packet.contents.runtimeBundle.report,
    packet.contents.projectSnapshot.report
  ];
}

function statisticalReportLeaves(packet: ReturnType<typeof buildSenaReviewPacket>) {
  return [
    packet.contents.reportJson,
    packet.contents.runtimeBundle.report,
    packet.contents.projectSnapshot.report
  ];
}

function readyCurrentV2ReviewPacket(
  demoVerificationManualReviews?: NonNullable<
    Parameters<typeof buildSenaReviewPacket>[1]
  >["demoVerificationManualReviews"],
  withActiveWindow = false,
  dataset = lessonStudySenaContract
) {
  const dashboard = buildSenaReliabilityDashboard([
    { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
    { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true },
    { coderId: "c1", itemId: "u2", codeId: "Evidence", value: false },
    { coderId: "c2", itemId: "u2", codeId: "Evidence", value: false }
  ]);
  const timelineModel = buildSenaModel(dataset);
  const activeTemporalWindow = withActiveWindow ? timelineModel.temporal.windows[0] : undefined;
  if (withActiveWindow && !activeTemporalWindow) {
    throw new Error("Ready review-packet fixture has no active temporal window.");
  }
  const model = activeTemporalWindow
    ? buildSenaModel(scopeSenaDatasetToWindow(dataset, activeTemporalWindow))
    : timelineModel;
  return JSON.parse(JSON.stringify(buildSenaReviewPacket(model, {
    generatedAt: "2026-08-25T00:00:00.000Z",
    activeTemporalWindow: activeTemporalWindow ?? null,
    sourceDataset: activeTemporalWindow ? dataset : undefined,
    codingReliability: reliabilityDashboardToReview(dashboard, "Review packet reliability reviewer"),
    humanReview: {
      status: "human-reviewed",
      reviewer: "Review packet human reviewer",
      interpretation: "Current-v2 packet integrity fixture interpretation.",
      limitations: "Synthetic fixture only.",
      nextActions: "Keep duplicated readiness surfaces canonical."
    },
    dataGovernance: {
      irbApprovalId: "SYNTHETIC-FIXTURE-NOT-HUMAN-SUBJECTS",
      consentScope: "Synthetic review-packet integrity fixture only.",
      retentionPolicy: "Delete generated fixture state after the test run.",
      usageConstraints: ["Do not use as participant evidence."],
      dataSteward: "Review packet human reviewer"
    },
    demoVerificationManualReviews
  }))) as ReturnType<typeof buildSenaReviewPacket>;
}

function currentNeedsReviewFusionPacket() {
  const packet = readyCurrentV2ReviewPacket();
  const model = buildSenaModel(lessonStudySenaContract);
  const firstSocialRow = model.matrices.S.raw[0];
  if (!firstSocialRow || firstSocialRow[0] === undefined) {
    throw new Error("Ready fixture has no social matrix value to invalidate.");
  }
  firstSocialRow[0] = -1;
  const matrices = structuredClone(model.matrices);
  packet.contents.reportJson.matrices = structuredClone(matrices);
  packet.contents.runtimeBundle.runtimes.sena.matrices = structuredClone(matrices);
  packet.contents.runtimeBundle.report.matrices = structuredClone(matrices);
  packet.contents.projectSnapshot.analysis.matrices = structuredClone(matrices);
  packet.contents.projectSnapshot.report.matrices = structuredClone(matrices);
  const audit = fusionMath.buildSenaFusionMathAudit(model);
  if (audit.status !== "needs-review") {
    throw new Error("Expected a coherent current-v2 needs-review fusion audit fixture.");
  }
  for (const leaf of statisticalLeaves(packet)) {
    leaf.fusionMathAudit = structuredClone(audit);
  }
  return packet;
}

describe("review-packet statistical contract compatibility", () => {
  it("normalizes genuine 14bb306 fusion-audit v1 leaves without treating nonnegative evidence as proven", () => {
    const { packet, auditV1 } = packetWithGenuine14bb306StatisticalLeaves();
    expect((auditV1.items as JsonRecord[]).map((item) => item.id)).toEqual([
      "labels-and-dimensions",
      "finite-values",
      "social-block",
      "bridge-block",
      "bridge-cp-block",
      "concept-block",
      "g-pair-coverage"
    ]);
    expect(asRecord(auditV1).sourceSchemaVersion).toBeUndefined();
    expect(typeof asRecord(fusionMath).normalizeSenaFusionMathAudit).toBe("function");

    const imported = importSenaReviewPacket(packet) as ReturnType<typeof buildSenaReviewPacket>;
    for (const leaf of statisticalLeaves(imported)) {
      expect(leaf.fusionMathAudit).toEqual(expect.objectContaining({
        schemaVersion: "sena-fusion-math-audit/v2",
        sourceSchemaVersion: "sena-fusion-math-audit/v1",
        status: "needs-review"
      }));
      expect(leaf.fusionMathAudit.items).toContainEqual(expect.objectContaining({
        id: "nonnegative-values",
        status: "review"
      }));
    }
    const isCurrent = asRecord(fusionMath).isCurrentSenaFusionMathAudit as (value: unknown) => boolean;
    expect(isCurrent(imported.contents.fusionMathAudit)).toBe(false);
    expect(asRecord(packet.contents.fusionMathAudit).schemaVersion).toBe("sena-fusion-math-audit/v1");
  });

  it("normalizes genuine 14bb306 reliability-gate v1 leaves as machine-ineligible legacy evidence", () => {
    const { packet, gateV1 } = packetWithGenuine14bb306StatisticalLeaves();
    expect(asRecord(gateV1).machineClaimEligibility).toBeUndefined();
    expect(asRecord(gateV1).sourceSchemaVersion).toBeUndefined();
    expect(asRecord(gateV1).evidence).not.toEqual(expect.arrayContaining([expect.stringMatching(/^machine/)]));
    expect(typeof asRecord(reportRuntime).normalizeSenaCodingReliabilityGate).toBe("function");

    const imported = importSenaReviewPacket(packet) as ReturnType<typeof buildSenaReviewPacket>;
    for (const leaf of statisticalLeaves(imported)) {
      expect(leaf.codingReliabilityGate).toEqual(expect.objectContaining({
        schemaVersion: "sena-coding-reliability-gate/v2",
        sourceSchemaVersion: "sena-coding-reliability-gate/v1",
        status: "review",
        claimUse: "coding-reliability-needed",
        machineClaimEligibility: expect.objectContaining({
          eligible: false,
          status: "legacy-ambiguous",
          sourceSchemaVersion: "sena-coding-reliability-gate/v1",
          blockers: ["current-v2-reliability-evidence-required"]
        })
      }));
      expect(leaf.codingReliabilityGate.blockers).toContain("current-v2-reliability-evidence-required");
    }
    const isCurrent = asRecord(reportRuntime).isCurrentSenaCodingReliabilityGate as (value: unknown) => boolean;
    expect(isCurrent(imported.contents.codingReliabilityGate)).toBe(false);
    expect(asRecord(packet.contents.codingReliabilityGate).schemaVersion).toBe("sena-coding-reliability-gate/v1");
  });

  it("normalizes legacy statistical leaves at report, runtime-bundle, and snapshot restore boundaries", () => {
    const { packet } = packetWithGenuine14bb306StatisticalLeaves();
    const rawReport = packet.contents.reportJson;
    const rawBundle = packet.contents.runtimeBundle;
    const rawSnapshot = packet.contents.projectSnapshot;

    expect(isSenaReport(rawReport)).toBe(false);
    expect(isSenaRuntimeBundle(rawBundle)).toBe(false);
    expect(isSenaProjectSnapshot(rawSnapshot)).toBe(false);

    const report = importSenaReport(JSON.stringify(rawReport));
    const bundle = importSenaRuntimeBundle(JSON.stringify(rawBundle));
    const snapshot = importSenaProjectSnapshot(JSON.stringify(rawSnapshot));

    for (const restoredReport of [report, bundle.report, snapshot.report]) {
      expect(restoredReport.fusionMathAudit).toEqual(expect.objectContaining({
        schemaVersion: "sena-fusion-math-audit/v2",
        sourceSchemaVersion: "sena-fusion-math-audit/v1",
        status: "needs-review"
      }));
      expect(restoredReport.codingReliabilityGate).toEqual(expect.objectContaining({
        schemaVersion: "sena-coding-reliability-gate/v2",
        sourceSchemaVersion: "sena-coding-reliability-gate/v1",
        status: "review"
      }));
      expect(restoredReport.pilotReadinessAudit.status).toBe("needs-review");
      expect(restoredReport.claimReadinessGate).toEqual(expect.objectContaining({
        status: "exploratory",
        claimUse: "exploratory-only"
      }));
    }
    expect(bundle.fusionMathAudit.status).toBe("needs-review");
    expect(bundle.pilotReadinessAudit.status).toBe("needs-review");
    expect(bundle.claimReadinessGate.status).toBe("exploratory");
    expect(isSenaProjectSnapshot(snapshot)).toBe(true);
  });

  it("invalidates every derived review-packet surface after legacy leaf normalization", () => {
    const { packet } = packetWithGenuine14bb306StatisticalLeaves();
    const imported = importSenaReviewPacket(JSON.stringify(packet));

    expect(imported.summary).toEqual(expect.objectContaining({
      pilotReadinessStatus: "needs-review",
      fusionMathStatus: "needs-review",
      claimReadinessStatus: "exploratory",
      codingReliabilityStatus: "review"
    }));
    expect(imported.reviewPacketAudit.status).toBe("needs-review");
    expect(imported.reviewPacketAudit.items).toContainEqual(expect.objectContaining({
      id: "legacy-statistical-contracts",
      status: "review"
    }));
    expect(imported.contents.pilotReadinessAudit.status).toBe("needs-review");
    expect(imported.contents.claimReadinessGate).toEqual(expect.objectContaining({
      status: "exploratory",
      claimUse: "exploratory-only"
    }));
    expect(imported.contents.runtimeBundle.pilotReadinessAudit.status).toBe("needs-review");
    expect(imported.contents.runtimeBundle.claimReadinessGate.status).toBe("exploratory");
    expect(imported.contents.reportMarkdown).toContain("- Overall status: needs-review");
    expect(imported.contents.reportMarkdown).toContain("fusion-math-audit/v1");

    const schemas = Object.fromEntries(imported.artifactManifest.map((artifact) => [artifact.filename, artifact.schemaVersion]));
    expect(schemas["sena-fusion-math-audit.json"]).toBe("sena-fusion-math-audit/v2");
    expect(schemas["sena-coding-reliability-gate.json"]).toBe("sena-coding-reliability-gate/v2");
    expect(imported.contents.pilotPackageManifest.exportArtifactSchemas["sena-fusion-math-audit.json"])
      .toBe("sena-fusion-math-audit/v2");
    expect(imported.contents.pilotPackageManifest.exportArtifactSchemas["sena-coding-reliability-gate.json"])
      .toBe("sena-coding-reliability-gate/v2");
    expect(imported.contents.pilotPackageManifest.sampleDataset.expectedRuntime.fusionMathAudit)
      .toBe("needs-review");
  });

  it("reconciles every legacy-dependent completeness, plan, walkthrough, and verification surface", () => {
    const { packet } = packetWithGenuine14bb306StatisticalLeaves();
    const report = importSenaReport(JSON.stringify(packet.contents.reportJson));
    const bundle = importSenaRuntimeBundle(JSON.stringify(packet.contents.runtimeBundle));
    const snapshot = importSenaProjectSnapshot(JSON.stringify(packet.contents.projectSnapshot));
    const imported = importSenaReviewPacket(JSON.stringify(packet));

    const assertReport = (candidate: typeof report) => {
      const fusionCompleteness = candidate.completenessAudit.items.find((item) => item.id === "fusion-math-audit");
      const reliabilityCompleteness = candidate.completenessAudit.items.find((item) => item.id === "coding-reliability");
      const fusionReadiness = candidate.pilotReadinessAudit.items.find((item) => item.id === "fusion-math");
      const completenessReadiness = candidate.pilotReadinessAudit.items.find((item) => item.id === "report-completeness");
      expect(fusionCompleteness).toEqual(expect.objectContaining({
        status: "review",
        summary: "7 formula checks passed; 1 need review"
      }));
      expect(reliabilityCompleteness).toEqual(expect.objectContaining({ status: "review" }));
      expect(candidate.completenessAudit.passed)
        .toBe(candidate.completenessAudit.items.filter((item) => item.status === "pass").length);
      expect(candidate.completenessAudit.reviewNeeded)
        .toBe(candidate.completenessAudit.items.filter((item) => item.status === "review").length);
      expect(fusionReadiness).toEqual(expect.objectContaining({
        status: "review",
        summary: expect.stringContaining("current v2")
      }));
      expect(completenessReadiness).toEqual(expect.objectContaining({ status: "review" }));
      expect(candidate.pilotReadinessAudit.passed)
        .toBe(candidate.pilotReadinessAudit.items.filter((item) => item.status === "ready").length);
      expect(candidate.pilotReadinessAudit.reviewNeeded)
        .toBe(candidate.pilotReadinessAudit.items.filter((item) => item.status === "review").length);
      expect(candidate.codingReliabilityGate.machineClaimEligibility).toEqual(expect.objectContaining({
        eligible: false,
        status: "legacy-ambiguous",
        blockers: ["current-v2-reliability-evidence-required"]
      }));
    };

    for (const candidate of [
      report,
      bundle.report,
      snapshot.report,
      imported.contents.reportJson,
      imported.contents.runtimeBundle.report,
      imported.contents.projectSnapshot.report
    ]) assertReport(candidate);

    const assertRuntimeDerivedSurfaces = (candidate: typeof bundle) => {
      const readyIds = candidate.pilotReadinessAudit.items.filter((item) => item.status === "ready").map((item) => item.id);
      const reviewIds = candidate.pilotReadinessAudit.items.filter((item) => item.status === "review").map((item) => item.id);
      expect(candidate.developmentPlan.currentGate.readyItems).toEqual(readyIds);
      expect(candidate.developmentPlan.currentGate.reviewItems).toEqual(reviewIds);
      expect(candidate.developmentPlan.currentGate.automatedVerification).toEqual(expect.objectContaining({
        totalChecks: candidate.demoVerification.summary.totalChecks,
        passed: candidate.demoVerification.summary.automatedPass,
        review: candidate.demoVerification.summary.automatedReview
      }));
      expect(candidate.demoWalkthrough.steps.find((step) => step.id === "model-builder")?.status).toBe("review");
      expect(candidate.demoWalkthrough.summary.readySteps)
        .toBe(candidate.demoWalkthrough.steps.filter((step) => step.status === "ready").length);
      expect(candidate.demoWalkthrough.summary.reviewSteps)
        .toBe(candidate.demoWalkthrough.steps.filter((step) => step.status === "review").length);
      expect(candidate.demoVerification.checks.find((check) => check.id === "weights-and-formula")?.status).toBe("review");
      expect(candidate.demoVerification.summary.automatedPass)
        .toBe(candidate.demoVerification.checks.filter((check) => check.status === "pass").length);
      expect(candidate.demoVerification.summary.automatedReview)
        .toBe(candidate.demoVerification.checks.filter((check) => check.status === "review").length);
      const normalizedDependentEvidence = [
        ...(candidate.demoWalkthrough.steps.find((step) => step.id === "model-builder")?.evidence ?? []),
        ...(candidate.demoWalkthrough.steps.find((step) => step.id === "report")?.evidence ?? []),
        ...(candidate.demoVerification.checks.find((check) => check.id === "weights-and-formula")?.observedEvidence ?? []),
        ...(candidate.demoVerification.checks.find((check) => check.id === "report-exports")?.observedEvidence ?? []),
        ...candidate.developmentPlan.phases.flatMap((phase) => phase.evidence)
      ].join("\n");
      expect(normalizedDependentEvidence).toContain("current-v2-fusion-nonnegative-evidence-required");
      expect(normalizedDependentEvidence).toContain("current-v2-reliability-evidence-required");
      expect(normalizedDependentEvidence).toContain("legacy-statistical-dependent-evidence-invalidated");
      expect(normalizedDependentEvidence).not.toMatch(/Fusion equation audit: (?:pass|ready)/);
      expect(normalizedDependentEvidence).not.toContain("Fusion labels and dimensions: pass");
      expect(candidate.pilotReadinessAudit.notes).toContain(
        "Restore normalization never upgrades historical statistical evidence to current-ready status."
      );
      expect(candidate.report.completenessAudit.notes).toContain(
        "Restored completeness is reconciled from normalized statistical leaves before readiness is evaluated."
      );
      expect(candidate.developmentPlan.notes).toContain(
        "Legacy-dependent plan evidence was invalidated and rebuilt from normalized current readiness items."
      );
      expect(candidate.developmentPlan.phases.find((phase) => phase.id === "runtime-foundation")?.status)
        .not.toBe("complete");
    };

    assertRuntimeDerivedSurfaces(bundle);
    assertRuntimeDerivedSurfaces(imported.contents.runtimeBundle);
    expect(imported.contents.developmentPlan.currentGate).toEqual(imported.contents.runtimeBundle.developmentPlan.currentGate);
    expect(imported.contents.demoWalkthrough.summary).toEqual(imported.contents.runtimeBundle.demoWalkthrough.summary);
    expect(imported.contents.demoVerification.summary).toEqual(imported.contents.runtimeBundle.demoVerification.summary);
    expect(imported.summary.reportCompletenessStatus).toBe(imported.contents.reportJson.completenessAudit.status);
    expect(imported.contents.reportMarkdown).toContain("current-v2-fusion-nonnegative-evidence-required");
    expect(imported.contents.reportMarkdown).not.toContain("7 formula checks passed; 0 need review");
    expect(JSON.stringify(imported)).not.toContain("\"fusionMathStatus\":\"verified\"");
  });

  it("propagates a legacy leaf in any nested holder to every readiness surface", () => {
    const { auditV1, gateV1 } = packetWithGenuine14bb306StatisticalLeaves();
    const dashboard = buildSenaReliabilityDashboard([
      { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c1", itemId: "u2", codeId: "Evidence", value: false },
      { coderId: "c2", itemId: "u2", codeId: "Evidence", value: false }
    ]);
    const mutations: Array<{
      itemId: "fusion-math" | "coding-reliability";
      apply: (packet: ReturnType<typeof buildSenaReviewPacket>) => void;
    }> = [
      { itemId: "fusion-math", apply: (packet) => { packet.contents.fusionMathAudit = structuredClone(auditV1) as never; } },
      { itemId: "coding-reliability", apply: (packet) => { packet.contents.reportJson.codingReliabilityGate = structuredClone(gateV1) as never; } },
      { itemId: "fusion-math", apply: (packet) => { packet.contents.runtimeBundle.fusionMathAudit = structuredClone(auditV1) as never; } },
      { itemId: "coding-reliability", apply: (packet) => { packet.contents.runtimeBundle.report.codingReliabilityGate = structuredClone(gateV1) as never; } },
      { itemId: "fusion-math", apply: (packet) => { packet.contents.projectSnapshot.report.fusionMathAudit = structuredClone(auditV1) as never; } }
    ];

    for (const mutation of mutations) {
      const packet = buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
        generatedAt: "2026-08-21T00:00:00.000Z",
        codingReliability: reliabilityDashboardToReview(dashboard, "Reliability reviewer")
      });
      mutation.apply(packet);
      const imported = importSenaReviewPacket(packet);
      expect(imported.summary.pilotReadinessStatus).toBe("needs-review");
      expect(imported.summary.claimReadinessStatus).toBe("exploratory");
      expect(imported.contents.pilotReadinessAudit.status).toBe("needs-review");
      expect(imported.contents.runtimeBundle.pilotReadinessAudit.status).toBe("needs-review");
      expect(imported.contents.reportJson.pilotReadinessAudit.status).toBe("needs-review");
      expect(imported.contents.runtimeBundle.report.pilotReadinessAudit.status).toBe("needs-review");
      expect(imported.contents.projectSnapshot.report.pilotReadinessAudit.status).toBe("needs-review");
      expect(imported.contents.claimReadinessGate.status).toBe("exploratory");
      expect(imported.contents.runtimeBundle.claimReadinessGate.status).toBe("exploratory");
      for (const readiness of [
        imported.contents.pilotReadinessAudit,
        imported.contents.reportJson.pilotReadinessAudit,
        imported.contents.runtimeBundle.pilotReadinessAudit,
        imported.contents.runtimeBundle.report.pilotReadinessAudit,
        imported.contents.projectSnapshot.report.pilotReadinessAudit
      ]) {
        expect(readiness.items.find((item) => item.id === mutation.itemId)?.status).toBe("review");
      }
    }
  });

  it("marks fresh v2 leaves as current at every review-packet read boundary", () => {
    const packet = buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
      generatedAt: "2026-08-21T00:00:00.000Z"
    });
    const imported = importSenaReviewPacket(JSON.stringify(packet));

    for (const leaf of statisticalLeaves(imported)) {
      expect(asRecord(leaf.fusionMathAudit).sourceSchemaVersion).toBe("sena-fusion-math-audit/v2");
      expect(asRecord(leaf.codingReliabilityGate).sourceSchemaVersion).toBe("sena-coding-reliability-gate/v2");
    }
  });

  it("propagates a current-v2 reliability downgrade to every cached review-packet surface", () => {
    const packet = readyCurrentV2ReviewPacket();
    expect(packet.summary.codingReliabilityStatus).toBe("ready");
    expect(packet.summary.reportCompletenessStatus).toBe("complete");
    expect(packet.summary.pilotReadinessStatus).toBe("ready");
    expect(packet.summary.claimReadinessStatus).toBe("ready");
    for (const leaf of statisticalLeaves(packet)) {
      leaf.codingReliabilityGate.review.reviewer = "";
    }

    const imported = importSenaReviewPacket(packet);
    for (const leaf of statisticalLeaves(imported)) {
      expect(leaf.codingReliabilityGate.status).toBe("review");
    }
    expect(imported.summary.codingReliabilityStatus).toBe("review");
    expect(imported.summary.pilotReadinessStatus).toBe("needs-review");
    expect(imported.summary.claimReadinessStatus).toBe("exploratory");
    expect(imported.contents.pilotReadinessAudit.status).toBe("needs-review");
    expect(imported.contents.claimReadinessGate.status).toBe("exploratory");
    expect(imported.contents.reportMarkdown).toContain("Reliability reviewer is missing.");
    expect(imported.reviewPacketAudit.status).toBe("needs-review");
    expect(imported.reviewPacketAudit.items).toContainEqual(expect.objectContaining({
      id: "statistical-contract-reconciliation",
      status: "review"
    }));
  });

  it.each(["passed", "failed"] as const)(
    "preserves an independent current-v2 manual %s record when automated readiness is downgraded",
    (status) => {
      const manualReview = {
        status,
        reviewer: "Independent demo reviewer",
        verifiedAt: "2026-08-25T00:05:00.000Z",
        notes: `Independent report-export review remained ${status}.`
      };
      const packet = readyCurrentV2ReviewPacket({ "report-exports": manualReview });
      for (const leaf of statisticalLeaves(packet)) {
        leaf.codingReliabilityGate.review.reviewer = "";
      }

      const imported = importSenaReviewPacket(packet);
      const runtimeCheck = imported.contents.runtimeBundle.demoVerification.checks
        .find((check) => check.id === "report-exports");
      const outerCheck = imported.contents.demoVerification.checks
        .find((check) => check.id === "report-exports");
      expect(runtimeCheck?.status).toBe("review");
      expect(runtimeCheck?.manualReview).toEqual(manualReview);
      expect(outerCheck?.manualReview).toEqual(manualReview);
      expect(imported.contents.projectSnapshot.workspaceState?.demoVerificationManualReviews["report-exports"])
        .toEqual(manualReview);
      expect(imported.contents.runtimeBundle.demoVerification.summary[
        status === "passed" ? "manualPassed" : "manualFailed"
      ]).toBe(1);
      expect(importSenaReviewPacket(structuredClone(imported))).toEqual(imported);
    }
  );

  it.each([
    {
      label: "outer-only failed",
      runtimeStatus: "passed",
      outerStatus: "failed",
      snapshotStatus: "passed",
      expectedSource: "outer"
    },
    {
      label: "snapshot-only failed",
      runtimeStatus: "passed",
      outerStatus: "passed",
      snapshotStatus: "failed",
      expectedSource: "snapshot"
    },
    {
      label: "runtime passed versus snapshot failed",
      runtimeStatus: "passed",
      outerStatus: "pending",
      snapshotStatus: "failed",
      expectedSource: "snapshot"
    }
  ] as const)(
    "conservatively reconciles $label manual-review provenance across current-v2 holders",
    ({ runtimeStatus, outerStatus, snapshotStatus, expectedSource }) => {
      const packet = readyCurrentV2ReviewPacket({
        "report-exports": {
          status: "passed",
          reviewer: "Initial canonical reviewer",
          verifiedAt: "2026-08-25T00:05:00.000Z",
          notes: "Initial canonical review."
        }
      });
      const manualReview = (
        source: "runtime" | "outer" | "snapshot",
        status: "pending" | "passed" | "failed"
      ) => ({
        status,
        reviewer: `${source} manual reviewer`,
        verifiedAt: status === "pending" ? "" : `2026-08-25T00:0${source.length}:00.000Z`,
        notes: `${source} preserved ${status} manual evidence.`
      });
      const runtimeReview = manualReview("runtime", runtimeStatus);
      const outerReview = manualReview("outer", outerStatus);
      const snapshotReview = manualReview("snapshot", snapshotStatus);
      const runtimeCheck = packet.contents.runtimeBundle.demoVerification.checks
        .find((check) => check.id === "report-exports");
      const outerCheck = packet.contents.demoVerification.checks
        .find((check) => check.id === "report-exports");
      if (!runtimeCheck || !outerCheck || !packet.contents.projectSnapshot.workspaceState) {
        throw new Error("Ready review-packet fixture is missing report-export manual-review holders.");
      }
      runtimeCheck.manualReview = runtimeReview;
      outerCheck.manualReview = outerReview;
      packet.contents.projectSnapshot.workspaceState.demoVerificationManualReviews["report-exports"] =
        snapshotReview;

      const imported = importSenaReviewPacket(packet);
      const expectedReview = {
        runtime: runtimeReview,
        outer: outerReview,
        snapshot: snapshotReview
      }[expectedSource];
      const canonicalRuntimeCheck = imported.contents.runtimeBundle.demoVerification.checks
        .find((check) => check.id === "report-exports");
      const canonicalOuterCheck = imported.contents.demoVerification.checks
        .find((check) => check.id === "report-exports");
      expect(canonicalRuntimeCheck?.manualReview).toEqual(expectedReview);
      expect(canonicalOuterCheck?.manualReview).toEqual(expectedReview);
      expect(imported.contents.projectSnapshot.workspaceState?.demoVerificationManualReviews["report-exports"])
        .toEqual(expectedReview);
      expect(imported.contents.runtimeBundle.demoVerification.summary.manualFailed).toBe(1);
      expect(imported.contents.runtimeBundle.demoVerification.summary.manualPending).toBe(
        expectedReview.status === "pending" ? 1 : 5
      );
      expect(importSenaReviewPacket(structuredClone(imported))).toEqual(imported);
    }
  );

  it("rejects same-priority conflicting demo manual evidence even when statistical leaves are legacy", () => {
    const { packet } = packetWithGenuine14bb306StatisticalLeaves();
    const runtimeCheck = packet.contents.runtimeBundle.demoVerification.checks
      .find((check) => check.id === "report-exports");
    const outerCheck = packet.contents.demoVerification.checks
      .find((check) => check.id === "report-exports");
    if (!runtimeCheck || !outerCheck) throw new Error("Legacy fixture has no report-export check.");
    runtimeCheck.manualReview = {
      status: "failed",
      reviewer: "Runtime legacy-stat reviewer",
      verifiedAt: "2026-08-25T00:11:00.000Z",
      notes: "Runtime holder failure evidence."
    };
    outerCheck.manualReview = {
      status: "failed",
      reviewer: "Outer legacy-stat reviewer",
      verifiedAt: "2026-08-25T00:12:00.000Z",
      notes: "Outer holder failure evidence."
    };

    expect(() => importSenaReviewPacket(packet)).toThrow(
      /conflicting current demo manual-review provenance for report-exports/
    );
  });

  it("rejects conflicting current-v2 reliability provenance even when fusion evidence is legacy", () => {
    const { auditV1 } = packetWithGenuine14bb306StatisticalLeaves();
    const packet = readyCurrentV2ReviewPacket();
    for (const leaf of statisticalLeaves(packet)) {
      leaf.fusionMathAudit = structuredClone(auditV1) as never;
    }
    packet.contents.reportJson.codingReliabilityGate.review.reviewer =
      "Conflicting current reliability reviewer";

    expect(() => importSenaReviewPacket(packet)).toThrow(
      /conflicting current-v2 coding-reliability provenance/
    );
  });

  it("rejects a nested current reliability conflict before a legacy runtime root can erase it", () => {
    const { gateV1 } = packetWithGenuine14bb306StatisticalLeaves();
    const packet = readyCurrentV2ReviewPacket();
    packet.contents.runtimeBundle.codingReliabilityGate = structuredClone(gateV1) as never;
    packet.contents.runtimeBundle.report.codingReliabilityGate.review.reviewer =
      "Nested conflicting current reviewer";

    expect(() => importSenaReviewPacket(packet)).toThrow(
      /conflicting current-v2 coding-reliability provenance/
    );
  });

  it("rejects a nested ready current reliability gate before a review gate can erase it", () => {
    const packet = readyCurrentV2ReviewPacket();
    const nestedReadyGate = structuredClone(
      packet.contents.runtimeBundle.report.codingReliabilityGate
    );
    for (const leaf of statisticalLeaves(packet)) {
      leaf.codingReliabilityGate.review.reviewer = "";
    }
    packet.contents.runtimeBundle.report.codingReliabilityGate = nestedReadyGate;

    expect(() => importSenaReviewPacket(packet)).toThrow(
      /conflicting current-v2 coding-reliability provenance/
    );
  });

  it("allows consistent legacy and current reliability subgroups to fail closed to legacy", () => {
    const { gateV1 } = packetWithGenuine14bb306StatisticalLeaves();
    const packet = readyCurrentV2ReviewPacket();
    packet.contents.runtimeBundle.codingReliabilityGate = structuredClone(gateV1) as never;

    const imported = importSenaReviewPacket(packet);
    for (const leaf of statisticalLeaves(imported)) {
      expect(leaf.codingReliabilityGate.sourceSchemaVersion)
        .toBe("sena-coding-reliability-gate/v1");
      expect(leaf.codingReliabilityGate.status).toBe("review");
    }
  });

  it("rejects conflicting current review provenance at the standalone runtime-bundle boundary", () => {
    const bundle = structuredClone(readyCurrentV2ReviewPacket().contents.runtimeBundle);
    bundle.codingReliabilityGate.review.reviewer = "";
    bundle.report.codingReliabilityGate.review.reviewer = "";
    bundle.report.codingReliabilityGate.review.limitations =
      "Conflicting nested current-v2 review limitation.";

    expect(() => importSenaRuntimeBundle(bundle)).toThrow(
      /conflicting current-v2 coding-reliability provenance/
    );
  });

  it("fails closed on ledger-only incomplete human review at the standalone runtime-bundle boundary", () => {
    const bundle = structuredClone(readyCurrentV2ReviewPacket().contents.runtimeBundle);
    bundle.evidenceLedger.humanReview = {
      status: "draft",
      reviewer: "",
      reviewedAt: "",
      interpretation: "Pending human review.",
      limitations: "Pending human review.",
      nextActions: "Pending human review."
    };

    const imported = importSenaRuntimeBundle(bundle);
    expect(imported.report.humanReview.status).toBe("draft");
    expect(imported.evidenceLedger.humanReview.status).toBe("draft");
    expect(imported.report.completenessAudit.items.find((item) => item.id === "human-review")?.status)
      .toBe("review");
    expect(imported.pilotReadinessAudit.items.find((item) => item.id === "human-review")?.status)
      .toBe("review");
    expect(imported.claimReadinessGate.status).toBe("exploratory");
    expect(importSenaRuntimeBundle(structuredClone(imported))).toEqual(imported);
  });

  it("rejects conflicting human-review text at the standalone runtime-bundle boundary", () => {
    const bundle = structuredClone(readyCurrentV2ReviewPacket().contents.runtimeBundle);
    bundle.evidenceLedger.humanReview.interpretation =
      "Conflicting independently persisted ledger interpretation.";

    expect(() => importSenaRuntimeBundle(bundle)).toThrow(
      /conflicting current human-review interpretation provenance/
    );
  });

  it("rejects missing completeness and pilot membership at the standalone report boundary", () => {
    const report = structuredClone(readyCurrentV2ReviewPacket().contents.reportJson);
    report.humanReview = {
      status: "draft",
      reviewer: "",
      reviewedAt: "",
      interpretation: "Pending human review.",
      limitations: "Pending human review.",
      nextActions: "Pending human review."
    };
    report.completenessAudit.items = report.completenessAudit.items
      .filter((item) => item.id !== "human-review");
    report.pilotReadinessAudit.items = report.pilotReadinessAudit.items
      .filter((item) => item.id !== "human-review");

    expect(() => importSenaReport(report)).toThrow(/item membership is invalid/);
  });

  it("rejects missing completeness and pilot membership at the standalone runtime boundary", () => {
    const bundle = structuredClone(readyCurrentV2ReviewPacket().contents.runtimeBundle);
    const draftHumanReview = {
      status: "draft" as const,
      reviewer: "",
      reviewedAt: "",
      interpretation: "Pending human review.",
      limitations: "Pending human review.",
      nextActions: "Pending human review."
    };
    bundle.report.humanReview = structuredClone(draftHumanReview);
    bundle.evidenceLedger.humanReview = structuredClone(draftHumanReview);
    bundle.report.completenessAudit.items = bundle.report.completenessAudit.items
      .filter((item) => item.id !== "human-review");
    bundle.report.pilotReadinessAudit.items = bundle.report.pilotReadinessAudit.items
      .filter((item) => item.id !== "human-review");
    bundle.pilotReadinessAudit.items = bundle.pilotReadinessAudit.items
      .filter((item) => item.id !== "human-review");

    expect(() => importSenaRuntimeBundle(bundle)).toThrow(/item membership is invalid/);
  });

  it("rejects missing demo-verification membership at the standalone runtime boundary", () => {
    const bundle = structuredClone(readyCurrentV2ReviewPacket().contents.runtimeBundle);
    bundle.demoVerification.checks = bundle.demoVerification.checks
      .filter((check) => check.id !== "report-exports");

    expect(() => importSenaRuntimeBundle(bundle)).toThrow(
      /demo-verification check membership is invalid/
    );
  });

  it("keeps current fusion handoff provenance verified when only reliability evidence is legacy", () => {
    const { gateV1 } = packetWithGenuine14bb306StatisticalLeaves();
    const packet = readyCurrentV2ReviewPacket();
    for (const leaf of statisticalLeaves(packet)) {
      leaf.codingReliabilityGate = structuredClone(gateV1) as never;
    }

    const imported = importSenaReviewPacket(packet);
    expect(imported.contents.pilotPackageManifest.sampleDataset.expectedRuntime.fusionMathAudit)
      .toBe("verified");
    expect(imported.contents.methodProtocol.auditSummary.fusionMath.status).toBe("verified");
    expect(imported.contents.methodProtocol.runtimeHandoffs.find((handoff) => handoff.id === "fusion-math"))
      .toEqual(expect.objectContaining({ status: "pass" }));
  });

  it("does not mark current research-validation evidence as legacy when only fusion evidence is legacy", () => {
    const { auditV1 } = packetWithGenuine14bb306StatisticalLeaves();
    const packet = readyCurrentV2ReviewPacket();
    for (const leaf of statisticalLeaves(packet)) {
      leaf.fusionMathAudit = structuredClone(auditV1) as never;
    }

    const imported = importSenaReviewPacket(packet);
    const researchValidation = imported.contents.developmentPlan.phases
      .find((phase) => phase.id === "research-validation");
    expect(researchValidation?.evidence).not.toContain(
      "legacy-statistical-dependent-evidence-invalidated"
    );
  });

  it("rejects conflicting current-v2 fusion provenance even when reliability evidence is legacy", () => {
    const { gateV1 } = packetWithGenuine14bb306StatisticalLeaves();
    const packet = readyCurrentV2ReviewPacket();
    for (const leaf of statisticalLeaves(packet)) {
      leaf.codingReliabilityGate = structuredClone(gateV1) as never;
    }
    const alternateDataset = structuredClone(lessonStudySenaContract);
    const firstInteraction = alternateDataset.interactions[0];
    if (!firstInteraction) throw new Error("Ready fixture has no interaction to vary.");
    firstInteraction.weight = (firstInteraction.weight ?? 1) + 1;
    const alternatePacket = readyCurrentV2ReviewPacket(undefined, false, alternateDataset);
    alternatePacket.contents.projectSnapshot.report.codingReliabilityGate =
      structuredClone(gateV1) as never;
    packet.contents.projectSnapshot = structuredClone(alternatePacket.contents.projectSnapshot);

    expect(() => importSenaReviewPacket(packet)).toThrow(
      /conflicting current-v2 fusion-math provenance/
    );
  });

  it("broadcasts a nested-only legacy fusion blocker to every leaf and derived surface", () => {
    const { auditV1 } = packetWithGenuine14bb306StatisticalLeaves();
    const packet = readyCurrentV2ReviewPacket();
    packet.contents.projectSnapshot.report.fusionMathAudit = structuredClone(auditV1) as never;

    const imported = importSenaReviewPacket(packet);
    for (const leaf of statisticalLeaves(imported)) {
      expect(leaf.fusionMathAudit).toEqual(expect.objectContaining({
        sourceSchemaVersion: "sena-fusion-math-audit/v1",
        status: "needs-review"
      }));
    }
    expect(imported.summary.fusionMathStatus).toBe("needs-review");
    expect(imported.contents.pilotPackageManifest.sampleDataset.expectedRuntime.fusionMathAudit)
      .toBe("needs-review");
    expect(imported.contents.methodProtocol.auditSummary.fusionMath.status).toBe("needs-review");
    expect(imported.contents.reportMarkdown).toContain([
      "## Fusion Math Audit",
      "",
      `- Schema: ${imported.contents.fusionMathAudit.schemaVersion}`,
      "- Overall status: needs-review"
    ].join("\n"));
    expect(importSenaReviewPacket(structuredClone(imported))).toEqual(imported);
  });

  it("rejects current-v2 needs-review fusion evidence that is not derived from the snapshot dataset", () => {
    const packet = currentNeedsReviewFusionPacket();

    expect(() => importSenaReviewPacket(packet)).toThrow(
      /persisted analysis does not match the canonical dataset and build options/i
    );
  });

  it("rejects same-count snapshot manual provenance from a different dataset run identity", () => {
    const packet = readyCurrentV2ReviewPacket();
    const alternateDataset = structuredClone(lessonStudySenaContract);
    const firstUtterance = alternateDataset.utterances[0];
    if (!firstUtterance) throw new Error("Ready fixture has no utterance to vary.");
    firstUtterance.text = `${firstUtterance.text} Alternate content identity.`;
    const alternateModel = buildSenaModel(alternateDataset);
    packet.contents.projectSnapshot.dataset = structuredClone(alternateDataset);
    packet.contents.projectSnapshot.source.sourceDataset = structuredClone(alternateDataset);
    packet.contents.projectSnapshot.report.operatorDiagnostics.runIdentity =
      structuredClone(alternateModel.operatorDiagnostics.runIdentity);

    expect(() => importSenaReviewPacket(packet)).toThrow(/run identity/i);
  });

  it("rejects a jointly forged run identity when persisted analysis does not match the canonical dataset", () => {
    const packet = readyCurrentV2ReviewPacket();
    const snapshot = packet.contents.projectSnapshot;
    const interaction = snapshot.dataset.interactions[0];
    if (!interaction) throw new Error("Ready fixture has no interaction to vary.");
    interaction.weight = (interaction.weight ?? 1) + 99;
    snapshot.source.sourceDataset = structuredClone(snapshot.dataset);
    const forgedIdentity = buildSenaModel(
      snapshot.dataset,
      snapshot.reproducibility.buildOptions
    ).operatorDiagnostics.runIdentity;
    packet.contents.runtimeBundle.runtimes.sena.operatorDiagnostics.runIdentity =
      structuredClone(forgedIdentity);
    packet.contents.reportJson.operatorDiagnostics.runIdentity = structuredClone(forgedIdentity);
    packet.contents.runtimeBundle.report.operatorDiagnostics.runIdentity = structuredClone(forgedIdentity);
    snapshot.report.operatorDiagnostics.runIdentity = structuredClone(forgedIdentity);

    expect(() => importSenaReviewPacket(packet)).toThrow(
      /canonical dataset.*analysis|analysis.*canonical dataset|matrix.*provenance/i
    );
  });

  it("downgrades jointly consistent current-v2 data-governance holders instead of trusting ready caches", () => {
    const packet = readyCurrentV2ReviewPacket();
    const governance = {
      ...structuredClone(packet.contents.reportJson.dataGovernance),
      status: "needs-review" as const,
      dataSteward: "",
      blockers: ["Data steward"]
    };
    packet.contents.reportJson.dataGovernance = structuredClone(governance);
    packet.contents.runtimeBundle.report.dataGovernance = structuredClone(governance);
    packet.contents.projectSnapshot.report.dataGovernance = structuredClone(governance);
    packet.contents.projectSnapshot.dataGovernance = structuredClone(governance);

    const imported = importSenaReviewPacket(packet);
    expect(imported.summary.reportCompletenessStatus).toBe("needs-review");
    expect(imported.summary.pilotReadinessStatus).toBe("needs-review");
    expect(imported.summary.claimReadinessStatus).toBe("exploratory");
    expect(imported.contents.reportJson.modelCard.sections).toContainEqual(expect.objectContaining({
      id: "data-contract",
      status: "needs-review"
    }));
    expect(imported.contents.reportJson.modelCard.renderGate).toEqual(expect.objectContaining({
      status: "blocked",
      missingSectionIds: expect.arrayContaining(["data-contract"])
    }));
  });

  it("rejects conflicting current-v2 data-governance provenance across report holders", () => {
    const packet = readyCurrentV2ReviewPacket();
    packet.contents.reportJson.dataGovernance.dataSteward = "Conflicting report steward";

    expect(() => importSenaReviewPacket(packet)).toThrow(
      /conflicting current data-governance provenance/i
    );
  });

  it.each(["standalone report", "runtime bundle", "review packet"] as const)(
    "rejects unknown or future data-governance schemas in a %s",
    (boundary) => {
      const packet = readyCurrentV2ReviewPacket();
      if (boundary === "standalone report") {
        packet.contents.reportJson.dataGovernance.schemaVersion =
          "sena-data-governance-metadata/v999" as never;
        expect(isSenaReport(packet.contents.reportJson)).toBe(false);
        expect(() => importSenaReport(packet.contents.reportJson)).toThrow(/dataGovernance|schemaVersion/i);
        return;
      }
      if (boundary === "runtime bundle") {
        packet.contents.runtimeBundle.report.dataGovernance.schemaVersion =
          "sena-data-governance-metadata/v999" as never;
        expect(isSenaRuntimeBundle(packet.contents.runtimeBundle)).toBe(false);
        expect(() => importSenaRuntimeBundle(packet.contents.runtimeBundle)).toThrow(/dataGovernance|schemaVersion/i);
        return;
      }
      if (!packet.contents.projectSnapshot.dataGovernance) {
        throw new Error("Ready fixture has no root data governance.");
      }
      packet.contents.projectSnapshot.dataGovernance.schemaVersion =
        "sena-data-governance-metadata/v999" as never;
      expect(isSenaReviewPacket(packet)).toBe(false);
      expect(() => importSenaReviewPacket(packet)).toThrow(/dataGovernance|schemaVersion/i);
    }
  );

  it.each(["runtime", "outer"] as const)(
    "rejects a missing %s manualReview instead of deleting the only failed evidence",
    (holder) => {
      const packet = readyCurrentV2ReviewPacket({
        "report-exports": {
          status: "failed",
          reviewer: "Unique failed evidence reviewer",
          verifiedAt: "2026-08-25T00:18:00.000Z",
          notes: "The failed evidence must not be erasable by deleting one holder."
        }
      });
      const check = (holder === "runtime"
        ? packet.contents.runtimeBundle.demoVerification
        : packet.contents.demoVerification
      ).checks.find((candidate) => candidate.id === "report-exports");
      if (!check) throw new Error("Ready fixture has no report-exports check.");
      delete (check as Partial<typeof check>).manualReview;

      expect(() => importSenaReviewPacket(packet)).toThrow(/manualReview|manual-review holder/i);
    }
  );

  it.each([
    {
      label: "unknown export artifact",
      mutate: (packet: ReturnType<typeof buildSenaReviewPacket>) => {
        packet.contents.pilotPackageManifest.exportArtifacts.push("unknown-pilot-artifact.json");
        packet.contents.pilotPackageManifest.exportArtifactSchemas["unknown-pilot-artifact.json"] =
          "sena-unknown-artifact/v1";
      }
    },
    {
      label: "wrong artifact schema mapping",
      mutate: (packet: ReturnType<typeof buildSenaReviewPacket>) => {
        const filename = packet.contents.pilotPackageManifest.exportArtifacts[0];
        packet.contents.pilotPackageManifest.exportArtifactSchemas[filename] =
          "sena-unknown-artifact/v1";
      }
    },
    {
      label: "unknown asset",
      mutate: (packet: ReturnType<typeof buildSenaReviewPacket>) => {
        const href = "/sena-pilot/sample/unknown-pilot-asset.json";
        packet.contents.pilotPackageManifest.assets.sample.push(href);
        packet.contents.pilotPackageManifest.assetIntegrity.push({
          href,
          kind: "sample",
          format: "json",
          bytes: 1,
          sha256: "a".repeat(64)
        });
      }
    },
    {
      label: "unknown handoff check",
      mutate: (packet: ReturnType<typeof buildSenaReviewPacket>) => {
        packet.contents.pilotPackageManifest.handoffChecks[0].id = "unknown-pilot-handoff";
      }
    }
  ])("rejects pilot-package $label outside the canonical mapping", ({ mutate }) => {
    const packet = readyCurrentV2ReviewPacket();
    mutate(packet);
    expect(() => importSenaReviewPacket(packet)).toThrow(/pilotPackageManifest|pilot package|canonical/i);
  });

  it.each([
    ["sourceRuntime", (artifact: JsonRecord) => { artifact.sourceRuntime = "forged-runtime"; }],
    ["runtimeRole", (artifact: JsonRecord) => { artifact.runtimeRole = "sena-model"; }],
    ["downloadControl", (artifact: JsonRecord) => { artifact.downloadControl = "Forged export"; }],
    ["handoffChecks", (artifact: JsonRecord) => { artifact.handoffChecks = ["forged-check"]; }]
  ] as const)("rebuilds canonical reliability artifact %s provenance", (_field, mutate) => {
    const packet = readyCurrentV2ReviewPacket();
    const artifact = packet.contents.runtimeBundle.artifactEvidence
      .find((entry) => entry.filename === "sena-coding-reliability-gate.json");
    if (!artifact) throw new Error("Ready fixture has no reliability artifact evidence.");
    mutate(asRecord(artifact));

    const imported = importSenaReviewPacket(packet);
    const canonical = imported.contents.runtimeBundle.artifactEvidence
      .find((entry) => entry.filename === "sena-coding-reliability-gate.json");
    expect(canonical).toEqual(expect.objectContaining({
      runtimeRole: "review-handoff",
      sourceRuntime: imported.contents.runtimeBundle.runtimeProvenance.senaModel.engine,
      downloadControl: "Export reliability gate",
      handoffChecks: [
        "coding-reliability-gate",
        "coding-scheme",
        "agreement-evidence",
        "adjudication-notes"
      ]
    }));
    expect(imported.reviewPacketAudit.items).toContainEqual(expect.objectContaining({
      id: "statistical-contract-reconciliation",
      status: "review"
    }));
    expect(importSenaReviewPacket(structuredClone(imported))).toEqual(imported);
  });

  it("rejects a runtime-only demo-verification compatibility mismatch before manual replay", () => {
    const packet = readyCurrentV2ReviewPacket();
    packet.contents.runtimeBundle.demoVerificationCompatibilityAudit.status = "mismatch";
    packet.contents.runtimeBundle.demoVerificationCompatibilityAudit.passed = 1;
    packet.contents.runtimeBundle.demoVerificationCompatibilityAudit.reviewNeeded = 1;
    packet.contents.runtimeBundle.demoVerificationCompatibilityAudit.items[0].status = "review";

    expect(() => importSenaReviewPacket(packet)).toThrow(
      /demo-verification compatibility provenance/
    );
  });

  it.each(["outer-only", "runtime-and-outer"] as const)(
    "rejects %s demo-verification parameters that do not match the runtime canonical parameters",
    (source) => {
      const packet = readyCurrentV2ReviewPacket();
      packet.contents.demoVerification.parameters.buildOptions.alpha += 0.25;
      if (source === "runtime-and-outer") {
        packet.contents.runtimeBundle.demoVerification.parameters.buildOptions.alpha += 0.25;
      }

      expect(() => importSenaReviewPacket(packet)).toThrow(
        /demo-verification parameters do not match runtime canonical parameters/
      );
    }
  );

  it("rejects a stale compatible summary when the duplicated compatibility audit is incompatible", () => {
    const packet = readyCurrentV2ReviewPacket();
    for (const audit of [
      packet.contents.runtimeBundle.demoVerificationCompatibilityAudit,
      packet.contents.demoVerificationCompatibilityAudit
    ]) {
      audit.status = "mismatch";
      audit.passed = 1;
      audit.reviewNeeded = 1;
      audit.items[0].status = "review";
    }
    expect(packet.summary.demoVerificationCompatibilityStatus).toBe("compatible");

    expect(() => importSenaReviewPacket(packet)).toThrow(
      /demo-verification compatibility gate is not compatible/
    );
  });

  it("rejects a jointly forged runtime parameter cache and duplicated compatibility evidence", () => {
    const packet = readyCurrentV2ReviewPacket();
    const forgedDatasetCounts = {
      ...packet.contents.runtimeBundle.parameters.datasetCounts,
      people: packet.contents.runtimeBundle.parameters.datasetCounts.people + 1
    };
    packet.contents.runtimeBundle.parameters.datasetCounts = structuredClone(forgedDatasetCounts);
    packet.contents.runtimeBundle.demoVerification.parameters.datasetCounts = structuredClone(forgedDatasetCounts);
    packet.contents.demoVerification.parameters.datasetCounts = structuredClone(forgedDatasetCounts);
    const forgedCountsText = [
      `people=${forgedDatasetCounts.people}`,
      `interactions=${forgedDatasetCounts.interactions}`,
      `utterances=${forgedDatasetCounts.utterances}`,
      `codedSegments=${forgedDatasetCounts.codedSegments}`,
      `codes=${forgedDatasetCounts.codes}`
    ].join(", ");
    for (const audit of [
      packet.contents.runtimeBundle.demoVerificationCompatibilityAudit,
      packet.contents.demoVerificationCompatibilityAudit
    ]) {
      const datasetItem = audit.items.find((item) => item.id === "dataset-counts");
      if (!datasetItem) throw new Error("Ready fixture has no dataset-counts compatibility item.");
      datasetItem.expected = forgedCountsText;
      datasetItem.actual = forgedCountsText;
    }

    expect(() => importSenaReviewPacket(packet)).toThrow(
      /demo-verification parameters do not match persisted report and snapshot parameters/
    );
  });

  it("rejects a snapshot-only report parameter mismatch before replaying snapshot manual reviews", () => {
    const packet = readyCurrentV2ReviewPacket();
    packet.contents.projectSnapshot.report.parameters.datasetCounts.people += 1;

    expect(() => importSenaReviewPacket(packet)).toThrow(
      /persisted analysis does not match the canonical dataset and build options/i
    );
  });

  it.each([
    {
      label: "runtime missing check",
      expectedError: /demo-verification check membership is invalid/,
      mutate: (packet: ReturnType<typeof buildSenaReviewPacket>) => {
        packet.contents.runtimeBundle.demoVerification.checks =
          packet.contents.runtimeBundle.demoVerification.checks.filter((check) => check.id !== "report-exports");
      }
    },
    {
      label: "runtime duplicate check",
      expectedError: /demo-verification check membership is invalid/,
      mutate: (packet: ReturnType<typeof buildSenaReviewPacket>) => {
        packet.contents.runtimeBundle.demoVerification.checks.push(structuredClone(
          packet.contents.runtimeBundle.demoVerification.checks[0]
        ));
      }
    },
    {
      label: "outer missing check",
      expectedError: /demo manual-review holder/,
      mutate: (packet: ReturnType<typeof buildSenaReviewPacket>) => {
        packet.contents.demoVerification.checks = packet.contents.demoVerification.checks
          .filter((check) => check.id !== "report-exports");
      }
    },
    {
      label: "outer duplicate check",
      expectedError: /demo manual-review holder/,
      mutate: (packet: ReturnType<typeof buildSenaReviewPacket>) => {
        packet.contents.demoVerification.checks.push(structuredClone(
          packet.contents.demoVerification.checks[0]
        ));
      }
    },
    {
      label: "outer unknown check",
      expectedError: /demo manual-review holder/,
      mutate: (packet: ReturnType<typeof buildSenaReviewPacket>) => {
        packet.contents.demoVerification.checks[0].id = "unknown-check";
      }
    },
    {
      label: "snapshot missing manual holder",
      expectedError: /demo manual-review holder/,
      mutate: (packet: ReturnType<typeof buildSenaReviewPacket>) => {
        if (!packet.contents.projectSnapshot.workspaceState) {
          throw new Error("Ready fixture has no snapshot workspace state.");
        }
        delete packet.contents.projectSnapshot.workspaceState.demoVerificationManualReviews["report-exports"];
      }
    },
    {
      label: "snapshot unknown manual holder",
      expectedError: /demo manual-review holder/,
      mutate: (packet: ReturnType<typeof buildSenaReviewPacket>) => {
        if (!packet.contents.projectSnapshot.workspaceState) {
          throw new Error("Ready fixture has no snapshot workspace state.");
        }
        packet.contents.projectSnapshot.workspaceState.demoVerificationManualReviews["unknown-check"] = {
          status: "failed",
          reviewer: "Unknown snapshot reviewer",
          verifiedAt: "2026-08-25T00:13:00.000Z",
          notes: "This record must not be silently ignored."
        };
      }
    }
  ])("rejects $label instead of silently dropping demo manual evidence", ({ mutate, expectedError }) => {
    const packet = readyCurrentV2ReviewPacket();
    mutate(packet);
    expect(() => importSenaReviewPacket(packet)).toThrow(expectedError);
  });

  it.each([
    {
      label: "report-completeness human-review item",
      mutate: (packet: ReturnType<typeof buildSenaReviewPacket>) => {
        packet.contents.reportJson.completenessAudit.items =
          packet.contents.reportJson.completenessAudit.items.filter((item) => item.id !== "human-review");
      }
    },
    {
      label: "runtime pilot-readiness data-contract item",
      mutate: (packet: ReturnType<typeof buildSenaReviewPacket>) => {
        packet.contents.runtimeBundle.pilotReadinessAudit.items =
          packet.contents.runtimeBundle.pilotReadinessAudit.items.filter((item) => item.id !== "data-contract");
      }
    },
    {
      label: "snapshot pilot-readiness duplicate human-review item",
      mutate: (packet: ReturnType<typeof buildSenaReviewPacket>) => {
        const item = packet.contents.projectSnapshot.report.pilotReadinessAudit.items
          .find((candidate) => candidate.id === "human-review");
        if (!item) throw new Error("Ready fixture has no human-review pilot item.");
        packet.contents.projectSnapshot.report.pilotReadinessAudit.items.push(structuredClone(item));
      }
    }
  ])("rejects invalid $label membership before merging readiness holders", ({ mutate }) => {
    const packet = readyCurrentV2ReviewPacket();
    mutate(packet);
    expect(() => importSenaReviewPacket(packet)).toThrow(/item membership is invalid/);
  });

  it("preserves a root-only current-v2 pilot-readiness blocker in every canonical holder", () => {
    const packet = readyCurrentV2ReviewPacket();
    const rootItem = packet.contents.pilotReadinessAudit.items
      .find((item) => item.id === "data-contract");
    if (!rootItem) throw new Error("Ready fixture has no root data-contract readiness item.");
    rootItem.status = "review";
    rootItem.summary = "Root-only data-contract review remains required.";
    rootItem.evidence = ["root-only-data-contract-review"];
    packet.contents.pilotReadinessAudit.status = "needs-review";
    packet.contents.pilotReadinessAudit.passed -= 1;
    packet.contents.pilotReadinessAudit.reviewNeeded += 1;

    const imported = importSenaReviewPacket(packet);
    const pilotHolders = [
      imported.contents.pilotReadinessAudit,
      imported.contents.runtimeBundle.pilotReadinessAudit,
      imported.contents.reportJson.pilotReadinessAudit,
      imported.contents.runtimeBundle.report.pilotReadinessAudit,
      imported.contents.projectSnapshot.report.pilotReadinessAudit
    ];
    for (const audit of pilotHolders) {
      expect(audit.status).toBe("needs-review");
      expect(audit.items.find((item) => item.id === "data-contract")).toEqual(expect.objectContaining({
        status: "review",
        evidence: ["root-only-data-contract-review"]
      }));
    }
    expect(imported.summary.pilotReadinessStatus).toBe("needs-review");
    expect(imported.contents.claimReadinessGate.status).toBe("exploratory");
    expect(importSenaReviewPacket(structuredClone(imported))).toEqual(imported);
  });

  it("imports a fresh valid ready current-v2 packet as an exact no-op", () => {
    const packet = readyCurrentV2ReviewPacket({
      "report-exports": {
        status: "passed",
        reviewer: "Fresh current-v2 reviewer",
        verifiedAt: "2026-08-25T00:14:00.000Z",
        notes: "Fresh current-v2 manual evidence."
      }
    });

    const imported = importSenaReviewPacket(structuredClone(packet));
    for (const key of Object.keys(packet) as Array<keyof typeof packet>) {
      expect(imported[key], `fresh current-v2 root field ${key}`).toEqual(packet[key]);
    }
  });

  it("does not label a current-v2 readiness reconciliation as legacy evidence", () => {
    const packet = readyCurrentV2ReviewPacket();
    for (const leaf of statisticalLeaves(packet)) {
      leaf.codingReliabilityGate.review.reviewer = "";
    }
    const legacyEvidenceMarker = "legacy-statistical-dependent-evidence-invalidated";
    const legacyPilotNote =
      "Restore normalization never upgrades historical statistical evidence to current-ready status.";
    const legacyCompletenessNote =
      "Restored completeness is reconciled from normalized statistical leaves before readiness is evaluated.";
    const legacyPlanNote =
      "Legacy-dependent plan evidence was invalidated and rebuilt from normalized current readiness items.";
    for (const report of [
      packet.contents.reportJson,
      packet.contents.runtimeBundle.report,
      packet.contents.projectSnapshot.report
    ]) {
      report.pilotReadinessAudit.notes.push(legacyPilotNote);
      report.completenessAudit.notes.push(legacyCompletenessNote);
    }
    packet.contents.runtimeBundle.pilotReadinessAudit.notes.push(legacyPilotNote);
    packet.contents.runtimeBundle.demoWalkthrough.steps[0].evidence.push(legacyEvidenceMarker);
    packet.contents.runtimeBundle.demoVerification.checks[0].observedEvidence.push(legacyEvidenceMarker);
    packet.contents.runtimeBundle.developmentPlan.notes.push(legacyPlanNote);

    const imported = importSenaReviewPacket(packet);
    const runtimeBundle = imported.contents.runtimeBundle;
    const derivedEvidence = [
      ...runtimeBundle.demoWalkthrough.steps.flatMap((step) => step.evidence),
      ...runtimeBundle.demoVerification.checks.flatMap((check) => check.observedEvidence),
      ...runtimeBundle.developmentPlan.phases.flatMap((phase) => phase.evidence),
      ...runtimeBundle.developmentPlan.notes
    ];
    expect(derivedEvidence).not.toContain(legacyEvidenceMarker);
    const serialized = JSON.stringify(imported);
    for (const legacyOnlyProvenance of [
      legacyEvidenceMarker,
      legacyPilotNote,
      legacyCompletenessNote,
      legacyPlanNote
    ]) {
      expect(serialized).not.toContain(legacyOnlyProvenance);
    }
    expect(serialized).toContain("current-v2-readiness-evidence-reconciled");
    expect(importSenaReviewPacket(structuredClone(imported))).toEqual(imported);
  });

  it("rebuilds current-v2 development-plan and artifact provenance after a reliability downgrade", () => {
    const packet = readyCurrentV2ReviewPacket();
    for (const leaf of statisticalLeaves(packet)) {
      leaf.codingReliabilityGate.review.reviewer = "";
    }
    const staleReliabilityArtifact = packet.contents.runtimeBundle.artifactEvidence
      .find((entry) => entry.filename === "sena-coding-reliability-gate.json");
    if (!staleReliabilityArtifact) throw new Error("Ready fixture has no reliability artifact evidence.");
    staleReliabilityArtifact.matrixCoverage.push("forged-ready-reliability-matrix-evidence");
    staleReliabilityArtifact.evidenceCoverage.push("forged-ready-reliability-evidence");

    const imported = importSenaReviewPacket(packet);
    const runtimeBundle = imported.contents.runtimeBundle;
    const plan = runtimeBundle.developmentPlan;
    const reliabilityItem = runtimeBundle.pilotReadinessAudit.items
      .find((item) => item.id === "coding-reliability");
    const reliabilityPhase = plan.phases.find((phase) => phase.id === "research-validation");
    const pilotPhase = plan.phases.find((phase) => phase.id === "local-research-pilot");
    expect(reliabilityItem?.status).toBe("review");
    expect(reliabilityPhase?.evidence).toContain(
      `${reliabilityItem?.label}: ${reliabilityItem?.status}`
    );
    expect(pilotPhase?.evidence).toContain("pilotReadiness=needs-review");
    expect(plan.nextStage.baseline.evidence).toContain("deliveryCandidate=pre-candidate");
    expect(plan.notes).toContain("Delivery candidate status: pre-candidate.");
    expect(plan.notes).not.toContain("Delivery candidate status: delivery-candidate.");

    const reliabilityArtifact = runtimeBundle.artifactEvidence
      .find((entry) => entry.filename === "sena-coding-reliability-gate.json");
    expect(reliabilityArtifact).toEqual(expect.objectContaining({
      status: "review",
      matrixCoverage: [
        `claimUse=${runtimeBundle.codingReliabilityGate.claimUse}`,
        `coderCount=${runtimeBundle.codingReliabilityGate.review.coderCount}`,
        `blockers=${runtimeBundle.codingReliabilityGate.blockers.length}`
      ],
      evidenceCoverage: runtimeBundle.codingReliabilityGate.evidence
    }));
    expect(reliabilityArtifact?.matrixCoverage).not.toContain("claimUse=research-claim-ready");
    expect(reliabilityArtifact?.matrixCoverage).not.toContain("blockers=0");
    expect(importSenaReviewPacket(structuredClone(imported))).toEqual(imported);
  });

  it.each(["missing", "duplicate", "unknown"] as const)(
    "rejects %s runtime artifact-evidence membership before publication reconciliation",
    (kind) => {
      const packet = readyCurrentV2ReviewPacket();
      const entries = packet.contents.runtimeBundle.artifactEvidence;
      const reliabilityIndex = entries.findIndex((entry) =>
        entry.filename === "sena-coding-reliability-gate.json"
      );
      if (reliabilityIndex < 0) throw new Error("Ready fixture has no reliability artifact evidence.");
      if (kind === "missing") entries.splice(reliabilityIndex, 1);
      if (kind === "duplicate") entries.push(structuredClone(entries[reliabilityIndex]));
      if (kind === "unknown") {
        entries.push({
          ...structuredClone(entries[reliabilityIndex]),
          filename: "unknown-runtime-artifact.json"
        });
      }

      expect(() => importSenaReviewPacket(packet)).toThrow(
        /runtime artifact-evidence membership is invalid/
      );
    }
  );

  it.each(["missing", "duplicate", "unknown"] as const)(
    "rejects %s root artifact-manifest membership before reconciliation",
    (kind) => {
      const packet = readyCurrentV2ReviewPacket();
      const entries = packet.artifactManifest;
      if (kind === "missing") entries.splice(0, 1);
      if (kind === "duplicate") entries.push(structuredClone(entries[0]));
      if (kind === "unknown") {
        entries.push({
          ...structuredClone(entries[0]),
          filename: "unknown-review-packet-artifact.json"
        });
      }

      expect(() => importSenaReviewPacket(packet)).toThrow(
        /SENA review packet artifact-manifest membership is invalid/
      );
    }
  );

  it("rebuilds active-window coding-reliability review caches and Markdown after a downgrade", () => {
    const packet = readyCurrentV2ReviewPacket(undefined, true);
    for (const report of [
      packet.contents.reportJson,
      packet.contents.runtimeBundle.report,
      packet.contents.projectSnapshot.report
    ]) {
      expect(report.figures.activeWindowBrief?.reviewChecklist
        .find((item) => item.id === "coding-reliability")?.status).toBe("present");
    }
    for (const leaf of statisticalLeaves(packet)) {
      leaf.codingReliabilityGate.review.reviewer = "";
    }

    const imported = importSenaReviewPacket(packet);
    for (const report of [
      imported.contents.reportJson,
      imported.contents.runtimeBundle.report,
      imported.contents.projectSnapshot.report
    ]) {
      expect(report.figures.activeWindowBrief?.reviewChecklist
        .find((item) => item.id === "coding-reliability")).toEqual(expect.objectContaining({
          status: "needed",
          detail: "Coding reliability gate remains required before research claims."
        }));
    }
    expect(imported.contents.reportMarkdown).toContain(
      "| Coding reliability | needed | Coding reliability gate remains required before research claims. |"
    );
    expect(importSenaReviewPacket(structuredClone(imported))).toEqual(imported);
  });

  it.each(["missing", "duplicate"] as const)(
    "rejects an active-window brief with a %s human-review checklist item",
    (kind) => {
      const packet = readyCurrentV2ReviewPacket(undefined, true);
      const checklist = packet.contents.projectSnapshot.report.figures.activeWindowBrief?.reviewChecklist;
      if (!checklist) throw new Error("Active-window fixture has no brief checklist.");
      const humanItem = checklist.find((item) => item.id === "human-review");
      if (!humanItem) throw new Error("Active-window fixture has no human-review checklist item.");
      if (kind === "missing") {
        packet.contents.projectSnapshot.report.figures.activeWindowBrief!.reviewChecklist =
          checklist.filter((item) => item.id !== "human-review");
      } else {
        checklist.push(structuredClone(humanItem));
      }

      expect(() => importSenaReviewPacket(packet)).toThrow(
        /active-window review-checklist membership is invalid/
      );
    }
  );

  it("propagates a nested-only current-v2 human-review downgrade into Markdown and derived caches", () => {
    const packet = readyCurrentV2ReviewPacket(undefined, true);
    packet.contents.projectSnapshot.report.humanReview = {
      ...packet.contents.projectSnapshot.report.humanReview,
      status: "human-reviewed",
      reviewer: "",
      interpretation: "Pending human review.",
      limitations: "",
      nextActions: ""
    };
    const independentRuntimeBlocker = packet.contents.runtimeBundle.pilotReadinessAudit.items
      .find((item) => item.id === "data-contract");
    if (!independentRuntimeBlocker) throw new Error("Ready fixture has no data-contract readiness item.");
    const independentRuntimeBlockerWasReady = independentRuntimeBlocker.status === "ready";
    independentRuntimeBlocker.status = "review";
    independentRuntimeBlocker.summary = "Independent runtime data-contract review remains required.";
    independentRuntimeBlocker.evidence = ["independent-runtime-data-contract-review"];
    packet.contents.runtimeBundle.pilotReadinessAudit.status = "needs-review";
    if (independentRuntimeBlockerWasReady) {
      packet.contents.runtimeBundle.pilotReadinessAudit.passed -= 1;
      packet.contents.runtimeBundle.pilotReadinessAudit.reviewNeeded += 1;
    }
    expect(packet.contents.reportJson.pilotReadinessAudit.items.find((item) => item.id === "human-review")?.status)
      .toBe("ready");
    expect(packet.contents.runtimeBundle.pilotReadinessAudit.status).toBe("needs-review");

    const imported = importSenaReviewPacket(packet);
    const runtimeBundle = imported.contents.runtimeBundle;
    expect(imported.summary.pilotReadinessStatus).toBe("needs-review");
    expect(imported.summary.claimReadinessStatus).toBe("exploratory");
    expect(imported.summary.humanReviewStatus).toBe("draft");
    expect(imported.summary.reportCompletenessStatus).toBe("needs-review");
    expect(runtimeBundle.pilotReadinessAudit.status).toBe("needs-review");
    expect(runtimeBundle.claimReadinessGate.status).toBe("exploratory");
    expect(runtimeBundle.developmentPlan.deliveryCandidate.status).toBe("pre-candidate");
    expect(runtimeBundle.developmentPlan.nextStage.status).toBe("verification-required");
    expect(runtimeBundle.demoWalkthrough.summary.pilotReadinessStatus).toBe("needs-review");
    expect(runtimeBundle.demoVerification.summary.pilotReadinessStatus).toBe("needs-review");
    expect(runtimeBundle.pilotReadinessAudit.items.find((item) => item.id === "data-contract"))
      .toEqual(expect.objectContaining({
        status: "review",
        evidence: ["independent-runtime-data-contract-review"]
      }));
    expect(runtimeBundle.pilotReadinessAudit.items.find((item) => item.id === "human-review")?.status)
      .toBe("review");
    expect(imported.contents.developmentPlan).toEqual(runtimeBundle.developmentPlan);
    expect(imported.contents.demoWalkthrough).toEqual(runtimeBundle.demoWalkthrough);
    expect(imported.contents.demoVerification).toEqual(runtimeBundle.demoVerification);
    for (const report of [
      imported.contents.reportJson,
      runtimeBundle.report,
      imported.contents.projectSnapshot.report
    ]) {
      expect(report.humanReview.status).toBe("draft");
      expect(report.humanReview.reviewer).toBe("Review packet human reviewer");
      expect(report.humanReview.interpretation).toBe("Current-v2 packet integrity fixture interpretation.");
      expect(report.humanReview.limitations).toBe("Synthetic fixture only.");
      expect(report.humanReview.nextActions).toBe("Keep duplicated readiness surfaces canonical.");
      expect(report.completenessAudit.status).toBe("needs-review");
      expect(report.completenessAudit.items.find((item) => item.id === "human-review")?.status)
        .toBe("review");
      expect(report.figures.activeWindowBrief?.reviewChecklist.find((item) => item.id === "human-review"))
        .toEqual(expect.objectContaining({
          status: "needed",
          detail: "Human interpretation fields remain draft or incomplete."
        }));
    }
    for (const ledger of [runtimeBundle.evidenceLedger, imported.contents.evidenceLedger]) {
      expect(ledger.humanReview).toEqual(imported.contents.reportJson.humanReview);
    }
    const runtimeArtifact = runtimeBundle.artifactEvidence
      .find((entry) => entry.filename === "sena-runtime-bundle.json");
    expect(runtimeArtifact?.evidenceCoverage).toContain("reportCompleteness=needs-review");
    expect(runtimeArtifact?.evidenceCoverage).not.toContain("reportCompleteness=complete");
    expect(imported.contents.reportMarkdown).toContain("Review status: draft");
    expect(imported.contents.reportMarkdown).toContain("Reviewer: Review packet human reviewer");
    expect(imported.contents.reportMarkdown).toContain(
      "| Human review | needed | Human interpretation fields remain draft or incomplete. |"
    );
    expect(imported.contents.reportMarkdown).toContain([
      "## Pilot Readiness Audit",
      "",
      `- Schema: ${runtimeBundle.pilotReadinessAudit.schemaVersion}`,
      "- Overall status: needs-review"
    ].join("\n"));
    expect(imported.contents.reportMarkdown).toContain([
      "## Claim Readiness Gate",
      "",
      `- Schema: ${runtimeBundle.claimReadinessGate.schemaVersion}`,
      "- Overall status: exploratory"
    ].join("\n"));
    expect(imported.contents.reportMarkdown).toContain([
      "## Report Completeness Audit",
      "",
      "- Overall status: needs-review"
    ].join("\n"));
    expect(importSenaReviewPacket(structuredClone(imported))).toEqual(imported);
  });

  it.each(["runtime ledger", "standalone ledger"] as const)(
    "includes a %s nested human-review downgrade in the canonical publication gate",
    (source) => {
      const packet = readyCurrentV2ReviewPacket();
      const ledger = source === "runtime ledger"
        ? packet.contents.runtimeBundle.evidenceLedger
        : packet.contents.evidenceLedger;
      ledger.humanReview = {
        ...ledger.humanReview,
        status: "draft",
        reviewer: "",
        interpretation: "Pending human review.",
        limitations: "",
        nextActions: ""
      };

      const imported = importSenaReviewPacket(packet);
      expect(imported.summary.humanReviewStatus).toBe("draft");
      expect(imported.summary.pilotReadinessStatus).toBe("needs-review");
      expect(imported.contents.runtimeBundle.pilotReadinessAudit.items
        .find((item) => item.id === "human-review")?.status).toBe("review");
      const canonicalReview = imported.contents.reportJson.humanReview;
      expect(canonicalReview).toEqual(expect.objectContaining({
        status: "draft",
        reviewer: "Review packet human reviewer",
        interpretation: "Current-v2 packet integrity fixture interpretation.",
        limitations: "Synthetic fixture only.",
        nextActions: "Keep duplicated readiness surfaces canonical."
      }));
      for (const candidate of [
        imported.contents.runtimeBundle.report.humanReview,
        imported.contents.projectSnapshot.report.humanReview,
        imported.contents.runtimeBundle.evidenceLedger.humanReview,
        imported.contents.evidenceLedger.humanReview
      ]) expect(candidate).toEqual(canonicalReview);
      expect(importSenaReviewPacket(structuredClone(imported))).toEqual(imported);
    }
  );

  it("rejects conflicting nonempty current-v2 human-review text held by evidence ledgers", () => {
    const packet = readyCurrentV2ReviewPacket();
    packet.contents.runtimeBundle.evidenceLedger.humanReview.interpretation =
      "Runtime-ledger interpretation conflicts with the standalone ledger.";
    packet.contents.evidenceLedger.humanReview.interpretation =
      "Standalone-ledger interpretation conflicts with the runtime ledger.";

    expect(() => importSenaReviewPacket(packet)).toThrow(
      /conflicting current human-review interpretation provenance/
    );
  });

  it.each([
    {
      label: "runtime-derived caches",
      mutate: (
        stalePacket: ReturnType<typeof readyCurrentV2ReviewPacket>,
        readyPacket: ReturnType<typeof readyCurrentV2ReviewPacket>
      ) => {
        stalePacket.contents.runtimeBundle.developmentPlan = structuredClone(
          readyPacket.contents.runtimeBundle.developmentPlan
        );
        stalePacket.contents.runtimeBundle.demoWalkthrough = structuredClone(
          readyPacket.contents.runtimeBundle.demoWalkthrough
        );
        stalePacket.contents.runtimeBundle.demoVerification = structuredClone(
          readyPacket.contents.runtimeBundle.demoVerification
        );
      }
    },
    {
      label: "outer derived caches",
      mutate: (
        stalePacket: ReturnType<typeof readyCurrentV2ReviewPacket>,
        readyPacket: ReturnType<typeof readyCurrentV2ReviewPacket>
      ) => {
        stalePacket.contents.developmentPlan = structuredClone(readyPacket.contents.developmentPlan);
        stalePacket.contents.demoWalkthrough = structuredClone(readyPacket.contents.demoWalkthrough);
        stalePacket.contents.demoVerification = structuredClone(readyPacket.contents.demoVerification);
      }
    },
    {
      label: "review-packet audit cache",
      mutate: (
        stalePacket: ReturnType<typeof readyCurrentV2ReviewPacket>,
        readyPacket: ReturnType<typeof readyCurrentV2ReviewPacket>
      ) => {
        stalePacket.reviewPacketAudit = structuredClone(readyPacket.reviewPacketAudit);
      }
    }
  ])("repairs pre-existing stale current-v2 $label and stays idempotent", ({ mutate }) => {
    const readyPacket = readyCurrentV2ReviewPacket();
    const reliabilityDowngrade = structuredClone(readyPacket);
    for (const leaf of statisticalLeaves(reliabilityDowngrade)) {
      leaf.codingReliabilityGate.review.reviewer = "";
    }
    const canonicalReviewPacket = importSenaReviewPacket(reliabilityDowngrade);
    expect(canonicalReviewPacket.summary.pilotReadinessStatus).toBe("needs-review");
    expect(canonicalReviewPacket.summary.claimReadinessStatus).toBe("exploratory");

    const stalePacket = structuredClone(canonicalReviewPacket);
    mutate(stalePacket, readyPacket);
    expect(stalePacket).not.toEqual(canonicalReviewPacket);

    const imported = importSenaReviewPacket(stalePacket);
    expect(imported.contents.runtimeBundle.developmentPlan.currentGate.pilotReadinessStatus)
      .toBe("needs-review");
    expect(imported.contents.runtimeBundle.developmentPlan.deliveryCandidate.status).toBe("pre-candidate");
    expect(imported.contents.runtimeBundle.developmentPlan.nextStage.status).toBe("verification-required");
    expect(imported.contents.runtimeBundle.demoWalkthrough.summary.pilotReadinessStatus).toBe("needs-review");
    expect(imported.contents.runtimeBundle.demoVerification.summary.pilotReadinessStatus).toBe("needs-review");
    expect(imported.contents.runtimeBundle.demoVerification.summary.automatedReview).toBeGreaterThan(0);
    expect(imported.contents.developmentPlan).toEqual(imported.contents.runtimeBundle.developmentPlan);
    expect(imported.contents.demoWalkthrough).toEqual(imported.contents.runtimeBundle.demoWalkthrough);
    expect(imported.contents.demoVerification).toEqual(imported.contents.runtimeBundle.demoVerification);
    expect(imported.reviewPacketAudit).toEqual(expect.objectContaining({ status: "needs-review" }));
    expect(imported.reviewPacketAudit.items).toContainEqual(expect.objectContaining({
      id: "statistical-contract-reconciliation",
      status: "review"
    }));
    expect(imported).toEqual(canonicalReviewPacket);
    expect(importSenaReviewPacket(structuredClone(imported))).toEqual(imported);
  });

  it("fails closed when current-v2 review-packet runtime gates are both ready but provenance differs", () => {
    const packet = readyCurrentV2ReviewPacket();
    expect(packet.summary.pilotReadinessStatus).toBe("ready");
    expect(packet.summary.claimReadinessStatus).toBe("ready");
    packet.contents.runtimeBundle.codingReliabilityGate.review.reviewer = "Conflicting runtime reviewer";
    expect(packet.contents.runtimeBundle.codingReliabilityGate.status).toBe("ready");
    expect(packet.contents.runtimeBundle.report.codingReliabilityGate.status).toBe("ready");

    expect(() => importSenaReviewPacket(packet))
      .toThrow(/conflicting ready coding-reliability provenance/i);
  });

  it("rejects malformed v2 audit and reliability labels instead of accepting label-only compatibility", () => {
    const base = buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
      generatedAt: "2026-08-21T00:00:00.000Z"
    });
    const malformedAudit = structuredClone(base);
    malformedAudit.contents.fusionMathAudit.items = malformedAudit.contents.fusionMathAudit.items
      .filter((item) => item.id !== "nonnegative-values");
    const malformedGate = structuredClone(base);
    delete (malformedGate.contents.codingReliabilityGate as Partial<typeof malformedGate.contents.codingReliabilityGate>).machineClaimEligibility;

    expect(isSenaReviewPacket(malformedAudit)).toBe(false);
    expect(() => importSenaReviewPacket(malformedAudit)).toThrow(/fusion math audit/i);
    expect(isSenaReviewPacket(malformedGate)).toBe(false);
    expect(() => importSenaReviewPacket(malformedGate)).toThrow(/coding reliability gate/i);
  });

  it("rejects a source-v1 fusion wrapper that is tampered back to verified after JSON serialization", () => {
    const { auditV1 } = packetWithGenuine14bb306StatisticalLeaves();
    const normalized = fusionMath.normalizeSenaFusionMathAudit(auditV1);
    const forged = JSON.parse(JSON.stringify(normalized)) as typeof normalized;
    const nonnegative = forged.items.find((item) => item.id === "nonnegative-values");
    if (!nonnegative) throw new Error("expected normalized nonnegative proof obligation");
    nonnegative.status = "pass";
    nonnegative.actual = "forged current pass";
    nonnegative.detail = ["forged-current-v2-evidence"];
    forged.passed = forged.items.length;
    forged.reviewNeeded = 0;
    forged.status = "verified";

    expect(() => fusionMath.normalizeSenaFusionMathAudit(forged)).toThrow(/source|legacy|nonnegative|fusion math audit/i);

    const carrier = buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
      generatedAt: "2026-08-21T00:00:00.000Z"
    });
    const report = structuredClone(carrier.contents.reportJson);
    report.fusionMathAudit = structuredClone(forged);
    expect(() => importSenaReport(report)).toThrow(/fusion math audit/i);

    const runtime = structuredClone(carrier.contents.runtimeBundle);
    runtime.fusionMathAudit = structuredClone(forged);
    expect(() => importSenaRuntimeBundle(runtime)).toThrow(/fusion math audit/i);

    const nestedRuntime = structuredClone(carrier.contents.runtimeBundle);
    nestedRuntime.report.fusionMathAudit = structuredClone(forged);
    expect(() => importSenaRuntimeBundle(nestedRuntime)).toThrow(/fusion math audit/i);

    const snapshot = structuredClone(carrier.contents.projectSnapshot);
    snapshot.report.fusionMathAudit = structuredClone(forged);
    expect(() => importSenaProjectSnapshot(snapshot)).toThrow(/fusion math audit/i);

    const reviewPacket = structuredClone(carrier);
    reviewPacket.contents.fusionMathAudit = structuredClone(forged);
    expect(() => importSenaReviewPacket(reviewPacket)).toThrow(/fusion math audit/i);
  });

  it("rejects a source-v1 reliability wrapper carrying a coherent current eligible block", () => {
    const { gateV1 } = packetWithGenuine14bb306StatisticalLeaves();
    const legacy = reportRuntime.normalizeSenaCodingReliabilityGate(gateV1);
    const dashboard = buildSenaReliabilityDashboard([
      { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c1", itemId: "u2", codeId: "Evidence", value: false },
      { coderId: "c2", itemId: "u2", codeId: "Evidence", value: false }
    ]);
    const current = reportRuntime.buildSenaCodingReliabilityGate({
      codingReliability: reliabilityDashboardToReview(dashboard, "Reliability reviewer")
    }, "2026-08-21T00:00:00.000Z");
    const forged = JSON.parse(JSON.stringify(legacy)) as typeof legacy;
    forged.review.machineEvidence = structuredClone(current.review.machineEvidence);
    forged.machineClaimEligibility = structuredClone(current.machineClaimEligibility);
    forged.status = "ready";
    forged.claimUse = "coding-reliability-documented";

    expect(() => reportRuntime.normalizeSenaCodingReliabilityGate(forged)).toThrow(/source|legacy|eligibility|coding reliability gate/i);

    const carrier = buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
      generatedAt: "2026-08-21T00:00:00.000Z"
    });
    const report = structuredClone(carrier.contents.reportJson);
    report.codingReliabilityGate = structuredClone(forged);
    expect(() => importSenaReport(report)).toThrow(/coding reliability gate/i);

    const runtime = structuredClone(carrier.contents.runtimeBundle);
    runtime.codingReliabilityGate = structuredClone(forged);
    expect(() => importSenaRuntimeBundle(runtime)).toThrow(/coding reliability gate/i);

    const nestedRuntime = structuredClone(carrier.contents.runtimeBundle);
    nestedRuntime.report.codingReliabilityGate = structuredClone(forged);
    expect(() => importSenaRuntimeBundle(nestedRuntime)).toThrow(/coding reliability gate/i);

    const snapshot = structuredClone(carrier.contents.projectSnapshot);
    snapshot.report.codingReliabilityGate = structuredClone(forged);
    expect(() => importSenaProjectSnapshot(snapshot)).toThrow(/coding reliability gate/i);

    const reviewPacket = structuredClone(carrier);
    reviewPacket.contents.codingReliabilityGate = structuredClone(forged);
    expect(() => importSenaReviewPacket(reviewPacket)).toThrow(/coding reliability gate/i);
  });

  it("rejects proof-obligation substitution at every public fusion reader", () => {
    const packet = buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
      generatedAt: "2026-08-21T00:00:00.000Z"
    });
    const forge = <T,>(value: T): T => {
      const forged = structuredClone(value) as T;
      const audit = asRecord(forged);
      const items = audit.items as JsonRecord[];
      items[0].id = "substituted-proof-obligation";
      return forged;
    };

    expect(() => fusionMath.normalizeSenaFusionMathAudit(forge(packet.contents.fusionMathAudit))).toThrow(/fusion math audit/i);

    const report = structuredClone(packet.contents.reportJson);
    report.fusionMathAudit = forge(report.fusionMathAudit);
    expect(() => importSenaReport(report)).toThrow(/fusion math audit/i);

    const bundle = structuredClone(packet.contents.runtimeBundle);
    bundle.fusionMathAudit = forge(bundle.fusionMathAudit);
    expect(() => importSenaRuntimeBundle(bundle)).toThrow(/fusion math audit/i);

    const nestedBundle = structuredClone(packet.contents.runtimeBundle);
    nestedBundle.report.fusionMathAudit = forge(nestedBundle.report.fusionMathAudit);
    expect(() => importSenaRuntimeBundle(nestedBundle)).toThrow(/fusion math audit/i);

    const snapshot = structuredClone(packet.contents.projectSnapshot);
    snapshot.report.fusionMathAudit = forge(snapshot.report.fusionMathAudit);
    expect(() => importSenaProjectSnapshot(snapshot)).toThrow(/fusion math audit/i);

    const reviewPacket = structuredClone(packet);
    reviewPacket.contents.fusionMathAudit = forge(reviewPacket.contents.fusionMathAudit);
    expect(() => importSenaReviewPacket(reviewPacket)).toThrow(/fusion math audit/i);
  });

  it("derives gate eligibility from canonical raw pairs at every public statistical reader", () => {
    const dashboard = buildSenaReliabilityDashboard([
      { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c1", itemId: "u2", codeId: "Evidence", value: false },
      { coderId: "c2", itemId: "u2", codeId: "Evidence", value: false }
    ]);
    const packet = buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
      generatedAt: "2026-08-21T00:00:00.000Z",
      codingReliability: reliabilityDashboardToReview(dashboard, "Reliability reviewer")
    });
    const forge = <T,>(value: T): T => {
      const forged = structuredClone(value) as T;
      const gate = asRecord(forged);
      const machineEvidence = asRecord(asRecord(gate.review).machineEvidence);
      machineEvidence.coderIds = structuredClone(dashboard.coderIds);
      machineEvidence.pairwiseCohenKappa = structuredClone(dashboard.pairwiseCohenKappa);
      machineEvidence.krippendorffAlphaNominalRaw = dashboard.krippendorffAlphaNominalRaw;
      const pair = (machineEvidence.pairwiseCohenKappa as JsonRecord[])[0];
      pair.raw = { observedAgreement: 0.6, expectedAgreement: 0.5, kappa: 0.2 };
      pair.observedAgreement = 0.6;
      pair.expectedAgreement = 0.5;
      pair.kappa = 0.2;
      expect(machineEvidence.meanPairwiseKappa).toBe(1);
      expect(asRecord(machineEvidence.claimEligibilityInputs).meanPairwiseKappa).toBe(1);
      expect(asRecord(machineEvidence.claimEligibility).eligible).toBe(true);
      return forged;
    };

    expect(() => reportRuntime.normalizeSenaCodingReliabilityGate(forge(packet.contents.codingReliabilityGate)))
      .toThrow(/raw|semantic|eligibility|coding reliability gate/i);

    const report = structuredClone(packet.contents.reportJson);
    report.codingReliabilityGate = forge(report.codingReliabilityGate);
    expect(() => importSenaReport(report)).toThrow(/raw|semantic|eligibility|coding reliability gate/i);

    const bundle = structuredClone(packet.contents.runtimeBundle);
    bundle.codingReliabilityGate = forge(bundle.codingReliabilityGate);
    expect(() => importSenaRuntimeBundle(bundle)).toThrow(/raw|semantic|eligibility|coding reliability gate/i);

    const nestedBundle = structuredClone(packet.contents.runtimeBundle);
    nestedBundle.report.codingReliabilityGate = forge(nestedBundle.report.codingReliabilityGate);
    expect(() => importSenaRuntimeBundle(nestedBundle)).toThrow(/raw|semantic|eligibility|coding reliability gate/i);

    const snapshot = structuredClone(packet.contents.projectSnapshot);
    snapshot.report.codingReliabilityGate = forge(snapshot.report.codingReliabilityGate);
    expect(() => importSenaProjectSnapshot(snapshot)).toThrow(/raw|semantic|eligibility|coding reliability gate/i);

    const reviewPacket = structuredClone(packet);
    reviewPacket.contents.codingReliabilityGate = forge(reviewPacket.contents.codingReliabilityGate);
    expect(() => importSenaReviewPacket(reviewPacket)).toThrow(/raw|semantic|eligibility|coding reliability gate/i);
  });

  it.each([
    {
      label: "null estimates",
      mutate: (gate: JsonRecord) => {
        const evidence = asRecord(asRecord(gate.review).machineEvidence);
        const inputs = asRecord(evidence.claimEligibilityInputs);
        inputs.meanPairwiseKappa = null;
        inputs.krippendorffAlphaNominal = null;
        inputs.krippendorffAlphaNominalStatus = "single-observed-category";
        evidence.meanPairwiseKappa = null;
        evidence.krippendorffAlphaNominal = null;
        evidence.krippendorffAlphaNominalStatus = "single-observed-category";
      }
    },
    {
      label: "below-threshold estimates",
      mutate: (gate: JsonRecord) => {
        const evidence = asRecord(asRecord(gate.review).machineEvidence);
        const inputs = asRecord(evidence.claimEligibilityInputs);
        inputs.meanPairwiseKappa = 0.79;
        inputs.krippendorffAlphaNominal = 0.79;
        evidence.meanPairwiseKappa = 0.79;
        evidence.krippendorffAlphaNominal = 0.79;
      }
    },
    {
      label: "an unestimable pair",
      mutate: (gate: JsonRecord) => {
        const evidence = asRecord(asRecord(gate.review).machineEvidence);
        const inputs = asRecord(evidence.claimEligibilityInputs);
        inputs.pairwiseKappaStatuses = ["insufficient-pairable-units"];
        inputs.meanPairwiseKappa = null;
        evidence.meanPairwiseKappaStatus = "insufficient-pairable-units";
        evidence.meanPairwiseKappa = null;
        evidence.allPairwiseKappaEstimable = false;
      }
    }
  ])("rejects review-packet forged eligible=true with $label", ({ mutate }) => {
    const dashboard = buildSenaReliabilityDashboard([
      { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c1", itemId: "u2", codeId: "Evidence", value: false },
      { coderId: "c2", itemId: "u2", codeId: "Evidence", value: false }
    ]);
    const packet = buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
      generatedAt: "2026-08-21T00:00:00.000Z",
      codingReliability: reliabilityDashboardToReview(dashboard, "Reliability reviewer")
    });
    const forged = structuredClone(packet);
    const gate = asRecord(forged.contents.codingReliabilityGate);
    mutate(gate);
    const eligibility = asRecord(gate.machineClaimEligibility);
    eligibility.eligible = true;
    eligibility.blockers = [];
    eligibility.checks = {
      minimumCoders: true,
      allPairwiseKappaEstimable: true,
      krippendorffAlphaEstimable: true,
      meanPairwiseKappaAtThreshold: true,
      krippendorffAlphaAtThreshold: true
    };

    expect(isSenaReviewPacket(forged)).toBe(false);
    expect(() => importSenaReviewPacket(forged)).toThrow(/semantic|eligibility|coding reliability gate/i);
  });
});
