import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("SENA ops metrics route", () => {
  it("exports identity production readiness gauges for deployment monitoring", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-metrics-route-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENA_OPS_TOKEN", "sena-test-ops-token");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    try {
      const route = await import("../../../app/api/sena/ops/metrics/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/metrics", {
        headers: {
          authorization: "Bearer sena-test-ops-token"
        }
      }));
      const metrics = await response.text();

      expect(response.headers.get("content-type")).toContain("text/plain; version=0.0.4");
      expect(metrics).toContain("# HELP sena_enterprise_identity_readiness_blockers Identity production readiness blockers from deployment readiness.");
      expect(metrics).toContain("# TYPE sena_enterprise_identity_readiness_blockers gauge");
      expect(metrics).toContain('sena_enterprise_identity_readiness_blockers{readiness_status="blocked"} 6');
      expect(metrics).toContain("# HELP sena_enterprise_identity_readiness_item Identity production readiness item state.");
      expect(metrics).toContain('sena_enterprise_identity_readiness_item{item="identity-idp-tenant-binding",status="review"} 1');
      expect(metrics).toContain('sena_enterprise_identity_readiness_item{item="identity-secret-rotation-cadence",status="review"} 1');
      expect(metrics).toContain('sena_enterprise_identity_readiness_item{item="identity-lifecycle-owner-mode",status="review"} 1');
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
