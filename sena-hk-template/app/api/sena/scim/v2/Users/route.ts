import { NextResponse } from "next/server";
import { jsonError } from "@/lib/sena/api-helpers";
import { requireProvisioningBearerToken } from "@/lib/sena/provisioning-auth";
import { listEnterpriseScimUsers, provisionEnterpriseScimUser, type SenaScimProvisioningOptions } from "@/lib/sena/scim";

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
  try {
    requireProvisioningBearerToken(request);
    const body = await request.json();
    const bridge = provisionEnterpriseScimUser(body, scimOptions(request));
    return NextResponse.json(bridge.resource, {
      status: bridge.provisioning.summary.usersCreated > 0 ? 201 : 200
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  try {
    requireProvisioningBearerToken(request);
    return NextResponse.json(listEnterpriseScimUsers(scimOptions(request).locationBase));
  } catch (error) {
    return jsonError(error);
  }
}
