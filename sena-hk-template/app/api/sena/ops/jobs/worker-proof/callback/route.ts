import { NextResponse } from "next/server";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { readWorkerProofCallbackRequest, receiveWorkerProofCallback } from "@/lib/sena/enterprise/server-job-worker-proof";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-jobs-worker-proof-callback" }, async () => {
    const raw = await readWorkerProofCallbackRequest(request);
    const receipt = await receiveWorkerProofCallback(raw);
    return NextResponse.json(receipt, {
      headers: { "cache-control": "no-store", "x-sena-worker-proof-callback": "accepted" }
    });
  });
}
