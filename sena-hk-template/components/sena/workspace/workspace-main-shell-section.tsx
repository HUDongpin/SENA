import type { ComponentProps } from "react";
import { FusionPlotMaximizedOverlay } from "./fusion-plot-overlay";
import { WorkspaceCentralPlotDeck } from "./workspace-central-plot-deck";
import { WorkspaceHeaderSection } from "./workspace-header-section";
import { WorkspaceLeftRailPanelSection } from "./workspace-left-rail-panel-section";
import { WorkspaceReportAndStatsDeckSection } from "./workspace-report-and-stats-deck-section";
import { WorkspaceRightInspectorColumn } from "./workspace-right-inspector-column";
import { WorkspaceRail } from "./workspace-shell-panels";

export type WorkspaceMainShellSectionProps = {
  isFusionPlotMaximized: boolean;
  fusionPlotMaximizedOverlayProps: ComponentProps<typeof FusionPlotMaximizedOverlay>;
  headerProps: ComponentProps<typeof WorkspaceHeaderSection>;
  railProps: ComponentProps<typeof WorkspaceRail>;
  leftRailProps: ComponentProps<typeof WorkspaceLeftRailPanelSection>;
  centralPlotDeckProps: ComponentProps<typeof WorkspaceCentralPlotDeck>;
  rightInspectorProps: ComponentProps<typeof WorkspaceRightInspectorColumn>;
  reportAndStatsDeckProps: ComponentProps<typeof WorkspaceReportAndStatsDeckSection>;
};

export function WorkspaceMainShellSection({
  isFusionPlotMaximized,
  fusionPlotMaximizedOverlayProps,
  headerProps,
  railProps,
  leftRailProps,
  centralPlotDeckProps,
  rightInspectorProps,
  reportAndStatsDeckProps
}: WorkspaceMainShellSectionProps) {
  return (
    <section data-theme="light" className="min-h-screen bg-background text-slate-950">
      {isFusionPlotMaximized && <FusionPlotMaximizedOverlay {...fusionPlotMaximizedOverlayProps} />}
      <div className="mx-auto min-h-screen overflow-hidden border border-cardBorder/70 bg-background/80 shadow-soft 2xl:max-w-[118rem]">
        <WorkspaceHeaderSection {...headerProps} />

        <div className="grid min-h-[calc(100vh-3rem)] xl:grid-cols-[4rem_19rem_minmax(0,1fr)_25rem]">
          <WorkspaceRail {...railProps} />

          <WorkspaceLeftRailPanelSection {...leftRailProps} />

          <main className="order-1 min-w-0 p-4 xl:order-none">
            <WorkspaceCentralPlotDeck {...centralPlotDeckProps} />
          </main>

          <WorkspaceRightInspectorColumn {...rightInspectorProps} />
        </div>
      </div>

      <WorkspaceReportAndStatsDeckSection {...reportAndStatsDeckProps} />
    </section>
  );
}
