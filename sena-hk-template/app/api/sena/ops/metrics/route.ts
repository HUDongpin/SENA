import {
  getEnterpriseDeploymentReadinessWithPostgresEvidence
} from "@/lib/sena/enterprise/ops-deployment-readiness";
import {
  buildEnterpriseOpsMetricsWithPostgresEvidence
} from "@/lib/sena/enterprise/ops-metrics";
import {
  getEnterpriseOpsStatusWithPostgresEvidence
} from "@/lib/sena/enterprise/ops-status";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-metrics" }, async () => {
    await requireOpsAccess(request);
    const status = await getEnterpriseOpsStatusWithPostgresEvidence();
    const readiness = await getEnterpriseDeploymentReadinessWithPostgresEvidence({ opsStatus: status });
    return new Response(await buildEnterpriseOpsMetricsWithPostgresEvidence(status, readiness), {
      status: status.status === "degraded" ? 503 : 200,
      headers: {
        "content-type": "text/plain; version=0.0.4; charset=utf-8"
      }
    });
  });
}
