import type {
  ElementType,
  ReactNode
} from "react";
import {
  ChevronDown,
  RotateCcw,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PlotViewOption,
  SenaPlotView
} from "./plot-tools-panel";

export type WorkspaceRailMode = "sets" | "model" | "plots" | "stats";

export type WorkspaceRailItem = {
  id: WorkspaceRailMode;
  label: string;
  href: string;
  icon: ElementType;
  iconName: string;
  visualRole?: string;
};

export type WorkspaceRailPanelCopy = Record<WorkspaceRailMode, {
  title: string;
  subtitle: string;
  badge: string;
  activeWorkflowId: string;
}>;

export type WorkflowStatus = "ready" | "review";

export type WorkflowStepState = {
  id: string;
  label: string;
  detail: string;
  href: string;
  status: WorkflowStatus;
  statusLabel: string;
};

export const fusionPlotZoomMin = 0.75;
export const fusionPlotZoomMax = 2;
export const fusionPlotZoomStep = 0.125;

export function clampFusionPlotZoom(value: number) {
  return Math.min(fusionPlotZoomMax, Math.max(fusionPlotZoomMin, Number(value.toFixed(3))));
}

export function formatFusionPlotZoom(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function WorkflowRail({ steps, activeId = "workflow-canvas" }: { steps: WorkflowStepState[]; activeId?: string }) {
  return (
    <nav className="grid gap-2" aria-label="SENA research workflow">
      {steps.map((step, index) => (
        <a
          key={step.id}
          href={step.href}
          className={cn(
            "grid grid-cols-[2.25rem_1fr] items-center gap-3 rounded-lg border p-3 transition hover:border-cyanGlow/60 hover:bg-background/45",
            step.id === activeId
              ? "border-cyanGlow/65 bg-cyanGlow/12 text-foreground"
              : step.status === "ready"
                ? "border-emerald-300/35 bg-emerald-300/10"
                : "border-amber-300/35 bg-amber-300/10"
          )}
        >
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-background/45 text-xs font-black text-cyanGlow">
            {String(index + 1).padStart(2, "0")}
          </div>
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-black text-foreground">{step.label}</span>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[0.62rem] font-black uppercase",
                  step.status === "ready" ? "border-emerald-300/40 text-emerald-100" : "border-amber-300/40 text-amber-100"
                )}
              >
                {step.statusLabel}
              </span>
            </div>
            <div className="mt-1 truncate text-xs font-semibold text-muted">{step.detail}</div>
          </div>
        </a>
      ))}
    </nav>
  );
}

