import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const expectedIdentityAlertIds = [
  "readiness-blocking-identity-evidence-host-allowlist",
  "readiness-blocking-identity-secret-version-binding",
  "readiness-blocking-identity-secret-store-reference",
  "readiness-blocking-identity-secret-rotation-cadence",
  "readiness-blocking-identity-idp-tenant-binding",
  "readiness-blocking-identity-lifecycle-owner-mode"
] as const;

describe("SENA ops alerts route", () => {
  it("returns identity production alert headers for deployment monitors", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-alerts-route-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENA_OPS_TOKEN", "sena-test-ops-token");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    try {
      const route = await import("../../../app/api/sena/ops/alerts/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/alerts", {
        headers: {
          authorization: "Bearer sena-test-ops-token"
        }
      }));
      const body = await response.json() as {
        status?: string;
        summary?: {
          firing?: number;
        };
        alerts?: Array<{
          id: string;
          severity: string;
          source: string;
        }>;
      };
      const identityAlerts = body.alerts
        ?.filter((alert) => expectedIdentityAlertIds.includes(alert.id as (typeof expectedIdentityAlertIds)[number])) ?? [];

      expect(response.status).toBe(503);
      expect(body.status).toBe("critical");
      expect(identityAlerts.map((alert) => alert.id)).toEqual(expect.arrayContaining([...expectedIdentityAlertIds]));
      expect(identityAlerts.every((alert) => alert.severity === "critical")).toBe(true);
      expect(identityAlerts.every((alert) => alert.source === "deployment-readiness")).toBe(true);
      expect(response.headers.get("x-sena-ops-alert-status")).toBe(body.status);
      expect(response.headers.get("x-sena-ops-alert-firing")).toBe(String(body.summary?.firing));
      expect(response.headers.get("x-sena-identity-alert-count")).toBe(String(identityAlerts.length));
      expect(response.headers.get("x-sena-identity-alert-blockers")).toBe(identityAlerts.map((alert) => alert.id).join("|"));
      expect(response.headers.get("x-sena-identity-alert-severity")).toBe("critical");
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
