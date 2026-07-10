import type {
  SenaEdge,
  SenaLayer,
  SenaModel,
  SenaTemporalWindow
} from "./analysis-runtime";

export type WorkspaceSecondaryComparisonLensProps = {
  currentModel: SenaModel;
  baselineModel: SenaModel;
  activeWindow?: SenaTemporalWindow;
};

function formatComparisonNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

function matrixTotal(values: number[][]) {
  return values.reduce((total, row) => total + row.reduce((rowTotal, value) => rowTotal + (Number.isFinite(value) ? value : 0), 0), 0);
}

function formatShare(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || Math.abs(total) < 1e-9) return "NA";
  return `${formatComparisonNumber((value / total) * 100, 0)}%`;
}

type WorkspaceRankingContextRow = {
  id: "top-social-tie" | "top-concept-tie" | "top-bridge-tie" | "top-g-pair";
  label: string;
  layer: "S" | "W" | "B" | "G";
  signalLabel: string;
  currentWeight: number;
  baselineWeight: number;
  baselineRank: number | null;
  baselineItemCount: number;
  baselineShare: number | null;
};

function rankedWorkspaceEdges(model: SenaModel, layer: SenaLayer) {
  return [...model.edges]
    .filter((edge) => edge.layer === layer && edge.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
}

function rankedWorkspaceGPairs(model: SenaModel) {
  return [...model.pairReport]
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label));
}

function formatRank(rank: number | null, total: number) {
  return rank === null ? "NA" : `${rank}/${total}`;
}

function buildEdgeRankingContextRow({
  id,
  label,
  layer,
  currentEdge,
  baselineEdges
}: {
  id: WorkspaceRankingContextRow["id"];
  label: string;
  layer: WorkspaceRankingContextRow["layer"];
  currentEdge?: SenaEdge;
  baselineEdges: SenaEdge[];
}): WorkspaceRankingContextRow {
  const baselineIndex = currentEdge ? baselineEdges.findIndex((edge) => edge.id === currentEdge.id) : -1;
  const baselineEdge = baselineIndex >= 0 ? baselineEdges[baselineIndex] : undefined;
  const baselineTotal = baselineEdges.reduce((total, edge) => total + edge.weight, 0);
  return {
    id,
    label,
    layer,
    signalLabel: currentEdge?.label ?? "NA",
    currentWeight: currentEdge?.weight ?? 0,
    baselineWeight: baselineEdge?.weight ?? 0,
    baselineRank: baselineIndex >= 0 ? baselineIndex + 1 : null,
    baselineItemCount: baselineEdges.length,
    baselineShare: baselineEdge && baselineTotal > 0 ? baselineEdge.weight / baselineTotal : null
  };
}

function buildGPairRankingContextRow({
  currentPair,
  baselinePairs
}: {
  currentPair?: SenaModel["pairReport"][number];
  baselinePairs: SenaModel["pairReport"];
}): WorkspaceRankingContextRow {
  const baselineIndex = currentPair ? baselinePairs.findIndex((pair) => pair.id === currentPair.id) : -1;
  const baselinePair = baselineIndex >= 0 ? baselinePairs[baselineIndex] : undefined;
  const baselineTotal = baselinePairs.reduce((total, pair) => total + pair.totalContribution, 0);
  return {
    id: "top-g-pair",
    label: "Top G",
    layer: "G",
    signalLabel: currentPair?.label ?? "NA",
    currentWeight: currentPair?.totalContribution ?? 0,
    baselineWeight: baselinePair?.totalContribution ?? 0,
    baselineRank: baselineIndex >= 0 ? baselineIndex + 1 : null,
    baselineItemCount: baselinePairs.length,
    baselineShare: baselinePair && baselineTotal > 0 ? baselinePair.totalContribution / baselineTotal : null
  };
}

