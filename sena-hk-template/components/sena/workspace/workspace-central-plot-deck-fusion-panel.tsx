import { SenaEnaSpacePlot } from "./ena-space-plot";
import { Canvas } from "./fusion-canvas";
import { FusionLayerKey } from "./fusion-layer-key";
import { FusionPlaneOrbitPlot } from "./fusion-plane-orbit";
import { JointEmbeddingProvenanceStrip } from "./runtime-provenance-panels";
import { ActivePlotViewToolbar } from "./workspace-shell-panels";
import type { CentralFusionPlotViewPanelProps } from "./workspace-central-plot-deck-view-panel-props";

export function CentralFusionPlotViewPanel({
  model,
  layout,
  jointEmbeddingOperator,
  onJointEmbeddingOperatorChange,
  enaManifest,
  layers,
  threshold,
  selectedId,
  revealedLabelIds,
  onCanvasSelect,
  fusionPlotZoom,
  activePlotView,
  isPlotSwitcherOpen,
  onPlotSwitcherToggle,
  onPlotViewSelect,
  plotViewOptions,
  alpha,
  beta,
  gamma
}: CentralFusionPlotViewPanelProps) {
  return (
    <section
      data-testid="workspace-primary-plot"
      data-visual-role="workspace-primary-plot"
      className="grid min-h-0 gap-3"
    >
      <div
        data-testid="central-fusion-priority-plot"
        data-visual-role="fusion-plot-priority-stack"
        className="grid min-h-0 gap-3"
      >
        {layout === "joint" && (
          <JointEmbeddingProvenanceStrip
            model={model}
            operator={jointEmbeddingOperator}
            onOperatorChange={onJointEmbeddingOperatorChange}
          />
        )}
        {/*
          Three surfaces, one router. The ENA-space layout puts every node at a
          projected coordinate, so it renders through the canonical ENA surface
          wherever it is selected — not just in the ENA Space view — and
          plane-orbit, the default, nests that same renderer inside its own
          surface (ADR 0009). Routing here rather than inside Canvas is what
          lets the Fusion Canvas keep one grammar for the two layouts whose
          positions are explanatory choices (ADR 0008), now labeled diagnostic.
          The maximized overlay runs the identical switch; the two must not
          drift, which is what fusion-overlay-routing.test.tsx pins.
        */}
        <div
          data-testid="central-fusion-canvas-frame"
          data-visual-role="fusion-canvas-current-window-frame"
          className="min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
        >
          {layout === "plane-orbit" ? (
            <FusionPlaneOrbitPlot
              model={model}
              enaManifest={enaManifest}
              layers={layers}
              threshold={threshold}
              selectedId={selectedId}
              revealedLabelIds={revealedLabelIds}
              onSelect={onCanvasSelect}
              zoom={fusionPlotZoom}
              className="h-[min(48dvh,34rem)] min-h-[22rem]"
            />
          ) : layout === "ena-space" ? (
            <SenaEnaSpacePlot
              model={model}
              enaManifest={enaManifest}
              layers={layers}
              threshold={threshold}
              selectedId={selectedId}
              onSelect={onCanvasSelect}
              zoom={fusionPlotZoom}
              className="h-[min(48dvh,34rem)] min-h-[22rem]"
            />
          ) : (
            <Canvas
              model={model}
              layout={layout}
              jointEmbeddingOperator={jointEmbeddingOperator}
              enaManifest={enaManifest}
              layers={layers}
              threshold={threshold}
              selectedId={selectedId}
              revealedLabelIds={revealedLabelIds}
              onSelect={onCanvasSelect}
              zoom={fusionPlotZoom}
              className="h-[min(48dvh,34rem)] min-h-[22rem]"
            />
          )}
        </div>
      </div>
      <ActivePlotViewToolbar
        active={activePlotView}
        isOpen={isPlotSwitcherOpen}
        onToggle={onPlotSwitcherToggle}
        onSelect={onPlotViewSelect}
        plotViewOptions={plotViewOptions}
      />
      <FusionLayerKey model={model} layers={layers} threshold={threshold} alpha={alpha} beta={beta} gamma={gamma} />
    </section>
  );
}
