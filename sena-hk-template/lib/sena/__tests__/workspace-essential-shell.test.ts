import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

function workspaceSource(fileName: string) {
  return readFileSync(join(process.cwd(), "components/sena/workspace", fileName), "utf8");
}

describe("SENA essential workspace shell", () => {
  it("wraps mobile figure keyboard navigation at both tab edges", async () => {
    const helperPath = join(process.cwd(), "components/sena/workspace/workspace-mobile-figure-navigation.ts");

    expect(existsSync(helperPath)).toBe(true);
    if (!existsSync(helperPath)) return;

    const { nextWorkspaceMobileFigure } = await import("../../../components/sena/workspace/workspace-mobile-figure-navigation");
    expect(nextWorkspaceMobileFigure("dual", "ArrowRight")).toBe("fusion");
    expect(nextWorkspaceMobileFigure("fusion", "ArrowLeft")).toBe("dual");
    expect(nextWorkspaceMobileFigure("dual", "Home")).toBe("fusion");
    expect(nextWorkspaceMobileFigure("fusion", "End")).toBe("dual");
  });

  it("separates desktop composition from the single mounted mobile tabpanel", () => {
    const mainShell = workspaceSource("workspace-main-shell-section.tsx");
    const desktopMode = workspaceSource("use-workspace-desktop-mode.ts");

    expect(mainShell).toContain("const isDesktopMode = useWorkspaceDesktopMode()");
    expect(mainShell).toContain('data-testid="workspace-desktop-figure-composition"');
    expect(mainShell).toContain('data-testid="workspace-mobile-figure-composition"');
    expect(mainShell.match(/role="tabpanel"/g)).toHaveLength(1);
    expect(desktopMode).toContain('window.matchMedia("(min-width: 1280px)")');
    expect(desktopMode).toContain('addEventListener("change"');
    expect(desktopMode).toContain('removeEventListener("change"');
  });

  it("offers responsive Fusion and Dual Lens tabs and records them in the page contract", () => {
    const mainShell = workspaceSource("workspace-main-shell-section.tsx");
    const contract = JSON.parse(
      readFileSync(join(process.cwd(), "lib/sena/production-page-contract.json"), "utf8")
    ) as { visualChecks: Array<{ requiredText: string }> };
    const visualChecks = contract.visualChecks.map((check) => check.requiredText);

    expect(mainShell).toContain('useState<WorkspaceMobileFigure>("fusion")');
    expect(mainShell).toContain('data-testid="workspace-mobile-figure-switcher"');
    expect(mainShell).toContain('data-testid="workspace-mobile-figure-fusion"');
    expect(mainShell).toContain('data-testid="workspace-mobile-figure-dual"');
    expect(mainShell).toContain('role="tablist"');
    expect(mainShell).toContain('aria-selected={mobileFigure === "fusion"}');
    expect(mainShell).toContain('aria-selected={mobileFigure === "dual"}');
    expect(mainShell).toContain("rightInspectorProps.selectedId");
    expect(mainShell).toContain('setMobileFigure("dual")');
    expect(mainShell).toContain("min-h-11");
    expect(mainShell).toContain("isDesktopMode ? (");
    expect(visualChecks).toContain('data-testid="workspace-mobile-figure-switcher"');
    expect(visualChecks).toContain('data-testid="workspace-mobile-figure-fusion"');
    expect(visualChecks).toContain('data-testid="workspace-mobile-figure-dual"');
    expect(visualChecks).toContain('data-testid="workspace-research-details-drawer"');
  });

  it("verifies the concise responsive shell at all supported smoke widths", () => {
    const smoke = readFileSync(join(process.cwd(), "scripts/verify-sena-browser-smoke.mjs"), "utf8");

    expect(smoke).toContain("async function verifyResponsiveWorkspaceShell(browser, url)");
    expect(smoke).toContain("for (const width of [375, 768, 1024, 1440])");
    expect(smoke).toContain("document.documentElement.scrollWidth");
    expect(smoke).toContain("document.documentElement.clientWidth");
    expect(smoke).toContain('workspace-mobile-figure-switcher');
    expect(smoke).toContain('workspace-mobile-figure-fusion');
    expect(smoke).toContain('workspace-mobile-figure-dual');
    expect(smoke).toContain('press("ArrowLeft")');
    expect(smoke).toContain('press("ArrowRight")');
    expect(smoke).toContain('workspace-research-details-drawer');
    expect(smoke).toContain('table:visible');
    expect(smoke).toContain("await verifyResponsiveWorkspaceShell(browser, url)");
    expect(smoke).not.toContain('clickByTestId(page, "canvas-layout-');
  });

  it("keeps the central Fusion figure as the only primary canvas", () => {
    const centralFusion = workspaceSource("workspace-central-plot-deck-fusion-panel.tsx");
    const rightColumn = workspaceSource("workspace-right-inspector-column.tsx");

    expect(centralFusion).toContain('data-testid="workspace-primary-plot"');
    expect(centralFusion).toContain('data-visual-role="workspace-primary-plot"');
    expect(rightColumn).not.toContain("<Canvas");
    expect(rightColumn).not.toContain('testId="workspace-primary-plot"');
    expect(`${centralFusion}\n${rightColumn}`.match(/<Canvas/g)).toHaveLength(1);
  });

  it("uses the secondary plot for Dual Lens until evidence is selected", () => {
    const rightColumn = workspaceSource("workspace-right-inspector-column.tsx");
    const selectionState = workspaceSource("use-fusion-canvas-selection-state.ts");
    const workspaceState = workspaceSource("use-sena-fusion-workspace-main-shell-props.ts");

    expect(rightColumn).toContain('testId="workspace-secondary-plot"');
    expect(rightColumn).toContain('visualRole="workspace-secondary-plot"');
    expect(rightColumn).toContain("selectedId && selected");
    expect(rightColumn).toContain('aria-label="Close evidence inspector"');
    expect(rightColumn).toContain('onCanvasSelect("")');
    expect(rightColumn).toContain("<WorkspaceSecondaryComparisonLens");
    expect(selectionState).toContain('useState("")');
    expect(selectionState).not.toContain("useState(defaultSelection)");
    expect(selectionState).toContain("const selected = selectedId ?");
    expect(selectionState).not.toContain("defaultSelection");
    expect(workspaceState).not.toContain("selected?.id ?? selectedId");
  });

  it("opens the left task panel as a dismissible overlay in a contained desktop shell", () => {
    const mainShell = workspaceSource("workspace-main-shell-section.tsx");

    expect(mainShell).toContain('data-testid="workspace-left-panel-overlay"');
    expect(mainShell).toContain('role="dialog"');
    expect(mainShell).not.toContain('aria-modal="true"');
    expect(mainShell).toContain('aria-label="Close workspace panel"');
    expect(mainShell).toContain('event.key === "Escape"');
    expect(mainShell).toContain('event.key !== "Tab"');
    expect(mainShell).toContain("surface.inert = isTaskPanelOpen");
    expect(mainShell).toContain('data-testid="workspace-persistent-rail"');
    expect(mainShell).toContain("const railRef");
    expect(mainShell).toContain("ref={railRef}");
    expect(mainShell).toContain("[railRef.current, dialogRef.current]");
    expect(mainShell).toContain("relative z-50");
    expect(mainShell.match(/<WorkspaceRail/g)).toHaveLength(1);
    expect(mainShell.match(/xl:left-16/g)?.length).toBeGreaterThanOrEqual(2);
    expect(mainShell).toContain("xl:h-dvh");
    expect(mainShell).toContain("xl:overflow-hidden");
    expect(mainShell).not.toContain("xl:grid-cols-[4rem_19rem_minmax(0,1fr)_25rem]");
  });

  it("cycles focus within the persistent rail and drawer", async () => {
    const helperPath = join(process.cwd(), "components/sena/workspace/workspace-focus-cycle.ts");

    expect(existsSync(helperPath)).toBe(true);
    if (!existsSync(helperPath)) return;

    const { cycleContainedFocusIndex } = await import("../../../components/sena/workspace/workspace-focus-cycle");
    expect(cycleContainedFocusIndex({ currentIndex: 0, itemCount: 3, backward: true })).toBe(2);
    expect(cycleContainedFocusIndex({ currentIndex: 2, itemCount: 3, backward: false })).toBe(0);
    expect(cycleContainedFocusIndex({ currentIndex: -1, itemCount: 3, backward: false })).toBe(0);
    expect(cycleContainedFocusIndex({ currentIndex: -1, itemCount: 3, backward: true })).toBe(2);
    expect(cycleContainedFocusIndex({ currentIndex: 0, itemCount: 0, backward: false })).toBe(-1);
  });

  it("keeps only compact dataset-window status plus import and export actions in the header", () => {
    const header = workspaceSource("workspace-header-section.tsx");

    expect(header).toContain("Dataset");
    expect(header).toContain("Window");
    expect(header).toContain('data-testid="sena-upload-input"');
    expect(header).toContain("Export report");
    expect(header).not.toContain("> Home");
    expect(header).not.toContain("> jENA");
  });

  it("reduces the active-window context to counts, top signals, and one guardrail", () => {
    const scope = workspaceSource("central-fusion-analysis-scope.tsx");

    expect(scope).toContain('data-testid="central-fusion-analysis-scope"');
    expect(scope).toContain('data-testid="central-fusion-evidence-capsule"');
    expect(scope).toContain("Interpretation guardrail");
    expect(scope).not.toContain("Evidence cues");
    expect(scope).not.toContain("Review checks");
  });
});
