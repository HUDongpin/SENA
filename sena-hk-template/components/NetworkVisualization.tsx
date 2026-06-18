"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const tabs = ["Group A", "Group B", "Difference"] as const;
type Tab = (typeof tabs)[number];

type NodePoint = {
  id: string;
  x: number;
  y: number;
  label: string;
  kind: "actor" | "code" | "bridge";
};

type Edge = {
  from: string;
  to: string;
  strength: number;
  curve?: number;
};

const nodes: Record<Tab, NodePoint[]> = {
  "Group A": [
    { id: "a1", x: 96, y: 76, label: "F1", kind: "bridge" },
    { id: "a2", x: 170, y: 54, label: "SC", kind: "code" },
    { id: "a3", x: 242, y: 92, label: "GO", kind: "code" },
    { id: "a4", x: 288, y: 178, label: "PoP", kind: "actor" },
    { id: "a5", x: 206, y: 246, label: "ST2", kind: "actor" },
    { id: "a6", x: 108, y: 220, label: "MR", kind: "code" },
    { id: "a7", x: 74, y: 154, label: "IT3", kind: "bridge" }
  ],
  "Group B": [
    { id: "a1", x: 74, y: 80, label: "A1", kind: "actor" },
    { id: "a2", x: 150, y: 122, label: "CI", kind: "code" },
    { id: "a3", x: 246, y: 70, label: "AI", kind: "code" },
    { id: "a4", x: 300, y: 170, label: "RP", kind: "actor" },
    { id: "a5", x: 234, y: 252, label: "SP", kind: "actor" },
    { id: "a6", x: 126, y: 238, label: "CP", kind: "code" },
    { id: "a7", x: 64, y: 170, label: "B2", kind: "bridge" }
  ],
  Difference: [
    { id: "a1", x: 86, y: 90, label: "+SC", kind: "code" },
    { id: "a2", x: 176, y: 62, label: "+GO", kind: "code" },
    { id: "a3", x: 274, y: 104, label: "+RV", kind: "bridge" },
    { id: "a4", x: 286, y: 206, label: "-CI", kind: "actor" },
    { id: "a5", x: 190, y: 252, label: "+CE", kind: "actor" },
    { id: "a6", x: 92, y: 218, label: "-SP", kind: "code" },
    { id: "a7", x: 66, y: 154, label: "+MR", kind: "bridge" }
  ]
};

const edges: Record<Tab, Edge[]> = {
  "Group A": [
    { from: "a1", to: "a2", strength: 0.5 },
    { from: "a2", to: "a3", strength: 0.85 },
    { from: "a3", to: "a4", strength: 0.92 },
    { from: "a4", to: "a5", strength: 0.8 },
    { from: "a5", to: "a6", strength: 0.58 },
    { from: "a6", to: "a7", strength: 0.42 },
    { from: "a7", to: "a1", strength: 0.76 },
    { from: "a1", to: "a5", strength: 0.64, curve: 46 },
    { from: "a2", to: "a6", strength: 0.35, curve: -34 },
    { from: "a3", to: "a7", strength: 0.40, curve: 28 }
  ],
  "Group B": [
    { from: "a1", to: "a2", strength: 0.38 },
    { from: "a2", to: "a3", strength: 0.48 },
    { from: "a3", to: "a4", strength: 0.38 },
    { from: "a4", to: "a5", strength: 0.42 },
    { from: "a5", to: "a6", strength: 0.70 },
    { from: "a6", to: "a7", strength: 0.72 },
    { from: "a7", to: "a1", strength: 0.34 },
    { from: "a2", to: "a5", strength: 0.52, curve: 30 },
    { from: "a1", to: "a6", strength: 0.28, curve: -24 }
  ],
  Difference: [
    { from: "a1", to: "a2", strength: 0.9 },
    { from: "a2", to: "a3", strength: 0.74 },
    { from: "a3", to: "a5", strength: 0.62 },
    { from: "a1", to: "a7", strength: 0.70 },
    { from: "a6", to: "a4", strength: 0.30 },
    { from: "a6", to: "a7", strength: 0.58 },
    { from: "a2", to: "a5", strength: 0.80, curve: 44 },
    { from: "a1", to: "a5", strength: 0.42, curve: -52 }
  ]
};

function pathFor(edge: Edge, index: Map<string, NodePoint>) {
  const a = index.get(edge.from)!;
  const b = index.get(edge.to)!;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const curve = edge.curve ?? 0;
  if (curve) return `M ${a.x} ${a.y} Q ${midX} ${midY - curve} ${b.x} ${b.y}`;
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}

