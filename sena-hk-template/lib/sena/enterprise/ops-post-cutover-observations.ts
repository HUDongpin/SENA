import { randomBytes } from "node:crypto";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { requireEnterprisePermission } from "./access-control";
import type { SenaEnterpriseSessionContext } from "./auth-session";
import { SenaEnterpriseError } from "./errors";
import {
  getEnterpriseOpsAlerts,
  type SenaEnterpriseOpsAlerts
} from "./ops-alerts";
import { appendAudit } from "./ops-audit";
import { getEnterpriseDeploymentReadiness } from "./ops-deployment-readiness";
import { getEnterpriseGoLiveRehearsal } from "./ops-go-live";
import { manageableTeamIds } from "./ops-governance";
import { now } from "./ops-runtime";
import {
  getEnterpriseOpsStatus,
  type SenaEnterpriseOpsStatus
} from "./ops-status";
import {
  readEnterpriseDb,
  saveDb
} from "./state";

const postCutoverObservationMinutes = 60;
const postCutoverObservationCadenceMinutes = 7;

function id(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function requiredPostCutoverText(value: string | undefined, field: string) {
  const text = value?.trim();
  if (!text) {
    throw new SenaEnterpriseError(`${field} is required for post-cutover observation.`, 400, "post_cutover_observation_required");
  }
  return text;
}

export type SenaEnterprisePostCutoverObservationSample = {
  recordedAt: string;
  opsStatus: SenaEnterpriseOpsStatus["status"];
  alertsStatus: SenaEnterpriseOpsAlerts["status"];
  criticalAlerts: number;
  warningAlerts: number;
  warningAlertIds: string[];
  releaseGateReady: boolean;
  rollbackReady: boolean;
  evidence: string[];
};

export type SenaEnterprisePostCutoverObservation = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePostCutoverObservation;
  id: string;
  teamId: string;
  environment: string;
  releaseVersion: string;
  status: "active" | "ready" | "blocked";
  startedAt: string;
  requiredUntil: string;
  completedAt?: string;
  startedByUserId: string;
  completedByUserId?: string;
  samples: SenaEnterprisePostCutoverObservationSample[];
  acknowledgedWarningAlertIds: string[];
  evidence: string[];
};

export type SenaEnterprisePostCutoverObservationList = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterprisePostCutoverObservations;
  generatedAt: string;
  scope: {
    mode: "selected-team" | "managed-teams";
    teamId?: string;
  };
  summary: {
    total: number;
    active: number;
    ready: number;
    blocked: number;
    latestStatus: SenaEnterprisePostCutoverObservation["status"] | "missing";
    latestObservationId?: string;
  };
  observations: SenaEnterprisePostCutoverObservation[];
};

export type SenaEnterprisePostCutoverObservationInput = {
  teamId: string;
  environment: string;
  releaseVersion: string;
};

export type SenaEnterprisePostCutoverObservationSampleInput = {
  teamId: string;
  observationId: string;
};

export type SenaEnterprisePostCutoverObservationCompletionInput = {
  teamId: string;
  observationId: string;
  acknowledgedWarningAlertIds?: string[];
};

function summarizePostCutoverObservations(
  observations: SenaEnterprisePostCutoverObservation[]
): SenaEnterprisePostCutoverObservationList["summary"] {
  const latest = observations[0];
  return {
    total: observations.length,
    active: observations.filter((observation) => observation.status === "active").length,
    ready: observations.filter((observation) => observation.status === "ready").length,
    blocked: observations.filter((observation) => observation.status === "blocked").length,
    latestStatus: latest?.status ?? "missing",
    ...(latest ? { latestObservationId: latest.id } : {})
  };
}

export function postCutoverObservationList(
  observations: SenaEnterprisePostCutoverObservation[],
  input: { teamId?: string } = {}
): SenaEnterprisePostCutoverObservationList {
  const sorted = [...observations].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePostCutoverObservations,
    generatedAt: now(),
    scope: {
      mode: input.teamId ? "selected-team" : "managed-teams",
      teamId: input.teamId
    },
    summary: summarizePostCutoverObservations(sorted),
    observations: sorted
  };
}

