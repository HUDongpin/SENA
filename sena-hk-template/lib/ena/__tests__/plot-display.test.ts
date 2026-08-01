import { describe, expect, it } from "vitest";
import { ena } from "jena-js";
import { buildEnaPlotModel } from "../results";
import {
  applyEnaPlotModelDisplay,
  clampEnaPlotScale,
  defaultEnaPlotDisplay,
  enaPlotDisplayVariance,
  enaPlotInkDisplay,
  enaPlotTraceLabelsVisible
} from "../plot-display";
import type { EnaRow } from "../types";

// Plot Tools must be presentation only. Every control here either transforms
// the plot model or changes the ink; none of them may reach the ENA model, and
// with every control left at its default the model has to come back byte-equal
// to what jena-js built.

const CODES = ["A", "B", "C", "D"];

function row(unit: string, condition: string, codes: number[]): EnaRow {
  return {
    unit,
    Condition: condition,
    ...Object.fromEntries(CODES.map((code, index) => [code, codes[index]]))
  };
}

// D never co-occurs with anything, so it is the unconnected code.
const rows: EnaRow[] = [
  row("u1", "AI", [1, 1, 0, 0]),
  row("u1", "AI", [0, 1, 1, 0]),
  row("u2", "AI", [1, 0, 1, 0]),
  row("u2", "AI", [1, 1, 0, 0]),
  row("u3", "Non-AI", [1, 1, 0, 0]),
  row("u3", "Non-AI", [0, 1, 1, 0]),
  row("u4", "Non-AI", [1, 0, 1, 0]),
  row("u4", "Non-AI", [0, 0, 0, 1])
];

function model(minWeight?: number) {
  const set = ena({
    rows,
    units: ["unit"],
    conversation: ["unit"],
    codes: CODES,
    metadata: ["Condition"],
    includeMeta: true,
    model: "EndPoint",
    window: "MovingStanzaWindow",
    windowSizeBack: 2
  });
  return buildEnaPlotModel(set, minWeight === undefined ? {} : { minWeight });
}

function networkTrace(plotModel: ReturnType<typeof model>) {
  const trace = plotModel.traces.find((candidate) => candidate.network);
  if (!trace?.network) throw new Error("expected a network trace");
  return trace.network;
}

describe("applyEnaPlotModelDisplay", () => {
  it("is the identity at the default settings", () => {
    const base = model();
    expect(applyEnaPlotModelDisplay(base, defaultEnaPlotDisplay)).toEqual(base);
  });

  it("never mutates the model it is given", () => {
    const base = model();
    const before = structuredClone(base);
    applyEnaPlotModelDisplay(base, { ...defaultEnaPlotDisplay, flipX: true, flipY: true });
    expect(base).toEqual(before);
  });

  it("mirrors every coordinate on a flipped axis and leaves the other one alone", () => {
    const base = model();
    const flipped = applyEnaPlotModelDisplay(base, { ...defaultEnaPlotDisplay, flipX: true });

    base.traces.forEach((trace, traceIndex) => {
      trace.points?.forEach((point, pointIndex) => {
        const moved = flipped.traces[traceIndex].points?.[pointIndex];
        expect(moved?.x).toBe(-point.x);
        expect(moved?.y).toBe(point.y);
      });
      trace.network?.nodes.forEach((node, nodeIndex) => {
        const moved = flipped.traces[traceIndex].network?.nodes[nodeIndex];
        expect(moved?.x).toBe(node.x === undefined ? undefined : -node.x);
        expect(moved?.y).toBe(node.y);
      });
    });
  });

  it("keeps the axis range, so a flip cannot push a point out of view", () => {
    const base = model();
    const flipped = applyEnaPlotModelDisplay(base, { ...defaultEnaPlotDisplay, flipX: true, flipY: true });
    expect(flipped.axes.x.range).toEqual(base.axes.x.range);
    expect(flipped.axes.y.range).toEqual(base.axes.y.range);
    // jena-js ranges are symmetric about zero, which is what makes that safe.
    expect(base.axes.x.range[0]).toBeCloseTo(-base.axes.x.range[1], 12);
  });

  it("returns to the original space when a flip is turned off again", () => {
    const base = model();
    const there = applyEnaPlotModelDisplay(base, { ...defaultEnaPlotDisplay, flipX: true, flipY: true });
    const back = applyEnaPlotModelDisplay(there, { ...defaultEnaPlotDisplay, flipX: true, flipY: true });
    expect(back).toEqual(base);
  });

  it("renames axes and blanks them when dimension labels are off", () => {
    const base = model();
    const renamed = applyEnaPlotModelDisplay(base, {
      ...defaultEnaPlotDisplay,
      axisTitleX: "  Collaboration  ",
      axisTitleY: ""
    });
    expect(renamed.axes.x.title).toBe("Collaboration");
    expect(renamed.axes.y.title).toBe(base.axes.y.title);

    const hidden = applyEnaPlotModelDisplay(base, {
      ...defaultEnaPlotDisplay,
      showAxisTitles: false,
      axisTitleX: "Collaboration"
    });
    expect(hidden.axes.x.title).toBe("");
    expect(hidden.axes.y.title).toBe("");
  });

  it("keeps every code while the fixture's codes are all connected", () => {
    const base = model();
    const network = networkTrace(base);
    const connected = new Set(network.edges.flatMap((edge) => [edge.source, edge.target]));
    expect(network.nodes.every((node) => connected.has(node.id))).toBe(true);

    const hidden = applyEnaPlotModelDisplay(base, {
      ...defaultEnaPlotDisplay,
      showUnconnectedCodes: false
    });
    expect(networkTrace(hidden).nodes).toEqual(network.nodes);
  });

  it("drops the codes a minimum edge weight has disconnected", () => {
    // A threshold above every edge is what leaves codes stranded: the network
    // keeps its nodes and loses all its connections.
    const base = model(999);
    const network = networkTrace(base);
    expect(network.edges).toHaveLength(0);
    expect(network.nodes.length).toBeGreaterThan(0);

    const shown = applyEnaPlotModelDisplay(base, defaultEnaPlotDisplay);
    expect(networkTrace(shown).nodes).toEqual(network.nodes);

    const hidden = applyEnaPlotModelDisplay(base, {
      ...defaultEnaPlotDisplay,
      showUnconnectedCodes: false
    });
    expect(networkTrace(hidden).nodes).toHaveLength(0);
  });

  it("drops only the stranded code when some connections survive", () => {
    const base = model();
    const network = networkTrace(base);
    const [firstEdge] = network.edges;
    // Keep a single edge, so every code that is not one of its endpoints is
    // stranded — the partial case the toggle exists for.
    const single = {
      ...base,
      traces: base.traces.map((trace) =>
        trace.network ? { ...trace, network: { ...trace.network, edges: [firstEdge] } } : trace
      )
    };

    const hidden = applyEnaPlotModelDisplay(single, {
      ...defaultEnaPlotDisplay,
      showUnconnectedCodes: false
    });
    expect(networkTrace(hidden).nodes.map((node) => node.id).sort()).toEqual(
      [firstEdge.source, firstEdge.target].sort()
    );
  });

  it("leaves the edges untouched when unconnected codes are dropped", () => {
    const base = model();
    const hidden = applyEnaPlotModelDisplay(base, {
      ...defaultEnaPlotDisplay,
      showUnconnectedCodes: false
    });
    expect(networkTrace(hidden).edges).toEqual(networkTrace(base).edges);
  });
});

