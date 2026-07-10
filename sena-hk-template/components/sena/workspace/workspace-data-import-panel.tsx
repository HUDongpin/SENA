import type { ChangeEvent, ReactNode } from "react";
import {
  Database,
  Download,
  Trash2,
  Upload
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import type { SenaDataset } from "@/lib/sena/types";
import type { SenaModel } from "./analysis-runtime";
import { PilotAssetsPanel } from "./pilot-assets-panel";
import {
  MetricCell,
  Panel
} from "./workspace-primitives";

export type WorkspaceDataImportPanelProps = {
  model: SenaModel;
  timelineModel: SenaModel;
  dataset: SenaDataset;
  importMessage: string;
  fileAccept: string;
  isLoadingSample: boolean;
  onLoadSample: () => void;
  onContractUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onExportContractTemplate: () => void;
  onClearContract: () => void;
  children: ReactNode;
};

function formatDataImportNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export function WorkspaceDataImportPanel({
  model,
  timelineModel,
  dataset,
  importMessage,
  fileAccept,
  isLoadingSample,
  onLoadSample,
  onContractUpload,
  onExportContractTemplate,
  onClearContract,
  children
}: WorkspaceDataImportPanelProps) {
  return (
    <Panel id="workflow-data" title="Data Import" icon={Database} className="p-4">
      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="People" value={model.summary.people} testId="data-count-people" />
        <MetricCell label="Codes" value={model.summary.concepts} testId="data-count-codes" />
        <MetricCell label="Utterances" value={dataset.utterances.length} testId="data-count-utterances" />
        <MetricCell label="Segments" value={dataset.coded_segments.length} testId="data-count-segments" />
        <MetricCell label="Social ties" value={timelineModel.summary.socialEdges} testId="data-count-social-ties" />
        <MetricCell label="SNA density" value={formatDataImportNumber(timelineModel.summary.socialAnalysis.density)} />
        <MetricCell label="Reciprocity" value={formatDataImportNumber(timelineModel.summary.socialAnalysis.reciprocity)} />
        <MetricCell label="Communities" value={timelineModel.summary.socialAnalysis.communityCount} />
      </div>

      <div className="mt-4 grid gap-3">
        <PilotAssetsPanel isLoadingSample={isLoadingSample} onLoadSample={onLoadSample} />

        <div className="flex flex-wrap gap-2">
          <label className={buttonStyles({ variant: "secondary" })}>
            <Upload className="h-4 w-4" /> Add data/transcripts
            <input data-testid="sena-data-import-upload-input" type="file" accept={fileAccept} multiple className="sr-only" onChange={onContractUpload} />
          </label>
          <button data-testid="export-contract-template" onClick={onExportContractTemplate} className={buttonStyles({ variant: "secondary" })}>
            <Download className="h-4 w-4" /> Contract template
          </button>
          <button data-testid="clear-sena-contract" onClick={onClearContract} className={buttonStyles({ variant: "secondary" })}>
            <Trash2 className="h-4 w-4" /> Clear
          </button>
        </div>

        <div className="rounded-lg border border-cardBorder/35 bg-background/20 px-3 py-2 text-xs font-bold leading-5 text-muted">
          CSV/JSON/XLSX tables, LMS/forum exports, TXT/MD transcript cleaning, and SRT/VTT subtitle transcripts.
        </div>

        <div className="rounded-lg border border-cardBorder/45 bg-background/30 p-3 text-sm font-semibold leading-6 text-muted">
          {importMessage}
        </div>

        {children}
      </div>
    </Panel>
  );
}
