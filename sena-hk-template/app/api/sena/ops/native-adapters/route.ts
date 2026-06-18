import { NextResponse } from "next/server";
import {
  getEnterpriseNativeAdapterCertification,
  listEnterprisePlatformDecisionAcceptances,
  SenaEnterpriseError
} from "@/lib/sena/enterprise";
import { jsonError, requireApiSession } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const access = requireOpsAccess(request);
    const teamId = new URL(request.url).searchParams.get("teamId")?.trim() || undefined;
    if (access.mode === "session") {
      if (!teamId) {
        throw new SenaEnterpriseError(
          "Team id is required for session-scoped native adapter certification access.",
          400,
          "native_adapter_certification_team_required"
        );
      }
      const context = requireApiSession();
      listEnterprisePlatformDecisionAcceptances(context, { teamId });
    }
    return NextResponse.json({
      ...getEnterpriseNativeAdapterCertification({ teamId }),
      access
    });
  } catch (error) {
    return jsonError(error);
  }
}
