import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import {
  getEnterpriseCapabilityAuditWithPostgresEvidence
} from "./ops-capability-audit";
import {
  getEnterpriseDeploymentReadinessWithPostgresEvidence
} from "./ops-deployment-readiness";
import {
  getEnterpriseOrganizationDeploymentPackageWithPostgresEvidence
} from "./ops-deployment";
import {
  getEnterpriseGoLiveRehearsalWithPostgresEvidence
} from "./ops-go-live";
import {
  getEnterpriseOpsStatusWithPostgresEvidence
} from "./ops-status";

type GoLiveCloseoutCheckStatus = "ready" | "blocked";

type GoLiveCloseoutSubcheck = {
  id: "deployment-readiness" | "go-live-rehearsal" | "rollback-drill" | "post-cutover-monitor" | "capability-audit";
  status: string;
  pass: boolean;
  blockers: string[];
};

export type SenaGoLiveCloseoutCheck = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseGoLiveCloseoutCheck;
  redaction: {
    secretValuesExcluded: true;
    envValuesExcluded: true;
  };
  generatedAt: string;
  status: GoLiveCloseoutCheckStatus;
  environment: {
    nodeEnv: string;
    storageEngine: string;
    configuredDirectory: string;
    opsTokenConfigured: boolean;
    webhookBridgeCounts: {
      notification: boolean;
      email: boolean;
      collaborationPubSub: boolean;
      databaseSync: boolean;
      objectStorage: boolean;
      backup: boolean;
      alert: boolean;
      audit: boolean;
    };
  };
  checks: GoLiveCloseoutSubcheck[];
  observation: {
    latestStatus: string;
    latestObservationId: string;
    ready: number;
    active: number;
    blocked: number;
  };
  capability: {
    goLiveStatus: string;
    remainingPlatformDecisions: string[];
  };
};

function ids(values: string[]) {
  return values.length > 0 ? values : ["none"];
}

export function loadSenaLocalEnv(cwd = process.cwd()) {
  const envPath = path.join(cwd, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2];
  }
}

export async function buildSenaGoLiveCloseoutCheck(): Promise<SenaGoLiveCloseoutCheck> {
  const opsStatus = await getEnterpriseOpsStatusWithPostgresEvidence();
  const readiness = await getEnterpriseDeploymentReadinessWithPostgresEvidence({ opsStatus });
  const deployment = await getEnterpriseOrganizationDeploymentPackageWithPostgresEvidence({
    readiness,
    opsStatus
  });
  const goLive = await getEnterpriseGoLiveRehearsalWithPostgresEvidence({
    deployment,
    readiness,
    opsStatus
  });
  const capabilityAudit = await getEnterpriseCapabilityAuditWithPostgresEvidence({
    deployment,
    readiness,
    goLiveRehearsal: goLive,
    opsStatus
  });
  const goLiveCapability = capabilityAudit.capabilities.find((capability) => capability.id === "go-live-operations");

  const checks: GoLiveCloseoutSubcheck[] = [
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
      blockers: capabilityAudit.capabilities
        .filter((capability) => capability.status !== "ready")
        .map((capability) => capability.id)
    }
  ];

  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseGoLiveCloseoutCheck,
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
}
