import { describe, expect, it } from "vitest";
import {
  buildSenaGroupComparison,
  buildSenaGroupComparisonEffectSize,
  buildSenaGroupComparisonSuite,
  isCurrentSenaGroupComparisonValidationResult,
  normalizeSenaGroupComparisonValidationResult
} from "../inference";
import { SENA_LEGACY_SCHEMA_VERSIONS } from "../schema-registry";
import type { SenaDataset } from "../types";

function emptyMetricDataset(groups: string[]): SenaDataset {
  return {
    people: groups.map((group, index) => ({
      id: `p${index + 1}`,
      label: `Person ${index + 1}`,
      role: group,
      group
    })),
    interactions: [],
    utterances: [],
    coded_segments: [],
    codebook: []
  };
}

describe("SENA group-comparison effect-size v2", () => {
  it("reports an insufficient sample when either group has fewer than two observations", () => {
    const effectSize = buildSenaGroupComparisonEffectSize([2], [1, 2]);
    const result = buildSenaGroupComparison({
      dataset: emptyMetricDataset(["A", "B"]),
      groupA: "A",
      groupB: "B",
      metric: "socialStrength",
      iterations: 100,
      bootstrapIterations: 100
    });

    expect(effectSize).toEqual({
      status: "insufficient-sample",
      cohenD: null,
      hedgesG: null,
      pooledStandardDeviation: null,
      reason: "At least two observations per group are required for a standardized effect size."
    });
    expect(result.schemaVersion).toBe("sena-group-comparison/v2");
    expect(isCurrentSenaGroupComparisonValidationResult(result)).toBe(true);
    expect(result.effectSize.status).toBe("insufficient-sample");
    expect(result.effectSize.cohenD).toBeNull();
  });

  it("distinguishes equal and separated zero-variance groups without inventing d=0", () => {
    const equal = buildSenaGroupComparisonEffectSize([2, 2], [2, 2]);
    const separated = buildSenaGroupComparisonEffectSize([2, 2], [1, 1]);
    const integratedEqual = buildSenaGroupComparison({
      dataset: emptyMetricDataset(["A", "A", "B", "B"]),
      groupA: "A",
      groupB: "B",
      metric: "socialStrength",
      iterations: 100,
      bootstrapIterations: 100
    });

    expect(equal).toEqual({
      status: "zero-variance-equal",
      cohenD: null,
      hedgesG: null,
      pooledStandardDeviation: 0,
      reason: "Both groups are constant with equal means; a standardized effect size is undefined."
    });
    expect(separated).toEqual({
      status: "zero-variance-separated",
      cohenD: null,
      hedgesG: null,
      pooledStandardDeviation: 0,
      reason: "Both groups are constant with different means; separation is complete but a standardized effect size is undefined."
    });
    expect(integratedEqual.effectSize.status).toBe("zero-variance-equal");
    expect(integratedEqual.effectSize.cohenD).toBeNull();
    expect(integratedEqual.effectSize.hedgesG).toBeNull();
  });

  it("calculates a known estimable Cohen d and Hedges g", () => {
    const effectSize = buildSenaGroupComparisonEffectSize([1, 2, 3], [0, 1, 2]);

    expect(effectSize.status).toBe("estimable");
    expect(effectSize.pooledStandardDeviation).toBe(1);
    expect(effectSize.cohenD).toBe(1);
    expect(effectSize.hedgesG).toBe(0.8);
    expect(effectSize.reason).toContain("estimable");
  });

  it("rejects non-finite observations instead of coercing them to zero", () => {
    expect(() => buildSenaGroupComparisonEffectSize([1, Number.NaN], [0, 1])).toThrow(/finite/i);
    expect(() => buildSenaGroupComparisonEffectSize([1, Number.POSITIVE_INFINITY], [0, 1])).toThrow(/finite/i);
  });

  it("classifies legacy v1 d=0/g=0/SD=0 as ambiguous and never current", () => {
    const current = buildSenaGroupComparison({
      dataset: emptyMetricDataset(["A", "A", "B", "B"]),
      groupA: "A",
      groupB: "B",
      metric: "socialStrength",
      iterations: 100,
      bootstrapIterations: 100
    });
    const legacy = {
      ...current,
      schemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.groupComparison,
      sourceSchemaVersion: undefined,
      effectSize: {
        cohenD: 0,
        hedgesG: 0,
        pooledStandardDeviation: 0
      }
    } as unknown;

    const normalized = normalizeSenaGroupComparisonValidationResult(legacy);

    expect(normalized.schemaVersion).toBe("sena-group-comparison/v2");
    expect(normalized.sourceSchemaVersion).toBe("sena-group-comparison/v1");
    expect(normalized).toEqual(expect.objectContaining({
      effectSize: expect.objectContaining({
        status: "legacy-ambiguous",
        cohenD: 0,
        hedgesG: 0,
        pooledStandardDeviation: 0
      })
    }));
    expect(isCurrentSenaGroupComparisonValidationResult(normalized)).toBe(false);
    expect((legacy as { schemaVersion: string }).schemaVersion).toBe("sena-group-comparison/v1");
  });

  it("does not accept a v2 label without the v2 effect-size discriminator as current evidence", () => {
    const current = buildSenaGroupComparison({
      dataset: emptyMetricDataset(["A", "A", "B", "B"]),
      groupA: "A",
      groupB: "B",
      metric: "socialStrength",
      iterations: 100,
      bootstrapIterations: 100
    });
    const malformed = {
      ...current,
      effectSize: {
        cohenD: 0,
        hedgesG: 0,
        pooledStandardDeviation: 0
      }
    } as unknown;

    expect(isCurrentSenaGroupComparisonValidationResult(malformed)).toBe(false);
  });

  it("normalizes every legacy suite comparison as ambiguous without rewriting persistence", () => {
    const current = buildSenaGroupComparisonSuite({
      dataset: emptyMetricDataset(["A", "A", "B", "B"]),
      comparisons: [{ groupA: "A", groupB: "B", metric: "socialStrength" }],
      iterations: 100,
      bootstrapIterations: 100
    });
    const stripComparison = (comparison: typeof current.primary) => ({
      ...comparison,
      schemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.groupComparison,
      sourceSchemaVersion: undefined,
      effectSize: {
        cohenD: 0,
        hedgesG: 0,
        pooledStandardDeviation: 0
      }
    });
    const legacy = {
      ...current,
      schemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite,
      sourceSchemaVersion: undefined,
      primary: stripComparison(current.primary),
      comparisons: current.comparisons.map(stripComparison)
    } as unknown;

    const normalized = normalizeSenaGroupComparisonValidationResult(legacy);

    expect(normalized.schemaVersion).toBe("sena-group-comparison-suite/v2");
    expect(normalized.sourceSchemaVersion).toBe("sena-group-comparison-suite/v1");
    expect("comparisons" in normalized && normalized.comparisons.every((comparison) => comparison.effectSize.status === "legacy-ambiguous")).toBe(true);
    expect(isCurrentSenaGroupComparisonValidationResult(normalized)).toBe(false);
    expect((legacy as { schemaVersion: string }).schemaVersion).toBe("sena-group-comparison-suite/v1");
  });

  it("serializes all zero-variance results without NaN or Infinity", () => {
    const result = buildSenaGroupComparison({
      dataset: emptyMetricDataset(["A", "A", "B", "B"]),
      groupA: "A",
      groupB: "B",
      metric: "socialStrength",
      iterations: 100,
      bootstrapIterations: 100
    });
    const json = JSON.stringify(result);

    expect(json).not.toMatch(/NaN|Infinity/);
    expect(JSON.parse(json).effectSize.cohenD).toBeNull();
  });
});
