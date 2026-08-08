import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EnaPlot } from "../../../components/ena/EnaPlot";
import {
  FUSION_PLANE_SLOT,
  FUSION_PLANE_TITLE,
  FusionPlaneOrbitPlot
} from "../../../components/sena/workspace/fusion-plane-orbit";
import { styleRenaNetwork } from "../../ena/plot-encoding";
import { buildSenaEnaManifest } from "../ena-manifest";
import { buildSenaEnaPlotComposition } from "../ena-plot-model";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import type { SenaLayer } from "../types";

// ADR 0009 extends ADR 0008's rule into Fusion: the plane is <EnaPlot> itself,
// nested, so its geometry and ink are rENA's through the one shared renderer.
// This suite pins that the way ena-space-plot-parity.test.tsx pins ENA Space —
// strip every data-sena-layer subtree from the nested plane and what is left
// must be, byte for byte, the plot /workspace/ena draws for the same model.
// Anything the fusion surface adds inside the plane and forgets to mark fails
// here rather than quietly giving Fusion a second ENA grammar.

const model = buildSenaModel(lessonStudySenaContract);
const enaManifest = buildSenaEnaManifest(lessonStudySenaContract);
const composition = buildSenaEnaPlotComposition(enaManifest, model.people, model.codes, {
  title: FUSION_PLANE_TITLE
});

const focusLayers: Record<SenaLayer, boolean> = { social: true, concept: true, bridge: false };
const allBridgeLayers: Record<SenaLayer, boolean> = { social: true, concept: true, bridge: true };
const selectedPersonId = model.people[0]?.id ?? "";

/**
 * Remove every `<g data-sena-layer="...">` subtree, tracking `<g>` depth so a
 * nested group cannot terminate its parent early. Copied verbatim from
 * ena-space-plot-parity.test.tsx:35–67 — the same recipe, applied one viewport
 * deeper. Kept as a copy so neither suite can be weakened by editing the other.
 */
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

/** Parity is a claim about the plot, not about the box it is sized into. */
function svgOnly(markup: string) {
  const start = markup.indexOf("<svg");
  const end = markup.lastIndexOf("</svg>") + "</svg>".length;
  return markup.slice(start, end);
}

/**
 * The nested plane, and only it: the fusion surface's own `<svg>` is not the
 * plot, so `svgOnly` would hand back the orbit's coordinate space as well.
 * Walks `<svg>` depth from the element that carries the plot's testid.
 */
function nestedPlaneOnly(markup: string) {
  const marker = markup.indexOf('data-testid="ena-plot"');
  if (marker === -1) return "";
  const start = markup.lastIndexOf("<svg", marker);

  let cursor = start;
  let depth = 0;
  while (cursor < markup.length) {
    const open = markup.indexOf("<svg", cursor);
    const close = markup.indexOf("</svg>", cursor);
    if (close === -1) break;
    if (open !== -1 && open < close) {
      depth += 1;
      cursor = open + 4;
      continue;
    }
    depth -= 1;
    cursor = close + "</svg>".length;
    if (depth === 0) break;
  }

  return markup.slice(start, cursor);
}

function renderBasePlane(zoom = 1) {
  return svgOnly(
    renderToStaticMarkup(
      <EnaPlot
        model={composition.model!}
        variance={composition.variance}
        x={FUSION_PLANE_SLOT.x}
        y={FUSION_PLANE_SLOT.y}
        width={FUSION_PLANE_SLOT.width}
        height={FUSION_PLANE_SLOT.height}
        className=""
        zoom={zoom}
      />
    )
  );
}

function renderFusionPlane({
  selectedId = "",
  layers = focusLayers,
  zoom = 1
}: { selectedId?: string; layers?: Record<SenaLayer, boolean>; zoom?: number } = {}) {
  return renderToStaticMarkup(
    <FusionPlaneOrbitPlot
      model={model}
      enaManifest={enaManifest}
      layers={layers}
      threshold={0}
      selectedId={selectedId}
      revealedLabelIds={[]}
      onSelect={() => undefined}
      zoom={zoom}
    />
  );
}

