import { describe, expect, it, vi } from "vitest";

describe("SENA ops API bearer access", () => {
  it("accepts the primary ops token", async () => {
    vi.resetModules();
    vi.stubEnv("SENA_OPS_TOKEN", "sena-primary-ops-token");
    vi.stubEnv("SENA_OPS_AUTOMATION_TOKEN", "sena-automation-ops-token");

    try {
      const { requireOpsAccess } = await import("../ops-api");
      const access = await requireOpsAccess(new Request("https://sena.example.test/api/sena/ops/status", {
        headers: {
          authorization: "Bearer sena-primary-ops-token"
        }
      }));

      expect(access).toEqual({ mode: "bearer" });
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("accepts the automation ops token without replacing the primary token", async () => {
    vi.resetModules();
    vi.stubEnv("SENA_OPS_TOKEN", "sena-primary-ops-token");
    vi.stubEnv("SENA_OPS_AUTOMATION_TOKEN", "sena-automation-ops-token");

    try {
      const { requireOpsAccess } = await import("../ops-api");
      const access = await requireOpsAccess(new Request("https://sena.example.test/api/sena/ops/status", {
        headers: {
          authorization: "Bearer sena-automation-ops-token"
        }
      }));

      expect(access).toEqual({ mode: "bearer" });
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("rejects bearer tokens that match neither configured ops token", async () => {
    vi.resetModules();
    vi.stubEnv("SENA_OPS_TOKEN", "sena-primary-ops-token");
    vi.stubEnv("SENA_OPS_AUTOMATION_TOKEN", "sena-automation-ops-token");

    try {
      const { requireOpsAccess } = await import("../ops-api");
      await expect(requireOpsAccess(new Request("https://sena.example.test/api/sena/ops/status", {
        headers: {
          authorization: "Bearer wrong-token"
        }
      }))).rejects.toMatchObject({
        code: "ops_token_invalid",
        status: 401
      });
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
