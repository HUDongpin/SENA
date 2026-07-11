import { Download } from "lucide-react";
import type { ElementType } from "react";
import { buttonStyles } from "@/components/Primitives";
import type {
  SenaEnaManifest,
  SenaMethodProtocol,
  SenaModel,
  SenaRuntimeConsistencyAudit,
  SenaSnaManifest,
  SenaValidation
} from "./analysis-runtime";
import {
  JenaConceptHandoffPanel,
  JsnaSocialHandoffPanel,
  MethodProtocolHandoffPanel,
  MetricProvenanceSummary
} from "./runtime-provenance-panels";
import { MetricCell, Panel } from "./workspace-primitives";

function formatStatsPanelNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

function formatStatsPanelPercent(value: number | undefined, digits = 1) {
  return Number.isFinite(value) ? `${formatStatsPanelNumber((value ?? 0) * 100, digits)}%` : "NA";
}

function pairReportSelectionTarget(model: SenaModel, pair: SenaModel["pairReport"][number]) {
  const conceptEdge = model.edges.find((edge) => (
    edge.layer === "concept" &&
    (
      (edge.source === pair.codeA && edge.target === pair.codeB) ||
      (edge.source === pair.codeB && edge.target === pair.codeA)
    )
  ));
  if (conceptEdge) return conceptEdge.id;

  const contributor = pair.topContributors[0];
  if (contributor) {
    const bridgeEdge = model.edges
      .filter((edge) => (
        edge.layer === "bridge" &&
        edge.source === contributor.id &&
        (edge.target === pair.codeA || edge.target === pair.codeB)
      ))
      .sort((a, b) => b.scaledWeight - a.scaledWeight || a.label.localeCompare(b.label))[0];
    if (bridgeEdge) return bridgeEdge.id;
  }

  return model.summary.strongestConceptTie?.id ??
    model.summary.strongestBridgeTie?.id ??
    model.summary.strongestSocialTie?.id ??
    model.nodes[0]?.id ??
    "";
}

export type WorkspaceStatsPanelProps = {
  model: SenaModel;
  enaManifest: SenaEnaManifest;
  snaManifest: SenaSnaManifest;
  runtimeConsistencyAudit: SenaRuntimeConsistencyAudit;
  methodValidation: SenaValidation;
  methodProtocol: SenaMethodProtocol;
  icon: ElementType;
  onSelect: (id: string) => void;
  onExportSocialReport: () => void;
  onExportEnaManifestJson: () => void;
  onExportSnaManifestJson: () => void;
  onExportPairReport: () => void;
  onExportMetricProvenance: () => void;
  onExportMethodProtocol: () => void;
};

