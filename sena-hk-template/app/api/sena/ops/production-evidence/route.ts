import { NextResponse } from "next/server";
import {
  buildEnterpriseProductionEvidenceManifest
} from "@/lib/sena/enterprise/ops-production-evidence";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

function productionEvidenceHeaders(
  manifest: ReturnType<typeof buildEnterpriseProductionEvidenceManifest>
): Record<string, string> {
  const vercelPreflightItem = manifest.items.find((item) => item.id === "vercel-production-preflight");
  const performanceBudgetItem = manifest.items.find((item) => item.id === "performance-budget-artifact");
  const conferenceLoadItem = manifest.items.find((item) => item.id === "conference-load-rehearsal");
  const workerContractItem = manifest.items.find((item) => item.id === "server-job-worker-contract");
  const runtimeEnvPacket = manifest.advisoryItems.find((item) => item.id === "production-runtime-env-packet");
  const productionGoLiveGate = manifest.advisoryItems.find((item) => item.id === "production-go-live-gate");
  const runtimeEnvPacketProviderGroups =
    runtimeEnvPacket?.readyProviderGroups !== undefined && runtimeEnvPacket.requiredProviderGroups !== undefined
      ? `${runtimeEnvPacket.readyProviderGroups}/${runtimeEnvPacket.requiredProviderGroups}`
      : "missing";
  const productionGoLiveGateChecks =
    productionGoLiveGate?.passedChecks !== undefined && productionGoLiveGate.totalChecks !== undefined
      ? `${productionGoLiveGate.passedChecks}/${productionGoLiveGate.totalChecks}`
      : "missing";
  return {
    "x-sena-production-evidence-status": manifest.status,
    "x-sena-production-evidence-confirmed": String(manifest.summary.confirmed),
    "x-sena-production-evidence-missing": String(manifest.summary.missing),
    "x-sena-production-evidence-missing-required": String(manifest.summary.missingRequired),
    "x-sena-production-evidence-advisory-confirmed": String(manifest.summary.advisoryConfirmed),
    "x-sena-production-evidence-vercel-preflight": vercelPreflightItem?.status ?? "missing",
    "x-sena-production-evidence-performance-budget": String(manifest.summary.performanceBudgetConfirmed),
    "x-sena-production-evidence-performance-budget-artifact": performanceBudgetItem?.status ?? "missing",
    "x-sena-production-evidence-server-job-worker-contract": workerContractItem?.status ?? "missing",
    "x-sena-production-evidence-conference-load-rehearsal": conferenceLoadItem?.status ?? "missing",
    "x-sena-production-runtime-env-packet": runtimeEnvPacket?.status ?? "missing",
    "x-sena-production-runtime-env-packet-status": runtimeEnvPacket?.packetStatus ?? "missing",
    "x-sena-production-runtime-env-packet-provider-groups": runtimeEnvPacketProviderGroups,
    "x-sena-production-go-live-gate": productionGoLiveGate?.status ?? "missing",
    "x-sena-production-go-live-gate-status": productionGoLiveGate?.gateStatus ?? "missing",
    "x-sena-production-go-live-gate-ready-claim": String(productionGoLiveGate?.productionReadyClaimAllowed ?? "missing"),
    "x-sena-production-go-live-gate-checks": productionGoLiveGateChecks,
    "x-sena-production-evidence-secret-values": "excluded",
    "x-sena-production-evidence-endpoint-values": "hashed"
  };
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-production-evidence" }, async () => {
    const access = await requireOpsAccess(request);
    const manifest = buildEnterpriseProductionEvidenceManifest();
    return NextResponse.json({
      ...manifest,
      access
    }, {
      status: manifest.status === "blocked" ? 503 : 200,
      headers: productionEvidenceHeaders(manifest)
    });
  });
}
