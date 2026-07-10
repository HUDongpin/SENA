import {
  buildWorkspaceRightInspectorProps,
  type WorkspaceRightInspectorPropGroup
} from "./workspace-right-inspector-prop-group";
import { buildWorkspaceRightInspectorCompositionProps } from "./workspace-right-inspector-composition-prop-group";
import {
  buildWorkspaceRightInspectorCompositionFieldProps,
  type WorkspaceRightInspectorCompositionFieldPropGroup
} from "./workspace-right-inspector-composition-field-prop-group";
import { buildWorkspaceRightInspectorBoundaryCompositionFieldProps } from "./workspace-right-inspector-boundary-composition-field-prop-group";
import { buildWorkspaceRightInspectorBoundaryCompositionProps } from "./workspace-right-inspector-boundary-composition-prop-group";
import { buildWorkspaceRightInspectorLayoutProps } from "./workspace-right-inspector-layout-prop-group";
import {
  buildWorkspaceRightInspectorLayoutFieldProps,
  type WorkspaceRightInspectorLayoutFieldPropGroup
} from "./workspace-right-inspector-layout-field-prop-group";
import { buildWorkspaceRightInspectorLayoutCompositionFieldProps } from "./workspace-right-inspector-layout-composition-field-prop-group";
import { buildWorkspaceRightInspectorLayoutCompositionProps } from "./workspace-right-inspector-layout-composition-prop-group";
import { buildWorkspaceRightInspectorLayoutBoundaryCompositionFieldProps } from "./workspace-right-inspector-layout-boundary-composition-field-prop-group";
import { buildWorkspaceRightInspectorLayoutBoundaryCompositionProps } from "./workspace-right-inspector-layout-boundary-composition-prop-group";
import { buildWorkspaceRightInspectorEvidenceProps } from "./workspace-right-inspector-evidence-prop-group";
import {
  buildWorkspaceRightInspectorEvidenceFieldProps,
  type WorkspaceRightInspectorEvidenceFieldPropGroup
} from "./workspace-right-inspector-evidence-field-prop-group";
import { buildWorkspaceRightInspectorEvidenceCompositionFieldProps } from "./workspace-right-inspector-evidence-composition-field-prop-group";
import { buildWorkspaceRightInspectorEvidenceCompositionProps } from "./workspace-right-inspector-evidence-composition-prop-group";
import { buildWorkspaceRightInspectorEvidenceBoundaryCompositionFieldProps } from "./workspace-right-inspector-evidence-boundary-composition-field-prop-group";
import { buildWorkspaceRightInspectorEvidenceBoundaryCompositionProps } from "./workspace-right-inspector-evidence-boundary-composition-prop-group";
import { buildWorkspaceRightInspectorModelProps } from "./workspace-right-inspector-model-prop-group";
import {
  buildWorkspaceRightInspectorModelFieldProps,
  type WorkspaceRightInspectorModelFieldPropGroup
} from "./workspace-right-inspector-model-field-prop-group";
import { buildWorkspaceRightInspectorModelBoundaryCompositionFieldProps } from "./workspace-right-inspector-model-boundary-composition-field-prop-group";
import { buildWorkspaceRightInspectorModelBoundaryCompositionProps } from "./workspace-right-inspector-model-boundary-composition-prop-group";
import { buildWorkspaceRightInspectorSelectionProps } from "./workspace-right-inspector-selection-prop-group";
import {
  buildWorkspaceRightInspectorSelectionFieldProps,
  type WorkspaceRightInspectorSelectionFieldPropGroup
} from "./workspace-right-inspector-selection-field-prop-group";
import { buildWorkspaceRightInspectorSelectionBoundaryCompositionFieldProps } from "./workspace-right-inspector-selection-boundary-composition-field-prop-group";
import { buildWorkspaceRightInspectorSelectionBoundaryCompositionProps } from "./workspace-right-inspector-selection-boundary-composition-prop-group";

export type WorkspaceRightInspectorContainerPropsInput =
  WorkspaceRightInspectorLayoutFieldPropGroup &
  WorkspaceRightInspectorEvidenceFieldPropGroup &
  WorkspaceRightInspectorModelFieldPropGroup &
  WorkspaceRightInspectorSelectionFieldPropGroup;

