import { NextResponse } from "next/server";
import {
  loginEnterpriseUserAsync
} from "@/lib/sena/enterprise/auth-login";
import {
  sanitizeEnterpriseContext,
  senaSessionCookieName
} from "@/lib/sena/enterprise/auth-session";
import { authSessionHeaders, enforceAuthRateLimitAsync, observeSenaApiRoute, sessionCookieMaxAgeSeconds, sessionCookieOptions } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "auth-login" }, async () => {
    const body = await request.json();
    await enforceAuthRateLimitAsync(request, {
      bucket: "auth.login",
      discriminator: String(body.email ?? body.mfaChallengeToken ?? "")
    });
    const result = await loginEnterpriseUserAsync({
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
  });
}
