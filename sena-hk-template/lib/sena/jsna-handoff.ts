import type {
  SenaJsnaSocialTieHandoffRow,
  SenaModel,
  SenaSnaManifest,
  SenaSocialActorReport
} from "./types";

type SocialActorSummary = SenaJsnaSocialTieHandoffRow["sourceActor"];

function actorSummary(actor: SenaSocialActorReport | undefined): SocialActorSummary {
  if (!actor) return null;
  return {
    id: actor.id,
    label: actor.label,
    degree: actor.degree,
    strength: actor.strength,
    betweenness: actor.betweenness,
    closeness: actor.closeness,
    reachable: actor.reachable,
    component: actor.component,
    community: actor.community
  };
}

function matrixValue(matrix: number[][] | undefined, row: number, column: number) {
  if (row < 0 || column < 0) return 0;
  return matrix?.[row]?.[column] ?? 0;
}

function aligned(...values: number[]) {
  if (values.length <= 1) return true;
  const [first, ...rest] = values;
  return rest.every((value) => Math.abs(first - value) <= 1e-12);
}

export function buildSenaJsnaSocialTieHandoffRows(
  model: SenaModel,
  snaManifest: SenaSnaManifest
): SenaJsnaSocialTieHandoffRow[] {
  const personIndex = new Map(model.people.map((person, index) => [person.id, index]));
  const personLabel = new Map(model.people.map((person) => [person.id, person.label]));
  const actorById = new Map((snaManifest.outputs?.actorMetrics ?? model.socialReport.actors).map((actor) => [actor.id, actor]));
  const manifestMatrix = snaManifest.outputs?.socialMatrix ?? model.matrices.S;

  return model.edges.filter((edge) => edge.layer === "social").map((edge) => {
    const matrixRow = personIndex.get(edge.source) ?? -1;
    const matrixColumn = personIndex.get(edge.target) ?? -1;
    const socialMatrixWeight = matrixValue(model.matrices.S.raw, matrixRow, matrixColumn);
    const manifestMatrixWeight = matrixValue(manifestMatrix.raw, matrixRow, matrixColumn);

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceLabel: personLabel.get(edge.source) ?? edge.source,
      targetLabel: personLabel.get(edge.target) ?? edge.target,
      label: edge.label,
      graphMode: snaManifest.source.graphMode,
      undirectedSocial: snaManifest.source.undirectedSocial,
      matrixRow,
      matrixColumn,
      edgeWeight: edge.weight,
      socialMatrixWeight,
      manifestMatrixWeight,
      normalizedWeight: edge.normalizedWeight,
      matrixAligned: aligned(edge.weight, socialMatrixWeight, manifestMatrixWeight),
      sourceActor: actorSummary(actorById.get(edge.source)),
      targetActor: actorSummary(actorById.get(edge.target)),
      evidencePreview: edge.evidence.slice(0, 5).map((snippet) => ({
        id: snippet.id,
        stage: snippet.stage,
        label: snippet.label,
        text: snippet.text,
        rowId: snippet.lineage?.rowId ?? null
      })),
      guardrail: "jSNA social-tie handoff verifies the S matrix and actor metrics for observed interaction structure; it does not imply epistemic quality or causal influence."
    };
  });
}
