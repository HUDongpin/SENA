import { NextResponse } from "next/server";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireOpsMutationAccess } from "@/lib/sena/ops-api";
import { SenaEnterpriseError } from "@/lib/sena/enterprise/errors";
import { issueWorkerProofChallenge } from "@/lib/sena/enterprise/server-job-worker-proof";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-jobs-worker-proof" }, async () => {
    const access = await requireOpsMutationAccess(request);
    if (access.mode !== "bearer") {
      throw new SenaEnterpriseError("Worker proof issuance requires an ops service bearer.", 403, "worker_proof_service_identity_required");
    }
    // No caller-supplied source, scope, nonce, callback, or configuration is admitted.
    const result = await issueWorkerProofChallenge();
    const body = result.status === "dispatch-failed"
      ? { ...result, error: "Worker proof dispatch failed.", code: "worker_proof_dispatch_failed" }
      : result;
    return NextResponse.json(body, {
      status: result.status === "confirmed" ? 200 : result.status === "pending" ? 202 : 503,
      headers: { "cache-control": "no-store", "x-sena-worker-proof": result.status }
    });
  });
}
