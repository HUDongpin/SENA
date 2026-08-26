import { describe, expect, it } from "vitest";
import {
  buildSenaFusionAdjacency as buildFromPublicBarrel,
  SenaInputValidationError
} from "../index";
import { buildSenaFusionAdjacency as buildFromKernel } from "@sena/kernel";

const validInput = {
  S: [[0]],
  W: [[0]],
  B: [[0]],
  alpha: 0,
  beta: 0,
  gamma: 0
};

function expectTypedIssue(
  run: () => unknown,
  issue: { path: string; rule: string }
) {
  try {
    run();
    throw new Error("Expected SENA input validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(SenaInputValidationError);
    expect((error as SenaInputValidationError).issues).toContainEqual(issue);
  }
}

describe("public SENA fusion adjacency validation", () => {
  it.each([
    ["public barrel", buildFromPublicBarrel],
    ["@sena/kernel", buildFromKernel]
  ])("throws the shared typed error with stable matrix and weight issues through %s", (_label, build) => {
    expectTypedIssue(() => build({ ...validInput, S: [[0, 1]] }), {
      path: "S",
      rule: "matrix-shape"
    });
    expectTypedIssue(() => build({ ...validInput, B: [[Number.NaN]] }), {
      path: "B_PC[0][0]",
      rule: "finite-nonnegative"
    });
    expectTypedIssue(() => build({ ...validInput, gamma: -1 }), {
      path: "gamma",
      rule: "finite-nonnegative"
    });
  });

  it.each([
    ["public barrel", buildFromPublicBarrel],
    ["@sena/kernel", buildFromKernel]
  ])("keeps all-zero matrices and all-zero layer weights valid through %s", (_label, build) => {
    expect(build(validInput)).toEqual([
      [0, 0],
      [0, 0]
    ]);
  });
});
