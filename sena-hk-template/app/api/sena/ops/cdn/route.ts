import { NextResponse } from "next/server";
import {
  verifyEnterpriseCdnProbe
} from "@/lib/sena/enterprise/cdn-verification";
import { markSenaApiResponseInformational, observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-cdn" }, async () => {
    const access = await requireOpsAccess(request);
    const probe = await verifyEnterpriseCdnProbe();
    const response = NextResponse.json({
      ...probe,
      access
    }, {
      status: probe.status === "pass" ? 200 : 503,
      headers: {
        "x-sena-cdn-probe": probe.status,
        "x-sena-cdn-html-compression": probe.html.status,
        "x-sena-cdn-static-cache": probe.staticAsset.status,
        "x-sena-cdn-target-host-hash": probe.target.hostHash ?? "missing",
        "x-sena-cdn-url-value": "excluded"
      }
    });
    // No target URL in env means no fetch was made (lib/sena/enterprise/cdn-verification.ts:411),
    // so the 503 reports an unset edge. The fetch_error and timeout branches keep
    // `target.configured` true — a CDN that was dialled and did not answer is a
    // real error and still burns error budget.
    return probe.target.configured === false
      ? markSenaApiResponseInformational(response)
      : response;
  });
}
