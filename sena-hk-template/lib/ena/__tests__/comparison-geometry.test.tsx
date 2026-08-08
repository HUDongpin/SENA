import type { ENAPlotModel } from "jena-js/plot";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EnaPlot } from "../../../components/ena/EnaPlot";
import {
  ENA_COMPARISON_PALETTES,
  enaGroupIntervals,
  enaRowGroupValues,
  enaSubtractionNetwork,
  enaSubtractionTraceName,
  withEnaSubtractionNetwork
} from "../comparison";
import { desaturate, projectPoint } from "../plot-encoding";

// Comparison mode's geometry: group means with a 95% t interval, and rENA's
// subtracted network. Both are checked against arithmetic done by hand in the
// comments rather than against a second call into the same code — a group mean
// that agrees with itself proves nothing.

const groupPoints = [
  // Group A: three units. x = 1,3,5 -> mean 3, sd 2. y = 2,4,0 -> mean 2, sd 2.
  { ENA_UNIT: "A1", cohort: "A", SVD1: 1, SVD2: 2 },
  { ENA_UNIT: "A2", cohort: "A", SVD1: 3, SVD2: 4 },
  { ENA_UNIT: "A3", cohort: "A", SVD1: 5, SVD2: 0 },
  // Group B: two units. x = -1,-3 -> mean -2, sd sqrt(2). y = -1,-5 -> mean -3, sd sqrt(8).
  { ENA_UNIT: "B1", cohort: "B", SVD1: -1, SVD2: -1 },
  { ENA_UNIT: "B2", cohort: "B", SVD1: -3, SVD2: -5 },
  // Group C: one unit. No spread, so no interval.
  { ENA_UNIT: "C1", cohort: "C", SVD1: 8, SVD2: 8 }
];

function intervals(rows = groupPoints) {
  return enaGroupIntervals({
    points: rows,
    xDimension: "SVD1",
    yDimension: "SVD2",
    groupOf: enaRowGroupValues(rows, "cohort")
  });
}

describe("enaGroupIntervals", () => {
  it("puts each group mean at the mean of its units", () => {
    const [a, b, c] = intervals();

    expect([a.name, b.name, c.name]).toEqual(["A", "B", "C"]);
    expect(a.mean).toEqual({ x: 3, y: 2 });
    expect(b.mean).toEqual({ x: -2, y: -3 });
    expect(c.mean).toEqual({ x: 8, y: 8 });
    expect([a.n, b.n, c.n]).toEqual([3, 2, 1]);
    expect(a.unitIds).toEqual(["A1", "A2", "A3"]);
  });

  it("widens the interval by t_.975(n-1) * sd / sqrt(n), hand-computed", () => {
    const [a, b] = intervals();

    // Group A: sd 2, n 3, t_.975(2) = 4.302652729911275.
    //          half = 4.302652729911275 * 2 / sqrt(3) = 4.968280...
    // Compared at 8 decimals, not machine precision: the critical value is
    // bisected out of `incompleteBeta`, whose own accuracy is the floor here.
    const halfA = (4.302652729911275 * 2) / Math.sqrt(3);
    expect(halfA).toBeCloseTo(4.96828, 5);
    expect(a.ci!.x[0]).toBeCloseTo(3 - halfA, 8);
    expect(a.ci!.x[1]).toBeCloseTo(3 + halfA, 8);
    expect(a.ci!.y[0]).toBeCloseTo(2 - halfA, 8);
    expect(a.ci!.y[1]).toBeCloseTo(2 + halfA, 8);

    // Group B: n 2, t_.975(1) = 12.706204736432095. sd_x = sqrt(2) and
    //          sqrt(n) = sqrt(2), so the x half-width IS the critical value.
    expect(b.ci!.x[0]).toBeCloseTo(-2 - 12.706204736432095, 8);
    expect(b.ci!.x[1]).toBeCloseTo(-2 + 12.706204736432095, 8);
    // sd_y = sqrt(8) = 2*sqrt(2), so the y half-width is twice it.
    expect(b.ci!.y[0]).toBeCloseTo(-3 - 2 * 12.706204736432095, 8);
    expect(b.ci!.y[1]).toBeCloseTo(-3 + 2 * 12.706204736432095, 8);
  });

  it("gives a one-unit group its mean and no interval", () => {
    // A zero-width box would draw a certainty a single observation cannot have.
    expect(intervals()[2].ci).toBeNull();
  });

  it("counts a unit once however many points it contributes", () => {
    // A trajectory model emits one point per unit per conversation. Counting
    // the steps would put n = 4 on a two-participant group and halve every
    // interval; the unit is the observation.
    const steps = [
      { ENA_UNIT: "A1", cohort: "A", SVD1: 0, SVD2: 0 },
      { ENA_UNIT: "A1", cohort: "A", SVD1: 2, SVD2: 4 },
      { ENA_UNIT: "A2", cohort: "A", SVD1: 4, SVD2: 4 },
      { ENA_UNIT: "A2", cohort: "A", SVD1: 6, SVD2: 8 }
    ];
    const [a] = intervals(steps);

    expect(a.n).toBe(2);
    // Unit means are (1,2) and (5,6), so the group mean is (3,4).
    expect(a.mean).toEqual({ x: 3, y: 4 });
  });

  it("takes the comparison palette, blue/orange by default (Q3)", () => {
    const [a, b] = intervals();
    expect([a.color, b.color]).toEqual(["#218EBF", "#EF691B"]);

    const preset = enaGroupIntervals({
      points: groupPoints,
      xDimension: "SVD1",
      yDimension: "SVD2",
      groupOf: enaRowGroupValues(groupPoints, "cohort"),
      palette: ENA_COMPARISON_PALETTES["red-blue"]
    });
    expect([preset[0].color, preset[1].color]).toEqual(["#CC2222", "#2222CC"]);
  });

  it("restricts and orders the output when two groups are named", () => {
    const picked = enaGroupIntervals({
      points: groupPoints,
      xDimension: "SVD1",
      yDimension: "SVD2",
      groupOf: enaRowGroupValues(groupPoints, "cohort"),
      groups: ["C", "A"]
    });

    expect(picked.map((group) => group.name)).toEqual(["C", "A"]);
    // Colour follows the listed order, so the group named first is the group
    // drawn in the first palette entry — and in the subtraction's positive hue.
    expect(picked[0].color).toBe("#218EBF");
  });

  it("returns nothing for a column that names no groups", () => {
    expect(
      enaGroupIntervals({
        points: groupPoints,
        xDimension: "SVD1",
        yDimension: "SVD2",
        groupOf: enaRowGroupValues(groupPoints, "missing")
      })
    ).toEqual([]);
  });
});

