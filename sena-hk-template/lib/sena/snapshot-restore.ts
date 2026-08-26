import { createHash } from "node:crypto";
import { importSenaProjectSnapshotFromHandoff } from "./project-handoff";
import { importSenaReviewPacket } from "./review-packet";
import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import {
  assertSenaProjectSnapshotAdmission,
  SenaProjectSnapshotResourceLimitError,
  type SenaProjectSnapshotAdmissionLimits
} from "./snapshot";
import { SenaReliabilityUniverseLimitError } from "./reliability";
import type { SenaProjectSnapshot } from "./types";

export const SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
export const SENA_SNAPSHOT_RESTORE_MAX_CHUNKS = 4096;
// Structural work is bounded independently from bytes inside JSON strings, so
// ignored padding cannot purchase parser fan-out. The byte ceiling still
// supplies the absolute token maximum (4,194,304 at the 16 MiB default).
export const SENA_SNAPSHOT_RESTORE_MIN_JSON_STRUCTURAL_TOKENS = 250_000;
export const SENA_SNAPSHOT_RESTORE_JSON_BYTES_PER_STRUCTURAL_TOKEN = 4;
export const SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_JSON_STRUCTURAL_TOKENS =
  SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_BYTES / SENA_SNAPSHOT_RESTORE_JSON_BYTES_PER_STRUCTURAL_TOKEN;
export const SENA_SNAPSHOT_RESTORE_JSON_STRUCTURAL_DENSITY_NUMERATOR = 3;
export const SENA_SNAPSHOT_RESTORE_JSON_STRUCTURAL_DENSITY_DENOMINATOR = 4;
export const SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_JSON_CONTAINERS = 262_144;
export const SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_JSON_CONTAINER_MEMBERS = 65_536;
export const SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_JSON_TOTAL_MEMBERS = 2_097_152;
export const SENA_SNAPSHOT_RESTORE_MAX_JSON_DEPTH = 64;

export type SenaSnapshotRestoreResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.snapshotRestoreResult;
  sourceKind: "project-snapshot" | "project-handoff" | "review-packet";
  snapshot: SenaProjectSnapshot;
  reviewPacket: {
    auditStatus: string;
    pilotReadinessStatus: string;
  } | null;
  integrity: {
    hashAlgorithm: "sha256";
    sourcePayloadSha256: string;
    normalizedSnapshotSha256: string;
  };
  processing: {
    persisted: false;
    audited: false;
    mode: "stateless-canonical-read-projection";
  };
};

export class SenaSnapshotRestoreRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 413,
    readonly code: string
  ) {
    super(message);
    this.name = "SenaSnapshotRestoreRequestError";
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function jsonText(value: unknown) {
  return JSON.stringify(value) ?? "undefined";
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function configuredMaxBytes(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  const parsed = Number(env.SENA_SNAPSHOT_RESTORE_MAX_BYTES);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_BYTES;
  return Math.min(parsed, 32 * 1024 * 1024);
}

function requestTooLarge(maxBytes: number) {
  return new SenaSnapshotRestoreRequestError(
    `Snapshot restore request exceeds the ${maxBytes}-byte limit.`,
    413,
    "snapshot_restore_request_too_large"
  );
}

function requestTooComplex() {
  return new SenaSnapshotRestoreRequestError(
    "Snapshot restore request exceeds the supported JSON complexity limit.",
    413,
    "snapshot_restore_request_too_complex"
  );
}

function snapshotRestoreStructuralTokenBudget(carrierUnits: number, maxBytes: number) {
  const paddingInvariantBudget = Math.max(
    SENA_SNAPSHOT_RESTORE_MIN_JSON_STRUCTURAL_TOKENS,
    Math.floor(
      carrierUnits * SENA_SNAPSHOT_RESTORE_JSON_STRUCTURAL_DENSITY_NUMERATOR
      / SENA_SNAPSHOT_RESTORE_JSON_STRUCTURAL_DENSITY_DENOMINATOR
    )
  );
  const byteCeilingBudget = Math.max(
    SENA_SNAPSHOT_RESTORE_MIN_JSON_STRUCTURAL_TOKENS,
    Math.floor(maxBytes / SENA_SNAPSHOT_RESTORE_JSON_BYTES_PER_STRUCTURAL_TOKEN)
  );
  return Math.min(paddingInvariantBudget, byteCeilingBudget);
}

function scaledSnapshotRestoreLimit(defaultLimit: number, maxBytes: number) {
  return Math.max(
    1,
    Math.floor(defaultLimit * maxBytes / SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_BYTES)
  );
}

function snapshotRestoreAdmissionLimits(maxBytes: number): SenaProjectSnapshotAdmissionLimits {
  return Object.freeze({
    maxJsonBytes: maxBytes,
    maxJsonDepth: SENA_SNAPSHOT_RESTORE_MAX_JSON_DEPTH,
    maxJsonTokens: Math.max(
      SENA_SNAPSHOT_RESTORE_MIN_JSON_STRUCTURAL_TOKENS,
      Math.floor(maxBytes / SENA_SNAPSHOT_RESTORE_JSON_BYTES_PER_STRUCTURAL_TOKEN)
    ),
    maxJsonContainers: scaledSnapshotRestoreLimit(
      SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_JSON_CONTAINERS,
      maxBytes
    ),
    maxJsonContainerMembers: scaledSnapshotRestoreLimit(
      SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_JSON_CONTAINER_MEMBERS,
      maxBytes
    ),
    maxJsonTotalMembers: scaledSnapshotRestoreLimit(
      SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_JSON_TOTAL_MEMBERS,
      maxBytes
    )
  });
}

function assertSenaSnapshotRestoreJsonComplexity(
  raw: string,
  limits: SenaProjectSnapshotAdmissionLimits
) {
  type ContainerFrame = { hasContent: boolean; members: number };
  const frames: ContainerFrame[] = [];
  const maxBytes = limits.maxJsonBytes;
  let structuralTokens = 0;
  let carrierUnits = 0;
  let containers = 0;
  let totalMembers = 0;
  let inString = false;
  let escaped = false;

  const assertMemberBounds = (frame: ContainerFrame) => {
    if (
      frame.members > limits.maxJsonContainerMembers ||
      totalMembers > limits.maxJsonTotalMembers
    ) {
      throw requestTooComplex();
    }
  };
  const markCurrentContainerContent = () => {
    const frame = frames.at(-1);
    if (!frame || frame.hasContent) return;
    frame.hasContent = true;
    frame.members = 1;
    totalMembers += 1;
    assertMemberBounds(frame);
  };
  const isJsonWhitespace = (character: string) => (
    character === " " || character === "\n" || character === "\r" || character === "\t"
  );

  for (const character of raw) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
        carrierUnits += 1;
      }
      continue;
    }
    if (character === "\"") {
      markCurrentContainerContent();
      inString = true;
      carrierUnits += 1;
      continue;
    }
    if (!isJsonWhitespace(character)) carrierUnits += 1;
    if (character === "{" || character === "[") {
      markCurrentContainerContent();
      structuralTokens += 1;
      containers += 1;
      if (containers > limits.maxJsonContainers) throw requestTooComplex();
      frames.push({ hasContent: false, members: 0 });
      if (frames.length > limits.maxJsonDepth) throw requestTooComplex();
    } else if (character === "}" || character === "]") {
      structuralTokens += 1;
      frames.pop();
    } else if (character === ",") {
      const frame = frames.at(-1);
      if (frame) {
        markCurrentContainerContent();
        frame.members += 1;
        totalMembers += 1;
        assertMemberBounds(frame);
      }
      structuralTokens += 1;
    } else if (character === ":") {
      structuralTokens += 1;
    } else if (!isJsonWhitespace(character)) {
      markCurrentContainerContent();
    }
    if (structuralTokens > limits.maxJsonTokens) throw requestTooComplex();
  }

  if (structuralTokens > snapshotRestoreStructuralTokenBudget(carrierUnits, maxBytes)) {
    throw requestTooComplex();
  }
}

async function cancelSnapshotRestoreReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    await reader.cancel();
  } catch {
    // Preserve the deterministic admission error even if transport cleanup fails.
  }
}

export function assertSenaSnapshotRestoreSameOrigin(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite === "cross-site" || fetchSite === "same-site") {
    throw new SenaSnapshotRestoreRequestError(
      "Snapshot restore validation accepts only same-origin browser requests.",
      403,
      "snapshot_restore_cross_origin_blocked"
    );
  }

  const origin = request.headers.get("origin");
  if (!origin) return;

  const firstHeaderValue = (value: string | null) => value?.split(",", 1)[0]?.trim() || null;
  const requestUrl = new URL(request.url);
  const host = firstHeaderValue(request.headers.get("host"))
    ?? firstHeaderValue(request.headers.get("x-forwarded-host"))
    ?? requestUrl.host;
  const protocol = firstHeaderValue(request.headers.get("x-forwarded-proto"))
    ?? requestUrl.protocol.slice(0, -1);

  let originUrl: URL;
  let expectedOrigin: string;
  try {
    originUrl = new URL(origin);
    const expectedUrl = new URL(`${protocol}://${host}`);
    if (
      !["http:", "https:"].includes(originUrl.protocol) ||
      !["http:", "https:"].includes(expectedUrl.protocol) ||
      expectedUrl.host !== host
    ) {
      throw new Error("Unsupported snapshot restore origin.");
    }
    expectedOrigin = expectedUrl.origin;
  } catch {
    throw new SenaSnapshotRestoreRequestError(
      "Snapshot restore validation accepts only same-origin browser requests.",
      403,
      "snapshot_restore_cross_origin_blocked"
    );
  }

  if (originUrl.origin !== expectedOrigin) {
    throw new SenaSnapshotRestoreRequestError(
      "Snapshot restore validation accepts only same-origin browser requests.",
      403,
      "snapshot_restore_cross_origin_blocked"
    );
  }
}

