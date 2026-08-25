import { describe, expect, it } from "vitest";
import {
  buildSenaReliabilityClaimEligibility,
  buildSenaReliabilityDashboard,
  isCurrentSenaReliabilityDashboard,
  normalizeSenaReliabilityDashboard,
  reliabilityDashboardToReview,
  type SenaCoderAnnotation,
  type SenaReliabilityDashboardReadModel,
  type SenaReliabilityDashboardV1
} from "../reliability";
import { SENA_LEGACY_SCHEMA_VERSIONS } from "../schema-registry";
import {
  buildSenaCodingReliabilityGate,
  isCurrentSenaCodingReliabilityGate,
  normalizeSenaCodingReliabilityGate
} from "../report";
import { buildEnterpriseReliabilityRunHeaders } from "../enterprise/reliability-runs";
import { emptyEnterpriseDb, normalizeEnterpriseDb } from "../enterprise/state";
import { createEnterprisePostgresReliabilityRunAdapter } from "../enterprise-postgres";

function annotations(valuesByCoder: Record<string, boolean[]>): SenaCoderAnnotation[] {
  return Object.entries(valuesByCoder).flatMap(([coderId, values]) => values.map((value, index) => ({
    coderId,
    itemId: `u${index + 1}`,
    codeId: "Evidence",
    value
  })));
}

function postgresJsonbRoundTrip<T>(value: T): T {
  const reorder = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(reorder);
    if (entry && typeof entry === "object") {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>)
          .sort(([left], [right]) => left === right ? 0 : left < right ? 1 : -1)
          .map(([key, child]) => [key, reorder(child)])
      );
    }
    return entry;
  };
  return reorder(JSON.parse(JSON.stringify(value))) as T;
}

function historicalReliabilityDashboardV1(): SenaReliabilityDashboardV1 {
  const pair = {
    coderA: "c1",
    coderB: "c2",
    units: 2,
    observedAgreement: 1,
    expectedAgreement: 0.5,
    kappa: 1
  };
  return {
    schemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.codingReliabilityDashboard,
    coderCount: 2,
    itemCount: 2,
    codeCount: 1,
    binaryUnitCount: 2,
    pairwiseCohenKappa: [pair],
    codeDiagnostics: [{
      codeId: "Evidence",
      unitCount: 2,
      positiveAssignments: 2,
      disagreementCount: 0,
      agreementRate: 1,
      coderPositiveRates: { c1: 0.5, c2: 0.5 },
      pairwiseCohenKappa: [pair]
    }],
    meanPairwiseKappa: 1,
    krippendorffAlphaNominal: 1,
    disagreementCount: 0,
    adjudicationQueue: [],
    interpretation: "Historical v1 fixture.",
    warnings: []
  };
}

