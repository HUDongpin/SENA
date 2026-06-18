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

export type SenaApiEndpoint = {
  id: string;
  group: SenaApiGroupId;
  path: string;
  methods: SenaApiMethod[];
  auth: SenaApiAuthMode;
  summary: string;
  request?: string;
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

export const SENA_API_ENDPOINTS: SenaApiEndpoint[] = [
  {
    id: "auth-login",
    group: "auth",
    path: "/api/auth/login",
    methods: ["POST"],
    auth: "public",
    summary: "Authenticate with email/password and return either a session or an MFA challenge.",
    request: "JSON { email, password, mfaCode?, rememberSession? }; completed sessions return x-sena-auth-flow, x-sena-auth-user-id, x-sena-auth-session-id, x-sena-auth-session-profile, x-sena-auth-session-expires-at, x-sena-auth-team-id, x-sena-auth-membership-role, x-sena-auth-production-gate, x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-missing-evidence-ids, x-sena-identity-cutover-checklist, x-sena-identity-rotation-freshness, x-sena-identity-institution-action-plan-digest, x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, x-sena-identity-institution-action-plan-submission-path, x-sena-identity-owner-runbook-digest, x-sena-identity-owner-runbook-blocking, x-sena-identity-owner-runbook-preflight-checks, x-sena-identity-owner-runbook-submission-steps, and x-sena-identity-owner-runbook-receipt-archive-steps response headers so local password login cannot be mistaken for completed institution IdP production evidence.",
    responses: ["sena-auth-login/v1", "sena-auth-mfa-challenge/v1"]
  },
  {
    id: "auth-register",
    group: "auth",
    path: "/api/auth/register",
    methods: ["POST"],
    auth: "public",
    summary: "Register a researcher account and create or join an enterprise team with the enterprise password policy enforced.",
    request: "JSON { name, email, password, organization, inviteCode? }; password must satisfy sena-enterprise-password-policy/v1; completed sessions return x-sena-auth-flow, x-sena-auth-user-id, x-sena-auth-session-id, x-sena-auth-team-id, x-sena-auth-membership-role, x-sena-auth-production-gate, x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-missing-evidence-ids, x-sena-identity-cutover-checklist, x-sena-identity-rotation-freshness, x-sena-identity-institution-action-plan-digest, x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, x-sena-identity-institution-action-plan-submission-path, x-sena-identity-owner-runbook-digest, x-sena-identity-owner-runbook-blocking, x-sena-identity-owner-runbook-preflight-checks, x-sena-identity-owner-runbook-submission-steps, and x-sena-identity-owner-runbook-receipt-archive-steps response headers so local registration cannot be mistaken for completed institution IdP production evidence.",
    responses: ["sena-auth-session/v1"]
  },
  {
    id: "auth-session",
    group: "auth",
    path: "/api/auth/me",
    methods: ["GET"],
    auth: "session",
    summary: "Return the current authenticated user, teams, memberships, and x-sena-auth-session-id/x-sena-auth-team-id response headers.",
    responses: ["sena-auth-session/v1"]
  },
  {
    id: "auth-csrf",
    group: "auth",
    path: "/api/auth/csrf",
    methods: ["GET"],
    auth: "session",
    summary: "Issue a per-session CSRF token for cookie-auth mutating endpoints.",
    responses: ["sena-enterprise-csrf-token/v1"]
  },
  {
    id: "auth-sessions",
    group: "auth",
    path: "/api/auth/sessions",
    methods: ["GET", "DELETE"],
    auth: "session",
    summary: "List active sessions for the current user or revoke one, other, or all sessions.",
    request: "DELETE with x-sena-csrf-token header and JSON { sessionId? } or { action: revoke-others|revoke-all }",
    responses: ["sena-enterprise-session-list/v1", "sena-enterprise-session-revocation/v1"]
  },
  {
    id: "auth-logout",
    group: "auth",
    path: "/api/auth/logout",
    methods: ["POST"],
    auth: "session",
    summary: "Clear the current auth session cookie.",
    responses: ["sena-auth-logout/v1"]
  },
  {
    id: "auth-mfa",
    group: "auth",
    path: "/api/auth/mfa",
    methods: ["GET", "POST", "DELETE"],
    auth: "session",
    summary: "Inspect, enroll, verify, or remove TOTP MFA for the signed-in account.",
    request: "GET/POST/DELETE responses include x-sena-auth-production-gate, x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-missing-evidence-ids, x-sena-identity-rotation-freshness, x-sena-identity-institution-action-plan-digest, x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, x-sena-identity-institution-action-plan-submission-path, x-sena-identity-owner-runbook-digest, x-sena-identity-owner-runbook-blocking, x-sena-identity-owner-runbook-preflight-checks, x-sena-identity-owner-runbook-submission-steps, and x-sena-identity-owner-runbook-receipt-archive-steps so local MFA controls cannot be mistaken for completed institution IdP production evidence; POST JSON { action: setup|enable, setupToken?, code? }; DELETE disables MFA",
    responses: ["sena-enterprise-mfa-status/v1", "sena-enterprise-mfa-setup/v1"]
  },
  {
    id: "auth-password-reset",
    group: "auth",
    path: "/api/auth/password-reset",
    methods: ["POST"],
    auth: "public",
    summary: "Request or confirm a password reset using the institution email bridge when configured.",
    request: "JSON { action: request|confirm, email?, token?, password? }; confirm password must satisfy sena-enterprise-password-policy/v1; request/confirm responses include x-sena-auth-production-gate, x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-missing-evidence-ids, x-sena-identity-rotation-freshness, x-sena-identity-institution-action-plan-digest, x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, x-sena-identity-institution-action-plan-submission-path, x-sena-identity-owner-runbook-digest, x-sena-identity-owner-runbook-blocking, x-sena-identity-owner-runbook-preflight-checks, x-sena-identity-owner-runbook-submission-steps, and x-sena-identity-owner-runbook-receipt-archive-steps so local reset flows cannot be mistaken for completed institution IdP production evidence.",
    responses: ["sena-enterprise-password-reset-request/v1", "sena-enterprise-password-reset-complete/v1"]
  },
  {
    id: "auth-sso",
    group: "auth",
    path: "/api/auth/sso",
    methods: ["GET", "POST"],
    auth: "public",
    summary: "List/preflight configured SSO providers or start an OAuth/OIDC login flow with production fallback policy enforcement.",
    request: "GET ?status=1&preflight=1&provider=google|orcid; GET status/preflight responses include identityProductionGate with sena-enterprise-identity-production-gate-summary/v1 plus x-sena-sso-production-gate, x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-request-blockers, x-sena-identity-production-blocking-decisions, x-sena-identity-missing-evidence-ids, x-sena-identity-cutover-checklist, x-sena-identity-cutover-blockers, x-sena-identity-rotation-freshness, x-sena-identity-institution-action-plan-digest, x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, x-sena-identity-institution-action-plan-submission-path, x-sena-identity-owner-runbook-digest, x-sena-identity-owner-runbook-blocking, x-sena-identity-owner-runbook-preflight-checks, x-sena-identity-owner-runbook-submission-steps, and x-sena-identity-owner-runbook-receipt-archive-steps so SSO diagnostics expose institution IdP tenant approval, SSO secret custody, and secret rotation blockers without secret values; POST JSON { provider }; local pilot fallback follows sena-enterprise-sso-fallback-policy/v1 and requires SENA_ALLOW_LOCAL_SSO_FALLBACK=1 in production; completed fallback sessions return x-sena-auth-flow, x-sena-auth-provider, x-sena-sso-provider, x-sena-sso-mode, x-sena-auth-session-id, and x-sena-auth-team-id response headers.",
    responses: ["sena-auth-sso-status/v1", "sena-enterprise-identity-production-gate-summary/v1", "sena-auth-sso-start/v1", "sso_local_fallback_disabled"]
  },
  {
    id: "auth-sso-callback",
    group: "auth",
    path: "/api/auth/sso/callback",
    methods: ["GET"],
    auth: "public",
    summary: "Complete OAuth/OIDC callback and create a SENA session.",
    request: "Query { provider, code, state }; successful callback redirects return x-sena-auth-flow, x-sena-auth-provider, x-sena-sso-provider, x-sena-sso-mode, x-sena-auth-session-id, and x-sena-auth-team-id response headers.",
    responses: ["302 /workspace/sena", "sena-auth-sso-callback-error/v1"]
  },
  {
    id: "ena-run",
    group: "legacy-ena",
    path: "/api/ena/run",
    methods: ["POST"],
    auth: "public",
    summary: "Run the standalone jENA-compatible analysis endpoint.",
    request: "JSON ENA dataset/build options",
    responses: ["ena-run-result/v1"]
  },
  {
    id: "sena-docs",
    group: "governance",
    path: "/api/sena/docs",
    methods: ["GET"],
    auth: "public",
    summary: "Return this machine-readable SENA API contract or OpenAPI 3.1 document.",
    request: "Query { format?: openapi }",
    responses: ["sena-api-documentation/v1", "OpenAPI 3.1"]
  },
  {
    id: "sena-projects",
    group: "projects",
    path: "/api/sena/projects",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "List RBAC-visible projects or save a project/review-packet handoff snapshot.",
    request: "POST JSON { teamId, title, description, snapshot|reviewPacket }; response headers include x-sena-project-id, x-sena-team-id, x-sena-project-version, x-sena-project-snapshot-sha256.",
    responses: ["sena-project-list/v1", "sena-project/v1"]
  },
  {
    id: "sena-project",
    group: "projects",
    path: "/api/sena/projects/{projectId}",
    methods: ["GET", "PUT", "PATCH", "DELETE"],
    auth: "session",
    summary: "Open, update, restore revision, or archive a durable SENA project.",
    request: "PUT JSON { title?, description?, snapshot?, expectedVersion? }; PATCH action=restore-revision; DELETE returns sena-project-delete/v1; response headers include x-sena-project-id, x-sena-project-version, x-sena-project-snapshot-sha256, x-sena-project-restored-from-version, x-sena-project-deleted.",
    responses: ["sena-project/v1", "sena-project-revision-restore/v1", "sena-project-delete/v1"]
  },
  {
    id: "sena-collaboration",
    group: "projects",
    path: "/api/sena/projects/{projectId}/collaboration",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "Read or mutate collaboration state: comments, presence, adjudications, and pub/sub delivery.",
    request: "POST JSON { action: comment|presence|adjudication|deliver-pubsub, ... }",
    responses: ["sena-enterprise-project-collaboration/v1", "sena-enterprise-collaboration-pubsub-delivery/v1"]
  },
  {
    id: "sena-collaboration-stream",
    group: "projects",
    path: "/api/sena/projects/{projectId}/collaboration/stream",
    methods: ["GET"],
    auth: "session",
    summary: "Server-sent collaboration event stream for live project updates with session and project:read RBAC preflight before the stream opens.",
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
    request: "POST JSON { teamId, email, role }; PATCH JSON { invitationId|inviteCode }; DELETE JSON { invitationId }; response headers include x-sena-invitation-id, x-sena-invitation-status, x-sena-team-id, x-sena-invitation-role, x-sena-membership-id.",
    responses: ["sena-team-invitation/v1", "sena-team-invitation-acceptance/v1"]
  },
  {
    id: "sena-team-memberships",
    group: "team",
    path: "/api/sena/team/memberships",
    methods: ["PATCH"],
    auth: "session",
    summary: "Update membership role/status with the last-active-manager guardrail.",
    request: "JSON { membershipId, role?, status? }; response headers include x-sena-membership-id, x-sena-team-id, x-sena-member-user-id, x-sena-membership-role, x-sena-membership-status.",
    responses: ["sena-team-membership/v1"]
  },
  {
    id: "sena-analyze",
    group: "analysis",
    path: "/api/sena/analyze",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "Run server-side SENA analysis and optionally persist the result as a team project.",
    request: "POST JSON { projectId?, snapshot?, dataset?, buildOptions?, persist?, includeRuntimeBundle? }; response headers include x-sena-analysis-run-id, x-sena-analysis-source-kind, x-sena-project-id, x-sena-project-version, x-sena-report-sha256, x-sena-project-snapshot-sha256, x-sena-runtime-bundle-sha256.",
    responses: ["sena-analysis-run-list/v1", "sena-analysis-run/v1"]
  },
  {
    id: "sena-uploads",
    group: "imports",
    path: "/api/sena/uploads",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "List upload registry, verify blob integrity, create uploads, or deliver signed object-storage payloads.",
    request: "GET ?verify=1; POST multipart files or JSON { action: deliver-object-storage, teamId, uploadId? }",
    responses: ["sena-enterprise-upload-list/v1", "sena-enterprise-upload-response/v1", "sena-enterprise-upload-storage-verification/v1", "sena-enterprise-upload-object-storage-delivery/v1"]
  },
  {
    id: "sena-import",
    group: "imports",
    path: "/api/sena/import",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "Import Excel, LMS/forum JSON/CSV/XLSX exports, CSV, SENA contract, TXT/MD transcripts, or SRT/VTT subtitle transcripts with cleaning manifests.",
    request: "POST multipart files; action=create-project persists the imported dataset as a team project and analysis run; response headers include x-sena-import-run-id, x-sena-import-status, x-sena-import-cleaning-manifest, x-sena-import-profiles, x-sena-project-id, x-sena-analysis-run-id.",
    responses: ["sena-import-run-list/v1", "sena-import-response/v1", "sena-analysis-run/v1", "sena-project/v1"]
  },
  {
    id: "sena-reliability",
    group: "reliability",
    path: "/api/sena/reliability",
    methods: ["GET", "POST", "PATCH"],
    auth: "session",
    summary: "Create reliability dashboards with code-level diagnostics from coder files, list run history, review, and generate adjudications with run-level coverage.",
    request: "POST multipart coder files or JSON sena-reliability-json-request/v1 { teamId?, projectId?, reviewer?, annotations: [{ coder_id, item_id, code_id, value }] }; PATCH JSON { action: review|adjudicate, runId, status?, decision? } enforces full adjudication coverage before approval and returns x-sena-reliability-run-id/x-sena-reliability-status/x-sena-reliability-coverage-rate response headers",
    responses: ["sena-reliability-run-list/v1", "sena-reliability-response/v1", "sena-reliability-run-review/v1", "sena-reliability-adjudication-response/v1", "sena-reliability-adjudication-coverage/v1"]
  },
  {
    id: "sena-validation-group-comparison",
    group: "validation",
    path: "/api/sena/validation/group-comparison",
    methods: ["GET", "POST", "PATCH"],
    auth: "session",
    summary: "Run single or suite group comparisons with permutation p values, bootstrap intervals, Holm correction, preregistration plan fingerprints, validation parity evidence, and formal inference readiness manifests that can inherit project-linked analysis-run walkthrough hashes.",
    request: "POST JSON { projectId?|snapshot?|dataset, groupA, groupB, metric?, comparisons?, iterations?, preregistrationNote?, methodNote?, parityEvidence? } returns validationRun.preregistrationPlan.planHash, validationRun.parityEvidence.validationRunHash, validationRun.parityEvidence.formalInference, and x-sena-validation-run-id/x-sena-validation-parity-sha256/x-sena-formal-inference-status response headers; projectId auto-fills walkthrough evidence from the latest linked analysis run unless parityEvidence overrides it; PATCH review",
    responses: ["sena-validation-run-list/v1", "sena-group-comparison/v1", "sena-group-comparison-suite/v1", "sena-formal-inference-readiness/v1", "sena-validation-run-review/v1"]
  },
  {
    id: "sena-validation-expert-review",
    group: "validation",
    path: "/api/sena/validation/expert-review",
    methods: ["GET", "POST", "PATCH"],
    auth: "session",
    summary: "Capture domain expert sign-off, concern/recommendation evidence, and review decisions.",
    request: "POST JSON { projectId?, reviewer, expertise, ratings, concerns?, recommendations? }; PATCH review; response headers include x-sena-expert-review-id, x-sena-project-id, x-sena-team-id, x-sena-expert-review-status, x-sena-expert-review-claim-scope, x-sena-expert-review-target-kind, x-sena-expert-review-interpretation-validity.",
    responses: ["sena-expert-review-list/v1", "sena-expert-review-response/v1"]
  },
  {
    id: "sena-validation-claim-package",
    group: "validation",
    path: "/api/sena/validation/claim-package",
    methods: ["GET"],
    auth: "session",
    summary: "Return a project-scoped claim evidence package with approved reliability, validation, preregistration, validation parity, domain expert review, source snapshot provenance evidence, and x-sena-source-snapshot-sha256/x-sena-report-sha256 response headers.",
    request: "GET ?projectId=...",
    responses: ["sena-enterprise-claim-evidence-package/v1", "sena-enterprise-claim-source-snapshot/v1"]
  },
  {
    id: "sena-publication-export",
    group: "exports",
    path: "/api/sena/exports/publication",
    methods: ["POST"],
    auth: "session",
    summary: "Generate publication-ready SENA artifacts or a manifest-backed multi-format publication package with enterprise project provenance when exported from projectId.",
    request: "JSON { projectId? or snapshot, format: html|svg|png|xlsx|docx|pdf|package, teamId? }; projectId exports the persisted server-side project snapshot with RBAC checks, claim-package provenance, and x-sena-export-source/x-sena-project-version/x-sena-source-snapshot-sha256/x-sena-report-sha256/x-sena-export-format/x-sena-export-filename/x-sena-export-bytes/x-sena-export-sha256/x-sena-publication-package-sha256/x-sena-publication-artifact-count/x-sena-publication-formats/x-sena-publication-verification-status response headers",
    responses: ["text/html", "image/svg+xml", "image/png", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/pdf", "sena-publication-package/v1", "sena-publication-source-snapshot/v1", "sena-publication-verification-certificate/v1", "sena-publication-enterprise-project-evidence/v1", "sena-data-governance-metadata/v1"]
  },
  {
    id: "sena-notifications",
    group: "governance",
    path: "/api/sena/notifications",
    methods: ["GET", "POST", "PATCH"],
    auth: "session",
    summary: "Query notifications, run delivery workers, deliver institution email, and mark notifications read.",
    request: "POST JSON { action: deliver|deliver-email, teamId? }; PATCH JSON { notificationId }",
    responses: ["sena-enterprise-notifications/v1", "sena-enterprise-notification-delivery/v1", "sena-enterprise-email-delivery/v1"]
  },
  {
    id: "sena-governance-health",
    group: "governance",
    path: "/api/sena/governance/health",
    methods: ["GET"],
    auth: "session",
    summary: "Return enterprise runtime health, governance checks, and count summaries.",
    request: "GET returns enterprise governance health; GET responses include x-sena-governance-status, x-sena-deployment-readiness-status, x-sena-identity-readiness-blocking-count, x-sena-identity-readiness-blockers, x-sena-identity-evidence-host-allowlist, x-sena-identity-secret-version-binding, x-sena-identity-secret-store-reference, x-sena-identity-secret-rotation-cadence, x-sena-identity-idp-tenant-binding, x-sena-identity-lifecycle-owner-mode, x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-request-blockers, x-sena-identity-production-blocking-decisions, x-sena-identity-missing-evidence-ids, x-sena-identity-cutover-checklist, and x-sena-identity-cutover-blockers so governance health exports keep institution IdP tenant approval, SSO secret custody, SCIM/IdP ownership, and secret rotation blockers machine-readable.",
    responses: ["sena-enterprise-governance/v1"]
  },
  {
    id: "sena-governance-security",
    group: "governance",
    path: "/api/sena/governance/security",
    methods: ["GET"],
    auth: "session",
    summary: "Return deployment security posture for identity, access, data protection, audit monitoring, and continuity controls.",
    request: "GET returns deployment security posture; GET responses include x-sena-security-posture-status, x-sena-security-identity-controls-review, x-sena-security-identity-control-blockers, x-sena-identity-evidence-host-allowlist, x-sena-identity-secret-version-binding, x-sena-identity-secret-store-reference, x-sena-identity-secret-rotation-cadence, x-sena-identity-idp-tenant-binding, and x-sena-identity-lifecycle-owner-mode so security review can block production until institution IdP tenant approval, SSO secret custody, SCIM/IdP ownership, and secret rotation evidence are accepted.",
    responses: ["sena-enterprise-security-posture/v1"]
  },
  {
    id: "sena-governance-audit",
    group: "governance",
    path: "/api/sena/governance/audit",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "Query/export audit log, verify audit-chain integrity, or forward signed audit payloads.",
    request: "GET ?format=csv&integrity=1; POST JSON { teamId?, limit? }",
    responses: ["sena-enterprise-audit-log/v1", "text/csv", "sena-enterprise-audit-integrity/v1", "sena-enterprise-audit-delivery/v1"]
  },
  {
    id: "sena-governance-backup",
    group: "governance",
    path: "/api/sena/governance/backup",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "Export, verify, deliver, sync, dry-run restore, or merge restore a sanitized team backup.",
    request: "POST JSON { action?: deliver|sync-database|restore-dry-run|restore, teamId?, artifact? }",
    responses: ["sena-enterprise-backup/v1", "sena-enterprise-backup-verification/v1", "sena-enterprise-backup-delivery/v1", "sena-enterprise-database-sync/v1", "sena-enterprise-backup-restore/v1"]
  },
  {
    id: "sena-ops-status",
    group: "ops",
    path: "/api/sena/ops/status",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return runtime storage, queue, webhook, backup, and collection status.",
    request: "GET returns runtime status; GET responses include x-sena-ops-status, x-sena-deployment-readiness-status, x-sena-identity-readiness-blocking-count, x-sena-identity-readiness-blockers, x-sena-identity-evidence-host-allowlist, x-sena-identity-secret-version-binding, x-sena-identity-secret-store-reference, x-sena-identity-secret-rotation-cadence, x-sena-identity-idp-tenant-binding, and x-sena-identity-lifecycle-owner-mode so deployment monitors can see institution IdP tenant approval, SSO secret custody, SCIM/IdP ownership, and secret rotation blockers beside basic runtime status.",
    responses: ["sena-enterprise-ops-status/v1"]
  },
  {
    id: "sena-ops-metrics",
    group: "ops",
    path: "/api/sena/ops/metrics",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return Prometheus-style enterprise runtime metrics.",
    request: "GET returns Prometheus text; gauges include sena_enterprise_deployment_readiness_blocking_review, sena_enterprise_identity_readiness_blockers, and sena_enterprise_identity_readiness_item so production monitors can scrape institution IdP tenant approval, SSO secret custody, SCIM/IdP ownership, and secret rotation readiness without parsing JSON.",
    responses: ["text/plain; version=0.0.4"]
  },
  {
    id: "sena-ops-readiness",
    group: "ops",
    path: "/api/sena/ops/readiness",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return production-gate readiness checks and platform-decision blockers.",
    request: "GET returns deployment readiness; GET responses include x-sena-deployment-readiness-status, x-sena-deployment-readiness-blocking-review, x-sena-deployment-readiness-blockers, x-sena-identity-readiness-blockers, x-sena-identity-evidence-host-allowlist, x-sena-identity-secret-version-binding, x-sena-identity-secret-store-reference, x-sena-identity-secret-rotation-cadence, x-sena-identity-idp-tenant-binding, and x-sena-identity-lifecycle-owner-mode so production monitors can block on institution IdP tenant approval, SSO secret custody, SCIM/IdP ownership, and secret rotation prerequisites without parsing the readiness body.",
    responses: ["sena-enterprise-deployment-readiness/v1"]
  },
  {
    id: "sena-ops-deployment",
    group: "ops",
    path: "/api/sena/ops/deployment",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return the redacted organization deployment handoff package with a platform decision register and latest release-gate evidence.",
    request: "GET ?teamId=... returns a team-scoped organization deployment handoff package; session requests require teamId; omit teamId only for bearer-authenticated global ops review; env includes SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS as the production identity evidence host allowlist requirement; identityProductionHandoff includes the redacted identity production evidence dossier with platform request blockers and missing evidence IDs; GET responses include x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-request-blockers, x-sena-identity-receipt-review-requests, and x-sena-identity-production-blocking-decisions from identityProductionHandoff; GET responses include x-sena-identity-receipt-archive-missing-inputs and x-sena-identity-production-evidence-artifact-completeness for deployment archive gating; GET responses include x-sena-identity-institution-action-plan-digest, x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, and x-sena-identity-institution-action-plan-submission-path for deployment archive routing by institution IdP and provisioning owner lane; GET responses include x-sena-identity-owner-runbook-digest, x-sena-identity-owner-runbook-blocking, x-sena-identity-owner-runbook-preflight-checks, x-sena-identity-owner-runbook-submission-steps, and x-sena-identity-owner-runbook-receipt-archive-steps so deployment archive capture can bind the owner-runbook artifact version without parsing the dossier body.",
    responses: ["sena-enterprise-organization-deployment/v1", "sena-enterprise-platform-decision-register/v1", "sena-enterprise-release-gate-reviews/v1", "sena-enterprise-identity-production-evidence/v1", "sena-enterprise-identity-institution-action-plan/v1", "sena-enterprise-release-verification-evidence/v1"]
  },
  {
    id: "sena-ops-native-adapters",
    group: "ops",
    path: "/api/sena/ops/native-adapters",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return the native adapter certification dossier for institution platform owners reviewing managed database, object storage, pub/sub, IdP, email, audit, backup, alerting, and SaaS operations readiness.",
    request: "GET ?teamId=... returns a team-scoped native adapter certification dossier; session requests require teamId; omit teamId only for bearer-authenticated global ops review.",
    responses: ["sena-enterprise-native-adapter-certification/v1", "sena-enterprise-platform-decision-register/v1"]
  },
  {
    id: "sena-ops-saas-operations",
    group: "ops",
    path: "/api/sena/ops/saas-operations",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return the SaaS operations readiness dossier that links platform-owner approval, native adapter certification, release-gate verification, and full backend operating-model evidence.",
    request: "GET ?teamId=... returns a team-scoped SaaS operations readiness dossier; session requests require teamId; omit teamId only for bearer-authenticated global ops review; evidence includes identityProductionReleaseGateDigestBinding so release reviewers can detect stale identity production evidence after the latest release-gate approval; GET responses include x-sena-saas-operations-status, x-sena-saas-operations-blockers, x-sena-identity-production-status, x-sena-identity-rotation-freshness, x-sena-identity-cutover-checklist, x-sena-identity-cutover-blockers, x-sena-identity-release-gate-digest-binding, x-sena-identity-latest-release-gate-evidence-binding-digest, and x-sena-identity-current-evidence-binding-digest for SaaS cutover automation without parsing the readiness body.",
    responses: ["sena-enterprise-saas-operations-readiness/v1", "sena-enterprise-native-adapter-certification/v1", "sena-enterprise-release-gate-review/v1", "sena-enterprise-identity-production-evidence/v1"]
  },
  {
    id: "sena-ops-capability-audit",
    group: "ops",
    path: "/api/sena/ops/capability-audit",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return the enterprise capability audit that maps the original missing-feature backlog to runnable API, UI, artifact, and platform-decision evidence.",
    request: "GET ?teamId=... returns a team-scoped enterprise capability audit; session requests require teamId; omit teamId only for bearer-authenticated global ops review; GET responses include identityProductionEvidence as the redacted identity production evidence dossier for one-call auth blocker archive capture; GET responses include x-sena-auth-capability-status, x-sena-auth-capability-remaining-platform-decisions, x-sena-auth-capability-required-artifacts, and x-sena-auth-capability-next-action so CI and ops archive capture can block auth production cutover until institution IdP tenant approval, SSO secret custody, SCIM/IdP ownership, and secret rotation evidence are complete; GET responses also include x-sena-auth-capability-idp-missing-production-evidence, x-sena-auth-capability-provisioning-missing-production-evidence, x-sena-auth-capability-idp-missing-technical-prerequisites, and x-sena-auth-capability-provisioning-missing-technical-prerequisites so platform-owner tooling can split IdP tenant/SSO secret blockers from SCIM/IdP lifecycle ownership blockers without parsing the dossier body; GET responses also include x-sena-identity-request-packet-policy-hash, x-sena-identity-request-packet-policy-binding, x-sena-identity-production-evidence-digest, x-sena-identity-evidence-binding-digest, and x-sena-identity-receipt-archive-manifest-digest so capability-audit archive capture can bind the auth blocker to the current identity evidence dossier and request policy; GET responses include x-sena-identity-institution-action-plan-digest, x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, and x-sena-identity-institution-action-plan-submission-path so capability-audit automation can route institution IdP and provisioning owner lanes without parsing the dossier body; GET responses include x-sena-identity-owner-runbook-digest, x-sena-identity-owner-runbook-blocking, x-sena-identity-owner-runbook-preflight-checks, x-sena-identity-owner-runbook-submission-steps, and x-sena-identity-owner-runbook-receipt-archive-steps so capability-audit automation can bind the owner-runbook artifact version without parsing the dossier body; GET responses also include x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-request-blockers, x-sena-identity-receipt-review-requests, x-sena-identity-production-blocking-decisions, x-sena-identity-receipt-archive-missing-inputs, x-sena-identity-production-evidence-artifact-completeness, x-sena-identity-missing-evidence-ids, x-sena-identity-cutover-checklist, x-sena-identity-cutover-blockers, and x-sena-identity-production-evidence-artifact-completeness-summary so the capability-audit gate exposes the same identity production blocker summary as the production evidence dossier; GET responses also include x-sena-identity-rotation-freshness, x-sena-identity-rotation-expired-evidence, and x-sena-identity-rotation-due-soon-evidence so release automation can block on secret-rotation freshness without parsing the dossier body.",
    responses: ["sena-enterprise-capability-audit/v1", "sena-enterprise-organization-deployment/v1", "sena-enterprise-deployment-readiness/v1", "sena-enterprise-go-live-rehearsal/v1", "sena-enterprise-identity-production-evidence/v1", "sena-enterprise-identity-cutover-checklist/v1"]
  },
  {
    id: "sena-ops-identity-production-evidence",
    group: "ops",
    path: "/api/sena/ops/identity-production-evidence",
    methods: ["GET"],
    auth: "session-or-ops-bearer",
    summary: "Return the redacted institution identity production evidence packet and evidence manifest for IdP tenant approval, callback approval, SSO provider secret custody, SSO secret-store reference, SSO secret rotation, SCIM/IdP ownership, bearer-token rotation, lifecycle guardrails, and release-gate identity blockers.",
    request: "GET ?teamId=... for a team-scoped identity production evidence dossier; session requests require teamId; omit teamId only for bearer-authenticated global ops review; GET responses include x-sena-identity-production-evidence-digest, x-sena-identity-evidence-binding-digest, x-sena-identity-receipt-archive-manifest-digest, and x-sena-identity-institution-action-plan-digest; GET responses include x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, and x-sena-identity-institution-action-plan-submission-path so platform-owner scripts can route institution IdP and provisioning lanes without parsing the dossier body; GET responses include x-sena-identity-owner-runbook-digest, x-sena-identity-owner-runbook-blocking, x-sena-identity-owner-runbook-preflight-checks, x-sena-identity-owner-runbook-submission-steps, and x-sena-identity-owner-runbook-receipt-archive-steps so platform-owner scripts can bind the owner-runbook artifact version without parsing the dossier body; GET responses include x-sena-identity-request-packet-policy-hash so platform-owner submission scripts can echo the current policy hash from the canonical dossier route; GET responses include x-sena-identity-request-packet-policy-binding so ops archive capture can see current, stale, or missing IdP/provisioning receipt binding without parsing the dossier body; GET responses also include x-sena-identity-receipt-archive-missing-inputs, x-sena-identity-production-evidence-artifact-completeness, and x-sena-identity-production-evidence-artifact-completeness-summary for ops archive capture and release-gate freshness checks; GET responses also include x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-request-blockers, x-sena-identity-receipt-review-requests, x-sena-identity-production-blocking-decisions, x-sena-identity-missing-evidence-ids, x-sena-identity-cutover-checklist, and x-sena-identity-cutover-blockers for machine-readable production cutover gating without parsing the dossier body; institutionActionPlan groups redacted submissionDrafts, missing evidence IDs, responseAuditHeaders, and receiptArchiveBodyPaths by institution-idp-owner and institution-provisioning-owner so tenant/callback/SSO secret custody and SCIM/lifecycle ownership work can be assigned without exposing secrets or evidence URLs; institutionActionPlan.submissionMatrix.rows maps each production evidence ID to its institution owner lane, decisionId, source, cutover item, required body fields, artifact digest, verifiedAt, evidenceUrl, responseAuditHeaders, and receiptArchiveBodyPaths; institutionActionPlan.ownerRunbooks.runbooks maps each institution owner lane to preflight checks, submissionSteps, receiptArchiveSteps, releaseGateBlockers, required env vars, productionEvidenceIds, requestPacketPolicyHash, responseAuditHeaders, and receipt archive paths; institutionActionPlan redaction excludes secret values, evidence URL values, and owner names, and uses evidenceUrlField instead of an evidenceUrl value; platformRequestPacket.submission.requiredBodyFields lists the POST body contract for /api/sena/ops/platform-decisions; requiredBodyFields includes productionEvidenceArtifactDigest so platform-owner scripts cannot omit the institution-owned external evidence artifact digest; platformRequestPacket.submission.identityProductionEvidenceBodyFields lists the evidenceUrl, productionEvidenceIds, productionEvidenceArtifactDigest, productionEvidenceVerifiedAt, and requestPacketPolicyHash identity production evidence fields; platformRequestPacket.submission.productionEvidenceArtifactDigestPolicy records the sha256 external-evidence-artifact digest scope, required evidence IDs, institution custody, and no raw artifact or secret upload policy; platformRequestPacket.submission.responseAuditHeaders lists the response headers platform owners should archive; responseAuditHeaders include overall identity production gate headers for status, release blocking, missing evidence, cutover checklist, cutover blockers, and artifact completeness summary; platformRequestPacket.submission.receiptArchivePolicy lists required archive headers and response body paths, including identityProductionEvidence.institutionActionPlan, current-validation-snapshot, and platform-submission-inputs digest scopes; stableSubmissionDigestInputFields includes productionEvidenceArtifactDigest so archive reviewers can verify the stable submission digest binds the institution-owned external artifact digest; receiptArchiveManifest lists per-decision receipt digest headers, stable submission digest headers, archive body paths, and ready-for-archive status, plus production evidence artifact digest and missingArchiveInputCounts blocker categories; receiptArchiveManifest records productionEvidenceArtifactDigestAlgorithm=sha256 and productionEvidenceArtifactDigestScope=external-evidence-artifact; receiptArchiveManifest records productionEvidenceArtifactDigestCoveredEvidenceIds so release reviewers can see which submitted evidence IDs the external artifact digest covers; receiptArchiveManifest records productionEvidenceArtifactDigestCompletenessStatus so release reviewers can distinguish partial artifact coverage from complete decision evidence; platformRequestPacket.requests[].submissionTemplate.submissionDraft provides redacted platform-owner JSON bodies with productionEvidenceArtifactDigest placeholders; platformRequestPacket.evidence includes requestPacketPolicyHash and requestPacketPolicyBinding, plus productionEvidenceArtifactDigest archive requirements; platformRequestPacket requests include submissionTemplate.ownerNamePolicy, submissionTemplate.productionEvidenceVerifiedAtPolicy, and submissionTemplate.rotationFreshnessPolicy; submissionVerifier.evidence repeats requestPacketPolicyHash and requestPacketPolicyBinding for release reviewers; cutoverChecklist summarizes IdP tenant, SSO secret custody, SCIM/IdP ownership, and identity secret rotation blockers.",
    responses: ["sena-enterprise-identity-production-evidence/v1", "sena-enterprise-identity-production-evidence-manifest/v1", "sena-enterprise-identity-platform-decision-request-packet/v1", "sena-enterprise-identity-institution-action-plan/v1", "sena-enterprise-identity-submission-matrix/v1", "sena-enterprise-identity-owner-runbook/v1", "sena-enterprise-identity-submission-verifier/v1", "sena-enterprise-identity-rotation-freshness/v1", "sena-enterprise-identity-receipt-archive-manifest/v1", "sena-enterprise-identity-cutover-checklist/v1", "sena-enterprise-platform-decision-production-evidence-receipt/v1", "sena-enterprise-platform-decision-register/v1", "sena-enterprise-capability-audit/v1"]
  },
  {
    id: "sena-ops-go-live-rehearsal",
    group: "ops",
    path: "/api/sena/ops/go-live-rehearsal",
    methods: ["GET", "POST"],
    auth: "session-or-ops-bearer",
    summary: "Return the go-live rehearsal dossier that links deployment readiness, native adapter certification, SaaS operations readiness, rollback drill evidence, post-cutover monitoring, and release-gate verification.",
    request: "GET ?teamId=... returns a team-scoped go-live rehearsal dossier with identityProductionHandoff for IdP, SCIM, rotation blockers, and cutoverChecklist; GET ?artifact=rollback-drill or ?artifact=post-cutover-monitor or ?attestations=1&teamId=...; GET ?artifact=post-cutover-monitor includes latestObservation with sena-enterprise-post-cutover-observations/v1 readiness evidence; session requests require teamId; GET responses include x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-request-blockers, x-sena-identity-receipt-review-requests, and x-sena-identity-production-blocking-decisions from identityProductionHandoff; POST JSON { teamId, environment, releaseVersion, decision, attesterName, attesterRole, notes, checklist } returns an attestation with identityProductionHandoffSnapshot, identityProductionHandoffSnapshot.dossierDigest, identityProductionHandoffSnapshot.receiptArchiveManifest, and latestReleaseGateSnapshot.identityCutoverChecklistStatus / identityCutoverChecklistBlockingItems; POST JSON { action: start-post-cutover-observation, teamId, environment, releaseVersion } starts a fixed 60-minute sena-enterprise-post-cutover-observation/v1 after release, rollback, ops, and alert preflight; POST JSON { action: record-post-cutover-sample, teamId, observationId } records an observation sample; POST JSON { action: complete-post-cutover-observation, teamId, observationId, acknowledgedWarningAlertIds } completes the observation only after the 60-minute window and warning acknowledgement rules pass; POST responses include x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-request-blockers, x-sena-identity-receipt-review-requests, and x-sena-identity-production-blocking-decisions from identityProductionHandoffSnapshot; approved attestation is rejected until postCutoverMonitor.status is ready, while conditional and blocked attestations remain audit records; GET and POST responses include x-sena-identity-receipt-archive-missing-inputs and x-sena-identity-production-evidence-artifact-completeness for final cutover automation; GET and POST responses include x-sena-identity-institution-action-plan-digest, x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, and x-sena-identity-institution-action-plan-submission-path so final cutover automation can route unresolved institution IdP and provisioning owner lanes; GET and POST responses include x-sena-identity-owner-runbook-digest, x-sena-identity-owner-runbook-blocking, x-sena-identity-owner-runbook-preflight-checks, x-sena-identity-owner-runbook-submission-steps, and x-sena-identity-owner-runbook-receipt-archive-steps so final cutover automation can bind the owner-runbook artifact version without parsing the handoff body; identityProductionHandoff.institutionActionPlan.submissionMatrix preserves the owner-lane evidence submission map for final cutover review; identityProductionHandoff.institutionActionPlan.ownerRunbooks preserves institution owner preflight, submission, receipt archive, and release blocker runbooks for final cutover review; latestReleaseGateSnapshot.identityReceiptArchiveDecisions preserves submittedEvidenceDigest and productionEvidenceArtifactDigest for final go-live archive capture; audit detail preserves latestReleaseGateIdentityReceiptArchiveDecisions as a JSON string for SIEM/archive review.",
    responses: ["sena-enterprise-go-live-rehearsal/v1", "sena-enterprise-release-gate-draft/v1", "sena-enterprise-go-live-rollback-drill/v1", "sena-enterprise-go-live-monitor/v1", "sena-enterprise-post-cutover-observation/v1", "sena-enterprise-post-cutover-observations/v1", "sena-enterprise-go-live-attestation/v1", "sena-enterprise-go-live-attestations/v1", "sena-enterprise-deployment-readiness/v1", "sena-enterprise-native-adapter-certification/v1", "sena-enterprise-saas-operations-readiness/v1", "sena-enterprise-release-gate-review/v1", "sena-enterprise-identity-production-evidence/v1", "sena-enterprise-identity-cutover-checklist/v1", "sena-enterprise-identity-institution-action-plan/v1", "sena-enterprise-identity-submission-matrix/v1", "sena-enterprise-identity-owner-runbook/v1"]
  },
  {
    id: "sena-ops-platform-decisions",
    group: "ops",
    path: "/api/sena/ops/platform-decisions",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "List or record team-scoped platform decision acceptance records for production bridge/native-adapter ownership.",
    request: "GET ?teamId=... returns a team-scoped platformDecisionRegister; GET responses include identityProductionEvidence as a redacted pre-submission packet with platformRequestPacket, cutoverChecklist, and receiptArchiveManifest plus identityProductionEvidence.institutionActionPlan.submissionMatrix and identityProductionEvidence.institutionActionPlan.ownerRunbooks for platform-owner submission tooling; GET responses include x-sena-identity-request-packet-policy-hash so platform-owner submission scripts can echo the current policy hash; GET responses include x-sena-identity-request-packet-policy-binding so platform-owner submission scripts can preflight current, stale, or missing IdP/provisioning receipt binding; GET responses include refreshed x-sena-identity-production-evidence-digest, x-sena-identity-evidence-binding-digest, and x-sena-identity-receipt-archive-manifest-digest for pre-submission archive capture; GET responses include x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-missing-evidence-ids, x-sena-identity-cutover-checklist, x-sena-identity-cutover-blockers, and x-sena-identity-production-evidence-artifact-completeness-summary for pre-submission identity production gate feedback; GET responses include x-sena-identity-request-blockers, x-sena-identity-receipt-review-requests, x-sena-identity-production-blocking-decisions for platform-owner scripts that need blocker counts without parsing the dossier body; GET and POST responses include x-sena-identity-institution-action-plan-digest, x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, and x-sena-identity-institution-action-plan-submission-path so institution IdP and provisioning owner lane scripts can route production evidence work from headers; GET and POST responses include x-sena-identity-owner-runbook-digest, x-sena-identity-owner-runbook-blocking, x-sena-identity-owner-runbook-preflight-checks, x-sena-identity-owner-runbook-submission-steps, and x-sena-identity-owner-runbook-receipt-archive-steps so institution IdP and provisioning owner lane scripts can bind the owner-runbook artifact version without parsing the dossier body; GET responses include x-sena-identity-receipt-archive-missing-inputs and x-sena-identity-production-evidence-artifact-completeness as overall receipt archive gate headers; POST JSON { teamId, decisionId, status, acceptedBridge?, ownerName, ownerRole, environment, evidenceUrl?, productionEvidenceIds?, productionEvidenceArtifactDigest?, productionEvidenceVerifiedAt?, requestPacketPolicyHash?, notes }; POST responses include refreshed identityProductionEvidence for immediate verifier/blocker feedback; POST responses include x-sena-identity-request-packet-policy-hash, x-sena-identity-request-packet-policy-binding, and x-sena-identity-production-verifier-status for platform-owner audit capture; POST responses include x-sena-identity-production-receipt-digest; POST responses include x-sena-identity-submitted-evidence-digest as the stable platform-submission-inputs digest; stable platform-submission-inputs digest covers productionEvidenceArtifactDigest, submitted evidence IDs, redacted evidence URL hashes, request packet policy hash, and technical binding inputs; POST responses include x-sena-identity-production-evidence-artifact-digest for the platform-supplied external evidence artifact digest; POST responses include x-sena-identity-production-evidence-artifact-covered-ids and x-sena-identity-production-evidence-artifact-coverage for evidence-id coverage archive capture; POST responses include x-sena-identity-production-evidence-artifact-completeness for refreshed overall receipt archive gate capture; POST responses include x-sena-identity-submitted-decision-production-evidence-artifact-completeness for complete versus partial submitted-decision evidence archive capture; POST responses include x-sena-identity-evidence-url-host-binding, x-sena-identity-technical-binding, x-sena-identity-technical-readiness, x-sena-identity-rotation-freshness, x-sena-identity-rotation-expired-evidence, and x-sena-identity-rotation-due-soon-evidence; POST responses include x-sena-identity-receipt-archive-status and x-sena-identity-receipt-archive-missing-inputs; POST responses include x-sena-identity-submitted-decision-receipt-archive-missing-inputs for the submitted decision; POST responses include x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-missing-evidence-ids, x-sena-identity-cutover-checklist, x-sena-identity-cutover-blockers, and x-sena-identity-production-evidence-artifact-completeness-summary for refreshed overall identity production gate feedback; POST responses include x-sena-identity-request-blockers, x-sena-identity-receipt-review-requests, x-sena-identity-production-blocking-decisions for refreshed overall identity production gate feedback; POST responses include x-sena-identity-receipt-archive-missing-inputs and x-sena-identity-production-evidence-artifact-completeness as refreshed overall receipt archive gate headers; POST responses include refreshed x-sena-identity-production-evidence-digest, x-sena-identity-evidence-binding-digest, and x-sena-identity-receipt-archive-manifest-digest for immediate handoff archive capture; identity evidenceUrl must be HTTPS, non-local, non-private, separate from the SENA application origin, and returned only as evidenceUrlHash plus redacted evidenceUrlHostHash/evidenceUrlAllowedHostHash binding hashes; production NODE_ENV requires SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS for identity evidenceUrl acceptance; identity productionEvidenceIds require a production or pilot-production environment; IdP productionEvidenceIds include idp-tenant-approval, idp-callback-approval, sso-provider-secrets, sso-secret-store-reference, and sso-secret-rotation; provisioning productionEvidenceIds include provisioning-owner, scim-or-idp-ownership, bearer-token-rotation, and lifecycle-guardrails; productionEvidenceArtifactDigest must be a SHA-256 hex digest and is required for receipt archive readiness when productionEvidenceIds include identity production evidence ids; productionEvidenceArtifactDigest is listed in platformRequestPacket.submission.requiredBodyFields so platform-owner scripts submit the external evidence artifact digest with every identity production decision; missing productionEvidenceArtifactDigest is rejected when identity production evidence ids are submitted; productionEvidenceArtifactDigestPolicy keeps external evidence artifacts in institution custody and rejects raw artifact or secret uploads; productionEvidenceVerifiedAt is required when productionEvidenceIds include identity production evidence ids; requestPacketPolicyHash must echo the current platformRequestPacket.evidence requestPacketPolicyHash for identity production evidence submissions; productionEvidenceVerifiedAt must not be in the future; ownerNamePolicy requires a specific institution identity platform owner; productionEvidenceVerifiedAtPolicy requires a valid past-or-present timestamp; rotationFreshnessPolicy lists SSO and bearer-token rotation max-age and warning windows; production NODE_ENV requires SENA_SSO_*_CLIENT_SECRET_VERSION and SENA_PROVISIONING_TOKEN_VERSION as non-secret rotation identifiers stored only as binding hashes; production NODE_ENV requires SENA_SSO_INSTITUTION_CLIENT_SECRET_REF and SENA_PROVISIONING_TOKEN_SECRET_REF as non-secret institution secret-store references stored only as binding hashes; production NODE_ENV requires SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS as a non-secret institution-approved rotation cadence from 1 to 180 days; production NODE_ENV requires SENA_SSO_INSTITUTION_TENANT_ID as a non-secret IdP tenant/app-registration binding stored only as a hash; production NODE_ENV requires SENA_IDENTITY_LIFECYCLE_OWNER_MODE to be scim, idp, or hybrid for SCIM/IdP lifecycle ownership binding; production evidence receipts include requestPacketPolicyHash, requestPacketPolicyBindingStatus; production evidence receipts include productionEvidenceArtifactDigest; production evidence receipts include productionEvidenceArtifactDigestAlgorithm=sha256 and productionEvidenceArtifactDigestScope=external-evidence-artifact; production evidence receipts include productionEvidenceArtifactDigestCoveredEvidenceIds and productionEvidenceArtifactDigestCoverageStatus for submitted evidence-id coverage; production evidence receipts include productionEvidenceArtifactDigestCompletenessStatus for complete versus partial submitted-decision evidence; production evidence receipts include responseAuditHeaders and receiptArchiveBodyPaths; production evidence receipts include evidenceUrlHostBindingStatus, technicalBindingStatus, rotationFreshnessChecks, rotationExpiredEvidenceIds, and rotationDueSoonEvidenceIds for SSO and bearer-token rotation evidence.",
    responses: ["sena-enterprise-platform-decision-acceptances/v1", "sena-enterprise-platform-decision-acceptance/v1", "sena-enterprise-platform-decision-production-evidence-receipt/v1", "sena-enterprise-platform-decision-register/v1", "sena-enterprise-identity-production-evidence/v1"]
  },
  {
    id: "sena-ops-release-gate",
    group: "ops",
    path: "/api/sena/ops/release-gate",
    methods: ["GET", "POST"],
    auth: "session",
    summary: "List or record team-scoped release gate reviews with deployment-readiness, platform-decision, and identity production evidence snapshots.",
    request: "POST JSON { teamId, environment, releaseVersion, decision, approverName, approverRole, notes, verificationCommand, verificationEvidence? }; responses include identityProductionSnapshot.cutoverChecklist for IdP tenant, SSO secret custody, SCIM/IdP ownership, and identity secret rotation release blockers; responses include identityProductionSnapshot.receiptArchiveManifest and identityProductionSnapshot.dossierDigest so reviewers can archive receipt manifest digests with release approval; responses include identityProductionSnapshot.institutionActionPlan so release reviewers can archive the redacted institution owner lane plan with the approval record; identityProductionSnapshot.institutionActionPlan.submissionMatrix maps each production evidence ID to its owner lane for release approval review; identityProductionSnapshot.institutionActionPlan.ownerRunbooks maps each institution owner lane to preflight, submission, receipt archive, and release blocker review for release approval review; identityProductionSnapshot.receiptArchiveManifest decisions preserve submittedEvidenceDigest and productionEvidenceArtifactDigest for release approval archive capture; release-gate identity snapshots expose platformRequestPacket.evidence requestPacketPolicyHash/requestPacketPolicyBinding so reviewers can verify the current identity request policy before approval; POST and GET responses include x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-request-blockers, x-sena-identity-receipt-review-requests, and x-sena-identity-production-blocking-decisions from the release-gate identityProductionSnapshot; POST and GET responses include x-sena-identity-receipt-archive-missing-inputs and x-sena-identity-production-evidence-artifact-completeness from the release-gate identityProductionSnapshot; POST and GET responses include x-sena-identity-institution-action-plan-digest, x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, and x-sena-identity-institution-action-plan-submission-path for release-approval archive routing by institution owner lane; POST and GET responses include x-sena-identity-owner-runbook-digest, x-sena-identity-owner-runbook-blocking, x-sena-identity-owner-runbook-preflight-checks, x-sena-identity-owner-runbook-submission-steps, and x-sena-identity-owner-runbook-receipt-archive-steps for release-approval archive binding of the owner-runbook artifact version.",
    responses: ["sena-enterprise-release-gate-reviews/v1", "sena-enterprise-release-gate-review/v1", "sena-enterprise-deployment-readiness/v1", "sena-enterprise-platform-decision-register/v1", "sena-enterprise-identity-production-evidence/v1", "sena-enterprise-identity-submission-verifier/v1", "sena-enterprise-identity-rotation-freshness/v1", "sena-enterprise-identity-cutover-checklist/v1", "sena-enterprise-identity-institution-action-plan/v1", "sena-enterprise-identity-submission-matrix/v1", "sena-enterprise-identity-owner-runbook/v1"]
  },
  {
    id: "sena-ops-alerts",
    group: "ops",
    path: "/api/sena/ops/alerts",
    methods: ["GET", "POST"],
    auth: "session-or-ops-bearer",
    summary: "Return machine-readable firing alerts or deliver signed alert webhooks.",
    request: "GET returns firing ops alerts; GET responses include x-sena-ops-alert-status, x-sena-ops-alert-firing, x-sena-identity-alert-count, x-sena-identity-alert-blockers, and x-sena-identity-alert-severity so deployment monitors can escalate unresolved institution IdP tenant approval, SSO secret custody, SCIM/IdP ownership, and secret rotation readiness alerts without parsing the alert body; POST JSON { action: deliver }",
    responses: ["sena-enterprise-ops-alerts/v1", "sena-enterprise-ops-alert-delivery/v1"]
  },
  {
    id: "sena-provisioning",
    group: "provisioning",
    path: "/api/sena/provisioning",
    methods: ["GET", "POST"],
    auth: "provisioning-bearer",
    summary: "Inspect provisioning configuration or upsert institution-managed teams, users, identities, and memberships.",
    request: "POST JSON { teams?, users?, memberships?, ssoIdentities? }",
    responses: ["sena-enterprise-provisioning-status/v1", "sena-enterprise-provisioning/v1"]
  },
  {
    id: "sena-scim-config",
    group: "provisioning",
    path: "/api/sena/scim/v2/ServiceProviderConfig",
    methods: ["GET"],
    auth: "scim-bearer",
    summary: "Return SCIM 2.0 ServiceProviderConfig for the SENA bridge.",
    request: "GET returns SCIM 2.0 ServiceProviderConfig with urn:sena:params:scim:schemas:extension:identity-production:2.0:ServiceProviderConfig carrying sena-scim-identity-production-gate/v1 redacted identity production gate status; responses include x-sena-scim-production-owner-gate, x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-request-blockers, x-sena-identity-production-blocking-decisions, x-sena-identity-provisioning-missing-evidence, x-sena-identity-provisioning-missing-technical-prerequisites, x-sena-identity-lifecycle-owner-mode, x-sena-identity-rotation-freshness, x-sena-identity-institution-action-plan-digest, x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, x-sena-identity-institution-action-plan-submission-path, x-sena-identity-owner-runbook-digest, x-sena-identity-owner-runbook-blocking, x-sena-identity-owner-runbook-preflight-checks, x-sena-identity-owner-runbook-submission-steps, and x-sena-identity-owner-runbook-receipt-archive-steps so SCIM clients and platform owners can block production provisioning until SCIM/IdP ownership, lifecycle guardrails, bearer-token rotation, and secret rotation evidence are accepted.",
    responses: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig", "sena-scim-identity-production-gate/v1"]
  },
  {
    id: "sena-scim-users",
    group: "provisioning",
    path: "/api/sena/scim/v2/Users",
    methods: ["GET", "POST"],
    auth: "scim-bearer",
    summary: "List or create SCIM users with SENA enterprise role extensions.",
    request: "SCIM User resource",
    responses: ["urn:ietf:params:scim:schemas:core:2.0:User", "ListResponse"]
  },
  {
    id: "sena-scim-user-resource",
    group: "provisioning",
    path: "/api/sena/scim/v2/Users/{resourceId}",
    methods: ["PUT", "PATCH"],
    auth: "scim-bearer",
    summary: "Replace or patch a SCIM user resource and mapped SENA memberships.",
    request: "SCIM User resource or PATCH operations",
    responses: ["urn:ietf:params:scim:schemas:core:2.0:User"]
  },
  {
    id: "sena-scim-groups",
    group: "provisioning",
    path: "/api/sena/scim/v2/Groups",
    methods: ["GET", "POST"],
    auth: "scim-bearer",
    summary: "List or create SCIM groups mapped to SENA teams and roles.",
    request: "SCIM Group resource",
    responses: ["urn:ietf:params:scim:schemas:core:2.0:Group", "ListResponse"]
  },
  {
    id: "sena-scim-group-resource",
    group: "provisioning",
    path: "/api/sena/scim/v2/Groups/{resourceId}",
    methods: ["PUT", "PATCH"],
    auth: "scim-bearer",
    summary: "Replace or patch a SCIM group resource and mapped team memberships.",
    request: "SCIM Group resource or PATCH operations",
    responses: ["urn:ietf:params:scim:schemas:core:2.0:Group"]
  }
];

function methodCount(endpoints = SENA_API_ENDPOINTS) {
  return endpoints.reduce((total, endpoint) => total + endpoint.methods.length, 0);
}

function groupedEndpointCounts() {
  return SENA_API_GROUPS.map((group) => {
    const endpoints = SENA_API_ENDPOINTS.filter((endpoint) => endpoint.group === group.id);
    return {
      ...group,
      endpointCount: endpoints.length,
      methodCount: methodCount(endpoints)
    };
  });
}

export function buildSenaApiDocumentation(input: { baseUrl?: string } = {}) {
  return {
    schemaVersion: "sena-api-documentation/v1" as const,
    generatedAt: new Date().toISOString(),
    baseUrl: input.baseUrl ?? "",
    summary: {
      endpointCount: SENA_API_ENDPOINTS.length,
      methodCount: methodCount(),
      groupCount: SENA_API_GROUPS.length,
      openApiPath: "/api/sena/docs?format=openapi",
      coveragePolicy: "Every Next route method under app/api must be represented by this manifest.",
      csrfPolicy: "Session-authenticated POST, PUT, PATCH, and DELETE requests require x-sena-csrf-token from /api/auth/csrf. Bearer-token service APIs do not use CSRF."
    },
    groups: groupedEndpointCounts(),
    endpoints: SENA_API_ENDPOINTS
  };
}

function securityFor(auth: SenaApiAuthMode) {
  if (auth === "public") return [];
  if (auth === "provisioning-bearer") return [{ provisioningBearer: [] }];
  if (auth === "scim-bearer") return [{ scimBearer: [] }];
  if (auth === "session-or-ops-bearer") return [{ sessionCookie: [] }, { opsBearer: [] }];
  return [{ sessionCookie: [] }];
}

function csrfRequiredForMethod(endpoint: SenaApiEndpoint, method: SenaApiMethod) {
  return method !== "GET" && (endpoint.auth === "session" || endpoint.auth === "session-or-ops-bearer");
}

export function buildSenaOpenApiDocument(input: { serverUrl?: string } = {}) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of SENA_API_ENDPOINTS) {
    paths[endpoint.path] ??= {};
    for (const method of endpoint.methods) {
      paths[endpoint.path][method.toLowerCase()] = {
        tags: [SENA_API_GROUPS.find((group) => group.id === endpoint.group)?.title ?? endpoint.group],
        operationId: `${endpoint.id}-${method.toLowerCase()}`,
        summary: endpoint.summary,
        security: securityFor(endpoint.auth),
        ...(csrfRequiredForMethod(endpoint, method) ? {
          parameters: [
            {
              name: "x-sena-csrf-token",
              in: "header",
              required: endpoint.auth === "session",
              schema: { type: "string" },
              description: "Token returned by GET /api/auth/csrf for cookie-auth browser mutations. Bearer-token ops calls may omit it."
            }
          ]
        } : {}),
        ...(endpoint.request ? {
          requestBody: {
            required: !["GET", "DELETE"].includes(method),
            content: {
              "application/json": { schema: { type: "object", description: endpoint.request } },
              "multipart/form-data": { schema: { type: "object", description: endpoint.request } }
            }
          }
        } : {}),
        responses: {
          "200": {
            description: endpoint.responses.join("; "),
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  description: endpoint.responses.join("; ")
                }
              }
            }
          }
        }
      };
    }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "SENA Enterprise API",
      version: "1.0.0",
      summary: "Machine-readable contract for SENA auth, projects, analysis, imports, reliability, validation, exports, governance, ops, and provisioning APIs."
    },
    servers: [{ url: input.serverUrl ?? "" }],
    tags: SENA_API_GROUPS.map((group) => ({ name: group.title, description: group.description })),
    paths,
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "sena_session"
        },
        opsBearer: {
          type: "http",
          scheme: "bearer",
          description: "Set SENA_OPS_TOKEN for deployment monitors."
        },
        provisioningBearer: {
          type: "http",
          scheme: "bearer",
          description: "Set SENA_PROVISIONING_TOKEN for provisioning and SCIM bridges."
        },
        scimBearer: {
          type: "http",
          scheme: "bearer",
          description: "Same bearer-token mechanism as the provisioning bridge."
        }
      }
    }
  };
}
