import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { NextResponse } from "next/server";
import {
  enterpriseErrorResponse
} from "@/lib/sena/enterprise/errors";
import {
  provisionEnterpriseOrganization
} from "@/lib/sena/enterprise/provisioning";
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
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseProvisioningStatus,
      configured: true,
      auth: "bearer-token-hash-compare",
      endpoint: "/api/sena/provisioning",
      supports: ["teams", "users", "sso-identities", "memberships", "dry-run", "scim-v2-bridge"]
    });
  } catch (error) {
    const response = enterpriseErrorResponse(error);
    return NextResponse.json({
      schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseProvisioningStatus,
      configured: response.status !== 503,
      error: response.body.error,
      code: response.body.code
    }, { status: response.status });
  }
}
