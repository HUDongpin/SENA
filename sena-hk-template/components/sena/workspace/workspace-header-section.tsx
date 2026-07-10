import Link from "next/link";
import type { ChangeEvent } from "react";
import {
  Download,
  Home,
  Sigma,
  Upload
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";

export type WorkspaceHeaderSectionProps = {
  activeWindowLabel: string;
  activeTurnLabel: string;
  totalEvidenceRefs: number;
  reportReadyPercent: number;
  fileAccept: string;
  onContractUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onExportReportMarkdown: () => void;
};

export function WorkspaceHeaderSection({
  activeWindowLabel,
  activeTurnLabel,
  totalEvidenceRefs,
  reportReadyPercent,
  fileAccept,
  onContractUpload,
  onExportReportMarkdown
}: WorkspaceHeaderSectionProps) {
  return (
    <header className="grid min-h-11 gap-3 border-b-4 border-cyanGlow bg-[#1f1f1f] px-4 py-2 text-white lg:grid-cols-[18rem_1fr_auto] lg:items-center">
      <Link href="/" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/18 bg-white/8 text-cyanGlow">
          <Sigma className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-lg font-black leading-tight">SENA Analysis Studio</span>
          <span className="mt-0.5 block truncate text-xs font-bold leading-tight text-slate-300">Social-Epistemic Nexus Analytics</span>
        </span>
      </Link>

      <div className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-bold text-slate-300 md:grid-cols-4">
        <div><span className="text-white">Window</span> {activeWindowLabel}</div>
        <div><span className="text-white">Turns</span> {activeTurnLabel}</div>
        <div><span className="text-white">Evidence refs</span> {totalEvidenceRefs}</div>
        <div><span className="text-white">Report</span> {reportReadyPercent}% ready</div>
      </div>

      <div className="flex flex-wrap gap-2 lg:justify-end">
        <Link href="/" className={buttonStyles({ variant: "secondary", size: "sm", className: "border-white/20 bg-white/10 text-white hover:bg-white/15" })}>
          <Home className="h-4 w-4" /> Home
        </Link>
        <Link href="/workspace/ena" className={buttonStyles({ variant: "secondary", size: "sm", className: "border-white/20 bg-white/10 text-white hover:bg-white/15" })}>
          <Sigma className="h-4 w-4" /> jENA
        </Link>
        <label className={buttonStyles({ variant: "secondary", size: "sm", className: "border-white/20 bg-white/10 text-white hover:bg-white/15" })}>
          <Upload className="h-4 w-4" /> Upload
          <input data-testid="sena-upload-input" type="file" accept={fileAccept} multiple className="sr-only" onChange={onContractUpload} />
        </label>
        <button onClick={onExportReportMarkdown} className={buttonStyles({ size: "sm" })}>
          <Download className="h-4 w-4" /> Export report
        </button>
      </div>
    </header>
  );
}
