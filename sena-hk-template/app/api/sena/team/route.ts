import { NextResponse } from "next/server";
import {
  listEnterpriseTeamState
} from "@/lib/sena/enterprise/team-project";
import { jsonError, requireApiSession } from "@/lib/sena/api-helpers";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";

export const runtime = "nodejs";

export async function GET() {
  try {
    const context = requireApiSession();
    return NextResponse.json({ schemaVersion: SENA_SCHEMA_VERSIONS.teamState, ...listEnterpriseTeamState(context) });
  } catch (error) {
    return jsonError(error);
  }
}
