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
  UsersRound,
  Zap
} from "lucide-react";
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
  WorkspaceReportSection,
  type WorkspaceReportSectionProps
} from "./workspace-report-section";
import {
  MetricCell,
  Panel
} from "./workspace-primitives";

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
  reportProps
}: WorkspaceReportAndStatsDeckSectionProps) {
  return (
    <div className="mx-auto mt-5 2xl:max-w-[106rem]">
      <DualLensDashboard
        model={model}
        enaManifest={enaManifest}
        snaManifest={snaManifest}
        activeWindow={activeTemporalWindow}
        activeWindowIndex={activeTemporalIndex}
        windowCount={windowCount}
      />

      <div id="sena-stats-deck" className="mt-5 grid scroll-mt-24 gap-5 xl:grid-cols-[1.25fr_0.75fr]">
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
            <button onClick={onExportSocialReport} className={buttonStyles({ variant: "secondary" })}>
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

      <div className="mt-5">
        <Panel title="Pair Contribution G" icon={GitMerge}>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <MetricCell label="Code-pairs" value={model.matrices.G.pairs.length} />
              <MetricCell label="Active pairs" value={model.pairReport.filter((pair) => pair.totalContribution > 0).length} />
              <MetricCell label="G total" value={formatDeckNumber(model.pairReport.reduce((total, pair) => total + pair.totalContribution, 0), 1)} />
            </div>
            <button onClick={onExportPairReport} className={buttonStyles({ variant: "secondary" })}>
              <Download className="h-4 w-4" /> Export G report
            </button>
          </div>
          <PairContributionTable pairs={model.pairReport} />
        </Panel>
      </div>

      <div className="mt-5">
        <Panel title="Evidence Ledger" icon={PanelRight}>
          <EvidenceLedgerPanel
            ledger={evidenceLedger}
            sourceFilter={evidenceSourceFilter}
            onSourceFilterChange={onEvidenceSourceFilterChange}
            onExportJson={onExportEvidenceLedgerJson}
          />
        </Panel>
      </div>

      <div className="mt-5">
        <Panel title="Method Validation" icon={CheckCircle2}>
          <MethodValidationPanel validation={methodValidation} />
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Matrix Evidence" icon={Binary}>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
            <MatrixPreview title="S: social layer" rowLabels={model.matrices.S.labels} columnLabels={model.matrices.S.labels} values={model.matrices.S.raw} />
            <MatrixPreview title="W: concept layer" rowLabels={model.matrices.W.labels} columnLabels={model.matrices.W.labels} values={model.matrices.W.raw} />
            <MatrixPreview title="B: bridge layer" rowLabels={model.matrices.B.rowLabels} columnLabels={model.matrices.B.columnLabels} values={model.matrices.B.raw} />
            <MatrixPreview title="G: person-code-pair layer" rowLabels={model.matrices.G.rowLabels} columnLabels={model.matrices.G.columnLabels} values={model.matrices.G.raw} />
          </div>
        </Panel>

        <div className="grid content-start gap-5">
          <Panel title="Temporal Runtime Trace" icon={Zap}>
            <TemporalRuntimeTracePanel trace={temporalRuntimeTrace} onExportJson={onExportTemporalRuntimeTraceJson} />
          </Panel>
        </div>
      </div>

      <WorkspaceReportSection {...reportProps} />

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
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
        <div className="sena-warning-panel mt-5 rounded-lg p-4 text-sm font-semibold">
          {model.summary.warnings.join(" ")}
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/#method" className={buttonStyles({ variant: "secondary" })}>
          <Braces className="h-4 w-4" /> Read framework
        </Link>
        <Link href="/#workspace" className={buttonStyles({ variant: "secondary" })}>
          <Zap className="h-4 w-4" /> Platform modules
        </Link>
      </div>
    </div>
  );
}
