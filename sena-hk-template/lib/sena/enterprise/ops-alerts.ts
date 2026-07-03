import { createHmac } from "node:crypto";
import path from "node:path";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { SenaEnterpriseError } from "./errors";
import { appendAudit } from "./ops-audit";
import {
  getEnterpriseDeploymentReadiness,
  getEnterpriseDeploymentReadinessWithPostgresEvidence,
  type SenaEnterpriseDeploymentReadiness
} from "./ops-deployment-readiness";
import { isSelfManagedEnterpriseMode } from "./ops-platform-decision-policy";
import {
  getEnterpriseOpsStatus,
  getEnterpriseOpsStatusWithPostgresEvidence,
  type SenaEnterpriseOpsStatus
} from "./ops-status";
import {
  getEnterpriseObservabilitySnapshot,
  getEnterpriseObservabilitySnapshotWithPostgresEvidence,
  type SenaEnterpriseObservabilitySnapshot
} from "./ops-observability";
import {
  readEnterpriseDb,
  saveDb
} from "./state";
import {
  alertWebhookEndpointHash,
  alertWebhookProvider,
  alertWebhookSecret,
  alertWebhookTimeoutMs,
  alertWebhookUrl,
  localWebhookSinkAttempt,
  webhookErrorHash
} from "./webhook-delivery";

const enterpriseDbDir = process.env.SENA_ENTERPRISE_DB_DIR || ".sena-enterprise";
const enterpriseDbPath = path.join(enterpriseDbDir, "enterprise-db.json");

export type SenaEnterpriseOpsAlert = {
  id: string;
  label: string;
  severity: "critical" | "warning" | "info";
  status: "firing";
  source: "ops-status" | "deployment-readiness" | "alerting-ownership" | "observability";
  evidence: string[];
  nextAction: string;
  owner: string;
  runbookUrl?: string;
  createdAt: string;
};

export type SenaEnterpriseOpsAlerts = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseOpsAlerts;
  generatedAt: string;
  status: "clear" | "warning" | "critical";
  ownership: {
    configured: boolean;
    owner: string;
    runbookUrl?: string;
    channel: string;
  };
  summary: {
    critical: number;
    warning: number;
    info: number;
    firing: number;
  };
  alerts: SenaEnterpriseOpsAlert[];
};

export type SenaEnterpriseOpsAlertDeliveryResult = {
  schemaVersion: typeof SENA_SCHEMA_VERSIONS.enterpriseOpsAlertDelivery;
  status: "not-configured" | "delivered" | "failed";
  generatedAt: string;
  provider: {
    mode: "webhook" | "local-sink" | "postgres-native" | "not-configured";
    configured: boolean;
    endpointHash?: string;
    urlEnvName?: string;
    connectionHash?: string;
    adapter?: "postgres" | "neon";
    secretConfigured: boolean;
    timeoutMs: number;
  };
  alerts: {
    generatedAt: string;
    status: SenaEnterpriseOpsAlerts["status"];
    summary: SenaEnterpriseOpsAlerts["summary"];
    ownership: SenaEnterpriseOpsAlerts["ownership"];
  };
  delivery: {
    attempted: boolean;
    webhookStatus?: "delivered" | "failed";
    attemptedAt?: string;
    endpointHash?: string;
    httpStatus?: number;
    errorCode?: string;
    errorHash?: string;
  };
};

function now() {
  return new Date().toISOString();
}

function envValue(key: string) {
  const value = process.env[key]?.trim();
  return value || undefined;
}

function firstEnvValue(keys: string[]) {
  for (const key of keys) {
    const value = envValue(key);
    if (value) return value;
  }
  return undefined;
}

export function alertingOwner() {
  return firstEnvValue([
    "SENA_ALERTING_OWNER",
    "SENA_OBSERVABILITY_OWNER",
    "ALERTING_OWNER",
    "OBSERVABILITY_OWNER"
  ]);
}

export function alertingChannel() {
  return firstEnvValue([
    "SENA_ALERTING_CHANNEL",
    "ALERTING_CHANNEL",
    "OBSERVABILITY_ALERT_CHANNEL"
  ]) ?? "deployment-monitor";
}

export function alertingRunbookUrl() {
  const url = firstEnvValue([
    "SENA_ALERTING_RUNBOOK_URL",
    "SENA_OBSERVABILITY_RUNBOOK_URL",
    "ALERTING_RUNBOOK_URL",
    "OBSERVABILITY_RUNBOOK_URL"
  ]);
  if (!url) return undefined;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SenaEnterpriseError("SENA_ALERTING_RUNBOOK_URL must be an HTTP(S) URL.", 500, "invalid_alerting_runbook_url");
  }
  return parsed.toString();
}

