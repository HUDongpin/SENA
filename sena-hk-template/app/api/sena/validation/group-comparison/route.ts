import { NextResponse } from "next/server";
import {
  buildEnterpriseGroupComparisonValidationResponse,
  buildEnterpriseValidationRunListResponse,
  buildEnterpriseValidationRunReviewResponse
} from "@/lib/sena/enterprise/validation-runs";
import { jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await requireApiSession();
    const url = new URL(request.url);
    const response = buildEnterpriseValidationRunListResponse(context, {
      teamId: url.searchParams.get("teamId") || undefined,
      projectId: url.searchParams.get("projectId") || undefined
    });
    return NextResponse.json(response.body);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json() as Record<string, unknown>;
    const response = buildEnterpriseGroupComparisonValidationResponse(context, body);
    return NextResponse.json(response.body, { headers: response.headers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireApiSessionForMutation(request);
    const body = await request.json();
    const response = buildEnterpriseValidationRunReviewResponse(context, body);
    return NextResponse.json(response.body, { headers: response.headers });
  } catch (error) {
    return jsonError(error);
  }
}
