import {
  getEnterpriseDeploymentReadiness,
  type SenaEnterpriseDeploymentReadiness
} from "./ops-deployment-readiness";
import {
  getEnterpriseOpsStatus,
  type SenaEnterpriseOpsStatus
} from "./ops-status";
import { enterprisePostgresProbeReadiness } from "../enterprise-postgres";
import { auditStoreRuntime } from "./ops-audit";
import { conferenceLoadRehearsalProductionEvidenceReadiness } from "./conference-load-rehearsal";
import {
  enterpriseObservabilityProbeReadiness,
  enterpriseObservabilitySampleStoreRuntime,
  getEnterpriseObservabilitySnapshot,
  getEnterpriseObservabilitySnapshotWithPostgresEvidence,
  type SenaEnterpriseObservabilitySnapshot
} from "./ops-observability";
import { enterpriseObjectStorageProbeReadiness } from "./object-storage-adapter";
import {
  enterpriseAnalysisRunRegistryRuntime,
  enterpriseImportRunRegistryRuntime,
  enterpriseUploadRegistryRuntime
} from "./import-analysis";
import { enterpriseReliabilityRunRegistryRuntime } from "./reliability-runs";
import { enterpriseValidationRunRegistryRuntime } from "./validation-runs";
import { enterpriseExpertReviewRegistryRuntime } from "./expert-review";
import { serverJobQueueProbeReadiness, serverJobStoreRuntime } from "./server-job-queue";
import { getEnterpriseServerJobWorkerContract } from "./server-job-worker-contract";
import { buildEnterpriseProductionEvidenceManifest } from "./ops-production-evidence";

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

const productionPerformanceMetricItemIds = [
  "production-postgres-state",
  "production-runtime-header",
  "production-object-storage",
  "production-cdn-compression",
  "production-server-job-queue",
  "production-observability",
  "production-performance-budget",
  "production-conference-load-rehearsal"
] as const;

