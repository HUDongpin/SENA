import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { buildSenaModel } from "../model";
import { inspectSenaModelCardSections } from "../model-card";
import {
  assertSenaProjectSnapshotPublicationSourceContract,
  buildSenaProjectSnapshot,
  SenaProjectSnapshotResourceLimitError
} from "../snapshot";
import type { SenaCodingReliabilityReview } from "../types";
import { SenaEnterpriseError } from "./errors";
import { assertEnterpriseReliabilityRunCurrentProject } from "./reliability-integrity";
import type { SenaEnterpriseReliabilityRun } from "./reliability-runs";
import type { SenaEnterpriseProject } from "./team-project";

function publicationDerivationBudgetError(error: unknown): never {
  if (error instanceof SenaProjectSnapshotResourceLimitError) {
    throw new SenaEnterpriseError(
      "Publication export exceeds the supported canonical derivation budget.",
      413,
      "publication_export_derivation_too_complex"
    );
  }
  throw error;
}

function assertPersistedModelCardSectionMembership(project: SenaEnterpriseProject) {
  const sections = project.snapshot.report?.modelCard?.sections;
  if (!Array.isArray(sections)) {
    throw new SenaEnterpriseError(
      "Publication export blocked because the persisted model card has no section-membership evidence.",
      409,
      "publication_export_model_card_blocked"
    );
  }
  const { missingIds, duplicateIds, unknownIds, malformedIndexes } = inspectSenaModelCardSections(sections);
  if (missingIds.length === 0 && duplicateIds.length === 0 && unknownIds.length === 0 &&
    malformedIndexes.length === 0) return;
  const membershipBlockers = [
    ...missingIds.map((id) => `missing:${id}`),
    ...duplicateIds.map((id) => `duplicate:${id}`),
    ...unknownIds.map((id) => `unknown:${id}`),
    ...malformedIndexes.map((index) => `malformed:${index}`)
  ];
  throw new SenaEnterpriseError(
    `Publication export blocked because persisted model-card section membership is incomplete or inconsistent: ${membershipBlockers.join(", ")}.`,
    409,
    "publication_export_model_card_blocked"
  );
}

export function buildEnterprisePublicationSnapshot(
  project: SenaEnterpriseProject,
  reliabilityRun: SenaEnterpriseReliabilityRun | undefined,
  reliabilityReviewProjection: Partial<SenaCodingReliabilityReview> | undefined
) {
  const persistedFusionAudit = project.snapshot.report.fusionMathAudit;
  const persistedReliabilityGate = project.snapshot.report.codingReliabilityGate;
  if (
    persistedFusionAudit.schemaVersion !== SENA_SCHEMA_VERSIONS.fusionMathAudit ||
    persistedFusionAudit.sourceSchemaVersion !== SENA_SCHEMA_VERSIONS.fusionMathAudit ||
    persistedReliabilityGate.schemaVersion !== SENA_SCHEMA_VERSIONS.codingReliabilityGate ||
    persistedReliabilityGate.sourceSchemaVersion !== SENA_SCHEMA_VERSIONS.codingReliabilityGate
  ) {
    throw new SenaEnterpriseError(
      "Publication export requires exact current-v2 statistical provenance; legacy read projections are import-only.",
      409,
      "publication_export_model_card_blocked"
    );
  }
  try {
    assertSenaProjectSnapshotPublicationSourceContract(project.snapshot);
  } catch (error) {
    if (error instanceof SenaProjectSnapshotResourceLimitError) publicationDerivationBudgetError(error);
    throw new SenaEnterpriseError(
      "Publication export requires a structurally valid current canonical project snapshot.",
      409,
      "publication_export_model_card_blocked"
    );
  }
  assertPersistedModelCardSectionMembership(project);
  if (!reliabilityRun || !reliabilityReviewProjection) {
    throw new SenaEnterpriseError(
      "Publication export blocked until an approved, current, machine-eligible reliability run is available for this project revision.",
      409,
      "publication_export_model_card_blocked"
    );
  }
  assertEnterpriseReliabilityRunCurrentProject(reliabilityRun, project);
  const sourceSnapshot = project.snapshot;
  const model = buildSenaModel(sourceSnapshot.dataset, sourceSnapshot.reproducibility.buildOptions);
  return buildSenaProjectSnapshot(model, {
    title: sourceSnapshot.title,
    generatedAt: sourceSnapshot.generatedAt,
    sourceDataset: sourceSnapshot.source.sourceDataset ?? sourceSnapshot.dataset,
    activeTemporalWindow: sourceSnapshot.source.activeTemporalWindow,
    demoVerificationManualReviews: sourceSnapshot.workspaceState?.demoVerificationManualReviews,
    humanReview: sourceSnapshot.report.humanReview,
    codingReliability: reliabilityReviewProjection,
    evidenceLimit: Math.max(1, sourceSnapshot.report.evidenceSnippets.length),
    nullModelIterations: sourceSnapshot.report.validation.nullModels.permutation.iterations,
    dataGovernance: sourceSnapshot.dataGovernance ?? sourceSnapshot.report.dataGovernance
  });
}
