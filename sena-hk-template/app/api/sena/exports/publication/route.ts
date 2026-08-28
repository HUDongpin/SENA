import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  resolveEnterprisePublicationStateBundle
} from "@/lib/sena/enterprise/publication-state-binding";
import { senaPublicationCommandAuthorizationDigest } from "@/lib/sena/enterprise/publication-command-binding";
import {
  recordEnterpriseAuditAsync
} from "@/lib/sena/enterprise/ops-audit";
import {
  SenaEnterpriseError
} from "@/lib/sena/enterprise/errors";
import {
  enqueueEnterpriseServerJob,
  serverJobHeaders,
  serverJobQueueStatus,
  stableServerJobPayloadSha256,
  shouldQueueServerJob
} from "@/lib/sena/enterprise/server-job-queue";
import {
  createEnterpriseServerJobCommandEnvelopeWithPostgresMirrorAsync,
  reserveEnterpriseUploadIds
} from "@/lib/sena/enterprise/import-analysis";
import {
  planSenaServerJobCommandCustody,
  SENA_SERVER_JOB_COMMAND_CUSTODY
} from "@/lib/sena/server-job-command-envelope";
import {
  assertSenaPublicationModelCardReady,
  buildSenaPublicationExport,
  type SenaPublicationEnterpriseProjectEvidence,
  type SenaPublicationFormat
} from "@/lib/sena/publication-export";
import {
  assertSenaEnterprisePublicationRequestDerivationWorkBudget,
  SenaProjectSnapshotResourceLimitError
} from "@/lib/sena/snapshot";
import type { SenaProjectSnapshot } from "@/lib/sena/types";
import { assertSenaServerJobWorkerExecutable } from "@/lib/sena/enterprise/server-job-worker-capabilities";
import { observeSenaApiRoute, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

const formats = new Set<SenaPublicationFormat>(["html", "svg", "png", "xlsx", "docx", "pdf", "package"]);
const SENA_PUBLICATION_EXPORT_REQUEST_MAX_BYTES = 64 * 1024;
const SENA_PUBLICATION_EXPORT_REQUEST_MAX_CHUNKS = 1_024;

function publicationRequestInvalid(): never {
  throw new SenaEnterpriseError(
    "Publication export request must be a JSON object.",
    400,
    "publication_export_request_invalid"
  );
}

function publicationRequestContentTypeInvalid(): never {
  throw new SenaEnterpriseError(
    "Publication export request media type must be application/json.",
    400,
    "publication_export_content_type_invalid"
  );
}

function publicationFormatInvalid(): never {
  throw new SenaEnterpriseError(
    "Publication export format must be one of html, svg, png, xlsx, docx, pdf, or package.",
    400,
    "publication_export_format_invalid"
  );
}

function assertPublicationRequestContentType(request: Request) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") publicationRequestContentTypeInvalid();
}

function publicationRequestTooLarge(): never {
  throw new SenaEnterpriseError(
    `Publication export request exceeds the ${SENA_PUBLICATION_EXPORT_REQUEST_MAX_BYTES}-byte limit.`,
    413,
    "publication_export_request_too_large"
  );
}

function publicationRequestTooFragmented(): never {
  throw new SenaEnterpriseError(
    "Publication export request uses too many streamed chunks.",
    413,
    "publication_export_request_too_fragmented"
  );
}

async function cancelPublicationRequestReader(
  reader: ReadableStreamDefaultReader<Uint8Array>
) {
  try {
    await reader.cancel();
  } catch {
    // Admission errors are stable even when an untrusted stream rejects cancel.
  }
}

async function readBoundedPublicationRequest(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = request.headers.get("content-length")?.trim();
  if (declaredLength) {
    if (!/^\d+$/.test(declaredLength)) publicationRequestInvalid();
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) ||
      parsedLength > SENA_PUBLICATION_EXPORT_REQUEST_MAX_BYTES) {
      publicationRequestTooLarge();
    }
  }
  if (!request.body) publicationRequestInvalid();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let chunkCount = 0;
  while (true) {
    let read: ReadableStreamReadResult<Uint8Array>;
    try {
      read = await reader.read();
    } catch {
      await cancelPublicationRequestReader(reader);
      publicationRequestInvalid();
    }
    const { done, value } = read;
    if (done) break;
    chunkCount += 1;
    if (chunkCount > SENA_PUBLICATION_EXPORT_REQUEST_MAX_CHUNKS) {
      await cancelPublicationRequestReader(reader);
      publicationRequestTooFragmented();
    }
    const chunk = value ?? new Uint8Array();
    if (chunk.byteLength > SENA_PUBLICATION_EXPORT_REQUEST_MAX_BYTES - bytes) {
      await cancelPublicationRequestReader(reader);
      publicationRequestTooLarge();
    }
    bytes += chunk.byteLength;
    if (chunk.byteLength > 0) chunks.push(chunk);
  }

  const bodyBytes = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let parsed: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);
    parsed = JSON.parse(text);
  } catch {
    publicationRequestInvalid();
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    publicationRequestInvalid();
  }
  return parsed as Record<string, unknown>;
}

