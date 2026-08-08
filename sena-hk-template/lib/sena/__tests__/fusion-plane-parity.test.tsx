import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EnaPlot } from "../../../components/ena/EnaPlot";
import {
  FUSION_PLANE_SLOT,
  FUSION_PLANE_TITLE,
  FusionPlaneOrbitPlot,
  PLANE_UNAVAILABLE_MESSAGE
} from "../../../components/sena/workspace/fusion-plane-orbit";
import { styleRenaNetwork } from "../../ena/plot-encoding";
import { buildSenaEnaManifest } from "../ena-manifest";
import { buildSenaEnaOverlayWidths } from "../ena-overlay";
import { buildSenaEnaPlotComposition } from "../ena-plot-model";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import type { SenaLayer } from "../types";
import {
  buildAbsoluteEdgeStrokeScale,
  buildConceptPairContributionMap,
  readableEdgeStrokeWidth,
  senaEdgeStrokeRanges,
  senaOrbitSocialStrokeRange
} from "../visual-encoding";

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

/**
 * The plot `/workspace/ena` actually draws: no viewport props at all. The
 * baseline above is the *slotted* render, which shares the viewport-prop code
 * path with the nested plane — convenient for a byte-compare, but it means any
 * future EnaPlot change conditional on those props would drift both sides of
 * every parity assertion identically and stay green. This is the other side of
 * that boundary.
 */
function renderPlainPlane(zoom = 1) {
  return svgOnly(
    renderToStaticMarkup(
      <EnaPlot
        model={composition.model!}
        variance={composition.variance}
        className=""
        zoom={zoom}
      />
    )
  );
}

