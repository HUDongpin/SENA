import type { WorkspaceReportAndStatsDeckPropGroup } from "./workspace-report-and-stats-deck-prop-group";

export type WorkspaceReportAndStatsDeckEvidencePropGroup = Pick<WorkspaceReportAndStatsDeckPropGroup,
  | "evidenceLedger"
  | "evidenceSourceFilter"
  | "onEvidenceSourceFilterChange"
  | "onExportEvidenceLedgerJson"
>;

export function buildWorkspaceReportAndStatsDeckEvidenceProps(
  props: WorkspaceReportAndStatsDeckEvidencePropGroup
): WorkspaceReportAndStatsDeckEvidencePropGroup {
  return props;
}
