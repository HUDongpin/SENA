import { describe, expect, it } from "vitest";
import {
  buildSenaGroupComparison,
  buildSenaGroupComparisonSuite,
  isCurrentSenaGroupComparisonValidationResult,
  normalizeSenaGroupComparisonValidationResult,
  type SenaGroupComparisonResult
} from "../inference";
import {
  createEnterprisePostgresValidationRunAdapter,
  type SenaEnterprisePostgresQuery
} from "../enterprise-postgres";
import { emptyEnterpriseDb, normalizeEnterpriseDb } from "../enterprise/state";
import { buildSenaModel } from "../model";
import { buildSenaProjectSnapshot } from "../snapshot";
import type { SenaDataset } from "../types";

function estimableMetricDataset(): SenaDataset {
  const people = [
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `p${index + 1}`,
      label: `Person ${index + 1}`,
      role: index < 3 ? "A" : "B",
      group: index < 3 ? "A" : "B"
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `support-${index + 1}`,
      label: `Support ${index + 1}`,
      role: "support",
      group: "support"
    }))
  ];
  const edge = (source: string, target: string, weight: number) => ({
    source,
    target,
    weight,
    channel: "round7-fixture",
    stage: "analysis",
    evidence: `${source}-${target}`
  });
  return {
    people,
    interactions: [
      edge("p1", "support-1", 1),
      edge("p2", "support-2", 2),
      edge("p3", "support-3", 3),
      edge("p5", "support-4", 1),
      edge("p6", "support-5", 2)
    ],
    utterances: [],
    coded_segments: [],
    codebook: []
  };
}

function currentEstimableResult() {
  const result = buildSenaGroupComparison({
    dataset: estimableMetricDataset(),
    groupA: "A",
    groupB: "B",
    metric: "socialStrength",
    iterations: 100,
    bootstrapIterations: 100
  });
  expect(result.effectSize.status).toBe("estimable");
  return result;
}

function alternateMetricDataset() {
  const dataset = structuredClone(estimableMetricDataset());
  dataset.interactions[2].weight = 30;
  return dataset;
}

function round(value: number) {
  return Number(value.toFixed(4));
}

function coordinatedEffectForgery(result: SenaGroupComparisonResult) {
  const forged = structuredClone(result);
  const pooledStandardDeviation = forged.effectSize.pooledStandardDeviation! * 2;
  const cohenD = forged.observedDifference / pooledStandardDeviation;
  const correction = 1 - (3 / ((4 * (forged.nA + forged.nB)) - 9));
  forged.effectSize = {
    ...forged.effectSize,
    pooledStandardDeviation,
    cohenD: round(cohenD),
    hedgesG: round(cohenD * correction)
  };
  return forged;
}

function expectRejected(value: unknown) {
  expect(isCurrentSenaGroupComparisonValidationResult(value)).toBe(false);
  expect(() => normalizeSenaGroupComparisonValidationResult(value as never))
    .toThrow(/group comparison|group-comparison|source|evidence/i);
}

