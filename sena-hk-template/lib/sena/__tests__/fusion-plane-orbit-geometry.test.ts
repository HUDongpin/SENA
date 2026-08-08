import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { projectPoint } from "../../ena/plot-encoding";
import {
  FUSION_ORBIT_GEOMETRY,
  FUSION_PLANE_ORBIT_CANVAS,
  FUSION_PLANE_SLOT,
  FUSION_PLANE_TITLE,
  fusionPlaneSurfacePoint
} from "../../../components/sena/workspace/fusion-plane-orbit";
import { buildSenaEnaManifest } from "../ena-manifest";
import { buildSenaEnaPlotComposition } from "../ena-plot-model";
import { buildSenaModel } from "../model";
import { buildSenaOrbitLayout } from "../orbit-layout";
import { lessonStudySenaContract } from "../pilot-assets";
import {
  buildAbsoluteEdgeStrokeScale,
  buildConceptPairContributionMap,
  buildEdgeStrokeScale,
  readableEdgeStrokeWidth,
  senaEdgeStrokeRanges,
  senaOrbitSocialStrokeRange
} from "../visual-encoding";

// ADR 0009 (P3). Two claims about the Fusion surface's geometry, both of which
// the eye cannot check and a screenshot cannot either once the SVG letterboxes:
//
//   1. the plane-to-surface transform is exact, including under zoom — it is
//      what places the unit leader's far end, and an approximate version draws
//      a line that misses the point it names;
//   2. the orbit fits. The ring's lanes bulge outward by up to
//      `laneBaseOffset + lane * step`, so a canvas or radius chosen by eye can
//      push a lane off the surface (silently clipped) or into the plane
//      (silently claiming the plane's coordinates for an explanatory layout).
//
// Both are pinned against the pilot contract at the geometry the surface ships.

const model = buildSenaModel(lessonStudySenaContract);
const enaManifest = buildSenaEnaManifest(lessonStudySenaContract);
const composition = buildSenaEnaPlotComposition(enaManifest, model.people, model.codes, {
  title: FUSION_PLANE_TITLE
});

const slotRect = {
  left: FUSION_PLANE_SLOT.x,
  top: FUSION_PLANE_SLOT.y,
  right: FUSION_PLANE_SLOT.x + FUSION_PLANE_SLOT.width,
  bottom: FUSION_PLANE_SLOT.y + FUSION_PLANE_SLOT.height
};

function insideSlot(x: number, y: number) {
  return x >= slotRect.left && x <= slotRect.right && y >= slotRect.top && y <= slotRect.bottom;
}

