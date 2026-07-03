import { NextResponse } from "next/server";
import {
  verifyEnterpriseCdnProbe
} from "@/lib/sena/enterprise/cdn-verification";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-cdn" }, async () => {
    const access = await requireOpsAccess(request);
    const probe = await verifyEnterpriseCdnProbe();
    return NextResponse.json({
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
  });
}
