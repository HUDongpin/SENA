import type { WorkspaceRightInspectorEvidencePropGroup } from "./workspace-right-inspector-evidence-prop-group";

export type WorkspaceRightInspectorEvidenceCompositionFieldPropGroup = Pick<WorkspaceRightInspectorEvidencePropGroup,
  | "fusionMathAudit"
  | "visibleEdgeStrokeScale"
  | "jenaConceptPairHandoffRows"
  | "jsnaSocialTieHandoffRows"
  | "showArchivedFormulaPanel"
  | "onExportMathAudit"
  | "onExportMethodProtocol"
  | "onExportVisualGrammar"
>;

export function buildWorkspaceRightInspectorEvidenceCompositionFieldProps(
  props: WorkspaceRightInspectorEvidenceCompositionFieldPropGroup
): WorkspaceRightInspectorEvidenceCompositionFieldPropGroup {
  return props;
}
