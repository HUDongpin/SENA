import { NextResponse } from "next/server";
import {
  completeEnterpriseSsoCallback,
  senaSessionCookieName,
  type SenaEnterpriseSsoProvider
} from "@/lib/sena/enterprise";
import { authSessionHeaders, enforceAuthRateLimit, sessionCookieMaxAgeSeconds, sessionCookieOptions } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

function ssoProvider(value: unknown): SenaEnterpriseSsoProvider | undefined {
  return value === "google" || value === "orcid" || value === "institution" ? value : undefined;
}

function loginRedirect(url: URL, code: string) {
  const redirect = new URL("/login", url.origin);
  redirect.searchParams.set("sso_error", code);
  return NextResponse.redirect(redirect);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) return loginRedirect(url, error);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return loginRedirect(url, "missing_sso_callback_params");

  try {
    enforceAuthRateLimit(request, {
      bucket: "auth.sso.callback",
      discriminator: `${url.searchParams.get("provider") ?? "provider"}:${state}`
    });
    const result = await completeEnterpriseSsoCallback({
      code,
      state,
      provider: ssoProvider(url.searchParams.get("provider")),
      baseUrl: url.origin
    });
    const redirect = new URL(result.redirectTo, url.origin);
    const provider = ssoProvider(url.searchParams.get("provider"));
    const response = NextResponse.redirect(redirect, {
      headers: authSessionHeaders(result.context, {
        flow: "sso-callback",
        provider,
        ssoProvider: provider,
        ssoMode: "oauth-oidc"
      })
    });
    response.cookies.set(senaSessionCookieName, result.token, sessionCookieOptions(sessionCookieMaxAgeSeconds(result.context.session.expiresAt)));
    return response;
  } catch (callbackError) {
    const code = callbackError && typeof callbackError === "object" && "code" in callbackError && typeof callbackError.code === "string"
      ? callbackError.code
      : "sso_callback_failed";
    return loginRedirect(url, code);
  }
}
