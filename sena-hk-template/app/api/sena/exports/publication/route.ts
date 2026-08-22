import { NextResponse } from "next/server";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { createHash } from "node:crypto";
import {
  getEnterpriseProjectAsync,
  type SenaEnterpriseProject
} from "@/lib/sena/enterprise/team-project";
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
import { requireEnterprisePermission } from "@/lib/sena/enterprise/access-control";
import {
  SenaEnterpriseError
} from "@/lib/sena/enterprise/errors";
import {
  assertServerJobPayloadAllowed,
  enqueueEnterpriseServerJob,
  serverJobHeaders,
  serverJobQueueStatus,
  shouldQueueServerJob
} from "@/lib/sena/enterprise/server-job-queue";
import { buildSenaPublicationExport, type SenaPublicationEnterpriseProjectEvidence, type SenaPublicationFormat } from "@/lib/sena/publication-export";
import { buildSenaModel } from "@/lib/sena/model";
import { buildSenaProjectSnapshot, importSenaProjectSnapshot } from "@/lib/sena/snapshot";
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

function snapshotWithReliabilityEvidence(
  project: SenaEnterpriseProject,
  reliabilityRun: SenaEnterpriseReliabilityRun
) {
  assertEnterpriseReliabilityRunCurrentProject(reliabilityRun, project);
  const sourceSnapshot = project.snapshot;
  const model = buildSenaModel(sourceSnapshot.dataset, sourceSnapshot.reproducibility.buildOptions);
  return buildSenaProjectSnapshot(model, {
    title: sourceSnapshot.title,
    generatedAt: sourceSnapshot.generatedAt,
    sourceDataset: sourceSnapshot.source.sourceDataset ?? sourceSnapshot.dataset,
    activeTemporalWindow: sourceSnapshot.source.activeTemporalWindow,
    temporalRuntimeTrace: sourceSnapshot.analysis.temporalRuntimeTrace,
    demoVerificationManualReviews: sourceSnapshot.workspaceState?.demoVerificationManualReviews,
    humanReview: sourceSnapshot.report.humanReview,
    codingReliability: reliabilityRun.reviewPatch,
    dataGovernance: sourceSnapshot.dataGovernance ?? sourceSnapshot.report.dataGovernance
  });
}

function publicationSnapshotForProject(
  project: SenaEnterpriseProject,
  reliabilityRun?: SenaEnterpriseReliabilityRun
) {
  if (project.snapshot.report.modelCard.renderGate.status === "ready") {
    return { snapshot: project.snapshot };
  }
  if (!reliabilityRun) return { snapshot: project.snapshot };
  return {
    snapshot: snapshotWithReliabilityEvidence(project, reliabilityRun),
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
    const projectId = requestBody.projectId ? String(requestBody.projectId) : "";
    if (shouldQueueServerJob(request, requestBody)) {
      const queue = serverJobQueueStatus();
      assertServerJobPayloadAllowed({
        projectId,
        hasInlinePayload: Boolean(requestBody.snapshot),
        queue
      });
      let teamId = String(requestBody.teamId || context.teams[0]?.id || "");
      let projectVersion: number | undefined;
      let source: "project" | "snapshot" = "snapshot";
      if (projectId) {
        const project = await getEnterpriseProjectAsync(context, projectId);
        teamId = project.teamId;
        projectVersion = project.currentVersion;
        source = "project";
      } else if (!requestBody.snapshot) {
        throw new SenaEnterpriseError("Provide projectId or snapshot for publication export.", 400, "publication_export_source_required");
      }
      requireEnterprisePermission(context, teamId, "export:create");
      const job = await enqueueEnterpriseServerJob({
        kind: "publication-export",
        teamId,
        projectId: projectId || undefined,
        actorUserId: context.user.id,
        payload: {
          action: "run-publication-export",
          teamId,
          projectId: projectId || undefined,
          projectVersion,
          format,
          inlineSnapshot: queue.inlinePayloadAllowed ? requestBody.snapshot : undefined
        },
        payloadSummary: {
          source,
          projectVersion,
          format,
          hasInlineSnapshot: Boolean(requestBody.snapshot),
          hasInlineDataset: false,
          payloadValuesExcluded: true
        },
        queue
      });
      await recordEnterpriseAuditAsync({
        event: "export.queue",
        userId: context.user.id,
        teamId,
        projectId: projectId || undefined,
        detail: {
          serverJobId: job.id,
          serverJobKind: job.kind,
          queueProvider: job.provider.mode,
          queueDelivery: job.delivery.webhookStatus,
          queueHttpStatus: job.delivery.httpStatus ?? null,
          queueProductionReady: job.provider.productionReady,
          payloadSha256: job.payloadSha256,
          source,
          format,
          inlinePayloadAllowed: job.provider.inlinePayloadAllowed,
          projectVersion: projectVersion ?? null
        }
      });
      return NextResponse.json(job, {
        status: 202,
        headers: serverJobHeaders(job)
      });
    }
    let snapshot: SenaProjectSnapshot;
    let teamId = String(requestBody.teamId || context.teams[0]?.id || "");
    let source = "snapshot";
    let projectVersion: number | undefined;
    let enterpriseProjectEvidence: SenaPublicationEnterpriseProjectEvidence | undefined;
    if (projectId) {
      const publicationState = await resolveEnterprisePublicationStateBundle(context, projectId);
      const { project, claimPackage, stateBinding } = publicationState;
      const publicationSource = publicationSnapshotForProject(project, publicationState.reliabilityRun);
      snapshot = publicationSource.snapshot;
      teamId = project.teamId;
      source = "project";
      projectVersion = project.currentVersion;
      const sourceSnapshotSha256 = sha256Json(snapshot);
      const reportSha256 = sha256Json(snapshot.report);
      enterpriseProjectEvidence = {
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
    } else if (requestBody.snapshot) {
      snapshot = importSenaProjectSnapshot(requestBody.snapshot);
    } else {
      throw new SenaEnterpriseError("Provide projectId or snapshot for publication export.", 400, "publication_export_source_required");
    }
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
