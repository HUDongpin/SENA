import {
  ChevronDown,
  Database
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SenaModel,
  SenaTemporalWindow
} from "./analysis-runtime";

export type WorkspaceDataViewDrawerProps = {
  model: SenaModel;
  activeWindow?: SenaTemporalWindow;
  isOpen: boolean;
  onToggle: () => void;
};

function formatDrawerNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export function WorkspaceDataViewDrawer({
  model,
  activeWindow,
  isOpen,
  onToggle
}: WorkspaceDataViewDrawerProps) {
  const peopleById = new Map(model.people.map((person) => [person.id, person]));
  const codeById = new Map(model.codes.map((code) => [code.id, code]));
  const sortByTurn = <T extends { turnIndex?: number }>(a: T, b: T) => {
    return (a.turnIndex ?? Number.MAX_SAFE_INTEGER) - (b.turnIndex ?? Number.MAX_SAFE_INTEGER);
  };
  const utterances = [...model.dataset.utterances].sort((a, b) => sortByTurn(a, b) || a.id.localeCompare(b.id)).slice(0, 24);
  const segments = [...model.dataset.coded_segments].sort((a, b) => sortByTurn(a, b) || a.segmentId.localeCompare(b.segmentId)).slice(0, 24);
  const interactions = [...model.dataset.interactions].sort((a, b) => sortByTurn(a, b) || `${a.source}-${a.target}`.localeCompare(`${b.source}-${b.target}`)).slice(0, 24);
  const windowLabel = activeWindow ? `${activeWindow.label} · Turns ${activeWindow.startTurn}-${activeWindow.endTurn}` : "Full conversation";
  const matrixRows = [
    ["People", model.people.length],
    ["Utterances", model.dataset.utterances.length],
    ["Segments", model.dataset.coded_segments.length],
    ["S ties", model.summary.socialEdges],
    ["W links", model.summary.conceptEdges],
    ["B bridges", model.summary.bridgeEdges]
  ] as const;

  return (
    <div
      data-testid="workspace-data-view-drawer"
      data-visual-role="workspace-bottom-data-view-drawer"
      data-open={String(isOpen)}
      className="mt-5 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-[0_8px_22px_rgb(15_23_42/0.08)]"
    >
      <button
        type="button"
        data-testid="workspace-data-view-toggle"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 bg-[#252525] px-4 py-2 text-left text-sm font-black text-white transition hover:bg-[#303030] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <Database className="h-4 w-4 shrink-0 text-[#56b09d]" />
          <span>Data View</span>
          <span className="hidden truncate text-xs font-semibold text-white/62 md:inline">{windowLabel}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-white/70">
          {model.dataset.utterances.length} rows
          <ChevronDown className={cn("h-4 w-4 transition", isOpen && "rotate-180")} />
        </span>
      </button>

      {isOpen && (
        <div data-testid="workspace-data-view-content" className="grid gap-3 border-t border-[#56b09d] bg-slate-50 p-3 text-xs text-slate-700">
          <div className="grid gap-2 md:grid-cols-3 2xl:grid-cols-6">
            {matrixRows.map(([label, value]) => (
              <div key={label} className="rounded border border-slate-200 bg-white px-3 py-2">
                <div className="text-[0.62rem] font-black uppercase tracking-[0.1em] text-slate-500">{label}</div>
                <div className="mt-1 text-base font-black text-slate-950">{value}</div>
              </div>
            ))}
          </div>

          <div className="grid min-w-0 gap-3 xl:grid-cols-3">
            <div data-testid="workspace-data-view-utterances" className="min-w-0 overflow-hidden rounded border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-[0.68rem] font-black uppercase tracking-[0.1em] text-slate-600">Utterances</div>
              <div className="max-h-64 overflow-auto">
                <table className="w-full min-w-[28rem] table-fixed border-collapse">
                  <thead className="sticky top-0 bg-white text-left text-[0.62rem] uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="w-14 border-b border-slate-200 px-3 py-2">Turn</th>
                      <th className="w-24 border-b border-slate-200 px-3 py-2">Speaker</th>
                      <th className="border-b border-slate-200 px-3 py-2">Text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {utterances.map((utterance) => (
                      <tr key={utterance.id} className="border-b border-slate-100 align-top last:border-0">
                        <td className="px-3 py-2 font-black text-slate-950">{utterance.turnIndex}</td>
                        <td className="px-3 py-2 font-bold text-slate-700">{peopleById.get(utterance.personId)?.label ?? utterance.personId}</td>
                        <td className="px-3 py-2 leading-relaxed text-slate-600">{utterance.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div data-testid="workspace-data-view-segments" className="min-w-0 overflow-hidden rounded border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-[0.68rem] font-black uppercase tracking-[0.1em] text-slate-600">Coded Segments</div>
              <div className="max-h-64 overflow-auto">
                <table className="w-full min-w-[30rem] table-fixed border-collapse">
                  <thead className="sticky top-0 bg-white text-left text-[0.62rem] uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="w-14 border-b border-slate-200 px-3 py-2">Turn</th>
                      <th className="w-36 border-b border-slate-200 px-3 py-2">Codes</th>
                      <th className="border-b border-slate-200 px-3 py-2">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segments.map((segment) => (
                      <tr key={segment.segmentId} className="border-b border-slate-100 align-top last:border-0">
                        <td className="px-3 py-2 font-black text-slate-950">{segment.turnIndex}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {segment.codes.map((codeId) => (
                              <span key={codeId} className="rounded bg-cyanGlow/10 px-1.5 py-0.5 font-black text-slate-700">
                                {codeById.get(codeId)?.label ?? codeId}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 leading-relaxed text-slate-600">{segment.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div data-testid="workspace-data-view-interactions" className="min-w-0 overflow-hidden rounded border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 text-[0.68rem] font-black uppercase tracking-[0.1em] text-slate-600">Interactions</div>
              <div className="max-h-64 overflow-auto">
                <table className="w-full min-w-[28rem] table-fixed border-collapse">
                  <thead className="sticky top-0 bg-white text-left text-[0.62rem] uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="w-14 border-b border-slate-200 px-3 py-2">Turn</th>
                      <th className="w-28 border-b border-slate-200 px-3 py-2">Tie</th>
                      <th className="w-16 border-b border-slate-200 px-3 py-2">W</th>
                      <th className="border-b border-slate-200 px-3 py-2">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interactions.map((interaction, index) => (
                      <tr key={`${interaction.source}-${interaction.target}-${interaction.turnIndex ?? index}`} className="border-b border-slate-100 align-top last:border-0">
                        <td className="px-3 py-2 font-black text-slate-950">{interaction.turnIndex ?? "all"}</td>
                        <td className="px-3 py-2 font-bold text-slate-700">
                          {`${peopleById.get(interaction.source)?.label ?? interaction.source} -> ${peopleById.get(interaction.target)?.label ?? interaction.target}`}
                        </td>
                        <td className="px-3 py-2 font-black text-slate-950">{formatDrawerNumber(interaction.weight ?? 1)}</td>
                        <td className="px-3 py-2 leading-relaxed text-slate-600">{interaction.evidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
