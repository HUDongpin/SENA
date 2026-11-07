import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function environment(mode = "managed") {
  vi.stubEnv("SENA_JOB_QUEUE_ADAPTER", mode);
  vi.stubEnv("SENA_JOB_QUEUE_URL", "https://queue.example.test/dispatch");
  vi.stubEnv("SENA_JOB_WORKER_CALLBACK_URL", "https://worker.example.test/api/sena/ops/jobs/worker");
  vi.stubEnv("SENA_JOB_QUEUE_SECRET", "test-queue-signing-key-with-32-bytes");
  vi.stubEnv("SENA_JOB_QUEUE_PROVIDER_TOKEN", "test-provider-token");
  vi.stubEnv("SENA_JOB_QUEUE_PROVIDER_URL", "https://provider.example.test");
}

describe("external-worker proof queue transport", () => {
  it("dispatches the proof with the existing HMAC envelope and refuses redirects", async () => {
    environment();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const queue = await import("../enterprise/server-job-queue");
    expect(typeof queue.dispatchEnterpriseServerJobWorkerProof).toBe("function");
    const payload = { schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerProofChallenge, nonce: "b".repeat(64) };
    const result = await queue.dispatchEnterpriseServerJobWorkerProof(payload);
    expect(result.webhookStatus).toBe("delivered");
    expect(result.httpStatus).toBe(202);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://queue.example.test/dispatch");
    expect(request.redirect).toBe("error");
    const headers = new Headers(request.headers);
    expect(headers.get("x-sena-webhook-event")).toBe("server_job.worker.proof");
    expect(headers.get("x-sena-job-payload-sha256")).toBe(createHash("sha256").update(String(request.body)).digest("hex"));
    expect(headers.get("x-sena-webhook-signature")).toBe("sha256=" + createHmac("sha256", process.env.SENA_JOB_QUEUE_SECRET!)
      .update(`${headers.get("x-sena-webhook-timestamp")}.${request.body}`).digest("hex"));
  });

  it("uses the existing QStash destination and forwarded headers without changing callback semantics", async () => {
    environment("qstash");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const queue = await import("../enterprise/server-job-queue");
    expect(typeof queue.serverJobWorkerProofTransport).toBe("function");
    const transport = queue.serverJobWorkerProofTransport();
    expect(transport.workerUrl).toBe("https://worker.example.test/api/sena/ops/jobs/worker");
    await queue.dispatchEnterpriseServerJobWorkerProof({ schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerProofChallenge });
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://provider.example.test/v2/publish/" + encodeURIComponent(transport.workerUrl));
    const headers = new Headers(request.headers);
    expect(headers.get("upstash-forward-x-sena-webhook-event")).toBe("server_job.worker.proof");
    expect(headers.get("authorization")).toBe("Bearer test-provider-token");
  });

  it("does not treat an error response as accepted delivery", async () => {
    environment();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const queue = await import("../enterprise/server-job-queue");
    expect(typeof queue.dispatchEnterpriseServerJobWorkerProof).toBe("function");
    expect(await queue.dispatchEnterpriseServerJobWorkerProof({ schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerProofChallenge }))
      .toEqual(expect.objectContaining({ webhookStatus: "failed", httpStatus: 503 }));
  });

  it("refuses the local receipt adapter before any network request", async () => {
    environment("local");
    vi.stubEnv("SENA_JOB_QUEUE_ALLOW_LOCAL", "1");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const queue = await import("../enterprise/server-job-queue");
    expect(typeof queue.dispatchEnterpriseServerJobWorkerProof).toBe("function");
    await expect(queue.dispatchEnterpriseServerJobWorkerProof({ schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerProofChallenge }))
      .rejects.toMatchObject({ code: "worker_proof_queue_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
