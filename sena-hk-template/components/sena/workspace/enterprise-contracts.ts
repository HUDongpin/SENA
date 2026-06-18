import { SENA_WORKSPACE_API_ROUTES } from "./api-client";
import type {
  SenaGroupComparisonMetric,
  SenaGroupComparisonValidationResult
} from "@/lib/sena";
import type { SenaReliabilityDashboard } from "@/lib/sena/reliability";

export type EnterpriseContext = {
  user: { id: string; email: string; name: string; organization: string } | null;
  teams: Array<{ id: string; name: string; plan: string; organization: string }>;
  memberships: Array<{ id: string; teamId: string; userId: string; role: string; status: string }>;
};
export type EnterpriseRole = "owner" | "pi" | "admin" | "coder" | "reviewer" | "viewer";
export type EnterpriseCsrfToken = {
  headerName: string;
  token: string;
  sessionId: string;
  expiresAt: string;
};
export type EnterpriseTeamState = {
  teams: Array<{ id: string; name: string; plan: string; organization: string }>;
  memberships: Array<{ id: string; teamId: string; userId: string; role: EnterpriseRole; status: "active" | "suspended"; updatedAt: string }>;
  users: Array<{ id: string; email: string; name: string; organization: string }>;
  invitations: Array<{ id: string; teamId: string; email: string; role: EnterpriseRole; inviteCode: string; status: "pending" | "accepted" | "revoked"; createdAt: string; acceptedAt?: string }>;
  notifications: Array<{ id: string; kind: string; status: string; title: string; createdAt: string }>;
  auditLog: Array<{ id: string; event: string; createdAt: string }>;
};
export type EnterpriseUploadRecord = {
  id: string;
  teamId: string;
  originalName: string;
  contentType: string;
  size: number;
  sha256: string;
  importProfile?: string;
  warningCount: number;
  scanStatus: "passed" | "review" | "blocked";
  scanEngine: string;
  scanFindings: string[];
  storagePath: string;
  createdAt: string;
};
export type EnterpriseUploadStorageVerification = {
  schemaVersion: "sena-enterprise-upload-storage-verification/v1";
  status: "pass" | "review";
  generatedAt: string;
  summary: {
    registeredUploads: number;
    verifiedBlobs: number;
    missingBlobs: number;
    checksumMismatches: number;
    orphanBlobs: number;
    reviewedUploads: number;
    totalRegisteredBytes: number;
    totalVerifiedBytes: number;
  };
};
export type EnterpriseUploadStorageState = {
  schemaVersion: "sena-upload-list/v1";
  uploads: EnterpriseUploadRecord[];
  storageVerification?: EnterpriseUploadStorageVerification;
};
export type EnterpriseMfaStatus = {
  schemaVersion: "sena-enterprise-mfa-status/v1";
  enabled: boolean;
  method: "totp" | null;
  factorId?: string;
  verifiedAt?: string;
  lastUsedAt?: string;
};
export type EnterpriseMfaSetup = {
  schemaVersion: "sena-enterprise-mfa-setup/v1";
  method: "totp";
  setupToken: string;
  secret: string;
  otpauthUrl: string;
  expiresAt: string;
};
export type EnterpriseSessionSummary = {
  id: string;
  current: boolean;
  createdAt: string;
  expiresAt: string;
  expiresInSeconds: number;
  sessionProfile?: "standard" | "remembered";
  ttlDays?: number;
};
export type EnterpriseSessionList = {
  schemaVersion: "sena-enterprise-session-list/v1";
  generatedAt: string;
  currentSessionId: string;
  sessionDays: number;
  sessionPolicy?: {
    standardDays: number;
    rememberedDays: number;
  };
  sessions: EnterpriseSessionSummary[];
};
export type EnterpriseSsoProvider = "institution" | "google" | "orcid";
export type EnterpriseSsoProviderPreflight = {
  provider: EnterpriseSsoProvider;
  status: "pass" | "review";
  mode: string;
  configured: boolean;
  generatedAt: string;
  endpointHashes: Record<string, string | undefined>;
  checks: Array<{ id: string; label: string; status: "pass" | "review"; evidence: string[]; nextAction: string }>;
  errorCode?: string;
  errorHash?: string;
};
export type EnterpriseSsoPreflight = {
  schemaVersion: "sena-enterprise-sso-preflight/v1";
  generatedAt: string;
  baseUrl: string;
  summary: {
    checked: number;
    passed: number;
    review: number;
    configuredProviders: number;
  };
  providers: EnterpriseSsoProviderPreflight[];
};
export type EnterpriseSsoProviderStatusResponse = {
  schemaVersion: "sena-sso-provider-status/v1";
  preflight?: EnterpriseSsoPreflight;
};
export type EnterpriseDeploymentEnv = {
  name: string;
  category: string;
  required: boolean;
  configured: boolean;
  secret: boolean;
  status: "pass" | "review";
  purpose: string;
  endpointHash?: string;
  valueHash?: string;
  defaultedTo?: string;
};
export type EnterpriseDeploymentServiceEndpoint = {
  id: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  auth: string;
  schema?: string;
  purpose: string;
};
export type EnterpriseDeploymentPlatformDecision = {
  id: string;
  label: string;
  status: "ready" | "bridge-ready" | "open";
  evidence: string[];
  nextAction: string;
};
export type EnterpriseIdentityProductionEvidence = {
  schemaVersion: "sena-enterprise-identity-production-evidence/v1";
  generatedAt: string;
  status: "ready" | "review";
  capabilityStatus: "ready" | "review" | "blocked";
  missingEvidenceIds: string[];
  submissionVerifier: {
    schemaVersion: "sena-enterprise-identity-submission-verifier/v1";
    verifiedDecisions: number;
    incompleteDecisions: number;
    missingProductionEvidence: number;
    missingTechnicalPrerequisites: number;
  };
  platformRequestPacket: {
    schemaVersion: "sena-enterprise-identity-platform-decision-request-packet/v1";
    blockingRequests: number;
    missingProductionEvidence: number;
    missingTechnicalPrerequisites: number;
    receiptReviewRequests: number;
    evidence: string[];
  };
  rotationFreshness: {
    schemaVersion: "sena-enterprise-identity-rotation-freshness/v1";
    status: "ready" | "review";
    expiredEvidenceIds: string[];
    dueSoonEvidenceIds: string[];
  };
  cutoverChecklist: {
    schemaVersion: "sena-enterprise-identity-cutover-checklist/v1";
    status: "ready" | "review";
    summary: {
      items: number;
      readyItems: number;
      blockingItems: number;
    };
  };
  releaseGateBlocked: boolean;
};
export type EnterpriseIdentityPlatformDecisionRequestPacket = {
  schemaVersion: "sena-enterprise-identity-platform-decision-request-packet/v1";
  summary: {
    requests: number;
    blockingRequests: number;
    missingProductionEvidence: number;
    missingTechnicalPrerequisites: number;
    readyRequests: number;
    receiptReviewRequests: number;
  };
  evidence: string[];
  submission: {
    method: "POST";
    path: typeof SENA_WORKSPACE_API_ROUTES.enterprise.platformDecisions;
    responseSchema: "sena-enterprise-platform-decision-production-evidence-receipt/v1";
    requiredBodyFields: Array<
      "teamId" |
      "decisionId" |
      "status" |
      "acceptedBridge" |
      "ownerName" |
      "ownerRole" |
      "environment" |
      "evidenceUrl" |
      "productionEvidenceIds" |
      "productionEvidenceVerifiedAt" |
      "requestPacketPolicyHash" |
      "notes"
    >;
    identityProductionEvidenceBodyFields: Array<
      "evidenceUrl" |
      "productionEvidenceIds" |
      "productionEvidenceVerifiedAt" |
      "requestPacketPolicyHash"
    >;
    evidenceUrlPolicy: {
      requiredProtocol: "https";
      evidenceUrlRequiredForEvidenceIds: string[];
      embeddedCredentialsRejected: boolean;
      fragmentsRejected: boolean;
      sensitiveQueryParametersRejected: boolean;
      rejectedSensitiveQueryParameters: string[];
      allowedHostConfigStatus?: "configured" | "invalid";
      allowedHostCount?: number;
      invalidAllowedHostCount?: number;
      senaAppOriginConfigured: boolean;
    };
    ownerRolePolicy: {
      forbiddenTokens: string[];
      institutionOwnerTokens: string[];
      requiredSemanticTokensByDecision: Record<"institution-idp-approval" | "institution-provisioning-owner", string[]>;
    };
    notesPolicy: {
      secretValuesRejected: boolean;
      bearerTokensRejected: boolean;
      rejectedSensitiveAssignmentNames: string[];
    };
    freeTextPolicy: {
      secretValuesRejected: boolean;
      bearerTokensRejected: boolean;
      fields: Array<"ownerName" | "ownerRole" | "environment" | "notes">;
      rejectedSensitiveAssignmentNames: string[];
    };
  };
  requests: Array<{
    decisionId: "institution-idp-approval" | "institution-provisioning-owner";
    label: string;
    blocking: boolean;
    requestedProductionEvidenceIds: string[];
    missingProductionEvidenceIds: string[];
    missingTechnicalPrerequisiteEvidenceIds: string[];
    latestReceiptVerifierStatus?: "ready" | "review";
    latestReceiptEvidenceUrlHostBindingStatus?: "current" | "stale" | "not-required";
    latestReceiptRequestPacketPolicyBindingStatus?: "current" | "stale" | "not-required";
    latestReceiptRotationFreshnessStatus?: "ready" | "review";
    latestReceiptRotationExpiredEvidenceIds?: string[];
    latestReceiptRotationDueSoonEvidenceIds?: string[];
    submissionTemplate: {
      ownerNamePlaceholder: string;
      ownerNamePolicy: {
        specificInstitutionOwnerRequired: boolean;
        genericPlaceholderRejected: boolean;
        rejectedPlaceholderNames: string[];
      };
      ownerRolePlaceholder: string;
      environmentPlaceholder: string;
      evidenceUrlPlaceholder: string;
      productionEvidenceIds: string[];
      productionEvidenceVerifiedAtField: "productionEvidenceVerifiedAt";
      productionEvidenceVerifiedAtPolicy: {
        required: boolean;
        requiredForEvidenceIds: string[];
        validPastOrPresentRequired: boolean;
        futureTimestampsRejected: boolean;
        canonicalIsoTimestampRequired: boolean;
      };
      rotationFreshnessPolicy: {
        maxAgeDays: number;
        warningDays: number;
        rotationEvidenceIds: string[];
        expiredEvidenceBlocksRelease: boolean;
        dueSoonEvidenceWarns: boolean;
      };
      notesTemplate: string;
     };
     nextActions: string[];
     acceptanceCriteria: string[];
  }>;
 };
