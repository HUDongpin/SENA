import {
  getEnterpriseDeploymentReadiness,
  type SenaEnterpriseDeploymentReadiness
} from "./ops-deployment-readiness";
import {
  getEnterpriseOpsStatus,
  type SenaEnterpriseOpsStatus
} from "./ops-status";

function metricLine(name: string, value: number, labels?: Record<string, string | number | boolean | undefined>) {
  const labelText = labels
    ? `{${Object.entries(labels)
      .filter(([, labelValue]) => labelValue !== undefined)
      .map(([key, labelValue]) => `${key}="${String(labelValue).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`)
      .join(",")}}`
    : "";
  return `${name}${labelText} ${Number.isFinite(value) ? value : 0}`;
}

const identityMetricsReadinessItemIds = [
  "identity-evidence-host-allowlist",
  "identity-secret-version-binding",
  "identity-secret-store-reference",
  "identity-secret-rotation-cadence",
  "identity-idp-tenant-binding",
  "identity-lifecycle-owner-mode"
] as const;

export function buildEnterpriseOpsMetrics(
  status: SenaEnterpriseOpsStatus = getEnterpriseOpsStatus(),
  readiness: SenaEnterpriseDeploymentReadiness = getEnterpriseDeploymentReadiness()
) {
  const ready = status.status === "ready" ? 1 : 0;
  const degraded = status.status === "degraded" ? 1 : 0;
  const identityReadinessItems = identityMetricsReadinessItemIds.map((id) => (
    readiness.blocking.find((item) => item.id === id)
  ));
  const identityReadinessBlockers = identityReadinessItems
    .filter((item) => item?.status !== "pass")
    .length;
  const lines = [
    "# HELP sena_enterprise_ready SENA enterprise runtime readiness.",
    "# TYPE sena_enterprise_ready gauge",
    metricLine("sena_enterprise_ready", ready, { status: status.status }),
    "# HELP sena_enterprise_degraded SENA enterprise runtime degraded state.",
    "# TYPE sena_enterprise_degraded gauge",
    metricLine("sena_enterprise_degraded", degraded),
    "# HELP sena_enterprise_storage_writable Enterprise storage write probe.",
    "# TYPE sena_enterprise_storage_writable gauge",
    metricLine("sena_enterprise_storage_writable", status.storage.writable ? 1 : 0),
    "# HELP sena_enterprise_storage_lock_healthy Enterprise database write lock probe.",
    "# TYPE sena_enterprise_storage_lock_healthy gauge",
    metricLine("sena_enterprise_storage_lock_healthy", status.storage.lockProbe === "pass" ? 1 : 0, { lock_timeout_ms: status.storage.lockTimeoutMs }),
    "# HELP sena_enterprise_write_backup_exists Whether the write-before backup file exists.",
    "# TYPE sena_enterprise_write_backup_exists gauge",
    metricLine("sena_enterprise_write_backup_exists", status.storage.dbBackupExists ? 1 : 0),
    "# HELP sena_enterprise_db_bytes Enterprise database JSON file size.",
    "# TYPE sena_enterprise_db_bytes gauge",
    metricLine("sena_enterprise_db_bytes", status.storage.dbBytes),
    "# HELP sena_enterprise_backup_age_seconds Age of the latest enterprise backup audit event.",
    "# TYPE sena_enterprise_backup_age_seconds gauge",
    metricLine("sena_enterprise_backup_age_seconds", status.backup.backupAgeSeconds ?? -1, { backup_status: status.backup.status }),
    "# HELP sena_enterprise_collaboration_pubsub_webhook_configured Whether SENA_COLLABORATION_PUBSUB_WEBHOOK_URL is configured.",
    "# TYPE sena_enterprise_collaboration_pubsub_webhook_configured gauge",
    metricLine("sena_enterprise_collaboration_pubsub_webhook_configured", status.deployment.collaborationPubSubWebhookConfigured ? 1 : 0),
    "# HELP sena_enterprise_database_sync_webhook_configured Whether SENA_DATABASE_SYNC_WEBHOOK_URL is configured.",
    "# TYPE sena_enterprise_database_sync_webhook_configured gauge",
    metricLine("sena_enterprise_database_sync_webhook_configured", status.deployment.databaseSyncWebhookConfigured ? 1 : 0),
    "# HELP sena_enterprise_object_storage_webhook_configured Whether SENA_OBJECT_STORAGE_WEBHOOK_URL is configured.",
    "# TYPE sena_enterprise_object_storage_webhook_configured gauge",
    metricLine("sena_enterprise_object_storage_webhook_configured", status.deployment.objectStorageWebhookConfigured ? 1 : 0),
    "# HELP sena_enterprise_backup_webhook_configured Whether SENA_BACKUP_WEBHOOK_URL is configured.",
    "# TYPE sena_enterprise_backup_webhook_configured gauge",
    metricLine("sena_enterprise_backup_webhook_configured", status.deployment.backupWebhookConfigured ? 1 : 0),
    "# HELP sena_enterprise_alert_webhook_configured Whether SENA_ALERT_WEBHOOK_URL is configured.",
    "# TYPE sena_enterprise_alert_webhook_configured gauge",
    metricLine("sena_enterprise_alert_webhook_configured", status.deployment.alertWebhookConfigured ? 1 : 0),
    "# HELP sena_enterprise_collection_records Enterprise collection record counts.",
    "# TYPE sena_enterprise_collection_records gauge",
    ...Object.entries(status.counts).map(([collection, count]) => metricLine("sena_enterprise_collection_records", count, { collection })),
    "# HELP sena_enterprise_queue_records Enterprise queue/status counters.",
    "# TYPE sena_enterprise_queue_records gauge",
    ...Object.entries(status.queues).map(([queue, count]) => metricLine("sena_enterprise_queue_records", count, { queue })),
    "# HELP sena_enterprise_ops_token_configured Whether SENA_OPS_TOKEN is configured.",
    "# TYPE sena_enterprise_ops_token_configured gauge",
    metricLine("sena_enterprise_ops_token_configured", status.deployment.opsTokenConfigured ? 1 : 0),
    "# HELP sena_enterprise_deployment_readiness_blocking_review Deployment readiness blocking checks in review.",
    "# TYPE sena_enterprise_deployment_readiness_blocking_review gauge",
    metricLine("sena_enterprise_deployment_readiness_blocking_review", readiness.summary.blockingReview, { readiness_status: readiness.status }),
    "# HELP sena_enterprise_identity_readiness_blockers Identity production readiness blockers from deployment readiness.",
    "# TYPE sena_enterprise_identity_readiness_blockers gauge",
    metricLine("sena_enterprise_identity_readiness_blockers", identityReadinessBlockers, { readiness_status: readiness.status }),
    "# HELP sena_enterprise_identity_readiness_item Identity production readiness item state.",
    "# TYPE sena_enterprise_identity_readiness_item gauge",
    ...identityMetricsReadinessItemIds.map((id, index) => metricLine(
      "sena_enterprise_identity_readiness_item",
      identityReadinessItems[index] ? 1 : 0,
      {
        item: id,
        status: identityReadinessItems[index]?.status ?? "missing"
      }
    )),
    ""
  ];
  return lines.join("\n");
}
