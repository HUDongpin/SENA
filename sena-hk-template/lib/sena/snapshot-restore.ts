import { createHash } from "node:crypto";
import { importSenaProjectSnapshotFromHandoff } from "./project-handoff";
import { importSenaReviewPacket } from "./review-packet";
import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import type { SenaProjectSnapshot } from "./types";

export const SENA_SNAPSHOT_RESTORE_DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
export const SENA_SNAPSHOT_RESTORE_MAX_CHUNKS = 4096;

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

export function assertSenaSnapshotRestoreSameOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if ((origin && origin !== requestOrigin) || fetchSite === "cross-site") {
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
  const maxBytes = configuredMaxBytes(env);
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
      await reader.cancel();
      throw requestTooLarge(maxBytes);
    }
    if (chunkCount > SENA_SNAPSHOT_RESTORE_MAX_CHUNKS) {
      await reader.cancel();
      throw new SenaSnapshotRestoreRequestError(
        "Snapshot restore request uses too many streamed chunks.",
        413,
        "snapshot_restore_request_too_fragmented"
      );
    }
    chunks.push(value);
  }

  const raw = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
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
    sourcePayloadSha256: sha256(jsonText(root.source))
  };
}

export function buildSenaSnapshotRestoreResult(
  source: unknown,
  sourcePayloadSha256 = sha256(jsonText(source))
): SenaSnapshotRestoreResult {
  const root = record(source);
  let sourceKind: SenaSnapshotRestoreResult["sourceKind"];
  let snapshot: SenaProjectSnapshot;
  let reviewPacket: SenaSnapshotRestoreResult["reviewPacket"] = null;

  try {
    if (root?.schemaVersion === SENA_SCHEMA_VERSIONS.reviewPacket) {
      const packet = importSenaReviewPacket(source);
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
      snapshot = importSenaProjectSnapshotFromHandoff(source);
    }
  } catch {
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
      sourcePayloadSha256,
      normalizedSnapshotSha256: sha256(jsonText(snapshot))
    },
    processing: {
      persisted: false,
      audited: false,
      mode: "stateless-canonical-read-projection"
    }
  };
}