describe("enaPlotDisplayVariance", () => {
  it("re-keys the shares onto a renamed axis so the percentage survives", () => {
    const base = model();
    const [xDimension, yDimension] = base.dimensions;
    const variance = { [xDimension]: 0.441, [yDimension]: 0.264 };

    const remapped = enaPlotDisplayVariance(base, variance, {
      ...defaultEnaPlotDisplay,
      axisTitleX: "Collaboration"
    });

    expect(remapped?.Collaboration).toBe(0.441);
    expect(remapped?.[yDimension]).toBe(0.264);
  });

  it("withholds the shares when variance is switched off", () => {
    const base = model();
    const variance = { [base.dimensions[0]]: 0.441 };
    expect(enaPlotDisplayVariance(base, variance, { ...defaultEnaPlotDisplay, showVariance: false })).toBeUndefined();
    expect(
      enaPlotDisplayVariance(base, variance, { ...defaultEnaPlotDisplay, showAxisTitles: false })
    ).toBeUndefined();
  });
});

describe("ink options", () => {
  it("clamps the scales to a usable range", () => {
    expect(clampEnaPlotScale(0.1)).toBe(0.5);
    expect(clampEnaPlotScale(9)).toBe(2.5);
    expect(clampEnaPlotScale(Number.NaN)).toBe(1);
    expect(clampEnaPlotScale(1.4)).toBe(1.4);

    const ink = enaPlotInkDisplay({ ...defaultEnaPlotDisplay, unitScale: 12, edgeWeightScale: 0 });
    expect(ink.unitScale).toBe(2.5);
    expect(ink.edgeWeightScale).toBe(0.5);
  });

  it("maps each label switch to the trace types it governs", () => {
    const noUnits = enaPlotInkDisplay({ ...defaultEnaPlotDisplay, showUnitLabels: false });
    expect(enaPlotTraceLabelsVisible("points", noUnits)).toBe(false);
    expect(enaPlotTraceLabelsVisible("trajectory", noUnits)).toBe(false);
    expect(enaPlotTraceLabelsVisible("group", noUnits)).toBe(true);
    expect(enaPlotTraceLabelsVisible("nodes", noUnits)).toBe(true);

    const noGroups = enaPlotInkDisplay({ ...defaultEnaPlotDisplay, showGroupLabels: false });
    expect(enaPlotTraceLabelsVisible("group", noGroups)).toBe(false);
    expect(enaPlotTraceLabelsVisible("points", noGroups)).toBe(true);

    const noCodes = enaPlotInkDisplay({ ...defaultEnaPlotDisplay, showCodeLabels: false });
    expect(enaPlotTraceLabelsVisible("nodes", noCodes)).toBe(false);
    expect(enaPlotTraceLabelsVisible("points", noCodes)).toBe(true);
  });
});
