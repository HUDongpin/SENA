import { NextResponse } from "next/server";
import {
  createEnterpriseAnalysisCommandEnvelopeWithPostgresMirrorAsync,
  createEnterpriseAnalysisRunWithPostgresMirrorAsync,
  listEnterpriseAnalysisRunsAsync,
  reserveEnterpriseUploadIds
} from "@/lib/sena/enterprise/import-analysis";
import {
  createEnterpriseProjectAsync,
  getEnterpriseProjectAsync,
  updateEnterpriseProjectAsync
} from "@/lib/sena/enterprise/team-project";
import { buildSenaAnalysisRun, resolveSenaAnalysisRunSource } from "@sena/kernel";
import { requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";
import { requireEnterprisePermission } from "@/lib/sena/enterprise/access-control";
import { SenaEnterpriseError } from "@/lib/sena/enterprise/errors";
import { recordEnterpriseAuditAsync } from "@/lib/sena/enterprise/ops-audit";
import {
  assertServerJobPayloadAllowed,
  enqueueEnterpriseServerJob,
  serverJobHeaders,
  serverJobQueueStatus,
  shouldQueueServerJob,
  stableServerJobPayloadSha256
} from "@/lib/sena/enterprise/server-job-queue";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import {
  analysisRunHeaders,
  buildSenaAnalysisQueueJobInput,
  buildSenaAnalysisRunRequestInput,
  resolveSenaAnalysisTeamId,
  type SenaAnalysisApiBody
} from "@/lib/sena/analysis-api";
import { validateSenaAnalyticalInputs } from "@/lib/sena/analytical-input-validation";
import { admitSenaAnalysisMutationRequest } from "@/lib/sena/enterprise/heavy-request-admission";
import {
  planSenaAnalysisQueueCommandCustody
} from "@/lib/sena/analysis-queue-command";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-analyze" }, async () => {
    const context = await requireApiSession();
    const url = new URL(request.url);
    return NextResponse.json({
      schemaVersion: SENA_SCHEMA_VERSIONS.analysisRunList,
      analysisRuns: await listEnterpriseAnalysisRunsAsync(context, {
        teamId: url.searchParams.get("teamId") || undefined,
        projectId: url.searchParams.get("projectId") || undefined
      })
    });
  });
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-analyze" }, async () => {
    const admitted = await admitSenaAnalysisMutationRequest(request);
    const context = await requireApiSessionForMutation(admitted.request);
    const body = admitted.body as SenaAnalysisApiBody;
    const sourceProject = body.projectId ? await getEnterpriseProjectAsync(context, String(body.projectId)) : null;
    const runInput = buildSenaAnalysisRunRequestInput({ body, sourceProject });
    const effectiveSource = resolveSenaAnalysisRunSource(runInput);
    validateSenaAnalyticalInputs({
      dataset: effectiveSource.dataset,
      buildOptions: effectiveSource.buildOptions
    });
    const teamId = resolveSenaAnalysisTeamId({
      body,
      sourceProject,
      fallbackTeamId: context.teams[0]?.id
    });
    if (shouldQueueServerJob(admitted.request, body)) {
      if (sourceProject && teamId !== sourceProject.teamId) {
        throw new SenaEnterpriseError("Queued analysis team does not match the project team.", 400, "analysis_project_team_mismatch");
      }
      const queue = serverJobQueueStatus();
      assertServerJobPayloadAllowed({
        projectId: sourceProject?.id,
        hasInlinePayload: Boolean(body.snapshot || body.dataset),
        queue
      });
      requireEnterprisePermission(context, teamId, "analysis:run");
      const queueInput = buildSenaAnalysisQueueJobInput({
        body,
        teamId,
        sourceProject,
        actorUserId: context.user.id,
        inlinePayloadAllowed: queue.inlinePayloadAllowed
      });
      const [commandEnvelopeUploadId] = reserveEnterpriseUploadIds(1);
      const commandCustody = planSenaAnalysisQueueCommandCustody(
        queueInput,
        commandEnvelopeUploadId,
        stableServerJobPayloadSha256(queueInput.payload)
      );
      const job = await enqueueEnterpriseServerJob({
        ...commandCustody.jobInput,
        queue,
        beforeDispatch: async () => {
          await createEnterpriseAnalysisCommandEnvelopeWithPostgresMirrorAsync(context, {
            teamId,
            files: [commandCustody.file]
          });
        }
      });
      await recordEnterpriseAuditAsync({
        event: "analysis.queue",
        userId: context.user.id,
        teamId,
        projectId: sourceProject?.id,
        detail: {
          serverJobId: job.id,
          serverJobKind: job.kind,
          queueProvider: job.provider.mode,
          queueDelivery: job.delivery.webhookStatus,
          queueHttpStatus: job.delivery.httpStatus ?? null,
          queueProductionReady: job.provider.productionReady,
          payloadSha256: job.payloadSha256,
          source: job.payloadSummary.source,
          inlinePayloadAllowed: job.provider.inlinePayloadAllowed,
          projectVersion: sourceProject?.currentVersion ?? null
        }
      });
      return NextResponse.json(job, {
        status: 202,
        headers: serverJobHeaders(job)
      });
    }
    const run = buildSenaAnalysisRun(runInput);
    const persist = body.persist === true;
    const updateExistingProject = persist && sourceProject && body.updateProject !== false;
    const persistedProject = persist
      ? updateExistingProject
        ? await updateEnterpriseProjectAsync(context, sourceProject.id, {
          title: typeof body.title === "string" ? body.title : undefined,
          description: typeof body.description === "string" ? body.description : undefined,
          expectedVersion: body.expectedVersion === undefined ? undefined : Number(body.expectedVersion),
          snapshot: run.projectSnapshot
        })
        : await createEnterpriseProjectAsync(context, {
          teamId,
          title: typeof body.title === "string" ? body.title : run.summary.title,
          description: typeof body.description === "string"
            ? body.description
            : "Created by /api/sena/analyze.",
          snapshot: run.projectSnapshot
        })
      : null;

    const enterpriseAnalysisRun = await createEnterpriseAnalysisRunWithPostgresMirrorAsync(context, {
      teamId,
      projectId: sourceProject?.id,
      persistedProjectId: persistedProject?.id,
      run
    });

    return NextResponse.json({
      ...run,
      enterpriseAnalysisRun,
      persistedProject
    }, {
      headers: analysisRunHeaders(enterpriseAnalysisRun, persistedProject ?? sourceProject ?? undefined)
    });
  });
}