function storedReliabilityRun(dashboard: ReturnType<typeof buildSenaReliabilityDashboard>) {
  return {
    id: "rel_semantic_boundary",
    teamId: "team_semantic_boundary",
    userId: "user_semantic_boundary",
    status: "pending-review" as const,
    reviewer: "Semantic boundary reviewer",
    fileCount: 1,
    annotationCount: 4,
    coderCount: dashboard.coderCount,
    itemCount: dashboard.itemCount,
    codeCount: dashboard.codeCount,
    meanPairwiseKappa: dashboard.meanPairwiseKappa,
    krippendorffAlphaNominal: dashboard.krippendorffAlphaNominal,
    disagreementCount: dashboard.disagreementCount,
    inputFiles: [{ name: "ratings.csv", size: 1, sha256: "a".repeat(64) }],
    dashboard,
    adjudicationCoverage: {
      schemaVersion: "sena-reliability-adjudication-coverage/v1" as const,
      queuedDisagreements: 0,
      resolvedDisagreements: 0,
      unresolvedDisagreements: 0,
      coverageRate: 1,
      decisions: { include: 0, exclude: 0, revise: 0 },
      updatedAt: "2026-08-21T00:00:00.000Z"
    },
    reviewPatch: {},
    createdAt: "2026-08-21T00:00:00.000Z"
  };
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
      krippendorffAlphaNominalStatus: "estimable",
      unresolvedDisagreementCount: 0
    });
    const at = buildSenaReliabilityClaimEligibility({
      coderCount: 2,
      pairwiseStatuses: ["estimable"],
      meanPairwiseKappa: 0.8,
      krippendorffAlphaNominal: 0.8,
      krippendorffAlphaNominalStatus: "estimable",
      unresolvedDisagreementCount: 0
    });

    expect(below.eligible).toBe(false);
    expect(at.eligible).toBe(true);
  });

  it("uses raw reliability estimates for eligibility even when display rounding yields 0.8000", () => {
    const coder1 = [
      ...Array<boolean>(53).fill(true),
      ...Array<boolean>(65).fill(false),
      ...Array<boolean>(5).fill(true),
      ...Array<boolean>(8).fill(false)
    ];
    const coder2 = [
      ...Array<boolean>(53).fill(true),
      ...Array<boolean>(65).fill(false),
      ...Array<boolean>(5).fill(false),
      ...Array<boolean>(8).fill(true)
    ];
    const dashboard = buildSenaReliabilityDashboard(annotations({ c1: coder1, c2: coder2 }));

    expect(dashboard.pairwiseCohenKappa[0].kappa).toBe(0.8);
    expect(dashboard.meanPairwiseKappa).toBe(0.8);
    expect(dashboard.pairwiseCohenKappa[0].raw.kappa).toBe(dashboard.claimEligibilityInputs.meanPairwiseKappa);
    expect(dashboard.pairwiseCohenKappa[0].raw.kappa).toBeGreaterThan(0.7999);
    expect(dashboard.pairwiseCohenKappa[0].raw.kappa).toBeLessThan(0.8);
    expect(dashboard.claimEligibilityInputs.meanPairwiseKappa).toBeGreaterThan(0.7999);
    expect(dashboard.claimEligibilityInputs.meanPairwiseKappa).toBeLessThan(0.8);
    expect(dashboard.claimEligibility.eligible).toBe(false);
    expect(dashboard.claimEligibility.blockers).toContain("mean-pairwise-kappa-at-least-0.80");

    const gate = buildSenaCodingReliabilityGate({
      codingReliability: reliabilityDashboardToReview(dashboard, "Reliability reviewer")
    }, "2026-08-21T00:00:00.000Z");
    expect(gate.review.machineEvidence?.pairwiseCohenKappa[0].raw.kappa)
      .toBe(dashboard.pairwiseCohenKappa[0].raw.kappa);
    expect(gate.machineClaimEligibility.eligible).toBe(false);
    expect(gate.machineClaimEligibility.blockers).toContain("mean-pairwise-kappa-at-least-0.80");
  });

  it("persists canonical raw pair and alpha estimates and rejects a coherent forged summary", () => {
    const dashboard = buildSenaReliabilityDashboard(annotations({
      c1: [true, false],
      c2: [true, false]
    }));
    const pair = dashboard.pairwiseCohenKappa[0] as typeof dashboard.pairwiseCohenKappa[number] & {
      raw?: { observedAgreement: number | null; expectedAgreement: number | null; kappa: number | null };
    };
    const persisted = dashboard as typeof dashboard & {
      coderIds?: string[];
      krippendorffAlphaNominalRaw?: number | null;
    };

    expect(persisted.coderIds).toEqual(["c1", "c2"]);
    expect(pair.raw).toEqual({ observedAgreement: 1, expectedAgreement: 0.5, kappa: 1 });
    expect(persisted.krippendorffAlphaNominalRaw).toBe(1);

    pair.raw = { observedAgreement: 0.6, expectedAgreement: 0.5, kappa: 0.2 };
    pair.observedAgreement = 0.6;
    pair.expectedAgreement = 0.5;
    pair.kappa = 0.2;
    expect(() => normalizeSenaReliabilityDashboard(dashboard)).toThrow(/raw|semantic|eligibility|reliability dashboard/i);
  });

  it("requires exactly one unordered pair for every coder in the declared coder universe", () => {
    const dashboard = buildSenaReliabilityDashboard(annotations({
      c1: [true, false],
      c2: [true, false],
      c3: [true, false]
    }));
    dashboard.pairwiseCohenKappa[2] = {
      ...dashboard.pairwiseCohenKappa[2],
      coderA: "c2",
      coderB: "c4"
    };

    expect(() => normalizeSenaReliabilityDashboard(dashboard)).toThrow(/coder|pair|semantic|reliability dashboard/i);
  });

  it("requires a null alpha value whenever alpha is not estimable", () => {
    const dashboard = buildSenaReliabilityDashboard(annotations({
      c1: [true, true],
      c2: [true, true]
    }));
    dashboard.krippendorffAlphaNominal = 0.8;
    dashboard.claimEligibilityInputs.krippendorffAlphaNominal = 0.8;
    dashboard.claimEligibility = buildSenaReliabilityClaimEligibility({
      coderCount: dashboard.coderCount,
      pairwiseStatuses: dashboard.claimEligibilityInputs.pairwiseKappaStatuses,
      meanPairwiseKappa: null,
      krippendorffAlphaNominal: 0.8,
      krippendorffAlphaNominalStatus: "single-observed-category",
      unresolvedDisagreementCount: 0
    });

    expect(() => normalizeSenaReliabilityDashboard(dashboard)).toThrow(/alpha|semantic|reliability dashboard/i);
  });

  it("normalizes v1 dashboards as legacy-ambiguous and never current-eligible", () => {
    const legacy: SenaReliabilityDashboardReadModel = historicalReliabilityDashboardV1();

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

  it("normalizes a current-v2 coding reliability gate after a recursive JSONB round trip", () => {
    const dashboard = buildSenaReliabilityDashboard(annotations({
      c1: [true, false],
      c2: [true, false]
    }));
    const gate = buildSenaCodingReliabilityGate({
      codingReliability: reliabilityDashboardToReview(dashboard, "Reliability reviewer")
    }, "2026-08-21T00:00:00.000Z");
    const persistedGate = postgresJsonbRoundTrip(gate);

    expect(normalizeSenaCodingReliabilityGate(persistedGate)).toEqual(persistedGate);
  });

  it.each([
    {
      label: "null estimates",
      mutate: (dashboard: ReturnType<typeof buildSenaReliabilityDashboard>) => {
        dashboard.meanPairwiseKappaStatus = "single-observed-category";
        dashboard.meanPairwiseKappa = null;
        dashboard.krippendorffAlphaNominalStatus = "single-observed-category";
        dashboard.krippendorffAlphaNominal = null;
      }
    },
    {
      label: "below-threshold estimates",
      mutate: (dashboard: ReturnType<typeof buildSenaReliabilityDashboard>) => {
        dashboard.meanPairwiseKappa = 0.79;
        dashboard.krippendorffAlphaNominal = 0.79;
      }
    },
    {
      label: "an unestimable pair",
      mutate: (dashboard: ReturnType<typeof buildSenaReliabilityDashboard>) => {
        dashboard.pairwiseCohenKappa[0].status = "insufficient-pairable-units";
        dashboard.pairwiseCohenKappa[0].observedAgreement = null;
        dashboard.pairwiseCohenKappa[0].expectedAgreement = null;
        dashboard.pairwiseCohenKappa[0].kappa = null;
      }
    }
  ])("rejects a current-v2 dashboard whose eligible claim contradicts $label", ({ mutate }) => {
    const dashboard = buildSenaReliabilityDashboard(annotations({
      c1: [true, false],
      c2: [true, false]
    }));
    mutate(dashboard);
    dashboard.claimEligibility = {
      ...dashboard.claimEligibility,
      eligible: true,
      checks: {
        minimumCoders: true,
        allPairwiseKappaEstimable: true,
        krippendorffAlphaEstimable: true,
        meanPairwiseKappaAtThreshold: true,
        krippendorffAlphaAtThreshold: true,
        noUnresolvedDisagreements: true
      },
      blockers: []
    };

    expect(isCurrentSenaReliabilityDashboard(dashboard)).toBe(false);
    expect(() => normalizeSenaReliabilityDashboard(dashboard)).toThrow(/semantic|eligibility|reliability dashboard/i);
  });

  it("recomputes a gate from canonical raw machine fields and rejects a forged eligible flag", () => {
    const dashboard = buildSenaReliabilityDashboard(annotations({
      c1: [true, false],
      c2: [true, false]
    }));
    const review = reliabilityDashboardToReview(dashboard, "Reliability reviewer");
    if (!review.machineEvidence) throw new Error("expected machine evidence");
    review.machineEvidence.meanPairwiseKappaStatus = "single-observed-category";
    review.machineEvidence.meanPairwiseKappa = null;
    review.machineEvidence.krippendorffAlphaNominalStatus = "single-observed-category";
    review.machineEvidence.krippendorffAlphaNominal = null;
    review.machineEvidence.allPairwiseKappaEstimable = false;
    review.machineEvidence.claimEligibility = {
      ...review.machineEvidence.claimEligibility,
      eligible: true,
      checks: {
        minimumCoders: true,
        allPairwiseKappaEstimable: true,
        krippendorffAlphaEstimable: true,
        meanPairwiseKappaAtThreshold: true,
        krippendorffAlphaAtThreshold: true,
        noUnresolvedDisagreements: true
      },
      blockers: []
    };

    const gate = buildSenaCodingReliabilityGate({ codingReliability: review }, "2026-08-21T00:00:00.000Z");
    expect(gate.machineClaimEligibility.eligible).toBe(false);
    expect(gate.machineClaimEligibility.blockers).toContain(
      "invalid-or-contradictory-current-v2-reliability-evidence"
    );
    expect(gate.review.machineEvidence).toBeUndefined();
  });

  it("rejects a semantically forged v2 gate at current and normalized read boundaries", () => {
    const dashboard = buildSenaReliabilityDashboard(annotations({
      c1: [true, false],
      c2: [true, false]
    }));
    const gate = buildSenaCodingReliabilityGate({
      codingReliability: reliabilityDashboardToReview(dashboard, "Reliability reviewer")
    }, "2026-08-21T00:00:00.000Z");
    gate.machineClaimEligibility = {
      ...gate.machineClaimEligibility,
      eligible: true,
      checks: {
        ...gate.machineClaimEligibility.checks,
        meanPairwiseKappaAtThreshold: false
      },
      blockers: ["mean-pairwise-kappa-at-least-0.80"]
    };

    expect(isCurrentSenaCodingReliabilityGate(gate)).toBe(false);
    expect(() => normalizeSenaCodingReliabilityGate(gate)).toThrow(/semantic|eligibility|coding reliability gate/i);
  });

  it("rejects a coherent raw-pair/mean forgery at file-state and Postgres read boundaries", async () => {
    const dashboard = buildSenaReliabilityDashboard(annotations({
      c1: [true, false],
      c2: [true, false]
    }));
    dashboard.pairwiseCohenKappa[0].raw = {
      observedAgreement: 0.6,
      expectedAgreement: 0.5,
      kappa: 0.2
    };
    dashboard.pairwiseCohenKappa[0].observedAgreement = 0.6;
    dashboard.pairwiseCohenKappa[0].expectedAgreement = 0.5;
    dashboard.pairwiseCohenKappa[0].kappa = 0.2;
    expect(dashboard.meanPairwiseKappa).toBe(1);
    expect(dashboard.claimEligibilityInputs.meanPairwiseKappa).toBe(1);
    expect(dashboard.claimEligibility.eligible).toBe(true);
    const run = storedReliabilityRun(dashboard);
    const db = emptyEnterpriseDb();
    db.reliabilityRuns = [run];

    expect(() => normalizeEnterpriseDb(db)).toThrow(/semantic|eligibility|reliability dashboard/i);

    const adapter = createEnterprisePostgresReliabilityRunAdapter({
      query: async <T>(sql: string) => ({
        rows: /SELECT \*/i.test(sql)
          ? [{ payload: run, created_at: run.createdAt }] as T[]
          : [] as T[]
      })
    });
    await expect(adapter.listReliabilityRuns()).rejects.toThrow(/semantic|eligibility|reliability dashboard/i);
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