function bodyBuffer(body: string | Buffer) {
  return typeof body === "string" ? Buffer.from(body, "utf8") : body;
}

function sha256Buffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
    beforeNormalize: ({ targetSnapshot }) => {
      try {
        assertSenaEnterprisePublicationRequestDerivationWorkBudget(targetSnapshot);
      } catch (error) {
        publicationDerivationBudgetError(error);
      }
    }
  });
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
    assertPublicationRequestContentType(request);
    const requestBody = await readBoundedPublicationRequest(request);
    const hasExplicitFormat = Object.prototype.hasOwnProperty.call(requestBody, "format");
    if (hasExplicitFormat && (
      typeof requestBody.format !== "string" ||
      !formats.has(requestBody.format as SenaPublicationFormat)
    )) {
      publicationFormatInvalid();
    }
    const format: SenaPublicationFormat = hasExplicitFormat
      ? requestBody.format as SenaPublicationFormat
      : "html";
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
      assertSenaServerJobWorkerExecutable("publication-export");
      const publicationState = await resolvePublicationStateBeforeDerivation(context, projectId);
      assertSenaPublicationModelCardReady(publicationState.publicationSnapshot.report);
      const queue = serverJobQueueStatus();
      const sourceSnapshotSha256 = sha256Json(publicationState.publicationSnapshot);
      const workerPayload = {
        action: "run-publication-export",
        commandCustody: SENA_SERVER_JOB_COMMAND_CUSTODY,
        teamId: publicationState.project.teamId,
        projectId: publicationState.project.id,
        projectVersion: publicationState.project.currentVersion,
        format,
        sourceSnapshotSha256,
        authorizationEvidenceSha256: senaPublicationCommandAuthorizationDigest(publicationState.stateBinding)
      };
      const queueInput = {
        kind: "publication-export" as const,
        teamId: publicationState.project.teamId,
        projectId: publicationState.project.id,
        actorUserId: context.user.id,
        payload: workerPayload,
        payloadSummary: {
          source: "project" as const,
          projectVersion: publicationState.project.currentVersion,
          projectTeamId: publicationState.project.teamId,
          format,
          hasInlineSnapshot: false,
          hasInlineDataset: false,
          payloadValuesExcluded: true as const
        }
      };
      const [commandEnvelopeUploadId] = reserveEnterpriseUploadIds(1);
      const commandCustody = planSenaServerJobCommandCustody(
        queueInput,
        commandEnvelopeUploadId,
        stableServerJobPayloadSha256(workerPayload)
      );
      const job = await enqueueEnterpriseServerJob({
        ...commandCustody.jobInput,
        queue,
        beforeDispatch: async () => {
          await createEnterpriseServerJobCommandEnvelopeWithPostgresMirrorAsync(context, {
            teamId: publicationState.project.teamId,
            files: [commandCustody.file],
            requiredPermission: "export:create"
          });
        }
      });
      await recordEnterpriseAuditAsync({
        event: "export.queue",
        userId: context.user.id,
        teamId: publicationState.project.teamId,
        projectId: publicationState.project.id,
        detail: {
          serverJobId: job.id,
          serverJobKind: job.kind,
          queueProvider: job.provider.mode,
          queueDelivery: job.delivery.webhookStatus,
          queueHttpStatus: job.delivery.httpStatus ?? null,
          payloadSha256: job.payloadSha256,
          projectVersion: publicationState.project.currentVersion,
          format,
          stateBindingSha256: publicationState.stateBinding.bindingSha256,
          sourceSnapshotSha256
        }
      });
      return NextResponse.json(job, {
        status: 202,
        headers: serverJobHeaders(job)
      });
    }
    const publicationState = await resolvePublicationStateBeforeDerivation(context, projectId);
    const { project, claimPackage, stateBinding } = publicationState;
    const snapshot: SenaProjectSnapshot = publicationState.publicationSnapshot;
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
        ...(publicationState.reliabilityRun ? {
          publicationDerivation: {
            kind: "current-project-reliability-run",
            reliabilityRunId: publicationState.reliabilityRun.id,
            reliabilityRunSha256: sha256Json(publicationState.reliabilityRun),
            reliabilityDashboardSchemaVersion: publicationState.reliabilityRun.dashboard.schemaVersion,
            projectVersion: publicationState.reliabilityRun.projectBinding?.projectVersion ?? project.currentVersion,
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
          claimReadinessKind: claimPackage.claimReadinessEvidence.kind,
          claimReadinessSnapshotSha256: claimPackage.claimReadinessEvidence.snapshotSha256,
          sha256: stateBinding.claimPackage.sha256,
          payload: structuredClone(claimPackage)
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
        "x-sena-claim-package-sha256": stateBinding.claimPackage.sha256,
        "x-sena-validation-run-id": stateBinding.validationRun.runId,
        "x-sena-validation-evidence-sha256": stateBinding.validationRun.validationRunEvidenceHash,
        "x-sena-expert-review-id": stateBinding.expertReview.reviewId,
        "x-sena-expert-receipt-sha256": stateBinding.expertReview.receiptSha256,
        "x-sena-expert-receipt-key-id": stateBinding.expertReview.receipt.keyId,
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
