import {
  AlertTriangle,
  Download
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import { cn } from "@/lib/utils";
import type { SenaTemporalRuntimeTrace } from "./analysis-runtime";
import { MetricCell } from "./workspace-primitives";

export type TemporalRuntimeTracePanelProps = {
  trace: SenaTemporalRuntimeTrace;
  onExportJson: () => void;
};

function formatTraceNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export function TemporalRuntimeTracePanel({
  trace,
  onExportJson
}: TemporalRuntimeTracePanelProps) {
  const jenaComputed = trace.windows.filter((entry) => entry.ena.status === "computed").length;
  const jsnaComputed = trace.windows.filter((entry) => entry.sna.status === "computed").length;
  const graphWindows = trace.windows.filter((entry) => entry.sna.graph);
  const averageDensity = graphWindows.reduce((total, entry) => total + (entry.sna.graph?.density ?? 0), 0) / Math.max(1, graphWindows.length);
  const activeGWindows = trace.windows.filter((entry) => entry.sena.activeGPairs > 0).length;
  const warningCount = trace.windows.reduce((total, entry) => total + entry.warnings.length, trace.warnings.length);
  const statusBadge = (status: "computed" | "skipped", tone: "violet" | "blue") => (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[0.68rem] font-black uppercase",
        status === "computed" && tone === "violet" && "border-violetGlow/45 bg-violetGlow/10 text-violetGlow",
        status === "computed" && tone === "blue" && "border-blue-400/45 bg-blue-400/10 text-blue-200",
        status === "skipped" && "border-amber-300/45 bg-amber-300/10 text-amber-100"
      )}
    >
      {status}
    </span>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-6">
          <MetricCell label="Windows" value={trace.windows.length} />
          <MetricCell label="Transitions" value={trace.transitions.length} />
          <MetricCell label="jENA computed" value={`${jenaComputed}/${trace.windows.length}`} />
          <MetricCell label="jSNA computed" value={`${jsnaComputed}/${trace.windows.length}`} />
          <MetricCell label="Avg density" value={formatTraceNumber(averageDensity)} />
          <MetricCell label="G-active windows" value={activeGWindows} />
        </div>
        <button type="button" onClick={onExportJson} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export temporal runtime
        </button>
      </div>

      {trace.transitions.length > 0 && (
        <div data-testid="temporal-transition-summary" data-visual-role="temporal-transition-summary" className="grid gap-2 rounded-lg border border-cyanGlow/25 bg-background/25 p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-black text-foreground">Temporal transition evidence</div>
              <div className="mt-1 text-xs font-semibold text-muted">Adjacent-window S/W/B/G deltas for Plan - Teach - Reflect interpretation.</div>
            </div>
            <span className="w-fit rounded-full border border-cyanGlow/35 bg-cyanGlow/10 px-2 py-1 text-xs font-black text-cyanGlow">
              {trace.transitions.length} transitions
            </span>
          </div>
          <div className="grid gap-2">
            {trace.transitions.map((transition) => (
              <div key={transition.id} data-testid="temporal-transition-summary-item" className="rounded-lg border border-cardBorder/30 bg-background/30 p-3 text-xs font-semibold leading-5 text-muted">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-black text-foreground">{transition.fromLabel} {"->"} {transition.toLabel}</div>
                    <div>Turns {transition.turnSpan}; G {transition.direction}; active G pairs {transition.delta.activeGPairs >= 0 ? "+" : ""}{transition.delta.activeGPairs}</div>
                  </div>
                  <div className="font-black text-cyanGlow">
                    Delta G {transition.delta.G >= 0 ? "+" : ""}{formatTraceNumber(transition.delta.G, 1)}
                  </div>
                </div>
                <div className="mt-2 grid gap-1 sm:grid-cols-3">
                  <div>Delta S/W/B: {formatTraceNumber(transition.delta.S, 1)} / {formatTraceNumber(transition.delta.W, 1)} / {formatTraceNumber(transition.delta.B, 1)}</div>
                  <div>Delta A_fusion: {formatTraceNumber(transition.delta.fusion, 1)}</div>
                  <div>Top G pair: {transition.strongestGPair.from?.label ?? "NA"} {"->"} {transition.strongestGPair.to?.label ?? "NA"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {trace.windows.length > 0 ? (
        <div className="max-h-[34rem] overflow-auto rounded-lg border border-cardBorder/35 bg-background/20">
          <table className="w-full min-w-[58rem] text-left text-xs">
            <thead className="sticky top-0 bg-background/95 text-muted">
              <tr>
                <th className="px-3 py-2 font-black">Window</th>
                <th className="px-3 py-2 font-black">Dataset</th>
                <th className="px-3 py-2 font-black">jENA</th>
                <th className="px-3 py-2 font-black">jSNA</th>
                <th className="px-3 py-2 font-black">S/W/B/G</th>
                <th className="px-3 py-2 font-black">Strongest bridge / G pair</th>
              </tr>
            </thead>
            <tbody>
              {trace.windows.map((entry) => {
                const variance = Object.entries(entry.ena.variance)
                  .slice(0, 2)
                  .map(([dimension, value]) => `${dimension} ${formatTraceNumber(value)}`)
                  .join("; ");
                const fusionFingerprint = entry.sena.matrixFingerprints.find((fingerprint) => fingerprint.id === "A_fusion");
                return (
                  <tr key={entry.window.id} className="border-t border-cardBorder/20 align-top">
                    <td className="px-3 py-3">
                      <div className="font-black text-foreground">{entry.window.label}</div>
                      <div className="mt-1 font-semibold text-muted">Turns {entry.window.startTurn}-{entry.window.endTurn}</div>
                    </td>
                    <td className="px-3 py-3 font-semibold text-foreground/82">
                      <div>{entry.datasetCounts.utterances} utterances</div>
                      <div>{entry.datasetCounts.codedSegments} segments</div>
                      <div>{entry.datasetCounts.interactions} interactions</div>
                    </td>
                    <td className="px-3 py-3">
                      {statusBadge(entry.ena.status, "violet")}
                      <div className="mt-2 font-semibold text-foreground/82">
                        Rows {entry.ena.datasetCounts.rows}; dims {entry.ena.dimensions.length > 0 ? entry.ena.dimensions.join(", ") : "NA"}
                      </div>
                      <div className="mt-1 font-semibold text-muted">
                        {variance || `${entry.ena.pointCount} points; ${entry.ena.nodePositionCount} nodes`}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {statusBadge(entry.sna.status, "blue")}
                      <div className="mt-2 font-semibold text-foreground/82">
                        Ties {entry.sna.datasetCounts.weightedTies}; density {formatTraceNumber(entry.sna.graph?.density ?? 0)}
                      </div>
                      <div className="mt-1 font-semibold text-muted">
                        Communities {entry.sna.datasetCounts.communities}; components {entry.sna.datasetCounts.components}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold text-foreground/82">
                      <div>S {formatTraceNumber(entry.sena.matrixTotals.S, 1)} / W {formatTraceNumber(entry.sena.matrixTotals.W, 1)}</div>
                      <div>B {formatTraceNumber(entry.sena.matrixTotals.B, 1)} / G {formatTraceNumber(entry.sena.matrixTotals.G, 1)}</div>
                      <div className="mt-1 text-muted">active G pairs {entry.sena.activeGPairs}</div>
                      <div data-testid="temporal-window-fingerprint" data-visual-role="temporal-window-fingerprint" className="mt-2 rounded-md border border-cardBorder/25 bg-background/25 p-2">
                        <div className="text-[0.65rem] font-black uppercase text-muted">A_fusion checksum</div>
                        <div className="mt-1 font-mono text-[0.7rem] font-black text-cyanGlow">{fusionFingerprint?.checksum ?? "missing"}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold text-foreground/82">
                      {entry.sena.strongestBridgeTie ? (
                        <>
                          <div>{entry.sena.strongestBridgeTie.label}</div>
                          <div className="mt-1 text-muted">scaled {formatTraceNumber(entry.sena.strongestBridgeTie.scaledWeight)}</div>
                        </>
                      ) : (
                        <span className="text-muted">NA</span>
                      )}
                      {entry.sena.strongestGPair && (
                        <div className="mt-3 rounded-md border border-rose-300/20 bg-rose-400/8 p-2">
                          <div className="text-[0.65rem] font-black uppercase text-rose-200">Top G pair</div>
                          <div className="mt-1 text-foreground/90">{entry.sena.strongestGPair.label}</div>
                          <div className="mt-1 text-muted">
                            total {formatTraceNumber(entry.sena.strongestGPair.totalContribution, 1)}
                            {entry.sena.strongestGPair.topContributors[0] ? `; lead ${entry.sena.strongestGPair.topContributors[0].label}` : ""}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-4 text-sm font-semibold text-muted">
          Upload utterances and coded segments to generate per-window runtime status.
        </div>
      )}

      {warningCount > 0 && (
        <div className="sena-warning-panel grid gap-2 rounded-lg p-3 text-xs font-semibold leading-5">
          {trace.warnings.slice(0, 6).map((warning, index) => (
            <div key={`${warning}-${index}`} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
          {trace.warnings.length > 6 && <div>{trace.warnings.length - 6} more runtime warnings.</div>}
        </div>
      )}
    </div>
  );
}
