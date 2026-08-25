import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildEnterpriseReliabilityAdjudicationResponseWithPostgresMirrorAsync,
  buildEnterpriseReliabilityJsonRunResponseWithPostgresMirrorAsync,
  buildEnterpriseReliabilityRunListResponseAsync,
  buildEnterpriseReliabilityRunResponseWithPostgresMirrorAsync,
  buildEnterpriseReliabilityRunReviewResponseWithPostgresMirrorAsync,
  parseSenaReliabilityMutationBody,
  SENA_RELIABILITY_PATCH_REQUEST_BYTE_LIMIT
} from "@/lib/sena/enterprise/reliability-runs";
import {
  createEnterpriseUploadsWithPostgresMirrorAsync,
  reserveEnterpriseUploadIds
} from "@/lib/sena/enterprise/import-analysis";
import { senaReliabilityServerSourceByteLimit } from "@/lib/sena/enterprise/upload-limits";
import { readSenaReliabilityBoundedTransportRequest } from "@/lib/sena/enterprise/reliability-transport";
import {
  buildEnterpriseReliabilityJsonQueueUploads,
  readEnterpriseReliabilityUploadPointers
} from "@/lib/sena/enterprise/reliability-upload-reader";
import {
  requireEnterprisePermission
} from "@/lib/sena/enterprise/access-control";
import {
  getEnterpriseProjectReadOnlyAsync
} from "@/lib/sena/enterprise/team-project";
import {
  SenaEnterpriseError
} from "@/lib/sena/enterprise/errors";
import {
  recordEnterpriseAuditAsync
} from "@/lib/sena/enterprise/ops-audit";
import {
  enqueueEnterpriseServerJob,
  serverJobHeaders,
  serverJobQueueStatus,
  shouldQueueServerJob
} from "@/lib/sena/enterprise/server-job-queue";
import { readSenaReliabilityUploadFiles } from "@/lib/sena/enterprise/reliability-file-decoder";
import {
  assertSenaReliabilityJsonRequestWithinLimits,
  prepareSenaReliabilityJsonRequest
} from "@/lib/sena/reliability-api";
import {
  assertSenaReliabilityCombinedRawRowsWithinLimits,
  assertSenaReliabilitySingleSourceMode,
  assertSenaReliabilitySourceBytesWithinLimits,
  assertSenaReliabilitySourceCountWithinLimits,
  bindSenaReliabilityAnnotationsToProject,
  buildSenaReliabilityDashboard,
  normalizeSenaReliabilityUploadIds,
  parseCoderAnnotationsFromRows,
  preflightSenaReliabilityAnnotations,
  reliabilityDashboardToReview,
  SenaReliabilitySourceInputError,
  senaReliabilitySnapshotFingerprint
} from "@/lib/sena/reliability";
import {
  buildSenaReliabilityReviewerEnvelope,
  normalizeSenaReliabilityReviewer,
  SENA_RELIABILITY_REVIEWER_ENVELOPE_NAME,
  SENA_RELIABILITY_REVIEWER_ENVELOPE_PROFILE
} from "@/lib/sena/reliability-queue-reviewer";
import { observeSenaApiRoute, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

type BufferedReliabilityFile = {
  name: string;
  size: number;
  bytes: Buffer;
};

async function bufferReliabilityFiles(files: File[]): Promise<BufferedReliabilityFile[]> {
  const buffered: BufferedReliabilityFile[] = [];
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    buffered.push({
      name: file.name,
      size: bytes.byteLength,
      bytes
    });
    assertSenaReliabilitySourceBytesWithinLimits(
      buffered.map((entry) => entry.bytes.byteLength),
      "files",
      { sourceBytes: senaReliabilityServerSourceByteLimit() }
    );
  }
  assertSenaReliabilitySourceBytesWithinLimits(
    buffered.map((file) => file.bytes.byteLength),
    "files",
    { sourceBytes: senaReliabilityServerSourceByteLimit() }
  );
  return buffered;
}

function fileSummary(file: BufferedReliabilityFile) {
  return {
    name: file.name,
    size: file.size,
    sha256: createHash("sha256").update(file.bytes).digest("hex")
  };
}

