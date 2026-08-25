import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
import { importSenaReviewPacket } from "./review-packet";
import {
  assertSenaProjectSnapshotAdmission,
  importSenaProjectSnapshot,
  type SenaProjectSnapshotImportOptions
} from "./snapshot";
import type { SenaProjectSnapshot } from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function importSenaProjectSnapshotFromHandoff(
  source: string | unknown,
  options: SenaProjectSnapshotImportOptions = {}
): SenaProjectSnapshot {
  assertSenaProjectSnapshotAdmission(source, options);
  const value = typeof source === "string" ? JSON.parse(source) : source;
  if (typeof source === "string") assertSenaProjectSnapshotAdmission(value, options);
  const root = asRecord(value);
  if (!root) return importSenaProjectSnapshot(value, options);

  if (root.schemaVersion === SENA_SCHEMA_VERSIONS.projectSnapshot) {
    return importSenaProjectSnapshot(root, options);
  }
  if (root.schemaVersion === SENA_SCHEMA_VERSIONS.reviewPacket) {
    return importSenaReviewPacket(root, {
      snapshotAdmissionLimits: options.admissionLimits
    }).contents.projectSnapshot;
  }
  if (root.snapshot !== undefined) {
    return importSenaProjectSnapshot(root.snapshot, options);
  }
  if (root.reviewPacket !== undefined) {
    return importSenaReviewPacket(root.reviewPacket, {
      snapshotAdmissionLimits: options.admissionLimits
    }).contents.projectSnapshot;
  }
  if (root.packet !== undefined) {
    return importSenaReviewPacket(root.packet, {
      snapshotAdmissionLimits: options.admissionLimits
    }).contents.projectSnapshot;
  }

  return importSenaProjectSnapshot(root, options);
}
