import { NextResponse } from "next/server";
import {
  getEnterpriseSaasOperationsReadiness
} from "@/lib/sena/enterprise/ops-deployment";
import type {
  SenaEnterpriseSaasOperationsReadiness
} from "@/lib/sena/enterprise/ops-saas-operations";
import {
  listEnterprisePlatformDecisionAcceptances
} from "@/lib/sena/enterprise/ops-platform-decisions";
import {
  SenaEnterpriseError
} from "@/lib/sena/enterprise/errors";
import { jsonError, requireApiSession } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

function evidenceValue(evidence: string[], key: string) {
  return evidence
    .find((entry) => entry.startsWith(`${key}=`))
    ?.slice(key.length + 1) ?? "missing";
}

function saasOperationsReadinessHeaders(readiness: SenaEnterpriseSaasOperationsReadiness): Record<string, string> {
  return {
    "x-sena-saas-operations-status": readiness.status,
    "x-sena-saas-operations-blockers": readiness.summary.blockers.join("|") || "none",
    "x-sena-identity-production-status": readiness.summary.identityProductionStatus,
    "x-sena-identity-submission-verifier-incomplete": String(readiness.summary.identitySubmissionVerifierIncomplete),
    "x-sena-identity-rotation-freshness": readiness.summary.identityRotationFreshness,
    "x-sena-identity-cutover-checklist": readiness.summary.identityCutoverChecklist,
    "x-sena-identity-cutover-blockers": String(readiness.summary.identityCutoverBlockers),
    "x-sena-identity-release-gate-digest-binding": evidenceValue(
      readiness.evidence,
      "identityProductionReleaseGateDigestBinding"
    ),
    "x-sena-identity-latest-release-gate-evidence-binding-digest": evidenceValue(
      readiness.evidence,
      "latestReleaseGateIdentityEvidenceBindingDigest"
    ),
    "x-sena-identity-current-evidence-binding-digest": evidenceValue(
      readiness.evidence,
      "currentIdentityProductionEvidenceBindingDigest"
    )
  };
}

export async function GET(request: Request) {
  try {
    const access = await requireOpsAccess(request);
    const teamId = new URL(request.url).searchParams.get("teamId")?.trim() || undefined;
    if (access.mode === "session") {
      if (!teamId) {
        throw new SenaEnterpriseError(
          "Team id is required for session-scoped SaaS operations readiness access.",
          400,
          "saas_operations_team_required"
        );
      }
      const context = await requireApiSession();
      listEnterprisePlatformDecisionAcceptances(context, { teamId });
    }
    const readiness = getEnterpriseSaasOperationsReadiness({ teamId });
    return NextResponse.json({
      ...readiness,
      access
    }, {
      headers: saasOperationsReadinessHeaders(readiness)
    });
  } catch (error) {
    return jsonError(error);
  }
}