// --- Subtraction network -----------------------------------------------------

const adjacencyKey = [
  { source: "question", target: "evidence", name: "question & evidence", sourceIndex: 0, targetIndex: 1 },
  { source: "question", target: "critique", name: "question & critique", sourceIndex: 0, targetIndex: 2 }
];

// Group A mean: (0.4 + 0.6)/2 = 0.5 and (0.1 + 0.3)/2 = 0.2.
// Group B mean: (0.2 + 0.0)/2 = 0.1 and (0.5 + 0.7)/2 = 0.6.
// So the differences are +0.4 and -0.4 — one edge of each sign, by hand.
const lineWeights = [
  { ENA_UNIT: "A1", cohort: "A", "question & evidence": 0.4, "question & critique": 0.1 },
  { ENA_UNIT: "A2", cohort: "A", "question & evidence": 0.6, "question & critique": 0.3 },
  { ENA_UNIT: "B1", cohort: "B", "question & evidence": 0.2, "question & critique": 0.5 },
  { ENA_UNIT: "B2", cohort: "B", "question & evidence": 0.0, "question & critique": 0.7 }
];

function subtraction(groups: [string, string] = ["A", "B"], minDelta = 0) {
  return enaSubtractionNetwork({
    adjacencyKey,
    lineWeights,
    groupOf: enaRowGroupValues(lineWeights, "cohort"),
    groups,
    minDelta
  });
}

describe("enaSubtractionNetwork", () => {
  it("subtracts the two groups' mean line weights, hand-computed", () => {
    const network = subtraction();

    expect(network.status).toBe("computed");
    expect(network.counts).toEqual([2, 2]);
    expect(network.edges.map((edge) => edge.name)).toEqual([
      "question & evidence",
      "question & critique"
    ]);
    expect(network.edges[0].first).toBeCloseTo(0.5, 12);
    expect(network.edges[0].second).toBeCloseTo(0.1, 12);
    expect(network.edges[0].delta).toBeCloseTo(0.4, 12);
    expect(network.edges[1].first).toBeCloseTo(0.2, 12);
    expect(network.edges[1].second).toBeCloseTo(0.6, 12);
    expect(network.edges[1].delta).toBeCloseTo(-0.4, 12);
  });

  it("negates every difference when the groups are swapped", () => {
    // The sign carries the reading ("more in A than in B"), so the order of the
    // pair has to be the only thing that decides it.
    const forward = subtraction(["A", "B"]);
    const reverse = subtraction(["B", "A"]);

    for (const [index, edge] of forward.edges.entries()) {
      expect(reverse.edges[index].delta).toBeCloseTo(-edge.delta, 12);
    }
  });

  it("drops differences at or below the minimum, like a mean network's minWeight", () => {
    expect(subtraction(["A", "B"], 0.5).edges).toEqual([]);
    expect(subtraction(["A", "B"], 0.5).status).toBe("skipped");
    expect(subtraction(["A", "B"], 0.3).edges).toHaveLength(2);
  });

  it("skips rather than invents a network when a group has no units", () => {
    const missing = subtraction(["A", "Z"]);
    expect(missing.status).toBe("skipped");
    expect(missing.counts).toEqual([2, 0]);
    expect(missing.edges).toEqual([]);
    expect(missing.warnings[0]).toContain("Z");

    const same = subtraction(["A", "A"]);
    expect(same.status).toBe("skipped");
    expect(same.warnings[0]).toContain("two different groups");
  });
});

