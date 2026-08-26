import { SenaEnterpriseError } from "./errors";

export type SenaRequestAdmissionCodes = {
  contentTypeInvalid: string;
  requestInvalid: string;
  requestTooLarge: string;
  requestTooFragmented: string;
  multipartLimitsExceeded?: string;
};

type SenaBoundedRequestOptions = {
  label: string;
  maximumBytes: number;
  maximumChunks: number;
  codes: SenaRequestAdmissionCodes;
};

export type SenaMultipartAdmissionLimits = {
  maximumFiles: number;
  maximumFileBytes: number;
  maximumAggregateFileBytes: number;
  maximumFields: number;
  maximumFieldBytes: number;
  maximumAggregateFieldBytes: number;
  maximumPartHeaderBytes?: number;
  maximumPreambleBytes?: number;
};

function admissionError(message: string, status: number, code: string): never {
  throw new SenaEnterpriseError(message, status, code);
}

function invalidRequest(options: SenaBoundedRequestOptions): never {
  admissionError(`${options.label} request must be a valid bounded request.`, 400, options.codes.requestInvalid);
}

function invalidContentType(options: SenaBoundedRequestOptions, expected: string): never {
  admissionError(
    `${options.label} request media type must be ${expected}.`,
    400,
    options.codes.contentTypeInvalid
  );
}

function requestTooLarge(options: SenaBoundedRequestOptions): never {
  admissionError(
    `${options.label} request exceeds the ${options.maximumBytes}-byte limit.`,
    413,
    options.codes.requestTooLarge
  );
}

function requestTooFragmented(options: SenaBoundedRequestOptions): never {
  admissionError(
    `${options.label} request uses too many streamed chunks.`,
    413,
    options.codes.requestTooFragmented
  );
}

function assertPositiveSafeLimit(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Invalid internal SENA request-admission limit: ${name}.`);
  }
}

function assertNonnegativeSafeLimit(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid internal SENA request-admission limit: ${name}.`);
  }
}

function assertRequestOptions(options: SenaBoundedRequestOptions) {
  assertPositiveSafeLimit(options.maximumBytes, "maximumBytes");
  assertPositiveSafeLimit(options.maximumChunks, "maximumChunks");
}

function normalizedMediaType(request: Request) {
  return request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
}

function assertDeclaredLength(request: Request, options: SenaBoundedRequestOptions) {
  const declared = request.headers.get("content-length")?.trim();
  if (declared === undefined || declared === "") return;
  if (!/^\d+$/.test(declared)) invalidRequest(options);
  const bytes = Number(declared);
  if (!Number.isSafeInteger(bytes)) requestTooLarge(options);
  if (bytes > options.maximumBytes) requestTooLarge(options);
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    await reader.cancel();
  } catch {
    // Preserve the stable admission error when an untrusted stream rejects
    // cancellation. The transport error remains the only public diagnostic.
  }
}

type BufferedRequest = {
  chunks: Uint8Array[];
  totalBytes: number;
};

async function bufferBoundedRequest(request: Request, options: SenaBoundedRequestOptions): Promise<BufferedRequest> {
  assertRequestOptions(options);
  assertDeclaredLength(request, options);
  if (!request.body) invalidRequest(options);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let chunkCount = 0;
  while (true) {
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await reader.read();
    } catch {
      await cancelReader(reader);
      invalidRequest(options);
    }
    if (result.done) break;
    chunkCount += 1;
    if (chunkCount > options.maximumChunks) {
      await cancelReader(reader);
      requestTooFragmented(options);
    }
    const chunk = result.value ?? new Uint8Array();
    if (chunk.byteLength > options.maximumBytes - totalBytes) {
      await cancelReader(reader);
      requestTooLarge(options);
    }
    totalBytes += chunk.byteLength;
    // Empty chunks are charged above but carry no replay bytes.
    if (chunk.byteLength > 0) chunks.push(chunk);
  }
  return { chunks, totalBytes };
}

function reconstructedRequest(request: Request, buffered: BufferedRequest) {
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= buffered.chunks.length) {
        controller.close();
        return;
      }
      const chunk = buffered.chunks[index];
      buffered.chunks[index] = new Uint8Array();
      index += 1;
      controller.enqueue(chunk);
    }
  });
  const headers = new Headers(request.headers);
  headers.set("content-length", String(buffered.totalBytes));
  return new Request(request.url, {
    method: request.method,
    headers,
    body,
    signal: request.signal,
    duplex: "half"
  } as RequestInit & { duplex: "half" });
}

