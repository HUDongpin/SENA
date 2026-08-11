import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  senaLayerChips,
  senaLayerPalette,
  senaLayerStrokes,
  senaPlotAccentStroke
} from "../layer-palette";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

// The pre-P5 bright set and every tint the four plot surfaces used to ramp
// into. A palette is only central while nothing quietly re-hardcodes it, and a
// re-introduced literal is invisible in review precisely because it renders
// almost right — so the plot surfaces are grepped rather than trusted.
const retiredPlotStrokeLiterals = [
  "#2f73ff", // S, bright
  "#735cf6", // W, bright
  "#b14cf1", // W ramp far stop
  "#895dff", // W, concept-space guide ring
  "#a855f7", // W, temporal metric + trace line
  "#8b5cf6", // W, concept-node fallback fill
  "#24dcee", // B, bright — now the B stroke, or the accent where a person node borrows it
  "#5bd7ff", // B ramp mid stop
  "#78adff", // B ramp far stop
  "#7aa7ff", // B ramp far stop, temporal
  "#fb7185", // G, bright
  "#e253a5" // G ramp far stop
] as const;

const migratedPlotSurfaces = [
  "components/sena/workspace/fusion-canvas.tsx",
  "components/sena/workspace/ena-space-plot.tsx",
  "components/sena/workspace/temporal-fusion-arc.tsx",
  "components/sena/workspace/timeline-trace.tsx",
  "components/sena/workspace/fusion-orbit-layer.tsx",
  "components/sena/workspace/fusion-plane-orbit.tsx"
] as const;

describe("SENA layer palette", () => {
  it("pins the 2026-08-08 validated stroke set for S, W, B and G", () => {
    expect(senaLayerPalette.social).toEqual({ token: "S", stroke: "#2451CC", chip: "#2f73ff" });
    expect(senaLayerPalette.concept).toEqual({ token: "W", stroke: "#A06BF5", chip: "#735cf6" });
    expect(senaLayerPalette.bridge).toEqual({ token: "B", stroke: "#0891B2", chip: "#24dcee" });
    expect(senaLayerPalette.pair).toEqual({ token: "G", stroke: "#DB2777", chip: "#fb7185" });
  });

  it("keeps chips on the bright set so the layer key and inspector stay unchanged", () => {
    // ADR 0009 Q4: the re-step is strokes only. If a chip ever equals its own
    // stroke, the split this module exists to record has been lost.
    for (const channel of Object.keys(senaLayerPalette) as Array<keyof typeof senaLayerPalette>) {
      expect(senaLayerChips[channel]).not.toBe(senaLayerStrokes[channel]);
    }

    const layerKeySource = readProjectFile("components/sena/workspace/fusion-layer-key.tsx");

    expect(layerKeySource).toContain(senaLayerChips.social);
    expect(layerKeySource).toContain(senaLayerChips.concept);
  });

  it("exposes the strokes and chips as flat lookups of the same entries", () => {
    expect(senaLayerStrokes).toEqual({
      social: senaLayerPalette.social.stroke,
      concept: senaLayerPalette.concept.stroke,
      bridge: senaLayerPalette.bridge.stroke,
      pair: senaLayerPalette.pair.stroke
    });
    expect(senaLayerChips).toEqual({
      social: senaLayerPalette.social.chip,
      concept: senaLayerPalette.concept.chip,
      bridge: senaLayerPalette.bridge.chip,
      pair: senaLayerPalette.pair.chip
    });
  });

  it("leaves the person/unit cyan accent at its pre-re-step value", () => {
    expect(senaPlotAccentStroke).toBe("#24dcee");
  });
});

describe("SENA plot stroke migration", () => {
  it("leaves no retired stroke literal in the migrated plot surfaces", () => {
    const offenders = migratedPlotSurfaces.flatMap((relativePath) => {
      const source = readProjectFile(relativePath);
      return source
        .split("\n")
        .flatMap((line, index) => retiredPlotStrokeLiterals
          .filter((literal) => line.toLowerCase().includes(literal))
          .map((literal) => `${relativePath}:${index + 1}: ${literal}`));
    });

    expect(offenders).toEqual([]);
  });

  it("sources every migrated plot surface from the central palette", () => {
    for (const relativePath of migratedPlotSurfaces) {
      expect(readProjectFile(relativePath)).toContain('from "@/lib/sena/layer-palette"');
    }
  });

  it("keeps A1's gradient defs — the re-step re-colours the ramps, it does not delete them", () => {
    const canvasSource = readProjectFile("components/sena/workspace/fusion-canvas.tsx");

    expect(canvasSource).toContain('<linearGradient id="concept-link-gradient"');
    expect(canvasSource).toContain('<linearGradient id="bridge-gradient"');
    expect(canvasSource).toContain('return "url(#concept-link-gradient)"');
    expect(canvasSource).toContain('return "url(#bridge-gradient)"');

    const arcSource = readProjectFile("components/sena/workspace/temporal-fusion-arc.tsx");

    expect(arcSource).toContain('<linearGradient id="temporal-bridge-gradient"');
    expect(arcSource).toContain('<linearGradient id="temporal-concept-gradient"');
    expect(arcSource).toContain('<linearGradient id="temporal-g-gradient"');
  });

  it("keeps EnaPlot's overlay constants equal to the palette without importing it", () => {
    // components/ena stays import-free of lib/sena (layering direction), so
    // EnaPlot carries the stroke values as literals. This is the pin that makes
    // the ena-space and fusion-plane legend swatches — which DO read the
    // palette — describe exactly the colours the plot draws. Change the palette
    // and this fails until EnaPlot moves in step.
    const enaPlotSource = readProjectFile("components/ena/EnaPlot.tsx");

    expect(enaPlotSource).toContain(`const OVERLAY_BRIDGE_COLOR = "${senaLayerStrokes.bridge}"`);
    expect(enaPlotSource).toContain(`const OVERLAY_SOCIAL_COLOR = "${senaLayerStrokes.social}"`);
    expect(enaPlotSource).toContain(`const UNIT_IDENTITY_ACCENT = "${senaPlotAccentStroke}"`);
    expect(enaPlotSource).not.toContain('from "@/lib/sena');
  });

  it("re-exports the palette from the lib/sena barrel", () => {
    const barrelSource = readProjectFile("lib/sena/index.ts");

    expect(barrelSource).toContain('from "./layer-palette"');
    expect(barrelSource).toContain("senaLayerStrokes");
    expect(barrelSource).toContain("senaPlotAccentStroke");
  });
});
