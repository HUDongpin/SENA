import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseSsoState } from "../enterprise/auth-sso";

const fallbackRedirect = "/workspace/sena";
const ssoStateCookieName = "sena_sso_state";

const rejectedRedirects = [
  undefined,
  "",
  "   ",
  "https://evil.example",
  "http://evil.example",
  "//evil.example",
  "///evil.example",
  "/\\evil.example",
  "\\\\evil.example",
  "/foo\\bar",
  "javascript:alert(1)",
  "/javascript:alert(1)",
  "/https://evil.example",
  "https:evil.example",
  "/https:evil.example",
  "/\\tevil.example",
  `/${String.fromCharCode(9)}evil.example`,
  `/workspace/sena${String.fromCharCode(10)}`,
  `/workspace/sena${String.fromCharCode(0)}`,
  "/workspace/sena\r\nLocation: https://evil.example"
];

function setCookieHeaders(response: Response) {
  return response.headers.getSetCookie();
}

function ssoStateCookie(response: Response) {
  return setCookieHeaders(response).find((header) => header.startsWith(`${ssoStateCookieName}=`));
}

function cookiePathMatches(cookiePath: string, requestPath: string) {
  if (cookiePath === requestPath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath.charAt(cookiePath.length) === "/";
}

function expectBoundSsoStateCookie(header: string, state: string) {
  expect(header.startsWith(`${ssoStateCookieName}=${state}`)).toBe(true);
  const flags = header.toLowerCase();
  expect(flags).toContain("httponly");
  expect(flags).toContain("secure");
  expect(flags).toContain("samesite=lax");
  const cookiePath = /Path=([^;]+)/i.exec(header)?.[1] ?? "";
  expect(cookiePath).toBe("/api/auth/sso");
  expect(cookiePathMatches(cookiePath, "/api/auth/sso/callback")).toBe(true);
  expect(cookiePathMatches(cookiePath, "/api/auth/login")).toBe(false);
  const maxAge = Number(/Max-Age=(\d+)/i.exec(header)?.[1]);
  expect(maxAge).toBeGreaterThan(0);
  expect(maxAge).toBeLessThanOrEqual(10 * 60);
}

function expectClearedSsoStateCookie(response: Response) {
  const header = ssoStateCookie(response);
  expect(header).toBeTruthy();
  expect(header).toMatch(/Max-Age=0/i);
  expect(header?.toLowerCase()).toContain("httponly");
  expect(header?.toLowerCase()).toContain("secure");
  expect(header?.toLowerCase()).toContain("samesite=lax");
  expect(header).toContain("Path=/api/auth/sso");
}

async function withInstitutionSso<T>(run: () => Promise<T>) {
  const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-sso-redirect-state-"));
  vi.resetModules();
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  process.env.SENA_APP_URL = "https://sena.example.test";
  process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
  process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = "sena_institution_2026_9f4c2a1d8e7b6c5a4f3e2d1c0b9a8765";
  process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.example.test";
  process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.example.test/authorize";
  process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.example.test/token";
  process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.example.test/userinfo";
  process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.example.test/jwks";
  try {
    return await run();
  } finally {
    delete process.env.SENA_ENTERPRISE_DB_DIR;
    delete process.env.SENA_APP_URL;
    delete process.env.SENA_SSO_INSTITUTION_CLIENT_ID;
    delete process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET;
    delete process.env.SENA_SSO_INSTITUTION_ISSUER;
    delete process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL;
    delete process.env.SENA_SSO_INSTITUTION_TOKEN_URL;
    delete process.env.SENA_SSO_INSTITUTION_USERINFO_URL;
    delete process.env.SENA_SSO_INSTITUTION_JWKS_URL;
    rmSync(enterpriseDbDir, { recursive: true, force: true });
    vi.resetModules();
  }
}

describe("SSO post-login redirect validation", () => {
  it("keeps same-origin relative paths and falls back for every other target", async () => {
    const sso = await import("../enterprise/auth-sso") as {
      resolveSsoPostLoginRedirect?: (redirectTo?: string) => string;
    };
    expect(typeof sso.resolveSsoPostLoginRedirect).toBe("function");
    const resolve = sso.resolveSsoPostLoginRedirect!;
    const accepted = [
      "/workspace/sena",
      "/workspace/sena?rail=sets",
      "/workspace/sena#section",
      "  /login  ",
      "/"
    ];
    expect(resolve("/workspace/sena")).toBe("/workspace/sena");
    expect(resolve("/workspace/sena?rail=sets")).toBe("/workspace/sena?rail=sets");
    expect(resolve("/workspace/sena#section")).toBe("/workspace/sena#section");
    expect(resolve("  /login  ")).toBe("/login");
    expect(resolve("/")).toBe("/");
    for (const value of rejectedRedirects) {
      expect(resolve(value), JSON.stringify(value)).toBe(fallbackRedirect);
    }
    const probeOrigin = "https://sena.example.test";
    for (const value of [...accepted, ...rejectedRedirects]) {
      const resolved = resolve(value);
      const url = new URL(resolved, probeOrigin);
      expect(url.origin, JSON.stringify(value)).toBe(probeOrigin);
      expect(url.protocol, JSON.stringify(value)).toBe("https:");
    }
  });

  it("stores the fallback when authorization is started with a rejected redirect", async () => {
    await withInstitutionSso(async () => {
      const sso = await import("../enterprise/auth-sso");
      const state = await import("../enterprise/state");
      await sso.createEnterpriseSsoAuthorization({
        provider: "institution",
        baseUrl: "https://sena.example.test",
        redirectTo: "/\\evil.example"
      });
      const saved = state.readEnterpriseDb().ssoStates.at(-1) as SenaEnterpriseSsoState | undefined;
      expect(saved?.redirectTo).toBe(fallbackRedirect);

      await sso.createEnterpriseSsoAuthorization({
        provider: "institution",
        baseUrl: "https://sena.example.test",
        redirectTo: "/workspace/sena?rail=sets"
      });
      const preserved = state.readEnterpriseDb().ssoStates.at(-1);
      expect(preserved?.redirectTo).toBe("/workspace/sena?rail=sets");
    });
  });

  it("validates the post-login redirect target again at the callback response", async () => {
    const context = {
      user: { id: "user-sso-redirect", email: "redirect-sso@example.edu" },
      session: {
        id: "session-sso-redirect",
        userId: "user-sso-redirect",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        sessionProfile: "standard"
      },
      teams: [{ id: "team-sso-redirect", name: "Redirect Team" }],
      memberships: []
    };
    vi.resetModules();
    vi.doMock("@/lib/sena/enterprise/auth-sso", async () => {
      const actual = await vi.importActual<typeof import("../enterprise/auth-sso")>("@/lib/sena/enterprise/auth-sso");
      return {
        ...actual,
        completeEnterpriseSsoCallbackAsync: async () => ({
          token: "sena-callback-token",
          redirectTo: "/\\evil.example",
          context
        })
      };
    });
    vi.doMock("@/lib/sena/api-helpers", async () => {
      const actual = await vi.importActual<typeof import("../api-helpers")>("@/lib/sena/api-helpers");
      return {
        ...actual,
        authSessionHeaders: () => ({ "x-sena-auth-flow": "sso-callback" }),
        enforceAuthRateLimitAsync: async () => ({ allowed: true })
      };
    });

    try {
      const route = await import("../../../app/api/auth/sso/callback/route");
      const response = await route.GET(new Request(
        "https://sena.example.test/api/auth/sso/callback?provider=institution&code=provider-code&state=state-1",
        { headers: { cookie: `${ssoStateCookieName}=state-1` } }
      ));
      const location = new URL(response.headers.get("location") ?? "");
      expect(response.status).toBe(307);
      expect(location.origin).toBe("https://sena.example.test");
      expect(`${location.pathname}${location.search}`).toBe(fallbackRedirect);
    } finally {
      vi.doUnmock("@/lib/sena/enterprise/auth-sso");
      vi.doUnmock("@/lib/sena/api-helpers");
      vi.resetModules();
    }
  });
});

describe("SSO browser state binding", () => {
  it("compares browser state in constant time and rejects missing or mismatched values", async () => {
    const sso = await import("../enterprise/auth-sso") as {
      senaSsoStateCookieName?: string;
      ssoBrowserStatesMatch?: (cookieState?: string, callbackState?: string) => boolean;
    };
    expect(sso.senaSsoStateCookieName).toBe(ssoStateCookieName);
    expect(typeof sso.ssoBrowserStatesMatch).toBe("function");
    const match = sso.ssoBrowserStatesMatch!;
    expect(match("abcdef", "abcdef")).toBe(true);
    expect(match("abcdef", "abcdeg")).toBe(false);
    expect(match("abcdef", "abc")).toBe(false);
    expect(match(undefined, "abcdef")).toBe(false);
    expect(match("abcdef", undefined)).toBe(false);
    expect(match("", "abcdef")).toBe(false);
  });

  it("sets a short-lived state cookie when the OAuth start response is issued", async () => {
    await withInstitutionSso(async () => {
      const route = await import("../../../app/api/auth/sso/route");
      const getResponse = await route.GET(new Request("https://sena.example.test/api/auth/sso?provider=institution&redirectTo=%2Fworkspace%2Fsena"));
      const authorizationUrl = new URL(getResponse.headers.get("location") ?? "");
      const state = authorizationUrl.searchParams.get("state") ?? "";
      expect(getResponse.status).toBe(307);
      expect(state).not.toBe("");
      expectBoundSsoStateCookie(ssoStateCookie(getResponse) ?? "", state);

      const postResponse = await route.POST(new Request("https://sena.example.test/api/auth/sso", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "institution",
          redirectTo: "/workspace/sena"
        })
      }));
      const postBody = await postResponse.json() as { authorizationUrl?: string };
      const postState = new URL(postBody.authorizationUrl ?? "").searchParams.get("state") ?? "";
      expect(postResponse.status).toBe(200);
      expectBoundSsoStateCookie(ssoStateCookie(postResponse) ?? "", postState);
    });
  });

  it("does not bind a state cookie for status or local fallback responses", async () => {
    await withInstitutionSso(async () => {
      delete process.env.SENA_SSO_INSTITUTION_CLIENT_ID;
      delete process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET;
      vi.resetModules();
      const route = await import("../../../app/api/auth/sso/route");
      const statusResponse = await route.GET(new Request("https://sena.example.test/api/auth/sso?status=1"));
      const fallbackResponse = await route.POST(new Request("https://sena.example.test/api/auth/sso", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "institution",
          email: "fallback-sso@example.edu",
          name: "Fallback SSO"
        })
      }));
      expect(statusResponse.status).toBe(200);
      expect(ssoStateCookie(statusResponse)).toBeUndefined();
      expect(fallbackResponse.status).toBe(200);
      expect(ssoStateCookie(fallbackResponse)).toBeUndefined();
    });
  });

  it("rejects a callback whose browser state is missing or mismatched and clears the cookie", async () => {
    const completeEnterpriseSsoCallbackAsync = vi.fn(async () => ({
      token: "sena-callback-token",
      redirectTo: fallbackRedirect,
      context: {
        user: { id: "user-sso-state", email: "state-sso@example.edu" },
        session: {
          id: "session-sso-state",
          expiresAt: new Date(Date.now() + 86_400_000).toISOString()
        },
        teams: [],
        memberships: []
      }
    }));
    vi.resetModules();
    vi.doMock("@/lib/sena/enterprise/auth-sso", async () => {
      const actual = await vi.importActual<typeof import("../enterprise/auth-sso")>("@/lib/sena/enterprise/auth-sso");
      return { ...actual, completeEnterpriseSsoCallbackAsync };
    });
    vi.doMock("@/lib/sena/api-helpers", async () => {
      const actual = await vi.importActual<typeof import("../api-helpers")>("@/lib/sena/api-helpers");
      return {
        ...actual,
        enforceAuthRateLimitAsync: async () => ({ allowed: true })
      };
    });

    try {
      const route = await import("../../../app/api/auth/sso/callback/route");
      const missing = await route.GET(new Request(
        "https://sena.example.test/api/auth/sso/callback?provider=institution&code=provider-code&state=state-1"
      ));
      const mismatched = await route.GET(new Request(
        "https://sena.example.test/api/auth/sso/callback?provider=institution&code=provider-code&state=state-1",
        { headers: { cookie: `${ssoStateCookieName}=state-2` } }
      ));
      const matched = await route.GET(new Request(
        "https://sena.example.test/api/auth/sso/callback?provider=institution&code=provider-code&state=state-1",
        { headers: { cookie: `${ssoStateCookieName}=state-1` } }
      ));

      expect(missing.status).toBe(307);
      expect(missing.headers.get("location")).toBe("https://sena.example.test/login?sso_error=invalid_sso_state");
      expectClearedSsoStateCookie(missing);
      expect(mismatched.headers.get("location")).toBe("https://sena.example.test/login?sso_error=invalid_sso_state");
      expectClearedSsoStateCookie(mismatched);
      expect(completeEnterpriseSsoCallbackAsync).toHaveBeenCalledTimes(1);
      expect(matched.status).toBe(307);
      expect(matched.headers.get("location")).toBe("https://sena.example.test/workspace/sena");
      expect(matched.headers.get("set-cookie")).toContain("sena_session=sena-callback-token");
      expectClearedSsoStateCookie(matched);
    } finally {
      vi.doUnmock("@/lib/sena/enterprise/auth-sso");
      vi.doUnmock("@/lib/sena/api-helpers");
      vi.resetModules();
    }
  });
});
