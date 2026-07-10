import type { SenaApiEvidenceNoteId } from "./api-evidence-notes";
import { SENA_SCHEMA_VERSIONS } from "./schema-registry";
export type SenaApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type SenaApiAuthMode =
  | "public"
  | "session"
  | "session-or-ops-bearer"
  | "provisioning-bearer"
  | "scim-bearer";

export type SenaApiGroupId =
  | "auth"
  | "analysis"
  | "projects"
  | "team"
  | "imports"
  | "reliability"
  | "validation"
  | "exports"
  | "governance"
  | "ops"
  | "provisioning"
  | "legacy-ena";

export type SenaApiEndpointFact = {
  id: string;
  group: SenaApiGroupId;
  path: string;
  methods: SenaApiMethod[];
  auth: SenaApiAuthMode;
  summary: string;
  evidenceNoteId?: SenaApiEvidenceNoteId;
  responses: string[];
  actions?: string[];
};

export const SENA_API_GROUPS: Array<{
  id: SenaApiGroupId;
  title: string;
  description: string;
}> = [
  { id: "auth", title: "Auth and SSO", description: "Password login, registration, session, MFA, password reset, and OAuth/OIDC provider start/callback." },
  { id: "team", title: "Teams and RBAC", description: "Team state, invitations, membership lifecycle, and role-aware access for PI/Admin/Coder/Reviewer workflows." },
  { id: "projects", title: "Projects and Collaboration", description: "Durable SENA project snapshots, revisions, restore, comments, presence, adjudication, and live collaboration streams." },
  { id: "analysis", title: "SENA Analysis", description: "Server-side SENA analysis from projects, snapshots, raw datasets, or SENA JSON contracts with persisted run history." },
  { id: "imports", title: "Imports and Uploads", description: "Source upload registry, blob verification, object-storage delivery, cleaning manifests, and import-to-project persistence." },
  { id: "reliability", title: "Reliability", description: "Multi-coder file parsing, Cohen kappa/Krippendorff alpha dashboard generation, review, and adjudication history." },
  { id: "validation", title: "Validation", description: "Group comparison, suites, Holm correction, expert review, approval, and return-to-researcher flows." },
  { id: "exports", title: "Publication Exports", description: "Publication-ready report artifacts for HTML, SVG, PNG, XLSX, DOCX, and PDF." },
  { id: "governance", title: "Governance", description: "Audit export/integrity, backup delivery, managed database sync, restore dry-run, restore merge, and health evidence." },
  { id: "ops", title: "Ops", description: "Readiness, status, metrics, deployment handoff, release-gate evidence, firing alerts, and signed alert delivery." },
  { id: "provisioning", title: "Provisioning and SCIM", description: "Institution-managed users, teams, SSO identities, memberships, and SCIM 2.0 Users/Groups bridge." },
  { id: "legacy-ena", title: "ENA Runtime", description: "Compatibility endpoint for the standalone jENA analysis runtime." }
];

