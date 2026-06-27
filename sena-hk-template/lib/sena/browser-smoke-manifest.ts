import { SENA_AUTH_PAGE_MANIFEST } from "./auth-page-manifest";
import { SENA_SCHEMA_VERSIONS } from "./schema-registry";

export const SENA_BROWSER_SMOKE_MANIFEST = {
  productionVerifier: {
    steps: {
      auth: {
        exportName: "verifySenaAuthBrowserSmoke",
        label: "Verify auth browser smoke"
      },
      sso: {
        exportName: "verifySenaSsoBrowserSmoke",
        label: "Verify SSO browser smoke",
        env: ["SENA_ALLOW_LOCAL_SSO_FALLBACK"]
      },
      enterpriseApi: {
        exportName: "verifySenaEnterpriseApiBrowserSmoke",
        label: "Verify enterprise API browser smoke",
        env: ["SENA_PROVISIONING_TOKEN"],
        provisioningTokenFallback: "sena-pilot-provisioning-token"
      },
      rbacCollaboration: {
        exportName: "verifySenaRbacCollaborationBrowserSmoke",
        label: "Verify RBAC collaboration browser smoke"
      },
      reliability: {
        exportName: "verifySenaReliabilityBrowserSmoke",
        label: "Verify reliability browser smoke"
      },
      validationClaim: {
        exportName: "verifySenaValidationClaimBrowserSmoke",
        label: "Verify validation claim browser smoke"
      }
    }
  },
  auth: {
    pages: [SENA_AUTH_PAGE_MANIFEST.register.path, SENA_AUTH_PAGE_MANIFEST.login.path],
    selectors: {
      register: SENA_AUTH_PAGE_MANIFEST.register.selectors,
      login: SENA_AUTH_PAGE_MANIFEST.login.selectors
    },
    routes: ["/api/auth/me"],
    headers: [
      "x-sena-auth-flow",
      "x-sena-auth-session-id",
      "x-sena-auth-team-id"
    ],
    flows: ["password-register", "password-login"]
  },
  sso: {
    routes: [
      "/api/auth/sso?status=1&preflight=1",
      "/api/auth/sso",
      "/api/auth/me"
    ],
    schemaVersions: [
      SENA_SCHEMA_VERSIONS.ssoProviderStatus,
      SENA_SCHEMA_VERSIONS.enterpriseSsoPreflight,
      SENA_SCHEMA_VERSIONS.enterpriseSsoFallbackPolicy,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionGateSummary
    ],
    identityProductionGateField: "identityProductionGate",
    providers: ["institution", "orcid", "google"],
    headers: [
      "x-sena-identity-institution-action-plan-digest",
      "x-sena-auth-flow",
      "x-sena-sso-provider",
      "x-sena-sso-mode",
      "x-sena-auth-session-id",
      "x-sena-auth-team-id"
    ],
    flows: ["sso-local-fallback"],
    modes: ["local-pilot-fallback"],
    redactionFlags: ["secretValuesExcluded"]
  },
  enterpriseApi: {
    routes: [
      "/api/sena/scim/v2/ServiceProviderConfig",
      "/api/auth/csrf",
      "/api/sena/ops/platform-decisions",
      "/api/sena/import",
      "/api/sena/exports/publication"
    ],
    scimExtensionSchema: "urn:sena:params:scim:schemas:extension:identity-production:2.0:ServiceProviderConfig",
    schemaVersions: [
      SENA_SCHEMA_VERSIONS.scimIdentityProductionGate,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence,
      SENA_SCHEMA_VERSIONS.enterpriseIdentitySubmissionMatrix,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityOwnerRunbook,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityCutoverChecklist
    ],
    headers: [
      "x-sena-scim-production-owner-gate",
      "x-sena-identity-institution-action-plan-digest",
      "x-sena-identity-owner-runbook-digest",
      "x-sena-identity-owner-runbook-blocking",
      "x-sena-identity-owner-runbook-preflight-checks",
      "x-sena-auth-membership-role",
      "x-sena-import-run-id",
      "x-sena-project-id",
      "x-sena-analysis-run-id",
      "x-sena-import-profiles",
      "x-sena-publication-package-sha256",
      "x-sena-publication-formats"
    ],
    expectedRoleEvidence: "Expected owner registration role",
    requestBindings: [
      "{ requiredFormats: requiredPublicationFormats, teamId, provisioningToken }",
      "provisioningToken: bearerToken",
      "Bearer ${bearerToken}"
    ],
    evidenceFields: [
      "identityProductionEvidence",
      "institutionActionPlan?.submissionMatrix",
      "submissionMatrix.rows",
      "institutionActionPlan?.ownerRunbooks",
      "ownerRunbooks.runbooks",
      "ownerRunbooks.digest",
      "ownerRunbooks.summary.blockingRunbooks",
      "platformRequestPacket.summary.blockingRequests",
      "submissionVerifier.summary.incompleteDecisions",
      "cutoverChecklist",
      "cutoverChecklist.summary.blockingItems"
    ],
    cutoverItems: [
      "idp-tenant-approval",
      "sso-secret-custody",
      "scim-idp-ownership",
      "identity-secret-rotation"
    ],
    importProfiles: ["cleaned-transcript"],
    publicationPackageFormat: "package",
    publicationFormats: ["svg", "png", "xlsx", "docx", "pdf"],
    formActionField: "action",
    createProjectAction: "create-project",
    redactionFlags: ["secretValuesExcluded", "evidenceUrlValuesExcluded"]
  },
  rbacCollaboration: {
    routes: [
      "/api/sena/team/invitations",
      "/api/sena/projects",
      "/api/sena/projects/${projectId}",
      "/api/sena/projects/${projectId}/collaboration",
      "/api/sena/projects/${projectId}/collaboration/stream"
    ],
    headers: [
      "x-sena-invitation-id",
      "x-sena-invitation-status",
      "x-sena-membership-role",
      "x-sena-collaboration-stream-auth"
    ],
    collaborationActions: ["presence", "comment", "resolve-comment"],
    roles: ["reviewer"],
    flows: ["session-rbac-project-read"]
  },
  reliability: {
    routes: [
      "/api/sena/reliability",
      "/api/sena/validation/claim-package",
      "/api/sena/projects/${projectId}/collaboration"
    ],
    schemaVersions: [
      SENA_SCHEMA_VERSIONS.reliabilityJsonRequest,
      SENA_SCHEMA_VERSIONS.codingReliabilityDashboard,
      SENA_SCHEMA_VERSIONS.reliabilityAdjudicationResponse,
      SENA_SCHEMA_VERSIONS.reliabilityRunReview
    ],
    headers: [
      "x-sena-reliability-run-id",
      "x-sena-mean-pairwise-kappa",
      "x-sena-krippendorff-alpha",
      "x-sena-reliability-coverage-rate",
      "x-sena-unresolved-disagreements"
    ],
    reviewStatuses: ["approved"],
    evidencePaths: ["evidence.reliability"],
    dashboardSelector: "reliability-dashboard"
  },
  validationClaim: {
    routes: [
      "/api/sena/validation/group-comparison",
      "/api/sena/validation/expert-review",
      "/api/sena/validation/claim-package"
    ],
    schemaVersions: [
      SENA_SCHEMA_VERSIONS.groupComparisonSuite,
      SENA_SCHEMA_VERSIONS.validationRunReview,
      SENA_SCHEMA_VERSIONS.expertReviewResponse,
      SENA_SCHEMA_VERSIONS.enterpriseClaimEvidencePackage
    ],
    headers: [
      "x-sena-validation-run-id",
      "x-sena-validation-preregistration-sha256",
      "x-sena-validation-parity-status",
      "x-sena-formal-inference-status",
      "x-sena-expert-review-id"
    ],
    claimStatuses: ["claim-ready-with-limits"],
    evidencePaths: ["evidence.validation", "evidence.expertReview"],
    artifacts: [
      "validation-preregistration-plan",
      "validation-parity-evidence",
      "domain-expert-review"
    ]
  }
} as const;
