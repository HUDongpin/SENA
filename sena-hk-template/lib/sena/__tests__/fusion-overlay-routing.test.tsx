import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FusionPlotMaximizedOverlay } from "../../../components/sena/workspace/fusion-plot-overlay";
import { CentralFusionPlotViewPanel } from "../../../components/sena/workspace/workspace-central-plot-deck-fusion-panel";
import { plotViewOptions } from "../../../components/sena/workspace/workspace-static-config";
import { buildSenaEnaManifest } from "../ena-manifest";
import { buildSenaModel } from "../model";
import { lessonStudySenaContract } from "../pilot-assets";
import type { SenaLayer, SenaLayoutMode } from "../types";

// The overlay-bug pin (ADR 0009, P3). The maximized overlay used to hand
// `layout` straight to Canvas with no routing branch, so maximizing an
// ENA-space plot silently swapped a canonical jENA projection for the
// fusion-canvas fallback ADR 0008 retired — a figure that changed grammar when
// the reader made it bigger, and the exact failure a reviewer would screenshot.
//
// The fix is that the overlay runs the panel's switch. So this suite asserts
// the switch at all four modes on *both* surfaces, and asserts them together:
// a mode that routes one way inline and another way maximized is the same bug
// wearing a different mode name.

const model = buildSenaModel(lessonStudySenaContract);
const enaManifest = buildSenaEnaManifest(lessonStudySenaContract);
const layers: Record<SenaLayer, boolean> = { social: true, concept: true, bridge: true };

const PLANE_ORBIT = 'data-testid="sena-fusion-plane-orbit"';
const ENA_PLOT = 'data-testid="ena-plot"';
const FUSION_CANVAS = 'data-testid="sena-fusion-canvas"';

const modes: SenaLayoutMode[] = ["plane-orbit", "explanatory", "ena-space", "joint"];

function renderOverlay(layout: SenaLayoutMode) {
  return renderToStaticMarkup(
    <FusionPlotMaximizedOverlay
      model={model}
      layout={layout}
      jointEmbeddingOperator="mds-schoenberg"
      onJointEmbeddingOperatorChange={() => undefined}
      enaManifest={enaManifest}
      layers={layers}
      threshold={0.16}
      selectedId=""
      revealedLabelIds={[]}
      onSelect={() => undefined}
      onClose={() => undefined}
      activeWindowLabel="Full conversation"
      activeTurnLabel="All"
      alpha={1}
      beta={1}
      gamma={1}
      zoom={1}
      onZoomIn={() => undefined}
      onZoomOut={() => undefined}
      onZoomReset={() => undefined}
    />
  );
}

function renderPanel(layout: SenaLayoutMode) {
  return renderToStaticMarkup(
    <CentralFusionPlotViewPanel
      model={model}
      layout={layout}
      jointEmbeddingOperator="mds-schoenberg"
      onJointEmbeddingOperatorChange={() => undefined}
      enaManifest={enaManifest}
      layers={layers}
      threshold={0.16}
      selectedId=""
      revealedLabelIds={[]}
      onCanvasSelect={() => undefined}
      fusionPlotZoom={1}
      activePlotView="fusion"
      isPlotSwitcherOpen={false}
      onPlotSwitcherToggle={() => undefined}
      onPlotViewSelect={() => undefined}
      plotViewOptions={plotViewOptions}
      alpha={1}
      beta={1}
      gamma={1}
    />
  );
}

/** Which of the three Fusion surfaces a markup string actually rendered. */
function surfaceOf(markup: string) {
  const surfaces = [
    markup.includes(PLANE_ORBIT) ? "plane-orbit" : "",
    // ENA Space is a bare <EnaPlot>; the plane-orbit surface nests one, so the
    // plain-plot answer only counts when no fusion surface wraps it.
    !markup.includes(PLANE_ORBIT) && markup.includes(ENA_PLOT) ? "ena-plot" : "",
    markup.includes(FUSION_CANVAS) ? "fusion-canvas" : ""
  ].filter(Boolean);
  return surfaces.length === 1 ? surfaces[0] : `ambiguous:${surfaces.join("+")}`;
}

const expectedSurface: Record<SenaLayoutMode, string> = {
  "plane-orbit": "plane-orbit",
  explanatory: "fusion-canvas",
  "ena-space": "ena-plot",
  joint: "fusion-canvas"
};

describe("Fusion maximized overlay routes every layout to its own surface", () => {
  it("renders the canonical ENA plot when maximized in ENA Space, not the canvas fallback", () => {
    const markup = renderOverlay("ena-space");

    expect(markup).toContain(ENA_PLOT);
    expect(markup).not.toContain(FUSION_CANVAS);
    expect(markup).not.toContain(PLANE_ORBIT);
  });

  it("renders the plane-orbit surface when maximized in the default layout", () => {
    const markup = renderOverlay("plane-orbit");

    expect(markup).toContain(PLANE_ORBIT);
    // The plane is the shared renderer, nested — not a re-drawing of it.
    expect(markup).toContain(ENA_PLOT);
    expect(markup).not.toContain(FUSION_CANVAS);
  });

  it("keeps the diagnostic layouts on the A1 canvas", () => {
    for (const layout of ["explanatory", "joint"] as SenaLayoutMode[]) {
      const markup = renderOverlay(layout);

      expect(markup).toContain(FUSION_CANVAS);
      expect(markup).not.toContain(PLANE_ORBIT);
      expect(markup).not.toContain(ENA_PLOT);
    }
  });

  it("routes the maximized overlay exactly as the inline panel does", () => {
    for (const layout of modes) {
      expect([layout, surfaceOf(renderOverlay(layout))]).toEqual([layout, expectedSurface[layout]]);
      expect([layout, surfaceOf(renderPanel(layout))]).toEqual([layout, expectedSurface[layout]]);
    }
  });

  it("gives every branch the same overlay height, so maximizing is not a resize lottery", () => {
    for (const layout of modes) {
      expect(renderOverlay(layout)).toContain("h-[calc(100vh-14rem)] min-h-[34rem]");
    }
  });

  it("names the coordinate frame the reader is actually looking at", () => {
    expect(renderOverlay("plane-orbit")).toContain("Fusion Plane + Orbit");
    expect(renderOverlay("ena-space")).toContain("ENA Space");
    expect(renderOverlay("explanatory")).toContain("A1 Inner Solid Mesh");
    expect(renderOverlay("joint")).toContain("A1 Inner Solid Mesh");
    // The chip is not a leftover constant any more.
    expect(renderOverlay("plane-orbit")).not.toContain("A1 Inner Solid Mesh");
  });

  it("keeps the joint embedding provenance strip on joint alone, in both surfaces", () => {
    for (const layout of modes) {
      const shouldShow = layout === "joint";
      expect(renderOverlay(layout).includes('data-testid="joint-embedding-provenance-strip"')).toBe(shouldShow);
      expect(renderPanel(layout).includes('data-testid="joint-embedding-provenance-strip"')).toBe(shouldShow);
    }
  });
});
