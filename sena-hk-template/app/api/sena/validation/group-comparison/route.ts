import { NextResponse } from "next/server";
import {
  buildEnterpriseValidationRunListResponseAsync,
  buildEnterpriseGroupComparisonValidationResponseWithPostgresMirrorAsync,
  buildEnterpriseValidationRunReviewResponseWithPostgresMirrorAsync,
  resolveEnterpriseGroupComparisonInput
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
  senaEnterpriseServerJobWasCreated,
  stableServerJobPayloadSha256,
  shouldQueueServerJob
} from "@/lib/sena/enterprise/server-job-queue";
import {
  createEnterpriseServerJobCommandEnvelopeWithPostgresMirrorAsync
} from "@/lib/sena/enterprise/import-analysis";
import {
  bindSenaServerJobIdempotency,
  planSenaServerJobCommandCustody,
  SENA_SERVER_JOB_COMMAND_CUSTODY
} from "@/lib/sena/server-job-command-envelope";
import { observeSenaApiRoute, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";
import { admitSenaValidationMutationRequest } from "@/lib/sena/enterprise/heavy-request-admission";
import { assertSenaServerJobWorkerExecutable } from "@/lib/sena/enterprise/server-job-worker-capabilities";

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
    const admitted = await admitSenaValidationMutationRequest(request, "POST");
    const context = await requireApiSessionForMutation(admitted.request);
    const body = admitted.body;
    const projectId = body.projectId ? String(body.projectId) : undefined;
    const project = projectId ? await getEnterpriseProjectAsync(context, projectId) : null;
    const queued = shouldQueueServerJob(admitted.request, body);
    const queue = queued ? serverJobQueueStatus() : null;
    const resolved = resolveEnterpriseGroupComparisonInput(body, project);
    if (queued && !projectId) {
      throw new SenaEnterpriseError(
        "Queued validation sources require durable project custody; use projectId or run the inline source synchronously.",
        400,
        "server_job_inline_source_custody_required"
      );
    }
    const queuedTeamId = queued
      ? String(body.teamId || project?.teamId || context.teams[0]?.id || "")
      : undefined;
    if (queued && project && queuedTeamId !== project.teamId) {
      throw new SenaEnterpriseError(
        "Validation run team does not match the project team.",
        400,
        "validation_project_team_mismatch"
      );
    }
    if (queued && queue) {
      assertSenaServerJobWorkerExecutable("validation");
      const teamId = queuedTeamId ?? "";
      requireEnterprisePermission(context, teamId, "analysis:run");
      const comparisonCount = resolved.comparisons.length;
      const workerPayload = {
        action: "run-validation",
        commandCustody: SENA_SERVER_JOB_COMMAND_CUSTODY,
        teamId,
        projectId,
        projectVersion: project?.currentVersion,
        groupField: resolved.defaultGroupField,
        groupA: body.comparisons === undefined ? resolved.comparisons[0].groupA : undefined,
        groupB: body.comparisons === undefined ? resolved.comparisons[0].groupB : undefined,
        metric: resolved.defaultMetric,
        metrics: body.metrics,
        comparisons: body.comparisons === undefined ? undefined : resolved.comparisons,
        suite: resolved.suite,
        iterations: resolved.iterations,
        bootstrapIterations: resolved.bootstrapIterations,
        alpha: resolved.alpha,
        seed: resolved.seed,
        preregistrationNote: body.preregistrationNote,
        methodNote: body.methodNote,
        parityEvidence: body.parityEvidence,
        buildOptions: body.buildOptions
      };
      const queueInput = {
        kind: "validation" as const,
        teamId,
        projectId,
        actorUserId: context.user.id,
        payload: workerPayload,
        payloadSummary: {
          source: "project" as const,
          projectVersion: project?.currentVersion,
          projectTeamId: project?.teamId,
          comparisonCount,
          validationMethod: "group-comparison" as const,
          hasInlineSnapshot: Boolean(body.snapshot),
          hasInlineDataset: Boolean(body.dataset),
          payloadValuesExcluded: true as const
        }
      };
      const idempotency = bindSenaServerJobIdempotency({
        request: admitted.request,
        kind: "validation",
        teamId,
        actorUserId: context.user.id,
        projectId
      });
      const commandCustody = planSenaServerJobCommandCustody(
        { ...queueInput, jobId: idempotency.jobId },
        idempotency.commandEnvelopeUploadId,
        stableServerJobPayloadSha256(workerPayload)
      );
      const job = await enqueueEnterpriseServerJob({
        ...commandCustody.jobInput,
        queue,
        beforeDispatch: async () => {
          await createEnterpriseServerJobCommandEnvelopeWithPostgresMirrorAsync(context, {
            teamId,
            files: [commandCustody.file],
            requiredPermission: "analysis:run"
          });
        }
      });
      if (senaEnterpriseServerJobWasCreated(job)) await recordEnterpriseAuditAsync({
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
    const admitted = await admitSenaValidationMutationRequest(request, "PATCH");
    const context = await requireApiSessionForMutation(admitted.request);
    const body = admitted.body;
    const response = await buildEnterpriseValidationRunReviewResponseWithPostgresMirrorAsync(context, body);
    return NextResponse.json(response.body, { headers: response.headers });
  });
}
