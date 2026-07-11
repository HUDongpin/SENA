import { SocialMetricsTable } from "./sena-stats-tables";
import type { CentralSnaMetricsViewPanelProps } from "./workspace-central-plot-deck-view-panel-props";
import { MetricCell } from "./workspace-primitives";

function formatCentralPlotNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export function CentralSnaMetricsViewPanel({ model }: CentralSnaMetricsViewPanelProps) {
  return (
    <div className="grid gap-4">
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
