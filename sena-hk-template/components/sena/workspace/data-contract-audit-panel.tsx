import {
  AlertTriangle,
  CheckCircle2,
  Download
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import { cn } from "@/lib/utils";
import type { SenaDataContractAudit } from "./analysis-runtime";
import { MetricCell } from "./workspace-primitives";

export type DataContractAuditPanelProps = {
  audit: SenaDataContractAudit;
  onExport: () => void;
};

export function DataContractAuditPanel({
  audit,
  onExport
}: DataContractAuditPanelProps) {
  const reviewItems = audit.items.filter((item) => item.status === "review");
  const visibleItems = reviewItems.length > 0 ? reviewItems : audit.items;

  return (
    <div className="grid gap-3 rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black text-foreground">Data contract audit</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {audit.schemaVersion}; {audit.status}
          </div>
        </div>
        <button type="button" onClick={onExport} className={buttonStyles({ variant: "secondary", size: "sm" })}>
          <Download className="h-4 w-4" /> Export data audit
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="Passed" value={audit.passed} />
        <MetricCell label="Review" value={audit.reviewNeeded} />
      </div>

      <div className="grid max-h-64 gap-2 overflow-auto pr-1">
        {visibleItems.map((item) => {
          const Icon = item.status === "pass" ? CheckCircle2 : AlertTriangle;
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border px-3 py-2",
                item.status === "pass" ? "border-emerald-300/35 bg-emerald-300/10" : "border-amber-300/35 bg-amber-300/10"
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.status === "pass" ? "text-emerald-200" : "text-amber-100")} />
                <div className="min-w-0">
                  <div className="text-sm font-black text-foreground">{item.label}</div>
                  <div className="mt-1 text-xs font-semibold leading-5 text-muted">{item.actual}</div>
                  {item.status === "review" && (
                    <div className="mt-1 text-xs font-semibold leading-5 text-amber-100">
                      {item.detail.slice(0, 2).join("; ")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {audit.notes.length > 0 && (
        <div className="text-xs font-semibold leading-5 text-muted">
          {audit.notes[0]}
        </div>
      )}
    </div>
  );
}
