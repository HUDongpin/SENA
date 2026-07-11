import type { WorkspaceCentralPlotDeckPropGroup } from "./workspace-central-plot-deck-prop-group";

export type WorkspaceCentralPlotEvidencePropGroup = Pick<WorkspaceCentralPlotDeckPropGroup,
  | "fusionMathAudit"
  | "activeTransition"
  | "activeWindowBrief"
  | "evidenceLedger"
  | "evidenceSourceFilter"
  | "onEvidenceSourceFilterChange"
  | "onExportEvidenceLedgerJson"
>;

export function buildWorkspaceCentralPlotEvidenceProps(
  props: WorkspaceCentralPlotEvidencePropGroup
): WorkspaceCentralPlotEvidencePropGroup {
  return props;
}
