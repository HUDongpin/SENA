import { NextResponse } from "next/server";
import {
  verifyEnterpriseObjectStorageProbe
} from "@/lib/sena/enterprise/object-storage-adapter";
import { markSenaApiResponseInformational, observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

function objectStorageProbeHeaders(probe: Awaited<ReturnType<typeof verifyEnterpriseObjectStorageProbe>>): Record<string, string> {
  return {
    "x-sena-object-storage-probe": probe.status,
    "x-sena-object-storage-provider": probe.provider.mode,
    "x-sena-object-storage-put": probe.probe.put.status,
    "x-sena-object-storage-head": probe.probe.head.status,
    "x-sena-object-storage-delete": probe.probe.delete.status,
    "x-sena-object-storage-cleanup": probe.probe.cleanupStatus,
    "x-sena-object-storage-object-key-hash": probe.probe.objectKeyHash ?? "missing",
    "x-sena-object-storage-url-values": "excluded"
  };
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-object-storage" }, async () => {
    const access = await requireOpsAccess(request);
    const probe = await verifyEnterpriseObjectStorageProbe();
    const response = NextResponse.json({
      ...probe,
      access
    }, {
      status: probe.status === "pass" ? 200 : 503,
      headers: objectStorageProbeHeaders(probe)
    });
    // `provider.configured === false` is exactly the branch that returns before a
    // single signed request is issued (lib/sena/enterprise/object-storage-adapter.ts:1015),
    // covering both mode "not-configured" and an adapter named without its bucket
    // or credentials. It is decided from env alone, so no outage can reach it.
    // Once configured, a PUT/HEAD/DELETE that came back not-ok leaves this true and
    // the 503 stays the server error it is.
    return probe.provider.configured === false
      ? markSenaApiResponseInformational(response)
      : response;
  });
}