export function WorkspaceStatsPanel({
  model,
  enaManifest,
  snaManifest,
  runtimeConsistencyAudit,
  methodValidation,
  methodProtocol,
  icon,
  onSelect,
  onExportSocialReport,
  onExportEnaManifestJson,
  onExportSnaManifestJson,
  onExportPairReport,
  onExportMetricProvenance,
  onExportMethodProtocol
}: WorkspaceStatsPanelProps) {
  const topActors = [...model.socialReport.actors]
    .sort((a, b) => b.strength - a.strength || b.degree - a.degree || a.label.localeCompare(b.label))
    .slice(0, 4);
  const topPairs = [...model.pairReport]
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label))
    .slice(0, 4);

  return (
    <Panel title="Stats" icon={icon} className="p-4">
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2">
          <MetricCell label="Tie count" value={model.socialReport.graph.tieCount} />
          <MetricCell label="Density" value={formatStatsPanelNumber(model.socialReport.graph.density)} />
          <MetricCell label="Avg path" value={formatStatsPanelNumber(model.socialReport.graph.averagePathLength)} />
          <MetricCell label="G pairs" value={topPairs.length} />
        </div>

        <div
          data-testid="stats-runtime-snapshot"
          data-visual-role="stats-jena-jsna-runtime-snapshot"
          className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-black uppercase text-slate-500">Local runtime snapshot</div>
              <div className="mt-1 text-sm font-black text-slate-950">jENA + jSNA</div>
            </div>
            <span className="rounded-full border border-cyanGlow/35 bg-cyanGlow/10 px-2 py-1 text-[0.65rem] font-black uppercase text-cyanGlow">live JS</span>
          </div>

          <div className="grid gap-2">
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase text-violet-700">jENA</span>
                <span className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[0.62rem] font-black text-violet-700">{enaManifest.status}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <MetricCell label="Dims" value={enaManifest.outputs?.dimensions.slice(0, 2).join(" / ") || "NA"} />
                <MetricCell label="Variance" value={formatStatsPanelPercent(Object.values(enaManifest.outputs?.variance ?? {})[0])} />
                <MetricCell label="Unit points" value={enaManifest.outputs?.points.length ?? 0} />
                <MetricCell label="Line weights" value={enaManifest.outputs?.lineWeights.length ?? 0} />
              </div>
            </div>

            <JenaConceptHandoffPanel audit={runtimeConsistencyAudit} />

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase text-blue-700">jSNA</span>
                <span className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[0.62rem] font-black text-blue-700">{snaManifest.status}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <MetricCell label="Engine" value={snaManifest.engineAlias} />
                <MetricCell label="Ties" value={snaManifest.datasetCounts.weightedTies} />
                <MetricCell label="Components" value={snaManifest.datasetCounts.components} />
                <MetricCell label="Communities" value={snaManifest.datasetCounts.communities} />
              </div>
            </div>

            <JsnaSocialHandoffPanel audit={runtimeConsistencyAudit} />
          </div>
        </div>

        <MetricProvenanceSummary validation={methodValidation} />

        <MethodProtocolHandoffPanel protocol={methodProtocol} onExportMethodProtocol={onExportMethodProtocol} />

        <div className="grid gap-2">
          <div className="text-xs font-black uppercase text-slate-500">Top actors</div>
          {topActors.map((actor) => (
            <button
              key={actor.id}
              type="button"
              onClick={() => onSelect(actor.id)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-cyanGlow/50"
            >
              <span className="block text-sm font-black text-slate-950">{actor.label}</span>
              <span className="block text-xs font-semibold text-slate-500">strength {formatStatsPanelNumber(actor.strength, 1)} - degree {formatStatsPanelNumber(actor.degree, 1)}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-2">
          <div className="text-xs font-black uppercase text-slate-500">Top G pairs</div>
          {topPairs.map((pair) => {
            const selectionTarget = pairReportSelectionTarget(model, pair);
            return (
              <button
                key={pair.id}
                type="button"
                data-testid="stats-top-g-pair"
                data-pair-id={pair.id}
                data-selection-target={selectionTarget}
                onClick={() => onSelect(selectionTarget)}
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left transition hover:border-rose-300"
              >
                <span className="block text-sm font-black text-slate-950">{pair.label}</span>
                <span className="block text-xs font-semibold text-slate-500">total {formatStatsPanelNumber(pair.totalContribution, 1)}</span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-2">
          <button data-testid="export-stats-sna-report" onClick={onExportSocialReport} className={buttonStyles({ variant: "secondary" })}>
            <Download className="h-4 w-4" /> Export SNA report
          </button>
          <button data-testid="export-stats-jena-manifest" onClick={onExportEnaManifestJson} className={buttonStyles({ variant: "secondary" })}>
            <Download className="h-4 w-4" /> Export jENA manifest
          </button>
          <button data-testid="export-stats-jsna-manifest" onClick={onExportSnaManifestJson} className={buttonStyles({ variant: "secondary" })}>
            <Download className="h-4 w-4" /> Export jSNA manifest
          </button>
          <button data-testid="export-stats-g-report" onClick={onExportPairReport} className={buttonStyles({ variant: "secondary" })}>
            <Download className="h-4 w-4" /> Export G report
          </button>
          <button data-testid="export-stats-metric-provenance" onClick={onExportMetricProvenance} className={buttonStyles({ variant: "secondary" })}>
            <Download className="h-4 w-4" /> Export metric provenance
          </button>
        </div>
      </div>
    </Panel>
  );
}
