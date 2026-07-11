import type { SenaPlotView } from "./plot-tools-panel";
import type { WorkspaceRailPropGroup } from "./workspace-rail-prop-group";

type WorkspaceRailMode = Parameters<WorkspaceRailPropGroup["onChange"]>[0];

export type WorkspaceRailModeHandlerPropGroup = Pick<WorkspaceRailPropGroup, "onChange">;

export type WorkspaceRailModeHandlerDependencies = {
  onWorkspaceRailModeChange: (mode: WorkspaceRailMode) => void;
  onPlotSwitcherOpenChange: (isOpen: boolean) => void;
  onActivePlotViewChange: (view: Extract<SenaPlotView, "fusion" | "sna">) => void;
};

export function buildWorkspaceRailModeHandlerProps({
  onWorkspaceRailModeChange,
  onPlotSwitcherOpenChange,
  onActivePlotViewChange
}: WorkspaceRailModeHandlerDependencies): WorkspaceRailModeHandlerPropGroup {
  return {
    onChange: (mode) => {
      onWorkspaceRailModeChange(mode);
      onPlotSwitcherOpenChange(false);
      if (mode === "stats") {
        onActivePlotViewChange("sna");
        return;
      }
      if (mode === "plots") {
        onActivePlotViewChange("fusion");
      }
    }
  };
}
