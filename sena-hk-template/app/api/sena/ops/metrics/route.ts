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
    // A Prometheus scrape target answers 200 whenever it can produce an
    // exposition body, including — especially — while the deployment is degraded.
    // A non-2xx here is a FAILED scrape: `up` drops to 0 and not one sample line
    // is ingested, so `sena_enterprise_degraded 1` and `sena_enterprise_ready 0`
    // were computed, serialised, and then discarded on exactly the requests where
    // they were true. An alert written `sena_enterprise_degraded == 1` could never
    // fire, leaving only a bare `up == 0` that says nothing about what degraded.
    // The degradation is reported by the gauges in the body; the status line
    // reports whether the scrape itself succeeded. Failures that genuinely prevent
    // a body — auth refusals, an unexpected throw — still surface as non-2xx
    // through observeSenaApiRoute.
    return new Response(await buildEnterpriseOpsMetricsWithPostgresEvidence(status, readiness), {
      status: 200,
      headers: {
        "content-type": "text/plain; version=0.0.4; charset=utf-8"
      }
    });
  });
}
