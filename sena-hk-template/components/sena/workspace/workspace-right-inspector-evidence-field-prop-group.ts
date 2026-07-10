import type { WorkspaceRightInspectorEvidencePropGroup } from "./workspace-right-inspector-evidence-prop-group";

export type WorkspaceRightInspectorEvidenceFieldPropGroup = Pick<WorkspaceRightInspectorEvidencePropGroup,
  | "fusionMathAudit"
  | "visibleEdgeStrokeScale"
  | "jenaConceptPairHandoffRows"
  | "jsnaSocialTieHandoffRows"
  | "showArchivedFormulaPanel"
  | "onExportMathAudit"
  | "onExportMethodProtocol"
  | "onExportVisualGrammar"
>;

export function buildWorkspaceRightInspectorEvidenceFieldProps(
  props: WorkspaceRightInspectorEvidenceFieldPropGroup
): WorkspaceRightInspectorEvidenceFieldPropGroup {
  return props;
}
