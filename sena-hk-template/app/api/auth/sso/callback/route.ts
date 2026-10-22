import { NextResponse } from "next/server";
import {
  completeEnterpriseSsoCallbackAsync,
  resolveSsoPostLoginRedirect,
  senaSsoStateCookieName,
  ssoBrowserStatesMatch,
  ssoStateCookieOptions,
  type SenaEnterpriseSsoProvider
} from "@/lib/sena/enterprise/auth-sso";
import {
  senaSessionCookieName
} from "@/lib/sena/enterprise/auth-session";
import { authSessionHeaders, enforceAuthRateLimitAsync, observeSenaApiRoute, sessionCookieMaxAgeSeconds, sessionCookieOptions } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";

function ssoProvider(value: unknown): SenaEnterpriseSsoProvider | undefined {
  return value === "google" || value === "orcid" || value === "institution" ? value : undefined;
}

function loginRedirect(url: URL, code: string) {
  const redirect = new URL("/login", url.origin);
  redirect.searchParams.set("sso_error", code);
  return NextResponse.redirect(redirect);
}

function readRequestCookie(request: Request, name: string) {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    if (!value) return undefined;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

function clearSsoBrowserState(response: NextResponse) {
  response.cookies.set(senaSsoStateCookieName, "", ssoStateCookieOptions(0));
  return response;
}

async function ssoCallbackResponse(request: Request, url: URL) {
  const error = url.searchParams.get("error");
  if (error) return loginRedirect(url, error);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return loginRedirect(url, "missing_sso_callback_params");

  await enforceAuthRateLimitAsync(request, {
    bucket: "auth.sso.callback",
    discriminator: `${url.searchParams.get("provider") ?? "provider"}:${state}`
  });
  if (!ssoBrowserStatesMatch(readRequestCookie(request, senaSsoStateCookieName), state)) {
    return loginRedirect(url, "invalid_sso_state");
  }

  const result = await completeEnterpriseSsoCallbackAsync({
    code,
    state,
    provider: ssoProvider(url.searchParams.get("provider")),
    baseUrl: url.origin
  });
  const redirect = new URL(resolveSsoPostLoginRedirect(result.redirectTo), url.origin);
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
}

export async function GET(request: Request) {
  return observeSenaApiRoute(request, { routeId: "auth-sso-callback" }, async () => {
    const url = new URL(request.url);
    try {
      return clearSsoBrowserState(await ssoCallbackResponse(request, url));
    } catch (callbackError) {
      const code = callbackError && typeof callbackError === "object" && "code" in callbackError && typeof callbackError.code === "string"
        ? callbackError.code
        : "sso_callback_failed";
      return clearSsoBrowserState(loginRedirect(url, code));
    }
  });
}