/** Drops exactly the four viewport attributes, wherever React ordered them. */
function stripViewportAttributes(markup: string) {
  return markup.replace(
    /^<svg[^>]*>/,
    (tag) => tag.replace(/\s(?:x|y|width|height)="[^"]*"/g, "")
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

  it("pins the baseline itself to the plain plot /workspace/ena draws", () => {
    // ADR 0009's enforcement clause names "a plain <EnaPlot model variance>
    // render", but the baseline every assertion here compares against is the
    // slotted one. That made the whole suite blind to a viewport-prop-
    // conditional change in EnaPlot: both sides would drift together and
    // plot-parity / ena-space-plot-parity never pass viewport props at all, so
    // nothing crossed the boundary the ADR's claim actually spans. One
    // assertion closes it — the slot may change the root tag's x/y/width/height
    // and nothing else.
    for (const zoom of [1, 1.75]) {
      const slotted = stripViewportAttributes(renderBasePlane(zoom));
      const plain = stripViewportAttributes(renderPlainPlane(zoom));

      expect(plain.length).toBeGreaterThan(0);
      expect(slotted).toBe(plain);
    }

    // …and the stripper is not passing them by erasing everything: the slot's
    // numbers are on the root tag before it runs and gone after, while the
    // plain render never had them and the body of both survives untouched.
    const rootTag = (markup: string) => /^<svg[^>]*>/.exec(markup)?.[0] ?? "";
    const slottedRaw = renderBasePlane();

    expect(rootTag(slottedRaw)).toContain(`x="${FUSION_PLANE_SLOT.x}"`);
    expect(rootTag(slottedRaw)).toContain(`y="${FUSION_PLANE_SLOT.y}"`);
    expect(rootTag(stripViewportAttributes(slottedRaw))).not.toMatch(/\s(?:x|y|width|height)="/);
    expect(rootTag(renderPlainPlane())).not.toMatch(/\s(?:x|y|width|height)="/);
    expect(stripViewportAttributes(slottedRaw)).toContain('data-plot-role="network-node"');
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

  it("keeps a clicked bridge — and its person's siblings — on the plane", () => {
    // Overlay lines are clickable and report the EDGE id, which for a bridge is
    // `bridge:<person>:<code>` and is never one of its own endpoints. Matching
    // that id against source/target emptied the focus filter the moment a
    // reader clicked a bridge to inspect it: the clicked line and every sibling
    // vanished while the Inspector opened for the very edge that was no longer
    // drawn, and EnaPlot's selected-edge highlight became unreachable code.
    const personBridges = model.edges.filter(
      (edge) =>
        edge.layer === "bridge" && (edge.source === selectedPersonId || edge.target === selectedPersonId)
    );
    const clicked = personBridges[0];
    const bridgeCount = (markup: string) => markup.split('data-overlay-kind="bridge"').length - 1;

    expect(personBridges.length).toBeGreaterThan(1);

    const afterClick = nestedPlaneOnly(renderFusionPlane({ selectedId: clicked.id }));

    // The clicked line itself is still there… (its <title> is the label, with
    // the arrow HTML-escaped by the serializer).
    expect(afterClick).toContain(`${clicked.label.replace(/>/g, "&gt;")}:`);
    // …and so are the rest of that person's bridges, which are its context.
    expect(bridgeCount(afterClick)).toBe(personBridges.length);
    // Same picture as selecting the person, because an edge selection resolves
    // to its person end rather than to nothing.
    expect(bridgeCount(afterClick)).toBe(
      bridgeCount(nestedPlaneOnly(renderFusionPlane({ selectedId: selectedPersonId })))
    );
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

  it("reports the width it drew for a bridge, not a band nothing on screen uses", () => {
    // The inspector's line-weight provenance exists so the panel cannot state a
    // width no line has. It was fixed for the orbit's social lanes only: on this
    // surface bridges are drawn by the nested plot's overlay channel, capped at
    // the median rENA network width, so the A1 fallback band reported 10.8px
    // for the pilot's strongest bridge while the line was 2.45px — 4.4x out,
    // two clicks from a fresh load.
    const plane = nestedPlaneOnly(
      renderFusionPlane({ selectedId: selectedPersonId, layers: allBridgeLayers })
    );

    // Drawn widths, straight off the rendered lines, keyed by the escaped label
    // each line's <title> carries.
    const drawn = new Map<string, number>();
    for (const chunk of plane.split("<line ").slice(1)) {
      const width = /data-overlay-visual-width="([\d.]+)"/.exec(chunk)?.[1];
      const label = /<title>([^<:]*):/.exec(chunk)?.[1];
      if (width && label) drawn.set(label, Number(width));
    }
    expect(drawn.size).toBeGreaterThan(0);

    const contributions = buildConceptPairContributionMap(model);
    const overlayWidths = buildSenaEnaOverlayWidths({
      edges: model.edges,
      composition,
      threshold: 0,
      kinds: [{ layer: "bridge", kind: "bridge", enabled: true }]
    });
    const shellScale = buildAbsoluteEdgeStrokeScale(
      model.edges,
      contributions,
      { social: senaOrbitSocialStrokeRange },
      overlayWidths
    );
    const bandOnlyScale = buildAbsoluteEdgeStrokeScale(model.edges, contributions, {
      social: senaOrbitSocialStrokeRange
    });

    let compared = 0;
    for (const edge of model.edges.filter((candidate) => candidate.layer === "bridge")) {
      const drawnWidth = drawn.get(edge.label.replace(/>/g, "&gt;"));
      if (drawnWidth === undefined) continue;
      compared += 1;
      expect([edge.id, readableEdgeStrokeWidth(edge, shellScale)]).toEqual([edge.id, drawnWidth]);
      // …and the band the fallback would have used is genuinely a different
      // number, so the assertion above is not passing by coincidence.
      // …every one of them by a wide margin, upward: the whole drawn band sits
      // under the A1 fallback's, so there is no crossover where the two agree.
      expect(readableEdgeStrokeWidth(edge, bandOnlyScale)).toBeGreaterThan(drawnWidth * 1.5);
      expect(readableEdgeStrokeWidth(edge, bandOnlyScale)).toBeGreaterThanOrEqual(
        senaEdgeStrokeRanges.bridge.min
      );
    }
    expect(compared).toBeGreaterThan(1);

    // The social band is untouched: measured widths override nothing they were
    // not given, so the orbit's lanes still read through their own range.
    const socialEdge = model.edges.find((edge) => edge.layer === "social")!;
    expect(readableEdgeStrokeWidth(socialEdge, shellScale)).toBe(
      readableEdgeStrokeWidth(socialEdge, bandOnlyScale)
    );
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

  it("names its own surface when the plane has no projection to draw", () => {
    // The composition puts a surface-branded reason at warnings[0] ("ENA Space
    // requires a computed jENA manifest."), and the plane slot read it
    // verbatim — so the Fusion figure told the reader about a different view
    // and this component's own sentence was unreachable code.
    const skipped = buildSenaEnaManifest({
      ...lessonStudySenaContract,
      codebook: lessonStudySenaContract.codebook.slice(0, 1)
    });
    expect(skipped.status).toBe("skipped");

    const markup = renderToStaticMarkup(
      <FusionPlaneOrbitPlot
        model={model}
        enaManifest={skipped}
        layers={focusLayers}
        threshold={0}
        selectedId=""
        revealedLabelIds={[]}
        onSelect={() => undefined}
      />
    );

    const primaryAt = markup.indexOf(PLANE_UNAVAILABLE_MESSAGE);
    expect(markup).toContain('<g data-sena-layer="plane-unavailable">');
    expect(primaryAt).toBeGreaterThan(-1);
    expect(markup).toContain('data-sena-fallback-row="primary"');
    // The composition's reasons are kept, but underneath — never as the line
    // that answers "what am I looking at".
    expect(markup.indexOf('data-sena-fallback-row="detail"')).toBeGreaterThan(primaryAt);
    expect(markup.indexOf("ENA Space requires")).toBeGreaterThan(primaryAt);
    // The rest of the degraded figure is unchanged: orbit and caption still draw.
    expect(markup).toContain('data-testid="sena-fusion-orbit-layer"');
    expect(markup).toContain('<g data-sena-layer="model-footer">');
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
