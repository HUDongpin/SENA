import { describe, expect, it } from "vitest";
import {
  enableEnterpriseMfaAction,
  revokeEnterpriseSessionAction,
  runEnterpriseSsoPreflightAction,
  startEnterpriseMfaSetupAction
} from "../../../components/sena/workspace/enterprise-actions";

describe("SENA workspace enterprise action helpers", () => {
  const jsonHeaders = async () => ({
    "content-type": "application/json",
    "x-sena-csrf-token": "csrf-token"
  });

  it("centralizes authenticated session action request construction", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];

    const payload = await revokeEnterpriseSessionAction({
      action: "revoke-others"
    }, {
      jsonHeaders,
      fetchImpl: async (input, init) => {
        seen.push({ url: String(input), init });
        return new Response(JSON.stringify({
          generatedAt: "2026-06-19T00:00:00.000Z",
          remainingSessions: [],
          revokedCount: 2
        }), { status: 200 });
      }
    });

    expect(payload.revokedCount).toBe(2);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("/api/auth/sessions");
    expect(seen[0].init?.method).toBe("DELETE");
    expect(seen[0].init?.headers).toEqual({
      "content-type": "application/json",
      "x-sena-csrf-token": "csrf-token"
    });
    expect(JSON.parse(String(seen[0].init?.body))).toEqual({ action: "revoke-others" });
  });

  it("centralizes MFA setup and enable action bodies", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.action === "setup") {
        return new Response(JSON.stringify({
          schemaVersion: "sena-enterprise-mfa-setup/v1",
          method: "totp",
          setupToken: "setup-token",
          secret: "secret",
          otpauthUrl: "otpauth://totp/SENA",
          expiresAt: "2026-06-19T00:05:00.000Z"
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        schemaVersion: "sena-enterprise-mfa-status/v1",
        enabled: true,
        method: "totp"
      }), { status: 200 });
    };

    const setup = await startEnterpriseMfaSetupAction({ jsonHeaders, fetchImpl });
    const status = await enableEnterpriseMfaAction({
      setupToken: setup.setupToken,
      code: "123456"
    }, {
      jsonHeaders,
      fetchImpl
    });

    expect(status.enabled).toBe(true);
    expect(requests.map((request) => request.url)).toEqual(["/api/auth/mfa", "/api/auth/mfa"]);
    expect(requests.map((request) => request.init?.method)).toEqual(["POST", "POST"]);
    expect(requests.map((request) => JSON.parse(String(request.init?.body)))).toEqual([
      { action: "setup" },
      { action: "enable", setupToken: "setup-token", code: "123456" }
    ]);
  });

  it("returns validated SSO preflight evidence from the provider action", async () => {
    const preflight = await runEnterpriseSsoPreflightAction("google", {
      fetchImpl: async (input) => {
        expect(String(input)).toBe("/api/auth/sso?status=1&preflight=1&provider=google");
        return new Response(JSON.stringify({
          schemaVersion: "sena-sso-provider-status/v1",
          preflight: {
            schemaVersion: "sena-enterprise-sso-preflight/v1",
            generatedAt: "2026-06-19T00:00:00.000Z",
            baseUrl: "https://sena.example",
            summary: {
              checked: 1,
              passed: 1,
              review: 0,
              configuredProviders: 1
            },
            providers: []
          }
        }), { status: 200 });
      }
    });

    expect(preflight.summary).toMatchObject({ checked: 1, passed: 1, review: 0 });
  });
});
