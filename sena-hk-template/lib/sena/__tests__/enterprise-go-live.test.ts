import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildSenaGroupComparison,
  buildSenaModel,
  buildSenaProjectSnapshot,
  buildSenaReliabilityDashboard,
  importSenaJsonContract,
  lessonStudySenaContract,
  parseCoderAnnotationsFromRows,
  reliabilityDashboardToReview
} from "../index";
import { RouteMemoryPostgres } from "./postgres-primary-route-fixture";

const goLiveEnvNames = [
  "NODE_ENV",
  "SENA_ENTERPRISE_DB_DIR",
  "SENA_APP_URL",
  "SENA_MFA_ENCRYPTION_KEY",
  "SENA_CSRF_SECRET",
  "SENA_SESSION_SECRET",
  "SENA_PROVISIONING_TOKEN",
  "SENA_PROVISIONING_TOKEN_SECRET_REF",
  "SENA_PROVISIONING_TOKEN_VERSION",
  "SENA_OPS_TOKEN",
  "SENA_AUDIT_RETENTION_DAYS",
  "SENA_NOTIFICATION_WEBHOOK_URL",
  "SENA_NOTIFICATION_WEBHOOK_SECRET",
  "SENA_NOTIFICATION_WEBHOOK_TIMEOUT_MS",
  "SENA_EMAIL_WEBHOOK_URL",
  "SENA_EMAIL_WEBHOOK_SECRET",
  "SENA_EMAIL_WEBHOOK_TIMEOUT_MS",
  "SENA_BACKUP_WEBHOOK_URL",
  "SENA_BACKUP_WEBHOOK_SECRET",
  "SENA_BACKUP_WEBHOOK_TIMEOUT_MS",
  "SENA_DATABASE_SYNC_WEBHOOK_URL",
  "SENA_DATABASE_SYNC_WEBHOOK_SECRET",
  "SENA_DATABASE_SYNC_WEBHOOK_TIMEOUT_MS",
  "SENA_OBJECT_STORAGE_WEBHOOK_URL",
  "SENA_OBJECT_STORAGE_WEBHOOK_SECRET",
  "SENA_OBJECT_STORAGE_WEBHOOK_TIMEOUT_MS",
  "SENA_COLLABORATION_PUBSUB_WEBHOOK_URL",
  "SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET",
  "SENA_COLLABORATION_PUBSUB_WEBHOOK_TIMEOUT_MS",
  "SENA_AUDIT_WEBHOOK_URL",
  "SENA_AUDIT_WEBHOOK_SECRET",
  "SENA_AUDIT_WEBHOOK_TIMEOUT_MS",
  "SENA_ALERTING_OWNER",
  "SENA_ALERTING_CHANNEL",
  "SENA_ALERTING_RUNBOOK_URL",
  "SENA_ALERT_WEBHOOK_URL",
  "SENA_ALERT_WEBHOOK_SECRET",
  "SENA_ALERT_WEBHOOK_TIMEOUT_MS",
  "SENA_OBSERVABILITY_PROVIDER",
  "SENA_OBSERVABILITY_EXPORTER_URL",
  "SENA_OBSERVABILITY_EXPORTER_SECRET",
  "SENA_OBSERVABILITY_DASHBOARD_URL",
  "SENA_OBSERVABILITY_RUNBOOK_URL",
  "SENA_OBSERVABILITY_OWNER",
  "SENA_OBSERVABILITY_SLO_P95_MS",
  "SENA_OBSERVABILITY_SLO_ERROR_RATE_PERCENT",
  "SENA_SSO_INSTITUTION_CLIENT_ID",
  "SENA_SSO_INSTITUTION_TENANT_ID",
  "SENA_SSO_INSTITUTION_CLIENT_SECRET",
  "SENA_SSO_INSTITUTION_CLIENT_SECRET_REF",
  "SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION",
  "SENA_SSO_INSTITUTION_ISSUER",
  "SENA_SSO_INSTITUTION_AUTHORIZATION_URL",
  "SENA_SSO_INSTITUTION_TOKEN_URL",
  "SENA_SSO_INSTITUTION_USERINFO_URL",
  "SENA_SSO_INSTITUTION_JWKS_URL",
  "SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS",
  "SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS",
  "SENA_IDENTITY_LIFECYCLE_OWNER_MODE",
  "SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED",
  "SENA_ENTERPRISE_DB_ADAPTER",
  "SENA_ENTERPRISE_STATE_STORE",
  "SENA_ENTERPRISE_POSTGRES_URL",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_ARTIFACT_SHA256",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_VERIFIED_AT",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_TARGET_HOST_SHA256",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_DEPLOYMENT_URL_SHA256",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_HTTP_STATUS",
  "SENA_VERCEL_PRODUCTION_PREFLIGHT_RUNTIME_HEADER",
  "SENA_CDN_ENABLED",
  "SENA_CDN_PROVIDER",
  "SENA_CDN_URL",
  "SENA_CDN_COMPRESSION_CONFIRMED",
  "SENA_CDN_STATIC_ASSET_CACHE_SECONDS",
  "SENA_OBJECT_STORAGE_ADAPTER",
  "SENA_OBJECT_STORAGE_ENDPOINT",
  "SENA_OBJECT_STORAGE_BUCKET",
  "SENA_OBJECT_STORAGE_REGION",
  "SENA_OBJECT_STORAGE_ACCESS_KEY_ID",
  "SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "SENA_OBJECT_STORAGE_PREFIX",
  "SENA_JOB_QUEUE_ADAPTER",
  "SENA_JOB_QUEUE_URL",
  "SENA_JOB_QUEUE_SECRET",
  "SENA_JOB_WORKER_RUNTIME",
  "SENA_JOB_WORKER_CALLBACK_URL",
  "SENA_JOB_WORKER_RUNBOOK_URL",
  "SENA_JOB_WORKER_OWNER",
  "SENA_JOB_WORKER_HEARTBEAT_CONFIRMED",
  "SENA_JOB_WORKER_HEARTBEAT_SHA256",
  "SENA_JOB_WORKER_HEARTBEAT_VERIFIED_AT",
  "SENA_JOB_WORKER_CONTRACT_REQUIRED",
  "SENA_JOB_WORKER_CONTRACT_CONFIRMED",
  "SENA_JOB_WORKER_CONTRACT_ARTIFACT_SHA256",
  "SENA_JOB_WORKER_CONTRACT_VERIFIED_AT",
  "SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED",
  "SENA_PERFORMANCE_BUDGET_CONFIRMED",
  "SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256",
  "SENA_PERFORMANCE_BUDGET_VERIFIED_AT",
  "SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION",
  "SENA_PERFORMANCE_BUDGET_MEASURED_ARTIFACT_SET_SHA256",
  "SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256",
  "SENA_PERFORMANCE_BUDGET_GIT_COMMIT",
  "SENA_PERFORMANCE_BUDGET_GIT_DIRTY",
  "SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256",
  "SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE",
  "SENA_PRODUCTION_RUNTIME_ENV_PACKET_REQUIRED",
  "SENA_PRODUCTION_RUNTIME_ENV_PACKET_CONFIRMED",
  "SENA_PRODUCTION_RUNTIME_ENV_PACKET_ARTIFACT_SHA256",
  "SENA_PRODUCTION_RUNTIME_ENV_PACKET_VERIFIED_AT",
  "SENA_PRODUCTION_RUNTIME_ENV_PACKET_STATUS",
  "SENA_PRODUCTION_RUNTIME_ENV_PACKET_READY_PROVIDER_GROUPS",
  "SENA_PRODUCTION_RUNTIME_ENV_PACKET_REQUIRED_PROVIDER_GROUPS",
  "SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_REQUIRED",
  "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_CONFIRMED",
  "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_SHA256",
  "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_VERIFIED_AT",
  "SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_CONFIRMED",
  "SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_SHA256",
  "SENA_ENTERPRISE_POSTGRES_PROBE_VERIFIED_AT",
  "SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_VALIDATION",
  "SENA_OBJECT_STORAGE_LIVE_PROBE_REQUIRED",
  "SENA_OBJECT_STORAGE_CONTRACT_CONFIRMED",
  "SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_SHA256",
  "SENA_OBJECT_STORAGE_CONTRACT_VERIFIED_AT",
  "SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_OBJECT_STORAGE_LIVE_PROBE_CONFIRMED",
  "SENA_OBJECT_STORAGE_PROBE_ARTIFACT_SHA256",
  "SENA_OBJECT_STORAGE_PROBE_VERIFIED_AT",
  "SENA_OBJECT_STORAGE_PROBE_ARTIFACT_VALIDATION",
  "SENA_CDN_LIVE_PROBE_REQUIRED",
  "SENA_CDN_CONTRACT_CONFIRMED",
  "SENA_CDN_CONTRACT_ARTIFACT_SHA256",
  "SENA_CDN_CONTRACT_VERIFIED_AT",
  "SENA_CDN_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_CDN_LIVE_PROBE_CONFIRMED",
  "SENA_CDN_PROBE_ARTIFACT_SHA256",
  "SENA_CDN_PROBE_VERIFIED_AT",
  "SENA_CDN_PROBE_ARTIFACT_VALIDATION",
  "SENA_JOB_QUEUE_LIVE_PROBE_REQUIRED",
  "SENA_JOB_QUEUE_CONTRACT_CONFIRMED",
  "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256",
  "SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT",
  "SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_JOB_QUEUE_LIVE_PROBE_CONFIRMED",
  "SENA_JOB_QUEUE_PROBE_ARTIFACT_SHA256",
  "SENA_JOB_QUEUE_PROBE_VERIFIED_AT",
  "SENA_JOB_QUEUE_PROBE_ARTIFACT_VALIDATION",
  "SENA_OBSERVABILITY_LIVE_PROBE_REQUIRED",
  "SENA_OBSERVABILITY_CONTRACT_CONFIRMED",
  "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256",
  "SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT",
  "SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION",
  "SENA_OBSERVABILITY_LIVE_PROBE_CONFIRMED",
  "SENA_OBSERVABILITY_PROBE_ARTIFACT_SHA256",
  "SENA_OBSERVABILITY_PROBE_VERIFIED_AT",
  "SENA_OBSERVABILITY_PROBE_ARTIFACT_VALIDATION",
  "SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED",
  "SENA_CONFERENCE_LOAD_REHEARSAL_ARTIFACT_SHA256",
  "SENA_CONFERENCE_LOAD_REHEARSAL_VERIFIED_AT",
  "SENA_CONFERENCE_LOAD_REHEARSAL_USERS",
  "SENA_CONFERENCE_LOAD_REHEARSAL_DURATION_SECONDS",
  "SENA_CONFERENCE_LOAD_REHEARSAL_P95_MS",
  "SENA_CONFERENCE_LOAD_REHEARSAL_ERROR_RATE_PERCENT",
  "SENA_PASSWORD_RESET_EXPOSE_TOKEN"
];
const goLiveIdpEvidenceArtifactDigest = "a".repeat(64);
const goLiveProvisioningEvidenceArtifactDigest = "b".repeat(64);

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function snapshotEnv() {
  return new Map(goLiveEnvNames.map((name) => [name, process.env[name]]));
}