function buildEnterpriseOpsMetricsFromObservability(
  status: SenaEnterpriseOpsStatus,
  readiness: SenaEnterpriseDeploymentReadiness,
  observability: SenaEnterpriseObservabilitySnapshot
) {
  const ready = status.status === "ready" ? 1 : 0;
  const postgresProbe = enterprisePostgresProbeReadiness();
  const auditRuntime = auditStoreRuntime();
  const uploadRegistryRuntime = enterpriseUploadRegistryRuntime();
  const importRunRegistryRuntime = enterpriseImportRunRegistryRuntime();
  const analysisRunRegistryRuntime = enterpriseAnalysisRunRegistryRuntime();
  const reliabilityRunRegistryRuntime = enterpriseReliabilityRunRegistryRuntime();
  const validationRunRegistryRuntime = enterpriseValidationRunRegistryRuntime();
  const expertReviewRegistryRuntime = enterpriseExpertReviewRegistryRuntime();
  const jobStoreRuntime = serverJobStoreRuntime();
  const serverJobQueueProbe = serverJobQueueProbeReadiness();
  const workerContract = getEnterpriseServerJobWorkerContract();
  const objectStorageProbe = enterpriseObjectStorageProbeReadiness();
  const observabilityProbe = enterpriseObservabilityProbeReadiness();
  const observabilitySampleStore = enterpriseObservabilitySampleStoreRuntime();
  const productionEvidence = buildEnterpriseProductionEvidenceManifest();
  const conferenceLoad = conferenceLoadRehearsalProductionEvidenceReadiness();
  const degraded = status.status === "degraded" ? 1 : 0;
  const identityReadinessItems = identityMetricsReadinessItemIds.map((id) => (
    readiness.blocking.find((item) => item.id === id)
  ));
  const identityReadinessBlockers = identityReadinessItems
    .filter((item) => item?.status !== "pass")
    .length;
  const productionPerformanceItems = productionPerformanceMetricItemIds.map((id) => (
    readiness.productionPerformancePath.items.find((item) => item.id === id)
  ));
  const productionPerformanceBlockers = productionPerformanceItems
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
    "# HELP sena_enterprise_postgres_probe_required Whether production Postgres requires a live DDL/DML/read/delete probe artifact.",
    "# TYPE sena_enterprise_postgres_probe_required gauge",
    metricLine("sena_enterprise_postgres_probe_required", postgresProbe.required ? 1 : 0),
    "# HELP sena_enterprise_postgres_probe_confirmed Whether the live Postgres probe artifact is confirmed.",
    "# TYPE sena_enterprise_postgres_probe_confirmed gauge",
    metricLine("sena_enterprise_postgres_probe_confirmed", postgresProbe.confirmed ? 1 : 0),
    "# HELP sena_enterprise_postgres_probe_artifact_configured Whether the Postgres probe artifact SHA-256 is configured and valid.",
    "# TYPE sena_enterprise_postgres_probe_artifact_configured gauge",
    metricLine("sena_enterprise_postgres_probe_artifact_configured", postgresProbe.artifactHashConfigured ? 1 : 0),
    "# HELP sena_enterprise_postgres_probe_verified_at_configured Whether the Postgres probe verified-at timestamp is configured and valid.",
    "# TYPE sena_enterprise_postgres_probe_verified_at_configured gauge",
    metricLine("sena_enterprise_postgres_probe_verified_at_configured", postgresProbe.verifiedAtConfigured ? 1 : 0),
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
    "# HELP sena_enterprise_object_storage_native_configured Whether native SENA object storage adapter is configured.",
    "# TYPE sena_enterprise_object_storage_native_configured gauge",
    metricLine("sena_enterprise_object_storage_native_configured", status.deployment.objectStorageNativeConfigured ? 1 : 0),
    "# HELP sena_enterprise_object_storage_probe_required Whether production object storage requires a live PUT/HEAD/DELETE probe artifact.",
    "# TYPE sena_enterprise_object_storage_probe_required gauge",
    metricLine("sena_enterprise_object_storage_probe_required", objectStorageProbe.required ? 1 : 0),
    "# HELP sena_enterprise_object_storage_probe_confirmed Whether the live object storage probe artifact is confirmed.",
    "# TYPE sena_enterprise_object_storage_probe_confirmed gauge",
    metricLine("sena_enterprise_object_storage_probe_confirmed", objectStorageProbe.confirmed ? 1 : 0),
    "# HELP sena_enterprise_object_storage_probe_artifact_configured Whether the object storage probe artifact SHA-256 is configured and valid.",
    "# TYPE sena_enterprise_object_storage_probe_artifact_configured gauge",
    metricLine("sena_enterprise_object_storage_probe_artifact_configured", objectStorageProbe.artifactHashConfigured ? 1 : 0),
    "# HELP sena_enterprise_object_storage_probe_verified_at_configured Whether the object storage probe verified-at timestamp is configured and valid.",
    "# TYPE sena_enterprise_object_storage_probe_verified_at_configured gauge",
    metricLine("sena_enterprise_object_storage_probe_verified_at_configured", objectStorageProbe.verifiedAtConfigured ? 1 : 0),
    "# HELP sena_enterprise_upload_registry_store_postgres Whether upload registry metadata uses the indexed Postgres upload table.",
    "# TYPE sena_enterprise_upload_registry_store_postgres gauge",
    metricLine("sena_enterprise_upload_registry_store_postgres", uploadRegistryRuntime.activeStore === "postgres-table" ? 1 : 0),
    "# HELP sena_enterprise_import_run_registry_store_postgres Whether import run metadata uses the indexed Postgres import run table.",
    "# TYPE sena_enterprise_import_run_registry_store_postgres gauge",
    metricLine("sena_enterprise_import_run_registry_store_postgres", importRunRegistryRuntime.activeStore === "postgres-table" ? 1 : 0),
    "# HELP sena_enterprise_analysis_run_registry_store_postgres Whether analysis run metadata uses the indexed Postgres analysis run table.",
    "# TYPE sena_enterprise_analysis_run_registry_store_postgres gauge",
    metricLine("sena_enterprise_analysis_run_registry_store_postgres", analysisRunRegistryRuntime.activeStore === "postgres-table" ? 1 : 0),
    "# HELP sena_enterprise_reliability_run_registry_store_postgres Whether reliability run metadata uses the indexed Postgres reliability run table.",
    "# TYPE sena_enterprise_reliability_run_registry_store_postgres gauge",
    metricLine("sena_enterprise_reliability_run_registry_store_postgres", reliabilityRunRegistryRuntime.activeStore === "postgres-table" ? 1 : 0),
    "# HELP sena_enterprise_validation_run_registry_store_postgres Whether validation run metadata uses the indexed Postgres validation run table.",
    "# TYPE sena_enterprise_validation_run_registry_store_postgres gauge",
    metricLine("sena_enterprise_validation_run_registry_store_postgres", validationRunRegistryRuntime.activeStore === "postgres-table" ? 1 : 0),
    "# HELP sena_enterprise_expert_review_registry_store_postgres Whether expert review metadata uses the indexed Postgres expert review table.",
    "# TYPE sena_enterprise_expert_review_registry_store_postgres gauge",
    metricLine("sena_enterprise_expert_review_registry_store_postgres", expertReviewRegistryRuntime.activeStore === "postgres-table" ? 1 : 0),
    "# HELP sena_enterprise_server_job_store_postgres Whether server job status uses the indexed Postgres job table.",
    "# TYPE sena_enterprise_server_job_store_postgres gauge",
    metricLine("sena_enterprise_server_job_store_postgres", jobStoreRuntime.activeStore === "postgres-table" ? 1 : 0),
    "# HELP sena_enterprise_server_job_worker_contract_ready Whether the external server job worker contract is production-ready.",
    "# TYPE sena_enterprise_server_job_worker_contract_ready gauge",
    metricLine("sena_enterprise_server_job_worker_contract_ready", workerContract.productionReady ? 1 : 0, { runtime: workerContract.worker.runtime }),
    "# HELP sena_enterprise_server_job_worker_contract_missing Missing external server job worker contract requirements.",
    "# TYPE sena_enterprise_server_job_worker_contract_missing gauge",
    metricLine("sena_enterprise_server_job_worker_contract_missing", workerContract.missing.length),
    "# HELP sena_enterprise_server_job_worker_heartbeat_confirmed Whether the same-process status-store CAS self-test artifact is configured; this is not external-worker readiness.",
    "# TYPE sena_enterprise_server_job_worker_heartbeat_confirmed gauge",
    metricLine("sena_enterprise_server_job_worker_heartbeat_confirmed", workerContract.worker.heartbeatConfirmed ? 1 : 0),
    "# HELP sena_enterprise_server_job_queue_probe_required Whether production server job queue requires a signed live dispatch probe artifact.",
    "# TYPE sena_enterprise_server_job_queue_probe_required gauge",
    metricLine("sena_enterprise_server_job_queue_probe_required", serverJobQueueProbe.required ? 1 : 0),
    "# HELP sena_enterprise_server_job_queue_probe_confirmed Whether the live server job queue dispatch probe artifact is confirmed.",
    "# TYPE sena_enterprise_server_job_queue_probe_confirmed gauge",
    metricLine("sena_enterprise_server_job_queue_probe_confirmed", serverJobQueueProbe.confirmed ? 1 : 0),
    "# HELP sena_enterprise_server_job_queue_probe_artifact_configured Whether the server job queue probe artifact SHA-256 is configured and valid.",
    "# TYPE sena_enterprise_server_job_queue_probe_artifact_configured gauge",
    metricLine("sena_enterprise_server_job_queue_probe_artifact_configured", serverJobQueueProbe.artifactHashConfigured ? 1 : 0),
    "# HELP sena_enterprise_server_job_queue_probe_verified_at_configured Whether the server job queue probe verified-at timestamp is configured and valid.",
    "# TYPE sena_enterprise_server_job_queue_probe_verified_at_configured gauge",
    metricLine("sena_enterprise_server_job_queue_probe_verified_at_configured", serverJobQueueProbe.verifiedAtConfigured ? 1 : 0),
    "# HELP sena_enterprise_audit_store_postgres Whether audit events use the indexed Postgres audit table.",
    "# TYPE sena_enterprise_audit_store_postgres gauge",
    metricLine("sena_enterprise_audit_store_postgres", auditRuntime.activeStore === "postgres-table" ? 1 : 0),
    "# HELP sena_enterprise_observability_external_sink_configured Whether request-level SLI samples have an external observability sink.",
    "# TYPE sena_enterprise_observability_external_sink_configured gauge",
    metricLine("sena_enterprise_observability_external_sink_configured", observability.provider.externalSinkConfigured ? 1 : 0, { provider: observability.provider.name }),
    "# HELP sena_enterprise_observability_probe_required Whether production observability requires a live exporter delivery probe artifact.",
    "# TYPE sena_enterprise_observability_probe_required gauge",
    metricLine("sena_enterprise_observability_probe_required", observabilityProbe.required ? 1 : 0),
    "# HELP sena_enterprise_observability_probe_confirmed Whether the live observability exporter probe artifact is confirmed.",
    "# TYPE sena_enterprise_observability_probe_confirmed gauge",
    metricLine("sena_enterprise_observability_probe_confirmed", observabilityProbe.confirmed ? 1 : 0),
    "# HELP sena_enterprise_observability_probe_artifact_configured Whether the observability probe artifact SHA-256 is configured and valid.",
    "# TYPE sena_enterprise_observability_probe_artifact_configured gauge",
    metricLine("sena_enterprise_observability_probe_artifact_configured", observabilityProbe.artifactHashConfigured ? 1 : 0),
    "# HELP sena_enterprise_observability_probe_verified_at_configured Whether the observability probe verified-at timestamp is configured and valid.",
    "# TYPE sena_enterprise_observability_probe_verified_at_configured gauge",
    metricLine("sena_enterprise_observability_probe_verified_at_configured", observabilityProbe.verifiedAtConfigured ? 1 : 0),
    "# HELP sena_enterprise_observability_dashboard_configured Whether an observability dashboard URL is configured.",
    "# TYPE sena_enterprise_observability_dashboard_configured gauge",
    metricLine("sena_enterprise_observability_dashboard_configured", observability.provider.dashboardConfigured ? 1 : 0),
    "# HELP sena_enterprise_observability_sample_store_postgres Whether request-level SLI samples use the indexed Postgres observed-request table.",
    "# TYPE sena_enterprise_observability_sample_store_postgres gauge",
    metricLine("sena_enterprise_observability_sample_store_postgres", observabilitySampleStore.activeStore === "postgres-table" ? 1 : 0),
    "# HELP sena_enterprise_observability_samples Retained request SLI samples in the active snapshot window.",
    "# TYPE sena_enterprise_observability_samples gauge",
    metricLine("sena_enterprise_observability_samples", observability.summary.retainedSamples, { store: observabilitySampleStore.activeStore }),
    "# HELP sena_enterprise_observability_request_p95_ms Request p95 latency in milliseconds for the active snapshot window.",
    "# TYPE sena_enterprise_observability_request_p95_ms gauge",
    metricLine("sena_enterprise_observability_request_p95_ms", observability.summary.p95Ms, { store: observabilitySampleStore.activeStore }),
    "# HELP sena_enterprise_observability_error_rate_percent Server error rate percentage for the active snapshot window.",
    "# TYPE sena_enterprise_observability_error_rate_percent gauge",
    metricLine("sena_enterprise_observability_error_rate_percent", observability.summary.errorRatePercent, { store: observabilitySampleStore.activeStore }),
    "# HELP sena_enterprise_observability_slo_breached Whether active SLI samples breach configured p95 or error-rate SLOs.",
    "# TYPE sena_enterprise_observability_slo_breached gauge",
    metricLine("sena_enterprise_observability_slo_breached", observability.summary.sloBreached ? 1 : 0, { store: observabilitySampleStore.activeStore }),
    "# HELP sena_enterprise_observability_route_requests Request samples by route and method for the active snapshot window.",
    "# TYPE sena_enterprise_observability_route_requests gauge",
    ...observability.routes.map((route) => metricLine("sena_enterprise_observability_route_requests", route.total, {
      route: route.routeId,
      method: route.method,
      store: observabilitySampleStore.activeStore
    })),
    "# HELP sena_enterprise_observability_route_p95_ms P95 latency by route and method for the active snapshot window.",
    "# TYPE sena_enterprise_observability_route_p95_ms gauge",
    ...observability.routes.map((route) => metricLine("sena_enterprise_observability_route_p95_ms", route.p95Ms, {
      route: route.routeId,
      method: route.method,
      store: observabilitySampleStore.activeStore
    })),
    "# HELP sena_enterprise_production_evidence_missing_required Required production live evidence artifacts that are missing or invalid.",
    "# TYPE sena_enterprise_production_evidence_missing_required gauge",
    metricLine("sena_enterprise_production_evidence_missing_required", productionEvidence.summary.missingRequired, { status: productionEvidence.status }),
    "# HELP sena_enterprise_production_evidence_confirmed Confirmed production live evidence artifacts.",
    "# TYPE sena_enterprise_production_evidence_confirmed gauge",
    metricLine("sena_enterprise_production_evidence_confirmed", productionEvidence.summary.confirmed, { status: productionEvidence.status }),
    "# HELP sena_enterprise_production_evidence_item Production evidence item confirmation state.",
    "# TYPE sena_enterprise_production_evidence_item gauge",
    ...productionEvidence.items.map((item) => metricLine("sena_enterprise_production_evidence_item", item.confirmed ? 1 : 0, {
      item: item.id,
      status: item.status,
      required: item.required
    })),
    "# HELP sena_enterprise_conference_load_rehearsal_confirmed Whether the 50-user, 30-minute conference load rehearsal artifact is confirmed.",
    "# TYPE sena_enterprise_conference_load_rehearsal_confirmed gauge",
    metricLine("sena_enterprise_conference_load_rehearsal_confirmed", conferenceLoad.confirmed ? 1 : 0),
    "# HELP sena_enterprise_conference_load_rehearsal_profile Conference load rehearsal metadata captured for release evidence.",
    "# TYPE sena_enterprise_conference_load_rehearsal_profile gauge",
    metricLine("sena_enterprise_conference_load_rehearsal_profile", Number.isFinite(conferenceLoad.users) ? conferenceLoad.users : 0, { metric: "users" }),
    metricLine("sena_enterprise_conference_load_rehearsal_profile", Number.isFinite(conferenceLoad.durationSeconds) ? conferenceLoad.durationSeconds : 0, { metric: "duration_seconds" }),
    metricLine("sena_enterprise_conference_load_rehearsal_profile", Number.isFinite(conferenceLoad.p95Ms) ? conferenceLoad.p95Ms : 0, { metric: "p95_ms" }),
    metricLine("sena_enterprise_conference_load_rehearsal_profile", Number.isFinite(conferenceLoad.errorRatePercent) ? conferenceLoad.errorRatePercent : 0, { metric: "error_rate_percent" }),
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
    "# HELP sena_enterprise_production_performance_blockers Production performance path blockers for Vercel runtime header, Postgres, object storage, CDN, job queue, and observability.",
    "# TYPE sena_enterprise_production_performance_blockers gauge",
    metricLine("sena_enterprise_production_performance_blockers", productionPerformanceBlockers, { readiness_status: readiness.status }),
    "# HELP sena_enterprise_production_performance_item Production performance path item state.",
    "# TYPE sena_enterprise_production_performance_item gauge",
    ...productionPerformanceMetricItemIds.map((id, index) => metricLine(
      "sena_enterprise_production_performance_item",
      productionPerformanceItems[index] ? 1 : 0,
      {
        item: id,
        status: productionPerformanceItems[index]?.status ?? "missing"
      }
    )),
    ""
  ];
  return lines.join("\n");
}

export function buildEnterpriseOpsMetrics(
  status: SenaEnterpriseOpsStatus = getEnterpriseOpsStatus(),
  readiness: SenaEnterpriseDeploymentReadiness = getEnterpriseDeploymentReadiness()
) {
  return buildEnterpriseOpsMetricsFromObservability(
    status,
    readiness,
    getEnterpriseObservabilitySnapshot()
  );
}

export async function buildEnterpriseOpsMetricsWithPostgresEvidence(
  status: SenaEnterpriseOpsStatus = getEnterpriseOpsStatus(),
  readiness: SenaEnterpriseDeploymentReadiness = getEnterpriseDeploymentReadiness()
) {
  return buildEnterpriseOpsMetricsFromObservability(
    status,
    readiness,
    await getEnterpriseObservabilitySnapshotWithPostgresEvidence()
  );
}
