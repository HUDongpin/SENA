import { cn } from "@/lib/utils";
import {
  DataContractAuditPanel,
  type DataContractAuditPanelProps
} from "./data-contract-audit-panel";
import {
  ModelBuilderPanel,
  type ModelBuilderPanelProps
} from "./model-builder-panel";
import {
  PlotToolsPanel,
  type PlotToolsPanelProps
} from "./plot-tools-panel";
import {
  WorkflowRail,
  type WorkflowStepState,
  type WorkspaceRailMode,
  type WorkspaceRailPanelCopy
} from "./workspace-shell-panels";
import {
  WorkspaceDataImportFeedbackSection,
  type WorkspaceDataImportFeedbackSectionProps
} from "./workspace-data-import-feedback-section";
import {
  WorkspaceDataImportPanel,
  type WorkspaceDataImportPanelProps
} from "./workspace-data-import-panel";
import type { WorkspaceEnterpriseRuntimeSectionProps } from "./workspace-enterprise-runtime-section";
import {
  WorkspaceStatsPanel,
  type WorkspaceStatsPanelProps
} from "./workspace-stats-panel";

export type WorkspaceLeftRailPanelSectionProps = {
  activeRailPanel: WorkspaceRailPanelCopy[WorkspaceRailMode];
  workspaceRailMode: WorkspaceRailMode;
  dataImportProps: Omit<WorkspaceDataImportPanelProps, "children">;
  enterpriseRuntimeProps: WorkspaceEnterpriseRuntimeSectionProps["runtimeProps"];
  dataContractAuditProps: DataContractAuditPanelProps;
  dataImportFeedbackProps: WorkspaceDataImportFeedbackSectionProps;
  modelBuilderProps: ModelBuilderPanelProps;
  plotToolsProps: PlotToolsPanelProps;
  statsProps: WorkspaceStatsPanelProps;
  workflowStepStates: WorkflowStepState[];
};

export function WorkspaceLeftRailPanelSection({
  activeRailPanel,
  workspaceRailMode,
  dataImportProps,
  dataContractAuditProps,
  dataImportFeedbackProps,
  modelBuilderProps,
  plotToolsProps,
  statsProps,
  workflowStepStates
}: WorkspaceLeftRailPanelSectionProps) {
  return (
    <aside data-testid="workspace-left-panel" className="order-2 grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 border-b border-slate-300/70 bg-white p-4 xl:order-none xl:border-b-0 xl:border-r">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-black uppercase text-[#777]">{activeRailPanel.title}</div>
          <div className="mt-1 text-xs font-bold leading-5 text-slate-500">{activeRailPanel.subtitle}</div>
        </div>
        <span className="rounded-full border border-cyanGlow/35 bg-cyanGlow/10 px-2 py-1 text-[0.65rem] font-black uppercase text-cyanGlow">{activeRailPanel.badge}</span>
      </div>

      <div className={cn(workspaceRailMode !== "sets" && "hidden")}>
        <WorkspaceDataImportPanel {...dataImportProps}>
          <DataContractAuditPanel {...dataContractAuditProps} />
          <WorkspaceDataImportFeedbackSection {...dataImportFeedbackProps} />
        </WorkspaceDataImportPanel>
      </div>

      <div className={cn(workspaceRailMode !== "model" && "hidden")}>
        <ModelBuilderPanel {...modelBuilderProps} />
      </div>

      <div className={cn(workspaceRailMode !== "plots" && "hidden")}>
        <div className="grid gap-4">
          <PlotToolsPanel {...plotToolsProps} />
        </div>
      </div>

      <div className={cn(workspaceRailMode !== "stats" && "hidden")}>
        <div className="grid gap-4">
          <WorkspaceStatsPanel {...statsProps} />
        </div>
      </div>

      <div>
        <div className="mb-3 text-xs font-black uppercase text-slate-500">Research workflow</div>
        <WorkflowRail steps={workflowStepStates} activeId={activeRailPanel.activeWorkflowId} />
      </div>
    </aside>
  );
}
