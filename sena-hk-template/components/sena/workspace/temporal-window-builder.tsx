import {
  Pause,
  Play,
  SkipBack,
  SkipForward
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SenaModel,
  SenaTemporalMode,
  SenaTemporalRuntimeTrace,
  SenaTemporalWindow
} from "./analysis-runtime";
import {
  IntegerControl,
  MetricCell
} from "./workspace-primitives";
import { TemporalFusionArc } from "./temporal-fusion-arc";
import { TimelineTrace } from "./timeline-trace";

const temporalModeOptions: Array<{ value: SenaTemporalMode; label: string }> = [
  { value: "stage", label: "Stage" },
  { value: "moving-window", label: "Moving" },
  { value: "turn-window", label: "Turn" }
];

function formatTemporalNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export type TemporalWindowBuilderProps = {
  mode: SenaTemporalMode;
  onModeChange: (mode: SenaTemporalMode) => void;
  movingWindowSize: number;
  onMovingWindowSizeChange: (value: number) => void;
  movingWindowStep: number;
  onMovingWindowStepChange: (value: number) => void;
  turnWindowRadius: number;
  onTurnWindowRadiusChange: (value: number) => void;
  windows: SenaTemporalWindow[];
  people: SenaModel["people"];
  codes: SenaModel["codes"];
  temporalRuntimeTrace: SenaTemporalRuntimeTrace;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  isAnimating: boolean;
  onAnimationToggle: () => void;
  animationMs: number;
  onAnimationMsChange: (value: number) => void;
};

