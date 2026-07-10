import { Download } from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import { cn } from "@/lib/utils";
import type {
  SenaEvidenceLedger,
  SenaEvidenceSnippet,
  SenaEvidenceSource
} from "./analysis-runtime";
import { MetricCell } from "./workspace-primitives";

export type EvidenceSourceFilter = SenaEvidenceSource | "all";

const evidenceSourceOptions: Array<{ value: EvidenceSourceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "social-edge", label: "SNA" },
  { value: "concept-edge", label: "ENA" },
  { value: "bridge-edge", label: "Bridge" },
  { value: "pair-contribution", label: "G" },
  { value: "temporal-window", label: "Temporal" }
];

const evidenceSourceCopy: Record<SenaEvidenceSource, { label: string; className: string }> = {
  "social-edge": {
    label: "SNA edge",
    className: "border-blue-400/45 bg-blue-400/10 text-blue-200"
  },
  "concept-edge": {
    label: "ENA edge",
    className: "border-violetGlow/45 bg-violetGlow/10 text-violetGlow"
  },
  "bridge-edge": {
    label: "Bridge edge",
    className: "border-cyanGlow/45 bg-cyanGlow/10 text-cyanGlow"
  },
  "pair-contribution": {
    label: "G pair",
    className: "border-fuchsia-300/45 bg-fuchsia-300/10 text-fuchsia-100"
  },
  "temporal-window": {
    label: "Temporal",
    className: "border-emerald-300/45 bg-emerald-300/10 text-emerald-100"
  }
};

export type EvidenceLedgerPanelProps = {
  ledger: SenaEvidenceLedger;
  sourceFilter: EvidenceSourceFilter;
  onSourceFilterChange: (source: EvidenceSourceFilter) => void;
  onExportJson: () => void;
};

export function EvidenceLedgerPanel({
  ledger,
  sourceFilter,
  onSourceFilterChange,
  onExportJson
}: EvidenceLedgerPanelProps) {
  const snippets = sourceFilter === "all"
    ? ledger.snippets
    : ledger.snippets.filter((snippet) => snippet.source === sourceFilter);

  const lineageCount = ledger.snippets.filter((snippet) => snippet.lineage).length;

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
          <MetricCell label="Evidence refs" value={ledger.snippets.length} />
          <MetricCell label="SNA refs" value={ledger.sourceCounts["social-edge"]} />
          <MetricCell label="ENA refs" value={ledger.sourceCounts["concept-edge"]} />
          <MetricCell label="Bridge refs" value={ledger.sourceCounts["bridge-edge"]} />
          <MetricCell label="G refs" value={ledger.sourceCounts["pair-contribution"]} />
          <MetricCell label="Temporal refs" value={ledger.sourceCounts["temporal-window"]} />
          <MetricCell label="Lineage refs" value={lineageCount} />
        </div>
        <button type="button" onClick={onExportJson} className={buttonStyles({ variant: "secondary" })}>
          <Download className="h-4 w-4" /> Export evidence ledger
        </button>
      </div>

      <div data-testid="evidence-ledger-source-filter" className="flex flex-wrap gap-2">
        {evidenceSourceOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSourceFilterChange(option.value)}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs font-black transition",
              sourceFilter === option.value
                ? "border-cyanGlow/60 bg-cyanGlow/12 text-foreground"
                : "border-cardBorder/40 bg-background/30 text-muted hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {snippets.length > 0 ? (
        <div className="grid max-h-[36rem] gap-3 overflow-auto pr-1">
          {snippets.map((snippet, index) => (
            <div key={`${snippet.source}-${snippet.sourceId}-${snippet.id}-${index}`} className="rounded-lg border border-cardBorder/40 bg-background/25 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full border px-2.5 py-1 text-[0.68rem] font-black", evidenceSourceCopy[snippet.source].className)}>
                    {evidenceSourceCopy[snippet.source].label}
                  </span>
                  <span className="text-xs font-black text-foreground">{snippet.sourceLabel}</span>
                </div>
                <span className="text-xs font-semibold text-muted">{snippet.stage}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-foreground/84">{snippet.text}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] font-semibold text-muted">
                <span className="rounded-md border border-cardBorder/35 bg-background/35 px-2 py-1">{snippet.label}</span>
                {snippet.personId && <span className="rounded-md border border-cardBorder/35 bg-background/35 px-2 py-1">person {snippet.personId}</span>}
                {snippet.codes?.map((code) => (
                  <span key={`${snippet.id}-${code}`} className="rounded-md border border-cardBorder/35 bg-background/35 px-2 py-1">{code}</span>
                ))}
              </div>
              <EvidenceLineageBadges snippet={snippet} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-cardBorder/35 bg-background/30 p-4 text-sm font-semibold text-muted">
          No evidence snippets for this source in the current analysis window.
        </div>
      )}

      <div className="sena-warning-panel rounded-lg p-3 text-xs font-semibold leading-5">
        Evidence ledger entries are ordered by model salience, then pair and temporal evidence. Use them as a human-review queue before turning SENA patterns into research claims.
      </div>
    </div>
  );
}

export function EvidenceLineageBadges({ snippet }: { snippet: SenaEvidenceSnippet }) {
  if (!snippet.lineage) return null;
  const related = snippet.lineage.related;
  const badges = [
    `table ${snippet.lineage.table}`,
    `row ${snippet.lineage.rowId}`,
    related?.utteranceId ? `utterance ${related.utteranceId}` : null,
    related?.segmentId ? `segment ${related.segmentId}` : null,
    related?.interactionId ? `interaction ${related.interactionId}` : null,
    related?.personId ? `person ${related.personId}` : null,
    related?.windowId ? `window ${related.windowId}` : null,
    related?.codeIds?.length ? `codes ${related.codeIds.join(", ")}` : null
  ].filter((badge): badge is string => Boolean(badge));

  return (
    <div data-testid="evidence-lineage" data-visual-role="five-table-evidence-lineage" className="mt-3 flex flex-wrap gap-2 text-[0.68rem] font-semibold text-cyanGlow">
      {badges.map((badge) => (
        <span key={`${snippet.id}-${badge}`} className="rounded-md border border-cyanGlow/25 bg-cyanGlow/10 px-2 py-1">
          {badge}
        </span>
      ))}
    </div>
  );
}
