import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { buildSenaEnaManifest } from "./ena-manifest";
import { buildSenaMatrixFingerprints } from "./fusion-math";
import { buildSenaModel, scopeSenaDatasetToWindow } from "./model";
import { senaRuntimeProvenance } from "./runtime-constants";
import { buildSenaSnaManifest } from "./sna-manifest";
import type {
  SenaBuildOptions,
  SenaDataset,
  SenaEdge,
  SenaModel,
  SenaPairReport,
  SenaTemporalRuntimeTransition,
  SenaTemporalRuntimeDatasetCounts,
  SenaTemporalRuntimeEdgeHighlight,
  SenaTemporalRuntimeGPairHighlight,
  SenaTemporalRuntimeTrace
} from "./types";

export type SenaTemporalRuntimeTraceOptions = {
  generatedAt?: string;
  timelineModel?: SenaModel;
};

function datasetCounts(dataset: SenaDataset): SenaTemporalRuntimeDatasetCounts {
  return {
    people: dataset.people.length,
    interactions: dataset.interactions.length,
    utterances: dataset.utterances.length,
    codedSegments: dataset.coded_segments.length,
    codes: dataset.codebook.length
  };
}

function matrixTotal(values: number[][]) {
  // Non-finite cells are excluded, matching fusion-math.ts matrixTotal: one NaN
  // cell must not poison every per-window total and transition delta downstream.
  return values.reduce((total, row) => (
    total + row.reduce((rowTotal, value) => rowTotal + (Number.isFinite(value) ? value : 0), 0)
  ), 0);
}

function edgeHighlight(edge?: SenaEdge): SenaTemporalRuntimeEdgeHighlight | undefined {
  if (!edge) return undefined;
  return {
    id: edge.id,
    layer: edge.layer,
    label: edge.label,
    source: edge.source,
    target: edge.target,
    weight: edge.weight,
    normalizedWeight: edge.normalizedWeight,
    scaledWeight: edge.scaledWeight
  };
}

function gPairHighlight(pair?: SenaPairReport): SenaTemporalRuntimeGPairHighlight | undefined {
  if (!pair || pair.totalContribution <= 0) return undefined;
  return {
    id: pair.id,
    label: pair.label,
    codeA: pair.codeA,
    codeB: pair.codeB,
    totalContribution: pair.totalContribution,
    topContributors: pair.topContributors
      .filter((contributor) => contributor.weight > 0)
      .slice(0, 3)
      .map((contributor) => ({
        id: contributor.id,
        label: contributor.label,
        weight: contributor.weight,
        directWeight: contributor.directWeight,
        supportingWeight: contributor.supportingWeight
      }))
  };
}

function uniqueWarnings(...sources: Array<string[] | undefined>) {
  return Array.from(new Set(sources.flatMap((source) => source ?? []).filter(Boolean)));
}

function roundDelta(value: number) {
  return Number(value.toFixed(6));
}

function transitionDirection(deltaG: number): SenaTemporalRuntimeTransition["direction"] {
  if (Math.abs(deltaG) < 1e-9) return "stable";
  return deltaG > 0 ? "increase" : "decrease";
}

function buildTransitions(windows: SenaTemporalRuntimeTrace["windows"]): SenaTemporalRuntimeTransition[] {
  return windows.slice(1).map((toEntry, index) => {
    const fromEntry = windows[index];
    const delta = {
      S: roundDelta(toEntry.sena.matrixTotals.S - fromEntry.sena.matrixTotals.S),
      W: roundDelta(toEntry.sena.matrixTotals.W - fromEntry.sena.matrixTotals.W),
      B: roundDelta(toEntry.sena.matrixTotals.B - fromEntry.sena.matrixTotals.B),
      B_PC: roundDelta(toEntry.sena.matrixTotals.B_PC - fromEntry.sena.matrixTotals.B_PC),
      B_CP: roundDelta(toEntry.sena.matrixTotals.B_CP - fromEntry.sena.matrixTotals.B_CP),
      G: roundDelta(toEntry.sena.matrixTotals.G - fromEntry.sena.matrixTotals.G),
      fusion: roundDelta(toEntry.sena.matrixTotals.fusion - fromEntry.sena.matrixTotals.fusion),
      activeGPairs: toEntry.sena.activeGPairs - fromEntry.sena.activeGPairs
    };
    const fromTopPair = fromEntry.sena.strongestGPair;
    const toTopPair = toEntry.sena.strongestGPair;

    return {
      id: `${fromEntry.window.id}--${toEntry.window.id}`,
      fromWindowId: fromEntry.window.id,
      toWindowId: toEntry.window.id,
      fromLabel: fromEntry.window.label,
      toLabel: toEntry.window.label,
      turnSpan: `${fromEntry.window.startTurn}-${toEntry.window.endTurn}`,
      delta,
      direction: transitionDirection(delta.G),
      jenaStatus: {
        from: fromEntry.ena.status,
        to: toEntry.ena.status
      },
      jsnaStatus: {
        from: fromEntry.sna.status,
        to: toEntry.sna.status
      },
      strongestGPair: {
        ...(fromTopPair ? { from: fromTopPair } : {}),
        ...(toTopPair ? { to: toTopPair } : {}),
        changed: (fromTopPair?.id ?? null) !== (toTopPair?.id ?? null)
      },
      interpretationGuardrail: "Temporal transitions summarize adjacent-window S/W/B/B_PC/B_CP/G deltas for inspection; they are not causal evidence without temporal design, coding reliability, and human review."
    };
  });
}

