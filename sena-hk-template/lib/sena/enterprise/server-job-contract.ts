import type {
  SenaEnterpriseServerJob,
  SenaEnterpriseServerJobQueueDelivery
} from "./server-job-queue";
import {
  SENA_ANALYSIS_QUEUE_COMMAND_CUSTODY,
  SENA_ANALYSIS_QUEUE_LEGACY_COMMAND_CUSTODY,
  SENA_ANALYSIS_QUEUE_SYNTHETIC_HEARTBEAT_CUSTODY
} from "../analysis-queue-command";
import { SENA_SERVER_JOB_COMMAND_CUSTODY } from "../server-job-command-envelope";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ownDataValue(record: Record<string, unknown>, key: string) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function isNonemptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveSafeInteger(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isExactUploadPointerArray(value: unknown) {
  if (!Array.isArray(value)) return false;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, "value") ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 1 || lengthDescriptor.value > 100) {
    return false;
  }
  const length = lengthDescriptor.value as number;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key === "symbol") || keys.length !== length + 1) return false;
  const seen = new Set<string>();
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value") ||
      !isNonemptyString(descriptor.value)) {
      return false;
    }
    const normalized = (descriptor.value as string).trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
  }
  return true;
}

function projectDeliverySourceReady(deliveryValue: unknown) {
  if (!isRecord(deliveryValue)) return false;
  if (Object.hasOwn(deliveryValue, "sourceReady")) {
    return ownDataValue(deliveryValue, "sourceReady") === true;
  }
  const webhookStatus = ownDataValue(deliveryValue, "webhookStatus");
  if (webhookStatus === "delivered" || webhookStatus === "local-sink") return true;
  return webhookStatus === "failed" &&
    ownDataValue(deliveryValue, "failureStage") === "queue-dispatch";
}

export function enterpriseServerJobIsSyntheticWorkerHeartbeat(
  job: SenaEnterpriseServerJob
) {
  const summary = isRecord(job.payloadSummary) ? job.payloadSummary : undefined;
  const worker = isRecord(job.worker) ? job.worker : undefined;
  if (!summary || !worker) return false;
  return job.kind === "analysis" &&
    /^server_job_worker_heartbeat_[a-f0-9]{24}$/.test(job.id) &&
    job.teamId === "ops-heartbeat" &&
    job.projectId === "worker-heartbeat" &&
    job.actorUserId === "ops-heartbeat" &&
    /^[a-f0-9]{64}$/.test(job.payloadSha256) &&
    ownDataValue(summary, "commandCustody") === SENA_ANALYSIS_QUEUE_SYNTHETIC_HEARTBEAT_CUSTODY &&
    ownDataValue(summary, "commandEnvelopeUploadId") === undefined &&
    ownDataValue(summary, "commandEnvelopeSha256") === undefined &&
    ownDataValue(summary, "source") === "project" &&
    ownDataValue(summary, "projectVersion") === 1 &&
    ownDataValue(summary, "hasInlineSnapshot") === false &&
    ownDataValue(summary, "hasInlineDataset") === false &&
    ownDataValue(summary, "payloadValuesExcluded") === true &&
    ownDataValue(worker, "expectedAction") === "run-analysis" &&
    ownDataValue(worker, "payloadDelivery") === "project-pointer" &&
    ownDataValue(worker, "execution") === "external-worker-required" &&
    ownDataValue(worker, "statusCallback") === "/api/sena/ops/jobs";
}

export function enterpriseServerJobHasValidAnalysisCommandCustodyProfile(
  job: SenaEnterpriseServerJob
) {
  if (job.kind !== "analysis") return false;
  const summary = isRecord(job.payloadSummary) ? job.payloadSummary : undefined;
  if (!summary) return false;
  const commandCustody = ownDataValue(summary, "commandCustody");
  const uploadId = ownDataValue(summary, "commandEnvelopeUploadId");
  const envelopeSha256 = ownDataValue(summary, "commandEnvelopeSha256");
  if (commandCustody === SENA_ANALYSIS_QUEUE_COMMAND_CUSTODY) {
    return typeof uploadId === "string" && /^upload_[a-f0-9]{24}$/.test(uploadId) &&
      typeof envelopeSha256 === "string" && /^[a-f0-9]{64}$/.test(envelopeSha256);
  }
  if (commandCustody === SENA_ANALYSIS_QUEUE_LEGACY_COMMAND_CUSTODY) {
    return uploadId === undefined && envelopeSha256 === undefined;
  }
  return enterpriseServerJobIsSyntheticWorkerHeartbeat(job);
}

