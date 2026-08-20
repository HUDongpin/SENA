import { describe, expect, it } from "vitest";
import { importSenaJsonContract } from "../import";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import type { SenaBuildOptions, SenaDataset } from "../types";

function datasetCopy(): SenaDataset {
  return structuredClone(lessonStudySenaContract);
}

function expectValidationIssue(run: () => unknown, path: string, rule: string) {
  expect(run).toThrowError(expect.objectContaining({
    name: "SenaInputValidationError",
    issues: expect.arrayContaining([expect.objectContaining({ path, rule })])
  }));
}

describe("SENA analytical input validation v2", () => {
  it.each([
    ["alpha", -1],
    ["beta", Number.NaN],
    ["gamma", Number.POSITIVE_INFINITY]
  ] as const)("rejects invalid %s layer weights without clamping", (field, value) => {
    expectValidationIssue(
      () => buildSenaModel(datasetCopy(), { [field]: value } as Partial<SenaBuildOptions>),
      `buildOptions.${field}`,
      "finite-nonnegative"
    );
  });

  it("rejects negative interaction weights from direct model calls", () => {
    const dataset = datasetCopy();
    dataset.interactions[0].weight = -0.25;

    expectValidationIssue(
      () => buildSenaModel(dataset),
      "dataset.interactions[0].weight",
      "finite-nonnegative"
    );
  });

  it.each([-0.001, 1.001, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects coded-segment confidence outside [0,1]: %s",
    (confidence) => {
      const dataset = datasetCopy();
      dataset.coded_segments[0].confidence = confidence;

      expectValidationIssue(
        () => buildSenaModel(dataset),
        "dataset.coded_segments[0].confidence",
        "finite-probability"
      );
    }
  );

  it("rejects negative analytical values during JSON contract import", () => {
    const dataset = datasetCopy();
    dataset.interactions[0].weight = -1;

    expectValidationIssue(
      () => importSenaJsonContract(dataset),
      "dataset.interactions[0].weight",
      "finite-nonnegative"
    );
  });

  it("rejects non-numeric imported confidence instead of defaulting it", () => {
    const source = structuredClone(lessonStudySenaContract) as unknown as {
      coded_segments: Array<Record<string, unknown>>;
    };
    source.coded_segments[0].confidence = "not-a-number";

    expectValidationIssue(
      () => importSenaJsonContract(source),
      "dataset.coded_segments[0].confidence",
      "finite-probability"
    );
  });

  it.each([
    ["normalization", "mystery"],
    ["bridgeWeightRule", "weighted-mystery"],
    ["direction", "sideways"],
    ["deg_convention", "column-sum"],
    ["Phi", "random-layout"],
    ["delta", "euclidean-mystery"]
  ] as const)("rejects unknown build-option enum %s", (field, value) => {
    expectValidationIssue(
      () => buildSenaModel(datasetCopy(), { [field]: value } as unknown as Partial<SenaBuildOptions>),
      `buildOptions.${field}`,
      "supported-value"
    );
  });

  it("rejects unknown temporal modes", () => {
    expectValidationIssue(
      () => buildSenaModel(datasetCopy(), {
        temporal: { mode: "mystery" as never }
      }),
      "buildOptions.temporal.mode",
      "supported-value"
    );
  });

  it("rejects a non-object temporal option instead of defaulting it", () => {
    expectValidationIssue(
      () => buildSenaModel(datasetCopy(), { temporal: "moving-window" } as unknown as Partial<SenaBuildOptions>),
      "buildOptions.temporal",
      "object"
    );
  });

  it("keeps zero weights valid, including an all-three-zero construction", () => {
    const dataset = datasetCopy();
    dataset.interactions[0].weight = 0;
    dataset.coded_segments[0].confidence = 0;

    const model = buildSenaModel(dataset, {
      alpha: 0,
      beta: 0,
      gamma: 0,
      bridgeWeightRule: "confidence"
    });

    expect(model.options).toMatchObject({ alpha: 0, beta: 0, gamma: 0 });
    expect(model.matrices.fusion.values.flat().every((value) => value === 0)).toBe(true);
  });
});