export function WorkspaceRail({
  active,
  onChange,
  items,
  panelOpen = false
}: {
  active: WorkspaceRailMode;
  onChange: (mode: WorkspaceRailMode) => void;
  items: WorkspaceRailItem[];
  panelOpen?: boolean;
}) {
  return (
    <nav
      data-testid="sena-workspace-mode-rail"
      data-visual-role="workspace-shell-c3-glass-rail"
      aria-label="SENA workspace modules"
      className="flex gap-2 overflow-x-auto border-b border-white/10 bg-[#202427] px-3 py-2 xl:h-full xl:flex-col xl:overflow-visible xl:border-b-0 xl:border-r xl:px-2 xl:py-3"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            data-testid={`workspace-rail-${item.id}`}
            onClick={() => onChange(item.id)}
            className={cn(
              "group grid h-[4.125rem] min-w-[3.125rem] place-items-center rounded-2xl border text-center shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_10px_22px_rgb(2_6_23/0.25)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow xl:w-[3.125rem]",
              isActive
                ? "border-cyanGlow/70 bg-cyanGlow/80 text-white"
                : "border-white/12 bg-white/[0.07] text-slate-300 hover:border-white/25 hover:bg-white/[0.11] hover:text-white"
            )}
            aria-pressed={isActive}
            aria-expanded={isActive && panelOpen}
            aria-controls="workspace-left-panel-overlay"
            aria-label={`Open ${item.label} workspace panel`}
          >
            <span className="grid w-full justify-items-center gap-1">
              <span className={cn("grid h-7 w-7 place-items-center rounded-xl", isActive ? "bg-white/16" : "bg-white/[0.04]")}>
                <Icon
                  data-testid={`workspace-rail-icon-${item.id}`}
                  data-icon-name={item.iconName}
                  data-visual-role={item.visualRole}
                  className={cn(item.iconName === "network-metrics" || item.iconName === "layer-stack" ? "h-6 w-6" : "h-5 w-5")}
                  strokeWidth={2.2}
                />
              </span>
              <span className="max-w-[3rem] text-[0.62rem] font-black leading-tight">{item.label}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function PlotSwitcher({
  active,
  isOpen,
  onToggle,
  onSelect,
  plotViewOptions
}: {
  active: SenaPlotView;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (view: SenaPlotView) => void;
  plotViewOptions: PlotViewOption[];
}) {
  const selected = plotViewOptions.find((option) => option.id === active) ?? plotViewOptions[0];
  return (
    <div className="relative">
      <button
        type="button"
        data-testid="workspace-plot-switcher"
        data-visual-role="workspace-shell-collapsed-plot-switcher"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={`All plot views, current ${selected.label}`}
        className="flex h-10 shrink-0 items-center justify-between gap-3 rounded-full border border-slate-300/80 bg-white/90 px-4 text-left shadow-[0_8px_24px_rgb(15_23_42/0.08)] transition hover:border-cyanGlow/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
      >
        <span className="flex items-center gap-3">
          <span className="grid grid-cols-2 gap-1">
            <span className="h-2 w-2 rounded-[0.2rem] bg-cyanGlow" />
            <span className="h-2 w-2 rounded-[0.2rem] bg-violetGlow" />
            <span className="h-2 w-2 rounded-[0.2rem] bg-blue-500" />
            <span className="h-2 w-2 rounded-[0.2rem] bg-fuchsia-400" />
          </span>
          <span className="text-sm font-black text-slate-900">Plots</span>
          <span className="text-xs font-black text-slate-500">{selected.label}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full border border-cyanGlow/25 bg-cyanGlow/10 text-xs font-black text-cyanGlow">{plotViewOptions.length}</span>
          <ChevronDown className={cn("h-4 w-4 text-cyanGlow transition", isOpen && "rotate-180")} />
        </span>
      </button>
      {isOpen && (
        <div
          data-testid="workspace-plot-switcher-menu"
          className="absolute right-0 top-12 z-30 grid w-72 gap-1 rounded-2xl border border-slate-200 bg-white p-2 text-slate-900 shadow-[0_18px_42px_rgb(15_23_42/0.18)]"
        >
          {plotViewOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              data-testid={`workspace-plot-view-${option.id}`}
              data-plot-view={option.id}
              onClick={() => onSelect(option.id)}
              className={cn(
                "grid rounded-xl px-3 py-2 text-left transition",
                active === option.id ? "bg-cyanGlow/15 text-slate-950" : "hover:bg-slate-100"
              )}
            >
              <span className="text-sm font-black">{option.label}</span>
              <span className="text-xs font-semibold text-slate-500">{option.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ActivePlotViewToolbar({
  active,
  plotViewOptions,
  className
}: {
  active: SenaPlotView;
  isOpen?: boolean;
  onToggle?: () => void;
  onSelect?: (view: SenaPlotView) => void;
  plotViewOptions: PlotViewOption[];
  className?: string;
}) {
  const selected = plotViewOptions.find((option) => option.id === active) ?? plotViewOptions[0];
  return (
    <div
      data-testid="central-active-view-toolbar"
      data-visual-role="central-plot-view-toolbar"
      className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm", className)}
    >
      <span className="font-black text-slate-950">Active view</span>
      <span className="font-black text-cyanGlow">{selected.label}</span>
      <span className="hidden font-bold text-slate-500 md:inline">
        {selected.detail} - current temporal window, switch views from the Plots bar above
      </span>
    </div>
  );
}

export function WorkspacePlotViewBar({
  active,
  isOpen,
  onToggle,
  onSelect,
  plotViewOptions,
  activeWindowLabel,
  activeTurnLabel
}: {
  active: SenaPlotView;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (view: SenaPlotView) => void;
  plotViewOptions: PlotViewOption[];
  activeWindowLabel: string;
  activeTurnLabel: string;
}) {
  const selected = plotViewOptions.find((option) => option.id === active) ?? plotViewOptions[0];
  return (
    <div
      data-testid="workspace-plot-view-bar"
      data-visual-role="workspace-top-plot-view-bar"
      className="flex min-h-14 items-center gap-3 border-b border-slate-200 bg-white px-3 py-2"
    >
      <div
        role="group"
        aria-label="Workspace plot views"
        className="hidden min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex"
      >
        {plotViewOptions.map((option) => {
          const isActive = option.id === active;
          return (
            <button
              key={option.id}
              type="button"
              data-testid={`workspace-view-tab-${option.id}`}
              title={option.detail}
              aria-pressed={isActive}
              onClick={() => onSelect(option.id)}
              className={cn(
                "h-10 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow",
                isActive
                  ? "border-cyanGlow bg-cyanGlow/12 text-slate-950 shadow-[0_6px_16px_rgb(34_211_238/0.18)]"
                  : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div className="min-w-0 flex-1 truncate text-sm md:hidden">
        <span className="font-black text-slate-950">{selected.label}</span>
        <span className="ml-2 font-bold text-slate-500">{selected.detail}</span>
      </div>
      <div
        data-testid="workspace-plot-view-bar-window-context"
        data-visual-role="workspace-top-bar-window-context"
        className="hidden h-10 shrink-0 items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-3.5 text-xs font-bold text-slate-500 lg:flex"
      >
        <span className="whitespace-nowrap">Window <span className="font-black text-slate-950">{activeWindowLabel}</span></span>
        <span className="whitespace-nowrap">Turns <span className="font-black text-slate-950">{activeTurnLabel}</span></span>
      </div>
      <PlotSwitcher
        active={active}
        isOpen={isOpen}
        onToggle={onToggle}
        onSelect={onSelect}
        plotViewOptions={plotViewOptions}
      />
    </div>
  );
}

export function WorkspaceViewportPanel({
  id,
  testId,
  visualRole,
  title,
  children,
  className
}: {
  id?: string;
  testId?: string;
  visualRole?: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      data-testid={testId}
      data-visual-role={visualRole}
      className={cn("min-w-0 overflow-hidden border border-slate-300/70 bg-white shadow-[0_10px_26px_rgb(15_23_42/0.14)]", className)}
    >
      <div className="flex h-9 items-center justify-between bg-[#d7d7d7] px-4 text-sm font-black uppercase tracking-[0.01em] text-[#757575]">
        <span>{title}</span>
      </div>
      <div className="min-w-0 p-3">
        {children}
      </div>
    </section>
  );
}

export function WorkspaceShellPanel({
  id,
  testId,
  visualRole,
  defaultPlotView,
  plotScope,
  title,
  action,
  children,
  className
}: {
  id?: string;
  testId?: string;
  visualRole?: string;
  defaultPlotView?: string;
  plotScope?: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      data-testid={testId}
      data-visual-role={visualRole}
      data-default-plot-view={defaultPlotView}
      data-plot-scope={plotScope}
      className={cn("min-w-0 scroll-mt-24 border border-slate-300/70 bg-white shadow-[0_10px_26px_rgb(15_23_42/0.1)]", className)}
    >
      <div className="flex h-9 items-center justify-between bg-[#d7d7d7] px-4 text-sm font-black uppercase text-[#757575]">
        <span>{title}</span>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="min-w-0 p-4">
        {children}
      </div>
    </section>
  );
}

export function FusionPlotZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  testScope,
  className
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  testScope: "central" | "maximized";
  className?: string;
}) {
  const controlClassName = "grid h-7 w-7 place-items-center rounded-full text-slate-700 transition hover:bg-white hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-35";
  const safeZoom = clampFusionPlotZoom(zoom);

  return (
    <div
      data-testid={`fusion-plot-${testScope}-zoom-controls`}
      data-visual-role="fusion-plot-zoom-controls"
      className={cn(
        "inline-flex h-7 items-center overflow-hidden rounded-full border border-slate-400/70 bg-white/78 text-[0.68rem] font-black normal-case text-slate-800 shadow-[0_6px_16px_rgb(15_23_42/0.1)]",
        className
      )}
    >
      <button
        type="button"
        data-testid={`fusion-plot-${testScope}-zoom-out`}
        aria-label="Zoom out Fusion Plot"
        onClick={onZoomOut}
        disabled={safeZoom <= fusionPlotZoomMin}
        className={controlClassName}
      >
        <ZoomOut className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        data-testid={`fusion-plot-${testScope}-zoom-reset`}
        aria-label="Reset Fusion Plot zoom"
        onClick={onReset}
        className="inline-flex h-7 min-w-12 items-center justify-center gap-1 border-x border-slate-300/70 px-2 text-slate-800 transition hover:bg-white hover:text-slate-950"
      >
        <RotateCcw className="h-3 w-3" />
        {formatFusionPlotZoom(safeZoom)}
      </button>
      <button
        type="button"
        data-testid={`fusion-plot-${testScope}-zoom-in`}
        aria-label="Zoom in Fusion Plot"
        onClick={onZoomIn}
        disabled={safeZoom >= fusionPlotZoomMax}
        className={controlClassName}
      >
        <ZoomIn className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
