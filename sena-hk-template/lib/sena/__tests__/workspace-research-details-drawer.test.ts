import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function workspaceSource(fileName: string) {
  return readFileSync(new URL(`../../../components/sena/workspace/${fileName}`, import.meta.url), "utf8");
}

describe("SENA Research Details drawer", () => {
  it("keeps the long research deck in a default-closed overlay outside document flow", () => {
    const deck = workspaceSource("workspace-report-and-stats-deck-section.tsx");

    expect(deck).toContain('data-testid="workspace-research-details-drawer"');
    expect(deck).toContain('data-testid="workspace-research-details-toggle"');
    expect(deck).toContain('data-open={isOpen ? "true" : "false"}');
    expect(deck).toContain("useState(false)");
    expect(deck).toContain("fixed inset-x-3 bottom-3");
    expect(deck).toContain("max-h-[calc(100dvh-5rem)]");
    expect(deck).toContain("overflow-y-auto");
    expect(deck).toContain("isOpen && (");
  });

  it("exposes the six exact accessible tabs without forced horizontal scrolling", () => {
    const deck = workspaceSource("workspace-report-and-stats-deck-section.tsx");

    for (const tab of ["data", "analysis", "evidence", "validation", "exports", "administration"]) {
      expect(deck).toContain(`data-testid={\`workspace-research-details-tab-\${tab.id}\`}`);
    }
    for (const label of ["Data", "Analysis", "Evidence", "Validation", "Exports", "Administration"]) {
      expect(deck).toContain(`label: "${label}"`);
    }
    expect(deck).toContain('role="tablist"');
    expect(deck).toContain('role="tab"');
    expect(deck).toContain('role="tabpanel"');
    expect(deck).toContain('aria-controls="workspace-research-details-drawer"');
    expect(deck).toContain("aria-expanded={isOpen}");
    expect(deck).toContain("grid-cols-2");
    expect(deck).not.toContain("overflow-x-auto");
  });

  it("mounts only the active advanced panel group while the drawer is open", () => {
    const deck = workspaceSource("workspace-report-and-stats-deck-section.tsx");

    expect(deck).toContain('activeTab === "data" &&');
    expect(deck).toContain('activeTab === "analysis" &&');
    expect(deck).toContain('activeTab === "evidence" &&');
    expect(deck).toContain('activeTab === "validation" &&');
    expect(deck).toContain('activeTab === "exports" &&');
    expect(deck).toContain('activeTab === "administration" &&');
    expect(deck).toContain("<DualLensDashboard");
    expect(deck).toContain("<SocialMetricsTable");
    expect(deck).toContain("<CommunityList");
    expect(deck).toContain("<PairContributionTable");
    expect(deck).toContain("<MatrixPreview");
    expect(deck).toContain("<TemporalRuntimeTracePanel");
    expect(deck).toContain("<EvidenceLedgerPanel");
    expect(deck).toContain("<MethodValidationPanel");
    expect(deck).toContain("<WorkspaceReportSection");
    expect(deck).toContain("<WorkspaceEnterpriseRuntimeSection");
  });

  it("supports Escape, focus return, and arrow-key tab movement", () => {
    const deck = workspaceSource("workspace-report-and-stats-deck-section.tsx");

    expect(deck).toContain('event.key !== "Escape"');
    expect(deck).toContain("toggleRef.current?.focus()");
    expect(deck).toContain('event.key === "ArrowRight"');
    expect(deck).toContain('event.key === "ArrowLeft"');
    expect(deck).toContain('event.key === "Home"');
    expect(deck).toContain('event.key === "End"');
    expect(deck).toContain("min-h-11");
  });

  it("leaves Escape to the stacked task drawer before closing Research Details", () => {
    const deck = workspaceSource("workspace-report-and-stats-deck-section.tsx");

    expect(deck).toContain('document.querySelector(\'[data-testid="workspace-left-panel-overlay"]\')');
    expect(deck).toContain("if (workspaceTaskDrawer) return");
  });

  it("maps deep links to their lazy Research Details tabs and focuses the revealed tab", async () => {
    const deck = workspaceSource("workspace-report-and-stats-deck-section.tsx");
    const { researchDetailsTabForHash } = await import("../../../components/sena/workspace/workspace-report-and-stats-deck-section");

    expect(researchDetailsTabForHash("#sena-stats-deck")).toBe("analysis");
    expect(researchDetailsTabForHash("#workflow-report")).toBe("exports");
    expect(researchDetailsTabForHash("#unknown")).toBeNull();
    expect(deck).toContain('window.addEventListener("hashchange", revealHashTarget)');
    expect(deck).toContain('window.removeEventListener("hashchange", revealHashTarget)');
    expect(deck).toContain("setIsOpen(true)");
    expect(deck).toContain("tabRefs.current[targetIndex]?.focus()");
    expect(deck).toContain('id="sena-stats-deck"');
    expect(deck).toContain("<WorkspaceReportSection");
  });

  it("clears only recognized Research Details hashes when the drawer closes", () => {
    const deck = workspaceSource("workspace-report-and-stats-deck-section.tsx");

    expect(deck).toContain("if (researchDetailsTabForHash(window.location.hash))");
    expect(deck).toContain('window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)');
  });

  it("adds real Research Details interaction coverage to the browser smoke", () => {
    const smoke = readFileSync(new URL("../../../scripts/verify-sena-browser-smoke.mjs", import.meta.url), "utf8");

    expect(smoke).toContain("async function verifyResearchDetailsDrawer(page)");
    expect(smoke).toContain('getAttribute("data-open")');
    expect(smoke).toContain('workspace-research-details-tab-data');
    expect(smoke).toContain('workspace-research-details-tab-${tab}');
    expect(smoke).toContain('["analysis", "#sena-stats-deck", "SNA Metrics"]');
    expect(smoke).toContain('["evidence", "#workspace-research-details-panel-evidence", "Evidence Ledger"]');
    expect(smoke).toContain('["validation", "#workspace-research-details-panel-validation", "Method Validation"]');
    expect(smoke).toContain('["exports", "#workflow-report", "Report Generator"]');
    expect(smoke).toContain('["administration", \'[data-testid="enterprise-runtime-panel"]\', "Enterprise runtime"]');
    expect(smoke).toContain('page.keyboard.press("Escape")');
    expect(smoke).toContain('window.location.hash = "#workflow-report"');
    expect(smoke.match(/window\.location\.hash = "#workflow-report"/g)).toHaveLength(2);
    expect(smoke).toContain('window.location.hash) !== ""');
    expect(smoke).toContain('window.location.hash = "#sena-stats-deck"');
    expect(smoke).toContain("await verifyResearchDetailsDrawer(page)");
  });

  it("relocates enterprise runtime from Data tools to Administration", () => {
    const deck = workspaceSource("workspace-report-and-stats-deck-section.tsx");
    const leftRail = workspaceSource("workspace-left-rail-panel-section.tsx");
    const mainShell = workspaceSource("workspace-main-shell-section.tsx");

    expect(leftRail).not.toContain("<WorkspaceEnterpriseRuntimeSection");
    expect(deck).toContain("<WorkspaceEnterpriseRuntimeSection");
    expect(mainShell).toContain("enterpriseRuntimeProps={leftRailProps.enterpriseRuntimeProps}");
  });
});