// --- Rendering ---------------------------------------------------------------

const network = {
  nodes: [
    { id: "question", label: "question", x: -1, y: 1 },
    { id: "evidence", label: "evidence", x: 1, y: 1 },
    { id: "critique", label: "critique", x: 0, y: -1 }
  ],
  edges: [
    { source: "question", target: "evidence", weight: 0.5, name: "question & evidence" },
    { source: "question", target: "critique", weight: 0.2, name: "question & critique" }
  ]
};

const plotModel: ENAPlotModel = {
  title: "Comparison fixture",
  dimensions: ["SVD1", "SVD2"],
  axes: { x: { title: "SVD1", range: [-10, 10] }, y: { title: "SVD2", range: [-10, 10] } },
  palette: ["#18b7c9", "#7b50f5", "#e850d2"],
  traces: [
    { type: "network", name: "Mean network", color: "#18b7c9", network },
    {
      type: "points",
      name: "Units",
      color: "#e850d2",
      points: groupPoints.map((row) => ({ x: row.SVD1, y: row.SVD2, label: String(row.ENA_UNIT) }))
    }
  ]
};

/** The parity recipe: strip every `<g data-sena-layer>` subtree, depth-aware. */
function stripSenaLayers(markup: string) {
  let output = "";
  let index = 0;

  while (index < markup.length) {
    const start = markup.indexOf("<g data-sena-layer=", index);
    if (start === -1) {
      output += markup.slice(index);
      break;
    }
    output += markup.slice(index, start);

    let cursor = start;
    let depth = 0;
    while (cursor < markup.length) {
      const open = markup.indexOf("<g", cursor);
      const close = markup.indexOf("</g>", cursor);
      if (close === -1) break;
      if (open !== -1 && open < close) {
        depth += 1;
        cursor = open + 2;
        continue;
      }
      depth -= 1;
      cursor = close + 4;
      if (depth === 0) break;
    }
    index = cursor;
  }

  return output;
}

function attributes(markup: string, attribute: string) {
  return [...markup.matchAll(new RegExp(`${attribute}="([^"]*)"`, "g"))].map((match) => match[1]);
}

/** The one `<line>` element carrying this sign, opening tag through its title. */
function signedLine(markup: string, sign: "positive" | "negative") {
  return markup.match(new RegExp(`<line[^>]*data-edge-sign="${sign}"[^>]*>.*?</line>`))?.[0] ?? "";
}

function strokeOf(element: string) {
  return element.match(/ stroke="([^"]*)"/)?.[1] ?? "";
}

