import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const envNames = [
  "SENA_JOB_QUEUE_SECRET",
  "SENA_JOB_WORKER_RUNTIME"
];

function signedProbeRequest(input: {
  body?: string;
  secret?: string;
  payloadHash?: string;
  signature?: string;
  event?: string;
} = {}) {
  const body = input.body ?? JSON.stringify({
    schemaVersion: "sena-enterprise-server-job-queue-probe/v1",
    generatedAt: "2026-07-02T00:00:00.000Z",
    probe: {
      probeId: "probe-secret-value",
      dispatchEvent: "server_job.queue.probe",
      syntheticUserDataIncluded: false
    },
    redaction: {
      secretValuesExcluded: true
    }
  });
  const timestamp = "2026-07-02T00:00:00.000Z";
  const secret = input.secret ?? "sena-test-job-queue-secret";
  const payloadHash = input.payloadHash ?? createHash("sha256").update(body).digest("hex");
  const signature = input.signature ??
    `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  return new Request("https://sena.example.test/api/sena/ops/jobs/worker", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sena-webhook-event": input.event ?? "server_job.queue.probe",
      "x-sena-webhook-timestamp": timestamp,
      "x-sena-job-payload-sha256": payloadHash,
      "x-sena-webhook-signature": signature
    },
    body
  });
}

describe("SENA server job worker receiver route", () => {
  afterEach(() => {
    for (const name of envNames) delete process.env[name];
    vi.resetModules();
  });

  it("accepts signed queue probe webhooks without leaking payload or secret values", async () => {
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-queue-secret";
    process.env.SENA_JOB_WORKER_RUNTIME = "vercel-serverless-queue-receiver";
    const route = await import("../../../app/api/sena/ops/jobs/worker/route");

    const response = await route.POST(signedProbeRequest());
    const body = await response.json() as {
      schemaVersion?: string;
      status?: string;
      event?: string;
      probe?: { accepted?: boolean };
      delivery?: { signatureVerified?: boolean; payloadSha256?: string };
    };
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(202);
    expect(response.headers.get("x-sena-server-job-worker")).toBe("accepted");
    expect(response.headers.get("x-sena-server-job-worker-event")).toBe("server_job.queue.probe");
    expect(response.headers.get("x-sena-server-job-worker-signature")).toBe("verified");
    expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-jobs-worker");
    expect(body.schemaVersion).toBe("sena-enterprise-server-job-queue-webhook-receipt/v1");
    expect(body.status).toBe("accepted");
    expect(body.event).toBe("server_job.queue.probe");
    expect(body.probe?.accepted).toBe(true);
    expect(body.delivery?.signatureVerified).toBe(true);
    expect(body.delivery?.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(serialized).not.toContain("sena-test-job-queue-secret");
    expect(serialized).not.toContain("probe-secret-value");
  });

  it("rejects queue webhooks when the payload hash is invalid", async () => {
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-queue-secret";
    const route = await import("../../../app/api/sena/ops/jobs/worker/route");

    const response = await route.POST(signedProbeRequest({
      payloadHash: "0".repeat(64)
    }));
    const body = await response.json() as { code?: string };

    expect(response.status).toBe(401);
    expect(body.code).toBe("server_job_worker_payload_hash_invalid");
    expect(response.headers.get("x-sena-observed-route")).toBe("sena-ops-jobs-worker");
  });

  it("rejects queue webhooks when the signature is missing", async () => {
    process.env.SENA_JOB_QUEUE_SECRET = "sena-test-job-queue-secret";
    const route = await import("../../../app/api/sena/ops/jobs/worker/route");
    const request = signedProbeRequest();
    request.headers.delete("x-sena-webhook-signature");

    const response = await route.POST(request);
    const body = await response.json() as { code?: string };

    expect(response.status).toBe(401);
    expect(body.code).toBe("server_job_worker_signature_required");
  });
});
