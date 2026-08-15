import { NextResponse } from "next/server";
import {
  getEnterpriseObservabilitySnapshotWithPostgresEvidence,
  type SenaEnterpriseObservabilitySnapshot
} from "@/lib/sena/enterprise/ops-observability";
import { requireOpsAccess } from "@/lib/sena/ops-api";
import { markSenaApiResponseInformational, observeSenaApiRoute } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

function observabilityHeaders(snapshot: SenaEnterpriseObservabilitySnapshot): Record<string, string> {
  return {
    "x-sena-observability-status": snapshot.status,
    "x-sena-observability-total": String(snapshot.summary.total),
    "x-sena-observability-errors": String(snapshot.summary.errors),
    "x-sena-observability-p95-ms": String(snapshot.summary.p95Ms),
    "x-sena-observability-error-rate-percent": String(snapshot.summary.errorRatePercent),
    "x-sena-observability-external-sink": snapshot.provider.externalSinkConfigured ? "configured" : "missing",
    "x-sena-observability-dashboard": snapshot.provider.dashboardConfigured ? "configured" : "missing",
    "x-sena-observability-url-values": "excluded"
  };
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-observability" }, async () => {
    const access = await requireOpsAccess(request);
    const snapshot = await getEnterpriseObservabilitySnapshotWithPostgresEvidence();
    const response = NextResponse.json({
      ...snapshot,
      access
    }, {
      status: snapshot.status === "pass" ? 200 : 503,
      headers: observabilityHeaders(snapshot)
    });
    // `status: "review"` has two very different causes, and only one of them is
    // this endpoint reporting a state rather than a failure. An unconfigured
    // deployment has no external sink and nothing was dialled. A breached SLO is
    // the signal this endpoint exists to raise — marking that informational would
    // mute the alert with the alert's own reading, so it is excluded explicitly
    // rather than left to the readiness flag to imply.
    const nothingDialled = snapshot.provider.externalSinkConfigured === false;
    return nothingDialled && !snapshot.summary.sloBreached
      ? markSenaApiResponseInformational(response)
      : response;
  });
}
