import {
  assertSenaReliabilityDeclaredRequestBytesWithinLimits,
  assertSenaReliabilityRequestChunksWithinLimits,
  SENA_RELIABILITY_UNIVERSE_LIMITS,
  SenaReliabilitySourceInputError,
  SenaReliabilityUniverseLimitError
} from "../reliability";
import { SenaReliabilityJsonPreflightScanner } from "../reliability-json-preflight";

const SENA_RELIABILITY_MULTIPART_HEADER_BYTES = 64 * 1024;
const SENA_RELIABILITY_MULTIPART_PARTS = 128;

class ChunkByteCursor {
  private chunkIndex = 0;
  private byteIndex = 0;

  constructor(private readonly chunks: readonly Uint8Array[]) {}

  next() {
    while (this.chunkIndex < this.chunks.length) {
      const chunk = this.chunks[this.chunkIndex];
      if (this.byteIndex < chunk.byteLength) {
        const value = chunk[this.byteIndex];
        this.byteIndex += 1;
        return value;
      }
      this.chunkIndex += 1;
      this.byteIndex = 0;
    }
    return undefined;
  }
}

function asciiBytes(value: string) {
  return new TextEncoder().encode(value);
}

function multipartBoundary(contentType: string | null) {
  if (!contentType?.toLowerCase().includes("multipart/form-data")) return undefined;
  const match = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const boundary = (match?.[1] ?? match?.[2] ?? "").trim();
  if (!boundary || boundary.length > 200 || !/^[\x20-\x7e]+$/.test(boundary)) return undefined;
  return boundary;
}

function multipartPrefixTable(pattern: Uint8Array) {
  const table = new Uint32Array(pattern.byteLength);
  let matched = 0;
  for (let index = 1; index < pattern.byteLength; index += 1) {
    while (matched > 0 && pattern[index] !== pattern[matched]) matched = table[matched - 1];
    if (pattern[index] === pattern[matched]) matched += 1;
    table[index] = matched;
  }
  return table;
}

function scanMultipartUntil(
  cursor: ChunkByteCursor,
  pattern: Uint8Array,
  options: {
    collect?: boolean;
    maximum?: number;
    onMaximum?: () => never;
  } = {}
) {
  const prefix = multipartPrefixTable(pattern);
  const collected: number[] = [];
  let matched = 0;
  let scanned = 0;
  while (true) {
    const value = cursor.next();
    if (value === undefined) {
      throw new SenaReliabilitySourceInputError([{
        path: "files",
        rule: "valid-multipart-required"
      }]);
    }
    if (options.collect) collected.push(value);
    scanned += 1;
    while (matched > 0 && value !== pattern[matched]) matched = prefix[matched - 1];
    if (value === pattern[matched]) matched += 1;
    const confirmed = scanned - matched;
    if (options.maximum !== undefined && confirmed > options.maximum) options.onMaximum?.();
    if (matched === pattern.byteLength) {
      if (options.collect) collected.splice(collected.length - pattern.byteLength, pattern.byteLength);
      return { bytes: scanned - pattern.byteLength, collected: new Uint8Array(collected) };
    }
  }
}

function multipartDisposition(headers: string) {
  const line = headers.split("\r\n").find((value) => /^content-disposition\s*:/i.test(value));
  if (!line) return { name: undefined, hasFilename: false };
  const name = /(?:^|;)\s*name=(?:"([^"]*)"|([^;\s]*))/i.exec(line);
  return {
    name: name?.[1] ?? name?.[2],
    hasFilename: /(?:^|;)\s*filename=(?:"[^"]*"|[^;\s]*)/i.test(line)
  };
}

function reliabilityMultipartLimit(
  rule: string,
  maximum: number,
  actual = maximum + 1
): never {
  throw new SenaReliabilityUniverseLimitError([{
    path: "files",
    rule,
    actual,
    maximum
  }]);
}

/**
 * Walk the multipart framing without materializing FormData. File-looking
 * parts and every `files` field are charged before the framework parser can
 * allocate File objects, including ignored filename fields and invalid string
 * values that the semantic route will subsequently reject.
 */
