import { describe, expect, it } from "vitest";
import {
  buildSenaApiDocumentation,
  buildSenaOpenApiDocument,
  SENA_API_ENDPOINTS
} from "../api-docs";
import { SENA_API_DOCS_SECTION_MANIFEST } from "../api-docs-section";
import { SENA_API_EVIDENCE_NOTES } from "../api-evidence-notes";
import { SENA_API_ENDPOINT_FACTS } from "../api-route-facts";
import { SENA_IMPLEMENTED_API_ROUTES } from "../api-route-manifest";
import { SENA_API_SURFACE_MORATORIUM } from "../api-surface-moratorium";

const identityOwnerRunbookHeaderList = "x-sena-identity-owner-runbook-digest, x-sena-identity-owner-runbook-blocking, x-sena-identity-owner-runbook-preflight-checks, x-sena-identity-owner-runbook-submission-steps, and x-sena-identity-owner-runbook-receipt-archive-steps";

describe("SENA API documentation contract", () => {
  it("renders the homepage API docs panel from the full endpoint group manifest", () => {
    expect(SENA_API_DOCS_SECTION_MANIFEST.testIds).toEqual({
      panel: "sena-api-docs-panel",
      group: "sena-api-docs-group",
      opsHandoff: "sena-api-docs-ops-handoff",
      endpointMatrix: "sena-api-docs-endpoint-matrix",
      endpointRow: "sena-api-docs-endpoint-row"
    });
    expect(SENA_API_DOCS_SECTION_MANIFEST.opsHandoffSchemas).toEqual(expect.arrayContaining([
      "sena-enterprise-organization-deployment/v1",
      "sena-enterprise-release-gate-reviews/v1"
    ]));
    expect(SENA_API_DOCS_SECTION_MANIFEST.groupCards.map((group) => group.id))
      .toEqual(SENA_API_DOCS_SECTION_MANIFEST.sourceGroups.map((group) => group.id));
    expect(SENA_API_DOCS_SECTION_MANIFEST.endpointRows).toHaveLength(SENA_API_ENDPOINTS.length);
    expect(SENA_API_DOCS_SECTION_MANIFEST.endpointRows.find((endpoint) => endpoint.id === "auth-login"))
      .toMatchObject({
        auth: "public",
        group: "auth",
        methods: "POST",
        responsesPreview: "sena-auth-login/v1 · sena-auth-mfa-challenge/v1"
      });
  });

  it("documents every implemented Next API route method", () => {
    const actual = SENA_IMPLEMENTED_API_ROUTES.flatMap((route) => (
      route.methods.map((method) => `${method} ${route.path}`)
    )).sort();
    const documented = SENA_API_ENDPOINTS.flatMap((endpoint) => (
      endpoint.methods.map((method) => `${method} ${endpoint.path}`)
    )).sort();

    expect(actual).toContain("GET /api/sena/docs");
    expect(SENA_IMPLEMENTED_API_ROUTES.find((route) => route.path === "/api/sena/docs"))
      .toMatchObject({
        id: "sena-docs",
        sourceFile: "app/api/sena/docs/route.ts",
        mutationProtection: "not-required"
      });
    expect(actual).toHaveLength(documented.length);
    expect(documented).toEqual(actual);
  });

  it("freezes the enterprise and ops API surface while analysis is decomposed along M1-M11 seams", () => {
    const frozenEndpointIds = SENA_API_ENDPOINT_FACTS
      .filter((endpoint) => SENA_API_SURFACE_MORATORIUM.freezePolicy.frozenGroups.includes(endpoint.group))
      .map((endpoint) => endpoint.id);

    expect(SENA_API_SURFACE_MORATORIUM).toMatchObject({
      schemaVersion: "sena-api-surface-moratorium/v1",
      sourceIssue: "SENA-014",
      freezePolicy: {
        deletionPolicy: "moratorium",
        routeChangePolicy: "additive-or-reviewed-only"
      },
      analysisResource: {
        currentEndpointId: "sena-analyze",
        currentPath: "/api/sena/analyze",
        currentKernelPackage: "@sena/kernel"
      }
    });
    expect(SENA_API_SURFACE_MORATORIUM.frozenEndpointIds).toEqual(frozenEndpointIds);
    expect(SENA_API_SURFACE_MORATORIUM.frozenEndpointIds).toEqual(expect.arrayContaining([
      "auth-mfa",
      "auth-sso",
      "sena-scim-users",
      "sena-ops-go-live-rehearsal",
      "sena-ops-release-gate"
    ]));
    expect(SENA_API_SURFACE_MORATORIUM.frozenEndpointIds).not.toContain("sena-analyze");
    expect(SENA_API_SURFACE_MORATORIUM.analysisResource.decompositionSeams.map((seam) => seam.id))
      .toEqual(["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9", "M10", "M11"]);
    expect(SENA_API_SURFACE_MORATORIUM.analysisResource.decompositionSeams.slice(1, 8).every((seam) => seam.kernelCovered))
      .toBe(true);
    expect(SENA_API_SURFACE_MORATORIUM.analysisResource.decompositionSeams.map((seam) => seam.status))
      .not.toContain("api-decomposition-candidate");
    expect(SENA_API_SURFACE_MORATORIUM.analysisResource.decompositionSeams.filter((seam) => seam.status === "api-boundary-present").map((seam) => seam.id))
      .toEqual(["M1", "M9", "M10", "M11"]);

    const documentation = buildSenaApiDocumentation({ baseUrl: "https://sena.example.test" });
    expect(documentation.surfaceMoratorium.schemaVersion).toBe(SENA_API_SURFACE_MORATORIUM.schemaVersion);
    expect(documentation.surfaceMoratorium.frozenEndpointIds.length).toBeGreaterThan(40);
  });

  it("keeps route facts, evidence notes, and renderer output separated", () => {
    const factsWithNotes = SENA_API_ENDPOINT_FACTS.filter((endpoint) => endpoint.evidenceNoteId);
    const documentation = buildSenaApiDocumentation({ baseUrl: "https://sena.example.test" });

    expect(factsWithNotes.length).toBeGreaterThan(30);
    for (const endpoint of factsWithNotes) {
      expect(endpoint).not.toHaveProperty("request");
      expect(SENA_API_EVIDENCE_NOTES[endpoint.evidenceNoteId!]).toBeTruthy();
      expect(documentation.endpoints.find((candidate) => candidate.id === endpoint.id)?.request)
        .toBe(SENA_API_EVIDENCE_NOTES[endpoint.evidenceNoteId!]);
    }
  });

  it("requires CSRF enforcement for documented session mutating routes", () => {
    const sessionMutatingRoutes = SENA_IMPLEMENTED_API_ROUTES.filter((route) => (
      (route.auth === "session" || route.auth === "session-or-ops-bearer") &&
      route.methods.some((method) => method !== "GET")
    ));

    expect(sessionMutatingRoutes.length).toBeGreaterThan(10);
    expect(sessionMutatingRoutes.map((route) => route.mutationProtection))
      .not.toContain("not-required");
    expect(sessionMutatingRoutes.every((route) => route.mutationProtection === "csrf-or-ops-mutation-access")).toBe(true);
    expect(sessionMutatingRoutes.find((route) => route.path === "/api/sena/projects/{projectId}/collaboration"))
      .toMatchObject({
        methods: ["GET", "POST"],
        mutationProtection: "csrf-or-ops-mutation-access"
      });
  });

  it("builds JSON and OpenAPI artifacts from the same manifest", () => {
    const documentation = buildSenaApiDocumentation({ baseUrl: "https://sena.example.test" });
    expect(documentation.schemaVersion).toBe("sena-api-documentation/v1");
    expect(documentation.summary.methodCount).toBeGreaterThan(50);
    expect(documentation.summary.csrfPolicy).toContain("x-sena-csrf-token");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-import")?.request)
      .toContain("action=create-project");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-import")?.request)
      .toContain("x-sena-import-run-id");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-import")?.request)
      .toContain("x-sena-import-cleaning-manifest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-import")?.request)
      .toContain("x-sena-analysis-run-id");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-collaboration-stream")?.summary)
      .toContain("project:read RBAC preflight");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-collaboration-stream")?.responses)
      .toContain("sena-project-collaboration-stream/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-csrf")?.responses)
      .toContain("sena-enterprise-csrf-token/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-sessions")?.request)
      .toContain("x-sena-csrf-token");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-login")?.request)
      .toContain("x-sena-auth-session-id");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-login")?.request)
      .toContain("x-sena-auth-flow");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-login")?.request)
      .toContain("x-sena-auth-production-gate");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-login")?.request)
      .toContain("x-sena-identity-missing-evidence-ids");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-login")?.request)
      .toContain("x-sena-identity-institution-action-plan-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-login")?.request)
      .toContain("x-sena-identity-owner-runbook-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-register")?.request)
      .toContain("sena-enterprise-password-policy/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-register")?.request)
      .toContain("x-sena-auth-team-id");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-register")?.request)
      .toContain("x-sena-auth-production-gate");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-register")?.request)
      .toContain("x-sena-identity-missing-evidence-ids");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-register")?.request)
      .toContain("x-sena-identity-institution-action-plan-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-session")?.summary)
      .toContain("x-sena-auth-session-id");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-mfa")?.request ?? "")
      .toContain("x-sena-auth-production-gate");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-mfa")?.request ?? "")
      .toContain("x-sena-identity-missing-evidence-ids");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-mfa")?.request ?? "")
      .toContain("x-sena-identity-institution-action-plan-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-password-reset")?.request)
      .toContain("sena-enterprise-password-policy/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-password-reset")?.request)
      .toContain("x-sena-auth-production-gate");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-password-reset")?.request)
      .toContain("x-sena-identity-missing-evidence-ids");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-password-reset")?.request)
      .toContain("x-sena-identity-institution-action-plan-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-sso")?.request)
      .toContain("sena-enterprise-sso-fallback-policy/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-sso")?.request)
      .toContain("x-sena-sso-mode");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-sso")?.request)
      .toContain("x-sena-sso-production-gate");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-sso")?.request)
      .toContain("x-sena-identity-missing-evidence-ids");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-sso")?.request)
      .toContain("x-sena-identity-rotation-freshness");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-sso")?.request)
      .toContain("x-sena-identity-institution-action-plan-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-sso")?.request)
      .toContain("x-sena-identity-institution-action-plan-submission-path");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-sso")?.request)
      .toContain("x-sena-identity-owner-runbook-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-sso")?.request)
      .toContain("identityProductionGate");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-sso")?.responses)
      .toContain("sena-enterprise-identity-production-gate-summary/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-sso")?.responses)
      .toContain("sso_local_fallback_disabled");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-sso-callback")?.request)
      .toContain("x-sena-auth-flow");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "auth-sso-callback")?.request)
      .toContain("x-sena-sso-mode");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-projects")?.request)
      .toContain("x-sena-project-version");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-projects")?.request)
      .toContain("x-sena-project-snapshot-sha256");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-project")?.request)
      .toContain("x-sena-project-restored-from-version");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-project")?.request)
      .toContain("x-sena-project-deleted");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-project")?.responses)
      .toContain("sena-project-revision-restore/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-project")?.responses)
      .toContain("sena-project-delete/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-collaboration")?.request)
      .toContain("x-sena-collaboration-reliability-source");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-collaboration")?.request)
      .toContain("x-sena-collaboration-comment-source");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-collaboration")?.request)
      .toContain("x-sena-collaboration-presence-source");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-collaboration")?.request)
      .toContain("x-sena-collaboration-adjudication-source");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-team-invitations")?.request)
      .toContain("x-sena-invitation-id");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-team-invitations")?.request)
      .toContain("x-sena-membership-id");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-team-invitations")?.responses)
      .toContain("sena-team-invitation-acceptance/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-team-memberships")?.request)
      .toContain("x-sena-membership-id");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-team-memberships")?.request)
      .toContain("x-sena-member-user-id");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-team-memberships")?.responses)
      .toContain("sena-team-membership/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-uploads")?.request)
      .toContain("SENA_OBJECT_STORAGE_ADAPTER");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-uploads")?.request)
      .toContain("native S3/R2/GCS-HMAC adapter");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-governance-backup")?.responses)
      .toContain("sena-enterprise-database-sync/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-governance-backup")?.responses)
      .not.toContain("sena-enterprise-database-sync-delivery/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-reliability")?.responses)
      .toContain("sena-reliability-adjudication-coverage/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-reliability")?.request)
      .toContain("full adjudication coverage");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-reliability")?.request)
      .toContain("sena-reliability-json-request/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-reliability")?.request)
      .toContain("annotations");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-reliability")?.request)
      .toContain("x-sena-reliability-run-id");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-validation-group-comparison")?.responses)
      .toContain("sena-formal-inference-readiness/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-validation-group-comparison")?.request)
      .toContain("formalInference");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-validation-group-comparison")?.request)
      .toContain("x-sena-validation-run-id");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-validation-expert-review")?.request)
      .toContain("x-sena-expert-review-id");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-validation-expert-review")?.request)
      .toContain("x-sena-expert-review-claim-scope");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-validation-expert-review")?.request)
      .toContain("x-sena-expert-review-interpretation-validity");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-analyze")?.request)
      .toContain("x-sena-analysis-run-id");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-analyze")?.request)
      .toContain("x-sena-project-snapshot-sha256");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-analyze")?.request)
      .toContain("Prefer: respond-async");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-analyze")?.request)
      .toContain("sena-enterprise-server-job-queue-webhook/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-analyze")?.responses)
      .toContain("sena-enterprise-server-job/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-analyze")?.responses)
      .toContain("sena-analysis-provenance-envelope/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-analyze")?.request)
      .toContain("norm_rule");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-analyze")?.request)
      .toContain("buildOptions? { alpha?, beta?, gamma?, normalization?, bridgeWeightRule?, direction?, deg_convention?, Phi?, delta?, d?, seed?, temporal? }");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-analyze")?.request)
      .toContain("metric_exact");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-analyze")?.request)
      .toContain("dataset_version");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-validation-claim-package")?.summary)
      .toContain("x-sena-source-snapshot-sha256");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-validation-claim-package")?.summary)
      .toContain("x-sena-claim-evidence-reliability-source");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-validation-claim-package")?.summary)
      .toContain("x-sena-claim-evidence-adjudication-source");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.request)
      .toContain("format: html|svg|png|xlsx|docx|pdf|package");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.request)
      .toContain("projectId exports the persisted server-side project snapshot");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.request)
      .toContain("status exactly approved");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.request)
      .toContain("current project version and snapshot");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.request)
      .toContain("authoritative live adjudication coverage");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.request)
      .toContain("zero unresolved disagreements");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.request)
      .not.toContain("latest non-rejected");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.request)
      .toContain("x-sena-source-snapshot-sha256");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.request)
      .toContain("x-sena-export-sha256");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.request)
      .toContain("x-sena-publication-package-sha256");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.request)
      .toContain("x-sena-publication-verification-status");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.request)
      .toContain("publication_export_model_card_blocked");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.request)
      .toContain("modelCard.renderGate.status");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.request)
      .toContain("x-sena-job-payload-sha256");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.request)
      .toContain("x-sena-job-queue-delivery");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-jobs")?.request)
      .toContain("mark-running|mark-succeeded|mark-failed|retry|dead-letter");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-jobs")?.request)
      .toContain("analysis|import|publication-export|reliability|validation");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-jobs")?.request)
      .toContain("sena-enterprise-server-job-status-update/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-jobs")?.responses)
      .toContain("sena-enterprise-server-job-list/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-jobs-worker-contract")?.responses)
      .toContain("sena-enterprise-server-job-worker-contract/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-jobs-worker-contract")?.request ?? "")
      .toContain("SENA_JOB_WORKER_HEARTBEAT_CONFIRMED=1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-jobs-worker-heartbeat")?.responses)
      .toContain("sena-enterprise-server-job-worker-heartbeat/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-jobs-worker-heartbeat")?.request ?? "")
      .toContain("synthetic no-user-data");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-jobs-probe")?.responses)
      .toContain("sena-enterprise-server-job-queue-probe/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-jobs-probe")?.request ?? "")
      .toContain("SENA_JOB_QUEUE_LIVE_PROBE_REQUIRED");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.responses)
      .toContain("sena-publication-package/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.responses)
      .toContain("sena-publication-source-snapshot/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.responses)
      .toContain("sena-publication-verification-certificate/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.responses)
      .toContain("sena-publication-enterprise-project-evidence/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.responses)
      .toContain("sena-publication-derivation-manifest/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.responses)
      .toContain("sena-publication-state-binding/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.responses)
      .toContain("sena-data-governance-metadata/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-publication-export")?.responses)
      .toContain("sena-enterprise-server-job/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-snapshot-restore")).toEqual(expect.objectContaining({
      auth: "public",
      methods: ["POST"],
      path: "/api/sena/snapshot/restore"
    }));
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-snapshot-restore")?.responses)
      .toContain("sena-snapshot-restore-result/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-governance-security")?.request ?? "")
      .toContain("x-sena-security-identity-control-blockers");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-governance-security")?.request ?? "")
      .toContain("identity-secret-rotation-cadence");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-governance-health")?.request ?? "")
      .toContain("x-sena-governance-status");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-governance-health")?.request ?? "")
      .toContain("x-sena-identity-production-status");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-governance-health")?.request ?? "")
      .toContain("x-sena-identity-missing-evidence-ids");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-status")?.request ?? "")
      .toContain("x-sena-identity-readiness-blocking-count");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-status")?.request ?? "")
      .toContain("x-sena-identity-idp-tenant-binding");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-metrics")?.request ?? "")
      .toContain("sena_enterprise_identity_readiness_blockers");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-metrics")?.request ?? "")
      .toContain("sena_enterprise_identity_readiness_item");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-metrics")?.request ?? "")
      .toContain("sena_enterprise_observability_request_p95_ms");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-metrics")?.request ?? "")
      .toContain("sena_enterprise_server_job_worker_contract_ready");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-metrics")?.request ?? "")
      .toContain("sena_enterprise_server_job_queue_probe_confirmed");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-readiness")?.request)
      .toContain("x-sena-deployment-readiness-status");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-readiness")?.request)
      .toContain("x-sena-identity-readiness-blockers");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-readiness")?.request)
      .toContain("x-sena-identity-secret-rotation-cadence");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-cdn")?.responses)
      .toContain("sena-enterprise-cdn-probe/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-cdn")?.request ?? "")
      .toContain("SENA_CDN_VERIFY_URL");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-postgres")?.responses)
      .toContain("sena-enterprise-postgres-probe/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-postgres")?.request ?? "")
      .toContain("SENA_ENTERPRISE_POSTGRES_LIVE_PROBE_REQUIRED");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-object-storage")?.responses)
      .toContain("sena-enterprise-object-storage-probe/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-object-storage")?.request ?? "")
      .toContain("SENA_OBJECT_STORAGE_LIVE_PROBE_REQUIRED");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-observability")?.responses)
      .toContain("sena-enterprise-observability-sli/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-observability")?.request ?? "")
      .toContain("SENA_OBSERVABILITY_EXPORTER_URL");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-observability-probe")?.responses)
      .toContain("sena-enterprise-observability-probe/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-observability-probe")?.request ?? "")
      .toContain("SENA_OBSERVABILITY_LIVE_PROBE_REQUIRED");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-production-evidence")?.responses)
      .toContain("sena-enterprise-production-evidence-manifest/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-production-evidence")?.request ?? "")
      .toContain("SENA_PRODUCTION_EVIDENCE_MANIFEST_REQUIRED");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-deployment")?.summary)
      .toContain("release-gate");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-deployment")?.responses)
      .toContain("sena-enterprise-release-gate-reviews/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-deployment")?.responses)
      .toContain("sena-enterprise-identity-production-evidence/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-deployment")?.request)
      .toContain("GET ?teamId=... returns a team-scoped organization deployment handoff package");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-deployment")?.request)
      .toContain("session requests require teamId");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-deployment")?.request)
      .toContain("SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-deployment")?.request)
      .toContain("GET responses include x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-request-blockers, x-sena-identity-receipt-review-requests, and x-sena-identity-production-blocking-decisions from identityProductionHandoff");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-deployment")?.request)
      .toContain("GET responses include x-sena-identity-receipt-archive-missing-inputs and x-sena-identity-production-evidence-artifact-completeness for deployment archive gating");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-deployment")?.request)
      .toContain("GET responses include x-sena-identity-institution-action-plan-digest, x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, and x-sena-identity-institution-action-plan-submission-path");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-deployment")?.responses)
      .toContain("sena-enterprise-identity-institution-action-plan/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-native-adapters")?.summary)
      .toContain("native adapter");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-native-adapters")?.responses)
      .toContain("sena-enterprise-native-adapter-certification/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-native-adapters")?.request)
      .toContain("GET ?teamId=... returns a team-scoped native adapter certification dossier");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-native-adapters")?.request)
      .toContain("session requests require teamId");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-saas-operations")?.summary)
      .toContain("SaaS operations");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-saas-operations")?.responses)
      .toContain("sena-enterprise-saas-operations-readiness/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-saas-operations")?.responses)
      .toContain("sena-enterprise-identity-production-evidence/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-saas-operations")?.responses)
      .toContain("sena-enterprise-production-evidence-manifest/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-saas-operations")?.request)
      .toContain("GET ?teamId=... returns a team-scoped SaaS operations readiness dossier");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-saas-operations")?.request)
      .toContain("session requests require teamId");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-saas-operations")?.request)
      .toContain("identityProductionReleaseGateDigestBinding");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-saas-operations")?.request)
      .toContain("x-sena-identity-release-gate-digest-binding");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-saas-operations")?.request)
      .toContain("x-sena-identity-current-evidence-binding-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.summary)
      .toContain("enterprise capability");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.responses)
      .toContain("sena-enterprise-capability-audit/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.responses)
      .toContain("sena-enterprise-identity-cutover-checklist/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("GET ?teamId=... returns a team-scoped enterprise capability audit");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("session requests require teamId");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-auth-capability-status");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-auth-capability-remaining-platform-decisions");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-auth-capability-required-artifacts");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-identity-production-evidence-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-identity-request-packet-policy-hash");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("identityProductionEvidence as the redacted identity production evidence dossier");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-identity-production-status");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-identity-request-blockers");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-identity-receipt-review-requests");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-identity-production-blocking-decisions");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-identity-receipt-archive-missing-inputs");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-identity-production-evidence-artifact-completeness");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-identity-production-evidence-artifact-completeness-summary");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-identity-rotation-freshness");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-identity-rotation-expired-evidence");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-identity-rotation-due-soon-evidence");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-auth-capability-idp-missing-production-evidence");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-auth-capability-provisioning-missing-production-evidence");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-auth-capability-idp-missing-technical-prerequisites");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("x-sena-auth-capability-provisioning-missing-technical-prerequisites");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.responses)
      .toContain("sena-enterprise-platform-decision-production-evidence-receipt/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.responses)
      .toContain("sena-enterprise-identity-platform-decision-request-packet/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.responses)
      .toContain("sena-enterprise-identity-institution-action-plan/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.responses)
      .toContain("sena-enterprise-identity-submission-matrix/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.responses)
      .toContain("sena-enterprise-identity-owner-runbook/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.responses)
      .toContain("sena-enterprise-identity-submission-verifier/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.responses)
      .toContain("sena-enterprise-identity-rotation-freshness/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.responses)
      .toContain("sena-enterprise-identity-receipt-archive-manifest/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("GET ?teamId=");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("session requests require teamId");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("platformRequestPacket.submission.requiredBodyFields");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("requiredBodyFields includes productionEvidenceArtifactDigest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("platformRequestPacket.submission.identityProductionEvidenceBodyFields");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("productionEvidenceArtifactDigest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("platformRequestPacket.submission.productionEvidenceArtifactDigestPolicy");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("platformRequestPacket.submission.responseAuditHeaders lists the response headers platform owners should archive");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("responseAuditHeaders include overall identity production gate headers");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("platformRequestPacket.submission.receiptArchivePolicy lists required archive headers and response body paths");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("stableSubmissionDigestInputFields includes productionEvidenceArtifactDigest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("receiptArchiveManifest lists per-decision receipt digest headers, stable submission digest headers, archive body paths, and ready-for-archive status");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("receiptArchiveManifest records productionEvidenceArtifactDigestAlgorithm=sha256 and productionEvidenceArtifactDigestScope=external-evidence-artifact");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("receiptArchiveManifest records productionEvidenceArtifactDigestCoveredEvidenceIds");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("receiptArchiveManifest records productionEvidenceArtifactDigestCompletenessStatus");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("GET responses include x-sena-identity-production-evidence-digest, x-sena-identity-evidence-binding-digest, x-sena-identity-receipt-archive-manifest-digest, and x-sena-identity-institution-action-plan-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("x-sena-identity-institution-action-plan-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("institutionActionPlan groups redacted submissionDrafts");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("institution-idp-owner and institution-provisioning-owner");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("uses evidenceUrlField instead of an evidenceUrl value");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("identityProductionEvidence.institutionActionPlan");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("institutionActionPlan.submissionMatrix.rows maps each production evidence ID to its institution owner lane, decisionId, source, cutover item, required body fields, artifact digest, verifiedAt, evidenceUrl, responseAuditHeaders, and receiptArchiveBodyPaths");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("institutionActionPlan.ownerRunbooks.runbooks maps each institution owner lane to preflight checks, submissionSteps, receiptArchiveSteps, releaseGateBlockers, required env vars, productionEvidenceIds, requestPacketPolicyHash, responseAuditHeaders, and receipt archive paths");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("GET responses include x-sena-identity-request-packet-policy-hash");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("GET responses include x-sena-identity-request-packet-policy-binding");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("x-sena-identity-receipt-archive-missing-inputs");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("x-sena-identity-production-evidence-artifact-completeness");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("x-sena-identity-production-evidence-artifact-completeness-summary");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("x-sena-identity-production-status");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("x-sena-identity-release-gate-blocked");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("x-sena-identity-request-blockers");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("x-sena-identity-receipt-review-requests");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("x-sena-identity-production-blocking-decisions");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("x-sena-identity-cutover-blockers");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("x-sena-identity-evidence-binding-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("platformRequestPacket.requests[].submissionTemplate.submissionDraft provides redacted platform-owner JSON bodies");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain("GET responses include x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, and x-sena-identity-institution-action-plan-submission-path");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.request)
      .toContain(`GET responses include ${identityOwnerRunbookHeaderList}`);
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain("GET responses include x-sena-identity-institution-action-plan-digest, x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, and x-sena-identity-institution-action-plan-submission-path");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-capability-audit")?.request)
      .toContain(`GET responses include ${identityOwnerRunbookHeaderList}`);
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.summary)
      .toContain("SSO provider secret custody");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-identity-production-evidence")?.summary)
      .toContain("SSO secret-store reference");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("identity evidenceUrl must be HTTPS, non-local, non-private, separate from the SENA application origin, and returned only as evidenceUrlHash plus redacted evidenceUrlHostHash/evidenceUrlAllowedHostHash binding hashes");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("production evidence receipts include evidenceUrlHostBindingStatus");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("sso-provider-secrets");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("sso-secret-store-reference");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("SENA_SSO_*_CLIENT_SECRET_VERSION and SENA_PROVISIONING_TOKEN_VERSION");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("production NODE_ENV requires SENA_SSO_*_CLIENT_SECRET_VERSION");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("production NODE_ENV requires SENA_SSO_INSTITUTION_CLIENT_SECRET_REF and SENA_PROVISIONING_TOKEN_SECRET_REF");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("production NODE_ENV requires SENA_IDENTITY_SECRET_ROTATION_CADENCE_DAYS");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("production NODE_ENV requires SENA_SSO_INSTITUTION_TENANT_ID");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("production NODE_ENV requires SENA_IDENTITY_LIFECYCLE_OWNER_MODE");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("technicalBindingStatus");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("production NODE_ENV requires SENA_IDENTITY_EVIDENCE_ALLOWED_HOSTS");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("identity productionEvidenceIds require a production or pilot-production environment");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("productionEvidenceVerifiedAt");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("productionEvidenceArtifactDigest must be a SHA-256 hex digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("productionEvidenceArtifactDigest is listed in platformRequestPacket.submission.requiredBodyFields");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("missing productionEvidenceArtifactDigest is rejected");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("productionEvidenceArtifactDigestPolicy keeps external evidence artifacts in institution custody and rejects raw artifact or secret uploads");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("productionEvidenceVerifiedAt is required when productionEvidenceIds include identity production evidence ids");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("requestPacketPolicyHash must echo the current platformRequestPacket.evidence requestPacketPolicyHash for identity production evidence submissions");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("GET responses include x-sena-identity-request-packet-policy-hash");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("GET responses include x-sena-identity-request-packet-policy-binding");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("GET responses include refreshed x-sena-identity-production-evidence-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("GET responses include x-sena-identity-production-status");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("GET responses include x-sena-identity-request-blockers, x-sena-identity-receipt-review-requests, x-sena-identity-production-blocking-decisions");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("GET and POST responses include x-sena-identity-institution-action-plan-digest, x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, and x-sena-identity-institution-action-plan-submission-path");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain(`GET and POST responses include ${identityOwnerRunbookHeaderList}`);
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("GET responses include x-sena-identity-receipt-archive-missing-inputs and x-sena-identity-production-evidence-artifact-completeness as overall receipt archive gate headers");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("x-sena-identity-production-evidence-artifact-completeness-summary");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("POST responses include x-sena-identity-request-packet-policy-hash, x-sena-identity-request-packet-policy-binding, and x-sena-identity-production-verifier-status");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("POST responses include x-sena-identity-production-receipt-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("POST responses include x-sena-identity-submitted-evidence-digest as the stable platform-submission-inputs digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("stable platform-submission-inputs digest covers productionEvidenceArtifactDigest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("POST responses include x-sena-identity-production-evidence-artifact-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("POST responses include x-sena-identity-production-evidence-artifact-covered-ids and x-sena-identity-production-evidence-artifact-coverage");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("POST responses include x-sena-identity-production-evidence-artifact-completeness");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("POST responses include x-sena-identity-submitted-decision-production-evidence-artifact-completeness");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("POST responses include x-sena-identity-evidence-url-host-binding, x-sena-identity-technical-binding, x-sena-identity-technical-readiness, x-sena-identity-rotation-freshness, x-sena-identity-rotation-expired-evidence, and x-sena-identity-rotation-due-soon-evidence");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("POST responses include x-sena-identity-receipt-archive-status and x-sena-identity-receipt-archive-missing-inputs");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("POST responses include x-sena-identity-submitted-decision-receipt-archive-missing-inputs for the submitted decision");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("POST responses include x-sena-identity-production-status");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("POST responses include x-sena-identity-request-blockers, x-sena-identity-receipt-review-requests, x-sena-identity-production-blocking-decisions");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("POST responses include x-sena-identity-receipt-archive-missing-inputs and x-sena-identity-production-evidence-artifact-completeness as refreshed overall receipt archive gate headers");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("x-sena-identity-cutover-blockers");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("x-sena-identity-production-evidence-artifact-completeness-summary");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("POST responses include refreshed x-sena-identity-production-evidence-digest, x-sena-identity-evidence-binding-digest, and x-sena-identity-receipt-archive-manifest-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("production evidence receipts include responseAuditHeaders and receiptArchiveBodyPaths");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("production evidence receipts include productionEvidenceArtifactDigest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("production evidence receipts include productionEvidenceArtifactDigestAlgorithm=sha256 and productionEvidenceArtifactDigestScope=external-evidence-artifact");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("production evidence receipts include productionEvidenceArtifactDigestCoveredEvidenceIds and productionEvidenceArtifactDigestCoverageStatus");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("production evidence receipts include productionEvidenceArtifactDigestCompletenessStatus");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("productionEvidenceVerifiedAt must not be in the future");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("GET ?teamId=... returns a team-scoped platformDecisionRegister");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("GET responses include identityProductionEvidence as a redacted pre-submission packet");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("identityProductionEvidence.institutionActionPlan.submissionMatrix");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-platform-decisions")?.request)
      .toContain("identityProductionEvidence.institutionActionPlan.ownerRunbooks");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.summary)
      .toContain("go-live rehearsal");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.methods)
      .toContain("POST");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain("attesterName");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain("GET ?teamId=... returns a team-scoped go-live rehearsal dossier");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain("session requests require teamId");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain("identityCutoverChecklistStatus");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain("identityProductionHandoffSnapshot.dossierDigest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain("identityProductionHandoffSnapshot.receiptArchiveManifest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain("GET responses include x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-request-blockers, x-sena-identity-receipt-review-requests, and x-sena-identity-production-blocking-decisions from identityProductionHandoff");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain("POST responses include x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-request-blockers, x-sena-identity-receipt-review-requests, and x-sena-identity-production-blocking-decisions from identityProductionHandoffSnapshot");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain("GET and POST responses include x-sena-identity-receipt-archive-missing-inputs and x-sena-identity-production-evidence-artifact-completeness for final cutover automation");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain("GET and POST responses include x-sena-identity-institution-action-plan-digest, x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, and x-sena-identity-institution-action-plan-submission-path");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain(`GET and POST responses include ${identityOwnerRunbookHeaderList}`);
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain("latestReleaseGateSnapshot.identityReceiptArchiveDecisions preserves submittedEvidenceDigest and productionEvidenceArtifactDigest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain("audit detail preserves latestReleaseGateIdentityReceiptArchiveDecisions");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain("start-post-cutover-observation");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain("record-post-cutover-sample");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain("complete-post-cutover-observation");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.request)
      .toContain("approved attestation is rejected until postCutoverMonitor.status is ready");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.responses)
      .toContain("sena-enterprise-go-live-rehearsal/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.responses)
      .toContain("sena-enterprise-release-gate-draft/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.responses)
      .toContain("sena-enterprise-go-live-rollback-drill/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.responses)
      .toContain("sena-enterprise-go-live-monitor/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.responses)
      .toContain("sena-enterprise-post-cutover-observation/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.responses)
      .toContain("sena-enterprise-post-cutover-observations/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.responses)
      .toContain("sena-enterprise-go-live-attestation/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.responses)
      .toContain("sena-enterprise-go-live-attestations/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.responses)
      .toContain("sena-enterprise-identity-production-evidence/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.responses)
      .toContain("sena-enterprise-identity-cutover-checklist/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.responses)
      .toContain("sena-enterprise-identity-institution-action-plan/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.responses)
      .toContain("sena-enterprise-identity-submission-matrix/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-go-live-rehearsal")?.responses)
      .toContain("sena-enterprise-identity-owner-runbook/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.request)
      .toContain("verificationEvidence");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.request)
      .toContain("identityProductionSnapshot.cutoverChecklist");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.request)
      .toContain("identityProductionSnapshot.receiptArchiveManifest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.request)
      .toContain("identityProductionSnapshot.institutionActionPlan");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.request)
      .toContain("identityProductionSnapshot.institutionActionPlan.submissionMatrix");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.request)
      .toContain("identityProductionSnapshot.institutionActionPlan.ownerRunbooks");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.request)
      .toContain("identityProductionSnapshot.receiptArchiveManifest decisions preserve submittedEvidenceDigest and productionEvidenceArtifactDigest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.request)
      .toContain("POST and GET responses include x-sena-identity-production-status, x-sena-identity-release-gate-blocked, x-sena-identity-request-blockers, x-sena-identity-receipt-review-requests, and x-sena-identity-production-blocking-decisions from the release-gate identityProductionSnapshot");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.request)
      .toContain("POST and GET responses include x-sena-identity-receipt-archive-missing-inputs and x-sena-identity-production-evidence-artifact-completeness from the release-gate identityProductionSnapshot");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.request)
      .toContain("POST and GET responses include x-sena-identity-institution-action-plan-digest, x-sena-identity-institution-action-plan-blocking-lanes, x-sena-identity-institution-action-plan-ready-lanes, and x-sena-identity-institution-action-plan-submission-path");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.request)
      .toContain(`POST and GET responses include ${identityOwnerRunbookHeaderList}`);
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.responses)
      .toContain("sena-enterprise-identity-production-evidence/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.responses)
      .toContain("sena-enterprise-identity-submission-verifier/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.responses)
      .toContain("sena-enterprise-identity-rotation-freshness/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.responses)
      .toContain("sena-enterprise-identity-cutover-checklist/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.responses)
      .toContain("sena-enterprise-identity-institution-action-plan/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.responses)
      .toContain("sena-enterprise-identity-submission-matrix/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-release-gate")?.responses)
      .toContain("sena-enterprise-identity-owner-runbook/v1");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-alerts")?.request)
      .toContain("x-sena-identity-alert-blockers");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-ops-alerts")?.request)
      .toContain("institution IdP tenant approval, SSO secret custody, SCIM/IdP ownership, and secret rotation");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-scim-config")?.request ?? "")
      .toContain("x-sena-scim-production-owner-gate");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-scim-config")?.request ?? "")
      .toContain("x-sena-identity-provisioning-missing-evidence");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-scim-config")?.request ?? "")
      .toContain("x-sena-identity-lifecycle-owner-mode");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-scim-config")?.request ?? "")
      .toContain("x-sena-identity-institution-action-plan-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-scim-config")?.request ?? "")
      .toContain("x-sena-identity-institution-action-plan-submission-path");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-scim-config")?.request ?? "")
      .toContain("x-sena-identity-owner-runbook-digest");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-scim-config")?.request ?? "")
      .toContain("urn:sena:params:scim:schemas:extension:identity-production:2.0:ServiceProviderConfig");
    expect(documentation.endpoints.find((endpoint) => endpoint.id === "sena-scim-config")?.responses)
      .toContain("sena-scim-identity-production-gate/v1");

    const openApi = buildSenaOpenApiDocument({ serverUrl: "https://sena.example.test" }) as {
      openapi: string;
      paths: Record<string, Record<string, { summary: string; parameters?: Array<{ name: string; required?: boolean }> }>>;
      components: { securitySchemes: { sessionCookie: { name: string } } };
    };
    expect(openApi.openapi).toBe("3.1.0");
    expect(openApi.paths["/api/sena/import"].post.summary).toContain("Import Excel");
    expect(openApi.paths["/api/sena/import"].post.parameters?.map((parameter) => parameter.name))
      .toContain("x-sena-csrf-token");
    expect(openApi.paths["/api/sena/projects"].post.parameters?.find((parameter) => parameter.name === "x-sena-csrf-token")?.required)
      .toBe(true);
    expect(openApi.paths["/api/sena/docs"].get.summary).toContain("machine-readable");
    expect(openApi.paths["/api/sena/ops/deployment"].get.summary).toContain("release-gate");
    expect(openApi.paths["/api/sena/ops/native-adapters"].get.summary).toContain("native adapter");
    expect(openApi.paths["/api/sena/ops/saas-operations"].get.summary).toContain("SaaS operations");
    expect(openApi.paths["/api/sena/ops/capability-audit"].get.summary).toContain("enterprise capability");
    expect(openApi.paths["/api/sena/ops/go-live-rehearsal"].get.summary).toContain("go-live rehearsal");
    expect(openApi.components.securitySchemes.sessionCookie.name).toBe("sena_session");
  });

  it("observes the public API documentation route used by conference smoke loads", async () => {
    const route = await import("../../../app/api/sena/docs/route");
    const response = await route.GET(new Request("https://sena.example.test/api/sena/docs?format=openapi"));
    const body = await response.json() as { openapi?: string; paths?: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body.openapi).toBe("3.1.0");
    expect(body.paths).toHaveProperty("/api/sena/docs");
    expect(response.headers.get("x-sena-observed-route")).toBe("sena-docs");
    expect(response.headers.get("x-sena-observed-status-class")).toBe("2xx");
    expect(response.headers.get("server-timing")).toMatch(/^sena;dur=\d+$/);
  });
});
