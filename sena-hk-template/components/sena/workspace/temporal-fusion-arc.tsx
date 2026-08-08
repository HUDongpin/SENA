"use client";

import { hexPoints } from "@/lib/sena/hex";
import type { SenaModel, SenaTemporalRuntimeTrace, SenaTemporalWindow } from "@/lib/sena/types";
import { cn } from "@/lib/utils";

const temporalFusionPhases = [
  {
    label: "Plan",
    subtitle: "Question + hypothesis",
    match: /(plan|brainstorm|question|hypothesis|forming)/i,
    tint: "#dbeafe"
  },
  {
    label: "Teach",
    subtitle: "Evidence building",
    match: /(teach|evidence|build|lesson|inquiry)/i,
    tint: "#e0f7ff"
  },
  {
    label: "Reflect",
    subtitle: "Explanation + reflection",
    match: /(reflect|reflection|explain|synthesis|review)/i,
    tint: "#f4e8ff"
  }
] as const;

function temporalPhaseIndex(window: SenaTemporalWindow, index: number, total: number) {
  const source = `${window.label} ${window.stages.join(" ")}`;
  const matched = temporalFusionPhases.findIndex((phase) => phase.match.test(source));
  if (matched >= 0) return matched;
  return Math.min(temporalFusionPhases.length - 1, Math.floor((index / Math.max(1, total)) * temporalFusionPhases.length));
}

function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function truncateSvgText(value: string, maxLength = 13) {
  return value.length > maxLength ? `${value.slice(0, Math.max(1, maxLength - 1))}.` : value;
}

