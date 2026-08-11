import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FusionOrbitLayer } from "../../../components/sena/workspace/fusion-orbit-layer";
import {
  CentralSnaMetricsViewPanel,
  SNA_ORBIT_SOCIOGRAM_CANVAS,
  SNA_ORBIT_SOCIOGRAM_GEOMETRY
} from "../../../components/sena/workspace/workspace-central-plot-deck-sna-metrics-panel";
import { buildSenaOrbitLayout } from "../orbit-layout";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";

// ADR 0009 (P2). What this suite pins is the ink the geometry suite cannot see:
// paint order (every arrowhead after every line, which is what makes a crossing
// readable), the provenance attributes a reader needs to compare a lane against
// another plot, and the two production contract strings the browser smoke and
// the page contract already pin.

const model = buildSenaModel(lessonStudySenaContract);
const layout = buildSenaOrbitLayout(model);

function renderOrbit(props: Partial<Parameters<typeof FusionOrbitLayer>[0]> = {}) {
  return renderToStaticMarkup(
    <svg viewBox="0 0 1240 840">
      <FusionOrbitLayer
        model={model}
        threshold={0}
        selectedId=""
        onSelect={() => undefined}
        {...props}
      />
    </svg>
  );
}

describe("FusionOrbitLayer", () => {
  it("renders as a strippable SENA layer inside a host svg, with no svg root of its own", () => {
    const markup = renderToStaticMarkup(
      <FusionOrbitLayer model={model} threshold={0} selectedId="" onSelect={() => undefined} />
    );

    expect(markup.startsWith('<g data-sena-layer="orbit"')).toBe(true);
    expect(markup).not.toContain("<svg");
  });

  it("paints every arrowhead after every lane", () => {
    const markup = renderOrbit();
    const lastLane = markup.lastIndexOf('data-visual-role="orbit-social-lane"');
    const firstArrow = markup.indexOf('data-visual-role="orbit-social-arrowhead"');

    expect(lastLane).toBeGreaterThan(-1);
    expect(firstArrow).toBeGreaterThan(-1);
    expect(firstArrow).toBeGreaterThan(lastLane);
  });

  it("cases each arrowhead in paper before filling it", () => {
    const markup = renderOrbit();
    const casings = markup.match(/data-orbit-arrowhead-casing="true"/g) ?? [];
    const heads = markup.match(/data-visual-role="orbit-social-arrowhead"/g) ?? [];

    expect(casings).toHaveLength(layout.lanes.length);
    expect(heads).toHaveLength(layout.lanes.length);
    // Casing first inside each pair, so the fill sits on top of its own halo.
    expect(markup.indexOf('data-orbit-arrowhead-casing="true"'))
      .toBeLessThan(markup.indexOf('data-visual-role="orbit-social-arrowhead"'));
  });

  it("carries the full provenance set on every lane", () => {
    const markup = renderOrbit();

    expect(layout.lanes.length).toBeGreaterThan(0);
    for (const attribute of [
      "data-edge-weight",
      "data-edge-normalized-weight",
      "data-edge-scaled-weight",
      "data-edge-visual-salience",
      "data-edge-visual-width"
    ]) {
      const matches = markup.match(new RegExp(`${attribute}="`, "g")) ?? [];
      expect(matches).toHaveLength(layout.lanes.length);
    }
    for (const lane of layout.lanes) {
      expect(markup).toContain(`data-testid="sena-edge-${lane.edgeId}"`);
      expect(markup).toContain(`data-edge-visual-width="${lane.strokeWidth.toFixed(2)}"`);
    }
  });

  it("keeps the pinned person-hex visual role and gives every person an always-on name", () => {
    const markup = renderOrbit();
    const hexes = markup.match(/data-visual-role="sna-person-hex-node"/g) ?? [];
    const labels = markup.match(/data-visual-role="orbit-person-label"/g) ?? [];

    expect(hexes).toHaveLength(layout.persons.length);
    expect(labels).toHaveLength(layout.persons.length);
    for (const person of layout.persons) {
      expect(markup).toContain(person.label);
    }
  });

  it("filters lanes by layer and threshold the way the canvas does", () => {
    const wideOpen = renderOrbit({ threshold: 0 });
    const tight = renderOrbit({ threshold: 0.6 });
    const count = (markup: string) => (markup.match(/data-visual-role="orbit-social-lane"/g) ?? []).length;

    expect(count(tight)).toBeLessThan(count(wideOpen));
    expect(count(wideOpen)).toBe(
      model.edges.filter((edge) => edge.layer === "social" && edge.source !== edge.target).length
    );
    // The plane owns concept and bridge ink; none of it may leak into the ring.
    expect(wideOpen).not.toContain('data-layer="concept"');
    expect(wideOpen).not.toContain('data-layer="bridge"');
  });

  it("keeps lane widths identical across a threshold change", () => {
    const widths = (markup: string) => (markup.match(/data-edge-visual-width="[\d.]+"/g) ?? []).sort();
    const wideOpen = renderOrbit({ threshold: 0 });
    const tight = renderOrbit({ threshold: 0.4 });

    for (const width of widths(tight)) {
      expect(widths(wideOpen)).toContain(width);
    }
  });

  it("draws a selection ring only on the selected person", () => {
    const person = layout.persons[0];
    const unselected = renderOrbit();
    const selected = renderOrbit({ selectedId: person.id });

    expect(unselected).not.toContain('data-visual-role="orbit-person-selection-ring"');
    expect((selected.match(/data-visual-role="orbit-person-selection-ring"/g) ?? [])).toHaveLength(1);
  });

  it("tints community rings only when the model has more than one community", () => {
    const markup = renderOrbit();
    const rings = markup.match(/data-visual-role="orbit-community-ring"/g) ?? [];

    if (layout.communityTints.length > 1) {
      expect(rings.length).toBeGreaterThan(0);
    } else {
      expect(rings).toHaveLength(0);
    }
  });
});

