import { NextResponse } from "next/server";
import {
  SenaSnapshotRestoreRequestError,
  assertSenaSnapshotRestoreSameOrigin,
  buildSenaSnapshotRestoreResult,
  readSenaSnapshotRestoreRequest
} from "@/lib/sena/snapshot-restore";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSenaSnapshotRestoreSameOrigin(request);
    const input = await readSenaSnapshotRestoreRequest(request);
    const result = buildSenaSnapshotRestoreResult(
      input.source,
      input.sourcePayloadSha256,
      input.snapshotAdmissionLimits
    );
    return NextResponse.json(result, {
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-sena-snapshot-restore-source": result.sourceKind,
        "x-sena-snapshot-restore-source-sha256": result.integrity.sourcePayloadSha256,
        "x-sena-snapshot-restore-normalized-sha256": result.integrity.normalizedSnapshotSha256,
        "x-sena-snapshot-restore-persisted": "false"
      }
    });
  } catch (error) {
    const failure = error instanceof SenaSnapshotRestoreRequestError
      ? error
      : new SenaSnapshotRestoreRequestError(
          "Snapshot restore validation failed.",
          400,
          "snapshot_restore_failed"
        );
    return NextResponse.json({ error: failure.message, code: failure.code }, {
      status: failure.status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    });
  }
}
