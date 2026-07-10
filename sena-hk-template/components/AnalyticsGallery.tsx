"use client";

import { motion } from "framer-motion";
import { Activity, BarChart2, Blocks, ChartNoAxesCombined, CircleDot, Download, GitCompare, Network, Route, UsersRound } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { Card, SectionHeading } from "./Primitives";

const gallery = [
  { title: "ENA network graphs", icon: CircleDot, type: "network" },
  { title: "SNA actor graphs", icon: UsersRound, type: "actors" },
  { title: "SENA typed fusion graphs", icon: Blocks, type: "fusion" },
  { title: "Group A vs Group B difference networks", icon: GitCompare, type: "difference" },
  { title: "Temporal trajectory plots", icon: Route, type: "trajectory" },
  { title: "Role dashboards", icon: Activity, type: "bars" },
  { title: "Community comparison panels", icon: ChartNoAxesCombined, type: "panels" },
  { title: "Scaffolding-response maps", icon: Network, type: "map" },
  { title: "Exportable publication figures", icon: Download, type: "figure" }
];

function Preview({ type }: { type: string }) {
  if (type === "trajectory") {
    return (
      <svg viewBox="0 0 220 120" className="h-28 w-full">
        <path d="M15 88 C 52 72, 66 48, 94 54 S 135 92, 168 46 S 202 32, 214 24" fill="none" stroke="rgb(var(--glow-cyan))" strokeWidth="4" strokeLinecap="round" />
        {[15, 94, 168, 214].map((x, i) => <circle key={x} cx={x} cy={[88,54,46,24][i]} r="5" fill="rgb(var(--glow-magenta))" />)}
      </svg>
    );
  }
  if (type === "bars" || type === "panels") {
    return (
      <div className="grid h-28 grid-cols-4 items-end gap-3">
        {[42, 72, 55, 92].map((h, idx) => <div key={h} className="rounded-t-2xl bg-gradient-to-t from-cyanGlow/80 to-magentaGlow/80" style={{ height: `${h}%`, opacity: 0.65 + idx * 0.08 }} />)}
      </div>
    );
  }
  return (
    <svg viewBox="0 0 220 120" className="h-28 w-full">
      <defs>
        <linearGradient id={`preview-${type}`} x1="0" x2="220" y1="0" y2="120" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgb(var(--glow-cyan))" />
          <stop offset="0.6" stopColor="rgb(var(--glow-violet))" />
          <stop offset="1" stopColor="rgb(var(--glow-magenta))" />
        </linearGradient>
      </defs>
      {[
        [24, 35], [90, 20], [166, 36], [190, 86], [110, 94], [48, 76]
      ].map(([x, y], idx, arr) => (
        <g key={`${x}-${y}`}>
          {arr.slice(idx + 1, idx + 3).map(([x2, y2]) => <line key={`${x2}-${y2}`} x1={x} y1={y} x2={x2} y2={y2} stroke={`url(#preview-${type})`} strokeWidth="2" opacity="0.38" />)}
          <circle cx={x} cy={y} r={idx % 2 === 0 ? 8 : 5} fill={`url(#preview-${type})`} opacity="0.84" />
        </g>
      ))}
    </svg>
  );
}

export function AnalyticsGallery() {
  const { copy } = useLanguage();

  return (
    <section className="relative overflow-hidden px-4 py-20 sm:px-6 lg:px-8">
      <div className="absolute inset-0 -z-10 sena-grid opacity-20" />
      <SectionHeading kicker="Analytics" title={copy.sections.analytics} />
      <p className="mx-auto mt-5 max-w-3xl text-center text-lg leading-8 text-muted">{copy.sections.analyticsKicker}</p>

      <div className="mx-auto mt-12 grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {gallery.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.42, delay: index * 0.035 }}
            >
              <Card className="rounded-[1.75rem] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-cyanGlow/12 text-cyanGlow">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-muted">Figure {index + 1}</span>
                </div>
                <div className="mt-4 rounded-3xl border border-cardBorder/35 bg-background/40 p-3">
                  <Preview type={item.type} />
                </div>
                <h3 className="mt-4 font-black text-foreground">{item.title}</h3>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
