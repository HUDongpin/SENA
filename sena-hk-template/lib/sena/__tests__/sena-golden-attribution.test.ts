import { describe, expect, it } from "vitest";
import { senaAttributionOperatorDiagnostics } from "../operators";

function expectMatrixClose(actual: number[][], expected: number[][], precision = 12) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((row, rowIndex) => {
    expect(actual[rowIndex]).toHaveLength(row.length);
    row.forEach((expectedValue, columnIndex) => {
      expect(actual[rowIndex][columnIndex]).toBeCloseTo(expectedValue, precision);
    });
  });
}

function expectAllZeros(matrix: number[][]) {
  matrix.forEach((row) => row.forEach((value) => expect(value).toBe(0)));
}

const codeActivityByWindow = [
  [1, 1, 0],
  [0, 1, 1],
  [1, 0, 1]
];

const participationByPersonWindow = [
  [1, 0, 1],
  [0, 1, 1],
  [0, 0, 0]
];

describe("SENA attribution golden operators", () => {
  it("T12 makes G_i slices PSD and sum_i G_i equal X^T diag(P) X", () => {
    const diagnostics = senaAttributionOperatorDiagnostics(codeActivityByWindow, participationByPersonWindow);

    expect(diagnostics.estimator).toBe("x-transpose-diag-y-x");
    expect(diagnostics.rawSlicesPsd).toBe(true);
    diagnostics.sliceMinEigenvalues.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(-1e-9);
    });
    expect(diagnostics.participationCountsByWindow).toEqual([1, 1, 2]);
    expect(diagnostics.rawSumMatchesParticipantWeightedCooccurrence).toBe(true);
    expectMatrixClose(diagnostics.rawSum, [
      [3, 1, 2],
      [1, 2, 1],
      [2, 1, 3]
    ]);
    expectMatrixClose(diagnostics.participantWeightedCooccurrence, [
      [3, 1, 2],
      [1, 2, 1],
      [2, 1, 3]
    ]);
  });

  it("T12 makes window-normalized Y recover W on off-diagonal code co-occurrences", () => {
    const diagnostics = senaAttributionOperatorDiagnostics(codeActivityByWindow, participationByPersonWindow);

    expect(diagnostics.windowNormalizedOffDiagonalMatchesCodeCooccurrence).toBe(true);
    expectMatrixClose(diagnostics.codeCooccurrence, [
      [2, 1, 1],
      [1, 2, 1],
      [1, 1, 2]
    ]);
    expectMatrixClose(diagnostics.windowNormalizedSum, [
      [2, 1, 1],
      [1, 2, 1],
      [1, 1, 2]
    ]);
  });

  it("T13 keeps person-normalized G_hat in [0, 1] and zeroes no-participation rows", () => {
    const diagnostics = senaAttributionOperatorDiagnostics(codeActivityByWindow, participationByPersonWindow);

    expect(diagnostics.participationTotalsByPerson).toEqual([2, 2, 0]);
    expect(diagnostics.zeroParticipationRows).toEqual([2]);
    expect(diagnostics.personNormalizedWithinBounds).toBe(true);
    expect(diagnostics.minPersonNormalizedValue).toBeGreaterThanOrEqual(0);
    expect(diagnostics.maxPersonNormalizedValue).toBeLessThanOrEqual(1);
    expectMatrixClose(diagnostics.personNormalizedSlices[0], [
      [1, 0.5, 0.5],
      [0.5, 0.5, 0],
      [0.5, 0, 0.5]
    ]);
    expectMatrixClose(diagnostics.personNormalizedSlices[1], [
      [0.5, 0, 0.5],
      [0, 0.5, 0.5],
      [0.5, 0.5, 1]
    ]);
    expectAllZeros(diagnostics.personNormalizedSlices[2]);
  });
});
