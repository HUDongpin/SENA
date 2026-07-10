import { Braces, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SenaEnaManifest,
  SenaFusionMathAudit,
  SenaLayer,
  SenaLayoutMode,
  SenaModel,
  SenaTemporalWindow
} from "./analysis-runtime";
import { Canvas } from "./fusion-canvas";
import { FusionLayerKey } from "./fusion-layer-key";
import type { SenaJointEmbeddingOperator } from "./fusion-layout";
import { Inspector, type InspectorProps } from "./inspector-panel";
import { MethodFormulaPanel } from "./method-formula-panel";
import { JointEmbeddingProvenanceStrip } from "./runtime-provenance-panels";
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
  layout,
  selectedLayoutNote,
  onLayoutChange,
  layoutOptions,
  jointEmbeddingOperator,
  onJointEmbeddingOperatorChange,
  enaManifest,
  layers,
  layerCopy,
  threshold,
  selected,
  selectedId,
  revealedLabelIds,
  onCanvasSelect,
  alpha,
  beta,
  gamma,
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
      className="order-3 grid min-w-0 content-start gap-4 border-t border-cardBorder/70 bg-background/70 p-4 xl:order-none xl:border-l xl:border-t-0"
    >
      <WorkspaceViewportPanel
        id="workflow-canvas"
        testId="workspace-primary-plot"
        visualRole="workspace-primary-plot"
        title="Primary Plot - Fusion Canvas"
      >
        <div className="mb-3 grid rounded-lg border border-slate-200 bg-slate-50 p-1 sm:grid-cols-3">
          {layoutOptions.map((item) => (
            <button
              key={item.value}
              type="button"
              data-testid={`canvas-layout-${item.value}`}
              onClick={() => onLayoutChange(item.value)}
              className={cn(
                "rounded-md px-3 py-2 text-xs font-black transition",
                layout === item.value ? "bg-cyanGlow text-slate-950 shadow-glow" : "text-slate-500 hover:bg-white hover:text-slate-950"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
          {selectedLayoutNote}
        </div>
        {layout === "joint" && (
          <JointEmbeddingProvenanceStrip
            model={model}
            operator={jointEmbeddingOperator}
            onOperatorChange={onJointEmbeddingOperatorChange}
          />
        )}
        <div className="mb-3 flex flex-wrap gap-2">
          {(["social", "concept", "bridge"] as SenaLayer[]).map((layer) => (
            <span key={layer} className={cn("rounded-full border px-3 py-1 text-xs font-black", layerCopy[layer].className)}>
              {layerCopy[layer].label}: {model.edges.filter((edge) => edge.layer === layer && edge.normalizedWeight >= threshold).length}
            </span>
          ))}
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <Canvas
            model={model}
            layout={layout}
            jointEmbeddingOperator={jointEmbeddingOperator}
            enaManifest={enaManifest}
            layers={layers}
            threshold={threshold}
            selectedId={selected?.id ?? selectedId}
            revealedLabelIds={revealedLabelIds}
            onSelect={onCanvasSelect}
            className="h-[22rem]"
          />
        </div>
        <div className="mt-3">
          <FusionLayerKey model={model} layers={layers} threshold={threshold} alpha={alpha} beta={beta} gamma={gamma} />
        </div>
        <div className="mt-3 grid gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
          <div className="flex items-center gap-2 font-black text-amber-900">
            <Info className="h-4 w-4" /> Interpretation guardrail
          </div>
          {layout === "joint"
            ? "Joint mode uses declared A_fusion embedding operators: Laplacian eigenmaps, MDS + Schoenberg, or commute-time; report operator, delta, dimension, seed, metric exactness, and stress with any distance interpretation."
            : layout === "ena-space"
              ? "ENA Space uses jENA projected unit points and code node positions when the manifest is computed; report dimensions, variance, and manifest settings with any distance interpretation."
              : "In explanatory mode, cross-layer distances are arranged for readability and should not be interpreted as strict statistical distances."}
        </div>
      </WorkspaceViewportPanel>

      <WorkspaceViewportPanel
        id="workflow-evidence"
        testId="workspace-secondary-plot"
        visualRole="workspace-secondary-plot"
        title="Secondary Plot - Compare + Evidence"
      >
        <WorkspaceSecondaryComparisonLens
          currentModel={model}
          baselineModel={timelineModel}
          activeWindow={activeTemporalWindow}
        />
        {selected ? (
          <Inspector
            selected={selected}
            options={model.options}
            pairReport={model.pairReport}
            matrixFingerprints={fusionMathAudit.matrixFingerprints}
            edgeStrokeScale={visibleEdgeStrokeScale}
            jenaConceptPairHandoffRows={jenaConceptPairHandoffRows}
            jsnaSocialTieHandoffRows={jsnaSocialTieHandoffRows}
          />
        ) : <div className="text-sm text-muted">Select a node or edge.</div>}
      </WorkspaceViewportPanel>

      <Panel title="Feasibility Signal" icon={Sparkles}>
        <div className="grid gap-3 text-sm leading-6 text-muted">
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
            <span className="font-black text-foreground">Achievable now:</span> deterministic S/W/B construction, SNA.js social metrics, layer weighting, evidence-linked SVG inspection, matrix export.
          </div>
          <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
            <span className="font-black text-foreground">Needs validation:</span> benchmark jENA outputs, embedding sensitivity, cross-type distance interpretation, statistical uncertainty, coding reliability.
          </div>
        </div>
      </Panel>

      {showArchivedFormulaPanel && (
        <Panel title="SENA Formula" icon={Braces}>
          <MethodFormulaPanel
            model={model}
            fusionMathAudit={fusionMathAudit}
            onExportMathAudit={onExportMathAudit}
            onExportMethodProtocol={onExportMethodProtocol}
            onExportVisualGrammar={onExportVisualGrammar}
          />
        </Panel>
      )}
    </aside>
  );
}
