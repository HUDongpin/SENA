import { NextResponse } from "next/server";
import {
  getEnterpriseDeploymentReadiness,
  getEnterpriseGovernanceStatus,
  getEnterpriseIdentityProductionEvidence,
  type SenaEnterpriseDeploymentReadiness,
  type SenaEnterpriseGovernanceStatus
} from "@/lib/sena/enterprise/ops-governance";
import { jsonError, requireApiSession } from "@/lib/sena/api-helpers";

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

function governanceHealthHeaders(
  governance: SenaEnterpriseGovernanceStatus,
  readiness: SenaEnterpriseDeploymentReadiness,
  identityEvidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence>
): Record<string, string> {
  const identityBlockers = readiness.summary.blockers
    .filter((blocker) => identityReadinessIds.includes(blocker as (typeof identityReadinessIds)[number]));
  return {
    "x-sena-governance-status": governance.status,
    "x-sena-deployment-readiness-status": readiness.status,
    "x-sena-identity-readiness-blocking-count": String(identityBlockers.length),
    "x-sena-identity-readiness-blockers": identityBlockers.join("|") || "none",
    "x-sena-identity-evidence-host-allowlist": readinessItemStatus(readiness, "identity-evidence-host-allowlist"),
    "x-sena-identity-secret-version-binding": readinessItemStatus(readiness, "identity-secret-version-binding"),
    "x-sena-identity-secret-store-reference": readinessItemStatus(readiness, "identity-secret-store-reference"),
    "x-sena-identity-secret-rotation-cadence": readinessItemStatus(readiness, "identity-secret-rotation-cadence"),
    "x-sena-identity-idp-tenant-binding": readinessItemStatus(readiness, "identity-idp-tenant-binding"),
    "x-sena-identity-lifecycle-owner-mode": readinessItemStatus(readiness, "identity-lifecycle-owner-mode"),
    "x-sena-identity-production-status": identityEvidence.status,
    "x-sena-identity-release-gate-blocked": String(identityEvidence.releaseGate.approvalBlocked),
    "x-sena-identity-request-blockers": String(identityEvidence.platformRequestPacket.summary.blockingRequests),
    "x-sena-identity-production-blocking-decisions": identityEvidence.releaseGate.productionBlockingDecisionIds.join("|") || "none",
    "x-sena-identity-missing-evidence-ids": identityEvidence.evidenceManifest.missingEvidenceIds.join("|") || "none",
    "x-sena-identity-cutover-checklist": identityEvidence.cutoverChecklist.status,
    "x-sena-identity-cutover-blockers": String(identityEvidence.cutoverChecklist.summary.blockingItems)
  };
}

export async function GET() {
  try {
    requireApiSession();
    const governance = getEnterpriseGovernanceStatus();
    const readiness = getEnterpriseDeploymentReadiness();
    const identityEvidence = getEnterpriseIdentityProductionEvidence();
    return NextResponse.json(governance, {
      headers: governanceHealthHeaders(governance, readiness, identityEvidence)
    });
  } catch (error) {
    return jsonError(error);
  }
}
