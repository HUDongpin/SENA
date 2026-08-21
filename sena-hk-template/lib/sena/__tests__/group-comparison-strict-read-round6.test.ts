import { describe, expect, it } from "vitest";
import {
  buildSenaGroupComparison,
  buildSenaGroupComparisonEffectSize,
  buildSenaGroupComparisonSuite,
  isCurrentSenaGroupComparisonValidationResult,
  normalizeSenaGroupComparisonValidationResult
} from "../inference";
import {
  createEnterprisePostgresValidationRunAdapter,
  type SenaEnterprisePostgresQuery
} from "../enterprise-postgres";
import { emptyEnterpriseDb, normalizeEnterpriseDb } from "../enterprise/state";
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

function currentEstimableResult() {
  const result = buildSenaGroupComparison({
    dataset: emptyMetricDataset(["A", "A", "A", "B", "B", "B"]),
    groupA: "A",
    groupB: "B",
    iterations: 100,
    bootstrapIterations: 100
  });
  return {
    ...result,
    meanA: 2,
    meanB: 1,
    observedDifference: 1,
    effectSize: buildSenaGroupComparisonEffectSize([1, 2, 3], [0, 1, 2]),
    diagnostics: {
      ...result.diagnostics,
      totalPeople: 6,
      comparedPeople: 6,
      minGroupSize: 3,
      balancedDesign: true,
      smallSample: true
    }
  };
}

function currentSuite() {
  return buildSenaGroupComparisonSuite({
    dataset: emptyMetricDataset(["A", "A", "B", "B"]),
    comparisons: [
      { groupA: "A", groupB: "B", metric: "socialStrength" },
      { groupA: "A", groupB: "B", metric: "socialDegree" }
    ],
    iterations: 100,
    bootstrapIterations: 100
  });
}

function expectRejected(value: unknown) {
  expect(isCurrentSenaGroupComparisonValidationResult(value)).toBe(false);
  expect(() => normalizeSenaGroupComparisonValidationResult(value as never)).toThrow(/group comparison|group-comparison/i);
}

describe("SENA group-comparison strict v2 read semantics", () => {
  it.each([
    ["missing", undefined],
    ["unknown", "sena-group-comparison/v999"]
  ])("rejects a current leaf with %s sourceSchemaVersion", (_label, sourceSchemaVersion) => {
    const value = currentEstimableResult() as Record<string, unknown>;
    if (sourceSchemaVersion === undefined) delete value.sourceSchemaVersion;
    else value.sourceSchemaVersion = sourceSchemaVersion;

    expectRejected(value);
  });

  it.each([
    [99, 0.8],
    [1, -99]
  ])("rejects forged estimable d=%s and g=%s", (cohenD, hedgesG) => {
    const value = currentEstimableResult();
    value.effectSize = { ...value.effectSize, cohenD, hedgesG };

    expectRejected(value);
  });

  it("rejects means and observedDifference that do not agree", () => {
    const value = currentEstimableResult();
    value.observedDifference = 99;

    expectRejected(value);
  });

  it.each([
    ["zero-variance-equal", 1],
    ["zero-variance-separated", 0]
  ] as const)("rejects the wrong %s relationship", (status, observedDifference) => {
    const value = buildSenaGroupComparison({
      dataset: emptyMetricDataset(["A", "A", "B", "B"]),
      groupA: "A",
      groupB: "B",
      iterations: 100,
      bootstrapIterations: 100
    });
    value.meanA = observedDifference;
    value.meanB = 0;
    value.observedDifference = observedDifference;
    value.effectSize = {
      status,
      cohenD: null,
      hedgesG: null,
      pooledStandardDeviation: 0,
      reason: "forged"
    };

    expectRejected(value);
  });

  it("rejects an insufficient status when both samples are sufficient", () => {
    const value = currentEstimableResult();
    value.effectSize = {
      status: "insufficient-sample",
      cohenD: null,
      hedgesG: null,
      pooledStandardDeviation: null,
      reason: "forged"
    };

    expectRejected(value);
  });

  it.each([
    ["missing", undefined],
    ["unknown", "sena-group-comparison-suite/v999"]
  ])("rejects a current suite with %s sourceSchemaVersion", (_label, sourceSchemaVersion) => {
    const value = currentSuite() as Record<string, unknown>;
    if (sourceSchemaVersion === undefined) delete value.sourceSchemaVersion;
    else value.sourceSchemaVersion = sourceSchemaVersion;

    expectRejected(value);
  });

  it("rejects nested source downgrade and a contradictory outer current source", () => {
    const value = currentSuite();
    value.comparisons[0].sourceSchemaVersion = "sena-group-comparison/v1";
    value.primary = value.comparisons[0];

    expectRejected(value);
  });

  it("rejects a coordinated suite universe, primary, Holm, and diagnostics forgery", () => {
    const value = currentSuite();
    value.comparisons[1].comparisonId = value.comparisons[0].comparisonId;
    value.comparisons[0].holmRank = 2;
    value.comparisons[1].holmRank = 1;
    value.comparisons[0].holmAdjustedP = 0;
    value.comparisons[1].holmAdjustedP = 0;
    value.comparisons[0].significantAtAlpha = true;
    value.comparisons[1].significantAtAlpha = true;
    value.primary = value.comparisons[1];
    value.significantHolmCount = 2;
    value.diagnostics = {
      ...value.diagnostics,
      metrics: ["socialDegree"],
      groupPairs: [],
      minGroupSize: 999,
      smallSampleComparisons: 0
    };

    expectRejected(value);
  });

  it("accepts a canonical current leaf and suite after JSON roundtrip", () => {
    const leaf = JSON.parse(JSON.stringify(currentEstimableResult()));
    const suite = JSON.parse(JSON.stringify(currentSuite()));

    expect(normalizeSenaGroupComparisonValidationResult(leaf)).toEqual(leaf);
    expect(normalizeSenaGroupComparisonValidationResult(suite)).toEqual(suite);
    expect(isCurrentSenaGroupComparisonValidationResult(leaf)).toBe(true);
    expect(isCurrentSenaGroupComparisonValidationResult(suite)).toBe(true);
  });

  it("rejects a coordinated suite forgery during file-state restore", () => {
    const result = currentSuite();
    result.comparisons[0].effectSize = {
      ...result.comparisons[0].effectSize,
      status: "zero-variance-separated"
    };
    result.primary = result.comparisons[0];
    const db = emptyEnterpriseDb();
    db.validationRuns = [{
      result
    } as never];

    expect(() => normalizeEnterpriseDb(db)).toThrow(/group-comparison/i);
  });

  it("rejects a coordinated suite forgery during Postgres restore", async () => {
    const result = currentSuite();
    result.comparisons[0].effectSize = {
      ...result.comparisons[0].effectSize,
      cohenD: 99,
      hedgesG: -99
    };
    result.primary = result.comparisons[0];
    const query = (async (sql: string) => ({
      rows: sql.includes("SELECT *")
        ? [{ payload: { createdAt: "2026-08-21T00:00:00.000Z", result } }]
        : []
    })) as SenaEnterprisePostgresQuery;
    const adapter = createEnterprisePostgresValidationRunAdapter({ query });

    await expect(adapter.listValidationRuns()).rejects.toThrow(/group-comparison/i);
  });
});
