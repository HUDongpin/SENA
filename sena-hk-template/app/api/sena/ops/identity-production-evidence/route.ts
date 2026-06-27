import { NextResponse } from "next/server";
import {
  listEnterprisePlatformDecisionAcceptances
} from "@/lib/sena/enterprise/ops-platform-decisions";
import {
  getEnterpriseIdentityProductionEvidence
} from "@/lib/sena/enterprise/identity-production-evidence";
import {
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
          "Team id is required for session-scoped identity production evidence access.",
          400,
          "identity_evidence_team_required"
        );
      }
      const context = await requireApiSession();
      listEnterprisePlatformDecisionAcceptances(context, { teamId });
    }
    const evidence = getEnterpriseIdentityProductionEvidence({ teamId });
    return NextResponse.json({
      ...evidence,
      access
    }, {
      headers: buildEnterpriseIdentityProductionEvidenceHeaders(evidence)
    });
  } catch (error) {
    return jsonError(error);
  }
}
