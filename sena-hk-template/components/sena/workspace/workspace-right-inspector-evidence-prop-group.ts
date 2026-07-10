import type { WorkspaceRightInspectorPropGroup } from "./workspace-right-inspector-prop-group";

export type WorkspaceRightInspectorEvidencePropGroup = Pick<WorkspaceRightInspectorPropGroup,
  | "fusionMathAudit"
  | "visibleEdgeStrokeScale"
  | "jenaConceptPairHandoffRows"
  | "jsnaSocialTieHandoffRows"
  | "showArchivedFormulaPanel"
  | "onExportMathAudit"
  | "onExportMethodProtocol"
  | "onExportVisualGrammar"
>;

export function buildWorkspaceRightInspectorEvidenceProps(
  props: WorkspaceRightInspectorEvidencePropGroup
): WorkspaceRightInspectorEvidencePropGroup {
  return props;
}
