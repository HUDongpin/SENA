"use client";

import Link from "next/link";
import {
  Binary,
  Braces,
  CheckCircle2,
  Download,
  FileText,
  GitMerge,
  Network,
  PanelRight,
  SlidersHorizontal,
  UsersRound,
  X,
  Zap
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { buttonStyles } from "@/components/Primitives";
import type {
  SenaEnaManifest,
  SenaEvidenceLedger,
  SenaModel,
  SenaSnaManifest,
  SenaTemporalRuntimeTrace,
  SenaTemporalWindow,
  SenaValidation
} from "./analysis-runtime";
import { DualLensDashboard } from "./dual-lens-dashboard";
import {
  EvidenceLedgerPanel,
  type EvidenceSourceFilter
} from "./evidence-ledger-panel";
import { MatrixPreview } from "./matrix-preview";
import { MethodValidationPanel } from "./method-validation-panel";
import {
  CommunityList,
  PairContributionTable,
  SocialMetricsTable
} from "./sena-stats-tables";
import { TemporalRuntimeTracePanel } from "./temporal-runtime-trace-panel";
import {
  WorkspaceEnterpriseRuntimeSection,
  type WorkspaceEnterpriseRuntimeSectionProps
} from "./workspace-enterprise-runtime-section";
import {
  WorkspaceReportSection,
  type WorkspaceReportSectionProps
} from "./workspace-report-section";
import {
  MetricCell,
  Panel
} from "./workspace-primitives";

const researchDetailsTabs = [
  { id: "data", label: "Data" },
  { id: "analysis", label: "Analysis" },
  { id: "evidence", label: "Evidence" },
  { id: "validation", label: "Validation" },
  { id: "exports", label: "Exports" },
  { id: "administration", label: "Administration" }
] as const;

export type ResearchDetailsTab = (typeof researchDetailsTabs)[number]["id"];

export function researchDetailsTabForHash(hash: string): ResearchDetailsTab | null {
  if (hash === "#sena-stats-deck") return "analysis";
  if (hash === "#workflow-report") return "exports";
  return null;
}

export type WorkspaceReportAndStatsDeckSectionProps = {
  model: SenaModel;
  enaManifest: SenaEnaManifest;
  snaManifest: SenaSnaManifest;
  activeTemporalWindow?: SenaTemporalWindow;
  activeTemporalIndex: number;
  windowCount: number;
  evidenceLedger: SenaEvidenceLedger;
  evidenceSourceFilter: EvidenceSourceFilter;
  onEvidenceSourceFilterChange: (filter: EvidenceSourceFilter) => void;
  onExportEvidenceLedgerJson: () => void;
  methodValidation: SenaValidation;
  temporalRuntimeTrace: SenaTemporalRuntimeTrace;
  onExportTemporalRuntimeTraceJson: () => void;
  onExportSocialReport: () => void;
  onExportPairReport: () => void;
  reportProps: WorkspaceReportSectionProps;
  enterpriseRuntimeProps?: WorkspaceEnterpriseRuntimeSectionProps["runtimeProps"];
};

function formatDeckNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export function WorkspaceReportAndStatsDeckSection({
  model,
  enaManifest,
  snaManifest,
  activeTemporalWindow,
  activeTemporalIndex,
  windowCount,
  evidenceLedger,
  evidenceSourceFilter,
  onEvidenceSourceFilterChange,
  onExportEvidenceLedgerJson,
  methodValidation,
  temporalRuntimeTrace,
  onExportTemporalRuntimeTraceJson,
  onExportSocialReport,
  onExportPairReport,
  reportProps,
  enterpriseRuntimeProps
}: WorkspaceReportAndStatsDeckSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ResearchDetailsTab>("data");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const closeDrawer = useCallback(() => {
    if (researchDetailsTabForHash(window.location.hash)) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    setIsOpen(false);
    window.requestAnimationFrame(() => toggleRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const workspaceTaskDrawer = document.querySelector('[data-testid="workspace-left-panel-overlay"]');
      if (workspaceTaskDrawer) return;
      closeDrawer();
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [closeDrawer, isOpen]);

  useEffect(() => {
    function revealHashTarget() {
      const targetTab = researchDetailsTabForHash(window.location.hash);
      if (!targetTab) return;

      setActiveTab(targetTab);
      setIsOpen(true);
      window.requestAnimationFrame(() => {
        const targetIndex = researchDetailsTabs.findIndex((tab) => tab.id === targetTab);
        tabRefs.current[targetIndex]?.focus();
      });
    }

    revealHashTarget();
    window.addEventListener("hashchange", revealHashTarget);
    return () => window.removeEventListener("hashchange", revealHashTarget);
  }, []);

  function openDrawer() {
    setIsOpen(true);
    window.requestAnimationFrame(() => {
      const activeIndex = researchDetailsTabs.findIndex((tab) => tab.id === activeTab);
      tabRefs.current[activeIndex]?.focus();
    });
  }

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % researchDetailsTabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + researchDetailsTabs.length) % researchDetailsTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = researchDetailsTabs.length - 1;
    else return;

    event.preventDefault();
    const nextTab = researchDetailsTabs[nextIndex];
    setActiveTab(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div
      id="workspace-research-details-drawer"
      data-testid="workspace-research-details-drawer"
      data-open={isOpen ? "true" : "false"}
      className="pointer-events-none fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-[106rem] flex-col items-end gap-2"
    >
      {isOpen && (
        <section
          role="dialog"
          aria-label="Research Details"
          className="pointer-events-auto flex max-h-[calc(100dvh-5rem)] w-full flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_24px_70px_rgb(15_23_42/0.28)]"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <div className="text-base font-black text-slate-950">Research Details</div>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">Advanced data, analysis, evidence, validation, exports, and administration.</p>
            </div>
            <button
              type="button"
              aria-label="Close Research Details"
              onClick={closeDrawer}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-300 text-slate-700 transition hover:border-cyanGlow hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Research Details sections"
            className="grid shrink-0 grid-cols-2 gap-1 border-b border-slate-200 bg-slate-50 p-2 sm:grid-cols-3 lg:grid-cols-6"
          >
            {researchDetailsTabs.map((tab, index) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(node) => {
                    tabRefs.current[index] = node;
                  }}
                  type="button"
                  role="tab"
                  id={`workspace-research-details-tab-${tab.id}`}
                  data-testid={`workspace-research-details-tab-${tab.id}`}
                  aria-selected={selected}
                  aria-controls={`workspace-research-details-panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={`min-h-11 rounded-lg px-3 py-2 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow ${selected ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white hover:text-slate-950"}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div
            id={`workspace-research-details-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`workspace-research-details-tab-${activeTab}`}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5"
          >
            {activeTab === "data" && (
              <DualLensDashboard
                model={model}
                enaManifest={enaManifest}
                snaManifest={snaManifest}
                activeWindow={activeTemporalWindow}
                activeWindowIndex={activeTemporalIndex}
                windowCount={windowCount}
              />
            )}

            {activeTab === "analysis" && (
              <div id="sena-stats-deck" className="grid gap-5">
                <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
                  <Panel title="SNA Metrics" icon={Network}>
                    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                        <MetricCell label="Tie count" value={model.socialReport.graph.tieCount} />
                        <MetricCell label="Density" value={formatDeckNumber(model.socialReport.graph.density)} />
                        <MetricCell label="Reciprocity" value={formatDeckNumber(model.socialReport.graph.reciprocity)} />
                        <MetricCell label="Avg path" value={formatDeckNumber(model.socialReport.graph.averagePathLength)} />
                        <MetricCell label="Components" value={model.socialReport.graph.componentCount} />
                        <MetricCell label="Largest comp." value={model.socialReport.graph.largestComponentSize} />
                      </div>
                      <button type="button" onClick={onExportSocialReport} className={buttonStyles({ variant: "secondary" })}>
                        <Download className="h-4 w-4" /> Export SNA report
                      </button>
                    </div>
                    <SocialMetricsTable actors={model.socialReport.actors} />
                  </Panel>

                  <Panel title="Community Detection" icon={UsersRound}>
                    <div className="mb-4 rounded-lg border border-cardBorder/35 bg-background/30 p-3 text-sm font-semibold leading-6 text-muted">
                      {model.socialReport.graph.communityDetection}; engine {model.socialReport.graph.engine}; mode {model.socialReport.graph.mode}.
                    </div>
                    <CommunityList communities={model.socialReport.communities} />
                  </Panel>
                </div>

                <Panel title="Pair Contribution G" icon={GitMerge}>
                  <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <MetricCell label="Code-pairs" value={model.matrices.G.pairs.length} />
                      <MetricCell label="Active pairs" value={model.pairReport.filter((pair) => pair.totalContribution > 0).length} />
                      <MetricCell label="G total" value={formatDeckNumber(model.pairReport.reduce((total, pair) => total + pair.totalContribution, 0), 1)} />
                    </div>
                    <button type="button" onClick={onExportPairReport} className={buttonStyles({ variant: "secondary" })}>
                      <Download className="h-4 w-4" /> Export G report
                    </button>
                  </div>
                  <PairContributionTable pairs={model.pairReport} />
                </Panel>

                <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                  <Panel title="Matrix Evidence" icon={Binary}>
                    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
                      <MatrixPreview title="S: social layer" rowLabels={model.matrices.S.labels} columnLabels={model.matrices.S.labels} values={model.matrices.S.raw} />
                      <MatrixPreview title="W: concept layer" rowLabels={model.matrices.W.labels} columnLabels={model.matrices.W.labels} values={model.matrices.W.raw} />
                      <MatrixPreview title="B: bridge layer" rowLabels={model.matrices.B.rowLabels} columnLabels={model.matrices.B.columnLabels} values={model.matrices.B.raw} />
                      <MatrixPreview title="G: person-code-pair layer" rowLabels={model.matrices.G.rowLabels} columnLabels={model.matrices.G.columnLabels} values={model.matrices.G.raw} />
                    </div>
                  </Panel>

                  <Panel title="Temporal Runtime Trace" icon={Zap}>
                    <TemporalRuntimeTracePanel trace={temporalRuntimeTrace} onExportJson={onExportTemporalRuntimeTraceJson} />
                  </Panel>
                </div>
              </div>
            )}

            {activeTab === "evidence" && (
              <Panel title="Evidence Ledger" icon={PanelRight}>
                <EvidenceLedgerPanel
                  ledger={evidenceLedger}
                  sourceFilter={evidenceSourceFilter}
                  onSourceFilterChange={onEvidenceSourceFilterChange}
                  onExportJson={onExportEvidenceLedgerJson}
                />
              </Panel>
            )}

            {activeTab === "validation" && (
              <Panel title="Method Validation" icon={CheckCircle2}>
                <MethodValidationPanel validation={methodValidation} />
              </Panel>
            )}

            {activeTab === "exports" && (
              <div className="grid gap-5">
                <WorkspaceReportSection {...reportProps} />

                <div className="grid gap-5 lg:grid-cols-3">
                  <Panel title="Dual Lens Basis" icon={UsersRound}>
                    <p className="text-sm leading-6 text-muted">
                      SNA keeps actor ties analytically separate from ENA code co-occurrence before fusion. This avoids confusing social centrality with epistemic quality.
                    </p>
                  </Panel>
                  <Panel title="Fusion Claim" icon={Network}>
                    <p className="text-sm leading-6 text-muted">
                      The bridge layer shows who is associated with concepts, and G shows who is associated with code-pair windows.
                    </p>
                  </Panel>
                  <Panel title="Report Readiness" icon={FileText}>
                    <p className="text-sm leading-6 text-muted">
                      Every visible claim can be exported with weights, normalization, matrix values, and original utterance evidence for human-reviewed reporting.
                    </p>
                  </Panel>
                </div>

                {model.summary.warnings.length > 0 && (
                  <div className="sena-warning-panel rounded-lg p-4 text-sm font-semibold">
                    {model.summary.warnings.join(" ")}
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <Link href="/#method" className={buttonStyles({ variant: "secondary" })}>
                    <Braces className="h-4 w-4" /> Read framework
                  </Link>
                  <Link href="/#workspace" className={buttonStyles({ variant: "secondary" })}>
                    <Zap className="h-4 w-4" /> Platform modules
                  </Link>
                </div>
              </div>
            )}

            {activeTab === "administration" && (
              enterpriseRuntimeProps ? (
                <WorkspaceEnterpriseRuntimeSection runtimeProps={enterpriseRuntimeProps} />
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                  Administration controls are unavailable in this workspace context.
                </div>
              )
            )}
          </div>
        </section>
      )}

      <button
        ref={toggleRef}
        type="button"
        data-testid="workspace-research-details-toggle"
        aria-label={isOpen ? "Close Research Details" : "Open Research Details"}
        aria-controls="workspace-research-details-drawer"
        aria-expanded={isOpen}
        onClick={isOpen ? closeDrawer : openDrawer}
        className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-800 shadow-lg transition hover:border-cyanGlow hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow"
      >
        {isOpen ? <X className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
        {isOpen ? "Close details" : "Research Details"}
      </button>
    </div>
  );
}
