import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { NextResponse } from "next/server";
import {
  SenaEnterpriseError,
  enterpriseErrorResponse
} from "@/lib/sena/enterprise/errors";
import {
  provisionEnterpriseOrganizationAsync,
  type SenaEnterpriseProvisioningInput
} from "@/lib/sena/enterprise/provisioning";
import { observeSenaApiRoute } from "@/lib/sena/api-helpers";
import { requireProvisioningBearerToken } from "@/lib/sena/provisioning-auth";

export const runtime = "nodejs";

/**
 * A body that is not parseable JSON is the caller's error, not the server's. A
 * bare `request.json()` throws a SyntaxError, which enterpriseErrorResponse
 * maps to 500 unexpected_error — and every standard IdP/webhook retry policy
 * treats a 5xx as retryable, so a permanently-broken body would be retried on
 * backoff forever while each attempt files a 5xx against the provisioning error
 * budget. The parsed value is handed on untrusted: its shape is settled by
 * provisionEnterpriseOrganizationAsync, which refuses anything that is not a
 * well-formed provisioning request with the same 400 family.
 */
async function provisioningRequestBody(request: Request) {
  try {
    return await request.json() as SenaEnterpriseProvisioningInput;
  } catch {
    throw new SenaEnterpriseError("Provisioning requires a JSON object body.", 400, "invalid_provisioning_body");
  }
}

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-provisioning" }, async () => {
    requireProvisioningBearerToken(request);
    const body = await provisioningRequestBody(request);
    return NextResponse.json(await provisionEnterpriseOrganizationAsync(body));
  });
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "sena-provisioning" }, async () => {
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
  });
}