export type EnterpriseIdentityInstitutionActionPlan = {
  schemaVersion: "sena-enterprise-identity-institution-action-plan/v1";
  status: "ready" | "review";
  digest?: string;
  redaction: {
    secretValuesExcluded: boolean;
    evidenceUrlValuesExcluded: boolean;
    ownerNamesExcluded: boolean;
    submissionDraftEvidenceUrlFieldOnly: boolean;
  };
  summary: {
    lanes: number;
    blockingLanes: number;
    readyLanes: number;
    missingProductionEvidence: number;
    missingTechnicalPrerequisites: number;
    rotationReviewLanes: number;
    cutoverBlockingItems: number;
    submissionPath: typeof SENA_WORKSPACE_API_ROUTES.enterprise.platformDecisions;
  };
  lanes: Array<{
    id: "institution-idp-owner" | "institution-provisioning-owner";
    ownerRole: "Institution IdP owner" | "Institution provisioning owner";
    status: "ready" | "review";
    blocking: boolean;
    decisionIds: Array<"institution-idp-approval" | "institution-provisioning-owner">;
    cutoverItemIds: Array<"idp-tenant-approval" | "sso-secret-custody" | "scim-idp-ownership" | "identity-secret-rotation">;
    missingProductionEvidenceIds: string[];
    missingTechnicalPrerequisiteEvidenceIds: string[];
    rotationEvidenceIds: string[];
    receiptArchiveStatuses: Array<"ready-for-archive" | "review" | "missing-receipt">;
    artifactCompletenessStatuses: Array<"complete" | "partial" | "missing">;
    submissionDrafts: Array<{
      decisionId: "institution-idp-approval" | "institution-provisioning-owner";
      submissionDraft: {
        productionEvidenceIds: string[];
        requestPacketPolicyHash: string;
        productionEvidenceArtifactDigest: string;
        evidenceUrlField: "evidenceUrl";
      };
    }>;
    responseAuditHeaders: string[];
    receiptArchiveBodyPaths: string[];
    nextActions: string[];
  }>;
  nextActions: string[];
};
export type EnterpriseIdentityProductionEvidenceDossier = {
  schemaVersion: "sena-enterprise-identity-production-evidence/v1";
  status: "ready" | "review";
  evidenceManifest: {
    missingEvidenceIds: string[];
  };
  platformRequestPacket: EnterpriseIdentityPlatformDecisionRequestPacket;
  submissionVerifier: {
    summary: {
      incompleteDecisions: number;
      missingProductionEvidence: number;
      missingTechnicalPrerequisites: number;
    };
    evidence: string[];
  };
  cutoverChecklist: {
    schemaVersion: "sena-enterprise-identity-cutover-checklist/v1";
    status: "ready" | "review";
    summary: {
      items: number;
      readyItems: number;
      blockingItems: number;
    };
    items: Array<{
      id: "idp-tenant-approval" | "sso-secret-custody" | "scim-idp-ownership" | "identity-secret-rotation";
      label: string;
      status: "ready" | "review";
      evidenceIds: string[];
      missingEvidenceIds: string[];
    }>;
  };
  institutionActionPlan: EnterpriseIdentityInstitutionActionPlan;
};
export type EnterpriseOrganizationDeploymentPackage = {
  schemaVersion: "sena-enterprise-organization-deployment/v1";
  generatedAt: string;
  status: "ready" | "review" | "blocked";
  summary: {
    openPlatformDecisions: number;
    acceptedPlatformDecisions: number;
    identityProductionStatus: EnterpriseIdentityProductionEvidence["status"];
    identitySubmissionVerifierIncomplete: number;
    identityRotationFreshness: EnterpriseIdentityProductionEvidence["rotationFreshness"]["status"];
    blockingReview: number;
    advisoryReview: number;
  };
  governance: {
    keyChecks: Array<{ id: string; status: "pass" | "review"; evidence: string[]; nextAction: string }>;
  };
  env: EnterpriseDeploymentEnv[];
  serviceEndpoints: EnterpriseDeploymentServiceEndpoint[];
  platformDecisions: EnterpriseDeploymentPlatformDecision[];
  platformDecisionRegister: {
    schemaVersion: "sena-enterprise-platform-decision-register/v1";
    summary: {
      open: number;
      productionBlocking: number;
      acceptedBridge: number;
    };
  };
  releaseGate: {
    schemaVersion: "sena-enterprise-release-gate-reviews/v1";
    summary: {
      total: number;
      approved: number;
      conditional: number;
      blocked: number;
      latestStatus?: EnterpriseReleaseGateDecision;
    };
    latestReview?: EnterpriseReleaseGateReview;
    evidence: string[];
  };
  identityProductionEvidence: EnterpriseIdentityProductionEvidence;
  identityProductionHandoff: EnterpriseIdentityProductionEvidenceDossier;
};
export type EnterpriseProjectSummary = {
  id: string;
  teamId: string;
  currentVersion?: number;
  title: string;
  description: string;
  datasetCounts: { people: number; utterances: number; codedSegments: number; codes: number };
  activeWindowLabel: string;
  claimUse: string;
  updatedAt: string;
};
export type EnterpriseImportRun = {
  id: string;
  status: "completed" | "completed-with-warnings";
  fileCount: number;
  sources: Array<{ name: string; profile: string; rows: number; warningCount: number }>;
  warningCount: number;
  datasetCounts: { people: number; interactions: number; utterances: number; codedSegments: number; codes: number };
  cleaningManifest?: {
    schemaVersion: "sena-import-cleaning-manifest/v1";
    summary: {
      adapterProfiles: string[];
      totalSourceRows: number;
      derivedPlaceholderCount: number;
      skippedRowCount: number;
      duplicateRowCount: number;
      missingTableWarningCount: number;
    };
    checks: Array<{ id: string; status: "pass" | "review"; label: string }>;
    recommendedNextActions: string[];
  };
  createdAt: string;
};
export type EnterpriseAnalysisRun = {
  id: string;
  sourceKind: string;
  title: string;
  includeRuntimeBundle: boolean;
  summary: {
    people: number;
    concepts: number;
    claimUse: string;
    completenessStatus: string;
  };
  artifactFingerprints: {
    reportSha256: string;
    projectSnapshotSha256: string;
    runtimeBundleSha256?: string;
  };
  createdAt: string;
};
export type EnterpriseValidationParityEvidence = {
  schemaVersion: "sena-validation-parity-evidence/v1";
  status: "ready-for-review" | "incomplete";
  validationRunHash: string;
  analysis: "single-comparison" | "holm-suite";
  runtimeParity: Array<{
    id: string;
    referenceRuntime: string;
    fixturePath: string;
    status: "covered" | "development-only" | "deferred";
    coverage: string[];
    sampleHash: string;
    interpretation: string;
  }>;
  walkthrough: {
    datasetLabel: string;
    datasetHash?: string;
    source: "input" | "analysis-run" | "project-snapshot" | "missing";
    sourceId?: string;
    status: "attached" | "missing";
  };
  inference: {
    resultSchemaVersion: string;
    guardrail: string;
    comparisonCount: number;
    permutationIterations: number;
    bootstrapIterations: number;
    alpha?: number;
    correction?: "holm";
    studySpecificInferenceReference?: string;
  };
  formalInference?: {
    schemaVersion: "sena-formal-inference-readiness/v1";
    status: "model-referenced" | "model-required" | "incomplete";
    resultSchemaVersion: string;
    comparisonCount: number;
    minGroupSize: number;
    smallSampleComparisons: number;
    studySpecificInferenceReference?: string;
    blockers: string[];
    warnings: string[];
  };
  gates: Array<{
    id: string;
    label: string;
    status: "passed" | "missing" | "required" | "attached";
    evidence: string[];
  }>;
  notes: string[];
};
export type LocalValidationPreregistrationPlan = {
  schemaVersion: "sena-validation-preregistration-plan/v1";
  planHash: string;
  hashAlgorithm: "sha256";
  analysis: "single-comparison" | "holm-suite";
  primary: {
    metric: SenaGroupComparisonMetric;
    groupField: "group" | "role";
    groupA: string;
    groupB: string;
  };
  comparisons: Array<{
    metric: SenaGroupComparisonMetric;
    groupField: "group" | "role";
    groupA: string;
    groupB: string;
  }>;
  parameters: {
    permutationIterations: number;
    bootstrapIterations: number;
    seed: number;
    alpha?: number;
    correction?: "holm";
  };
  protocolNoteHash?: string;
  methodNoteHash?: string;
  guardrail: string;
  evidence: string[];
};
export type EnterpriseCollaborationState = {
  project: { id: string; title: string; currentVersion: number; updatedAt: string };
  revisions: Array<{ id: string; version: number; summary: string; createdAt: string; user?: { name: string } | null }>;
  comments: Array<{ id: string; body: string; status: "open" | "resolved"; target: { kind: string; label?: string }; user?: { name: string } | null }>;
  presence: Array<{ id: string; activeView: string; cursorLabel: string; user?: { name: string } | null }>;
  adjudications: Array<{ id: string; itemId: string; codeId: string; decision: string; notes: string; reviewer?: { name: string } | null }>;
  reliabilityRuns: Array<{
    id: string;
    status: "pending-review" | "pending-adjudication" | "approved" | "rejected";
    reviewer: string;
    coderCount: number;
    itemCount: number;
    meanPairwiseKappa: number;
    krippendorffAlphaNominal: number;
    disagreementCount: number;
    adjudicationCoverage?: {
      schemaVersion: "sena-reliability-adjudication-coverage/v1";
      queuedDisagreements: number;
      resolvedDisagreements: number;
      unresolvedDisagreements: number;
      coverageRate: number;
      decisions: { include: number; exclude: number; revise: number };
      updatedAt: string;
    };
    dashboard?: Partial<SenaReliabilityDashboard> & {
      codeDiagnostics?: Array<{
        codeId: string;
        unitCount: number;
        disagreementCount: number;
        agreementRate: number;
        coderPositiveRates: Record<string, number>;
      }>;
    };
    reviewNotes?: string;
    reviewedAt?: string;
    createdAt: string;
  }>;
  validationRuns: Array<{
    id: string;
    status: "pending-review" | "approved" | "rejected";
    metric: SenaGroupComparisonMetric;
    groupField: "group" | "role";
    groupA: string;
    groupB: string;
    pTwoSided: number;
    observedDifference: number;
    preregistrationNote: string;
    methodNote: string;
    result?: SenaGroupComparisonValidationResult;
    preregistrationPlan?: LocalValidationPreregistrationPlan;
    parityEvidence?: EnterpriseValidationParityEvidence;
    reviewNotes?: string;
    reviewedAt?: string;
    createdAt: string;
  }>;
  expertReviews: Array<{
    id: string;
    status: "requested" | "approved" | "changes-requested" | "rejected";
    reviewerName: string;
    reviewerRole: string;
    expertiseArea: string;
    claimScope: "exploratory-only" | "claim-ready-with-limits" | "not-claim-ready";
    ratings: { dataAdequacy: number; methodFit: number; interpretationValidity: number };
    target: { kind: "project" | "validation-run" | "reliability-run" | "claim"; id?: string; label?: string };
    concerns: string;
    recommendations: string;
    limitations: string;
    reviewedAt?: string;
    createdAt: string;
  }>;
};
export type LocalEnterpriseValidationResult = {
  schemaVersion: "sena-local-validation-run/v1";
  generatedAt: string;
  result: SenaGroupComparisonValidationResult;
  preregistrationNote: string;
  methodNote: string;
  studySpecificInferenceReference: string;
  preregistrationPlan?: LocalValidationPreregistrationPlan;
};
export type EnterpriseClaimEvidencePackage = {
  schemaVersion: "sena-enterprise-claim-evidence-package/v1";
  generatedAt: string;
  status: "claim-ready-with-limits" | "exploratory-only" | "not-claim-ready";
  sourceSnapshotEvidence: {
    schemaVersion: "sena-enterprise-claim-source-snapshot/v1";
    projectVersion: number;
    revisionId?: string;
    revisionMatchesCurrentVersion: boolean;
    snapshotSha256: string;
    reportSha256: string;
    datasetCounts: { people: number; interactions: number; utterances: number; codedSegments: number; codes: number };
    matrixFingerprints: Array<{ id: string; checksum: string; sha256: string }>;
  };
  summary: {
    reliability: "approved" | "missing" | "pending-or-rejected";
    validation: "approved" | "missing" | "pending-or-rejected";
    expertReview: "approved" | "missing" | "pending-or-rejected";
    blockers: number;
    warnings: number;
  };
  blockers: string[];
  warnings: string[];
  evidence: {
    reliability?: { runId: string; meanPairwiseKappa: number; krippendorffAlphaNominal: number; adjudications: number };
    validation?: { runId: string; analysis: string; comparisonCount: number; preregistrationPlanHash?: string; parityEvidence?: EnterpriseValidationParityEvidence; suiteCorrection?: "holm" };
    expertReview?: { reviewId: string; claimScope: "exploratory-only" | "claim-ready-with-limits" | "not-claim-ready"; reviewerName: string };
  };
  artifacts: Array<{ id: string; schemaVersion: string; sourceId: string; status: string }>;
  guardrails: string[];
};
export type EnterprisePlatformDecisionId =
  | "native-managed-database"
  | "native-managed-object-storage"
  | "native-collaboration-pubsub"
  | "institution-idp-approval"
  | "institution-provisioning-owner"
  | "deployment-alerting-escalation"
  | "native-audit-siem-adapter"
  | "institution-email-provider"
  | "native-managed-backup-storage"
  | "full-saas-backend-operations";
