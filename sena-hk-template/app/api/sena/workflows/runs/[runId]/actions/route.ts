import { NextResponse } from "next/server";
import {
  observeSenaApiRoute,
  requireApiSessionForMutation
} from "@/lib/sena/api-helpers";
import {
  performSenaWorkflowAction,
  readSenaWorkflowJson,
  requireSenaWorkflowIdempotencyKey,
  withSenaWorkflowStore
} from "@/lib/sena/workflow/api-runtime";
import { senaWorkflowCheckpointExists } from "@/lib/sena/workflow/postgres-runtime";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ runId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  return observeSenaApiRoute(request, { routeId: "sena-workflow-run-actions" }, async () => {
    const context = await requireApiSessionForMutation(request);
    const idempotencyKey = requireSenaWorkflowIdempotencyKey(request);
    const body = await readSenaWorkflowJson(request);
    const { runId } = await params;
    const result = await withSenaWorkflowStore((store) => performSenaWorkflowAction({
      context,
      runId,
      body,
      idempotencyKey,
      store,
      validateCheckpoint: senaWorkflowCheckpointExists
    }));
    return NextResponse.json({
      schemaVersion: SENA_SCHEMA_VERSIONS.workflowActionCommand,
      ...result
    }, {
      status: 202,
      headers: {
        "cache-control": "no-store",
        "x-sena-workflow-run-id": result.run.id,
        "x-sena-workflow-run-version": String(result.run.version),
        "x-sena-workflow-command-id": result.command.id,
        "x-sena-workflow-command-status": result.command.status,
        "x-sena-workflow-accepted-not-completed": String(result.command.status !== "completed")
      }
    });
  });
}