function postCutoverObservationSample(input: {
  opsStatus: SenaEnterpriseOpsStatus;
  opsAlerts: SenaEnterpriseOpsAlerts;
  releaseGateReady: boolean;
  rollbackReady: boolean;
}): SenaEnterprisePostCutoverObservationSample {
  return {
    recordedAt: now(),
    opsStatus: input.opsStatus.status,
    alertsStatus: input.opsAlerts.status,
    criticalAlerts: input.opsAlerts.summary.critical,
    warningAlerts: input.opsAlerts.summary.warning,
    warningAlertIds: input.opsAlerts.alerts
      .filter((alert) => alert.severity === "warning")
      .map((alert) => alert.id),
    releaseGateReady: input.releaseGateReady,
    rollbackReady: input.rollbackReady,
    evidence: [
      `opsStatus=${input.opsStatus.status}`,
      `alertsStatus=${input.opsAlerts.status}`,
      `criticalAlerts=${input.opsAlerts.summary.critical}`,
      `warningAlerts=${input.opsAlerts.summary.warning}`,
      `alertOwner=${input.opsAlerts.ownership.configured ? "configured" : "missing"}`,
      `alertRunbook=${input.opsAlerts.ownership.runbookUrl ? "configured" : "missing"}`,
      `releaseGateReady=${input.releaseGateReady}`,
      `rollbackReady=${input.rollbackReady}`
    ]
  };
}

function latestReleaseGateReadyEvidence(input: ReturnType<typeof getEnterpriseGoLiveRehearsal>) {
  return input.postCutoverMonitor.checks.find((check) => check.id === "release-verification")?.status === "pass";
}

function observationElapsed(observation: SenaEnterprisePostCutoverObservation) {
  return Date.now() >= Date.parse(observation.requiredUntil);
}

function observationCadenceGaps(observation: SenaEnterprisePostCutoverObservation) {
  const maxGapMs = postCutoverObservationCadenceMinutes * 60 * 1000;
  const samples = [...observation.samples].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const gaps: string[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const gapMs = Date.parse(samples[index].recordedAt) - Date.parse(samples[index - 1].recordedAt);
    if (gapMs > maxGapMs) {
      gaps.push(`${samples[index - 1].recordedAt}->${samples[index].recordedAt}`);
    }
  }
  return gaps;
}

function observationWarningsAcknowledged(
  observation: SenaEnterprisePostCutoverObservation,
  acknowledgedWarningAlertIds: string[]
) {
  const acknowledged = new Set(acknowledgedWarningAlertIds);
  const warningIds = Array.from(new Set(observation.samples.flatMap((sample) => sample.warningAlertIds)));
  if (warningIds.length === 0) return true;
  const acknowledgedAll = warningIds.every((warningId) => acknowledged.has(warningId));
  const ownerRunbookEvidence = observation.samples
    .filter((sample) => sample.warningAlertIds.length > 0)
    .every((sample) => sample.evidence.includes("alertOwner=configured") && sample.evidence.includes("alertRunbook=configured"));
  return acknowledgedAll && ownerRunbookEvidence;
}

function postCutoverObservationPreflight(input: { teamId: string }) {
  const rehearsal = getEnterpriseGoLiveRehearsal({ teamId: input.teamId });
  const opsStatus = getEnterpriseOpsStatus();
  const readiness = getEnterpriseDeploymentReadiness();
  const opsAlerts = getEnterpriseOpsAlerts(opsStatus, readiness);
  const releaseGateReady = latestReleaseGateReadyEvidence(rehearsal);
  const rollbackReady = rehearsal.rollbackDrill.status === "ready";
  return {
    rehearsal,
    opsStatus,
    opsAlerts,
    releaseGateReady,
    rollbackReady,
    blockers: [
      rehearsal.status === "ready" ? null : "go-live-rehearsal-not-ready",
      rollbackReady ? null : "rollback-drill-not-ready",
      releaseGateReady ? null : "release-gate-not-ready",
      opsStatus.status === "degraded" ? "ops-status-degraded" : null,
      opsAlerts.summary.critical === 0 ? null : "critical-alerts-firing"
    ].filter((blocker): blocker is string => Boolean(blocker))
  };
}

