import {
  recoverExpiredEnterpriseServerJobs,
  senaEnterpriseServerJobKinds,
  type SenaEnterpriseServerJobKind
} from "../enterprise/server-job-queue";

type Recovery = (input: {
  kinds: readonly SenaEnterpriseServerJobKind[];
  observedAt?: string;
  limit?: number;
}) => Promise<{
  inspected: number;
  requeued: number;
  deadLettered: number;
}>;

/**
 * Bounded independent sweep used by the long-running EvidenceFlow worker.
 * It covers pull, managed, webhook, and QStash receipts because recovery is
 * performed against the authoritative job store, not against one transport.
 */
export async function sweepSenaWorkflowServerJobLeases(input: {
  observedAt?: string;
  limit?: number;
  recover?: Recovery;
} = {}) {
  return (input.recover ?? recoverExpiredEnterpriseServerJobs)({
    kinds: senaEnterpriseServerJobKinds,
    ...(input.observedAt ? { observedAt: input.observedAt } : {}),
    limit: Math.max(1, Math.min(input.limit ?? 100, 500))
  });
}