function decodeJson(chunks: readonly Uint8Array[], options: SenaBoundedRequestOptions) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const text: string[] = [];
  const decodeChunkBytes = 64 * 1024;
  try {
    for (const chunk of chunks) {
      for (let offset = 0; offset < chunk.byteLength; offset += decodeChunkBytes) {
        text.push(decoder.decode(
          chunk.subarray(offset, Math.min(offset + decodeChunkBytes, chunk.byteLength)),
          { stream: true }
        ));
      }
    }
    text.push(decoder.decode());
    const parsed = JSON.parse(text.join("")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) invalidRequest(options);
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SenaEnterpriseError) throw error;
    invalidRequest(options);
  }
}

export async function readSenaBoundedJsonObjectRequest(
  request: Request,
  options: SenaBoundedRequestOptions
) {
  if (normalizedMediaType(request) !== "application/json") {
    invalidContentType(options, "application/json");
  }
  const buffered = await bufferBoundedRequest(request, options);
  const body = decodeJson(buffered.chunks, options);
  return {
    body,
    request: reconstructedRequest(request, buffered),
    byteLength: buffered.totalBytes
  };
}

class ChunkCursor {
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

function bytes(value: string) {
  return new TextEncoder().encode(value);
}

function prefixTable(pattern: Uint8Array) {
  const table = new Uint32Array(pattern.byteLength);
  let matched = 0;
  for (let index = 1; index < pattern.byteLength; index += 1) {
    while (matched > 0 && pattern[index] !== pattern[matched]) matched = table[matched - 1];
    if (pattern[index] === pattern[matched]) matched += 1;
    table[index] = matched;
  }
  return table;
}

function scanUntil(
  cursor: ChunkCursor,
  pattern: Uint8Array,
  options: {
    collect?: boolean;
    maximum?: number;
    onMaximum?: () => never;
    onInvalid: () => never;
  }
) {
  const prefix = prefixTable(pattern);
  const collected: number[] = [];
  let matched = 0;
  let scanned = 0;
  while (true) {
    const value = cursor.next();
    if (value === undefined) options.onInvalid();
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

function multipartBoundary(contentType: string | null) {
  if (!contentType?.toLowerCase().includes("multipart/form-data")) return undefined;
  const match = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const boundary = (match?.[1] ?? match?.[2] ?? "").trim();
  if (!boundary || boundary.length > 200 || !/^[\x20-\x7e]+$/.test(boundary)) return undefined;
  return boundary;
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

function preflightMultipart(
  buffered: BufferedRequest,
  contentType: string | null,
  options: SenaBoundedRequestOptions & { multipart: SenaMultipartAdmissionLimits }
) {
  const boundary = multipartBoundary(contentType);
  const invalid = () => invalidRequest(options);
  const limit = (rule: string): never => admissionError(
    `${options.label} multipart request exceeds the ${rule} limit.`,
    413,
    options.codes.multipartLimitsExceeded ?? options.codes.requestTooLarge
  );
  if (!boundary) invalid();
  const limits = options.multipart;
  for (const [name, value] of Object.entries({
    maximumFiles: limits.maximumFiles,
    maximumFields: limits.maximumFields,
    maximumFieldBytes: limits.maximumFieldBytes,
    maximumAggregateFieldBytes: limits.maximumAggregateFieldBytes
  })) assertPositiveSafeLimit(value, name);
  for (const [name, value] of Object.entries({
    maximumFileBytes: limits.maximumFileBytes,
    maximumAggregateFileBytes: limits.maximumAggregateFileBytes
  })) assertNonnegativeSafeLimit(value, name);
  const maximumHeader = limits.maximumPartHeaderBytes ?? 64 * 1024;
  const maximumPreamble = limits.maximumPreambleBytes ?? 64 * 1024;
  assertPositiveSafeLimit(maximumHeader, "maximumPartHeaderBytes");
  assertPositiveSafeLimit(maximumPreamble, "maximumPreambleBytes");

  const cursor = new ChunkCursor(buffered.chunks);
  scanUntil(cursor, bytes(`--${boundary}`), {
    maximum: maximumPreamble,
    onMaximum: () => limit("multipart-preamble-byte"),
    onInvalid: invalid
  });
  const partBoundary = bytes(`\r\n--${boundary}`);
  const headerTerminator = bytes("\r\n\r\n");
  let fileCount = 0;
  let fieldCount = 0;
  let aggregateFileBytes = 0;
  let aggregateFieldBytes = 0;

  while (true) {
    const first = cursor.next();
    const second = cursor.next();
    if (first === 45 && second === 45) return;
    if (first !== 13 || second !== 10) invalid();
    const header = scanUntil(cursor, headerTerminator, {
      collect: true,
      maximum: maximumHeader,
      onMaximum: () => limit("multipart-part-header-byte"),
      onInvalid: invalid
    });
    const disposition = (() => {
      try {
        return multipartDisposition(new TextDecoder("utf-8", { fatal: true }).decode(header.collected));
      } catch {
        return invalid();
      }
    })();
    if (!disposition.name) invalid();
    if (disposition.hasFilename) {
      fileCount += 1;
      if (fileCount > limits.maximumFiles) limit("file-count");
      const remainingAggregate = limits.maximumAggregateFileBytes - aggregateFileBytes;
      const part = scanUntil(cursor, partBoundary, {
        maximum: Math.min(limits.maximumFileBytes, remainingAggregate),
        onMaximum: () => limit(
          limits.maximumFileBytes <= remainingAggregate ? "per-file-byte" : "aggregate-file-byte"
        ),
        onInvalid: invalid
      });
      aggregateFileBytes += part.bytes;
      if (part.bytes > limits.maximumFileBytes) limit("per-file-byte");
      if (aggregateFileBytes > limits.maximumAggregateFileBytes) limit("aggregate-file-byte");
    } else {
      fieldCount += 1;
      if (fieldCount > limits.maximumFields) limit("field-count");
      const remainingAggregate = limits.maximumAggregateFieldBytes - aggregateFieldBytes;
      const part = scanUntil(cursor, partBoundary, {
        maximum: Math.min(limits.maximumFieldBytes, remainingAggregate),
        onMaximum: () => limit(
          limits.maximumFieldBytes <= remainingAggregate ? "per-field-byte" : "aggregate-field-byte"
        ),
        onInvalid: invalid
      });
      aggregateFieldBytes += part.bytes;
      if (part.bytes > limits.maximumFieldBytes) limit("per-field-byte");
      if (aggregateFieldBytes > limits.maximumAggregateFieldBytes) limit("aggregate-field-byte");
    }
  }
}

export async function readSenaBoundedMultipartRequest(
  request: Request,
  options: SenaBoundedRequestOptions & { multipart: SenaMultipartAdmissionLimits }
) {
  if (normalizedMediaType(request) !== "multipart/form-data") {
    invalidContentType(options, "multipart/form-data");
  }
  const buffered = await bufferBoundedRequest(request, options);
  preflightMultipart(buffered, request.headers.get("content-type"), options);
  return reconstructedRequest(request, buffered);
}

export function assertSenaRequestExactKeys(
  value: unknown,
  allowedKeys: readonly string[],
  options: { label: string; code: string }
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    admissionError(`${options.label} must be a JSON object.`, 400, options.code);
  }
  const allowed = new Set(allowedKeys);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
    admissionError(`${options.label} contains unsupported fields.`, 400, options.code);
  }
}

export function assertSenaRequestStringTreeBudget(
  value: unknown,
  options: {
    label: string;
    maximumStringBytes: number;
    maximumTotalBytes: number;
    maximumNodes: number;
    maximumDepth?: number;
    code: string;
  }
) {
  assertPositiveSafeLimit(options.maximumStringBytes, "maximumStringBytes");
  assertPositiveSafeLimit(options.maximumTotalBytes, "maximumTotalBytes");
  assertPositiveSafeLimit(options.maximumNodes, "maximumNodes");
  const maximumDepth = options.maximumDepth ?? 32;
  assertPositiveSafeLimit(maximumDepth, "maximumDepth");
  const seen = new WeakSet<object>();
  const encoder = new TextEncoder();
  let totalBytes = 0;
  let nodes = 0;
  const reject = (): never => admissionError(
    `${options.label} exceeds the supported text or structure budget.`,
    400,
    options.code
  );

  const walk = (entry: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > options.maximumNodes || depth > maximumDepth) reject();
    if (typeof entry === "string") {
      const length = encoder.encode(entry).byteLength;
      if (length > options.maximumStringBytes || length > options.maximumTotalBytes - totalBytes) reject();
      totalBytes += length;
      return;
    }
    if (!entry || typeof entry !== "object") return;
    if (seen.has(entry)) reject();
    seen.add(entry);
    if (Array.isArray(entry)) {
      for (const child of entry) walk(child, depth + 1);
      return;
    }
    for (const child of Object.values(entry as Record<string, unknown>)) walk(child, depth + 1);
  };
  walk(value, 0);
}
