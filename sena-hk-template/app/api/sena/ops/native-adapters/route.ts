import { NextResponse } from "next/server";
import {
  getEnterpriseNativeAdapterCertification
} from "@/lib/sena/enterprise/ops-deployment";
import {
  listEnterprisePlatformDecisionAcceptances
} from "@/lib/sena/enterprise/ops-platform-decisions";
import {
  SenaEnterpriseError
} from "@/lib/sena/enterprise/errors";
import { observeSenaApiRoute, requireApiSession } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-native-adapters" }, async () => {
    const access = await requireOpsAccess(request);
    const teamId = new URL(request.url).searchParams.get("teamId")?.trim() || undefined;
    if (access.mode === "session") {
      if (!teamId) {
        throw new SenaEnterpriseError(
          "Team id is required for session-scoped native adapter certification access.",
          400,
          "native_adapter_certification_team_required"
        );
      }
      const context = await requireApiSession();
      listEnterprisePlatformDecisionAcceptances(context, { teamId });
    }
    return NextResponse.json({
      ...getEnterpriseNativeAdapterCertification({ teamId }),
      access
    });
  });
}
