import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { importSenaReviewPacket } from "./review-packet";
import { importSenaProjectSnapshot } from "./snapshot";
import type { SenaProjectSnapshot } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function importSenaProjectSnapshotFromHandoff(source: string | unknown): SenaProjectSnapshot {
  const value = typeof source === "string" ? JSON.parse(source) : source;
  const root = asRecord(value);
  if (!root) return importSenaProjectSnapshot(value);

  if (root.schemaVersion === SENA_SCHEMA_VERSIONS.projectSnapshot) {
    return importSenaProjectSnapshot(root);
  }
  if (root.schemaVersion === SENA_SCHEMA_VERSIONS.reviewPacket) {
    return importSenaReviewPacket(root).contents.projectSnapshot;
  }
  if (root.snapshot !== undefined) {
    return importSenaProjectSnapshot(root.snapshot);
  }
  if (root.reviewPacket !== undefined) {
    return importSenaReviewPacket(root.reviewPacket).contents.projectSnapshot;
  }
  if (root.packet !== undefined) {
    return importSenaReviewPacket(root.packet).contents.projectSnapshot;
  }

  return importSenaProjectSnapshot(root);
}
