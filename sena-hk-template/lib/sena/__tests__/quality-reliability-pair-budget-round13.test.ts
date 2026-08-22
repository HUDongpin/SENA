import { describe, expect, it, vi } from "vitest";
import { prepareSenaReliabilityJsonRequest } from "../reliability-api";
import {
  assertSenaReliabilityUniverseWithinLimits,
  buildSenaReliabilityDashboard,
  preflightSenaReliabilityAnnotations,
  type SenaCoderAnnotation
} from "../reliability";

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
