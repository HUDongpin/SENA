import { NextResponse } from "next/server";
import { loginEnterpriseUser, sanitizeEnterpriseContext, senaSessionCookieName } from "@/lib/sena/enterprise";
import { authSessionHeaders, enforceAuthRateLimit, jsonError, sessionCookieMaxAgeSeconds, sessionCookieOptions } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    enforceAuthRateLimit(request, {
      bucket: "auth.login",
      discriminator: String(body.email ?? body.mfaChallengeToken ?? "")
    });
    const result = loginEnterpriseUser({
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      mfaCode: body.mfaCode ? String(body.mfaCode) : undefined,
      mfaChallengeToken: body.mfaChallengeToken ? String(body.mfaChallengeToken) : undefined,
      rememberSession: Boolean(body.rememberSession)
    });
    if ("mfaRequired" in result) {
      return NextResponse.json(result, { status: 202 });
    }
    const response = NextResponse.json(sanitizeEnterpriseContext(result.context), {
      headers: authSessionHeaders(result.context, {
        flow: "password-login",
        provider: "password"
      })
    });
    response.cookies.set(senaSessionCookieName, result.token, sessionCookieOptions(sessionCookieMaxAgeSeconds(result.context.session.expiresAt)));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
