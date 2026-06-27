import { NextResponse } from "next/server";
import {
  createEnterpriseAnalysisRun,
  listEnterpriseAnalysisRuns
} from "@/lib/sena/enterprise/import-analysis";
import {
  createEnterpriseProject,
  getEnterpriseProject,
  updateEnterpriseProject
} from "@/lib/sena/enterprise/team-project";
import type { SenaEnterpriseAnalysisRun } from "@/lib/sena/enterprise/import-analysis";
import type { SenaEnterpriseProject } from "@/lib/sena/enterprise/team-project";
import { buildSenaAnalysisRun } from "@/lib/sena/analysis-run";
import { jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";

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
  try {
    const context = await requireApiSession();
    const url = new URL(request.url);
    return NextResponse.json({
      schemaVersion: SENA_SCHEMA_VERSIONS.analysisRunList,
      analysisRuns: listEnterpriseAnalysisRuns(context, {
        teamId: url.searchParams.get("teamId") || undefined,
        projectId: url.searchParams.get("projectId") || undefined
      })
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json();
    const sourceProject = body.projectId ? getEnterpriseProject(context, String(body.projectId)) : null;
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
    const teamId = String(body.teamId || sourceProject?.teamId || context.teams[0]?.id || "");
    const persist = body.persist === true;
    const updateExistingProject = persist && sourceProject && body.updateProject !== false;
    const persistedProject = persist
      ? updateExistingProject
        ? updateEnterpriseProject(context, sourceProject.id, {
          title: body.title === undefined ? undefined : String(body.title),
          description: body.description === undefined ? undefined : String(body.description),
          expectedVersion: body.expectedVersion === undefined ? undefined : Number(body.expectedVersion),
          snapshot: run.projectSnapshot
        })
        : createEnterpriseProject(context, {
          teamId,
          title: String(body.title ?? run.summary.title),
          description: String(body.description ?? "Created by /api/sena/analyze."),
          snapshot: run.projectSnapshot
        })
      : null;

    const enterpriseAnalysisRun = createEnterpriseAnalysisRun(context, {
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
  } catch (error) {
    return jsonError(error);
  }
}
