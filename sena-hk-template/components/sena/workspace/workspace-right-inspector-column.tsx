import { Braces, X } from "lucide-react";
import type {
  SenaEnaManifest,
  SenaFusionMathAudit,
  SenaLayer,
  SenaLayoutMode,
  SenaModel,
  SenaTemporalWindow
} from "./analysis-runtime";
import type { SenaJointEmbeddingOperator } from "./fusion-layout";
import { Inspector, type InspectorProps } from "./inspector-panel";
import { MethodFormulaPanel } from "./method-formula-panel";
import { Panel } from "./workspace-primitives";
import { WorkspaceSecondaryComparisonLens } from "./workspace-secondary-comparison-lens";
import { WorkspaceViewportPanel } from "./workspace-shell-panels";

export type WorkspaceRightInspectorColumnProps = {
  model: SenaModel;
  timelineModel: SenaModel;
  layout: SenaLayoutMode;
  selectedLayoutNote: string;
  onLayoutChange: (layout: SenaLayoutMode) => void;
  layoutOptions: Array<{ value: SenaLayoutMode; label: string; note: string }>;
  jointEmbeddingOperator: SenaJointEmbeddingOperator;
  onJointEmbeddingOperatorChange: (operator: SenaJointEmbeddingOperator) => void;
  enaManifest: SenaEnaManifest;
  layers: Record<SenaLayer, boolean>;
  layerCopy: Record<SenaLayer, { label: string; className: string }>;
  threshold: number;
  selected?: InspectorProps["selected"];
  selectedId: string;
  revealedLabelIds: string[];
  onCanvasSelect: (id: string) => void;
  alpha: number;
  beta: number;
  gamma: number;
  activeTemporalWindow?: SenaTemporalWindow;
  fusionMathAudit: SenaFusionMathAudit;
  visibleEdgeStrokeScale: InspectorProps["edgeStrokeScale"];
  jenaConceptPairHandoffRows: InspectorProps["jenaConceptPairHandoffRows"];
  jsnaSocialTieHandoffRows: InspectorProps["jsnaSocialTieHandoffRows"];
  showArchivedFormulaPanel: boolean;
  onExportMathAudit: () => void;
  onExportMethodProtocol: () => void;
  onExportVisualGrammar: () => void;
};

export function WorkspaceRightInspectorColumn({
  model,
  timelineModel,
  selected,
  selectedId,
  onCanvasSelect,
  activeTemporalWindow,
  fusionMathAudit,
  visibleEdgeStrokeScale,
  jenaConceptPairHandoffRows,
  jsnaSocialTieHandoffRows,
  showArchivedFormulaPanel,
  onExportMathAudit,
  onExportMethodProtocol,
  onExportVisualGrammar
}: WorkspaceRightInspectorColumnProps) {
  return (
    <aside
      data-testid="workspace-right-inspector-column"
      className="order-3 min-w-0 border-t border-cardBorder/70 bg-background/70 p-3 xl:order-none xl:h-full xl:overflow-y-auto xl:border-l xl:border-t-0"
    >
      <WorkspaceViewportPanel
        id="workflow-evidence"
        testId="workspace-secondary-plot"
        visualRole="workspace-secondary-plot"
        title={selectedId && selected ? "Evidence inspector" : "Dual Lens comparison"}
        className="min-h-0"
      >
        {selectedId && selected ? (
          <div data-testid="workspace-selection-context" className="grid gap-3">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <div className="text-sm font-black text-slate-950">Selected evidence</div>
                <div className="text-xs font-semibold text-slate-500">Close to restore the Dual Lens comparison.</div>
              </div>
              <button
                type="button"
                aria-label="Close evidence inspector"
                onClick={() => onCanvasSelect("")}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:border-cyanGlow hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <Inspector
              selected={selected}
              options={model.options}
              pairReport={model.pairReport}
              matrixFingerprints={fusionMathAudit.matrixFingerprints}
              edgeStrokeScale={visibleEdgeStrokeScale}
              jenaConceptPairHandoffRows={jenaConceptPairHandoffRows}
              jsnaSocialTieHandoffRows={jsnaSocialTieHandoffRows}
            />
          </div>
        ) : (
          <WorkspaceSecondaryComparisonLens
            currentModel={model}
            baselineModel={timelineModel}
            activeWindow={activeTemporalWindow}
          />
        )}
      </WorkspaceViewportPanel>

      {showArchivedFormulaPanel && (
        <div className="mt-3">
          <Panel title="SENA Formula" icon={Braces}>
            <MethodFormulaPanel
              model={model}
              fusionMathAudit={fusionMathAudit}
              onExportMathAudit={onExportMathAudit}
              onExportMethodProtocol={onExportMethodProtocol}
              onExportVisualGrammar={onExportVisualGrammar}
            />
          </Panel>
        </div>
      )}
    </aside>
  );
}
