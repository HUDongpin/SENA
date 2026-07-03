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
import type { SenaEnterpriseAnalysisRun } from "@/lib/sena/enterprise/import-analysis";
import type { SenaEnterpriseProject } from "@/lib/sena/enterprise/team-project";
import { buildSenaAnalysisRun } from "@/lib/sena/analysis-run";
import { requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";
import { requireEnterprisePermission } from "@/lib/sena/enterprise/access-control";
import { SenaEnterpriseError } from "@/lib/sena/enterprise/errors";
import {
  recordEnterpriseAudit,
  recordEnterpriseAuditAsync
} from "@/lib/sena/enterprise/ops-audit";
import {
  assertServerJobPayloadAllowed,
  enqueueEnterpriseServerJob,
  serverJobHeaders,
  serverJobQueueStatus,
  shouldQueueServerJob
} from "@/lib/sena/enterprise/server-job-queue";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

function analysisRunHeaders(run: SenaEnterpriseAnalysisRun, project?: SenaEnterpriseProject): HeadersInit {
  const headers: Record<string, string> = {
    "x-sena-analysis-run-id": run.id,
    "x-sena-analysis-source-kind": run.sourceKind,
    "x-sena-report-sha256": run.artifactFingerprints.reportSha256,
    "x-sena-project-snapshot-sha256": run.artifactFingerprints.projectSnapshotSha256
  };
  const projectId = project?.id ?? run.persistedProjectId ?? run.projectId;
  if (projectId) headers["x-sena-project-id"] = projectId;
  if (project) headers["x-sena-project-version"] = String(project.currentVersion);
  if (run.artifactFingerprints.runtimeBundleSha256) {
    headers["x-sena-runtime-bundle-sha256"] = run.artifactFingerprints.runtimeBundleSha256;
  }
  return headers;
}

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
    const body = await request.json();
    const sourceProject = body.projectId ? await getEnterpriseProjectAsync(context, String(body.projectId)) : null;
    const teamId = String(body.teamId || sourceProject?.teamId || context.teams[0]?.id || "");
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
        kind: "analysis",
        teamId,
        projectId: sourceProject?.id,
        actorUserId: context.user.id,
        payload: {
          action: "run-analysis",
          teamId,
          projectId: sourceProject?.id,
          projectVersion: sourceProject?.currentVersion,
          title: body.title ? String(body.title) : sourceProject?.title,
          activeTemporalWindowId: body.activeTemporalWindowId ? String(body.activeTemporalWindowId) : undefined,
          buildOptions: body.buildOptions,
          includeRuntimeBundle: body.includeRuntimeBundle === true,
          persist: body.persist === true,
          updateProject: body.updateProject !== false,
          expectedVersion: body.expectedVersion === undefined ? undefined : Number(body.expectedVersion),
          inlineSnapshot: queue.inlinePayloadAllowed ? body.snapshot : undefined,
          inlineDataset: queue.inlinePayloadAllowed ? body.dataset : undefined
        },
        payloadSummary: {
          source: sourceProject ? "project" : body.snapshot && body.dataset ? "mixed" : body.snapshot ? "snapshot" : body.dataset ? "dataset" : "unknown",
          projectVersion: sourceProject?.currentVersion,
          includeRuntimeBundle: body.includeRuntimeBundle === true,
          persist: body.persist === true,
          updateProject: body.updateProject !== false,
          activeTemporalWindowId: body.activeTemporalWindowId ? String(body.activeTemporalWindowId) : undefined,
          hasInlineSnapshot: Boolean(body.snapshot),
          hasInlineDataset: Boolean(body.dataset),
          payloadValuesExcluded: true
        },
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
    const run = buildSenaAnalysisRun({
      sourceKind: sourceProject ? "project" : undefined,
      snapshot: sourceProject?.snapshot ?? body.snapshot,
      dataset: body.dataset,
      buildOptions: body.buildOptions,
      title: body.title ? String(body.title) : sourceProject?.title,
      activeTemporalWindowId: body.activeTemporalWindowId ? String(body.activeTemporalWindowId) : undefined,
      includeRuntimeBundle: body.includeRuntimeBundle === true,
      humanReview: body.humanReview,
      codingReliability: body.codingReliability
    });
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
