import { FileText, GitMerge, Network, Sigma } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SenaEnaManifest,
  SenaModel,
  SenaSnaManifest,
  SenaTemporalWindow
} from "./analysis-runtime";
import { MetricCell, Panel } from "./workspace-primitives";

function formatDualLensNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export type DualLensDashboardProps = {
  model: SenaModel;
  enaManifest: SenaEnaManifest;
  snaManifest: SenaSnaManifest;
  activeWindow?: SenaTemporalWindow;
  activeWindowIndex: number;
  windowCount: number;
  surface?: "central" | "section";
};

export function DualLensDashboard({
  model,
  enaManifest,
  snaManifest,
  activeWindow,
  activeWindowIndex,
  windowCount,
  surface = "section"
}: DualLensDashboardProps) {
  const peopleById = new Map(model.people.map((person) => [person.id, person]));
  const utterances = [...model.utterances].sort((a, b) => a.turnIndex - b.turnIndex || a.id.localeCompare(b.id));
  const topActors = [...model.socialReport.actors]
    .sort((a, b) => b.strength - a.strength || b.degree - a.degree || a.label.localeCompare(b.label))
    .slice(0, 4);
  const activePairs = model.pairReport
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label));
  const highlightedPair = model.pairReport.find((pair) => pair.id === "evidence|explanation" && pair.totalContribution > 0) ?? activePairs[0];
  const conceptEdges = model.edges
    .filter((edge) => edge.layer === "concept")
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label))
    .slice(0, 4);
  const activeWindowLabel = activeWindow ? activeWindow.label : "Full conversation";
  const activeTurnLabel = activeWindow ? `${activeWindow.startTurn}-${activeWindow.endTurn}` : "All";
  const runtimeLensRows = [
    {
      id: "jsna",
      label: "jSNA social lens",
      value: `${snaManifest.datasetCounts.weightedTies} ties`,
      detail: `${snaManifest.engineAlias}/${snaManifest.engine} ${snaManifest.engineVersion}`,
      className: "border-blue-200 bg-blue-50 text-blue-800"
    },
    {
      id: "jena",
      label: "jENA epistemic lens",
      value: `${enaManifest.outputs?.lineWeights.length ?? 0} W rows`,
      detail: `${enaManifest.engine} ${enaManifest.engineVersion}`,
      className: "border-violet-200 bg-violet-50 text-violet-800"
    },
    {
      id: "sena",
      label: "SENA bridge lens",
      value: `${model.summary.bridgeEdges} B edges`,
      detail: `G pairs ${activePairs.length}; A_fusion ${model.matrices.fusion.values.length}x${model.matrices.fusion.values.length}`,
      className: "border-cyan-200 bg-cyan-50 text-cyan-800"
    }
  ];

  return (
    <div
      data-testid={surface === "central" ? "central-dual-lens-dashboard" : "dual-lens-dashboard"}
      data-visual-role="dual-lens-dashboard"
      data-window-label={activeWindowLabel}
      data-window-turns={activeTurnLabel}
      className={surface === "central" ? "grid gap-4" : "mb-5"}
    >
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-sm font-black text-cyanGlow">{surface === "central" ? "Dual Lens Plot" : "Dual Lens Dashboard"}</div>
          <h2 className="mt-2 text-2xl font-black text-foreground sm:text-3xl">Window-scoped conversation, SNA, and ENA</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricCell label="Window" value={activeWindowLabel} />
          <MetricCell label="Turns" value={activeTurnLabel} />
          <MetricCell label="Frame" value={windowCount > 0 ? `${activeWindowIndex + 1}/${windowCount}` : "0/0"} />
          <MetricCell label="Segments" value={model.dataset.coded_segments.length} />
        </div>
      </div>

      <div
        data-testid={surface === "central" ? "central-dual-lens-runtime" : "dual-lens-runtime"}
        data-visual-role="dual-lens-runtime-handoff"
        className="mb-5 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:grid-cols-3"
      >
        {runtimeLensRows.map((row) => (
          <div key={row.id} className={cn("min-w-0 rounded-lg border p-3", row.className)}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black uppercase">{row.label}</span>
              <span className="rounded-full border border-current/20 bg-white/70 px-2 py-1 text-[0.64rem] font-black uppercase">{row.id}</span>
            </div>
            <div className="mt-2 text-base font-black text-slate-950">{row.value}</div>
            <div className="mt-1 truncate text-xs font-semibold text-slate-600" title={row.detail}>{row.detail}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.45fr]">
        <Panel title="Raw Conversation Stream" icon={FileText}>
          {utterances.length > 0 ? (
            <div className="grid max-h-[34rem] gap-2 overflow-auto pr-1">
              {utterances.map((utterance) => (
                <div key={utterance.id} className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black text-muted">
                    <span>Turn {utterance.turnIndex}</span>
                    <span>{peopleById.get(utterance.personId)?.label ?? utterance.personId} - {utterance.stage}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-foreground/84">{utterance.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-4 text-sm font-semibold text-muted">
              Upload utterance rows to populate the conversation stream.
            </div>
          )}
        </Panel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="SNA Split View" icon={Network}>
            <div className="grid grid-cols-2 gap-2">
              <MetricCell label="Ties" value={model.socialReport.graph.tieCount} />
              <MetricCell label="Density" value={formatDualLensNumber(model.socialReport.graph.density)} />
              <MetricCell label="Avg path" value={formatDualLensNumber(model.socialReport.graph.averagePathLength)} />
              <MetricCell label="Communities" value={model.socialReport.graph.communityCount} />
            </div>
            <div className="mt-4 grid gap-2">
              {topActors.length > 0 ? topActors.map((actor) => (
                <div key={actor.id} className="grid grid-cols-[1fr_4.5rem_4.5rem] items-center gap-3 rounded-lg border border-cardBorder/35 bg-background/30 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-black text-foreground">{actor.label}</span>
                  <span className="text-right font-semibold text-muted">S {formatDualLensNumber(actor.strength, 1)}</span>
                  <span className="text-right font-semibold text-muted">D {formatDualLensNumber(actor.degree, 1)}</span>
                </div>
              )) : (
                <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">No social ties in this window.</div>
              )}
            </div>
          </Panel>

          <Panel title="ENA Split View" icon={Sigma}>
            <div className="grid grid-cols-2 gap-2">
              <MetricCell label="Code edges" value={model.summary.conceptEdges} />
              <MetricCell label="Active G pairs" value={activePairs.length} />
              <MetricCell label="Bridge edges" value={model.summary.bridgeEdges} />
              <MetricCell label="G total" value={formatDualLensNumber(activePairs.reduce((total, pair) => total + pair.totalContribution, 0), 1)} />
            </div>
            <div className="mt-4 grid gap-2">
              {conceptEdges.length > 0 ? conceptEdges.map((edge) => (
                <div key={edge.id} className="grid grid-cols-[1fr_4rem] items-center gap-3 rounded-lg border border-cardBorder/35 bg-background/30 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-black text-foreground">{edge.label}</span>
                  <span className="text-right font-semibold text-muted">{formatDualLensNumber(edge.weight, 1)}</span>
                </div>
              )) : (
                <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">No ENA co-occurrences in this window.</div>
              )}
            </div>
          </Panel>

          <Panel title="Evidence-Explanation Drivers" icon={GitMerge} className="lg:col-span-2">
            {highlightedPair ? (
              <div className="grid gap-3 lg:grid-cols-[18rem_1fr]">
                <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
                  <div className="text-xs font-black uppercase text-muted">Code pair</div>
                  <div className="mt-2 text-lg font-black text-foreground">{highlightedPair.label}</div>
                  <div className="mt-2 text-sm font-semibold text-muted">Total G {formatDualLensNumber(highlightedPair.totalContribution, 1)}</div>
                </div>
                <div className="grid gap-2">
                  {highlightedPair.topContributors.map((contributor) => (
                    <div key={contributor.id} className="grid gap-2 rounded-lg border border-cardBorder/35 bg-background/30 p-3 md:grid-cols-[1fr_5rem_5rem_5rem] md:items-center">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-foreground">{contributor.label}</div>
                        <div className="mt-1 truncate text-xs font-semibold text-muted">
                          {contributor.evidence.map((snippet) => snippet.label).join(", ") || "No snippet"}
                        </div>
                      </div>
                      <span className="text-sm font-black text-cyanGlow">G {formatDualLensNumber(contributor.weight, 1)}</span>
                      <span className="text-sm font-semibold text-foreground/78">Direct {formatDualLensNumber(contributor.directWeight, 1)}</span>
                      <span className="text-sm font-semibold text-foreground/78">Support {formatDualLensNumber(contributor.supportingWeight, 1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm text-muted">No person-code-pair contribution in this window.</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
