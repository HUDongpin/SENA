import {
  readableEdgeStrokeSignal,
  readableEdgeStrokeWidth,
  senaEdgeStrokeRanges,
  type SenaEdgeStrokeScale
} from "@/lib/sena/visual-encoding";
import { cn } from "@/lib/utils";
import type {
  SenaEdge,
  SenaJenaConceptPairHandoffRow,
  SenaJsnaSocialTieHandoffRow,
  SenaLayer,
  SenaMatrixFingerprint,
  SenaModel,
  SenaNode
} from "./analysis-runtime";
import { EvidenceLineageBadges } from "./evidence-ledger-panel";
import { RankedList } from "./fusion-layer-key";
import { MetricCell } from "./workspace-primitives";

// The Inspector reports the width the canvas actually drew, so it must read the
// canvas's own encoding rather than a structural copy of it: this panel used to
// carry its own `edgeStrokeRanges` table and its own `readableEdgeStrokeWidth`,
// which meant a re-step of either one silently desynchronised the reported
// provenance from the ink. Same functions, one definition.
const edgeStrokeRanges = senaEdgeStrokeRanges;

const layerCopy: Record<SenaLayer, { label: string; detail: string; className: string }> = {
  social: {
    label: "SNA",
    detail: "person-person ties",
    className: "border-blue-400/50 bg-blue-400/10 text-blue-200"
  },
  concept: {
    label: "ENA",
    detail: "code-code co-occurrence",
    className: "border-violetGlow/50 bg-violetGlow/10 text-violetGlow"
  },
  bridge: {
    label: "SENA",
    detail: "person-code contribution",
    className: "border-cyanGlow/50 bg-cyanGlow/10 text-cyanGlow"
  }
};

function formatInspectorNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? value.toString() : value.toFixed(digits);
}

function conceptPairKey(left: string, right: string) {
  return [left, right].sort().join("|");
}

function edgeMatrixProvenance(edge: SenaEdge, options: SenaModel["options"]) {
  if (edge.layer === "social") {
    return {
      source: "jSNA / sna.js",
      block: "S person-person block",
      fingerprintId: "S" as const,
      factor: `alpha ${formatInspectorNumber(options.alpha)}`,
      fusionSlot: "top-left A_fusion block",
      guardrail: "Read as observed social structure, not epistemic quality."
    };
  }
  if (edge.layer === "concept") {
    return {
      source: "jENA aligned",
      block: "W code-code block",
      fingerprintId: "W" as const,
      factor: `beta ${formatInspectorNumber(options.beta)}`,
      fusionSlot: "bottom-right A_fusion block",
      guardrail: "Read with code reliability and jENA manifest settings."
    };
  }
  return {
    source: "SENA bridge",
    block: "B person-code block",
    fingerprintId: "B" as const,
    factor: `gamma ${formatInspectorNumber(options.gamma)}`,
    fusionSlot: "off-diagonal A_fusion blocks",
    guardrail: "Read as contribution linkage before turning it into a claim."
  };
}

