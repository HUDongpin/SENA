import { describe, expect, it } from "vitest";
import {
  createEnterprisePostgresValidationRunAdapter,
  type SenaEnterprisePostgresQuery
} from "../enterprise-postgres";
import { buildSenaGroupComparisonSuite } from "../inference";
import { buildSenaModel } from "../model";
import { buildSenaProjectSnapshot } from "../snapshot";
import type { SenaDataset } from "../types";

function validationDataset(weight = 3): SenaDataset {
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
  return {
    people,
    interactions: [
      { source: "p1", target: "support-1", weight: 1, channel: "round8", stage: "analysis", evidence: "p1-support-1" },
      { source: "p2", target: "support-2", weight: 2, channel: "round8", stage: "analysis", evidence: "p2-support-2" },
      { source: "p3", target: "support-3", weight, channel: "round8", stage: "analysis", evidence: "p3-support-3" },
      { source: "p5", target: "support-4", weight: 1, channel: "round8", stage: "analysis", evidence: "p5-support-4" },
      { source: "p6", target: "support-5", weight: 2, channel: "round8", stage: "analysis", evidence: "p6-support-5" }
    ],
    utterances: [],
    coded_segments: [],
    codebook: []
  };
}

function snapshot(dataset: SenaDataset) {
  return buildSenaProjectSnapshot(buildSenaModel(dataset), {
    generatedAt: "2026-08-21T00:00:00.000Z",
    sourceDataset: dataset
  });
}

function suite(dataset: SenaDataset) {
  return buildSenaGroupComparisonSuite({
    dataset,
    comparisons: [{ groupA: "A", groupB: "B", metric: "socialStrength" }],
    iterations: 100,
    bootstrapIterations: 100
  });
}

function adapterFor(payload: unknown) {
  const query = (async (sql: string) => ({
    rows: sql.includes("SELECT *") ? [{ payload }] : []
  })) as SenaEnterprisePostgresQuery;
  return createEnterprisePostgresValidationRunAdapter({ query });
}

describe("Postgres validation actual-project source binding", () => {
  it("rejects an alternate coherent suite when its source differs from the current project snapshot", async () => {
    const projectDataset = validationDataset(3);
    const project = { id: "project-current", snapshot: snapshot(projectDataset) };
    const adapter = adapterFor({
      projectId: project.id,
      createdAt: "2026-08-21T00:00:00.000Z",
      result: suite(validationDataset(30))
    });

    await expect(adapter.listValidationRuns({
      projectId: project.id,
      project
    } as never)).rejects.toThrow(/project|group-comparison|source|evidence/i);
  });

  it("fails closed when a stored project-bound run has no current project source", async () => {
    const projectDataset = validationDataset(3);
    const adapter = adapterFor({
      projectId: "missing-project",
      createdAt: "2026-08-21T00:00:00.000Z",
      result: suite(projectDataset)
    });

    await expect(adapter.listValidationRuns({ projectId: "missing-project" }))
      .rejects.toThrow(/project|source|missing/i);
  });

  it("rejects a project-filtered row whose payload deletes its project binding", async () => {
    const projectDataset = validationDataset(3);
    const project = { id: "project-current", snapshot: snapshot(projectDataset) };
    const adapter = adapterFor({
      createdAt: "2026-08-21T00:00:00.000Z",
      result: suite(projectDataset)
    });

    await expect(adapter.listValidationRuns({
      projectId: project.id,
      project
    } as never)).rejects.toThrow(/project|binding|source/i);
  });

  it("preserves projectless standalone reads while validating their embedded source proof", async () => {
    const result = suite(validationDataset(3));
    const adapter = adapterFor({
      createdAt: "2026-08-21T00:00:00.000Z",
      result
    });

    await expect(adapter.listValidationRuns()).resolves.toEqual([
      expect.objectContaining({ result })
    ]);
  });
});
