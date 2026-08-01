import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EnaPlot } from "../../../components/ena/EnaPlot";
import { SenaEnaSpacePlot } from "../../../components/sena/workspace/ena-space-plot";
import {
  RENA_EDGE_WIDTH_RANGE,
  RENA_NODE_RADIUS_RANGE,
  pointTraceRadius,
  styleRenaNetwork
} from "../../ena/plot-encoding";
import { buildSenaEnaManifest } from "../ena-manifest";
import { buildSenaEnaPlotComposition } from "../ena-plot-model";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";

// ADR 0008: SENA's ENA Space and /workspace/ena render through one component,
// with everything SENA adds marked `data-sena-layer`. This suite pins that
// contract from both directions — the encoding is rENA's, and the overlay is
// provably additive — so a change to either renderer fails here instead of
// quietly reintroducing two grammars for one space.

const model = buildSenaModel(lessonStudySenaContract);
const enaManifest = buildSenaEnaManifest(lessonStudySenaContract);
const composition = buildSenaEnaPlotComposition(enaManifest, model.people, model.codes, {
  title: "ENA projection"
});

const layers = { social: true, concept: true, bridge: true };

/**
 * Remove every `<g data-sena-layer="...">` subtree, tracking `<g>` depth so a
 * nested group cannot terminate its parent early. What survives is the plot
 * jena-js and rENA describe, with no SENA ink in it.
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

function renderBasePlot() {
  return svgOnly(
    renderToStaticMarkup(
      <EnaPlot model={composition.model!} variance={composition.variance} className="h-full w-full" />
    )
  );
}

function renderEnaSpace(selectedId = "") {
  return svgOnly(
    renderToStaticMarkup(
      <SenaEnaSpacePlot
        model={model}
        enaManifest={enaManifest}
        layers={layers}
        threshold={0}
        selectedId={selectedId}
        onSelect={() => undefined}
      />
    )
  );
}

describe("SENA ENA Space renders the canonical ENA plot", () => {
  it("builds a plot model from the jENA manifest", () => {
    expect(composition.status).toBe("computed");
    expect(composition.model).not.toBeNull();
    expect(composition.model?.dimensions).toEqual(enaManifest.outputs?.dimensions.slice(0, 2));
    expect(composition.network.status).toBe("computed");
    expect(composition.network.basis).toBe("mean-line-weights");
  });

  it("plots one point per ENA unit rather than one per person", () => {
    // Today SENA's ENA unit IS personId, so these coincide. They stop coinciding
    // the moment units become multi-column (person x window), and at that point
    // ENA Space must follow the unit definition, not collapse to a person mean.
    const unitRows = enaManifest.outputs?.points.length ?? 0;
    const unitTrace = composition.model?.traces.find((trace) => trace.type === "points");

    expect(unitRows).toBeGreaterThan(0);
    expect(unitTrace?.points).toHaveLength(unitRows);
    expect(composition.units).toHaveLength(unitRows);
  });

  it("keeps jena-js's trace order so unit points keep their palette slot", () => {
    // addNetwork, addNodes, addPoints — the order lib/ena/results.ts uses. A
    // missing `nodes` trace would silently recolour the unit points.
    expect(composition.model?.traces.map((trace) => trace.type)).toEqual(["network", "nodes", "points"]);
    expect(composition.model?.traces[2].color).toBe("#e850d2");
  });

  it("sizes nodes by ENA connectivity and edges by the rENA width scale", () => {
    const network = composition.model!.traces.find((trace) => trace.type === "network")!.network!;
    const styled = styleRenaNetwork(composition.model!, network, "#386CB0");

    expect(styled.nodes.length).toBeGreaterThan(0);
    for (const node of styled.nodes) {
      expect(node.radius).toBeGreaterThanOrEqual(RENA_NODE_RADIUS_RANGE[0]);
      expect(node.radius).toBeLessThanOrEqual(RENA_NODE_RADIUS_RANGE[1]);
    }
    for (const edge of styled.edges) {
      expect(edge.strokeWidth).toBeGreaterThanOrEqual(RENA_EDGE_WIDTH_RANGE[0]);
      expect(edge.strokeWidth).toBeLessThanOrEqual(RENA_EDGE_WIDTH_RANGE[1]);
    }

    // Node radius tracks connectivity, not SENA's weightedDegree.
    const sorted = [...styled.nodes].sort((left, right) => left.connectivity - right.connectivity);
    for (let index = 1; index < sorted.length; index += 1) {
      expect(sorted[index].radius).toBeGreaterThanOrEqual(sorted[index - 1].radius - 1e-9);
    }
  });

  it("draws unit points at the ENA unit radius, not as fusion hexagons", () => {
    const markup = renderEnaSpace();

    expect(markup).toContain(`r="${pointTraceRadius("points")}"`);
    // The fusion grammar's person glyph has no place in a projected space.
    expect(markup).not.toContain('data-visual-role="sna-person-hex-node"');
    expect(markup).not.toContain('data-visual-role="ena-concept-circle-node"');
  });

  it("renders SENA's additions only inside marked layers", () => {
    const markup = renderEnaSpace();

    expect(markup).toContain('data-sena-layer="overlay-edges"');
    expect(markup).toContain('data-sena-layer="unit-identity"');
    expect(markup).toContain('data-sena-layer="node-hit-targets"');
    expect(markup).toContain('data-sena-layer="legend-overlay-entries"');
  });

  // The load-bearing assertion. Everything SENA adds is additive by
  // construction, so removing the marked layers has to leave exactly the plot
  // /workspace/ena draws for the same model — including when a node is selected.
  it("reduces to a plain ENA plot when the SENA layers are stripped", () => {
    const base = stripSenaLayers(renderBasePlot());
    const enaSpace = stripSenaLayers(renderEnaSpace());
    const selected = stripSenaLayers(renderEnaSpace(model.codes[0]?.id ?? ""));

    expect(base.length).toBeGreaterThan(0);
    expect(enaSpace).toBe(base);
    expect(selected).toBe(base);
  });

  it("strips nothing from a plot that has no SENA layers to strip", () => {
    // Guards the stripper itself: if it silently ate base markup, the assertion
    // above would pass for the wrong reason.
    const base = renderBasePlot();
    const stripped = stripSenaLayers(base);

    expect(stripped).toContain('data-plot-role="network-node"');
    expect(stripped).toContain('data-plot-role="axes"');
    expect(stripped).toContain('data-plot-role="title"');
    expect(stripped).not.toContain("data-sena-layer");
  });
});
