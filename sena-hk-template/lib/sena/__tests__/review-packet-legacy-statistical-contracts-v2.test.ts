import { describe, expect, it } from "vitest";
import * as fusionMath from "../fusion-math";
import * as reportRuntime from "../report";
import { buildSenaModel } from "../model";
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

function readyCurrentV2ReviewPacket() {
  const dashboard = buildSenaReliabilityDashboard([
    { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
    { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true },
    { coderId: "c1", itemId: "u2", codeId: "Evidence", value: false },
    { coderId: "c2", itemId: "u2", codeId: "Evidence", value: false }
  ]);
  return JSON.parse(JSON.stringify(buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
    generatedAt: "2026-08-25T00:00:00.000Z",
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
    }
  }))) as ReturnType<typeof buildSenaReviewPacket>;
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
      expect(normalizedDependentEvidence).not.toMatch(/Fusion equation audit: (?:pass|ready)/);
      expect(normalizedDependentEvidence).not.toContain("Fusion labels and dimensions: pass");
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
