import { NextResponse } from "next/server";
import {
  getEnterpriseServerJobWorkerContract
} from "@/lib/sena/enterprise/server-job-worker-contract";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

function workerContractHeaders(contract: ReturnType<typeof getEnterpriseServerJobWorkerContract>): Record<string, string> {
  return {
    "x-sena-server-job-worker-contract": contract.status,
    "x-sena-server-job-worker-ready": String(contract.productionReady),
    "x-sena-server-job-worker-missing": contract.missing.join("|") || "none",
    "x-sena-server-job-worker-runtime": contract.worker.runtime,
    "x-sena-server-job-worker-callback": contract.worker.callbackConfigured ? "configured" : "missing",
    "x-sena-server-job-worker-heartbeat": contract.worker.heartbeatConfirmed
      ? "same-process-status-store-self-test-confirmed"
      : "missing",
    "x-sena-server-job-worker-status-store-self-test": contract.worker.heartbeatConfirmed ? "confirmed" : "missing",
    "x-sena-server-job-worker-external-callback-receipt": contract.worker.externalWorkerCallbackReceiptSupported
      ? (contract.worker.externalWorkerCallbackReceiptConfirmed ? "confirmed" : "missing")
      : "unsupported",
    "x-sena-server-job-worker-url-values": "excluded"
  };
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-jobs-worker-contract" }, async () => {
    const access = await requireOpsAccess(request);
    const contract = getEnterpriseServerJobWorkerContract();
    return NextResponse.json({
      ...contract,
      access
    }, {
      status: contract.productionReady ? 200 : 503,
      headers: workerContractHeaders(contract)
    });
  });
}
