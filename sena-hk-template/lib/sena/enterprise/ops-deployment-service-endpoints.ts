import { SENA_SCHEMA_VERSIONS } from "../schema-registry";

export type SenaEnterpriseOrganizationDeploymentServiceEndpoint = {
  id: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  auth: "session" | "ops-bearer-or-session" | "provisioning-bearer" | "team-rbac";
  schema?: string;
  purpose: string;
};

export const enterpriseOrganizationDeploymentServiceEndpoints = [
  { id: "ops-deployment", method: "GET", path: "/api/sena/ops/deployment", auth: "ops-bearer-or-session", schema: "sena-enterprise-organization-deployment/v1", purpose: "Redacted organization deployment handoff package" },
  { id: "ops-native-adapters", method: "GET", path: "/api/sena/ops/native-adapters", auth: "ops-bearer-or-session", schema: "sena-enterprise-native-adapter-certification/v1", purpose: "Native adapter certification dossier for institution platform owners" },
  { id: "ops-saas-operations", method: "GET", path: "/api/sena/ops/saas-operations", auth: "ops-bearer-or-session", schema: "sena-enterprise-saas-operations-readiness/v1", purpose: "Full SaaS operations readiness dossier linking platform approval, adapters, and release-gate evidence" },
  { id: "ops-identity-production-evidence", method: "GET", path: "/api/sena/ops/identity-production-evidence", auth: "ops-bearer-or-session", schema: "sena-enterprise-identity-production-evidence/v1", purpose: "Institution identity production evidence dossier for IdP, SSO, SCIM, and rotation handoff" },
  { id: "ops-capability-audit", method: "GET", path: "/api/sena/ops/capability-audit", auth: "ops-bearer-or-session", schema: "sena-enterprise-capability-audit/v1", purpose: "Enterprise capability audit mapping the original missing-feature backlog to runnable evidence and remaining platform decisions" },
  { id: "ops-go-live-rehearsal", method: "GET", path: "/api/sena/ops/go-live-rehearsal", auth: "ops-bearer-or-session", schema: "sena-enterprise-go-live-rehearsal/v1", purpose: "Go-live rehearsal dossier linking readiness, adapter certification, SaaS operations, rollback drill, post-cutover monitoring, persisted observation evidence, and release-gate evidence" },
  { id: "ops-go-live-closeout-actions", method: "POST", path: "/api/sena/ops/go-live-rehearsal", auth: "team-rbac", schema: "sena-enterprise-post-cutover-observation/v1", purpose: "Session and CSRF protected action bodies start, sample, and complete the 60-minute post-cutover observation before approved go-live attestation; actionless POST preserves cutover attestation creation" },
  { id: "ops-platform-decisions-list", method: "GET", path: "/api/sena/ops/platform-decisions", auth: "team-rbac", schema: "sena-enterprise-platform-decision-acceptances/v1", purpose: "List team-scoped platform decision acceptance records with the current register" },
  { id: "ops-platform-decisions-review", method: "POST", path: "/api/sena/ops/platform-decisions", auth: "team-rbac", schema: "sena-enterprise-platform-decision-acceptance/v1", purpose: "Record accepted, rejected, native-adapter-required, or superseded platform decisions" },
  { id: "ops-release-gate-list", method: "GET", path: "/api/sena/ops/release-gate", auth: "team-rbac", schema: "sena-enterprise-release-gate-reviews/v1", purpose: "List release gate review records with deployment-readiness and platform-decision snapshots" },
  { id: "ops-release-gate-review", method: "POST", path: "/api/sena/ops/release-gate", auth: "team-rbac", schema: "sena-enterprise-release-gate-review/v1", purpose: "Record approved, conditional, or blocked release-gate reviews before production handoff" },
  { id: "ops-readiness", method: "GET", path: "/api/sena/ops/readiness", auth: "ops-bearer-or-session", schema: "sena-enterprise-deployment-readiness/v1", purpose: "Production readiness gate" },
  { id: "ops-status", method: "GET", path: "/api/sena/ops/status", auth: "ops-bearer-or-session", schema: "sena-enterprise-ops-status/v1", purpose: "Runtime health and queue counters" },
  { id: "ops-server-job-worker-contract", method: "GET", path: "/api/sena/ops/jobs/worker-contract", auth: "ops-bearer-or-session", schema: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerContract, purpose: "External worker readiness contract; blocked until nonce-bound authenticated callback receipt evidence exists" },
  { id: "ops-server-job-worker-heartbeat", method: "POST", path: "/api/sena/ops/jobs/worker-heartbeat", auth: "ops-bearer-or-session", schema: SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerHeartbeat, purpose: "Same-process synthetic no-user-data status-store CAS self-test; not external-worker callback evidence" },
  { id: "ops-server-job-queue-probe", method: "GET", path: "/api/sena/ops/jobs/probe", auth: "ops-bearer-or-session", schema: SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe, purpose: "Signed managed server job queue live dispatch probe evidence" },
  { id: "ops-postgres-probe", method: "GET", path: "/api/sena/ops/postgres", auth: "ops-bearer-or-session", schema: SENA_SCHEMA_VERSIONS.enterprisePostgresProbe, purpose: "Managed Postgres live DDL/DML/read/delete probe evidence" },
  { id: "ops-object-storage-probe", method: "GET", path: "/api/sena/ops/object-storage", auth: "ops-bearer-or-session", schema: SENA_SCHEMA_VERSIONS.enterpriseObjectStorageProbe, purpose: "Native object-storage live PUT/HEAD/DELETE probe evidence" },
  { id: "ops-observability", method: "GET", path: "/api/sena/ops/observability", auth: "ops-bearer-or-session", schema: SENA_SCHEMA_VERSIONS.enterpriseObservabilitySli, purpose: "Request-level SLI p95, error-rate, slow-route, and exporter readiness evidence" },
  { id: "ops-observability-probe", method: "GET", path: "/api/sena/ops/observability/probe", auth: "ops-bearer-or-session", schema: SENA_SCHEMA_VERSIONS.enterpriseObservabilityProbe, purpose: "Signed observability exporter live delivery probe evidence" },
  { id: "ops-production-evidence", method: "GET", path: "/api/sena/ops/production-evidence", auth: "ops-bearer-or-session", schema: SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceManifest, purpose: "Aggregated production live-probe artifact custody manifest" },
  { id: "ops-alert-delivery", method: "POST", path: "/api/sena/ops/alerts", auth: "ops-bearer-or-session", schema: "sena-enterprise-ops-alert-delivery/v1", purpose: "Signed deployment alert delivery" },
  { id: "sso-preflight", method: "GET", path: "/api/auth/sso?status=1&preflight=1", auth: "session", schema: "sena-enterprise-sso-preflight/v1", purpose: "OAuth/OIDC provider preflight" },
  { id: "provisioning", method: "POST", path: "/api/sena/provisioning", auth: "provisioning-bearer", schema: "sena-enterprise-provisioning/v1", purpose: "Institution organization provisioning" },
  { id: "scim-users", method: "POST", path: "/api/sena/scim/v2/Users", auth: "provisioning-bearer", schema: "sena-scim-provisioning-bridge/v1", purpose: "SCIM 2.0 user provisioning bridge" },
  { id: "audit-forwarding", method: "POST", path: "/api/sena/governance/audit", auth: "team-rbac", schema: "sena-enterprise-audit-delivery/v1", purpose: "Signed audit/SIEM forwarding" },
  { id: "backup-delivery", method: "POST", path: "/api/sena/governance/backup", auth: "team-rbac", schema: "sena-enterprise-backup-delivery/v1", purpose: "Signed backup delivery and restore rehearsal" }
] satisfies SenaEnterpriseOrganizationDeploymentServiceEndpoint[];
