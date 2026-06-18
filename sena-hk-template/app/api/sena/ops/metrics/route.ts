import {
  buildEnterpriseOpsMetrics,
  getEnterpriseDeploymentReadiness,
  getEnterpriseOpsStatus
} from "@/lib/sena/enterprise/ops-governance";
import { jsonError } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    requireOpsAccess(request);
    const status = getEnterpriseOpsStatus();
    const readiness = getEnterpriseDeploymentReadiness();
    return new Response(buildEnterpriseOpsMetrics(status, readiness), {
      status: status.status === "degraded" ? 503 : 200,
      headers: {
        "content-type": "text/plain; version=0.0.4; charset=utf-8"
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
