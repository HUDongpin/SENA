/**
 * Stage 1 of the two-stage workspace load (ADR-0011, T7).
 *
 * `SenaFusionWorkspaceLoader` owns the dynamic import of the analysis stage; this
 * is what it renders until that import resolves. It is the workspace chrome —
 * header, plot-view bar, module rail, figure frame, inspector column — laid out at
 * the same geometry as `workspace-main-shell-section.tsx`, so the analysis stage
 * fills the frame in rather than replacing a placeholder of a different shape.
 *
 * THE ONE RULE THIS FILE MUST KEEP: no import path from here may reach
 * `./analysis-runtime` or `@/lib/sena/model`. This module is statically imported by
 * the loader, so it ships in the route's first-wave JS; anything it touches ships
 * with it, and webpack would pull the 956 KiB analysis chunk back into the eager
 * payload — leaving the two stages looking split while behaving exactly as before.
 * That is why:
 *   - the rail labels below are written out rather than imported from
 *     `workspace-static-config`, which carries a 93 KiB production-page contract
 *     and (until this change) an edge to the analysis barrel;
 *   - the icons are inline SVG rather than `lucide-react`, whose icon chunk is a
 *     158 KiB second-wave chunk today.
 * Both are deliberate duplications of *appearance*, never of logic.
 *
 * The test ids here are all `sena-workspace-shell-*` and share nothing with the
 * analysis stage's ids. That is load-bearing: the browser smokes drive controls
 * like `workspace-rail-model`, and a shell that answered to the same id could be
 * clicked in place of the real control during the hand-off.
 */

const shellRailItems = [
  { id: "sets", label: "Sets" },
  { id: "model", label: "Model" },
  { id: "plots", label: "Plot Tools" },
  { id: "stats", label: "Stats" }
] as const;

const shellPlotViews = ["Fusion", "Dual Lens", "Temporal", "ENA Space", "SNA", "Evidence", "Matrix"] as const;

function ShellRailGlyph({ index }: { index: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      {index === 0 && <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></>}
      {index === 1 && <><path d="M12 3l8 4-8 4-8-4 8-4Z" /><path d="M4 12l8 4 8-4" /><path d="M4 17l8 4 8-4" /></>}
      {index === 2 && <path d="M3 12h4l3 7 4-14 3 7h4" />}
      {index === 3 && <><path d="M5 20V11" /><path d="M12 20V5" /><path d="M19 20v-6" /></>}
    </svg>
  );
}

