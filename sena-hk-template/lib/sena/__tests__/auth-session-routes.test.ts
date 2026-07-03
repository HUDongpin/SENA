import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("SENA auth session routes", () => {
  it("observes session read, CSRF, session list, and logout routes without dropping cookies", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-auth-session-routes-"));
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
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
        name: "Session Route User",
        email: "session-route-user@example.edu",
        password: "sena-secure-123",
        organization: "Session Route Lab",
        plan: "lab"
      });
      sessionToken = registered.token;

      const meRoute = await import("../../../app/api/auth/me/route");
      const meResponse = await meRoute.GET(new Request("https://sena.example.test/api/auth/me"));
      const meBody = await meResponse.json() as { user?: { id?: string } };
      expect(meResponse.status).toBe(200);
      expect(meResponse.headers.get("x-sena-observed-route")).toBe("auth-me");
      expect(meResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(meBody.user?.id).toBe(registered.context.user.id);

      const csrfRoute = await import("../../../app/api/auth/csrf/route");
      const csrfResponse = await csrfRoute.GET(new Request("https://sena.example.test/api/auth/csrf"));
      const csrf = await csrfResponse.json() as { headerName?: string; token?: string };
      expect(csrfResponse.status).toBe(200);
      expect(csrfResponse.headers.get("x-sena-observed-route")).toBe("auth-csrf");
      expect(csrf.headerName).toBe("x-sena-csrf-token");
      expect(csrf.token).toBeTruthy();

      const sessionsRoute = await import("../../../app/api/auth/sessions/route");
      const sessionsResponse = await sessionsRoute.GET(new Request("https://sena.example.test/api/auth/sessions"));
      const sessionsBody = await sessionsResponse.json() as { sessions?: Array<{ id?: string }> };
      expect(sessionsResponse.status).toBe(200);
      expect(sessionsResponse.headers.get("x-sena-observed-route")).toBe("auth-sessions");
      expect(sessionsBody.sessions?.map((session) => session.id)).toContain(registered.context.session.id);

      const logoutRoute = await import("../../../app/api/auth/logout/route");
      const logoutResponse = await logoutRoute.POST(new Request("https://sena.example.test/api/auth/logout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [String(csrf.headerName)]: String(csrf.token)
        },
        body: "{}"
      }));
      const logoutBody = await logoutResponse.json() as { ok?: boolean };
      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.headers.get("x-sena-observed-route")).toBe("auth-logout");
      expect(logoutResponse.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(logoutResponse.headers.get("set-cookie")).toContain("sena_session=;");
      expect(logoutBody.ok).toBe(true);
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
