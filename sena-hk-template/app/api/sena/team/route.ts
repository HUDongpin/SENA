import { NextResponse } from "next/server";
import { listEnterpriseTeamState } from "@/lib/sena/enterprise";
import { jsonError, requireApiSession } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = requireApiSession();
    return NextResponse.json({ schemaVersion: "sena-team-state/v1", ...listEnterpriseTeamState(context) });
  } catch (error) {
    return jsonError(error);
  }
}
