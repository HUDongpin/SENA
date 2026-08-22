import {
  assertSenaReliabilityDeclaredRequestBytesWithinLimits,
  assertSenaReliabilityRequestChunksWithinLimits,
  SENA_RELIABILITY_UNIVERSE_LIMITS
} from "../reliability";
import { SenaReliabilityJsonPreflightScanner } from "../reliability-json-preflight";

function assertDeclaredReliabilityTransportWithinLimits(request: Request, json: boolean, maximum: number) {
  const contentLength = request.headers.get("content-length")?.trim();
  if (!contentLength) return;
  assertSenaReliabilityDeclaredRequestBytesWithinLimits(
    Number(contentLength),
    json ? "annotations" : "files",
    maximum
  );
}

/**
 * Materialize a reliability request only inside its hard transport budget.
 *
 * Next's request.json()/formData() own their parsers but do not expose a byte
 * callback. Reading the web stream here makes the byte cap independent of an
 * absent or understated Content-Length; only after EOF inside the cap do we
 * reconstruct a Request for those framework parsers. A body-less Request is
 * returned as-is for synthetic callers that provide their own json/formData.
 */
export async function readSenaReliabilityBoundedTransportRequest(
  request: Request,
  options: { json: boolean; maximum?: number }
) {
  const maximum = options.maximum ?? SENA_RELIABILITY_UNIVERSE_LIMITS.requestBytes;
  const path = options.json ? "annotations" as const : "files" as const;
  assertDeclaredReliabilityTransportWithinLimits(request, options.json, maximum);
  if (!request.body) return request;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let chunkCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const nextChunkCount = chunkCount < Number.MAX_SAFE_INTEGER
      ? chunkCount + 1
      : Number.MAX_SAFE_INTEGER + 1;
    const next = value.byteLength <= Number.MAX_SAFE_INTEGER - total
      ? total + value.byteLength
      : Number.MAX_SAFE_INTEGER + 1;
    try {
      // This count is independent of byte length: a zero-byte chunk still
      // costs one reader iteration and therefore consumes the object/work cap.
      assertSenaReliabilityRequestChunksWithinLimits(nextChunkCount, path);
      assertSenaReliabilityDeclaredRequestBytesWithinLimits(next, path, maximum);
    } catch (error) {
      try {
        await reader.cancel();
      } catch {
        // Preserve the stable admission error if stream cancellation itself
        // fails; cancellation diagnostics must never replace the public body.
      }
      throw error;
    }
    chunkCount = nextChunkCount;
    total = next;
    // Empty chunks have no replay semantics, but were counted above. Every
    // retained/replayed object is therefore bounded by requestChunks too.
    if (value.byteLength > 0) chunks.push(value);
  }

  if (options.json) {
    const decoder = new TextDecoder("utf-8");
    const scanner = new SenaReliabilityJsonPreflightScanner({ mode: "request" });
    for (const chunk of chunks) scanner.write(decoder.decode(chunk, { stream: true }));
    scanner.write(decoder.decode()).finish();
  }

  let chunkIndex = 0;
  const boundedBody = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (chunkIndex >= chunks.length) {
        controller.close();
        return;
      }
      const chunk = chunks[chunkIndex];
      // Release this module's reference as soon as the reconstructed request
      // takes the chunk; do not allocate a second aggregate-sized copy.
      chunks[chunkIndex] = new Uint8Array(0);
      chunkIndex += 1;
      controller.enqueue(chunk);
    }
  });
  const headers = new Headers(request.headers);
  headers.set("content-length", String(total));
  return new Request(request.url, {
    method: request.method,
    headers,
    body: boundedBody,
    signal: request.signal,
    duplex: "half"
  } as RequestInit & { duplex: "half" });
}