function overlayAttributeValues(markup: string, attribute: string) {
  return [...markup.matchAll(new RegExp(`${attribute}="([^"]+)"`, "g"))].map((match) => Number(match[1]));
}

/** The cap EnaPlot applies to overlay ink: the median drawn network width. */
function medianNetworkWidth() {
  const network = composition.model!.traces.find((trace) => trace.type === "network")!.network!;
  const widths = styleRenaNetwork(composition.model!, network, "#386CB0")
    .edges.map((edge) => edge.strokeWidth)
    .sort((left, right) => left - right);
  const middle = Math.floor(widths.length / 2);
  return widths.length % 2 === 0 ? (widths[middle - 1] + widths[middle]) / 2 : widths[middle];
}

describe("Fusion renders the canonical ENA plot as its plane", () => {
  it("nests the shared renderer at the plane slot rather than re-drawing it", () => {
    const markup = renderFusionPlane();
    const plane = nestedPlaneOnly(markup);

    expect(markup).toContain('data-testid="sena-fusion-plane-orbit"');
    expect(plane).toContain('data-testid="ena-plot"');
    expect(plane).toContain(`x="${FUSION_PLANE_SLOT.x}"`);
    expect(plane).toContain(`y="${FUSION_PLANE_SLOT.y}"`);
    expect(plane).toContain(`width="${FUSION_PLANE_SLOT.width}"`);
    expect(plane).toContain(`height="${FUSION_PLANE_SLOT.height}"`);
  });

  // The load-bearing assertion, and the reason this file exists.
  it("reduces to a plain ENA plot when the SENA layers are stripped", () => {
    const base = stripSenaLayers(renderBasePlane());
    const focused = stripSenaLayers(nestedPlaneOnly(renderFusionPlane()));
    const selected = stripSenaLayers(
      nestedPlaneOnly(renderFusionPlane({ selectedId: selectedPersonId }))
    );
    const allBridges = stripSenaLayers(
      nestedPlaneOnly(renderFusionPlane({ selectedId: selectedPersonId, layers: allBridgeLayers }))
    );

    expect(base.length).toBeGreaterThan(0);
    expect(focused).toBe(base);
    expect(selected).toBe(base);
    expect(allBridges).toBe(base);
  });

  it("keeps parity while the plot is zoomed, because EnaPlot owns the zoom", () => {
    // The surface's own viewBox does not zoom-window: EnaPlot's legend and
    // low-rank badge counter-scale against their own viewBox, so a second zoom
    // owner would drift the plot's chrome off its own paper.
    const base = stripSenaLayers(renderBasePlane(1.75));
    const zoomed = stripSenaLayers(nestedPlaneOnly(renderFusionPlane({ zoom: 1.75 })));

    expect(zoomed).toBe(base);
    expect(zoomed).toContain('data-plot-zoom="1.750"');
  });

  it("strips nothing from a plot that has no SENA layers to strip", () => {
    // Guards the stripper: if it silently ate base markup, the assertions above
    // would pass for the wrong reason.
    const stripped = stripSenaLayers(renderBasePlane());

    expect(stripped).toContain('data-plot-role="network-node"');
    expect(stripped).toContain('data-plot-role="axes"');
    expect(stripped).toContain('data-plot-role="title"');
    expect(stripped).not.toContain("data-sena-layer");
  });

  it("draws bridges only inside marked layers, and never a fusion person hexagon", () => {
    const plane = nestedPlaneOnly(renderFusionPlane({ selectedId: selectedPersonId }));

    // Bridges are actually drawn — otherwise the parity assertion above would
    // hold vacuously, with nothing to strip.
    expect(plane).toContain('data-sena-layer="overlay-edges"');
    expect(plane).toContain('data-overlay-kind="bridge"');
    expect(stripSenaLayers(plane)).not.toContain("data-overlay-kind");

    // The plane is projected space: the A1 person glyph has no place in it.
    expect(plane).not.toContain('data-visual-role="sna-person-hex-node"');
    expect(plane).not.toContain('data-visual-role="ena-concept-circle-node"');
  });

  it("never draws social ties in the plane", () => {
    // ADR 0009: a person-person tie between two projected unit points traces no
    // meaningful path, so S lives on the orbit and nowhere else.
    const plane = nestedPlaneOnly(
      renderFusionPlane({ selectedId: selectedPersonId, layers: allBridgeLayers })
    );

    expect(plane).not.toContain('data-overlay-kind="social"');
  });

  it("focuses bridges on the selection until the B layer is explicitly on", () => {
    const idle = nestedPlaneOnly(renderFusionPlane());
    const focused = nestedPlaneOnly(renderFusionPlane({ selectedId: selectedPersonId }));
    const all = nestedPlaneOnly(
      renderFusionPlane({ selectedId: selectedPersonId, layers: allBridgeLayers })
    );

    const bridgeCount = (markup: string) => markup.split('data-overlay-kind="bridge"').length - 1;
    const selectedBridges = model.edges.filter(
      (edge) =>
        edge.layer === "bridge" && (edge.source === selectedPersonId || edge.target === selectedPersonId)
    ).length;

    expect(bridgeCount(idle)).toBe(0);
    expect(selectedBridges).toBeGreaterThan(0);
    expect(bridgeCount(focused)).toBe(selectedBridges);
    expect(bridgeCount(all)).toBeGreaterThan(bridgeCount(focused));
  });

  it("keeps bridge ink under the network's, at the median width and 0.5 opacity", () => {
    const plane = nestedPlaneOnly(
      renderFusionPlane({ selectedId: selectedPersonId, layers: allBridgeLayers })
    );
    const overlayLayer = plane.slice(plane.indexOf('<g data-sena-layer="overlay-edges">'));
    const cap = medianNetworkWidth();
    const widths = overlayAttributeValues(overlayLayer, "data-overlay-visual-width");
    const opacities = overlayAttributeValues(
      overlayLayer.slice(0, overlayLayer.indexOf("</g>")),
      "opacity"
    );

    expect(widths.length).toBeGreaterThan(0);
    expect(opacities.length).toBe(widths.length);
    // The attribute is the drawn width rounded to two decimals, so the cap is
    // read with half a printed digit of slack rather than machine epsilon.
    for (const width of widths) expect(width).toBeLessThanOrEqual(cap + 0.005);
    for (const opacity of opacities) expect(opacity).toBeLessThanOrEqual(0.5);
  });

  it("mounts the orbit outside the plane, under it, and the unit leader over it", () => {
    // ADR 0009's z-order argument in one assertion. The orbit is explanatory
    // and paints first; the plane is measured and paints over it; the leader
    // that joins a hexagon to its unit point paints last, in the outer space,
    // because a nested viewport would clip a line that crosses its edge.
    const markup = renderFusionPlane({ selectedId: selectedPersonId });
    const plane = nestedPlaneOnly(markup);

    const orbitAt = markup.indexOf('data-testid="sena-fusion-orbit-layer"');
    const planeAt = markup.indexOf('data-testid="ena-plot"');
    const linkAt = markup.indexOf('data-testid="sena-fusion-unit-link"');

    expect(orbitAt).toBeGreaterThan(-1);
    expect(orbitAt).toBeLessThan(planeAt);
    expect(planeAt).toBeLessThan(linkAt);

    // And none of the orbit's ink is inside the plot it rings.
    expect(plane).not.toContain("sena-fusion-orbit-layer");
    expect(plane).not.toContain('data-visual-role="orbit-social-lane"');
    expect(plane).not.toContain("unit-link");
  });

  it("draws the unit leader only when it has a person and a visible unit point", () => {
    expect(renderFusionPlane()).not.toContain('data-testid="sena-fusion-unit-link"');
    expect(renderFusionPlane({ selectedId: selectedPersonId })).toContain(
      'data-testid="sena-fusion-unit-link"'
    );
    // Selecting an edge is not selecting a person.
    expect(renderFusionPlane({ selectedId: model.edges[0].id })).not.toContain(
      'data-testid="sena-fusion-unit-link"'
    );
    // Under zoom the leader tracks the plot rather than the slot: the pilot's
    // units all stay inside the zoom window, so the leader stays drawn — and
    // its far end stays on the plane, which is the claim that matters. (The
    // clipped case is a pure-function law, pinned in
    // fusion-plane-orbit-geometry.test.ts where a point can be placed by hand.)
    const leaderEnd = (markup: string) => {
      const leader = markup.slice(markup.indexOf('data-testid="sena-fusion-unit-link"'));
      return {
        x: Number(/x2="([-\d.]+)"/.exec(leader)?.[1]),
        y: Number(/y2="([-\d.]+)"/.exec(leader)?.[1])
      };
    };
    const idle = leaderEnd(renderFusionPlane({ selectedId: selectedPersonId }));
    const zoomed = leaderEnd(renderFusionPlane({ selectedId: selectedPersonId, zoom: 4 }));

    expect(zoomed.x).toBeGreaterThanOrEqual(FUSION_PLANE_SLOT.x);
    expect(zoomed.x).toBeLessThanOrEqual(FUSION_PLANE_SLOT.x + FUSION_PLANE_SLOT.width);
    expect(zoomed.y).toBeGreaterThanOrEqual(FUSION_PLANE_SLOT.y);
    expect(zoomed.y).toBeLessThanOrEqual(FUSION_PLANE_SLOT.y + FUSION_PLANE_SLOT.height);
    // …and it moved, because the point it names moved.
    expect(zoomed.x).not.toBeCloseTo(idle.x, 3);
  });

  it("lets the S toggle drop the orbit's ties without dropping its people", () => {
    const withTies = renderFusionPlane({ selectedId: selectedPersonId });
    const withoutTies = renderFusionPlane({
      selectedId: selectedPersonId,
      layers: { social: false, concept: true, bridge: false }
    });

    expect(withTies).toContain('data-visual-role="orbit-social-lane"');
    expect(withoutTies).not.toContain('data-visual-role="orbit-social-lane"');
    expect(withoutTies).not.toContain('data-visual-role="orbit-social-arrowhead"');
    expect(withoutTies).toContain('data-visual-role="sna-person-hex-node"');
    // Turning a layer off must not disturb the measured plot underneath it.
    expect(stripSenaLayers(nestedPlaneOnly(withoutTies))).toBe(stripSenaLayers(renderBasePlane()));
  });

  it("states the model definition and its goodness of fit on the figure", () => {
    const markup = renderFusionPlane();
    const plane = nestedPlaneOnly(markup);
    const fit = enaManifest.outputs?.goodnessOfFit ?? [];

    expect(markup).toContain('<g data-sena-layer="model-footer">');
    expect(markup).toContain('data-sena-footer-row="model-definition"');
    expect(markup).toContain("Units personId");
    expect(markup).toContain("Conversation unitId, stanzaId");
    expect(markup).toContain("Window MovingStanzaWindow (back 2, forward 0)");
    expect(markup).toContain("Rotation EndPoint, binary, undirected nodes, 2D");

    // Co-registration needs a live ENASet, so the manifest carries it (jena-js
    // enaCorrelations) and the footer reads it back.
    expect(fit.length).toBeGreaterThan(0);
    for (const row of fit) {
      expect(Number.isFinite(row.pearson)).toBe(true);
      expect(Number.isFinite(row.spearman)).toBe(true);
    }
    expect(markup).toContain(`Co-registration ${fit[0].dimension} r ${fit[0].pearson.toFixed(3)}`);

    // The footer is the surface's caption, not part of the plot it captions.
    expect(plane).not.toContain("model-footer");
  });
});
