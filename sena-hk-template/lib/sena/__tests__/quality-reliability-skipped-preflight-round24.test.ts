import { describe, expect, it } from "vitest";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import {
  bindSenaReliabilityAnnotationsToProject,
  buildSenaReliabilityDashboard,
  isValidSenaReliabilityProjectBinding,
  normalizeSenaReliabilityDashboard,
  SENA_RELIABILITY_UNIVERSE_LIMITS,
  type SenaCoderAnnotation,
  type SenaSkippedCoderCell
} from "../reliability";
import { buildSenaProjectSnapshot } from "../snapshot";

const skippedCellLimit = SENA_RELIABILITY_UNIVERSE_LIMITS.annotationRows;
const annotations: SenaCoderAnnotation[] = [
  { coderId: "coder-a", itemId: "u1", codeId: "question", value: true },
  { coderId: "coder-b", itemId: "u1", codeId: "question", value: false }
];

function expectSkippedCellLimitError(action: () => unknown, rule: string, actual: number) {
  expect(action).toThrow(expect.objectContaining({
    name: "SenaReliabilityUniverseLimitError",
    status: 400,
    code: "reliability_universe_limit_exceeded",
    issues: expect.arrayContaining([expect.objectContaining({
      path: "skippedCells",
      rule,
      actual,
      maximum: skippedCellLimit
    })])
  }));
}

function oversizedCodeIds(codeId: string) {
  return new Proxy(new Array(skippedCellLimit + 1).fill(codeId) as string[], {
    get(target, property, receiver) {
      if (typeof property === "string" && /^(0|[1-9]\d*)$/.test(property)) {
        throw new Error("oversized skipped code ids were iterated");
      }
      return Reflect.get(target, property, receiver);
    }
  });
}

describe("Round24 skipped-cell direct-boundary admission", () => {
  it("accepts the exact cumulative skipped code-id limit", () => {
    const skippedCells: SenaSkippedCoderCell[] = [{
      coderId: "coder-c",
      itemId: "u1",
      codeIds: new Array(skippedCellLimit).fill("question")
    }];

    expect(() => buildSenaReliabilityDashboard(annotations, { skippedCells })).not.toThrow();
  });

  it("rejects cumulative skipped code-id fan-out at limit plus one", () => {
    const actual = skippedCellLimit + 1;
    const skippedCells: SenaSkippedCoderCell[] = [{
      coderId: "coder-c",
      itemId: "u1",
      codeIds: new Array(actual).fill("question")
    }];

    expectSkippedCellLimitError(
      () => buildSenaReliabilityDashboard(annotations, { skippedCells }),
      `skipped-cell-code-id-count-at-most-${skippedCellLimit}`,
      actual
    );
  });

  it("rejects skipped-cell row fan-out at limit plus one", () => {
    const actual = skippedCellLimit + 1;
    const cell: SenaSkippedCoderCell = {
      coderId: "coder-c",
      itemId: "u1",
      codeIds: ["question"]
    };

    expectSkippedCellLimitError(
      () => buildSenaReliabilityDashboard(annotations, {
        skippedCells: new Array(actual).fill(cell)
      }),
      `skipped-cell-row-count-at-most-${skippedCellLimit}`,
      actual
    );
  });

  it("runs the same skipped-cell preflight at the project-binding boundary", () => {
    const dataset = structuredClone(lessonStudySenaContract);
    const snapshot = buildSenaProjectSnapshot(buildSenaModel(dataset), {
      generatedAt: "2026-08-25T00:00:00.000Z",
      sourceDataset: dataset
    });
    const itemId = dataset.utterances[0].id;
    const codeId = dataset.codebook[0].id;
    const boundAnnotations: SenaCoderAnnotation[] = [
      { coderId: "coder-a", itemId, codeId, value: true },
      { coderId: "coder-b", itemId, codeId, value: false }
    ];
    const actual = skippedCellLimit + 1;

    expectSkippedCellLimitError(
      () => bindSenaReliabilityAnnotationsToProject(boundAnnotations, {
        projectId: "round24-skipped-preflight",
        projectVersion: 1,
        snapshot,
        skippedCells: [{
          coderId: "coder-c",
          itemId,
          codeIds: new Array(actual).fill(codeId)
        }]
      }),
      `skipped-cell-code-id-count-at-most-${skippedCellLimit}`,
      actual
    );
  });

  it("rejects oversized persisted project bindings before reading code-id entries", () => {
    const dataset = structuredClone(lessonStudySenaContract);
    const snapshot = buildSenaProjectSnapshot(buildSenaModel(dataset), {
      generatedAt: "2026-08-25T00:00:00.000Z",
      sourceDataset: dataset
    });
    const itemId = dataset.utterances[0].id;
    const codeId = dataset.codebook[0].id;
    const { binding } = bindSenaReliabilityAnnotationsToProject([
      { coderId: "coder-a", itemId, codeId, value: true },
      { coderId: "coder-b", itemId, codeId, value: false }
    ], {
      projectId: "round24-persisted-binding",
      projectVersion: 1,
      snapshot
    });
    const forged = {
      ...binding,
      skippedCellCoverage: [{
        coderId: "coder-c",
        itemId,
        codeIds: oversizedCodeIds(codeId)
      }]
    };
    let valid: boolean | undefined;

    expect(() => {
      valid = isValidSenaReliabilityProjectBinding(forged);
    }).not.toThrow();
    expect(valid).toBe(false);
  });

  it("rejects oversized persisted dashboard evidence before reading code-id entries", () => {
    const dashboard = buildSenaReliabilityDashboard(annotations, {
      skippedCells: [{ coderId: "coder-c", itemId: "u1", codeIds: ["question"] }]
    });
    const forged = {
      ...dashboard,
      derivationEvidence: {
        ...dashboard.derivationEvidence!,
        skippedCells: [{
          coderId: "coder-c",
          itemId: "u1",
          codeIds: oversizedCodeIds("question")
        }]
      }
    };

    expect(() => normalizeSenaReliabilityDashboard(forged as never)).toThrow(
      /contradictory or incomplete semantic eligibility evidence/i
    );
  });
});
