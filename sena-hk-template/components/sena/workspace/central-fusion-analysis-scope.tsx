import { cn } from "@/lib/utils";
import type {
  SenaActiveWindowBrief,
  SenaFusionMathAudit,
  SenaModel,
  SenaTemporalRuntimeTrace,
  SenaTemporalWindow
} from "./analysis-runtime";

export type CentralFusionAnalysisScopeProps = {
  model: SenaModel;
  activeWindow?: SenaTemporalWindow;
  activeIndex: number;
  windowCount: number;
  fusionMathAudit: SenaFusionMathAudit;
  activeTransition?: SenaTemporalRuntimeTrace["transitions"][number];
  activeWindowBrief?: SenaActiveWindowBrief | null;
};

function formatScopeNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export function CentralFusionAnalysisScope({
  model,
  activeWindow,
  activeIndex,
  windowCount,
  fusionMathAudit,
  activeTransition,
  activeWindowBrief
}: CentralFusionAnalysisScopeProps) {
  const aFusionFingerprint = fusionMathAudit.matrixFingerprints.find((fingerprint) => fingerprint.id === "A_fusion");
  const turns = activeWindow ? `${activeWindow.startTurn}-${activeWindow.endTurn}` : "All";
  const windowLabel = activeWindow?.label ?? "Full conversation";
  const frameLabel = windowCount > 0 ? `${activeIndex + 1}/${windowCount}` : "0/0";
  const transitionLabel = activeTransition ? `${activeTransition.fromLabel} -> ${activeTransition.toLabel}` : "No adjacent window";
  const strongestGPair = [...model.pairReport]
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label))[0];
  const evidenceCapsuleRows = [
    {
      id: "S",
      label: "Top social tie",
      value: model.summary.strongestSocialTie?.label ?? "No active social tie",
      detail: model.summary.strongestSocialTie ? `scaled ${formatScopeNumber(model.summary.strongestSocialTie.scaledWeight)}` : "current window",
      className: "border-blue-200 bg-blue-50 text-blue-700"
    },
    {
      id: "W",
      label: "Top ENA tie",
      value: model.summary.strongestConceptTie?.label ?? "No active ENA tie",
      detail: model.summary.strongestConceptTie ? `scaled ${formatScopeNumber(model.summary.strongestConceptTie.scaledWeight)}` : "current window",
      className: "border-violet-200 bg-violet-50 text-violet-700"
    },
    {
      id: "B",
      label: "Top bridge",
      value: model.summary.strongestBridgeTie?.label ?? "No active bridge",
      detail: model.summary.strongestBridgeTie ? `scaled ${formatScopeNumber(model.summary.strongestBridgeTie.scaledWeight)}` : "current window",
      className: "border-cyan-200 bg-cyan-50 text-cyan-700"
    },
    {
      id: "G",
      label: "Top contribution pair",
      value: strongestGPair?.label ?? "No active G pair",
      detail: strongestGPair ? `total ${formatScopeNumber(strongestGPair.totalContribution)}` : "current window",
      className: "border-rose-200 bg-rose-50 text-rose-700"
    }
  ];
  const layerCounts = [
    ["S", model.summary.socialEdges],
    ["W", model.summary.conceptEdges],
    ["B", model.summary.bridgeEdges],
    ["G", model.pairReport.filter((pair) => pair.totalContribution > 0).length]
  ];
  const guardrail = activeWindowBrief?.guardrails[1] ??
    "Read these strongest observed signals as inspection cues, not causal claims.";

  return (
    <div
      data-testid="central-fusion-analysis-scope"
      data-visual-role="active-window-fusion-scope"
      data-window-id={activeWindow?.id ?? "full-conversation"}
      data-window-label={windowLabel}
      data-window-turns={turns}
      data-a-fusion-checksum={aFusionFingerprint?.checksum ?? ""}
      data-transition-id={activeTransition?.id ?? ""}
      data-delta-fusion={activeTransition?.delta.fusion ?? ""}
      data-delta-g={activeTransition?.delta.G ?? ""}
      className="grid gap-3 border-t border-slate-200 pt-3"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-slate-600">
        <strong className="text-sm text-slate-950">{windowLabel}</strong>
        <span data-testid="central-fusion-scope-frame">Window {frameLabel}</span>
        <span data-testid="central-fusion-scope-turns">Turns {turns}</span>
        <span className="font-black text-cyanGlow">A_fusion {aFusionFingerprint?.checksum ?? "pending"}</span>
        <div data-testid="central-fusion-scope-layer-counts" className="ml-auto flex flex-wrap gap-1.5">
          {layerCounts.map(([layer, count]) => (
            <span key={layer} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
              {layer} {count}
            </span>
          ))}
        </div>
      </div>

      <div
        data-testid="central-fusion-evidence-capsule"
        data-visual-role="current-window-fusion-evidence-capsule"
        className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4"
      >
        {evidenceCapsuleRows.map((row) => (
          <div key={row.id} className={cn("min-w-0 rounded-lg border px-3 py-2", row.className)}>
            <div className="flex items-center gap-2 text-[0.68rem] font-black uppercase">
              <span>{row.id}</span>
              <span>{row.label}</span>
            </div>
            <div className="mt-1 truncate text-xs font-black text-slate-950" title={row.value}>{row.value}</div>
            <div className="mt-0.5 text-[0.68rem] font-bold text-slate-500">{row.detail}</div>
          </div>
        ))}
      </div>

      <div
        data-testid="central-active-window-brief"
        data-visual-role="active-window-interpretation-brief"
        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
      >
        <strong>Interpretation guardrail:</strong> {guardrail}
      </div>

      <div
        data-testid="central-fusion-transition-delta"
        data-visual-role="active-window-fusion-transition-delta"
        className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500"
      >
        <span className="font-black text-slate-700">Adjacent-window delta</span>
        <span>{transitionLabel}</span>
        <div
          data-testid="central-fusion-delta-g-pair"
          data-visual-role="active-window-fusion-g-pair-driver"
          data-g-pair-from={activeTransition?.strongestGPair.from?.label ?? "NA"}
          data-g-pair-to={activeTransition?.strongestGPair.to?.label ?? "NA"}
          data-g-pair-changed={String(activeTransition?.strongestGPair.changed ?? false)}
          className="min-w-0 truncate"
        >
          <span className="font-black text-rose-600">Top G pair shift</span>{" "}
          {activeTransition?.strongestGPair.from?.label ?? "NA"} {"->"} {activeTransition?.strongestGPair.to?.label ?? "NA"}
        </div>
      </div>
    </div>
  );
}
