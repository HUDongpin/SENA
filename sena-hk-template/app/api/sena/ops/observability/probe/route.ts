import { NextResponse } from "next/server";
import {
  verifyEnterpriseObservabilityProbe
} from "@/lib/sena/enterprise/ops-observability";
import { markSenaApiResponseInformational, observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

function observabilityProbeHeaders(probe: Awaited<ReturnType<typeof verifyEnterpriseObservabilityProbe>>): Record<string, string> {
  return {
    "x-sena-observability-probe": probe.status,
    "x-sena-observability-probe-delivery": probe.probe.deliveryStatus,
    "x-sena-observability-probe-attempted": String(probe.probe.attempted),
    "x-sena-observability-probe-http-status": probe.probe.httpStatus ? String(probe.probe.httpStatus) : "missing",
    "x-sena-observability-exporter": probe.provider.externalSinkConfigured ? "configured" : "missing",
    "x-sena-observability-url-values": "excluded"
  };
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-observability-probe" }, async () => {
    const access = await requireOpsAccess(request);
    const probe = await verifyEnterpriseObservabilityProbe();
    const response = NextResponse.json({
      ...probe,
      access
    }, {
      status: probe.status === "pass" ? 200 : 503,
      headers: observabilityProbeHeaders(probe)
    });
    // The delivery status separates the two 503s this route can produce:
    // "not-configured" means no exporter is set and nothing was sent, while
    // "failed" means a configured sink was posted to and rejected or timed out.
    // Only the former is a report; the latter keeps counting as a server error.
    return probe.probe.deliveryStatus === "not-configured"
      ? markSenaApiResponseInformational(response)
      : response;
  });
}
