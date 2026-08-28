import { observeSenaApiRoute, requireApiSession } from "@/lib/sena/api-helpers";
import { requireEnterprisePermission } from "@/lib/sena/enterprise/access-control";
import { SenaEnterpriseError } from "@/lib/sena/enterprise/errors";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { withSenaWorkflowStore } from "@/lib/sena/workflow/api-runtime";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ runId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  return observeSenaApiRoute(request, { routeId: "sena-workflow-run-events" }, async () => {
    const context = await requireApiSession();
    const { runId } = await params;
    const events = await withSenaWorkflowStore(async (store) => {
      const run = await store.getRun(runId);
      if (!run) throw new SenaEnterpriseError("SENA workflow run was not found.", 404, "workflow_run_not_found");
      requireEnterprisePermission(context, run.teamId, "project:read");
      return store.runEvents(run.id, run.teamId);
    });
    const payload = {
      schemaVersion: SENA_SCHEMA_VERSIONS.workflowRedactedEvent,
      generatedAt: new Date().toISOString(),
      run: {
        id: events.run.id,
        version: events.run.version,
        kind: events.run.kind,
        mode: events.run.mode,
        status: events.run.status,
        currentNodeId: events.run.currentNodeId,
        pendingInterrupt: events.run.pendingInterrupt,
        blockers: events.run.blockers,
        researchSourceClass: events.run.researchSourceClass,
        claimBoundary: events.run.claimBoundary,
        evidenceLayers: events.run.evidenceLayers,
        supersededByRunId: events.run.supersededByRunId,
        updatedAt: events.run.updatedAt
      },
      commands: events.commands.map((command) => ({
        id: command.id,
        kind: command.kind,
        status: command.status,
        attempts: command.attempts,
        errorClass: command.errorClass,
        createdAt: command.createdAt,
        updatedAt: command.updatedAt
      })),
      receipts: events.receipts.map((receipt) => ({
        id: receipt.id,
        nodeId: receipt.nodeId,
        sequence: receipt.sequence,
        auditChainHead: receipt.auditChainHead,
        inputDigest: receipt.inputDigest,
        outputDigest: receipt.outputDigest,
        evidenceLayer: receipt.evidenceLayer,
        jobId: receipt.jobId,
        artifactReferences: receipt.artifactReferences,
        finishedAt: receipt.finishedAt
      })),
      approvals: events.approvals.map((approval) => ({
        id: approval.id,
        nodeId: approval.nodeId,
        interruptId: approval.interruptId,
        decision: approval.decision,
        reasonCode: approval.reasonCode,
        decisionDigest: approval.decisionDigest,
        createdAt: approval.createdAt
      })),
      artifacts: events.artifacts.map((artifact) => ({
        id: artifact.id,
        nodeId: artifact.nodeId,
        filename: artifact.filename,
        schemaVersion: artifact.schemaVersion,
        sha256: artifact.sha256,
        evidenceLayer: artifact.evidenceLayer,
        createdAt: artifact.createdAt
      }))
    };
    return new Response(`event: workflow-snapshot\ndata: ${JSON.stringify(payload)}\n\n`, {
      status: 200,
      headers: {
        "cache-control": "no-cache, no-store",
        "content-type": "text/event-stream; charset=utf-8",
        connection: "keep-alive",
        "x-accel-buffering": "no",
        "x-sena-workflow-run-id": events.run.id
      }
    });
  });
}
