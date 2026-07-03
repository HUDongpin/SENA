import { NextResponse } from "next/server";
import {
  verifyEnterpriseServerJobQueueProbe
} from "@/lib/sena/enterprise/server-job-queue";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

function serverJobQueueProbeHeaders(
  probe: Awaited<ReturnType<typeof verifyEnterpriseServerJobQueueProbe>>
): Record<string, string> {
  return {
    "x-sena-server-job-queue-probe": probe.status,
    "x-sena-server-job-queue-delivery": probe.probe.deliveryStatus,
    "x-sena-server-job-queue-attempted": String(probe.probe.attempted),
    "x-sena-server-job-queue-http-status": probe.probe.httpStatus ? String(probe.probe.httpStatus) : "missing",
    "x-sena-server-job-queue-provider": probe.provider.queueMode,
    "x-sena-server-job-queue-url-values": "excluded"
  };
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-jobs-probe" }, async () => {
    const access = await requireOpsAccess(request);
    const probe = await verifyEnterpriseServerJobQueueProbe();
    return NextResponse.json({
      ...probe,
      access
    }, {
      status: probe.status === "pass" ? 200 : 503,
      headers: serverJobQueueProbeHeaders(probe)
    });
  });
}
