import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("../enterprise/server-job-worker-proof");
  vi.resetModules();
});

describe("worker proof route credential boundaries", () => {
  it("refuses unauthenticated challenge issuance", async () => {
    vi.stubEnv("SENA_OPS_TOKEN", "route-test-ops-token");
    const { POST } = await import("../../../app/api/sena/ops/jobs/worker-proof/route");
    const response = await POST(new Request("https://sena.example.test/api/sena/ops/jobs/worker-proof", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("refuses an incorrect ops bearer even if a caller supplies proof configuration", async () => {
    vi.stubEnv("SENA_OPS_TOKEN", "route-test-ops-token");
    const { POST } = await import("../../../app/api/sena/ops/jobs/worker-proof/route");
    const response = await POST(new Request("https://sena.example.test/api/sena/ops/jobs/worker-proof", {
      method: "POST", headers: { authorization: "Bearer incorrect", "content-type": "application/json" },
      body: JSON.stringify({ confirmed: true, environment: "production", nonce: "forged" })
    }));
    expect(response.status).toBe(401);
  });

  it("does not accept the ops bearer as a worker callback credential", async () => {
    vi.stubEnv("SENA_OPS_TOKEN", "route-test-ops-token");
    const { POST } = await import("../../../app/api/sena/ops/jobs/worker-proof/callback/route");
    const response = await POST(new Request("https://sena.example.test/api/sena/ops/jobs/worker-proof/callback", {
      method: "POST", headers: { authorization: "Bearer route-test-ops-token", "content-type": "application/json" },
      body: JSON.stringify({ confirmed: true })
    }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "worker_proof_authentication_failed" });
  });

  it("returns a documented failure code while preserving redacted dispatch evidence", async () => {
    vi.stubEnv("SENA_OPS_TOKEN", "route-test-ops-token");
    vi.doMock("../enterprise/server-job-worker-proof", () => ({
      issueWorkerProofChallenge: async () => ({
        status: "dispatch-failed", challengeIdSha256: "a".repeat(64),
        dispatch: { status: "failed", httpStatus: 401 }
      })
    }));
    const { POST } = await import("../../../app/api/sena/ops/jobs/worker-proof/route");
    const response = await POST(new Request("https://sena.example.test/api/sena/ops/jobs/worker-proof", {
      method: "POST", headers: { authorization: "Bearer route-test-ops-token" }
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: "Worker proof dispatch failed.", code: "worker_proof_dispatch_failed",
      status: "dispatch-failed", challengeIdSha256: "a".repeat(64),
      dispatch: { status: "failed", httpStatus: 401 }
    });
  });
});
