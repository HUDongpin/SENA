import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ena } from "jena-js";
import { renderENAPlot } from "jena-js/plot";
import { buildEnaPlotModel } from "../results";
import { parseCsv } from "../csv";
import { sampleEnaCsv } from "../sample-data";
import { inferEnaMapping, prepareEnaRun } from "../validation";
import {
  JENA_NETWORK_NODE_LABEL_OFFSET,
  JENA_POINT_LABEL_OFFSET,
  JENA_TRAJECTORY_OPACITY,
  JENA_TRAJECTORY_STROKE_WIDTH,
  RENA_EDGE_OPACITY_RANGE,
  RENA_EDGE_WIDTH_RANGE,
  RENA_NODE_RADIUS_RANGE,
  axisOrigin,
  axisTitleWithVariance,
  desaturate,
  jenaPlotGeometry,
  labelBox,
  nodeLabelPlacements,
  pointTraceRadius,
  projectPoint,
  resolveNetworkEdges,
  resolveNetworkNodes,
  styleRenaNetwork
} from "../plot-encoding";

// jena-js's renderENAPlot mutates a real SVG DOM. SENA renders the same plot in
// React, so this suite runs jena-js's renderer against a minimal stub document
// and asserts SENA's encoding module lands every glyph on the same pixel with
// the same ink. If a jena-js upgrade changes the grammar, this fails rather
// than letting the two renderers drift apart unnoticed.

type StubAttributes = Record<string, string>;

class StubElement {
  tagName: string;
  attributes: StubAttributes = {};
  children: StubElement[] = [];
  textContent: string | null = null;

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = String(value);
  }

  append(...nodes: StubElement[]) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: StubElement[]) {
    this.children = [...nodes];
  }

  remove() {
    this.children = [];
  }

  descendants(): StubElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
}

const originalDocument = (globalThis as { document?: unknown }).document;

beforeAll(() => {
  (globalThis as { document?: unknown }).document = {
    createElementNS: (_namespace: string, tagName: string) => new StubElement(tagName)
  };
});

afterAll(() => {
  if (originalDocument === undefined) delete (globalThis as { document?: unknown }).document;
  else (globalThis as { document?: unknown }).document = originalDocument;
});

function sampleSet() {
  const parsed = parseCsv(sampleEnaCsv);
  const prepared = prepareEnaRun({
    rows: parsed.rows,
    mapping: inferEnaMapping(parsed.headers, parsed.rows)
  });
  return ena(prepared.options);
}

function renderReference(model: ReturnType<typeof buildEnaPlotModel>) {
  const container = new StubElement("div");
  const { width, height } = jenaPlotGeometry;
  renderENAPlot(container as never, model, { width, height });
  const svg = container.children[0];
  return { svg, elements: svg.descendants() };
}

function byTag(elements: StubElement[], tagName: string) {
  return elements.filter((element) => element.tagName === tagName);
}

function num(element: StubElement, attribute: string) {
  return Number(element.attributes[attribute]);
}

