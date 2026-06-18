import { NextResponse } from "next/server";
import { jsonError } from "@/lib/sena/api-helpers";
import { requireProvisioningBearerToken } from "@/lib/sena/provisioning-auth";
import { patchEnterpriseScimUser, provisionEnterpriseScimUser, type SenaScimProvisioningOptions } from "@/lib/sena/scim";

export const runtime = "nodejs";

function scimOptions(request: Request): SenaScimProvisioningOptions {
  const url = new URL(request.url);
  return {
    organization: url.searchParams.get("organization") || undefined,
    dryRun: url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true",
    locationBase: new URL("/api/sena/scim/v2", request.url).toString()
  };
}

async function upsertUser(request: Request, resourceId: string) {
  requireProvisioningBearerToken(request);
  const body = await request.json();
  const resource = typeof body === "object" && body !== null && !Array.isArray(body)
    ? { id: resourceId, ...body }
    : { id: resourceId };
  const bridge = provisionEnterpriseScimUser(resource, scimOptions(request));
  return NextResponse.json(bridge.resource);
}

export async function PUT(request: Request, { params }: { params: { resourceId: string } }) {
  try {
    return await upsertUser(request, params.resourceId);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: { resourceId: string } }) {
  try {
    requireProvisioningBearerToken(request);
    const body = await request.json();
    const schemas = typeof body === "object" && body !== null && !Array.isArray(body) && Array.isArray(body.schemas)
      ? body.schemas
      : [];
    const isPatchOp = schemas.some((schema: unknown) => String(schema).toLowerCase().includes("patchop")) ||
      (typeof body === "object" && body !== null && !Array.isArray(body) && Array.isArray((body as { Operations?: unknown }).Operations));
    if (isPatchOp) {
      const bridge = patchEnterpriseScimUser(params.resourceId, body, scimOptions(request));
      return NextResponse.json(bridge.resource);
    }
    const resource = typeof body === "object" && body !== null && !Array.isArray(body)
      ? { id: params.resourceId, ...body }
      : { id: params.resourceId };
    const bridge = provisionEnterpriseScimUser(resource, scimOptions(request));
    return NextResponse.json(bridge.resource);
  } catch (error) {
    return jsonError(error);
  }
}
