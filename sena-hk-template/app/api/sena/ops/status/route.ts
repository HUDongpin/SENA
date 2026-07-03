import { NextResponse } from "next/server";
import {
  getEnterpriseDeploymentReadinessWithPostgresEvidence,
  type SenaEnterpriseDeploymentReadiness
} from "@/lib/sena/enterprise/ops-deployment-readiness";
import {
  getEnterpriseOpsStatusWithPostgresEvidence,
  type SenaEnterpriseOpsStatus
} from "@/lib/sena/enterprise/ops-status";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

const identityReadinessIds = [
  "identity-evidence-host-allowlist",
  "identity-secret-version-binding",
  "identity-secret-store-reference",
  "identity-secret-rotation-cadence",
  "identity-idp-tenant-binding",
  "identity-lifecycle-owner-mode"
] as const;

function readinessItemStatus(readiness: SenaEnterpriseDeploymentReadiness, id: string) {
  return readiness.blocking.find((item) => item.id === id)?.status ?? "missing";
}

function opsStatusHeaders(
  status: SenaEnterpriseOpsStatus,
  readiness: SenaEnterpriseDeploymentReadiness
): Record<string, string> {
  const identityBlockers = readiness.summary.blockers
    .filter((blocker) => identityReadinessIds.includes(blocker as (typeof identityReadinessIds)[number]));
  return {
    "x-sena-ops-status": status.status,
    "x-sena-deployment-readiness-status": readiness.status,
    "x-sena-identity-readiness-blocking-count": String(identityBlockers.length),
    "x-sena-identity-readiness-blockers": identityBlockers.join("|") || "none",
    "x-sena-identity-evidence-host-allowlist": readinessItemStatus(readiness, "identity-evidence-host-allowlist"),
    "x-sena-identity-secret-version-binding": readinessItemStatus(readiness, "identity-secret-version-binding"),
    "x-sena-identity-secret-store-reference": readinessItemStatus(readiness, "identity-secret-store-reference"),
    "x-sena-identity-secret-rotation-cadence": readinessItemStatus(readiness, "identity-secret-rotation-cadence"),
    "x-sena-identity-idp-tenant-binding": readinessItemStatus(readiness, "identity-idp-tenant-binding"),
    "x-sena-identity-lifecycle-owner-mode": readinessItemStatus(readiness, "identity-lifecycle-owner-mode")
  };
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-status" }, async () => {
    const access = await requireOpsAccess(request);
    const status = await getEnterpriseOpsStatusWithPostgresEvidence();
    const readiness = await getEnterpriseDeploymentReadinessWithPostgresEvidence({ opsStatus: status });
    return NextResponse.json({
      ...status,
      access
    }, {
      status: status.status === "degraded" ? 503 : 200,
      headers: opsStatusHeaders(status, readiness)
    });
  });
}