export type EnterprisePlatformDecisionStatus = "accepted" | "rejected" | "needs-native-adapter" | "superseded";
export type EnterprisePlatformDecisionAcceptance = {
  schemaVersion: "sena-enterprise-platform-decision-acceptance/v1";
  id: string;
  teamId: string;
  decisionId: EnterprisePlatformDecisionId;
  status: EnterprisePlatformDecisionStatus;
  acceptedBridge: boolean;
  ownerName: string;
  ownerRole: string;
  environment: string;
  evidenceUrl?: string;
  evidenceUrlHash?: string;
  productionEvidenceIds?: string[];
  productionEvidenceVerifiedAt?: string;
  productionEvidenceReceipt?: {
    schemaVersion: "sena-enterprise-platform-decision-production-evidence-receipt/v1";
    allowedEvidenceIds: string[];
    submittedEvidenceIds: string[];
    acceptedEvidenceIds: string[];
    missingEvidenceIds: string[];
    rotationFreshnessStatus?: "ready" | "review";
    rotationFreshnessChecks?: Array<{
      id: "sso-secret-rotation" | "bearer-token-rotation";
      status: "ready" | "due-soon" | "expired" | "missing";
      verifiedAt?: string;
      expiresAt?: string;
    }>;
    rotationExpiredEvidenceIds?: string[];
    rotationDueSoonEvidenceIds?: string[];
    evidenceUrlHash?: string;
  };
  notes: string;
  updatedAt: string;
};
export type EnterprisePlatformDecisionRegister = {
  schemaVersion: "sena-enterprise-platform-decision-register/v1";
  summary: {
    decisions: number;
    ready: number;
    bridgeReady: number;
    open: number;
    productionBlocking: number;
    acceptedBridge: number;
    acceptedBridgeMissingEvidence: number;
  };
  decisions: Array<{
    id: EnterprisePlatformDecisionId;
    label: string;
    status: "ready" | "bridge-ready" | "open";
    productionBlocking: boolean;
    acceptedBridge: boolean;
    ownerEvidence: string[];
    evidenceChecklist: Array<{
      id: string;
      label: string;
      status: "accepted" | "present" | "missing";
      productionRequired: boolean;
      source: "platform-acceptance" | "technical-readiness";
      evidence: string[];
      nextAction: string;
    }>;
    nextAction: string;
  }>;
  nextActions: string[];
};
export type EnterprisePlatformDecisionState = {
  schemaVersion: "sena-enterprise-platform-decision-acceptances/v1";
  summary: {
    total: number;
    accepted: number;
    rejected: number;
    needsNativeAdapter: number;
    superseded: number;
    acceptedBridge: number;
    acceptedBridgeMissingEvidence: number;
  };
  acceptances: EnterprisePlatformDecisionAcceptance[];
  platformDecisionRegister?: EnterprisePlatformDecisionRegister;
};
export type EnterpriseReleaseGateDecision = "approved" | "blocked" | "conditional";
export type EnterpriseReleaseVerificationStatus = "passed" | "failed" | "not-run";
export type EnterpriseReleaseGateDraft = {
  schemaVersion: "sena-enterprise-release-gate-draft/v1";
  decision: EnterpriseReleaseGateDecision;
  environment: string;
  releaseVersion: string;
  verificationCommand: string;
  verificationEvidence: {
    schemaVersion: "sena-enterprise-release-verification-evidence/v1";
    command: string;
    status: EnterpriseReleaseVerificationStatus;
    summary: string;
  };
  notes: string;
  requiredBeforeSubmit: string[];
  evidence: string[];
};
export type EnterpriseGoLiveRehearsal = {
  schemaVersion: "sena-enterprise-go-live-rehearsal/v1";
  status: "ready" | "review" | "blocked";
  identityProductionHandoff: EnterpriseIdentityProductionEvidenceDossier;
  releaseGateDraft: EnterpriseReleaseGateDraft;
  rollbackDrill?: {
    schemaVersion: "sena-enterprise-go-live-rollback-drill/v1";
    status: "ready" | "review" | "blocked";
  };
  postCutoverMonitor?: {
    schemaVersion: "sena-enterprise-go-live-monitor/v1";
    status: "ready" | "watch" | "blocked";
  };
};
export type EnterpriseGoLiveAttestation = {
  schemaVersion: "sena-enterprise-go-live-attestation/v1";
  id: string;
  decision: EnterpriseReleaseGateDecision;
  status: EnterpriseReleaseGateDecision;
  releaseVersion: string;
  identityProductionHandoffSnapshot?: EnterpriseIdentityProductionEvidenceDossier;
  latestReleaseGateSnapshot?: {
    schemaVersion: "sena-enterprise-release-gate-review/v1";
    id: string;
    decision: EnterpriseReleaseGateDecision;
    verificationStatus: EnterpriseReleaseVerificationStatus;
    identityProductionStatus?: EnterpriseIdentityProductionEvidence["status"];
    identityReleaseGateBlocked?: boolean;
    identitySubmissionVerifierIncomplete?: number;
    identitySubmissionVerifierMissing?: number;
    identitySubmissionVerifierMissingTechnical?: number;
    identityRotationFreshness?: EnterpriseIdentityProductionEvidence["rotationFreshness"]["status"];
    identityCutoverChecklistStatus?: EnterpriseIdentityProductionEvidence["cutoverChecklist"]["status"];
    identityCutoverChecklistBlockingItems?: number;
  };
};
export type EnterpriseReleaseGateReview = {
  schemaVersion: "sena-enterprise-release-gate-review/v1";
  id: string;
  teamId: string;
  environment: string;
  releaseVersion: string;
  decision: EnterpriseReleaseGateDecision;
  status: EnterpriseReleaseGateDecision;
  approverName: string;
  approverRole: string;
  notes: string;
  verificationCommand: string;
  verificationEvidence?: {
    schemaVersion: "sena-enterprise-release-verification-evidence/v1";
    command: string;
    status: EnterpriseReleaseVerificationStatus;
    summary: string;
    outputSha256: string;
    hashAlgorithm: "sha256";
    recordedAt: string;
  };
  readinessSnapshot: {
    schemaVersion: "sena-enterprise-deployment-readiness/v1";
    status: "ready" | "review" | "blocked";
    blockingReview: number;
    advisoryReview: number;
    blockers: string[];
  };
  platformDecisionSnapshot: {
    schemaVersion: "sena-enterprise-platform-decision-register/v1";
    productionBlocking: number;
    open: number;
    acceptedBridge: number;
  };
  identityProductionSnapshot?: EnterpriseIdentityProductionEvidence;
  updatedAt: string;
};
export type EnterpriseReleaseGateState = {
  schemaVersion: "sena-enterprise-release-gate-reviews/v1";
  summary: {
    total: number;
    approved: number;
    conditional: number;
    blocked: number;
    latestStatus?: EnterpriseReleaseGateDecision;
  };
  reviews: EnterpriseReleaseGateReview[];
};
