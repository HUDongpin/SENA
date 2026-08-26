import { NextResponse } from "next/server";
import {
  verifyEnterpriseServerJobWorkerHeartbeat
} from "@/lib/sena/enterprise/server-job-queue";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireOpsMutationAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

function workerHeartbeatHeaders(
  heartbeat: Awaited<ReturnType<typeof verifyEnterpriseServerJobWorkerHeartbeat>>
): Record<string, string> {
  return {
    "x-sena-server-job-worker-heartbeat": heartbeat.status,
    "x-sena-server-job-worker-heartbeat-store": heartbeat.statusStore.activeStore,
    "x-sena-server-job-worker-heartbeat-final-status": heartbeat.heartbeat.finalStatus ?? "missing",
    "x-sena-server-job-worker-heartbeat-write-read": String(heartbeat.heartbeat.writeReadConfirmed),
    "x-sena-server-job-worker-heartbeat-proof-scope": heartbeat.proof.scope,
    "x-sena-server-job-worker-heartbeat-external-callback-observed": String(
      heartbeat.proof.authenticatedExternalCallbackObserved
    ),
    "x-sena-server-job-worker-heartbeat-production-ready-eligible": String(
      heartbeat.proof.productionWorkerReadinessEligible
    ),
    "x-sena-server-job-worker-heartbeat-url-values": "excluded"
  };
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-jobs-worker-heartbeat" }, async () => {
    const access = await requireOpsMutationAccess(request);
    const heartbeat = await verifyEnterpriseServerJobWorkerHeartbeat();
    return NextResponse.json({
      ...heartbeat,
      access
    }, {
      status: heartbeat.status === "pass" ? 200 : 503,
      headers: workerHeartbeatHeaders(heartbeat)
    });
  });
}
