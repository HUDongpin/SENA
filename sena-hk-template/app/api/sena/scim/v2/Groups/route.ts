import { NextResponse } from "next/server";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireProvisioningBearerToken } from "@/lib/sena/provisioning-auth";
import {
  listEnterpriseScimGroups,
  provisionEnterpriseScimGroup,
  type SenaScimListQuery,
  type SenaScimProvisioningOptions,
  scimErrorBody
} from "@/lib/sena/scim";

export const runtime = "nodejs";

function scimOptions(request: Request): SenaScimProvisioningOptions {
  const url = new URL(request.url);
  return {
    organization: url.searchParams.get("organization") || undefined,
    dryRun: url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true",
    locationBase: new URL("/api/sena/scim/v2", request.url).toString()
  };
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-scim-groups", errorBody: scimErrorBody }, async () => {
    requireProvisioningBearerToken(request);
    const body = await request.json();
    const bridge = await provisionEnterpriseScimGroup(body, scimOptions(request));
    return NextResponse.json(bridge.resource, {
      status: bridge.provisioning.summary.teamsCreated > 0 ? 201 : 200
    });
  });
}

function scimListQuery(request: Request): SenaScimListQuery {
  const url = new URL(request.url);
  return {
    filter: url.searchParams.get("filter"),
    startIndex: url.searchParams.get("startIndex"),
    count: url.searchParams.get("count")
  };
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-scim-groups", errorBody: scimErrorBody }, async () => {
    requireProvisioningBearerToken(request);
    return NextResponse.json(await listEnterpriseScimGroups(scimOptions(request).locationBase, scimListQuery(request)));
  });
}
