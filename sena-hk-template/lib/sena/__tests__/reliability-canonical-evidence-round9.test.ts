import { describe, expect, it } from "vitest";
import { buildSenaModel } from "../model";
import {
  bindSenaReliabilityAnnotationsToProject,
  buildSenaReliabilityClaimEligibility,
  buildSenaReliabilityDashboard,
  normalizeSenaReliabilityDashboard,
  type SenaCoderAnnotation,
  type SenaSkippedCoderCell
} from "../reliability";
import { buildSenaProjectSnapshot } from "../snapshot";
import type { SenaDataset } from "../types";

type DashboardDerivationEvidence = {
  hashAlgorithm: "sena-stable-fnv1a32/v1";
  annotationCoverageHash: string;
  skippedCellCoverageHash: string;
  annotations: SenaCoderAnnotation[];
  skippedCells: SenaSkippedCoderCell[];
};

function evidenceOf(value: unknown) {
  return (value as { derivationEvidence?: DashboardDerivationEvidence }).derivationEvidence;
}

function oneDisagreementAnnotations(itemCount = 2): SenaCoderAnnotation[] {
  return Array.from({ length: itemCount }, (_, index) => {
    const itemId = `u${index + 1}`;
    return [
      { coderId: "c1", itemId, codeId: "evidence", value: index % 2 === 0 },
      { coderId: "c2", itemId, codeId: "evidence", value: index === 0 ? false : index % 2 === 0 }
    ];
  }).flat();
}

function allDisagreementAnnotations(itemCount: number): SenaCoderAnnotation[] {
  return Array.from({ length: itemCount }, (_, index) => {
    const value = index % 2 === 0;
    const itemId = `u${index + 1}`;
    return [
      { coderId: "c1", itemId, codeId: "evidence", value },
      { coderId: "c2", itemId, codeId: "evidence", value: !value }
    ];
  }).flat();
}

function projectDataset(): SenaDataset {
  return {
    people: [{ id: "p1", label: "Person 1", role: "reviewer", group: "review" }],
    interactions: [],
    utterances: ["u1", "u2"].map((id, index) => ({
      id,
      personId: "p1",
      unitId: `unit-${id}`,
      stanzaId: `stanza-${id}`,
      stage: "coding",
      turnIndex: index + 1,
      text: `Item ${id}`
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

describe("SENA reliability canonical derivation evidence", () => {
  it("writes canonical annotations, skipped cells, and independent hashes into every current dashboard", () => {
    const annotations: SenaCoderAnnotation[] = [
      { coderId: "c2", itemId: "u1", codeId: "evidence", value: true },
      { coderId: "c1", itemId: "u2", codeId: "evidence", value: false },
      { coderId: "c1", itemId: "u1", codeId: "evidence", value: true }
    ];
    const skippedCells: SenaSkippedCoderCell[] = [
      { coderId: "c2", itemId: "u2", codeIds: ["evidence"] }
    ];

    const dashboard = buildSenaReliabilityDashboard(annotations, { skippedCells });
    const evidence = evidenceOf(dashboard);

    expect(evidence).toEqual({
      hashAlgorithm: "sena-stable-fnv1a32/v1",
      annotationCoverageHash: expect.stringMatching(/^0x[a-f0-9]{8}$/),
      skippedCellCoverageHash: expect.stringMatching(/^0x[a-f0-9]{8}$/),
      annotations: [
        { coderId: "c1", itemId: "u1", codeId: "evidence", value: true },
        { coderId: "c1", itemId: "u2", codeId: "evidence", value: false },
        { coderId: "c2", itemId: "u1", codeId: "evidence", value: true }
      ],
      skippedCells
    });
    expect(normalizeSenaReliabilityDashboard(structuredClone(dashboard))).toEqual(dashboard);
  });

  it("rejects a coordinated standalone deletion of queue, count, inputs, eligibility, and derivation truth", () => {
    const forged = structuredClone(buildSenaReliabilityDashboard(oneDisagreementAnnotations()));
    forged.adjudicationQueue = [];
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
    delete (forged as { derivationEvidence?: unknown }).derivationEvidence;

    expect(() => normalizeSenaReliabilityDashboard(forged))
      .toThrow(/annotation|derivation|evidence|dashboard|disagreement/i);
  });

  it("requires project-bound derivation evidence to exactly match annotation and skipped-cell binding coverage", () => {
    const dataset = projectDataset();
    const snapshot = buildSenaProjectSnapshot(buildSenaModel(dataset), {
      generatedAt: "2026-08-21T00:00:00.000Z",
      sourceDataset: dataset
    });
    const skippedCells: SenaSkippedCoderCell[] = [{ coderId: "c2", itemId: "u2", codeIds: ["evidence"] }];
    const bound = bindSenaReliabilityAnnotationsToProject(oneDisagreementAnnotations(), {
      projectId: "round9-project",
      projectVersion: 1,
      snapshot,
      skippedCells
    });
    const dashboard = buildSenaReliabilityDashboard(bound.annotations, {
      skippedCells,
      projectBinding: bound.binding
    });
    const alternate = buildSenaReliabilityDashboard([
      { coderId: "c1", itemId: "u1", codeId: "evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "evidence", value: true },
      { coderId: "c1", itemId: "u2", codeId: "evidence", value: true },
      { coderId: "c2", itemId: "u2", codeId: "evidence", value: false }
    ]);
    (dashboard as { derivationEvidence?: DashboardDerivationEvidence }).derivationEvidence = evidenceOf(alternate);

    expect(() => normalizeSenaReliabilityDashboard(dashboard))
      .toThrow(/annotation|binding|derivation|evidence|dashboard/i);
  });

  it.each([201, 500])("preserves all %i canonical disagreements without truncating the authoritative queue", (count) => {
    const dashboard = buildSenaReliabilityDashboard(allDisagreementAnnotations(count));

    expect(dashboard.disagreementCount).toBe(count);
    expect(dashboard.adjudicationQueue).toHaveLength(count);
    expect(normalizeSenaReliabilityDashboard(structuredClone(dashboard)).adjudicationQueue).toHaveLength(count);
  });
});
