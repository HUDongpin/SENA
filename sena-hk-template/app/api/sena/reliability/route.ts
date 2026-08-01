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
import { readXlsxWorkbookRows } from "@/lib/sena/excel-workbook";
import { parseSenaCsv, type SenaImportRow } from "@/lib/sena/import";
import {
  buildSenaReliabilityDashboard,
  parseCoderAnnotationsFromRows,
  reliabilityDashboardToReview
} from "@/lib/sena/reliability";
import { observeSenaApiRoute, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

type BufferedReliabilityFile = {
  name: string;
  size: number;
  bytes: Buffer;
};

async function bufferReliabilityFiles(files: File[]): Promise<BufferedReliabilityFile[]> {
  return Promise.all(files.map(async (file) => {
    const bytes = Buffer.from(await file.arrayBuffer());
    return {
      name: file.name,
      size: bytes.byteLength,
      bytes
    };
  }));
}

async function rowsFromFile(file: BufferedReliabilityFile): Promise<{ rows: SenaImportRow[]; warnings: string[] }> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    const workbook = await readXlsxWorkbookRows(file.bytes);
    return { rows: workbook.flatMap((sheet) => sheet.rows), warnings: [] };
  }
  if (lower.endsWith(".xls")) {
    throw new Error(`${file.name}: legacy .xls reliability uploads are not accepted. Save the workbook as .xlsx, CSV, or JSON before uploading.`);
  }
  if (lower.endsWith(".json")) {
    const parsed = JSON.parse(file.bytes.toString("utf8"));
    return {
      rows: Array.isArray(parsed) ? parsed.filter((row) => typeof row === "object" && row !== null && !Array.isArray(row)) : [],
      warnings: []
    };
  }
  const parsed = parseSenaCsv(file.bytes.toString("utf8"));
  // Ragged-row repairs are recorded per file: a coder row truncated before its
  // value cell otherwise reads as an applied code and silently moves kappa/alpha.
  return { rows: parsed.rows, warnings: parsed.warnings.map((warning) => `${file.name}: ${warning}`) };
}

function fileSummary(file: BufferedReliabilityFile) {
  return {
    name: file.name,
    size: file.size,
    sha256: createHash("sha256").update(file.bytes).digest("hex")
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
        const projectId = body.projectId ? String(body.projectId) : undefined;
        const project = projectId ? await getEnterpriseProjectAsync(context, projectId) : null;
        const teamId = String(body.teamId || project?.teamId || context.teams[0]?.id || "");
        requireEnterprisePermission(context, teamId, "reliability:adjudicate");
        const queue = serverJobQueueStatus();
        const uploadIds = Array.isArray(body.uploadIds) ? body.uploadIds.map((value) => String(value)).filter(Boolean).slice(0, 100) : [];
        const annotationCount = Array.isArray(body.annotations) ? body.annotations.length : undefined;
        if (uploadIds.length === 0 && !queue.inlinePayloadAllowed) {
          throw new SenaEnterpriseError(
            "Queued reliability jobs require uploadIds unless SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD=1 is explicitly configured.",
            400,
            "reliability_queue_source_required"
          );
        }
        const job = await enqueueEnterpriseServerJob({
          kind: "reliability",
          teamId,
          projectId,
          actorUserId: context.user.id,
          payload: {
            action: "run-reliability",
            teamId,
            projectId,
            uploadIds,
            reviewer: body.reviewer ? String(body.reviewer) : context.user.name,
            sourceName: body.sourceName ? String(body.sourceName) : undefined,
            requestSchemaVersion: body.schemaVersion ? String(body.schemaVersion) : undefined,
            inlineAnnotations: queue.inlinePayloadAllowed ? body.annotations : undefined
          },
          payloadSummary: {
            source: uploadIds.length > 0 ? "upload" : "dataset",
            projectVersion: project?.currentVersion,
            uploadIds,
            annotationCount,
            fileCount: uploadIds.length || (body.sourceName ? 1 : undefined),
            hasInlineSnapshot: false,
            hasInlineDataset: Array.isArray(body.annotations),
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
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    const bufferedFiles = await bufferReliabilityFiles(files);
    if (shouldQueueServerJob(request, { queue: ["1", "true", "yes", "on"].includes(String(form.get("queue") || "").toLowerCase()) })) {
      const projectId = form.get("projectId") ? String(form.get("projectId")) : undefined;
      const project = projectId ? await getEnterpriseProjectAsync(context, projectId) : null;
      const teamId = String(form.get("teamId") || project?.teamId || context.teams[0]?.id || "");
      requireEnterprisePermission(context, teamId, "reliability:adjudicate");
      const uploads = await createEnterpriseUploadsWithPostgresMirrorAsync(context, {
        teamId,
        files: bufferedFiles.map((file) => ({
          name: file.name,
          contentType: "application/octet-stream",
          bytes: file.bytes,
          importProfile: "reliability",
          warningCount: 0
        }))
      });
      const queue = serverJobQueueStatus();
      const uploadIds = uploads.map((upload) => upload.id);
      const job = await enqueueEnterpriseServerJob({
        kind: "reliability",
        teamId,
        projectId,
        actorUserId: context.user.id,
        payload: {
          action: "run-reliability",
          teamId,
          projectId,
          uploadIds,
          reviewer: String(form.get("reviewer") || context.user.name)
        },
        payloadSummary: {
          source: "upload",
          projectVersion: project?.currentVersion,
          uploadIds,
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
    const parsedFiles = await Promise.all(bufferedFiles.map(rowsFromFile));
    const rows = parsedFiles.flatMap((file) => file.rows);
    const fileWarnings = parsedFiles.flatMap((file) => file.warnings);
    const parsed = parseCoderAnnotationsFromRows(rows);
    const dashboard = buildSenaReliabilityDashboard(parsed.annotations);
    const dashboardWithWarnings = {
      ...dashboard,
      warnings: [...fileWarnings, ...parsed.warnings, ...dashboard.warnings]
    };
    const reviewer = String(form.get("reviewer") || context.user.name);
    const reviewPatch = reliabilityDashboardToReview(dashboardWithWarnings, reviewer);
    const teamId = String(form.get("teamId") || context.teams[0]?.id || "");
    const projectId = form.get("projectId") ? String(form.get("projectId")) : undefined;
    const response = await buildEnterpriseReliabilityRunResponseWithPostgresMirrorAsync(context, {
      teamId,
      projectId,
      reviewer,
      fileCount: bufferedFiles.length,
      annotationCount: parsed.annotations.length,
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
