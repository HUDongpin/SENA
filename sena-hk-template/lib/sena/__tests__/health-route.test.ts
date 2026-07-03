import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

const expectedIdentityReadinessIds = [
  "identity-evidence-host-allowlist",
  "identity-secret-version-binding",
  "identity-secret-store-reference",
  "identity-secret-rotation-cadence",
  "identity-idp-tenant-binding",
  "identity-lifecycle-owner-mode"
] as const;

describe("SENA governance health route", () => {
  it("returns identity production readiness headers for governance health exports", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-health-route-"));
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
        name: "Governance Health Owner",
        email: "governance-health@example.edu",
        password: "sena-secure-123",
        organization: "Governance Health Lab",
        plan: "enterprise"
      });
      sessionToken = registered.token;
      const readiness = enterprise.getEnterpriseDeploymentReadiness();
      const identityEvidence = enterprise.getEnterpriseIdentityProductionEvidence();
      const identityReadinessBlockers = readiness.summary.blockers
        .filter((blocker) => expectedIdentityReadinessIds.includes(blocker as (typeof expectedIdentityReadinessIds)[number]))
        .join("|") || "none";
      const route = await import("../../../app/api/sena/governance/health/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/governance/health"));
      const body = await response.json() as {
        status?: string;
      };

      expect(response.status).toBe(200);
      expect(body.status).toBe("review");
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-governance-health");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(response.headers.get("x-sena-governance-status")).toBe(body.status);
      expect(response.headers.get("x-sena-deployment-readiness-status")).toBe(readiness.status);
      expect(response.headers.get("x-sena-identity-readiness-blocking-count")).toBe(String(expectedIdentityReadinessIds.length));
      expect(response.headers.get("x-sena-identity-readiness-blockers")).toBe(identityReadinessBlockers);
      expect(response.headers.get("x-sena-identity-production-status")).toBe(identityEvidence.status);
      expect(response.headers.get("x-sena-identity-request-blockers")).toBe(String(identityEvidence.platformRequestPacket.summary.blockingRequests));
      expect(response.headers.get("x-sena-identity-missing-evidence-ids")).toBe(identityEvidence.evidenceManifest.missingEvidenceIds.join("|") || "none");
      expect(response.headers.get("x-sena-identity-cutover-checklist")).toBe(identityEvidence.cutoverChecklist.status);
      expect(response.headers.get("x-sena-identity-cutover-blockers")).toBe(String(identityEvidence.cutoverChecklist.summary.blockingItems));
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("uses Postgres primary state for governance health body and does not initialize local JSON", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-health-postgres-route-"));
    const pg = new RouteMemoryPostgres();
    let sessionToken = "";
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENA_ENTERPRISE_DB_ADAPTER", "postgres");
    vi.stubEnv("SENA_ENTERPRISE_STATE_STORE", "postgres");
    vi.stubEnv("DATABASE_URL", "postgres://sena_user:super-secret@example.postgres.test/sena");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          return pg.query(sql, values);
        }

        async end() {
          return undefined;
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
        name: "Postgres Governance Health Owner",
        email: "postgres-governance-health@example.edu",
        password: "sena-secure-123",
        organization: "Postgres Governance Health Lab",
        plan: "enterprise"
      });
      sessionToken = registered.token;

      const route = await import("../../../app/api/sena/governance/health/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/governance/health"));
      const body = await response.json() as {
        status?: string;
        storage?: {
          primaryStateRuntime?: { activePrimary?: string };
        };
        counts?: {
          users?: number;
          teams?: number;
          auditEvents?: number;
        };
      };
      const serialized = JSON.stringify(body);

      expect(response.status).toBe(200);
      expect(body.storage?.primaryStateRuntime?.activePrimary).toBe("postgres");
      expect(response.headers.get("x-sena-observed-route")).toBe("sena-governance-health");
      expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
      expect(body.counts).toEqual(expect.objectContaining({
        users: 1,
        teams: 1,
        auditEvents: 1
      }));
      expect(response.headers.get("x-sena-governance-status")).toBe(body.status);
      expect(response.headers.get("x-sena-deployment-readiness-status")).toBe("blocked");
      expect(pg.queries.some((query) => /SELECT revision, payload FROM "public"\."sena_enterprise_state"/.test(query))).toBe(true);
      expect(existsSync(path.join(enterpriseDbDir, "enterprise-db.json"))).toBe(false);
      expect(serialized).not.toContain("super-secret");
      expect(serialized).not.toContain("example.postgres.test");
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.doUnmock("pg");
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
