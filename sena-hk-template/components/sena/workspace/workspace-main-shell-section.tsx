"use client";

import { X } from "lucide-react";
import {
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { FusionPlotMaximizedOverlay } from "./fusion-plot-overlay";
import { WorkspaceCentralPlotDeck } from "./workspace-central-plot-deck";
import { WorkspaceHeaderSection } from "./workspace-header-section";
import { WorkspaceLeftRailPanelSection } from "./workspace-left-rail-panel-section";
import { WorkspaceReportAndStatsDeckSection } from "./workspace-report-and-stats-deck-section";
import { WorkspaceRightInspectorColumn } from "./workspace-right-inspector-column";
import { cycleContainedFocusIndex } from "./workspace-focus-cycle";
import { useWorkspaceDesktopMode } from "./use-workspace-desktop-mode";
import {
  nextWorkspaceMobileFigure,
  type WorkspaceMobileFigure
} from "./workspace-mobile-figure-navigation";
import { WorkspaceRail } from "./workspace-shell-panels";

const workspaceDialogFocusableSelector = [
  'a[href]',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(",");

export type WorkspaceMainShellSectionProps = {
  isFusionPlotMaximized: boolean;
  fusionPlotMaximizedOverlayProps: ComponentProps<typeof FusionPlotMaximizedOverlay>;
  headerProps: ComponentProps<typeof WorkspaceHeaderSection>;
  railProps: ComponentProps<typeof WorkspaceRail>;
  leftRailProps: ComponentProps<typeof WorkspaceLeftRailPanelSection>;
  centralPlotDeckProps: ComponentProps<typeof WorkspaceCentralPlotDeck>;
  rightInspectorProps: ComponentProps<typeof WorkspaceRightInspectorColumn>;
  reportAndStatsDeckProps: ComponentProps<typeof WorkspaceReportAndStatsDeckSection>;
};

export function WorkspaceMainShellSection({
  isFusionPlotMaximized,
  fusionPlotMaximizedOverlayProps,
  headerProps,
  railProps,
  leftRailProps,
  centralPlotDeckProps,
  rightInspectorProps,
  reportAndStatsDeckProps
}: WorkspaceMainShellSectionProps) {
  const [isTaskPanelOpen, setIsTaskPanelOpen] = useState(false);
  const [mobileFigure, setMobileFigure] = useState<WorkspaceMobileFigure>("fusion");
  const isDesktopMode = useWorkspaceDesktopMode();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const fusionFigureTabRef = useRef<HTMLButtonElement>(null);
  const dualFigureTabRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headerSurfaceRef = useRef<HTMLDivElement>(null);
  const analysisSurfaceRef = useRef<HTMLDivElement>(null);
  const reportSurfaceRef = useRef<HTMLDivElement>(null);
  const panelTriggerModeRef = useRef(railProps.active);

  const closeTaskPanel = useCallback(() => {
    setIsTaskPanelOpen(false);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-testid="workspace-rail-${panelTriggerModeRef.current}"]`)?.focus();
    });
  }, []);

  function handleRailChange(mode: typeof railProps.active) {
    panelTriggerModeRef.current = mode;
    railProps.onChange(mode);
    setIsTaskPanelOpen(true);
  }

  function handleMobileFigureKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextFigure = nextWorkspaceMobileFigure(mobileFigure, event.key);
    setMobileFigure(nextFigure);
    (nextFigure === "fusion" ? fusionFigureTabRef : dualFigureTabRef).current?.focus();
  }

  useEffect(() => {
    if (rightInspectorProps.selectedId) setMobileFigure("dual");
    // Keep Dual selected after closing the inspector so its comparison remains visible.
  }, [rightInspectorProps.selectedId]);

  useEffect(() => {
    const surfaces = [headerSurfaceRef.current, analysisSurfaceRef.current, reportSurfaceRef.current]
      .filter((surface): surface is HTMLDivElement => Boolean(surface));
    surfaces.forEach((surface) => {
      surface.inert = isTaskPanelOpen;
    });
    return () => {
      surfaces.forEach((surface) => {
        surface.inert = false;
      });
    };
  }, [isTaskPanelOpen]);

  useEffect(() => {
    if (!isTaskPanelOpen) return;
    closeButtonRef.current?.focus();

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeTaskPanel();
      if (event.key !== "Tab") return;

      const focusableItems = [railRef.current, dialogRef.current]
        .flatMap((scope) => Array.from(scope?.querySelectorAll<HTMLElement>(workspaceDialogFocusableSelector) ?? []))
        .filter((item) => !item.hasAttribute("disabled") && item.getAttribute("aria-hidden") !== "true");
      const currentIndex = focusableItems.indexOf(document.activeElement as HTMLElement);
      const nextIndex = cycleContainedFocusIndex({
        currentIndex,
        itemCount: focusableItems.length,
        backward: event.shiftKey
      });
      if (nextIndex < 0) return;
      event.preventDefault();
      focusableItems[nextIndex]?.focus();
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => document.removeEventListener("keydown", handleDialogKeyDown);
  }, [closeTaskPanel, isTaskPanelOpen]);

  return (
    <section data-theme="light" className="min-h-dvh overflow-x-hidden bg-background text-slate-950">
      <div className="mx-auto flex min-h-dvh flex-col overflow-x-hidden border border-cardBorder/70 bg-background/80 shadow-soft xl:h-dvh xl:overflow-hidden 2xl:max-w-[118rem]">
        <div ref={headerSurfaceRef} aria-hidden={isTaskPanelOpen || undefined}>
          <WorkspaceHeaderSection {...headerProps} />
        </div>

        <div className="grid min-h-0 flex-1 xl:grid-cols-[4rem_minmax(0,1fr)]">
          <div ref={railRef} data-testid="workspace-persistent-rail" className="relative z-50 min-w-0">
            <WorkspaceRail {...railProps} onChange={handleRailChange} panelOpen={isTaskPanelOpen} />
          </div>

          <div
            ref={analysisSurfaceRef}
            aria-hidden={isTaskPanelOpen || undefined}
            className="grid min-h-0 min-w-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,23rem)]"
          >
            {isFusionPlotMaximized && <FusionPlotMaximizedOverlay {...fusionPlotMaximizedOverlayProps} />}

            {isDesktopMode ? (
              <div data-testid="workspace-desktop-figure-composition" className="contents">
                <main className="min-w-0 p-3 xl:min-h-0 xl:overflow-y-auto">
                  <WorkspaceCentralPlotDeck {...centralPlotDeckProps} />
                </main>
                <div className="min-w-0 xl:min-h-0">
                  <WorkspaceRightInspectorColumn {...rightInspectorProps} />
                </div>
              </div>
            ) : (
              <div data-testid="workspace-mobile-figure-composition" className="contents">
                <div
                  data-testid="workspace-mobile-figure-switcher"
                  role="tablist"
                  aria-label="Core workspace figure"
                  className="grid grid-cols-2 gap-2 border-b border-slate-200 bg-white px-3 py-2"
                >
                  <button
                    ref={fusionFigureTabRef}
                    type="button"
                    role="tab"
                    id="workspace-mobile-figure-tab-fusion"
                    data-testid="workspace-mobile-figure-fusion"
                    aria-controls="workspace-mobile-figure-panel-fusion"
                    aria-selected={mobileFigure === "fusion"}
                    tabIndex={mobileFigure === "fusion" ? 0 : -1}
                    onClick={() => setMobileFigure("fusion")}
                    onKeyDown={handleMobileFigureKeyDown}
                    className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-cyanGlow aria-selected:border-cyanGlow aria-selected:bg-cyanGlow/10 aria-selected:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyanGlow"
                  >
                    Fusion
                  </button>
                  <button
                    ref={dualFigureTabRef}
                    type="button"
                    role="tab"
                    id="workspace-mobile-figure-tab-dual"
                    data-testid="workspace-mobile-figure-dual"
                    aria-controls="workspace-mobile-figure-panel-dual"
                    aria-selected={mobileFigure === "dual"}
                    tabIndex={mobileFigure === "dual" ? 0 : -1}
                    onClick={() => setMobileFigure("dual")}
                    onKeyDown={handleMobileFigureKeyDown}
                    className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-cyanGlow aria-selected:border-cyanGlow aria-selected:bg-cyanGlow/10 aria-selected:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyanGlow"
                  >
                    Dual Lens
                  </button>
                </div>

                <main
                  id={`workspace-mobile-figure-panel-${mobileFigure}`}
                  role="tabpanel"
                  aria-labelledby={`workspace-mobile-figure-tab-${mobileFigure}`}
                  className={mobileFigure === "fusion" ? "order-1 min-w-0 p-3" : "min-w-0"}
                >
                  {mobileFigure === "fusion" ? (
                    <WorkspaceCentralPlotDeck {...centralPlotDeckProps} />
                  ) : (
                    <WorkspaceRightInspectorColumn {...rightInspectorProps} />
                  )}
                </main>
              </div>
            )}
          </div>
        </div>
      </div>

      <div ref={reportSurfaceRef} aria-hidden={isTaskPanelOpen || undefined}>
        <WorkspaceReportAndStatsDeckSection
          {...reportAndStatsDeckProps}
          enterpriseRuntimeProps={leftRailProps.enterpriseRuntimeProps}
        />
      </div>

      {isTaskPanelOpen && (
        <div
          id="workspace-left-panel-overlay"
          data-testid="workspace-left-panel-overlay"
          className="pointer-events-none fixed inset-0 z-40"
        >
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            aria-label="Dismiss workspace panel"
            onClick={closeTaskPanel}
            className="pointer-events-auto absolute inset-y-0 left-0 right-0 cursor-default bg-slate-950/45 xl:left-16"
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-label={`${leftRailProps.activeRailPanel.title} workspace panel`}
            className="pointer-events-auto absolute inset-y-0 left-0 flex w-[min(25rem,calc(100vw-1.5rem))] flex-col overflow-hidden border-r border-slate-300 bg-white shadow-[0_24px_70px_rgb(15_23_42/0.28)] xl:left-16"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
              <span className="text-sm font-black text-slate-950">Workspace tools</span>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Close workspace panel"
                onClick={closeTaskPanel}
                className="grid h-11 w-11 place-items-center rounded-lg border border-slate-300 text-slate-700 transition hover:border-cyanGlow hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <WorkspaceLeftRailPanelSection {...leftRailProps} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
