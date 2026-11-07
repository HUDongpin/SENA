import { describe, expect, it, vi } from "vitest";
import { readWorkerProofCallbackRequest } from "../enterprise/server-job-worker-proof";

const timestamp = "1793174400";
const signature = `sha256=${"a".repeat(64)}`;
const headers = {
  "content-type": "application/json",
  "x-sena-worker-proof-timestamp": timestamp,
  "x-sena-worker-proof-signature": signature
};
const encoder = new TextEncoder();

function streamRequest(chunks: Uint8Array[], overrides: Record<string, string | undefined> = {}) {
  const requestHeaders = new Headers(headers);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) requestHeaders.delete(key);
    else requestHeaders.set(key, value);
  }
  let next = 0;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (next === chunks.length) controller.close();
      else controller.enqueue(chunks[next++]);
    },
    cancel
  });
  const request = new Request("https://preview.example.test/api/sena/ops/jobs/worker-proof/callback", {
    method: "POST", headers: requestHeaders, body, duplex: "half"
  } as RequestInit & { duplex: "half" });
  return { request, cancel };
}

describe("worker proof bounded raw HTTP body", () => {
  it.each([
    ["missing timestamp", { "x-sena-worker-proof-timestamp": undefined }],
    ["missing signature", { "x-sena-worker-proof-signature": undefined }],
    ["malformed timestamp", { "x-sena-worker-proof-timestamp": "not-a-time" }],
    ["malformed signature", { "x-sena-worker-proof-signature": "sha256=invalid" }],
    ["wrong signature scheme", { "x-sena-worker-proof-signature": "Bearer fixture-token" }]
  ] satisfies [string, Record<string, string | undefined>][])("rejects %s without reading the body", async (_label, override) => {
    const { request } = streamRequest([encoder.encode("{}")], override);
    await expect(readWorkerProofCallbackRequest(request))
      .rejects.toMatchObject({ status: 401, code: "worker_proof_authentication_failed" });
    expect(request.bodyUsed).toBe(false);
  });

  it.each([undefined, "text/plain", "application/octet-stream"])("rejects non-JSON content type %s before reading", async (contentType) => {
    const { request } = streamRequest([encoder.encode("{}")], { "content-type": contentType });
    await expect(readWorkerProofCallbackRequest(request))
      .rejects.toMatchObject({ status: 400, code: "worker_proof_input_invalid" });
    expect(request.bodyUsed).toBe(false);
  });

  it.each(["16385", "100000000000000000000", "-1", "4.5", "invalid"])("rejects invalid declared length %s before reading", async (length) => {
    const { request } = streamRequest([encoder.encode("{}")], { "content-length": length });
    await expect(readWorkerProofCallbackRequest(request))
      .rejects.toMatchObject({ status: 413, code: "worker_proof_body_too_large" });
    expect(request.bodyUsed).toBe(false);
  });

  it("rejects an actual oversized byte stream and cancels unread input", async () => {
    const { request, cancel } = streamRequest([new Uint8Array(16_385), encoder.encode("unread")]);
    await expect(readWorkerProofCallbackRequest(request))
      .rejects.toMatchObject({ status: 413, code: "worker_proof_body_too_large" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(request.body?.locked).toBe(false);
  });

  it("rejects a missing request body", async () => {
    const request = new Request("https://preview.example.test/api/sena/ops/jobs/worker-proof/callback", {
      method: "POST", headers
    });
    await expect(readWorkerProofCallbackRequest(request))
      .rejects.toMatchObject({ status: 400, code: "worker_proof_input_invalid" });
  });

  it("bounds fragmentation even when the byte total is small", async () => {
    const { request, cancel } = streamRequest(Array.from({ length: 130 }, () => encoder.encode(" ")));
    await expect(readWorkerProofCallbackRequest(request))
      .rejects.toMatchObject({ status: 413, code: "worker_proof_body_too_large" });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(request.body?.locked).toBe(false);
  });

  it("rejects malformed UTF-8 instead of replacing signed bytes", async () => {
    const { request } = streamRequest([Uint8Array.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x7d])]);
    await expect(readWorkerProofCallbackRequest(request))
      .rejects.toMatchObject({ status: 400, code: "worker_proof_input_invalid" });
    expect(request.body?.locked).toBe(false);
  });

  it.each(["1", "3"])("rejects declared length %s when the actual body has two bytes", async (length) => {
    const { request } = streamRequest([encoder.encode("{}")], { "content-length": length });
    await expect(readWorkerProofCallbackRequest(request))
      .rejects.toMatchObject({ status: 400, code: "worker_proof_input_invalid" });
  });

  it("returns exact raw Unicode and whitespace across split UTF-8 code units", async () => {
    const raw = ' \n{ "message": "學習 🧪", "order": [2,1] }\r\n';
    const bytes = encoder.encode(raw);
    const { request } = streamRequest(Array.from(bytes, (byte) => Uint8Array.of(byte)), {
      "content-type": "application/json; charset=utf-8", "content-length": String(bytes.byteLength)
    });
    expect(await readWorkerProofCallbackRequest(request)).toEqual({ body: raw, timestamp, signature });
    expect(request.bodyUsed).toBe(true);
    expect(request.body?.locked).toBe(false);
  });

  it("preserves a leading UTF-8 BOM so authentication sees the exact received text", async () => {
    const raw = '\uFEFF{"message":"bounded raw input"}';
    const bytes = encoder.encode(raw);
    const { request } = streamRequest([bytes.subarray(0, 1), bytes.subarray(1, 2), bytes.subarray(2)]);
    expect((await readWorkerProofCallbackRequest(request)).body).toBe(raw);
  });

  it("permits exactly the byte limit", async () => {
    const raw = " ".repeat(16_384);
    const { request } = streamRequest([encoder.encode(raw)], { "content-length": "16384" });
    expect((await readWorkerProofCallbackRequest(request)).body).toBe(raw);
  });

  it("permits exactly the chunk limit without changing the signed text", async () => {
    const raw = " ".repeat(128);
    const { request } = streamRequest(Array.from(raw, (value) => encoder.encode(value)));
    expect((await readWorkerProofCallbackRequest(request)).body).toBe(raw);
  });

  it("preserves raw malformed JSON for authentication by the callback receiver", async () => {
    const raw = "{not-json";
    const { request } = streamRequest([encoder.encode(raw)]);
    expect((await readWorkerProofCallbackRequest(request)).body).toBe(raw);
  });
});
