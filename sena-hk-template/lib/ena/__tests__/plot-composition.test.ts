import { describe, expect, it } from "vitest";
import { ena } from "jena-js";
import { buildEnaPlotModel, buildEnaRunResult, distinctUnitCount, isTrajectoryModel } from "../results";
import { plotLegendEntries } from "../plot-encoding";
import type { EnaRow } from "../types";

// Group-mean and trajectory traces are presentation only: they select which
// jena-js plot traces get added and must never touch the ENA model. These tests
// pin that separation, and the trajectory precondition that is easy to get
// wrong — a trajectory model only moves if a unit spans several conversations.

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
  row("u1", "AI", "P1", [0, 1, 1]),
  row("u1", "AI", "P2", [1, 0, 1]),
  row("u1", "AI", "P2", [1, 1, 0]),
  row("u2", "AI", "P1", [1, 0, 1]),
  row("u2", "AI", "P2", [0, 1, 1]),
  row("u3", "Non-AI", "P1", [1, 1, 0]),
  row("u3", "Non-AI", "P2", [1, 0, 1]),
  row("u4", "Non-AI", "P1", [0, 1, 1]),
  row("u4", "Non-AI", "P2", [1, 1, 1])
];

function run(model: "EndPoint" | "AccumulatedTrajectory", conversation: string[]) {
  return ena({
    rows,
    units: ["unit"],
    conversation,
    codes: CODES,
    metadata: ["Condition"],
    includeMeta: true,
    model,
    window: "MovingStanzaWindow",
    windowSizeBack: 2,
    dimensions: 2
  });
}

describe("group-mean traces", () => {
  it("adds one group trace per distinct value of the grouping column", () => {
    const set = run("EndPoint", ["Phase"]);
    const model = buildEnaPlotModel(set, { groupBy: "Condition" });
    const groups = model.traces.filter((trace) => trace.type === "group");

    expect(groups.map((trace) => trace.name)).toEqual(["AI mean", "Non-AI mean"]);
    expect(groups.every((trace) => trace.points?.length === 1)).toBe(true);
    expect(new Set(groups.map((trace) => trace.color)).size).toBe(2);
  });

  it("places each group mean at the centroid of its units", () => {
    const set = run("EndPoint", ["Phase"]);
    const model = buildEnaPlotModel(set, { groupBy: "Condition" });
    const aiMean = model.traces.find((trace) => trace.name === "AI mean")?.points?.[0];
    const aiPoints = set.points.filter((point) => point.Condition === "AI");
    const expectedX = aiPoints.reduce((sum, point) => sum + Number(point.SVD1), 0) / aiPoints.length;

    expect(aiMean?.x).toBeCloseTo(expectedX, 12);
  });

  it("adds no group traces when no grouping column is given", () => {
    const model = buildEnaPlotModel(run("EndPoint", ["Phase"]));

    expect(model.traces.filter((trace) => trace.type === "group")).toHaveLength(0);
    expect(model.traces.map((trace) => trace.type)).toEqual(["network", "nodes", "points"]);
  });

  it("ignores a grouping column that is not present on the points", () => {
    const model = buildEnaPlotModel(run("EndPoint", ["Phase"]), { groupBy: "NotAColumn" });

    expect(model.traces.filter((trace) => trace.type === "group")).toHaveLength(0);
  });
});

describe("trajectory traces", () => {
  it("adds one trajectory per unit, ordered, when units span several conversations", () => {
    const set = run("AccumulatedTrajectory", ["Phase"]);
    const model = buildEnaPlotModel(set, { groupBy: "Condition" });
    const trajectories = model.traces.filter((trace) => trace.type === "trajectory");

    expect(isTrajectoryModel(set)).toBe(true);
    expect(trajectories).toHaveLength(4);
    // addTrajectory connects the points it selects in order, so each trace must
    // hold exactly one unit — selecting a whole group would zigzag between
    // different participants' steps.
    for (const trace of trajectories) {
      const units = new Set((trace.points ?? []).map((point) => String(point.row?.ENA_UNIT ?? "")));
      expect(units.size).toBe(1);
      expect(trace.points?.length).toBeGreaterThan(1);
    }
  });

  it("names and colours trajectories by group so the legend stays one row per group", () => {
    const model = buildEnaPlotModel(run("AccumulatedTrajectory", ["Phase"]), { groupBy: "Condition" });
    const legend = plotLegendEntries(model);

    expect(model.traces.length).toBeGreaterThan(legend.length);
    expect(legend.filter((entry) => entry.type === "trajectory").map((entry) => entry.name).sort())
      .toEqual(["AI trajectory", "Non-AI trajectory"]);
  });

  it("falls back to unit points and warns when every unit sits in one conversation", () => {
    const set = run("AccumulatedTrajectory", ["unit"]);
    const result = buildEnaRunResult(set, rows.length, "api", 0, [], { groupBy: "Condition" });

    expect(result.plotModel.traces.filter((trace) => trace.type === "trajectory")).toHaveLength(0);
    expect(result.plotModel.traces.some((trace) => trace.type === "points")).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("single conversation"))).toBe(true);
  });

  it("resolves the group from raw rows when a trajectory model drops metadata", () => {
    const set = run("AccumulatedTrajectory", ["Phase"]);

    // jena-js projects only the unit columns under trajectory models, so a
    // grouping column that is metadata rather than part of the unit key
    // disappears from points and metaData exactly when trajectories turn on.
    expect(set.points[0].Condition).toBeUndefined();
    expect(set.metaData[0].Condition).toBeUndefined();

    const model = buildEnaPlotModel(set, { groupBy: "Condition" });
    expect(model.traces.filter((trace) => trace.type === "group").map((trace) => trace.name))
      .toEqual(["AI mean", "Non-AI mean"]);
    expect(model.traces.filter((trace) => trace.type === "trajectory").map((trace) => trace.name).sort())
      .toEqual(["AI trajectory", "AI trajectory", "Non-AI trajectory", "Non-AI trajectory"]);
  });

  it("counts distinct units rather than trajectory steps", () => {
    const endPoint = run("EndPoint", ["Phase"]);
    const trajectory = run("AccumulatedTrajectory", ["Phase"]);

    // set.unitLabels holds one entry per (unit x conversation) step under a
    // trajectory model, so a naive count reports steps as participants.
    expect(trajectory.unitLabels.length).toBeGreaterThan(4);
    expect(distinctUnitCount(trajectory)).toBe(4);
    expect(distinctUnitCount(endPoint)).toBe(4);
  });
});

describe("composition is presentation only", () => {
  it("never changes the projection", () => {
    const set = run("EndPoint", ["Phase"]);
    const plain = buildEnaPlotModel(set);
    const grouped = buildEnaPlotModel(set, { groupBy: "Condition" });

    expect(grouped.axes).toEqual(plain.axes);
    expect(grouped.dimensions).toEqual(plain.dimensions);
    const plainNetwork = plain.traces.find((trace) => trace.type === "network")?.network;
    const groupedNetwork = grouped.traces.find((trace) => trace.type === "network")?.network;
    expect(groupedNetwork).toEqual(plainNetwork);
  });
});
