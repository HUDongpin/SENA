import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SenaEnterpriseDb } from "../enterprise/state";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

function containsDeliberatelyBrokenSnapshot(
  candidate: unknown,
  seen = new WeakSet<object>()
): boolean {
  if (candidate === null || typeof candidate !== "object" || seen.has(candidate)) return false;
  seen.add(candidate);
  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = Object.getOwnPropertyDescriptors(candidate);
  } catch {
    return false;
  }
  if (descriptors.deliberately && "value" in descriptors.deliberately
    && descriptors.deliberately.value === "not a project snapshot") {
    return true;
  }
  return Reflect.ownKeys(descriptors).some((key) => {
    const descriptor = descriptors[key as keyof typeof descriptors];
    return Boolean(descriptor && "value" in descriptor
      && containsDeliberatelyBrokenSnapshot(descriptor.value, seen));
  });
}

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

  it("projects legacy file-backed session defaults without importing unrelated snapshots", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-auth-session-legacy-file-"));
    const dbPath = path.join(enterpriseDbDir, "enterprise-db.json");
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
        name: "Legacy File Session User",
        email: "legacy-file-session@example.edu",
        password: "sena-secure-123",
        organization: "Legacy File Session Lab",
        plan: "lab"
      });
      sessionToken = registered.token;

      const persisted = JSON.parse(readFileSync(dbPath, "utf8")) as SenaEnterpriseDb;
      const legacySession = persisted.sessions.find((session) => session.id === registered.context.session.id);
      if (!legacySession) throw new Error("Registered legacy file session fixture is missing.");
      delete (legacySession as Partial<typeof legacySession>).sessionProfile;
      delete (legacySession as Partial<typeof legacySession>).ttlDays;
      persisted.projects = [{
        id: "unrelated-broken-project",
        snapshot: { deliberately: "not a project snapshot" }
      } as never];
      persisted.projectRevisions = [{
        id: "unrelated-broken-revision",
        snapshot: { deliberately: "not a project snapshot" }
      } as never];
      writeFileSync(dbPath, JSON.stringify(persisted));

      const clone = vi.spyOn(globalThis, "structuredClone");
      try {
        const meRoute = await import("../../../app/api/auth/me/route");
        const response = await meRoute.GET(new Request("https://sena.example.test/api/auth/me"));
        const body = await response.json() as {
          session?: { id?: string; sessionProfile?: string; ttlDays?: number };
        };
        const { SENA_API_ENDPOINT_FACTS } = await import("../api-route-facts");

        expect(response.status).toBe(200);
        expect(SENA_API_ENDPOINT_FACTS.find((fact) => fact.id === "auth-session")?.responses)
          .toContain("sena-auth-session/v1");
        expect(body.session).toMatchObject({
          id: registered.context.session.id,
          sessionProfile: "standard",
          ttlDays: 7
        });
        expect(response.headers.get("x-sena-auth-session-profile")).toBe("standard");
        expect(clone.mock.calls.some(([value]) => containsDeliberatelyBrokenSnapshot(value))).toBe(false);
      } finally {
        clone.mockRestore();
      }

      const unchanged = JSON.parse(readFileSync(dbPath, "utf8")) as SenaEnterpriseDb;
      const unchangedSession = unchanged.sessions.find((session) => session.id === registered.context.session.id);
      expect(unchangedSession).not.toHaveProperty("sessionProfile");
      expect(unchangedSession).not.toHaveProperty("ttlDays");
      expect(unchanged.projects[0]?.snapshot).toEqual({ deliberately: "not a project snapshot" });
      expect(unchanged.projectRevisions[0]?.snapshot).toEqual({ deliberately: "not a project snapshot" });
    } finally {
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });

  it("projects legacy Postgres-primary session defaults without importing unrelated snapshots", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-auth-session-legacy-postgres-"));
    const pg = new RouteMemoryPostgres();
    let sessionToken = "";
    vi.resetModules();
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
    process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
    process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena_user:redacted@example.test/senadb?sslmode=require";
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        query(sql: string, values?: unknown[]) {
          return pg.query(sql, values);
        }
      }
    }));
    vi.doMock("next/headers", () => ({
      cookies: () => ({
        get: (name: string) => name === "sena_session" ? { value: sessionToken } : undefined
      })
    }));
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));

    try {
      const enterprise = await import("../enterprise");
      const registered = await enterprise.registerEnterpriseUserAsync({
        name: "Legacy Postgres Session User",
        email: "legacy-postgres-session@example.edu",
        password: "sena-secure-123",
        organization: "Legacy Postgres Session Lab",
        plan: "lab"
      });
      sessionToken = registered.token;
      if (!pg.state) throw new Error("Postgres legacy session fixture was not initialized.");
      const legacySession = pg.state.payload.sessions.find((session) => session.id === registered.context.session.id);
      if (!legacySession) throw new Error("Registered legacy Postgres session fixture is missing.");
      delete (legacySession as Partial<typeof legacySession>).sessionProfile;
      delete (legacySession as Partial<typeof legacySession>).ttlDays;
      pg.state.payload.projects = [{
        id: "unrelated-broken-project",
        snapshot: { deliberately: "not a project snapshot" }
      } as never];
      pg.state.payload.projectRevisions = [{
        id: "unrelated-broken-revision",
        snapshot: { deliberately: "not a project snapshot" }
      } as never];
      const revisionBeforeRead = pg.state.revision;

      const clone = vi.spyOn(globalThis, "structuredClone");
      try {
        const meRoute = await import("../../../app/api/auth/me/route");
        const response = await meRoute.GET(new Request("https://sena.example.test/api/auth/me"));
        const body = await response.json() as {
          session?: { id?: string; sessionProfile?: string; ttlDays?: number };
        };
        const { SENA_API_ENDPOINT_FACTS } = await import("../api-route-facts");

        expect(response.status).toBe(200);
        expect(SENA_API_ENDPOINT_FACTS.find((fact) => fact.id === "auth-session")?.responses)
          .toContain("sena-auth-session/v1");
        expect(body.session).toMatchObject({
          id: registered.context.session.id,
          sessionProfile: "standard",
          ttlDays: 7
        });
        expect(response.headers.get("x-sena-auth-session-profile")).toBe("standard");
        expect(clone.mock.calls.some(([value]) => containsDeliberatelyBrokenSnapshot(value))).toBe(false);
      } finally {
        clone.mockRestore();
      }

      expect(pg.state.revision).toBe(revisionBeforeRead);
      const unchangedSession = pg.state.payload.sessions.find((session) => session.id === registered.context.session.id);
      expect(unchangedSession).not.toHaveProperty("sessionProfile");
      expect(unchangedSession).not.toHaveProperty("ttlDays");
      expect(pg.state.payload.projects[0]?.snapshot).toEqual({ deliberately: "not a project snapshot" });
      expect(pg.state.payload.projectRevisions[0]?.snapshot).toEqual({ deliberately: "not a project snapshot" });
    } finally {
      delete process.env.SENA_ENTERPRISE_POSTGRES_URL;
      delete process.env.SENA_ENTERPRISE_STATE_STORE;
      delete process.env.SENA_ENTERPRISE_DB_ADAPTER;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.resetModules();
    }
  });
});
