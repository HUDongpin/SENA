import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const identityReadinessIds = [
  "identity-evidence-host-allowlist",
  "identity-secret-version-binding",
  "identity-secret-store-reference",
  "identity-secret-rotation-cadence",
  "identity-idp-tenant-binding",
  "identity-lifecycle-owner-mode"
] as const;

type ReadinessBody = {
  status?: string;
  summary?: {
    blockingReview?: number;
    blockers?: string[];
  };
  blocking?: Array<{
    id: string;
    status: string;
  }>;
};

function itemStatus(body: ReadinessBody, id: string) {
  return body.blocking?.find((item) => item.id === id)?.status;
}

describe("SENA deployment readiness route", () => {
  it("returns identity production readiness headers for production deployment monitors", async () => {
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-readiness-route-"));
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENA_OPS_TOKEN", "sena-test-ops-token");
    process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
    process.env.SENA_APP_URL = "https://sena.example.test";
    vi.doMock("@/lib/sena/enterprise", async () => await import("../enterprise"));
    vi.doMock("@/lib/sena/api-helpers", async () => await import("../api-helpers"));
    vi.doMock("@/lib/sena/ops-api", async () => await import("../ops-api"));

    try {
      const route = await import("../../../app/api/sena/ops/readiness/route");
      const response = await route.GET(new Request("https://sena.example.test/api/sena/ops/readiness", {
        headers: {
          authorization: "Bearer sena-test-ops-token"
        }
      }));
      const body = await response.json() as ReadinessBody;
      const identityBlockers = body.summary?.blockers
        ?.filter((blocker) => identityReadinessIds.includes(blocker as (typeof identityReadinessIds)[number]))
        .join("|") || "none";

      expect(response.status).toBe(503);
      expect(body.status).toBe("blocked");
      expect(body.summary?.blockers).toEqual(expect.arrayContaining([...identityReadinessIds]));
      expect(response.headers.get("x-sena-deployment-readiness-status")).toBe(body.status);
      expect(response.headers.get("x-sena-deployment-readiness-blocking-review")).toBe(String(body.summary?.blockingReview));
      expect(response.headers.get("x-sena-deployment-readiness-blockers")).toBe(body.summary?.blockers?.join("|"));
      expect(response.headers.get("x-sena-identity-readiness-blockers")).toBe(identityBlockers);
      expect(response.headers.get("x-sena-identity-evidence-host-allowlist"))
        .toBe(itemStatus(body, "identity-evidence-host-allowlist"));
      expect(response.headers.get("x-sena-identity-secret-version-binding"))
        .toBe(itemStatus(body, "identity-secret-version-binding"));
      expect(response.headers.get("x-sena-identity-secret-store-reference"))
        .toBe(itemStatus(body, "identity-secret-store-reference"));
      expect(response.headers.get("x-sena-identity-secret-rotation-cadence"))
        .toBe(itemStatus(body, "identity-secret-rotation-cadence"));
      expect(response.headers.get("x-sena-identity-idp-tenant-binding"))
        .toBe(itemStatus(body, "identity-idp-tenant-binding"));
      expect(response.headers.get("x-sena-identity-lifecycle-owner-mode"))
        .toBe(itemStatus(body, "identity-lifecycle-owner-mode"));
    } finally {
      delete process.env.SENA_APP_URL;
      delete process.env.SENA_ENTERPRISE_DB_DIR;
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
