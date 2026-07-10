import type { WorkspaceCentralPlotEvidencePropGroup } from "./workspace-central-plot-evidence-prop-group";

export type WorkspaceCentralPlotEvidenceFieldPropGroup = Pick<WorkspaceCentralPlotEvidencePropGroup,
  | "fusionMathAudit"
  | "activeTransition"
  | "activeWindowBrief"
  | "evidenceLedger"
  | "evidenceSourceFilter"
  | "onEvidenceSourceFilterChange"
  | "onExportEvidenceLedgerJson"
>;

export function buildWorkspaceCentralPlotEvidenceFieldProps(
  props: WorkspaceCentralPlotEvidenceFieldPropGroup
): WorkspaceCentralPlotEvidenceFieldPropGroup {
  return props;
}
