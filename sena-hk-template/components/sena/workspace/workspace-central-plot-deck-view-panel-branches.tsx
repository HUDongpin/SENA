import type { SenaPlotView } from "./plot-tools-panel";
import type { WorkspaceCentralPlotDeckRenderProps } from "./workspace-central-plot-deck-render-props";
import { CentralDualLensViewPanel } from "./workspace-central-plot-deck-dual-lens-panel";
import { CentralEnaSpaceViewPanel } from "./workspace-central-plot-deck-ena-space-panel";
import { CentralEvidenceLedgerViewPanel } from "./workspace-central-plot-deck-evidence-ledger-panel";
import { CentralFusionPlotViewPanel } from "./workspace-central-plot-deck-fusion-panel";
import { CentralMatrixViewPanel } from "./workspace-central-plot-deck-matrix-panel";
import { CentralSnaMetricsViewPanel } from "./workspace-central-plot-deck-sna-metrics-panel";
import { CentralTemporalPlotViewPanel } from "./workspace-central-plot-deck-temporal-panel";

export type CentralPlotDeckViewPanelBranchesProps = {
  activePlotView: SenaPlotView;
  viewPanelProps: WorkspaceCentralPlotDeckRenderProps;
};

export function CentralPlotDeckViewPanelBranches({
  activePlotView,
  viewPanelProps
}: CentralPlotDeckViewPanelBranchesProps) {
  return (
    <>
      {activePlotView === "fusion" && (
        <CentralFusionPlotViewPanel {...viewPanelProps} />
      )}

      {activePlotView === "temporal" && (
        <CentralTemporalPlotViewPanel {...viewPanelProps} />
      )}

      {activePlotView === "dual" && (
        <CentralDualLensViewPanel {...viewPanelProps} />
      )}

      {activePlotView === "ena" && (
        <CentralEnaSpaceViewPanel {...viewPanelProps} />
      )}

      {activePlotView === "sna" && (
        <CentralSnaMetricsViewPanel {...viewPanelProps} />
      )}

      {activePlotView === "evidence" && (
        <CentralEvidenceLedgerViewPanel {...viewPanelProps} />
      )}

      {activePlotView === "matrix" && (
        <CentralMatrixViewPanel {...viewPanelProps} />
      )}
    </>
  );
}
