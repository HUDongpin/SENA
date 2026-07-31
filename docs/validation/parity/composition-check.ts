// Executes the assertions in lib/ena/__tests__/plot-composition.test.ts without
// vitest, so the composition behaviour is verified rather than asserted.
import { ena } from "jena-js";
import { buildEnaPlotModel, buildEnaRunResult, distinctUnitCount, isTrajectoryModel } from "@/lib/ena/results";
import { plotLegendEntries } from "@/lib/ena/plot-encoding";
import type { EnaRow } from "@/lib/ena/types";

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
    rows, units: ["unit"], conversation, codes: CODES, metadata: ["Condition"],
    includeMeta: true, model, window: "MovingStanzaWindow", windowSizeBack: 2, dimensions: 2
  });
}

let checks = 0;
let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL ${label} ${detail}`);
  }
}

// --- group means ------------------------------------------------------------
{
  const set = run("EndPoint", ["Phase"]);
  const model = buildEnaPlotModel(set, { groupBy: "Condition" });
  const groups = model.traces.filter((trace) => trace.type === "group");
  check("group names", JSON.stringify(groups.map((g) => g.name)) === JSON.stringify(["AI mean", "Non-AI mean"]), JSON.stringify(groups.map((g) => g.name)));
  check("one point per group", groups.every((g) => g.points?.length === 1));
  check("distinct group colours", new Set(groups.map((g) => g.color)).size === 2);

  const aiMean = model.traces.find((t) => t.name === "AI mean")?.points?.[0];
  const aiPoints = set.points.filter((p) => p.Condition === "AI");
  const expectedX = aiPoints.reduce((s, p) => s + Number(p.SVD1), 0) / aiPoints.length;
  check("group mean is the centroid", Math.abs((aiMean?.x ?? 0) - expectedX) < 1e-12);

  const plain = buildEnaPlotModel(set);
  check("no groups without groupBy", plain.traces.filter((t) => t.type === "group").length === 0);
  check("default trace order", JSON.stringify(plain.traces.map((t) => t.type)) === JSON.stringify(["network", "nodes", "points"]));
  check("unknown groupBy ignored", buildEnaPlotModel(set, { groupBy: "NotAColumn" }).traces.filter((t) => t.type === "group").length === 0);

  // Composition must not move the projection.
  const grouped = buildEnaPlotModel(set, { groupBy: "Condition" });
  check("axes unchanged", JSON.stringify(grouped.axes) === JSON.stringify(plain.axes));
  check("network unchanged", JSON.stringify(grouped.traces.find((t) => t.type === "network")?.network) === JSON.stringify(plain.traces.find((t) => t.type === "network")?.network));
}

// --- trajectories -----------------------------------------------------------
{
  const set = run("AccumulatedTrajectory", ["Phase"]);
  const model = buildEnaPlotModel(set, { groupBy: "Condition" });
  const trajectories = model.traces.filter((trace) => trace.type === "trajectory");
  check("is trajectory model", isTrajectoryModel(set));
  check("one trajectory per unit", trajectories.length === 4, `got ${trajectories.length}`);
  check("each trajectory holds one unit", trajectories.every((t) =>
    new Set((t.points ?? []).map((p) => String((p.row as Record<string, unknown> | undefined)?.ENA_UNIT ?? ""))).size === 1));
  check("each trajectory moves", trajectories.every((t) => (t.points?.length ?? 0) > 1));

  const legend = plotLegendEntries(model);
  check("legend collapses", model.traces.length > legend.length, `${model.traces.length} traces -> ${legend.length} rows`);
  const names = legend.filter((e) => e.type === "trajectory").map((e) => e.name).sort();
  check("one legend row per group", JSON.stringify(names) === JSON.stringify(["AI trajectory", "Non-AI trajectory"]), JSON.stringify(names));

  const flat = run("AccumulatedTrajectory", ["unit"]);
  const result = buildEnaRunResult(flat, rows.length, "api", 0, [], { groupBy: "Condition" });
  check("falls back to points", result.plotModel.traces.filter((t) => t.type === "trajectory").length === 0);
  check("keeps unit points", result.plotModel.traces.some((t) => t.type === "points"));
  check("warns about flat conversation", result.warnings.some((w) => w.includes("single conversation")));

  check("unitLabels counts steps", set.unitLabels.length > 4);
  check("distinctUnitCount counts units", distinctUnitCount(set) === 4, `got ${distinctUnitCount(set)}`);
  check("distinctUnitCount on EndPoint", distinctUnitCount(run("EndPoint", ["Phase"])) === 4);
}

console.log(`${checks - failures}/${checks} composition assertions held`);
process.exit(failures === 0 ? 0 : 1);