function planQueuedReviewerEnvelope(
  context: Awaited<ReturnType<typeof requireApiSessionForMutation>>,
  reviewerValue: unknown,
  uploadId: string
) {
  const envelope = buildSenaReliabilityReviewerEnvelope(reviewerValue, context.user.name);
  return {
    uploadId,
    sha256: createHash("sha256").update(envelope.bytes).digest("hex"),
    file: {
      name: SENA_RELIABILITY_REVIEWER_ENVELOPE_NAME,
      contentType: "application/json",
      bytes: envelope.bytes,
      importProfile: SENA_RELIABILITY_REVIEWER_ENVELOPE_PROFILE,
      reservedId: uploadId
    }
  };
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-reliability" }, async () => {
    const context = await requireApiSession();
    const url = new URL(request.url);
    const response = await buildEnterpriseReliabilityRunListResponseAsync(context, {
      teamId: url.searchParams.get("teamId") || undefined,
      projectId: url.searchParams.get("projectId") || undefined
    });
    return NextResponse.json(response.body);
  });
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-reliability" }, async () => {
    const context = await requireApiSessionForMutation(request);
    const jsonRequest = (request.headers.get("content-type") || "").toLowerCase().includes("application/json");
    const boundedRequest = await readSenaReliabilityBoundedTransportRequest(request, {
      json: jsonRequest,
      sourceBytes: senaReliabilityServerSourceByteLimit()
    });
    if (jsonRequest) {
      const body = await boundedRequest.json() as Record<string, unknown>;
      const inlineSourceSupplied = ["files", "annotations", "rows", "data"]
        .some((key) => Object.prototype.hasOwnProperty.call(body, key));
      const uploadPointersSupplied = Object.prototype.hasOwnProperty.call(body, "uploadIds");
      assertSenaReliabilitySingleSourceMode({
        json: inlineSourceSupplied,
        uploadPointers: uploadPointersSupplied
      });
      // A registered pointer has no synchronous byte source to execute from;
      // treat the pointer shape itself as an explicit queue request rather than
      // silently ignoring it in the direct JSON builder.
      const queueRequest = uploadPointersSupplied || shouldQueueServerJob(boundedRequest, body);
      // Pointer-only queue requests are admitted against registered metadata
      // below. Every direct or inline JSON source uses the effective server cap
      // before the semantic preparer, even when deployment configuration is
      // stricter than the fixed reliability-file limit.
      if (!queueRequest || inlineSourceSupplied) {
        assertSenaReliabilityJsonRequestWithinLimits(body, {
          sourceBytes: senaReliabilityServerSourceByteLimit()
        });
      }
      if (queueRequest) {
        const uploadIdsFromRequest = normalizeSenaReliabilityUploadIds(body.uploadIds);
        // The shared JSON preparer preserves files > annotations > rows > data
        // semantic precedence while the admission pass above counts every
        // supplied alias. It also executes the complete dashboard work-budget
        // preflight before any project lookup or reliability-specific write.
        const preparedInline = inlineSourceSupplied
          ? prepareSenaReliabilityJsonRequest(body, { defaultReviewer: context.user.name })
          : undefined;
        const parsedInline = preparedInline ? {
          annotations: preparedInline.annotations,
          skippedCells: preparedInline.skippedCells
        } : undefined;
        const queue = serverJobQueueStatus();
        const queuedJsonUploads = preparedInline && queue.mode === "local"
          ? buildEnterpriseReliabilityJsonQueueUploads(body)
          : [];
        const managedInlineSourcePayload: Record<string, unknown> = {};
        if (preparedInline && queue.inlinePayloadAllowed) {
          for (const key of ["files", "annotations", "rows", "data"] as const) {
            if (Object.prototype.hasOwnProperty.call(body, key)) managedInlineSourcePayload[key] = body[key];
          }
          if (Object.prototype.hasOwnProperty.call(body, "sourceName")) {
            managedInlineSourcePayload.sourceName = body.sourceName;
          }
        }
        const projectId = body.projectId ? String(body.projectId) : undefined;
        const project = projectId ? await getEnterpriseProjectReadOnlyAsync(context, projectId) : null;
        const teamId = String(body.teamId || project?.teamId || context.teams[0]?.id || "");
        requireEnterprisePermission(context, teamId, "reliability:adjudicate");
        let uploadIds = uploadIdsFromRequest;
        const annotationCount = preparedInline?.annotationCount;
        const snapshotFingerprint = project ? senaReliabilitySnapshotFingerprint(project.snapshot) : undefined;
        if (parsedInline) {
          if (project) {
            try {
              bindSenaReliabilityAnnotationsToProject(parsedInline.annotations, {
                projectId: project.id,
                projectVersion: project.currentVersion,
                snapshot: project.snapshot,
                skippedCells: parsedInline.skippedCells
              });
            } catch {
              throw new SenaEnterpriseError(
                "Queued reliability annotations do not match the current project snapshot.",
                400,
                "reliability_project_binding_invalid"
              );
            }
          }
        }
        if (uploadIds.length > 0) {
          const pointerInput = await readEnterpriseReliabilityUploadPointers(context, { teamId, uploadIds });
          preflightSenaReliabilityAnnotations(pointerInput.parsed.annotations);
          if (project) {
            try {
              bindSenaReliabilityAnnotationsToProject(pointerInput.parsed.annotations, {
                projectId: project.id,
                projectVersion: project.currentVersion,
                snapshot: project.snapshot,
                skippedCells: pointerInput.parsed.skippedCells
              });
            } catch {
              throw new SenaEnterpriseError(
                "Queued reliability annotations do not match the current project snapshot.",
                400,
                "reliability_project_binding_invalid"
              );
            }
          }
        }
        // The local queue has no webhook body to deliver later. Store each
        // admitted logical JSON source through the encrypted upload registry,
        // preserving file/alias boundaries and raw skipped/invalid rows while
        // keeping only opaque pointers in the public job receipt.
        let queuedSourceFiles: Array<(typeof queuedJsonUploads)[number] & { reservedId: string }> = [];
        if (queue.mode === "local" && uploadIds.length === 0 && queuedJsonUploads.length > 0) {
          uploadIds = reserveEnterpriseUploadIds(queuedJsonUploads.length);
          queuedSourceFiles = queuedJsonUploads.map((file, index) => ({
            ...file,
            reservedId: uploadIds[index]
          }));
        }
        if (uploadIds.length === 0 && (!queue.inlinePayloadAllowed || !preparedInline)) {
          throw new SenaEnterpriseError(
            "Queued reliability jobs require uploadIds unless SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD=1 is explicitly configured.",
            400,
            "reliability_queue_source_required"
          );
        }
        const [reviewerEnvelopeUploadId] = reserveEnterpriseUploadIds(1);
        const reviewerEnvelope = planQueuedReviewerEnvelope(
          context,
          body.reviewer,
          reviewerEnvelopeUploadId
        );
        const canonicalPointerPayload = {
          action: "run-reliability",
          teamId,
          projectId,
          projectVersion: project?.currentVersion,
          snapshotFingerprint,
          uploadIds,
          reviewerEnvelopeUploadId: reviewerEnvelope.uploadId,
          reviewerEnvelopeSha256: reviewerEnvelope.sha256
        };
        const job = await enqueueEnterpriseServerJob({
          kind: "reliability",
          teamId,
          projectId,
          actorUserId: context.user.id,
          payload: queue.mode === "local" ? canonicalPointerPayload : {
            action: "run-reliability",
            teamId,
            projectId,
            projectVersion: project?.currentVersion,
            snapshotFingerprint,
            uploadIds,
            reviewerEnvelopeUploadId: reviewerEnvelope.uploadId,
            reviewerEnvelopeSha256: reviewerEnvelope.sha256,
            sourceName: body.sourceName ? String(body.sourceName) : undefined,
            requestSchemaVersion: body.schemaVersion ? String(body.schemaVersion) : undefined,
            ...managedInlineSourcePayload
          },
          payloadSummary: {
            source: uploadIds.length > 0 ? "upload" : "dataset",
            projectVersion: project?.currentVersion,
            snapshotFingerprint,
            uploadIds,
            reviewerEnvelopeUploadId: reviewerEnvelope.uploadId,
            reviewerEnvelopeSha256: reviewerEnvelope.sha256,
            annotationCount,
            fileCount: preparedInline?.fileCount ?? uploadIds.length,
            hasInlineSnapshot: false,
            hasInlineDataset: queue.mode === "local" ? false : Boolean(preparedInline),
            payloadValuesExcluded: true
          },
          queue,
          beforeDispatch: async () => {
            await createEnterpriseUploadsWithPostgresMirrorAsync(context, {
              teamId,
              files: [...queuedSourceFiles, reviewerEnvelope.file]
            });
          }
        });
        await recordEnterpriseAuditAsync({
          event: "reliability.queue",
          userId: context.user.id,
          teamId,
          projectId,
          detail: {
            serverJobId: job.id,
            serverJobKind: job.kind,
            queueProvider: job.provider.mode,
            queueDelivery: job.delivery.webhookStatus,
            queueHttpStatus: job.delivery.httpStatus ?? null,
            queueProductionReady: job.provider.productionReady,
            payloadSha256: job.payloadSha256,
            uploadCount: uploadIds.length,
            annotationCount: annotationCount ?? null,
            inlinePayloadAllowed: job.provider.inlinePayloadAllowed,
            projectVersion: project?.currentVersion ?? null
          }
        });
        return NextResponse.json(job, {
          status: 202,
          headers: serverJobHeaders(job)
        });
      }
      const response = await buildEnterpriseReliabilityJsonRunResponseWithPostgresMirrorAsync(context, body);
      return NextResponse.json(response.body, { headers: response.headers });
    }
    const form = await boundedRequest.formData();
    const suppliedFileValues = form.getAll("files");
    assertSenaReliabilitySourceCountWithinLimits(suppliedFileValues.length, "files");
    if (suppliedFileValues.some((value) => !(value instanceof File))) {
      throw new SenaReliabilitySourceInputError([{
        path: "files",
        rule: "file-value-required"
      }]);
    }
    const files = suppliedFileValues.filter((value): value is File => value instanceof File);
    // File.size is available before reading multipart bodies into application
    // buffers. Reject declared count and bytes before arrayBuffer(), then verify
    // the actual buffered byte counts again inside bufferReliabilityFiles.
    assertSenaReliabilitySourceBytesWithinLimits(
      files.map((file) => file.size),
      "files",
      { sourceBytes: senaReliabilityServerSourceByteLimit() }
    );
    const bufferedFiles = await bufferReliabilityFiles(files);
    if (shouldQueueServerJob(boundedRequest, { queue: ["1", "true", "yes", "on"].includes(String(form.get("queue") || "").toLowerCase()) })) {
      const projectId = form.get("projectId") ? String(form.get("projectId")) : undefined;
      const project = projectId ? await getEnterpriseProjectReadOnlyAsync(context, projectId) : null;
      const teamId = String(form.get("teamId") || project?.teamId || context.teams[0]?.id || "");
      requireEnterprisePermission(context, teamId, "reliability:adjudicate");
      const parsedForPreflight = await readSenaReliabilityUploadFiles(bufferedFiles);
      assertSenaReliabilityCombinedRawRowsWithinLimits(
        parsedForPreflight.map((file) => ({ length: file.rawRowCount }))
      );
      const preflightRows = parsedForPreflight.flatMap((file) => file.rows);
      const preflightAnnotations = parseCoderAnnotationsFromRows(preflightRows);
      preflightSenaReliabilityAnnotations(preflightAnnotations.annotations);
      const queue = serverJobQueueStatus();
      const uploadIds = reserveEnterpriseUploadIds(bufferedFiles.length);
      const snapshotFingerprint = project ? senaReliabilitySnapshotFingerprint(project.snapshot) : undefined;
      if (uploadIds.length === 0) {
        throw new SenaEnterpriseError(
          "Queued reliability jobs require at least one reliability file.",
          400,
          "reliability_queue_source_required"
        );
      }
      const [reviewerEnvelopeUploadId] = reserveEnterpriseUploadIds(1);
      const reviewerEnvelope = planQueuedReviewerEnvelope(
        context,
        form.get("reviewer"),
        reviewerEnvelopeUploadId
      );
      const canonicalPointerPayload = {
        action: "run-reliability",
        teamId,
        projectId,
        projectVersion: project?.currentVersion,
        snapshotFingerprint,
        uploadIds,
        reviewerEnvelopeUploadId: reviewerEnvelope.uploadId,
        reviewerEnvelopeSha256: reviewerEnvelope.sha256
      };
      const job = await enqueueEnterpriseServerJob({
        kind: "reliability",
        teamId,
        projectId,
        actorUserId: context.user.id,
        payload: queue.mode === "local" ? canonicalPointerPayload : {
          action: "run-reliability",
          teamId,
          projectId,
          projectVersion: project?.currentVersion,
          snapshotFingerprint,
          uploadIds,
          reviewerEnvelopeUploadId: reviewerEnvelope.uploadId,
          reviewerEnvelopeSha256: reviewerEnvelope.sha256
        },
        payloadSummary: {
          source: "upload",
          projectVersion: project?.currentVersion,
          snapshotFingerprint,
          uploadIds,
          reviewerEnvelopeUploadId: reviewerEnvelope.uploadId,
          reviewerEnvelopeSha256: reviewerEnvelope.sha256,
          fileCount: bufferedFiles.length,
          hasInlineSnapshot: false,
          hasInlineDataset: false,
          payloadValuesExcluded: true
        },
        queue,
        beforeDispatch: async () => {
          await createEnterpriseUploadsWithPostgresMirrorAsync(context, {
            teamId,
            files: [
              ...bufferedFiles.map((file, index) => ({
                name: file.name,
                contentType: "application/octet-stream",
                bytes: file.bytes,
                // No warningCount at enqueue: neither the local nor external worker
                // has parsed the file yet, so the registry must not assert a clean
                // parse before the eventual worker reports it.
                importProfile: "reliability",
                reservedId: uploadIds[index]
              })),
              reviewerEnvelope.file
            ]
          });
        }
      });
      await recordEnterpriseAuditAsync({
        event: "reliability.queue",
        userId: context.user.id,
        teamId,
        projectId,
        detail: {
          serverJobId: job.id,
          serverJobKind: job.kind,
          queueProvider: job.provider.mode,
          queueDelivery: job.delivery.webhookStatus,
          queueHttpStatus: job.delivery.httpStatus ?? null,
          queueProductionReady: job.provider.productionReady,
          payloadSha256: job.payloadSha256,
          uploadCount: bufferedFiles.length,
          inlinePayloadAllowed: job.provider.inlinePayloadAllowed,
          projectVersion: project?.currentVersion ?? null
        }
      });
      return NextResponse.json(job, {
        status: 202,
        headers: serverJobHeaders(job)
      });
    }
    const parsedFiles = await readSenaReliabilityUploadFiles(bufferedFiles);
    assertSenaReliabilityCombinedRawRowsWithinLimits(
      parsedFiles.map((file) => ({ length: file.rawRowCount }))
    );
    const rows = parsedFiles.flatMap((file) => file.rows);
    const fileWarnings = parsedFiles.flatMap((file) => file.warnings);
    const parsed = parseCoderAnnotationsFromRows(rows);
    const dashboard = buildSenaReliabilityDashboard(parsed.annotations, { skippedCells: parsed.skippedCells });
    const dashboardWithWarnings = {
      ...dashboard,
      warnings: [...fileWarnings, ...parsed.warnings, ...dashboard.warnings]
    };
    const reviewer = normalizeSenaReliabilityReviewer(form.get("reviewer"), context.user.name);
    const reviewPatch = reliabilityDashboardToReview(dashboardWithWarnings, reviewer);
    const teamId = String(form.get("teamId") || context.teams[0]?.id || "");
    const projectId = form.get("projectId") ? String(form.get("projectId")) : undefined;
    const response = await buildEnterpriseReliabilityRunResponseWithPostgresMirrorAsync(context, {
      teamId,
      projectId,
      reviewer,
      fileCount: bufferedFiles.length,
      annotationCount: parsed.annotations.length,
      annotations: parsed.annotations,
      skippedCells: parsed.skippedCells,
      inputFiles: bufferedFiles.map(fileSummary),
      dashboard: dashboardWithWarnings,
      reviewPatch
    });
    return NextResponse.json(response.body, { headers: response.headers });
  });
}

export async function PATCH(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-reliability" }, async () => {
    const boundedRequest = await readSenaReliabilityBoundedTransportRequest(request, {
      json: true,
      maximum: SENA_RELIABILITY_PATCH_REQUEST_BYTE_LIMIT
    });
    const body = parseSenaReliabilityMutationBody(
      boundedRequest.body ? await boundedRequest.json() : null
    );
    const context = await requireApiSessionForMutation(boundedRequest);
    const action = String(body.action ?? "review");
    if (action === "adjudicate") {
      const response = await buildEnterpriseReliabilityAdjudicationResponseWithPostgresMirrorAsync(context, body);
      return NextResponse.json(response.body, {
        status: response.status,
        headers: response.headers
      });
    }
    const response = await buildEnterpriseReliabilityRunReviewResponseWithPostgresMirrorAsync(context, body);
    return NextResponse.json(response.body, { headers: response.headers });
  });
}
