import Link from "next/link";
import type { ChangeEvent } from "react";
import {
  Download,
  Sigma,
  Upload
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";

export type WorkspaceHeaderSectionProps = {
  totalEvidenceRefs: number;
  reportReadyPercent: number;
  fileAccept: string;
  onContractUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onExportReportMarkdown: () => void;
};

export function WorkspaceHeaderSection({
  totalEvidenceRefs,
  reportReadyPercent,
  fileAccept,
  onContractUpload,
  onExportReportMarkdown
}: WorkspaceHeaderSectionProps) {
  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b-2 border-cyanGlow bg-[#1f1f1f] px-3 py-2 text-white lg:flex-nowrap">
      <Link href="/" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyanGlow">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/18 bg-white/8 text-cyanGlow">
          <Sigma className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-lg font-black leading-tight">SENA Analysis Studio</span>
          <span className="mt-0.5 block truncate text-xs font-bold leading-tight text-slate-300">Social-Epistemic Nexus Analytics</span>
        </span>
      </Link>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-slate-300">
        <div className="whitespace-nowrap"><span className="text-white">Dataset</span> {totalEvidenceRefs} evidence refs</div>
        <div className="whitespace-nowrap text-cyanGlow">{reportReadyPercent}% report ready</div>
      </div>

      <div className="ml-auto flex shrink-0 gap-2">
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