export const SENA_API_ENDPOINT_FACTS: SenaApiEndpointFact[] = [
  {
    id: "auth-login",
    group: "auth",
    path: "/api/auth/login",
    methods: ["POST"],
    auth: "public",
    summary: "Authenticate with email/password and return either a session or an MFA challenge.",
    evidenceNoteId: "auth-login",
    responses: ["sena-auth-login/v1", "sena-auth-mfa-challenge/v1"]
  },
  {
    id: "auth-register",
    group: "auth",
    path: "/api/auth/register",
    methods: ["POST"],
    auth: "public",
    summary: "Register a researcher account and create or join an enterprise team with the enterprise password policy enforced.",
    evidenceNoteId: "auth-register",
    responses: ["sena-auth-session/v1"]
  },
  {
    id: "auth-session",
    group: "auth",
    path: "/api/auth/me",
    methods: ["GET"],
    auth: "session",
    summary: "Return the current authenticated user, teams, memberships, and x-sena-auth-session-id/x-sena-auth-team-id response headers.",
    evidenceNoteId: "auth-session",
    responses: ["sena-auth-session/v1"]
  },
  {
    id: "auth-csrf",
    group: "auth",
    path: "/api/auth/csrf",
    methods: ["GET"],
    auth: "session",
    summary: "Issue a per-session CSRF token for cookie-auth mutating endpoints.",
    evidenceNoteId: "auth-csrf",
    responses: ["sena-enterprise-csrf-token/v1"]
  },
  {
    id: "auth-sessions",
    group: "auth",
    path: "/api/auth/sessions",
    methods: ["GET", "DELETE"],
    auth: "session",
    summary: "List active sessions for the current user or revoke one, other, or all sessions.",
    evidenceNoteId: "auth-sessions",
    responses: ["sena-enterprise-session-list/v1", "sena-enterprise-session-revocation/v1"]
  },
  {
    id: "auth-logout",
    group: "auth",
    path: "/api/auth/logout",
    methods: ["POST"],
    auth: "session",
    summary: "Clear the current auth session cookie.",
    evidenceNoteId: "auth-logout",
    responses: ["sena-auth-logout/v1"]
  },
  {
    id: "auth-mfa",
    group: "auth",
    path: "/api/auth/mfa",
    methods: ["GET", "POST", "DELETE"],
    auth: "session",
    summary: "Inspect, enroll, verify, or remove TOTP MFA for the signed-in account.",
    evidenceNoteId: "auth-mfa",
    responses: ["sena-enterprise-mfa-status/v1", "sena-enterprise-mfa-setup/v1"]
  },
  {
    id: "auth-password-reset",
    group: "auth",
    path: "/api/auth/password-reset",
    methods: ["POST"],
    auth: "public",
    summary: "Request or confirm a password reset using the institution email bridge when configured.",
    evidenceNoteId: "auth-password-reset",
    responses: ["sena-enterprise-password-reset-request/v1", "sena-enterprise-password-reset-complete/v1"]
  },
  {
    id: "auth-sso",
    group: "auth",
    path: "/api/auth/sso",
    methods: ["GET", "POST"],
    auth: "public",
    summary: "List/preflight configured SSO providers or start an OAuth/OIDC login flow with production fallback policy enforcement.",
    evidenceNoteId: "auth-sso",
    responses: ["sena-auth-sso-status/v1", "sena-enterprise-identity-production-gate-summary/v1", "sena-auth-sso-start/v1", "sso_local_fallback_disabled"]
  },
  {
    id: "auth-sso-callback",
    group: "auth",
    path: "/api/auth/sso/callback",
    methods: ["GET"],
    auth: "public",
    summary: "Complete OAuth/OIDC callback and create a SENA session.",
    evidenceNoteId: "auth-sso-callback",
    responses: ["302 /workspace/sena", "sena-auth-sso-callback-error/v1"]
  },
  {
    id: "ena-run",
    group: "legacy-ena",
    path: "/api/ena/run",
    methods: ["POST"],
    auth: "session",
    summary: "Run the standalone jENA-compatible analysis endpoint for signed-in pilot users.",
    evidenceNoteId: "ena-run",
    responses: ["ena-run-result/v1"]
  },
  {
    id: "sena-docs",
    group: "governance",
    path: "/api/sena/docs",
    methods: ["GET"],
    auth: "public",
    summary: "Return this machine-readable SENA API contract or OpenAPI 3.1 document.",
    evidenceNoteId: "sena-docs",
    responses: ["sena-api-documentation/v1", "OpenAPI 3.1"]
  },
  {
    id: "sena-projects",
    group: "projects",
    path: "/api/sena/projects",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "List RBAC-visible projects or save a project/review-packet handoff snapshot.",
    evidenceNoteId: "sena-projects",
    responses: ["sena-project-list/v1", "sena-project/v1"]
  },
  {
    id: "sena-project",
    group: "projects",
    path: "/api/sena/projects/{projectId}",
    methods: ["GET", "PUT", "PATCH", "DELETE"],
    auth: "session",
    summary: "Open, update, restore revision, or archive a durable SENA project.",
    evidenceNoteId: "sena-project",
    responses: ["sena-project/v1", "sena-project-revision-restore/v1", "sena-project-delete/v1"]
  },
  {
    id: "sena-collaboration",
    group: "projects",
    path: "/api/sena/projects/{projectId}/collaboration",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "Read or mutate collaboration state: comments, presence, adjudications, pub/sub delivery, and Postgres-backed comment/presence/reliability/validation/expert-review/adjudication source headers.",
    evidenceNoteId: "sena-collaboration",
    responses: ["sena-enterprise-project-collaboration/v1", "sena-enterprise-collaboration-pubsub-delivery/v1"]
  },
  {
    id: "sena-collaboration-stream",
    group: "projects",
    path: "/api/sena/projects/{projectId}/collaboration/stream",
    methods: ["GET"],
    auth: "session",
    summary: "Server-sent collaboration event stream for live project updates with session and project:read RBAC preflight plus comment/presence/reliability/validation/expert-review/adjudication source headers before the stream opens.",
    responses: ["text/event-stream", "sena-project-collaboration-stream/v1", "auth_required", "permission_denied"]
  },
  {
    id: "sena-team",
    group: "team",
    path: "/api/sena/team",
    methods: ["GET"],
    auth: "session",
    summary: "Return team, membership, invitation, notification, and audit state visible to the user.",
    responses: ["sena-enterprise-team-state/v1"]
  },
  {
    id: "sena-team-invitations",
    group: "team",
    path: "/api/sena/team/invitations",
    methods: ["POST", "PATCH", "DELETE"],
    auth: "session",
    summary: "Create, accept, or revoke role-aware team invitations.",
    evidenceNoteId: "sena-team-invitations",
    responses: ["sena-team-invitation/v1", "sena-team-invitation-acceptance/v1"]
  },
  {
    id: "sena-team-memberships",
    group: "team",
    path: "/api/sena/team/memberships",
    methods: ["PATCH"],
    auth: "session",
    summary: "Update membership role/status with the last-active-manager guardrail.",
    evidenceNoteId: "sena-team-memberships",
    responses: ["sena-team-membership/v1"]
  },
  {
    id: "sena-analyze",
    group: "analysis",
    path: "/api/sena/analyze",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "Run server-side SENA analysis, optionally persist the result as a team project, or queue the heavy run for an external worker with queue:true / Prefer: respond-async.",
    evidenceNoteId: "sena-analyze",
    responses: ["sena-analysis-run-list/v1", "sena-analysis-run/v1", "sena-analysis-provenance-envelope/v1", "sena-enterprise-server-job/v1"]
  },
  {
    id: "sena-uploads",
    group: "imports",
    path: "/api/sena/uploads",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "List upload registry, verify blob integrity, create uploads, or deliver blobs through native object storage or signed bridge payloads.",
    evidenceNoteId: "sena-uploads",
    responses: ["sena-enterprise-upload-list/v1", "sena-enterprise-upload-response/v1", "sena-enterprise-upload-storage-verification/v1", "sena-enterprise-upload-object-storage-delivery/v1"]
  },
  {
    id: "sena-import",
    group: "imports",
    path: "/api/sena/import",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "Import Excel, LMS/forum JSON/CSV/XLSX exports, CSV, SENA contract, TXT/MD transcripts, or SRT/VTT subtitle transcripts with cleaning manifests, or queue uploaded import files for an external worker with upload-pointer payloads.",
    evidenceNoteId: "sena-import",
    responses: ["sena-import-run-list/v1", "sena-import-response/v1", "sena-analysis-run/v1", "sena-project/v1", "sena-enterprise-server-job/v1"]
  },
  {
    id: "sena-reliability",
    group: "reliability",
    path: "/api/sena/reliability",
    methods: ["GET", "POST", "PATCH"],
    auth: "session",
    summary: "Create reliability dashboards with code-level diagnostics from coder files, list run history, review, generate adjudications with run-level coverage, or queue reliability jobs with upload-pointer payloads.",
    evidenceNoteId: "sena-reliability",
    responses: ["sena-reliability-run-list/v1", "sena-reliability-response/v1", "sena-reliability-run-review/v1", "sena-reliability-adjudication-response/v1", "sena-reliability-adjudication-coverage/v1", "sena-enterprise-server-job/v1"]
  },
  {
    id: "sena-validation-group-comparison",
    group: "validation",
    path: "/api/sena/validation/group-comparison",
    methods: ["GET", "POST", "PATCH"],
    auth: "session",
    summary: "Run or queue single/suite group comparisons with permutation p values, bootstrap intervals, Holm correction, preregistration plan fingerprints, validation parity evidence, and formal inference readiness manifests that can inherit project-linked analysis-run walkthrough hashes.",
    evidenceNoteId: "sena-validation-group-comparison",
    responses: ["sena-validation-run-list/v1", "sena-group-comparison/v1", "sena-group-comparison-suite/v1", "sena-formal-inference-readiness/v1", "sena-validation-run-review/v1", "sena-enterprise-server-job/v1"]
  },
  {
    id: "sena-validation-expert-review",
    group: "validation",
    path: "/api/sena/validation/expert-review",
    methods: ["GET", "POST", "PATCH"],
    auth: "session",
    summary: "Capture domain expert sign-off, concern/recommendation evidence, and review decisions.",
    evidenceNoteId: "sena-validation-expert-review",
    responses: ["sena-expert-review-list/v1", "sena-expert-review-response/v1"]
  },
  {
    id: "sena-validation-claim-package",
    group: "validation",
    path: "/api/sena/validation/claim-package",
    methods: ["GET"],
    auth: "session",
    summary: "Return a project-scoped claim evidence package with approved reliability, validation, preregistration, validation parity, domain expert review, source snapshot provenance evidence, x-sena-source-snapshot-sha256/x-sena-report-sha256, and x-sena-claim-evidence-reliability-source/x-sena-claim-evidence-validation-source/x-sena-claim-evidence-expert-review-source/x-sena-claim-evidence-adjudication-source response headers.",
    evidenceNoteId: "sena-validation-claim-package",
    responses: ["sena-enterprise-claim-evidence-package/v1", "sena-enterprise-claim-source-snapshot/v1"]
  },
  {
    id: "sena-publication-export",
    group: "exports",
    path: "/api/sena/exports/publication",
    methods: ["POST"],
    auth: "session",
    summary: "Generate publication-ready SENA artifacts or queue the export for an external worker; projectId exports preserve enterprise project provenance.",
    evidenceNoteId: "sena-publication-export",
    responses: ["text/html", "image/svg+xml", "image/png", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/pdf", "sena-publication-package/v1", "sena-publication-source-snapshot/v1", "sena-publication-verification-certificate/v1", "sena-publication-enterprise-project-evidence/v1", "sena-data-governance-metadata/v1", "sena-enterprise-server-job/v1"]
  },
  {
    id: "sena-notifications",
    group: "governance",
    path: "/api/sena/notifications",
    methods: ["GET", "POST", "PATCH"],
    auth: "session",
    summary: "Query notifications, run delivery workers, deliver institution email, and mark notifications read.",
    evidenceNoteId: "sena-notifications",
    responses: ["sena-enterprise-notifications/v1", "sena-enterprise-notification-delivery/v1", "sena-enterprise-email-delivery/v1"]
  },
  {
    id: "sena-governance-health",
    group: "governance",
    path: "/api/sena/governance/health",
    methods: ["GET"],
    auth: "session",
    summary: "Return enterprise runtime health, governance checks, and count summaries.",
    evidenceNoteId: "sena-governance-health",
    responses: ["sena-enterprise-governance/v1"]
  },
  {
    id: "sena-governance-security",
    group: "governance",
    path: "/api/sena/governance/security",
    methods: ["GET"],
    auth: "session",
    summary: "Return deployment security posture for identity, access, data protection, audit monitoring, and continuity controls.",
    evidenceNoteId: "sena-governance-security",
    responses: ["sena-enterprise-security-posture/v1"]
  },
  {
    id: "sena-governance-audit",
    group: "governance",
    path: "/api/sena/governance/audit",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "Query/export Postgres-backed audit logs, verify audit-chain integrity, or forward signed audit payloads.",
    evidenceNoteId: "sena-governance-audit",
    responses: ["sena-enterprise-audit-log/v1", "text/csv", "sena-enterprise-audit-integrity/v1", "sena-enterprise-audit-delivery/v1"]
  },
  {
    id: "sena-governance-backup",
    group: "governance",
    path: "/api/sena/governance/backup",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "Export, verify, deliver, sync, dry-run restore, or merge restore a sanitized team backup.",
    evidenceNoteId: "sena-governance-backup",
    responses: ["sena-enterprise-backup/v1", "sena-enterprise-backup-verification/v1", "sena-enterprise-backup-delivery/v1", "sena-enterprise-database-sync/v1", "sena-enterprise-backup-restore/v1"]
  },
  {
    id: "sena-ops-status",
    group: "ops",
    path: "/api/sena/ops/status",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return runtime storage, queue, webhook, backup, and collection status.",
    evidenceNoteId: "sena-ops-status",
    responses: ["sena-enterprise-ops-status/v1"]
  },
  {
    id: "sena-ops-jobs",
    group: "ops",
    path: "/api/sena/ops/jobs",
    methods: ["GET", "POST"],
    auth: "session-or-ops-bearer",
    summary: "List indexed Postgres-backed server job queue state or let workers update running, success, failure, retry, and dead-letter status.",
    evidenceNoteId: "sena-ops-jobs",
    responses: ["sena-enterprise-server-job-list/v1", "sena-enterprise-server-job-status-update/v1", "sena-enterprise-server-job/v1"]
  },
  {
    id: "sena-ops-jobs-worker-contract",
    group: "ops",
    path: "/api/sena/ops/jobs/worker-contract",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return the redacted external worker contract for server job queue consumption, callback status updates, runbook, owner, and heartbeat evidence.",
    evidenceNoteId: "sena-ops-jobs-worker-contract",
    responses: [SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerContract]
  },
  {
    id: "sena-ops-jobs-worker-heartbeat",
    group: "ops",
    path: "/api/sena/ops/jobs/worker-heartbeat",
    methods: ["POST"],
    auth: "session-or-ops-bearer",
    summary: "Write a synthetic no-user-data worker heartbeat job, exercise running/succeeded callbacks, and return redacted status-store evidence.",
    evidenceNoteId: "sena-ops-jobs-worker-heartbeat",
    responses: [SENA_SCHEMA_VERSIONS.enterpriseServerJobWorkerHeartbeat]
  },
  {
    id: "sena-ops-jobs-probe",
    group: "ops",
    path: "/api/sena/ops/jobs/probe",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Run a redacted live server job queue probe using the configured queue URL, HMAC secret, and synthetic no-user-data payload.",
    evidenceNoteId: "sena-ops-jobs-probe",
    responses: [SENA_SCHEMA_VERSIONS.enterpriseServerJobQueueProbe]
  },
  {
    id: "sena-ops-cdn",
    group: "ops",
    path: "/api/sena/ops/cdn",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Run a redacted live CDN probe for HTML compression and immutable _next/static caching.",
    evidenceNoteId: "sena-ops-cdn",
    responses: ["sena-enterprise-cdn-probe/v1"]
  },
  {
    id: "sena-ops-postgres",
    group: "ops",
    path: "/api/sena/ops/postgres",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Run a redacted live Postgres probe for managed database DDL, insert, read, and cleanup readiness.",
    evidenceNoteId: "sena-ops-postgres",
    responses: [SENA_SCHEMA_VERSIONS.enterprisePostgresProbe]
  },
  {
    id: "sena-ops-object-storage",
    group: "ops",
    path: "/api/sena/ops/object-storage",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Run a redacted live object-storage probe that PUTs, HEADs, and DELETEs a small native S3/R2/GCS-HMAC object.",
    evidenceNoteId: "sena-ops-object-storage",
    responses: [SENA_SCHEMA_VERSIONS.enterpriseObjectStorageProbe]
  },
  {
    id: "sena-ops-observability",
    group: "ops",
    path: "/api/sena/ops/observability",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return redacted request-level SLI samples, p95/error-rate status, route summaries, and observability exporter readiness.",
    evidenceNoteId: "sena-ops-observability",
    responses: [SENA_SCHEMA_VERSIONS.enterpriseObservabilitySli, SENA_SCHEMA_VERSIONS.enterpriseObservedRequest]
  },
  {
    id: "sena-ops-observability-probe",
    group: "ops",
    path: "/api/sena/ops/observability/probe",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Run a redacted live observability exporter probe for signed request SLI delivery.",
    evidenceNoteId: "sena-ops-observability-probe",
    responses: [SENA_SCHEMA_VERSIONS.enterpriseObservabilityProbe]
  },
  {
    id: "sena-ops-production-evidence",
    group: "ops",
    path: "/api/sena/ops/production-evidence",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return the redacted production evidence manifest for external live probe artifacts and the performance-budget artifact.",
    evidenceNoteId: "sena-ops-production-evidence",
    responses: [SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceManifest]
  },
  {
    id: "sena-ops-metrics",
    group: "ops",
    path: "/api/sena/ops/metrics",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return Prometheus-style enterprise runtime metrics.",
    evidenceNoteId: "sena-ops-metrics",
    responses: ["text/plain; version=0.0.4"]
  },
  {
    id: "sena-ops-readiness",
    group: "ops",
    path: "/api/sena/ops/readiness",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return production-gate readiness checks and platform-decision blockers.",
    evidenceNoteId: "sena-ops-readiness",
    responses: ["sena-enterprise-deployment-readiness/v1"]
  },
  {
    id: "sena-ops-deployment",
    group: "ops",
    path: "/api/sena/ops/deployment",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return the redacted organization deployment handoff package with a platform decision register and latest release-gate evidence.",
    evidenceNoteId: "sena-ops-deployment",
    responses: ["sena-enterprise-organization-deployment/v1", "sena-enterprise-platform-decision-register/v1", "sena-enterprise-release-gate-reviews/v1", "sena-enterprise-identity-production-evidence/v1", "sena-enterprise-identity-institution-action-plan/v1", "sena-enterprise-release-verification-evidence/v1"]
  },
  {
    id: "sena-ops-native-adapters",
    group: "ops",
    path: "/api/sena/ops/native-adapters",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return the native adapter certification dossier for institution platform owners reviewing managed database, object storage, pub/sub, IdP, email, audit, backup, alerting, and SaaS operations readiness.",
    evidenceNoteId: "sena-ops-native-adapters",
    responses: ["sena-enterprise-native-adapter-certification/v1", "sena-enterprise-platform-decision-register/v1"]
  },
  {
    id: "sena-ops-saas-operations",
    group: "ops",
    path: "/api/sena/ops/saas-operations",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return the SaaS operations readiness dossier that links platform-owner approval, native adapter certification, release-gate verification, and full backend operating-model evidence.",
    evidenceNoteId: "sena-ops-saas-operations",
    responses: [
      "sena-enterprise-saas-operations-readiness/v1",
      "sena-enterprise-native-adapter-certification/v1",
      "sena-enterprise-release-gate-review/v1",
      "sena-enterprise-identity-production-evidence/v1",
      SENA_SCHEMA_VERSIONS.enterpriseProductionEvidenceManifest
    ]
  },
  {
    id: "sena-ops-capability-audit",
    group: "ops",
    path: "/api/sena/ops/capability-audit",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return the enterprise capability audit that maps the original missing-feature backlog to runnable API, UI, artifact, and platform-decision evidence.",
    evidenceNoteId: "sena-ops-capability-audit",
    responses: ["sena-enterprise-capability-audit/v1", "sena-enterprise-organization-deployment/v1", "sena-enterprise-deployment-readiness/v1", "sena-enterprise-go-live-rehearsal/v1", "sena-enterprise-identity-production-evidence/v1", "sena-enterprise-identity-cutover-checklist/v1"]
  },
  {
    id: "sena-ops-identity-production-evidence",
    group: "ops",
    path: "/api/sena/ops/identity-production-evidence",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return the redacted institution identity production evidence packet and evidence manifest for IdP tenant approval, callback approval, SSO provider secret custody, SSO secret-store reference, SSO secret rotation, SCIM/IdP ownership, bearer-token rotation, lifecycle guardrails, and release-gate identity blockers.",
    evidenceNoteId: "sena-ops-identity-production-evidence",
    responses: ["sena-enterprise-identity-production-evidence/v1", "sena-enterprise-identity-production-evidence-manifest/v1", "sena-enterprise-identity-platform-decision-request-packet/v1", "sena-enterprise-identity-institution-action-plan/v1", "sena-enterprise-identity-submission-matrix/v1", "sena-enterprise-identity-owner-runbook/v1", "sena-enterprise-identity-submission-verifier/v1", "sena-enterprise-identity-rotation-freshness/v1", "sena-enterprise-identity-receipt-archive-manifest/v1", "sena-enterprise-identity-cutover-checklist/v1", "sena-enterprise-platform-decision-production-evidence-receipt/v1", "sena-enterprise-platform-decision-register/v1", "sena-enterprise-capability-audit/v1"]
  },
  {
    id: "sena-ops-go-live-rehearsal",
    group: "ops",
    path: "/api/sena/ops/go-live-rehearsal",
    methods: ["GET", "POST"],
    auth: "session-or-ops-bearer",
    summary: "Return the go-live rehearsal dossier that links deployment readiness, native adapter certification, SaaS operations readiness, rollback drill evidence, post-cutover monitoring, and release-gate verification.",
    evidenceNoteId: "sena-ops-go-live-rehearsal",
    responses: ["sena-enterprise-go-live-rehearsal/v1", "sena-enterprise-release-gate-draft/v1", "sena-enterprise-go-live-rollback-drill/v1", "sena-enterprise-go-live-monitor/v1", "sena-enterprise-post-cutover-observation/v1", "sena-enterprise-post-cutover-observations/v1", "sena-enterprise-go-live-attestation/v1", "sena-enterprise-go-live-attestations/v1", "sena-enterprise-deployment-readiness/v1", "sena-enterprise-native-adapter-certification/v1", "sena-enterprise-saas-operations-readiness/v1", "sena-enterprise-release-gate-review/v1", "sena-enterprise-identity-production-evidence/v1", "sena-enterprise-identity-cutover-checklist/v1", "sena-enterprise-identity-institution-action-plan/v1", "sena-enterprise-identity-submission-matrix/v1", "sena-enterprise-identity-owner-runbook/v1"]
  },
  {
    id: "sena-ops-platform-decisions",
    group: "ops",
    path: "/api/sena/ops/platform-decisions",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "List or record team-scoped platform decision acceptance records for production bridge/native-adapter ownership.",
    evidenceNoteId: "sena-ops-platform-decisions",
    responses: ["sena-enterprise-platform-decision-acceptances/v1", "sena-enterprise-platform-decision-acceptance/v1", "sena-enterprise-platform-decision-production-evidence-receipt/v1", "sena-enterprise-platform-decision-register/v1", "sena-enterprise-identity-production-evidence/v1"]
  },
  {
    id: "sena-ops-release-gate",
    group: "ops",
    path: "/api/sena/ops/release-gate",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "List or record team-scoped release gate reviews with deployment-readiness, platform-decision, and identity production evidence snapshots.",
    evidenceNoteId: "sena-ops-release-gate",
    responses: ["sena-enterprise-release-gate-reviews/v1", "sena-enterprise-release-gate-review/v1", "sena-enterprise-deployment-readiness/v1", "sena-enterprise-platform-decision-register/v1", "sena-enterprise-identity-production-evidence/v1", "sena-enterprise-identity-submission-verifier/v1", "sena-enterprise-identity-rotation-freshness/v1", "sena-enterprise-identity-cutover-checklist/v1", "sena-enterprise-identity-institution-action-plan/v1", "sena-enterprise-identity-submission-matrix/v1", "sena-enterprise-identity-owner-runbook/v1"]
  },
  {
    id: "sena-ops-alerts",
    group: "ops",
    path: "/api/sena/ops/alerts",
    methods: ["GET", "POST"],
    auth: "session-or-ops-bearer",
    summary: "Return machine-readable firing alerts or deliver signed alert webhooks.",
    evidenceNoteId: "sena-ops-alerts",
    responses: ["sena-enterprise-ops-alerts/v1", "sena-enterprise-ops-alert-delivery/v1"]
  },
  {
    id: "sena-provisioning",
    group: "provisioning",
    path: "/api/sena/provisioning",
    methods: ["GET", "POST"],
    auth: "provisioning-bearer",
    summary: "Inspect provisioning configuration or upsert institution-managed teams, users, identities, and memberships.",
    evidenceNoteId: "sena-provisioning",
    responses: ["sena-enterprise-provisioning-status/v1", "sena-enterprise-provisioning/v1"]
  },
  {
    id: "sena-scim-config",
    group: "provisioning",
    path: "/api/sena/scim/v2/ServiceProviderConfig",
    methods: ["GET"],
    auth: "scim-bearer",
    summary: "Return SCIM 2.0 ServiceProviderConfig for the SENA bridge.",
    evidenceNoteId: "sena-scim-config",
    responses: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig", "sena-scim-identity-production-gate/v1"]
  },
  {
    id: "sena-scim-users",
    group: "provisioning",
    path: "/api/sena/scim/v2/Users",
    methods: ["GET", "POST"],
    auth: "scim-bearer",
    summary: "List or create SCIM users with SENA enterprise role extensions.",
    evidenceNoteId: "sena-scim-users",
    responses: ["urn:ietf:params:scim:schemas:core:2.0:User", "ListResponse"]
  },
  {
    id: "sena-scim-user-resource",
    group: "provisioning",
    path: "/api/sena/scim/v2/Users/{resourceId}",
    methods: ["PUT", "PATCH"],
    auth: "scim-bearer",
    summary: "Replace or patch a SCIM user resource and mapped SENA memberships.",
    evidenceNoteId: "sena-scim-user-resource",
    responses: ["urn:ietf:params:scim:schemas:core:2.0:User"]
  },
  {
    id: "sena-scim-groups",
    group: "provisioning",
    path: "/api/sena/scim/v2/Groups",
    methods: ["GET", "POST"],
    auth: "scim-bearer",
    summary: "List or create SCIM groups mapped to SENA teams and roles.",
    evidenceNoteId: "sena-scim-groups",
    responses: ["urn:ietf:params:scim:schemas:core:2.0:Group", "ListResponse"]
  },
  {
    id: "sena-scim-group-resource",
    group: "provisioning",
    path: "/api/sena/scim/v2/Groups/{resourceId}",
    methods: ["PUT", "PATCH"],
    auth: "scim-bearer",
    summary: "Replace or patch a SCIM group resource and mapped team memberships.",
    evidenceNoteId: "sena-scim-group-resource",
    responses: ["urn:ietf:params:scim:schemas:core:2.0:Group"]
  }
];