export function buildWorkspaceRightInspectorContainerProps({
  activeTemporalWindow,
  alpha,
  beta,
  enaManifest,
  fusionMathAudit,
  gamma,
  jenaConceptPairHandoffRows,
  jointEmbeddingOperator,
  jsnaSocialTieHandoffRows,
  layerCopy,
  layers,
  layout,
  layoutOptions,
  model,
  onCanvasSelect,
  onExportMathAudit,
  onExportMethodProtocol,
  onExportVisualGrammar,
  onJointEmbeddingOperatorChange,
  onLayoutChange,
  revealedLabelIds,
  selected,
  selectedId,
  selectedLayoutNote,
  showArchivedFormulaPanel,
  threshold,
  timelineModel,
  visibleEdgeStrokeScale
}: WorkspaceRightInspectorContainerPropsInput): WorkspaceRightInspectorPropGroup {
  const workspaceRightInspectorLayoutFieldProps = buildWorkspaceRightInspectorLayoutFieldProps({
    layout,
    selectedLayoutNote,
    onLayoutChange,
    layoutOptions,
    jointEmbeddingOperator,
    onJointEmbeddingOperatorChange
  });

  const workspaceRightInspectorLayoutCompositionFieldProps = buildWorkspaceRightInspectorLayoutCompositionFieldProps({
    ...workspaceRightInspectorLayoutFieldProps,
  });
  const workspaceRightInspectorLayoutCompositionProps = buildWorkspaceRightInspectorLayoutCompositionProps({
    ...workspaceRightInspectorLayoutCompositionFieldProps,
  });
  const workspaceRightInspectorLayoutBoundaryCompositionFieldProps = buildWorkspaceRightInspectorLayoutBoundaryCompositionFieldProps({
    ...workspaceRightInspectorLayoutCompositionProps,
  });
  const workspaceRightInspectorLayoutBoundaryCompositionProps = buildWorkspaceRightInspectorLayoutBoundaryCompositionProps({
    ...workspaceRightInspectorLayoutBoundaryCompositionFieldProps,
  });
  const workspaceRightInspectorLayoutProps = buildWorkspaceRightInspectorLayoutProps({
    ...workspaceRightInspectorLayoutBoundaryCompositionProps,
  });

  const workspaceRightInspectorEvidenceFieldProps = buildWorkspaceRightInspectorEvidenceFieldProps({
    fusionMathAudit,
    visibleEdgeStrokeScale,
    jenaConceptPairHandoffRows,
    jsnaSocialTieHandoffRows,
    showArchivedFormulaPanel,
    onExportMathAudit,
    onExportMethodProtocol,
    onExportVisualGrammar
  });

  const workspaceRightInspectorEvidenceCompositionFieldProps = buildWorkspaceRightInspectorEvidenceCompositionFieldProps({
    ...workspaceRightInspectorEvidenceFieldProps,
  });
  const workspaceRightInspectorEvidenceCompositionProps = buildWorkspaceRightInspectorEvidenceCompositionProps({
    ...workspaceRightInspectorEvidenceCompositionFieldProps,
  });
  const workspaceRightInspectorEvidenceBoundaryCompositionFieldProps = buildWorkspaceRightInspectorEvidenceBoundaryCompositionFieldProps({
    ...workspaceRightInspectorEvidenceCompositionProps,
  });
  const workspaceRightInspectorEvidenceBoundaryCompositionProps = buildWorkspaceRightInspectorEvidenceBoundaryCompositionProps({
    ...workspaceRightInspectorEvidenceBoundaryCompositionFieldProps,
  });
  const workspaceRightInspectorEvidenceProps = buildWorkspaceRightInspectorEvidenceProps({
    ...workspaceRightInspectorEvidenceBoundaryCompositionProps,
  });

  const workspaceRightInspectorModelFieldProps = buildWorkspaceRightInspectorModelFieldProps({
    model,
    timelineModel,
    enaManifest,
    layers,
    layerCopy,
    threshold,
    alpha,
    beta,
    gamma,
    activeTemporalWindow
  });

  const workspaceRightInspectorModelBoundaryCompositionFieldProps = buildWorkspaceRightInspectorModelBoundaryCompositionFieldProps({
    ...workspaceRightInspectorModelFieldProps,
  });
  const workspaceRightInspectorModelBoundaryCompositionProps = buildWorkspaceRightInspectorModelBoundaryCompositionProps({
    ...workspaceRightInspectorModelBoundaryCompositionFieldProps,
  });
  const workspaceRightInspectorModelProps = buildWorkspaceRightInspectorModelProps({
    ...workspaceRightInspectorModelBoundaryCompositionProps,
  });

  const workspaceRightInspectorSelectionFieldProps = buildWorkspaceRightInspectorSelectionFieldProps({
    selected,
    selectedId,
    revealedLabelIds,
    onCanvasSelect
  });

  const workspaceRightInspectorSelectionBoundaryCompositionFieldProps = buildWorkspaceRightInspectorSelectionBoundaryCompositionFieldProps({
    ...workspaceRightInspectorSelectionFieldProps,
  });
  const workspaceRightInspectorSelectionBoundaryCompositionProps = buildWorkspaceRightInspectorSelectionBoundaryCompositionProps({
    ...workspaceRightInspectorSelectionBoundaryCompositionFieldProps,
  });
  const workspaceRightInspectorSelectionProps = buildWorkspaceRightInspectorSelectionProps({
    ...workspaceRightInspectorSelectionBoundaryCompositionProps,
  });

  const workspaceRightInspectorCompositionFieldProps = buildWorkspaceRightInspectorCompositionFieldProps({
    ...workspaceRightInspectorModelProps,
    ...workspaceRightInspectorLayoutProps,
    ...workspaceRightInspectorSelectionProps,
    ...workspaceRightInspectorEvidenceProps,
  } satisfies WorkspaceRightInspectorCompositionFieldPropGroup);

  const workspaceRightInspectorCompositionProps = buildWorkspaceRightInspectorCompositionProps({
    ...workspaceRightInspectorCompositionFieldProps,
  });
  const workspaceRightInspectorBoundaryCompositionFieldProps = buildWorkspaceRightInspectorBoundaryCompositionFieldProps({
    ...workspaceRightInspectorCompositionProps,
  });
  const workspaceRightInspectorBoundaryCompositionProps = buildWorkspaceRightInspectorBoundaryCompositionProps({
    ...workspaceRightInspectorBoundaryCompositionFieldProps,
  });

  return buildWorkspaceRightInspectorProps({
    ...workspaceRightInspectorBoundaryCompositionProps,
  });
}
