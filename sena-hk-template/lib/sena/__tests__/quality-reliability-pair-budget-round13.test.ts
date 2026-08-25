import { describe, expect, it, vi } from "vitest";
import { prepareSenaReliabilityJsonRequest } from "../reliability-api";
import {
  assertSenaReliabilityReaderCoderPairBudget,
  assertSenaReliabilityUniverseWithinLimits,
  buildSenaReliabilityDashboard,
  isSemanticallyValidSenaReliabilityMachineEvidence,
  normalizeSenaReliabilityDashboard,
  preflightSenaReliabilityAnnotations,
  reliabilityDashboardToReview,
  type SenaCoderAnnotation
} from "../reliability";
import { SENA_LEGACY_SCHEMA_VERSIONS } from "../schema-registry";

const declaredPairCap = 2_000;

function coderUniverse(size: number): SenaCoderAnnotation[] {
  const annotations: SenaCoderAnnotation[] = [];
  for (let coder = 0; coder < size; coder += 1) {
    annotations.push({
      coderId: `coder-${coder}`,
      itemId: "item-0",
      codeId: "code-0",
      value: coder % 2 === 0
    });
  }
  return annotations;
}

function expectPairCapError(error: unknown, coderCount: number) {
  expect(error).toMatchObject({
    name: "SenaReliabilityUniverseLimitError",
    status: 400,
    code: "reliability_universe_limit_exceeded",
    issues: expect.arrayContaining([{
      path: "annotations",
      rule: `coder-pair-count-at-most-${declaredPairCap}`,
      actual: coderCount * (coderCount - 1) / 2,
      maximum: declaredPairCap
    }])
  });
}