export function TemporalFusionArc({
  windows,
  activeIndex,
  people,
  codes,
  temporalRuntimeTrace,
  onSelect
}: {
  windows: SenaTemporalWindow[];
  activeIndex: number;
  people: SenaModel["people"];
  codes: SenaModel["codes"];
  temporalRuntimeTrace?: SenaTemporalRuntimeTrace;
  onSelect: (index: number) => void;
}) {
  const chartWidth = 760;
  const chartHeight = 360;
  const activeWindow = windows[activeIndex];
  const codeColor = new Map(codes.map((code) => [code.id, code.color]));
  const codeLabel = new Map(codes.map((code) => [code.id, code.label]));
  const traceByWindowId = new Map((temporalRuntimeTrace?.windows ?? []).map((entry) => [entry.window.id, entry]));
  const gTotals = windows.map((window) => traceByWindowId.get(window.id)?.sena.matrixTotals.G ?? 0);
  const gTotalMax = Math.max(1, ...gTotals);
  const gForWindow = (window?: SenaTemporalWindow) => {
    if (!window) return { normalized: 0, total: 0, activePairs: 0, strongestPair: undefined };
    const entry = traceByWindowId.get(window.id);
    const total = entry?.sena.matrixTotals.G ?? 0;
    return {
      normalized: total / gTotalMax,
      total,
      activePairs: entry?.sena.activeGPairs ?? 0,
      strongestPair: entry?.sena.strongestGPair
    };
  };
  const personInitials = new Map(people.map((person) => {
    const fallback = person.label.split(/\s+/).map((part: string) => part[0]).join("").slice(0, 2).toUpperCase();
    return [person.id, person.initials ?? (fallback || person.id.slice(0, 2).toUpperCase())];
  }));

  if (windows.length === 0) {
    return (
      <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-4 text-sm font-semibold text-muted">
        Temporal Fusion Arc will appear when stage or turn windows are available.
      </div>
    );
  }

  const phaseGroups = temporalFusionPhases.map((phase, phaseIndex) => ({
    ...phase,
    index: phaseIndex,
    x: 130 + phaseIndex * 250,
    windows: windows
      .map((window, windowIndex) => ({ window, windowIndex }))
      .filter(({ window, windowIndex }) => temporalPhaseIndex(window, windowIndex, windows.length) === phaseIndex)
  }));

  const activePhaseIndex = activeWindow ? temporalPhaseIndex(activeWindow, activeIndex, windows.length) : 0;
  const phaseConcepts = phaseGroups.map((phase) => {
    const scores = new Map<string, { label: string; weight: number; color: string }>();
    for (const { window } of phase.windows) {
      for (const code of window.topCodes) {
        const current = scores.get(code.id);
        scores.set(code.id, {
          label: codeLabel.get(code.id) ?? code.label,
          weight: Math.max(current?.weight ?? 0, code.weight),
          color: codeColor.get(code.id) ?? "#8b5cf6"
        });
      }
    }
    return Array.from(scores.values()).sort((a, b) => b.weight - a.weight).slice(0, 2);
  });

  const phaseActors = phaseGroups.map((phase) => {
    const counts = new Map<string, number>();
    for (const { window } of phase.windows) {
      for (const snippet of window.evidence) {
        if (!snippet.personId) continue;
        counts.set(snippet.personId, (counts.get(snippet.personId) ?? 0) + 1);
      }
    }
    const [personId] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0] ?? [];
    return personId ? personInitials.get(personId) ?? personId.slice(0, 2).toUpperCase() : "";
  });

  const conceptNodes = phaseGroups.flatMap((phase, phaseIndex) => {
    const concepts = phaseConcepts[phaseIndex];
    const fallbackLabel = phaseIndex === 0 ? "Question" : phaseIndex === 1 ? "Evidence" : "Reflection";
    const rows = concepts.length > 0 ? concepts : [{ label: fallbackLabel, weight: 0, color: phaseIndex === 2 ? "#e253a5" : "#8b5cf6" }];
    return rows.map((concept, conceptIndex) => ({
      ...concept,
      phaseIndex,
      x: phase.x + (conceptIndex === 0 ? -32 : 32),
      y: conceptIndex === 0 ? 145 : 216,
      radius: 35 + Math.min(9, Math.max(0, concept.weight) * 0.8)
    }));
  });

  const representativeIndex = (phaseIndex: number) => {
    const activeInPhase = phaseGroups[phaseIndex].windows.find(({ windowIndex }) => windowIndex === activeIndex);
    return activeInPhase?.windowIndex ?? phaseGroups[phaseIndex].windows[0]?.windowIndex ?? 0;
  };
  const phaseSummaries = phaseGroups.map((phase) => {
    const windowIndex = representativeIndex(phase.index);
    const window = windows[windowIndex];
    return {
      phase,
      window,
      windowIndex,
      evidenceCount: phase.windows.reduce((total, entry) => total + entry.window.evidence.length, 0)
    };
  });

  return (
    <div data-testid="temporal-fusion-arc" className="overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.75)]">
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-slate-950">Temporal Fusion Arc</div>
          <div className="mt-1 text-xs font-semibold text-slate-600">Plan - Teach - Reflect story view linked to the active temporal window.</div>
        </div>
        <div className="flex flex-wrap gap-2 text-[0.68rem] font-black text-slate-600">
          <span className="rounded-full border border-blue-400/25 bg-blue-400/10 px-2 py-1">S social spine</span>
          <span className="rounded-full border border-violetGlow/25 bg-violetGlow/10 px-2 py-1">W concept transitions</span>
          <span className="rounded-full border border-cyanGlow/25 bg-cyanGlow/10 px-2 py-1">B bridge moments</span>
          <span className="rounded-full border border-rose-300/25 bg-rose-400/10 px-2 py-1">G pair contributions</span>
          <span className="rounded-full border border-rose-200/20 bg-rose-300/8 px-2 py-1">Top G pair</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-[22rem] w-full" role="img" aria-label="Temporal Fusion Arc Plan Teach Reflect">
        <defs>
          <linearGradient id="temporal-bridge-gradient" x1="0" x2="1">
            <stop offset="0%" stopColor="#24dcee" />
            <stop offset="100%" stopColor="#7aa7ff" />
          </linearGradient>
          <linearGradient id="temporal-concept-gradient" x1="0" x2="1">
            <stop offset="0%" stopColor="#735cf6" />
            <stop offset="100%" stopColor="#b14cf1" />
          </linearGradient>
          <linearGradient id="temporal-g-gradient" x1="0" x2="1">
            <stop offset="0%" stopColor="#fb7185" />
            <stop offset="100%" stopColor="#e253a5" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={chartWidth} height={chartHeight} rx="12" fill="#ffffff" />
        {phaseGroups.map((phase) => (
          <g key={phase.label} onClick={() => onSelect(representativeIndex(phase.index))} className="cursor-pointer">
            <rect
              x={phase.x - 106}
              y="34"
              width="212"
              height="282"
              rx="22"
              fill={phase.tint}
              opacity={phase.index === activePhaseIndex ? 0.72 : 0.42}
              stroke={phase.index === activePhaseIndex ? "#24dcee" : "#cbd5e1"}
              strokeWidth={phase.index === activePhaseIndex ? 1.8 : 1}
            />
            <text x={phase.x} y="64" textAnchor="middle" fill="#0f172a" fontSize="20" fontWeight="950">
              {phase.label}
            </text>
            <text x={phase.x} y="84" textAnchor="middle" fill="#475569" fontSize="10" fontWeight="900">
              {phase.subtitle.toUpperCase()}
            </text>
            <title>{`${phase.label}: ${phase.windows.map(({ window }) => window.label).join(", ") || "no windows"}`}</title>
          </g>
        ))}

        <path d="M 90 274 C 220 92 415 92 670 274" fill="none" stroke="#2f73ff" strokeWidth="5.5" strokeLinecap="round" opacity="0.72" />
        <path d="M 104 260 C 250 200 485 200 656 260" fill="none" stroke="url(#temporal-bridge-gradient)" strokeWidth="9" strokeLinecap="round" opacity="0.34" />
        <path d="M 130 216 C 270 130 510 130 630 216" fill="none" stroke="url(#temporal-concept-gradient)" strokeWidth="4.5" strokeLinecap="round" opacity="0.62" />
        <path
          data-visual-role="temporal-g-pair-arc"
          d="M 122 286 C 260 322 492 322 638 286"
          fill="none"
          stroke="url(#temporal-g-gradient)"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.58"
        />

        {conceptNodes.slice(0, -1).map((node, index) => {
          const next = conceptNodes[index + 1];
          return (
            <path
              key={`${node.label}-${index}`}
              d={`M ${node.x} ${node.y} L ${next.x} ${next.y}`}
              fill="none"
              stroke="url(#temporal-concept-gradient)"
              strokeWidth="2.8"
              strokeLinecap="round"
              opacity="0.42"
            />
          );
        })}

        {conceptNodes.map((node, index) => {
          const active = node.phaseIndex === activePhaseIndex;
          return (
            <g key={`${node.phaseIndex}-${node.label}-${index}`}>
              <polygon
                points={hexPoints(node.x, node.y, node.radius)}
                fill={node.color}
                opacity={active ? 0.96 : 0.78}
                stroke={active ? "#ffffff" : "rgb(var(--background))"}
                strokeWidth={active ? 3 : 1.8}
              />
              <text x={node.x} y={node.y + 4} textAnchor="middle" fill="white" fontSize="11" fontWeight="950">
                {truncateSvgText(node.label)}
              </text>
              <title>{`${node.label}: W ${formatNumber(node.weight, 1)}`}</title>
            </g>
          );
        })}

        {phaseGroups.map((phase, index) => {
          const actor = phaseActors[index];
          if (!actor) return null;
          return (
            <g key={`${phase.label}-actor`}>
              <line x1={phase.x} y1="252" x2={phase.x} y2="292" stroke="#24dcee" strokeWidth="6" strokeLinecap="round" opacity="0.28" />
              <circle cx={phase.x} cy="292" r="24" fill="#f8fbff" stroke="#24dcee" strokeWidth="2.4" />
              <text x={phase.x} y="299" textAnchor="middle" fill="#0f172a" fontSize="14" fontWeight="950">
                {actor}
              </text>
            </g>
          );
        })}

        {phaseGroups.map((phase) => {
          const representative = phase.windows.find(({ windowIndex }) => windowIndex === activeIndex)?.window ?? phase.windows[0]?.window;
          const y = 336;
          const socialWidth = Math.max(8, Math.min(54, (representative?.socialConnectivity ?? 0) * 54));
          const conceptWidth = Math.max(8, Math.min(54, (representative?.conceptConnectivity ?? 0) * 54));
          const bridgeWidth = Math.max(8, Math.min(54, (representative?.bridgeIntegration ?? 0) * 54));
          const gMetric = gForWindow(representative);
          const gWidth = Math.max(8, Math.min(54, gMetric.normalized * 54));
          return (
            <g key={`${phase.label}-metrics`}>
              <rect x={phase.x - 60} y={y - 34} width="120" height="52" rx="10" fill="#f8fafc" stroke="#cbd5e1" />
              <line x1={phase.x - 48} x2={phase.x - 48 + socialWidth} y1={y - 17} y2={y - 17} stroke="#2f73ff" strokeWidth="4" strokeLinecap="round" />
              <line x1={phase.x - 48} x2={phase.x - 48 + conceptWidth} y1={y - 7} y2={y - 7} stroke="#a855f7" strokeWidth="4" strokeLinecap="round" />
              <line x1={phase.x - 48} x2={phase.x - 48 + bridgeWidth} y1={y + 3} y2={y + 3} stroke="#24dcee" strokeWidth="4" strokeLinecap="round" />
              <line
                data-visual-role="temporal-g-pair-metric"
                x1={phase.x - 48}
                x2={phase.x - 48 + gWidth}
                y1={y + 13}
                y2={y + 13}
                stroke="#fb7185"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <title>{`${phase.label} G pair contributions: total ${formatNumber(gMetric.total, 1)}, active pairs ${gMetric.activePairs}`}</title>
            </g>
          );
        })}
      </svg>
      <div className="grid gap-2 border-t border-slate-200 bg-slate-50 p-3 md:grid-cols-3">
        {phaseSummaries.map(({ phase, window, windowIndex, evidenceCount }) => {
          const active = phase.index === activePhaseIndex;
          const gMetric = gForWindow(window);
          return (
            <button
              key={phase.label}
              type="button"
              data-testid={`temporal-fusion-phase-${phase.label.toLowerCase()}`}
              aria-pressed={active}
              onClick={() => onSelect(windowIndex)}
              className={cn(
                "grid gap-1 rounded-lg border px-3 py-2 text-left transition",
                active ? "border-cyanGlow/65 bg-cyanGlow/12 text-slate-950" : "border-slate-200 bg-white text-slate-600 hover:border-cyanGlow/45 hover:text-slate-950"
              )}
            >
              <span className="flex items-center justify-between gap-2 text-xs font-black uppercase">
                {phase.label}
                {active && <span className="rounded-full border border-cyanGlow/35 px-2 py-0.5 text-[0.62rem] text-cyanGlow">Active</span>}
              </span>
              <span className="truncate text-sm font-black">{window?.label ?? "No window"}</span>
              <span className="text-xs font-semibold">
                {window ? `Turns ${window.startTurn}-${window.endTurn} · ${evidenceCount} evidence refs` : "No temporal evidence yet"}
              </span>
              <span className="text-xs font-semibold text-rose-600">
                {window ? `${gMetric.activePairs} G pairs · G ${formatNumber(gMetric.total, 1)}` : "No G pair contributions yet"}
              </span>
              <span className="truncate text-xs font-semibold text-slate-500">
                {gMetric.strongestPair ? `Top G pair: ${gMetric.strongestPair.label}` : "Top G pair: NA"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
