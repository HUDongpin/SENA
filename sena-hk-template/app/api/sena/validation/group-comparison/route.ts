import { NextResponse } from "next/server";
import {
  buildEnterpriseValidationRunListResponseAsync,
  buildEnterpriseGroupComparisonValidationResponseWithPostgresMirrorAsync,
  buildEnterpriseValidationRunReviewResponseWithPostgresMirrorAsync
} from "@/lib/sena/enterprise/validation-runs";
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
import { observeSenaApiRoute, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";
import { validateSenaAnalyticalInputs } from "@/lib/sena/analytical-input-validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-validation-group-comparison" }, async () => {
    const context = await requireApiSession();
    const url = new URL(request.url);
    const response = await buildEnterpriseValidationRunListResponseAsync(context, {
      teamId: url.searchParams.get("teamId") || undefined,
      projectId: url.searchParams.get("projectId") || undefined
    });
    return NextResponse.json(response.body);
  });
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-validation-group-comparison" }, async () => {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json() as Record<string, unknown>;
    validateSenaAnalyticalInputs({ dataset: body.dataset, buildOptions: body.buildOptions });
    if (shouldQueueServerJob(request, body)) {
      const projectId = body.projectId ? String(body.projectId) : undefined;
      const project = projectId ? await getEnterpriseProjectAsync(context, projectId) : null;
      const teamId = String(body.teamId || project?.teamId || context.teams[0]?.id || "");
      requireEnterprisePermission(context, teamId, "analysis:run");
      const queue = serverJobQueueStatus();
      if (!projectId && !queue.inlinePayloadAllowed) {
        throw new SenaEnterpriseError(
          "Queued validation jobs require projectId unless SENA_JOB_QUEUE_ALLOW_INLINE_PAYLOAD=1 is explicitly configured.",
          400,
          "validation_queue_source_required"
        );
      }
      const comparisonCount = Array.isArray(body.comparisons) ? body.comparisons.length : 1;
      const job = await enqueueEnterpriseServerJob({
        kind: "validation",
        teamId,
        projectId,
        actorUserId: context.user.id,
        payload: {
          action: "run-validation",
          teamId,
          projectId,
          projectVersion: project?.currentVersion,
          groupField: body.groupField ? String(body.groupField) : undefined,
          groupA: body.groupA ? String(body.groupA) : undefined,
          groupB: body.groupB ? String(body.groupB) : undefined,
          metric: body.metric ? String(body.metric) : undefined,
          metrics: body.metrics,
          comparisons: body.comparisons,
          suite: body.suite === true,
          iterations: body.iterations,
          bootstrapIterations: body.bootstrapIterations,
          alpha: body.alpha,
          seed: body.seed,
          preregistrationNote: body.preregistrationNote,
          methodNote: body.methodNote,
          parityEvidence: body.parityEvidence,
          buildOptions: body.buildOptions,
          inlineSnapshot: queue.inlinePayloadAllowed ? body.snapshot : undefined,
          inlineDataset: queue.inlinePayloadAllowed ? body.dataset : undefined
        },
        payloadSummary: {
          source: project ? "project" : body.snapshot && body.dataset ? "mixed" : body.snapshot ? "snapshot" : body.dataset ? "dataset" : "unknown",
          projectVersion: project?.currentVersion,
          comparisonCount,
          validationMethod: "group-comparison",
          hasInlineSnapshot: Boolean(body.snapshot),
          hasInlineDataset: Boolean(body.dataset),
          payloadValuesExcluded: true
        },
        queue
      });
      await recordEnterpriseAuditAsync({
        event: "validation.queue",
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
          comparisonCount,
          inlinePayloadAllowed: job.provider.inlinePayloadAllowed,
          projectVersion: project?.currentVersion ?? null
        }
      });
      return NextResponse.json(job, {
        status: 202,
        headers: serverJobHeaders(job)
      });
    }
    const response = await buildEnterpriseGroupComparisonValidationResponseWithPostgresMirrorAsync(context, body);
    return NextResponse.json(response.body, { headers: response.headers });
  });
}

export async function PATCH(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-validation-group-comparison" }, async () => {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json();
    const response = await buildEnterpriseValidationRunReviewResponseWithPostgresMirrorAsync(context, body);
    return NextResponse.json(response.body, { headers: response.headers });
  });
}