function JenaConceptPairEvidencePanel({ handoff }: { handoff: SenaJenaConceptPairHandoffRow }) {
  return (
    <div
      data-testid="concept-edge-jena-handoff"
      data-visual-role="concept-edge-jena-pair-handoff"
      data-overlap-status={handoff.overlapStatus}
      data-adjacency-column={handoff.adjacencyColumn ?? "missing"}
      data-jena-connection-total={handoff.jenaConnectionTotal}
      data-jena-line-weight-total={handoff.jenaLineWeightTotal}
      data-sena-w-weight={handoff.senaRawWeight}
      className="rounded-lg border border-violet-300/25 bg-violet-300/10 p-3"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-black text-foreground">jENA pair evidence</h4>
          <div className="mt-1 text-xs font-semibold leading-5 text-muted">
            jENA adjacency and unit connection counts matched to this SENA W edge.
          </div>
        </div>
        <span className="rounded-full border border-violet-300/35 bg-background/35 px-2.5 py-1 text-xs font-black text-violet-100">
          {handoff.overlapStatus}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="jENA column" value={handoff.adjacencyColumn ?? "missing"} />
        <MetricCell label="jENA count" value={formatInspectorNumber(handoff.jenaConnectionTotal, 1)} />
        <MetricCell label="jENA line" value={formatInspectorNumber(handoff.jenaLineWeightTotal, 3)} />
        <MetricCell label="SENA W raw" value={formatInspectorNumber(handoff.senaRawWeight, 1)} />
      </div>

      <div className="mt-3 grid gap-2">
        {handoff.unitPreview.length > 0 ? handoff.unitPreview.slice(0, 3).map((entry) => (
          <div key={`${handoff.id}-${entry.unit}`} className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] gap-2 rounded-lg border border-cardBorder/30 bg-background/25 px-3 py-2 text-xs">
            <div className="min-w-0 truncate font-black text-foreground">{entry.unit}</div>
            <div className="text-right font-semibold text-muted">c {formatInspectorNumber(entry.connectionCount, 1)}</div>
            <div className="text-right font-semibold text-muted">lw {formatInspectorNumber(entry.lineWeight, 2)}</div>
          </div>
        )) : (
          <div className="rounded-lg border border-cardBorder/30 bg-background/25 p-3 text-xs font-semibold text-muted">
            No positive jENA unit rows are recorded for this pair in the active window.
          </div>
        )}
      </div>

      <div className="mt-3 rounded-lg border border-cardBorder/30 bg-background/25 p-2 text-xs font-semibold leading-5 text-muted">
        {handoff.guardrail}
      </div>
    </div>
  );
}

function JsnaSocialActorMetrics({
  title,
  actor
}: {
  title: string;
  actor: SenaJsnaSocialTieHandoffRow["sourceActor"];
}) {
  return (
    <div className="min-w-0 rounded-lg border border-cardBorder/30 bg-background/25 p-3">
      <div className="text-xs font-black text-foreground">{title}</div>
      <div className="mt-1 truncate text-xs font-semibold text-muted">{actor?.label ?? "missing actor"}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="font-black text-foreground">{actor ? formatInspectorNumber(actor.degree, 1) : "0"}</div>
          <div className="font-semibold text-muted">degree</div>
        </div>
        <div>
          <div className="font-black text-foreground">{actor ? formatInspectorNumber(actor.strength, 1) : "0"}</div>
          <div className="font-semibold text-muted">strength</div>
        </div>
        <div>
          <div className="font-black text-foreground">{actor ? formatInspectorNumber(actor.closeness, 3) : "0"}</div>
          <div className="font-semibold text-muted">closeness</div>
        </div>
        <div>
          <div className="font-black text-foreground">{actor?.community ?? "n/a"}</div>
          <div className="font-semibold text-muted">community</div>
        </div>
      </div>
    </div>
  );
}