export function TemporalWindowBuilder({
  mode,
  onModeChange,
  movingWindowSize,
  onMovingWindowSizeChange,
  movingWindowStep,
  onMovingWindowStepChange,
  turnWindowRadius,
  onTurnWindowRadiusChange,
  windows,
  people,
  codes,
  temporalRuntimeTrace,
  activeIndex,
  onActiveIndexChange,
  isAnimating,
  onAnimationToggle,
  animationMs,
  onAnimationMsChange
}: TemporalWindowBuilderProps) {
  const activeWindow = windows[activeIndex];
  const activeTraceEntry = activeWindow ? temporalRuntimeTrace.windows.find((entry) => entry.window.id === activeWindow.id) : undefined;
  const activeTransition = activeWindow
    ? temporalRuntimeTrace.transitions.find((transition) => transition.toWindowId === activeWindow.id) ??
      temporalRuntimeTrace.transitions.find((transition) => transition.fromWindowId === activeWindow.id)
    : undefined;
  const lastIndex = Math.max(0, windows.length - 1);
  const canAnimate = windows.length > 1;
  const goTo = (index: number) => onActiveIndexChange(Math.max(0, Math.min(lastIndex, index)));
  const PlaybackIcon = isAnimating ? Pause : Play;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-2">
        {temporalModeOptions.map((item) => (
          <button
            key={item.value}
            type="button"
            data-testid={`temporal-mode-${item.value}`}
            aria-pressed={mode === item.value}
            onClick={() => onModeChange(item.value)}
            className={cn(
              "h-10 rounded-lg border px-3 text-sm font-black transition",
              mode === item.value ? "border-cyanGlow/65 bg-cyanGlow/14 text-foreground" : "border-cardBorder/45 bg-background/30 text-muted hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {mode === "moving-window" && (
          <>
            <IntegerControl label="Window size" value={movingWindowSize} min={1} max={12} onChange={onMovingWindowSizeChange} />
            <IntegerControl label="Step" value={movingWindowStep} min={1} max={12} onChange={onMovingWindowStepChange} />
          </>
        )}
        {mode === "turn-window" && (
          <IntegerControl label="Turn radius" value={turnWindowRadius} min={0} max={8} onChange={onTurnWindowRadiusChange} />
        )}
        <IntegerControl label="Frame ms" value={animationMs} min={400} max={5000} step={100} onChange={onAnimationMsChange} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cardBorder/35 bg-background/25 p-2">
        <button
          type="button"
          title="Previous window"
          aria-label="Previous temporal window"
          disabled={!canAnimate || activeIndex === 0}
          onClick={() => goTo(activeIndex - 1)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-cardBorder/45 bg-background/40 text-foreground transition hover:border-cyanGlow disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          type="button"
          title={isAnimating ? "Pause animation" : "Play animation"}
          aria-label={isAnimating ? "Pause temporal animation" : "Play temporal animation"}
          disabled={!canAnimate}
          onClick={onAnimationToggle}
          className="grid h-9 w-9 place-items-center rounded-lg border border-cyanGlow/55 bg-cyanGlow/12 text-cyanGlow transition hover:bg-cyanGlow/18 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PlaybackIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Next window"
          aria-label="Next temporal window"
          disabled={!canAnimate || activeIndex === lastIndex}
          onClick={() => goTo(activeIndex + 1)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-cardBorder/45 bg-background/40 text-foreground transition hover:border-cyanGlow disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <input
          type="range"
          min="0"
          max={lastIndex}
          value={Math.min(activeIndex, lastIndex)}
          disabled={windows.length === 0}
          onChange={(event) => goTo(Number(event.currentTarget.value))}
          data-testid="temporal-window-slider"
          className="min-w-44 flex-1 accent-cyanGlow"
        />
        <div className="min-w-16 text-right text-xs font-black text-muted">
          {windows.length > 0 ? `${activeIndex + 1}/${windows.length}` : "0/0"}
        </div>
      </div>

      <TemporalFusionArc windows={windows} activeIndex={activeIndex} people={people} codes={codes} temporalRuntimeTrace={temporalRuntimeTrace} onSelect={goTo} />

      <TimelineTrace windows={windows} activeIndex={activeIndex} temporalRuntimeTrace={temporalRuntimeTrace} onSelect={goTo} />

      <div className="grid gap-2 text-xs font-semibold text-muted">
        <div className="flex items-center gap-2"><span className="h-1.5 w-6 rounded-full bg-[#2f73ff]" /> Social connectivity</div>
        <div className="flex items-center gap-2"><span className="h-1.5 w-6 rounded-full bg-[#a855f7]" /> Concept connectivity</div>
        <div className="flex items-center gap-2"><span className="h-1.5 w-6 rounded-full bg-[#24dcee]" /> Social-epistemic integration</div>
        <div className="flex items-center gap-2"><span className="h-1.5 w-6 rounded-full bg-[#fb7185]" /> G pair contribution</div>
      </div>

      {activeWindow ? (
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCell label="Window" value={activeWindow.label} />
            <MetricCell label="Turns" value={`${activeWindow.startTurn}-${activeWindow.endTurn}`} />
            <MetricCell label="Segments" value={activeWindow.segmentCount} />
            <MetricCell label="Evidence" value={activeWindow.evidence.length} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCell label="Raw social" value={formatTemporalNumber(activeWindow.rawSocialConnectivity, 1)} />
            <MetricCell label="Raw concept" value={formatTemporalNumber(activeWindow.rawConceptConnectivity, 1)} />
            <MetricCell label="Raw bridge" value={formatTemporalNumber(activeWindow.rawBridgeIntegration, 1)} />
            <MetricCell label="Raw G pairs" value={formatTemporalNumber(activeTraceEntry?.sena.matrixTotals.G ?? 0, 1)} />
          </div>
          {activeTraceEntry?.sena.strongestGPair && (
            <div className="rounded-lg border border-rose-300/25 bg-rose-400/8 p-3 text-sm font-semibold leading-6 text-foreground/86">
              <div className="text-xs font-black uppercase text-rose-200">Top G pair in this window</div>
              <div className="mt-1 font-black text-foreground">{activeTraceEntry.sena.strongestGPair.label}</div>
              <div className="mt-1 text-muted">
                Total {formatTemporalNumber(activeTraceEntry.sena.strongestGPair.totalContribution, 1)}
                {activeTraceEntry.sena.strongestGPair.topContributors[0] ? `; lead contributor ${activeTraceEntry.sena.strongestGPair.topContributors[0].label}` : ""}
              </div>
            </div>
          )}
          {activeTransition && (
            <div data-testid="temporal-transition-evidence" data-visual-role="temporal-transition-evidence" className="rounded-lg border border-cyanGlow/25 bg-cyanGlow/10 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-black uppercase text-cyanGlow">Temporal transition evidence</div>
                  <div className="mt-1 text-sm font-black text-foreground">
                    {activeTransition.fromLabel} {"->"} {activeTransition.toLabel}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-muted">
                    Turns {activeTransition.turnSpan}; jENA {activeTransition.jenaStatus.from}{"->"}{activeTransition.jenaStatus.to}; jSNA {activeTransition.jsnaStatus.from}{"->"}{activeTransition.jsnaStatus.to}
                  </div>
                </div>
                <span className={cn(
                  "w-fit rounded-full border px-2 py-1 text-xs font-black",
                  activeTransition.direction === "increase" && "border-emerald-300/35 bg-emerald-300/10 text-emerald-100",
                  activeTransition.direction === "decrease" && "border-rose-300/35 bg-rose-300/10 text-rose-100",
                  activeTransition.direction === "stable" && "border-cardBorder/45 bg-background/35 text-muted"
                )}>
                  G {activeTransition.direction}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <MetricCell label="Delta S" value={formatTemporalNumber(activeTransition.delta.S, 1)} />
                <MetricCell label="Delta W" value={formatTemporalNumber(activeTransition.delta.W, 1)} />
                <MetricCell label="Delta B" value={formatTemporalNumber(activeTransition.delta.B, 1)} />
                <MetricCell label="Delta G" value={formatTemporalNumber(activeTransition.delta.G, 1)} />
                <MetricCell label="Delta A_fusion" value={formatTemporalNumber(activeTransition.delta.fusion, 1)} />
              </div>
              <div className="mt-3 text-xs font-semibold leading-5 text-muted">
                Top G pair: {activeTransition.strongestGPair.from?.label ?? "NA"} {"->"} {activeTransition.strongestGPair.to?.label ?? "NA"}
                {activeTransition.strongestGPair.changed ? " (changed)" : " (stable)"}
              </div>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h4 className="mb-2 text-sm font-black text-foreground">Top codes</h4>
              <div className="grid gap-2">
                {activeWindow.topCodes.length > 0 ? activeWindow.topCodes.map((code) => (
                  <div key={code.id} className="grid grid-cols-[1fr_4rem] items-center gap-3 rounded-lg border border-cardBorder/35 bg-background/30 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-bold text-foreground/86">{code.label}</span>
                    <span className="text-right font-black text-cyanGlow">{formatTemporalNumber(code.weight, 1)}</span>
                  </div>
                )) : (
                  <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">No codes in this window.</div>
                )}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-sm font-black text-foreground">Evidence snippets</h4>
              <div className="grid max-h-72 gap-2 overflow-auto pr-1">
                {activeWindow.evidence.length > 0 ? activeWindow.evidence.map((snippet) => (
                  <div key={snippet.id} className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black text-muted">
                      <span>{snippet.label}</span>
                      <span>{snippet.codes?.join(", ")}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-foreground/82">{snippet.text}</p>
                  </div>
                )) : (
                  <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">No evidence in this window.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-4 text-sm font-semibold text-muted">Upload utterances and coded segments to build temporal windows.</div>
      )}
    </div>
  );
}
