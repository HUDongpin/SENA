import { NextResponse } from "next/server";
import {
  listEnterprisePlatformDecisionAcceptances
} from "@/lib/sena/enterprise/ops-platform-decisions";
import {
  getEnterpriseCapabilityAudit
} from "@/lib/sena/enterprise/ops-capability-audit";
import {
  getEnterpriseIdentityProductionEvidence
} from "@/lib/sena/enterprise/identity-production-evidence";
import {
  buildEnterpriseAuthCapabilityHeaders,
  buildEnterpriseIdentityPerDecisionMissingEvidenceHeaders,
  buildEnterpriseIdentityProductionEvidenceHeaders
} from "@/lib/sena/enterprise/ops-response-builders";
import {
  SenaEnterpriseError
} from "@/lib/sena/enterprise/errors";
import { jsonError, requireApiSession } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const access = await requireOpsAccess(request);
    const teamId = new URL(request.url).searchParams.get("teamId")?.trim() || undefined;
    if (access.mode === "session") {
      if (!teamId) {
        throw new SenaEnterpriseError(
          "Team id is required for session-scoped capability audit access.",
          400,
          "capability_audit_team_required"
        );
      }
      const context = await requireApiSession();
      listEnterprisePlatformDecisionAcceptances(context, { teamId });
    }
    const audit = getEnterpriseCapabilityAudit({ teamId });
    const identityProductionEvidence = getEnterpriseIdentityProductionEvidence({ teamId });
    return NextResponse.json({
      ...audit,
      identityProductionEvidence,
      access
    }, {
      headers: {
        ...buildEnterpriseAuthCapabilityHeaders(audit),
        ...buildEnterpriseIdentityProductionEvidenceHeaders(identityProductionEvidence),
        ...buildEnterpriseIdentityPerDecisionMissingEvidenceHeaders(identityProductionEvidence)
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
