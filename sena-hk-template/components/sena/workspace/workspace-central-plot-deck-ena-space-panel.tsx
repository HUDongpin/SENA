import { Canvas } from "./fusion-canvas";
import type { CentralEnaSpaceViewPanelProps } from "./workspace-central-plot-deck-view-panel-props";

export function CentralEnaSpaceViewPanel({
  model,
  jointEmbeddingOperator,
  enaManifest,
  layers,
  threshold,
  selectedId,
  revealedLabelIds,
  onCanvasSelect
}: CentralEnaSpaceViewPanelProps) {
  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-600">
        ENA Space uses jENA projected unit points and code node positions from the local JavaScript runtime.
      </div>
      <Canvas
        model={model}
        layout="ena-space"
        jointEmbeddingOperator={jointEmbeddingOperator}
        enaManifest={enaManifest}
        layers={layers}
        threshold={threshold}
        selectedId={selectedId}
        revealedLabelIds={revealedLabelIds}
        onSelect={onCanvasSelect}
        className="h-[34rem] rounded-lg border border-slate-200 bg-slate-50"
      />
    </div>
  );
}
