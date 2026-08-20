import { describe, expect, it } from "vitest";
import {
  buildSenaReliabilityClaimEligibility,
  buildSenaReliabilityDashboard,
  normalizeSenaReliabilityDashboard,
  reliabilityDashboardToReview,
  type SenaCoderAnnotation
} from "../reliability";
import { SENA_LEGACY_SCHEMA_VERSIONS } from "../schema-registry";
import { buildSenaCodingReliabilityGate } from "../report";
import { buildEnterpriseReliabilityRunHeaders } from "../enterprise/reliability-runs";

function annotations(valuesByCoder: Record<string, boolean[]>): SenaCoderAnnotation[] {
  return Object.entries(valuesByCoder).flatMap(([coderId, values]) => values.map((value, index) => ({
    coderId,
    itemId: `u${index + 1}`,
    codeId: "Evidence",
    value
  })));
}

describe("SENA coding reliability v2", () => {
  it.each([
    { c1: [true, true], c2: [true, true] },
    { c1: [false, false], c2: [false, false] }
  ])("marks a single observed category as unestimable", (values) => {
    const dashboard = buildSenaReliabilityDashboard(annotations(values));

    expect(dashboard.schemaVersion).toBe("sena-coding-reliability-dashboard/v2");
    expect(dashboard.status).toBe("single-observed-category");
    expect(dashboard.pairwiseCohenKappa[0]).toEqual(expect.objectContaining({
      status: "single-observed-category",
      units: 2,
      observedAgreement: 1,
      expectedAgreement: 1,
      kappa: null
    }));
    expect(dashboard.meanPairwiseKappaStatus).toBe("single-observed-category");
    expect(dashboard.meanPairwiseKappa).toBeNull();
    expect(dashboard.krippendorffAlphaNominalStatus).toBe("single-observed-category");
    expect(dashboard.krippendorffAlphaNominal).toBeNull();
    expect(dashboard.claimEligibility.eligible).toBe(false);
  });

  it("uses null for every pairwise estimate when fewer than two units are pairable", () => {
    const dashboard = buildSenaReliabilityDashboard(annotations({ c1: [true], c2: [true] }));

    expect(dashboard.status).toBe("insufficient-pairable-units");
    expect(dashboard.pairwiseCohenKappa[0]).toEqual(expect.objectContaining({
      status: "insufficient-pairable-units",
      units: 1,
      observedAgreement: null,
      expectedAgreement: null,
      kappa: null
    }));
    expect(dashboard.meanPairwiseKappa).toBeNull();
    expect(dashboard.krippendorffAlphaNominal).toBeNull();
  });

  it("estimates varied perfect agreement as kappa 1 and alpha 1", () => {
    const dashboard = buildSenaReliabilityDashboard(annotations({
      c1: [true, false],
      c2: [true, false]
    }));

    expect(dashboard.status).toBe("estimable");
    expect(dashboard.pairwiseCohenKappa[0]).toEqual(expect.objectContaining({
      status: "estimable",
      observedAgreement: 1,
      expectedAgreement: 0.5,
      kappa: 1
    }));
    expect(dashboard.meanPairwiseKappaStatus).toBe("estimable");
    expect(dashboard.meanPairwiseKappa).toBe(1);
    expect(dashboard.krippendorffAlphaNominalStatus).toBe("estimable");
    expect(dashboard.krippendorffAlphaNominal).toBe(1);
    expect(dashboard.claimEligibility.eligible).toBe(true);
    expect(dashboard.claimEligibility.adjudication.status).toBe("external-not-evaluated");
  });

  it("requires at least two coders", () => {
    const dashboard = buildSenaReliabilityDashboard(annotations({ c1: [true, false] }));

    expect(dashboard.status).toBe("insufficient-coders");
    expect(dashboard.meanPairwiseKappaStatus).toBe("insufficient-coders");
    expect(dashboard.meanPairwiseKappa).toBeNull();
    expect(dashboard.krippendorffAlphaNominalStatus).toBe("insufficient-coders");
    expect(dashboard.krippendorffAlphaNominal).toBeNull();
    expect(dashboard.claimEligibility.eligible).toBe(false);
  });

  it("blocks the overall mean and claim eligibility when any coder pair is unestimable", () => {
    const parsed = annotations({
      c1: [true, false],
      c2: [true, false],
      c3: [true]
    });
    const dashboard = buildSenaReliabilityDashboard(parsed, {
      skippedCells: [{ coderId: "c3", itemId: "u2", codeIds: ["Evidence"] }]
    });

    expect(dashboard.pairwiseCohenKappa.some((pair) => pair.status !== "estimable")).toBe(true);
    expect(dashboard.meanPairwiseKappa).toBeNull();
    expect(dashboard.claimEligibility.eligible).toBe(false);
    expect(dashboard.claimEligibility.blockers).toContain("all-pairwise-kappa-estimable");
  });

  it("applies the 0.8000 threshold without rounding .7999 upward", () => {
    const below = buildSenaReliabilityClaimEligibility({
      coderCount: 2,
      pairwiseStatuses: ["estimable"],
      meanPairwiseKappa: 0.7999,
      krippendorffAlphaNominal: 0.8,
      krippendorffAlphaNominalStatus: "estimable"
    });
    const at = buildSenaReliabilityClaimEligibility({
      coderCount: 2,
      pairwiseStatuses: ["estimable"],
      meanPairwiseKappa: 0.8,
      krippendorffAlphaNominal: 0.8,
      krippendorffAlphaNominalStatus: "estimable"
    });

    expect(below.eligible).toBe(false);
    expect(at.eligible).toBe(true);
  });

  it("normalizes v1 dashboards as legacy-ambiguous and never current-eligible", () => {
    const current = buildSenaReliabilityDashboard(annotations({ c1: [true, false], c2: [true, false] }));
    const legacy = {
      ...current,
      schemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.codingReliabilityDashboard,
      pairwiseCohenKappa: current.pairwiseCohenKappa.map(({ status: _status, ...pair }) => pair),
      codeDiagnostics: current.codeDiagnostics.map((diagnostic) => ({
        ...diagnostic,
        pairwiseCohenKappa: diagnostic.pairwiseCohenKappa.map(({ status: _status, ...pair }) => pair)
      })),
      meanPairwiseKappa: 0,
      krippendorffAlphaNominal: 0
    } as unknown;

    const normalized = normalizeSenaReliabilityDashboard(legacy);

    expect(normalized.sourceSchemaVersion).toBe("sena-coding-reliability-dashboard/v1");
    expect(normalized.status).toBe("legacy-ambiguous");
    expect(normalized.pairwiseCohenKappa.every((pair) => pair.status === "legacy-ambiguous")).toBe(true);
    expect(normalized.claimEligibility.eligible).toBe(false);
    expect(normalized.claimEligibility.blockers).toContain("current-v2-estimates-required");
  });

  it("never stringifies null scores as reliability values and emits JSON-safe output", () => {
    const dashboard = buildSenaReliabilityDashboard(annotations({ c1: [true], c2: [true] }));
    const review = reliabilityDashboardToReview(dashboard, "Reliability reviewer");
    const json = JSON.stringify(dashboard);

    expect(review.agreementValue).not.toContain("null");
    expect(review.agreementValue).toContain("not estimable");
    expect(json).not.toMatch(/NaN|Infinity/);
    expect(JSON.parse(json).meanPairwiseKappa).toBeNull();
  });

  it("emits a v2 documentation gate with separate machine eligibility", () => {
    const dashboard = buildSenaReliabilityDashboard(annotations({
      c1: [true, false],
      c2: [true, false]
    }));
    const gate = buildSenaCodingReliabilityGate({
      codingReliability: reliabilityDashboardToReview(dashboard, "Reliability reviewer")
    }, "2026-08-21T00:00:00.000Z");

    expect(gate.schemaVersion).toBe("sena-coding-reliability-gate/v2");
    expect(gate.machineClaimEligibility.eligible).toBe(true);
    expect(gate.machineClaimEligibility.status).toBe("estimable");
    expect(gate.machineClaimEligibility.adjudication.status).toBe("external-not-evaluated");

    const documentationOnly = buildSenaCodingReliabilityGate({
      codingReliability: {
        status: "documented",
        reviewer: "Legacy reviewer",
        codingScheme: "Legacy scheme",
        unitOfCoding: "item-code units",
        coderCount: 2,
        agreementMetric: "Legacy kappa",
        agreementValue: "0.90",
        adjudicationNotes: "Externally reviewed.",
        limitations: "Legacy score convention."
      }
    }, "2026-08-21T00:00:00.000Z");
    expect(documentationOnly.machineClaimEligibility.eligible).toBe(false);
    expect(documentationOnly.machineClaimEligibility.status).toBe("legacy-ambiguous");
  });

  it("omits score headers when reliability estimates are null", () => {
    const headers = buildEnterpriseReliabilityRunHeaders({
      id: "rel-missing-score",
      status: "pending-review",
      meanPairwiseKappa: null,
      krippendorffAlphaNominal: null,
      adjudicationCoverage: {
        schemaVersion: "sena-reliability-adjudication-coverage/v1",
        queuedDisagreements: 0,
        resolvedDisagreements: 0,
        unresolvedDisagreements: 0,
        coverageRate: 1,
        decisions: { include: 0, exclude: 0, revise: 0 },
        updatedAt: "2026-08-21T00:00:00.000Z"
      }
    });

    expect(headers).not.toHaveProperty("x-sena-mean-pairwise-kappa");
    expect(headers).not.toHaveProperty("x-sena-krippendorff-alpha");
    expect(JSON.stringify(headers)).not.toContain("null");
  });
});