describe("SNA view sociogram mount", () => {
  it("leads the SNA panel with the orbit above the metric cells", () => {
    const markup = renderToStaticMarkup(
      <CentralSnaMetricsViewPanel
        model={model}
        selectedId=""
        onCanvasSelect={() => undefined}
        threshold={0}
      />
    );

    expect(markup).toContain('data-testid="sena-sna-orbit-sociogram"');
    expect(markup).toContain('data-testid="sena-fusion-orbit-layer"');
    expect(markup.indexOf("sena-sna-orbit-sociogram")).toBeLessThan(markup.indexOf("Tie count"));
    // The metrics the panel already showed are untouched.
    expect(markup).toContain("Density");
    expect(markup).toContain("Reciprocity");
  });

  it("mounts the ring at the geometry its viewBox pays for", () => {
    const markup = renderToStaticMarkup(
      <CentralSnaMetricsViewPanel
        model={model}
        selectedId=""
        onCanvasSelect={() => undefined}
        threshold={0}
      />
    );

    expect(markup).toContain(
      `viewBox="0 0 ${SNA_ORBIT_SOCIOGRAM_CANVAS.width} ${SNA_ORBIT_SOCIOGRAM_CANVAS.height}"`
    );
    // The ring guide is drawn from the layout's resolved geometry, so its
    // attributes are the proof the mount is not falling back to the default.
    expect(markup).toContain(`rx="${SNA_ORBIT_SOCIOGRAM_GEOMETRY.rx}"`);
    expect(markup).toContain(`ry="${SNA_ORBIT_SOCIOGRAM_GEOMETRY.ry}"`);
  });

  it("keeps every hexagon, lane point, arrowhead and name label inside the viewBox", () => {
    // The same on-canvas invariant the Fusion surface pins, for the surface that
    // did not have one. SVG clips to the viewBox, so anything outside it is
    // silently gone: at the module default the pilot's five-lane band reached
    // x 1287 and y 916 on this 1240x840 frame and the right-cardinal person's
    // always-on name was truncated at the edge.
    const sociogram = buildSenaOrbitLayout(model, { geometry: SNA_ORBIT_SOCIOGRAM_GEOMETRY, threshold: 0 });
    const inside = (x: number, y: number) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(SNA_ORBIT_SOCIOGRAM_CANVAS.width);
      expect(y).toBeLessThanOrEqual(SNA_ORBIT_SOCIOGRAM_CANVAS.height);
    };

    // Not vacuous: the pilot fills the five-lane band this geometry pays for.
    expect(sociogram.lanes.length).toBeGreaterThan(0);
    expect(sociogram.laneCount).toBeGreaterThanOrEqual(5);

    for (const lane of sociogram.lanes) {
      for (const [x, y] of [...lane.points, ...lane.arrowhead.polygon]) inside(x, y);
    }
    for (const person of sociogram.persons) {
      inside(person.x - person.radius, person.y - person.radius);
      inside(person.x + person.radius, person.y + person.radius);
      const box = person.nameLabel.box;
      inside(box.x, box.y);
      inside(box.x + box.width, box.y + box.height);
    }
  });
});
