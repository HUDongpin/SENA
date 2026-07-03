import { NextResponse } from "next/server";
import {
  registerEnterpriseUserAsync
} from "@/lib/sena/enterprise/auth-registration";
import {
  sanitizeEnterpriseContext,
  senaSessionCookieName
} from "@/lib/sena/enterprise/auth-session";
import { authSessionHeaders, enforceAuthRateLimitAsync, observeSenaApiRoute, sessionCookieMaxAgeSeconds, sessionCookieOptions } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return observeSenaApiRoute(request, { routeId: "auth-register" }, async () => {
    const body = await request.json();
    await enforceAuthRateLimitAsync(request, {
      bucket: "auth.register",
      discriminator: String(body.email ?? body.inviteCode ?? "")
    });
    const result = await registerEnterpriseUserAsync({
      name: String(body.name ?? body.fullName ?? ""),
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      organization: String(body.organization ?? ""),
      plan: body.plan === "individual" || body.plan === "enterprise" ? body.plan : "lab",
      inviteCode: body.inviteCode ? String(body.inviteCode) : undefined
    });
    const response = NextResponse.json(sanitizeEnterpriseContext(result.context), {
      status: 201,
      headers: authSessionHeaders(result.context, {
        flow: "password-register",
        provider: "password"
      })
    });
    response.cookies.set(senaSessionCookieName, result.token, sessionCookieOptions(sessionCookieMaxAgeSeconds(result.context.session.expiresAt)));
    return response;
  });
}
