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
