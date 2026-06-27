import { SENA_SCHEMA_VERSIONS } from "@/lib/sena/schema-registry";
import { NextResponse } from "next/server";
import {
  getEnterpriseIdentityProductionEvidence
} from "@/lib/sena/enterprise/identity-production-evidence";
import {
  createEnterpriseSsoAuthorization,
  getEnterpriseSsoProviderStatuses,
  isEnterpriseSsoProviderConfigured,
  preflightEnterpriseSsoProviders,
  requireEnterpriseLocalSsoFallbackAllowed,
  ssoEnterpriseUser,
  type SenaEnterpriseSsoProvider
} from "@/lib/sena/enterprise/auth-sso";
import {
  sanitizeEnterpriseContext,
  senaSessionCookieName
} from "@/lib/sena/enterprise/auth-session";
import {
  authSessionHeaders,
  enforceAuthRateLimit,
  identityInstitutionActionPlanHeaders,
  jsonError,
  sessionCookieMaxAgeSeconds,
  sessionCookieOptions
} from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

function ssoProvider(value: unknown): SenaEnterpriseSsoProvider {
  return value === "google" || value === "orcid" || value === "institution" ? value : "institution";
}

function requestOrigin(request: Request) {
  return new URL(request.url).origin;
}

function ssoProductionGateHeaders(
  evidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence>
): Record<string, string> {
  return {
    "x-sena-sso-production-gate": evidence.status,
    "x-sena-identity-production-status": evidence.status,
    "x-sena-identity-release-gate-blocked": String(evidence.releaseGate.approvalBlocked),
    "x-sena-identity-request-blockers": String(evidence.platformRequestPacket.summary.blockingRequests),
    "x-sena-identity-production-blocking-decisions": evidence.releaseGate.productionBlockingDecisionIds.join("|") || "none",
    "x-sena-identity-missing-evidence-ids": evidence.evidenceManifest.missingEvidenceIds.join("|") || "none",
    "x-sena-identity-cutover-checklist": evidence.cutoverChecklist.status,
    "x-sena-identity-cutover-blockers": String(evidence.cutoverChecklist.summary.blockingItems),
    "x-sena-identity-rotation-freshness": evidence.rotationFreshness.status,
    ...identityInstitutionActionPlanHeaders(evidence)
  };
}

function identityProductionGateSummary(
  evidence: ReturnType<typeof getEnterpriseIdentityProductionEvidence>
) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionGateSummary,
    generatedAt: evidence.generatedAt,
    status: evidence.status,
    releaseGateBlocked: evidence.releaseGate.approvalBlocked,
    requestBlockers: evidence.platformRequestPacket.summary.blockingRequests,
    receiptReviewRequests: evidence.platformRequestPacket.summary.receiptReviewRequests,
    productionBlockingDecisionIds: evidence.releaseGate.productionBlockingDecisionIds,
    missingEvidenceIds: evidence.evidenceManifest.missingEvidenceIds,
    cutoverChecklist: {
      status: evidence.cutoverChecklist.status,
      blockingItems: evidence.cutoverChecklist.summary.blockingItems
    },
    rotationFreshness: evidence.rotationFreshness.status,
    institutionActionPlan: {
      schemaVersion: evidence.institutionActionPlan.schemaVersion,
      status: evidence.institutionActionPlan.status,
      digest: evidence.institutionActionPlan.digest ?? "missing",
      summary: evidence.institutionActionPlan.summary
    },
    platformDecisionSubmission: {
      method: evidence.platformRequestPacket.submission.method,
      path: evidence.platformRequestPacket.submission.path,
      requiredBodyFields: evidence.platformRequestPacket.submission.requiredBodyFields,
      identityProductionEvidenceBodyFields: evidence.platformRequestPacket.submission.identityProductionEvidenceBodyFields,
      responseAuditHeaders: evidence.platformRequestPacket.submission.responseAuditHeaders
    },
    redaction: {
      secretValuesExcluded: true,
      evidenceUrlValuesExcluded: true,
      ownerNamesExcluded: true
    }
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("status") === "1") {
      const identityEvidence = getEnterpriseIdentityProductionEvidence();
      if (url.searchParams.get("preflight") === "1") {
        enforceAuthRateLimit(request, {
          bucket: "auth.sso.preflight",
          discriminator: `${url.searchParams.get("provider") ?? "all"}:${requestOrigin(request)}`
        });
        const provider = url.searchParams.get("provider");
        return NextResponse.json({
          schemaVersion: SENA_SCHEMA_VERSIONS.ssoProviderStatus,
          providers: getEnterpriseSsoProviderStatuses(),
          identityProductionGate: identityProductionGateSummary(identityEvidence),
          preflight: await preflightEnterpriseSsoProviders({
            baseUrl: requestOrigin(request),
            providers: provider ? [ssoProvider(provider)] : undefined
          })
        }, {
          headers: ssoProductionGateHeaders(identityEvidence)
        });
      }
      return NextResponse.json({
        schemaVersion: SENA_SCHEMA_VERSIONS.ssoProviderStatus,
        providers: getEnterpriseSsoProviderStatuses(),
        identityProductionGate: identityProductionGateSummary(identityEvidence)
      }, {
        headers: ssoProductionGateHeaders(identityEvidence)
      });
    }

    enforceAuthRateLimit(request, {
      bucket: "auth.sso.start",
      discriminator: `${url.searchParams.get("provider") ?? "institution"}:${url.searchParams.get("redirectTo") ?? ""}`
    });
    const authorization = await createEnterpriseSsoAuthorization({
      provider: ssoProvider(url.searchParams.get("provider")),
      baseUrl: requestOrigin(request),
      redirectTo: url.searchParams.get("redirectTo") ?? undefined,
      inviteCode: url.searchParams.get("inviteCode") ?? undefined
    });
    return NextResponse.redirect(authorization.authorizationUrl);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const provider = ssoProvider(body.provider);
    enforceAuthRateLimit(request, {
      bucket: "auth.sso.start",
      discriminator: `${provider}:${body.email ?? body.subject ?? body.redirectTo ?? ""}`
    });
    if (isEnterpriseSsoProviderConfigured(provider)) {
      const authorization = await createEnterpriseSsoAuthorization({
        provider,
        baseUrl: requestOrigin(request),
        redirectTo: body.redirectTo ? String(body.redirectTo) : undefined,
        inviteCode: body.inviteCode ? String(body.inviteCode) : undefined
      });
      return NextResponse.json(authorization);
    }

    requireEnterpriseLocalSsoFallbackAllowed(provider);
    const result = ssoEnterpriseUser({
      provider,
      email: String(body.email ?? ""),
      name: body.name ? String(body.name) : undefined,
      organization: body.organization ? String(body.organization) : undefined,
      subject: body.subject ? String(body.subject) : undefined,
      inviteCode: body.inviteCode ? String(body.inviteCode) : undefined
    });
    const response = NextResponse.json(sanitizeEnterpriseContext(result.context), {
      headers: authSessionHeaders(result.context, {
        flow: "sso-local-fallback",
        provider,
        ssoProvider: provider,
        ssoMode: "local-pilot-fallback"
      })
    });
    response.cookies.set(senaSessionCookieName, result.token, sessionCookieOptions(sessionCookieMaxAgeSeconds(result.context.session.expiresAt)));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