function opsStatusAlertSeverity(checkId: string): SenaEnterpriseOpsAlert["severity"] {
  if ([
    "ops-storage-readable",
    "ops-storage-writable",
    "ops-storage-lock",
    "ops-write-before-backup",
    "ops-upload-storage-integrity"
  ].includes(checkId)) {
    return "critical";
  }
  return "warning";
}

function opsAlertStatus(alerts: SenaEnterpriseOpsAlert[]): SenaEnterpriseOpsAlerts["status"] {
  if (alerts.some((alert) => alert.severity === "critical")) return "critical";
  if (alerts.some((alert) => alert.severity === "warning")) return "warning";
  return "clear";
}

export function getEnterpriseOpsAlerts(
  status = getEnterpriseOpsStatus(),
  readiness = getEnterpriseDeploymentReadiness()
): SenaEnterpriseOpsAlerts {
  return buildEnterpriseOpsAlerts(status, readiness, getEnterpriseObservabilitySnapshot());
}

export async function getEnterpriseOpsAlertsWithPostgresEvidence(
  status?: SenaEnterpriseOpsStatus,
  readiness?: SenaEnterpriseDeploymentReadiness
): Promise<SenaEnterpriseOpsAlerts> {
  const resolvedStatus = status ?? await getEnterpriseOpsStatusWithPostgresEvidence();
  const resolvedReadiness = readiness ?? await getEnterpriseDeploymentReadinessWithPostgresEvidence({ opsStatus: resolvedStatus });
  return buildEnterpriseOpsAlerts(
    resolvedStatus,
    resolvedReadiness,
    await getEnterpriseObservabilitySnapshotWithPostgresEvidence()
  );
}

function buildEnterpriseOpsAlerts(
  status: SenaEnterpriseOpsStatus,
  readiness: SenaEnterpriseDeploymentReadiness,
  observability: SenaEnterpriseObservabilitySnapshot
): SenaEnterpriseOpsAlerts {
  const generatedAt = now();
  const owner = alertingOwner();
  const runbookUrl = alertingRunbookUrl();
  const ownerLabel = owner ?? "unassigned";
  const base = {
    owner: ownerLabel,
    runbookUrl,
    createdAt: generatedAt
  };
  const alerts: SenaEnterpriseOpsAlert[] = [];

  for (const check of status.checks) {
    if (check.status === "pass") continue;
    alerts.push({
      ...base,
      id: `ops-${check.id}`,
      label: check.label,
      severity: opsStatusAlertSeverity(check.id),
      status: "firing",
      source: "ops-status",
      evidence: check.evidence,
      nextAction: check.nextAction
    });
  }

  for (const item of readiness.blocking) {
    if (item.status === "pass") continue;
    alerts.push({
      ...base,
      id: `readiness-blocking-${item.id}`,
      label: item.label,
      severity: "critical",
      status: "firing",
      source: "deployment-readiness",
      evidence: item.evidence,
      nextAction: item.nextAction
    });
  }

  for (const item of readiness.advisory) {
    if (item.status === "pass") continue;
    alerts.push({
      ...base,
      id: `readiness-advisory-${item.id}`,
      label: item.label,
      severity: "warning",
      status: "firing",
      source: "deployment-readiness",
      evidence: item.evidence,
      nextAction: item.nextAction
    });
  }

  if (!owner) {
    alerts.push({
      ...base,
      id: "alerting-owner-missing",
      label: "Alerting owner assignment",
      severity: "critical",
      status: "firing",
      source: "alerting-ownership",
      evidence: [
        "owner=missing",
        "env=SENA_ALERTING_OWNER"
      ],
      nextAction: "Set SENA_ALERTING_OWNER to the operational rotation or named deployment owner before production handoff."
    });
  }

  if (!runbookUrl) {
    alerts.push({
      ...base,
      id: "alerting-runbook-missing",
      label: "Alerting runbook URL",
      severity: "warning",
      status: "firing",
      source: "alerting-ownership",
      evidence: [
        "runbookUrl=missing",
        "env=SENA_ALERTING_RUNBOOK_URL"
      ],
      nextAction: "Set SENA_ALERTING_RUNBOOK_URL to the incident response runbook used by deployment monitors."
    });
  }

  if (observability.summary.sloBreached) {
    alerts.push({
      ...base,
      id: "observability-slo-breached",
      label: "Request-level SLI breach",
      severity: observability.summary.serverErrors > 0 ? "critical" : "warning",
      status: "firing",
      source: "observability",
      evidence: [
        `samples=${observability.summary.total}`,
        `sampleWindow=${observability.summary.sampleWindow}`,
        `p95Ms=${observability.summary.p95Ms}`,
        `p95SloMs=${observability.slo.p95Ms}`,
        `errorRatePercent=${observability.summary.errorRatePercent}`,
        `errorRateSloPercent=${observability.slo.errorRatePercent}`,
        `slowRequests=${observability.summary.slow}`,
        ...observability.evidence
      ],
      nextAction: "Inspect /api/sena/ops/observability and route-level metrics, queue heavy work if p95 is high, and rollback or disable the failing workload if server errors are present."
    });
  }

  const critical = alerts.filter((alert) => alert.severity === "critical").length;
  const warning = alerts.filter((alert) => alert.severity === "warning").length;
  const info = alerts.filter((alert) => alert.severity === "info").length;
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseOpsAlerts,
    generatedAt,
    status: opsAlertStatus(alerts),
    ownership: {
      configured: Boolean(owner),
      owner: ownerLabel,
      runbookUrl,
      channel: alertingChannel()
    },
    summary: {
      critical,
      warning,
      info,
      firing: alerts.length
    },
    alerts
  };
}

