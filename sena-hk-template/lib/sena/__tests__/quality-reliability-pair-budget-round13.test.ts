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
        rule: "pairwise-observation-evaluation-count-at-most-10000000",
        actual: 10_155_600
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
