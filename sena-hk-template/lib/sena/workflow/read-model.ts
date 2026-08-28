import { senaWorkflowDigest } from "./canonical";
import type { SenaWorkflowCommand, SenaWorkflowRun } from "./types";

export function projectSenaWorkflowRunReadModel(run: SenaWorkflowRun) {
  const { startIdempotencyKey, createdByUserId, ...safe } = run;
  return {
    ...safe,
    startIdempotencyKeyHash: senaWorkflowDigest(startIdempotencyKey),
    createdByUserIdHash: senaWorkflowDigest(createdByUserId)
  };
}

export function projectSenaWorkflowCommandReadModel(command: SenaWorkflowCommand) {
  const { idempotencyKey, claimedBy, payload: _payload, ...safe } = command;
  return {
    ...safe,
    idempotencyKeyHash: senaWorkflowDigest(idempotencyKey),
    payloadExcluded: true as const,
    ...(claimedBy ? { workerIdHash: senaWorkflowDigest(claimedBy) } : {})
  };
}
