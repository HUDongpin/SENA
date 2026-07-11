import { NextResponse } from "next/server";
import {
  getEnterpriseDeploymentReadinessWithPostgresEvidence,
  type SenaEnterpriseDeploymentReadiness
} from "@/lib/sena/enterprise/ops-deployment-readiness";
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

const productionPerformanceIds = [
  "production-postgres-state",
  "production-runtime-header",
  "production-object-storage",
  "production-cdn-compression",
  "production-server-job-queue",
  "production-observability",
  "production-performance-budget",
  "production-conference-load-rehearsal"
] as const;

function readinessItemStatus(readiness: SenaEnterpriseDeploymentReadiness, id: string) {
  return readiness.blocking.find((item) => item.id === id)?.status ?? "missing";
}

function deploymentReadinessHeaders(readiness: SenaEnterpriseDeploymentReadiness): Record<string, string> {
  const identityBlockers = readiness.summary.blockers
    .filter((blocker) => identityReadinessIds.includes(blocker as (typeof identityReadinessIds)[number]));
  const productionPerformanceBlockers = readiness.productionPerformancePath.summary.blockers
    .filter((blocker) => productionPerformanceIds.includes(blocker));
  return {
    "x-sena-deployment-readiness-status": readiness.status,
    "x-sena-deployment-readiness-blocking-review": String(readiness.summary.blockingReview),
    "x-sena-deployment-readiness-blockers": readiness.summary.blockers.join("|") || "none",
    "x-sena-identity-readiness-blockers": identityBlockers.join("|") || "none",
    "x-sena-identity-evidence-host-allowlist": readinessItemStatus(readiness, "identity-evidence-host-allowlist"),
    "x-sena-identity-secret-version-binding": readinessItemStatus(readiness, "identity-secret-version-binding"),
    "x-sena-identity-secret-store-reference": readinessItemStatus(readiness, "identity-secret-store-reference"),
    "x-sena-identity-secret-rotation-cadence": readinessItemStatus(readiness, "identity-secret-rotation-cadence"),
    "x-sena-identity-idp-tenant-binding": readinessItemStatus(readiness, "identity-idp-tenant-binding"),
    "x-sena-identity-lifecycle-owner-mode": readinessItemStatus(readiness, "identity-lifecycle-owner-mode"),
    "x-sena-production-performance-path": readiness.productionPerformancePath.status,
    "x-sena-production-performance-blockers": productionPerformanceBlockers.join("|") || "none"
  };
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-readiness" }, async () => {
    const access = await requireOpsAccess(request);
    const readiness = await getEnterpriseDeploymentReadinessWithPostgresEvidence();
    return NextResponse.json({
      ...readiness,
      access
    }, {
      status: readiness.status === "blocked" ? 503 : 200,
      headers: deploymentReadinessHeaders(readiness)
    });
  });
}
