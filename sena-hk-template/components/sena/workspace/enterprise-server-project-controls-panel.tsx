import {
  Database,
  Download,
  RotateCcw,
  Sigma
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import type { EnterpriseProjectSummary } from "./enterprise-contracts";

export type EnterpriseServerProjectControlsPanelProps = {
  activeEnterpriseProjectId: string;
  busy: boolean;
  hasUser: boolean;
  enterpriseProjects: EnterpriseProjectSummary[];
  onProjectChange: (projectId: string) => void;
  onSaveEnterpriseProject: () => unknown | Promise<unknown>;
  onRunEnterpriseAnalysis: () => unknown | Promise<unknown>;
  onRefreshEnterpriseState: () => unknown | Promise<unknown>;
  onExportEnterpriseCleaningManifestJson: () => unknown | Promise<unknown>;
};

export function EnterpriseServerProjectControlsPanel({
  activeEnterpriseProjectId,
  busy,
  hasUser,
  enterpriseProjects,
  onProjectChange,
  onSaveEnterpriseProject,
  onRunEnterpriseAnalysis,
  onRefreshEnterpriseState,
  onExportEnterpriseCleaningManifestJson
}: EnterpriseServerProjectControlsPanelProps) {
  const userActionDisabled = !hasUser || busy;

  return (
    <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
      <select
        value={activeEnterpriseProjectId}
        onChange={(event) => onProjectChange(event.currentTarget.value)}
        disabled={userActionDisabled}
        className="h-10 rounded-lg border border-cardBorder/55 bg-background/55 px-3 text-sm font-semibold text-foreground outline-none focus:border-cyanGlow disabled:opacity-50"
      >
        <option value="">Server projects ({enterpriseProjects.length})</option>
        {enterpriseProjects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.title} · {project.datasetCounts.people}P/{project.datasetCounts.codes}C · {project.activeWindowLabel}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => void onSaveEnterpriseProject()} disabled={userActionDisabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
        <Database className="h-4 w-4" /> {activeEnterpriseProjectId ? "Update server project" : "Save server project"}
      </button>
      <button type="button" onClick={() => void onRunEnterpriseAnalysis()} disabled={userActionDisabled} className={buttonStyles({ variant: "secondary", size: "sm" })}>
        <Sigma className="h-4 w-4" /> Server analysis
      </button>
      <button type="button" onClick={() => void onRefreshEnterpriseState()} disabled={busy} className={buttonStyles({ variant: "secondary", size: "sm" })}>
        <RotateCcw className="h-4 w-4" /> Refresh
      </button>
      <button
        type="button"
        data-testid="enterprise-import-cleaning-manifest-export"
        onClick={() => void onExportEnterpriseCleaningManifestJson()}
        disabled={busy}
        className={buttonStyles({ variant: "secondary", size: "sm" })}
      >
        <Download className="h-4 w-4" /> Export cleaning manifest
      </button>
    </div>
  );
}
