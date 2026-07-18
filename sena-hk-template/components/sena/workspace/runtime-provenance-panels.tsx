import {
  FileText,
  Info
} from "lucide-react";
import { buttonStyles } from "@/components/Primitives";
import { cn } from "@/lib/utils";
import type {
  SenaMethodProtocol,
  SenaModel,
  SenaRuntimeConsistencyAudit,
  SenaValidation
} from "./analysis-runtime";
import type { SenaJointEmbeddingOperator } from "./fusion-layout";
import { MetricCell } from "./workspace-primitives";

const jointEmbeddingOperatorOptions: Array<{ value: SenaJointEmbeddingOperator; label: string }> = [
  { value: "mds-schoenberg", label: "MDS + Schoenberg" },
  { value: "laplacian-eigenmaps", label: "Laplacian eigenmaps" },
  { value: "commute-time", label: "Commute-time" }
];

const metricSourceLabels: Record<string, string> = {
  "sna.js": "Direct jSNA",
  "jena-js": "jENA",
  "sena-derived-from-sna.js": "SENA-derived",
  "sena-self-implemented": "SENA implemented",
  "sena-composite": "SENA composite"
};

function formatProvenanceNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

function formatProvenanceShare(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total === 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function runtimeAuditNumber(item: SenaRuntimeConsistencyAudit["items"][number] | undefined, key: string) {
  const value = item?.metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function runtimeAuditBoolean(item: SenaRuntimeConsistencyAudit["items"][number] | undefined, key: string) {
  return item?.metrics?.[key] === true;
}

function runtimeAuditStringList(item: SenaRuntimeConsistencyAudit["items"][number] | undefined, key: string) {
  const value = item?.metrics?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function JointEmbeddingProvenanceStrip({
  model,
  operator,
  onOperatorChange
}: {
  model: SenaModel;
  operator: SenaJointEmbeddingOperator;
  onOperatorChange: (operator: SenaJointEmbeddingOperator) => void;
}) {
  const mds = model.operatorDiagnostics.embedding.mds;
  const laplacian = model.operatorDiagnostics.embedding.laplacianEigenmaps;
  const commute = model.operatorDiagnostics.embedding.commuteTime;
  const isCommute = operator === "commute-time";
  const isLaplacian = operator === "laplacian-eigenmaps";
  const available = isCommute ? commute.available : isLaplacian ? laplacian.available : mds.available;
  const exact = isCommute ? commute.metricExact : isLaplacian ? laplacian.metricExact : mds.metricExact;
  const exactnessValue = exact
    ? "yes"
    : isLaplacian
      ? "spectral non-metric"
      : isCommute
        ? `error ${formatProvenanceNumber(commute.maxPairwiseError ?? 0, 4)}`
        : `stress ${formatProvenanceNumber(mds.stress ?? 0, 4)}`;
  const operatorLabel = isCommute ? "Commute-time" : isLaplacian ? "Laplacian eigenmaps" : "MDS + Schoenberg";
  const dimension = isCommute
    ? Math.max(0, (commute.coordinates?.[0]?.length ?? 0))
    : isLaplacian
      ? laplacian.dimensions
      : mds.dimensions;

  const provenanceTokens: Array<{ label: string; value: string | number }> = [
    { label: "Operator", value: isCommute ? "commute-time" : isLaplacian ? "laplacian-eigenmaps" : "classical-mds" },
    { label: "Delta", value: isCommute ? "commute-time" : isLaplacian ? "L combinatorial" : mds.delta },
    { label: "d", value: dimension },
    { label: "Seed", value: "deterministic" },
    { label: exact ? "metric exact" : "stress", value: available ? exactnessValue : "unavailable" }
  ];

  return (
    <div data-testid="joint-embedding-provenance-strip" className="mb-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="text-[0.68rem] font-black uppercase tracking-[0.06em] text-slate-500">Joint embedding provenance</span>
          <span className="text-sm font-black text-slate-950">{operatorLabel}</span>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {jointEmbeddingOperatorOptions.map((item) => (
            <button
              key={item.value}
              type="button"
              data-testid={item.value === "laplacian-eigenmaps" ? "joint-embedding-operator-laplacian-eigenmaps" : `joint-embedding-operator-${item.value}`}
              onClick={() => onOperatorChange(item.value)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-black transition",
                operator === item.value ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {provenanceTokens.map((token) => (
          <span
            key={token.label}
            className="inline-flex items-baseline gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[0.68rem] font-bold text-slate-500"
          >
            {token.label}
            <span className="font-black text-slate-950">{token.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function MetricProvenanceSummary({ validation }: { validation: SenaValidation }) {
  const metrics = validation.metricProvenance;
  const sourceCounts = Array.from(
    metrics.reduce((counts, metric) => counts.set(metric.source, (counts.get(metric.source) ?? 0) + 1), new Map<string, number>())
  ).sort(([sourceA], [sourceB]) => (metricSourceLabels[sourceA] ?? sourceA).localeCompare(metricSourceLabels[sourceB] ?? sourceB));
  const scopeCounts = Array.from(
    metrics.reduce((counts, metric) => counts.set(metric.scope, (counts.get(metric.scope) ?? 0) + 1), new Map<string, number>())
  ).sort(([scopeA], [scopeB]) => scopeA.localeCompare(scopeB));
  const parityCovered = metrics.filter((metric) => !/no .*parity|deferred/i.test(metric.parityStatus)).length;
  const interpretationLimits = metrics.filter((metric) => metric.interpretationLimit.trim().length > 0).length;

  return (
    <div
      data-testid="stats-metric-provenance-summary"
      data-visual-role="stats-metric-provenance-summary"
      className="grid gap-3 rounded-lg border border-cyanGlow/25 bg-cyanGlow/8 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-cyanGlow">Metric provenance summary</div>
          <div className="mt-1 text-sm font-black text-slate-950">sena-metric-provenance/v1</div>
        </div>
        <Info className="h-4 w-4 shrink-0 text-cyanGlow" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="Metrics" value={metrics.length} />
        <MetricCell label="Parity covered" value={`${parityCovered}/${metrics.length}`} />
        <MetricCell label="Limits declared" value={interpretationLimits} />
        <MetricCell label="Scopes" value={scopeCounts.length} />
      </div>
      <div className="grid gap-2">
        <div className="text-[0.68rem] font-black uppercase text-slate-500">Sources</div>
        <div className="flex flex-wrap gap-1.5">
          {sourceCounts.map(([source, count]) => (
            <span key={source} className="rounded-full border border-white/80 bg-white/75 px-2 py-1 text-[0.68rem] font-black text-slate-700">
              {metricSourceLabels[source] ?? source}: {count}
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <div className="text-[0.68rem] font-black uppercase text-slate-500">Scopes</div>
        <div className="flex flex-wrap gap-1.5">
          {scopeCounts.map(([scope, count]) => (
            <span key={scope} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[0.68rem] font-black text-slate-600">
              {scope}: {count}
            </span>
          ))}
        </div>
      </div>
      <div className="text-xs font-semibold leading-5 text-slate-500">
        Direct jSNA, jENA, SENA-implemented, and composite metrics stay separated before report export.
      </div>
    </div>
  );
}

export function JenaConceptHandoffPanel({ audit }: { audit: SenaRuntimeConsistencyAudit }) {
  const item = audit.items.find((candidate) => candidate.id === "jena-concept-matrix");
  const expectedPairs = runtimeAuditNumber(item, "expectedPairs");
  const adjacencyPairs = runtimeAuditNumber(item, "adjacencyPairs");
  const positiveJenaPairs = runtimeAuditNumber(item, "positiveJenaPairs");
  const positiveSenaWPairs = runtimeAuditNumber(item, "positiveSenaWPairs");
  const overlapPairs = runtimeAuditNumber(item, "overlapPairs");
  const finiteColumns = runtimeAuditBoolean(item, "finiteColumns");
  const positiveJenaMapsToW = runtimeAuditBoolean(item, "allPositiveJenaPairsMapToSenaW");
  const overlapPreview = runtimeAuditStringList(item, "overlapPreview");
  const missingPreview = runtimeAuditStringList(item, "missingPositiveJenaPairPreview");
  const senaOnlyPreview = runtimeAuditStringList(item, "senaOnlyWPairPreview");

  return (
    <div
      data-testid="stats-jena-concept-handoff"
      data-visual-role="stats-jena-concept-pair-handoff"
      data-status={item?.status ?? "missing"}
      data-expected-pairs={expectedPairs}
      data-adjacency-pairs={adjacencyPairs}
      data-positive-jena-pairs={positiveJenaPairs}
      data-positive-sena-w-pairs={positiveSenaWPairs}
      data-overlap-pairs={overlapPairs}
      className="grid gap-3 rounded-lg border border-violet-200 bg-white p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-violet-700">jENA concept-pair handoff</div>
          <div className="mt-1 text-sm font-black text-slate-950">SENA W coverage audit</div>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-1 text-[0.62rem] font-black uppercase",
            item?.status === "pass" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"
          )}
        >
          {item?.status ?? "missing"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="Adjacency pairs" value={`${adjacencyPairs}/${expectedPairs}`} />
        <MetricCell label="Positive jENA" value={positiveJenaPairs} />
        <MetricCell label="Positive SENA W" value={positiveSenaWPairs} />
        <MetricCell label="SENA W overlap" value={`${overlapPairs} (${formatProvenanceShare(overlapPairs, positiveJenaPairs)})`} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-1 text-[0.68rem] font-black text-violet-700">
          finite columns: {finiteColumns ? "yes" : "review"}
        </span>
        <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-1 text-[0.68rem] font-black text-violet-700">
          positive jENA maps to W: {positiveJenaMapsToW ? "yes" : "review"}
        </span>
      </div>

      <div className="grid gap-2 text-xs font-semibold leading-5 text-slate-500">
        <div>
          <span className="font-black text-slate-700">Overlap pairs:</span>{" "}
          {overlapPreview.length > 0 ? overlapPreview.join(", ") : "none"}
        </div>
        {(missingPreview.length > 0 || senaOnlyPreview.length > 0) && (
          <div>
            <span className="font-black text-slate-700">Review preview:</span>{" "}
            {missingPreview.length > 0 ? `jENA not in W ${missingPreview.join(", ")}` : "all positive jENA pairs appear in W"}
            {senaOnlyPreview.length > 0 ? `; W-only ${senaOnlyPreview.join(", ")}` : ""}
          </div>
        )}
        <div>
          Semantic handoff only: jENA moving-window connection counts and SENA stanza W are checked for coverage and signal overlap, not forced W-weight equality.
        </div>
      </div>
    </div>
  );
}

export function JsnaSocialHandoffPanel({ audit }: { audit: SenaRuntimeConsistencyAudit }) {
  const item = audit.items.find((candidate) => candidate.id === "jsna-social-matrix");
  const labels = runtimeAuditNumber(item, "labels");
  const rows = runtimeAuditNumber(item, "rows");
  const columns = runtimeAuditNumber(item, "columns");
  const socialTieRows = runtimeAuditNumber(item, "socialTieRows");
  const alignedTieRows = runtimeAuditNumber(item, "alignedTieRows");
  const positiveTieRows = runtimeAuditNumber(item, "positiveTieRows");
  const evidenceTieRows = runtimeAuditNumber(item, "evidenceTieRows");
  const labelsAligned = runtimeAuditBoolean(item, "labelsAligned");
  const rawAligned = runtimeAuditBoolean(item, "rawAligned");
  const normalizedAligned = runtimeAuditBoolean(item, "normalizedAligned");
  const socialTieHandoffAligned = runtimeAuditBoolean(item, "socialTieHandoffAligned");
  const socialTiePreview = runtimeAuditStringList(item, "socialTiePreview");

  return (
    <div
      data-testid="stats-jsna-social-handoff"
      data-visual-role="stats-jsna-social-tie-handoff"
      data-status={item?.status ?? "missing"}
      data-social-tie-rows={socialTieRows}
      data-aligned-tie-rows={alignedTieRows}
      data-positive-tie-rows={positiveTieRows}
      data-evidence-tie-rows={evidenceTieRows}
      className="grid gap-3 rounded-lg border border-blue-200 bg-white p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-blue-700">jSNA social-tie handoff</div>
          <div className="mt-1 text-sm font-black text-slate-950">SENA S matrix audit</div>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-1 text-[0.62rem] font-black uppercase",
            item?.status === "pass" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"
          )}
        >
          {item?.status ?? "missing"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="S labels" value={labels} />
        <MetricCell label="S shape" value={`${rows}x${columns}`} />
        <MetricCell label="Social ties" value={socialTieRows} />
        <MetricCell label="Aligned ties" value={`${alignedTieRows} (${formatProvenanceShare(alignedTieRows, socialTieRows)})`} />
        <MetricCell label="Positive ties" value={positiveTieRows} />
        <MetricCell label="Evidence ties" value={evidenceTieRows} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[
          ["labels", labelsAligned],
          ["raw S", rawAligned],
          ["normalized S", normalizedAligned],
          ["tie rows", socialTieHandoffAligned]
        ].map(([label, aligned]) => (
          <span key={label as string} className="rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-[0.68rem] font-black text-blue-700">
            {label}: {aligned ? "aligned" : "review"}
          </span>
        ))}
      </div>

      <div className="grid gap-2 text-xs font-semibold leading-5 text-slate-500">
        <div>
          <span className="font-black text-slate-700">Tie preview:</span>{" "}
          {socialTiePreview.length > 0 ? socialTiePreview.join(", ") : "none"}
        </div>
        <div>
          Direct matrix handoff: jSNA social matrix rows, SENA S edge weights, and selected-edge evidence references are checked for exact runtime alignment.
        </div>
      </div>
    </div>
  );
}

export function MethodProtocolHandoffPanel({
  protocol,
  onExportMethodProtocol
}: {
  protocol: SenaMethodProtocol;
  onExportMethodProtocol: () => void;
}) {
  const passCount = protocol.runtimeHandoffs.filter((handoff) => handoff.status === "pass").length;

  return (
    <div
      data-testid="method-protocol-runtime-handoffs"
      data-visual-role="method-protocol-runtime-handoff-ledger"
      data-handoff-count={protocol.runtimeHandoffs.length}
      data-pass-count={passCount}
      data-runtime-status={protocol.auditSummary.runtimeConsistency.status}
      data-fusion-status={protocol.auditSummary.fusionMath.status}
      className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase text-slate-500">Method protocol handoffs</div>
          <div className="mt-1 text-sm font-black text-slate-950">Formula, jENA, and jSNA evidence</div>
        </div>
        <span className="rounded-full border border-cyanGlow/35 bg-cyanGlow/10 px-2 py-1 text-[0.62rem] font-black uppercase text-cyanGlow">
          {passCount}/{protocol.runtimeHandoffs.length}
        </span>
      </div>

      <button
        type="button"
        data-testid="export-stats-method-protocol"
        onClick={onExportMethodProtocol}
        className={buttonStyles({ variant: "secondary", size: "sm" })}
      >
        <FileText className="h-4 w-4" /> Export method protocol
      </button>

      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="Runtime audit" value={protocol.auditSummary.runtimeConsistency.status} />
        <MetricCell label="Fusion math" value={protocol.auditSummary.fusionMath.status} />
      </div>

      <div className="grid gap-2">
        {protocol.runtimeHandoffs.map((handoff) => (
          <div
            key={handoff.id}
            data-testid={`method-protocol-handoff-${handoff.id}`}
            data-status={handoff.status}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-black text-slate-950">{handoff.label}</div>
                <div className="mt-1 truncate font-semibold text-slate-500">{`${handoff.source} -> ${handoff.target}`}</div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[0.62rem] font-black uppercase",
                  handoff.status === "pass" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"
                )}
              >
                {handoff.status}
              </span>
            </div>
            <div className="mt-2 line-clamp-2 font-semibold leading-5 text-slate-500">{handoff.summary}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
