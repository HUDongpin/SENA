import { describe, expect, it } from "vitest";
import * as fusionMath from "../fusion-math";
import * as reportRuntime from "../report";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import { buildSenaReviewPacket, importSenaReviewPacket, isSenaReviewPacket } from "../review-packet";
import { SENA_LEGACY_SCHEMA_VERSIONS } from "../schema-registry";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown) {
  return value as JsonRecord;
}

function genuineFusionAuditV1(current: unknown) {
  const source = structuredClone(asRecord(current));
  const items = (source.items as JsonRecord[]).filter((item) => item.id !== "nonnegative-values");
  const matrixFingerprints = (source.matrixFingerprints as JsonRecord[]).map((fingerprint) => {
    const { pairDescriptors: _v2OnlyPairDescriptors, ...legacy } = fingerprint;
    return legacy;
  });
  const passed = items.filter((item) => item.status === "pass").length;
  return {
    schemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.fusionMathAudit,
    status: passed === items.length ? "verified" : "needs-review",
    passed,
    reviewNeeded: items.length - passed,
    items,
    matrixFingerprints,
    notes: source.notes
  };
}

function genuineCodingReliabilityGateV1(current: unknown) {
  const source = structuredClone(asRecord(current));
  const review = asRecord(source.review);
  const { machineEvidence: _v2OnlyMachineEvidence, ...legacyReview } = review;
  return {
    schemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.codingReliabilityGate,
    status: source.status,
    claimUse: source.claimUse,
    review: legacyReview,
    requiredEvidence: source.requiredEvidence,
    evidence: (source.evidence as string[]).filter((entry) => !entry.startsWith("machine")),
    blockers: source.blockers,
    guardrail: source.guardrail,
    notes: [
      "This standalone report gate records the reviewed reliability evidence attached to the current export.",
      "Use the enterprise reliability workflow for raw multi-coder files, Cohen kappa, Krippendorff alpha, code-level diagnostics, adjudication history, and reviewer sign-off before publication-facing claims."
    ]
  };
}

function packetWithGenuine14bb306StatisticalLeaves() {
  const packet = structuredClone(buildSenaReviewPacket(buildSenaModel(lessonStudySenaContract), {
    generatedAt: "2026-08-21T00:00:00.000Z"
  }));
  const auditV1 = genuineFusionAuditV1(packet.contents.fusionMathAudit);
  const gateV1 = genuineCodingReliabilityGateV1(packet.contents.codingReliabilityGate);

  packet.contents.fusionMathAudit = auditV1 as never;
  packet.contents.codingReliabilityGate = gateV1 as never;
  packet.contents.reportJson.fusionMathAudit = structuredClone(auditV1) as never;
  packet.contents.reportJson.codingReliabilityGate = structuredClone(gateV1) as never;
  packet.contents.runtimeBundle.fusionMathAudit = structuredClone(auditV1) as never;
  packet.contents.runtimeBundle.codingReliabilityGate = structuredClone(gateV1) as never;
  packet.contents.runtimeBundle.report.fusionMathAudit = structuredClone(auditV1) as never;
  packet.contents.runtimeBundle.report.codingReliabilityGate = structuredClone(gateV1) as never;
  packet.contents.projectSnapshot.report.fusionMathAudit = structuredClone(auditV1) as never;
  packet.contents.projectSnapshot.report.codingReliabilityGate = structuredClone(gateV1) as never;
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
});
