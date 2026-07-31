import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { buildSenaEnaManifest } from "../ena-manifest";
import { buildSenaEnaNetwork } from "../ena-network";
import { buildSenaEnaSpaceCoordinateMap } from "../layout";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import {
  fusionCanvasCenter,
  fusionCanvasHeight,
  fusionCanvasWidth
} from "../../../components/sena/workspace/fusion-layout";

// The Fusion Canvas draws two different concept quantities depending on layout:
// SENA's W matrix in the explanatory and joint layouts, and jena-js's ENA
// network in ENA space. This suite pins the ENA-space side so it cannot quietly
// drift back into "ENA geometry, SENA W ink".

const model = buildSenaModel(lessonStudySenaContract);
const enaManifest = buildSenaEnaManifest(lessonStudySenaContract);

function enaSpaceCoordinates() {
  return buildSenaEnaSpaceCoordinateMap(enaManifest, model.people, model.codes, {
    width: fusionCanvasWidth,
    height: fusionCanvasHeight,
    marginX: 92,
    marginY: 78
  });
}

describe("SENA ENA network derived from the jENA manifest", () => {
  it("builds the mean ENA network from jena-js line weights, not SENA's W matrix", () => {
    const network = buildSenaEnaNetwork(enaManifest);

    expect(network.status).toBe("computed");
    expect(network.source).toBe("jena-js");
    expect(network.basis).toBe("mean-line-weights");
    expect(network.units).toBe(enaManifest.outputs?.lineWeights.length);
    expect(network.edges.length).toBeGreaterThan(0);
    expect(network.edges.every((edge) => Number.isFinite(edge.weight))).toBe(true);
  });

  it("averages each adjacency-key column across units", () => {
    const network = buildSenaEnaNetwork(enaManifest);
    const lineWeights = enaManifest.outputs?.lineWeights ?? [];

    for (const edge of network.edges) {
      const values = lineWeights
        .map((row) => row[edge.name])
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      const expected = values.reduce((sum, value) => sum + value, 0) / values.length;
      expect(edge.weight).toBeCloseTo(expected, 12);
    }
  });

  it("keeps stroke width absolute and monotone in |weight|", () => {
    const network = buildSenaEnaNetwork(enaManifest);
    const sorted = [...network.edges].sort((left, right) => Math.abs(left.weight) - Math.abs(right.weight));

    // This pins `jenaStrokeWidth` — the absolute law carried on the network
    // model, which SENA's old layer-relative scale had replaced outright.
    // It is NOT the width that ships: the renderer uses styleRenaNetwork's
    // plot-relative `strokeWidth`, and ADR 0008 states that two ENA plots are
    // therefore not width-comparable (read `data-edge-weight` for that). The
    // absolute law still governs the degenerate-span case — see "degenerate
    // edge weights fall back to jena-js's absolute law" in plot-parity.test.ts.
    for (let index = 1; index < sorted.length; index += 1) {
      expect(sorted[index].jenaStrokeWidth).toBeGreaterThanOrEqual(sorted[index - 1].jenaStrokeWidth - 1e-12);
    }
    expect(Math.min(...sorted.map((edge) => edge.jenaStrokeWidth))).toBeGreaterThanOrEqual(1);
  });

  it("honours the minWeight filter the way jena-js addNetwork does", () => {
    const all = buildSenaEnaNetwork(enaManifest);
    const peak = Math.max(...all.edges.map((edge) => Math.abs(edge.weight)));
    const filtered = buildSenaEnaNetwork(enaManifest, { minWeight: peak });

    expect(filtered.edges.length).toBe(0);
    expect(filtered.status).toBe("skipped");
  });

  it("skips cleanly when the manifest did not compute", () => {
    const network = buildSenaEnaNetwork({ ...enaManifest, status: "skipped", outputs: undefined });

    expect(network.status).toBe("skipped");
    expect(network.edges).toEqual([]);
    expect(network.warnings[0]).toContain("computed jENA manifest");
  });
});

describe("ENA-space layout reads as an ENA projection", () => {
  it("puts the data origin at the canvas centre", () => {
    const coordinates = enaSpaceCoordinates();
    const entries = Object.values(coordinates.coordinates);

    expect(coordinates.status).toBe("computed");
    // Sign of every raw coordinate survives projection, so quadrants mean what
    // they mean in an ENA plot. Centring on the bounding-box midpoint, as the
    // previous implementation did, moved the origin by a data-dependent amount.
    for (const entry of entries) {
      if (Math.abs(entry.rawX) > 1e-12) {
        expect(Math.sign(entry.x - fusionCanvasCenter.x)).toBe(Math.sign(entry.rawX));
      }
      if (Math.abs(entry.rawY) > 1e-12) {
        expect(Math.sign(fusionCanvasCenter.y - entry.y)).toBe(Math.sign(entry.rawY));
      }
    }
  });

  // ADR 0008 replaced the isotropic scale with jena-js's: each axis gets its own
  // symmetric range and fills its own pixel span. Isotropic scaling kept
  // on-screen distance metrically meaningful, but it placed the same code at a
  // different relative position than /workspace/ena drew it — SVD1 usually
  // explains far more variance than SVD2, so `min(scaleX, scaleY)` compressed
  // the plot along its informative axis and made the two routes incomparable.
  it("scales each axis independently, the way jena-js does", () => {
    const entries = Object.values(enaSpaceCoordinates().coordinates);
    const scaleOf = (values: Array<[number, number]>) => {
      const usable = values.filter(([raw]) => Math.abs(raw) > 1e-9);
      return usable.map(([raw, offset]) => offset / raw);
    };

    const xScales = scaleOf(entries.map((entry) => [entry.rawX, entry.x - fusionCanvasCenter.x]));
    const yScales = scaleOf(entries.map((entry) => [entry.rawY, fusionCanvasCenter.y - entry.y]));

    expect(xScales.length).toBeGreaterThan(0);
    expect(yScales.length).toBeGreaterThan(0);
    // One scale per axis: linear within an axis...
    expect(Math.max(...xScales) - Math.min(...xScales)).toBeLessThan(1e-9);
    expect(Math.max(...yScales) - Math.min(...yScales)).toBeLessThan(1e-9);
    expect(Math.min(...xScales)).toBeGreaterThan(0);
    expect(Math.min(...yScales)).toBeGreaterThan(0);
    // ...and the two axes are free to differ, which is what fills the canvas.
    expect(Math.abs(xScales[0] - yScales[0])).toBeGreaterThan(1e-9);
  });

  it("projects through lib/ena/plot-encoding rather than its own arithmetic", () => {
    const source = readFileSync(join(process.cwd(), "lib/sena/layout.ts"), "utf8");

    expect(source).toContain("projectPoint");
    // The isotropic scale that ADR 0008 retired.
    expect(source).not.toContain("Math.min(halfWidth / extentX");
    expect(source).not.toContain("const scale = Math.min");
  });

  it("keeps every projected node inside the canvas without clamping", () => {
    const entries = Object.values(enaSpaceCoordinates().coordinates);

    for (const entry of entries) {
      expect(entry.x).toBeGreaterThanOrEqual(0);
      expect(entry.x).toBeLessThanOrEqual(fusionCanvasWidth);
      expect(entry.y).toBeGreaterThanOrEqual(0);
      expect(entry.y).toBeLessThanOrEqual(fusionCanvasHeight);
    }
  });
});