describe("Round13 bounded coding-reliability pairwise work", () => {
  it("admits 63 persisted coders and rejects 64 before pair-key allocation", () => {
    expect(assertSenaReliabilityReaderCoderPairBudget(63)).toBe(1_953);
    expect(() => assertSenaReliabilityReaderCoderPairBudget(64))
      .toThrow(expect.objectContaining({
        name: "SenaReliabilityUniverseLimitError",
        issues: [expect.objectContaining({
          rule: "coder-pair-count-at-most-2000",
          actual: 2_016,
          maximum: 2_000
        })]
      }));
  });

  it("applies the persisted-reader pair budget before dashboard semantic maps", () => {
    const dashboard = buildSenaReliabilityDashboard([
      { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true }
    ]);
    const oversized = structuredClone(dashboard);
    oversized.coderIds = Array.from(
      { length: 64 },
      (_, index) => `persisted-coder-${String(index + 1).padStart(2, "0")}`
    );
    oversized.coderCount = oversized.coderIds.length;

    expect(() => normalizeSenaReliabilityDashboard(oversized))
      .toThrow(expect.objectContaining({
        name: "SenaReliabilityUniverseLimitError",
        issues: [expect.objectContaining({
          rule: "coder-pair-count-at-most-2000"
        })]
      }));
  });

  it("cannot bypass the legacy persisted-reader pair budget by omitting a companion collection", () => {
    const dashboard = buildSenaReliabilityDashboard([
      { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true }
    ]);
    const pair = dashboard.pairwiseCohenKappa[0];
    const malformedLegacy = {
      ...structuredClone(dashboard),
      schemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.codingReliabilityDashboard,
      pairwiseCohenKappa: Array.from({ length: declaredPairCap + 1 }, () => ({
        coderA: pair.coderA,
        coderB: pair.coderB,
        units: pair.units,
        observedAgreement: pair.observedAgreement,
        expectedAgreement: pair.expectedAgreement,
        kappa: pair.kappa
      }))
    } as unknown as Record<string, unknown>;
    delete malformedLegacy.codeDiagnostics;

    expect(() => normalizeSenaReliabilityDashboard(malformedLegacy as never))
      .toThrow(expect.objectContaining({
        name: "SenaReliabilityUniverseLimitError",
        issues: [expect.objectContaining({
          rule: "coder-pair-count-at-most-2000",
          actual: 2_001,
          maximum: 2_000
        })]
      }));
  });

  it("applies the machine-evidence coder-pair budget before binding and semantic validation", () => {
    const dashboard = buildSenaReliabilityDashboard([
      { coderId: "c1", itemId: "u1", codeId: "Evidence", value: true },
      { coderId: "c2", itemId: "u1", codeId: "Evidence", value: true }
    ]);
    const machineEvidence = structuredClone(
      reliabilityDashboardToReview(dashboard, "Pair-budget reviewer").machineEvidence
    );
    if (!machineEvidence) throw new Error("Expected machine-evidence fixture.");
    machineEvidence.coderIds = Array.from(
      { length: 64 },
      (_, index) => `machine-coder-${String(index + 1).padStart(2, "0")}`
    );
    machineEvidence.projectBindingRequired = true;
    machineEvidence.projectBinding = {
      annotationCoverage: Array.from({ length: 50_001 }, () => null),
      skippedCellCoverage: []
    } as never;

    expect(() => isSemanticallyValidSenaReliabilityMachineEvidence(machineEvidence))
      .toThrow(expect.objectContaining({
        name: "SenaReliabilityUniverseLimitError",
        issues: [expect.objectContaining({
          rule: "coder-pair-count-at-most-2000",
          actual: 2_016,
          maximum: 2_000
        })]
      }));
  });

  it("rejects the complete 50-coder by 4000-item algorithm budget", () => {
    let thrown: unknown;
    try {
      assertSenaReliabilityUniverseWithinLimits({
        coderCount: 50,
        itemCount: 4_000,
        codeCount: 1
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: "SenaReliabilityUniverseLimitError",
      status: 400,
      code: "reliability_universe_limit_exceeded",
      issues: [{
        path: "annotations",
        rule: "algorithm-work-evaluation-count-at-most-10000000",
        actual: expect.any(Number),
        maximum: 10_000_000
      }]
    });
    const actual = (thrown as { issues?: Array<{ actual?: number }> } | undefined)?.issues?.[0]?.actual;
    expect(actual).toBe(44_900_000);
  });

  it("names every implemented material work component at a valid boundary", () => {
    const admitted = assertSenaReliabilityUniverseWithinLimits({
      coderCount: 50,
      itemCount: 500,
      codeCount: 1
    }) as unknown as {
      algorithmWorkEvaluations: number;
      algorithmWorkComponents: Record<string, number>;
    };

    expect(admitted.algorithmWorkEvaluations).toBe(5_612_500);
    expect(admitted.algorithmWorkComponents).toEqual({
      globalCohenVectorProjections: 1_225_000,
      globalCohenScans: 612_500,
      perCodeCohenVectorProjections: 1_225_000,
      perCodeCohenScans: 612_500,
      perCodeAgreementPairEvaluations: 612_500,
      krippendorffRatingCollectionPasses: 75_000,
      krippendorffOrderedPairUpdates: 1_225_000,
      krippendorffDiagonalPairChecks: 25_000
    });
  });

  it("fails closed when the complete algorithm budget overflows a safe integer", () => {
    expect(() => assertSenaReliabilityUniverseWithinLimits({
      coderCount: Number.MAX_SAFE_INTEGER,
      itemCount: 0,
      codeCount: 0
    })).toThrow(expect.objectContaining({
      issues: expect.arrayContaining([expect.objectContaining({
        rule: "algorithm-work-evaluation-count-at-most-10000000",
        actual: "safe-integer-overflow",
        maximum: 10_000_000
      })])
    }));
  });

  it("rejects 200k coders in shared preflight without pair-result map allocation", () => {
    const annotations = coderUniverse(200_000);
    const mapSpy = vi.spyOn(Array.prototype, "map");
    let thrown: unknown;
    try {
      preflightSenaReliabilityAnnotations(annotations);
    } catch (error) {
      thrown = error;
    }
    const mapCalls = mapSpy.mock.calls.length;
    mapSpy.mockRestore();

    expectPairCapError(thrown, 200_000);
    expect(mapCalls).toBe(0);
  });

  it("runs the shared cap before dashboard unit and pair arrays", () => {
    const annotations = coderUniverse(65);
    const mapSpy = vi.spyOn(Array.prototype, "map");
    let thrown: unknown;
    try {
      buildSenaReliabilityDashboard(annotations);
    } catch (error) {
      thrown = error;
    }
    const mapCalls = mapSpy.mock.calls.length;
    mapSpy.mockRestore();

    expectPairCapError(thrown, 65);
    expect(mapCalls).toBe(0);
  });

  it("applies pairwise evaluation and result-entry arithmetic at the direct API boundary", () => {
    expect(() => assertSenaReliabilityUniverseWithinLimits({
      itemCount: 1,
      codeCount: 2_600,
      coderCount: 63
    })).toThrow(expect.objectContaining({
      issues: [expect.objectContaining({
        rule: "algorithm-work-evaluation-count-at-most-10000000",
        actual: 46_355_400
      })]
    }));

    expect(() => assertSenaReliabilityUniverseWithinLimits({
      itemCount: 1,
      codeCount: 100,
      coderCount: 50
    })).toThrow(expect.objectContaining({
      issues: expect.arrayContaining([
        expect.objectContaining({ rule: "pairwise-result-entry-count-at-most-100000" })
      ])
    }));

    expect(() => prepareSenaReliabilityJsonRequest({
      annotations: coderUniverse(65).map((annotation) => ({
        coder_id: annotation.coderId,
        item_id: annotation.itemId,
        code_id: annotation.codeId,
        value: annotation.value ? "1" : "0"
      }))
    })).toThrow(expect.objectContaining({
      code: "reliability_universe_limit_exceeded"
    }));
  });
});
