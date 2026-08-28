import { NextResponse } from "next/server";
import { observeSenaApiRoute, requireApiSession } from "@/lib/sena/api-helpers";
import { requireEnterprisePermission } from "@/lib/sena/enterprise/access-control";
import { SenaEnterpriseError } from "@/lib/sena/enterprise/errors";
import { withSenaWorkflowStore } from "@/lib/sena/workflow/api-runtime";
import { buildSenaWorkflowCloseout, SenaWorkflowCloseoutError } from "@/lib/sena/workflow/closeout";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ runId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  return observeSenaApiRoute(request, { routeId: "sena-workflow-run-closeout" }, async () => {
    const context = await requireApiSession();
    const { runId } = await params;
    const run = await withSenaWorkflowStore((store) => store.getRun(runId));
    if (!run) throw new SenaEnterpriseError("SENA workflow run was not found.", 404, "workflow_run_not_found");
    requireEnterprisePermission(context, run.teamId, "export:create");
    if (!["succeeded", "failed", "dead_lettered", "cancelled", "superseded"].includes(run.status)) {
      throw new SenaEnterpriseError(
        "SENA workflow closeout is not available before a terminal state.",
        409,
        "workflow_closeout_not_ready"
      );
    }
    const events = await withSenaWorkflowStore((store) => store.runEvents(run.id, run.teamId));
    let closeout;
    try {
      closeout = buildSenaWorkflowCloseout({ ...events, generatedAt: events.run.updatedAt });
    } catch (error) {
      if (error instanceof SenaWorkflowCloseoutError) {
        throw new SenaEnterpriseError(
          "SENA workflow closeout evidence did not verify.",
          409,
          "workflow_closeout_evidence_invalid"
        );
      }
      throw error;
    }
    return NextResponse.json(closeout, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="sena-workflow-${run.id}-closeout.json"`,
        "x-sena-workflow-run-id": run.id,
        "x-sena-workflow-closeout-sha256": closeout.closeoutDigest,
        "x-sena-workflow-status": closeout.workflowStatus,
        ...(closeout.claimBoundary ? { "x-sena-workflow-claim-boundary": closeout.claimBoundary } : {})
      }
    });
  });
}
