import { NextResponse } from "next/server";
import {
  verifyEnterprisePostgresProbe
} from "@/lib/sena/enterprise-postgres";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

function postgresProbeHeaders(probe: Awaited<ReturnType<typeof verifyEnterprisePostgresProbe>>): Record<string, string> {
  return {
    "x-sena-postgres-probe": probe.status,
    "x-sena-postgres-provider": probe.provider.adapter ?? "missing",
    "x-sena-postgres-create-table": probe.probe.createTable.status,
    "x-sena-postgres-insert": probe.probe.insert.status,
    "x-sena-postgres-select": probe.probe.select.status,
    "x-sena-postgres-delete": probe.probe.delete.status,
    "x-sena-postgres-cleanup": probe.probe.cleanupStatus,
    "x-sena-postgres-connection-value": "excluded"
  };
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-postgres" }, async () => {
    const access = await requireOpsAccess(request);
    const probe = await verifyEnterprisePostgresProbe();
    return NextResponse.json({
      ...probe,
      access
    }, {
      status: probe.status === "pass" ? 200 : 503,
      headers: postgresProbeHeaders(probe)
    });
  });
}