export function listEnterprisePostCutoverObservations(
  context: SenaEnterpriseSessionContext,
  input: { teamId?: string } = {}
): SenaEnterprisePostCutoverObservationList {
  const teamIds = input.teamId ? [input.teamId] : manageableTeamIds(context);
  if (input.teamId) {
    requireEnterprisePermission(context, input.teamId, "team:manage");
  } else if (teamIds.length === 0) {
    throw new SenaEnterpriseError("Team management permission is required for post-cutover observations.", 403, "post_cutover_observation_permission_denied");
  }
  const teamIdSet = new Set(teamIds);
  const observations = (readEnterpriseDb().postCutoverObservations ?? [])
    .filter((observation) => teamIdSet.has(observation.teamId));
  return postCutoverObservationList(observations, input);
}

export function startEnterprisePostCutoverObservation(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterprisePostCutoverObservationInput
): SenaEnterprisePostCutoverObservation {
  requireEnterprisePermission(context, input.teamId, "team:manage");
  const db = readEnterpriseDb();
  const preflight = postCutoverObservationPreflight({ teamId: input.teamId });
  if (preflight.blockers.length > 0) {
    throw new SenaEnterpriseError(
      `Post-cutover observation cannot start until release, rollback, ops, and alert checks are ready: ${preflight.blockers.join(", ")}.`,
      409,
      "post_cutover_observation_start_blocked"
    );
  }
  const startedAt = now();
  const requiredUntil = new Date(Date.parse(startedAt) + postCutoverObservationMinutes * 60 * 1000).toISOString();
  const observation: SenaEnterprisePostCutoverObservation = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterprisePostCutoverObservation,
    id: id("post-cutover"),
    teamId: input.teamId,
    environment: requiredPostCutoverText(input.environment, "environment"),
    releaseVersion: requiredPostCutoverText(input.releaseVersion, "releaseVersion"),
    status: "active",
    startedAt,
    requiredUntil,
    startedByUserId: context.user.id,
    samples: [
      postCutoverObservationSample({
        opsStatus: preflight.opsStatus,
        opsAlerts: preflight.opsAlerts,
        releaseGateReady: preflight.releaseGateReady,
        rollbackReady: preflight.rollbackReady
      })
    ],
    acknowledgedWarningAlertIds: [],
    evidence: [
      "schema=sena-enterprise-post-cutover-observation/v1",
      `requiredMinutes=${postCutoverObservationMinutes}`,
      `cadenceMinutes=${postCutoverObservationCadenceMinutes}`,
      "startPreflight=pass"
    ]
  };
  db.postCutoverObservations.unshift(observation);
  db.postCutoverObservations = db.postCutoverObservations.slice(0, 1000);
  appendAudit(db, {
    event: "ops.post_cutover_observation.start",
    userId: context.user.id,
    teamId: input.teamId,
    detail: {
      observationId: observation.id,
      environment: observation.environment,
      releaseVersion: observation.releaseVersion,
      requiredUntil: observation.requiredUntil,
      samples: observation.samples.length
    }
  });
  saveDb(db);
  return observation;
}

export function recordEnterprisePostCutoverObservationSample(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterprisePostCutoverObservationSampleInput
): SenaEnterprisePostCutoverObservation {
  requireEnterprisePermission(context, input.teamId, "team:manage");
  const db = readEnterpriseDb();
  const observation = (db.postCutoverObservations ?? [])
    .find((candidate) => candidate.id === input.observationId && candidate.teamId === input.teamId);
  if (!observation) {
    throw new SenaEnterpriseError("Post-cutover observation was not found.", 404, "post_cutover_observation_not_found");
  }
  if (observation.status !== "active") {
    throw new SenaEnterpriseError("Post-cutover observation sample can only be recorded while observation is active.", 409, "post_cutover_observation_not_active");
  }
  const preflight = postCutoverObservationPreflight({ teamId: input.teamId });
  observation.samples.push(postCutoverObservationSample({
    opsStatus: preflight.opsStatus,
    opsAlerts: preflight.opsAlerts,
    releaseGateReady: preflight.releaseGateReady,
    rollbackReady: preflight.rollbackReady
  }));
  const latestSample = observation.samples[observation.samples.length - 1];
  appendAudit(db, {
    event: "ops.post_cutover_observation.sample",
    userId: context.user.id,
    teamId: input.teamId,
    detail: {
      observationId: observation.id,
      samples: observation.samples.length,
      opsStatus: latestSample?.opsStatus ?? null,
      alertsStatus: latestSample?.alertsStatus ?? null,
      criticalAlerts: latestSample?.criticalAlerts ?? null,
      warningAlerts: latestSample?.warningAlerts ?? null
    }
  });
  saveDb(db);
  return observation;
}