export function buildSenaTemporalRuntimeTrace(
  dataset: SenaDataset,
  buildOptions: Partial<SenaBuildOptions> = {},
  options: SenaTemporalRuntimeTraceOptions = {}
): SenaTemporalRuntimeTrace {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const timelineModel = options.timelineModel ?? buildSenaModel(dataset, buildOptions);
  const windows = timelineModel.temporal.windows.map((window) => {
    const scopedDataset = scopeSenaDatasetToWindow(dataset, window);
    const scopedModel = buildSenaModel(scopedDataset, timelineModel.options);
    const enaManifest = buildSenaEnaManifest(scopedModel.dataset);
    const snaManifest = buildSenaSnaManifest(scopedModel);
    const strongestGPair = [...scopedModel.pairReport]
      .filter((pair) => pair.totalContribution > 0)
      .sort((a, b) => b.totalContribution - a.totalContribution || a.label.localeCompare(b.label))[0];
    const strongestSocialTie = edgeHighlight(scopedModel.summary.strongestSocialTie);
    const strongestConceptTie = edgeHighlight(scopedModel.summary.strongestConceptTie);
    const strongestBridgeTie = edgeHighlight(scopedModel.summary.strongestBridgeTie);
    const strongestGPairHighlight = gPairHighlight(strongestGPair);
    const warnings = uniqueWarnings(scopedModel.summary.warnings, enaManifest.warnings, snaManifest.warnings);

    return {
      window,
      datasetCounts: datasetCounts(scopedDataset),
      sena: {
        people: scopedModel.summary.people,
        concepts: scopedModel.summary.concepts,
        socialEdges: scopedModel.summary.socialEdges,
        conceptEdges: scopedModel.summary.conceptEdges,
        bridgeEdges: scopedModel.summary.bridgeEdges,
        socialDensity: scopedModel.summary.socialDensity,
        activeGPairs: scopedModel.pairReport.filter((pair) => pair.totalContribution > 0).length,
        fusionNodeCount: scopedModel.matrices.fusion.labels.length,
        matrixTotals: {
          S: matrixTotal(scopedModel.matrices.S.raw),
          W: matrixTotal(scopedModel.matrices.W.raw),
          B: matrixTotal(scopedModel.matrices.B.raw),
          B_PC: matrixTotal(scopedModel.matrices.B_PC.raw),
          B_CP: matrixTotal(scopedModel.matrices.B_CP.raw),
          G: matrixTotal(scopedModel.matrices.G.raw),
          fusion: matrixTotal(scopedModel.matrices.fusion.values)
        },
        matrixFingerprints: buildSenaMatrixFingerprints(scopedModel),
        ...(strongestSocialTie ? { strongestSocialTie } : {}),
        ...(strongestConceptTie ? { strongestConceptTie } : {}),
        ...(strongestBridgeTie ? { strongestBridgeTie } : {}),
        ...(strongestGPairHighlight ? { strongestGPair: strongestGPairHighlight } : {}),
        warnings: scopedModel.summary.warnings
      },
      ena: {
        status: enaManifest.status,
        datasetCounts: enaManifest.datasetCounts,
        dimensions: enaManifest.outputs?.dimensions ?? [],
        variance: enaManifest.outputs?.variance ?? {},
        pointCount: enaManifest.outputs?.points.length ?? 0,
        nodePositionCount: enaManifest.outputs?.nodePositions.length ?? 0,
        warnings: enaManifest.warnings
      },
      sna: {
        status: snaManifest.status,
        datasetCounts: snaManifest.datasetCounts,
        ...(snaManifest.outputs?.graph ? { graph: snaManifest.outputs.graph } : {}),
        warnings: snaManifest.warnings
      },
      warnings
    };
  });

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.temporalRuntimeTrace,
    generatedAt,
    sourceDatasetCounts: datasetCounts(dataset),
    buildOptions: timelineModel.options,
    temporalSettings: timelineModel.temporal.settings,
    runtimeProvenance: senaRuntimeProvenance,
    windows,
    transitions: buildTransitions(windows),
    warnings: uniqueWarnings(
      dataset.warnings,
      timelineModel.summary.warnings,
      ...windows.map((window) => window.warnings)
    )
  };
}