export function SenaWorkspaceShellStage() {
  return (
    <main
      data-testid="sena-workspace-loading"
      data-sena-workspace-stage="shell"
      data-theme="light"
      aria-busy="true"
      className="min-h-dvh overflow-x-hidden bg-background text-slate-950"
    >
      <div className="mx-auto flex min-h-dvh flex-col overflow-x-hidden border border-cardBorder/70 bg-background/80 shadow-soft xl:h-dvh xl:overflow-hidden 2xl:max-w-[118rem]">
        <header
          data-testid="sena-workspace-shell-header"
          className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b-2 border-cyanGlow bg-[#1f1f1f] px-3 py-2 text-white lg:flex-nowrap"
        >
          <a href="/" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/18 bg-white/8 text-cyanGlow">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 5H6l6 7-6 7h12" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-black leading-tight">SENA Analysis Studio</span>
              <span className="mt-0.5 block truncate text-xs font-bold leading-tight text-slate-300">Social-Epistemic Nexus Analytics</span>
            </span>
          </a>

          <div
            data-testid="sena-workspace-compute-pending"
            role="status"
            aria-live="polite"
            className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-slate-300"
          >
            <span className="grid h-4 w-4 shrink-0 place-items-center">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyanGlow/30 border-t-cyanGlow" />
            </span>
            <span className="whitespace-nowrap text-white">Loading the analysis engine</span>
            <span className="min-w-0 truncate">Network models, ENA projection, and report builders — the figure appears when they land.</span>
          </div>
        </header>

        <div
          data-testid="sena-workspace-shell-plot-view-bar"
          className="flex min-h-14 items-center gap-3 border-b border-slate-200 bg-white px-3 py-2"
        >
          <div className="hidden min-w-0 flex-1 items-center gap-1.5 overflow-hidden md:flex" aria-hidden="true">
            {shellPlotViews.map((label, index) => (
              <span
                key={label}
                className={
                  index === 0
                    ? "h-10 shrink-0 whitespace-nowrap rounded-full border border-cyanGlow bg-cyanGlow/12 px-4 text-sm font-black leading-10 text-slate-950"
                    : "h-10 shrink-0 whitespace-nowrap rounded-full border border-transparent px-4 text-sm font-black leading-10 text-slate-400"
                }
              >
                {label}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1 text-sm md:hidden" aria-hidden="true">
            <span className="font-black text-slate-950">Fusion</span>
          </div>
          <span aria-hidden="true" className="hidden h-10 shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-3.5 text-xs font-bold text-slate-400 lg:flex">
            Window &amp; turn context pending
          </span>
        </div>

        <div className="grid min-h-0 flex-1 xl:grid-cols-[4rem_minmax(0,1fr)]">
          <nav
            data-testid="sena-workspace-shell-rail"
            aria-label="SENA workspace modules"
            className="flex gap-2 overflow-x-auto border-b border-white/10 bg-[#202427] px-3 py-2 xl:h-full xl:flex-col xl:overflow-visible xl:border-b-0 xl:border-r xl:px-2 xl:py-3"
          >
            {shellRailItems.map((item, index) => (
              <span
                key={item.id}
                data-testid={`sena-workspace-shell-rail-${item.id}`}
                aria-disabled="true"
                className="group grid h-[4.125rem] min-w-[3.125rem] place-items-center rounded-2xl border border-white/12 bg-white/[0.07] text-center text-slate-400 shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_10px_22px_rgb(2_6_23/0.25)] xl:w-[3.125rem]"
              >
                <span className="grid w-full justify-items-center gap-1">
                  <span className="grid h-7 w-7 place-items-center rounded-xl bg-white/[0.04]">
                    <ShellRailGlyph index={index} />
                  </span>
                  <span className="max-w-[3rem] text-[0.62rem] font-black leading-tight">{item.label}</span>
                </span>
              </span>
            ))}
          </nav>

          <div className="grid min-h-0 min-w-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,23rem)]">
            <div className="min-w-0 p-3">
              <div
                data-testid="sena-workspace-shell-figure-frame"
                className="glass-panel grid min-h-[24rem] place-items-center rounded-lg border border-cardBorder/45 p-6 xl:min-h-[32rem]"
              >
                <div className="max-w-md text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-cyanGlow/40 bg-cyanGlow/10">
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-cyanGlow/30 border-t-cyanGlow" />
                  </div>
                  <p className="mt-5 text-base font-black text-foreground">Building the fusion figure</p>
                  <p className="mt-2 text-sm font-semibold text-muted">
                    The social network, the ENA projection, and the bridge between them are computed in the browser from
                    your contract tables. On a slow connection this takes a few seconds; nothing is sent to a server.
                  </p>
                </div>
              </div>
            </div>

            <div className="min-w-0 p-3 xl:pl-0">
              <div
                data-testid="sena-workspace-shell-inspector"
                aria-hidden="true"
                className="glass-panel h-full min-h-[12rem] rounded-lg border border-cardBorder/45 p-5"
              >
                <div className="h-3 w-24 rounded-full bg-foreground/15" />
                <div className="mt-4 h-2.5 w-full rounded-full bg-foreground/10" />
                <div className="mt-2 h-2.5 w-4/5 rounded-full bg-foreground/10" />
                <div className="mt-2 h-2.5 w-3/5 rounded-full bg-foreground/10" />
                <div className="mt-6 h-28 rounded-lg border border-cardBorder/35 bg-background/45" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