function JsnaSocialTieEvidencePanel({ handoff }: { handoff: SenaJsnaSocialTieHandoffRow }) {
  return (
    <div
      data-testid="social-edge-jsna-handoff"
      data-visual-role="social-edge-jsna-tie-handoff"
      data-matrix-aligned={handoff.matrixAligned ? "true" : "false"}
      data-edge-weight={handoff.edgeWeight}
      data-social-matrix-weight={handoff.socialMatrixWeight}
      data-manifest-matrix-weight={handoff.manifestMatrixWeight}
      data-evidence-count={handoff.evidencePreview.length}
      className="rounded-lg border border-blue-300/25 bg-blue-300/10 p-3"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-black text-foreground">jSNA tie evidence</h4>
          <div className="mt-1 text-xs font-semibold leading-5 text-muted">
            jSNA social matrix and actor metrics matched to this SENA S edge.
          </div>
        </div>
        <span className="rounded-full border border-blue-300/35 bg-background/35 px-2.5 py-1 text-xs font-black text-blue-100">
          {handoff.matrixAligned ? "aligned" : "review"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="S matrix" value={formatInspectorNumber(handoff.socialMatrixWeight, 1)} />
        <MetricCell label="jSNA matrix" value={formatInspectorNumber(handoff.manifestMatrixWeight, 1)} />
        <MetricCell label="Evidence refs" value={handoff.evidencePreview.length} />
        <MetricCell label="Mode" value={handoff.graphMode} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <JsnaSocialActorMetrics title="Source actor" actor={handoff.sourceActor} />
        <JsnaSocialActorMetrics title="Target actor" actor={handoff.targetActor} />
      </div>

      <div className="mt-3 grid gap-2">
        {handoff.evidencePreview.length > 0 ? handoff.evidencePreview.slice(0, 3).map((entry) => (
          <div key={`${handoff.id}-${entry.id}`} className="rounded-lg border border-cardBorder/30 bg-background/25 px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 truncate font-black text-foreground">{entry.label}</div>
              <div className="shrink-0 font-semibold text-muted">{entry.stage}</div>
            </div>
            <div className="mt-1 line-clamp-2 font-semibold leading-5 text-muted">{entry.text}</div>
          </div>
        )) : (
          <div className="rounded-lg border border-cardBorder/30 bg-background/25 p-3 text-xs font-semibold text-muted">
            No source interaction snippets are attached to this social tie.
          </div>
        )}
      </div>

      <div className="mt-3 rounded-lg border border-cardBorder/30 bg-background/25 p-2 text-xs font-semibold leading-5 text-muted">
        {handoff.guardrail}
      </div>
    </div>
  );
}

export type InspectorProps = {
  selected: SenaNode | SenaEdge;
  options: SenaModel["options"];
  pairReport: SenaModel["pairReport"];
  matrixFingerprints: SenaMatrixFingerprint[];
  edgeStrokeScale: SenaEdgeStrokeScale;
  jenaConceptPairHandoffRows: SenaJenaConceptPairHandoffRow[];
  jsnaSocialTieHandoffRows: SenaJsnaSocialTieHandoffRow[];
};

export function Inspector({
  selected,
  options,
  pairReport,
  matrixFingerprints,
  edgeStrokeScale,
  jenaConceptPairHandoffRows,
  jsnaSocialTieHandoffRows
}: InspectorProps) {
  if ("layer" in selected) {
    const provenance = edgeMatrixProvenance(selected, options);
    const blockFingerprint = matrixFingerprints.find((fingerprint) => fingerprint.id === provenance.fingerprintId);
    const fusionFingerprint = matrixFingerprints.find((fingerprint) => fingerprint.id === "A_fusion");
    const gFingerprint = matrixFingerprints.find((fingerprint) => fingerprint.id === "G");
    const selectedPair = selected.layer === "concept"
      ? pairReport.find((pair) => (
        (pair.codeA === selected.source && pair.codeB === selected.target) ||
        (pair.codeA === selected.target && pair.codeB === selected.source)
      ))
      : undefined;
    const selectedJenaHandoff = selected.layer === "concept"
      ? jenaConceptPairHandoffRows.find((row) => row.id === conceptPairKey(selected.source, selected.target))
      : undefined;
    const selectedJsnaHandoff = selected.layer === "social"
      ? jsnaSocialTieHandoffRows.find((row) => row.id === selected.id)
      : undefined;
    const visualSalience = readableEdgeStrokeSignal(selected, edgeStrokeScale);
    const visualWidth = readableEdgeStrokeWidth(selected, edgeStrokeScale);
    const visualBasis = selected.layer === "concept" && selectedPair
      ? `W scaled ${formatInspectorNumber(selected.scaledWeight)} + G ${formatInspectorNumber(selectedPair.totalContribution, 1)}`
      : `${selected.layer.toUpperCase()} scaled ${formatInspectorNumber(selected.scaledWeight)}`;

    return (
      <div data-testid="sena-inspector" className="grid gap-4">
        <div>
          <div className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-black", layerCopy[selected.layer].className)}>
            {layerCopy[selected.layer].label}
          </div>
          <h3 className="mt-3 text-2xl font-black text-foreground">{selected.label}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{layerCopy[selected.layer].detail}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MetricCell label="Raw weight" value={formatInspectorNumber(selected.weight, 1)} />
          <MetricCell label="Normalized" value={formatInspectorNumber(selected.normalizedWeight)} />
          <MetricCell label="Scaled" value={formatInspectorNumber(selected.scaledWeight)} />
        </div>
        <div data-testid="edge-visual-stroke-provenance" data-visual-role="edge-visual-stroke-provenance" className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-black text-foreground">Line weight provenance</h4>
              <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                Layer-relative salience used by the current Fusion Canvas stroke.
              </div>
            </div>
            <span className="rounded-full border border-cyanGlow/35 bg-cyanGlow/10 px-2.5 py-1 text-xs font-black text-cyanGlow">
              {formatInspectorNumber(visualWidth, 1)} px
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MetricCell label="Visual salience" value={formatInspectorNumber(visualSalience, 4)} />
            <MetricCell label="Stroke width" value={`${formatInspectorNumber(visualWidth, 1)} px`} />
          </div>
          <div className="mt-3 rounded-lg border border-cardBorder/30 bg-background/25 p-2 text-xs font-semibold leading-5 text-muted">
            Basis: {visualBasis}. Concept links keep raw W intact; G is used only as a visual tie-breaker when active W values are tied.
          </div>
        </div>
        <div data-testid="edge-matrix-provenance" data-visual-role="edge-matrix-provenance" className="rounded-lg border border-cardBorder/35 bg-background/30 p-3">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-black text-foreground">Matrix provenance</h4>
              <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                Selected edge contribution inside the current SENA fusion model.
              </div>
            </div>
            <span className="rounded-full border border-cyanGlow/35 bg-cyanGlow/10 px-2.5 py-1 text-xs font-black text-cyanGlow">
              {selected.layer.toUpperCase()}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MetricCell label="Runtime source" value={provenance.source} />
            <MetricCell label="Matrix block" value={provenance.block} />
            <MetricCell label="Formula factor" value={provenance.factor} />
            <MetricCell label="Fusion slot" value={provenance.fusionSlot} />
          </div>
          <div data-testid="edge-matrix-fingerprint" data-visual-role="edge-matrix-fingerprint" className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="min-w-0 rounded-lg border border-cardBorder/30 bg-background/25 p-2">
              <div className="text-xs font-black text-foreground">Matrix fingerprint</div>
              <div className="mt-1 font-mono text-xs font-black text-cyanGlow">{blockFingerprint?.checksum ?? "missing"}</div>
              <div className="mt-1 text-xs font-semibold text-muted">{blockFingerprint?.id ?? provenance.fingerprintId} block; {blockFingerprint?.shape ?? "unknown shape"}</div>
            </div>
            <div className="min-w-0 rounded-lg border border-cardBorder/30 bg-background/25 p-2">
              <div className="text-xs font-black text-foreground">A_fusion fingerprint</div>
              <div className="mt-1 font-mono text-xs font-black text-cyanGlow">{fusionFingerprint?.checksum ?? "missing"}</div>
              <div className="mt-1 text-xs font-semibold text-muted">{fusionFingerprint?.shape ?? "unknown shape"} weighted block matrix</div>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-cardBorder/30 bg-background/25 p-2 text-xs font-semibold leading-5 text-muted">
            {provenance.guardrail}
          </div>
          <div className="mt-2 rounded-lg border border-fuchsia-300/20 bg-fuchsia-300/10 p-2 text-xs font-semibold leading-5 text-muted">
            Concept edges show G attribution for person-code-pair contribution when selected.
          </div>
        </div>
        {selectedJsnaHandoff && <JsnaSocialTieEvidencePanel handoff={selectedJsnaHandoff} />}
        {selectedJenaHandoff && <JenaConceptPairEvidencePanel handoff={selectedJenaHandoff} />}
        {selectedPair && (
          <div data-testid="concept-edge-g-attribution" data-visual-role="concept-edge-g-attribution" className="rounded-lg border border-fuchsia-300/25 bg-fuchsia-300/10 p-3">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-black text-foreground">G attribution</h4>
                <div className="mt-1 text-xs font-semibold leading-5 text-muted">
                  Person-code-pair association explaining who was exposed to windows containing this ENA concept link.
                </div>
              </div>
              <span className="rounded-full border border-fuchsia-300/35 bg-background/35 px-2.5 py-1 text-xs font-black text-fuchsia-100">
                G {formatInspectorNumber(selectedPair.totalContribution, 1)}
              </span>
            </div>
            <div className="grid gap-2">
              {selectedPair.topContributors.length > 0 ? selectedPair.topContributors.slice(0, 3).map((contributor) => (
                <div key={contributor.id} className="grid grid-cols-[minmax(0,1fr)_4rem] gap-2 rounded-lg border border-cardBorder/30 bg-background/25 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-black text-foreground">{contributor.label}</div>
                    <div className="mt-1 truncate font-semibold text-muted">
                      Direct {formatInspectorNumber(contributor.directWeight, 1)} · Support {formatInspectorNumber(contributor.supportingWeight, 1)}
                    </div>
                  </div>
                  <div className="text-right font-black text-fuchsia-100">{formatInspectorNumber(contributor.weight, 1)}</div>
                </div>
              )) : (
                <div className="rounded-lg border border-cardBorder/30 bg-background/25 p-3 text-xs font-semibold text-muted">
                  No person-code-pair contributor is recorded for this concept link.
                </div>
              )}
            </div>
            <div className="mt-3 rounded-lg border border-cardBorder/30 bg-background/25 p-2 text-xs font-semibold leading-5 text-muted">
              G is an explanatory attribution layer; inspect evidence snippets before making claims about people or groups.
            </div>
            <div className="mt-2 rounded-lg border border-fuchsia-300/20 bg-background/25 p-2 text-xs font-semibold leading-5 text-muted">
              <span className="font-black text-foreground">G fingerprint:</span> <span className="font-mono font-black text-fuchsia-100">{gFingerprint?.checksum ?? "missing"}</span>
            </div>
          </div>
        )}
        <div>
          <h4 className="mb-2 text-sm font-black text-foreground">Evidence</h4>
          <div className="grid max-h-72 gap-2 overflow-auto pr-1">
            {selected.evidence.map((snippet) => (
              <div key={snippet.id} className="rounded-lg border border-cardBorder/35 bg-background/35 p-3">
                <div className="flex items-center justify-between gap-2 text-xs font-black text-muted">
                  <span>{snippet.label}</span>
                  <span>{snippet.stage}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-foreground/82">{snippet.text}</p>
                <EvidenceLineageBadges snippet={snippet} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (selected.kind === "person") {
    return (
      <div data-testid="sena-inspector" className="grid gap-4">
        <div>
          <div className="inline-flex rounded-full border border-blue-400/45 bg-blue-400/10 px-3 py-1 text-xs font-black text-blue-200">
            Person
          </div>
          <h3 className="mt-3 text-2xl font-black text-foreground">{selected.label}</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{selected.role} - {selected.group}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MetricCell label="Bridge score (exp.)" value={formatInspectorNumber(selected.metrics.bridgeScore)} />
          <MetricCell label="S strength" value={formatInspectorNumber(selected.metrics.socialStrength, 1)} />
          <MetricCell label="SNA degree" value={formatInspectorNumber(selected.metrics.socialDegree, 1)} />
          <MetricCell label="Betweenness" value={formatInspectorNumber(selected.metrics.socialBetweenness)} />
          <MetricCell label="Closeness" value={formatInspectorNumber(selected.metrics.socialCloseness)} />
          <MetricCell label="Community" value={selected.metrics.socialCommunity >= 0 ? selected.metrics.socialCommunity + 1 : "NA"} />
          <MetricCell label="B contribution" value={formatInspectorNumber(selected.metrics.epistemicContribution, 1)} />
          <MetricCell label="Alignment" value={formatInspectorNumber(selected.metrics.alignment)} />
        </div>
        <div className="grid gap-3">
          <RankedList title="Top codes" rows={selected.metrics.topCodes.map((row) => [row.label, row.weight])} />
          <RankedList title="Top interactors" rows={selected.metrics.topInteractors.map((row) => [row.label, row.weight])} />
          <RankedList title="Top code-pairs" rows={selected.metrics.topPairs.map((row) => [row.label, row.weight])} />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="sena-inspector" className="grid gap-4">
      <div>
        <div className="inline-flex rounded-full border border-violetGlow/45 bg-violetGlow/10 px-3 py-1 text-xs font-black text-violetGlow">
          Concept
        </div>
        <h3 className="mt-3 text-2xl font-black text-foreground">{selected.label}</h3>
        <p className="mt-2 text-sm leading-6 text-muted">{selected.description}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="ENA degree" value={formatInspectorNumber(selected.metrics.weightedDegree, 1)} />
        <MetricCell label="B total" value={formatInspectorNumber(selected.metrics.totalContribution, 1)} />
      </div>
      <RankedList title="Top co-occurring concepts" rows={selected.metrics.topCooccurring.map((row) => [row.label, row.weight])} />
      <RankedList title="Top contributors" rows={selected.metrics.topContributors.map((row) => [row.label, row.weight])} />
    </div>
  );
}