function restoreEnv(snapshot: Map<string, string | undefined>) {
  for (const name of goLiveEnvNames) {
    const value = snapshot.get(name);
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

function configureGoLiveEnv(enterpriseDbDir: string) {
  vi.stubEnv("NODE_ENV", "production");
  process.env.SENA_ENTERPRISE_DB_DIR = enterpriseDbDir;
  process.env.SENA_APP_URL = "https://sena.example.test";
  process.env.SENA_MFA_ENCRYPTION_KEY = "sena-test-mfa-encryption-key";
  process.env.SENA_CSRF_SECRET = "sena-test-csrf-secret";
  process.env.SENA_SESSION_SECRET = "sena-test-session-secret";
  process.env.SENA_PROVISIONING_TOKEN = "sena_prov_2026_9f4c2a1d8e7b6c5a4f3e2d1c0b9a8765";
  process.env.SENA_PROVISIONING_TOKEN_SECRET_REF = "institution-vault/sena/provisioning-token";
  process.env.SENA_PROVISIONING_TOKEN_VERSION = "provisioning-token-rotation-2026-06";
  process.env.SENA_OPS_TOKEN = "sena-test-ops-token";
  process.env.SENA_AUDIT_RETENTION_DAYS = "3650";
  process.env.SENA_NOTIFICATION_WEBHOOK_URL = "https://notify.example.test/sena";
  process.env.SENA_NOTIFICATION_WEBHOOK_SECRET = "sena-notification-webhook-secret";
  process.env.SENA_NOTIFICATION_WEBHOOK_TIMEOUT_MS = "1000";
  process.env.SENA_EMAIL_WEBHOOK_URL = "https://mail.example.test/sena";
  process.env.SENA_EMAIL_WEBHOOK_SECRET = "sena-email-webhook-secret";
  process.env.SENA_EMAIL_WEBHOOK_TIMEOUT_MS = "1000";
  process.env.SENA_BACKUP_WEBHOOK_URL = "https://backup.example.test/sena";
  process.env.SENA_BACKUP_WEBHOOK_SECRET = "sena-backup-webhook-secret";
  process.env.SENA_BACKUP_WEBHOOK_TIMEOUT_MS = "1000";
  process.env.SENA_DATABASE_SYNC_WEBHOOK_URL = "https://database.example.test/sena/sync";
  process.env.SENA_DATABASE_SYNC_WEBHOOK_SECRET = "sena-database-sync-secret";
  process.env.SENA_DATABASE_SYNC_WEBHOOK_TIMEOUT_MS = "1000";
  process.env.SENA_OBJECT_STORAGE_WEBHOOK_URL = "https://objects.example.test/sena/uploads";
  process.env.SENA_OBJECT_STORAGE_WEBHOOK_SECRET = "sena-object-storage-webhook-secret";
  process.env.SENA_OBJECT_STORAGE_WEBHOOK_TIMEOUT_MS = "1000";
  process.env.SENA_COLLABORATION_PUBSUB_WEBHOOK_URL = "https://pubsub.example.test/sena/collaboration";
  process.env.SENA_COLLABORATION_PUBSUB_WEBHOOK_SECRET = "sena-collaboration-pubsub-secret";
  process.env.SENA_COLLABORATION_PUBSUB_WEBHOOK_TIMEOUT_MS = "1000";
  process.env.SENA_AUDIT_WEBHOOK_URL = "https://siem.example.test/sena/audit";
  process.env.SENA_AUDIT_WEBHOOK_SECRET = "sena-audit-webhook-secret";
  process.env.SENA_AUDIT_WEBHOOK_TIMEOUT_MS = "1000";
  process.env.SENA_ALERTING_OWNER = "Institution platform rotation";
  process.env.SENA_ALERTING_CHANNEL = "deployment-monitor";
  process.env.SENA_ALERTING_RUNBOOK_URL = "https://ops.example.test/sena-runbook";
  process.env.SENA_ALERT_WEBHOOK_URL = "https://alerts.example.test/sena/ops";
  process.env.SENA_ALERT_WEBHOOK_SECRET = "sena-alert-webhook-secret";
  process.env.SENA_ALERT_WEBHOOK_TIMEOUT_MS = "1000";
  process.env.SENA_OBSERVABILITY_PROVIDER = "webhook";
  process.env.SENA_OBSERVABILITY_EXPORTER_URL = "https://observe.example.test/sena";
  process.env.SENA_OBSERVABILITY_EXPORTER_SECRET = "sena-observability-webhook-secret";
  process.env.SENA_OBSERVABILITY_DASHBOARD_URL = "https://observe.example.test/sena/dashboard";
  process.env.SENA_OBSERVABILITY_RUNBOOK_URL = "https://ops.example.test/sena-observability-runbook";
  process.env.SENA_OBSERVABILITY_OWNER = "Institution platform rotation";
  process.env.SENA_OBSERVABILITY_SLO_P95_MS = "2000";
  process.env.SENA_OBSERVABILITY_SLO_ERROR_RATE_PERCENT = "5";
  process.env.SENA_SSO_INSTITUTION_CLIENT_ID = "sena-institution-client";
  process.env.SENA_SSO_INSTITUTION_TENANT_ID = "institution-tenant-2026";
  process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET = "sena_oidc_2026_7c6b5a49382716f0e1d2c3b4a5968778";
  process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_REF = "institution-vault/sena/sso-client-secret";
  process.env.SENA_SSO_INSTITUTION_CLIENT_SECRET_VERSION = "sso-client-secret-rotation-2026-06";
  process.env.SENA_SSO_INSTITUTION_ISSUER = "https://idp.institution.edu";
  process.env.SENA_SSO_INSTITUTION_AUTHORIZATION_URL = "https://idp.institution.edu/authorize";
  process.env.SENA_SSO_INSTITUTION_TOKEN_URL = "https://idp.institution.edu/token";
  process.env.SENA_SSO_INSTITUTION_USERINFO_URL = "https://idp.institution.edu/userinfo";
  process.env.SENA_SSO_INSTITUTION_JWKS_URL = "https://idp.institution.edu/jwks";
  process.env.SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS = "ops.institution.edu";
  process.env.SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS = "180";
  process.env.SENA_IDENTITY_LIFECYCLE_OWNER_MODE = "scim";
  process.env.SENA_PLATFORM_SAAS_OPERATING_MODEL_APPROVED = "1";
  process.env.SENA_ENTERPRISE_DB_ADAPTER = "postgres";
  process.env.SENA_ENTERPRISE_STATE_STORE = "postgres";
  process.env.SENA_ENTERPRISE_POSTGRES_URL = "postgres://sena_user:super-secret@example.neon.tech/senadb?sslmode=require";
  process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_CONFIRMED = "1";
  process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_ARTIFACT_SHA256 = "8".repeat(64);
  process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_TARGET_HOST_SHA256 = sha256Text("www.sena.hk");
  process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_DEPLOYMENT_URL_SHA256 = "7".repeat(64);
  process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_HTTP_STATUS = "200";
  process.env.SENA_VERCEL_PRODUCTION_PREFLIGHT_RUNTIME_HEADER = "enterprise-neon";
  process.env.SENA_CDN_ENABLED = "1";
  process.env.SENA_CDN_PROVIDER = "institution-cdn";
  process.env.SENA_CDN_URL = "https://cdn.example.test/sena";
  process.env.SENA_CDN_COMPRESSION_CONFIRMED = "1";
  process.env.SENA_CDN_STATIC_ASSET_CACHE_SECONDS = "31536000";
  process.env.SENA_OBJECT_STORAGE_ADAPTER = "s3";
  process.env.SENA_OBJECT_STORAGE_ENDPOINT = "https://objects.example.test";
  process.env.SENA_OBJECT_STORAGE_BUCKET = "sena-private-bucket";
  process.env.SENA_OBJECT_STORAGE_REGION = "us-east-1";
  process.env.SENA_OBJECT_STORAGE_ACCESS_KEY_ID = "sena-access-key";
  process.env.SENA_OBJECT_STORAGE_SECRET_ACCESS_KEY = "sena-object-storage-secret";
  process.env.SENA_OBJECT_STORAGE_PREFIX = "sena/uploads";
  process.env.SENA_JOB_QUEUE_ADAPTER = "managed";
  process.env.SENA_JOB_QUEUE_URL = "https://jobs.example.test/sena";
  process.env.SENA_JOB_QUEUE_SECRET = "sena-managed-job-queue-secret";
  process.env.SENA_JOB_WORKER_RUNTIME = "institution-managed-worker";
  process.env.SENA_JOB_WORKER_CALLBACK_URL = "https://sena.example.test/api/sena/ops/jobs";
  process.env.SENA_JOB_WORKER_RUNBOOK_URL = "https://ops.example.test/sena-job-worker";
  process.env.SENA_JOB_WORKER_OWNER = "Institution platform rotation";
  process.env.SENA_JOB_WORKER_HEARTBEAT_CONFIRMED = "1";
  process.env.SENA_JOB_WORKER_HEARTBEAT_SHA256 = "c".repeat(64);
  process.env.SENA_JOB_WORKER_HEARTBEAT_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_JOB_WORKER_CONTRACT_CONFIRMED = "1";
  process.env.SENA_JOB_WORKER_CONTRACT_ARTIFACT_SHA256 = "7".repeat(64);
  process.env.SENA_JOB_WORKER_CONTRACT_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_JOB_WORKER_CONTRACT_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED = "1";
  process.env.SENA_PERFORMANCE_BUDGET_CONFIRMED = "1";
  process.env.SENA_PERFORMANCE_BUDGET_ARTIFACT_SHA256 = "3".repeat(64);
  process.env.SENA_PERFORMANCE_BUDGET_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_PERFORMANCE_BUDGET_SCHEMA_VERSION = "sena-enterprise-production-performance-budget/v2";
  process.env.SENA_PERFORMANCE_BUDGET_MEASURED_ARTIFACT_SET_SHA256 = "9".repeat(64);
  process.env.SENA_PERFORMANCE_BUDGET_NEXT_BUILD_ID_SHA256 = "4".repeat(64);
  process.env.SENA_PERFORMANCE_BUDGET_GIT_COMMIT = "a".repeat(40);
  process.env.SENA_PERFORMANCE_BUDGET_GIT_DIRTY = "false";
  process.env.SENA_PERFORMANCE_BUDGET_PACKAGE_LOCK_SHA256 = "5".repeat(64);
  process.env.SENA_PERFORMANCE_BUDGET_SOURCE_CUSTODY_MODE = "git-clean-worktree";
  process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_REQUIRED = "1";
  process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_CONFIRMED = "1";
  process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_ARTIFACT_SHA256 = "6".repeat(64);
  process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_STATUS = "ready";
  process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_READY_PROVIDER_GROUPS = "8";
  process.env.SENA_PRODUCTION_RUNTIME_ENV_PACKET_REQUIRED_PROVIDER_GROUPS = "8";
  process.env.SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_CONFIRMED = "1";
  process.env.SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_CONFIRMED = "1";
  process.env.SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_SHA256 = "0".repeat(64);
  process.env.SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_ENTERPRISE_POSTGRES_SCHEMA_CONTRACT_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_SHA256 = "d".repeat(64);
  process.env.SENA_ENTERPRISE_POSTGRES_PROBE_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_ENTERPRISE_POSTGRES_PROBE_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_OBJECT_STORAGE_CONTRACT_CONFIRMED = "1";
  process.env.SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_SHA256 = "6".repeat(64);
  process.env.SENA_OBJECT_STORAGE_CONTRACT_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_OBJECT_STORAGE_CONTRACT_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_OBJECT_STORAGE_LIVE_PROBE_CONFIRMED = "1";
  process.env.SENA_OBJECT_STORAGE_PROBE_ARTIFACT_SHA256 = "e".repeat(64);
  process.env.SENA_OBJECT_STORAGE_PROBE_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_OBJECT_STORAGE_PROBE_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_CDN_CONTRACT_CONFIRMED = "1";
  process.env.SENA_CDN_CONTRACT_ARTIFACT_SHA256 = "4".repeat(64);
  process.env.SENA_CDN_CONTRACT_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_CDN_CONTRACT_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_CDN_LIVE_PROBE_CONFIRMED = "1";
  process.env.SENA_CDN_PROBE_ARTIFACT_SHA256 = "f".repeat(64);
  process.env.SENA_CDN_PROBE_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_CDN_PROBE_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_JOB_QUEUE_CONTRACT_CONFIRMED = "1";
  process.env.SENA_JOB_QUEUE_CONTRACT_ARTIFACT_SHA256 = "8".repeat(64);
  process.env.SENA_JOB_QUEUE_CONTRACT_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_JOB_QUEUE_CONTRACT_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_JOB_QUEUE_LIVE_PROBE_CONFIRMED = "1";
  process.env.SENA_JOB_QUEUE_PROBE_ARTIFACT_SHA256 = "1".repeat(64);
  process.env.SENA_JOB_QUEUE_PROBE_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_JOB_QUEUE_PROBE_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_OBSERVABILITY_CONTRACT_CONFIRMED = "1";
  process.env.SENA_OBSERVABILITY_CONTRACT_ARTIFACT_SHA256 = "5".repeat(64);
  process.env.SENA_OBSERVABILITY_CONTRACT_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_OBSERVABILITY_CONTRACT_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_OBSERVABILITY_LIVE_PROBE_CONFIRMED = "1";
  process.env.SENA_OBSERVABILITY_PROBE_ARTIFACT_SHA256 = "2".repeat(64);
  process.env.SENA_OBSERVABILITY_PROBE_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_OBSERVABILITY_PROBE_ARTIFACT_VALIDATION = "pass";
  process.env.SENA_CONFERENCE_LOAD_REHEARSAL_CONFIRMED = "1";
  process.env.SENA_CONFERENCE_LOAD_REHEARSAL_ARTIFACT_SHA256 = "9".repeat(64);
  process.env.SENA_CONFERENCE_LOAD_REHEARSAL_VERIFIED_AT = new Date().toISOString();
  process.env.SENA_CONFERENCE_LOAD_REHEARSAL_USERS = "50";
  process.env.SENA_CONFERENCE_LOAD_REHEARSAL_DURATION_SECONDS = "1800";
  process.env.SENA_CONFERENCE_LOAD_REHEARSAL_P95_MS = "750";
  process.env.SENA_CONFERENCE_LOAD_REHEARSAL_ERROR_RATE_PERCENT = "0";
  delete process.env.SENA_PASSWORD_RESET_EXPOSE_TOKEN;
}

function projectSnapshot() {
  const imported = importSenaJsonContract(lessonStudySenaContract);
  const model = buildSenaModel(imported.dataset);
  return buildSenaProjectSnapshot(model, {
    title: "Go-live Enterprise Snapshot",
    generatedAt: "2026-06-14T00:00:00.000Z",
    sourceDataset: imported.dataset,
    humanReview: {
      status: "human-reviewed",
      reviewer: "Institution reviewer",
      interpretation: "Go-live fixture interpretation.",
      limitations: "Fixture only.",
      nextActions: "Keep review evidence attached."
    },
    codingReliability: {
      status: "documented",
      reviewer: "Institution reviewer",
      codingScheme: "Fixture codebook",
      unitOfCoding: "coded_segments",
      coderCount: 2,
      agreementMetric: "Cohen kappa; Krippendorff alpha",
      agreementValue: "kappa=1; alpha=1",
      adjudicationNotes: "No disagreements in fixture.",
      limitations: "Fixture only."
    }
  });
}

const enterpriseGoLiveTestTimeoutMs = 180_000;

describe("SENA enterprise go-live production release", () => {
  it("reaches ready after SaaS approval, platform acceptance, native adapter certification, and verifier evidence", async () => {
    const envSnapshot = snapshotEnv();
    const enterpriseDbDir = mkdtempSync(path.join(tmpdir(), "sena-enterprise-go-live-"));
    const pg = new RouteMemoryPostgres();
    vi.resetModules();
    configureGoLiveEnv(enterpriseDbDir);
    vi.doMock("pg", () => ({
      Pool: class FakePool {
        async query(sql: string, values: unknown[] = []) {
          return pg.query(sql, values);
        }

        async end() {
          return undefined;
        }
      }
    }));

    try {
      const enterprise = await import("../enterprise");
      const reliabilityRuntime = await import("../enterprise/reliability-runs");
      const validationRuntime = await import("../enterprise/validation-runs");
      const expertReviewRuntime = await import("../enterprise/expert-review");
      const backupRuntime = await import("../enterprise/ops-backup");
      const backupRestoreRuntime = await import("../enterprise/ops-backup-restore");
      const registered = await enterprise.registerEnterpriseUserAsync({
        name: "Institution Platform Owner",
        email: "platform-owner@example.edu",
        password: "sena-secure-123",
        organization: "Institution Lab",
        plan: "enterprise"
      });
      const teamId = registered.context.teams[0].id;

      await expect(enterprise.startEnterprisePostCutoverObservationWithPostgresEvidence(registered.context, {
        teamId,
        environment: "pilot-production",
        releaseVersion: "2026.06.14-before-release-gate"
      })).rejects.toThrow(/cannot start/i);

      await enterprise.preflightEnterpriseSsoProvidersAsync({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });

      const snapshot = projectSnapshot();
      const project = await enterprise.createEnterpriseProjectAsync(registered.context, {
        teamId,
        title: snapshot.title,
        snapshot
      });

      const reliabilityAnnotations = parseCoderAnnotationsFromRows([
        { coder_id: "c1", item_id: "u1", code_id: "Evidence", value: "1" },
        { coder_id: "c2", item_id: "u1", code_id: "Evidence", value: "1" },
        { coder_id: "c1", item_id: "u2", code_id: "Explanation", value: "1" },
        { coder_id: "c2", item_id: "u2", code_id: "Explanation", value: "1" }
      ]);
      const reliability = buildSenaReliabilityDashboard(reliabilityAnnotations.annotations);
      const reliabilityRun = await reliabilityRuntime.createEnterpriseReliabilityRunWithPostgresMirrorAsync(registered.context, {
        teamId,
        projectId: project.id,
        reviewer: "Institution reviewer",
        fileCount: 1,
        annotationCount: reliabilityAnnotations.annotations.length,
        annotations: reliabilityAnnotations.annotations,
        skippedCells: reliabilityAnnotations.skippedCells,
        inputFiles: [{ name: "coder-ratings.csv", size: 128, sha256: "1".repeat(64) }],
        dashboard: reliability,
        reviewPatch: reliabilityDashboardToReview(reliability, "Institution reviewer")
      });
      await reliabilityRuntime.reviewEnterpriseReliabilityRunWithPostgresMirrorAsync(registered.context, reliabilityRun.id, {
        status: "approved",
        notes: "No queued disagreements remain."
      });

      const comparison = buildSenaGroupComparison({
        dataset: lessonStudySenaContract,
        groupField: "role",
        groupA: "Lead teacher",
        groupB: "Curriculum designer",
        iterations: 100
      });
      const validationRun = await validationRuntime.createEnterpriseValidationRunWithPostgresMirrorAsync(registered.context, {
        teamId,
        projectId: project.id,
        preregistrationNote: "Go-live validation fixture preregistration.",
        methodNote: "Permutation comparison fixture for go-live evidence.",
        result: comparison,
        parityEvidence: {
          expertReviewRequired: false,
          studySpecificInferenceReference: "prereg:go-live-production-release-v1"
        }
      });
      await validationRuntime.reviewEnterpriseValidationRunWithPostgresMirrorAsync(registered.context, validationRun.id, {
        status: "approved",
        notes: "Approved as go-live validation support."
      });
      await expertReviewRuntime.createEnterpriseExpertReviewWithPostgresMirrorAsync(registered.context, {
        projectId: project.id,
        target: { kind: "validation-run", id: validationRun.id, label: "Go-live validation" },
        reviewerName: "Domain Expert",
        reviewerRole: "Institution reviewer",
        expertiseArea: "Lesson study and SENA interpretation",
        status: "approved",
        claimScope: "claim-ready-with-limits",
        ratings: { dataAdequacy: 4, methodFit: 4, interpretationValidity: 4 },
        strengths: "Go-live fixture evidence is auditable.",
        concerns: "Fixture only.",
        recommendations: "Keep production release claims scoped to approved evidence.",
        limitations: "Fixture only."
      });

      const backup = await backupRuntime.createEnterpriseBackupWithPostgresEvidence(registered.context, { teamId });
      await backupRuntime.verifyEnterpriseBackupWithPostgresEvidence(registered.context, backup);
      await backupRestoreRuntime.restoreEnterpriseBackupWithPostgresEvidence(registered.context, backup, { dryRun: true });

      const platformDecisionIds = [
        "native-managed-database",
        "native-managed-object-storage",
        "native-collaboration-pubsub",
        "institution-idp-approval",
        "institution-provisioning-owner",
        "deployment-alerting-escalation",
        "native-audit-siem-adapter",
        "institution-email-provider",
        "native-managed-backup-storage",
        "full-saas-backend-operations"
      ];
      const initialIdentityRequestPolicyHash = (await enterprise.getEnterpriseIdentityProductionEvidenceWithPostgresEvidence({ teamId })).platformRequestPacket.evidence
        .find((entry) => entry.startsWith("requestPacketPolicyHash="))
        ?.slice("requestPacketPolicyHash=".length);
      expect(initialIdentityRequestPolicyHash).toMatch(/^[a-f0-9]{64}$/);

      for (const decisionId of platformDecisionIds) {
        await enterprise.reviewEnterprisePlatformDecisionWithPostgresState(registered.context, {
          teamId,
          decisionId,
          status: "accepted",
          acceptedBridge: true,
          ownerName: decisionId === "institution-idp-approval"
            ? "Ada Chen, Institution IAM Owner"
            : decisionId === "institution-provisioning-owner"
              ? "Maya Lee, Institution SCIM Owner"
              : "Institution Platform Owner",
          ownerRole: decisionId === "institution-idp-approval"
            ? "Institution identity platform owner"
            : decisionId === "institution-provisioning-owner"
              ? "Institution provisioning platform owner"
              : "Platform operations",
          environment: "pilot-production",
          evidenceUrl: `https://ops.institution.edu/sena/${decisionId}`,
          notes: [
            "Institution platform owner accepts the bridge for pilot production.",
            "Managed database, object storage, pub/sub, email, alerting, audit, backup, IdP, SCIM, and SaaS operations ownership are approved.",
            "IdP tenant callback redirect URI approval, SSO provider secret custody, secret-store reference, and SSO secret rotation are recorded.",
            "SCIM or IdP provisioning owner accepts bearer token rotation, lifecycle guardrails, suspension handling, and last-active-manager protection.",
            "Alert owner, channel, runbook, backup restore drill, retention, replay, RPO/RTO, and SIEM delivery ownership are documented."
          ].join(" "),
          productionEvidenceIds: decisionId === "institution-idp-approval"
            ? ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"]
            : decisionId === "institution-provisioning-owner"
              ? ["provisioning-owner", "scim-or-idp-ownership", "bearer-token-rotation", "lifecycle-guardrails"]
              : undefined,
          productionEvidenceArtifactDigest: decisionId === "institution-idp-approval"
            ? goLiveIdpEvidenceArtifactDigest
            : decisionId === "institution-provisioning-owner"
              ? goLiveProvisioningEvidenceArtifactDigest
              : undefined,
          productionEvidenceVerifiedAt: decisionId === "institution-idp-approval" || decisionId === "institution-provisioning-owner"
            ? new Date().toISOString()
            : undefined,
          requestPacketPolicyHash: decisionId === "institution-idp-approval" || decisionId === "institution-provisioning-owner"
            ? initialIdentityRequestPolicyHash
            : undefined
        });
      }

      const preReleaseDeployment = await enterprise.getEnterpriseOrganizationDeploymentPackageWithPostgresEvidence();
      expect(preReleaseDeployment.platformDecisionRegister.summary.productionBlocking).toBe(0);
      expect(preReleaseDeployment.nativeAdapterCertification.summary.productionBlocking).toBe(0);
      expect(preReleaseDeployment.saasOperationsReadiness.summary.blockers).toEqual(expect.arrayContaining([
        "approved-release-gate-required",
        "release-gate-verification-passed-required"
      ]));

      const verifierOutput = [
        "> npm run sena:pilot:verify",
        "production build passed",
        "visual guards passed",
        "browser interaction smoke passed",
        "enterprise go-live evidence captured"
      ].join("\n");
      const otherRegistered = await enterprise.registerEnterpriseUserAsync({
        name: "Other Institution Release Owner",
        email: "other-release-owner@example.edu",
        password: "sena-secure-123",
        organization: "Other Institution Lab",
        plan: "enterprise"
      });
      const otherTeamIdentityEvidence = await enterprise.getEnterpriseIdentityProductionEvidenceWithPostgresEvidence({
        teamId: otherRegistered.context.teams[0].id
      });
      const otherTeamDeployment = await enterprise.getEnterpriseOrganizationDeploymentPackageWithPostgresEvidence({
        teamId: otherRegistered.context.teams[0].id
      });
      const otherTeamPlatformDecisionRegister = await enterprise.getEnterprisePlatformDecisionRegisterWithPostgresState({
        teamId: otherRegistered.context.teams[0].id
      });
      const otherTeamNativeAdapterCertification = otherTeamDeployment.nativeAdapterCertification;
      const otherTeamSaasOperationsReadiness = otherTeamDeployment.saasOperationsReadiness;
      expect(otherTeamPlatformDecisionRegister?.schemaVersion).toBe("sena-enterprise-platform-decision-register/v1");
      expect(otherTeamPlatformDecisionRegister?.summary.productionBlocking).toBeGreaterThanOrEqual(2);
      expect(otherTeamPlatformDecisionRegister?.summary.acceptedBridge).toBe(0);
      expect(otherTeamPlatformDecisionRegister?.decisions.find((decision) => decision.id === "institution-idp-approval")?.acceptedBridge).toBe(false);
      expect(otherTeamPlatformDecisionRegister?.decisions.find((decision) => decision.id === "institution-idp-approval")?.ownerEvidence.join(" ")).not.toContain("evidenceUrlHash=");
      expect(otherTeamNativeAdapterCertification?.summary.productionBlocking).toBeGreaterThanOrEqual(2);
      expect(otherTeamNativeAdapterCertification?.summary.acceptedBridge).toBe(0);
      expect(otherTeamNativeAdapterCertification?.adapters.find((adapter) => adapter.decisionId === "institution-idp-approval")?.acceptedBridge).toBe(false);
      expect(otherTeamNativeAdapterCertification?.adapters.find((adapter) => adapter.decisionId === "institution-idp-approval")?.ownerEvidence.join(" ")).not.toContain("evidenceUrlHash=");
      expect(otherTeamSaasOperationsReadiness?.status).toBe("blocked");
      expect(otherTeamSaasOperationsReadiness?.approval.fullSaasDecisionAccepted).toBe(false);
      expect(otherTeamSaasOperationsReadiness?.summary.acceptedBridge).toBe(0);
      expect(otherTeamSaasOperationsReadiness?.summary.blockers).toEqual(expect.arrayContaining([
        "full-saas-platform-decision-acceptance-required",
        "native-adapter-certification-production-blockers",
        "release-gate-identity-production-evidence-required"
      ]));
      expect(otherTeamIdentityEvidence.status).toBe("review");
      expect(otherTeamIdentityEvidence.summary.missing).toBeGreaterThanOrEqual(7);
      expect(otherTeamIdentityEvidence.evidenceManifest.missingEvidenceIds).toEqual(expect.arrayContaining([
        "idp-tenant-approval",
        "idp-callback-approval",
        "sso-secret-rotation",
        "provisioning-owner",
        "scim-or-idp-ownership",
        "bearer-token-rotation",
        "lifecycle-guardrails"
      ]));
      expect(otherTeamIdentityEvidence.acceptanceReceipts).toEqual([]);
      expect(otherTeamIdentityEvidence.releaseGate.approvalBlocked).toBe(true);
      expect(otherTeamIdentityEvidence.releaseGate.productionBlockingDecisionIds).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
      await expect(enterprise.createEnterpriseReleaseGateReviewWithPostgresEvidence(otherRegistered.context, {
        teamId: otherRegistered.context.teams[0].id,
        environment: "pilot-production",
        releaseVersion: "2026.06.14-other-team-go-live",
        decision: "approved",
        approverName: "Other institution release owner",
        approverRole: "Platform operations",
        notes: "Attempting to approve with another team's institution IdP and SCIM evidence.",
        verificationCommand: "npm run sena:pilot:verify",
        verificationEvidence: {
          status: "passed",
          summary: verifierOutput,
          outputSha256: createHash("sha256").update(verifierOutput).digest("hex")
        }
      })).rejects.toThrow(/team-scoped platform decisions/);

      await enterprise.preflightEnterpriseSsoProvidersAsync({
        providers: ["institution"],
        baseUrl: "https://sena.example.test"
      });
      const refreshedIdentityRequestPolicyHash = (await enterprise.getEnterpriseIdentityProductionEvidenceWithPostgresEvidence({ teamId })).platformRequestPacket.evidence
        .find((entry) => entry.startsWith("requestPacketPolicyHash="))
        ?.slice("requestPacketPolicyHash=".length);
      expect(refreshedIdentityRequestPolicyHash).toMatch(/^[a-f0-9]{64}$/);
      await enterprise.reviewEnterprisePlatformDecisionWithPostgresState(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Ada Chen, Institution IAM Owner",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/institution-idp-approval-refreshed-before-release-gate",
        notes: "Refreshing institution IdP evidence immediately before release-gate approval so the technical binding matches the latest SSO preflight.",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: goLiveIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: new Date().toISOString(),
        requestPacketPolicyHash: refreshedIdentityRequestPolicyHash
      });
      const releaseGate = await enterprise.createEnterpriseReleaseGateReviewWithPostgresEvidence(registered.context, {
        teamId,
        environment: "pilot-production",
        releaseVersion: "2026.06.14-go-live",
        decision: "approved",
        approverName: "Institution release owner",
        approverRole: "Platform operations",
        notes: "Approved after SaaS operating model approval, accepted platform decisions, native adapter certification, and verifier output review.",
        verificationCommand: "npm run sena:pilot:verify",
        verificationEvidence: {
          status: "passed",
          summary: verifierOutput,
          outputSha256: createHash("sha256").update(verifierOutput).digest("hex")
        }
      });

      expect(releaseGate.decision).toBe("approved");
      expect(releaseGate.verificationEvidence.outputSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(releaseGate.platformDecisionSnapshot.productionBlocking).toBe(0);
      expect(releaseGate.platformDecisionSnapshot.productionBlockingDecisionIds).toEqual([]);
      expect(releaseGate.platformDecisionSnapshot.missingProductionEvidence).toEqual([]);
      const releaseGateRequestPolicyHash = releaseGate.identityProductionSnapshot.platformRequestPacket.evidence
        .find((entry) => entry.startsWith("requestPacketPolicyHash="))
        ?.slice("requestPacketPolicyHash=".length);
      expect(releaseGateRequestPolicyHash).toMatch(/^[a-f0-9]{64}$/);
      const releaseGateIdentitySnapshot = releaseGate.identityProductionSnapshot as typeof releaseGate.identityProductionSnapshot & {
        dossierDigest?: string;
        evidenceBindingDigest?: string;
        receiptArchiveManifest?: {
          archiveManifestDigest?: string;
          summary: {
            readyForArchive: number;
            reviewArchives: number;
            missingReceipts: number;
          };
        };
      };
      expect(releaseGateIdentitySnapshot.dossierDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(releaseGateIdentitySnapshot.evidenceBindingDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(releaseGateIdentitySnapshot.receiptArchiveManifest).toEqual(expect.objectContaining({
        archiveManifestDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        summary: expect.objectContaining({
          readyForArchive: 2,
          reviewArchives: 0,
          missingReceipts: 0
        })
      }));
      const releaseGateAudit = await enterprise.listEnterpriseAuditLogAsync(registered.context, {
        teamId,
        event: "ops.release_gate.review"
      }) as Awaited<ReturnType<typeof enterprise.listEnterpriseAuditLogAsync>> & {
        events: Array<Awaited<ReturnType<typeof enterprise.listEnterpriseAuditLogAsync>>["events"][number] & {
          detail?: {
            identityRequestPacketPolicyHash?: string;
            identityRequestPacketPolicyBinding?: string;
            identityEvidenceUrlHostBinding?: string;
            identityEvidenceAllowedHostConfig?: string;
            identityEvidenceAllowedHosts?: number;
            identityEvidenceInvalidAllowedHosts?: number;
            identityProductionEvidenceDigest?: string;
            identityEvidenceBindingDigest?: string;
            identityReceiptArchiveManifestDigest?: string;
            identityReceiptArchiveReadyForArchive?: number;
            identityReceiptArchiveReview?: number;
            identityReceiptArchiveMissingReceipts?: number;
            identityReceiptArchiveMissingInputs?: string;
          };
        }>;
      };
      expect(releaseGateAudit.events[0]?.detail).toEqual(expect.objectContaining({
        identityRequestPacketPolicyHash: releaseGateRequestPolicyHash,
        identityRequestPacketPolicyBinding: "idp:current|provisioning:current",
        identityEvidenceUrlHostBinding: "ready",
        identityEvidenceAllowedHostConfig: "configured",
        identityEvidenceAllowedHosts: 1,
        identityEvidenceInvalidAllowedHosts: 0,
        identityProductionEvidenceDigest: releaseGateIdentitySnapshot.dossierDigest,
        identityEvidenceBindingDigest: releaseGateIdentitySnapshot.evidenceBindingDigest,
        identityReceiptArchiveManifestDigest: releaseGateIdentitySnapshot.receiptArchiveManifest?.archiveManifestDigest,
        identityReceiptArchiveReadyForArchive: 2,
        identityReceiptArchiveReview: 0,
        identityReceiptArchiveMissingReceipts: 0,
        identityReceiptArchiveMissingInputs: "none"
      }));

      const deployment = await enterprise.getEnterpriseOrganizationDeploymentPackageWithPostgresEvidence();
      expect(deployment.releaseGate.evidence).toEqual(expect.arrayContaining([
        `latestIdentityRequestPacketPolicyHash=${releaseGateRequestPolicyHash}`,
        "latestIdentityRequestPacketPolicyBinding=idp:current|provisioning:current",
        `latestIdentityProductionEvidenceDigest=${releaseGateIdentitySnapshot.dossierDigest}`,
        `latestIdentityEvidenceBindingDigest=${releaseGateIdentitySnapshot.evidenceBindingDigest}`,
        `latestIdentityReceiptArchiveManifestDigest=${releaseGateIdentitySnapshot.receiptArchiveManifest?.archiveManifestDigest}`,
        "latestIdentityReceiptArchiveReadyForArchive=2",
        "latestIdentityReceiptArchiveReview=0",
        "latestIdentityReceiptArchiveMissingReceipts=0",
        "latestIdentityReceiptArchiveMissingInputs=none"
      ]));
      expect(deployment.saasOperationsReadiness.status).toBe("ready");
      expect(deployment.saasOperationsReadiness.approval.envConfigured).toBe(true);
      expect(deployment.saasOperationsReadiness.approval.fullSaasDecisionAccepted).toBe(true);
      expect(deployment.saasOperationsReadiness.approval.latestReleaseGateStatus).toBe("approved");
      expect(deployment.saasOperationsReadiness.approval.latestReleaseGateVerificationStatus).toBe("passed");
      expect(deployment.saasOperationsReadiness.summary.blockers).toEqual([]);
      expect(deployment.nativeAdapterCertification.summary.productionBlocking).toBe(0);
      expect(deployment.status).toBe("ready");
      expect(deployment.summary.productionEvidenceStatus).toBe("ready");
      expect(deployment.productionEvidenceManifest.summary.confirmed).toBe(14);
      expect(deployment.productionEvidenceManifest.summary.performanceBudgetConfirmed).toBe(true);
      expect(deployment.productionEvidenceManifest.summary.conferenceLoadConfirmed).toBe(true);

      const goLive = await enterprise.getEnterpriseGoLiveRehearsalWithPostgresEvidence();
      expect(goLive.status).toBe("ready");
      expect(goLive.summary.blockers).toEqual([]);
      expect(goLive.releaseGateDraft.decision).toBe("approved");
      expect(goLive.releaseGateDraft.verificationEvidence.status).toBe("passed");
      expect(goLive.rollbackDrill.status).toBe("ready");
      expect(goLive.rollbackDrill.summary.releaseGateReady).toBe(true);
      expect(goLive.rollbackDrill.summary.blockers).toEqual([]);
      expect(goLive.postCutoverMonitor.status).toBe("blocked");
      expect(goLive.postCutoverMonitor.summary.releaseGateReady).toBe(true);
      expect(goLive.postCutoverMonitor.summary.rollbackReady).toBe(true);
      expect(goLive.postCutoverMonitor.summary.blockers).toEqual(expect.arrayContaining([
        "post-cutover-observation-required"
      ]));
      expect(goLive.postCutoverMonitor.checks.find((check) => check.id === "post-cutover-observation")).toEqual(expect.objectContaining({
        status: "blocked",
        evidence: expect.arrayContaining([
          "observationStatus=missing"
        ])
      }));
      const goLiveRequestPolicyHash = goLive.identityProductionHandoff.platformRequestPacket.evidence
        .find((entry) => entry.startsWith("requestPacketPolicyHash="))
        ?.slice("requestPacketPolicyHash=".length);
      expect(goLiveRequestPolicyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(goLive.evidence).toEqual(expect.arrayContaining([
        `identityProductionRequestPacketPolicyHash=${goLiveRequestPolicyHash}`,
        "identityProductionRequestPacketPolicyBinding=idp:current|provisioning:current",
        "identityProductionReceiptReviewRequests=0",
        `identityProductionHandoffDigest=${goLive.identityProductionHandoff.dossierDigest}`,
        `identityProductionReceiptArchiveManifestDigest=${goLive.identityProductionHandoff.receiptArchiveManifest.archiveManifestDigest}`,
        "identityProductionReceiptArchiveReadyForArchive=2",
        "identityProductionReceiptArchiveMissingInputs=none",
        "identityProductionEvidenceUrlAllowedHosts=1",
        "identityProductionHandoffHostBinding=ready",
        "identityProductionHandoffAllowedHostConfig=configured",
        "identityProductionHandoffAllowedHosts=1",
        "identityProductionHandoffInvalidAllowedHosts=0"
      ]));
      await expect(enterprise.createEnterpriseGoLiveAttestationWithPostgresEvidence(registered.context, {
        teamId,
        environment: "pilot-production",
        releaseVersion: "2026.06.14-go-live-attestation-before-observation",
        decision: "approved",
        attesterName: "Institution platform owner",
        attesterRole: "Platform operations",
        notes: "Attempting to approve go-live before the post-cutover observation window has completed.",
        checklist: {
          rehearsalReviewed: true,
          releaseGateDraftReviewed: true,
          verificationEvidenceReviewed: true,
          rollbackOwnerConfirmed: true,
          platformOwnerDecisionReviewed: true
        }
      })).rejects.toThrow(/post-cutover monitor/i);

      const observationStartedAt = new Date();
      vi.useFakeTimers();
      vi.setSystemTime(observationStartedAt);
      const observation = await enterprise.startEnterprisePostCutoverObservationWithPostgresEvidence(registered.context, {
        teamId,
        environment: "pilot-production",
        releaseVersion: "2026.06.14-go-live"
      });
      expect(observation.schemaVersion).toBe("sena-enterprise-post-cutover-observation/v1");
      expect(observation.status).toBe("active");
      expect(observation.startedAt).toBe(observationStartedAt.toISOString());
      expect(observation.requiredUntil).toBe(new Date(observationStartedAt.getTime() + 60 * 60 * 1000).toISOString());
      expect(observation.samples).toHaveLength(1);
      expect(observation.samples[0]).toEqual(expect.objectContaining({
        opsStatus: "ready",
        alertsStatus: "clear",
        criticalAlerts: 0,
        evidence: expect.arrayContaining([
          "alertOwner=configured",
          "alertRunbook=configured"
        ])
      }));
      await expect(enterprise.completeEnterprisePostCutoverObservationWithPostgresEvidence(registered.context, {
        teamId,
        observationId: observation.id,
        acknowledgedWarningAlertIds: []
      })).rejects.toThrow(/60-minute/i);

      for (let minute = 6; minute <= 60; minute += 6) {
        vi.setSystemTime(new Date(observationStartedAt.getTime() + minute * 60 * 1000));
        await enterprise.recordEnterprisePostCutoverObservationSampleWithPostgresEvidence(registered.context, {
          teamId,
          observationId: observation.id
        });
      }

      const completedObservation = await enterprise.completeEnterprisePostCutoverObservationWithPostgresEvidence(registered.context, {
        teamId,
        observationId: observation.id,
        acknowledgedWarningAlertIds: []
      });
      expect(completedObservation.status).toBe("ready");
      expect(completedObservation.completedAt).toBe(new Date(observationStartedAt.getTime() + 60 * 60 * 1000).toISOString());
      expect(completedObservation.samples.length).toBeGreaterThanOrEqual(11);
      const listedObservations = await enterprise.listEnterprisePostCutoverObservationsWithPostgresEvidence(registered.context, { teamId });
      expect(listedObservations.schemaVersion).toBe("sena-enterprise-post-cutover-observations/v1");
      expect(listedObservations.summary.ready).toBe(1);
      expect(listedObservations.observations[0]?.id).toBe(observation.id);

      const goLiveAfterObservation = await enterprise.getEnterpriseGoLiveRehearsalWithPostgresEvidence({ teamId });
      expect(goLiveAfterObservation.postCutoverMonitor.status).toBe("ready");
      expect(goLiveAfterObservation.postCutoverMonitor.summary.blockers).toEqual([]);
      expect(goLiveAfterObservation.postCutoverMonitor.checks.find((check) => check.id === "post-cutover-observation")).toEqual(expect.objectContaining({
        status: "pass",
        evidence: expect.arrayContaining([
          `observationId=${observation.id}`,
          "observationStatus=ready"
        ])
      }));

      const approvedGoLiveAttestation = await enterprise.createEnterpriseGoLiveAttestationWithPostgresEvidence(registered.context, {
        teamId,
        environment: "pilot-production",
        releaseVersion: "2026.06.14-go-live-attestation",
        decision: "approved",
        attesterName: "Institution platform owner",
        attesterRole: "Platform operations",
        notes: "Approving go-live with team-scoped institution IdP, SCIM, rotation, SaaS, release-gate, rollback, and post-cutover observation evidence.",
        checklist: {
          rehearsalReviewed: true,
          releaseGateDraftReviewed: true,
          verificationEvidenceReviewed: true,
          rollbackOwnerConfirmed: true,
          platformOwnerDecisionReviewed: true
        }
      });
      const approvedGoLiveAttestationReleaseSnapshot = (approvedGoLiveAttestation as typeof approvedGoLiveAttestation & {
        latestReleaseGateSnapshot?: {
          identityProductionEvidenceDigest?: string;
          identityReceiptArchiveManifestDigest?: string;
          identityReceiptArchiveReadyForArchive?: number;
          identityEvidenceUrlHostBinding?: string;
          identityEvidenceAllowedHostConfig?: string;
          identityEvidenceAllowedHosts?: number;
          identityEvidenceInvalidAllowedHosts?: number;
        };
      }).latestReleaseGateSnapshot;
      expect(approvedGoLiveAttestationReleaseSnapshot).toEqual(expect.objectContaining({
        identityProductionEvidenceDigest: releaseGateIdentitySnapshot.dossierDigest,
        identityReceiptArchiveManifestDigest: releaseGateIdentitySnapshot.receiptArchiveManifest?.archiveManifestDigest,
        identityReceiptArchiveReadyForArchive: 2,
        identityEvidenceUrlHostBinding: "ready",
        identityEvidenceAllowedHostConfig: "configured",
        identityEvidenceAllowedHosts: 1,
        identityEvidenceInvalidAllowedHosts: 0
      }));
      const goLiveIdentityHandoff = (goLive as typeof goLive & {
        identityProductionHandoff?: {
          schemaVersion: string;
          status: string;
          evidenceManifest: { missingEvidenceIds: string[] };
          evidenceUrlHostBinding: {
            status: string;
            allowedHostConfigStatus?: string;
            allowedHostCount?: number;
            invalidAllowedHostCount?: number;
          };
          platformRequestPacket: {
            summary: { blockingRequests: number; missingProductionEvidence: number };
          };
        };
      }).identityProductionHandoff;
      expect(goLiveIdentityHandoff).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-identity-production-evidence/v1",
        status: "ready",
        evidenceManifest: expect.objectContaining({
          missingEvidenceIds: []
        }),
        evidenceUrlHostBinding: expect.objectContaining({
          status: "ready",
          allowedHostConfigStatus: "configured",
          allowedHostCount: 1,
          invalidAllowedHostCount: 0
        }),
        platformRequestPacket: expect.objectContaining({
          summary: expect.objectContaining({
            blockingRequests: 0,
            missingProductionEvidence: 0
          })
        })
      }));
      expect((approvedGoLiveAttestation as typeof approvedGoLiveAttestation & {
        identityProductionHandoffSnapshot?: {
          schemaVersion: string;
          status: string;
          dossierDigest?: string;
          evidenceManifest: { missingEvidenceIds: string[] };
          receiptArchiveManifest?: {
            archiveManifestDigest?: string;
            summary: {
              readyForArchive: number;
              reviewArchives: number;
              missingReceipts: number;
            };
          };
          evidenceUrlHostBinding: {
            status: string;
            allowedHostConfigStatus?: string;
            allowedHostCount?: number;
            invalidAllowedHostCount?: number;
          };
          platformRequestPacket: {
            summary: { blockingRequests: number; missingProductionEvidence: number };
          };
          evidence: string[];
        };
      }).identityProductionHandoffSnapshot).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-identity-production-evidence/v1",
        status: "ready",
        evidenceManifest: expect.objectContaining({
          missingEvidenceIds: []
        }),
        evidenceUrlHostBinding: expect.objectContaining({
          status: "ready",
          allowedHostConfigStatus: "configured",
          allowedHostCount: 1,
          invalidAllowedHostCount: 0
        }),
        platformRequestPacket: expect.objectContaining({
          summary: expect.objectContaining({
            blockingRequests: 0,
            missingProductionEvidence: 0
          })
        })
      }));
      const approvedAttestationRequestPolicyHash = approvedGoLiveAttestation.identityProductionHandoffSnapshot.platformRequestPacket.evidence
        .find((entry) => entry.startsWith("requestPacketPolicyHash="))
        ?.slice("requestPacketPolicyHash=".length);
      expect(approvedAttestationRequestPolicyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(approvedGoLiveAttestation.evidence).toEqual(expect.arrayContaining([
        `identityProductionHandoffSnapshotRequestPacketPolicyHash=${approvedAttestationRequestPolicyHash}`,
        "identityProductionHandoffSnapshotRequestPacketPolicyBinding=idp:current|provisioning:current",
        "identityProductionHandoffSnapshotReceiptReviewRequests=0",
        `identityProductionHandoffSnapshotDigest=${approvedGoLiveAttestation.identityProductionHandoffSnapshot.dossierDigest}`,
        `identityProductionHandoffSnapshotReceiptArchiveManifestDigest=${approvedGoLiveAttestation.identityProductionHandoffSnapshot.receiptArchiveManifest.archiveManifestDigest}`,
        "identityProductionHandoffSnapshotReceiptArchiveReadyForArchive=2",
        "identityProductionHandoffSnapshotReceiptArchiveReview=0",
        "identityProductionHandoffSnapshotReceiptArchiveMissingReceipts=0",
        "identityProductionHandoffSnapshotReceiptArchiveMissingInputs=none",
        `latestReleaseGateIdentityProductionEvidenceDigest=${releaseGateIdentitySnapshot.dossierDigest}`,
        `latestReleaseGateIdentityReceiptArchiveManifestDigest=${releaseGateIdentitySnapshot.receiptArchiveManifest?.archiveManifestDigest}`,
        "latestReleaseGateIdentityReceiptArchiveReadyForArchive=2",
        "latestReleaseGateIdentityReceiptArchiveMissingInputs=none",
        "identityProductionHandoffSnapshotEvidenceUrlAllowedHosts=1",
        "identityProductionHandoffSnapshotHostBinding=ready",
        "identityProductionHandoffSnapshotAllowedHostConfig=configured",
        "identityProductionHandoffSnapshotAllowedHosts=1",
        "identityProductionHandoffSnapshotInvalidAllowedHosts=0"
      ]));

      const otherTeamGoLive = await (enterprise as typeof enterprise & {
        getEnterpriseGoLiveRehearsalWithPostgresEvidence: (input?: { teamId?: string }) => Promise<{
          status: string;
          summary: {
            acceptedPlatformDecisions: number;
            nativeAdapterProductionBlocking: number;
            saasOperationsStatus: string;
            releaseGateReviews: number;
            latestReleaseGateStatus?: string;
            blockers: string[];
          };
          releaseGateDraft: { decision: string; verificationEvidence: { status: string } };
          rollbackDrill: { status: string; summary: { releaseGateReady: boolean; blockers: string[] } };
          postCutoverMonitor: { status: string; summary: { releaseGateReady: boolean; rollbackReady: boolean; blockers: string[] } };
          identityProductionHandoff?: {
            schemaVersion: string;
            status: string;
            evidenceManifest: { missingEvidenceIds: string[] };
            platformRequestPacket: {
              summary: { blockingRequests: number; missingProductionEvidence: number };
            };
          };
        }>;
      }).getEnterpriseGoLiveRehearsalWithPostgresEvidence({ teamId: otherRegistered.context.teams[0].id });
      expect(otherTeamGoLive.status).toBe("blocked");
      expect(otherTeamGoLive.summary.acceptedPlatformDecisions).toBe(0);
      expect(otherTeamGoLive.summary.nativeAdapterProductionBlocking).toBeGreaterThanOrEqual(2);
      expect(otherTeamGoLive.summary.saasOperationsStatus).toBe("blocked");
      expect(otherTeamGoLive.summary.releaseGateReviews).toBe(0);
      expect(otherTeamGoLive.summary.latestReleaseGateStatus).toBeUndefined();
      expect(otherTeamGoLive.summary.blockers).toEqual(expect.arrayContaining([
        "saas-operations-not-ready",
        "native-adapter-certification-production-blockers",
        "approved-release-gate-required",
        "release-gate-verification-passed-required",
        "release-gate-identity-production-evidence-required"
      ]));
      expect(otherTeamGoLive.releaseGateDraft.decision).toBe("blocked");
      expect(otherTeamGoLive.releaseGateDraft.verificationEvidence.status).toBe("not-run");
      expect(otherTeamGoLive.rollbackDrill.summary.releaseGateReady).toBe(false);
      expect(otherTeamGoLive.postCutoverMonitor.summary.releaseGateReady).toBe(false);
      expect(otherTeamGoLive.postCutoverMonitor.summary.rollbackReady).toBe(false);
      expect(otherTeamGoLive.identityProductionHandoff).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-identity-production-evidence/v1",
        status: "review",
        evidenceManifest: expect.objectContaining({
          missingEvidenceIds: expect.arrayContaining([
            "idp-tenant-approval",
            "idp-callback-approval",
            "sso-provider-secrets",
            "sso-secret-store-reference",
            "sso-secret-rotation",
            "provisioning-owner",
            "scim-or-idp-ownership",
            "bearer-token-rotation",
            "lifecycle-guardrails"
          ])
        }),
        platformRequestPacket: expect.objectContaining({
          summary: expect.objectContaining({
            blockingRequests: 2,
            missingProductionEvidence: 9
          })
        })
      }));

      const otherTeamCapabilityAudit = await (enterprise as typeof enterprise & {
        getEnterpriseCapabilityAuditWithPostgresEvidence: (input?: { teamId?: string }) => Promise<{
          capabilities: Array<{ id: string; status: string; remainingPlatformDecisions: string[]; evidence: string[] }>;
        }>;
      }).getEnterpriseCapabilityAuditWithPostgresEvidence({ teamId: otherRegistered.context.teams[0].id });
      const otherTeamAuthCapability = otherTeamCapabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(otherTeamAuthCapability?.status).toBe("review");
      expect(otherTeamAuthCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval",
        "institution-provisioning-owner"
      ]));
      expect(otherTeamAuthCapability?.evidence).toEqual(expect.arrayContaining([
        "idpProductionEvidence=review",
        "idpTenantApproval=ready-without-platform-acceptance",
        "scimProvisioningOwner=ready-without-platform-acceptance",
        "rotationFreshness=review"
      ]));

      const otherTeamGoLiveAttestation = await enterprise.createEnterpriseGoLiveAttestationWithPostgresEvidence(otherRegistered.context, {
        teamId: otherRegistered.context.teams[0].id,
        environment: "pilot-production",
        releaseVersion: "2026.06.14-other-team-go-live-attestation",
        decision: "conditional",
        attesterName: "Other institution release owner",
        attesterRole: "Platform operations",
        notes: "Reviewing go-live without team-scoped institution IdP, SCIM, and release-gate evidence.",
        checklist: {
          rehearsalReviewed: true,
          releaseGateDraftReviewed: true,
          verificationEvidenceReviewed: true,
          rollbackOwnerConfirmed: false,
          platformOwnerDecisionReviewed: false
        }
      });
      expect(otherTeamGoLiveAttestation.goLiveRehearsalSnapshot.status).toBe("blocked");
      expect(otherTeamGoLiveAttestation.goLiveRehearsalSnapshot.blockers).toEqual(expect.arrayContaining([
        "saas-operations-not-ready",
        "native-adapter-certification-production-blockers",
        "approved-release-gate-required",
        "release-gate-verification-passed-required",
        "release-gate-identity-production-evidence-required"
      ]));
      expect(otherTeamGoLiveAttestation.releaseGateDraftSnapshot.decision).toBe("blocked");
      expect(otherTeamGoLiveAttestation.releaseGateDraftSnapshot.verificationStatus).toBe("not-run");
      expect(otherTeamGoLiveAttestation.latestReleaseGateSnapshot).toBeUndefined();
      expect((otherTeamGoLiveAttestation as typeof otherTeamGoLiveAttestation & {
        identityProductionHandoffSnapshot?: {
          schemaVersion: string;
          status: string;
          evidenceManifest: { missingEvidenceIds: string[] };
          platformRequestPacket: {
            summary: { blockingRequests: number; missingProductionEvidence: number };
          };
        };
      }).identityProductionHandoffSnapshot).toEqual(expect.objectContaining({
        schemaVersion: "sena-enterprise-identity-production-evidence/v1",
        status: "review",
        evidenceManifest: expect.objectContaining({
          missingEvidenceIds: expect.arrayContaining([
            "idp-tenant-approval",
            "idp-callback-approval",
            "sso-provider-secrets",
            "sso-secret-store-reference",
            "sso-secret-rotation",
            "provisioning-owner",
            "scim-or-idp-ownership",
            "bearer-token-rotation",
            "lifecycle-guardrails"
          ])
        }),
        platformRequestPacket: expect.objectContaining({
          summary: expect.objectContaining({
            blockingRequests: 2,
            missingProductionEvidence: 9
          })
        })
      }));

      expect((await enterprise.getEnterpriseGoLiveRehearsalWithPostgresEvidence({ teamId })).summary.blockers).toEqual([]);
      const capabilityAudit = await enterprise.getEnterpriseCapabilityAuditWithPostgresEvidence({ teamId });
      expect(capabilityAudit.capabilities.find((capability) => capability.id === "go-live-operations")).toEqual(expect.objectContaining({
        status: "ready",
        remainingPlatformDecisions: []
      }));

      const currentIdentityRequestPolicyHash = (await enterprise.getEnterpriseIdentityProductionEvidenceWithPostgresEvidence({ teamId })).platformRequestPacket.evidence
        .find((entry) => entry.startsWith("requestPacketPolicyHash="))
        ?.slice("requestPacketPolicyHash=".length);
      expect(currentIdentityRequestPolicyHash).toMatch(/^[a-f0-9]{64}$/);
      await enterprise.reviewEnterprisePlatformDecisionWithPostgresState(registered.context, {
        teamId,
        decisionId: "institution-idp-approval",
        status: "accepted",
        acceptedBridge: true,
        ownerName: "Ada Chen, Institution IAM Owner",
        ownerRole: "Institution identity platform owner",
        environment: "pilot-production",
        evidenceUrl: "https://ops.institution.edu/sena/institution-idp-approval-renewed-after-release-gate",
        productionEvidenceIds: ["idp-tenant-approval", "idp-callback-approval", "sso-provider-secrets", "sso-secret-store-reference", "sso-secret-rotation"],
        productionEvidenceArtifactDigest: goLiveIdpEvidenceArtifactDigest,
        productionEvidenceVerifiedAt: new Date().toISOString(),
        requestPacketPolicyHash: currentIdentityRequestPolicyHash,
        notes: "Renewing institution IdP evidence after release-gate approval; this should require a new release gate before go-live."
      });
      const renewedIdentityHandoff = await enterprise.getEnterpriseIdentityProductionEvidenceWithPostgresEvidence({ teamId });
      expect(renewedIdentityHandoff.status).toBe("ready");
      expect(renewedIdentityHandoff.dossierDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(renewedIdentityHandoff.evidenceBindingDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(renewedIdentityHandoff.evidenceBindingDigest).not.toBe(releaseGateIdentitySnapshot.evidenceBindingDigest);

      const staleReleaseGateDeployment = await enterprise.getEnterpriseOrganizationDeploymentPackageWithPostgresEvidence({ teamId });
      expect(staleReleaseGateDeployment.saasOperationsReadiness.status).toBe("blocked");
      expect(staleReleaseGateDeployment.saasOperationsReadiness.summary.blockers).toEqual(expect.arrayContaining([
        "release-gate-identity-production-evidence-digest-stale"
      ]));
      expect(staleReleaseGateDeployment.saasOperationsReadiness.evidence).toEqual(expect.arrayContaining([
        `latestReleaseGateIdentityEvidenceBindingDigest=${releaseGateIdentitySnapshot.evidenceBindingDigest}`,
        `currentIdentityProductionEvidenceBindingDigest=${renewedIdentityHandoff.evidenceBindingDigest}`,
        "identityProductionReleaseGateDigestBinding=stale"
      ]));

      const staleCapabilityAudit = await enterprise.getEnterpriseCapabilityAuditWithPostgresEvidence({ teamId });
      const staleAuthCapability = staleCapabilityAudit.capabilities.find((capability) => capability.id === "auth-login-register-sso");
      expect(staleAuthCapability?.status).toBe("review");
      expect(staleAuthCapability?.remainingPlatformDecisions).toEqual(expect.arrayContaining([
        "institution-idp-approval"
      ]));
      expect(staleAuthCapability?.evidence).toEqual(expect.arrayContaining([
        `latestReleaseGateIdentityEvidenceBindingDigest=${releaseGateIdentitySnapshot.evidenceBindingDigest}`,
        `currentIdentityProductionEvidenceBindingDigest=${renewedIdentityHandoff.evidenceBindingDigest}`,
        "identityProductionReleaseGateDigestBinding=stale"
      ]));
      expect(staleAuthCapability?.nextAction).toContain("fresh release gate review");

      const staleReleaseGateGoLive = await enterprise.getEnterpriseGoLiveRehearsalWithPostgresEvidence({ teamId });
      expect(staleReleaseGateGoLive.status).toBe("blocked");
      expect(staleReleaseGateGoLive.summary.blockers).toEqual(expect.arrayContaining([
        "release-gate-identity-production-evidence-digest-stale"
      ]));
      expect(staleReleaseGateGoLive.evidence).toEqual(expect.arrayContaining([
        `latestReleaseGateIdentityEvidenceBindingDigest=${releaseGateIdentitySnapshot.evidenceBindingDigest}`,
        `identityProductionHandoffEvidenceBindingDigest=${renewedIdentityHandoff.evidenceBindingDigest}`,
        "identityProductionReleaseGateDigestBinding=stale"
      ]));
      expect(staleReleaseGateGoLive.rollbackDrill.summary.releaseGateReady).toBe(false);
      expect(staleReleaseGateGoLive.rollbackDrill.summary.blockers).toEqual(expect.arrayContaining([
        "release-gate-identity-production-evidence-digest-stale"
      ]));
      expect(staleReleaseGateGoLive.rollbackDrill.evidence).toEqual(expect.arrayContaining([
        "identityProductionReleaseGateDigestBinding=stale"
      ]));
      expect(staleReleaseGateGoLive.postCutoverMonitor.summary.releaseGateReady).toBe(false);
      expect(staleReleaseGateGoLive.postCutoverMonitor.summary.blockers).toEqual(expect.arrayContaining([
        "release-gate-identity-production-evidence-digest-stale"
      ]));
      expect(staleReleaseGateGoLive.postCutoverMonitor.checks.find((check) => check.id === "release-verification")).toEqual(expect.objectContaining({
        status: "blocked",
        evidence: expect.arrayContaining([
          "identityProductionReleaseGateDigestBinding=stale"
        ])
      }));
      await expect(enterprise.createEnterpriseGoLiveAttestationWithPostgresEvidence(registered.context, {
        teamId,
        environment: "pilot-production",
        releaseVersion: "2026.06.14-go-live-stale-identity-release-gate",
        decision: "approved",
        attesterName: "Institution platform owner",
        attesterRole: "Platform operations",
        notes: "Attempting go-live after identity evidence changed without a fresh release gate.",
        checklist: {
          rehearsalReviewed: true,
          releaseGateDraftReviewed: true,
          verificationEvidenceReviewed: true,
          rollbackOwnerConfirmed: true,
          platformOwnerDecisionReviewed: true
        }
      })).rejects.toThrow(/current rehearsal has blockers/i);
    } finally {
      vi.useRealTimers();
      restoreEnv(envSnapshot);
      rmSync(enterpriseDbDir, { recursive: true, force: true });
      vi.doUnmock("pg");
      vi.resetModules();
    }
  }, enterpriseGoLiveTestTimeoutMs);
});
