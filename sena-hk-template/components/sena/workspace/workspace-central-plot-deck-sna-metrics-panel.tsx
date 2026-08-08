import type { SenaOrbitGeometry } from "@/lib/sena/orbit-layout";
import { FusionOrbitLayer } from "./fusion-orbit-layer";
import { SocialMetricsTable } from "./sena-stats-tables";
import type { CentralSnaMetricsViewPanelProps } from "./workspace-central-plot-deck-view-panel-props";
import { MetricCell } from "./workspace-primitives";

/** This sociogram's coordinate space — no plane inside it, unlike Fusion's. */
export const SNA_ORBIT_SOCIOGRAM_CANVAS = { width: 1240, height: 840 } as const;

/**
 * The ring this standalone sociogram mounts the shared orbit layer at.
 *
 * The module default (rx 545, ry 348) is sized for a surface that only has to
 * clear the outermost *node* plus its label — it does not pay for the lane
 * band, and on the shipped pilot the band is five lanes deep
 * (`laneBaseOffset + 4 * laneStep` = 44 + 104 = 148px outside the ring). At the
 * default the pilot's lanes reach x 1287 and y 916 on a 1240x840 viewBox and
 * are silently clipped on three sides, with the right-cardinal person's
 * always-on name truncated at the frame.
 *
 * rx 470 / ry 250 pays for the whole band: the ring's bottom sits at 670, plus
 * 148 leaves 22px to the edge, and the right cardinal's node (max radius 40)
 * plus its label box clears by ~50px. That budgets six lanes before a denser
 * dataset would need a bigger canvas. Pinned against the full pilot in
 * `lib/sena/__tests__/fusion-orbit-layer.test.tsx`.
 */
export const SNA_ORBIT_SOCIOGRAM_GEOMETRY: SenaOrbitGeometry = {
  center: { x: SNA_ORBIT_SOCIOGRAM_CANVAS.width / 2, y: SNA_ORBIT_SOCIOGRAM_CANVAS.height / 2 },
  rx: 470,
  ry: 250
};

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
        viewBox={`0 0 ${SNA_ORBIT_SOCIOGRAM_CANVAS.width} ${SNA_ORBIT_SOCIOGRAM_CANVAS.height}`}
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
          geometry={SNA_ORBIT_SOCIOGRAM_GEOMETRY}
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
