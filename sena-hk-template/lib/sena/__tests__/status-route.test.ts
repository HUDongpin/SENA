import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const expectedIdentityReadinessIds = [
  "identity-evidence-host-allowlist",
  "identity-secret-version-binding",
  "identity-secret-store-reference",
  "identity-secret-rotation-cadence",
  "identity-idp-tenant-binding",
  "identity-lifecycle-owner-mode"
] as const;

describe("SENA ops status route", () => {
  it("returns identity readiness headers beside runtime status for deployment monitors", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-status-route-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENA_OPS_TOKEN", "sena-test-ops-token");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    try {
      const route = await import("../../../app/api/sena/ops/status/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/status", {
        headers: {
          authorization: "Bearer sena-test-ops-token"
        }
      }));
      const body = await response.json() as {
        status?: string;
      };

      expect(response.headers.get("x-sena-ops-status")).toBe(body.status);
      expect(response.headers.get("x-sena-deployment-readiness-status")).toBe("blocked");
      expect(response.headers.get("x-sena-identity-readiness-blocking-count"))
        .toBe(String(expectedIdentityReadinessIds.length));
      expect(response.headers.get("x-sena-identity-readiness-blockers"))
        .toBe(expectedIdentityReadinessIds.join("|"));
      expect(response.headers.get("x-sena-identity-evidence-host-allowlist")).toBe("review");
      expect(response.headers.get("x-sena-identity-secret-version-binding")).toBe("review");
      expect(response.headers.get("x-sena-identity-secret-store-reference")).toBe("review");
      expect(response.headers.get("x-sena-identity-secret-rotation-cadence")).toBe("review");
      expect(response.headers.get("x-sena-identity-idp-tenant-binding")).toBe("review");
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
