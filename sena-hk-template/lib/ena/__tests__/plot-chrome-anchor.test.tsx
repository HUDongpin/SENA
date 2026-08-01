import type { ENAPlotModel } from "jena-js/plot";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EnaPlot, clampPlotZoom } from "../../../components/ena/EnaPlot";
import { jenaPlotGeometry } from "../plot-encoding";

// Zoom shrinks the viewBox around the plot centre, so anything placed at fixed
// canvas coordinates leaves the frame as soon as the researcher zooms in — the
// legend and the low-rank badge both did, from about 1.05x up. Plot chrome is
// read *against* the visible box, not against the 720x520 paper, so both are
// anchored to the visible box and counter-scaled to hold one apparent size.
//
// The badge's own zoom coverage lives with the disclosure it belongs to, in
// lib/sena/__tests__/ena-low-rank.test.tsx; this suite pins the legend and the
// rule they share.

/** Every zoom the plot offers, including both clamp ends and both sides of 1x. */
const ZOOM_LEVELS = [0.6, 0.8, 1, 1.05, 2, 4];

/**
 * The frame chrome has to stay inside: the visible box, *and* the paper the
 * plot draws on. They differ below 1x, where the viewBox grows past the card
 * and the visible box alone would happily accept a legend floating in the
 * gutter beside it.
 */
function chromeFrame(view: { left: number; top: number; right: number; bottom: number }) {
  return {
    left: Math.max(view.left, 0),
    top: Math.max(view.top, 0),
    right: Math.min(view.right, jenaPlotGeometry.width),
    bottom: Math.min(view.bottom, jenaPlotGeometry.height)
  };
}

const model: ENAPlotModel = {
  title: "ENA projection",
  dimensions: ["SVD1", "SVD2"],
  axes: {
    x: { title: "SVD1", range: [-1, 1] },
    y: { title: "SVD2", range: [-1, 1] }
  },
  palette: ["#18b7c9", "#7b50f5", "#e850d2"],
  traces: [
    {
      type: "network",
      name: "Mean network",
      color: "#18b7c9",
      network: {
        nodes: [
          { id: "C1", label: "Code 1", x: -0.5, y: 0.4 },
          { id: "C2", label: "Code 2", x: 0.6, y: -0.3 }
        ],
        edges: [{ source: "C1", target: "C2", weight: 0.4, name: "C1 & C2" }]
      }
    },
    {
      type: "points",
      name: "Units",
      color: "#e850d2",
      points: [
        { x: -0.2, y: 0.1, label: "P1" },
        { x: 0.3, y: -0.2, label: "P2" }
      ]
    }
  ]
};

/** The box the SVG is showing, and the legend plate drawn into it. */
function legendAndViewBox(markup: string) {
  const viewBox = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(markup);
  const legend =
    /<g data-sena-layer="legend" transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)">.*?<rect[^>]*width="([\d.]+)" height="([\d.]+)"/.exec(
      markup
    );

  expect(viewBox, "expected a viewBox on the plot").not.toBeNull();
  expect(legend, "expected a transformed legend plate").not.toBeNull();
  if (!viewBox || !legend) throw new Error("unreadable plot markup");

  const scale = Number(legend[3]);
  const left = Number(legend[1]);
  const top = Number(legend[2]);

  return {
    view: {
      left: Number(viewBox[1]),
      top: Number(viewBox[2]),
      right: Number(viewBox[1]) + Number(viewBox[3]),
      bottom: Number(viewBox[2]) + Number(viewBox[4])
    },
    legend: {
      left,
      top,
      right: left + Number(legend[4]) * scale,
      bottom: top + Number(legend[5]) * scale,
      scale,
      /** Unscaled plate size — what the zoom compensation is applied to. */
      drawnWidth: Number(legend[4]),
      drawnHeight: Number(legend[5])
    }
  };
}

describe("ENA plot chrome stays legible at every zoom", () => {
  it("keeps the legend inside the visible box across the whole zoom range", () => {
    for (const zoom of ZOOM_LEVELS) {
      const { view, legend } = legendAndViewBox(renderToStaticMarkup(<EnaPlot model={model} zoom={zoom} />));
      const frame = chromeFrame(view);

      expect(legend.left, `zoom ${zoom} left edge`).toBeGreaterThanOrEqual(frame.left);
      expect(legend.top, `zoom ${zoom} top edge`).toBeGreaterThanOrEqual(frame.top);
      expect(legend.right, `zoom ${zoom} right edge`).toBeLessThanOrEqual(frame.right);
      expect(legend.bottom, `zoom ${zoom} bottom edge`).toBeLessThanOrEqual(frame.bottom);
    }
  });

  // Below 1x the viewBox is *larger* than the card, so visible-box containment
  // is satisfied by an anchor that has walked off the paper into the gutter.
  // Only the clamp keeps the legend on the plate a reader is looking at.
  it("keeps the legend on the paper when zooming out widens the box past it", () => {
    for (const zoom of [0.6, 0.8]) {
      const { view, legend } = legendAndViewBox(renderToStaticMarkup(<EnaPlot model={model} zoom={zoom} />));

      expect(view.left, `zoom ${zoom} shows more than the card`).toBeLessThan(0);
      expect(view.bottom, `zoom ${zoom} shows more than the card`).toBeGreaterThan(jenaPlotGeometry.height);
      expect(legend.left, `zoom ${zoom} left edge`).toBeGreaterThanOrEqual(0);
      expect(legend.top, `zoom ${zoom} top edge`).toBeGreaterThanOrEqual(0);
      expect(legend.right, `zoom ${zoom} right edge`).toBeLessThanOrEqual(jenaPlotGeometry.width);
      expect(legend.bottom, `zoom ${zoom} bottom edge`).toBeLessThanOrEqual(jenaPlotGeometry.height);
    }
  });

  it("holds the legend at one apparent size instead of magnifying it", () => {
    for (const zoom of ZOOM_LEVELS) {
      const { legend } = legendAndViewBox(renderToStaticMarkup(<EnaPlot model={model} zoom={zoom} />));

      // Canvas units times the zoom that draws them is what the reader sees.
      expect(legend.drawnWidth * legend.scale * zoom).toBeCloseTo(legend.drawnWidth, 1);
      expect(legend.drawnHeight * legend.scale * zoom).toBeCloseTo(legend.drawnHeight, 1);
    }
  });

  it("leaves the unzoomed plot's legend where webENA puts it", () => {
    // 1x has to be untouched: the lower-left placement is the grammar, and only
    // the coordinate space it is expressed in changed.
    const { legend } = legendAndViewBox(renderToStaticMarkup(<EnaPlot model={model} />));

    expect(legend.scale).toBe(1);
    expect(legend.left).toBe(44);
    expect(legend.bottom).toBe(520 - 44 - 6);
  });

  it("anchors against a box no wider than the clamp allows", () => {
    // The anchor is only sound because zoom is clamped before it is used; an
    // unclamped 12x would put the chrome outside any box the plot draws.
    expect(clampPlotZoom(12)).toBe(4);
    expect(clampPlotZoom(0.1)).toBe(0.6);
    expect(Math.max(...ZOOM_LEVELS)).toBe(clampPlotZoom(12));
    expect(Math.min(...ZOOM_LEVELS)).toBe(clampPlotZoom(0.1));
  });
});
