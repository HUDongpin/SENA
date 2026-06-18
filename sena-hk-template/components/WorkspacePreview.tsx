import type React from "react";
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, BarChart3, CheckCircle2, Database, FileText, GitCompare, Network, PanelLeft, Sigma, UploadCloud } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { Card, SectionHeading } from "./Primitives";
import { NetworkVisualization } from "./NetworkVisualization";

const sidebar = ["Data", "Codebook", "ENA", "SNA", "SENA Fusion", "Compare", "Timeline", "Report"];
const status = [
  { label: "Rows", value: "2,217" },
  { label: "Actors", value: "15" },
  { label: "Codes", value: "7" },
  { label: "Stages", value: "4" }
];

function MiniChart() {
  const points = [
    [12, 70],
    [56, 62],
    [102, 34],
    [148, 44],
    [192, 24],
    [238, 30],
    [284, 16]
  ];
  const path = points.map(([x, y], idx) => `${idx === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  return (
    <svg viewBox="0 0 300 90" className="h-24 w-full" aria-label="Temporal trajectory mini chart">
      <defs>
        <linearGradient id="line-grad" x1="0" x2="300" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="rgb(var(--glow-cyan))" />
          <stop offset="1" stopColor="rgb(var(--glow-magenta))" />
        </linearGradient>
      </defs>
      {[20, 45, 70].map((y) => (
        <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="rgb(var(--foreground) / 0.08)" />
      ))}
      <path d={path} fill="none" stroke="url(#line-grad)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="rgb(var(--glow-cyan))" />
      ))}
    </svg>
  );
}

function DashboardCard({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-cardBorder/40 bg-background/35 p-4 backdrop-blur-xl">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-cyanGlow/12 text-cyanGlow">
          <Icon className="h-5 w-5" />
        </span>
        <h4 className="font-black text-foreground">{title}</h4>
      </div>
      {children}
    </div>
  );
}

export function WorkspacePreview() {
  const { copy } = useLanguage();

  return (
    <section id="workspace" className="relative px-4 py-20 sm:px-6 lg:px-8">
      <SectionHeading kicker="Workspace" title={copy.sections.workspace} />
      <p className="mx-auto mt-5 max-w-3xl text-center text-lg leading-8 text-muted">{copy.sections.workspaceKicker}</p>

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.6 }}
        className="mx-auto mt-12 max-w-7xl"
      >
        <Card className="overflow-hidden rounded-[2.75rem] p-0">
          <div className="border-b border-cardBorder/40 bg-card/40 p-5 backdrop-blur-xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-cyanGlow">Research Workspace</div>
                <h3 className="mt-1 text-2xl font-black text-foreground">AI-Integrated Lesson Study Demo</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/workspace/sena" className="rounded-2xl border border-cyanGlow/45 bg-cyanGlow px-4 py-2 text-sm font-black text-slate-950 shadow-glow">
                  Launch SENA POC
                </Link>
                <Link href="/workspace/ena" className="rounded-2xl border border-cardBorder/45 bg-background/45 px-4 py-2 text-sm font-black text-foreground">
                  jENA Workspace
                </Link>
                {status.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-cardBorder/45 bg-background/45 px-4 py-2 text-sm">
                    <span className="font-black text-foreground">{item.value}</span>
                    <span className="ml-2 text-muted">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-[15rem_1fr]">
            <aside className="border-b border-cardBorder/40 bg-background/30 p-4 lg:border-b-0 lg:border-r">
              <div className="mb-4 flex items-center gap-2 text-sm font-black text-muted">
                <PanelLeft className="h-4 w-4" /> Project modules
              </div>
              <div className="grid gap-2">
                {sidebar.map((item, idx) => (
                  <button
                    key={item}
                    className={`rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${idx === 4 ? "bg-cyanGlow text-slate-950 shadow-glow" : "text-foreground/74 hover:bg-card/55"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </aside>

            <main className="grid gap-4 p-4 lg:grid-cols-3 lg:p-6">
              <DashboardCard icon={UploadCloud} title="Upload status">
                <div className="flex items-center gap-3 rounded-2xl bg-cyanGlow/10 p-3 text-sm text-foreground/78">
                  <CheckCircle2 className="h-5 w-5 text-cyanGlow" /> Data mapped to actor, stage, time, code, and outcome columns.
                </div>
              </DashboardCard>

              <DashboardCard icon={FileText} title="Coding scheme">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {["PoP", "GO", "SC", "MV", "MR", "RoP", "PR"].map((code) => (
                    <span key={code} className="rounded-full border border-cardBorder/40 bg-card/45 px-3 py-2 font-black text-foreground/78">
                      {code}
                    </span>
                  ))}
                </div>
              </DashboardCard>

              <DashboardCard icon={GitCompare} title="Group comparison">
                <div className="space-y-2 text-sm text-muted">
                  <div className="flex justify-between"><span>Planning vs Reflecting</span><strong className="text-cyanGlow">active</strong></div>
                  <div className="h-2 rounded-full bg-background/70"><div className="h-2 w-4/5 rounded-full bg-gradient-to-r from-cyanGlow to-magentaGlow" /></div>
                  <div>Effect-size and confidence-interval panels ready.</div>
                </div>
              </DashboardCard>

              <DashboardCard icon={Sigma} title="ENA network">
                <div className="h-44 overflow-hidden rounded-2xl border border-cardBorder/30 bg-background/35">
                  <NetworkVisualization compact className="h-full rounded-2xl border-0 p-2" />
                </div>
              </DashboardCard>

              <DashboardCard icon={Network} title="Social network">
                <svg viewBox="0 0 220 150" className="h-44 w-full" aria-label="Mock social network">
                  <defs>
                    <linearGradient id="social-net" x1="0" x2="220" y1="0" y2="150" gradientUnits="userSpaceOnUse">
                      <stop stopColor="rgb(var(--glow-cyan))" />
                      <stop offset="1" stopColor="rgb(var(--glow-violet))" />
                    </linearGradient>
                  </defs>
                  {["M40 32 L112 46 L178 28 L190 110 L106 120 L52 92 L40 32", "M112 46 L106 120", "M52 92 L178 28", "M40 32 L190 110"].map((d) => (
                    <path key={d} d={d} fill="none" stroke="url(#social-net)" strokeWidth="2" opacity="0.55" />
                  ))}
                  {[
                    [40, 32, 9],
                    [112, 46, 16],
                    [178, 28, 10],
                    [190, 110, 12],
                    [106, 120, 14],
                    [52, 92, 8]
                  ].map(([x, y, r]) => (
                    <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="rgb(var(--glow-cyan))" opacity="0.82" />
                  ))}
                </svg>
              </DashboardCard>

              <DashboardCard icon={BarChart3} title="Temporal trajectory">
                <MiniChart />
                <div className="mt-1 flex justify-between text-xs font-bold text-muted">
                  <span>Study</span><span>Plan</span><span>Teach</span><span>Reflect</span>
                </div>
              </DashboardCard>

              <div className="lg:col-span-3">
                <div className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-5">
                  <div className="flex gap-4">
                    <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-amber-400" />
                    <div>
                      <div className="font-black text-foreground">AI interpretation draft</div>
                      <p className="mt-2 text-sm leading-6 text-muted">The reflecting stage appears to integrate multivoiced talk, support-and-critique, and generative orientations more strongly than earlier phases. Treat this as a draft analytic interpretation, not an automatic conclusion.</p>
                      <p className="mt-3 text-sm font-semibold text-foreground/80">{copy.labels.aiNotice}</p>
                    </div>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </Card>
      </motion.div>
    </section>
  );
}
