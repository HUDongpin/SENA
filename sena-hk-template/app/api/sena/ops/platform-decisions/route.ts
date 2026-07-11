import { NextResponse } from "next/server";
import {
  buildEnterprisePlatformDecisionListResponseWithPostgresState,
  buildEnterprisePlatformDecisionReviewResponseWithPostgresState
} from "@/lib/sena/enterprise/ops-response-builders";
import { observeSenaApiRoute, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-platform-decisions" }, async () => {
    const context = await requireApiSession();
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId")?.trim() || undefined;
    const response = await buildEnterprisePlatformDecisionListResponseWithPostgresState(context, { teamId });
    return NextResponse.json(response.body, { headers: response.headers });
  });
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-ops-platform-decisions" }, async () => {
    const context = await requireApiSessionForMutation(request);
    const response = await buildEnterprisePlatformDecisionReviewResponseWithPostgresState(context, await request.json());
    return NextResponse.json(response.body, {
      status: response.status,
      headers: response.headers
    });
  });
}
