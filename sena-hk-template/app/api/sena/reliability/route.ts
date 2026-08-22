import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildEnterpriseReliabilityAdjudicationResponseWithPostgresMirrorAsync,
  buildEnterpriseReliabilityJsonRunResponseWithPostgresMirrorAsync,
  buildEnterpriseReliabilityRunListResponseAsync,
  buildEnterpriseReliabilityRunResponseWithPostgresMirrorAsync,
  buildEnterpriseReliabilityRunReviewResponseWithPostgresMirrorAsync
} from "@/lib/sena/enterprise/reliability-runs";
import {
  createEnterpriseUploadsWithPostgresMirrorAsync
} from "@/lib/sena/enterprise/import-analysis";
import { readEnterpriseReliabilityUploadPointers } from "@/lib/sena/enterprise/reliability-upload-reader";
import {
  requireEnterprisePermission
} from "@/lib/sena/enterprise/access-control";
import {
  getEnterpriseProjectAsync
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
import { readSenaReliabilityUploadRows } from "@/lib/sena/import-adapters";
import { assertSenaReliabilityJsonRequestWithinLimits } from "@/lib/sena/reliability-api";
import {
  assertSenaReliabilityCombinedRawRowsWithinLimits,
  assertSenaReliabilitySourceBytesWithinLimits,
  assertSenaReliabilitySourceCountWithinLimits,
  bindSenaReliabilityAnnotationsToProject,
  buildSenaReliabilityDashboard,
  parseCoderAnnotationsFromRows,
  preflightSenaReliabilityAnnotations,
  reliabilityDashboardToReview,
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
  const buffered = await Promise.all(files.map(async (file) => {
    const bytes = Buffer.from(await file.arrayBuffer());
    return {
      name: file.name,
      size: bytes.byteLength,
      bytes
    };
  }));
  assertSenaReliabilitySourceBytesWithinLimits(buffered.map((file) => file.bytes.byteLength), "files");
  return buffered;
}

function fileSummary(file: BufferedReliabilityFile) {
  return {
    name: file.name,
    size: file.size,
    sha256: createHash("sha256").update(file.bytes).digest("hex")
  };
}

async function createQueuedReviewerEnvelope(
  context: Awaited<ReturnType<typeof requireApiSessionForMutation>>,
  teamId: string,
  reviewerValue: unknown
) {
  const envelope = buildSenaReliabilityReviewerEnvelope(reviewerValue, context.user.name);
  const [upload] = await createEnterpriseUploadsWithPostgresMirrorAsync(context, {
    teamId,
    files: [{
      name: SENA_RELIABILITY_REVIEWER_ENVELOPE_NAME,
      contentType: "application/json",
      bytes: envelope.bytes,
      importProfile: SENA_RELIABILITY_REVIEWER_ENVELOPE_PROFILE
    }]
  });
  return {
    uploadId: upload.id,
    sha256: upload.sha256
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
    if ((request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
      const body = await request.json() as Record<string, unknown>;
      if (shouldQueueServerJob(request, body)) {
        assertSenaReliabilityJsonRequestWithinLimits(body);
        const projectId = body.projectId ? String(body.projectId) : undefined;
        const project = projectId ? await getEnterpriseProjectAsync(context, projectId) : null;
        const teamId = String(body.teamId || project?.teamId || context.teams[0]?.id || "");
        requireEnterprisePermission(context, teamId, "reliability:adjudicate");
        const queue = serverJobQueueStatus();
        const rawUploadIds = Array.isArray(body.uploadIds) ? body.uploadIds : [];
        assertSenaReliabilitySourceCountWithinLimits(rawUploadIds.length, "uploadIds");
        let uploadIds = rawUploadIds.map((value) => String(value)).filter(Boolean);
        const annotationCount = Array.isArray(body.annotations) ? body.annotations.length : undefined;
        const snapshotFingerprint = project ? senaReliabilitySnapshotFingerprint(project.snapshot) : undefined;
        if (Array.isArray(body.annotations)) {
          const parsedInline = parseCoderAnnotationsFromRows(body.annotations as Record<string, unknown>[]);
          preflightSenaReliabilityAnnotations(parsedInline.annotations);
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
        // The local queue has no webhook body to deliver later. Store JSON
        // annotations through the existing encrypted upload registry and keep
        // only the opaque pointer in the job receipt, so its polling worker can
        // reproduce the exact payload hash without persisting coder values.
        if (queue.mode === "local" && uploadIds.length === 0 && Array.isArray(body.annotations)) {
          const uploads = await createEnterpriseUploadsWithPostgresMirrorAsync(context, {
            teamId,
            files: [{
              name: "queued-reliability-annotations.json",
              contentType: "application/json",
              bytes: Buffer.from(JSON.stringify(body.annotations), "utf8"),
              importProfile: "reliability"
            }]
          });
          uploadIds = uploads.map((upload) => upload.id);
        }
        if (uploadIds.length === 0 && (!queue.inlinePayloadAllowed || !Array.isArray(body.annotations))) {
          throw new SenaEnterpriseError(
            "Queued reliability jobs require uploadIds unless SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD=1 is explicitly configured.",
            400,
            "reliability_queue_source_required"
          );
        }
        const reviewerEnvelope = await createQueuedReviewerEnvelope(context, teamId, body.reviewer);
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
            inlineAnnotations: queue.inlinePayloadAllowed ? body.annotations : undefined
          },
          payloadSummary: {
            source: uploadIds.length > 0 ? "upload" : "dataset",
            projectVersion: project?.currentVersion,
            snapshotFingerprint,
            uploadIds,
            reviewerEnvelopeUploadId: reviewerEnvelope.uploadId,
            reviewerEnvelopeSha256: reviewerEnvelope.sha256,
            annotationCount,
            fileCount: uploadIds.length || (body.sourceName ? 1 : undefined),
            hasInlineSnapshot: false,
            hasInlineDataset: queue.mode === "local" ? false : Array.isArray(body.annotations),
            payloadValuesExcluded: true
          },
          queue
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
    const form = await request.formData();
    const suppliedFileValues = form.getAll("files");
    assertSenaReliabilitySourceCountWithinLimits(suppliedFileValues.length, "files");
    const files = suppliedFileValues.filter((value): value is File => value instanceof File);
    // File.size is available before reading multipart bodies into application
    // buffers. Reject declared count and bytes before arrayBuffer(), then verify
    // the actual buffered byte counts again inside bufferReliabilityFiles.
    assertSenaReliabilitySourceBytesWithinLimits(files.map((file) => file.size), "files");
    const bufferedFiles = await bufferReliabilityFiles(files);
    if (shouldQueueServerJob(request, { queue: ["1", "true", "yes", "on"].includes(String(form.get("queue") || "").toLowerCase()) })) {
      const projectId = form.get("projectId") ? String(form.get("projectId")) : undefined;
      const project = projectId ? await getEnterpriseProjectAsync(context, projectId) : null;
      const teamId = String(form.get("teamId") || project?.teamId || context.teams[0]?.id || "");
      requireEnterprisePermission(context, teamId, "reliability:adjudicate");
      const parsedForPreflight = await Promise.all(bufferedFiles.map(readSenaReliabilityUploadRows));
      assertSenaReliabilityCombinedRawRowsWithinLimits(parsedForPreflight.map((file) => file.rows));
      const preflightRows = parsedForPreflight.flatMap((file) => file.rows);
      const preflightAnnotations = parseCoderAnnotationsFromRows(preflightRows);
      preflightSenaReliabilityAnnotations(preflightAnnotations.annotations);
      const uploads = await createEnterpriseUploadsWithPostgresMirrorAsync(context, {
        teamId,
        files: bufferedFiles.map((file) => ({
          name: file.name,
          contentType: "application/octet-stream",
          bytes: file.bytes,
          // No warningCount at enqueue: neither the local nor external worker
          // has parsed the file yet, so the registry must not assert a clean
          // parse before the eventual worker reports it.
          importProfile: "reliability"
        }))
      });
      const queue = serverJobQueueStatus();
      const uploadIds = uploads.map((upload) => upload.id);
      const snapshotFingerprint = project ? senaReliabilitySnapshotFingerprint(project.snapshot) : undefined;
      if (uploadIds.length === 0) {
        throw new SenaEnterpriseError(
          "Queued reliability jobs require at least one reliability file.",
          400,
          "reliability_queue_source_required"
        );
      }
      const reviewerEnvelope = await createQueuedReviewerEnvelope(context, teamId, form.get("reviewer"));
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
          fileCount: uploads.length,
          hasInlineSnapshot: false,
          hasInlineDataset: false,
          payloadValuesExcluded: true
        },
        queue
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
          uploadCount: uploads.length,
          inlinePayloadAllowed: job.provider.inlinePayloadAllowed,
          projectVersion: project?.currentVersion ?? null
        }
      });
      return NextResponse.json(job, {
        status: 202,
        headers: serverJobHeaders(job)
      });
    }
    const parsedFiles = await Promise.all(bufferedFiles.map(readSenaReliabilityUploadRows));
    assertSenaReliabilityCombinedRawRowsWithinLimits(parsedFiles.map((file) => file.rows));
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
    const context = await requireApiSessionForMutation(request);
    const body = await request.json();
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
