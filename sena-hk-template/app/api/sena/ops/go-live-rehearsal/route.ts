import { NextResponse } from "next/server";
import {
  buildEnterpriseGoLivePostResponse,
  buildEnterpriseGoLiveRehearsalResponse
} from "@/lib/sena/enterprise/ops-response-builders";
import { jsonError, requireApiSession, requireApiSessionForMutation } from "@/lib/sena/api-helpers";
import { requireOpsAccess } from "@/lib/sena/ops-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const access = await requireOpsAccess(request);
    const url = new URL(request.url);
    const artifact = url.searchParams.get("artifact");
    const teamId = url.searchParams.get("teamId")?.trim() || undefined;
    let sessionContext: Awaited<ReturnType<typeof requireApiSession>> | undefined;
    if (access.mode === "session") {
      sessionContext = await requireApiSession();
    }
    const includeAttestations = url.searchParams.get("attestations") === "1";
    const response = buildEnterpriseGoLiveRehearsalResponse({
      teamId,
      artifact,
      access,
      includeAttestations,
      context: sessionContext ?? (includeAttestations ? await requireApiSession() : undefined)
    });
    return NextResponse.json(response.body, { headers: response.headers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireApiSessionForMutation(request);
    const response = buildEnterpriseGoLivePostResponse(context, await request.json());
    return NextResponse.json(response.body, {
      status: response.status,
      headers: response.headers
    });
  } catch (error) {
    return jsonError(error);
  }
}
