import type { WorkspaceReportAndStatsDeckEvidencePropGroup } from "./workspace-report-and-stats-deck-evidence-prop-group";

export type WorkspaceReportAndStatsDeckEvidenceFieldPropGroup = Pick<WorkspaceReportAndStatsDeckEvidencePropGroup,
  | "evidenceLedger"
  | "evidenceSourceFilter"
  | "onEvidenceSourceFilterChange"
  | "onExportEvidenceLedgerJson"
>;

export function buildWorkspaceReportAndStatsDeckEvidenceFieldProps(
  props: WorkspaceReportAndStatsDeckEvidenceFieldPropGroup
): WorkspaceReportAndStatsDeckEvidenceFieldPropGroup {
  return props;
}
