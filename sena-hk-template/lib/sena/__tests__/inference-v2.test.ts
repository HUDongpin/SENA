import { describe, expect, it } from "vitest";
import {
  buildSenaGroupComparison,
  buildSenaGroupComparisonEffectSize,
  buildSenaGroupComparisonSuite,
  isCurrentSenaGroupComparisonValidationResult,
  normalizeSenaGroupComparisonValidationResult,
  SenaGroupComparisonSourceVerificationCache,
  type SenaGroupComparisonResultV1,
  type SenaGroupComparisonSuiteResultV1,
  type SenaGroupComparisonValidationReadModel
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

function historicalGroupComparisonV1(): SenaGroupComparisonResultV1 {
  return {
    schemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.groupComparison,
    metric: "socialStrength",
    groupField: "group",
    groupA: "A",
    groupB: "B",
    nA: 2,
    nB: 2,
    meanA: 0,
    meanB: 0,
    observedDifference: 0,
    effectSize: { cohenD: 0, hedgesG: 0, pooledStandardDeviation: 0 },
    permutation: {
      iterations: 100,
      seed: 20260611,
      pTwoSided: 1,
      nullLower: 0,
      nullUpper: 0,
      samplesPreview: [0]
    },
    bootstrap: {
      iterations: 100,
      seed: 20268530,
      meanDifferenceLower: 0,
      meanDifferenceUpper: 0,
      samplesPreview: [0]
    },
    diagnostics: {
      totalPeople: 4,
      comparedPeople: 4,
      minGroupSize: 2,
      balancedDesign: true,
      smallSample: true,
      metricScale: "person-metric"
    },
    guardrail: "Historical v1 fixture."
  };
}

function historicalGroupComparisonSuiteV1(): SenaGroupComparisonSuiteResultV1 {
  const comparison = {
    ...historicalGroupComparisonV1(),
    comparisonId: "group:a:vs:b:socialStrength",
    holmRank: 1,
    holmAdjustedP: 1,
    significantAtAlpha: false
  };
  return {
    schemaVersion: SENA_LEGACY_SCHEMA_VERSIONS.groupComparisonSuite,
    alpha: 0.05,
    correction: "holm",
    comparisonCount: 1,
    significantHolmCount: 0,
    primary: comparison,
    comparisons: [comparison],
    diagnostics: {
      metrics: ["socialStrength"],
      groupPairs: [{ groupField: "group", groupA: "A", groupB: "B" }],
      minGroupSize: 2,
      smallSampleComparisons: 1,
      preregistrationEvidence: "required-before-claim"
    },
    guardrail: "Historical v1 suite fixture."
  };
}

function expectInputIssue(run: () => unknown, path: string, rule: string) {
  expect(run).toThrowError(expect.objectContaining({
    name: "SenaInputValidationError",
    issues: expect.arrayContaining([expect.objectContaining({ path, rule })])
  }));
}

describe("SENA group-comparison effect-size v2", () => {
  it("uses the canonical uint32 seed domain and reports the actual derived bootstrap seed", () => {
    const dataset = emptyMetricDataset(["A", "A", "B", "B"]);
    const zero = buildSenaGroupComparison({
      dataset,
      groupA: "A",
      groupB: "B",
      iterations: 100,
      bootstrapIterations: 100,
      seed: 0
    });
    const maximum = buildSenaGroupComparison({
      dataset,
      groupA: "A",
      groupB: "B",
      iterations: 100,
      bootstrapIterations: 100,
      seed: 0xffffffff
    });

    expect(zero.permutation.seed).toBe(0);
    expect(maximum.permutation.seed).toBe(0xffffffff);
    expect(maximum.bootstrap.seed).toBe(7918);
    expectInputIssue(() => buildSenaGroupComparison({
      dataset,
      groupA: "A",
      groupB: "B",
      iterations: 100,
      bootstrapIterations: 100,
      seed: 0x100000000
    }), "seed", "integer-range");
  });

  it("derives and reports a canonical uint32 seed for suite item 40", () => {
    const groups = ["A", ...Array.from({ length: 40 }, (_, index) => `B${index + 1}`)];
    const suite = buildSenaGroupComparisonSuite({
      dataset: emptyMetricDataset(groups),
      comparisons: groups.slice(1).map((groupB) => ({ groupA: "A", groupB, metric: "socialStrength" as const })),
      iterations: 100,
      bootstrapIterations: 100,
      seed: 0xffffffff
    });

    expect(suite.comparisons).toHaveLength(40);
    expect(suite.comparisons[39].permutation.seed).toBe(3938);
    expect(suite.comparisons[39].bootstrap.seed).toBe(11857);
  });

  it("keeps mixed-case person ids in the default JavaScript string order the current-v2 validator requires", () => {
    const dataset = emptyMetricDataset(["A", "A", "B", "B"]);
    ["T1", "T2", "p-1", "p-2"].forEach((personId, index) => {
      dataset.people[index].id = personId;
    });
    const suite = buildSenaGroupComparisonSuite({
      dataset,
      comparisons: [{ groupA: "A", groupB: "B", metric: "socialStrength" }],
      iterations: 100,
      bootstrapIterations: 100
    });

    expect(suite.primary.sourceEvidence?.metricUniverse.map((entry) => entry.personId)).toEqual([
      "T1",
      "T2",
      "p-1",
      "p-2"
    ]);
    expect(() => normalizeSenaGroupComparisonValidationResult(suite)).not.toThrow();
  });

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

  it.each([
    ["metric", { metric: "not-a-metric" }, "metric", "supported-value"],
    ["group field", { groupField: "cohort" }, "groupField", "supported-value"],
    ["iterations string", { iterations: "100" }, "iterations", "integer-range"],
    ["fractional iterations", { iterations: 100.5 }, "iterations", "integer-range"],
    ["low bootstrap iterations", { bootstrapIterations: 99 }, "bootstrapIterations", "integer-range"],
    ["fractional seed", { seed: 2.5 }, "seed", "integer-range"],
    ["empty group A", { groupA: "" }, "groupA", "nonempty-string"],
    ["identical groups", { groupA: "A", groupB: "A" }, "groupB", "distinct-values"]
  ] as const)("rejects an invalid direct group-comparison %s control", (_label, override, path, rule) => {
    expectInputIssue(() => buildSenaGroupComparison({
      dataset: emptyMetricDataset(["A", "A", "B", "B"]),
      groupA: "A",
      groupB: "B",
      metric: "socialStrength",
      iterations: 100,
      bootstrapIterations: 100,
      ...override
    } as never), path, rule);
  });

  it.each([
    ["alpha below range", { alpha: -1 }, "alpha", "finite-range"],
    ["empty comparisons", { comparisons: [] }, "comparisons", "nonempty-array"],
    ["invalid comparison metric", { comparisons: [{ groupA: "A", groupB: "B", metric: "typo" }] }, "comparisons[0].metric", "supported-value"]
  ] as const)("rejects an invalid direct group-comparison suite %s control", (_label, override, path, rule) => {
    expectInputIssue(() => buildSenaGroupComparisonSuite({
      dataset: emptyMetricDataset(["A", "A", "B", "B"]),
      comparisons: [{ groupA: "A", groupB: "B", metric: "socialStrength" }],
      iterations: 100,
      bootstrapIterations: 100,
      ...override
    } as never), path, rule);
  });

  it("preserves a tiny positive pooled SD so an estimable v2 result remains current after JSON", () => {
    const effectSize = buildSenaGroupComparisonEffectSize([0, 1e-5], [0, 2e-5]);
    const dataset = emptyMetricDataset(["A", "A", "B", "B", "support", "support"]);
    dataset.interactions = [
      {
        source: "p2",
        target: "p5",
        weight: 1e-5,
        channel: "tiny-effect",
        stage: "analysis",
        evidence: "tiny-a"
      },
      {
        source: "p4",
        target: "p6",
        weight: 2e-5,
        channel: "tiny-effect",
        stage: "analysis",
        evidence: "tiny-b"
      }
    ];
    const result = buildSenaGroupComparison({
      dataset,
      groupA: "A",
      groupB: "B",
      metric: "socialStrength",
      iterations: 100,
      bootstrapIterations: 100
    });
    const written = JSON.parse(JSON.stringify(result)) as unknown;

    expect(effectSize.status).toBe("estimable");
    expect(effectSize.pooledStandardDeviation).toBeGreaterThan(0);
    expect(result.effectSize).toEqual(effectSize);
    expect(isCurrentSenaGroupComparisonValidationResult(written)).toBe(true);
  });

  it("classifies legacy v1 d=0/g=0/SD=0 as ambiguous and never current", () => {
    const legacy: SenaGroupComparisonValidationReadModel = historicalGroupComparisonV1();

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
    expect(legacy.schemaVersion).toBe("sena-group-comparison/v1");
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
    const legacy: SenaGroupComparisonValidationReadModel = historicalGroupComparisonSuiteV1();

    const normalized = normalizeSenaGroupComparisonValidationResult(legacy);

    expect(normalized.schemaVersion).toBe("sena-group-comparison-suite/v2");
    expect(normalized.sourceSchemaVersion).toBe("sena-group-comparison-suite/v1");
    expect("comparisons" in normalized && normalized.comparisons.every((comparison) => comparison.effectSize.status === "legacy-ambiguous")).toBe(true);
    expect(isCurrentSenaGroupComparisonValidationResult(normalized)).toBe(false);
    expect(legacy.schemaVersion).toBe("sena-group-comparison-suite/v1");
  });

  it.each(["raw-v1", "normalized-v2-with-v1-source"] as const)(
    "rejects an oversized %s legacy suite before traversing comparison entries",
    (shape) => {
      const legacy = historicalGroupComparisonSuiteV1();
      const candidate = shape === "raw-v1"
        ? legacy
        : normalizeSenaGroupComparisonValidationResult(legacy);
      const comparisons = new Array(41);
      Object.defineProperty(comparisons, 0, {
        enumerable: true,
        get() {
          throw new Error("oversized legacy comparison carrier was traversed");
        }
      });
      (candidate as { comparisons: unknown[] }).comparisons = comparisons;
      (candidate as { diagnostics: { groupPairs: unknown[] } }).diagnostics.groupPairs = new Array(41);

      expect(() => normalizeSenaGroupComparisonValidationResult(candidate)).toThrow(
        /bounded suite structure/i
      );
    }
  );

  it.each([
    ["comparison", (candidate: Record<string, any>, nested: object) => {
      Object.defineProperty(candidate, "unexpected", { enumerable: true, get: () => nested });
    }],
    ["permutation", (candidate: Record<string, any>, nested: object) => {
      Object.defineProperty(candidate.permutation, "unexpected", { enumerable: true, get: () => nested });
    }],
    ["source evidence", (candidate: Record<string, any>, nested: object) => {
      Object.defineProperty(candidate.sourceEvidence, "unexpected", { enumerable: true, get: () => nested });
    }]
  ] as const)("rejects an unknown %s carrier before reading its value", (_label, mutate) => {
    const current = buildSenaGroupComparison({
      dataset: emptyMetricDataset(["A", "A", "B", "B"]),
      groupA: "A",
      groupB: "B",
      iterations: 100,
      bootstrapIterations: 100
    }) as unknown as Record<string, any>;
    let getterReads = 0;
    const nested = {};
    Object.defineProperty(nested, "secret", {
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error("unknown group-comparison carrier was traversed");
      }
    });
    mutate(current, nested);

    expect(() => normalizeSenaGroupComparisonValidationResult(current as never)).toThrow(
      /carrier|structure|evidence/i
    );
    expect(getterReads).toBe(0);
  });

  it.each([
    ["non-enumerable", (candidate: Record<PropertyKey, unknown>) => {
      Object.defineProperty(candidate, "unexpected", {
        configurable: true,
        enumerable: false,
        value: "hidden carrier field"
      });
    }],
    ["symbol", (candidate: Record<PropertyKey, unknown>) => {
      candidate[Symbol("unexpected")] = "symbol carrier field";
    }]
  ] as const)("rejects an unknown %s comparison carrier field", (_label, mutate) => {
    const current = buildSenaGroupComparison({
      dataset: emptyMetricDataset(["A", "A", "B", "B"]),
      groupA: "A",
      groupB: "B",
      iterations: 100,
      bootstrapIterations: 100
    }) as unknown as Record<PropertyKey, unknown>;
    mutate(current);

    expect(() => normalizeSenaGroupComparisonValidationResult(current as never)).toThrow(
      /carrier|structure|evidence/i
    );
  });

  it.each([
    ["non-enumerable", (carrier: unknown[]) => {
      Object.defineProperty(carrier, "unexpected", {
        configurable: true,
        enumerable: false,
        value: "hidden array field"
      });
    }],
    ["symbol", (carrier: unknown[]) => {
      (carrier as unknown as Record<PropertyKey, unknown>)[Symbol("unexpected")] =
        "symbol array field";
    }]
  ] as const)("rejects an unknown %s metric-universe array field", (_label, mutate) => {
    const current = buildSenaGroupComparison({
      dataset: emptyMetricDataset(["A", "A", "B", "B"]),
      groupA: "A",
      groupB: "B",
      iterations: 100,
      bootstrapIterations: 100
    });
    mutate(current.sourceEvidence!.metricUniverse);

    expect(() => normalizeSenaGroupComparisonValidationResult(current)).toThrow(
      /carrier|structure|evidence/i
    );
  });

  it("does not let a same-key cache hit return a raw carrier alias", () => {
    const dataset = emptyMetricDataset(["A", "A", "B", "B"]);
    const current = buildSenaGroupComparison({
      dataset,
      groupA: "A",
      groupB: "B",
      iterations: 100,
      bootstrapIterations: 100
    });
    const cache = new SenaGroupComparisonSourceVerificationCache();
    expect(() => normalizeSenaGroupComparisonValidationResult(current, { dataset }, cache)).not.toThrow();

    const second = structuredClone(current) as unknown as Record<string, any>;
    let getterReads = 0;
    Object.defineProperty(second.permutation, "unexpected", {
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error("cache-hit raw carrier alias was traversed");
      }
    });

    expect(() => normalizeSenaGroupComparisonValidationResult(second as never, { dataset }, cache)).toThrow(
      /carrier|structure|evidence/i
    );
    expect(getterReads).toBe(0);
  });

  it("rejects an unbound oversized metric universe before traversal or deterministic replay", () => {
    const current = buildSenaGroupComparison({
      dataset: emptyMetricDataset(["A", "A", "B", "B"]),
      groupA: "A",
      groupB: "B",
      iterations: 100,
      bootstrapIterations: 100
    });
    const oversized = new Array(65_537);
    let getterReads = 0;
    Object.defineProperty(oversized, 0, {
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error("oversized unbound universe was traversed");
      }
    });
    current.sourceEvidence!.metricUniverse = oversized;

    expect(() => normalizeSenaGroupComparisonValidationResult(current)).toThrow(
      /carrier|metric universe|bounded/i
    );
    expect(getterReads).toBe(0);
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
