import { NextResponse } from "next/server";
import {
  buildEnterprisePlatformDecisionListResponse,
  buildEnterprisePlatformDecisionReviewResponse
} from "@/lib/sena/enterprise/ops-response-builders";
import { jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await requireApiSession();
    const url = new URL(request.url);
    const teamId = url.searchParams.get("teamId")?.trim() || undefined;
    const response = buildEnterprisePlatformDecisionListResponse(context, { teamId });
    return NextResponse.json(response.body, { headers: response.headers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireApiSessionForMutation(request);
    const response = buildEnterprisePlatformDecisionReviewResponse(context, await request.json());
    return NextResponse.json(response.body, {
      status: response.status,
      headers: response.headers
    });
  } catch (error) {
    return jsonError(error);
  }
}
