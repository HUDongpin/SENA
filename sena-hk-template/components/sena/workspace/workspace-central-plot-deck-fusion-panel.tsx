import { Canvas } from "./fusion-canvas";
import { FusionLayerKey } from "./fusion-layer-key";
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
    <div
      data-testid="central-fusion-priority-plot"
      data-visual-role="fusion-plot-priority-stack"
      className="mb-5 grid gap-4"
    >
      {layout === "joint" && (
        <JointEmbeddingProvenanceStrip
          model={model}
          operator={jointEmbeddingOperator}
          onOperatorChange={onJointEmbeddingOperatorChange}
        />
      )}
      <div
        data-testid="central-fusion-canvas-frame"
        data-visual-role="fusion-canvas-current-window-frame"
        className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
      >
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
          className="h-[34rem]"
        />
      </div>
      <ActivePlotViewToolbar
        active={activePlotView}
        isOpen={isPlotSwitcherOpen}
        onToggle={onPlotSwitcherToggle}
        onSelect={onPlotViewSelect}
        plotViewOptions={plotViewOptions}
      />
      <FusionLayerKey model={model} layers={layers} threshold={threshold} alpha={alpha} beta={beta} gamma={gamma} />
    </div>
  );
}