function channels(hex: string) {
  const value = parseInt(hex.replace("#", ""), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

/**
 * The palette entry after the weak-edge desaturation the renderer applies to
 * every network edge, read back from the intensity the element itself printed.
 */
function desaturatedAt(element: string, base: string) {
  const intensity = Number(element.match(/data-edge-intensity="([^"]*)"/)?.[1] ?? "0");
  return desaturate(base, 0.35 + 0.65 * intensity);
}

describe("EnaPlot draws comparison groups in marked layers only", () => {
  const plain = renderToStaticMarkup(<EnaPlot model={plotModel} />);
  const withGroups = renderToStaticMarkup(
    <EnaPlot model={plotModel} overlay={{ groups: intervals() }} />
  );

  it("changes nothing at all when no groups are passed", () => {
    // The absent input has to be the absent output, byte for byte — this is the
    // property the ENA Space and Fusion parity suites depend on.
    expect(renderToStaticMarkup(<EnaPlot model={plotModel} overlay={{}} />)).toBe(plain);
    expect(renderToStaticMarkup(<EnaPlot model={plotModel} overlay={{ groups: [] }} />)).toBe(plain);
  });

  it("reduces to the plain plot when the SENA layers are stripped", () => {
    expect(withGroups).toContain('<g data-sena-layer="group-mean">');
    expect(withGroups).toContain('<g data-sena-layer="group-ci">');
    expect(stripSenaLayers(withGroups)).toBe(stripSenaLayers(plain));
  });

  it("draws the interval box at the projection of its own data coordinates", () => {
    const [a] = intervals();
    const [x1, y1] = projectPoint(plotModel, { x: a.ci!.x[0], y: a.ci!.y[0] });
    const [x2, y2] = projectPoint(plotModel, { x: a.ci!.x[1], y: a.ci!.y[1] });
    const layer = withGroups.slice(withGroups.indexOf('<g data-sena-layer="group-ci">'));
    const box = layer.slice(0, layer.indexOf("</g>"));

    // The renderer owns the projection: a comparison surface hands over data
    // coordinates and the box must land exactly where those project to.
    expect(box).toContain(`x="${Math.min(x1, x2)}"`);
    expect(box).toContain(`y="${Math.min(y1, y2)}"`);
    expect(box).toContain(`width="${Math.abs(x2 - x1)}"`);
    expect(box).toContain(`height="${Math.abs(y2 - y1)}"`);
    // y inverts under projection, so a naive lo->hi rect would have negative
    // height; the min/max is what keeps the box a box.
    expect(Math.abs(y2 - y1)).toBeGreaterThan(0);
  });

  it("marks the mean, its n, and whether it has an interval", () => {
    expect(attributes(withGroups, "data-sena-group-mean")).toEqual(["A", "B", "C"]);
    expect(attributes(withGroups, "data-sena-group-n")).toEqual(["3", "2", "1"]);
    expect(attributes(withGroups, "data-sena-group-interval")).toEqual(["true", "true", "false"]);
    // The one-unit group gets a mean marker and no box.
    expect(attributes(withGroups, "data-sena-group-ci")).toEqual(["A", "B"]);
  });
});

describe("EnaPlot inks a subtracted network in rENA's two colours", () => {
  const subtracted = withEnaSubtractionNetwork(plotModel, subtraction());
  const plainMarkup = renderToStaticMarkup(<EnaPlot model={plotModel} />);

  it("leaves the network alone with signed mode off — the default", () => {
    // plot-parity pins the renderer wholesale; this states the same guarantee
    // from the comparison side, where the signed path is one prop away.
    expect(renderToStaticMarkup(<EnaPlot model={subtracted} />)).not.toContain("data-edge-sign");
    expect(plainMarkup).not.toContain("data-edge-sign");
  });

  it("colours positive differences with group A and negative with group B", () => {
    const markup = renderToStaticMarkup(
      <EnaPlot model={subtracted} signedNetwork={{ positive: "#218EBF", negative: "#EF691B" }} />
    );
    const positive = signedLine(markup, "positive");
    const negative = signedLine(markup, "negative");

    // The signed edge is the one the subtraction called positive: "question &
    // evidence" is +0.4 in A, "question & critique" is -0.4.
    expect(positive).toContain("question &amp; evidence");
    expect(negative).toContain("question &amp; critique");
    // The stroke is its palette entry put through the same weak-edge
    // desaturation every network edge gets, so the assertion is about which
    // base colour the sign chose and nothing else.
    expect(positive).toContain(`stroke="${desaturatedAt(positive, "#218EBF")}"`);
    expect(negative).toContain(`stroke="${desaturatedAt(negative, "#EF691B")}"`);
    // And the two ends of the palette are genuinely apart: blue-dominant
    // against red-dominant, which is what a reader is asked to tell apart.
    expect(channels(strokeOf(positive)).b).toBeGreaterThan(channels(strokeOf(positive)).r);
    expect(channels(strokeOf(negative)).r).toBeGreaterThan(channels(strokeOf(negative)).b);
  });

  it("names the trace after the subtraction it draws", () => {
    expect(enaSubtractionTraceName(["A", "B"])).toBe("A − B");
    expect(subtracted.traces[0].name).toBe("A − B");
    expect(renderToStaticMarkup(<EnaPlot model={subtracted} />)).toContain('data-trace-name="A − B"');
  });

  it("amplifies a small difference by the multiplier and nothing else", () => {
    const single = renderToStaticMarkup(
      <EnaPlot model={subtracted} signedNetwork={{ positive: "#218EBF", negative: "#EF691B" }} />
    );
    const tripled = renderToStaticMarkup(
      <EnaPlot
        model={subtracted}
        signedNetwork={{ positive: "#218EBF", negative: "#EF691B", multiplier: 3 }}
      />
    );
    const widths = (markup: string) =>
      attributes(markup, "data-edge-visual-width").map(Number).sort((left, right) => left - right);

    expect(widths(tripled)).toEqual(widths(single).map((width) => Number((width * 3).toFixed(2))));
    // Opacity encodes |delta| and must not move with the width control.
    expect(attributes(tripled, "data-edge-intensity")).toEqual(
      attributes(single, "data-edge-intensity")
    );
  });

  it("keeps the subtracted network's nodes where the model put them", () => {
    // rENA subtracts edges, not positions: re-deriving node positions from a
    // difference would place codes where neither group's model places them.
    expect(subtracted.traces[0].network!.nodes).toEqual(network.nodes);
  });
});
