import { SENA_AUTH_PAGE_MANIFEST } from "./auth-page-manifest";
import { SENA_SCHEMA_VERSIONS } from "./schema-registry";

export const SENA_BROWSER_SMOKE_MANIFEST = {
  workspace: {
    route: "/workspace/sena",
    responsiveWidths: [375, 768, 1024, 1440],
    selectors: {
      // The default Fusion figure since ADR 0009. `fusionCanvas` stays declared
      // because the A1 Canvas is still shipped behind the Diagnostic layouts
      // (model-layout-explanatory / model-layout-joint) and the Functional
      // Ledger pins its testid — but it is no longer what a fresh page shows,
      // so a smoke that waits on it without switching layout first is waiting
      // for an element that is not there.
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
  },
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
        env: [
          "SENA_PROVISIONING_TOKEN",
          "SENA_EXPERT_REVIEW_SIGNING_SECRET",
          "SENA_EXPERT_REVIEW_SIGNING_KEY_ID",
          "SENA_ENTERPRISE_API_BROWSER_SMOKE_EXPECTED_RECEIPT_KEY_ID"
        ],
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
      },
      enaWorkbench: {
        exportName: "verifySenaEnaBrowserSmoke",
        label: "Verify jENA workbench browser smoke"
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
      "/api/sena/analyze",
      "/api/sena/projects/${projectId}",
      "/api/sena/reliability",
      "/api/sena/validation/group-comparison",
      "/api/sena/validation/expert-review",
      "/api/sena/validation/claim-package",
      "/api/sena/exports/publication"
    ],
    scimExtensionSchema: "urn:sena:params:scim:schemas:extension:identity-production:2.0:ServiceProviderConfig",
    schemaVersions: [
      SENA_SCHEMA_VERSIONS.scimServiceProviderConfig,
      SENA_SCHEMA_VERSIONS.scimIdentityProductionGate,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityProductionEvidence,
      SENA_SCHEMA_VERSIONS.enterpriseIdentitySubmissionMatrix,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityOwnerRunbook,
      SENA_SCHEMA_VERSIONS.enterpriseIdentityCutoverChecklist,
      SENA_SCHEMA_VERSIONS.enterpriseCsrfToken,
      SENA_SCHEMA_VERSIONS.enterpriseImport,
      SENA_SCHEMA_VERSIONS.projectSnapshot,
      SENA_SCHEMA_VERSIONS.project,
      SENA_SCHEMA_VERSIONS.analysisRun,
      SENA_SCHEMA_VERSIONS.reliabilityResponse,
      SENA_SCHEMA_VERSIONS.codingReliabilityDashboard,
      SENA_SCHEMA_VERSIONS.reliabilityRunReview,
      SENA_SCHEMA_VERSIONS.groupComparisonSuite,
      SENA_SCHEMA_VERSIONS.validationRunReview,
      SENA_SCHEMA_VERSIONS.enterpriseValidationRunEvidence,
      SENA_SCHEMA_VERSIONS.expertReviewResponse,
      SENA_SCHEMA_VERSIONS.enterpriseExpertReviewReceipt,
      SENA_SCHEMA_VERSIONS.enterpriseClaimEvidencePackage,
      SENA_SCHEMA_VERSIONS.publicationStateBinding,
      SENA_SCHEMA_VERSIONS.publicationDerivationManifest,
      SENA_SCHEMA_VERSIONS.publicationPackage
    ],
    headers: [
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
    ],
    expectedRoleEvidence: "Expected owner registration role",
    requestBindings: [
      "{ requiredFormats: requiredPublicationFormats, teamId, provisioningToken }",
      "provisioningToken: bearerToken",
      "Bearer ${bearerToken}",
      "expectedReceiptKeyId: expertReviewSigningKeyId"
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
      "cutoverChecklist.summary.blockingItems",
      "evidence.reliability",
      "evidence.validation",
      "evidence.expertReview",
      "expertReview.evidenceReceipt.keyId",
      "projectBeforePublication",
      "projectAfterPublication",
      "claimPackageAfterPublication",
      "stateBinding.stateRevisionSha256",
      "stateBinding.bindingSha256",
      "derivationManifest.hashBoundaries"
    ],
    cutoverItems: [
      "idp-tenant-approval",
      "sso-secret-custody",
      "scim-idp-ownership",
      "identity-secret-rotation"
    ],
    importProfiles: ["sena-contract", "cleaned-transcript"],
    expectedImportStatus: "completed",
    expectedImportWarnings: [],
    expectedImportedDatasetCounts: {
      people: 4,
      interactions: 3,
      utterances: 8,
      codedSegments: 8,
      codes: 4
    },
    expertReviewReceipt: {
      signingMode: "ephemeral-verifier-env",
      keyIdPrefix: "sena-pilot-smoke-"
    },
    claimStatuses: {
      persistedPrepublication: "exploratory-only",
      permittedPersistedBlockers: ["project-claim-readiness-required"],
      derivedPublication: "claim-ready-with-limits"
    },
    publicationBlockedCode: "publication_claim_evidence_not_ready",
    publicationPackageFormat: "package",
    publicationFormats: ["svg", "png", "html", "xlsx", "docx", "pdf"],
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
  },
  // The jENA workbench. Unlike every other surface here it is public, holds no
  // session and persists nothing: it parses the bundled lesson-study CSV at
  // module scope and computes in a bundled Worker, so the smoke needs no
  // adapter and no login. Declared separately from `workspace` because the
  // route, the renderer's props and the failure modes are all different — the
  // SENA workbench nests EnaPlot inside the Fusion plane, while this route
  // renders it bare, and asserting the SENA-only layers are ABSENT here is part
  // of the contract.
  enaWorkbench: {
    route: "/workspace/ena",
    defaultRailMode: "model",
    railModes: ["sets", "model", "plot", "stats"],
    statsTabs: ["comparison", "fit", "variance", "methods"],
    comparisonPalettes: ["blue-orange", "red-blue"],
    selectors: {
      workbench: "webena-workbench",
      setsOpenDataView: "ena-sets-open-data-view",
      dataViewToggle: "ena-data-view-toggle",
      plot: "ena-plot",
      comparison: "ena-comparison",
      comparisonColumn: "ena-comparison-column",
      comparisonGroupA: "ena-comparison-group-a",
      comparisonGroupB: "ena-comparison-group-b",
      comparisonPalette: "ena-comparison-palette",
      comparisonIntervals: "ena-comparison-intervals",
      comparisonSubtraction: "ena-comparison-subtraction",
      comparisonMultiplier: "ena-comparison-multiplier",
      minEdgeWeightSlider: "ena-min-edge-weight-slider",
      minEdgeWeightEffective: "ena-min-edge-weight-effective",
      statsTabs: "ena-stats-tabs",
      plotToolsReset: "ena-plot-tools-reset",
      copyMethods: "ena-copy-methods"
    },
    // Provenance attributes the smoke reads off the drawn marks. They are the
    // same vocabulary EnaPlot emits inside the Fusion plane, which is why this
    // leg needed no new instrumentation on the page.
    plotAttributes: [
      "data-plot-dimensions",
      "data-plot-zoom",
      "data-edge-weight",
      "data-edge-visual-width",
      "data-edge-sign",
      "data-sena-group-mean",
      "data-sena-group-n",
      "data-sena-group-ci",
      "data-sena-ci-x",
      "data-sena-ci-y"
    ],
    // Layers EnaPlot only draws for the SENA workspace. On this route they must
    // stay at zero — the negative is as much the contract as the positive.
    absentSenaLayers: ["overlay-edges", "node-hit-targets", "unit-identity", "selection-ring"],
    // The comparison defaults the P4c UI ships with. `subtractionOn: false` is
    // load-bearing: an ordinary plot must stay the mean network it has always
    // been, which is what keeps the rENA parity suites honest.
    comparisonDefaults: {
      subtractionOn: false,
      groupIntervalsOn: true,
      deltaMultiplier: 1,
      palette: "blue-orange"
    },
    flows: [
      "worker-runtime-run",
      "comparison-group-means-and-intervals",
      "comparison-subtraction-default-off",
      "signed-delta-multiplier",
      "signed-edge-threshold-discriminator"
    ],
    exports: [
      "sena-ena-result.json",
      "sena-ena-points.csv",
      "sena-ena-connections.csv"
    ]
  }
} as const;
