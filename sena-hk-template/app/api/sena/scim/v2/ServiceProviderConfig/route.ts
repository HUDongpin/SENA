import { NextResponse } from "next/server";
import { identityInstitutionActionPlanHeaders, jsonError } from "@/lib/sena/api-helpers";
import {
  getEnterpriseDeploymentReadiness,
  getEnterpriseIdentityProductionEvidence,
  type SenaEnterpriseDeploymentReadiness
} from "@/lib/sena/enterprise/ops-governance";
import { requireProvisioningBearerToken } from "@/lib/sena/provisioning-auth";
import {
  enterpriseScimServiceProviderConfig,
  senaScimIdentityProductionExtensionSchema
} from "@/lib/sena/scim";

export const runtime = "nodejs";

function locationBase(request: Request) {
  return new URL("/api/sena/scim/v2", request.url).toString();
}

function readinessItemStatus(readiness: SenaEnterpriseDeploymentReadiness, id: string) {
  return [...readiness.blocking, ...readiness.advisory].find((item) => item.id === id)?.status ?? "missing";
}

function scimProductionOwnerHeaders(
  evidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence>,
  readiness: SenaEnterpriseDeploymentReadiness
): Record<string, string> {
  const provisioningRequest = evidence.platformRequestPacket.requests
    .find((request) => request.decisionId === "institution-provisioning-owner");
  return {
    "x-sena-scim-production-owner-gate": evidence.status,
    "x-sena-identity-production-status": evidence.status,
    "x-sena-identity-release-gate-blocked": String(evidence.releaseGate.approvalBlocked),
    "x-sena-identity-request-blockers": String(evidence.platformRequestPacket.summary.blockingRequests),
    "x-sena-identity-production-blocking-decisions": evidence.releaseGate.productionBlockingDecisionIds.join("|") || "none",
    "x-sena-identity-provisioning-missing-evidence": provisioningRequest?.missingProductionEvidenceIds.join("|") || "none",
    "x-sena-identity-provisioning-missing-technical-prerequisites": provisioningRequest?.missingTechnicalPrerequisiteEvidenceIds.join("|") || "none",
    "x-sena-identity-lifecycle-owner-mode": readinessItemStatus(readiness, "identity-lifecycle-owner-mode"),
    "x-sena-identity-rotation-freshness": evidence.rotationFreshness.status,
    ...identityInstitutionActionPlanHeaders(evidence)
  };
}

function scimIdentityProductionExtension(
  evidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence>,
  readiness: SenaEnterpriseDeploymentReadiness
) {
  const provisioningRequest = evidence.platformRequestPacket.requests
    .find((request) => request.decisionId === "institution-provisioning-owner");
  return {
    schemaVersion: "sena-scim-identity-production-gate/v1",
    generatedAt: evidence.generatedAt,
    status: evidence.status,
    provisioningOwnerGate: evidence.status,
    releaseGateBlocked: evidence.releaseGate.approvalBlocked,
    lifecycleOwnerMode: readinessItemStatus(readiness, "identity-lifecycle-owner-mode"),
    missingEvidenceIds: provisioningRequest?.missingProductionEvidenceIds ?? [],
    missingTechnicalPrerequisiteEvidenceIds: provisioningRequest?.missingTechnicalPrerequisiteEvidenceIds ?? [],
    rotationFreshness: evidence.rotationFreshness.status,
    institutionActionPlan: {
      schemaVersion: evidence.institutionActionPlan.schemaVersion,
      status: evidence.institutionActionPlan.status,
      digest: evidence.institutionActionPlan.digest ?? "missing",
      summary: evidence.institutionActionPlan.summary
    },
    platformDecisionSubmission: {
      method: evidence.platformRequestPacket.submission.method,
      path: evidence.platformRequestPacket.submission.path,
      requiredBodyFields: evidence.platformRequestPacket.submission.requiredBodyFields,
      responseAuditHeaders: evidence.platformRequestPacket.submission.responseAuditHeaders
    },
    redaction: {
      secretValuesExcluded: true,
      evidenceUrlValuesExcluded: true,
      ownerNamesExcluded: true
    }
  };
}

export async function GET(request: Request) {
  try {
    requireProvisioningBearerToken(request);
    const identityEvidence = getEnterpriseIdentityProductionEvidence();
    const readiness = getEnterpriseDeploymentReadiness();
    return NextResponse.json(enterpriseScimServiceProviderConfig(locationBase(request), {
      [senaScimIdentityProductionExtensionSchema]: scimIdentityProductionExtension(identityEvidence, readiness)
    }), {
      headers: scimProductionOwnerHeaders(identityEvidence, readiness)
    });
  } catch (error) {
    return jsonError(error);
  }
}
