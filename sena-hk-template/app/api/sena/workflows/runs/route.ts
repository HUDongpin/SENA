import { NextResponse } from "next/server";
import {
  observeSenaApiRoute,
  requireApiSession,
  requireApiSessionForMutation
} from "@/lib/sena/api-helpers";
import { requireEnterprisePermission } from "@/lib/sena/enterprise/access-control";
import { SenaEnterpriseError } from "@/lib/sena/enterprise/errors";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import {
  createSenaWorkflowRun,
  readSenaWorkflowJson,
  requireSenaWorkflowIdempotencyKey,
  withSenaWorkflowStore
} from "@/lib/sena/workflow/api-runtime";
import type { SenaWorkflowRunStatus } from "@/lib/sena/workflow/types";

export const runtime = "nodejs";
const workflowRunStatuses = new Set<SenaWorkflowRunStatus>([
  "queued",
  "running",
  "waiting_job",
  "waiting_human",
  "blocked",
  "succeeded",
  "failed",
  "dead_lettered",
  "cancelled",
  "superseded"
]);

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-workflow-runs" }, async () => {
    const context = await requireApiSession();
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId")?.trim();
    if (!teamId) {
      throw new SenaEnterpriseError("SENA workflow teamId is required.", 422, "workflow_team_required");
    }
    requireEnterprisePermission(context, teamId, "project:read");
    const status = url.searchParams.get("status")?.trim() || undefined;
    if (status && !workflowRunStatuses.has(status as SenaWorkflowRunStatus)) {
      throw new SenaEnterpriseError("SENA workflow status filter is invalid.", 422, "workflow_status_invalid");
    }
    const runs = await withSenaWorkflowStore((store) => store.listRuns({
      teamId,
      ...(status ? { status: status as SenaWorkflowRunStatus } : {})
    }));
    return NextResponse.json({ schemaVersion: SENA_SCHEMA_VERSIONS.workflowRunList, runs }, {
      headers: { "cache-control": "private, no-store" }
    });
  });
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-workflow-runs" }, async () => {
    const context = await requireApiSessionForMutation(request);
    const idempotencyKey = requireSenaWorkflowIdempotencyKey(request);
    const body = await readSenaWorkflowJson(request);
    const result = await withSenaWorkflowStore((store) => createSenaWorkflowRun({
      context,
      body,
      idempotencyKey,
      store
    }));
    return NextResponse.json({
      schemaVersion: SENA_SCHEMA_VERSIONS.workflowRunCommand,
      created: result.created,
      run: result.run,
      command: result.command
    }, {
      status: 202,
      headers: {
        "cache-control": "no-store",
        "x-sena-workflow-run-id": result.run.id,
        "x-sena-workflow-command-id": result.command.id,
        "x-sena-workflow-command-status": result.command.status,
        "x-sena-workflow-accepted-not-completed": "true"
      }
    });
  });
}