function preflightReliabilityMultipart(
  chunks: readonly Uint8Array[],
  contentType: string | null,
  limits: { sourceBytes: number; aggregateSourceBytes: number }
) {
  const boundary = multipartBoundary(contentType);
  if (!boundary) {
    if (contentType?.toLowerCase().includes("multipart/form-data")) {
      throw new SenaReliabilitySourceInputError([{
        path: "files",
        rule: "valid-multipart-required"
      }]);
    }
    return;
  }
  const cursor = new ChunkByteCursor(chunks);
  const initialBoundary = asciiBytes(`--${boundary}`);
  scanMultipartUntil(cursor, initialBoundary, {
    maximum: SENA_RELIABILITY_MULTIPART_HEADER_BYTES,
    onMaximum: () => reliabilityMultipartLimit(
      `multipart-preamble-byte-count-at-most-${SENA_RELIABILITY_MULTIPART_HEADER_BYTES}`,
      SENA_RELIABILITY_MULTIPART_HEADER_BYTES
    )
  });
  const bodyBoundary = asciiBytes(`\r\n--${boundary}`);
  const headerTerminator = asciiBytes("\r\n\r\n");
  let aggregateSourceBytes = 0;
  let sourceCount = 0;
  let partCount = 0;

  while (true) {
    const first = cursor.next();
    const second = cursor.next();
    if (first === 45 && second === 45) return;
    if (first !== 13 || second !== 10) {
      throw new SenaReliabilitySourceInputError([{
        path: "files",
        rule: "valid-multipart-required"
      }]);
    }
    partCount += 1;
    if (partCount > SENA_RELIABILITY_MULTIPART_PARTS) {
      reliabilityMultipartLimit(
        `multipart-part-count-at-most-${SENA_RELIABILITY_MULTIPART_PARTS}`,
        SENA_RELIABILITY_MULTIPART_PARTS,
        partCount
      );
    }
    const header = scanMultipartUntil(cursor, headerTerminator, {
      collect: true,
      maximum: SENA_RELIABILITY_MULTIPART_HEADER_BYTES,
      onMaximum: () => reliabilityMultipartLimit(
        `multipart-part-header-byte-count-at-most-${SENA_RELIABILITY_MULTIPART_HEADER_BYTES}`,
        SENA_RELIABILITY_MULTIPART_HEADER_BYTES
      )
    });
    const disposition = multipartDisposition(new TextDecoder("utf-8", { fatal: true }).decode(header.collected));
    const source = disposition.name === "files" || disposition.hasFilename;
    if (source) {
      sourceCount += 1;
      if (sourceCount > SENA_RELIABILITY_UNIVERSE_LIMITS.sources) {
        reliabilityMultipartLimit(
          `source-count-at-most-${SENA_RELIABILITY_UNIVERSE_LIMITS.sources}`,
          SENA_RELIABILITY_UNIVERSE_LIMITS.sources,
          sourceCount
        );
      }
    }
    const remainingAggregateSourceBytes = limits.aggregateSourceBytes - aggregateSourceBytes;
    const part = scanMultipartUntil(cursor, bodyBoundary, source ? {
      maximum: Math.min(limits.sourceBytes, remainingAggregateSourceBytes),
      onMaximum: () => {
        if (limits.sourceBytes <= remainingAggregateSourceBytes) {
          return reliabilityMultipartLimit(
            `source-byte-count-at-most-${limits.sourceBytes}`,
            limits.sourceBytes
          );
        }
        return reliabilityMultipartLimit(
          `aggregate-source-byte-count-at-most-${limits.aggregateSourceBytes}`,
          limits.aggregateSourceBytes
        );
      }
    } : {});
    if (source) {
      if (part.bytes > limits.sourceBytes) {
        reliabilityMultipartLimit(`source-byte-count-at-most-${limits.sourceBytes}`, limits.sourceBytes);
      }
      aggregateSourceBytes += part.bytes;
      if (aggregateSourceBytes > limits.aggregateSourceBytes) {
        reliabilityMultipartLimit(
          `aggregate-source-byte-count-at-most-${limits.aggregateSourceBytes}`,
          limits.aggregateSourceBytes
        );
      }
    }
  }
}

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
  options: {
    json: boolean;
    maximum?: number;
    sourceBytes?: number;
    aggregateSourceBytes?: number;
  }
) {
  const maximum = options.maximum ?? SENA_RELIABILITY_UNIVERSE_LIMITS.requestBytes;
  const path = options.json ? "annotations" as const : "files" as const;
  assertDeclaredReliabilityTransportWithinLimits(request, options.json, maximum);
  if (!request.body) return request;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  const jsonDecoder = options.json ? new TextDecoder("utf-8") : undefined;
  let jsonScanner = options.json ? new SenaReliabilityJsonPreflightScanner({
    mode: "request",
    maximumSourceBytes: options.sourceBytes,
    maximumAggregateSourceBytes: options.aggregateSourceBytes
  }) : undefined;
  let deferredJsonSyntaxError: SenaReliabilitySourceInputError | undefined;
  const maximumDecodeChunkBytes = 64 * 1024;
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
      if (jsonDecoder && jsonScanner) {
        // A web stream may yield one aggregate-sized Uint8Array. Feed fixed
        // views immediately so early admission failures cancel upstream reads
        // and no aggregate-sized temporary UTF-16 string is ever created.
        try {
          for (let offset = 0; offset < value.byteLength; offset += maximumDecodeChunkBytes) {
            jsonScanner.write(jsonDecoder.decode(
              value.subarray(offset, Math.min(value.byteLength, offset + maximumDecodeChunkBytes)),
              { stream: true }
            ));
          }
        } catch (error) {
          // For malformed syntax, keep reading only to preserve the harder
          // transport-byte error when an absent/understated declaration later
          // crosses its cap. Structural universe and source-shape failures are
          // already definitive and cancel upstream immediately.
          if (error instanceof SenaReliabilitySourceInputError &&
            error.issues.every((issue) => issue.rule === "valid-json-required")) {
            deferredJsonSyntaxError = error;
            jsonScanner = undefined;
          } else {
            throw error;
          }
        }
      }
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

  if (deferredJsonSyntaxError) throw deferredJsonSyntaxError;
  if (jsonDecoder && jsonScanner) {
    jsonScanner.write(jsonDecoder.decode()).finish();
  } else {
    try {
      preflightReliabilityMultipart(chunks, request.headers.get("content-type"), {
        sourceBytes: options.sourceBytes ?? SENA_RELIABILITY_UNIVERSE_LIMITS.sourceBytes,
        aggregateSourceBytes: options.aggregateSourceBytes ?? SENA_RELIABILITY_UNIVERSE_LIMITS.aggregateSourceBytes
      });
    } catch (error) {
      if (error instanceof SenaReliabilityUniverseLimitError || error instanceof SenaReliabilitySourceInputError) throw error;
      throw new SenaReliabilitySourceInputError([{
        path: "files",
        rule: "valid-multipart-required"
      }]);
    }
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
