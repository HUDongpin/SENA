import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  getEnterpriseCapabilityAudit,
  getEnterpriseDeploymentReadiness,
  getEnterpriseGoLiveRehearsal
} from "../lib/sena/enterprise";

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2];
  }
}

function ids(values: string[]) {
  return values.length > 0 ? values : ["none"];
}

loadLocalEnv();

const readiness = getEnterpriseDeploymentReadiness();
const goLive = getEnterpriseGoLiveRehearsal();
const capabilityAudit = getEnterpriseCapabilityAudit();
const goLiveCapability = capabilityAudit.capabilities.find((capability) => capability.id === "go-live-operations");

const checks = [
  {
    id: "deployment-readiness",
    status: readiness.status,
    pass: readiness.status === "ready",
    blockers: readiness.summary.blockers
  },
  {
    id: "go-live-rehearsal",
    status: goLive.status,
    pass: goLive.status === "ready",
    blockers: goLive.summary.blockers
  },
  {
    id: "rollback-drill",
    status: goLive.rollbackDrill.status,
    pass: goLive.rollbackDrill.status === "ready",
    blockers: goLive.rollbackDrill.summary.blockers
  },
  {
    id: "post-cutover-monitor",
    status: goLive.postCutoverMonitor.status,
    pass: goLive.postCutoverMonitor.status === "ready",
    blockers: goLive.postCutoverMonitor.summary.blockers
  },
  {
    id: "capability-audit",
    status: capabilityAudit.status,
    pass: capabilityAudit.status === "ready",
    blockers: capabilityAudit.capabilities.filter((capability) => capability.status !== "ready").map((capability) => capability.id)
  }
];

const output = {
  schemaVersion: "sena-go-live-closeout-check/v1",
  redaction: {
    secretValuesExcluded: true,
    envValuesExcluded: true
  },
  generatedAt: new Date().toISOString(),
  status: checks.every((check) => check.pass) ? "ready" : "blocked",
  environment: {
    nodeEnv: process.env.NODE_ENV || "development",
    storageEngine: readiness.environment.storageEngine,
    configuredDirectory: readiness.environment.configuredDirectory,
    opsTokenConfigured: readiness.environment.opsTokenConfigured,
    webhookBridgeCounts: {
      notification: readiness.environment.notificationWebhookConfigured,
      email: readiness.environment.emailWebhookConfigured,
      collaborationPubSub: readiness.environment.collaborationPubSubWebhookConfigured,
      databaseSync: readiness.environment.databaseSyncWebhookConfigured,
      objectStorage: readiness.environment.objectStorageWebhookConfigured,
      backup: readiness.environment.backupWebhookConfigured,
      alert: readiness.environment.alertWebhookConfigured,
      audit: readiness.environment.auditWebhookConfigured
    }
  },
  checks: checks.map((check) => ({
    id: check.id,
    status: check.status,
    pass: check.pass,
    blockers: ids(check.blockers)
  })),
  observation: {
    latestStatus: goLive.postCutoverMonitor.latestObservation.summary.latestStatus,
    latestObservationId: goLive.postCutoverMonitor.latestObservation.summary.latestObservationId ?? "none",
    ready: goLive.postCutoverMonitor.latestObservation.summary.ready,
    active: goLive.postCutoverMonitor.latestObservation.summary.active,
    blocked: goLive.postCutoverMonitor.latestObservation.summary.blocked
  },
  capability: {
    goLiveStatus: goLiveCapability?.status ?? "missing",
    remainingPlatformDecisions: ids(goLiveCapability?.remainingPlatformDecisions ?? [])
  }
};

console.log(JSON.stringify(output, null, 2));

if (output.status !== "ready") {
  process.exit(1);
}
