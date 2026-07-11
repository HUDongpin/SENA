import {
  AlertTriangle,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SenaFusionMathAudit } from "./analysis-runtime";
import { MetricCell } from "./workspace-primitives";

function formatAuditNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

export function FusionMathAuditPanel({ audit }: { audit: SenaFusionMathAudit }) {
  const reviewItems = audit.items.filter((item) => item.status === "review");
  const visibleItems = reviewItems.length > 0 ? reviewItems : audit.items;

  return (
    <div className="rounded-lg border border-cardBorder/35 bg-background/25 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-foreground">Fusion math audit</div>
          <div className="mt-1 text-xs font-semibold text-muted">
            {audit.schemaVersion}; {audit.status}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-56">
          <MetricCell label="Pass" value={audit.passed} />
          <MetricCell label="Review" value={audit.reviewNeeded} />
        </div>
      </div>
      <div className="mt-3 grid gap-2">
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
                  <div className="mt-1 grid gap-1 text-xs font-semibold leading-5 text-muted">
                    <div>Expected: {item.expected}</div>
                    <div>Actual: {item.actual}</div>
                    {typeof item.maxDelta === "number" && (
                      <div>Max delta: {formatAuditNumber(item.maxDelta)} within tolerance {formatAuditNumber(item.tolerance ?? 0)}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {audit.notes.length > 0 && (
        <div className="mt-3 text-xs font-semibold leading-5 text-muted">
          {audit.notes[0]}
        </div>
      )}
    </div>
  );
}
