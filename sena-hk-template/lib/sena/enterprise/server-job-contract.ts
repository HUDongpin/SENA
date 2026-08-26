import type {
  SenaEnterpriseServerJob,
  SenaEnterpriseServerJobQueueDelivery
} from "./server-job-queue";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Read-only compatibility projection for jobs persisted before sourceReady was
 * introduced. Only delivery outcomes that prove source custody are promoted;
 * ambiguous, source-persistence, and malformed carriers remain non-claimable.
 */
export function projectEnterpriseServerJobSourceReady(deliveryValue: unknown) {
  if (!isRecord(deliveryValue)) return false;
  if (Object.hasOwn(deliveryValue, "sourceReady")) {
    return typeof deliveryValue.sourceReady === "boolean"
      ? deliveryValue.sourceReady
      : false;
  }
  if (deliveryValue.webhookStatus === "delivered" || deliveryValue.webhookStatus === "local-sink") {
    return true;
  }
  return deliveryValue.webhookStatus === "failed" && deliveryValue.failureStage === "queue-dispatch";
}

/**
 * Produces an API/worker read model without mutating or persisting the stored
 * carrier. A later real lifecycle mutation may materialize the projected bit
 * as part of that independently authorized write.
 */
export function projectEnterpriseServerJobReadModel(
  job: SenaEnterpriseServerJob
): SenaEnterpriseServerJob {
  const rawDelivery = job.delivery as unknown;
  const delivery = isRecord(rawDelivery) ? rawDelivery : {};
  return {
    ...job,
    delivery: {
      ...delivery,
      sourceReady: projectEnterpriseServerJobSourceReady(rawDelivery)
    } as SenaEnterpriseServerJobQueueDelivery
  };
}
