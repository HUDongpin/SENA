import { NextResponse } from "next/server";
import {
  getEnterpriseOrganizationDeploymentPackageWithPostgresEvidence
} from "@/lib/sena/enterprise/ops-deployment";
import {
  listEnterprisePlatformDecisionAcceptances
} from "@/lib/sena/enterprise/ops-platform-decisions";
import {
  buildEnterpriseIdentityProductionHandoffHeaders
} from "@/lib/sena/enterprise/ops-response-builders";
import {
  SenaEnterpriseError
} from "@/lib/sena/enterprise/errors";
import { observeSenaApiRoute, requireApiSession } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-deployment" }, async () => {
    const access = await requireOpsAccess(request);
    const teamId = new URL(request.url).searchParams.get("teamId")?.trim() || undefined;
    if (access.mode === "session") {
      if (!teamId) {
        throw new SenaEnterpriseError(
          "Team id is required for session-scoped deployment package access.",
          400,
          "deployment_package_team_required"
        );
      }
      const context = await requireApiSession();
      listEnterprisePlatformDecisionAcceptances(context, { teamId });
    }
    const deployment = await getEnterpriseOrganizationDeploymentPackageWithPostgresEvidence({ teamId });
    return NextResponse.json({
      ...deployment,
      access
    }, {
      status: deployment.status === "blocked" ? 503 : 200,
      headers: buildEnterpriseIdentityProductionHandoffHeaders(deployment.identityProductionHandoff)
    });
  });
}
