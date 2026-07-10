import { cn } from "@/lib/utils";
import type {
  SenaActiveWindowBrief,
  SenaFusionMathAudit,
  SenaModel,
  SenaTemporalRuntimeTrace,
  SenaTemporalWindow
} from "./analysis-runtime";
import { MetricCell } from "./workspace-primitives";

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

function formatScopeDelta(value: number, digits = 1) {
  const formatted = formatScopeNumber(value, digits);
  return value > 0 ? `+${formatted}` : formatted;
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
      label: "S social tie",
      value: model.summary.strongestSocialTie?.label ?? "No active social tie",
      detail: model.summary.strongestSocialTie ? `scaled ${formatScopeNumber(model.summary.strongestSocialTie.scaledWeight)}` : "current window",
      className: "border-blue-200 bg-blue-50 text-blue-700"
    },
    {
      id: "W",
      label: "W ENA tie",
      value: model.summary.strongestConceptTie?.label ?? "No active ENA tie",
      detail: model.summary.strongestConceptTie ? `scaled ${formatScopeNumber(model.summary.strongestConceptTie.scaledWeight)}` : "current window",
      className: "border-violet-200 bg-violet-50 text-violet-700"
    },
    {
      id: "B",
      label: "B bridge",
      value: model.summary.strongestBridgeTie?.label ?? "No active bridge",
      detail: model.summary.strongestBridgeTie ? `scaled ${formatScopeNumber(model.summary.strongestBridgeTie.scaledWeight)}` : "current window",
      className: "border-cyan-200 bg-cyan-50 text-cyan-700"
    },
    {
      id: "G",
      label: "G pair",
      value: strongestGPair?.label ?? "No active G pair",
      detail: strongestGPair ? `total ${formatScopeNumber(strongestGPair.totalContribution)}` : "current window",
      className: "border-rose-200 bg-rose-50 text-rose-700"
    }
  ];

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
      className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_10px_26px_rgb(15_23_42/0.06)]"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase text-slate-500">Analysis scope</div>
          <div className="mt-1 text-sm font-black text-slate-950">
            Current-window Fusion Plot: <span className="text-cyanGlow">{windowLabel}</span>
          </div>
        </div>
        <div className="rounded-full border border-cyanGlow/30 bg-cyanGlow/10 px-3 py-1 text-xs font-black text-cyanGlow">
          A_fusion {aFusionFingerprint?.checksum ?? "pending"}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCell label="Frame" value={frameLabel} testId="central-fusion-scope-frame" />
        <MetricCell label="Turns" value={turns} testId="central-fusion-scope-turns" />
        <MetricCell label="Utterances" value={model.dataset.utterances.length} testId="central-fusion-scope-utterances" />
        <MetricCell label="Segments" value={model.dataset.coded_segments.length} testId="central-fusion-scope-segments" />
        <MetricCell label="Edges" value={model.edges.length} testId="central-fusion-scope-edges" />
        <MetricCell label="S/W/B" value={`${model.summary.socialEdges}/${model.summary.conceptEdges}/${model.summary.bridgeEdges}`} testId="central-fusion-scope-layer-counts" />
      </div>
      <div
        data-testid="central-fusion-evidence-capsule"
        data-visual-role="current-window-fusion-evidence-capsule"
        className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-black uppercase text-slate-500">Current-window Fusion evidence capsule</div>
          <div className="text-xs font-black text-slate-700">S/W/B/G top signals for this active plot</div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
          {evidenceCapsuleRows.map((row) => (
            <div key={row.id} className={cn("min-w-0 rounded-lg border p-3", row.className)}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.68rem] font-black uppercase">{row.label}</span>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current/20 bg-white/75 text-[0.7rem] font-black">{row.id}</span>
              </div>
              <div className="mt-2 truncate text-sm font-black text-slate-950" title={row.value}>{row.value}</div>
              <div className="mt-1 text-xs font-bold text-slate-500">{row.detail}</div>
            </div>
          ))}
        </div>
        <div className="text-xs font-semibold leading-5 text-slate-500">
          Capsule values summarize the strongest observed layer signals in the current temporal window; they are inspection cues, not causal claims.
        </div>
      </div>
      {activeWindowBrief && (
        <div
          data-testid="central-active-window-brief"
          data-visual-role="active-window-interpretation-brief"
          className="rounded-xl border border-amber-200 bg-amber-50/70 p-3"
        >
          <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase text-amber-700">Active-window interpretation brief</div>
              <div className="mt-1 text-sm font-black leading-5 text-slate-950">{activeWindowBrief.headline}</div>
            </div>
            <span className="w-fit rounded-full border border-amber-300 bg-white px-2 py-1 text-[0.68rem] font-black uppercase text-amber-700">
              {activeWindowBrief.schemaVersion}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {activeWindowBrief.dominantSignals.map((signal) => (
              <div key={signal.layer} className="min-w-0 rounded-lg border border-white/80 bg-white/80 p-2">
                <div className="text-[0.66rem] font-black uppercase text-slate-500">{signal.layer} signal</div>
                <div className="mt-1 truncate text-xs font-black text-slate-950" title={signal.label}>{signal.label}</div>
                <div className="mt-1 text-[0.68rem] font-semibold text-slate-600">
                  rank {signal.fullConversationRank === null ? "NA" : signal.fullConversationRank}; share {signal.fullConversationShare === null ? "NA" : `${formatScopeNumber(signal.fullConversationShare * 100, 0)}%`}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-white/80 bg-white/80 p-2">
              <div className="text-[0.66rem] font-black uppercase text-slate-500">Evidence cues</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                {activeWindowBrief.evidenceCues.slice(0, 2).map((cue) => cue.sourceLabel).join("; ") || "No evidence cues"}
              </div>
            </div>
            <div className="rounded-lg border border-white/80 bg-white/80 p-2">
              <div className="text-[0.66rem] font-black uppercase text-slate-500">Review checks</div>
              <div className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                {activeWindowBrief.reviewChecklist.map((item) => `${item.label}: ${item.status}`).join("; ")}
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs font-semibold leading-5 text-amber-800">
            {activeWindowBrief.guardrails[1]}
          </div>
        </div>
      )}
      <div
        data-testid="central-fusion-transition-delta"
        data-visual-role="active-window-fusion-transition-delta"
        className="rounded-xl border border-slate-200 bg-slate-50 p-3"
      >
        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-black uppercase text-slate-500">Adjacent-window delta</div>
          <div className="text-xs font-black text-slate-700">{transitionLabel}</div>
        </div>
        {activeTransition ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              <MetricCell label="Delta S" value={formatScopeDelta(activeTransition.delta.S)} testId="central-fusion-delta-s" />
              <MetricCell label="Delta W" value={formatScopeDelta(activeTransition.delta.W)} testId="central-fusion-delta-w" />
              <MetricCell label="Delta B" value={formatScopeDelta(activeTransition.delta.B)} testId="central-fusion-delta-b" />
              <MetricCell label="Delta G" value={formatScopeDelta(activeTransition.delta.G)} testId="central-fusion-delta-g" />
              <MetricCell label="Delta A_fusion" value={formatScopeDelta(activeTransition.delta.fusion)} testId="central-fusion-delta-a-fusion" />
              <MetricCell label="Active G pairs" value={formatScopeDelta(activeTransition.delta.activeGPairs, 0)} testId="central-fusion-delta-g-pairs" />
            </div>
            <div
              data-testid="central-fusion-delta-g-pair"
              data-visual-role="active-window-fusion-g-pair-driver"
              data-g-pair-from={activeTransition.strongestGPair.from?.label ?? "NA"}
              data-g-pair-to={activeTransition.strongestGPair.to?.label ?? "NA"}
              data-g-pair-changed={String(activeTransition.strongestGPair.changed)}
              className="mt-2 rounded-lg border border-rose-200 bg-white p-3 text-xs font-semibold leading-5 text-slate-600"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-black uppercase text-rose-500">Top G pair shift</div>
                  <div className="mt-1 text-sm font-black text-slate-950">
                    {activeTransition.strongestGPair.from?.label ?? "NA"} {"->"} {activeTransition.strongestGPair.to?.label ?? "NA"}
                  </div>
                </div>
                <span className={cn(
                  "rounded-full border px-2 py-1 text-[0.68rem] font-black uppercase",
                  activeTransition.strongestGPair.changed
                    ? "border-rose-300 bg-rose-50 text-rose-600"
                    : "border-slate-300 bg-slate-100 text-slate-600"
                )}>
                  {activeTransition.strongestGPair.changed ? "changed" : "stable"}
                </span>
              </div>
              <div className="mt-2 text-slate-500">
                This identifies the strongest person-code-pair explanation for the adjacent-window change, not a causal driver.
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-500">
            No adjacent temporal transition is available for the current scope.
          </div>
        )}
        <div className="mt-2 text-xs font-semibold leading-5 text-slate-500">
          Deltas compare adjacent active windows for inspection; they are not causal evidence without temporal design, coding reliability, and human review.
        </div>
      </div>
    </div>
  );
}
