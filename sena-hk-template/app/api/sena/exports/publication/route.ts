import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { createHash } from "node:crypto";
import { type SenaEnterpriseProject } from "@/lib/sena/enterprise/team-project";
import {
  type SenaEnterpriseReliabilityRun
} from "@/lib/sena/enterprise/reliability-runs";
import { assertEnterpriseReliabilityRunCurrentProject } from "@/lib/sena/enterprise/reliability-integrity";
import {
  resolveEnterprisePublicationStateBundle
} from "@/lib/sena/enterprise/publication-state-binding";
import {
  recordEnterpriseAuditAsync
} from "@/lib/sena/enterprise/ops-audit";
import {
  SenaEnterpriseError
} from "@/lib/sena/enterprise/errors";
import {
  shouldQueueServerJob
} from "@/lib/sena/enterprise/server-job-queue";
import {
  assertSenaPublicationModelCardReady,
  buildSenaPublicationExport,
  type SenaPublicationEnterpriseProjectEvidence,
  type SenaPublicationFormat
} from "@/lib/sena/publication-export";
import { buildSenaModel } from "@/lib/sena/model";
import { inspectSenaModelCardSections } from "@/lib/sena/model-card";
import {
  assertSenaEnterprisePublicationRequestDerivationWorkBudget,
  assertSenaProjectSnapshotPublicationSourceContract,
  buildSenaProjectSnapshot,
  SenaProjectSnapshotResourceLimitError
} from "@/lib/sena/snapshot";
import type { SenaProjectSnapshot } from "@/lib/sena/types";
import { observeSenaApiRoute, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

const formats = new Set<SenaPublicationFormat>(["html", "svg", "png", "xlsx", "docx", "pdf", "package"]);

function bodyBuffer(body: string | Buffer) {
  return typeof body === "string" ? Buffer.from(body, "utf8") : body;
}

function sha256Buffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertPersistedModelCardSectionMembership(snapshot: SenaProjectSnapshot) {
  const sections = snapshot.report?.modelCard?.sections;
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

function snapshotWithReliabilityEvidence(
  project: SenaEnterpriseProject,
  reliabilityRun: SenaEnterpriseReliabilityRun,
  reliabilityReviewProjection: SenaEnterpriseReliabilityRun["reviewPatch"]
) {
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

async function resolvePublicationStateBeforeDerivation(
  context: Awaited<ReturnType<typeof requireApiSessionForMutation>>,
  projectId: string
) {
  return resolveEnterprisePublicationStateBundle(context, projectId, {
    beforeNormalize: ({ targetSnapshot, stateNormalizationSnapshots }) => {
      try {
        assertSenaEnterprisePublicationRequestDerivationWorkBudget(
          targetSnapshot,
          stateNormalizationSnapshots
        );
      } catch (error) {
        publicationDerivationBudgetError(error);
      }
    }
  });
}

function publicationSnapshotForProject(
  project: SenaEnterpriseProject,
  reliabilityRun?: SenaEnterpriseReliabilityRun,
  reliabilityReviewProjection?: SenaEnterpriseReliabilityRun["reviewPatch"]
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
    if (error instanceof SenaProjectSnapshotResourceLimitError) {
      publicationDerivationBudgetError(error);
    }
    throw new SenaEnterpriseError(
      "Publication export requires a structurally valid current canonical project snapshot.",
      409,
      "publication_export_model_card_blocked"
    );
  }
  // The enterprise reliability projection is allowed to refresh the
  // coding-reliability section, but it must never reconstruct missing or
  // duplicate persisted section membership into an apparently valid card.
  assertPersistedModelCardSectionMembership(project.snapshot);
  if (!reliabilityRun || !reliabilityReviewProjection) {
    throw new SenaEnterpriseError(
      "Publication export blocked until an approved, current, machine-eligible reliability run is available for this project revision.",
      409,
      "publication_export_model_card_blocked"
    );
  }
  return {
    snapshot: snapshotWithReliabilityEvidence(project, reliabilityRun, reliabilityReviewProjection),
    reliabilityRun
  };
}

function publicationPackageHeaders(format: SenaPublicationFormat, body: string | Buffer) {
  if (format !== "package" || typeof body !== "string") return {};
  try {
    const parsed = JSON.parse(body) as {
      manifest?: {
        packageSha256?: string;
        artifactCount?: number;
        formats?: string[];
        reportSha256?: string;
      };
      verificationCertificate?: { status?: string };
    };
    return {
      ...(parsed.manifest?.packageSha256 ? { "x-sena-publication-package-sha256": parsed.manifest.packageSha256 } : {}),
      ...(parsed.manifest?.artifactCount !== undefined ? { "x-sena-publication-artifact-count": String(parsed.manifest.artifactCount) } : {}),
      ...(parsed.manifest?.formats?.length ? { "x-sena-publication-formats": parsed.manifest.formats.join(",") } : {}),
      ...(parsed.manifest?.reportSha256 ? { "x-sena-report-sha256": parsed.manifest.reportSha256 } : {}),
      ...(parsed.verificationCertificate?.status ? { "x-sena-publication-verification-status": parsed.verificationCertificate.status } : {})
    };
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-publication-export" }, async () => {
    const context = await requireApiSessionForMutation(request);
    const requestBody = await request.json();
    const format = formats.has(requestBody.format) ? requestBody.format : "html";
    const projectId = requestBody.projectId ? String(requestBody.projectId).trim() : "";
    if (!projectId) {
      throw new SenaEnterpriseError(
        "Enterprise publication export requires a persisted projectId; inline snapshots cannot establish approved, current reliability and atomic state-revision evidence.",
        400,
        "publication_export_project_required"
      );
    }
    if (Object.prototype.hasOwnProperty.call(requestBody, "snapshot")) {
      throw new SenaEnterpriseError(
        "Inline snapshots are not accepted by the enterprise publication route; export the persisted project by projectId.",
        400,
        "publication_export_inline_snapshot_forbidden"
      );
    }
    if (shouldQueueServerJob(request, requestBody)) {
      const publicationState = await resolvePublicationStateBeforeDerivation(context, projectId);
      const queuedPublication = publicationSnapshotForProject(
        publicationState.project,
        publicationState.reliabilityRun,
        publicationState.reliabilityReviewProjection
      );
      assertSenaPublicationModelCardReady(queuedPublication.snapshot.report);
      throw new SenaEnterpriseError(
        "Queued publication export is unavailable until an evidence-bound publication worker can revalidate the complete state, reliability, adjudication, and derivation lease before producing artifacts.",
        503,
        "publication_export_async_worker_unavailable"
      );
    }
    const publicationState = await resolvePublicationStateBeforeDerivation(context, projectId);
    const { project, claimPackage, stateBinding } = publicationState;
    const publicationSource = publicationSnapshotForProject(
      project,
      publicationState.reliabilityRun,
      publicationState.reliabilityReviewProjection
    );
    const snapshot: SenaProjectSnapshot = publicationSource.snapshot;
    const teamId = project.teamId;
    const source = "project";
    const projectVersion = project.currentVersion;
    const sourceSnapshotSha256 = sha256Json(snapshot);
    const reportSha256 = sha256Json(snapshot.report);
    const enterpriseProjectEvidence: SenaPublicationEnterpriseProjectEvidence = {
        schemaVersion: SENA_SCHEMA_VERSIONS.publicationEnterpriseProjectEvidence,
        projectId: project.id,
        teamId: project.teamId,
        currentVersion: project.currentVersion,
        title: project.title,
        activeWindowLabel: project.activeWindowLabel,
        claimUse: project.claimUse,
        sourceSnapshotSha256,
        reportSha256,
        stateBinding,
        ...(publicationSource.reliabilityRun ? {
          publicationDerivation: {
            kind: "current-project-reliability-run",
            reliabilityRunId: publicationSource.reliabilityRun.id,
            reliabilityRunSha256: sha256Json(publicationSource.reliabilityRun),
            reliabilityDashboardSchemaVersion: publicationSource.reliabilityRun.dashboard.schemaVersion,
            projectVersion: publicationSource.reliabilityRun.projectBinding?.projectVersion ?? project.currentVersion,
            persistedSourceSnapshotSha256: stateBinding.project.persistedSnapshotSha256,
            readProjectionSourceSnapshotSha256: stateBinding.project.readProjectionSnapshotSha256,
            derivedPublicationSnapshotSha256: sourceSnapshotSha256
          }
        } : {}),
        claimPackage: {
          schemaVersion: claimPackage.schemaVersion,
          status: claimPackage.status,
          blockers: claimPackage.summary.blockers,
          warnings: claimPackage.summary.warnings,
          sourceSnapshotSha256: claimPackage.sourceSnapshotEvidence.snapshotSha256,
          persistedSourceSnapshotSha256: stateBinding.project.persistedSnapshotSha256,
          sha256: stateBinding.claimPackage.sha256
        }
      };
    const result = await buildSenaPublicationExport(snapshot, format, enterpriseProjectEvidence);
    await recordEnterpriseAuditAsync({
      event: "export.run",
      userId: context.user.id,
      teamId,
      projectId: projectId || undefined,
      detail: {
        source,
        format,
        title: snapshot.title,
        projectVersion: projectVersion ?? null,
        sourceSnapshotSha256: enterpriseProjectEvidence?.sourceSnapshotSha256 ?? null,
        persistedSourceSnapshotSha256: enterpriseProjectEvidence?.stateBinding.project.persistedSnapshotSha256 ?? null,
        readProjectionSourceSnapshotSha256: enterpriseProjectEvidence?.stateBinding.project.readProjectionSnapshotSha256 ?? null,
        reliabilityRunId: enterpriseProjectEvidence?.publicationDerivation?.reliabilityRunId ?? null,
        claimPackageStatus: enterpriseProjectEvidence?.claimPackage.status ?? null,
        publicationStateRevisionSha256: enterpriseProjectEvidence?.stateBinding.stateRevisionSha256 ?? null,
        publicationStateBindingSha256: enterpriseProjectEvidence?.stateBinding.bindingSha256 ?? null,
        publicationDerivationManifestSha256: result.derivationManifest.manifestSha256
      }
    });
    const exportBuffer = bodyBuffer(result.body);
    const responseBody = typeof result.body === "string" ? result.body : new Uint8Array(result.body);
    const packageHeaders = publicationPackageHeaders(format, result.body);
    return new Response(responseBody, {
      headers: {
        "content-type": result.contentType,
        "content-disposition": `attachment; filename="${result.filename}"`,
        "x-sena-export-source": source,
        "x-sena-export-format": format,
        "x-sena-export-filename": result.filename,
        "x-sena-export-bytes": String(exportBuffer.byteLength),
        "x-sena-export-sha256": sha256Buffer(exportBuffer),
        "x-sena-publication-derivation-manifest-sha256": result.derivationManifest.manifestSha256,
        ...(projectId ? { "x-sena-project-id": projectId } : {}),
        ...(projectVersion ? { "x-sena-project-version": String(projectVersion) } : {}),
        ...(enterpriseProjectEvidence?.sourceSnapshotSha256 ? { "x-sena-source-snapshot-sha256": enterpriseProjectEvidence.sourceSnapshotSha256 } : {}),
        ...(enterpriseProjectEvidence?.stateBinding.project.persistedSnapshotSha256
          ? { "x-sena-persisted-source-snapshot-sha256": enterpriseProjectEvidence.stateBinding.project.persistedSnapshotSha256 }
          : {}),
        ...(enterpriseProjectEvidence?.stateBinding.project.readProjectionSnapshotSha256
          ? { "x-sena-read-projection-source-snapshot-sha256": enterpriseProjectEvidence.stateBinding.project.readProjectionSnapshotSha256 }
          : {}),
        ...(enterpriseProjectEvidence?.publicationDerivation?.reliabilityRunId
          ? { "x-sena-publication-reliability-run-id": enterpriseProjectEvidence.publicationDerivation.reliabilityRunId }
          : {}),
        ...(enterpriseProjectEvidence?.reportSha256 ? { "x-sena-report-sha256": enterpriseProjectEvidence.reportSha256 } : {}),
        ...(enterpriseProjectEvidence?.claimPackage.status ? { "x-sena-claim-package-status": enterpriseProjectEvidence.claimPackage.status } : {}),
        ...(enterpriseProjectEvidence?.stateBinding.stateRevisionSha256
          ? { "x-sena-publication-state-revision-sha256": enterpriseProjectEvidence.stateBinding.stateRevisionSha256 }
          : {}),
        ...(enterpriseProjectEvidence?.stateBinding.bindingSha256
          ? { "x-sena-publication-state-binding-sha256": enterpriseProjectEvidence.stateBinding.bindingSha256 }
          : {}),
        ...packageHeaders
      }
    });
  });
}
