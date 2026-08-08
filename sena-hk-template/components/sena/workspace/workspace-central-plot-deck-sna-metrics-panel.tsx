import { FusionOrbitLayer } from "./fusion-orbit-layer";
import { SocialMetricsTable } from "./sena-stats-tables";
import type { CentralSnaMetricsViewPanelProps } from "./workspace-central-plot-deck-view-panel-props";
import { MetricCell } from "./workspace-primitives";

function formatCentralPlotNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export function CentralSnaMetricsViewPanel({
  model,
  selectedId,
  onCanvasSelect,
  threshold
}: CentralSnaMetricsViewPanelProps) {
  return (
    <div className="grid gap-4">
      {/* The SNA view used to be numbers about a graph nobody could see. The
          orbit layer draws the graph itself — same component the Fusion plane
          rings, mounted here with no plane behind it. */}
      <svg
        viewBox="0 0 1240 840"
        className="h-[34rem] w-full max-w-full"
        role="img"
        aria-label="SENA social orbit sociogram"
        data-testid="sena-sna-orbit-sociogram"
        data-visual-scope="sena-sna-orbit"
      >
        <FusionOrbitLayer
          model={model}
          threshold={threshold}
          selectedId={selectedId}
          onSelect={onCanvasSelect}
        />
      </svg>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCell label="Tie count" value={model.socialReport.graph.tieCount} />
        <MetricCell label="Density" value={formatCentralPlotNumber(model.socialReport.graph.density)} />
        <MetricCell label="Reciprocity" value={formatCentralPlotNumber(model.socialReport.graph.reciprocity)} />
        <MetricCell label="Avg path" value={formatCentralPlotNumber(model.socialReport.graph.averagePathLength)} />
        <MetricCell label="Components" value={model.socialReport.graph.componentCount} />
        <MetricCell label="Largest comp." value={model.socialReport.graph.largestComponentSize} />
      </div>
      <SocialMetricsTable actors={model.socialReport.actors} />
    </div>
  );
}