describe("SENA group-comparison actual-source sufficiency", () => {
  it("rejects a standalone current leaf without verifiable source evidence", () => {
    const result = currentEstimableResult() as SenaGroupComparisonResult & { sourceEvidence?: unknown };
    delete result.sourceEvidence;

    expectRejected(result);
  });

  it("rejects pooled SD, Cohen d, and Hedges g changed together", () => {
    expectRejected(coordinatedEffectForgery(currentEstimableResult()));
  });

  it("does not relabel positive source variance as zero-variance-separated", () => {
    const forged = currentEstimableResult();
    forged.effectSize = {
      status: "zero-variance-separated",
      cohenD: null,
      hedgesG: null,
      pooledStandardDeviation: 0,
      reason: "forged zero variance"
    };

    expectRejected(forged);
  });

  it("does not relabel actual zero variance as estimable", () => {
    const result = buildSenaGroupComparison({
      dataset: {
        people: ["A", "A", "B", "B"].map((group, index) => ({
          id: `p${index + 1}`,
          label: `Person ${index + 1}`,
          role: group,
          group
        })),
        interactions: [],
        utterances: [],
        coded_segments: [],
        codebook: []
      },
      groupA: "A",
      groupB: "B",
      iterations: 100,
      bootstrapIterations: 100
    });
    result.effectSize = {
      status: "estimable",
      cohenD: 0,
      hedgesG: 0,
      pooledStandardDeviation: 1,
      reason: "forged estimable variance"
    };

    expectRejected(result);
  });

  it("rejects the coordinated effect forgery during file-state restore", () => {
    const result = coordinatedEffectForgery(currentEstimableResult());
    const db = emptyEnterpriseDb();
    db.validationRuns = [{ result } as never];

    expect(() => normalizeEnterpriseDb(db)).toThrow(/group-comparison|source|evidence/i);
  });

  it("rejects a coordinated nested suite forgery during Postgres restore", async () => {
    const result = buildSenaGroupComparisonSuite({
      dataset: estimableMetricDataset(),
      comparisons: [{ groupA: "A", groupB: "B", metric: "socialStrength" }],
      iterations: 100,
      bootstrapIterations: 100
    });
    result.comparisons[0] = {
      ...result.comparisons[0],
      ...coordinatedEffectForgery(result.comparisons[0])
    };
    result.primary = structuredClone(result.comparisons[0]);
    const query = (async (sql: string) => ({
      rows: sql.includes("SELECT *")
        ? [{ payload: { createdAt: "2026-08-21T00:00:00.000Z", result } }]
        : []
    })) as SenaEnterprisePostgresQuery;
    const adapter = createEnterprisePostgresValidationRunAdapter({ query });

    await expect(adapter.listValidationRuns()).rejects
      .toThrow(/group-comparison|source|evidence/i);
  });

  it("binds a coherent standalone leaf back to the actual holder dataset and model", () => {
    const substituted = buildSenaGroupComparison({
      dataset: alternateMetricDataset(),
      groupA: "A",
      groupB: "B",
      metric: "socialStrength",
      iterations: 100,
      bootstrapIterations: 100
    });
    expect(normalizeSenaGroupComparisonValidationResult(substituted)).toEqual(substituted);

    expect(() => normalizeSenaGroupComparisonValidationResult(substituted, {
      dataset: estimableMetricDataset()
    } as never)).toThrow(/group comparison|group-comparison|source|evidence/i);
  });

  it("binds every coherent suite leaf back to the actual holder source", () => {
    const substituted = buildSenaGroupComparisonSuite({
      dataset: alternateMetricDataset(),
      comparisons: [{ groupA: "A", groupB: "B", metric: "socialStrength" }],
      iterations: 100,
      bootstrapIterations: 100
    });

    expect(() => normalizeSenaGroupComparisonValidationResult(substituted, {
      dataset: estimableMetricDataset()
    } as never)).toThrow(/group comparison|group-comparison|source|evidence/i);
  });

  it("uses the current project snapshot as the file-state holder source", () => {
    const dataset = estimableMetricDataset();
    const substituted = buildSenaGroupComparison({
      dataset: alternateMetricDataset(),
      groupA: "A",
      groupB: "B",
      iterations: 100,
      bootstrapIterations: 100
    });
    const snapshot = buildSenaProjectSnapshot(buildSenaModel(dataset), {
      generatedAt: "2026-08-21T00:00:00.000Z",
      sourceDataset: dataset
    });
    const db = emptyEnterpriseDb();
    db.projects = [{ id: "project-source", currentVersion: 1, snapshot } as never];
    db.validationRuns = [{ projectId: "project-source", result: substituted } as never];

    expect(() => normalizeEnterpriseDb(db)).toThrow(/group-comparison|source|evidence/i);
  });
});