describe("Fusion plane-to-surface transform", () => {
  it("is a plain slot offset at zoom 1", () => {
    // EnaPlot's viewBox at zoom 1 is (0 0 720 520), so the nested viewport maps
    // its own pixels onto the slot one for one.
    expect(fusionPlaneSurfacePoint({ x: 0, y: 0 }, 1)).toEqual({
      x: FUSION_PLANE_SLOT.x,
      y: FUSION_PLANE_SLOT.y,
      visible: true
    });
    expect(fusionPlaneSurfacePoint({ x: 360, y: 260 }, 1)).toEqual({ x: 740, y: 520, visible: true });
    expect(fusionPlaneSurfacePoint({ x: 720, y: 520 }, 1)).toEqual({
      x: slotRect.right,
      y: slotRect.bottom,
      visible: true
    });
  });

  it("follows EnaPlot's zoom-derived viewBox rather than the surface's", () => {
    // viewBox = (360 - 360/1.75, 260 - 260/1.75, 720/1.75, 520/1.75); the box
    // keeps the viewport's aspect ratio, so xMidYMid meet is a uniform 1.75x.
    const viewBoxX = 360 - 360 / 1.75;
    const viewBoxY = 260 - 260 / 1.75;
    const zoomed = fusionPlaneSurfacePoint({ x: 300, y: 200 }, 1.75);

    expect(zoomed.x).toBeCloseTo(FUSION_PLANE_SLOT.x + (300 - viewBoxX) * 1.75, 10);
    expect(zoomed.y).toBeCloseTo(FUSION_PLANE_SLOT.y + (200 - viewBoxY) * 1.75, 10);
    expect(zoomed.x).toBeCloseTo(635, 10);
    expect(zoomed.y).toBeCloseTo(415, 10);

    // The plot centre is the one point zoom cannot move: it is the viewBox's
    // centre at every zoom, so it lands on the slot centre at every zoom.
    for (const zoom of [0.75, 1, 1.5, 2, 4]) {
      const centre = fusionPlaneSurfacePoint({ x: 360, y: 260 }, zoom);
      expect(centre.x).toBeCloseTo(740, 10);
      expect(centre.y).toBeCloseTo(520, 10);
    }
  });

  it("clamps the zoom exactly as EnaPlot does, so the leader cannot desync from the plot", () => {
    // clampPlotZoom pins to [0.6, 4] and treats a non-finite zoom as 1.
    expect(fusionPlaneSurfacePoint({ x: 300, y: 200 }, 9)).toEqual(
      fusionPlaneSurfacePoint({ x: 300, y: 200 }, 4)
    );
    expect(fusionPlaneSurfacePoint({ x: 300, y: 200 }, Number.NaN)).toEqual(
      fusionPlaneSurfacePoint({ x: 300, y: 200 }, 1)
    );
  });

  it("reports a point the zoom window has scrolled out of the slot as not visible", () => {
    // At 2x the visible plane pixels are (180..540, 130..390); a unit at (40,40)
    // is clipped by the nested viewport, so there is nothing to draw a leader to.
    expect(fusionPlaneSurfacePoint({ x: 40, y: 40 }, 2).visible).toBe(false);
    expect(fusionPlaneSurfacePoint({ x: 40, y: 40 }, 1).visible).toBe(true);
    expect(fusionPlaneSurfacePoint({ x: 300, y: 200 }, 2).visible).toBe(true);
  });

  it("places a pilot unit point at an exact surface coordinate", () => {
    expect(composition.status).toBe("computed");
    const unit = composition.units.find((candidate) => candidate.id === model.people[0].id);
    expect(unit).toBeDefined();

    const [planeX, planeY] = projectPoint(composition.model!, unit!);
    const surface = fusionPlaneSurfacePoint({ x: planeX, y: planeY });

    expect(surface.x).toBeCloseTo(FUSION_PLANE_SLOT.x + planeX, 10);
    expect(surface.y).toBeCloseTo(FUSION_PLANE_SLOT.y + planeY, 10);
    expect(surface.visible).toBe(true);
    // The projection is deterministic for the pilot contract, so the leader's
    // far end is a fixed coordinate and stays one.
    expect(surface.x).toBeCloseTo(808.9660061147929, 9);
    expect(surface.y).toBeCloseTo(496.3521011630718, 9);
  });
});

