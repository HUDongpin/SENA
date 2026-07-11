import {
  buildWorkspaceCentralPlotDeckProps,
  type WorkspaceCentralPlotDeckPropGroup
} from "./workspace-central-plot-deck-prop-group";
import { buildWorkspaceCentralPlotDeckCompositionProps } from "./workspace-central-plot-deck-composition-prop-group";
import {
  buildWorkspaceCentralPlotDeckCompositionFieldProps,
  type WorkspaceCentralPlotDeckCompositionFieldPropGroup
} from "./workspace-central-plot-deck-composition-field-prop-group";
import { buildWorkspaceCentralPlotDeckBoundaryCompositionFieldProps } from "./workspace-central-plot-deck-boundary-composition-field-prop-group";
import { buildWorkspaceCentralPlotDeckBoundaryCompositionProps } from "./workspace-central-plot-deck-boundary-composition-prop-group";
import { buildWorkspaceCentralPlotTemporalControlsProps } from "./workspace-central-plot-temporal-controls-prop-group";
import {
  buildWorkspaceCentralPlotTemporalControlsFieldProps,
  type WorkspaceCentralPlotTemporalControlsFieldPropGroup
} from "./workspace-central-plot-temporal-controls-field-prop-group";
import { buildWorkspaceCentralPlotTemporalControlsCompositionFieldProps } from "./workspace-central-plot-temporal-controls-composition-field-prop-group";
import { buildWorkspaceCentralPlotTemporalControlsCompositionProps } from "./workspace-central-plot-temporal-controls-composition-prop-group";
import { buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionFieldProps } from "./workspace-central-plot-temporal-controls-boundary-composition-field-prop-group";
import { buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionProps } from "./workspace-central-plot-temporal-controls-boundary-composition-prop-group";
import { buildWorkspaceCentralPlotEvidenceProps } from "./workspace-central-plot-evidence-prop-group";
import {
  buildWorkspaceCentralPlotEvidenceFieldProps,
  type WorkspaceCentralPlotEvidenceFieldPropGroup
} from "./workspace-central-plot-evidence-field-prop-group";
import { buildWorkspaceCentralPlotEvidenceCompositionFieldProps } from "./workspace-central-plot-evidence-composition-field-prop-group";
import { buildWorkspaceCentralPlotEvidenceCompositionProps } from "./workspace-central-plot-evidence-composition-prop-group";
import { buildWorkspaceCentralPlotEvidenceBoundaryCompositionFieldProps } from "./workspace-central-plot-evidence-boundary-composition-field-prop-group";
import { buildWorkspaceCentralPlotEvidenceBoundaryCompositionProps } from "./workspace-central-plot-evidence-boundary-composition-prop-group";
import { buildWorkspaceCentralPlotDataViewProps } from "./workspace-central-plot-data-view-prop-group";
import {
  buildWorkspaceCentralPlotDataViewFieldProps,
  type WorkspaceCentralPlotDataViewFieldPropGroup
} from "./workspace-central-plot-data-view-field-prop-group";
import { buildWorkspaceCentralPlotDataViewCompositionFieldProps } from "./workspace-central-plot-data-view-composition-field-prop-group";
import { buildWorkspaceCentralPlotDataViewCompositionProps } from "./workspace-central-plot-data-view-composition-prop-group";
import { buildWorkspaceCentralPlotDataViewBoundaryCompositionFieldProps } from "./workspace-central-plot-data-view-boundary-composition-field-prop-group";
import { buildWorkspaceCentralPlotDataViewBoundaryCompositionProps } from "./workspace-central-plot-data-view-boundary-composition-prop-group";
import { buildWorkspaceCentralPlotInteractionProps } from "./workspace-central-plot-interaction-prop-group";
import {
  buildWorkspaceCentralPlotInteractionFieldProps,
  type WorkspaceCentralPlotInteractionFieldPropGroup
} from "./workspace-central-plot-interaction-field-prop-group";
import { buildWorkspaceCentralPlotInteractionCompositionFieldProps } from "./workspace-central-plot-interaction-composition-field-prop-group";
import { buildWorkspaceCentralPlotInteractionCompositionProps } from "./workspace-central-plot-interaction-composition-prop-group";
import { buildWorkspaceCentralPlotInteractionBoundaryCompositionFieldProps } from "./workspace-central-plot-interaction-boundary-composition-field-prop-group";
import { buildWorkspaceCentralPlotInteractionBoundaryCompositionProps } from "./workspace-central-plot-interaction-boundary-composition-prop-group";
import { buildWorkspaceCentralPlotModelProps } from "./workspace-central-plot-model-prop-group";
import {
  buildWorkspaceCentralPlotModelFieldProps,
  type WorkspaceCentralPlotModelFieldPropGroup
} from "./workspace-central-plot-model-field-prop-group";
import { buildWorkspaceCentralPlotModelCompositionFieldProps } from "./workspace-central-plot-model-composition-field-prop-group";
import { buildWorkspaceCentralPlotModelCompositionProps } from "./workspace-central-plot-model-composition-prop-group";
import { buildWorkspaceCentralPlotModelBoundaryCompositionFieldProps } from "./workspace-central-plot-model-boundary-composition-field-prop-group";
import { buildWorkspaceCentralPlotModelBoundaryCompositionProps } from "./workspace-central-plot-model-boundary-composition-prop-group";
import { buildWorkspaceCentralPlotViewStateProps } from "./workspace-central-plot-view-state-prop-group";
import {
  buildWorkspaceCentralPlotViewStateFieldProps,
  type WorkspaceCentralPlotViewStateFieldPropGroup
} from "./workspace-central-plot-view-state-field-prop-group";
import { buildWorkspaceCentralPlotViewStateCompositionFieldProps } from "./workspace-central-plot-view-state-composition-field-prop-group";
import { buildWorkspaceCentralPlotViewStateCompositionProps } from "./workspace-central-plot-view-state-composition-prop-group";
import { buildWorkspaceCentralPlotViewStateBoundaryCompositionFieldProps } from "./workspace-central-plot-view-state-boundary-composition-field-prop-group";
import { buildWorkspaceCentralPlotViewStateBoundaryCompositionProps } from "./workspace-central-plot-view-state-boundary-composition-prop-group";

