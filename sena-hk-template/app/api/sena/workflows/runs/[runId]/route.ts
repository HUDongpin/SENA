import { NextResponse } from "next/server";
import { observeSenaApiRoute, requireApiSession } from "@/lib/sena/api-helpers";
import { requireEnterprisePermission } from "@/lib/sena/enterprise/access-control";
import { SenaEnterpriseError } from "@/lib/sena/enterprise/errors";
import { withSenaWorkflowStore } from "@/lib/sena/workflow/api-runtime";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ runId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  return observeSenaApiRoute(request, { routeId: "sena-workflow-run" }, async () => {
    const context = await requireApiSession();
    const { runId } = await params;
    const run = await withSenaWorkflowStore((store) => store.getRun(runId));
    if (!run) throw new SenaEnterpriseError("SENA workflow run was not found.", 404, "workflow_run_not_found");
    requireEnterprisePermission(context, run.teamId, "project:read");
    return NextResponse.json(run, {
      headers: {
        "cache-control": "private, no-store",
        "x-sena-workflow-run-id": run.id,
        "x-sena-workflow-run-version": String(run.version),
        "x-sena-workflow-status": run.status,
        ...(run.claimBoundary ? { "x-sena-workflow-claim-boundary": run.claimBoundary } : {})
      }
    });
  });
}