describe("ENA plot parity with jena-js renderENAPlot", () => {
  // Built in beforeAll rather than in the describe body: the body is evaluated at
  // collection time, which is before the beforeAll above installs the `document`
  // stub, so rendering here would throw "document is not defined" and the whole
  // file would fail to collect.
  let model: ReturnType<typeof buildEnaPlotModel>;
  let elements: StubElement[];

  beforeAll(() => {
    model = buildEnaPlotModel(sampleSet());
    elements = renderReference(model).elements;
  });

  it("renders the reference plot the parity assertions depend on", () => {
    expect(model.traces.map((trace) => trace.type)).toEqual(["network", "nodes", "points"]);
    expect(byTag(elements, "circle").length).toBeGreaterThan(0);
    expect(byTag(elements, "line").length).toBeGreaterThan(0);
  });

  it("places the axis cross at the data origin, not the canvas centre", () => {
    const { width, height, margin } = jenaPlotGeometry;
    const origin = axisOrigin(model);
    const axes = byTag(elements, "path")[0];

    expect(axes.attributes.d).toBe(
      `M ${margin} ${origin.y} L ${width - margin} ${origin.y} M ${origin.x} ${margin} L ${origin.x} ${height - margin}`
    );
    expect(axes.attributes["stroke-width"]).toBe("1");
  });

  it("places every network edge on jena-js's pixel span", () => {
    // Geometry only. jena-js, rENA, and SENA agree on where edges are drawn —
    // it is the ink (width, opacity, saturation) where jena-js's minimal
    // renderer and rENA's grammar diverge, and SENA follows rENA. The rENA
    // styling is asserted separately below.
    const networkTrace = model.traces.find((trace) => trace.type === "network");
    const edges = resolveNetworkEdges(model, networkTrace!.network!);
    const referenceLines = byTag(elements, "line").slice(0, edges.length);

    expect(referenceLines.length).toBe(edges.length);
    edges.forEach((edge, index) => {
      const line = referenceLines[index];
      expect(num(line, "x1")).toBeCloseTo(edge.x1, 12);
      expect(num(line, "y1")).toBeCloseTo(edge.y1, 12);
      expect(num(line, "x2")).toBeCloseTo(edge.x2, 12);
      expect(num(line, "y2")).toBeCloseTo(edge.y2, 12);
    });
  });

  it("places network nodes at the rotated code positions", () => {
    // Geometry only — node radius and fill follow rENA (sized by connectivity,
    // solid), asserted below.
    const networkTrace = model.traces.find((trace) => trace.type === "network");
    const nodes = resolveNetworkNodes(model, networkTrace!.network!);
    const referenceCircles = byTag(elements, "circle").slice(0, nodes.length);

    expect(referenceCircles.length).toBe(nodes.length);
    nodes.forEach((node, index) => {
      const circle = referenceCircles[index];
      expect(num(circle, "cx")).toBeCloseTo(node.x, 12);
      expect(num(circle, "cy")).toBeCloseTo(node.y, 12);
    });
  });

  it("sizes point traces by jena-js's per-type radii", () => {
    expect(pointTraceRadius("group")).toBe(6);
    expect(pointTraceRadius("nodes")).toBe(5);
    expect(pointTraceRadius("points")).toBe(4);
    expect(pointTraceRadius("trajectory")).toBe(4);

    const networkTrace = model.traces.find((trace) => trace.type === "network");
    const networkNodeCount = resolveNetworkNodes(model, networkTrace!.network!).length;
    const circles = byTag(elements, "circle").slice(networkNodeCount);
    const overlayTraces = model.traces.filter((trace) => trace.type !== "network");

    let cursor = 0;
    for (const trace of overlayTraces) {
      for (const point of trace.points ?? []) {
        const circle = circles[cursor];
        const [x, y] = projectPoint(model, point);
        expect(num(circle, "cx")).toBeCloseTo(x, 12);
        expect(num(circle, "cy")).toBeCloseTo(y, 12);
        expect(num(circle, "r")).toBe(pointTraceRadius(trace.type));
        cursor += 1;
      }
    }
    expect(cursor).toBe(circles.length);
  });

  it("offsets point labels the way jena-js does", () => {
    // Deliberately a unit label, not a code label. Code labels are drawn twice
    // at the same coordinate — once by the network trace at offset +7 and once
    // by the nodes trace at +6 — so matching one by position picks whichever
    // comes first and the assertion becomes a coin toss. Unit labels are unique.
    const pointsTrace = model.traces.find((trace) => trace.type === "points");
    const point = (pointsTrace?.points ?? [])[0];
    expect(point).toBeTruthy();
    expect(point!.label).toBeTruthy();

    const [x, y] = projectPoint(model, point!);
    const matches = byTag(elements, "text").filter((text) => text.textContent === point!.label);

    expect(matches).toHaveLength(1);
    expect(num(matches[0], "x")).toBeCloseTo(x + JENA_POINT_LABEL_OFFSET.x, 12);
    expect(num(matches[0], "y")).toBeCloseTo(y + JENA_POINT_LABEL_OFFSET.y, 12);
  });

  it("keeps jena-js's trajectory segment weight", () => {
    // The sample model has no trajectory trace, so assert the constants the
    // renderer would use directly against jena-js's source values.
    expect(JENA_TRAJECTORY_STROKE_WIDTH).toBe(1.5);
    expect(JENA_TRAJECTORY_OPACITY).toBe(0.8);
  });

  it("puts the plot title and axis titles where jena-js puts them", () => {
    const { width, height, margin } = jenaPlotGeometry;
    const texts = byTag(elements, "text");
    const title = texts.find((text) => text.textContent === model.title);
    const xTitle = texts.find((text) => text.textContent === model.axes.x.title);
    const yTitle = texts.find((text) => text.textContent === model.axes.y.title);

    expect(num(title!, "x")).toBe(margin);
    expect(num(title!, "y")).toBe(height - 12);
    expect(num(xTitle!, "x")).toBe(width - margin);
    expect(num(xTitle!, "y")).toBe(height - 10);
    expect(xTitle!.attributes["text-anchor"]).toBe("end");
    expect(num(yTitle!, "x")).toBe(margin);
    expect(num(yTitle!, "y")).toBe(18);
  });
});