export type WorkspaceCentralPlotDeckContainerPropsInput =
  WorkspaceCentralPlotTemporalControlsFieldPropGroup &
  WorkspaceCentralPlotEvidenceFieldPropGroup &
  WorkspaceCentralPlotDataViewFieldPropGroup &
  WorkspaceCentralPlotInteractionFieldPropGroup &
  WorkspaceCentralPlotViewStateFieldPropGroup &
  WorkspaceCentralPlotModelFieldPropGroup;

export function buildWorkspaceCentralPlotDeckContainerProps({
  activePlotView,
  activeTemporalIndex,
  activeTemporalWindow,
  activeTransition,
  activeWindowBrief,
  alpha,
  animationMs,
  beta,
  enaManifest,
  evidenceLedger,
  evidenceSourceFilter,
  fusionMathAudit,
  fusionPlotZoom,
  gamma,
  isAnimating,
  isPlotSwitcherOpen,
  isWorkspaceDataViewOpen,
  jointEmbeddingOperator,
  layers,
  layout,
  model,
  movingWindowSize,
  movingWindowStep,
  onActiveTemporalIndexChange,
  onAnimationMsChange,
  onAnimationToggle,
  onCanvasSelect,
  onEvidenceSourceFilterChange,
  onExportEvidenceLedgerJson,
  onJointEmbeddingOperatorChange,
  onMaximizeFusionPlot,
  onMovingWindowSizeChange,
  onMovingWindowStepChange,
  onPlotSwitcherToggle,
  onPlotViewSelect,
  onTemporalModeChange,
  onTurnWindowRadiusChange,
  onWorkspaceDataViewToggle,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  plotViewOptions,
  revealedLabelIds,
  selectedId,
  snaManifest,
  temporalMode,
  temporalRuntimeTrace,
  temporalWindows,
  threshold,
  turnWindowRadius
}: WorkspaceCentralPlotDeckContainerPropsInput): WorkspaceCentralPlotDeckPropGroup {
  const workspaceCentralPlotTemporalControlsFieldProps = buildWorkspaceCentralPlotTemporalControlsFieldProps({
    activeTemporalIndex,
    onActiveTemporalIndexChange,
    temporalWindows,
    temporalMode,
    onTemporalModeChange,
    movingWindowSize,
    onMovingWindowSizeChange,
    movingWindowStep,
    onMovingWindowStepChange,
    turnWindowRadius,
    onTurnWindowRadiusChange,
    temporalRuntimeTrace,
    isAnimating,
    onAnimationToggle,
    animationMs,
    onAnimationMsChange
  });

  const workspaceCentralPlotTemporalControlsCompositionFieldProps = buildWorkspaceCentralPlotTemporalControlsCompositionFieldProps({
    ...workspaceCentralPlotTemporalControlsFieldProps,
  });
  const workspaceCentralPlotTemporalControlsCompositionProps = buildWorkspaceCentralPlotTemporalControlsCompositionProps({
    ...workspaceCentralPlotTemporalControlsCompositionFieldProps,
  });
  const workspaceCentralPlotTemporalControlsBoundaryCompositionFieldProps = buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionFieldProps({
    ...workspaceCentralPlotTemporalControlsCompositionProps,
  });
  const workspaceCentralPlotTemporalControlsBoundaryCompositionProps = buildWorkspaceCentralPlotTemporalControlsBoundaryCompositionProps({
    ...workspaceCentralPlotTemporalControlsBoundaryCompositionFieldProps,
  });
  const workspaceCentralPlotTemporalControlsProps = buildWorkspaceCentralPlotTemporalControlsProps({
    ...workspaceCentralPlotTemporalControlsBoundaryCompositionProps,
  });

  const workspaceCentralPlotEvidenceFieldProps = buildWorkspaceCentralPlotEvidenceFieldProps({
    fusionMathAudit,
    activeTransition,
    activeWindowBrief,
    evidenceLedger,
    evidenceSourceFilter,
    onEvidenceSourceFilterChange,
    onExportEvidenceLedgerJson
  });

  const workspaceCentralPlotEvidenceCompositionFieldProps = buildWorkspaceCentralPlotEvidenceCompositionFieldProps({
    ...workspaceCentralPlotEvidenceFieldProps,
  });
  const workspaceCentralPlotEvidenceCompositionProps = buildWorkspaceCentralPlotEvidenceCompositionProps({
    ...workspaceCentralPlotEvidenceCompositionFieldProps,
  });
  const workspaceCentralPlotEvidenceBoundaryCompositionFieldProps = buildWorkspaceCentralPlotEvidenceBoundaryCompositionFieldProps({
    ...workspaceCentralPlotEvidenceCompositionProps,
  });
  const workspaceCentralPlotEvidenceBoundaryCompositionProps = buildWorkspaceCentralPlotEvidenceBoundaryCompositionProps({
    ...workspaceCentralPlotEvidenceBoundaryCompositionFieldProps,
  });
  const workspaceCentralPlotEvidenceProps = buildWorkspaceCentralPlotEvidenceProps({
    ...workspaceCentralPlotEvidenceBoundaryCompositionProps,
  });

  const workspaceCentralPlotDataViewFieldProps = buildWorkspaceCentralPlotDataViewFieldProps({
    activeTemporalWindow,
    isWorkspaceDataViewOpen,
    onWorkspaceDataViewToggle
  });

  const workspaceCentralPlotDataViewCompositionFieldProps = buildWorkspaceCentralPlotDataViewCompositionFieldProps({
    ...workspaceCentralPlotDataViewFieldProps,
  });
  const workspaceCentralPlotDataViewCompositionProps = buildWorkspaceCentralPlotDataViewCompositionProps({
    ...workspaceCentralPlotDataViewCompositionFieldProps,
  });
  const workspaceCentralPlotDataViewBoundaryCompositionFieldProps = buildWorkspaceCentralPlotDataViewBoundaryCompositionFieldProps({
    ...workspaceCentralPlotDataViewCompositionProps,
  });
  const workspaceCentralPlotDataViewBoundaryCompositionProps = buildWorkspaceCentralPlotDataViewBoundaryCompositionProps({
    ...workspaceCentralPlotDataViewBoundaryCompositionFieldProps,
  });
  const workspaceCentralPlotDataViewProps = buildWorkspaceCentralPlotDataViewProps({
    ...workspaceCentralPlotDataViewBoundaryCompositionProps,
  });

  const workspaceCentralPlotInteractionFieldProps = buildWorkspaceCentralPlotInteractionFieldProps({
    jointEmbeddingOperator,
    onJointEmbeddingOperatorChange,
    selectedId,
    revealedLabelIds,
    onCanvasSelect,
    fusionPlotZoom,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onMaximizeFusionPlot
  });

  const workspaceCentralPlotInteractionCompositionFieldProps = buildWorkspaceCentralPlotInteractionCompositionFieldProps({
    ...workspaceCentralPlotInteractionFieldProps,
  });
  const workspaceCentralPlotInteractionCompositionProps = buildWorkspaceCentralPlotInteractionCompositionProps({
    ...workspaceCentralPlotInteractionCompositionFieldProps,
  });
  const workspaceCentralPlotInteractionBoundaryCompositionFieldProps = buildWorkspaceCentralPlotInteractionBoundaryCompositionFieldProps({
    ...workspaceCentralPlotInteractionCompositionProps,
  });
  const workspaceCentralPlotInteractionBoundaryCompositionProps = buildWorkspaceCentralPlotInteractionBoundaryCompositionProps({
    ...workspaceCentralPlotInteractionBoundaryCompositionFieldProps,
  });
  const workspaceCentralPlotInteractionProps = buildWorkspaceCentralPlotInteractionProps({
    ...workspaceCentralPlotInteractionBoundaryCompositionProps,
  });

  const workspaceCentralPlotViewStateFieldProps = buildWorkspaceCentralPlotViewStateFieldProps({
    activePlotView,
    isPlotSwitcherOpen,
    onPlotSwitcherToggle,
    onPlotViewSelect,
    plotViewOptions
  });

  const workspaceCentralPlotViewStateCompositionFieldProps = buildWorkspaceCentralPlotViewStateCompositionFieldProps({
    ...workspaceCentralPlotViewStateFieldProps,
  });
  const workspaceCentralPlotViewStateCompositionProps = buildWorkspaceCentralPlotViewStateCompositionProps({
    ...workspaceCentralPlotViewStateCompositionFieldProps,
  });
  const workspaceCentralPlotViewStateBoundaryCompositionFieldProps = buildWorkspaceCentralPlotViewStateBoundaryCompositionFieldProps({
    ...workspaceCentralPlotViewStateCompositionProps,
  });
  const workspaceCentralPlotViewStateBoundaryCompositionProps = buildWorkspaceCentralPlotViewStateBoundaryCompositionProps({
    ...workspaceCentralPlotViewStateBoundaryCompositionFieldProps,
  });
  const workspaceCentralPlotViewStateProps = buildWorkspaceCentralPlotViewStateProps({
    ...workspaceCentralPlotViewStateBoundaryCompositionProps,
  });

  const workspaceCentralPlotModelFieldProps = buildWorkspaceCentralPlotModelFieldProps({
    model,
    layout,
    enaManifest,
    snaManifest,
    layers,
    threshold,
    alpha,
    beta,
    gamma
  });

  const workspaceCentralPlotModelCompositionFieldProps = buildWorkspaceCentralPlotModelCompositionFieldProps({
    ...workspaceCentralPlotModelFieldProps,
  });
  const workspaceCentralPlotModelCompositionProps = buildWorkspaceCentralPlotModelCompositionProps({
    ...workspaceCentralPlotModelCompositionFieldProps,
  });
  const workspaceCentralPlotModelBoundaryCompositionFieldProps = buildWorkspaceCentralPlotModelBoundaryCompositionFieldProps({
    ...workspaceCentralPlotModelCompositionProps,
  });
  const workspaceCentralPlotModelBoundaryCompositionProps = buildWorkspaceCentralPlotModelBoundaryCompositionProps({
    ...workspaceCentralPlotModelBoundaryCompositionFieldProps,
  });
  const workspaceCentralPlotModelProps = buildWorkspaceCentralPlotModelProps({
    ...workspaceCentralPlotModelBoundaryCompositionProps,
  });

  const workspaceCentralPlotDeckCompositionFieldProps = buildWorkspaceCentralPlotDeckCompositionFieldProps({
    ...workspaceCentralPlotModelProps,
    ...workspaceCentralPlotInteractionProps,
    ...workspaceCentralPlotViewStateProps,
    ...workspaceCentralPlotDataViewProps,
    ...workspaceCentralPlotTemporalControlsProps,
    ...workspaceCentralPlotEvidenceProps,
  } satisfies WorkspaceCentralPlotDeckCompositionFieldPropGroup);

  const workspaceCentralPlotDeckCompositionProps = buildWorkspaceCentralPlotDeckCompositionProps({
    ...workspaceCentralPlotDeckCompositionFieldProps,
  });
  const workspaceCentralPlotDeckBoundaryCompositionFieldProps = buildWorkspaceCentralPlotDeckBoundaryCompositionFieldProps({
    ...workspaceCentralPlotDeckCompositionProps,
  });
  const workspaceCentralPlotDeckBoundaryCompositionProps = buildWorkspaceCentralPlotDeckBoundaryCompositionProps({
    ...workspaceCentralPlotDeckBoundaryCompositionFieldProps,
  });

  return buildWorkspaceCentralPlotDeckProps({
    ...workspaceCentralPlotDeckBoundaryCompositionProps,
  });
}