function opsAlertWebhookPayload(alerts: SenaEnterpriseOpsAlerts, endpointHash: string, generatedAt: string) {
  return {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseOpsAlertWebhook,
    generatedAt,
    alerts,
    delivery: {
      provider: "webhook",
      endpointHash,
      secretConfigured: Boolean(alertWebhookSecret())
    }
  };
}

async function postOpsAlertWebhook(alerts: SenaEnterpriseOpsAlerts) {
  const webhookUrl = alertWebhookUrl();
  if (!webhookUrl) {
    throw new SenaEnterpriseError("Alert webhook delivery is not configured.", 503, "alert_webhook_not_configured");
  }
  const endpointHash = alertWebhookEndpointHash(webhookUrl)!;
  const generatedAt = now();
  const body = JSON.stringify(opsAlertWebhookPayload(alerts, endpointHash, generatedAt));
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-sena-webhook-event": "ops.alert",
    "x-sena-webhook-timestamp": generatedAt,
    "x-sena-ops-alert-status": alerts.status,
    "x-sena-ops-alert-firing": String(alerts.summary.firing),
    "x-sena-ops-alert-critical": String(alerts.summary.critical)
  };
  const secret = alertWebhookSecret();
  if (secret) {
    headers["x-sena-webhook-signature"] = `sha256=${createHmac("sha256", secret).update(`${generatedAt}.${body}`).digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), alertWebhookTimeoutMs());
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      endpointHash,
      httpStatus: response.status,
      errorCode: response.ok ? undefined : `http_${response.status}`,
      errorHash: undefined
    };
  } catch (error) {
    return {
      ok: false,
      endpointHash,
      httpStatus: undefined,
      errorCode: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error",
      errorHash: webhookErrorHash(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function deliverEnterpriseOpsAlerts(input: {
  status?: SenaEnterpriseOpsStatus;
  readiness?: SenaEnterpriseDeploymentReadiness;
} = {}): Promise<SenaEnterpriseOpsAlertDeliveryResult> {
  const provider = alertWebhookProvider(enterpriseDbPath, isSelfManagedEnterpriseMode());
  const alerts = await getEnterpriseOpsAlertsWithPostgresEvidence(input.status, input.readiness);
  const result: SenaEnterpriseOpsAlertDeliveryResult = {
    schemaVersion: SENA_SCHEMA_VERSIONS.enterpriseOpsAlertDelivery,
    status: provider.configured ? "failed" : "not-configured",
    generatedAt: now(),
    provider,
    alerts: {
      generatedAt: alerts.generatedAt,
      status: alerts.status,
      summary: alerts.summary,
      ownership: alerts.ownership
    },
    delivery: {
      attempted: false
    }
  };

  if (!provider.configured) {
    return result;
  }

  const attemptResult = provider.mode === "local-sink"
    ? localWebhookSinkAttempt(provider.endpointHash!)
    : await postOpsAlertWebhook(alerts);
  const attemptedAt = now();
  result.status = attemptResult.ok ? "delivered" : "failed";
  result.delivery = {
    attempted: true,
    webhookStatus: attemptResult.ok ? "delivered" : "failed",
    attemptedAt,
    endpointHash: attemptResult.endpointHash,
    httpStatus: attemptResult.httpStatus,
    errorCode: attemptResult.errorCode,
    errorHash: attemptResult.errorHash
  };

  const db = readEnterpriseDb();
  appendAudit(db, {
    event: attemptResult.ok ? "ops.alert.deliver" : "ops.alert.deliver.fail",
    detail: {
      status: alerts.status,
      firing: alerts.summary.firing,
      critical: alerts.summary.critical,
      warning: alerts.summary.warning,
      info: alerts.summary.info,
      ownerConfigured: alerts.ownership.configured,
      endpointHash: attemptResult.endpointHash ?? "none",
      httpStatus: attemptResult.httpStatus ?? null,
      errorCode: attemptResult.errorCode ?? null,
      errorHash: attemptResult.errorHash ?? null
    }
  });
  saveDb(db);
  return result;
}
