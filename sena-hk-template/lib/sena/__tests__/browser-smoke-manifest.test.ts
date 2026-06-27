import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SENA_AUTH_PAGE_MANIFEST,
  SENA_ENTERPRISE_PASSWORD_POLICY_MANIFEST
} from "../auth-page-manifest";
import { SENA_BROWSER_SMOKE_MANIFEST } from "../browser-smoke-manifest";
import { buildSenaApiDocumentation } from "../api-docs";
import { SENA_SCHEMA_VERSIONS } from "../schema-registry";
import { SENA_WORKSPACE_API_ROUTES } from "../../../components/sena/workspace/api-client";

describe("SENA browser smoke manifest", () => {
  it("keeps Temporal Fusion visual checks covered rather than deferred in the pilot verifier", () => {
    const verifierSource = readFileSync(new URL("../../../scripts/verify-sena-pilot.mjs", import.meta.url), "utf8");

    expect(verifierSource).not.toContain("deferredPlotViewSectionIds");
    expect(verifierSource).not.toContain("deferredPlotViewVisualCheckPrefixes");
    expect(verifierSource).toContain("browserSmokeCoveredPlotViewVisualCheckIds");
    expect(verifierSource).toContain("\"temporal-fusion-arc\"");
    expect(verifierSource).toContain("\"temporal-transition-evidence\"");
    expect(verifierSource).toContain("verifyInteractiveVisualCheckCoverage");
  });

  it("wires login remember-me to enterprise session policy", () => {
    expect(SENA_AUTH_PAGE_MANIFEST.login.path).toBe("/login");
    expect(SENA_AUTH_PAGE_MANIFEST.login.selectors.rememberSession).toBe("login-remember-session");
    expect(SENA_AUTH_PAGE_MANIFEST.login.rememberSession).toEqual({
      stateKey: "rememberSession",
      requestBodyField: "rememberSession"
    });
  });

  it("exposes stable auth form selectors for browser-level login and registration smoke", () => {
    expect(Object.values(SENA_AUTH_PAGE_MANIFEST.login.selectors)).toEqual(expect.arrayContaining([
      "login-form",
      "login-email",
      "login-password",
      "login-submit"
    ]));
    expect(Object.values(SENA_AUTH_PAGE_MANIFEST.register.selectors)).toEqual(expect.arrayContaining([
      "register-form",
      "register-full-name",
      "register-email",
      "register-organization",
      "register-password",
      "register-confirm-password",
      "register-terms",
      "register-submit"
    ]));
  });

  it("includes auth entry pages in the production browser smoke verifier", () => {
    expect(SENA_BROWSER_SMOKE_MANIFEST.productionVerifier.steps.auth).toMatchObject({
      exportName: "verifySenaAuthBrowserSmoke",
      label: "Verify auth browser smoke"
    });
    expect(SENA_BROWSER_SMOKE_MANIFEST.auth.pages).toEqual(expect.arrayContaining([
      "/register",
      "/login"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.auth.routes).toContain("/api/auth/me");
    expect(SENA_BROWSER_SMOKE_MANIFEST.auth.headers).toEqual(expect.arrayContaining([
      "x-sena-auth-flow",
      "x-sena-auth-session-id",
      "x-sena-auth-team-id"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.auth.flows).toEqual(expect.arrayContaining([
      "password-register",
      "password-login"
    ]));
    expect(Object.values(SENA_BROWSER_SMOKE_MANIFEST.auth.selectors.register)).toContain("register-submit");
    expect(Object.values(SENA_BROWSER_SMOKE_MANIFEST.auth.selectors.login)).toContain("login-remember-session");
  });

  it("includes SSO provider preflight and OAuth fallback sessions in the production browser smoke verifier", () => {
    expect(SENA_BROWSER_SMOKE_MANIFEST.productionVerifier.steps.sso).toMatchObject({
      exportName: "verifySenaSsoBrowserSmoke",
      label: "Verify SSO browser smoke",
      env: ["SENA_ALLOW_LOCAL_SSO_FALLBACK"]
    });
    expect(SENA_BROWSER_SMOKE_MANIFEST.sso.routes).toEqual(expect.arrayContaining([
      "/api/auth/sso?status=1&preflight=1",
      "/api/auth/sso",
      "/api/auth/me"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.sso.schemaVersions).toEqual(expect.arrayContaining([
      "sena-sso-provider-status/v1",
      "sena-enterprise-sso-preflight/v1",
      "sena-enterprise-sso-fallback-policy/v1",
      "sena-enterprise-identity-production-gate-summary/v1"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.sso.identityProductionGateField).toBe("identityProductionGate");
    expect(SENA_BROWSER_SMOKE_MANIFEST.sso.headers).toEqual(expect.arrayContaining([
      "x-sena-identity-institution-action-plan-digest",
      "x-sena-auth-flow",
      "x-sena-sso-provider",
      "x-sena-sso-mode",
      "x-sena-auth-session-id",
      "x-sena-auth-team-id"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.sso.providers).toEqual(expect.arrayContaining([
      "institution",
      "orcid",
      "google"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.sso.flows).toContain("sso-local-fallback");
    expect(SENA_BROWSER_SMOKE_MANIFEST.sso.modes).toContain("local-pilot-fallback");
    expect(SENA_BROWSER_SMOKE_MANIFEST.sso.redactionFlags).toContain("secretValuesExcluded");
  });

  it("includes enterprise import-to-publication APIs in the production browser smoke verifier", () => {
    expect(SENA_BROWSER_SMOKE_MANIFEST.productionVerifier.steps.enterpriseApi).toMatchObject({
      exportName: "verifySenaEnterpriseApiBrowserSmoke",
      label: "Verify enterprise API browser smoke",
      env: ["SENA_PROVISIONING_TOKEN"],
      provisioningTokenFallback: "sena-pilot-provisioning-token"
    });
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.routes).toEqual(expect.arrayContaining([
      "/api/sena/scim/v2/ServiceProviderConfig",
      "/api/auth/csrf",
      "/api/sena/ops/platform-decisions",
      "/api/sena/import",
      "/api/sena/exports/publication"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.scimExtensionSchema)
      .toBe("urn:sena:params:scim:schemas:extension:identity-production:2.0:ServiceProviderConfig");
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.schemaVersions).toEqual(expect.arrayContaining([
      "sena-scim-identity-production-gate/v1",
      "sena-enterprise-identity-production-evidence/v1",
      "sena-enterprise-identity-submission-matrix/v1",
      "sena-enterprise-identity-owner-runbook/v1",
      "sena-enterprise-identity-cutover-checklist/v1"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.headers).toEqual(expect.arrayContaining([
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
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.requestBindings).toEqual(expect.arrayContaining([
      "{ requiredFormats: requiredPublicationFormats, teamId, provisioningToken }",
      "provisioningToken: bearerToken",
      "Bearer ${bearerToken}"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.evidenceFields).toEqual(expect.arrayContaining([
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
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.cutoverItems).toEqual(expect.arrayContaining([
      "idp-tenant-approval",
      "sso-secret-custody",
      "scim-idp-ownership",
      "identity-secret-rotation"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.importProfiles).toContain("cleaned-transcript");
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.formActionField).toBe("action");
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.createProjectAction).toBe("create-project");
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.publicationPackageFormat).toBe("package");
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.publicationFormats).toEqual(expect.arrayContaining([
      "svg",
      "png",
      "xlsx",
      "docx",
      "pdf"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.redactionFlags).toEqual(expect.arrayContaining([
      "secretValuesExcluded",
      "evidenceUrlValuesExcluded"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.expectedRoleEvidence).toBe("Expected owner registration role");
  });

  it("includes RBAC team collaboration APIs in the production browser smoke verifier", () => {
    expect(SENA_BROWSER_SMOKE_MANIFEST.productionVerifier.steps.rbacCollaboration).toMatchObject({
      exportName: "verifySenaRbacCollaborationBrowserSmoke",
      label: "Verify RBAC collaboration browser smoke"
    });
    expect(SENA_BROWSER_SMOKE_MANIFEST.rbacCollaboration.routes).toEqual(expect.arrayContaining([
      "/api/sena/team/invitations",
      "/api/sena/projects",
      "/api/sena/projects/${projectId}",
      "/api/sena/projects/${projectId}/collaboration",
      "/api/sena/projects/${projectId}/collaboration/stream"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.rbacCollaboration.headers).toEqual(expect.arrayContaining([
      "x-sena-invitation-id",
      "x-sena-invitation-status",
      "x-sena-membership-role",
      "x-sena-collaboration-stream-auth"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.rbacCollaboration.roles).toContain("reviewer");
    expect(SENA_BROWSER_SMOKE_MANIFEST.rbacCollaboration.collaborationActions).toEqual(expect.arrayContaining([
      "presence",
      "comment",
      "resolve-comment"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.rbacCollaboration.flows).toContain("session-rbac-project-read");
  });

  it("includes reliability adjudication APIs in the production browser smoke verifier", () => {
    expect(SENA_BROWSER_SMOKE_MANIFEST.productionVerifier.steps.reliability).toMatchObject({
      exportName: "verifySenaReliabilityBrowserSmoke",
      label: "Verify reliability browser smoke"
    });
    expect(SENA_BROWSER_SMOKE_MANIFEST.reliability.routes).toEqual(expect.arrayContaining([
      "/api/sena/reliability",
      "/api/sena/validation/claim-package",
      "/api/sena/projects/${projectId}/collaboration"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.reliability.schemaVersions).toEqual(expect.arrayContaining([
      "sena-reliability-json-request/v1",
      "sena-coding-reliability-dashboard/v1",
      "sena-reliability-adjudication-response/v1",
      "sena-reliability-run-review/v1"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.reliability.headers).toEqual(expect.arrayContaining([
      "x-sena-reliability-run-id",
      "x-sena-mean-pairwise-kappa",
      "x-sena-krippendorff-alpha",
      "x-sena-reliability-coverage-rate",
      "x-sena-unresolved-disagreements"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.reliability.reviewStatuses).toContain("approved");
    expect(SENA_BROWSER_SMOKE_MANIFEST.reliability.evidencePaths).toContain("evidence.reliability");
    expect(SENA_BROWSER_SMOKE_MANIFEST.reliability.dashboardSelector).toBe("reliability-dashboard");
  });

  it("includes validation and expert-review claim readiness in the production browser smoke verifier", () => {
    expect(SENA_BROWSER_SMOKE_MANIFEST.productionVerifier.steps.validationClaim).toMatchObject({
      exportName: "verifySenaValidationClaimBrowserSmoke",
      label: "Verify validation claim browser smoke"
    });
    expect(SENA_BROWSER_SMOKE_MANIFEST.validationClaim.routes).toEqual(expect.arrayContaining([
      "/api/sena/validation/group-comparison",
      "/api/sena/validation/expert-review",
      "/api/sena/validation/claim-package"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.validationClaim.schemaVersions).toEqual(expect.arrayContaining([
      "sena-group-comparison-suite/v1",
      "sena-validation-run-review/v1",
      "sena-expert-review-response/v1",
      "sena-enterprise-claim-evidence-package/v1"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.validationClaim.headers).toEqual(expect.arrayContaining([
      "x-sena-validation-run-id",
      "x-sena-validation-preregistration-sha256",
      "x-sena-validation-parity-status",
      "x-sena-formal-inference-status",
      "x-sena-expert-review-id"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.validationClaim.claimStatuses).toContain("claim-ready-with-limits");
    expect(SENA_BROWSER_SMOKE_MANIFEST.validationClaim.evidencePaths).toEqual(expect.arrayContaining([
      "evidence.validation",
      "evidence.expertReview"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.validationClaim.artifacts).toEqual(expect.arrayContaining([
      "validation-preregistration-plan",
      "validation-parity-evidence",
      "domain-expert-review"
    ]));
  });

  it("shows SSO preflight evidence on auth entry pages", () => {
    const documentation = buildSenaApiDocumentation({ baseUrl: "https://sena.example.test" });
    const authSsoEndpoint = documentation.endpoints.find((endpoint) => endpoint.id === "auth-sso");

    expect(SENA_WORKSPACE_API_ROUTES.auth.ssoPreflight).toBe("/api/auth/sso?status=1&preflight=1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseSsoPreflight).toBe("sena-enterprise-sso-preflight/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseSsoFallbackPolicy).toBe("sena-enterprise-sso-fallback-policy/v1");
    expect(SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionGateSummary)
      .toBe("sena-enterprise-identity-production-gate-summary/v1");
    expect(authSsoEndpoint?.request).toEqual(expect.stringContaining("GET ?status=1&preflight=1&provider=google|orcid"));
    expect(authSsoEndpoint?.request).toEqual(expect.stringContaining("local pilot fallback follows sena-enterprise-sso-fallback-policy/v1"));
    expect(authSsoEndpoint?.request).toEqual(expect.stringContaining("identityProductionGate"));
    expect(authSsoEndpoint?.responses).toEqual(expect.arrayContaining([
      "sena-auth-sso-status/v1",
      "sena-enterprise-identity-production-gate-summary/v1",
      "sso_local_fallback_disabled"
    ]));
  });

  it("surfaces enterprise password policy on registration and reset pages", () => {
    expect(SENA_AUTH_PAGE_MANIFEST.register.passwordPolicy).toBe(SENA_ENTERPRISE_PASSWORD_POLICY_MANIFEST);
    expect(SENA_AUTH_PAGE_MANIFEST.resetPassword.passwordPolicy).toBe(SENA_ENTERPRISE_PASSWORD_POLICY_MANIFEST);
    expect(SENA_ENTERPRISE_PASSWORD_POLICY_MANIFEST).toMatchObject({
      testId: "enterprise-password-policy",
      minLength: 12
    });
    expect(SENA_ENTERPRISE_PASSWORD_POLICY_MANIFEST.requirements).toEqual(expect.arrayContaining([
      "At least 12 characters",
      "letters and numbers"
    ]));
  });
});
