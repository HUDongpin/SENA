import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const endpoint = "https://sena.example.test/api/sena/ops/jobs/worker";
const secret = "server-job-worker-transport-test-secret";
const maximumBytes = 65_536;
const maximumChunks = 1_024;

function workerRequest(
  body: BodyInit,
  headers: Record<string, string> = {},
  event = "server_job.queue"
) {
  const signingBody = typeof body === "string" ? body : "";
  const timestamp = new Date().toISOString();
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sena-webhook-event": event,
      "x-sena-webhook-timestamp": timestamp,
      "x-sena-job-payload-sha256": createHash("sha256").update(signingBody).digest("hex"),
      "x-sena-webhook-signature": `sha256=${createHmac("sha256", secret).update(`${timestamp}.${signingBody}`).digest("hex")}`,
      ...headers
    },
    body,
    ...((body instanceof ReadableStream) ? { duplex: "half" } : {})
  } as RequestInit & { duplex?: "half" });
}

async function routeWithExecutionSpy() {
  const execute = vi.fn(async () => ({ status: "succeeded" as const }));
  vi.doMock("@/lib/sena/enterprise/server-job-worker-runtime", async () => {
    const actual = await vi.importActual<typeof import("../enterprise/server-job-worker-runtime")>(
      "../enterprise/server-job-worker-runtime"
    );
    return {
      ...actual,
      runEnterpriseServerJobFromQueueWebhook: execute
    };
  });
  const route = await import("../../../app/api/sena/ops/jobs/worker/route");
  return { route, execute };
}

describe("server job worker transport admission", () => {
  afterEach(() => {
    delete process.env.SENA_JOB_QUEUE_SECRET;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("fast-fails an oversized declared body before pulling the unauthenticated stream", async () => {
    process.env.SENA_JOB_QUEUE_SECRET = secret;
    const { route, execute } = await routeWithExecutionSpy();
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      }
    });
    const response = await route.POST(workerRequest(stream, {
      "content-length": String(maximumBytes + 1)
    }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: "server_job_worker_request_too_large" });
    // Undici may perform one eager pull while constructing Request; admission
    // itself must not ask the stream for another chunk.
    expect(pulls).toBeLessThanOrEqual(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(["absent", "understated"] as const)(
    "caps an oversized streamed body with %s Content-Length",
    async (declaration) => {
      process.env.SENA_JOB_QUEUE_SECRET = secret;
      const { route, execute } = await routeWithExecutionSpy();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(maximumBytes + 1));
          controller.close();
        }
      });
      const response = await route.POST(workerRequest(stream,
        declaration === "understated" ? { "content-length": "1" } : {}));

      expect(response.status).toBe(413);
      await expect(response.json()).resolves.toMatchObject({ code: "server_job_worker_request_too_large" });
      expect(execute).not.toHaveBeenCalled();
    }
  );

  it("caps a zero-byte chunk storm before signature work or execution", async () => {
    process.env.SENA_JOB_QUEUE_SECRET = secret;
    const { route, execute } = await routeWithExecutionSpy();
    let emitted = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emitted < maximumChunks + 1) {
          emitted += 1;
          controller.enqueue(new Uint8Array());
          return;
        }
        controller.close();
      }
    });
    const response = await route.POST(workerRequest(stream));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ code: "server_job_worker_request_too_fragmented" });
    expect(emitted).toBeLessThanOrEqual(maximumChunks + 1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON media type before reading or executing", async () => {
    process.env.SENA_JOB_QUEUE_SECRET = secret;
    const { route, execute } = await routeWithExecutionSpy();
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      }
    });
    const response = await route.POST(workerRequest(stream, { "content-type": "text/plain" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "server_job_worker_content_type_invalid" });
    expect(pulls).toBeLessThanOrEqual(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects missing authentication headers before pulling the body", async () => {
    process.env.SENA_JOB_QUEUE_SECRET = secret;
    const { route, execute } = await routeWithExecutionSpy();
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      }
    });
    const request = workerRequest(stream);
    request.headers.delete("x-sena-webhook-signature");
    const response = await route.POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "server_job_worker_signature_required" });
    expect(pulls).toBeLessThanOrEqual(1);
    expect(execute).not.toHaveBeenCalled();
  });
});