export async function readSenaSnapshotRestoreRequest(
  request: Request,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
) {
  const snapshotAdmissionLimits = snapshotRestoreAdmissionLimits(configuredMaxBytes(env));
  const maxBytes = snapshotAdmissionLimits.maxJsonBytes;
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw requestTooLarge(maxBytes);
  if (!request.body) {
    throw new SenaSnapshotRestoreRequestError(
      "Snapshot restore request body is required.",
      400,
      "snapshot_restore_body_required"
    );
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let chunkCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunkCount += 1;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await cancelSnapshotRestoreReader(reader);
      throw requestTooLarge(maxBytes);
    }
    if (chunkCount > SENA_SNAPSHOT_RESTORE_MAX_CHUNKS) {
      await cancelSnapshotRestoreReader(reader);
      throw new SenaSnapshotRestoreRequestError(
        "Snapshot restore request uses too many streamed chunks.",
        413,
        "snapshot_restore_request_too_fragmented"
      );
    }
    chunks.push(value);
  }

  const raw = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
  assertSenaSnapshotRestoreJsonComplexity(raw, snapshotAdmissionLimits);
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    throw new SenaSnapshotRestoreRequestError(
      "Snapshot restore request must be valid JSON.",
      400,
      "snapshot_restore_invalid_json"
    );
  }
  const root = record(body);
  if (
    !root ||
    root.schemaVersion !== SENA_SCHEMA_VERSIONS.snapshotRestoreRequest ||
    !("source" in root) ||
    root.source === undefined
  ) {
    throw new SenaSnapshotRestoreRequestError(
      `Snapshot restore request must use ${SENA_SCHEMA_VERSIONS.snapshotRestoreRequest}.`,
      400,
      "snapshot_restore_request_invalid"
    );
  }
  return {
    source: root.source,
    sourcePayloadSha256: sha256(jsonText(root.source)),
    snapshotAdmissionLimits
  };
}

export function buildSenaSnapshotRestoreResult(
  source: unknown,
  sourcePayloadSha256?: string,
  snapshotAdmissionLimits?: SenaProjectSnapshotAdmissionLimits
): SenaSnapshotRestoreResult {
  let sourceKind: SenaSnapshotRestoreResult["sourceKind"];
  let snapshot: SenaProjectSnapshot;
  let reviewPacket: SenaSnapshotRestoreResult["reviewPacket"] = null;
  let resolvedSourcePayloadSha256: string;

  try {
    // The direct helper is a public library boundary too. Admit the complete
    // carrier before shallow property reads or the optional default hash,
    // because JSON.stringify can invoke getters and expand shared alias DAGs.
    assertSenaProjectSnapshotAdmission(source, {
      admissionLimits: snapshotAdmissionLimits
    });
    const root = record(source);
    if (root?.schemaVersion === SENA_SCHEMA_VERSIONS.reviewPacket) {
      const packet = importSenaReviewPacket(source, {
        snapshotAdmissionLimits
      });
      sourceKind = "review-packet";
      snapshot = packet.contents.projectSnapshot;
      reviewPacket = {
        auditStatus: packet.reviewPacketAudit.status,
        pilotReadinessStatus: packet.summary.pilotReadinessStatus
      };
    } else {
      sourceKind = root?.schemaVersion === SENA_SCHEMA_VERSIONS.projectSnapshot
        ? "project-snapshot"
        : "project-handoff";
      snapshot = importSenaProjectSnapshotFromHandoff(source, {
        admissionLimits: snapshotAdmissionLimits
      });
    }
    resolvedSourcePayloadSha256 = sourcePayloadSha256 ?? sha256(jsonText(source));
  } catch (error) {
    if (error instanceof SenaProjectSnapshotResourceLimitError ||
      error instanceof SenaReliabilityUniverseLimitError) {
      throw new SenaSnapshotRestoreRequestError(
        "Snapshot restore source exceeds the supported canonical complexity limit.",
        413,
        "snapshot_restore_source_too_complex"
      );
    }
    throw new SenaSnapshotRestoreRequestError(
      "Snapshot restore source did not pass canonical SENA validation.",
      400,
      "snapshot_restore_source_invalid"
    );
  }

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.snapshotRestoreResult,
    sourceKind,
    snapshot,
    reviewPacket,
    integrity: {
      hashAlgorithm: "sha256",
      sourcePayloadSha256: resolvedSourcePayloadSha256,
      normalizedSnapshotSha256: sha256(jsonText(snapshot))
    },
    processing: {
      persisted: false,
      audited: false,
      mode: "stateless-canonical-read-projection"
    }
  };
}
