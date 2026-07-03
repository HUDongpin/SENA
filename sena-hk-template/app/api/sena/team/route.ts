import { NextResponse } from "next/server";
import {
  listEnterpriseTeamStateAsync
} from "@/lib/sena/enterprise/team-memberships";
import { observeSenaApiRoute, requireApiSession } from "@/lib/sena/api-helpers";
import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-team" }, async () => {
    const context = await requireApiSession();
    return NextResponse.json({ schemaVersion: SENA_SCHEMA_VERSIONS.teamState, ...await listEnterpriseTeamStateAsync(context) });
  });
}
