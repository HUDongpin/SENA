import { NextResponse } from "next/server";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireProvisioningBearerToken } from "@/lib/sena/provisioning-auth";
import {
  deactivateEnterpriseScimUser,
  getEnterpriseScimUser,
  patchEnterpriseScimUser,
  provisionEnterpriseScimUser,
  type SenaScimProvisioningOptions,
  scimErrorBody
} from "@/lib/sena/scim";

export const runtime = "nodejs";

type ScimResourceRouteContext = { params: Promise<{ resourceId: string }> };

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

export async function GET(request: Request, { params }: ScimResourceRouteContext) {
  return observeSenaApiRoute(request, { routeId: "sena-scim-users-resource", errorBody: scimErrorBody }, async () => {
    const { resourceId } = await params;
    requireProvisioningBearerToken(request);
    return NextResponse.json(getEnterpriseScimUser(resourceId, scimOptions(request).locationBase));
  });
}

// SCIM DELETE deprovisions by suspending, not by erasing: the user row survives
// with every membership suspended. RFC 7644 3.6 wants 204 with no body.
export async function DELETE(request: Request, { params }: ScimResourceRouteContext) {
  return observeSenaApiRoute(request, { routeId: "sena-scim-users-resource", errorBody: scimErrorBody }, async () => {
    const { resourceId } = await params;
    requireProvisioningBearerToken(request);
    deactivateEnterpriseScimUser(resourceId, scimOptions(request));
    return new NextResponse(null, { status: 204 });
  });
}

export async function PUT(request: Request, { params }: ScimResourceRouteContext) {
  return observeSenaApiRoute(request, { routeId: "sena-scim-users-resource", errorBody: scimErrorBody }, async () => {
    const { resourceId } = await params;
    return await upsertUser(request, resourceId);
  });
}

export async function PATCH(request: Request, { params }: ScimResourceRouteContext) {
  return observeSenaApiRoute(request, { routeId: "sena-scim-users-resource", errorBody: scimErrorBody }, async () => {
    const { resourceId } = await params;
    requireProvisioningBearerToken(request);
    const body = await request.json();
    const schemas = typeof body === "object" && body !== null && !Array.isArray(body) && Array.isArray(body.schemas)
      ? body.schemas
      : [];
    const isPatchOp = schemas.some((schema: unknown) => String(schema).toLowerCase().includes("patchop")) ||
      (typeof body === "object" && body !== null && !Array.isArray(body) && Array.isArray((body as { Operations?: unknown }).Operations));
    if (isPatchOp) {
      const bridge = patchEnterpriseScimUser(resourceId, body, scimOptions(request));
      return NextResponse.json(bridge.resource);
    }
    const resource = typeof body === "object" && body !== null && !Array.isArray(body)
      ? { id: resourceId, ...body }
      : { id: resourceId };
    const bridge = provisionEnterpriseScimUser(resource, scimOptions(request));
    return NextResponse.json(bridge.resource);
  });
}
