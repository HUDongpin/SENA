import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  listEnterpriseServerJobs,
  senaEnterpriseServerJobKinds,
  updateEnterpriseServerJobStatus,
  type SenaEnterpriseServerJobKind,
  type SenaEnterpriseServerJobStatus,
  type SenaEnterpriseServerJobStatusAction
} from "@/lib/sena/enterprise/server-job-queue";
import {
  recordEnterpriseAuditAsync
} from "@/lib/sena/enterprise/ops-audit";
import { SenaEnterpriseError } from "@/lib/sena/enterprise/errors";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireOpsAccess, requireOpsMutationAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

const jobStatuses = new Set<SenaEnterpriseServerJobStatus>([
  "queued",
  "running",
  "succeeded",
  "failed",
  "dead-lettered"
]);
const jobKinds = new Set<SenaEnterpriseServerJobKind>(senaEnterpriseServerJobKinds);
const statusActions = new Set<SenaEnterpriseServerJobStatusAction>([
  "mark-running",
  "mark-succeeded",
  "mark-failed",
  "retry",
  "dead-letter"
]);

function maybeStatus(value: string | null) {
  return value && jobStatuses.has(value as SenaEnterpriseServerJobStatus)
    ? value as SenaEnterpriseServerJobStatus
    : undefined;
}

function maybeKind(value: string | null) {
  return value && jobKinds.has(value as SenaEnterpriseServerJobKind)
    ? value as SenaEnterpriseServerJobKind
    : undefined;
}

function sanitizedLimit(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
}

function redactedErrorHash(body: { errorHash?: unknown; errorMessage?: unknown }) {
  if (typeof body.errorHash === "string" && /^[a-f0-9]{64}$/i.test(body.errorHash)) {
    return body.errorHash.toLowerCase();
  }
  if (typeof body.errorMessage === "string" && body.errorMessage.trim()) {
    return createHash("sha256").update(body.errorMessage.trim()).digest("hex");
  }
  return undefined;
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-jobs" }, async () => {
    const access = await requireOpsAccess(request);
    const url = new URL(request.url);
    const result = await listEnterpriseServerJobs({
      status: maybeStatus(url.searchParams.get("status")),
      kind: maybeKind(url.searchParams.get("kind")),
      teamId: url.searchParams.get("teamId") || undefined,
      projectId: url.searchParams.get("projectId") || undefined,
      limit: sanitizedLimit(url.searchParams.get("limit"))
    });
    return NextResponse.json({
      ...result,
      access
    }, {
      headers: {
        "x-sena-server-job-total": String(result.summary.total),
        "x-sena-server-job-queued": String(result.summary.queued),
        "x-sena-server-job-running": String(result.summary.running),
        "x-sena-server-job-failed": String(result.summary.failed),
        "x-sena-server-job-dead-lettered": String(result.summary.deadLettered)
      }
    });
  });
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-jobs" }, async () => {
    const access = await requireOpsMutationAccess(request);
    const body = await request.json().catch(() => ({})) as {
      action?: unknown;
      jobId?: unknown;
      workerRunId?: unknown;
      errorCode?: unknown;
      errorHash?: unknown;
      errorMessage?: unknown;
      reason?: unknown;
      force?: unknown;
      uploadWarnings?: unknown;
    };
    const action = typeof body.action === "string" && statusActions.has(body.action as SenaEnterpriseServerJobStatusAction)
      ? body.action as SenaEnterpriseServerJobStatusAction
      : undefined;
    const jobId = typeof body.jobId === "string" && body.jobId.trim() ? body.jobId.trim() : undefined;
    if (!action) {
      throw new SenaEnterpriseError("Unsupported SENA server job status action.", 400, "unsupported_server_job_status_action");
    }
    if (!jobId) {
      throw new SenaEnterpriseError("SENA server job status updates require jobId.", 400, "server_job_id_required");
    }
    const update = await updateEnterpriseServerJobStatus({
      jobId,
      action,
      workerRunId: typeof body.workerRunId === "string" ? body.workerRunId : undefined,
      errorCode: typeof body.errorCode === "string" ? body.errorCode : undefined,
      errorHash: redactedErrorHash(body),
      reason: typeof body.reason === "string" ? body.reason : undefined,
      force: body.force === true,
      // Worker-reported parse-repair warning counts (H10 disclosure channel);
      // validated in the job layer, which 400s on non-array or invalid entries
      // — a malformed report must fail loud, not be silently ignored.
      uploadWarnings: body.uploadWarnings === undefined || body.uploadWarnings === null
        ? undefined
        : body.uploadWarnings as Array<{ uploadId?: unknown; warningCount?: unknown }>
    });
    await recordEnterpriseAuditAsync({
      event: "ops.server_job.status",
      teamId: update.job.teamId,
      projectId: update.job.projectId,
      detail: {
        serverJobId: update.job.id,
        serverJobKind: update.job.kind,
        action,
        status: update.job.status,
        attempts: update.job.lifecycle.attempts,
        maxAttempts: update.job.lifecycle.maxAttempts,
        retryable: update.job.lifecycle.retryable,
        errorCode: update.job.lifecycle.lastErrorCode ?? null,
        errorHash: update.job.lifecycle.lastErrorHash ?? null,
        uploadWarningsApplied: update.uploadWarnings?.length ?? 0
      }
    });
    return NextResponse.json({
      ...update,
      access
    }, {
      status: update.job.status === "dead-lettered" ? 202 : 200,
      headers: {
        "x-sena-server-job-id": update.job.id,
        "x-sena-server-job-kind": update.job.kind,
        "x-sena-server-job-status": update.job.status,
        "x-sena-server-job-attempts": String(update.job.lifecycle.attempts),
        "x-sena-server-job-retryable": String(update.job.lifecycle.retryable)
      }
    });
  });
}