describe("rENA network styling (ena.plot.network grammar)", () => {
  const set = sampleSet();
  const model = buildEnaPlotModel(set);
  const network = model.traces.find((trace) => trace.type === "network")!.network!;
  const styled = styleRenaNetwork(model, network, "#386CB0");

  it("sizes nodes by connectivity, within rENA's node-size range", () => {
    // rENA: nodes$weight accumulates |edge weight| over incident edges, then
    // rescales by the max into node.size. Radius must be monotone in
    // connectivity and bounded by the range.
    for (const node of styled.nodes) {
      expect(node.radius).toBeGreaterThanOrEqual(RENA_NODE_RADIUS_RANGE[0] - 1e-9);
      expect(node.radius).toBeLessThanOrEqual(RENA_NODE_RADIUS_RANGE[1] + 1e-9);
    }
    const byConnectivity = [...styled.nodes].sort((a, b) => a.connectivity - b.connectivity);
    for (let i = 1; i < byConnectivity.length; i += 1) {
      expect(byConnectivity[i].radius).toBeGreaterThanOrEqual(byConnectivity[i - 1].radius - 1e-9);
    }
    // The most-connected code is strictly larger than the least-connected one.
    expect(Math.max(...styled.nodes.map((n) => n.radius)))
      .toBeGreaterThan(Math.min(...styled.nodes.map((n) => n.radius)));
  });

  it("scales edge width and opacity together with |weight|", () => {
    for (const edge of styled.edges) {
      expect(edge.strokeWidth).toBeGreaterThanOrEqual(RENA_EDGE_WIDTH_RANGE[0] - 1e-9);
      expect(edge.strokeWidth).toBeLessThanOrEqual(RENA_EDGE_WIDTH_RANGE[1] + 1e-9);
      expect(edge.opacity).toBeGreaterThanOrEqual(RENA_EDGE_OPACITY_RANGE[0] - 1e-9);
      expect(edge.opacity).toBeLessThanOrEqual(RENA_EDGE_OPACITY_RANGE[1] + 1e-9);
    }
    const byWeight = [...styled.edges].sort((a, b) => Math.abs(a.weight) - Math.abs(b.weight));
    for (let i = 1; i < byWeight.length; i += 1) {
      expect(byWeight[i].strokeWidth).toBeGreaterThanOrEqual(byWeight[i - 1].strokeWidth - 1e-9);
      expect(byWeight[i].opacity).toBeGreaterThanOrEqual(byWeight[i - 1].opacity - 1e-9);
    }
  });

  it("desaturates weak edges toward gray, the way rENA scales the HSV S channel", () => {
    const weakest = styled.edges.reduce((min, e) => (Math.abs(e.weight) < Math.abs(min.weight) ? e : min));
    const strongest = styled.edges.reduce((max, e) => (Math.abs(e.weight) > Math.abs(max.weight) ? e : max));
    // Distance from the base hue's gray point: strong edge is more saturated.
    const spread = (hex: string) => {
      const n = parseInt(hex.replace("#", ""), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      return Math.max(r, g, b) - Math.min(r, g, b);
    };
    expect(spread(strongest.color)).toBeGreaterThan(spread(weakest.color));
  });

  it("desaturate() collapses to gray at 0 and preserves the colour at 1", () => {
    expect(desaturate("#386CB0", 1)).toBe("#386cb0");
    const gray = desaturate("#386CB0", 0);
    const n = parseInt(gray.replace("#", ""), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(1);
  });
});

// A plot-relative scale needs two different weights to be relative *to*. With
// one drawn edge — or several that tie exactly — there is no ordering, and the
// min-max map would send every edge to the top of the range: a lone connection
// of |w| = 0.001 drawn as thick as one of |w| = 5, which overstates it eightfold
// in the direction of claiming more than the data supports.
//
// This is reachable from the shipped UI, not a synthetic corner. The temporal
// window builder allows turn radius 0 and moving-window size 1, and at turn
// radius 0 the bundled lesson-study sample makes all ten turn windows
// degenerate, several of them drawing a single edge.
describe("degenerate edge weights fall back to jena-js's absolute law", () => {
  function degenerateNetwork(weights: number[]) {
    const model = buildEnaPlotModel(sampleSet());
    const network = model.traces.find((trace) => trace.type === "network")!.network!;
    const edges = network.edges.slice(0, weights.length).map((edge, index) => ({
      ...edge,
      weight: weights[index]
    }));
    return styleRenaNetwork(model, { nodes: network.nodes, edges }, "#386CB0");
  }

  it("draws a lone weak edge thin, not at the maximum width", () => {
    const styled = degenerateNetwork([0.001]);

    expect(styled.edges).toHaveLength(1);
    // jena-js: max(1, 0.001 * 4) = 1 — the floor, not the ceiling.
    expect(styled.edges[0].strokeWidth).toBeCloseTo(RENA_EDGE_WIDTH_RANGE[0], 12);
    expect(styled.edges[0].strokeWidth).toBeLessThan(RENA_EDGE_WIDTH_RANGE[1]);
  });

  it("scales a lone edge by its own magnitude", () => {
    // jena-js's law is max(1, |w| * 4), clamped into [1, 8].
    expect(degenerateNetwork([1]).edges[0].strokeWidth).toBeCloseTo(4, 12);
    expect(degenerateNetwork([0.5774]).edges[0].strokeWidth).toBeCloseTo(2.3096, 4);
    // Above the range the clamp holds, so the plot still fits its own scale.
    expect(degenerateNetwork([5]).edges[0].strokeWidth).toBeCloseTo(RENA_EDGE_WIDTH_RANGE[1], 12);
  });

  it("treats exactly-tied weights the same as a single edge", () => {
    const styled = degenerateNetwork([0.2887, 0.2887, 0.2887]);

    expect(styled.edges).toHaveLength(3);
    for (const edge of styled.edges) {
      // jena-js: max(1, 0.2887 * 4) = 1.1548 — its own magnitude, not the
      // ceiling the min-max map would have given all three.
      expect(edge.strokeWidth).toBeCloseTo(1.1548, 4);
      expect(edge.strokeWidth).toBeLessThan(RENA_EDGE_WIDTH_RANGE[1]);
    }
  });

  it("keeps opacity and saturation consistent with the fallback width", () => {
    const weak = degenerateNetwork([0.001]).edges[0];
    const strong = degenerateNetwork([5]).edges[0];

    expect(weak.opacity).toBeCloseTo(RENA_EDGE_OPACITY_RANGE[0], 12);
    expect(strong.opacity).toBeCloseTo(RENA_EDGE_OPACITY_RANGE[1], 12);
    expect(weak.opacity).toBeLessThan(strong.opacity);
    expect(weak.intensity).toBeLessThan(strong.intensity);
  });

  it("leaves a plot with real spread on the plot-relative scale", () => {
    // The guard must not leak into the normal path: with a spread present the
    // weakest edge still maps to the bottom of the range and the strongest to
    // the top, which is the ADR-0008 rule.
    const styled = degenerateNetwork([0.1, 0.5, 2]);
    const widths = styled.edges.map((edge) => edge.strokeWidth);

    expect(Math.min(...widths)).toBeCloseTo(RENA_EDGE_WIDTH_RANGE[0], 12);
    expect(Math.max(...widths)).toBeCloseTo(RENA_EDGE_WIDTH_RANGE[1], 12);
  });
});

describe("SENA presentation extensions", () => {
  it("appends variance shares to axis titles without renaming the dimension", () => {
    expect(axisTitleWithVariance("SVD1", { SVD1: 0.509500694 })).toBe("SVD1 · 51.0%");
    expect(axisTitleWithVariance("SVD2")).toBe("SVD2");
    expect(axisTitleWithVariance("SVD2", { SVD1: 0.5 })).toBe("SVD2");
  });
});

// This is SENA's one deliberate departure from jena-js's and rENA's label
// grammar, and these assertions are where it is stated rather than assumed.
// Both grammars label every node unconditionally at a fixed offset; SENA keeps
// that rule everywhere it produces readable output and departs only where it
// does not — see the block comment above nodeLabelPlacements. The first test is
// the load-bearing one: on a plot whose codes are separated, the deviation is
// not merely small, it is *absent*.
describe("collision-aware node labels (documented deviation from jena-js)", () => {
  function node(id: string, x: number, y: number, radius: number) {
    return { id, label: id, x, y, radius };
  }

  it("reproduces jena-js's offset exactly when no labels collide", () => {
    const model = buildEnaPlotModel(sampleSet());
    const network = model.traces.find((trace) => trace.type === "network")!.network!;
    const styled = styleRenaNetwork(model, network, "#386CB0");
    const placements = nodeLabelPlacements(styled.nodes);

    // One label per node, none merged, none moved: byte-for-byte the layout the
    // unconditional rule produced before collision handling existed.
    expect(placements).toHaveLength(styled.nodes.length);
    for (const placement of placements) {
      expect(placement.merged).toBe(false);
      expect(placement.displaced).toBe(false);
      expect(placement.textAnchor).toBe("start");

      const source = styled.nodes.find((candidate) => candidate.id === placement.anchorId)!;
      expect(placement.x).toBeCloseTo(source.x + source.radius + JENA_NETWORK_NODE_LABEL_OFFSET.x, 12);
      expect(placement.y).toBeCloseTo(source.y + JENA_NETWORK_NODE_LABEL_OFFSET.y, 12);
      expect(placement.text).toBe(source.label);
    }
  });

  it("merges codes that project to the same pixel into one anchor", () => {
    // The pilot's `stage:0:1-3` window, reduced: a scoped ENA run can lack the
    // data to separate two codes, and then there is one mark on screen. One
    // mark gets one label — fanning two labels off it would assert a separation
    // the projection did not produce.
    const placements = nodeLabelPlacements([
      node("hypothesis", 300, 200, 13.23),
      node("evidence", 300, 200, 13.23),
      node("question", 120, 400, 8)
    ]);

    expect(placements).toHaveLength(2);
    const merged = placements.find((placement) => placement.merged)!;
    expect(merged.text).toBe("evidence · hypothesis");
    expect(merged.ids).toEqual(["evidence", "hypothesis"]);
    expect(merged.x).toBeCloseTo(300 + 13.23 + JENA_NETWORK_NODE_LABEL_OFFSET.x, 12);
  });

  it("merges a node whose glyph is entirely hidden inside another", () => {
    // `stage:2:3-10`: Question sits 9.49px from a r=15 node with r=5 of its own,
    // so its disc is completely covered. A label beside it would point at
    // nothing the reader can see.
    const placements = nodeLabelPlacements([
      node("evidence", 300, 200, 15),
      node("question", 309, 200, 5)
    ]);

    expect(placements).toHaveLength(1);
    expect(placements[0].text).toBe("evidence · question");
  });

  it("keeps separate labels for nodes that are merely close", () => {
    // Containment, not proximity, is the merge criterion: two discs a reader can
    // tell apart must keep their own names.
    const placements = nodeLabelPlacements([
      node("evidence", 300, 200, 10),
      node("critique", 318, 200, 10)
    ]);

    expect(placements).toHaveLength(2);
    expect(placements.every((placement) => placement.merged)).toBe(false);
    expect(placements.map((placement) => placement.text).sort()).toEqual(["critique", "evidence"]);
  });

  it("moves a colliding label to another corner rather than overprinting", () => {
    const nodes = [node("coordination", 300, 200, 10), node("explanation", 340, 200, 10)];
    const placements = nodeLabelPlacements(nodes);

    // Two visible marks, so two labels — and they no longer share pixels.
    expect(placements).toHaveLength(2);
    const [first, second] = placements.map((placement) =>
      labelBox(placement.text, placement.x, placement.y, placement.textAnchor)
    );
    const horizontal = Math.min(first.right, second.right) - Math.max(first.left, second.left);
    const vertical = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
    expect(horizontal <= 0 || vertical <= 0).toBe(true);

    const moved = placements.find((placement) => placement.displaced);
    expect(moved).toBeTruthy();

    // Displacement stays on jena-js's horizontal offset: the label is beside its
    // own node at the canonical distance, in whichever corner was free.
    const source = nodes.find((candidate) => candidate.id === moved!.anchorId)!;
    expect(Math.abs(moved!.x - source.x)).toBeCloseTo(source.radius + JENA_NETWORK_NODE_LABEL_OFFSET.x, 12);
  });

  it("resolves a projection collapsed onto one line without overprinting", () => {
    // `stage:1:2-6`: SVD2 explains ~nothing and every code lands on one row.
    // This is the case four corners cannot solve on their own.
    const collapsed = [
      node("question", 126, 260, 9.33),
      node("hypothesis", 360, 260, 5),
      node("evidence", 389, 260, 13.92),
      node("explanation", 331, 260, 15),
      node("critique", 389, 260, 13.92),
      node("reflection", 360, 260, 5),
      node("coordination", 448, 260, 12.84)
    ];
    const placements = nodeLabelPlacements(collapsed);
    const boxes = placements.map((placement) =>
      labelBox(placement.text, placement.x, placement.y, placement.textAnchor)
    );

    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const horizontal = Math.min(boxes[left].right, boxes[right].right) - Math.max(boxes[left].left, boxes[right].left);
        const vertical = Math.min(boxes[left].bottom, boxes[right].bottom) - Math.max(boxes[left].top, boxes[right].top);
        expect(horizontal <= 0 || vertical <= 0).toBe(true);
      }
    }
  });

  it("never drops a code, however degenerate the projection", () => {
    // Every node's name reaches the reader, either as its own label or inside a
    // merged one. Suppression would hide exactly the codes a scoped window is
    // least able to distinguish.
    const nodes = Array.from({ length: 12 }, (_, index) => node(`code-${index}`, 300, 200, 10));
    const placements = nodeLabelPlacements(nodes);
    const labelled = placements.flatMap((placement) => placement.ids).sort();

    expect(labelled).toEqual(nodes.map((entry) => entry.id).sort());
  });

  it("is a pure function of the nodes, so both ENA routes place labels alike", () => {
    // ADR 0008 requires /workspace/ena and SENA's ENA Space to render the same
    // markup. That holds only if placement depends on nothing but the nodes —
    // no selection, no hover, no tie broken by the order jena-js emitted them.
    const nodes = [
      node("evidence", 300, 200, 15),
      node("reflection", 300, 200, 15),
      node("question", 309, 200, 5),
      node("critique", 420, 260, 8)
    ];
    const byAnchor = (placements: ReturnType<typeof nodeLabelPlacements>) =>
      [...placements].sort((left, right) => left.anchorId.localeCompare(right.anchorId));

    // Emission order follows the nodes' own order — that is what keeps React
    // keys stable — so compare the placements themselves, not their sequence.
    expect(byAnchor(nodeLabelPlacements(nodes))).toEqual(
      byAnchor(nodeLabelPlacements([...nodes].reverse()))
    );
  });
});
