import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const expectedIdentitySecurityControlIds = [
  "identity-evidence-host-allowlist",
  "identity-secret-version-binding",
  "identity-secret-store-reference",
  "identity-secret-rotation-cadence",
  "identity-idp-tenant-binding",
  "identity-lifecycle-owner-mode"
] as const;

describe("SENA governance security route", () => {
  it("returns institution identity production controls and headers for security review", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-security-route-"));
    let sessionToken = "";
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const registered = enterprise.registerEnterpriseUser({
        name: "Security Route Owner",
        email: "security-route@example.edu",
        password: "sena-secure-123",
        organization: "Security Route Lab",
        plan: "enterprise"
      });
      sessionToken = registered.token;
      const route = await import("../../../app/api/sena/governance/security/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/governance/security"));
      const body = await response.json() as {
        status?: string;
        controls?: Array<{
          id: string;
          category: string;
          status: string;
          source: string;
        }>;
      };
      const identityControls = body.controls
        ?.filter((control) => expectedIdentitySecurityControlIds.includes(control.id as (typeof expectedIdentitySecurityControlIds)[number])) ?? [];

      expect(response.status).toBe(200);
      expect(body.status).toBe("blocked");
      expect(identityControls.map((control) => control.id)).toEqual(expect.arrayContaining([...expectedIdentitySecurityControlIds]));
      expect(identityControls.every((control) => control.category === "identity")).toBe(true);
      expect(identityControls.every((control) => control.status === "review")).toBe(true);
      expect(identityControls.every((control) => control.source === "readiness")).toBe(true);
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-governance-security");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(response.headers.get("x-sena-security-posture-status")).toBe(body.status);
      expect(response.headers.get("x-sena-security-identity-controls-review")).toBe(String(identityControls.length));
      expect(response.headers.get("x-sena-security-identity-control-blockers")).toBe(identityControls.map((control) => control.id).join("|"));
      expect(response.headers.get("x-sena-identity-idp-tenant-binding")).toBe("review");
      expect(response.headers.get("x-sena-identity-secret-rotation-cadence")).toBe("review");
      expect(response.headers.get("x-sena-identity-lifecycle-owner-mode")).toBe("review");
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
