import { NextResponse } from "next/server";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireProvisioningBearerToken } from "@/lib/sena/provisioning-auth";
import { patchEnterpriseScimGroup, provisionEnterpriseScimGroup, type SenaScimProvisioningOptions } from "@/lib/sena/scim";

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

async function upsertGroup(request: Request, resourceId: string) {
  requireProvisioningBearerToken(request);
  const body = await request.json();
  const resource = typeof body === "object" && body !== null && !Array.isArray(body)
    ? { id: resourceId, ...body }
    : { id: resourceId };
  const bridge = provisionEnterpriseScimGroup(resource, scimOptions(request));
  return NextResponse.json(bridge.resource);
}

export async function PUT(request: Request, { params }: ScimResourceRouteContext) {
  return observeSenaApiRoute(request, { routeId: "sena-scim-groups-resource" }, async () => {
    const { resourceId } = await params;
    return await upsertGroup(request, resourceId);
  });
}

export async function PATCH(request: Request, { params }: ScimResourceRouteContext) {
  return observeSenaApiRoute(request, { routeId: "sena-scim-groups-resource" }, async () => {
    const { resourceId } = await params;
    requireProvisioningBearerToken(request);
    const body = await request.json();
    const schemas = typeof body === "object" && body !== null && !Array.isArray(body) && Array.isArray(body.schemas)
      ? body.schemas
      : [];
    const isPatchOp = schemas.some((schema: unknown) => String(schema).toLowerCase().includes("patchop")) ||
      (typeof body === "object" && body !== null && !Array.isArray(body) && Array.isArray((body as { Operations?: unknown }).Operations));
    if (isPatchOp) {
      const bridge = patchEnterpriseScimGroup(resourceId, body, scimOptions(request));
      return NextResponse.json(bridge.resource);
    }
    const resource = typeof body === "object" && body !== null && !Array.isArray(body)
      ? { id: resourceId, ...body }
      : { id: resourceId };
    const bridge = provisionEnterpriseScimGroup(resource, scimOptions(request));
    return NextResponse.json(bridge.resource);
  });
}
