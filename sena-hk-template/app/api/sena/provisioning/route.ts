import { NextResponse } from "next/server";
import { enterpriseErrorResponse, provisionEnterpriseOrganization } from "@/lib/sena/enterprise";
import { jsonError } from "@/lib/sena/api-helpers";
import { requireProvisioningBearerToken } from "@/lib/sena/provisioning-auth";

export const runtime = "nodejs";

function configuredProvisioningToken() {
  const token = process.env.SENA_PROVISIONING_TOKEN?.trim();
  return token || undefined;
}

export async function POST(request: Request) {
  try {
    requireProvisioningBearerToken(request);
    const body = await request.json();
    return NextResponse.json(provisionEnterpriseOrganization(body));
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  try {
    requireProvisioningBearerToken(request);
    return NextResponse.json({
      schemaVersion: "sena-enterprise-provisioning-status/v1",
      configured: true,
      auth: "bearer-token-hash-compare",
      endpoint: "/api/sena/provisioning",
      supports: ["teams", "users", "sso-identities", "memberships", "dry-run", "scim-v2-bridge"]
    });
  } catch (error) {
    const response = enterpriseErrorResponse(error);
    return NextResponse.json({
      schemaVersion: "sena-enterprise-provisioning-status/v1",
      configured: response.status !== 503,
      error: response.body.error,
      code: response.body.code
    }, { status: response.status });
  }
}
