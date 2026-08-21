import { describe, expect, it } from "vitest";
import { buildSenaModel } from "../model";
import {
  bindSenaReliabilityAnnotationsToProject,
  buildSenaReliabilityClaimEligibility,
  buildSenaReliabilityDashboard,
  normalizeSenaReliabilityDashboard,
  reliabilityDashboardToReview,
  type SenaCoderAnnotation
} from "../reliability";
import { normalizeSenaCodingReliabilityGate } from "../report";
import { buildSenaReviewPacket, importSenaReviewPacket } from "../review-packet";
import { buildSenaProjectSnapshot, importSenaProjectSnapshot } from "../snapshot";
import { importSenaReport, importSenaRuntimeBundle } from "../statistical-leaf-read";
import type { SenaDataset } from "../types";

function tenItemDataset(): SenaDataset {
  return {
    people: [{ id: "p1", label: "Person 1", role: "reviewer", group: "review" }],
    interactions: [],
    utterances: Array.from({ length: 10 }, (_, index) => ({
      id: `u${index + 1}`,
      personId: "p1",
      unitId: `unit-${index + 1}`,
      stanzaId: `stanza-${index + 1}`,
      stage: "coding",
      turnIndex: index + 1,
      text: `Reliability item ${index + 1}`
    })),
    coded_segments: [],
    codebook: [{
      id: "evidence",
      label: "Evidence",
      family: "reasoning",
      description: "Evidence use",
      color: "#2563eb"
    }]
  };
}

function oneDisagreementAnnotations(): SenaCoderAnnotation[] {
  const coder1 = [true, true, true, true, true, false, false, false, false, false];
  const coder2 = [true, true, true, true, true, true, false, false, false, false];
  return coder1.flatMap((value, index) => ([
    { coderId: "c1", itemId: `u${index + 1}`, codeId: "evidence", value },
    { coderId: "c2", itemId: `u${index + 1}`, codeId: "evidence", value: coder2[index] }
  ]));
}

function baseSnapshot() {
  const dataset = tenItemDataset();
  return buildSenaProjectSnapshot(buildSenaModel(dataset), {
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: dataset
  });
}

function boundDashboard() {
  const bound = bindSenaReliabilityAnnotationsToProject(oneDisagreementAnnotations(), {
    projectId: "adjudication-project",
    projectVersion: 1,
    snapshot: baseSnapshot()
  });
  return buildSenaReliabilityDashboard(bound.annotations, { projectBinding: bound.binding });
}

function packet() {
  const dataset = tenItemDataset();
  return buildSenaReviewPacket(buildSenaModel(dataset), {
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: dataset,
    codingReliability: reliabilityDashboardToReview(boundDashboard(), "Reliability reviewer")
  });
}

describe("SENA reliability adjudication-aware eligibility", () => {
  it("keeps kappa=.80 and alpha>.80 ineligible while one canonical disagreement is unresolved", () => {
    const dashboard = boundDashboard();

    expect(dashboard.pairwiseCohenKappa[0].raw.kappa).toBeCloseTo(0.8, 12);
    expect(dashboard.krippendorffAlphaNominalRaw).toBeGreaterThan(0.8);
    expect(dashboard.disagreementCount).toBe(1);
    expect(dashboard.adjudicationQueue).toHaveLength(1);
    expect(dashboard.claimEligibility.eligible).toBe(false);
    expect(dashboard.claimEligibility.blockers).toContain("unresolved-reliability-disagreements");
  });

  it("keeps the coding-reliability gate in review for the unresolved canonical queue", () => {
    const gate = normalizeSenaCodingReliabilityGate(packet().contents.codingReliabilityGate);

    expect(gate.machineClaimEligibility.eligible).toBe(false);
    expect(gate.machineClaimEligibility.blockers).toContain("unresolved-reliability-disagreements");
    expect(gate.status).toBe("review");
  });

  it("preserves unresolved ineligibility across report, runtime, snapshot, and review reads", () => {
    const reviewPacket = packet();
    const gates = [
      importSenaReport(reviewPacket.contents.reportJson).codingReliabilityGate,
      importSenaRuntimeBundle(reviewPacket.contents.runtimeBundle).codingReliabilityGate,
      importSenaProjectSnapshot(reviewPacket.contents.projectSnapshot).report.codingReliabilityGate,
      importSenaReviewPacket(reviewPacket).contents.codingReliabilityGate
    ];

    expect(gates).toHaveLength(4);
    for (const gate of gates) {
      expect(gate.machineClaimEligibility.eligible).toBe(false);
      expect(gate.machineClaimEligibility.blockers).toContain("unresolved-reliability-disagreements");
    }
  });

  it("rejects a coordinated eligible rewrite that retains the canonical disagreement binding", () => {
    const forged = structuredClone(boundDashboard());
    forged.claimEligibility.eligible = true;
    forged.claimEligibility.blockers = [];

    expect(() => normalizeSenaReliabilityDashboard(forged))
      .toThrow(/adjudication|disagreement|eligib|derived|binding|dashboard/i);
  });

  it("rejects a standalone count rewrite while the verifiable adjudication queue remains unresolved", () => {
    const forged = buildSenaReliabilityDashboard(oneDisagreementAnnotations());
    forged.disagreementCount = 0;
    forged.claimEligibilityInputs.unresolvedDisagreementCount = 0;
    forged.claimEligibility = buildSenaReliabilityClaimEligibility({
      coderCount: forged.coderCount,
      pairwiseStatuses: forged.claimEligibilityInputs.pairwiseKappaStatuses,
      meanPairwiseKappa: forged.claimEligibilityInputs.meanPairwiseKappa,
      krippendorffAlphaNominal: forged.claimEligibilityInputs.krippendorffAlphaNominal,
      krippendorffAlphaNominalStatus: forged.claimEligibilityInputs.krippendorffAlphaNominalStatus,
      unresolvedDisagreementCount: 0
    });

    expect(forged.adjudicationQueue).toHaveLength(1);
    expect(() => normalizeSenaReliabilityDashboard(forged))
      .toThrow(/adjudication|disagreement|eligib|dashboard/i);
  });
});
