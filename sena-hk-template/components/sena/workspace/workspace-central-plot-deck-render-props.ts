import type { EvidenceSourceFilter } from "./evidence-ledger-panel";
import type { SenaJointEmbeddingOperator } from "./fusion-layout";
import type { SenaPlotView } from "./plot-tools-panel";
import type {
  SenaActiveWindowBrief,
  SenaEnaManifest,
  SenaEvidenceLedger,
  SenaFusionMathAudit,
  SenaLayer,
  SenaLayoutMode,
  SenaModel,
  SenaSnaManifest,
  SenaTemporalMode,
  SenaTemporalRuntimeTrace,
  SenaTemporalWindow
} from "./analysis-runtime";

export const WORKSPACE_CENTRAL_PLOT_DECK_RENDER_PROPS_MODULE = "workspace-central-plot-deck-render-props" as const;

export type WorkspaceCentralPlotDeckRenderProps = {
  model: SenaModel;
  layout: SenaLayoutMode;
  jointEmbeddingOperator: SenaJointEmbeddingOperator;
  onJointEmbeddingOperatorChange: (operator: SenaJointEmbeddingOperator) => void;
  enaManifest: SenaEnaManifest;
  snaManifest: SenaSnaManifest;
  layers: Record<SenaLayer, boolean>;
  threshold: number;
  alpha: number;
  beta: number;
  gamma: number;
  selectedId: string;
  revealedLabelIds: string[];
  onCanvasSelect: (id: string) => void;
  fusionPlotZoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onMaximizeFusionPlot: () => void;
  activePlotView: SenaPlotView;
  isPlotSwitcherOpen: boolean;
  onPlotSwitcherToggle: () => void;
  onPlotViewSelect: (view: SenaPlotView) => void;
  plotViewOptions: Array<{ id: SenaPlotView; label: string; detail: string }>;
  activeTemporalWindow?: SenaTemporalWindow;
  activeTemporalIndex: number;
  onActiveTemporalIndexChange: (index: number) => void;
  temporalWindows: SenaTemporalWindow[];
  temporalMode: SenaTemporalMode;
  onTemporalModeChange: (mode: SenaTemporalMode) => void;
  movingWindowSize: number;
  onMovingWindowSizeChange: (value: number) => void;
  movingWindowStep: number;
  onMovingWindowStepChange: (value: number) => void;
  turnWindowRadius: number;
  onTurnWindowRadiusChange: (value: number) => void;
  temporalRuntimeTrace: SenaTemporalRuntimeTrace;
  isAnimating: boolean;
  onAnimationToggle: () => void;
  animationMs: number;
  onAnimationMsChange: (value: number) => void;
  fusionMathAudit: SenaFusionMathAudit;
  activeTransition?: SenaTemporalRuntimeTrace["transitions"][number];
  activeWindowBrief?: SenaActiveWindowBrief | null;
  evidenceLedger: SenaEvidenceLedger;
  evidenceSourceFilter: EvidenceSourceFilter;
  onEvidenceSourceFilterChange: (filter: EvidenceSourceFilter) => void;
  onExportEvidenceLedgerJson: () => void;
  isWorkspaceDataViewOpen: boolean;
  onWorkspaceDataViewToggle: () => void;
};
