import { NextResponse } from "next/server";
import {
  createEnterpriseAnalysisRunWithPostgresMirrorAsync,
  listEnterpriseAnalysisRunsAsync
} from "@/lib/sena/enterprise/import-analysis";
import {
  createEnterpriseProjectAsync,
  getEnterpriseProjectAsync,
  updateEnterpriseProjectAsync
} from "@/lib/sena/enterprise/team-project";
import { buildSenaAnalysisRun } from "@sena/kernel";
import { requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";
import { requireEnterprisePermission } from "@/lib/sena/enterprise/access-control";
import { SenaEnterpriseError } from "@/lib/sena/enterprise/errors";
import { recordEnterpriseAuditAsync } from "@/lib/sena/enterprise/ops-audit";
import {
  assertServerJobPayloadAllowed,
  enqueueEnterpriseServerJob,
  serverJobHeaders,
  serverJobQueueStatus,
  shouldQueueServerJob
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
    const context = await requireApiSessionForMutation(request);
    const body = await request.json() as SenaAnalysisApiBody;
    const sourceProject = body.projectId ? await getEnterpriseProjectAsync(context, String(body.projectId)) : null;
    const teamId = resolveSenaAnalysisTeamId({
      body,
      sourceProject,
      fallbackTeamId: context.teams[0]?.id
    });
    if (shouldQueueServerJob(request, body)) {
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
      const job = await enqueueEnterpriseServerJob({
        ...buildSenaAnalysisQueueJobInput({
          body,
          teamId,
          sourceProject,
          actorUserId: context.user.id,
          inlinePayloadAllowed: queue.inlinePayloadAllowed
        }),
        queue
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
    const run = buildSenaAnalysisRun(buildSenaAnalysisRunRequestInput({ body, sourceProject }));
    const persist = body.persist === true;
    const updateExistingProject = persist && sourceProject && body.updateProject !== false;
    const persistedProject = persist
      ? updateExistingProject
        ? await updateEnterpriseProjectAsync(context, sourceProject.id, {
          title: body.title === undefined ? undefined : String(body.title),
          description: body.description === undefined ? undefined : String(body.description),
          expectedVersion: body.expectedVersion === undefined ? undefined : Number(body.expectedVersion),
          snapshot: run.projectSnapshot
        })
        : await createEnterpriseProjectAsync(context, {
          teamId,
          title: String(body.title ?? run.summary.title),
          description: String(body.description ?? "Created by /api/sena/analyze."),
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