export function completeEnterprisePostCutoverObservation(
  context: SenaEnterpriseSessionContext,
  input: SenaEnterprisePostCutoverObservationCompletionInput
): SenaEnterprisePostCutoverObservation {
  requireEnterprisePermission(context, input.teamId, "team:manage");
  const db = readEnterpriseDb();
  const observation = (db.postCutoverObservations ?? [])
    .find((candidate) => candidate.id === input.observationId && candidate.teamId === input.teamId);
  if (!observation) {
    throw new SenaEnterpriseError("Post-cutover observation was not found.", 404, "post_cutover_observation_not_found");
  }
  if (observation.status !== "active") {
    throw new SenaEnterpriseError("Post-cutover observation can only be completed once while active.", 409, "post_cutover_observation_not_active");
  }
  if (!observationElapsed(observation)) {
    throw new SenaEnterpriseError("Post-cutover observation requires a full 60-minute observation window before completion.", 409, "post_cutover_observation_window_incomplete");
  }
  const preflight = postCutoverObservationPreflight({ teamId: input.teamId });
  const latestSample = observation.samples.at(-1);
  if (!latestSample || Date.parse(latestSample.recordedAt) < Date.parse(observation.requiredUntil)) {
    observation.samples.push(postCutoverObservationSample({
      opsStatus: preflight.opsStatus,
      opsAlerts: preflight.opsAlerts,
      releaseGateReady: preflight.releaseGateReady,
      rollbackReady: preflight.rollbackReady
    }));
  }
  const gaps = observationCadenceGaps(observation);
  const degradedSamples = observation.samples.filter((sample) => sample.opsStatus === "degraded");
  const criticalSamples = observation.samples.filter((sample) => sample.criticalAlerts > 0);
  const releaseRollbackBlockedSamples = observation.samples.filter((sample) => !sample.releaseGateReady || !sample.rollbackReady);
  const acknowledgedWarningAlertIds = Array.from(new Set(input.acknowledgedWarningAlertIds ?? []));
  const completionBlockers = [
    ...preflight.blockers,
    gaps.length > 0 ? "post-cutover-observation-cadence-gap" : null,
    degradedSamples.length > 0 ? "post-cutover-observation-degraded-sample" : null,
    criticalSamples.length > 0 ? "post-cutover-observation-critical-alert-sample" : null,
    releaseRollbackBlockedSamples.length > 0 ? "post-cutover-observation-release-or-rollback-sample-blocked" : null,
    observationWarningsAcknowledged(observation, acknowledgedWarningAlertIds) ? null : "post-cutover-observation-warning-alerts-unacknowledged"
  ].filter((blocker): blocker is string => Boolean(blocker));
  if (completionBlockers.length > 0) {
    throw new SenaEnterpriseError(
      `Post-cutover observation cannot complete: ${completionBlockers.join(", ")}.`,
      409,
      "post_cutover_observation_completion_blocked"
    );
  }
  observation.status = "ready";
  observation.completedAt = now();
  observation.completedByUserId = context.user.id;
  observation.acknowledgedWarningAlertIds = acknowledgedWarningAlertIds;
  observation.evidence = Array.from(new Set([
    ...observation.evidence,
    "completionPreflight=pass",
    `samples=${observation.samples.length}`,
    `acknowledgedWarningAlertIds=${acknowledgedWarningAlertIds.length}`,
    "status=ready"
  ]));
  appendAudit(db, {
    event: "ops.post_cutover_observation.complete",
    userId: context.user.id,
    teamId: input.teamId,
    detail: {
      observationId: observation.id,
      samples: observation.samples.length,
      acknowledgedWarningAlertIds: acknowledgedWarningAlertIds.join("|") || "none",
      completedAt: observation.completedAt
    }
  });
  saveDb(db);
  return observation;
}