export function NetworkVisualization({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [active, setActive] = useState<Tab>("Group A");
  const currentNodes = nodes[active];
  const nodeIndex = useMemo(() => new Map(currentNodes.map((node) => [node.id, node])), [currentNodes]);

  return (
    <div className={cn("glass-panel relative overflow-hidden rounded-[2rem] p-4", className)}>
      <div className="absolute inset-0 bg-sena-radial opacity-70" />
      <div className="sena-grid absolute inset-0 animate-gridMove opacity-35" />
      <div className="absolute inset-x-0 bottom-[-40%] h-4/5 sena-perspective-grid opacity-70" />
      <div className="relative z-10 flex items-center justify-between gap-4">
        <div>
          <div className="text-[0.65rem] font-black uppercase tracking-[0.28em] text-cyanGlow">SENA Network</div>
          <div className="mt-1 text-lg font-black text-foreground">{active}</div>
        </div>
        {!compact && (
          <div className="flex rounded-full border border-cardBorder/50 bg-background/45 p-1 backdrop-blur-xl">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActive(tab)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-bold transition",
                  active === tab ? "bg-cyanGlow text-slate-950 shadow-glow" : "text-muted hover:text-foreground"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative z-10 mt-4 rounded-[1.5rem] border border-cardBorder/35 bg-background/35 p-2 backdrop-blur-xl">
        <svg viewBox="0 0 360 310" className="h-[310px] w-full" role="img" aria-label="Animated SENA network visualization">
          <defs>
            <linearGradient id="edge-gradient" x1="0" x2="360" y1="0" y2="310" gradientUnits="userSpaceOnUse">
              <stop stopColor="rgb(var(--glow-cyan))" />
              <stop offset="0.55" stopColor="rgb(var(--glow-violet))" />
              <stop offset="1" stopColor="rgb(var(--glow-magenta))" />
            </linearGradient>
            <filter id="node-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g opacity="0.35">
            <line x1="180" x2="180" y1="20" y2="290" stroke="rgb(var(--foreground) / 0.24)" strokeDasharray="4 5" />
            <line x1="38" x2="326" y1="155" y2="155" stroke="rgb(var(--foreground) / 0.24)" strokeDasharray="4 5" />
            <text x="18" y="28" fill="rgb(var(--foreground) / 0.28)" fontSize="10">SNA × ENA</text>
            <text x="292" y="286" fill="rgb(var(--foreground) / 0.28)" fontSize="10">time →</text>
          </g>

          <AnimatePresence mode="popLayout">
            <motion.g key={active} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
              {edges[active].map((edge, idx) => (
                <motion.path
                  key={`${edge.from}-${edge.to}-${idx}`}
                  d={pathFor(edge, nodeIndex)}
                  fill="none"
                  stroke="url(#edge-gradient)"
                  strokeLinecap="round"
                  strokeWidth={1 + edge.strength * 4}
                  opacity={0.22 + edge.strength * 0.58}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.9, delay: idx * 0.035 }}
                />
              ))}

              {currentNodes.map((node, idx) => (
                <motion.g
                  key={node.id}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 180, damping: 18, delay: idx * 0.05 }}
                  filter="url(#node-glow)"
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.kind === "bridge" ? 11 : 8}
                    fill={node.kind === "code" ? "rgb(var(--glow-magenta))" : node.kind === "bridge" ? "rgb(var(--glow-violet))" : "rgb(var(--glow-cyan))"}
                    opacity="0.92"
                  />
                  <circle cx={node.x} cy={node.y} r={node.kind === "bridge" ? 17 : 14} fill="transparent" stroke="rgb(var(--foreground) / 0.20)" />
                  <text x={node.x + 13} y={node.y + 4} fill="rgb(var(--foreground) / 0.78)" fontSize="10" fontWeight="700">
                    {node.label}
                  </text>
                </motion.g>
              ))}

              {[0, 1, 2, 3, 4].map((i) => {
                const n = currentNodes[(i + 2) % currentNodes.length];
                return (
                  <motion.circle
                    key={`particle-${i}-${active}`}
                    cx={n.x}
                    cy={n.y}
                    r="2.5"
                    fill="rgb(var(--glow-cyan))"
                    initial={{ opacity: 0.1, scale: 0.6 }}
                    animate={{ opacity: [0.15, 1, 0.15], scale: [0.6, 1.6, 0.6] }}
                    transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.28 }}
                  />
                );
              })}
            </motion.g>
          </AnimatePresence>
        </svg>
      </div>
    </div>
  );
}
