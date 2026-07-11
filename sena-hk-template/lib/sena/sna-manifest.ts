import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import type { SenaModel, SenaSnaManifest } from "./types";
import { snaRuntimeVersion } from "./runtime-constants";

function skippedManifest(model: SenaModel, reason: string): SenaSnaManifest {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.jsnaManifest,
    status: "skipped",
    engine: "sna.js",
    engineAlias: "jSNA",
    engineVersion: snaRuntimeVersion,
    source: {
      rowsFrom: "interactions",
      nodeTable: "people",
      sourceColumn: "source",
      targetColumn: "target",
      weightColumn: "weight",
      stageColumn: "stage",
      evidenceColumn: "evidence",
      graphMode: model.socialReport.graph.mode,
      undirectedSocial: model.options.undirectedSocial
    },
    datasetCounts: {
      people: model.dataset.people.length,
      interactions: model.dataset.interactions.length,
      weightedTies: model.socialReport.graph.tieCount,
      communities: model.socialReport.graph.communityCount,
      components: model.socialReport.graph.componentCount
    },
    warnings: [reason, ...model.summary.warnings]
  };
}

export function buildSenaSnaManifest(model: SenaModel): SenaSnaManifest {
  if (model.people.length === 0) {
    return skippedManifest(model, "jSNA manifest requires at least one person.");
  }

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.jsnaManifest,
    status: "computed",
    engine: "sna.js",
    engineAlias: "jSNA",
    engineVersion: snaRuntimeVersion,
    source: {
      rowsFrom: "interactions",
      nodeTable: "people",
      sourceColumn: "source",
      targetColumn: "target",
      weightColumn: "weight",
      stageColumn: "stage",
      evidenceColumn: "evidence",
      graphMode: model.socialReport.graph.mode,
      undirectedSocial: model.options.undirectedSocial
    },
    datasetCounts: {
      people: model.dataset.people.length,
      interactions: model.dataset.interactions.length,
      weightedTies: model.socialReport.graph.tieCount,
      communities: model.socialReport.graph.communityCount,
      components: model.socialReport.graph.componentCount
    },
    outputs: {
      graph: model.socialReport.graph,
      actorMetrics: model.socialReport.actors,
      communities: model.socialReport.communities,
      socialMatrix: model.matrices.S
    },
    warnings: model.summary.warnings
  };
}