export function WorkspaceSecondaryComparisonLens({
  currentModel,
  baselineModel,
  activeWindow
}: WorkspaceSecondaryComparisonLensProps) {
  const currentGTotal = currentModel.pairReport.reduce((total, pair) => total + pair.totalContribution, 0);
  const baselineGTotal = baselineModel.pairReport.reduce((total, pair) => total + pair.totalContribution, 0);
  const currentFusionTotal = matrixTotal(currentModel.matrices.fusion.values);
  const baselineFusionTotal = matrixTotal(baselineModel.matrices.fusion.values);
  const currentTopG = [...currentModel.pairReport]
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label))[0];
  const baselineTopG = [...baselineModel.pairReport]
    .filter((pair) => pair.totalContribution > 0)
    .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label))[0];
  const comparisonRows = [
    {
      id: "sna-density",
      label: "SNA density",
      current: currentModel.socialReport.graph.density,
      baseline: baselineModel.socialReport.graph.density,
      digits: 2
    },
    {
      id: "social-ties",
      label: "S ties",
      current: currentModel.summary.socialEdges,
      baseline: baselineModel.summary.socialEdges,
      digits: 0
    },
    {
      id: "ena-links",
      label: "W ENA links",
      current: currentModel.summary.conceptEdges,
      baseline: baselineModel.summary.conceptEdges,
      digits: 0
    },
    {
      id: "bridge-links",
      label: "B bridges",
      current: currentModel.summary.bridgeEdges,
      baseline: baselineModel.summary.bridgeEdges,
      digits: 0
    },
    {
      id: "g-total",
      label: "G total",
      current: currentGTotal,
      baseline: baselineGTotal,
      digits: 1
    },
    {
      id: "fusion-total",
      label: "A_fusion",
      current: currentFusionTotal,
      baseline: baselineFusionTotal,
      digits: 1
    }
  ];
  const baselineSocialEdges = rankedWorkspaceEdges(baselineModel, "social");
  const baselineConceptEdges = rankedWorkspaceEdges(baselineModel, "concept");
  const baselineBridgeEdges = rankedWorkspaceEdges(baselineModel, "bridge");
  const baselineGPairs = rankedWorkspaceGPairs(baselineModel);
  const rankingRows: WorkspaceRankingContextRow[] = [
    buildEdgeRankingContextRow({
      id: "top-social-tie",
      label: "Top S",
      layer: "S",
      currentEdge: currentModel.summary.strongestSocialTie,
      baselineEdges: baselineSocialEdges
    }),
    buildEdgeRankingContextRow({
      id: "top-concept-tie",
      label: "Top W",
      layer: "W",
      currentEdge: currentModel.summary.strongestConceptTie,
      baselineEdges: baselineConceptEdges
    }),
    buildEdgeRankingContextRow({
      id: "top-bridge-tie",
      label: "Top B",
      layer: "B",
      currentEdge: currentModel.summary.strongestBridgeTie,
      baselineEdges: baselineBridgeEdges
    }),
    buildGPairRankingContextRow({
      currentPair: currentTopG,
      baselinePairs: baselineGPairs
    })
  ];

  return (
    <div
      data-testid="workspace-secondary-comparison-lens"
      data-visual-role="secondary-plot-current-window-comparison"
      className="mb-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-black uppercase text-slate-500">Current-window comparison lens</div>
          <div className="mt-1 text-sm font-black text-slate-950">
            {activeWindow ? activeWindow.label : "Full conversation"} vs full conversation
          </div>
        </div>
        <span className="w-fit rounded-full border border-cyanGlow/30 bg-cyanGlow/10 px-2 py-1 text-[0.68rem] font-black uppercase text-cyanGlow">
          Secondary Plot
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-[0.68rem]">
          <thead className="bg-slate-100 text-slate-500">
            <tr>
              <th className="px-2 py-1.5 font-black">Metric</th>
              <th className="px-2 py-1.5 text-right font-black">Window</th>
              <th className="px-2 py-1.5 text-right font-black">Full</th>
              <th className="px-2 py-1.5 text-right font-black">Share</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-200">
                <td className="px-2 py-1.5 font-black text-slate-700">{row.label}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-slate-950">{formatComparisonNumber(row.current, row.digits)}</td>
                <td className="px-2 py-1.5 text-right font-semibold text-slate-600">{formatComparisonNumber(row.baseline, row.digits)}</td>
                <td className="px-2 py-1.5 text-right font-black text-cyanGlow">{formatShare(row.current, row.baseline)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2">
        <div className="rounded-lg border border-violet-200 bg-white p-2">
          <div className="text-[0.66rem] font-black uppercase text-violet-600">Top ENA W link</div>
          <div className="mt-1 truncate text-xs font-black text-slate-950" title={currentModel.summary.strongestConceptTie?.label ?? "NA"}>
            {currentModel.summary.strongestConceptTie?.label ?? "NA"}
          </div>
          <div className="mt-1 text-[0.68rem] font-semibold text-slate-500">
            full: {baselineModel.summary.strongestConceptTie?.label ?? "NA"}
          </div>
        </div>
        <div className="rounded-lg border border-rose-200 bg-white p-2">
          <div className="text-[0.66rem] font-black uppercase text-rose-600">Top G pair</div>
          <div className="mt-1 truncate text-xs font-black text-slate-950" title={currentTopG?.label ?? "NA"}>
            {currentTopG?.label ?? "NA"}
          </div>
          <div className="mt-1 text-[0.68rem] font-semibold text-slate-500">
            full: {baselineTopG?.label ?? "NA"}
          </div>
        </div>
      </div>

      <div
        data-testid="workspace-secondary-ranking-context"
        data-visual-role="secondary-plot-signal-ranking-context"
        className="overflow-hidden rounded-lg border border-slate-200 bg-white"
      >
        <div className="border-b border-slate-200 bg-slate-100 px-2 py-1.5 text-[0.66rem] font-black uppercase text-slate-500">
          Current top signals in full corpus
        </div>
        <table className="w-full text-left text-[0.68rem]">
          <thead className="text-slate-500">
            <tr>
              <th className="px-2 py-1.5 font-black">Layer</th>
              <th className="px-2 py-1.5 font-black">Signal</th>
              <th className="px-2 py-1.5 text-right font-black">Rank</th>
              <th className="px-2 py-1.5 text-right font-black">Full share</th>
            </tr>
          </thead>
          <tbody>
            {rankingRows.map((row) => (
              <tr key={row.id} className="border-t border-slate-200">
                <td className="px-2 py-1.5 font-black text-slate-700">{row.layer}</td>
                <td className="max-w-[7.5rem] truncate px-2 py-1.5 font-semibold text-slate-950" title={row.signalLabel}>
                  {row.signalLabel}
                </td>
                <td className="px-2 py-1.5 text-right font-black text-slate-700">{formatRank(row.baselineRank, row.baselineItemCount)}</td>
                <td className="px-2 py-1.5 text-right font-black text-cyanGlow">
                  {row.baselineShare === null ? "NA" : `${formatComparisonNumber(row.baselineShare * 100, 0)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[0.68rem] font-semibold leading-5 text-slate-500">
        Shares compare the active analysis window with the full source dataset under the same alpha/beta/gamma and normalization settings; they are descriptive, not inferential.
      </div>
    </div>
  );
}
