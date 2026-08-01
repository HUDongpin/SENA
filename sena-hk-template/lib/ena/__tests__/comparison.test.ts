import { describe, expect, it } from "vitest";
import { ena } from "jena-js";
import { comparisonGroups, compareGroups, unitScoresByGroup } from "../comparison";
import { displayedRotationColumns } from "../display-dimensions";
import { mean } from "../statistics";
import type { EnaRow } from "../types";

// The comparison has to describe the same space the plot draws: one
// observation per unit, read off the projected coordinates, grouped exactly
// the way the group-mean traces group them.

const CODES = ["A", "B", "C"];

function row(unit: string, condition: string, phase: string, codes: number[]): EnaRow {
  return {
    unit,
    Condition: condition,
    Phase: phase,
    ...Object.fromEntries(CODES.map((code, index) => [code, codes[index]]))
  };
}

const rows: EnaRow[] = [
  row("u1", "AI", "P1", [1, 1, 0]),
  row("u1", "AI", "P2", [0, 1, 1]),
  row("u2", "AI", "P1", [1, 0, 1]),
  row("u2", "AI", "P2", [1, 1, 0]),
  row("u3", "AI", "P1", [1, 1, 1]),
  row("u3", "AI", "P2", [0, 1, 1]),
  row("u4", "Non-AI", "P1", [1, 0, 0]),
  row("u4", "Non-AI", "P2", [1, 0, 1]),
  row("u5", "Non-AI", "P1", [0, 0, 1]),
  row("u5", "Non-AI", "P2", [1, 0, 1]),
  row("u6", "Non-AI", "P1", [1, 0, 1]),
  row("u6", "Non-AI", "P2", [0, 0, 1])
];

function set(model: "EndPoint" | "AccumulatedTrajectory" = "EndPoint") {
  return ena({
    rows,
    units: ["unit"],
    conversation: model === "EndPoint" ? ["unit"] : ["unit", "Phase"],
    codes: CODES,
    metadata: ["Condition"],
    includeMeta: true,
    model,
    window: "MovingStanzaWindow",
    windowSizeBack: 2
  });
}

describe("comparisonGroups", () => {
  it("lists the distinct values of the grouping column", () => {
    expect(comparisonGroups(set(), "Condition")).toEqual(["AI", "Non-AI"]);
  });

  it("is empty for a column that is not in the model", () => {
    expect(comparisonGroups(set(), "Missing")).toEqual([]);
  });
});

describe("unitScoresByGroup", () => {
  it("gives one score per unit, not one per row", () => {
    const computed = set();
    const dimension = displayedRotationColumns(computed)[0];
    const scores = unitScoresByGroup(computed, "Condition", dimension);

    expect(scores.get("AI")).toHaveLength(3);
    expect(scores.get("Non-AI")).toHaveLength(3);
  });

  it("averages a trajectory unit's steps into a single observation", () => {
    // A trajectory model emits one point per unit per phase — six units over
    // two phases is twelve points, but still six observations.
    const computed = set("AccumulatedTrajectory");
    const dimension = displayedRotationColumns(computed)[0];
    expect(computed.points.length).toBeGreaterThan(6);

    const scores = unitScoresByGroup(computed, "Condition", dimension);
    expect((scores.get("AI") ?? []).length + (scores.get("Non-AI") ?? []).length).toBe(6);
  });

  it("reads the same coordinates the plot draws", () => {
    const computed = set();
    const dimension = displayedRotationColumns(computed)[0];
    const scores = unitScoresByGroup(computed, "Condition", dimension);

    const aiPoints = computed.points
      .filter((point) => String(point.Condition) === "AI")
      .map((point) => Number(point[dimension]));
    expect(mean(scores.get("AI") ?? [])).toBeCloseTo(mean(aiPoints), 12);
  });
});

describe("compareGroups", () => {
  it("reports both tests per dimension with the group descriptives", () => {
    const computed = set();
    const dimensions = displayedRotationColumns(computed).slice(0, 2);
    const results = compareGroups(computed, "Condition", dimensions, "AI", "Non-AI");

    expect(results).toHaveLength(dimensions.length);
    for (const result of results) {
      expect(result.left.group).toBe("AI");
      expect(result.right.group).toBe("Non-AI");
      expect(result.left.n).toBe(3);
      expect(result.right.n).toBe(3);
      expect(Number.isFinite(result.parametric.t)).toBe(true);
      expect(result.nonParametric.p).toBeGreaterThan(0);
      expect(result.nonParametric.p).toBeLessThanOrEqual(1);
    }
  });

  it("agrees with the descriptives it reports", () => {
    const computed = set();
    const dimension = displayedRotationColumns(computed)[0];
    const [result] = compareGroups(computed, "Condition", [dimension], "AI", "Non-AI");
    const scores = unitScoresByGroup(computed, "Condition", dimension);

    expect(result.left.mean).toBeCloseTo(mean(scores.get("AI") ?? []), 12);
    expect(result.parametric.meanDifference).toBeCloseTo(result.left.mean - result.right.mean, 12);
  });

  it("marks a missing group as degenerate rather than guessing", () => {
    const computed = set();
    const dimension = displayedRotationColumns(computed)[0];
    const [result] = compareGroups(computed, "Condition", [dimension], "AI", "Nonexistent");

    expect(result.right.n).toBe(0);
    expect(result.parametric.degenerate).toBe(true);
    expect(result.nonParametric.degenerate).toBe(true);
  });
});
