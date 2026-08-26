import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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
  it("declares the essential workspace responsive and disclosure smoke contract", () => {
    expect(SENA_BROWSER_SMOKE_MANIFEST.workspace).toEqual({
      route: "/workspace/sena",
      responsiveWidths: [375, 768, 1024, 1440],
      selectors: {
        planeOrbit: "sena-fusion-plane-orbit",
        orbitLayer: "sena-fusion-orbit-layer",
        snaOrbitSociogram: "sena-sna-orbit-sociogram",
        fusionCanvas: "sena-fusion-canvas",
        primaryPlot: "workspace-primary-plot",
        secondaryPlot: "workspace-secondary-plot",
        mobileFigureSwitcher: "workspace-mobile-figure-switcher",
        mobileFusionTab: "workspace-mobile-figure-fusion",
        mobileDualTab: "workspace-mobile-figure-dual",
        researchDetailsDrawer: "workspace-research-details-drawer",
        researchDetailsToggle: "workspace-research-details-toggle"
      },
      defaultClosed: ["workspace-left-panel-overlay", "workspace-research-details-drawer"]
    });
  });

  it("keeps Temporal Fusion visual checks covered rather than deferred in the pilot verifier", () => {
    const verifierSource = readFileSync(new URL("../../../scripts/verify-sena-pilot.mjs", import.meta.url), "utf8");

    expect(verifierSource).not.toContain("deferredPlotViewSectionIds");
    expect(verifierSource).not.toContain("deferredPlotViewVisualCheckPrefixes");
    expect(verifierSource).toContain("browserSmokeCoveredPlotViewVisualCheckIds");
    expect(verifierSource).toContain("\"temporal-fusion-arc\"");
    expect(verifierSource).toContain("\"temporal-transition-evidence\"");
    expect(verifierSource).toContain("\"workspace-mobile-figure-switcher\"");
    expect(verifierSource).toContain("\"workspace-mobile-figure-fusion\"");
    expect(verifierSource).toContain("\"workspace-mobile-figure-dual\"");
    expect(verifierSource).toContain("\"workspace-research-details-drawer\"");
    expect(verifierSource).toContain("verifyInteractiveVisualCheckCoverage");
  });

  it("keeps the plane-orbit default surface covered rather than only the Diagnostic Canvas", () => {
    const verifierSource = readFileSync(new URL("../../../scripts/verify-sena-pilot.mjs", import.meta.url), "utf8");
    const smokeSource = readFileSync(new URL("../../../scripts/verify-sena-browser-smoke.mjs", import.meta.url), "utf8");

    // The verifier's covered set must name the Ring-3 rows the smoke actually
    // drives; verifyInteractiveVisualCheckCoverage exits 1 if any of them is
    // missing from the contract, which is what keeps the two files in step.
    for (const id of [
      "fusion-plane-orbit-svg-anchor",
      "fusion-plane-nested-ena-plot",
      "fusion-orbit-layer-anchor",
      "fusion-orbit-sena-layer",
      "fusion-orbit-social-lane",
      "fusion-orbit-social-arrowhead",
      "fusion-orbit-lane-normalized-weight",
      "fusion-plane-unit-link",
      "fusion-plane-model-footer",
      "sna-orbit-sociogram",
      "workspace-model-layout-plane-orbit"
    ]) {
      expect(verifierSource).toContain(`"${id}"`);
    }

    // And the smoke must reach both grammars: the default plane-orbit figure
    // and, after an explicit layout switch, the Diagnostic A1 Canvas the
    // Functional Ledger still pins.
    expect(smokeSource).toContain(SENA_BROWSER_SMOKE_MANIFEST.workspace.selectors.planeOrbit);
    expect(smokeSource).toContain(SENA_BROWSER_SMOKE_MANIFEST.workspace.selectors.orbitLayer);
    expect(smokeSource).toContain(SENA_BROWSER_SMOKE_MANIFEST.workspace.selectors.snaOrbitSociogram);
    expect(smokeSource).toContain(SENA_BROWSER_SMOKE_MANIFEST.workspace.selectors.fusionCanvas);
    expect(smokeSource).toContain("model-layout-plane-orbit");
    expect(smokeSource).toContain("orbit-social-lane");
  });

  it("includes the jENA workbench in the production browser smoke verifier", () => {
    const verifierSource = readFileSync(new URL("../../../scripts/verify-sena-pilot.mjs", import.meta.url), "utf8");
    const enaSmokeSource = readFileSync(
      new URL("../../../scripts/verify-sena-ena-browser-smoke.mjs", import.meta.url),
      "utf8"
    );

    expect(SENA_BROWSER_SMOKE_MANIFEST.productionVerifier.steps.enaWorkbench).toMatchObject({
      exportName: "verifySenaEnaBrowserSmoke",
      label: "Verify jENA workbench browser smoke"
    });
    expect(SENA_BROWSER_SMOKE_MANIFEST.enaWorkbench.route).toBe("/workspace/ena");
    expect(SENA_BROWSER_SMOKE_MANIFEST.enaWorkbench.defaultRailMode).toBe("model");
    expect(SENA_BROWSER_SMOKE_MANIFEST.enaWorkbench.comparisonDefaults).toEqual({
      subtractionOn: false,
      groupIntervalsOn: true,
      deltaMultiplier: 1,
      palette: "blue-orange"
    });

    // The smoke is only evidence while the pilot still runs it — the export
    // name and the route it is handed are what a future edit could quietly
    // drop, so both are pinned in the verifier source.
    expect(verifierSource).toContain("verify-sena-ena-browser-smoke.mjs");
    expect(verifierSource).toContain("verifySenaEnaBrowserSmoke");
    expect(verifierSource).toContain('".next/server/app/workspace/ena/page.js"');
    expect(verifierSource).toContain('appPaths["/workspace/ena/page"]');

    // And the script must actually reach the surfaces the manifest declares:
    // every selector, the provenance attributes it reads off the drawn marks,
    // the SENA-only layers it asserts are absent, and the three exports.
    expect(enaSmokeSource).toContain(SENA_BROWSER_SMOKE_MANIFEST.enaWorkbench.route);
    for (const selector of Object.values(SENA_BROWSER_SMOKE_MANIFEST.enaWorkbench.selectors)) {
      expect(enaSmokeSource).toContain(selector);
    }
    for (const attribute of SENA_BROWSER_SMOKE_MANIFEST.enaWorkbench.plotAttributes) {
      expect(enaSmokeSource).toContain(attribute);
    }
    for (const layer of SENA_BROWSER_SMOKE_MANIFEST.enaWorkbench.absentSenaLayers) {
      expect(enaSmokeSource).toContain(`"${layer}"`);
    }
    for (const railMode of SENA_BROWSER_SMOKE_MANIFEST.enaWorkbench.railModes) {
      expect(enaSmokeSource).toContain(`data-rail-mode="${railMode}"`);
    }
    for (const tab of SENA_BROWSER_SMOKE_MANIFEST.enaWorkbench.statsTabs) {
      expect(enaSmokeSource).toContain(`data-panel-tab="${tab}"`);
    }
    for (const palette of SENA_BROWSER_SMOKE_MANIFEST.enaWorkbench.comparisonPalettes) {
      expect(enaSmokeSource).toContain(`data-comparison-palette="${palette}"`);
    }
    for (const artifact of SENA_BROWSER_SMOKE_MANIFEST.enaWorkbench.exports) {
      expect(enaSmokeSource).toContain(artifact);
    }

    // FA24-07's kill-proof phrasing. "Not checked" passes on a control that is
    // absent, disabled, or dead, so the leg must also prove the toggle is
    // enabled, prove the sibling overlay is live in the same state, and prove
    // the signed DOM can appear and retract.
    expect(SENA_BROWSER_SMOKE_MANIFEST.enaWorkbench.flows).toEqual(expect.arrayContaining([
      "worker-runtime-run",
      "comparison-group-means-and-intervals",
      "comparison-subtraction-default-off",
      "signed-delta-multiplier",
      "signed-edge-threshold-discriminator"
    ]));
    expect(enaSmokeSource).toContain("Subtracted network is checked by default; it must default off.");
    expect(enaSmokeSource).toContain("so 'off' is forced rather than the default");
    // U+2212 MINUS SIGN. The subtracted trace name is the proof that the drawn
    // network became the difference; retyping it as an ASCII hyphen is the easy
    // way to get a leg that can never see the subtraction.
    expect(enaSmokeSource).toContain("−");
    expect(enaSmokeSource).not.toContain("Comparison - Planning");
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
      provisioningTokenFallback: "sena-pilot-provisioning-token"
    });
    expect(SENA_BROWSER_SMOKE_MANIFEST.productionVerifier.steps.enterpriseApi.env).toEqual(expect.arrayContaining([
      "SENA_PROVISIONING_TOKEN",
      "SENA_EXPERT_REVIEW_SIGNING_SECRET",
      "SENA_EXPERT_REVIEW_SIGNING_KEY_ID",
      "SENA_ENTERPRISE_API_BROWSER_SMOKE_EXPECTED_RECEIPT_KEY_ID"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.routes).toEqual([
      "/api/sena/scim/v2/ServiceProviderConfig",
      "/api/auth/csrf",
      "/api/sena/ops/platform-decisions",
      "/api/sena/import",
      "/api/sena/analyze",
      "/api/sena/projects/${projectId}",
      "/api/sena/reliability",
      "/api/sena/validation/group-comparison",
      "/api/sena/validation/expert-review",
      "/api/sena/validation/claim-package",
      "/api/sena/exports/publication"
    ]);
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.scimExtensionSchema)
      .toBe("urn:sena:params:scim:schemas:extension:identity-production:2.0:ServiceProviderConfig");
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.schemaVersions).toEqual([
      "sena-scim-service-provider-config/v1",
      "sena-scim-identity-production-gate/v1",
      "sena-enterprise-identity-production-evidence/v1",
      "sena-enterprise-identity-submission-matrix/v1",
      "sena-enterprise-identity-owner-runbook/v1",
      "sena-enterprise-identity-cutover-checklist/v1",
      "sena-enterprise-csrf-token/v1",
      "sena-enterprise-import/v1",
      "sena-project-snapshot/v1",
      "sena-project/v1",
      "sena-analysis-run/v1",
      "sena-reliability-response/v1",
      "sena-coding-reliability-dashboard/v2",
      "sena-reliability-run-review/v1",
      "sena-group-comparison-suite/v2",
      "sena-validation-run-review/v1",
      "sena-enterprise-validation-run-evidence/v1",
      "sena-expert-review-response/v1",
      "sena-enterprise-expert-review-receipt/v1",
      "sena-enterprise-claim-evidence-package/v2",
      "sena-publication-state-binding/v2",
      "sena-publication-derivation-manifest/v3",
      "sena-publication-package/v1"
    ]);
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.headers).toEqual([
      "x-sena-scim-production-owner-gate",
      "x-sena-identity-institution-action-plan-digest",
      "x-sena-identity-owner-runbook-digest",
      "x-sena-identity-owner-runbook-blocking",
      "x-sena-identity-owner-runbook-preflight-checks",
      "x-sena-identity-owner-runbook-submission-steps",
      "x-sena-identity-owner-runbook-receipt-archive-steps",
      "x-sena-auth-membership-role",
      "x-sena-import-run-id",
      "x-sena-project-id",
      "x-sena-project-version",
      "x-sena-project-snapshot-sha256",
      "x-sena-analysis-run-id",
      "x-sena-report-sha256",
      "x-sena-import-profiles",
      "x-sena-reliability-run-id",
      "x-sena-reliability-status",
      "x-sena-reliability-coverage-rate",
      "x-sena-unresolved-disagreements",
      "x-sena-validation-run-id",
      "x-sena-validation-status",
      "x-sena-validation-parity-status",
      "x-sena-validation-preregistration-sha256",
      "x-sena-formal-inference-status",
      "x-sena-expert-review-id",
      "x-sena-expert-review-status",
      "x-sena-expert-review-claim-scope",
      "x-sena-expert-review-target-id",
      "x-sena-expert-review-receipt-present",
      "x-sena-expert-review-receipt-key-id",
      "x-sena-expert-review-receipt-sha256",
      "x-sena-claim-package-status",
      "x-sena-claim-package-sha256",
      "x-sena-source-snapshot-sha256",
      "x-sena-persisted-source-snapshot-sha256",
      "x-sena-claim-state-revision-sha256",
      "x-sena-publication-reliability-run-id",
      "x-sena-publication-derivation-manifest-sha256",
      "x-sena-read-projection-source-snapshot-sha256",
      "x-sena-validation-evidence-sha256",
      "x-sena-expert-receipt-sha256",
      "x-sena-expert-receipt-key-id",
      "x-sena-publication-state-revision-sha256",
      "x-sena-publication-state-binding-sha256",
      "x-sena-publication-package-sha256",
      "x-sena-publication-artifact-count",
      "x-sena-publication-formats",
      "x-sena-publication-verification-status",
      "x-sena-observed-status-class"
    ]);
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.requestBindings).toEqual(expect.arrayContaining([
      "{ requiredFormats: requiredPublicationFormats, teamId, provisioningToken }",
      "provisioningToken: bearerToken",
      "Bearer ${bearerToken}",
      "expectedReceiptKeyId: expertReviewSigningKeyId"
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
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.publicationFormats).toEqual([
      "svg",
      "png",
      "html",
      "xlsx",
      "docx",
      "pdf"
    ]);
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.redactionFlags).toEqual(expect.arrayContaining([
      "secretValuesExcluded",
      "evidenceUrlValuesExcluded"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.expectedRoleEvidence).toBe("Expected owner registration role");
  });

  it("keeps the enterprise publication preflight smoke aligned with the claim-evidence gate", () => {
    const smokeSource = readFileSync(
      new URL("../../../scripts/verify-sena-enterprise-api-browser-smoke.mjs", import.meta.url),
      "utf8"
    );

    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.publicationBlockedCode)
      .toBe("publication_claim_evidence_not_ready");
    expect(smokeSource).toContain(
      `publicationBlocked.body?.code !== "${SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.publicationBlockedCode}"`
    );
    expect(smokeSource).not.toContain(
      'publicationBlocked.body?.code !== "publication_export_model_card_blocked"'
    );
  });

  it("requires the enterprise publication success smoke to create complete same-project claim evidence", () => {
    const smokeSource = readFileSync(
      new URL("../../../scripts/verify-sena-enterprise-api-browser-smoke.mjs", import.meta.url),
      "utf8"
    );

    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.routes).toEqual(expect.arrayContaining([
      "/api/sena/reliability",
      "/api/sena/analyze",
      "/api/sena/validation/group-comparison",
      "/api/sena/validation/expert-review",
      "/api/sena/validation/claim-package"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.schemaVersions).toEqual(expect.arrayContaining([
      "sena-reliability-response/v1",
      "sena-reliability-run-review/v1",
      "sena-analysis-run/v1",
      "sena-group-comparison-suite/v2",
      "sena-validation-run-review/v1",
      "sena-expert-review-response/v1",
      "sena-enterprise-claim-evidence-package/v2",
      "sena-publication-package/v1"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.headers).toEqual(expect.arrayContaining([
      "x-sena-reliability-run-id",
      "x-sena-validation-run-id",
      "x-sena-expert-review-id",
      "x-sena-expert-review-receipt-present",
      "x-sena-expert-review-receipt-sha256",
      "x-sena-claim-package-status",
      "x-sena-claim-package-sha256"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.importProfiles).toEqual(expect.arrayContaining([
      "sena-contract",
      "cleaned-transcript"
    ]));
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.expectedImportStatus).toBe("completed");
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.expectedImportWarnings).toEqual([]);
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.expectedImportedDatasetCounts).toEqual({
      people: 4,
      interactions: 3,
      utterances: 8,
      codedSegments: 8,
      codes: 4
    });
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.claimStatuses).toEqual({
      persistedPrepublication: "exploratory-only",
      permittedPersistedBlockers: ["project-claim-readiness-required"],
      derivedPublication: "claim-ready-with-limits"
    });
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.expertReviewReceipt).toEqual({
      signingMode: "ephemeral-verifier-env",
      keyIdPrefix: "sena-pilot-smoke-"
    });
    expect(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.evidenceFields).toEqual(expect.arrayContaining([
      "evidence.reliability",
      "evidence.validation",
      "evidence.expertReview"
    ]));
    expect(smokeSource).toContain('fetch("/sena-pilot/sample/lesson-study-sena-contract.json"');
    expect(smokeSource).toContain("if (!contractResponse.ok)");
    expect(smokeSource).toContain('new Set(["T1", "T2"])');
    expect(smokeSource).toContain('new Set(["u1", "u2", "u4", "u7", "u10"])');
    expect(smokeSource).toContain('new Set(["question", "evidence", "explanation"])');
    expect(smokeSource).toContain('new File([JSON.stringify(compactContract)], "lesson-study-sena-contract.json"');
    expect(smokeSource).toContain('"T1: We should ask a better question and gather evidence. #reflection"');
    expect(smokeSource).toContain('"T2: The graph links evidence to an emerging explanation. #reflection"');
    expect(smokeSource).not.toContain('"P01: We should ask a better #Question and gather #Evidence."');
    expect(smokeSource).toContain('fetch("/api/sena/analyze"');
    expect(smokeSource).toContain('status: "human-reviewed"');
    expect(smokeSource).toContain('fetch("/api/sena/validation/group-comparison"');
    expect(smokeSource).toContain('fetch("/api/sena/validation/expert-review"');
    expect(smokeSource).toContain('fetch(`/api/sena/validation/claim-package?projectId=${encodeURIComponent(projectId)}`');
    expect(smokeSource).toContain('fetch(`/api/sena/projects/${encodeURIComponent(projectId)}`');
    expect(smokeSource).toContain("projectBeforePublication");
    expect(smokeSource).toContain("projectAfterPublication");
    expect(smokeSource).toContain("claimPackageAfterPublication");
    expect(smokeSource).toContain('claimPackage.body?.claimReadinessEvidence?.kind !== "persisted-project-snapshot"');
    expect(smokeSource).toContain('publication.body?.enterpriseProjectEvidence?.claimPackage?.payload?.claimReadinessEvidence?.kind !== "current-project-reliability-run"');
    expect(smokeSource).toContain("publication.body?.enterpriseProjectEvidence?.claimPackage?.status");
    expect(smokeSource).toContain('process.env.SENA_ENTERPRISE_API_BROWSER_SMOKE_EXPECTED_RECEIPT_KEY_ID');
    expect(smokeSource).toContain("expectedReceiptKeyId");
    expect(smokeSource).toContain('x-sena-publication-derivation-manifest-sha256');
    expect(smokeSource).toContain('x-sena-read-projection-source-snapshot-sha256');
    expect(smokeSource).toContain('x-sena-publication-state-revision-sha256');
    expect(smokeSource).toContain('x-sena-publication-state-binding-sha256');
    expect(smokeSource).toContain('x-sena-expert-receipt-key-id');
    const verifierPublicationFormats = smokeSource.match(
      /const requiredPublicationFormats = (\[[^;]+\]);/
    );
    expect(verifierPublicationFormats).not.toBeNull();
    expect(JSON.parse(verifierPublicationFormats?.[1] ?? "[]"))
      .toEqual(SENA_BROWSER_SMOKE_MANIFEST.enterpriseApi.publicationFormats);

    const pilotSource = readFileSync(
      new URL("../../../scripts/verify-sena-pilot.mjs", import.meta.url),
      "utf8"
    );
    expect(pilotSource).toContain('import { randomBytes } from "node:crypto";');
    expect(pilotSource).toContain('const expertReviewSigningSecret = randomBytes(32).toString("hex")');
    expect(pilotSource).toContain('const expertReviewSigningKeyId = `sena-pilot-smoke-${randomBytes(8).toString("hex")}`');
    expect(pilotSource).toContain("SENA_EXPERT_REVIEW_SIGNING_SECRET: expertReviewSigningSecret");
    expect(pilotSource).toContain("SENA_EXPERT_REVIEW_SIGNING_KEY_ID: expertReviewSigningKeyId");
    expect(pilotSource).toContain("expectedReceiptKeyId: expertReviewSigningKeyId");
    expect(pilotSource).toContain("redactVerifierValues");
    expect(pilotSource).not.toContain("console.error(output)");
    expect(pilotSource).not.toContain('SENA_EXPERT_REVIEW_SIGNING_SECRET: "');
    expect(pilotSource).not.toContain("console.log(expertReviewSigningSecret");
    expect(pilotSource).not.toContain("console.log(expertReviewSigningKeyId");
  });

  it("fails standalone enterprise smoke before browser work without an exact ephemeral receipt key id", () => {
    const verifierPath = fileURLToPath(
      new URL("../../../scripts/verify-sena-enterprise-api-browser-smoke.mjs", import.meta.url)
    );
    for (const expectedReceiptKeyId of ["", "production-signing-key"]) {
      const result = spawnSync(process.execPath, [verifierPath], {
        cwd: fileURLToPath(new URL("../../..", import.meta.url)),
        encoding: "utf8",
        timeout: 5_000,
        env: {
          ...process.env,
          SENA_ENTERPRISE_API_BROWSER_SMOKE_EXPECTED_RECEIPT_KEY_ID: expectedReceiptKeyId
        }
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "requires the exact verifier-only ephemeral receipt key id before any browser or server mutation"
      );
      expect(result.stderr).not.toContain("ECONNREFUSED");
    }
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
      "sena-coding-reliability-dashboard/v2",
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
      "sena-group-comparison-suite/v2",
      "sena-validation-run-review/v1",
      "sena-expert-review-response/v1",
      "sena-enterprise-claim-evidence-package/v2"
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