describe("Fusion orbit geometry fits its surface", () => {
  const layout = buildSenaOrbitLayout(model, { geometry: FUSION_ORBIT_GEOMETRY, threshold: 0 });

  it("draws lanes at all, so the bounds below are not vacuous", () => {
    expect(layout.persons.length).toBeGreaterThan(0);
    expect(layout.lanes.length).toBeGreaterThan(0);
    // The outermost lane is what the canvas has to pay for; the pilot fills
    // five, i.e. a 44 + 4 * 26 = 148px band outside the ring.
    expect(layout.laneCount).toBeGreaterThanOrEqual(5);
  });

  it("keeps every hexagon, lane point, and arrowhead on the canvas", () => {
    for (const person of layout.persons) {
      // The hexagon's circumradius box, which contains the drawn polygon.
      for (const [x, y] of [
        [person.x - person.radius, person.y - person.radius],
        [person.x + person.radius, person.y + person.radius]
      ]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(FUSION_PLANE_ORBIT_CANVAS.width);
        expect(y).toBeLessThanOrEqual(FUSION_PLANE_ORBIT_CANVAS.height);
      }
    }

    for (const lane of layout.lanes) {
      for (const [x, y] of [...lane.points, ...lane.arrowhead.polygon]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(FUSION_PLANE_ORBIT_CANVAS.width);
        expect(y).toBeLessThanOrEqual(FUSION_PLANE_ORBIT_CANVAS.height);
      }
    }
  });

  it("never lets the orbit enter the plane slot", () => {
    // The ring encloses the plane and lanes bulge outward only, which is the
    // whole reason the z-order is "orbit first, plane over it" rather than a
    // per-mark decision. If a future geometry breaks the enclosure, it breaks
    // here rather than by drawing an explanatory lane across a measurement.
    for (const lane of layout.lanes) {
      for (const [x, y] of [...lane.points, ...lane.arrowhead.polygon]) {
        expect(insideSlot(x, y)).toBe(false);
      }
    }

    for (const person of layout.persons) {
      const dx = Math.max(slotRect.left - person.x, 0, person.x - slotRect.right);
      const dy = Math.max(slotRect.top - person.y, 0, person.y - slotRect.bottom);
      expect(Math.hypot(dx, dy)).toBeGreaterThan(person.radius);
    }
  });

  it("encloses the plane's corners inside the ring", () => {
    const cornerX = FUSION_PLANE_SLOT.width / 2;
    const cornerY = FUSION_PLANE_SLOT.height / 2;

    expect(FUSION_ORBIT_GEOMETRY.center).toEqual({
      x: FUSION_PLANE_SLOT.x + cornerX,
      y: FUSION_PLANE_SLOT.y + cornerY
    });
    expect(
      Math.pow(cornerX / FUSION_ORBIT_GEOMETRY.rx, 2) + Math.pow(cornerY / FUSION_ORBIT_GEOMETRY.ry, 2)
    ).toBeLessThan(1);
  });

  it("reports the width it drew, so the inspector and the lane agree", () => {
    // The inspector's line-weight provenance reads whatever scale the shell
    // built. On the A1 canvas that is the layer-relative scale; on the orbit it
    // has to be the corpus-anchored one in the orbit's own band, or the panel
    // states a width for a line that is not on screen. Same numbers, both ends.
    const threshold = 0.16;
    const visible = model.edges.filter((edge) => edge.normalizedWeight >= threshold);
    const contributions = buildConceptPairContributionMap(model);
    const orbitScale = buildAbsoluteEdgeStrokeScale(visible, contributions, {
      social: senaOrbitSocialStrokeRange
    });
    const canvasScale = buildEdgeStrokeScale(visible, contributions);
    const orbit = buildSenaOrbitLayout(model, { geometry: FUSION_ORBIT_GEOMETRY, threshold });

    expect(orbit.lanes.length).toBeGreaterThan(0);
    for (const lane of orbit.lanes) {
      const edge = model.edges.find((candidate) => candidate.id === lane.edgeId)!;
      expect(readableEdgeStrokeWidth(edge, orbitScale)).toBe(lane.strokeWidth);
      expect(lane.strokeWidth).toBeGreaterThanOrEqual(senaOrbitSocialStrokeRange.min);
      expect(lane.strokeWidth).toBeLessThanOrEqual(senaOrbitSocialStrokeRange.max);
    }

    // …and the A1 scale is untouched: it still reads in the canvas band.
    const canvasSocial = model.edges.filter((edge) => edge.layer === "social" && edge.normalizedWeight >= threshold);
    for (const edge of canvasSocial) {
      expect(readableEdgeStrokeWidth(edge, canvasScale)).toBeGreaterThanOrEqual(senaEdgeStrokeRanges.social.min);
    }

    const shellSource = readFileSync(
      join(process.cwd(), "components/sena/workspace/use-sena-fusion-workspace-main-shell-props.ts"),
      "utf8"
    );
    expect(shellSource).toContain('layout === "plane-orbit"');
    expect(shellSource).toContain("buildAbsoluteEdgeStrokeScale(visibleFusionEdges");
    expect(shellSource).toContain("senaOrbitSocialStrokeRange");
  });

  it("leaves the caption band below the orbit clear", () => {
    // The model-definition caption is part of the figure (fusion-plane-parity
    // pins its rows), so the lane band has to stop above it.
    const lowestOrbitPoint = layout.lanes.reduce(
      (lowest, lane) => Math.max(lowest, ...lane.points.map(([, y]) => y)),
      0
    );

    expect(lowestOrbitPoint).toBeLessThan(1000);
    expect(FUSION_PLANE_ORBIT_CANVAS.height - lowestOrbitPoint).toBeGreaterThan(40);
  });
});
