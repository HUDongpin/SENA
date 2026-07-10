import {
  Database,
  Download,
  Sparkles
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import {
  senaPilotAssetIntegrity,
  senaPilotHandoffChecks,
  senaPilotPackageManifestAsset,
  senaPilotSampleAssets,
  senaPilotTemplateAssets
} from "@/lib/sena/pilot-assets";

export type PilotAssetsPanelProps = {
  isLoadingSample: boolean;
  onLoadSample: () => void;
};

export function PilotAssetsPanel({
  isLoadingSample,
  onLoadSample
}: PilotAssetsPanelProps) {
  return (
    <div data-testid="pilot-assets-panel" data-visual-role="pilot-assets-panel" className="rounded-lg border border-cardBorder/45 bg-background/25 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black text-foreground">Research Pilot Assets</div>
          <div
            data-testid="pilot-asset-integrity"
            data-visual-role="pilot-asset-integrity"
            className="mt-1 text-xs font-semibold text-muted"
          >
            Templates and sample data match the SENA import aliases with {senaPilotAssetIntegrity.length} manifest fingerprints.
          </div>
        </div>
        <Database className="h-4 w-4 shrink-0 text-cyanGlow" />
      </div>
      <div className="mt-3 grid gap-2">
        <button data-testid="load-lesson-study-sample" type="button" onClick={onLoadSample} disabled={isLoadingSample} className={buttonStyles({ size: "sm", className: "w-full justify-start" })}>
          <Sparkles className="h-4 w-4" /> {isLoadingSample ? "Loading sample..." : "Load lesson-study sample"}
        </button>
        <a
          data-testid="pilot-asset-link"
          data-asset-kind="manifest"
          data-asset-href={senaPilotPackageManifestAsset.href}
          href={senaPilotPackageManifestAsset.href}
          download
          className={buttonStyles({ variant: "secondary", size: "sm", className: "w-full justify-start" })}
        >
          <Download className="h-4 w-4" /> {senaPilotPackageManifestAsset.label}
        </a>
        <div className="rounded-lg border border-cyanGlow/25 bg-cyanGlow/10 p-3" data-testid="pilot-handoff-checks" data-visual-role="pilot-handoff-checks">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-black uppercase text-cyanGlow">Handoff checks</div>
            <span className="text-[0.64rem] font-black uppercase text-muted">manifest aligned</span>
          </div>
          <div className="grid gap-2">
            {senaPilotHandoffChecks.map((check) => (
              <div
                key={check.id}
                data-testid="pilot-handoff-check"
                data-handoff-check-id={check.id}
                data-handoff-artifact={check.artifact}
                className="rounded-lg border border-cardBorder/35 bg-background/30 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black text-foreground">{check.label}</span>
                  <span className="rounded border border-cardBorder/40 px-1.5 py-0.5 text-[0.62rem] font-black text-cyanGlow">
                    {check.artifact}
                  </span>
                </div>
                <div className="mt-1 text-[0.68rem] font-semibold leading-5 text-muted">
                  {check.expectedEvidence.join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs font-black uppercase text-muted">Sample dataset</div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {senaPilotSampleAssets.map((asset) => (
            <a
              key={asset.href}
              data-testid="pilot-asset-link"
              data-asset-kind="sample"
              data-asset-href={asset.href}
              href={asset.href}
              download
              className="grid rounded-lg border border-cardBorder/40 bg-background/35 px-3 py-2 transition hover:border-cyanGlow/55"
            >
              <span className="text-xs font-black text-foreground">{asset.label}</span>
              <span className="mt-0.5 text-[0.68rem] font-semibold text-muted">{asset.detail}</span>
            </a>
          ))}
        </div>
      </div>
      <div className="mt-3 border-t border-cardBorder/30 pt-3">
        <div className="mb-2 text-xs font-black uppercase text-muted">Blank templates</div>
        <div className="grid gap-2">
          {senaPilotTemplateAssets.map((asset) => (
            <a
              key={asset.href}
              data-testid="pilot-asset-link"
              data-asset-kind="template"
              data-asset-href={asset.href}
              href={asset.href}
              download
              className="grid rounded-lg border border-cardBorder/35 bg-background/25 px-3 py-2 transition hover:border-cyanGlow/50"
            >
              <span className="text-xs font-black text-foreground">{asset.label}</span>
              <span className="mt-0.5 text-[0.68rem] font-semibold text-muted">{asset.detail}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