export function enterpriseServerJobHasValidWorkerCommandCustodyProfile(
  job: SenaEnterpriseServerJob
) {
  if (job.kind !== "validation" && job.kind !== "publication-export") return false;
  const summary = isRecord(job.payloadSummary) ? job.payloadSummary : undefined;
  if (!summary || ownDataValue(summary, "commandCustody") !== SENA_SERVER_JOB_COMMAND_CUSTODY) return false;
  const uploadId = ownDataValue(summary, "commandEnvelopeUploadId");
  const envelopeSha256 = ownDataValue(summary, "commandEnvelopeSha256");
  return typeof uploadId === "string" && /^upload_[a-f0-9]{24}$/.test(uploadId) &&
    typeof envelopeSha256 === "string" && /^[a-f0-9]{64}$/.test(envelopeSha256);
}

export function enterpriseServerJobRequiresAnalysisCustodyQuarantine(
  job: SenaEnterpriseServerJob
) {
  return job.kind === "analysis" &&
    job.status === "queued" &&
    projectDeliverySourceReady(job.delivery) &&
    !enterpriseServerJobHasValidAnalysisCommandCustodyProfile(job);
}

/**
 * Current source-custody invariant for every stored job, including legacy rows.
 * A persisted true bit is only delivery evidence; it cannot override missing
 * pointers, inline summary flags, or the retired inline worker mode.
 */
export function enterpriseServerJobHasDurableSourcePointer(
  job: SenaEnterpriseServerJob
) {
  const summary = isRecord(job.payloadSummary) ? job.payloadSummary : undefined;
  const worker = isRecord(job.worker) ? job.worker : undefined;
  if (!summary || !worker ||
    ownDataValue(summary, "hasInlineSnapshot") !== false ||
    ownDataValue(summary, "hasInlineDataset") !== false ||
    ownDataValue(worker, "payloadDelivery") === "inline-payload-enabled") {
    return false;
  }

  if (job.kind === "analysis") {
    return enterpriseServerJobHasValidAnalysisCommandCustodyProfile(job) &&
      ownDataValue(summary, "source") === "project" &&
      ownDataValue(worker, "payloadDelivery") === "project-pointer" &&
      isNonemptyString(job.projectId) &&
      isPositiveSafeInteger(ownDataValue(summary, "projectVersion"));
  }

  if (job.kind === "validation") {
    return enterpriseServerJobHasValidWorkerCommandCustodyProfile(job) &&
      ownDataValue(summary, "source") === "project" &&
      ownDataValue(worker, "payloadDelivery") === "project-pointer" &&
      isNonemptyString(job.projectId) &&
      isPositiveSafeInteger(ownDataValue(summary, "projectVersion")) &&
      ownDataValue(summary, "projectTeamId") === job.teamId;
  }

  if (job.kind === "publication-export") {
    return enterpriseServerJobHasValidWorkerCommandCustodyProfile(job) &&
      ownDataValue(summary, "source") === "project" &&
      ownDataValue(worker, "payloadDelivery") === "project-pointer" &&
      isNonemptyString(job.projectId) &&
      isPositiveSafeInteger(ownDataValue(summary, "projectVersion")) &&
      ownDataValue(summary, "projectTeamId") === job.teamId;
  }

  if (job.kind === "import" || job.kind === "reliability") {
    return ownDataValue(worker, "payloadDelivery") === "upload-pointer" &&
      isExactUploadPointerArray(ownDataValue(summary, "uploadIds"));
  }

  return false;
}

/**
 * Read-only compatibility projection for jobs persisted before sourceReady was
 * introduced. Only delivery outcomes that prove source custody are promoted;
 * ambiguous, source-persistence, and malformed carriers remain non-claimable.
 */
export function projectEnterpriseServerJobSourceReady(job: SenaEnterpriseServerJob) {
  return projectDeliverySourceReady(job.delivery) &&
    enterpriseServerJobHasDurableSourcePointer(job);
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
      sourceReady: projectEnterpriseServerJobSourceReady(job)
    } as SenaEnterpriseServerJobQueueDelivery
  };
}
